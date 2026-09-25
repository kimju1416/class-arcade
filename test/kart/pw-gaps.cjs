// 경주 중 프레임 간격(평균·p95·최대·100ms 넘는 멈칫 수) — CPU 4배 느리게(폰 흉내), 폰 화질
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const t = +(process.argv[2] || 0), slow = +(process.argv[3] || 4);
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((t) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = 'low'; __kart.startSolo(); }, t);
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 90000 });
  await p.waitForTimeout(2000);
  const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  const r = await p.evaluate(async () => {
    const g = []; let last = performance.now(); const end = last + 12000;
    await new Promise(res => { function f() { const n = performance.now(); g.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    const s = [...g].sort((a, b) => a - b), avg = g.reduce((a, b) => a + b, 0) / g.length;
    return { fps: Math.round(1000 / avg), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]), hitch100: g.filter(x => x > 100).length, pr: __kart.renderer.getPixelRatio().toFixed(2) };
  });
  console.log('track', t, 'cpu x' + slow, JSON.stringify(r), errs.slice(0, 3));
  await b.close();
})();
