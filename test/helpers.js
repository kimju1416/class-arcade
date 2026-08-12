// 테스트 공통 도구 — 서버 기동, WS 봇, 대기·단정 헬퍼
const { spawn } = require('child_process');
const path = require('path');
const WS = require('ws');

const PORT = +(process.env.TEST_PORT || 3399);
const KEY = 'testkey';
const HTTP = `http://127.0.0.1:${PORT}`;
const WSURL = `ws://127.0.0.1:${PORT}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 서버 ----
let proc = null;
async function startServer({ quiet = true } = {}) {
  if (proc) return proc;
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DEBUG_KEY: KEY },
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  proc.logs = [];
  if (quiet) {
    proc.stdout.on('data', d => proc.logs.push(String(d)));
    proc.stderr.on('data', d => proc.logs.push(String(d)));
  }
  // /health 가 뜰 때까지 대기
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(HTTP + '/health'); if (r.ok) return proc; } catch {}
    await sleep(100);
  }
  throw new Error('서버가 뜨지 않았습니다');
}
function stopServer() {
  if (!proc) return;
  try { proc.kill(); } catch {}
  proc = null;
}
// 서버가 남긴 예외 로그 (tick 예외·치명적 예외는 테스트 실패로 본다)
function serverErrors() {
  if (!proc || !proc.logs) return [];
  return proc.logs.join('').split('\n')
    .filter(l => /\[tick 예외\]|\[치명적 예외|\[처리 안 된 거부\]/.test(l));
}

// ---- WS 봇 ----
function mkClient(name = 'bot') {
  const ws = new WS(WSURL);
  ws.frames = [];
  ws._name = name;
  ws.on('error', () => {});
  ws.on('message', d => { try { ws.frames.push(JSON.parse(d)); } catch {} });
  return new Promise((res, rej) => {
    ws.on('open', () => res(ws));
    setTimeout(() => rej(new Error('WS 연결 실패: ' + name)), 5000);
  });
}
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const sendRaw = (ws, s) => { if (ws.readyState === 1) ws.send(s); };   // 치트 재현용 원시 문자열
const last = (ws, type) => [...ws.frames].reverse().find(f => f.type === type);
const lastState = (ws, mode) => [...ws.frames].reverse()
  .find(f => f.type === 'state' && (!mode || f.mode === mode));
const clearFrames = (...wss) => wss.forEach(w => { w.frames.length = 0; });

// ---- 방 만들기 ----
async function makeRoom(nBots = 3, names) {
  const host = await mkClient('host');
  send(host, { type: 'create_room' });
  await waitFor(() => last(host, 'room_created'), 3000, '방 생성');
  const rc = last(host, 'room_created');
  const bots = [];
  for (let i = 0; i < nBots; i++) {
    const b = await mkClient('bot' + i);
    send(b, { type: 'join', code: rc.code, nick: (names && names[i]) || ('봇' + (i + 1)) });
    bots.push(b);
  }
  if (nBots) await waitFor(() => bots.every(b => last(b, 'join_ok')), 4000, '봇 입장');
  return {
    host, bots, code: rc.code, hostToken: rc.hostToken,
    // id·token은 지금 붙잡아 둔다 (clearFrames로 join_ok가 지워져도 쓸 수 있게)
    ids: bots.map(b => last(b, 'join_ok') && last(b, 'join_ok').id),
    tokens: bots.map(b => last(b, 'join_ok') && last(b, 'join_ok').token),
    close() { [host, ...bots].forEach(w => { try { w.close(); } catch {} }); },
  };
}

// ---- /debug ----
const dbg = () => fetch(`${HTTP}/debug?key=${KEY}`).then(r => r.json());
async function room(code) { return (await dbg()).find(r => r.code === code); }

// ---- 대기 ----
async function waitFor(pred, ms = 8000, what = '조건') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await pred();
    if (v) return v;
    await sleep(80);
  }
  throw new Error(`시간 초과(${ms}ms): ${what}`);
}
// countdown(3.5초)을 넘겨 실제 playing 상태까지 — dPhase 등 초기값이 이미 있는 게임 오판 방지
async function waitPlaying(code, ms = 12000) {
  return waitFor(async () => {
    const r = await room(code);
    return r && r.state === 'playing' ? r : null;
  }, ms, `${code} playing 진입`);
}
async function waitRoom(code, pred, ms = 12000, what = '방 조건') {
  return waitFor(async () => {
    const r = await room(code);
    return r && pred(r) ? r : null;
  }, ms, what);
}

// ---- 단정 ----
function makeT(title) {
  const t = {
    title, pass: 0, fail: 0, skip: 0, fails: [], skips: [],
    ok(cond, msg) {
      if (cond) { t.pass++; console.log('    ✅', msg); }
      else { t.fail++; t.fails.push(msg); console.log('    ❌', msg); }
      return !!cond;
    },
    eq(a, b, msg) { return t.ok(a === b, `${msg} (기대 ${JSON.stringify(b)}, 실제 ${JSON.stringify(a)})`); },
    // 이 환경에서 검증 불가능한 항목 — 통과로 위장하지 않고 건너뛴 사실을 남긴다
    skipped(msg, why) { t.skip++; t.skips.push(`${msg} — ${why}`); console.log('    ⏭  ', msg, '—', why); },
  };
  return t;
}

module.exports = {
  PORT, KEY, HTTP, WSURL, sleep,
  startServer, stopServer, serverErrors,
  mkClient, send, sendRaw, last, lastState, clearFrames, makeRoom,
  dbg, room, waitFor, waitPlaying, waitRoom, makeT,
};
