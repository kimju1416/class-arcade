// 운전자 8방향 그림 확인: 출발 전 내 카트 둘레 8곳에서 찍어 한 장으로
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2], CH = +(process.argv[4] || 0);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 480 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(process.argv[3] || 'http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((c) => { __kart.S.track = 0; __kart.S.char = c; __kart.startSolo(); }, CH);
  await p.waitForFunction(() => __kart.race && __kart.race.me, null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.addStyleTag({ content: '#courseCard,#myCard,#center,#hud{display:none!important}' });
  for (let i = 0; i < 8; i++) {
    await p.evaluate(([i, R, H]) => {
      const k = __kart.race.me.k, a = k.h + i * Math.PI / 4;
      window.__kartCam = { pos: [k.x + Math.sin(a) * R, k.y + H, k.z + Math.cos(a) * R], look: [k.x, k.y + 1.2, k.z], fov: 50 };
    }, [i, +process.env.R || 5.5, +process.env.H || 2.2]);
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${OUT}/dir${i}.png` });
  }
  console.log('errors', errs.length, errs.slice(0, 3));
  await b.close();
})();
