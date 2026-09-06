// 학생 폰 화면 회귀 — «보이지도 눌리지도 않는 자리»를 만들지 않았는지.
//
// 이 스위트가 생긴 이유(2026-09-06 실측):
//  ① 폰 아래 정보 바(#phInfo)를 넣은 뒤, 같은 그림 찾기의 카드 마지막 줄이 360x640 화면에서
//     46% 먹혀 «그림이 안 나온다»가 됐다. 카드 폭만 제한하고 세로를 안 봤던 탓이다.
//  ② 같은 바가 조이스틱 게임의 액션 버튼(#btnAction) 위를 덮어 버튼이 안 보였다.
//  ③ 조이스틱 지연: 서버 이동 속도와 클라 예측 속도가 어긋나면 내 캐릭터가 벽에서 떨거나
//     서버 좌표로 툭 끌려간다. 눈으로는 «가끔 이상함»으로만 보여서 아무도 못 잡는다.
//
// 셋 다 브라우저 없이 잡으려면 «소스에 적힌 숫자»끼리 대조해야 한다. 그래서 이 검사는
// 정규식으로 값을 뽑는데, 그 방식의 함정(패턴이 안 맞으면 조용히 0건 통과)을 피하려고
// 뽑은 개수를 먼저 단언하고, 하나라도 못 뽑으면 실패로 만든다.
const fs = require('fs');
const path = require('path');
const H = require('./helpers');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const num = (src, re, what, out) => {
  const m = src.match(re);
  if (!m) { out.push(what); return null; }
  return parseFloat(m[1]);
};

