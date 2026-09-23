// 차체 만들기 — 레이싱 카트 / 포뮬러 / 스포츠카 / 오프로드 버기 / 클래식 레이서
// 모든 차는 +z가 앞, 바닥이 y=0. 운전자 그림은 좌석(driverZ)에 허리부터 앉힌다.
import * as T from 'three';
import { mergeGeometries } from '/fps/addons/utils/BufferGeometryUtils.js';

// root 아래(skip 가지 제외) 메시를 root 기준 좌표로 구워 재질별로 합친다
function mergeStatic(root, skip) {
  root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(root.matrixWorld).invert(), groups = new Map(), olds = [];
  const walk = (o) => {
    for (const c of [...o.children]) {
      if (skip.has(c)) continue;
      if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !Array.isArray(c.material)) {
        const g = c.geometry, vc = !!c.material.vertexColors;
        if (!g.attributes.position || !g.attributes.normal) { walk(c); continue; }
        const key = c.material.uuid + (vc ? 'c' : '') + (c.castShadow ? 's' : '') + (c.renderOrder || 0);
        const m = new T.Matrix4().multiplyMatrices(inv, c.matrixWorld);
        let ng = g.clone(); ng.applyMatrix4(m);
        for (const n of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', ...(vc ? ['color'] : [])].includes(n)) ng.deleteAttribute(n);
        if (!ng.attributes.uv) ng.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
        if (vc && !ng.attributes.color) ng.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 3).fill(1), 3));
        ng.morphAttributes = {};
        if (!ng.index) { const n = ng.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; ng.setIndex(new T.BufferAttribute(ix, 1)); }
        if (m.determinant() < 0) { const ix = ng.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
        ng.clearGroups();
        if (!groups.has(key)) groups.set(key, { mat: c.material, cast: c.castShadow, recv: c.receiveShadow, ro: c.renderOrder, list: [] });
        groups.get(key).list.push(ng); olds.push(c);
      }
      walk(c);
    }
  };
  walk(root);
  if (olds.length < 3) return;
  for (const c of olds) { c.parent.remove(c); for (const k of [...c.children]) { root.attach(k); } }
  for (const gr of groups.values()) {
    const merged = gr.list.length === 1 ? gr.list[0] : mergeGeometries(gr.list, false);
    if (!merged) continue;
    const mesh = new T.Mesh(merged, gr.mat); mesh.castShadow = gr.cast; mesh.receiveShadow = gr.recv; mesh.renderOrder = gr.ro;
    root.add(mesh);
  }
}

export const BODIES = [
  { id: 'kart', name: '레이싱 카트' },
  { id: 'f1', name: '포뮬러' },
  { id: 'gt', name: '스포츠카' },
  { id: 'buggy', name: '오프로드 버기' },
  { id: 'classic', name: '클래식 레이서' },
];
export const PAINTS = ['#d7263d', '#ff7a1a', '#ffc72c', '#7fd13b', '#1d9a5b', '#14b8a6', '#38a8ff', '#1f4fd6', '#1b2a4a', '#7c4dff', '#ff4fa3', '#f2f2f2', '#b8bec9', '#16181d'];
export const FINISHES = [{ id: 'gloss', name: '유광' }, { id: 'metal', name: '메탈릭' }, { id: 'matte', name: '무광' }, { id: 'pearl', name: '펄' }];
export const RIMS = [{ id: 'sport', name: '스포츠 은색' }, { id: 'black', name: '블랙 메시' }, { id: 'gold', name: '골드' }, { id: 'white', name: '화이트월' }];
export const DECALS = [{ id: 'none', name: '없음' }, { id: 'stripe', name: '레이싱 줄무늬' }, { id: 'number', name: '번호판' }, { id: 'flame', name: '불꽃' }];

