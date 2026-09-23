// 한 프레임에 그리는 양(그리기 호출·삼각형) — 기계 부하와 상관없이 똑같이 나오는 무게 지표
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const t of (process.argv[2] || '0,1,2,3').split(',').map(Number)) for (const q of ['high', 'low']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
    await p.evaluate(([t, q]) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = q; __kart.startSolo(); }, [t, q]);
    await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(async () => {
      const R = __kart.renderer, i = R.info; i.autoReset = false; i.reset();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const o = { calls: i.render.calls, ktris: Math.round(i.render.triangles / 1000), frames: i.render.frame }; i.autoReset = true; return o;
    });
    console.log('track', t, q, JSON.stringify(r));
    await p.close();
  }
  await b.close();
})();
