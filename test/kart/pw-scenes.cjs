// 코스 장면(열린 해변·물 빠짐 구조·다리·터널) 캡처와 동작 확인
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2] || './out';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(700);
  const res = {};
  const start = async (t) => { await p.evaluate((t) => { window.__kartCam = null; window.__kartAuto = true; __kart.S.qual = 'high'; __kart.S.track = t; __kart.S.ta = false; __kart.S.teams = false; __kart.startSolo(); }, t); await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 }); };
  const look = async (u, lat, h, back, name) => {
    await p.evaluate(([u, lat, h, back]) => { const tr = __kart.race.tr, s = u * tr.N, a = tr.point(s, lat), c = tr.point(s - back / tr.seg, lat * 0.6); window.__kartCam = { pos: [c.x, c.y + h, c.z], look: [a.x, a.y + 1, a.z], fov: 62 }; }, [u, lat, h, back]);
    await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/sc-${name}.png` });
  };
  // 해변: 열린 구간 + 물 빠짐
  await start(0);
  await look(0.43, 0, 8, 40, 'beach-open');
  res.water = await p.evaluate(async () => {
    const r = __kart.race, k = r.me.k, tr = r.tr; window.__kartAuto = false;
    const s = 0.48 * tr.N; let hit = null;
    for (const side of [1, -1]) for (let d = 30; d < 90; d += 3) { const q = tr.point(s, side * d); if (tr.groundAt(q.x, q.z) < tr.seaY - 1) { hit = q; break; } } 
    if (!hit) return 'no-water';
    k.prog = s; k.li = Math.floor(s); k.x = hit.x; k.z = hit.z; k.spd = 5;
    await new Promise(r => setTimeout(r, 400)); const during = k.rescueT > 0;
    await new Promise(r => setTimeout(r, 3200)); return { during, back: k.rescueT <= 0 && Math.abs(k.lat) < tr.half };
  });
  // 벚꽃 다리
  await start(2); await look(0.47, 30, 6, 40, 'blossom-bridge'); await look(0.40, 0, 4, 25, 'blossom-onbridge');
  // 네온 터널
  await start(1); await look(0.10, 0, 3, 18, 'neon-tunnel');
  // 공연장 다리
  await start(3); await look(0.45, 70, 10, -5, 'kpop-bridge'); await look(0.42, 0, 4, 22, 'kpop-onbridge');
  console.log(JSON.stringify({ res, errs })); await b.close();
})();
