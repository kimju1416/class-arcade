// ============================================================
// 꼬리별 (comet) — 먹고 자라서 잡아먹는 실시간 뱀 서바이벌
// 규칙: 먹이를 먹어 몸집을 키운다. 내 머리가 남의 몸에 닿았을 때
//       내가 1.25배 이상 크면 잡아먹는다. 크기 차이가 안 나면 그냥 지나간다.
//       큰 뱀은 느리고 둔하다 → 작은 뱀은 도망칠 수 있고, 큰 뱀은 부스터로 쫓아야 한다.
//       부스터는 자기 몸을 태우므로 사냥에 실패할수록 작아진다(눈덩이 방지).
//       잡아먹혀도 탈락 없음 — 3초 뒤 "살아있는 사람들 몸집의 40%"로 부활한다.
//       점수는 "가장 크게 자랐던 몸집" — 마지막에 먹혀도 기록은 남는다.
//
// 이 파일은 server.js에서 require해서 쓴다. 라이브 서비스라 기존 게임과
// 최대한 격리하려고 별도 모듈로 뺐다.
// ============================================================
'use strict';

// ---------- 상수 ----------
const ROUND_MS = 180000;      // 한 판 3분
const START_MASS = 20;
const MASS_CAP = 4000;
const EAT_RATIO = 1.25;       // 이 배율 이상 커야 잡아먹는다
const ABSORB = 0.6;           // 잡아먹으면 상대 몸집의 60%를 흡수(나머지는 먹이로 흩어짐)
const RESPAWN_MS = 3000;
const RESPAWN_SHARE = 0.4;    // 부활 크기 = 살아있는 사람들 몸집 중앙값의 40%
const BOOST_MIN = 14;         // 이보다 작으면 부스터 못 씀
const BOOST_MULT = 1.55;
const BOOST_BURN = 7.0;       // 초당 태우는 질량
const BOOST_DROP_EVERY = 0.14;// 펠릿 떨어뜨리는 간격(초)
const SPD_MAX = 250;          // 가장 작을 때 속도
const SPD_MIN = 155;          // 가장 클 때 속도
const SPD_REF = 500;          // 이 질량쯤에서 최저 속도에 수렴
const PT_SPACING = 8;         // 경로 점 간격
const BODY_GRID = 90;         // 충돌 격자 셀 크기
const FOOD_BASE = 40, FOOD_PER = 14;
const INV_MS = 1500;          // 부활 직후 무적(스폰킬 방지)

// ---------- 성장 곡선 ----------
// 크면 느리다 — 이 게임의 핵심 균형추. 이게 없으면 1등이 눈덩이처럼 커져 반 전체를 사냥한다.
function speedOf(m) {
  return SPD_MAX - (SPD_MAX - SPD_MIN) * Math.min(1, Math.sqrt(Math.max(0, m) / SPD_REF));
}
function turnOf(m) { return Math.max(2.2, 4.8 - Math.sqrt(Math.max(0, m)) * 0.075); } // rad/s
function girthOf(m) { return Math.min(38, 11 + Math.sqrt(Math.max(0, m)) * 0.95); }
function bodyLenOf(m) { return Math.min(2200, 90 + Math.max(0, m) * 3.2); }

