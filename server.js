// ============================================================
// 교실 아케이드 — 게임 서버
// 역할: ① 웹페이지(public/index.html) 서빙  ② WebSocket으로 방·게임 관리
// 게임: bomb(폭탄 피하기) / tag(감염 술래잡기) / coin(동전 줍기) / word(낱말 빨리치기)
// 실행: node server.js  (기본 포트 3000, Render에서는 PORT 환경변수 사용)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------- 공통 상수 ----------
const TICK_MS = 50;          // 게임 계산 주기: 50ms = 초당 20번
const SPEED = 230;           // 이동 속도 (유닛/초)
const PLAYER_R = 16;
const COUNTDOWN_MS = 3500;
const ROOM_IDLE_MS = 30 * 60 * 1000;

// 폭탄 피하기
const BOMB_WARN_MS = 1000;
const BOMB_BOOM_MS = 350;
const BOMB_ROUND_MS = 90000;
// 감염 술래잡기
const TAG_ROUND_MS = 60000;
const ZOMBIE_SPEED_MULT = 1.08; // 좀비가 살짝 빠름 (게임이 끝나게 하는 장치)
// 동전 줍기
const COIN_ROUND_MS = 60000;
// 낱말 빨리치기
const WORD_ROUNDS = 5;
const WORD_TIME_MS = 20000;
const WORD_BREAK_MS = 4000;
const WORD_POINTS = [10, 8, 6, 5, 4, 3, 2]; // 정답 순서별 점수 (이후는 1점)

const BAD_WORDS = ['시발', '씨발', '병신', '개새', '좆', '지랄', 'fuck', 'shit', '섹스'];

// 낱말 빨리치기 제시어 (짧은 것 → 긴 것 순으로 라운드 구성)
const WORDS_SHORT = [
  '훈민정음', '무지개', '고슴도치', '청개구리', '보름달', '도서관', '운동장',
  '떡볶이', '김치볶음밥', '지우개', '방학', '소풍', '짝꿍', '문어발', '솜사탕',
];
const WORDS_LONG = [
  '가는 말이 고와야 오는 말이 곱다', '티끌 모아 태산', '백지장도 맞들면 낫다',
  '소 잃고 외양간 고친다', '원숭이도 나무에서 떨어진다', '돌다리도 두들겨 보고 건너라',
  '우물 안 개구리', '등잔 밑이 어둡다', '말 한마디에 천 냥 빚을 갚는다',
  '호랑이도 제 말 하면 온다', '세 살 버릇 여든까지 간다', '바늘 도둑이 소 도둑 된다',
  '무궁화 꽃이 피었습니다', '구슬이 서 말이라도 꿰어야 보배', '하늘이 무너져도 솟아날 구멍이 있다',
];

const GAME_KEYS = ['bomb', 'tag', 'coin', 'word'];

// ---------- 정적 파일 서빙 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/debug') { // 운영 확인용: 방·플레이어 현황
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify([...rooms.values()].map(r => ({
      code: r.code, state: r.state, game: r.gameType, players: [...r.players.values()].map(p =>
        ({ nick: p.nick, x: Math.round(p.x), y: Math.round(p.y), alive: p.alive,
           infected: p.infected, score: p.score, connected: p.connected })),
      coins: r.game && r.game.coins ? r.game.coins.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), v: c.v })) : undefined,
    }))));
    return;
  }
  if (url === '/') url = '/index.html';
  const safe = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(__dirname, 'public', safe);
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 방 관리 ----------
const rooms = new Map();

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
    code, hostWs: null, hostToken: token(),
    players: new Map(), state: 'lobby', gameType: null,
    nextId: 1, lastActive: Date.now(), game: null, timer: null, phaseEndAt: 0,
  };
  rooms.set(code, room);
  return room;
}

function roomSend(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  if (room.hostWs && room.hostWs.readyState === 1) room.hostWs.send(msg);
  for (const p of room.players.values())
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
}

function sendRoster(room) {
  broadcast(room, {
    type: 'roster',
    players: [...room.players.values()].map(p => ({
      id: p.id, nick: p.nick, ci: p.ci, connected: p.connected, waiting: p.waiting,
    })),
    state: room.state,
  });
}

function closeRoom(room, reason) {
  if (room.timer) clearInterval(room.timer);
  broadcast(room, { type: 'room_closed', msg: reason });
  for (const p of room.players.values()) { try { p.ws.close(); } catch {} }
  rooms.delete(room.code);
}

