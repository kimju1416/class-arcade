// 폰에서 처음 누르면 전체 화면이 되는지, 매니페스트가 잘 읽히는지
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(process.argv[2] || 'http://localhost:3000/kart/'); await p.waitForTimeout(1000);
  const before = await p.evaluate(() => !!document.fullscreenElement);
  await p.tap('#bSolo'); await p.waitForTimeout(800);
  const after = await p.evaluate(() => !!document.fullscreenElement);
  const man = await p.evaluate(async () => { const r = await fetch('/kart/manifest.webmanifest'); return [r.status, r.headers.get('content-type'), (await r.json()).display]; });
  const icon = await p.evaluate(async () => (await fetch('/kart/icon-512.png')).status);
  const screen = await p.evaluate(() => document.querySelector('.scr.on') && document.querySelector('.scr.on').id);
  console.log(JSON.stringify({ before, after, man, icon, screen, errs }));
  await b.close();
})();
