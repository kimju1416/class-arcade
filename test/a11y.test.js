// 접근성 회귀 — 색만으로 정보를 전달하는 곳이 없는지.
// 적록색약은 남학생 약 8%라 한 반에 한두 명은 반드시 있다.
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

// 한글 입력(IME) 처리가 남아 있는지 — 아이폰에서 "글자가 겹치고 안 쳐진다"의 원인이었다
function imeChecks(t, html) {
  const inputs = ['wordInput', 'drawAnswerIn', 'drawGuessIn', 'inNick'];
  for (const id of inputs) {
    const re = new RegExp(`onEnter\\(\\$\\('${id}'\\)`);
    t.ok(re.test(html), `IME: ${id}의 엔터가 조합 확정용인지 가려낸다`);
  }
  t.ok(/function clearInput\(el\)[\s\S]{0,400}__composing[\s\S]{0,200}blur\(\)/.test(html),
       'IME: 입력창을 비울 때 조합 버퍼까지 지운다 (안 그러면 다음 글자가 겹친다)');
  t.ok(/isComposing\s*=\s*\(el, e\)[\s\S]{0,160}keyCode === 229/.test(html),
       'IME: keyCode 229(조합 중)도 조합으로 본다');
  t.ok(/function submitWord\(\)[\s\S]{0,400}__composing[\s\S]{0,120}blur\(\)/.test(html),
       'IME: 버튼 제출 때도 조합을 먼저 확정한다');
  // 조합을 안 보고 그냥 엔터를 받는 옛 패턴이 되살아나면 잡는다
  const bad = html.match(/addEventListener\('keydown', e => \{ if \(e\.key === 'Enter'\)/g) || [];
  t.ok(bad.length === 0, `IME: 조합을 안 보는 엔터 핸들러가 없다 (${bad.length}곳)`);
}

module.exports = async function run() {
  const t = H.makeT('접근성');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  // 사이먼 가라사대: 4색 패드는 색만으로 순서를 외우는 게임이라 도형이 반드시 필요하다
  const pads = [...html.matchAll(/<button class="simon-pad s(\d)[^"]*"[^>]*>(.*?)<\/button>/g)];
  t.ok(pads.length === 4, `사이먼 패드 4개 (${pads.length}개 발견)`);
  const padSymbols = pads.map(m => (m[2].match(/<span class="sy">(.+?)<\/span>/) || [])[1]);
  t.ok(padSymbols.every(Boolean), `사이먼 패드 전부 도형 표시 (${padSymbols.join(' ')})`);
  t.ok(new Set(padSymbols).size === 4, '사이먼 패드 도형이 서로 다름');

  // 퀴즈쇼·순간 포착: 4색 선택지에 도형
  const shapes = html.match(/const QUIZ_SHAPES = \[([^\]]+)\]/);
  t.ok(!!shapes, '퀴즈 선택지 도형 정의 존재');
  if (shapes) {
    const arr = [...shapes[1].matchAll(/'(.+?)'/g)].map(m => m[1]);
    t.ok(arr.length === 4 && new Set(arr).size === 4, `퀴즈 도형 4종 서로 다름 (${arr.join(' ')})`);
    t.ok(html.includes('class="shp"'), '퀴즈 선택지에 도형이 실제로 렌더됨');
  }

  // 캔버스 게임: 플레이어는 색 말고 이름표로도 구분된다
  t.ok(/ctx\.fillText\(name, px/.test(html), '캔버스 게임: 플레이어 이름표 표시(색 외 식별 수단)');

  // 순위·명단: 색 점 옆에 항상 이름이 온다 (점만 있는 곳이 없어야)
  const dotOnly = [...html.matchAll(/<span class="dot"[^>]*><\/span>\s*<\/div>/g)];
  t.ok(dotOnly.length === 0, `색 점만 있고 이름 없는 항목 0건 (${dotOnly.length}건)`);

  // 감염 술래잡기: 좀비는 색이 아니라 별도 스프라이트로 구분
  t.ok(html.includes('SPR.zombie'), '술래잡기: 좀비는 색이 아닌 다른 그림으로 구분');

  imeChecks(t, html);

  return t;
};
