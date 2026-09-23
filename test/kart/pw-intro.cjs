// 출발 전 소개: 코스 비행 → 내 캐릭터 한 바퀴 → 카운트다운, 0.6초마다 찍기
const { chromium } = require('C:/Users/USER/Downloads/teacherdesk2/node_modules/playwright');
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: +process.argv[3] ? { width: 390, height: 844 } : { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:3000/kart/'); await p.waitForTimeout(800);
  await p.evaluate(() => { __kart.S.track = 2; __kart.S.qual = 'low'; __kart.S.char = 3; __kart.startSolo(); });
  await p.waitForFunction(() => __kart.race && __kart.race.me && __kart.race.introPath, null, { timeout: 90000 });
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) { await p.screenshot({ path: `${OUT}/in${i}.png` }); await p.waitForTimeout(450); }
  console.log('errs', errs, 'dur', await p.evaluate(() => [__kart.race.introDur, __kart.race.orbDur]), Date.now() - t0);
  await b.close();
})();
