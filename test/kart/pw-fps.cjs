// 코스별 초당 화면 수(높은 화질) 재기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const t of (process.argv[2] || '0,1,2,3').split(',').map(Number)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
    await p.evaluate(([t, q]) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = q; __kart.startSolo(); }, [t, process.env.Q || 'high']);
    await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
    await p.waitForTimeout(3000);
    const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { function f() { n++; performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res(); } requestAnimationFrame(f); }); return n / 3; });
    const info = await p.evaluate(() => ({ calls: __kart.race && window.__kartR ? 0 : 0 }));
    console.log('track', t, 'fps', fps.toFixed(1));
    await p.close();
  }
  await b.close();
})();