export function defaultCar(charIdx) { return { b: 0, c: -1, f: 0, w: 0, d: 0, n: (charIdx % 99) + 1 }; }
export function cleanCar(o, charIdx = 0) {
  const d = defaultCar(charIdx), n = (v, lo, hi, def) => Number.isInteger(v) && v >= lo && v <= hi ? v : def;
  if (!o || typeof o !== 'object') return d;
  return { b: n(o.b, 0, BODIES.length - 1, 0), c: n(o.c, -1, PAINTS.length - 1, -1), f: n(o.f, 0, FINISHES.length - 1, 0), w: n(o.w, 0, RIMS.length - 1, 0), d: n(o.d, 0, DECALS.length - 1, 0), n: n(o.n, 1, 99, d.n) };
}

// ---------- 공용 재질 ----------
const M = {
  chrome: new T.MeshStandardMaterial({ color: 0xe6e9ef, metalness: 1, roughness: 0.16 }),
  dark: new T.MeshStandardMaterial({ color: 0x23262e, metalness: 0.5, roughness: 0.45 }),
  carbon: new T.MeshStandardMaterial({ color: 0x15161a, metalness: 0.3, roughness: 0.35 }),
  seat: new T.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.75 }),
  tire: new T.MeshStandardMaterial({ color: 0x141418, roughness: 0.9 }),
  glass: new T.MeshPhysicalMaterial({ color: 0x9fc7e6, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false }),
  head: new T.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff0c8, emissiveIntensity: 2.2, roughness: 0.2 }),
  tail: new T.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1424, emissiveIntensity: 1.8, roughness: 0.3 }),
  amber: new T.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8a00, emissiveIntensity: 1.2 }),
  grille: new T.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.5 }),
  whitewall: new T.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }),
};
const rimMat = [
  new T.MeshStandardMaterial({ color: 0xd5d9e0, metalness: 1, roughness: 0.22 }),
  new T.MeshStandardMaterial({ color: 0x1c1d22, metalness: 0.8, roughness: 0.3 }),
  new T.MeshStandardMaterial({ color: 0xe8b83a, metalness: 1, roughness: 0.25 }),
  new T.MeshStandardMaterial({ color: 0xe6e9ef, metalness: 1, roughness: 0.14 }),
];

export function paintMaterial(hex, finish) {
  const base = { color: hex };
  if (finish === 1) return new T.MeshPhysicalMaterial({ ...base, metalness: 0.75, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.04 });
  if (finish === 2) return new T.MeshPhysicalMaterial({ ...base, metalness: 0.05, roughness: 0.78 });
  if (finish === 3) return new T.MeshPhysicalMaterial({ ...base, metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 700] });
  return new T.MeshPhysicalMaterial({ ...base, metalness: 0.15, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 });
}

// ---------- 바퀴 ----------
// 타이어 단면을 돌려 만든 둥근 옆면 + 림 무늬
function wheel(r, w, rimStyle, knobby) {
  const g = new T.Group();
  const pts = [];
  const rr = r * 0.62, sw = w / 2;
  pts.push(new T.Vector2(rr, -sw));
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; pts.push(new T.Vector2(r - 0.06 + Math.cos(a) * 0.06 + (knobby ? 0.02 : 0), Math.sin(a) * sw)); }
  pts.push(new T.Vector2(rr, sw));
  const tireG = new T.LatheGeometry(pts, 28).rotateZ(Math.PI / 2);
  g.add(new T.Mesh(tireG, M.tire));
  if (knobby) { // 오프로드 돌기
    const kg = new T.BoxGeometry(w * 0.9, 0.07, 0.12);
    for (let i = 0; i < 16; i++) { const k = new T.Mesh(kg, M.tire); const a = i / 16 * Math.PI * 2; k.position.set(0, Math.cos(a) * r, Math.sin(a) * r); k.rotation.x = -a; g.add(k); }
  }
  const rm = rimMat[rimStyle];
  if (rimStyle === 3) { // 화이트월 + 크롬 캡
    const ww = new T.Mesh(new T.RingGeometry(rr * 1.02, r * 0.86, 28).rotateY(Math.PI / 2), M.whitewall);
    for (const sx of [-1, 1]) { const m = ww.clone(); m.position.x = sx * (sw + 0.002); if (sx < 0) m.rotation.y = Math.PI; g.add(m); }
  }
  const disc = new T.Mesh(new T.CylinderGeometry(rr * 0.98, rr * 0.98, w * 0.7, 24).rotateZ(Math.PI / 2), rimStyle === 1 ? M.carbon : M.dark);
  g.add(disc);
  for (const sx of [-1, 1]) {
    const face = new T.Group(); face.position.x = sx * (w * 0.36);
    if (rimStyle === 3) {
      face.add(new T.Mesh(new T.SphereGeometry(rr * 0.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-sx * Math.PI / 2).scale(0.35, 1, 1), rm));
    } else {
      const n = rimStyle === 1 ? 10 : 5, sp = new T.BoxGeometry(0.03, rr * 0.95, rimStyle === 1 ? 0.035 : 0.07);
      for (let i = 0; i < n; i++) { const s = new T.Mesh(sp, rm); s.rotation.x = i / n * Math.PI * 2; s.position.y = 0; face.add(s); }
      const ring = new T.Mesh(new T.TorusGeometry(rr * 0.95, 0.025, 6, 28).rotateY(Math.PI / 2), rm); face.add(ring);
      face.add(new T.Mesh(new T.CylinderGeometry(rr * 0.2, rr * 0.2, 0.05, 12).rotateZ(Math.PI / 2), rm));
    }
    g.add(face);
  }
  return g;
}

