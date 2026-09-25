// 사용: node tools/pw-stick.cjs <http://127.0.0.1:포트>  — 폰에서 조이스틱을 좌우로 꺾은 순간 → 입력이 나가기까지(ms)
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:3000';
(async () => {
  const b = await chromium.launch();
  const tv = await b.newPage(); await tv.context().route(/pretendard/, r => r.abort());
  await tv.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await tv.waitForTimeout(800); await tv.click('#btnCreate');
  await tv.waitForFunction(() => roomCode, null, { timeout: 15000 }); const code = await tv.evaluate(() => roomCode);
  const ph = await b.newPage({ viewport: { width: 390, height: 844 } }); await ph.context().route(/pretendard/, r => r.abort());
  await ph.goto(`${BASE}/?room=${code}&fresh=1`, { waitUntil: 'domcontentloaded' }); await ph.waitForTimeout(1500);
  const nick = await ph.$('#inNick'); if (nick) { await nick.fill('측정'); const bj = await ph.$('#btnJoin'); if (bj) await bj.click(); }
  const ph2 = await b.newPage(); await ph2.context().route(/pretendard/, r => r.abort());
  await ph2.goto(`${BASE}/?room=${code}&fresh=1`, { waitUntil: 'domcontentloaded' }); await ph2.waitForTimeout(1500);
  const n2 = await ph2.$('#inNick'); if (n2) { await n2.fill('둘째'); const bj = await ph2.$('#btnJoin'); if (bj) await bj.click(); }
  await tv.waitForTimeout(1500);
  await tv.evaluate(() => send({ type: 'start_game', game: 'tag' }));
  await ph.waitForFunction(() => phase === 'playing', null, { timeout: 15000 });
  await ph.evaluate(() => { window.__sent = []; const o = ws.send.bind(ws); ws.send = (s) => { if (s.includes('"input"')) window.__sent.push([performance.now(), JSON.parse(s).x]); o(s); }; });
  const cx = 195, cy = 600, res = [];
  await ph.mouse.move(cx, cy); await ph.mouse.down();
  for (let i = 0; i < 12; i++) {
    // 오른쪽으로 조금씩 흔들다가(미세 조정) 왼쪽으로 확 꺾는다
    for (let k = 0; k < 6; k++) { await ph.mouse.move(cx + 40 + (k % 3), cy + (k % 2)); await ph.waitForTimeout(12); }
    await ph.waitForTimeout(40);
    const t = await ph.evaluate(() => performance.now()); await ph.mouse.move(cx - 45, cy);
    await ph.waitForTimeout(200);
    const d = await ph.evaluate((t) => { const s = window.__sent.find(e => e[0] >= t && e[1] < 0); return s ? s[0] - t : null; }, t);
    res.push(Math.round(d)); await ph.mouse.move(cx + 40, cy); await ph.waitForTimeout(120);
  }
  res.sort((a, b) => a - b);
  console.log(BASE, '조이스틱 꺾기 → 입력 전송(ms)', JSON.stringify(res), '중앙', res[res.length >> 1]);
  await b.close();
})();
