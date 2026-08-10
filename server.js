// ============================================================
// 교실 아케이드 — 게임 서버
// 역할: ① 웹페이지(public/index.html) 서빙  ② WebSocket으로 방·게임 관리
// 실행: node server.js  (기본 포트 3000, Render에서는 PORT 환경변수 사용)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------- 게임 상수 (밸런스 조절은 여기서) ----------
const TICK_MS = 50;          // 게임 계산 주기: 50ms = 초당 20번
const SPEED = 230;           // 플레이어 이동 속도 (유닛/초)
const PLAYER_R = 16;         // 플레이어 반지름
const BOMB_WARN_MS = 1000;   // 폭발 예고 시간 (빨간 원)
const BOMB_BOOM_MS = 350;    // 폭발 지속 시간
const ROUND_MS = 90000;      // 한 판 최대 90초
const COUNTDOWN_MS = 3500;   // 시작 카운트다운
const ROOM_IDLE_MS = 30 * 60 * 1000; // 30분 미사용 방 자동 삭제

const BAD_WORDS = ['시발', '씨발', '병신', '개새', '좆', '지랄', 'fuck', 'shit', '섹스'];

// ---------- 정적 파일 서빙 (index.html 등) ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/debug') { // 운영 확인용: 방·플레이어 현황 (닉네임·좌표만)
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify([...rooms.values()].map(r => ({
      code: r.code, state: r.state, players: [...r.players.values()].map(p =>
        ({ nick: p.nick, x: Math.round(p.x), y: Math.round(p.y), alive: p.alive, connected: p.connected })),
    }))));
    return;
  }
  if (url === '/') url = '/index.html';
  // 디렉터리 탈출 방지
  const safe = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(__dirname, 'public', safe);
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 방(Room) 관리 ----------
const rooms = new Map(); // code -> room

function makeCode() {
  for (let i = 0; i < 100; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return null;
}
function token() { return crypto.randomBytes(12).toString('hex'); }

function cleanNick(raw) {
  let nick = String(raw || '').trim().slice(0, 8);
  if (!nick) nick = '익명';
  for (const w of BAD_WORDS) if (nick.toLowerCase().includes(w)) return '착한어린이';
  return nick;
}

function createRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code,
    hostWs: null,
    hostToken: token(),
    players: new Map(), // id -> player
    state: 'lobby',     // lobby | countdown | playing | result
    nextId: 1,
    lastActive: Date.now(),
    game: null,         // 진행 중 게임 데이터
    timer: null,        // 게임 루프 setInterval
    phaseEndAt: 0,
  };
  rooms.set(code, room);
  return room;
}

function roomSend(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}
function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  if (room.hostWs && room.hostWs.readyState === 1) room.hostWs.send(msg);
  for (const p of room.players.values())
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
}

// 로비 명단(닉네임·색) 방송 — 입장/퇴장 때마다
function sendRoster(room) {
  broadcast(room, {
    type: 'roster',
    players: [...room.players.values()].map(p => ({
      id: p.id, nick: p.nick, ci: p.ci, connected: p.connected, waiting: p.waiting,
    })),
    state: room.state,
  });
}

// ---------- 폭탄 피하기 게임 로직 ----------
function startGame(room) {
  const actives = [...room.players.values()].filter(p => p.connected);
  if (actives.length < 1) return;
  const n = actives.length;
  const size = Math.round(Math.min(1100, 460 + n * 35)); // 인원수에 따라 맵 크기 조절
  room.game = {
    arenaW: size, arenaH: size,
    bombs: [], nextBombId: 1,
    spawnInterval: 1100, nextSpawnAt: 0,
    startedAt: 0, startingCount: n,
  };
  // 참가자를 원형으로 배치
  actives.forEach((p, i) => {
    const ang = (i / n) * Math.PI * 2;
    p.x = size / 2 + Math.cos(ang) * size * 0.33;
    p.y = size / 2 + Math.sin(ang) * size * 0.33;
    p.alive = true; p.waiting = false; p.deadAt = 0;
    p.dirX = 0; p.dirY = 0;
  });
  // 접속 끊긴 사람은 이번 판 제외
  for (const p of room.players.values()) if (!p.connected) { p.alive = false; p.waiting = true; }

  room.state = 'countdown';
  room.phaseEndAt = Date.now() + COUNTDOWN_MS;
  broadcast(room, { type: 'phase', state: 'countdown', endAt: room.phaseEndAt, st: Date.now() });
  sendRoster(room);

  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => tick(room), TICK_MS);
}

