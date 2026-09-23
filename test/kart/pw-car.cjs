const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.click('#bSolo'); await p.waitForTimeout(300); await p.click('#bGarage'); await p.waitForTimeout(800);
  await p.click('#gBody button:nth-child(3)'); await p.waitForTimeout(900); await p.screenshot({ path: OUT + '/car1.png' });
  await p.click('#bGarDone'); await p.click('#bSelNext'); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__kartAuto = true; __kart.S.qual = 'high'; __kart.S.track = 0; }); await p.click('#bGo');
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  await p.waitForTimeout(4000); await p.screenshot({ path: OUT + '/car2.png' });
  console.log(JSON.stringify({ car: await p.evaluate(() => __kart.S.car), errs })); await b.close();
})();
