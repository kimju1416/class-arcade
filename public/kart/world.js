// 트랙 세계 만들기 — 하늘·지형·도로·연석·벽·소품·아이템 상자·부스터 발판
import * as T from 'three';
import { mergeGeometries } from '/fps/addons/utils/BufferGeometryUtils.js';
import { icon } from './icons.js';

const loader = new T.TextureLoader();
function tex(name, rep = 1, srgb = true) {
  const t = loader.load(`/kart/tex/${name}.webp`);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  return t;
}
function canvasTex(w, h, draw, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new T.CanvasTexture(cv);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const THEMES = {
  beach: {
    fog: 0xf2b58c, fogNear: 180, fogFar: 1300, hemi: [0xffd9b8, 0x6b4f3c, 1.25], sun: [0xffcf9a, 2.9], sunDir: [-0.6, 0.45, -0.65],
    wall: 'stripe', curb: ['#e23b3b', '#ffffff'], sea: -1.1, exposure: 1.0, envInt: 0.9,
  },
  neon: {
    fog: 0x1b1840, fogNear: 120, fogFar: 900, hemi: [0x6a6cff, 0x151228, 0.95], sun: [0x9fb2ff, 0.85], sunDir: [0.4, 0.8, 0.3],
    wall: 'neon', curb: ['#ff2fa0', '#1ee6ff'], sea: null, exposure: 1.15, envInt: 0.7, night: true,
  },
  blossom: {
    fog: 0xd6e6f4, fogNear: 200, fogFar: 1400, hemi: [0xdcefff, 0x5d7a45, 1.3], sun: [0xfff3e0, 3.1], sunDir: [0.5, 0.75, -0.4],
    wall: 'wood', curb: ['#d93a3a', '#ffffff'], sea: -2.2, exposure: 1.0, envInt: 0.9,
  },
};

export function buildWorld(scene, tr, def, quality, renderer) {
  const th = THEMES[def.theme];
  const W = { update: [], boxes: [], pads: [], theme: th, groundAt: null };
  const R = rng(def.id.length * 7919 + 13);
  const N = tr.N, half = tr.half, band = tr.band, edge = half + band;
  scene.fog = new T.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = new T.Color(th.fog);

  // ---------- 조명 ----------
  const hemi = new T.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]); scene.add(hemi);
  const sun = new T.DirectionalLight(th.sun[0], th.sun[1]);
  const sd = new T.Vector3(...th.sunDir).normalize();
  sun.userData.dir = sd;
  if (quality >= 2) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  }
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;

  // ---------- 하늘 ----------
  const skyT = tex(def.sky, 1); skyT.wrapS = T.RepeatWrapping; skyT.repeat.set(2, 1); skyT.anisotropy = 4;
  const SR = 1700, SH = (2 * Math.PI * SR / 2) * 1152 / 2048;
  const skyGeo = new T.CylinderGeometry(SR, SR, SH, 64, 1, true);
  const sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ map: skyT, side: T.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.position.y = SH / 2 - SH * 0.45 - 40; sky.renderOrder = -2;
  scene.add(sky);
  // 원통 위 뚜껑: 하늘 맨 위 색
  const capCol = { beach: 0x6d8fd0, neon: 0x0a0d2a, blossom: 0x7fb5ee }[def.theme];
  const cap = new T.Mesh(new T.CircleGeometry(SR, 48).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: capCol, fog: false, depthWrite: false, toneMapped: false }));
  cap.position.y = sky.position.y + SH / 2 - 1; cap.renderOrder = -2; scene.add(cap);
  W.sky = sky; W.skyCap = cap;
  // 반사용 환경맵
  skyT.mapping = T.EquirectangularReflectionMapping;
  const pm = new T.PMREMGenerator(renderer);
  const envReady = () => {
    const eq = skyT.clone(); eq.mapping = T.EquirectangularReflectionMapping; eq.repeat.set(1, 1); eq.needsUpdate = true;
    scene.environment = pm.fromEquirectangular(eq).texture;
    scene.environmentIntensity = th.envInt;
  };
  if (skyT.image) envReady(); else loader.manager.onLoad = () => { try { envReady(); } catch (e) { } };
  W.envReady = envReady;

  // ---------- 지형 높이 ----------
  const b = tr.bounds, M = 300;
  const gx0 = b.minx - M, gz0 = b.minz - M, GW = b.maxx - b.minx + 2 * M, GD = b.maxz - b.minz + 2 * M;
  const RES = quality >= 2 ? 3 : 4;
  const NX = Math.ceil(GW / RES), NZ = Math.ceil(GD / RES);
  const H = new Float32Array((NX + 1) * (NZ + 1));
  function farH(x, z, ny) {
    if (def.theme === 'beach') return -4.5 + fbm(x * 0.006, z * 0.006) * 5;
    if (def.theme === 'neon') return 0;
    // 벚꽃: 산이 멀수록 높아진다
    return ny + 3 + fbm(x * 0.008, z * 0.008) * 34;
  }
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = gx0 + i * RES, z = gz0 + j * RES;
    const n = tr.nearest(x, z, 160);
    const near = n.y - 0.12;
    let h;
    if (n.d < edge + 1) h = near;
    else {
      const t = smooth(edge + 1, edge + (def.theme === 'blossom' ? 70 : 42), n.d);
      const fh = farH(x, z, n.y);
      h = near + (fh - near) * t;
      if (def.theme === 'blossom' && t > 0) h = Math.max(h, near - 0.5 * t * 8);
    }
    H[j * (NX + 1) + i] = h;
  }
  const groundAt = (x, z) => {
    const fi = (x - gx0) / RES, fj = (z - gz0) / RES;
    const i = Math.max(0, Math.min(NX - 1, Math.floor(fi))), j = Math.max(0, Math.min(NZ - 1, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const a = H[j * (NX + 1) + i], bb = H[j * (NX + 1) + i + 1], c = H[(j + 1) * (NX + 1) + i], d = H[(j + 1) * (NX + 1) + i + 1];
    return a + (bb - a) * u + (c - a) * v + (a - bb - c + d) * u * v;
  };
  W.groundAt = groundAt;

  // 지형 메시 (정점색으로 높이별 음영)
  {
    const g = new T.PlaneGeometry(GW, GD, NX, NZ); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const i = k % (NX + 1), j = Math.floor(k / (NX + 1));
      const h = H[j * (NX + 1) + i];
      pos.setX(k, gx0 + i * RES); pos.setZ(k, gz0 + j * RES); pos.setY(k, h);
      let r = 1, gg = 1, bl = 1;
      if (def.theme === 'beach') { const wet = smooth(0.2, -1.4, h); r = 1 - wet * 0.35; gg = 1 - wet * 0.3; bl = 1 - wet * 0.2; }
      if (def.theme === 'blossom') { const hi = smooth(12, 45, h); r = 1 - hi * 0.25; gg = 1 - hi * 0.15; bl = 1 - hi * 0.3; }
      if (def.theme === 'neon') { r = gg = bl = 0.9; }
      col[k * 3] = r; col[k * 3 + 1] = gg; col[k * 3 + 2] = bl;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const gt = tex(def.ground, 1);
    gt.repeat.set(GW / (def.theme === 'neon' ? 14 : 18), GD / (def.theme === 'neon' ? 14 : 18));
    const m = new T.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: def.theme === 'neon' ? 0.35 : 0.95, metalness: def.theme === 'neon' ? 0.3 : 0 });
    if (def.theme === 'neon') { m.emissiveMap = gt; m.emissive = new T.Color(0x9a9aff); m.emissiveIntensity = 0.35; }
    const mesh = new T.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
    // 지형 바깥 먼 바닥
    const far = new T.Mesh(new T.CircleGeometry(3000, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: def.theme === 'neon' ? 0x0c0b1c : def.theme === 'beach' ? 0x2a8fb0 : 0x6f9a62 }));
    far.position.y = def.theme === 'beach' ? -6 : def.theme === 'neon' ? -0.3 : -2; scene.add(far);
  }

  // ---------- 바다·호수 ----------
  if (th.sea != null) {
    const nt = canvasTex(256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const nx = fbm(x / 32, y / 32), nz = fbm(x / 32 + 9, y / 32 + 4);
        const k = (y * w + x) * 4;
        img.data[k] = 128 + (nx - 0.5) * 120; img.data[k + 1] = 128 + (nz - 0.5) * 120; img.data[k + 2] = 255; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, false);
    nt.repeat.set(90, 90);
    const water = new T.Mesh(new T.CircleGeometry(2400, 64).rotateX(-Math.PI / 2), new T.MeshPhysicalMaterial({
      color: def.theme === 'beach' ? 0x1592b8 : 0x3a8fc2, roughness: 0.08, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.92,
      normalMap: nt, normalScale: new T.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.1,
    }));
    water.position.y = th.sea; scene.add(water);
    W.update.push((dt, t) => { nt.offset.set(t * 0.004, t * 0.0065); });
  }

  // ---------- 도로 ----------
  const roadT = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = def.theme === 'neon' ? '#1c1c26' : '#4a4d55'; g.fillRect(0, 0, w, h);
    // 결: 잔자갈
    for (let i = 0; i < 9000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // 가장자리 흰 선
    g.fillStyle = def.theme === 'neon' ? '#e8f6ff' : '#f4f4f0';
    g.fillRect(w * 0.035, 0, w * 0.018, h); g.fillRect(w * 0.947, 0, w * 0.018, h);
    // 타이어 자국
    g.strokeStyle = 'rgba(10,10,12,.18)'; g.lineWidth = 14;
    for (const x of [0.32, 0.42, 0.58, 0.68]) { g.beginPath(); g.moveTo(w * x, 0); g.lineTo(w * x + (Math.random() - 0.5) * 8, h); g.stroke(); }
  });
  const asphalt = tex('tex-asphalt', 1);
  {
    const L = half + 0.6;
    const pos = [], uv = [], idx = [], uv2 = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const x = tr.x[k], z = tr.z[k], y = tr.y[k] + 0.02;
      pos.push(x - tr.rx[k] * L, y, z - tr.rz[k] * L, x + tr.rx[k] * L, y, z + tr.rz[k] * L);
      const v = i * tr.seg / (2 * L);
      uv.push(0, v, 1, v);
      uv2.push(0, i * tr.seg / 10, (2 * L) / 10, i * tr.seg / 10);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new T.MeshStandardMaterial({ map: roadT, roughness: def.theme === 'neon' ? 0.45 : 0.82, metalness: def.theme === 'neon' ? 0.2 : 0 });
    // 실제 아스팔트 사진을 곱해 결을 살린다
    m.onBeforeCompile = (sh) => {
      sh.uniforms.asphalt = { value: asphalt };
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D asphalt;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(vec3(1.0), texture2D(asphalt, vMapUv * vec2(3.0, 3.0)).rgb * 1.9, 0.75);');
    };
    const road = new T.Mesh(g, m); road.receiveShadow = true; scene.add(road);
  }

  // ---------- 연석(굽은 곳만) ----------
  {
    const curbT = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = def.theme === 'neon' ? th.curb[0] : th.curb[0]; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = th.curb[1]; g.fillRect(0, h / 2, w, h / 2);
    });
    const curbM = new T.MeshStandardMaterial({ map: curbT, roughness: 0.6 });
    if (def.theme === 'neon') { curbM.emissiveMap = curbT; curbM.emissive = new T.Color(0xffffff); curbM.emissiveIntensity = 0.45; }
    const pos = [], uv = [], idx = [];
    const on = new Uint8Array(N);
    for (let i = 0; i < N; i++) { let m = 0; for (let k = -25; k <= 25; k++) m = Math.max(m, Math.abs(tr.curv[(i + k + N) % N])); on[i] = m > 0.16 ? 1 : 0; }
    let vi = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const k = i, k2 = (i + 1) % N;
        if (!on[k] || !on[k2]) continue;
        const a0 = half - 0.3, a1 = half + 1.5;
        for (const kk of [k, k2]) {
          const x = tr.x[kk], z = tr.z[kk], y = tr.y[kk] + 0.06, rx = tr.rx[kk] * side, rz = tr.rz[kk] * side;
          pos.push(x + rx * a0, y, z + rz * a0, x + rx * a1, y + 0.05, z + rz * a1);
          const v = (kk === k2 && k2 === 0 ? N : kk) * tr.seg / 4;
          uv.push(0, v, 1, v);
        }
        if (side > 0) idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        else idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
        vi += 4;
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const curb = new T.Mesh(g, curbM); curb.receiveShadow = true; scene.add(curb);
  }

  // ---------- 출발선(체크무늬) ----------
  {
    const ct = canvasTex(256, 64, (g, w, h) => { const s = 16; for (let y = 0; y < h / s; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s, y * s, s, s); } });
    ct.wrapS = ct.wrapT = T.ClampToEdgeWrapping;
    const g = new T.PlaneGeometry(2 * half, 2.6).rotateX(-Math.PI / 2);
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: ct, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(tr.x[0], tr.y[0] + 0.05, tr.z[0]); m.rotation.y = Math.atan2(tr.fx[0], tr.fz[0]);
    scene.add(m);
  }

  // ---------- 벽 ----------
  {
    let wallT, wm;
    if (th.wall === 'stripe') {
      wallT = canvasTex(512, 64, (g, w, h) => {
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e23b3b'; g.fillRect(i * w / 8, 0, w / 8, h); }
        g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h - 8, w, 8);
      });
      wm = new T.MeshStandardMaterial({ map: wallT, roughness: 0.5 });
    } else if (th.wall === 'neon') {
      wallT = canvasTex(512, 64, (g, w, h) => {
        g.fillStyle = '#12101e'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ff2fa0'; g.fillRect(0, 6, w, 7);
        g.fillStyle = '#1ee6ff'; g.fillRect(0, h - 14, w, 7);
        for (let i = 0; i < 8; i++) { g.fillStyle = '#ffd24a'; g.fillRect(i * 64 + 26, 26, 12, 12); }
      });
      wm = new T.MeshStandardMaterial({ map: wallT, emissiveMap: wallT, emissive: new T.Color(0xffffff), emissiveIntensity: 1.4, roughness: 0.4 });
    } else {
      wallT = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#8a5a34'; g.fillRect(0, 0, w, h);
        for (let y = 0; y < 3; y++) { g.fillStyle = y % 2 ? '#a26c40' : '#94613a'; g.fillRect(0, 6 + y * 19, w, 15); }
        g.fillStyle = '#5b3a20'; for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 28, 0, 8, h);
      });
      wm = new T.MeshStandardMaterial({ map: wallT, roughness: 0.9 });
    }
    const Hh = th.wall === 'wood' ? 1.1 : 0.95;
    const pos = [], uv = [], idx = [];
    let vi = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i <= N; i++) {
        const k = i % N, L = edge;
        const x = tr.x[k] + tr.rx[k] * L * side, z = tr.z[k] + tr.rz[k] * L * side, y = tr.y[k] - 0.3;
        pos.push(x, y, z, x, y + Hh + 0.3, z);
        const u = i * tr.seg / 16; uv.push(u, 0, u, 1);
        if (i < N) { if (side > 0) idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3); else idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); }
        vi += 2;
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    wm.side = T.DoubleSide;
    const wall = new T.Mesh(g, wm); wall.castShadow = quality >= 2; wall.receiveShadow = true; scene.add(wall);
  }

  // ---------- 흩뿌리기 도우미 ----------
  function scatter(count, dMin, dMax, ok) {
    const out = [];
    let tries = 0;
    while (out.length < count && tries++ < count * 30) {
      const i = Math.floor(R() * N), side = R() < 0.5 ? -1 : 1;
      const d = edge + dMin + R() * (dMax - dMin);
      const x = tr.x[i] + tr.rx[i] * d * side + (R() - 0.5) * 8, z = tr.z[i] + tr.rz[i] * d * side + (R() - 0.5) * 8;
      const n = tr.nearest(x, z, dMin + edge + 10);
      if (n.d < edge + dMin - 1) continue;
      const y = groundAt(x, z);
      if (ok && !ok(x, y, z)) continue;
      out.push({ x, y, z, r: R() * Math.PI * 2, s: 0.75 + R() * 0.6, i });
    }
    return out;
  }
  function instanced(geo, mat, list, shadow = true, tint) {
    const im = new T.InstancedMesh(geo, mat, list.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    list.forEach((o, k) => {
      e.set(o.rx || 0, o.r, o.rz || 0); q.setFromEuler(e); s.set(o.sx || o.s, o.sy || o.s, o.sz || o.s); p.set(o.x, o.y, o.z);
      m4.compose(p, q, s); im.setMatrixAt(k, m4);
      if (tint) im.setColorAt(k, tint(o, k));
    });
    im.castShadow = shadow && quality >= 2; im.receiveShadow = true;
    scene.add(im); return im;
  }
  function colored(geo, hex) {
    const c = new T.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new T.BufferAttribute(a, 3));
    if (geo.index) geo = geo.toNonIndexed();
    return geo;
  }
  const vcMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

  // ---------- 테마별 소품 ----------
  const dense = quality >= 2 ? 1 : 0.6;
  if (def.theme === 'beach') {
    // 야자수
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const c = new T.CylinderGeometry(0.28 - k * 0.03, 0.34 - k * 0.03, 1.9, 7); c.translate(k * 0.22, 0.95 + k * 1.85, 0);
      parts.push(colored(c, k % 2 ? 0x8a6038 : 0x9d6f42));
    }
    for (let k = 0; k < 8; k++) {
      const leaf = new T.SphereGeometry(1, 6, 4); leaf.scale(2.6, 0.12, 0.62); leaf.translate(2.3, 0, 0);
      leaf.rotateZ(-0.45); leaf.rotateY(k * Math.PI / 4 + 0.2); leaf.translate(1.1, 9.4, 0);
      parts.push(colored(leaf, k % 2 ? 0x2f9a3e : 0x3fb34b));
    }
    const coco = new T.SphereGeometry(0.3, 6, 5); coco.translate(1.1, 9.05, 0.3); parts.push(colored(coco, 0x5a3a1c));
    const palm = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
    const palms = scatter(Math.round(170 * dense), 3, 55, (x, y) => y > th.sea + 0.4);
    instanced(palm, vcMat, palms);
    // 파라솔
    const upar = [];
    const top = new T.ConeGeometry(2.1, 0.8, 10); top.translate(0, 2.6, 0); upar.push(colored(top, 0xffffff));
    const pole = new T.CylinderGeometry(0.05, 0.05, 2.6, 5); pole.translate(0, 1.3, 0); upar.push(colored(pole, 0xeeeeee));
    const umb = mergeGeometries(upar.map(p => p.index ? p.toNonIndexed() : p));
    const umbs = scatter(Math.round(60 * dense), 4, 26, (x, y) => y > th.sea + 0.3);
    const cols = [0xff5a5a, 0x2fb0ff, 0xffd23a, 0x3ad28f, 0xff8ad0];
    instanced(umb, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), umbs, true, (o, k) => new T.Color(cols[k % cols.length]));
    // 바위
    const rock = colored(new T.IcosahedronGeometry(1.4, 0), 0x9a8a78);
    instanced(rock, vcMat, scatter(Math.round(70 * dense), 6, 70).map(o => ({ ...o, s: o.s * 1.6, sy: o.s, rx: R(), rz: R() })));
    // 요트
    const boat = [];
    const hull = new T.BoxGeometry(2.2, 1, 7); hull.translate(0, 0.5, 0); boat.push(colored(hull, 0xffffff));
    const mast = new T.CylinderGeometry(0.1, 0.1, 9); mast.translate(0, 5, 0); boat.push(colored(mast, 0xdddddd));
    const sail = new T.ConeGeometry(2.4, 8, 3); sail.scale(1, 1, 0.1); sail.translate(0, 5.5, -1.2); boat.push(colored(sail, 0xfff5e0));
    const boatG = mergeGeometries(boat.map(p => p.index ? p.toNonIndexed() : p));
    const boats = []; for (let k = 0; k < 14; k++) { const a = R() * Math.PI * 2, r = 380 + R() * 500; const cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2; boats.push({ x: cx + Math.cos(a) * r, y: th.sea, z: cz + Math.sin(a) * r, r: R() * 6, s: 1 + R() }); }
    const boatM = instanced(boatG, vcMat, boats, false);
    W.update.push((dt, t) => { boatM.position.y = Math.sin(t * 0.8) * 0.3; });
  }

  if (def.theme === 'neon') {
    // 빌딩 — 창문이 빛나는 텍스처
    const winT = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#0d0f1c'; g.fillRect(0, 0, w, h);
      const pal = ['#ffe9a8', '#9fe8ff', '#ff9fd8', '#fff4d6'];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
        if (Math.random() < 0.45) continue;
        g.fillStyle = pal[Math.floor(Math.random() * pal.length)]; g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.fillRect(x * 32 + 6, y * 16 + 4, 20, 9);
      }
      g.globalAlpha = 1;
    });
    const bm = new T.MeshStandardMaterial({ map: winT, emissiveMap: winT, emissive: new T.Color(0xffffff), emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.5 });
    const bg = new T.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    // 윗면·아랫면에는 창문이 없게 uv를 0 영역으로
    const uvA = bg.attributes.uv; for (let k = 8; k < 16; k++) uvA.setXY(k, 0.01, 0.01);
    const blds = scatter(Math.round(260 * dense), 10, 150).map(o => {
      const w = 12 + R() * 16, d = 12 + R() * 16, hh = 18 + R() * R() * 110;
      return { ...o, sx: w, sy: hh, sz: d, r: tr.nearest(o.x, o.z).i >= 0 ? Math.atan2(tr.fx[o.i], tr.fz[o.i]) : 0 };
    });
    const bldM = instanced(bg, bm, blds, true, () => new T.Color().setHSL(0.6 + R() * 0.3, 0.3, 0.55 + R() * 0.4));
    bldM.material.map.repeat.set(1, 1);
    // 네온 아치
    const archCols = [0xff2fa0, 0x1ee6ff, 0xffd24a];
    for (let k = 0; k < 14; k++) {
      const i = Math.floor(((k + 0.5) / 14) * N);
      const path = new T.CurvePath();
      const w2 = edge - 0.5;
      const pts = [new T.Vector3(-w2, 0, 0), new T.Vector3(-w2, 7, 0), new T.Vector3(-w2 + 2, 9, 0), new T.Vector3(w2 - 2, 9, 0), new T.Vector3(w2, 7, 0), new T.Vector3(w2, 0, 0)];
      const curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      const tube = new T.Mesh(new T.TubeGeometry(curve, 40, 0.28, 8), new T.MeshStandardMaterial({ color: archCols[k % 3], emissive: archCols[k % 3], emissiveIntensity: 2.4 }));
      tube.position.set(tr.x[i], tr.y[i], tr.z[i]); tube.rotation.y = Math.atan2(tr.fx[i], tr.fz[i]) + Math.PI / 2 - Math.PI / 2;
      tube.rotation.y = Math.atan2(tr.rx[i], tr.rz[i]) - Math.PI / 2;
      scene.add(tube);
    }
    // 가로등
    const lampParts = [];
    const lp = new T.CylinderGeometry(0.12, 0.16, 8, 6); lp.translate(0, 4, 0); lampParts.push(colored(lp, 0x333844));
    const arm = new T.BoxGeometry(2.2, 0.15, 0.15); arm.translate(-1, 8, 0); lampParts.push(colored(arm, 0x333844));
    const lampG = mergeGeometries(lampParts.map(p => p.index ? p.toNonIndexed() : p));
    const lamps = [], heads = [];
    for (let i = 0; i < N; i += 55) for (const side of [-1, 1]) {
      const d = edge + 1.2, x = tr.x[i] + tr.rx[i] * d * side, z = tr.z[i] + tr.rz[i] * d * side;
      const r = Math.atan2(tr.rx[i] * side, tr.rz[i] * side) + Math.PI / 2;
      lamps.push({ x, y: tr.y[i], z, r, s: 1 });
      heads.push({ x: x - tr.rx[i] * side * 2, y: tr.y[i] + 7.85, z: z - tr.rz[i] * side * 2, r: 0, s: 1 });
    }
    instanced(lampG, vcMat, lamps, false);
    instanced(new T.BoxGeometry(0.9, 0.2, 0.5), new T.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xfff1c8, emissiveIntensity: 3 }), heads, false);
    // 바닥 빛 웅덩이(가로등 아래)
    const poolT = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,180,.55)'); gr.addColorStop(1, 'rgba(255,230,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const pools = heads.map(o => ({ ...o, y: o.y - 7.75, s: 1, sx: 11, sy: 11, sz: 11, rx: 0 }));
    instanced(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: poolT, transparent: true, depthWrite: false, blending: T.AdditiveBlending }), pools, false);
    fireworks(scene, W, tr, R);
  }

  if (def.theme === 'blossom') {
    const parts = [];
    const trunk = new T.CylinderGeometry(0.35, 0.55, 4.5, 7); trunk.translate(0, 2.25, 0); parts.push(colored(trunk, 0x5a3d2b));
    const br = new T.CylinderGeometry(0.15, 0.25, 3, 5); br.rotateZ(0.8); br.translate(-1, 4.6, 0); parts.push(colored(br, 0x5a3d2b));
    const pinks = [0xffb7d0, 0xffc8dc, 0xff9fc2, 0xffd6e5, 0xf7a8c8];
    const blobs = [[0, 6.2, 0, 2.6], [-2.2, 5.6, 0.6, 1.9], [2, 5.8, -0.5, 2], [0.4, 7.6, 0.7, 1.8], [-0.8, 6.4, -1.8, 1.7], [1.2, 6.6, 1.8, 1.6]];
    blobs.forEach(([x, y, z, r], k) => { const s = new T.IcosahedronGeometry(r, 1); s.translate(x, y, z); parts.push(colored(s, pinks[k % pinks.length])); });
    const cherry = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
    const cherries = scatter(Math.round(230 * dense), 2.5, 60);
    instanced(cherry, vcMat, cherries);
    // 소나무
    const pine = [];
    const pt = new T.CylinderGeometry(0.25, 0.35, 3, 6); pt.translate(0, 1.5, 0); pine.push(colored(pt, 0x4a3322));
    [[0, 4, 3.2, 4], [0, 6.4, 2.5, 3.6], [0, 8.5, 1.7, 3]].forEach(([x, y, r, h], k) => { const c = new T.ConeGeometry(r, h, 7); c.translate(x, y, 0); pine.push(colored(c, k % 2 ? 0x2f6e3a : 0x357d42)); });
    const pineG = mergeGeometries(pine.map(p => p.index ? p.toNonIndexed() : p));
    instanced(pineG, vcMat, scatter(Math.round(180 * dense), 25, 140).map(o => ({ ...o, s: o.s * 1.4 })));
    // 바위
    instanced(colored(new T.DodecahedronGeometry(1.3, 0), 0x8e8b86), vcMat, scatter(Math.round(80 * dense), 3, 50).map(o => ({ ...o, sy: o.s * 0.7, rx: R(), rz: R() })));
    // 청사초롱
    const lanternG = new T.CylinderGeometry(0.35, 0.35, 0.7, 10);
    const lanterns = [];
    for (let i = 20; i < N; i += 60) for (const side of [-1, 1]) {
      const d = edge + 0.8;
      lanterns.push({ x: tr.x[i] + tr.rx[i] * d * side, y: tr.y[i] + 2.4, z: tr.z[i] + tr.rz[i] * d * side, r: 0, s: 1 });
    }
    instanced(new T.CylinderGeometry(0.06, 0.06, 2.1, 5).translate(0, -1.05, 0), vcMat, lanterns, false);
    instanced(lanternG, new T.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff3a2a, emissiveIntensity: 0.7 }), lanterns, false, (o, k) => new T.Color(k % 2 ? 0xff5a4a : 0x4a78ff));
    // 홍살문(붉은 문) 3곳
    for (const u of [0.28, 0.52, 0.78]) {
      const i = Math.floor(u * N);
      const gate = new T.Group();
      const red = new T.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.6 });
      for (const sx of [-1, 1]) { const p = new T.Mesh(new T.CylinderGeometry(0.4, 0.45, 9, 10), red); p.position.set(sx * (edge - 0.5), 4.5, 0); p.castShadow = true; gate.add(p); }
      const beam = new T.Mesh(new T.BoxGeometry(2 * edge + 2, 0.7, 0.7), red); beam.position.y = 8.2; beam.castShadow = true; gate.add(beam);
      const beam2 = new T.Mesh(new T.BoxGeometry(2 * edge - 1, 0.45, 0.45), red); beam2.position.y = 6.6; gate.add(beam2);
      for (let k = -8; k <= 8; k++) { const sp = new T.Mesh(new T.BoxGeometry(0.12, 1.6, 0.12), red); sp.position.set(k * (edge - 1) / 8, 7.4, 0); gate.add(sp); }
      gate.position.set(tr.x[i], tr.y[i], tr.z[i]); gate.rotation.y = Math.atan2(tr.fx[i], tr.fz[i]);
      scene.add(gate);
    }
    petals(scene, W, R);
  }

  // ---------- 출발 게이트 + 관중석 + 대형 화면 ----------
  startArea(scene, W, tr, def, edge, quality, R);

  // ---------- 부스터 발판 ----------
  const padT = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#1a1206'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 4; k++) {
      const y = k * 64 + 8;
      g.fillStyle = k % 2 ? '#ffb31a' : '#ffe14a';
      g.beginPath(); g.moveTo(10, y + 40); g.lineTo(64, y); g.lineTo(118, y + 40); g.lineTo(118, y + 58); g.lineTo(64, y + 20); g.lineTo(10, y + 58); g.closePath(); g.fill();
    }
  });
  padT.repeat.set(1, 1.5);
  const padM = new T.MeshStandardMaterial({ map: padT, emissiveMap: padT, emissive: new T.Color(0xffffff), emissiveIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -3 });
  for (const [u, l] of def.pads) {
    const s = u * N, lat = l * half * 0.9;
    const p = tr.point(s, lat);
    const pad = new T.Mesh(new T.PlaneGeometry(3.6, 6).rotateX(-Math.PI / 2), padM);
    pad.position.set(p.x, p.y + 0.06, p.z); pad.rotation.y = p.h; scene.add(pad);
    W.pads.push({ s, lat });
  }
  W.update.push((dt, t) => { padT.offset.y = -t * 1.6; });

  // ---------- 아이템 상자 ----------
  const boxTex = new T.CanvasTexture(icon('box', 256)); boxTex.colorSpace = T.SRGBColorSpace;
  const boxM = new T.MeshStandardMaterial({ map: boxTex, transparent: true, opacity: 0.92, emissiveMap: boxTex, emissive: new T.Color(0xffffff), emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 });
  const boxG = new T.BoxGeometry(1.3, 1.3, 1.3);
  const coreM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false });
  for (const u of def.boxes) {
    for (const l of [-0.66, -0.22, 0.22, 0.66]) {
      const s = u * N, lat = l * half;
      const p = tr.point(s, lat);
      const m = new T.Mesh(boxG, boxM); m.castShadow = quality >= 2;
      const core = new T.Mesh(new T.SphereGeometry(0.42, 10, 8), coreM); m.add(core);
      m.position.set(p.x, p.y + 1.2, p.z); scene.add(m);
      W.boxes.push({ s, lat, x: p.x, y: p.y, z: p.z, mesh: m, off: 0, ph: R() * 6 });
    }
  }
  W.update.push((dt, t) => {
    for (const bx of W.boxes) {
      if (bx.off > 0) { bx.off -= dt; bx.mesh.visible = bx.off <= 0; if (bx.off <= 0) bx.mesh.scale.setScalar(0.01); }
      const sc = bx.mesh.scale.x; if (sc < 1) bx.mesh.scale.setScalar(Math.min(1, sc + dt * 3));
      bx.mesh.rotation.set(t * 0.9 + bx.ph, t * 1.3 + bx.ph, 0.4);
      bx.mesh.position.y = bx.y + 1.2 + Math.sin(t * 2.5 + bx.ph) * 0.18;
    }
  });
  return W;
}

