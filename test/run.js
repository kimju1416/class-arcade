// 회귀 테스트 러너 — npm test
// 서버 한 대를 띄워 모든 스위트를 순서대로 돌린다 (스위트마다 방을 따로 쓴다).
const H = require('./helpers');

const SUITES = [
  ['자산', './assets.test'],
  ['접근성', './a11y.test'],
  ['전 게임 스모크', './all-games.test'],
  ['치팅 방지', './anticheat.test'],
  ['게임 규칙', './games.test'],
  ['배포 생존(스냅샷)', './snapshot.test'],
];

(async () => {
  const only = process.argv[2];
  const t0 = Date.now();
  console.log('교실 아케이드 회귀 테스트\n');
  await H.startServer();

  let pass = 0, fail = 0, skip = 0;
  const failed = [], skipped = [];
  for (const [name, mod] of SUITES) {
    if (only && !name.includes(only) && !mod.includes(only)) continue;
    console.log(`\n▶ ${name}`);
    try {
      const t = await require(mod)();
      pass += t.pass; fail += t.fail; skip += t.skip || 0;
      if (t.fail) failed.push(...t.fails.map(f => `[${name}] ${f}`));
      if (t.skip) skipped.push(...t.skips.map(s => `[${name}] ${s}`));
    } catch (e) {
      fail++; failed.push(`[${name}] 스위트 예외: ${e.message}`);
      console.log('    ❌ 스위트 예외:', e.message);
    }
  }

  H.stopServer();
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(52)}`);
  console.log(`${pass} PASS / ${fail} FAIL${skip ? ` / ${skip} SKIP` : ''}  (${sec}초)`);
  if (failed.length) {
    console.log('\n실패 목록:');
    failed.forEach(f => console.log('  -', f));
  }
  if (skipped.length) {
    console.log('\n건너뛴 항목 (이 환경에서 검증 불가):');
    skipped.forEach(s => console.log('  -', s));
  }
  console.log('='.repeat(52));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('러너 예외:', e); H.stopServer(); process.exit(2); });