function tick(room) {
  const now = Date.now();
  const g = room.game;
  if (!g) return;

  // 카운트다운 → 플레이 전환
  if (room.state === 'countdown') {
    if (now >= room.phaseEndAt) {
      room.state = 'playing';
      g.startedAt = now;
      g.nextSpawnAt = now + 2500; // 첫 폭탄은 2.5초 뒤부터 (시작하자마자 끝나는 것 방지)
      room.phaseEndAt = now + ROUND_MS;
      broadcast(room, { type: 'phase', state: 'playing', endAt: room.phaseEndAt, st: now });
    }
    sendState(room, now);
    return;
  }
  if (room.state !== 'playing') return;

  const dt = TICK_MS / 1000;
  const W = g.arenaW, H = g.arenaH;

  // 1) 이동 (조이스틱 방향대로, 맵 밖으로 못 나감)
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    p.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, p.x + p.dirX * SPEED * dt));
    p.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, p.y + p.dirY * SPEED * dt));
  }

  // 2) 폭탄 생성 (시간이 갈수록 잦아지고 많아짐)
  const elapsed = now - g.startedAt;
  if (now >= g.nextSpawnAt) {
    const waves = 1 + Math.floor(elapsed / 15000) + Math.max(0, Math.round(g.startingCount / 8));
    const alivePs = [...room.players.values()].filter(p => p.alive);
    for (let i = 0; i < waves; i++) {
      // 초반 8초는 플레이어 머리 위에 바로 떨어지지 않게 위치를 다시 뽑는다
      let bx = 0, by = 0;
      for (let tryN = 0; tryN < 8; tryN++) {
        bx = PLAYER_R + Math.random() * (W - PLAYER_R * 2);
        by = PLAYER_R + Math.random() * (H - PLAYER_R * 2);
        if (elapsed > 8000) break;
        const tooClose = alivePs.some(p => Math.hypot(p.x - bx, p.y - by) < 150);
        if (!tooClose) break;
      }
      g.bombs.push({
        id: g.nextBombId++,
        x: bx, y: by,
        r: 55 + Math.random() * 45,
        explodeAt: now + BOMB_WARN_MS,
        endAt: now + BOMB_WARN_MS + BOMB_BOOM_MS,
      });
    }
    g.spawnInterval = Math.max(320, g.spawnInterval * 0.97);
    g.nextSpawnAt = now + g.spawnInterval;
  }

  // 3) 폭발 판정 (서버가 유일한 심판)
  for (const b of g.bombs) {
    if (now < b.explodeAt || now > b.endAt) continue;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy <= (b.r + PLAYER_R) * (b.r + PLAYER_R)) {
        p.alive = false;
        p.deadAt = now;
      }
    }
  }
  g.bombs = g.bombs.filter(b => now <= b.endAt);

  // 4) 종료 조건: 생존 1명 이하(2명 이상 시작 시) 또는 시간 종료
  const alive = [...room.players.values()].filter(p => p.alive);
  const timeUp = now >= room.phaseEndAt;
  const lastMan = g.startingCount >= 2 && alive.length <= 1;
  const allDead = alive.length === 0;
  if (timeUp || lastMan || allDead) { endGame(room, now); return; }

  sendState(room, now);
}

function sendState(room, now) {
  const g = room.game;
  broadcast(room, {
    type: 'state',
    st: now,
    arena: { w: g.arenaW, h: g.arenaH },
    timeLeft: room.state === 'playing' ? Math.max(0, room.phaseEndAt - now) : ROUND_MS,
    players: [...room.players.values()].map(p =>
      [p.id, Math.round(p.x), Math.round(p.y), p.alive ? 1 : 0, p.waiting ? 1 : 0]),
    bombs: g.bombs.map(b => {
      const boom = now >= b.explodeAt;
      const prog = boom
        ? (now - b.explodeAt) / BOMB_BOOM_MS
        : (now - (b.explodeAt - BOMB_WARN_MS)) / BOMB_WARN_MS;
      return [Math.round(b.x), Math.round(b.y), Math.round(b.r), boom ? 1 : 0, Math.round(prog * 100)];
    }),
  });
}

function endGame(room, now) {
  clearInterval(room.timer); room.timer = null;
  room.state = 'result';
  const g = room.game;
  const parts = [...room.players.values()].filter(p => !p.waiting || p.deadAt);
  // 순위: 생존자 공동 1위 → 늦게 죽은 순
  const sorted = parts.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return (b.deadAt || 0) - (a.deadAt || 0);
  });
  let rank = 0, prevKey = null;
  const ranking = sorted.map((p, i) => {
    const key = p.alive ? 'alive' : String(p.deadAt);
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    return {
      id: p.id, nick: p.nick, ci: p.ci, rank,
      alive: p.alive,
      survivedMs: (p.alive ? (now - g.startedAt) : (p.deadAt - g.startedAt)) || 0,
    };
  });
  broadcast(room, { type: 'result', ranking });
  sendRoster(room);
}

function backToLobby(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.state = 'lobby';
  room.game = null;
  for (const p of room.players.values()) { p.alive = false; p.waiting = false; }
  broadcast(room, { type: 'phase', state: 'lobby', st: Date.now() });
  sendRoster(room);
}

