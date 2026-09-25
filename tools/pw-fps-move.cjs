// 사용: node tools/pw-fps-move.cjs <서버포트> [지연ms 한쪽]  — IRON SECTOR 온라인: W 누른 뒤 화면이 움직이기까지(ms)·걷는 동안 프레임별 이동 고르기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const WS = require('ws'); const http = require('http');
const PORT = +(process.argv[2] || 3000), LAG = +(process.argv[3] || 50);
// 왕복 지연을 흉내 내는 중계(한국↔미국 서버 흉내)
const srv = http.createServer(); const wss = new WS.Server({ server: srv });
wss.on('connection', (c, req) => { const up = new WS(`ws://127.0.0.1:${PORT}${req.url}`); const q = [];
  up.on('open', () => { for (const m of q) up.send(m); q.length = 0; });
  c.on('message', d => setTimeout(() => { const s = d.toString(); up.readyState === 1 ? up.send(s) : q.push(s); }, LAG));
  up.on('message', d => setTimeout(() => c.readyState === 1 && c.send(d.toString()), LAG));
  c.on('close', () => up.close()); up.on('close', () => c.close()); });
srv.listen(3499);
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/fps/`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  await p.fill('#server', 'ws://127.0.0.1:3499/fps/ws'); await p.click('#online');
  await p.waitForFunction(() => !document.getElementById('hud').hidden && window.__fpsCam, null, { timeout: 30000 }); await p.waitForTimeout(1500); await p.click('#resume').catch(() => {}); await p.waitForTimeout(800); if (!(await p.evaluate(() => document.getElementById('pause').hidden))) { await p.click('#touch-resume').catch(() => {}); await p.waitForTimeout(500); } console.log('pause hidden', await p.evaluate(() => document.getElementById('pause').hidden));
  const res = [];
  for (let k = 0; k < 6; k++) {
    await p.evaluate(() => { const c = window.__fpsCam.position; window.__p0 = [c.x, c.z]; window.__moveAt = 0; window.__steps = []; let last = null;
      (function f() { const c = window.__fpsCam.position; const d = Math.hypot(c.x - window.__p0[0], c.z - window.__p0[1]); if (!window.__moveAt && d > 0.02) window.__moveAt = performance.now(); if (last) window.__steps.push(Math.hypot(c.x - last[0], c.z - last[1])); last = [c.x, c.z]; if (window.__steps.length < 90) requestAnimationFrame(f); })(); });
    const t0 = await p.evaluate(() => performance.now()); await p.keyboard.down(k % 2 ? 'KeyS' : 'KeyW');
    await p.waitForTimeout(1000); await p.keyboard.up(k % 2 ? 'KeyS' : 'KeyW'); await p.waitForTimeout(700);
    const r = await p.evaluate((t0) => { const s = window.__steps.slice(15, 60).filter(x => x < 1); const m = s.reduce((a, b) => a + b, 0) / s.length; const zero = s.filter(x => x < m * 0.2).length; return { lag: window.__moveAt ? Math.round(window.__moveAt - t0) : null, zeroFrames: zero, frames: s.length }; }, t0);
    res.push(r);
  }
  console.log('지연 한쪽', LAG, 'ms →', JSON.stringify(res), errs.slice(0, 2));
  await b.close(); srv.close(); process.exit(0);
})();