function startArea(scene, W, tr, def, edge, quality, R) {
  const i = 0, h = Math.atan2(tr.fx[i], tr.fz[i]);
  const gate = new T.Group();
  const night = def.theme === 'neon';
  const pillarM = new T.MeshStandardMaterial({ color: night ? 0x22243a : 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
  for (const sx of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(1.4, 9, 1.4), pillarM); p.position.set(sx * (edge + 0.6), 4.5, 0); p.castShadow = true; gate.add(p); }
  const banT = canvasTex(1024, 128, (g, w, hh) => {
    g.fillStyle = '#101218'; g.fillRect(0, 0, w, hh);
    const s = 16; for (let y = 0; y < 2; y++) for (let x = 0; x < w / s; x++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * s, y * s, s, s); g.fillRect(x * s, hh - 32 + y * s, s, s); }
    g.font = 'italic 900 64px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd23a'; g.fillText('SUPERSTAR KART', w / 2, hh / 2 + 2);
  });
  banT.wrapS = banT.wrapT = T.ClampToEdgeWrapping;
  const banner = new T.Mesh(new T.BoxGeometry(2 * edge + 2.6, 2.2, 0.5), [pillarM, pillarM, pillarM, pillarM, new T.MeshStandardMaterial({ map: banT, emissiveMap: banT, emissive: new T.Color(0xffffff), emissiveIntensity: night ? 1 : 0.25 }), new T.MeshStandardMaterial({ map: banT, emissiveMap: banT, emissive: new T.Color(0xffffff), emissiveIntensity: night ? 1 : 0.25 })]);
  banner.position.y = 8.4; banner.castShadow = true; gate.add(banner);
  // 신호등
  W.lights = [];
  for (let k = 0; k < 3; k++) {
    const l = new T.Mesh(new T.SphereGeometry(0.42, 16, 12), new T.MeshStandardMaterial({ color: 0x331111, emissive: 0x000000 }));
    l.position.set((k - 1) * 1.3, 6.6, -0.3); gate.add(l); W.lights.push(l);
  }
  const lbox = new T.Mesh(new T.BoxGeometry(4.4, 1.3, 0.4), new T.MeshStandardMaterial({ color: 0x111111 })); lbox.position.set(0, 6.6, 0); gate.add(lbox);
  gate.position.set(tr.x[i], tr.y[i], tr.z[i]); gate.rotation.y = h; scene.add(gate);

  // 관중석 (출발선 앞뒤 직선 바깥쪽)
  const crowdT = canvasTex(512, 256, (g, w, hh) => {
    g.fillStyle = night ? '#1a1830' : '#3b4252'; g.fillRect(0, 0, w, hh);
    const pal = ['#ff5a5a', '#ffd23a', '#2fb0ff', '#3ad28f', '#ff8ad0', '#ffffff', '#ff9a3a', '#9a7bff'];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 40; x++) {
      const cx = x * 12.8 + 6 + (Math.random() - 0.5) * 3, cy = y * 32 + 12;
      g.fillStyle = pal[Math.floor(Math.random() * pal.length)]; g.fillRect(cx - 4.5, cy + 4, 9, 12);
      g.fillStyle = ['#f1c7a3', '#d9a47c', '#8a5a3c', '#f5d6b8'][Math.floor(Math.random() * 4)]; g.beginPath(); g.arc(cx, cy, 4.2, 0, 7); g.fill();
      if (night && Math.random() < 0.3) { g.fillStyle = pal[Math.floor(Math.random() * 5)]; g.fillRect(cx + 3, cy - 12, 2.5, 10); }
    }
  });
  crowdT.repeat.set(6, 1);
  const standM = [new T.MeshStandardMaterial({ color: night ? 0x2a2c44 : 0xd8dbe2 }), new T.MeshStandardMaterial({ map: crowdT, emissiveMap: night ? crowdT : null, emissive: new T.Color(night ? 0x888888 : 0x000000) })];
  for (const side of [1, -1]) {
    const len = 70, d = edge + 9;
    const g = new T.BoxGeometry(len, 7, 7);
    // 계단식으로 보이게 앞면을 기울인다
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { if (pos.getY(k) > 0 && pos.getZ(k) > 0) pos.setZ(k, -2.5); }
    g.computeVertexNormals();
    const stand = new T.Mesh(g, [standM[0], standM[0], standM[0], standM[0], standM[1], standM[0]]);
    const k = (tr.N - 8) % tr.N;
    const p = tr.point(k, (d + 3.5) * side);
    stand.position.set(p.x, p.y + 3.5, p.z);
    stand.rotation.y = Math.atan2(-tr.rx[k] * side, -tr.rz[k] * side); // 앞면(+z)이 트랙을 보게
    stand.castShadow = quality >= 2; stand.receiveShadow = true;
    scene.add(stand);
    if (side < 0 && def.theme !== 'beach') continue;
  }
  W.update.push((dt, t) => { crowdT.offset.y = Math.sin(t * 9) > 0.6 ? 0.012 : 0; });

  // 대형 화면: 키아트
  const kt = loader.load('/kart/tex/keyart.webp'); kt.colorSpace = T.SRGBColorSpace;
  for (const [u, side] of [[0.035, -1], [0.5, 1]]) {
    const k = Math.floor(u * tr.N), d = edge + 14;
    const p = tr.point(k, d * side);
    const scr = new T.Group();
    const frame = new T.Mesh(new T.BoxGeometry(17, 11.5, 0.8), new T.MeshStandardMaterial({ color: 0x15171f, metalness: 0.6, roughness: 0.4 }));
    frame.position.y = 11; scr.add(frame);
    const img = new T.Mesh(new T.PlaneGeometry(16, 10.6), new T.MeshBasicMaterial({ map: kt, toneMapped: false }));
    img.position.set(0, 11, 0.41); scr.add(img);
    const leg = new T.Mesh(new T.BoxGeometry(1, 6, 1), frame.material); leg.position.y = 2.6; scr.add(leg);
    scr.position.set(p.x, p.y, p.z);
    scr.rotation.y = Math.atan2(-tr.rx[k] * side, -tr.rz[k] * side) + (side > 0 ? 0.35 : -0.35);
    scene.add(scr);
  }
}

