// 장면 안 메시 개수를 부모(무리)별로 세기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(([t]) => { window.__kartAuto = true; __kart.S.track = t; __kart.S.qual = 'low'; __kart.startSolo(); }, [+(process.argv[2] || 2)]);
  await p.waitForFunction(() => __kart.race && __kart.race.phase === 'race', null, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const sc = __kart.scene; let total = 0; const top = [];
    sc.children.forEach((c, i) => { let n = 0; c.traverse(o => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.visible) n++; }); total += n; top.push([n, i, c.type, c.children.length, (c.geometry && c.geometry.type) || '']); });
    top.sort((a, b) => b[0] - a[0]);
    const racers = __kart.race.racers.map(x => { let n = 0; x.view.root.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints) n++; }); return n; });
    return { total, children: sc.children.length, top: top.slice(0, 15), racers };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