// 옆 윤곽(z, y)을 폭만큼 밀어 만든 차체
// shape: { tumble: 위로 갈수록 좁아짐(0~0.3), y0,y1: 좁아지기 시작·끝 높이, pinch: 앞뒤 끝이 좁아짐, z0: 좁아지기 시작하는 |z| }
function extrudeProfile(pts, width, bevel = 0.07, shape) {
  const s = new T.Shape();
  pts.forEach(([z, y], i) => i ? s.lineTo(z, y) : s.moveTo(z, y));
  s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 5, curveSegments: 16, steps: 1 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // 윤곽의 가로(z) → 앞뒤, 밀어낸 방향 → 좌우
  if (shape) { // 진짜 차처럼: 위쪽은 안으로 기울고(텀블홈), 코·꼬리는 둥글게 좁아진다
    const p = g.attributes.position, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = (1 - (shape.tumble || 0) * sm(shape.y0 || 0.5, shape.y1 || 1.0, y)) * (1 - (shape.pinch || 0) * sm(shape.z0 || 1.1, shape.z1 || 1.7, Math.abs(z)));
      // 모서리를 둥글게: 가장자리일수록 아래·위가 살짝 말려 들어감
      p.setX(i, x * k);
    }
  }
  g.computeVertexNormals();
  return g;
}
function arcPts(cz, cy, r, a0, a1, n = 10) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); return o; };