function fireworks(scene, W, tr, R) {
  const COUNT = 90, pool = [];
  const b = tr.bounds, cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2;
  const ptex = canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  for (let k = 0; k < 5; k++) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(COUNT * 3), vel = new Float32Array(COUNT * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.PointsMaterial({ size: 9, map: ptex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false });
    const pts = new T.Points(geo, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
    pool.push({ pts, pos, vel, t: -R() * 4, life: 2.4 });
  }
  const cols = [0xff4fa3, 0x1ee6ff, 0xffd24a, 0x7dff8a, 0xff7a3a];
  W.update.push((dt) => {
    for (const f of pool) {
      f.t += dt;
      if (f.t < 0) continue;
      if (!f.pts.visible) {
        const a = R() * Math.PI * 2, r = 420 + R() * 300;
        const ox = cx + Math.cos(a) * r, oy = 110 + R() * 90, oz = cz + Math.sin(a) * r;
        for (let i = 0; i < COUNT; i++) {
          f.pos[i * 3] = ox; f.pos[i * 3 + 1] = oy; f.pos[i * 3 + 2] = oz;
          const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), sp = 34 + R() * 10;
          f.vel[i * 3] = s * Math.cos(th) * sp; f.vel[i * 3 + 1] = u * sp; f.vel[i * 3 + 2] = s * Math.sin(th) * sp;
        }
        f.pts.material.color.setHex(cols[Math.floor(R() * cols.length)]);
        f.pts.visible = true; f.t = 0;
      }
      for (let i = 0; i < COUNT; i++) {
        f.vel[i * 3 + 1] -= 9 * dt;
        for (let a = 0; a < 3; a++) { f.vel[i * 3 + a] *= 1 - 1.2 * dt; f.pos[i * 3 + a] += f.vel[i * 3 + a] * dt; }
      }
      f.pts.geometry.attributes.position.needsUpdate = true;
      f.pts.material.opacity = Math.max(0, 1 - f.t / f.life);
      if (f.t > f.life) { f.pts.visible = false; f.t = -0.5 - R() * 3; }
    }
  });
}

