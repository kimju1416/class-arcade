const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__kartAuto = true; __kart.S.track = 3; __kart.S.qual = 'high'; __kart.S.teams = false; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  const S = await p.evaluate(() => __kart.race.world.stage);
  const views = [[S.x + 70, 25, S.z + 70], [S.x - 60, 12, S.z + 80], [S.x + 10, 60, S.z + 150]];
  for (let i = 0; i < views.length; i++) {
    await p.evaluate(([pos, look]) => { window.__kartCam = { pos, look, fov: 55 }; }, [views[i], [S.x, 10, S.z]]);
    await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/st${i}.png` });
  }
  await b.close();
})();
