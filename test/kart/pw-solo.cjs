const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2]; const TRACK = +(process.argv[3] || 0);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/s0-title.png' });
  await p.click('#bSolo'); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/s1-select.png' });
  await p.fill('#nick', '형님'); await p.click('#bSelNext'); await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/s2-track.png' });
  await p.evaluate((t) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = 'high'; }, TRACK);
  await p.click('#bGo');
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  const fps = await p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { function f() { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(); } requestAnimationFrame(f); }); return n / 2; });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/s3-race.png' });
  // 아이템
  const items = await p.evaluate(async () => {
    const r = __kart.race, out = {};
    for (const it of ['ball', 'hball', 'banana', 'mic', 'star', 'boost3']) {
      r.me.k.item = it; r.me.k.itemN = it === 'boost3' ? 3 : 1; r.me.k.rollT = 0;
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
      await new Promise(x => setTimeout(x, 350));
      out[it] = { left: r.me.k.item, hazards: [...r.hazards.values()].filter(h => !h.dead).map(h => h.k), spun: r.racers.filter(x => x.k.spinT > 0).length, star: r.me.k.starT > 0, boost: r.me.k.boostT > 0 };
    }
    out.feed = document.getElementById('feed').innerText;
    return out;
  });
  await p.screenshot({ path: OUT + '/s4-items.png' });
  // 결승 직전으로 보내기
  await p.evaluate(() => { const r = __kart.race; for (const x of r.racers) { x.k.prog += 2 * 1600; } });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/s5-lap3.png' });
  await p.waitForFunction(() => document.getElementById('scr-results').classList.contains('on'), null, { timeout: 120000 }).catch(async (e) => { console.log('STUCK', await p.evaluate(() => JSON.stringify(__kart.race && { ended: __kart.race.ended, pod: !!__kart.race.podium, r: __kart.race.racers.map(x => [x.id, x.k.finished, Math.round(x.k.prog), +x.k.spd.toFixed(1), +x.k.lat.toFixed(1)]) }))); throw e; });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: OUT + '/s6-results.png' });
  const res = await p.evaluate(() => document.getElementById('resList').innerText);
  console.log(JSON.stringify({ fps, items, res: res.slice(0, 300), errs }, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
