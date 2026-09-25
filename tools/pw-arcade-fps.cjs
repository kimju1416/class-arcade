// 사용: node tools/pw-arcade-fps.cjs <게임> [CPU배수] [tv|phone]  — 로컬 3000 서버, 봇 24명, 화면 프레임 간격·CPU 상위 함수
// 아케이드: TV(1920x1080)·학생 폰에서 25명 게임 프레임 간격 + CPU 상위 함수
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const { spawn } = require('child_process');
const game = process.argv[2] || 'tag', slow = +(process.argv[3] || 4), who = process.argv[4] || 'tv', BASE = process.argv[5] || 'http://localhost:3000';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const tv = await b.newPage({ viewport: { width: 1920, height: 1080 } }); await tv.context().route(/pretendard/, r => r.abort()); const errs = []; tv.on('pageerror', e => errs.push(String(e)));
  await tv.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await tv.waitForTimeout(800); await tv.click('#btnCreate');
  await tv.waitForFunction(() => roomCode, null, { timeout: 15000 }); const code = await tv.evaluate(() => roomCode);
  const bots = spawn(process.execPath, ['tools/tvbots.js', code, '24'], { stdio: 'ignore', env: { ...process.env, ARCADE_WS: BASE.replace(/^http/, 'ws') } });
  let page = tv;
  if (who === 'phone') {
    page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); await page.context().route(/pretendard/, r => r.abort()); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/?room=${code}&fresh=1`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
    const nick = await page.$('#inNick'); if (nick) { await nick.fill('측정'); const bj = await page.$('#btnJoin'); if (bj) await bj.click(); }
  } else { const ph = await b.newPage(); await ph.context().route(/pretendard/, r => r.abort()); await ph.goto(`${BASE}/?room=${code}&fresh=1`, { waitUntil: 'domcontentloaded' }); await ph.waitForTimeout(1000); const nick = await ph.$('#inNick'); if (nick) { await nick.fill('학생'); const bj = await ph.$('#btnJoin'); if (bj) await bj.click(); } }
  await tv.waitForTimeout(3000);
  await tv.evaluate((g) => send({ type: 'start_game', game: g, opt: typeof gameOpt === 'function' ? gameOpt(g) : undefined }), game);
  await tv.waitForTimeout(6000);
  await page.bringToFront();
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  const r = await page.evaluate(async () => {
    const g = []; let last = performance.now(); const end = last + 8000;
    await new Promise(res => { function f() { const n = performance.now(); g.push(n - last); last = n; if (n < end) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    const s = [...g].sort((a, b) => a - b), avg = g.reduce((a, b) => a + b, 0) / g.length;
    return { fps: Math.round(1000 / avg), p95: Math.round(s[Math.floor(s.length * 0.95)]), max: Math.round(s[s.length - 1]), hitch50: g.filter(x => x > 50).length, phase, gameType, n: roster.size };
  });
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map(n => [n.id, n])), self = new Map(); let tot = 0;
  profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame, k = `${f.functionName || '(anon)'} :${f.lineNumber + 1}`; const d = profile.timeDeltas[i] || 0; self.set(k, (self.get(k) || 0) + d); tot += d; });
  console.log(who, game, 'cpu x' + slow, JSON.stringify(r), errs.slice(0, 3));
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log('   ', (v / tot * 100).toFixed(1).padStart(5) + '%', k);
  bots.kill(); await b.close();
})();
