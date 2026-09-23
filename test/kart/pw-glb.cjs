// GLB 모델을 8방향에서 찍어 한 장으로
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  p.on('console', m => console.log('CON', m.text())); p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto(process.argv[2].startsWith('http') ? process.argv[2] : 'http://localhost:3000/kart/_tmp/view.html?m=' + encodeURIComponent(process.argv[2]));
  await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const shots = await p.evaluate(() => [0, 1, 2, 3, 4, 5, 6, 7].map(i => window.shot(i * Math.PI / 4)));
  shots.forEach((s, i) => fs.writeFileSync(`${process.argv[3]}/g${i}.png`, Buffer.from(s.split(',')[1], 'base64')));
  console.log('size', await p.evaluate(() => window.__size));
  await b.close();
})();
