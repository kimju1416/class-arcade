const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => localStorage.setItem('kart_qual', '"high"'));
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#bSolo'); await p.waitForTimeout(300); await p.click('#bGarage'); await p.waitForTimeout(1200);
  for (let i = 0; i < 5; i++) {
    await p.click(`#gBody button:nth-child(${i + 1})`);
    if (i === 2) { await p.click('#gDecal button:nth-child(4)'); await p.click('#gFinish button:nth-child(2)'); }
    if (i === 3) { await p.click('#gDecal button:nth-child(3)'); await p.click('#gPaint button:nth-child(5)'); }
    if (i === 4) { await p.click('#gRim button:nth-child(4)'); await p.click('#gPaint button:nth-child(13)'); await p.click('#gDecal button:nth-child(2)'); }
    await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}/g${i}.png` });
  }
  console.log(JSON.stringify(errs)); await b.close();
})();
