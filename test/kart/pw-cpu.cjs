// 경주 중 CPU 프로파일 — 자기 시간 상위 함수
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const t = +(process.argv[2] || 0);
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((t) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = 'low'; __kart.startSolo(); }, t);
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 90000 });
  await p.waitForTimeout(2000);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await p.waitForTimeout(6000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n])); const dt = profile.timeDeltas; let tot = 0;
  profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); tot += dt[i] || 0; });
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [k, v] of top) console.log((v / tot * 100).toFixed(1).padStart(5) + '%  ' + k);
  await b.close();
})();
