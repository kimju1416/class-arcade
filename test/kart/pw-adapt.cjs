// 자동 화질: 프레임을 일부러 느리게 만들면 해상도·풀 개수가 내려가는지
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3000/kart/?debug=1'); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__kartAuto = true; __kart.S.qual = 'high'; __kart.S.track = 2; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  const before = await p.evaluate(() => document.getElementById('dbg').textContent);
  await p.evaluate(() => { const raf = window.requestAnimationFrame; window.requestAnimationFrame = (f) => raf((t) => { const e = performance.now() + 28; while (performance.now() < e); f(t); }); });
  await p.waitForTimeout(12000);
  const after = await p.evaluate(() => document.getElementById('dbg').textContent);
  const bar = await p.evaluate(() => document.getElementById('loadBar').style.width);
  console.log(JSON.stringify({ before, after, bar, errs })); await b.close();
})();