// ---------- 게임 시작 ----------
function startGame(room, type) {
  if (!GAME_KEYS.includes(type)) return;
  const actives = [...room.players.values()].filter(p => p.connected);
  if (actives.length < 1) return;
  const n = actives.length;
  room.gameType = type;

  // 공통 초기화
  for (const p of room.players.values()) {
    p.alive = false; p.waiting = true; p.deadAt = 0;
    p.infected = false; p.infectedAt = 0; p.patientZero = false;
    p.score = 0; p.wordDone = false;
    p.dirX = 0; p.dirY = 0;
  }

  const size = Math.round(Math.min(1100, 460 + n * 35));
  room.game = { arenaW: size, arenaH: size, startedAt: 0, startingCount: n };
  const g = room.game;

  // 참가자 원형 배치 + 참전 처리
  actives.forEach((p, i) => {
    const ang = (i / n) * Math.PI * 2;
    p.x = size / 2 + Math.cos(ang) * size * 0.33;
    p.y = size / 2 + Math.sin(ang) * size * 0.33;
    p.alive = true; p.waiting = false;
  });

  // 게임별 초기화
  if (type === 'bomb') {
    g.bombs = []; g.nextBombId = 1; g.spawnInterval = 1100; g.nextSpawnAt = 0;
    g.roundMs = BOMB_ROUND_MS;
  } else if (type === 'tag') {
    g.roundMs = TAG_ROUND_MS;
    const zombieCount = Math.max(1, Math.floor(n / 8));
    const shuffled = [...actives].sort(() => Math.random() - 0.5);
    shuffled.slice(0, zombieCount).forEach(p => { p.infected = true; p.patientZero = true; });
  } else if (type === 'coin') {
    g.roundMs = COIN_ROUND_MS;
    g.coins = []; g.nextCoinId = 1; g.nextCoinAt = 0; g.coinCap = 12 + n;
  } else if (type === 'word') {
    g.roundMs = 0; // 라운드 방식이라 전체 제한시간 없음
    const shorts = [...WORDS_SHORT].sort(() => Math.random() - 0.5);
    const longs = [...WORDS_LONG].sort(() => Math.random() - 0.5);
    g.words = [...shorts.slice(0, 2), ...longs.slice(0, WORD_ROUNDS - 2)];
    g.round = 0; g.wordPhase = 'idle'; g.correctOrder = [];
  }

  room.state = 'countdown';
  room.phaseEndAt = Date.now() + COUNTDOWN_MS;
  broadcast(room, { type: 'phase', state: 'countdown', gameType: type, endAt: room.phaseEndAt, st: Date.now() });
  sendRoster(room);

  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => tick(room), TICK_MS);
}

// ---------- 틱 ----------
function tick(room) {
  const now = Date.now();
  const g = room.game;
  if (!g) return;

  if (room.state === 'countdown') {
    if (now >= room.phaseEndAt) {
      room.state = 'playing';
      g.startedAt = now;
      room.phaseEndAt = g.roundMs ? now + g.roundMs : 0;
      if (room.gameType === 'bomb') g.nextSpawnAt = now + 2500;
      if (room.gameType === 'coin') g.nextCoinAt = now + 500;
      if (room.gameType === 'word') startWordRound(room, now);
      broadcast(room, { type: 'phase', state: 'playing', gameType: room.gameType, endAt: room.phaseEndAt, st: now });
    }
    sendState(room, now);
    return;
  }
  if (room.state !== 'playing') return;

  const dt = TICK_MS / 1000;
  if (room.gameType === 'bomb') bombTick(room, now, dt);
  else if (room.gameType === 'tag') tagTick(room, now, dt);
  else if (room.gameType === 'coin') coinTick(room, now, dt);
  else if (room.gameType === 'word') wordTick(room, now);
}

function movePlayers(room, dt, speedOf) {
  const g = room.game;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const sp = speedOf ? speedOf(p) : SPEED;
    p.x = Math.max(PLAYER_R, Math.min(g.arenaW - PLAYER_R, p.x + p.dirX * sp * dt));
    p.y = Math.max(PLAYER_R, Math.min(g.arenaH - PLAYER_R, p.y + p.dirY * sp * dt));
  }
}

