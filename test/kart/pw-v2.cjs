const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
const G = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
(async () => {
  const b = await chromium.launch({ args: G });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  // 1) 로켓 스타트 + 레이스 + 시상식
  await p.evaluate(() => { window.__kartAuto = true; __kart.S.track = 0; __kart.S.qual = 'high'; __kart.S.ta = false; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.t0 - performance.now() < 700 && __kart.race.t0 - performance.now() > 300, null, { timeout: 30000, polling: 20 });
  await p.keyboard.down('Space'); await p.waitForTimeout(100); await p.keyboard.up('Space');
  await p.waitForFunction(() => __kart.race.phase === 'race'); await p.waitForTimeout(300);
  const rocket = await p.evaluate(() => ({ press: __kart.race.rsPress, boost: __kart.race.me.k.boostT }));
  await p.evaluate(() => { for (const x of __kart.race.racers) x.k.prog += 3 * 1600 - 300; });
  await p.waitForFunction(() => __kart.race && __kart.race.podium, null, { timeout: 90000 });
  await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/v1-podium.png' });
  await p.waitForFunction(() => document.getElementById('scr-results').classList.contains('on'), null, { timeout: 20000 });
  await p.waitForTimeout(800); await p.screenshot({ path: OUT + '/v2-results.png' });
  // 2) 타임어택 두 번(두 번째에 고스트)
  for (let run = 0; run < 2; run++) {
    await p.evaluate(() => { __kart.S.ta = true; __kart.startSolo(); });
    await p.waitForFunction(() => __kart.race && !__kart.race.ended && __kart.race.phase === 'race', null, { timeout: 30000 });
    await p.waitForTimeout(run ? 9000 : 12000);
    if (run) await p.screenshot({ path: OUT + '/v3-ghost.png' });
    await p.evaluate(() => { __kart.race.me.k.prog += 3 * 1600; });
    await p.waitForFunction(() => document.getElementById('scr-results').classList.contains('on'), null, { timeout: 30000 });
  }
  const rec = await p.evaluate(() => ({ txt: document.getElementById('resRecord').innerText, best: JSON.parse(localStorage.getItem('kart_best_beach') || 'null')?.t, gl: (JSON.parse(localStorage.getItem('kart_best_beach') || 'null')?.g || []).length }));
  await p.screenshot({ path: OUT + '/v4-ta-results.png' });
  await p.evaluate(() => { __kart.S.ta = false; }); await p.click('#bResMenu'); await p.click('#bSolo'); await p.click('#bSelNext'); await p.waitForTimeout(500);
  await p.click('#taMode button[data-m="ta"]'); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '/v5-track.png' });
  console.log(JSON.stringify({ rocket, rec, errs }));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