module.exports = async function run() {
  const t = H.makeT('폰 화면·예측');
  const html = read(path.join('public', 'index.html'));
  const server = read('server.js');
  const party = read('party-games.js');
  const miss = [];

  // ── ① 예측 파라미터가 서버 이동 코드와 같은 값인가 ────────────────────
  const predBlock = (html.match(/const PRED_GAMES = \{([\s\S]*?)\n\};/) || [])[1];
  t.ok(!!predBlock, '클라 PRED_GAMES 표를 찾았다');
  const pred = {};
  if (predBlock) {
    for (const m of predBlock.matchAll(/^\s*(\w+):\s*\{([^}]*)\}/gm)) {
      const body = m[2];
      const pick = k => { const v = body.match(new RegExp(k + ':\\s*(\\d+)')); return v ? +v[1] : null; };
      pred[m[1]] = { spd: pick('spd'), r: pick('r'), maxY: pick('maxY') };
    }
  }
  t.ok(Object.keys(pred).length >= 8, `예측 켜진 게임 ${Object.keys(pred).length}종을 읽었다 (최소 8종)`);

  // 서버가 실제로 쓰는 값
  const SPEED = num(server, /^const SPEED = (\d+);/m, 'server SPEED', miss);
  const PLAYER_R = num(server, /^const PLAYER_R = (\d+);/m, 'server PLAYER_R', miss);
  const GALA_R = num(server, /^const GALA_SHIP_R = (\d+);/m, 'server GALA_SHIP_R', miss);
  // 파티 게임(운동장)은 별도 move() — 속도는 호출부에, 클램프 반경은 move() 안에 있다
  const paintSpd = num(party, /function paintTick[\s\S]*?move\(p, dt, (\d+),/, 'paintTick 속도', miss);
  const freezeSpd = num(party, /function freezeTick[\s\S]*?move\(p, dt, (\d+),/, 'freezeTick 속도', miss);
  const partyR = num(party, /function move\([\s\S]*?clamp\(p\.x \+ dx \* speed \* dt, (\d+),/, 'party move 클램프 반경', miss);
  const freezeMaxY = num(party, /function freezeTick[\s\S]*?p\.y = Math\.min\((\d+), p\.y\)/, 'freeze 세로 상한', miss);
  t.ok(miss.length === 0, `서버 쪽 기준값을 모두 읽었다${miss.length ? ' — 못 읽음: ' + miss.join(', ') : ''}`);

  const want = {
    bomb:   { spd: SPEED, r: PLAYER_R },
    tag:    { spd: SPEED, r: PLAYER_R },
    coin:   { spd: SPEED, r: PLAYER_R },
    dodge:  { spd: SPEED, r: PLAYER_R },
    ox:     { spd: SPEED, r: PLAYER_R },
    gala:   { spd: SPEED, r: GALA_R },
    paint:  { spd: paintSpd, r: partyR },
    freeze: { spd: freezeSpd, r: partyR, maxY: freezeMaxY },
  };
  for (const [key, w] of Object.entries(want)) {
    const p = pred[key];
    if (!p) { t.ok(false, `${key}: 예측 표에 없다 (서버는 조이스틱 방향×고정속도로 움직인다)`); continue; }
    t.eq(p.spd, w.spd, `${key} 예측 속도가 서버와 같다`);
    t.eq(p.r, w.r, `${key} 예측 클램프 반경이 서버와 같다`);
    if (w.maxY != null) t.eq(p.maxY, w.maxY, `${key} 예측 세로 상한이 서버와 같다`);
  }

  // 예측을 켠 게임은 반드시 «조이스틱으로 움직이는 게임» 목록 안에 있어야 한다
  const movesBlock = (html.match(/function inputMoves\(\) \{([\s\S]*?)\n\}/) || [])[1] || '';
  const moveGames = new Set([...movesBlock.matchAll(/gameType === '(\w+)'/g)].map(m => m[1]));
  t.ok(moveGames.size >= 12, `조이스틱 게임 ${moveGames.size}종을 읽었다`);
  const notMoving = Object.keys(pred).filter(k => !moveGames.has(k));
  t.ok(notMoving.length === 0, `예측 대상이 전부 조이스틱 게임이다${notMoving.length ? ' — 아닌 것: ' + notMoving.join(', ') : ''}`);

  // ── ② 정보 바가 액션 버튼을 덮지 않는가 ──────────────────────────────
  // 버튼은 오른쪽 아래 고정이다. 바가 화면 폭을 다 쓰면 그 위를 덮는다
  // (pointer-events:none이라 눌리기는 하지만, 안 보이는 건 마찬가지다).
  const btnRight = num(html, /#btnAction \{[\s\S]*?right: (\d+)px/, '#btnAction right', miss);
  const btnW = num(html, /#btnAction \{[\s\S]*?width: (\d+)px/, '#btnAction width', miss);
  const barRight = num(html, /\.hasbtn #phInfo \{ right: (\d+)px/, '정보 바 회피 폭', miss);
  if (btnRight != null && btnW != null && barRight != null) {
    t.ok(barRight >= btnRight + btnW,
      `정보 바가 액션 버튼을 비켜 간다 (바 오른쪽 여백 ${barRight}px ≥ 버튼이 먹는 ${btnRight + btnW}px)`);
  } else {
    t.ok(false, `버튼·정보 바 좌표를 읽지 못했다 — ${miss.join(', ')}`);
  }
  // 음소거 버튼도 오른쪽 아래 고정이라 액션 버튼 모서리를 덮고 있었다(실측 40x32px).
  // z-index가 60 대 6이라 «점프를 누르려다 소리가 꺼지는» 자리였다 — 버튼이 뜨는 판에서는 위로 보낸다.
  t.ok(/body\.joined\.hasbtn:not\(\.host\) #btnMute \{[^}]*bottom: auto/.test(html),
    '액션 버튼이 있는 판에서는 음소거 버튼이 아래쪽 자리를 비운다');
  const muteBottom = num(html, /#btnMute \{[\s\S]*?bottom: (\d+)px/, '#btnMute bottom', miss);
  const muteSize = num(html, /body\.joined #btnMute \{[^}]*width: (\d+)px/, '#btnMute 학생 크기', miss);
  if (muteBottom != null && muteSize != null && btnRight != null && btnW != null) {
    // 기본 자리(오른쪽 아래)는 액션 버튼과 겹친다 — 그래서 위 규칙이 반드시 있어야 한다는 근거
    t.ok(muteBottom < btnRight + btnW && muteBottom < 30 + 116,
      `기본 음소거 자리는 액션 버튼과 겹치는 위치다 (bottom ${muteBottom}px) — 위 회피 규칙이 필요한 이유`);
  }

  // 버튼이 뜨는 게임 목록과 «바를 비키게 하는» 판단이 같은 출처를 봐야 어긋나지 않는다
  const btnGames = (html.match(/const ACTION_BTN_GAMES = \{([^}]*)\}/) || [])[1] || '';
  const btnKeys = [...btnGames.matchAll(/(\w+):\s*1/g)].map(m => m[1]);
  t.ok(btnKeys.length >= 10, `액션 버튼 게임 ${btnKeys.length}종을 읽었다`);
  t.ok(/document\.body\.classList\.toggle\('hasbtn', hasActionBtn\(gameType\)\)/.test(html),
    '게임이 바뀔 때마다 hasbtn 상태를 다시 정한다 (DOM 게임으로 넘어가도 꺼진다)');

  // ── ③ 같은 그림 찾기 카드가 작은 폰에서 잘리지 않는가 ────────────────
  // 카드는 4열 5행, 비율 3:4, 간격 gap. 그리드 폭 W에서 5행 높이는
  //   카드폭 c = (W - 3·gap)/4,  카드높이 = c·4/3,  총 = 5·c·4/3 + 4·gap
  // 이 총 높이가 «화면 − (위 UI + 아래 점수줄 + 정보 바)»에 들어가야 한다.
  // 위/아래 상수는 실측값이다(2026-09-06, 크롬 모바일 에뮬레이션).
  const gap = num(html, /\.pairs-grid \{[\s\S]*?gap: (\d+)px/, 'pairs gap', miss);
  const capExpr = html.match(/@supports \(height: 100dvh\)[\s\S]*?max-width: min\(88vw, 400px, calc\(\(100dvh - (\d+)px\) \* ([\d.]+) \+ (\d+)px\)\)/);
  t.ok(!!capExpr, '카드 그리드에 세로 기준 상한이 걸려 있다 (폭만 제한하면 마지막 줄이 먹힌다)');
  if (capExpr && gap != null) {
    const [sub, mul, add] = [parseFloat(capExpr[1]), parseFloat(capExpr[2]), parseFloat(capExpr[3])];
    const GRID_TOP = 67;    // 제목 + 타이머 바 + 위 여백 (실측)
    const SCORE_ROW = 38;   // 그리드 아래 «N/10쌍 · 시도 N회» 줄 + 간격 (실측)
    const BAR = 107;        // 정보 바 높이 97 + 아래 여백 10 (실측)
    for (const vh of [640, 667, 736, 812, 896]) {
      const W = Math.min(0.88 * 375, 400, (vh - sub) * mul + add);
      const c = (W - 3 * gap) / 4;
      const gridH = 5 * c * 4 / 3 + 4 * gap;
      const bottom = GRID_TOP + gridH + SCORE_ROW;
      t.ok(bottom <= vh - BAR,
        `세로 ${vh}px 폰: 카드 5줄 + 점수줄이 정보 바 위에서 끝난다 (${bottom.toFixed(0)}px ≤ ${vh - BAR}px)`);
    }
    // 큰 폰에서는 예전 크기(88vw)를 그대로 써야 한다 — 세로 제한이 과하면 카드가 쓸데없이 작아진다
    const bigW = Math.min(0.88 * 375, 400, (812 - sub) * mul + add);
    t.ok(Math.abs(bigW - 0.88 * 375) < 0.5, `큰 폰(812px)에서는 카드가 예전 크기 그대로다 (${bigW.toFixed(0)}px)`);
  }
  // dvh를 모르는 구형 브라우저용 대비책도 남아 있어야 한다
  t.ok(/\.pairs-grid \{ max-width: min\(88vw, 400px, calc\(\(100vh - \d+px\)/.test(html),
    'dvh 미지원 브라우저용 vh 대비책이 있다');
  // 세로 제한은 «세로로 든 폰»에서만 걸어야 한다 — 가로(812x375)에 같은 식을 걸면
  // 카드가 18x24px까지 줄어 이모지를 못 알아본다(실측).
  t.ok(/@media \(orientation: portrait\)\s*\{[\s\S]{0,600}?\.pairs-grid \{ max-width: min\(88vw, 400px, calc\(/.test(html),
    '세로 제한을 세로 화면에서만 건다 (가로로 돌리면 카드가 18px까지 줄었다)');
  const baseW = (html.match(/\.pairs-grid \{\s*\n\s*display: grid;[\s\S]*?max-width: (min\(88vw, 400px\));/) || [])[1];
  t.eq(baseW, 'min(88vw, 400px)', '가로 화면에서는 예전 카드 크기 규칙을 그대로 쓴다');

  return t;
};
