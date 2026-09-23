// 카운트다운 시작 즈음 CPU 프로파일: 어느 함수가 오래 걸리는지
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => { __kart.S.track = 0; __kart.S.qual = 'low'; __kart.S.char = 5; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.introT0 && __kart.race.t0 - __kart.race.clock() < 4000, null, { timeout: 90000, polling: 50 });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
  await p.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = {}, byId = {}; for (const n of profile.nodes) byId[n.id] = n;
  const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId[id]; const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; self[k] = (self[k] || 0) + (dt[i] || 0) / 1000; });
  console.log(Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${Math.round(v)}ms ${k}`).join('\n'));
  await b.close();
})();
