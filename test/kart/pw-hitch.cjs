// 출발 전 한 바퀴 도는 동안 프레임 사이 간격(멈칫 = 큰 간격) 재기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => { __kart.S.track = 0; __kart.S.qual = 'low'; __kart.S.char = 5; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.introPath && __kart.race.introT0, null, { timeout: 90000 });
  const r = await p.evaluate(async () => {
    const R = __kart.race, gaps = [], spikes = []; let lastP = 0, lastX = 0; const tg0 = R.t0 - R.clock(); let last = performance.now(), inOrb = 0;
    await new Promise(res => { function f(t) { const now = performance.now(); const pr = __kart.renderer.info.programs.length, tx = __kart.renderer.info.memory.textures; if (now - last > 200) spikes.push({ gap: Math.round(now - last), card: !document.getElementById('myCard').hidden, progs: [lastP, pr], tex: [lastX, tx], toGo: Math.round(R.t0 - R.clock()) }); lastP = pr; lastX = tx; if (!document.getElementById('myCard').hidden) { gaps.push(now - last); inOrb++; } last = now; if (R.t0 - R.clock() > 2900) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    gaps.sort((a, b) => b - a);
    return { spikes, toGoAtStart: Math.round(tg0), dur: R.introDur, frames: inOrb, worst: gaps.slice(0, 4).map(Math.round), median: Math.round(gaps[Math.floor(gaps.length / 2)] || 0), orb: R.orbDur };
  });
  console.log(JSON.stringify(r), errs);
  await b.close();
})();