function petals(scene, W, R) {
  const COUNT = 900;
  const pos = new Float32Array(COUNT * 3), ph = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) { pos[i * 3] = (R() - 0.5) * 120; pos[i * 3 + 1] = R() * 30; pos[i * 3 + 2] = (R() - 0.5) * 120; ph[i] = R() * 6; }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const pt = canvasTex(32, 32, (g) => { g.fillStyle = '#ffc1d8'; g.beginPath(); g.ellipse(16, 16, 12, 7, 0.6, 0, 7); g.fill(); g.fillStyle = '#ff9fc2'; g.beginPath(); g.ellipse(18, 17, 6, 3, 0.6, 0, 7); g.fill(); });
  const pts = new T.Points(geo, new T.PointsMaterial({ size: 0.45, map: pt, transparent: true, alphaTest: 0.3, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  W.update.push((dt, t, cam) => {
    if (!cam) return;
    for (let i = 0; i < COUNT; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      y -= dt * 1.4; x += Math.sin(t * 1.3 + ph[i]) * dt * 1.2 + dt * 1.5; z += Math.cos(t * 1.1 + ph[i]) * dt * 0.8;
      // 카메라 주변 상자 안에서 순환
      const rx = x - cam.position.x, rz = z - cam.position.z;
      if (rx > 60) x -= 120; if (rx < -60) x += 120; if (rz > 60) z -= 120; if (rz < -60) z += 120;
      if (y < cam.position.y - 6) y += 30;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  });
}
