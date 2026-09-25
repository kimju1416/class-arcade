// 사용: node tools/livebench.js [wss://game.kimju.kr] [게임]  — 교사 1 + 학생 봇 25로 붙어 20초간 state 도착 간격(p95·p99·max)을 잰다
// 라이브(또는 로컬) 서버에 교사 1 + 학생 봇 25로 붙어 상태 도착 간격 재기
const WS = require('ws');
const URL = process.argv[2] || 'wss://game.kimju.kr', game = process.argv[3] || 'tag', N = 25;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = () => new Promise((res, rej) => { const w = new WS(URL); w.on('open', () => res(w)); w.on('error', rej); });
const stats = (g) => { const s = [...g].sort((a, b) => a - b); const q = p => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]); return { n: g.length, med: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(s[s.length - 1]), over300: g.filter(x => x > 300).length }; };
(async () => {
  const host = await open(); let code;
  host.on('message', d => { const m = JSON.parse(d); if (m.type === 'room_created') code = m.code; });
  host.send(JSON.stringify({ type: 'create_room' }));
  while (!code) await sleep(50);
  const bots = [];
  for (let i = 0; i < N; i++) { const b = await open(); b.send(JSON.stringify({ type: 'join', code, nick: '측정' + (i + 1) })); bots.push(b); await sleep(40); }
  await sleep(1500);
  host.send(JSON.stringify({ type: 'start_game', game }));
  await sleep(5000);
  const gh = [], gp = []; let lh = 0, lp = 0, rec = true;
  host.on('message', d => { if (!rec || d.toString().indexOf('"state"') < 0) return; const t = performance.now(); if (lh) gh.push(t - lh); lh = t; });
  bots[0].on('message', d => { if (!rec || d.toString().indexOf('"state"') < 0) return; const t = performance.now(); if (lp) gp.push(t - lp); lp = t; });
  let k = 0; const iv = setInterval(() => { k++; bots.forEach((b, i) => { const a = k / 5 + i; b.readyState === 1 && b.send(JSON.stringify({ type: 'input', x: Math.cos(a), y: Math.sin(a) })); }); }, 90);
  await sleep(20000); rec = false; clearInterval(iv);
  console.log(URL, game, 'TV', JSON.stringify(stats(gh)), '폰', JSON.stringify(stats(gp)));
  host.send(JSON.stringify({ type: 'back_to_lobby' })); await sleep(300);
  [host, ...bots].forEach(w => w.close()); process.exit(0);
})();
