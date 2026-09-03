// 모듈 API 대조 — SFX·FX·GFX는 객체 하나로 감싼 모듈이라, 없는 이름을 불러도 문법 오류가 안 난다.
// 실제로 두 번 당했다: SFX.count()는 줄다리기에서 매 구호마다 예외를 냈고(화면이 통째로 멈췄다),
// SFX.off는 늘 undefined라 음소거 아이콘이 영영 안 바뀌었다. 사다리도 (SFX.count || SFX.ok)로
// 가려져 있어서 의도한 또각또각 대신 다른 소리가 나고 있었다.
// 그래서 "부르는 이름"과 "실제로 정의된 이름"을 매번 대조한다.
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const SLASH = String.fromCharCode(47);

function block(src, openIdx) {          // openIdx = '{' 위치 → 짝이 맞는 '}'까지
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return src.slice(openIdx, i + 1); }
  }
  return '';
}
function objAfter(src, re) {
  const m = src.match(re); if (!m) return null;
  return block(src, src.indexOf('{', m.index + m[0].length - 1));
}
function keysOf(src, name, seg) {
  const keys = new Set();
  if (seg) for (const m of seg.matchAll(/(?:^\s*|[{,]\s*)(?:get |set |async )?([A-Za-z_$][\w$]*)\s*(?:\(|:)/gm)) keys.add(m[1]);
  // 객체 밖에서 붙인 메서드 (FX.spark = function ...)
  for (const m of src.matchAll(new RegExp('\\b' + name + '\\.([A-Za-z_$][\\w$]*)\\s*=[^=]', 'g'))) keys.add(m[1]);
  return keys;
}

module.exports = async function run() {
  const t = H.makeT('모듈 API');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  // 호출을 셀 때는 줄 주석을 뺀다 (주석에 적어 둔 설명이 오탐이 된다). 주소의 https:// 는 남긴다.
  const code = html.replace(new RegExp('(^|[^:])' + SLASH + SLASH + '[^\\r\\n]*', 'g'), '$1');

  const MODS = [
    ['SFX', /const SFX = \(\(\) => \{[\s\S]*?\n  return /],
    ['FX', /const FX = /],
    ['GFX', /const GFX = /],
  ];
  for (const [name, re] of MODS) {
    const seg = objAfter(html, re);
    t.ok(!!seg, `${name}: 모듈 객체를 찾았다`);
    if (!seg) continue;
    const keys = keysOf(html, name, seg);
    const used = new Set([...code.matchAll(new RegExp('\\b' + name + '\\.([A-Za-z_$][\\w$]*)', 'g'))].map(m => m[1]));
    const missing = [...used].filter(k => !keys.has(k));
    t.ok(missing.length === 0,
         `${name}: 부르는 이름 ${used.size}종이 모두 정의돼 있다${missing.length ? ' — 없는 이름: ' + missing.join(', ') : ''}`);
  }

  // 폴백으로 가려진 호출(A || B)도 잡는다 — 앞쪽 이름이 없으면 영영 뒤쪽만 불린다
  const guarded = [...code.matchAll(/\(\s*(SFX|FX|GFX)\.([A-Za-z_$][\w$]*)\s*\|\|/g)].map(m => `${m[1]}.${m[2]}`);
  const defined = { SFX: keysOf(html, 'SFX', objAfter(html, MODS[0][1])), FX: keysOf(html, 'FX', objAfter(html, MODS[1][1])), GFX: keysOf(html, 'GFX', objAfter(html, MODS[2][1])) };
  const hidden = guarded.filter(g => { const [m, k] = g.split('.'); return !defined[m].has(k); });
  t.ok(hidden.length === 0, `폴백에 가려진 없는 이름 0건${hidden.length ? ' — ' + hidden.join(', ') : ''}`);

  return t;
};
