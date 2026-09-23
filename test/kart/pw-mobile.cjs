const { chromium, devices } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const [tag, vp] of [['port', { width: 390, height: 844 }], ['land', { width: 844, height: 390 }]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}/${tag}-0.png` });
    await p.tap('#bSolo'); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${tag}-1.png` });
    await p.tap('#bSelNext'); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/${tag}-2.png` });
    await p.tap('#bGo');
    await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
    // 오른쪽 버튼 누르고 있기
    const box = await p.locator('#tR').boundingBox();
    await p.dispatchEvent('#tR', 'pointerdown'); await p.waitForTimeout(700);
    const st = await p.evaluate(() => ({ steer: __kart.touch.r, h: __kart.race.me.k.h, spd: __kart.race.me.k.spd }));
    await p.dispatchEvent('#tR', 'pointerup');
    st.fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { function f() { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(); } requestAnimationFrame(f); }); return n / 2; });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${tag}-3.png` });
    console.log(tag, JSON.stringify({ st, box, errs }));
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error('FAIL', e.stack); process.exit(1); });
