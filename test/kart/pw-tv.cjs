const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const tvc = await b.newContext({ viewport: { width: 1600, height: 900 } });
  const TV = await tvc.newPage(); const errs = []; TV.on('pageerror', e => errs.push('TV ' + e.message));
  await TV.goto('http://localhost:3000/kart/'); await TV.waitForTimeout(800);
  await TV.click('#bTV'); await TV.waitForFunction(() => document.getElementById('scr-room').classList.contains('on'));
  await TV.waitForTimeout(1500);
  const code = await TV.textContent('#roomCode');
  const studs = [];
  for (const nm of ['민지', '서준']) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage(); p.on('pageerror', e => errs.push(nm + ' ' + e.message));
    await p.goto('http://localhost:3000/kart/?room=' + code); await p.waitForTimeout(800);
    const btn = await p.textContent('#bOnline');
    await p.tap('#bOnline'); await p.fill('#nick', nm); await p.tap('#bSelNext');
    await p.waitForFunction(() => document.getElementById('scr-room').classList.contains('on'), null, { timeout: 15000 });
    await p.evaluate(() => { window.__kartAuto = true; });
    studs.push({ p, btn });
  }
  await TV.waitForFunction(() => document.querySelectorAll('#players .pl:not(.empty)').length === 2);
  await TV.screenshot({ path: OUT + '/t0-lobby.png' });
  await TV.click('#bRoomStart');
  await TV.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  await TV.waitForTimeout(6000);
  await TV.screenshot({ path: OUT + '/t1-live.png' });
  const st = await TV.evaluate(() => ({ spec: __kart.race.spec, n: __kart.race.racers.length, board: document.getElementById('board').children.length, host: __kart.race.host }));
  await studs[0].p.screenshot({ path: OUT + '/t2-student.png' });
  await TV.waitForTimeout(16000);
  for (const s of studs) await s.p.evaluate(() => { __kart.race.me.k.prog += 3 * 1600 - 200; });
  for (let i = 0; i < 12; i++) { await TV.waitForTimeout(5000); console.log(await TV.evaluate(() => JSON.stringify({ ended: __kart.race && __kart.race.ended, pod: !!(__kart.race && __kart.race.podium), fins: __kart.race && __kart.race.racers.map(r => [r.name, r.k.finished, Math.round(r.k.prog)]) }))); for (const s of studs) console.log(await s.p.evaluate(() => JSON.stringify({ me: __kart.race && __kart.race.me && [__kart.race.me.k.finished, Math.round(__kart.race.me.k.prog)], vis: document.visibilityState }))); if (await TV.evaluate(() => !!(__kart.race && __kart.race.podium))) break; }
  await TV.waitForTimeout(2500); await TV.screenshot({ path: OUT + '/t3-podium.png' });
  console.log(await TV.evaluate(() => JSON.stringify(__kart.race.podium.podK.map(q => ({ n: q.r.name, local: q.r.local, bot: q.r.bot, baseY: q.baseY.toFixed(2), ky: q.r.k.y.toFixed(2), root: q.r.view.root.position.toArray().map(v => v.toFixed(1)), body: q.r.view.body.position.y.toFixed(2), C: [__kart.race.podium.C.x.toFixed(1), __kart.race.podium.C.z.toFixed(1)] })))));
  console.log(JSON.stringify({ code, btn: studs[0].btn, st, errs }));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
