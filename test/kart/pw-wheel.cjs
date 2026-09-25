// 달리는 내 카트를 옆에서 따라가며 바퀴 모습 연속 캡처
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2], body = +(process.argv[3] || 0), D = +(process.argv[4] || 3.2);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 900, height: 500 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((body) => { window.__kartAuto = true; __kart.S.track = 0; __kart.S.qual = 'high'; __kart.S.car.b = body; __kart.startSolo(); }, body);
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 90000 });
  await p.waitForTimeout(5000);
  await p.evaluate((D) => { function f() { const k = __kart.race.me.k, s = Math.sin(k.h), c = Math.cos(k.h); window.__kartCam = { pos: [k.x + c * D - s * 0.3, k.y + 0.9, k.z - s * D - c * 0.3], look: [k.x, k.y + 0.4, k.z], fov: 45 }; requestAnimationFrame(f); } f(); }, D);
  for (let i = 0; i < 4; i++) { await p.screenshot({ path: `${OUT}/w${body}-${i}.png` }); await p.waitForTimeout(90); }
  console.log(JSON.stringify({ errs, spd: await p.evaluate(() => __kart.race.me.k.spd) })); await b.close();
})();
