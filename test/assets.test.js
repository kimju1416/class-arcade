// 자산 회귀 — index.html이 참조하는 스프라이트·사운드가 실제로 서빙되는지.
// 예전에 카드 스프라이트 3종이 없어서 로비를 열 때마다 404가 나던 잠복 버그를 잡은 검사다.
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

module.exports = async function run() {
  const t = H.makeT('자산');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  // 코드에서 참조하는 경로 수집 (문자열 리터럴 + 템플릿 조합)
  const refs = new Set();
  for (const m of html.matchAll(/['"`](sprites\/[\w.-]+\.(?:png|jpg))['"`]/g)) refs.add(m[1]);
  for (const m of html.matchAll(/['"`](sfx\/[\w.-]+\.mp3)['"`]/g)) refs.add(m[1]);
  // 'sprites/' + key + '.png' 형태로 조합되는 것들 (게임 카드 아이콘·바닥)
  const cardSpr = html.match(/const CARD_SPR = \{([\s\S]*?)\};/);
  if (cardSpr) for (const m of cardSpr[1].matchAll(/'([\w-]+)'/g)) refs.add(`sprites/${m[1]}.png`);
  // 블록 안 어디에서 'sprites/floor-'를 쓰든 잡는다 — 문장 순서에 기대면
  // 로더를 조금만 손봐도 목록 수집이 조용히 0이 되어 엉뚱한 곳에서 실패한다(실제로 겪음)
  const floors = html.match(/\[([^\]]*)\]\.forEach\(k => \{[\s\S]{0,500}?'sprites\/floor-'/);
  if (floors) for (const m of floors[1].matchAll(/'([\w-]+)'/g)) refs.add(`sprites/floor-${m[1]}.jpg`);
  // SFX 파일 목록
  const files = html.match(/const FILES = \[([^\]]+)\]/);
  if (files) for (const m of files[1].matchAll(/'([\w-]+)'/g)) refs.add(`sfx/${m[1]}.mp3`);

  t.ok(refs.size >= 40, `참조 자산 ${refs.size}개 수집`);

  const missing = [];
  const wrongMime = [];
  for (const ref of refs) {
    const res = await fetch(`${H.HTTP}/${ref}`);
    if (!res.ok) { missing.push(ref); continue; }
    const ct = res.headers.get('content-type') || '';
    const want = ref.endsWith('.png') ? 'image/png' : ref.endsWith('.jpg') ? 'image/jpeg' : 'audio/mpeg';
    if (ct !== want) wrongMime.push(`${ref}→${ct}`);
    // 내용이 실제로 있는지 (0바이트·HTML 폴백 방지)
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) missing.push(ref + '(빈 파일)');
  }
  t.ok(missing.length === 0, `누락 자산 0건${missing.length ? ' — ' + missing.join(', ') : ''}`);
  t.ok(wrongMime.length === 0, `MIME 정상${wrongMime.length ? ' — 잘못됨: ' + wrongMime.join(', ') : ''}`);

  // 없는 경로는 404여야 (SPA 폴백으로 200을 주면 배포 검증이 무의미해진다)
  const res404 = await fetch(`${H.HTTP}/sprites/__없는파일__.png`);
  t.ok(res404.status === 404, `없는 자산은 404 (실제 ${res404.status})`);

  return t;
};
