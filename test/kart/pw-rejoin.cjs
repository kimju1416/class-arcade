// 레이스 중 새로고침해도 같은 자리로 돌아오는지(2인 온라인)
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const mk = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(700);
    await p.click('#bOnline'); await p.fill('#nick', name); await p.click('#bSelNext'); await p.waitForTimeout(300);
    return p;
  };
  const A = await mk('방장'), B = await mk('친구');
  await A.click('#bCreate'); await A.waitForFunction(() => document.getElementById('scr-room').classList.contains('on'));
  const code = await A.textContent('#roomCode');
  await B.fill('#joinCode', code); await B.click('#bJoin');
  await A.waitForFunction(() => document.querySelectorAll('#players .pl:not(.empty)').length === 2);
  await A.click('#bRoomStart');
  await Promise.all([A, B].map(p => p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 })));
  await B.evaluate(() => { window.__kartAuto = true; });
  await B.waitForTimeout(5000);
  const before = await B.evaluate(() => ({ id: __kart.race.myId, prog: Math.round(__kart.race.me.k.prog) }));
  await B.reload(); // 새로고침
  await B.waitForFunction(() => __kart.race && __kart.race.me && __kart.race.phase === 'race', null, { timeout: 60000 });
  await B.evaluate(() => { window.__kartAuto = true; });
  const after = await B.evaluate(() => ({ id: __kart.race.myId, prog: Math.round(__kart.race.me.k.prog) }));
  await B.waitForTimeout(3000);
  const moving = await B.evaluate(() => Math.round(__kart.race.me.k.prog));
  const seenByA = await A.evaluate((id) => { const r = __kart.race.byId[id]; return r && !r.gone && r.buf.length > 0; }, before.id);
  console.log(JSON.stringify({ before, after, moving, seenByA, errsA: A.errs, errsB: B.errs }));
  const ok = after.id === before.id && after.prog >= before.prog - 30 && moving > after.prog && seenByA;
  console.log(ok ? 'PASS 새로고침 뒤 같은 자리로 복귀' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})();
