// 트랙 곡선 계산 — three.js 없이 순수 수학만 (노드 검사에서도 그대로 쓴다)
// 닫힌 centripetal Catmull-Rom 곡선을 길이 기준으로 N등분한 표본으로 바꿔 두고,
// 위치·진행도·옆 거리·높이는 모두 이 표본 위에서 찾는다.
export const N = 1600;

function cr(p0, p1, p2, p3, t) {
  // centripetal Catmull-Rom (alpha 0.5) — 뾰족한 고리 없이 매끄럽게
  const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1e-4, 0.5);
  const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const A1 = (t1 - tt) / (t1 - t0) * p0[k] + (tt - t0) / (t1 - t0) * p1[k];
    const A2 = (t2 - tt) / (t2 - t1) * p1[k] + (tt - t1) / (t2 - t1) * p2[k];
    const A3 = (t3 - tt) / (t3 - t2) * p2[k] + (tt - t2) / (t3 - t2) * p3[k];
    const B1 = (t2 - tt) / (t2 - t0) * A1 + (tt - t0) / (t2 - t0) * A2;
    const B2 = (t3 - tt) / (t3 - t1) * A2 + (tt - t1) / (t3 - t1) * A3;
    out[k] = (t2 - tt) / (t2 - t1) * B1 + (tt - t1) / (t2 - t1) * B2;
  }
  return out;
}

export function buildTrack(def) {
  const P = def.pts.map(([x, z, y]) => [x * def.scale, (y || 0) * def.scale * 0.8, z * def.scale]);
  const M = P.length;
  // 1) 곡선을 촘촘히 훑어 길이표를 만든다
  const dense = [];
  const SUB = 60;
  for (let i = 0; i < M; i++) {
    const p0 = P[(i - 1 + M) % M], p1 = P[i], p2 = P[(i + 1) % M], p3 = P[(i + 2) % M];
    for (let s = 0; s < SUB; s++) dense.push(cr(p0, p1, p2, p3, s / SUB));
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const length = cum[dense.length];
  // 2) 같은 간격 N개 표본
  const x = new Float32Array(N), y = new Float32Array(N), z = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i / N) * length;
    while (cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j], b = dense[(j + 1) % dense.length];
    x[i] = a[0] + (b[0] - a[0]) * f; y[i] = a[1] + (b[1] - a[1]) * f; z[i] = a[2] + (b[2] - a[2]) * f;
  }
  // 높이는 한 번 더 부드럽게 (언덕 꼭대기가 각지지 않게)
  const ys = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let k = -12; k <= 12; k++) s += y[(i + k + N) % N]; ys[i] = s / 25; }
  // 3) 진행 방향(fx,fz)과 오른쪽(rx,rz), 굽은 정도
  const fx = new Float32Array(N), fz = new Float32Array(N), rx = new Float32Array(N), rz = new Float32Array(N), curv = new Float32Array(N), slope = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 2 + N) % N, b = (i + 2) % N;
    let dx = x[b] - x[a], dz = z[b] - z[a];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    fx[i] = dx; fz[i] = dz;
    // heading h 기준 forward=(sin h, cos h), right=(-cos h, sin h) → right = (-fz, fx)
    rx[i] = -dz; rz[i] = dx;
    slope[i] = (ys[b] - ys[a]) / (l || 1);
  }
  for (let i = 0; i < N; i++) {
    const a = (i - 10 + N) % N, b = (i + 10) % N;
    const ha = Math.atan2(fx[a], fz[a]), hb = Math.atan2(fx[b], fz[b]);
    let d = hb - ha; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    curv[i] = d; // +면 왼쪽으로 굽음
  }
  const seg = length / N;
  const half = def.width / 2;
  const tr = { def, N, length, seg, x, y: ys, z, fx, fz, rx, rz, curv, slope, half, band: def.band };

  // 위치 찾기: hint 주변만 훑는다(겹치는 구간에서 엉뚱한 곳으로 튀지 않게)
  tr.locate = function (px, pz, hint = -1, out = {}) {
    let best = -1, bd = Infinity;
    if (hint < 0) {
      for (let i = 0; i < N; i += 2) { const d = (px - x[i]) ** 2 + (pz - z[i]) ** 2; if (d < bd) { bd = d; best = i; } }
      hint = best; bd = Infinity;
    }
    for (let k = -45; k <= 45; k++) {
      const i = (hint + k + N) % N;
      const d = (px - x[i]) ** 2 + (pz - z[i]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    // 앞뒤 선분 위로 투영해 소수점 진행도
    const i = best;
    const along = (px - x[i]) * fx[i] + (pz - z[i]) * fz[i];
    let fi = i + along / seg;
    fi = ((fi % N) + N) % N;
    const i0 = Math.floor(fi) % N, i1 = (i0 + 1) % N, f = fi - Math.floor(fi);
    const cx = x[i0] + (x[i1] - x[i0]) * f, cz = z[i0] + (z[i1] - z[i0]) * f;
    out.i = i0; out.f = fi;
    out.lat = (px - cx) * rx[i0] + (pz - cz) * rz[i0];
    out.y = ys[i0] + (ys[i1] - ys[i0]) * f;
    return out;
  };
  // 진행도 s(표본 단위, 소수) + 옆 거리 → 월드 좌표
  tr.point = function (s, lat = 0, out = {}) {
    s = ((s % N) + N) % N;
    const i0 = Math.floor(s) % N, i1 = (i0 + 1) % N, f = s - Math.floor(s);
    out.x = x[i0] + (x[i1] - x[i0]) * f + rx[i0] * lat;
    out.z = z[i0] + (z[i1] - z[i0]) * f + rz[i0] * lat;
    out.y = ys[i0] + (ys[i1] - ys[i0]) * f;
    out.h = Math.atan2(fx[i0], fz[i0]);
    return out;
  };
  // 격자 판정용: 한 점에서 가장 가까운 도로 중심선까지 거리와 그 높이 (전체 탐색, 초기화 때만)
  const cell = 24, grid = new Map();
  for (let i = 0; i < N; i++) {
    const key = Math.floor(x[i] / cell) + ',' + Math.floor(z[i] / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  tr.nearest = function (px, pz, maxR = 120) {
    const cx = Math.floor(px / cell), cz = Math.floor(pz / cell), R = Math.ceil(maxR / cell);
    let bd = Infinity, bi = -1;
    for (let r = 0; r <= R; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        const list = grid.get((cx + a) + ',' + (cz + b)); if (!list) continue;
        for (const i of list) { const d = (px - x[i]) ** 2 + (pz - z[i]) ** 2; if (d < bd) { bd = d; bi = i; } }
      }
      if (bi >= 0 && Math.sqrt(bd) < (r - 1) * cell) break;
    }
    return bi < 0 ? { d: Infinity, i: -1, y: 0 } : { d: Math.sqrt(bd), i: bi, y: ys[bi] };
  };
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, x[i]); maxx = Math.max(maxx, x[i]); minz = Math.min(minz, z[i]); maxz = Math.max(maxz, z[i]); }
  tr.bounds = { minx, maxx, minz, maxz };
  return tr;
}