// ---------- 폭탄 피하기 ----------
function bombTick(room, now, dt) {
  const g = room.game;
  const W = g.arenaW, H = g.arenaH;
  movePlayers(room, dt);

  const elapsed = now - g.startedAt;
  if (now >= g.nextSpawnAt) {
    const waves = 1 + Math.floor(elapsed / 15000) + Math.max(0, Math.round(g.startingCount / 8));
    const alivePs = [...room.players.values()].filter(p => p.alive);
    for (let i = 0; i < waves; i++) {
      let bx = 0, by = 0;
      for (let tryN = 0; tryN < 8; tryN++) {
        bx = PLAYER_R + Math.random() * (W - PLAYER_R * 2);
        by = PLAYER_R + Math.random() * (H - PLAYER_R * 2);
        if (elapsed > 8000) break;
        if (!alivePs.some(p => Math.hypot(p.x - bx, p.y - by) < 150)) break;
      }
      g.bombs.push({
        id: g.nextBombId++, x: bx, y: by, r: 55 + Math.random() * 45,
        explodeAt: now + BOMB_WARN_MS, endAt: now + BOMB_WARN_MS + BOMB_BOOM_MS,
      });
    }
    g.spawnInterval = Math.max(320, g.spawnInterval * 0.97);
    g.nextSpawnAt = now + g.spawnInterval;
  }

  for (const b of g.bombs) {
    if (now < b.explodeAt || now > b.endAt) continue;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy <= (b.r + PLAYER_R) * (b.r + PLAYER_R)) { p.alive = false; p.deadAt = now; }
    }
  }
  g.bombs = g.bombs.filter(b => now <= b.endAt);

  const alive = [...room.players.values()].filter(p => p.alive);
  if (now >= room.phaseEndAt || (g.startingCount >= 2 && alive.length <= 1) || alive.length === 0) {
    endBomb(room, now); return;
  }
  sendState(room, now);
}

function endBomb(room, now) {
  const g = room.game;
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return (b.deadAt || 0) - (a.deadAt || 0);
  });
  finishGame(room, sorted, p => {
    const ms = (p.alive ? now - g.startedAt : p.deadAt - g.startedAt) || 0;
    return (ms / 1000).toFixed(1) + '초 생존';
  }, p => p.alive ? 'alive' : String(p.deadAt));
}

// ---------- 감염 술래잡기 ----------
function tagTick(room, now, dt) {
  const g = room.game;
  movePlayers(room, dt, p => p.infected ? SPEED * ZOMBIE_SPEED_MULT : SPEED);

  // 감염 판정: 좀비와 닿으면 감염
  const ps = [...room.players.values()].filter(p => p.alive);
  const zombies = ps.filter(p => p.infected);
  const humans = ps.filter(p => !p.infected);
  for (const z of zombies) {
    for (const h of humans) {
      if (h.infected) continue;
      const dx = z.x - h.x, dy = z.y - h.y;
      if (dx * dx + dy * dy <= (PLAYER_R * 2) * (PLAYER_R * 2)) { h.infected = true; h.infectedAt = now; }
    }
  }

  const remaining = ps.filter(p => !p.infected).length;
  if (now >= room.phaseEndAt || remaining === 0) { endTag(room, now); return; }
  sendState(room, now);
}

function endTag(room, now) {
  const g = room.game;
  const parts = [...room.players.values()].filter(p => !p.waiting);
  // 순위: 생존자 공동 1위 → 늦게 감염된 순 → 술래(처음 좀비)는 순위 밖 표시
  const sorted = parts.sort((a, b) => {
    const av = a.patientZero ? -1 : (a.infected ? a.infectedAt - now : 1); // 클수록 위
    const bv = b.patientZero ? -1 : (b.infected ? b.infectedAt - now : 1);
    return bv - av;
  });
  finishGame(room, sorted, p => {
    if (p.patientZero) return '🧟 술래';
    if (!p.infected) return '끝까지 생존!';
    return ((p.infectedAt - g.startedAt) / 1000).toFixed(1) + '초 버팀';
  }, p => p.patientZero ? 'zero' : (p.infected ? String(p.infectedAt) : 'alive'));
}

// ---------- 동전 줍기 ----------
function coinTick(room, now, dt) {
  const g = room.game;
  movePlayers(room, dt);

  if (now >= g.nextCoinAt && g.coins.length < g.coinCap) {
    const gold = Math.random() < 0.12;
    g.coins.push({
      id: g.nextCoinId++,
      x: 30 + Math.random() * (g.arenaW - 60),
      y: 30 + Math.random() * (g.arenaH - 60),
      v: gold ? 3 : 1,
    });
    g.nextCoinAt = now + 450;
  }

  // 줍기 판정
  for (const c of g.coins) {
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy <= (PLAYER_R + 13) * (PLAYER_R + 13)) { p.score += c.v; c.taken = true; break; }
    }
  }
  g.coins = g.coins.filter(c => !c.taken);

  if (now >= room.phaseEndAt) { endCoin(room); return; }
  sendState(room, now);
}

