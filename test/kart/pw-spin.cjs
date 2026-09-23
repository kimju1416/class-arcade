// 3D 차 바퀴가 도는지·앞바퀴가 꺾이는지: 서 있는 카트의 바퀴 각도를 바꿔 옆·앞에서 찍기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2], BODY = +(process.argv[3] || 0);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((bd) => { localStorage.setItem('kart_car', JSON.stringify({ b: bd, c: -1, f: 0, w: 0, d: 0, n: 7 })); }, BODY);
  await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(() => { __kart.S.track = 0; __kart.S.char = 0; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.me && document.getElementById('loading').hidden, null, { timeout: 90000 });
  await p.addStyleTag({ content: '#courseCard,#myCard,#hud,#center{display:none!important}' });
  await p.waitForTimeout(2500);
  const shots = [[0, 0, Math.PI / 2], [0.7, 0, Math.PI / 2], [0, 0.6, 0.35]];
  for (let i = 0; i < shots.length; i++) {
    await p.evaluate(([wa, st, ang]) => {
      const R = __kart.race; R.introSkip = true; R.t0 = R.clock() + 60000;
      const v = R.me.view, k = R.me.k; v.wheelA = wa; k.steerVis = st;
      if (v.carMat) { v.carMat.userData.u.wa.value = wa; v.carMat.userData.u.ws.value = -st * 0.45; }
      const a = k.h + ang; window.__kartCam = { pos: [k.x + Math.sin(a) * 4.2, k.y + 1.1, k.z + Math.cos(a) * 4.2], look: [k.x, k.y + 0.5, k.z], fov: 50 };
    }, shots[i]);
    await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/spin${i}.png` });
  }
  console.log('car', await p.evaluate(() => !!__kart.race.me.view.carMat), errs);
  await b.close();
})();
