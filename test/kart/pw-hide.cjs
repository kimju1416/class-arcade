// 벚꽃 코스에서 무엇이 무거운지: 물체 무리를 하나씩 숨기며 프레임 재기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(([t, q]) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = q; __kart.startSolo(); }, [+(process.argv[2] || 2), process.argv[3] || 'high']);
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 60000 });
  await p.waitForTimeout(2000);
  const fps = () => p.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { function f() { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res(); } requestAnimationFrame(f); }); return n / 2; });
  console.log('all', await fps());
  const groups = await p.evaluate(() => {
    const sc = __kart.scene; if (!sc) return null;
    const out = [];
    sc.children.forEach((o, i) => { let tris = 0; o.traverse(m => { if (m.geometry) { const c = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; tris += c * (m.isInstancedMesh ? m.count : 1); } }); out.push([i, o.type, o.name || (o.material && o.material.type) || '', Math.round(tris)]); });
    return out.sort((a, b) => b[3] - a[3]).slice(0, 12);
  });
  console.log(JSON.stringify(groups));
  if (groups) for (const [i, , nm, tris] of groups.slice(0, 8)) {
    await p.evaluate((i) => { const sc = __kart.scene; sc.children[i].visible = false; }, i);
    await p.waitForTimeout(300);
    console.log('hide', i, nm, tris, await fps());
    await p.evaluate((i) => { const sc = __kart.scene; sc.children[i].visible = true; }, i);
  }
  await b.close();
})();