function endCoin(room) {
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => b.score - a.score);
  finishGame(room, sorted, p => p.score + '개', p => String(p.score));
}

// ---------- 낱말 빨리치기 ----------
function startWordRound(room, now) {
  const g = room.game;
  g.round++;
  g.word = g.words[g.round - 1];
  g.wordPhase = 'show';
  g.roundEndAt = now + WORD_TIME_MS;
  g.correctOrder = [];
  for (const p of room.players.values()) p.wordDone = false;
}

function wordTick(room, now) {
  const g = room.game;
  const actives = [...room.players.values()].filter(p => p.alive && p.connected);

  if (g.wordPhase === 'show') {
    const allDone = actives.length > 0 && actives.every(p => p.wordDone);
    if (now >= g.roundEndAt || allDone) {
      g.wordPhase = 'break';
      g.breakEndAt = now + WORD_BREAK_MS;
    }
  } else if (g.wordPhase === 'break') {
    if (now >= g.breakEndAt) {
      if (g.round >= WORD_ROUNDS) { endWord(room); return; }
      startWordRound(room, now);
    }
  }
  sendState(room, now);
}

function normalizeWord(s) {
  return String(s || '').normalize('NFC').replace(/\s+/g, '').trim();
}

function endWord(room) {
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => b.score - a.score);
  finishGame(room, sorted, p => p.score + '점', p => String(p.score));
}

// ---------- 공통 종료·상태 ----------
function finishGame(room, sorted, labelOf, keyOf) {
  clearInterval(room.timer); room.timer = null;
  room.state = 'result';
  let rank = 0, prevKey = null;
  const ranking = sorted.map((p, i) => {
    const key = keyOf(p);
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    return { id: p.id, nick: p.nick, ci: p.ci, rank, label: labelOf(p) };
  });
  broadcast(room, { type: 'result', gameType: room.gameType, ranking });
  sendRoster(room);
}

function sendState(room, now) {
  const g = room.game;
  const type = room.gameType;
  if (type === 'word') {
    broadcast(room, {
      type: 'state', mode: 'word', st: now,
      round: g.round, totalRounds: WORD_ROUNDS,
      word: g.wordPhase === 'show' ? g.word : null,
      wordPhase: g.wordPhase || 'idle',
      timeLeft: g.wordPhase === 'show' ? Math.max(0, g.roundEndAt - now) : 0,
      scores: [...room.players.values()].filter(p => !p.waiting).map(p => {
        const ord = g.correctOrder.indexOf(p.id);
        return [p.id, p.score, p.wordDone ? ord + 1 : 0];
      }),
    });
    return;
  }
  const msg = {
    type: 'state', mode: type, st: now,
    arena: { w: g.arenaW, h: g.arenaH },
    timeLeft: room.state === 'playing' && room.phaseEndAt ? Math.max(0, room.phaseEndAt - now) : (g.roundMs || 0),
    players: [...room.players.values()].map(p => {
      const extra = type === 'tag' ? (p.infected ? 1 : 0) : (type === 'coin' ? p.score : 0);
      return [p.id, Math.round(p.x), Math.round(p.y), p.alive ? 1 : 0, p.waiting ? 1 : 0, extra];
    }),
  };
  if (type === 'bomb') msg.bombs = g.bombs.map(b => {
    const boom = now >= b.explodeAt;
    const prog = boom ? (now - b.explodeAt) / BOMB_BOOM_MS
      : (now - (b.explodeAt - BOMB_WARN_MS)) / BOMB_WARN_MS;
    return [Math.round(b.x), Math.round(b.y), Math.round(b.r), boom ? 1 : 0, Math.round(prog * 100)];
  });
  if (type === 'coin') msg.coins = g.coins.map(c => [Math.round(c.x), Math.round(c.y), c.v]);
  broadcast(room, msg);
}

