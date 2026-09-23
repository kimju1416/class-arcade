const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const mk = async (name) => {
    const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
    await p.click('#bOnline'); await p.fill('#nick', name); await p.click('#bSelNext'); await p.waitForTimeout(300);
    await p.evaluate(() => { window.__kartAuto = true; });
    return p;
  };
  const A = await mk('방장'), B = await mk('친구');
  await A.click('#bCreate'); await A.waitForFunction(() => document.getElementById('scr-room').classList.contains('on'));
  const code = await A.textContent('#roomCode');
  await B.fill('#joinCode', code); await B.click('#bJoin');
  await B.waitForFunction(() => document.querySelectorAll('#players .pl:not(.empty)').length === 2);
  await A.waitForFunction(() => document.querySelectorAll('#players .pl:not(.empty)').length === 2);
  await A.click('#roomTracks button:nth-child(2)'); await A.waitForTimeout(400);
  await A.screenshot({ path: OUT + '/m0-room.png' });
  await A.click('#roomTeams'); await A.waitForTimeout(400);
  await A.click('#bRoomStart');
  await Promise.all([A, B].map(p => p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 })));
  await A.waitForTimeout(5000);
  const sync = await B.evaluate(() => { const r = __kart.race; return { track: r.def.id, n: r.racers.length, host: r.host, remote: r.racers.filter(x => !x.local).map(x => [x.id, Math.round(x.k.prog), x.buf.length]) }; });
  const aSelf = await A.evaluate(() => { const r = __kart.race; return { host: r.host, racers: r.racers.map(x => [x.id, x.local, Math.round(x.k.prog)]) }; });
  // A가 바나나를 뒤에 떨구고 야구공 던지기 → B 화면에 뜨는지
  await A.waitForTimeout(0);
  await A.evaluate(() => { const r = __kart.race; r.me.k.item = 'banana'; r.me.k.itemN = 1; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' })); });
  await A.waitForTimeout(600);
  const bHaz = await B.evaluate(() => [...__kart.race.hazards.values()].map(h => [h.k, h.by, typeof h.id]));
  const aHaz = await A.evaluate(() => [...__kart.race.hazards.values()].map(h => [h.k, h.by, h.id, h.mine]));
  await B.screenshot({ path: OUT + '/m1-race-B.png' });
  // 결승 직전으로
  await A.waitForTimeout(16000);
  await Promise.all([A, B].map(p => p.evaluate(() => { const r = __kart.race; for (const x of r.racers) if (x.local) x.k.prog += 2 * 1600 + 1400; })));
  await Promise.all([A, B].map(p => p.waitForFunction(() => document.getElementById('scr-results').classList.contains('on'), null, { timeout: 120000 })));
  await B.waitForTimeout(1000);
  await B.screenshot({ path: OUT + '/m2-results-B.png' });
  const resA = await A.evaluate(() => document.getElementById('resList').innerText.replace(/\n/g, ' | '));
  const resB = await B.evaluate(() => document.getElementById('resList').innerText.replace(/\n/g, ' | '));
  await A.click('#bResAgain'); await A.waitForTimeout(800);
  const back = await A.evaluate(() => document.getElementById('scr-room').classList.contains('on') && document.getElementById('bRoomStart').hidden === false);
  console.log(JSON.stringify({ code, sync, aSelf, aHaz, bHaz, resA, resB, back, errsA: A.errs, errsB: B.errs }, null, 1));
  await b.close();
})().catch(e => { console.error('FAIL', e.stack); process.exit(1); });
