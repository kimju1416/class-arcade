// 코스별 그리기 호출·삼각형 수와, 그림자·물반사 하나씩 끈 프레임
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const t of (process.argv[2] || '0,2').split(',').map(Number)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
    await p.evaluate(([t]) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = 'high'; __kart.startSolo(); }, [t]);
    await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { function f() { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(); } requestAnimationFrame(f); }); return n / 2; });
    const info = await p.evaluate(() => { const i = __kart.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geo: i.memory.geometries, tex: i.memory.textures, dpr: __kart.renderer.getPixelRatio(), sh: __kart.renderer.shadowMap.enabled }; });
    const base = await fps();
    await p.evaluate(() => { __kart.renderer.shadowMap.enabled = false; __kart.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => m.needsUpdate = true); }); });
    await p.waitForTimeout(1500); const noSh = await fps();
    await p.evaluate(() => { __kart.scene.traverse(o => { if (o.isWater || (o.material && o.material.uniforms && o.material.uniforms.mirrorSampler)) o.visible = false; }); });
    await p.waitForTimeout(800); const noW = await fps();
    console.log('track', t, JSON.stringify(info), 'fps', base, 'noShadow', noSh, 'noShadow+noWater', noW);
    await p.close();
  }
  await b.close();
})();
