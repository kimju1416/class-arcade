const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__kartAuto = true; __kart.S.track = 3; __kart.S.qual = 'high'; __kart.S.ta = false; __kart.S.teams = true; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  const shots = [];
  let jumpSeen = 0, maxHop = 0;
  for (let i = 0; i < 16; i++) {
    await p.waitForTimeout(1500);
    const st = await p.evaluate(() => { const k = __kart.race.me.k; return { hop: k.hop, prog: k.prog, jumped: !!k.jumped, boost: k.boostT }; });
    maxHop = Math.max(maxHop, st.hop); if (st.jumped) jumpSeen++;
    if (i === 2 || i === 7 || i === 12) await p.screenshot({ path: `${OUT}/k${i}.png` });
  }
  const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { function f() { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(); } requestAnimationFrame(f); }); return n / 2; });
  const team = await p.evaluate(() => ({ bar: document.getElementById('teamBar').innerText, teams: __kart.race.racers.map(r => r.team) }));
  // 모든 봇 점프 기록: 최대 높이
  const botHop = await p.evaluate(() => Math.max(...__kart.race.racers.map(r => r.k.hop)));
  console.log(JSON.stringify({ fps, maxHop, jumpSeen, botHop, team, errs }));
  await b.close();
})();
