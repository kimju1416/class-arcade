const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => { const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
 for (const [t, q] of [[0, 'high'], [2, 'high'], [2, 'low']]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(600);
  const t0 = Date.now();
  await p.evaluate(([t, q]) => { __kart.S.track = t; __kart.S.qual = q; __kart.S.ta = false; __kart.startSolo(); }, [t, q]);
  await p.waitForFunction(() => document.getElementById('loading').hidden && __kart.race, null, { timeout: 60000, polling: 50 });
  console.log(t, q, 'total', Date.now() - t0, 'build+compile', await p.evaluate(() => Math.round(window.__kartBuild)), JSON.stringify(await p.evaluate(() => window.__kartProf)));
  await p.close(); }
 await b.close(); })();
