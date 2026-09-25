// 폰 화질에서 한 프레임 무게를 물체 묶음별로 나눠 본다(카트·캐릭터·배경)
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const t = +(process.argv[2] || 0);
  const p = await b.newPage({ viewport: { width: 900, height: 420 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate((t) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = 'low'; __kart.startSolo(); }, t);
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const R = __kart.renderer, race = __kart.race;
    const measure = async () => { const i = R.info; i.autoReset = false; i.reset(); await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); const o = { calls: i.render.calls / 2, ktris: Math.round(i.render.triangles / 2000) }; i.autoReset = true; return o; };
    const all = await measure();
    for (const x of race.racers) x.view.root.visible = false;
    const noKarts = await measure();
    for (const x of race.racers) x.view.root.visible = true;
    const tris = (o) => { let n = 0; o.traverse(m => { if (m.isMesh && m.geometry) { const g = m.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3 * (m.isInstancedMesh ? m.count : 1); } }); return n; };
    let meshes = 0; race.racers[0].view.root.traverse(m => { if (m.isMesh) meshes++; });
    return { all, noKarts, oneKartKtris: Math.round(tris(race.racers[0].view.root) / 1000), oneKartMeshes: meshes, racers: race.racers.length, pr: R.getPixelRatio() };
  });
  console.log('track', t, JSON.stringify(r));
  await b.close();
})();