// ---------- WebSocket 연결 처리 ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.roomCode = null; ws.playerId = null; ws.isHost = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
    if (room) room.lastActive = Date.now();

    switch (msg.type) {
      // 시계 맞추기용 — 클라이언트가 3번 보내서 서버와의 시차를 잰다
      case 'ping':
        roomSend(ws, { type: 'pong', ct: msg.ct, st: Date.now() });
        break;

      case 'create_room': {
        const r = createRoom();
        if (!r) { roomSend(ws, { type: 'error', msg: '방을 만들 수 없습니다. 잠시 후 다시 시도하세요.' }); return; }
        r.hostWs = ws; ws.roomCode = r.code; ws.isHost = true;
        roomSend(ws, { type: 'room_created', code: r.code, hostToken: r.hostToken });
        sendRoster(r);
        break;
      }

      case 'rejoin_host': {
        const r = rooms.get(String(msg.code));
        if (!r || r.hostToken !== msg.hostToken) { roomSend(ws, { type: 'error', msg: '방을 찾을 수 없습니다.' }); return; }
        r.hostWs = ws; ws.roomCode = r.code; ws.isHost = true;
        roomSend(ws, { type: 'room_created', code: r.code, hostToken: r.hostToken });
        sendRoster(r);
        break;
      }

      case 'join': {
        const r = rooms.get(String(msg.code));
        if (!r) { roomSend(ws, { type: 'error', msg: '방이 없습니다. 코드를 확인하세요.' }); return; }

        // 재접속: 토큰이 맞으면 원래 자리로 복귀
        if (msg.token) {
          const old = [...r.players.values()].find(p => p.token === msg.token);
          if (old) {
            old.ws = ws; old.connected = true;
            ws.roomCode = r.code; ws.playerId = old.id;
            roomSend(ws, { type: 'join_ok', id: old.id, token: old.token, code: r.code, nick: old.nick, ci: old.ci, state: r.state });
            sendRoster(r);
            return;
          }
        }

        if (r.players.size >= 40) { roomSend(ws, { type: 'error', msg: '방이 가득 찼습니다. (최대 40명)' }); return; }
        let nick = cleanNick(msg.nick);
        // 닉네임 중복이면 숫자 붙이기
        const names = new Set([...r.players.values()].map(p => p.nick));
        if (names.has(nick)) { let i = 2; while (names.has(nick + i)) i++; nick = nick + i; }

        const p = {
          id: r.nextId++, nick, token: token(), ws,
          ci: (r.nextId - 2) % 30, // 색 인덱스
          x: 0, y: 0, dirX: 0, dirY: 0,
          alive: false, deadAt: 0,
          waiting: r.state !== 'lobby', // 게임 중 입장하면 다음 판부터
          connected: true,
        };
        r.players.set(p.id, p);
        ws.roomCode = r.code; ws.playerId = p.id;
        roomSend(ws, { type: 'join_ok', id: p.id, token: p.token, code: r.code, nick: p.nick, ci: p.ci, state: r.state });
        sendRoster(r);
        break;
      }

      case 'input': {
        if (!room || ws.playerId == null) return;
        const p = room.players.get(ws.playerId);
        if (!p) return;
        // 방향 벡터를 -1~1로 제한 (치팅 방지)
        let x = Number(msg.x) || 0, y = Number(msg.y) || 0;
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        p.dirX = x; p.dirY = y;
        break;
      }

      case 'start_game':
        if (room && ws.isHost && (room.state === 'lobby' || room.state === 'result')) startGame(room);
        break;

      case 'back_to_lobby':
        if (room && ws.isHost) backToLobby(room);
        break;

      case 'kick': {
        if (!room || !ws.isHost) return;
        const p = room.players.get(msg.playerId);
        if (p) {
          roomSend(p.ws, { type: 'kicked' });
          try { p.ws.close(); } catch {}
          room.players.delete(p.id);
          sendRoster(room);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
    if (!room) return;
    if (ws.isHost && room.hostWs === ws) { room.hostWs = null; return; } // 방은 유지 (재접속 가능)
    if (ws.playerId != null) {
      const p = room.players.get(ws.playerId);
      if (p && p.ws === ws) {
        p.connected = false; p.dirX = 0; p.dirY = 0; // 게임 중엔 제자리 정지
        if (room.state === 'lobby') room.players.delete(p.id); // 로비에선 바로 제거
        sendRoster(room);
      }
    }
  });
});

// ---------- 30분 미사용 방 청소 ----------
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActive > ROOM_IDLE_MS) {
      if (room.timer) clearInterval(room.timer);
      broadcast(room, { type: 'error', msg: '오래 사용하지 않아 방이 종료되었습니다.' });
      rooms.delete(code);
    }
  }
}, 60 * 1000);

server.listen(PORT, () => console.log(`교실 아케이드 서버 실행 중 → http://localhost:${PORT}`));
