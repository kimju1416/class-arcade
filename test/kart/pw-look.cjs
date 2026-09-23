const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const t of [0, 1, 2]) {
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto(process.argv[3] || 'http://localhost:3000/kart/'); await p.waitForTimeout(800);
    await p.evaluate((t) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.ta = false; __kart.startSolo(); }, t);
    await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
    for (const w of [5000, 9000]) { await p.waitForTimeout(w); await p.screenshot({ path: `${OUT}/m${t}-${w}.png` }); }
    await ctx.close();
  }
  await b.close();
})();
