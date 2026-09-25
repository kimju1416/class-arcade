// 사용: node tools/latbench.js [wss://game.kimju.kr] [게임]
// 조이스틱 반대로 꺾은 순간 → 교사 TV가 받은 상태에서 그 학생이 반대로 움직이기 시작한 순간(ms). 10번 평균.
const WS = require('ws');
const URL = process.argv[2] || 'wss://game.kimju.kr', game = process.argv[3] || 'tag';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = () => new Promise((res, rej) => { const w = new WS(URL); w.on('open', () => res(w)); w.on('error', rej); });
(async () => {
  const host = await open(); let code, myId, lastX = null, watch = null; const out = [];
  host.on('message', d => {
    const m = JSON.parse(d);
    if (m.type === 'room_created') code = m.code;
    if (m.type === 'state' && m.players && myId != null) {
      const row = m.players.find(r => r[0] === myId); if (!row) return;
      if (watch && lastX != null && row[1] < lastX) { out.push(Math.round(performance.now() - watch)); watch = null; }
      lastX = row[1];
    }
  });
  host.send(JSON.stringify({ type: 'create_room' })); while (!code) await sleep(30);
  const bot = await open(); bot.on('message', d => { const m = JSON.parse(d); if (m.type === 'join_ok') myId = m.id; });
  bot.send(JSON.stringify({ type: 'join', code, nick: '반응' })); while (myId == null) await sleep(30);
  const b2 = await open(); b2.send(JSON.stringify({ type: 'join', code, nick: '둘째' })); const b3 = await open(); b3.send(JSON.stringify({ type: 'join', code, nick: '셋째' })); await sleep(500);
  let ph = ''; host.on('message', d => { const m = JSON.parse(d); if (m.type === 'phase') ph = m.state; });
  const ping = []; for (let i = 0; i < 5; i++) { const t = performance.now(); await new Promise(r => { host.once('pong', r); host.ping(); }); ping.push(performance.now() - t); }
  host.send(JSON.stringify({ type: 'start_game', game })); await sleep(5500);
  for (let i = 0; i < 10; i++) {
    bot.send(JSON.stringify({ type: 'input', x: 1, y: 0 })); await sleep(700);
    watch = performance.now(); bot.send(JSON.stringify({ type: 'input', x: -1, y: 0 })); await sleep(700);
  }
  out.sort((a, b) => a - b); if (!out.length) console.log('phase', ph, 'lastX', lastX);
  console.log(URL, game, '왕복 핑', Math.round(ping.sort((a, b) => a - b)[2]), 'ms · 조작→TV 도착', JSON.stringify(out), '중앙', out[out.length >> 1]);
  host.send(JSON.stringify({ type: 'back_to_lobby' })); await sleep(200); host.close(); bot.close(); process.exit(0);
})();
