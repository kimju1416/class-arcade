// 교사 TV 화면 회귀 — 25명 학급이 한 화면에 들어오는가.
//
// 이 스위트가 생긴 이유(2026-09-07, 봇 25명으로 전 게임 TV를 훑어 실측):
//  · 결과 화면: 세로로 쌓아 720p TV에서 순위판이 626px에서 시작 → 25명 중 두 명만 보였다.
//    공동우승이 많은 판은 우승자 이름 줄만 221px로 늘어 순위판이 아예 화면 밖(773px)이었다.
//  · 낱말·초성 5명, 같은 그림 6명까지만 보이고 나머지는 스크롤 안에 갇혔다(TV는 아무도 안 만진다).
//  · 블록배틀: tetFit의 후보 초기값이 6이라 «어떤 열 수로도 6px이 안 나오는» 인원에서
//    아무 후보도 채택되지 않아 cols=1로 남았다 — 25명 판이 세로로 쌓여 세 명만 보였다.
//
// 브라우저 없이 잡으려면 ① 순수 계산 함수는 소스에서 떼어 직접 돌리고
// ② 배치 규칙은 CSS에 그 규칙이 살아 있는지 확인한다. 정규식으로 읽는 값은 먼저 개수를 단언한다.
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

module.exports = async function run() {
  const t = H.makeT('교사 TV 화면');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  // ── ① 블록배틀 판 배치 — 인원이 늘어도 여러 열로 펼쳐지는가 ────────────
  const src = (html.match(/function tetFit\(n, compact\) \{[\s\S]*?\n\}/) || [])[0];
  t.ok(!!src, '블록배틀: tetFit을 소스에서 읽었다');
  const cwch = html.match(/const TET_C_W = (\d+), TET_C_H = (\d+)/) || [];
  const cw = +cwch[1], ch = +cwch[2];
  t.ok(cw > 0 && ch > 0, `블록배틀: 보드 칸 수를 읽었다 (${cw}x${ch})`);
  if (src && cw && ch) {
    const fit = new Function('TET_C_W', 'TET_C_H', 'window',
      `${src} return tetFit;`)(cw, ch, { innerWidth: 1280, innerHeight: 720 });
    // compact 두 경우를 모두 본다 — 여백이 넉넉한 쪽(compact=false)에서 칸이 작아져
    // «후보 초기값 이하»로 떨어지는 게 원래 버그였다. 한쪽만 재면 조용히 통과한다.
    for (const n of [6, 12, 20, 25, 30, 40]) {
      for (const compact of [false, true]) {
        const r = fit(n, compact);
        const rows = Math.ceil(n / r.cols);
        t.ok(r.cols > 1 || n === 1,
          `블록배틀 ${n}명(${compact ? '조밀' : '기본'}): ${r.cols}열 ${rows}행 (칸 ${r.mini}px) — 한 줄로 쌓이지 않는다`);
      }
    }
    // 좁은 TV(1366x768 창모드 등)에서도 마찬가지여야 한다
    const fitSmall = new Function('TET_C_W', 'TET_C_H', 'window',
      `${src} return tetFit;`)(cw, ch, { innerWidth: 1024, innerHeight: 600 });
    for (const n of [25, 40]) {
      const r = fitSmall(n, true);
      t.ok(r.cols > 1, `블록배틀 ${n}명(1024x600): ${r.cols}열 — 좁은 화면에서도 펼쳐진다`);
    }
    // 25명이 720p에서 실제로 화면 안에 들어가는지 (라벨 26px + gap 7 기준, compact)
    const r25 = fit(25, true);
    const rows25 = Math.ceil(25 / r25.cols);
    const need = rows25 * (r25.mini * ch + 26) + (rows25 - 1) * 7;
    t.ok(need <= 720 - 96, `블록배틀 25명: 세로 ${need}px로 720p 안에 들어간다 (여유 ${720 - 96 - need}px)`);
  }

  // ── ② 결과 화면 — 25명이 스크롤 없이 보이는 배치인가 ──────────────────
  t.ok(/body\.host #resultHost \{\s*display: grid/.test(html),
    '결과: TV에서는 좌우 2단 배치다 (세로로 쌓으면 순위판이 화면 밖으로 나간다)');
  t.ok(/\$\('resultHost'\)\.style\.display = innerWidth >= 900 \? 'grid' : 'flex'/.test(html),
    '결과: display를 JS가 정한다 (인라인 style이 CSS를 이기므로)');
  t.ok(/body\.host #resultHost \.rank-list[\s\S]{0,200}grid-template-columns: repeat\(auto-fill, minmax\((\d+)px/.test(html),
    '결과: 순위판이 여러 열로 펼쳐진다');
  t.ok(/champNames\.length <= 3[\s\S]{0,160}외 '/.test(html) || /외 ' \+ \(champNames\.length - 2\)/.test(html),
    '결과: 공동우승이 많으면 이름을 줄인다 (25명 동점이면 이 줄만 221px로 늘어난다)');
  t.ok(/body\.host #resultHost \.result-cols \{ display: contents/.test(html),
    "결과: '오늘의 챔피언'이 순위판 옆을 차지하지 않는다");

  // ── ③ 명단이 여러 열로 — 낱말·초성·같은 그림 ──────────────────────────
  t.ok(/body\.host \.word-list \{[\s\S]{0,220}grid-template-columns: repeat\(auto-fill/.test(html),
    '낱말·초성·퀴즈 명단이 여러 열로 펼쳐진다');
  t.ok(/\$\('wordList'\)\.style\.display = isHost \? \(innerWidth >= 900 \? 'grid' : 'flex'\)/.test(html),
    '낱말 명단도 display를 JS가 정한다 (인라인이 CSS를 이긴다)');
  t.ok(/body\.host #pairsBoard \{[\s\S]{0,220}grid-template-columns: repeat\(auto-fill/.test(html),
    '같은 그림 진행판이 여러 열로 펼쳐진다');

  // ── ④ 중단 버튼이 어느 게임에서나 같은 자리인가 ───────────────────────
  const abortRule = (html.match(/#btnWordAbort, #btnQuizAbort[^{]*\{[^}]*\}/) || [])[0] || '';
  for (const id of ['btnSimonAbort', 'btnPairsAbort', 'btnTetAbort', 'btnDrawAbort']) {
    t.ok(abortRule.includes('#' + id), `중단 버튼 ${id}가 오른쪽 위 고정 규칙에 들어 있다`);
  }
  t.ok(/position: fixed; top: 14px; right: 14px/.test(abortRule), '중단 버튼 자리는 오른쪽 위 고정이다');

  // ── ⑤ 꼬리별 TV에 정보가 있는가 ───────────────────────────────────────
  // 전용 렌더러는 draw()의 공통 HUD 설정 앞에서 return하므로 스스로 채워야 한다.
  const cometFn = (html.match(/function drawCometGame\([\s\S]*?\n\}/) || [])[0] || '';
  t.ok(cometFn.length > 500, '꼬리별: drawCometGame을 읽었다');
  t.ok(/setText\(\$\('hudLeft'\)/.test(cometFn),
    '꼬리별: TV 왼쪽 위 정보를 스스로 채운다 (없으면 방 코드 말고 아무 정보가 없다)');

  // ── ⑥ 이모지 반응이 버튼·방 코드를 덮지 않는가 ────────────────────────
  const reactZ = +(html.match(/#reactLayer \{[^}]*z-index: (\d+)/) || [])[1];
  const actZ = +(html.match(/body\.host \.result-actions \{[^}]*z-index: (\d+)/) || [])[1];
  const codeZ = +(html.match(/body\.host \.code-card \{[^}]*z-index: (\d+)/) || [])[1];
  t.ok(reactZ > 0, `이모지 반응 층을 읽었다 (z-index ${reactZ})`);
  t.ok(actZ > reactZ, `결과 화면 버튼이 이모지 위에 있다 (${actZ} > ${reactZ})`);
  t.ok(codeZ > reactZ, `로비 방 코드가 이모지 위에 있다 (${codeZ} > ${reactZ}) — 코드를 못 읽으면 입장을 못 한다`);

  // ── ⑦ 무궁화꽃: 전원 탈락이어도 등수가 갈리는가 ───────────────────────
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const frz = (server.match(/if \(room\.gameType === 'freeze'\) \{[\s\S]*?\n  \}/) || [])[0] || '';
  t.ok(frz.includes('frzReach'), '무궁화꽃: 탈락자는 걸리기 전까지 간 거리로 가른다');
  t.ok(/p => String\(score\(p\)\)/.test(frz),
    '무궁화꽃: 등수 키도 같은 값을 쓴다 (예전엔 탈락자를 전부 0으로 묶어 «전원 공동 1위»가 나왔다)');

  return t;
};
