// 카트 물리 — 아케이드식. 내 카트와 봇이 같은 함수를 쓴다.
import { N } from './trackmath.js';

export const MAXSPD = 31;            // m/s (계기판은 ×3.6 ×1.1)
const DRIFT_LV = [0.75, 1.6, 2.6];   // 미니터보 단계 도달 시간(초)
const DRIFT_BOOST = [0, 0.6, 1.0, 1.45];

export function makeKart(id, char, tr, s, lat) {
  const p = tr.point(s, lat);
  return {
    id, char, x: p.x, z: p.z, y: p.y, h: p.h, spd: 0,
    prog: s, li: ((Math.floor(s) % N) + N) % N, lat, lap: 0,
    drift: 0, driftT: 0, driftLv: 0, hop: 0, hopV: 0,
    boostT: 0, starT: 0, spinT: 0, spinDur: 1, dizzyT: 0, squash: 0,
    off: false, wallT: 0, bumpT: 0, steerVis: 0, yawVis: 0,
    item: null, itemN: 0, rollT: 0, finished: false, finT: 0, rank: 0,
    mul: 1, events: [],
  };
}

function statMax(c) { return MAXSPD * (0.93 + c.spd * 0.02); }
function statAcc(c) { return 13 + c.acc * 2.2; }
function statTurn(c) { return 1.75 + c.han * 0.13; }
// 핸들을 끝까지 꺾었을 때 초당 도는 각도 (봇이 커브를 미리 계산할 때 쓴다)
export function turnRate(k) {
  const sp = Math.abs(k.spd);
  return statTurn(k.char) * Math.min(1, sp / 9) * (1 - 0.22 * Math.min(1, sp / MAXSPD)) * (k.drift ? 1.28 : 1);
}

