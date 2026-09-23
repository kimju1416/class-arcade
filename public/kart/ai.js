// 봇 운전 — 앞쪽 트랙 점을 향해 핸들을 꺾고, 급커브에서는 드리프트로 미니터보까지 챙긴다
import { N } from './trackmath.js';
import { turnRate } from './physics.js';

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export function botInput(b, race, dt) {
  const k = b.k, tr = race.tr;
  const ai = b.ai || (b.ai = { line: (Math.random() * 2 - 1) * 0.4, t: Math.random() * 10, drifting: 0, dodge: 0, dodgeT: 0 });
  ai.t += dt;
  const look = 9 + Math.max(0, k.spd) * 0.5;
  const s = k.prog + look / tr.seg;
  const ci = ((Math.floor(s) % N) + N) % N;
  // 앞으로 25m 동안 얼마나 굽는지
  let bend = 0;
  for (let d = 0; d < 30; d += 3) { const i = ((Math.floor(k.prog + d / tr.seg) % N) + N) % N; bend += tr.curv[i]; }
  bend /= 10;
  let lat = (ai.line + Math.sin(ai.t * 0.33) * 0.22) * tr.half;
  const cv = tr.curv[ci];
  lat += -Math.sign(cv) * Math.min(1, Math.abs(cv) * 2.2) * tr.half * 0.3; // 코너 안쪽으로
  // 바나나·발사체 피하기
  if (ai.dodgeT > 0) ai.dodgeT -= dt;
  else {
    ai.dodge = 0;
    for (const h of race.hazards.values()) {
      if (h.k !== 'banana' || h.dead) continue;
      const ahead = (h.s - k.prog) * tr.seg;
      if (ahead > 4 && ahead < 28 && Math.abs(h.lat - k.lat) < 2.6) { ai.dodge = h.lat > k.lat ? -3.8 : 3.8; ai.dodgeT = 0.8; break; }
    }
  }
  lat += ai.dodge;
  // 아이템 상자가 가까우면 슬쩍 그쪽으로
  if (!k.item && k.rollT <= 0) {
    for (const bx of race.world.boxes) {
      const ahead = (((bx.s - (k.prog % N)) % N) + N) % N * tr.seg;
      if (ahead > 6 && ahead < 40 && bx.off <= 0) { lat += (bx.lat - lat) * 0.35; break; }
    }
  }
  const lim = tr.half - 1.4;
  lat = Math.max(-lim, Math.min(lim, lat));
  const p = tr.point(s, lat);
  const want = Math.atan2(p.x - k.x, p.z - k.z);
  const d = wrap(want - k.h);
  // 커브 곡률만큼 미리 꺾고(앞먹임), 남은 오차만 되먹임으로 잡는다
  const ahead = ((Math.floor(k.prog + Math.max(4, k.spd * 0.35) / tr.seg) % N) + N) % N;
  const yawRate = (tr.curv[ahead] / (20 * tr.seg)) * Math.max(0, k.spd);
  const tRate = Math.max(0.3, turnRate(k));
  let steer = Math.max(-1, Math.min(1, -yawRate / tRate - d * 3.2));

  // 드리프트: 급커브에서 커브 방향으로만 들어가고, 커브가 풀리거나 방향이 틀리면 뗀다
  const dDir = bend > 0 ? -1 : 1; // 왼쪽 커브면 -1
  let drift = false;
  const nearWall = Math.abs(k.lat) > tr.half + 0.5;
  if (ai.drifting && k.drift !== 0) {
    // 드리프트 중 실제 조향 = dir*0.62 + 입력*0.48 (도는 힘 1.28배) → 원하는 조향에서 입력을 거꾸로 구한다
    const eff = steer / 1.28;
    const inp = (eff - k.drift * 0.62) / 0.48;
    drift = Math.abs(bend) > 0.06 && k.spd > 10 && !nearWall && k.drift === dDir && Math.abs(inp) <= 1.15;
    if (drift) steer = Math.max(-1, Math.min(1, inp));
    else ai.drifting = 0;
  } else if (ai.drifting) {
    // 이번 걸음에 드리프트가 시작된다
    drift = Math.abs(bend) > 0.06 && !nearWall; steer = dDir;
    if (!drift) ai.drifting = 0;
  } else if (Math.abs(bend) > 0.12 && k.spd > 17 && b.skill > 0.9 && !nearWall && Math.abs(k.lat) < tr.half - 1 && steer * dDir > 0.3) {
    ai.drifting = 1; drift = true; steer = dDir;
  }
  const gas = Math.abs(bend) > 0.2 && k.spd > 25 && !drift ? 0.85 : 1;
  return { steer, gas, brake: false, drift };
}

// 봇 아이템 판단 — 쓸 때가 되면 true
export function botWantsItem(b, race) {
  const k = b.k, it = k.item;
  if (!it || k.rollT > 0) return false;
  const ai = b.ai || {}; ai.hold = (ai.hold || 0) + 1 / 60;
  const others = race.racers.filter(o => o !== b && !o.gone);
  const gapTo = (o) => (o.k.prog - k.prog) * race.tr.seg;
  if (it === 'boost' || it === 'boost3') return Math.abs(race.tr.curv[k.li]) < 0.08 && ai.hold > 0.6;
  if (it === 'star') return ai.hold > 0.5;
  if (it === 'mic') return others.some(o => Math.hypot(o.k.x - k.x, o.k.z - k.z) < 22) || ai.hold > 10;
  if (it === 'ball') return others.some(o => { const g = gapTo(o); return g > 5 && g < 45 && Math.abs(o.k.lat - k.lat) < 2.2; }) || ai.hold > 14;
  if (it === 'soccer') return others.some(o => { const g = gapTo(o); return g > 4 && g < 70; }) || ai.hold > 6;
  if (it === 'hball') return others.some(o => { const g = gapTo(o); return g > 3 && g < 120; }) || ai.hold > 6;
  if (it === 'banana') return others.some(o => { const g = gapTo(o); return g < -3 && g > -20; }) || ai.hold > 9;
  return ai.hold > 5;
}
