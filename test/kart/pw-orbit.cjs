// 한 바퀴 소개를 8군데(0~100%)에 멈춰 찍기 — 캐릭터가 늘 정면인지
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => { __kart.S.track = 2; __kart.S.qual = 'low'; __kart.S.char = +(new URLSearchParams(location.search).get('c') || 3); __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.introT0 && document.getElementById('loading').hidden && __kart.race.t0 - __kart.race.clock() > 5000, null, { timeout: 90000 });
  for (let i = 0; i < 8; i++) {
    await p.evaluate((e) => { const R = __kart.race, c = R.clock(); R.introSkip = true; R.t0 = c + 60000; const fly = R.introDur - R.orbDur; R.introStartT = c - (fly + e * R.orbDur) * 1000; window.__hold = [fly, e]; }, i / 7);
    await p.evaluate(() => { const R = __kart.race; const [fly, e] = window.__hold; return new Promise(r => { let n = 0; (function f() { R.introStartT = R.clock() - (fly + e * R.orbDur) * 1000; if (++n < 4) requestAnimationFrame(f); else r(); })(); }); });
    await p.screenshot({ path: `${OUT}/orb${i}.png` });
  }
  await b.close();
})();