// input: { steer(-1 왼~+1 오른쪽), gas(0~1), brake, drift(누르고 있는지) }
export function stepKart(k, inp, tr, dt, loc) {
  const c = k.char;
  const ev = k.events;
  let max = statMax(c) * k.mul;
  const acc = statAcc(c);
  const turn = statTurn(c);
  const half = tr.half, lim = tr.half + tr.band - 1.0;

  const boosting = k.boostT > 0;
  if (k.off && !boosting && k.starT <= 0) max *= 0.55;
  if (boosting) max *= 1.36;
  if (k.starT > 0) max *= 1.16;

  let steer = inp.steer, gas = inp.gas;
  if (k.spinT > 0) { steer = 0; gas = 0; }

  // 가속·감속
  if (k.spinT > 0) {
    k.spd *= Math.max(0, 1 - 2.8 * dt);
  } else if (inp.brake) {
    k.spd -= (k.spd > 0 ? 34 : 9) * dt;
    if (k.spd < -9) k.spd = -9;
  } else if (k.spd < max * gas) {
    const room = 1 - Math.max(0, k.spd) / max;
    k.spd += acc * dt * (0.35 + 0.75 * room) * (boosting ? 2.5 : 1);
    if (k.spd > max * gas) k.spd = max * gas;
  } else {
    k.spd -= (k.spd > max ? (boosting ? 6 : 16) : 5) * dt;
  }
  // 언덕 — 오르막은 조금 느리게
  const sl = tr.slope[k.li] || 0;
  k.spd -= sl * 7 * dt;

  // 드리프트
  if (inp.drift && k.drift === 0 && Math.abs(steer) > 0.25 && k.spd > 11 && k.hop <= 0.01 && k.spinT <= 0) {
    k.drift = steer > 0 ? 1 : -1; k.driftT = 0; k.driftLv = 0; k.hopV = 4.2;
    ev.push('hop');
  }
  if (k.drift !== 0) {
    if (!inp.drift || k.spd < 8 || k.spinT > 0) {
      if (k.driftLv > 0 && k.spinT <= 0) { k.boostT = Math.max(k.boostT, DRIFT_BOOST[k.driftLv]); ev.push('miniturbo'); }
      k.drift = 0; k.driftT = 0; k.driftLv = 0;
    } else {
      const inward = steer * k.drift > 0 ? 1 : 0;
      k.driftT += dt * (0.7 + 0.6 * inward + 0.25 * Math.abs(steer));
      const lv = k.driftT > DRIFT_LV[2] ? 3 : k.driftT > DRIFT_LV[1] ? 2 : k.driftT > DRIFT_LV[0] ? 1 : 0;
      if (lv > k.driftLv) { k.driftLv = lv; ev.push('driftlv'); }
      steer = k.drift * 0.62 + steer * 0.48;
    }
  }

  // 조향 — 저속에서는 잘 안 돌고 고속에서 살짝 둔해짐
  const sp = Math.abs(k.spd);
  const tf = Math.min(1, sp / 9) * (1 - 0.22 * Math.min(1, sp / MAXSPD)) * (k.drift ? 1.28 : 1);
  k.h -= steer * turn * tf * dt * Math.sign(k.spd || 1);
  k.steerVis += (inp.steer - k.steerVis) * Math.min(1, dt * 10);
  const yawT = k.drift ? -k.drift * 0.42 : 0;
  k.yawVis += (yawT - k.yawVis) * Math.min(1, dt * 8);

  // 이동
  const fx = Math.sin(k.h), fz = Math.cos(k.h);
  k.x += fx * k.spd * dt; k.z += fz * k.spd * dt;

  // 트랙 위치 → 벽·노면·높이
  tr.locate(k.x, k.z, k.li, loc);
  if (Math.abs(loc.lat) > lim) {
    const push = Math.abs(loc.lat) - lim, sgn = Math.sign(loc.lat);
    k.x -= tr.rx[loc.i] * push * sgn; k.z -= tr.rz[loc.i] * push * sgn;
    // 벽에 박으면 트랙 방향 쪽으로 살짝 꺾고 감속
    const th = Math.atan2(tr.fx[loc.i], tr.fz[loc.i]);
    let d = th - k.h; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const into = Math.abs(d) < Math.PI / 2 ? Math.abs(Math.sin(d)) : 1;
    // 벽 쪽으로 가고 있을 때만 트랙 방향으로 틀어 준다(벽에서 빠져나가려는 핸들은 막지 않는다)
    const toward = (Math.sin(k.h) * tr.rx[loc.i] + Math.cos(k.h) * tr.rz[loc.i]) * sgn > 0;
    if (toward && Math.abs(d) < Math.PI / 2) k.h += d * Math.min(1, 6 * dt);
    if (k.wallT <= 0 && sp > 8) { ev.push('wall'); k.wallT = 0.35; k.spd *= 0.72 - into * 0.2; }
    loc.lat = lim * sgn;
  }
  if (k.wallT > 0) k.wallT -= dt;
  k.off = Math.abs(loc.lat) > half + 0.6;
  k.lat = loc.lat;

  // 진행도(바퀴 포함 연속값)
  let ds = loc.f - (((k.prog % N) + N) % N);
  if (ds > N / 2) ds -= N; if (ds < -N / 2) ds += N;
  k.prog += ds;
  k.li = loc.i;

  // 높이 + 점프
  k.hopV -= 22 * dt; k.hop += k.hopV * dt;
  if (k.hop < 0) { if (k.hopV < -3) k.squash = 0.18; k.hop = 0; k.hopV = 0; }
  k.y = loc.y + k.hop;
  k.squash *= Math.max(0, 1 - dt * 8);

  // 타이머
  if (k.boostT > 0) k.boostT -= dt;
  if (k.starT > 0) k.starT -= dt;
  if (k.spinT > 0) k.spinT -= dt;
  if (k.dizzyT > 0) k.dizzyT -= dt;
  if (k.bumpT > 0) k.bumpT -= dt;
}

export function spinOut(k, t = 1.3) {
  if (k.starT > 0) return false;
  k.spinT = t; k.spinDur = t; k.dizzyT = t + 0.7; k.drift = 0; k.driftLv = 0; k.boostT = 0; k.hopV = 6.5;
  k.events.push('spun');
  return true;
}

// 카트끼리 밀기 — 내가 조종하는 카트(a)만 움직인다. b는 원격이면 건드리지 않음
export function bump(a, b, moveB) {
  const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), R = 1.9;
  if (d >= R || d < 1e-4 || Math.abs(a.y - b.y) > 2) return false;
  const wa = a.char.wgt + (a.starT > 0 ? 20 : 0), wb = b.char.wgt + (b.starT > 0 ? 20 : 0);
  const over = R - d, nx = dx / d, nz = dz / d;
  const fa = moveB ? wb / (wa + wb) : Math.min(1, 2 * wb / (wa + wb));
  a.x += nx * over * fa; a.z += nz * over * fa;
  if (moveB) { b.x -= nx * over * (1 - fa); b.z -= nz * over * (1 - fa); }
  if (a.bumpT <= 0) { a.bumpT = 0.4; a.spd *= 0.93; a.events.push('bump'); }
  return true;
}