function backToLobby(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.state = 'lobby'; room.game = null; room.gameType = null;
  for (const p of room.players.values()) { p.alive = false; p.waiting = false; }
  broadcast(room, { type: 'phase', state: 'lobby', st: Date.now() });
  sendRoster(room);
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.roomCode = null; ws.playerId = null; ws.isHost = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
    if (room) room.lastActive = Date.now();

    switch (msg.type) {
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
        if (!r || r.hostToken !== msg.hostToken) { roomSend(ws, { type: 'host_rejoin_fail' }); return; }
        r.hostWs = ws; ws.roomCode = r.code; ws.isHost = true;
        roomSend(ws, { type: 'room_created', code: r.code, hostToken: r.hostToken });
        sendRoster(r);
        break;
      }

      case 'join': {
        const r = rooms.get(String(msg.code));
        if (!r) { roomSend(ws, { type: 'error', msg: '방이 없습니다. 코드를 확인하세요.' }); return; }

        if (msg.token) {
          const old = [...r.players.values()].find(p => p.token === msg.token);
          if (old) {
            old.ws = ws; old.connected = true;
            ws.roomCode = r.code; ws.playerId = old.id;
            roomSend(ws, { type: 'join_ok', id: old.id, token: old.token, code: r.code, nick: old.nick, ci: old.ci, state: r.state, gameType: r.gameType });
            sendRoster(r);
            return;
          }
        }

        if (r.players.size >= 40) { roomSend(ws, { type: 'error', msg: '방이 가득 찼습니다. (최대 40명)' }); return; }
        let nick = cleanNick(msg.nick);
        const names = new Set([...r.players.values()].map(p => p.nick));
        if (names.has(nick)) { let i = 2; while (names.has(nick + i)) i++; nick = nick + i; }

        const p = {
          id: r.nextId++, nick, token: token(), ws,
          ci: (r.nextId - 2) % 30,
          x: 0, y: 0, dirX: 0, dirY: 0,
          alive: false, deadAt: 0,
          infected: false, infectedAt: 0, patientZero: false,
          score: 0, wordDone: false,
          waiting: r.state !== 'lobby',
          connected: true,
        };
        r.players.set(p.id, p);
        ws.roomCode = r.code; ws.playerId = p.id;
        roomSend(ws, { type: 'join_ok', id: p.id, token: p.token, code: r.code, nick: p.nick, ci: p.ci, state: r.state, gameType: r.gameType });
        sendRoster(r);
        break;
      }

      case 'input': {
        if (!room || ws.playerId == null) return;
        const p = room.players.get(ws.playerId);
        if (!p) return;
        let x = Number(msg.x) || 0, y = Number(msg.y) || 0;
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        p.dirX = x; p.dirY = y;
        break;
      }

      case 'word_submit': {
        if (!room || ws.playerId == null || room.state !== 'playing' || room.gameType !== 'word') return;
        const g = room.game;
        const p = room.players.get(ws.playerId);
        if (!p || !p.alive || p.wordDone || g.wordPhase !== 'show') return;
        if (normalizeWord(msg.text) === normalizeWord(g.word)) {
          p.wordDone = true;
          g.correctOrder.push(p.id);
          const idx = g.correctOrder.length - 1;
          const pts = WORD_POINTS[idx] != null ? WORD_POINTS[idx] : 1;
          p.score += pts;
          roomSend(ws, { type: 'word_ok', order: idx + 1, points: pts });
        } else {
          roomSend(ws, { type: 'word_bad' });
        }
        break;
      }

      case 'start_game':
        if (room && ws.isHost && (room.state === 'lobby' || room.state === 'result'))
          startGame(room, String(msg.game || 'bomb'));
        break;

      case 'back_to_lobby':
        if (room && ws.isHost) backToLobby(room);
        break;

      case 'close_room':
        if (room && ws.isHost) closeRoom(room, '선생님이 방을 닫았습니다.');
        break;

      case 'leave': {
        if (!room || ws.playerId == null) return;
        room.players.delete(ws.playerId);
        ws.playerId = null; ws.roomCode = null;
        sendRoster(room);
        break;
      }

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
    if (ws.isHost && room.hostWs === ws) { room.hostWs = null; return; }
    if (ws.playerId != null) {
      const p = room.players.get(ws.playerId);
      if (p && p.ws === ws) {
        p.connected = false; p.dirX = 0; p.dirY = 0;
        if (room.state === 'lobby') room.players.delete(p.id);
        sendRoster(room);
      }
    }
  });
});

// ---------- 방 청소 ----------
setInterval(() => {
  const now = Date.now();
  for (const [, room] of rooms) {
    if (now - room.lastActive > ROOM_IDLE_MS) closeRoom(room, '오래 사용하지 않아 방이 종료되었습니다.');
  }
}, 60 * 1000);

server.listen(PORT, () => console.log(`교실 아케이드 서버 실행 중 → http://localhost:${PORT}`));