function numberTex(n, col) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.lineWidth = 8; g.strokeStyle = col; g.stroke();
  g.fillStyle = '#111'; g.font = '900 72px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
}
let _flameTex;
function flameTex() {
  if (_flameTex) return _flameTex;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  const tongue = (y, len, th, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, y - th); g.bezierCurveTo(len * 0.5, y - th * 1.4, len * 0.8, y - th * 0.2, len, y - th * 0.6); g.bezierCurveTo(len * 0.75, y + th * 0.1, len * 0.5, y + th * 0.9, 0, y + th); g.fill(); };
  for (const [y, l, t] of [[40, 420, 18], [70, 500, 24], [100, 380, 16]]) tongue(y, l, t, '#ffb000');
  for (const [y, l, t] of [[40, 330, 10], [70, 410, 14], [100, 300, 9]]) tongue(y, l, t, '#ff4a12');
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; _flameTex = t; return t;
}
// 윗면 중심선을 따라 두 줄 무늬 리본
function stripes(pts, color) {
  const out = new T.Group(), m = new T.MeshStandardMaterial({ color, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const off of [-0.13, 0.13]) {
    const pos = [], idx = [];
    pts.forEach(([z, y], i) => { pos.push(off - 0.06, y + 0.012, z, off + 0.06, y + 0.012, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const s = new T.Mesh(g, m); s.material.side = T.DoubleSide; out.add(s);
  }
  return out;
}

// ---------- 차종별 ----------
function build(cfg, char) {
  const col = cfg.c >= 0 ? PAINTS[cfg.c] : char.color;
  const paint = paintMaterial(col, cfg.f);
  const accent = paintMaterial(char.accent || '#ffffff', 0);
  const G = new T.Group();
  const out = { group: G, paint, wheels: [], fronts: [], exhaust: [], sideX: 0.75, stripe: null, sidePanel: null, steer: null };
  const addWheel = (x, y, z, r, w, front, knobby) => {
    const pivot = new T.Group(); pivot.position.set(x, y, z);
    const spin = new T.Group(); spin.add(wheel(r, w, cfg.w, knobby));
    pivot.add(spin); G.add(pivot); out.wheels.push(spin); if (front) out.fronts.push(pivot);
  };
  const steerWheel = (y, z, tilt) => { const s = mesh(new T.TorusGeometry(0.16, 0.03, 8, 20), M.seat, 0, y, z); s.rotation.x = tilt; G.add(s); out.steer = s; };
  const b = BODIES[cfg.b].id;

  if (b === 'kart') {
    const sh = new T.Shape(), hw = 0.65, hl = 1.15, nw = hw * 0.62, r = 0.25;
    sh.moveTo(-hw + r, -hl); sh.lineTo(hw - r, -hl); sh.quadraticCurveTo(hw, -hl, hw, -hl + r); sh.lineTo(hw, hl * 0.2); sh.quadraticCurveTo(hw, hl * 0.55, nw, hl - r); sh.quadraticCurveTo(nw, hl, nw - r, hl);
    sh.lineTo(-nw + r, hl); sh.quadraticCurveTo(-nw, hl, -nw, hl - r); sh.quadraticCurveTo(-hw, hl * 0.55, -hw, hl * 0.2); sh.lineTo(-hw, -hl + r); sh.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
    const bg = new T.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 10 }).rotateX(-Math.PI / 2);
    G.add(mesh(bg, paint, 0, 0.32, 0));
    G.add(mesh(new T.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.55, 1.2), paint, 0, 0.55, 0.62));
    for (const sx of [-1, 1]) {
      G.add(mesh(new T.CapsuleGeometry(0.2, 0.9, 6, 12).rotateX(Math.PI / 2), accent, sx * 0.72, 0.42, -0.05));
      G.add(mesh(new T.SphereGeometry(0.09, 10, 8), M.head, sx * 0.3, 0.62, 1.12));
      G.add(mesh(new T.BoxGeometry(0.22, 0.08, 0.05), M.tail, sx * 0.42, 0.52, -1.28));
      G.add(mesh(new T.CylinderGeometry(0.075, 0.09, 0.4, 12).rotateX(Math.PI / 2), M.chrome, sx * 0.22, 0.5, -1.32));
      G.add(mesh(new T.BoxGeometry(0.06, 0.42, 0.12), M.dark, sx * 0.45, 0.78, -1.08));
      G.add(mesh(new T.BoxGeometry(0.06, 0.34, 0.46), paint, sx * 0.77, 1.02, -1.1));
      out.exhaust.push(new T.Vector3(sx * 0.22, 0.5, -1.62));
    }
    const wing = mesh(new T.BoxGeometry(1.5, 0.08, 0.42), paint, 0, 1.02, -1.1); wing.rotation.x = 0.12; G.add(wing);
    G.add(mesh(new T.BoxGeometry(0.72, 0.36, 0.5), M.dark, 0, 0.62, -0.95));
    const seat = mesh(new T.BoxGeometry(0.62, 0.55, 0.14), M.seat, 0, 0.82, -0.5); seat.rotation.x = -0.2; G.add(seat);
    steerWheel(0.96, 0.18, -0.6);
    for (const [x, z, rear] of [[-0.78, 0.78, 0], [0.78, 0.78, 0], [-0.8, -0.85, 1], [0.8, -0.85, 1]]) addWheel(x, rear ? 0.4 : 0.34, z, rear ? 0.4 : 0.34, rear ? 0.42 : 0.3, !rear);
    out.stripe = [[1.0, 0.72], [0.6, 0.82], [0.25, 0.86]];
    out.driverY = 0.62; out.driverZ = -0.42; out.sideX = 0.78; out.numberAt = [0.2, 0.62];
  }

  if (b === 'f1') {
    const prof = [[2.0, 0.26], [1.6, 0.34], [1.0, 0.46], [0.35, 0.62], [0.25, 0.5], [-0.5, 0.5], [-0.62, 0.72], [-1.2, 0.62], [-1.62, 0.44], [-1.7, 0.2], [-0.2, 0.16], [2.0, 0.18]];
    G.add(mesh(extrudeProfile(prof, 0.66, 0.08, { tumble: 0.2, y0: 0.3, y1: 0.7, pinch: 0.45, z0: 0.8, z1: 2.0 }), paint));
    for (const sx of [-1, 1]) {
      const pod = mesh(extrudeProfile([[0.45, 0.2], [0.25, 0.52], [-0.9, 0.5], [-1.2, 0.3], [-1.2, 0.18], [0.45, 0.18]], 0.34, 0.05), paint, sx * 0.44, 0, 0); G.add(pod);
      G.add(mesh(new T.BoxGeometry(0.05, 0.3, 0.42), M.carbon, sx * 0.95, 0.3, 1.95)); // 앞날개 끝판
      G.add(mesh(new T.BoxGeometry(0.05, 0.5, 0.5), paint, sx * 0.66, 0.92, -1.5));
      for (const [z, y] of [[1.3, 0.34], [-1.15, 0.4]]) { const arm = mesh(new T.CylinderGeometry(0.018, 0.018, 0.6, 6).rotateZ(Math.PI / 2), M.carbon, sx * 0.55, y, z); G.add(arm); }
      out.exhaust.push(new T.Vector3(0, 0.46, -1.78));
    }
    G.add(mesh(new T.BoxGeometry(1.95, 0.05, 0.36), M.carbon, 0, 0.18, 1.95));
    G.add(mesh(new T.BoxGeometry(1.8, 0.04, 0.22), paint, 0, 0.26, 1.88));
    const rw = mesh(new T.BoxGeometry(1.3, 0.06, 0.38), M.carbon, 0, 1.1, -1.52); rw.rotation.x = 0.2; G.add(rw);
    const rw2 = mesh(new T.BoxGeometry(1.3, 0.05, 0.22), paint, 0, 0.98, -1.5); rw2.rotation.x = 0.35; G.add(rw2);
    G.add(mesh(new T.BoxGeometry(0.1, 0.5, 0.12), M.carbon, 0, 0.8, -1.5));
    G.add(mesh(new T.BoxGeometry(0.34, 0.04, 0.12), M.tail, 0, 0.3, -1.72));
    const seat = mesh(new T.BoxGeometry(0.44, 0.3, 0.1), M.seat, 0, 0.62, -0.46); seat.rotation.x = -0.3; G.add(seat);
    steerWheel(0.72, 0.18, -0.9);
    for (const [x, z, rear] of [[-0.86, 1.28, 0], [0.86, 1.28, 0], [-0.88, -1.15, 1], [0.88, -1.15, 1]]) addWheel(x, rear ? 0.43 : 0.38, z, rear ? 0.43 : 0.38, rear ? 0.46 : 0.36, !rear);
    out.stripe = [[1.95, 0.27], [1.5, 0.36], [1.0, 0.47], [0.4, 0.61]];
    out.driverY = 0.5; out.driverZ = -0.12; out.sideX = 0.62; out.numberAt = [1.2, 0.42];
  }

  if (b === 'gt') {
    // 바퀴 구멍이 아래쪽에 파이게: 두 호를 z가 줄어드는 순서로 이어 붙인다
    const bottom = [[-1.56, 0.26], ...arcPts(-1.0, 0.32, 0.43, Math.PI, 0, 10), [-0.5, 0.2], [0.5, 0.2], ...arcPts(1.0, 0.32, 0.43, Math.PI, 0, 10), [1.52, 0.26]];
    const top = [[1.55, 0.36], [1.53, 0.62], [1.32, 0.8], [0.62, 0.9], [0.36, 0.93], [0.22, 0.82], [-0.72, 0.82], [-0.8, 0.95], [-1.36, 0.99], [-1.56, 0.93], [-1.63, 0.62]];
    const smoothTop = new T.SplineCurve(top.map(([z, y]) => new T.Vector2(z, y))).getPoints(70).map(v => [v.x, v.y]);
    const body = extrudeProfile([...smoothTop, ...bottom], 1.66, 0.16, { tumble: 0.22, y0: 0.45, y1: 1.0, pinch: 0.2, z0: 1.05, z1: 1.65 });
    G.add(mesh(body, paint));
    // 앞유리 틀·유리
    const ws = mesh(new T.PlaneGeometry(1.34, 0.46), M.glass, 0, 1.08, 0.24); ws.rotation.x = -0.6; G.add(ws);
    const frame = mesh(new T.TorusGeometry(0.67, 0.025, 6, 24, Math.PI), M.dark, 0, 0.9, 0.28); frame.scale.set(1, 0.62, 1); frame.rotation.x = -0.6; G.add(frame);
    for (const sx of [-1, 1]) {
      const hl = mesh(new T.BoxGeometry(0.36, 0.08, 0.1), M.head, sx * 0.52, 0.6, 1.5); hl.rotation.y = sx * 0.25; hl.rotation.x = -0.5; hl.position.y = 0.66; G.add(hl);
      G.add(mesh(new T.BoxGeometry(0.1, 0.06, 0.12), M.dark, sx * 0.86, 0.96, 0.35)); // 사이드미러
      G.add(mesh(new T.CylinderGeometry(0.06, 0.07, 0.14, 12).rotateX(Math.PI / 2), M.chrome, sx * 0.34, 0.3, -1.62));
      out.exhaust.push(new T.Vector3(sx * 0.34, 0.3, -1.74));
      G.add(mesh(new T.BoxGeometry(0.06, 0.26, 0.08), M.dark, sx * 0.5, 1.1, -1.3));
    }
    G.add(mesh(new T.BoxGeometry(1.3, 0.05, 0.08), M.tail, 0, 0.82, -1.62));
    G.add(mesh(new T.BoxGeometry(0.9, 0.16, 0.06), M.grille, 0, 0.36, 1.55));
    const sp = mesh(new T.BoxGeometry(1.5, 0.05, 0.3), M.carbon, 0, 1.24, -1.34); sp.rotation.x = 0.12; G.add(sp);
    G.add(mesh(new T.BoxGeometry(1.2, 0.46, 0.12), M.seat, 0, 1.0, -0.62));
    steerWheel(0.98, 0.02, -0.7);
    for (const [x, z] of [[-0.8, 1.0], [0.8, 1.0], [-0.8, -1.0], [0.8, -1.0]]) addWheel(x, 0.37, z, 0.37, 0.32, z > 0);
    out.stripe = [[1.5, 0.63], [1.3, 0.81], [0.62, 0.91], [0.38, 0.94]];
    out.stripe2 = [[-0.84, 0.96], [-1.36, 1.0], [-1.55, 0.94]];
    out.driverY = 0.66; out.driverZ = -0.32; out.sideX = 0.82; out.numberAt = [-0.25, 0.55]; out.flat = true;
  }

  if (b === 'buggy') {
    const prof = [...new T.SplineCurve([[1.5, 0.62], [1.42, 0.86], [1.1, 0.94], [0.4, 0.96], [0.25, 0.86], [-0.8, 0.86], [-0.9, 1.0], [-1.45, 0.98], [-1.55, 0.62]].map(([z, y]) => new T.Vector2(z, y))).getPoints(40).map(v => [v.x, v.y]), [-1.2, 0.46], [1.2, 0.46]];
    G.add(mesh(extrudeProfile(prof, 1.46, 0.12, { tumble: 0.12, y0: 0.6, y1: 1.0, pinch: 0.1, z0: 1.2, z1: 1.55 }), paint));
    G.add(mesh(new T.BoxGeometry(1.2, 0.18, 2.6), M.dark, 0, 0.44, 0));
    // 롤바(좌석 뒤)와 라이트바
    const hoop = new T.Mesh(new T.TorusGeometry(0.62, 0.05, 8, 24, Math.PI), M.dark); hoop.position.set(0, 0.95, -0.95); hoop.scale.set(1, 0.9, 1); G.add(hoop);
    for (const sx of [-1, 1]) { const st = mesh(new T.CylinderGeometry(0.04, 0.04, 0.95, 8), M.dark, sx * 0.62, 1.2, -1.25); st.rotation.x = 0.55; G.add(st); }
    G.add(mesh(new T.BoxGeometry(0.9, 0.1, 0.12), M.dark, 0, 1.52, -0.95));
    for (let i = -2; i <= 2; i++) G.add(mesh(new T.BoxGeometry(0.14, 0.07, 0.04), M.head, i * 0.17, 1.52, -0.88));
    // 범퍼 가드
    const bar = new T.Mesh(new T.TorusGeometry(0.5, 0.045, 8, 20, Math.PI), M.chrome); bar.position.set(0, 0.55, 1.58); bar.rotation.x = Math.PI / 2; bar.rotation.z = Math.PI; bar.scale.set(1.2, 0.5, 1); G.add(bar);
    for (const sx of [-1, 1]) {
      G.add(mesh(new T.BoxGeometry(0.2, 0.1, 0.06), M.head, sx * 0.48, 0.8, 1.52));
      G.add(mesh(new T.BoxGeometry(0.2, 0.08, 0.05), M.tail, sx * 0.5, 0.8, -1.56));
      const fend = mesh(new T.BoxGeometry(0.5, 0.06, 0.95), M.dark, sx * 0.98, 1.0, 0.95); G.add(fend);
      const fend2 = mesh(new T.BoxGeometry(0.5, 0.06, 0.95), M.dark, sx * 0.98, 1.02, -0.95); G.add(fend2);
      out.exhaust.push(new T.Vector3(sx * 0.3, 0.5, -1.65));
    }
    const spare = wheel(0.34, 0.24, cfg.w, true); spare.rotation.y = Math.PI / 2; spare.position.set(0, 0.95, -1.62); G.add(spare);
    G.add(mesh(new T.BoxGeometry(0.9, 0.5, 0.12), M.seat, 0, 1.0, -0.72));
    steerWheel(1.02, 0.12, -0.5);
    for (const [x, z] of [[-0.98, 0.95], [0.98, 0.95], [-0.98, -0.95], [0.98, -0.95]]) addWheel(x, 0.5, z, 0.5, 0.44, z > 0, true);
    out.stripe = [[1.36, 0.91], [0.5, 0.96]];
    out.driverY = 0.72; out.driverZ = -0.35; out.sideX = 0.74; out.numberAt = [-0.3, 0.68]; out.flat = true;
  }

  if (b === 'classic') {
    // 시가 모양 몸통: 길이 방향으로 돌린 곡면
    const pts = [];
    const prof = [[0, -1.75], [0.18, -1.7], [0.38, -1.4], [0.52, -0.9], [0.56, -0.2], [0.54, 0.6], [0.46, 1.2], [0.3, 1.62], [0.0, 1.72]];
    for (const [r, z] of prof) pts.push(new T.Vector2(r, z));
    const lg = new T.LatheGeometry(pts, 32).rotateX(Math.PI / 2);
    lg.scale(1.18, 1, 1); lg.translate(0, 0.62, 0);
    G.add(mesh(lg, paint));
    G.add(mesh(new T.CylinderGeometry(0.3, 0.3, 0.06, 20).rotateX(Math.PI / 2), M.grille, 0, 0.62, 1.72));
    G.add(mesh(new T.TorusGeometry(0.3, 0.035, 8, 24), M.chrome, 0, 0.62, 1.74));
    const ws = mesh(new T.CircleGeometry(0.34, 20, 0, Math.PI), M.glass, 0, 1.12, 0.3); ws.rotation.x = -0.35; G.add(ws);
    G.add(mesh(new T.TorusGeometry(0.34, 0.02, 6, 20, Math.PI), M.chrome, 0, 1.12, 0.3));
    G.add(mesh(new T.BoxGeometry(0.62, 0.34, 0.12), M.seat, 0, 1.12, -0.62));
    for (const sx of [-1, 1]) {
      const hd = mesh(new T.CylinderGeometry(0.12, 0.12, 0.08, 16).rotateX(Math.PI / 2), M.chrome, sx * 0.34, 0.95, 1.38); G.add(hd);
      G.add(mesh(new T.CircleGeometry(0.09, 16), M.head, sx * 0.34, 0.95, 1.43));
      G.add(mesh(new T.CylinderGeometry(0.05, 0.06, 1.1, 10).rotateX(Math.PI / 2), M.chrome, sx * 0.6, 0.38, -0.9));
      out.exhaust.push(new T.Vector3(sx * 0.6, 0.38, -1.5));
      G.add(mesh(new T.SphereGeometry(0.06, 8, 6), M.tail, sx * 0.3, 0.72, -1.72));
      const fender = new T.Mesh(new T.TorusGeometry(0.44, 0.07, 6, 16, Math.PI), paint); fender.rotation.y = Math.PI / 2; fender.position.set(sx * 0.85, 0.42, 1.08); G.add(fender);
    }
    steerWheel(1.08, 0.12, -0.9);
    for (const [x, z] of [[-0.85, 1.08], [0.85, 1.08], [-0.86, -1.05], [0.86, -1.05]]) addWheel(x, 0.42, z, 0.42, 0.24, z > 0);
    out.stripe = [[1.62, 0.95], [1.2, 1.08], [0.6, 1.17]];
    out.driverY = 0.86; out.driverZ = -0.36; out.sideX = 0.66; out.numberAt = [-0.4, 0.7];
  }

  // ---------- 데칼 ----------
  const dec = DECALS[cfg.d].id, stripeCol = new T.Color(col).getHSL({}).l > 0.6 ? '#1b1d24' : '#ffffff';
  if (dec === 'stripe' && out.stripe) { G.add(stripes(out.stripe, stripeCol)); if (out.stripe2) G.add(stripes(out.stripe2, stripeCol)); }
  if (dec === 'number' || (dec === 'flame' && !out.flat)) {
    const t = numberTex(cfg.n, col), m = new T.MeshBasicMaterial({ map: t, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sx of [-1, 1]) { const p = mesh(new T.CircleGeometry(0.22, 24), m, sx * (out.sideX + 0.015), out.numberAt[1], out.numberAt[0]); p.rotation.y = sx * Math.PI / 2; G.add(p); }
  }
  if (dec === 'flame' && out.flat) {
    const m = new T.MeshBasicMaterial({ map: flameTex(), transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sx of [-1, 1]) { const p = mesh(new T.PlaneGeometry(1.7, 0.42), m, sx * (out.sideX + 0.015), out.numberAt[1], 0.55); p.rotation.y = sx * Math.PI / 2; if (sx < 0) p.scale.x = -1; G.add(p); }
  }
  G.traverse(o => { if (o.isMesh && o.material !== M.glass) o.castShadow = true; });
  // 그리기 호출 줄이기: 움직이지 않는 부품은 재질별로 한 덩어리로(카트 하나 90개 → 10여 개)
  const skip = new Set([...out.fronts, ...out.wheels.map(w => w.parent), out.steer].filter(Boolean));
  mergeStatic(G, skip);
  for (const w of out.wheels) mergeStatic(w, new Set());
  return out;
}
export { build as buildCar };