function finite(v, def) { v = Number(v); return Number.isFinite(v) ? v : def; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function dist2(x1, y1, x2, y2) { const dx = x1 - x2, dy = y1 - y2; return dx * dx + dy * dy; }
function normAng(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// ---------- 시작 ----------
function start(room, opt) {
  const g = room.game;
  const actives = [...room.players.values()].filter(p => !p.waiting);
  const n = Math.max(1, actives.length);

  g.roundMs = ROUND_MS;
  // 인원이 많을수록 넓게 — 좁으면 큰 뱀이 구석을 막아 도망칠 데가 없다
  g.arenaW = Math.round(Math.max(1200, Math.min(3000, 1150 + n * 62)));
  g.arenaH = Math.round(g.arenaW * 0.68);

  g.foods = new Map();
  g.fNextId = 1;
  g.fAdd = []; g.fDel = [];      // 이번 틱 델타(스냅샷에 실어 보냄)
  g.cBooms = [];                 // 잡아먹힘 연출
  g.cFeed = [];                  // 킬 피드 [먹은사람, 먹힌사람]
  g.foodTarget = FOOD_BASE + n * FOOD_PER;

  actives.forEach((p, i) => {
    // 서로 충분히 떨어뜨려 배치 (시작하자마자 잡아먹히지 않게)
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cx = (i % cols + 0.5) / cols, cy = (Math.floor(i / cols) + 0.5) / rows;
    p.x = g.arenaW * (0.12 + cx * 0.76) + rnd(-30, 30);
    p.y = g.arenaH * (0.12 + cy * 0.76) + rnd(-30, 30);
    resetSnake(p, START_MASS, Date.now());
    p.cMax = START_MASS;         // 최고 몸집(=점수)
    p.cEats = 0;                 // 잡아먹은 수
    p.cDeaths = 0;
    p.alive = true;              // 이 게임은 탈락이 없다
  });

  topUpFood(g, g.foodTarget);
  g.fAdd = [];                   // 시작분은 phase 메시지로 통째 나가므로 델타에서 뺀다
}

function resetSnake(p, mass, now) {
  p.cMass = mass;
  // 부활 크기가 지금까지의 최고 기록보다 클 수 있다(후반 부활 보정).
  // 안 맞춰 주면 화면에 "현재 240 / 최고 20"처럼 말이 안 되는 값이 뜬다.
  if (!(p.cMax >= mass)) p.cMax = mass;
  p.cAng = Math.random() * Math.PI * 2;
  p.cPts = [{ x: p.x, y: p.y }];
  p.cBoost = false;
  p.cBurn = 0;
  p.cDownUntil = 0;
  p.cInvUntil = now + INV_MS;
  p.cEatFx = 0;
}

// ---------- 먹이 ----------
function addFood(g, x, y, v, h) {
  const id = g.fNextId++;
  const f = { id, x: Math.round(x), y: Math.round(y), v, h: h | 0 };
  g.foods.set(id, f);
  g.fAdd.push([f.id, f.x, f.y, Math.round(v * 10) / 10, f.h]);
  return f;
}
function delFood(g, f) { g.foods.delete(f.id); g.fDel.push(f.id); }
function topUpFood(g, limit) {
  let guard = limit === undefined ? 6 : limit;
  while (g.foods.size < g.foodTarget && guard-- > 0) {
    addFood(g, rnd(30, g.arenaW - 30), rnd(30, g.arenaH - 30),
      Math.random() < 0.85 ? 1 : 3, (Math.random() * 360) | 0);
  }
}
// 죽은 몸을 따라 먹이를 흩뿌린다
function scatter(g, p, amount) {
  const count = Math.max(3, Math.min(70, Math.round(amount / 2.5)));
  if (count <= 0) return;
  const v = Math.max(1, amount / count);
  const pts = p.cPts;
  const step = Math.max(1, Math.floor(pts.length / count));
  let made = 0;
  for (let i = pts.length - 1; i >= 0 && made < count; i -= step) {
    const x = Math.max(12, Math.min(g.arenaW - 12, pts[i].x + rnd(-14, 14)));
    const y = Math.max(12, Math.min(g.arenaH - 12, pts[i].y + rnd(-14, 14)));
    addFood(g, x, y, Math.round(v * 10) / 10, ((p.ci || 0) * 37) % 360);
    made++;
  }
}

// ---------- 충돌 격자 ----------
function buildGrid(room, now) {
  const grid = new Map();
  for (const p of room.players.values()) {
    if (p.waiting || now < p.cDownUntil || !p.cPts) continue;
    const need = Math.ceil(bodyLenOf(p.cMass) / PT_SPACING);
    const start = Math.max(0, p.cPts.length - need);
    for (let i = p.cPts.length - 1; i >= start; i--) {
      const q = p.cPts[i];
      const k = Math.floor(q.x / BODY_GRID) + ',' + Math.floor(q.y / BODY_GRID);
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push({ x: q.x, y: q.y, p });
    }
  }
  return grid;
}

// ---------- 틱 ----------
function tick(room, now, dt) {
  const g = room.game;
  if (!g.foods) return;

  // 1) 이동
  for (const p of room.players.values()) {
    if (p.waiting) continue;
    if (now < p.cDownUntil) continue;           // 부활 대기 중
    // 조이스틱 방향 → 목표 각도. 손을 떼면 가던 방향 유지(뱀은 늘 전진한다)
    const dx = finite(p.dirX, 0), dy = finite(p.dirY, 0);
    if (dx || dy) {
      const tgt = Math.atan2(dy, dx);
      const da = normAng(tgt - p.cAng);
      const tr = turnOf(p.cMass) * dt;
      p.cAng = normAng(Math.abs(da) <= tr ? tgt : p.cAng + Math.sign(da) * tr);
    }
    // 부스터: 몸을 태워 가속하고 태운 만큼 펠릿을 흘린다
    const boosting = p.cBoost && p.cMass > BOOST_MIN;
    const sp = speedOf(p.cMass) * (boosting ? BOOST_MULT : 1);
    if (boosting) {
      p.cMass = Math.max(BOOST_MIN, p.cMass - BOOST_BURN * dt);
      p.cBurn += dt;
      while (p.cBurn >= BOOST_DROP_EVERY) {
        p.cBurn -= BOOST_DROP_EVERY;
        const tail = p.cPts[Math.max(0, p.cPts.length - Math.ceil(bodyLenOf(p.cMass) / PT_SPACING))] || p.cPts[0];
        if (tail) addFood(g, Math.max(10, Math.min(g.arenaW - 10, tail.x + rnd(-8, 8))),
          Math.max(10, Math.min(g.arenaH - 10, tail.y + rnd(-8, 8))), 1, ((p.ci || 0) * 37) % 360);
      }
      if (p.cMass <= BOOST_MIN) p.cBoost = false;
    } else p.cBurn = 0;

    const r = girthOf(p.cMass) * 0.5;
    let nx = p.x + Math.cos(p.cAng) * sp * dt;
    let ny = p.y + Math.sin(p.cAng) * sp * dt;
    // 벽은 죽이지 않고 막는다 — 사고사보다 "쫓고 쫓기는" 재미가 중요하다
    if (nx < r) { nx = r; } else if (nx > g.arenaW - r) { nx = g.arenaW - r; }
    if (ny < r) { ny = r; } else if (ny > g.arenaH - r) { ny = g.arenaH - r; }
    p.x = nx; p.y = ny;

    // 경로 적재
    const lp = p.cPts[p.cPts.length - 1];
    if (!lp || dist2(p.x, p.y, lp.x, lp.y) >= PT_SPACING * PT_SPACING) {
      p.cPts.push({ x: p.x, y: p.y });
      const cap = Math.ceil(bodyLenOf(p.cMass) / PT_SPACING) + 8;
      if (p.cPts.length > cap) p.cPts.splice(0, p.cPts.length - cap);
    }
  }

  // 2) 먹이 섭취
  for (const p of room.players.values()) {
    if (p.waiting || now < p.cDownUntil) continue;
    const R = girthOf(p.cMass) * 0.6 + 16;
    const R2 = R * R;
    for (const f of g.foods.values()) {
      if (dist2(p.x, p.y, f.x, f.y) < R2) {
        delFood(g, f);
        p.cMass = Math.min(MASS_CAP, p.cMass + f.v);
        if (p.cMass > p.cMax) p.cMax = p.cMass;
      }
    }
  }

  // 3) 잡아먹기 — 내 머리가 남의 몸에 닿고, 내가 1.25배 이상 크면 먹는다
  const grid = buildGrid(room, now);
  const eaten = [];
  for (const p of room.players.values()) {
    if (p.waiting || now < p.cDownUntil) continue;
    const R = girthOf(p.cMass) * 0.5 + 10;
    const R2 = R * R;
    const c0x = Math.floor((p.x - R) / BODY_GRID), c1x = Math.floor((p.x + R) / BODY_GRID);
    const c0y = Math.floor((p.y - R) / BODY_GRID), c1y = Math.floor((p.y + R) / BODY_GRID);
    let victim = null;
    for (let cx = c0x; cx <= c1x && !victim; cx++) for (let cy = c0y; cy <= c1y && !victim; cy++) {
      const arr = grid.get(cx + ',' + cy);
      if (!arr) continue;
      for (const q of arr) {
        if (q.p === p) continue;
        if (now < q.p.cInvUntil) continue;                  // 부활 직후 무적
        if (p.cMass < q.p.cMass * EAT_RATIO) continue;      // 충분히 크지 않으면 그냥 지나간다
        if (dist2(p.x, p.y, q.x, q.y) < R2) { victim = q.p; break; }
      }
    }
    if (victim) eaten.push([p, victim]);
  }
  // 같은 틱에 중복으로 먹히지 않게 한 번씩만 처리
  const done = new Set();
  for (const [hunter, prey] of eaten) {
    if (done.has(prey.id) || done.has(hunter.id)) continue;
    if (now < prey.cDownUntil) continue;
    done.add(prey.id);
    const gained = prey.cMass * ABSORB;
    hunter.cMass = Math.min(MASS_CAP, hunter.cMass + gained);
    if (hunter.cMass > hunter.cMax) hunter.cMax = hunter.cMass;
    hunter.cEats = (hunter.cEats || 0) + 1;
    hunter.cEatFx = now;
    scatter(g, prey, prey.cMass - gained);
    g.cBooms.push([Math.round(prey.x), Math.round(prey.y), Math.round(prey.cMass), (prey.ci || 0)]);
    g.cFeed.push([hunter.nick, prey.nick]);
    prey.cDeaths = (prey.cDeaths || 0) + 1;
    prey.cDownUntil = now + RESPAWN_MS;
    prey.cPts = [];
    prey.cBoost = false;
  }

  // 4) 부활 — 판이 무르익은 뒤에 먹혀도 따라잡을 여지를 남긴다
  for (const p of room.players.values()) {
    if (p.waiting || !p.cDownUntil || now < p.cDownUntil) continue;
    p.cDownUntil = 0;
    p.x = rnd(g.arenaW * 0.15, g.arenaW * 0.85);
    p.y = rnd(g.arenaH * 0.15, g.arenaH * 0.85);
    resetSnake(p, respawnMassOf(room, now), now);
  }

  topUpFood(g);
}

// 살아있는 사람들 몸집의 중앙값 × 40% (최소 시작 크기). 초반엔 사실상 최소 크기,
// 후반엔 어느 정도 몸집을 갖고 시작해 다시 싸울 수 있다.
function respawnMassOf(room, now) {
  const ms = [];
  for (const p of room.players.values()) {
    if (p.waiting || now < p.cDownUntil) continue;
    if (typeof p.cMass === 'number') ms.push(p.cMass);
  }
  if (!ms.length) return START_MASS;
  ms.sort((a, b) => a - b);
  const mid = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
  return Math.max(START_MASS, Math.round(mid * RESPAWN_SHARE));
}

// ---------- 스냅샷 ----------
// 몸통 경로는 보내지 않는다 — 클라가 머리 위치 기록으로 재구성한다(대역폭 절약).
function row(p, now) {
  const down = now < p.cDownUntil ? Math.ceil((p.cDownUntil - now) / 100) : 0;
  return [
    Math.round((p.cAng || 0) * 180 / Math.PI),
    Math.round((p.cMass || 0) * 10) / 10,
    p.cBoost && p.cMass > BOOST_MIN ? 1 : 0,
    down,                                    // 부활까지 남은 0.1초 단위 (0이면 활동 중)
    now < (p.cInvUntil || 0) ? 1 : 0,
    now - (p.cEatFx || 0) < 500 ? 1 : 0,
    p.cEats || 0,
  ];
}
// 스냅샷에 실을 게임 공용 필드
function payload(g, full) {
  const out = {};
  if (full) {
    out.fall = [...g.foods.values()].map(f => [f.id, f.x, f.y, Math.round(f.v * 10) / 10, f.h]);
  } else {
    if (g.fAdd.length) out.fa = g.fAdd;
    if (g.fDel.length) out.fd = g.fDel;
  }
  if (g.cBooms.length) out.cbm = g.cBooms;
  if (g.cFeed.length) out.cfd = g.cFeed;
  return out;
}
function clearDeltas(g) { g.fAdd = []; g.fDel = []; g.cBooms = []; g.cFeed = []; }

// ---------- 종료 ----------
// 순위는 "가장 크게 자랐던 몸집" — 마지막에 먹혀도 그동안의 성과가 남는다
function sortForRank(players) {
  return players.filter(p => !p.waiting).sort((a, b) => {
    const d = (b.cMax || 0) - (a.cMax || 0);
    if (d) return d;
    return (b.cEats || 0) - (a.cEats || 0);
  });
}
function labelOf(p) {
  const m = Math.round(p.cMax || 0);
  return m + ' 크기' + (p.cEats ? ' · ' + p.cEats + '마리 꿀꺽' : '');
}
function keyOf(p) { return Math.round(p.cMax || 0) + '/' + (p.cEats || 0); }

module.exports = {
  ROUND_MS, START_MASS, EAT_RATIO, BOOST_MIN, RESPAWN_MS, MASS_CAP,
  speedOf, turnOf, girthOf, bodyLenOf, respawnMassOf,
  start, tick, row, payload, clearDeltas, sortForRank, labelOf, keyOf,
};
