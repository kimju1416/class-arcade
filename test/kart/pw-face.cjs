// 3D 캐릭터 표정: 평소·맞음·우승을 앞에서 찍기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2], CH = +(process.argv[3] || 0);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((c) => { __kart.S.track = 0; __kart.S.char = c; __kart.startSolo(); }, CH);
  await p.waitForFunction(() => __kart.race && __kart.race.me && document.getElementById('loading').hidden, null, { timeout: 90000 });
  await p.addStyleTag({ content: '#courseCard,#myCard,#hud,#center{display:none!important}' });
  await p.waitForTimeout(2500);
  for (const [i, f] of [[0, ''], [1, 'hit'], [2, 'win']].entries()) {
    await p.evaluate((f) => {
      const R = __kart.race; R.introSkip = true; R.t0 = R.clock() + 60000;
      const v = R.me.view, k = R.me.k; v.face = f; k.speed = 0; k.vx = 0; k.vz = 0;
      window.__kartCam = { pos: [k.x + Math.sin(k.h) * 2.6, k.y + 1.3, k.z + Math.cos(k.h) * 2.6], look: [k.x, k.y + 1.0, k.z], fov: 45 };
    }, f[1]);
    await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/face${i}.png` });
  }
  console.log('face', await p.evaluate(() => { const m = __kart.race.me.view.m3d; return m ? m.material.userData.u.face.value : 'no3d'; }), errs);
  await b.close();
})();
