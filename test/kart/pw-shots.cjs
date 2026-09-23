// 출발 전 소개(경기장 구경 → 정면 → 뒷모습)를 구간별로 멈춰 찍기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2], TRACK = +(process.argv[3] || 2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((t) => { __kart.S.track = t; __kart.S.qual = 'low'; __kart.S.char = 3; __kart.startSolo(); }, TRACK);
  await p.waitForFunction(() => __kart.race && __kart.race.introT0 && document.getElementById('loading').hidden && __kart.race.t0 - __kart.race.clock() > 5000, null, { timeout: 90000 });
  const fr = [0.02, 0.2, 0.38, 0.5, 0.62, 0.72, 0.82, 0.92, 0.99];
  for (let i = 0; i < fr.length; i++) {
    await p.evaluate((f) => { const R = __kart.race; R.introSkip = true; window.__hold = f; R.t0 = R.clock() + 60000; }, fr[i]);
    await p.evaluate(() => { const R = __kart.race, f = window.__hold; return new Promise(r => { let n = 0; (function g() { R.introStartT = R.clock() - f * R.introDur * 1000; if (++n < 4) requestAnimationFrame(g); else r(); })(); }); });
    await p.screenshot({ path: `${OUT}/sh${i}.png` });
  }
  console.log('errs', errs);
  await b.close();
})();
