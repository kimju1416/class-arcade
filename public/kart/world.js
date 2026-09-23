// 트랙 세계 만들기 — 하늘·지형·도로·연석·벽·소품·아이템 상자·부스터 발판
import * as T from 'three';
import { mergeGeometries } from '/fps/addons/utils/BufferGeometryUtils.js';
import { icon } from './icons.js';
import { kpopArena } from './arena.js';
import { ENV_ART } from './env.js';
import { backdrop, BUMP_GLSL, makeSky, makeWater, splatMaterial, windowMaterial, crowdTexture, plantPalms, plantCherries, plantPines, plantGrass, placeRocks, islands, mountains, skyline } from './scenery.js';

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
    fog: 0xeaa27c, fogNear: 260, fogFar: 2600, hemi: [0xffd9b8, 0x6b4f3c, 1.25], sun: [0xffc88a, 3.0],
    wall: 'stripe', curb: ['#e23b3b', '#ffffff'], sea: -1.1, exposure: 0.95, envInt: 0.9,
  },
  neon: {
    fog: 0x1d1745, fogNear: 160, fogFar: 1700, hemi: [0x6a6cff, 0x151228, 0.95], sun: [0x9fb2ff, 0.85],
    wall: 'neon', curb: ['#ff2fa0', '#1ee6ff'], sea: null, exposure: 1.15, envInt: 0.7, night: true,
  },
  kpop: {
    fog: 0x140a2a, fogNear: 140, fogFar: 1100, hemi: [0x8a5cff, 0x120a22, 0.9], sun: [0xc9b0ff, 0.7],
    wall: 'led', curb: ['#ff3fbf', '#7a5cff'], sea: null, exposure: 1.15, envInt: 0.7, night: true,
  },
  blossom: {
    fog: 0xc6daee, fogNear: 320, fogFar: 3000, hemi: [0xdcefff, 0x5d7a45, 1.2], sun: [0xfff3e0, 3.0],
    wall: 'wood', curb: ['#d93a3a', '#ffffff'], sea: -2.2, exposure: 0.92, envInt: 0.9,
  },
};

export function buildWorld(scene, tr, def, quality, renderer) {
  const NIGHT = def.theme === 'neon' || def.theme === 'kpop'; // 밤 도시 계열(네온·공연장)
  let _pt = performance.now(); const _prof = (window.__kartProf = []); // 코스 만들기 구간별 시간(검사용)
  const PROF = (n) => { const t = performance.now(); _prof.push([n, Math.round(t - _pt)]); _pt = t; };
  const th = THEMES[def.theme];
  const W = { update: [], boxes: [], pads: [], theme: th, groundAt: null };
  const R = rng(def.id.length * 7919 + 13);
  const N = tr.N, half = tr.half, band = tr.band, edge = half + band;
  scene.fog = new T.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = new T.Color(th.fog);

  // ---------- 조명 ----------
  const hemi = new T.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]); scene.add(hemi);
  const sun = new T.DirectionalLight(th.sun[0], th.sun[1]);
  PROF('// ---------- ');
  // ---------- 하늘 (실시간 대기·구름 / 밤하늘) ----------
  const sd = makeSky(scene, def.theme, renderer, W).clone();
  if (NIGHT) sd.set(0.4, 0.8, 0.3).normalize();
  sd.y = Math.max(sd.y, 0.32); sd.normalize(); // 해가 낮아도 그림자가 너무 길지 않게
  sun.userData.dir = sd;
  scene.environmentIntensity = th.envInt;
  if (quality >= 2) {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -55; c.right = 55; c.top = 55; c.bottom = -55; c.near = 1; c.far = 300;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  }
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;

  PROF('// ---------- ');
  // ---------- 지형 높이 ----------
  const b = tr.bounds, M = 300;
  const gx0 = b.minx - M, gz0 = b.minz - M, GW = b.maxx - b.minx + 2 * M, GD = b.maxz - b.minz + 2 * M;
  const RES = quality >= 2 ? 4 : 5;
  const NX = Math.ceil(GW / RES), NZ = Math.ceil(GD / RES);
  const H = new Float32Array((NX + 1) * (NZ + 1));
  const ND = new Float32Array(H.length), NY = new Float32Array(H.length), NI = new Int32Array(H.length); // 가까운 도로까지 거리·그 높이 (칠할 때 다시 쓴다)
  function farH(x, z, ny) {
    if (def.theme === 'beach') return -4.5 + fbm(x * 0.006, z * 0.006) * 5;
    if (NIGHT) return 0;
    // 벚꽃: 산이 멀수록 높아진다
    return ny + 3 + fbm(x * 0.008, z * 0.008) * 34;
  }
  // 도로까지 거리: 칸마다 가장 가까운 도로를 찾지 않고, 도로 표본에서 주변 칸으로 거리를 찍어 나간다(훨씬 빠름)
  const W1 = NX + 1, RS = edge + 76;
  // 다리 구간 가중치(끝에서 부드럽게)
  let bridgeW = null;
  const bridgeLow = def.theme === 'blossom' ? th.sea - 3 : 0;
  if (def.bridges) {
    bridgeW = new Float32Array(N);
    for (const [u0, u1] of def.bridges) for (let i = Math.floor(u0 * N); i <= Math.ceil(u1 * N); i++) {
      const e = Math.min(i - u0 * N, u1 * N - i);
      bridgeW[((i % N) + N) % N] = Math.max(bridgeW[((i % N) + N) % N], smooth(0, 14, e));
    }
  }
  ND.fill(1e9);
  const rC = Math.ceil(RS / RES);
  for (let k = 0; k < tr.N; k += 2) {
    const px = tr.x[k], pz = tr.z[k], py = tr.y[k];
    const ci = Math.round((px - gx0) / RES), cj = Math.round((pz - gz0) / RES);
    for (let j = Math.max(0, cj - rC); j <= Math.min(NZ, cj + rC); j++) {
      const dz = gz0 + j * RES - pz, dz2 = dz * dz, row = j * W1;
      for (let i = Math.max(0, ci - rC); i <= Math.min(NX, ci + rC); i++) {
        const dx = gx0 + i * RES - px, d2 = dx * dx + dz2;
        if (d2 < ND[row + i]) { ND[row + i] = d2; NY[row + i] = py; NI[row + i] = k; }
      }
    }
  }
  // 멀리 있는 칸의 도로 높이는 성긴 격자로 대충
  const CR = 8, CNX = Math.ceil(NX / CR) + 1, CNZ = Math.ceil(NZ / CR) + 1, CY = new Float32Array(CNX * CNZ);
  for (let j = 0; j < CNZ; j++) for (let i = 0; i < CNX; i++) CY[j * CNX + i] = tr.nearest(gx0 + i * CR * RES, gz0 + j * CR * RES, 900).y;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = gx0 + i * RES, z = gz0 + j * RES, q = j * W1 + i;
    let d = ND[q] < 1e8 ? Math.sqrt(ND[q]) : 1e4;
    if (d > RS) { const ci = Math.min(CNX - 1, Math.round(i / CR)), cj = Math.min(CNZ - 1, Math.round(j / CR)); NY[q] = CY[cj * CNX + ci]; }
    ND[q] = d;
    const ny = NY[q], near = ny - 0.12;
    let h;
    if (d < edge + 1) h = near;
    else {
      const t = smooth(edge + 1, edge + (def.theme === 'blossom' ? 70 : 42), d);
      const fh = farH(x, z, ny);
      h = near + (fh - near) * t;
      if (def.theme === 'blossom' && t > 0) h = Math.max(h, near - 0.5 * t * 8);
    }
    // 다리 밑: 땅을 낮춘다(벚꽃은 강, 공연장은 바닥)
    if (bridgeW && d < edge + 70) {
      const bw = bridgeW[NI[q]] * (1 - smooth(edge + 30, edge + 70, d));
      if (bw > 0) h = h + (bridgeLow - h) * bw;
    }
    H[q] = h;
  }
  const groundAt = (x, z) => {
    const fi = (x - gx0) / RES, fj = (z - gz0) / RES;
    const i = Math.max(0, Math.min(NX - 1, Math.floor(fi))), j = Math.max(0, Math.min(NZ - 1, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const a = H[j * (NX + 1) + i], bb = H[j * (NX + 1) + i + 1], c = H[(j + 1) * (NX + 1) + i], d = H[(j + 1) * (NX + 1) + i + 1];
    return a + (bb - a) * u + (c - a) * v + (a - bb - c + d) * u * v;
  };
  W.groundAt = groundAt;
  tr.groundAt = groundAt; tr.seaY = th.sea;

  PROF('// 지형 메시: 모래·풀');
  // 지형 메시: 모래·풀·바위·흙을 경사·높이·노이즈로 섞어 칠한다
  {
    const g = new T.PlaneGeometry(GW, GD, NX, NZ); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), spl = new Float32Array(pos.count * 4);
    const Hs = (i, j) => H[Math.max(0, Math.min(NZ, j)) * (NX + 1) + Math.max(0, Math.min(NX, i))];
    for (let k = 0; k < pos.count; k++) {
      const i = k % (NX + 1), j = Math.floor(k / (NX + 1));
      const h = H[j * (NX + 1) + i];
      const x = gx0 + i * RES, z = gz0 + j * RES;
      pos.setX(k, x); pos.setZ(k, z); pos.setY(k, h);
      const slope = Math.hypot(Hs(i + 1, j) - Hs(i - 1, j), Hs(i, j + 1) - Hs(i, j - 1)) / (2 * RES);
      const nd = ND[k];
      const n1 = fbm(x * 0.02, z * 0.02), n2 = fbm(x * 0.07 + 40, z * 0.07);
      let w0 = 0, w1 = 0, w2 = 0, w3 = 0, tint = 1;
      if (def.theme === 'beach') {       // 0 모래, 1 풀, 2 바위, 3 흙
        w0 = 1;
        w1 = smooth(0.52, 0.66, n1) * smooth(1.0, 2.5, h) * smooth(edge + 3, edge + 12, nd);
        w2 = smooth(0.28, 0.6, slope);
        w3 = smooth(half + 0.5, half + 1.2, nd) * (1 - smooth(edge - 2, edge + 3, nd)) * 0.35 * n2;
        tint = 1 - smooth(0.6, -1.3, h) * 0.38; // 젖은 모래
      } else if (def.theme === 'blossom') { // 0 풀, 1 흙, 2 바위, 3 모래
        w0 = 1;
        w1 = (1 - smooth(half + 1, edge + 2.5, nd)) * 0.9 + smooth(0.62, 0.75, n2) * 0.5;
        w2 = Math.max(smooth(0.35, 0.7, slope), smooth(25, 45, h - NY[k]) * 0.8);
        w3 = smooth(-0.6, -1.8, h - th.sea) ;
        tint = 0.92 + n1 * 0.16;
      } else {                            // 0 네온 타일, 1 아스팔트, 2 바위, 3 흙
        w0 = 1 - smooth(edge + 14, edge + 40, nd);
        w1 = 1 - w0; tint = 0.9;
      }
      spl[k * 4] = w0; spl[k * 4 + 1] = w1; spl[k * 4 + 2] = w2; spl[k * 4 + 3] = w3;
      col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = tint;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('splat', new T.BufferAttribute(spl, 4));
    g.computeVertexNormals();
    const names = def.theme === 'beach' ? ['tex-sand', 'tex-grass', 'tex-rock', 'tex-dirt']
      : def.theme === 'blossom' ? ['tex-grass', 'tex-dirt', 'tex-rock', 'tex-sand'] : ['tex-neon', 'tex-asphalt-wet', 'tex-rock', 'tex-dirt'];
    // 요철은 높은 화질·낮 코스만(폰 해상도·네온 반사에선 반짝이는 점으로 깨짐)
    const m = splatMaterial(names, NIGHT ? { rough: 0.75, metal: 0.05, scales: [12, 10, 14, 8], bump: 0 } : { scales: def.theme === 'beach' ? [11, 9, 16, 8] : [8, 7, 16, 11], bump: quality >= 2 ? 1.4 : 0 });
    if (NIGHT) { m.emissive = new T.Color(0x3a3a70); m.emissiveIntensity = 0.5; }
    const mesh = new T.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
    const far = new T.Mesh(new T.CircleGeometry(3200, 32).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: NIGHT ? 0x0c0b1c : def.theme === 'beach' ? 0x2a8fb0 : 0x6f9a62, roughness: 1 }));
    far.position.y = def.theme === 'beach' ? -6 : NIGHT ? -0.3 : -6; scene.add(far);
  }

  PROF('// ---------- ');
  // ---------- 바다·호수 (반사하는 물) ----------
  if (th.sea != null) makeWater(scene, th.sea, def.theme, W.sunDir || sd, quality, W);

  PROF('// ---------- ');
  // ---------- 도로 ----------
  const roadT = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = NIGHT ? '#1c1c26' : '#4a4d55'; g.fillRect(0, 0, w, h);
    // 결: 잔자갈
    // 밤 코스는 네온에 반짝이는 점으로 보여서 뺀다
    for (let i = 0; i < (NIGHT ? 0 : 9000); i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${0.03 + Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // 가장자리 흰 선
    g.fillStyle = NIGHT ? '#e8f6ff' : '#f4f4f0';
    g.fillRect(w * 0.035, 0, w * 0.018, h); g.fillRect(w * 0.947, 0, w * 0.018, h);
    // 타이어 자국
    g.strokeStyle = 'rgba(10,10,12,.18)'; g.lineWidth = 14;
    for (const x of [0.32, 0.42, 0.58, 0.68]) { g.beginPath(); g.moveTo(w * x, 0); g.lineTo(w * x + (Math.random() - 0.5) * 8, h); g.stroke(); }
  });
  const asphalt = tex(NIGHT ? 'tex-asphalt-wet' : 'tex-asphalt', 1);
  W.aspGain = 1.9; // 실사 질감 평균 밝기에 맞춘 보정
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
    // 밤 코스: 반들거리면 밤하늘(별·관중 불빛) 반사가 분홍 점으로 깨진다 → 덜 반들·반사 약하게
    const m = new T.MeshStandardMaterial({ map: roadT, roughness: NIGHT ? 0.72 : 0.82, metalness: NIGHT ? 0.05 : 0, envMapIntensity: NIGHT ? 0.3 : 1 });
    // 실제 아스팔트 사진을 곱해 결을 살린다
    m.onBeforeCompile = (sh) => {
      sh.uniforms.asphalt = { value: asphalt };
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D asphalt;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n vec3 asp = texture2D(asphalt, vMapUv * vec2(3.0, 3.0)).rgb; diffuseColor.rgb *= mix(vec3(1.0), asp * ASP_GAIN, ASP_MIX);')
        .replace('#include <normal_fragment_maps>', quality >= 2 && !NIGHT ? BUMP_GLSL('dot(asp, vec3(0.3, 0.59, 0.11))', '0.45') : '#include <normal_fragment_maps>')
        .replace('ASP_GAIN', W.aspGain.toFixed(2)).replace('ASP_MIX', NIGHT ? '0.4' : '0.75');
    };
    const road = new T.Mesh(g, m); road.receiveShadow = true; scene.add(road);
  }

  // ---------- 연석(굽은 곳만) ----------
  {
    const curbT = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = NIGHT ? th.curb[0] : th.curb[0]; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = NIGHT ? th.curb[1] : '#dedad2'; g.fillRect(0, h / 2, w, h / 2);
    });
    const curbM = new T.MeshStandardMaterial({ map: curbT, roughness: 0.6 });
    if (NIGHT) { curbM.emissiveMap = curbT; curbM.emissive = new T.Color(0xffffff); curbM.emissiveIntensity = 0.45; }
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
        for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#dcdcd6' : '#c92f2f'; g.fillRect(i * w / 8, 0, w / 8, h); }
        g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h - 8, w, 8);
      });
      wm = new T.MeshStandardMaterial({ map: wallT, roughness: 0.5 });
    } else if (th.wall === 'led') {
      // 공연장 LED 펜스: 무지개 띠가 흘러간다
      wallT = canvasTex(1024, 64, (g, w, h) => {
        g.fillStyle = '#0b0714'; g.fillRect(0, 0, w, h);
        for (let x = 0; x < w; x += 4) { g.fillStyle = `hsl(${(x / w) * 360 * 2}, 100%, 60%)`; g.fillRect(x, 10, 3, h - 20); }
        g.fillStyle = 'rgba(0,0,0,.55)'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
      });
      wm = new T.MeshStandardMaterial({ map: wallT, emissiveMap: wallT, emissive: new T.Color(0xffffff), emissiveIntensity: 1.3, roughness: 0.4 });
      W.update.push((dt, t) => { wallT.offset.x = t * 0.12; });
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
        if (i < N && !(tr.open && tr.open[k] && tr.open[(k + 1) % N])) { if (side > 0) idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3); else idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); }
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

  // ---------- 코너: 화살표 표지판 + 타이어 벽 (다리·터널·열린 구간은 빼고) ----------
  {
    const inR = (rs, u) => rs && rs.some(([a, b]) => u >= a - 0.02 && u <= b + 0.02);
    const apex = [];
    for (let i = 0; i < N; i++) {
      const c = Math.abs(tr.curv[i]); if (c < 0.2) continue;
      let top = true; for (let k = -40; k <= 40 && top; k++) if (Math.abs(tr.curv[(i + k + N) % N]) > c) top = false;
      const u = i / N;
      if (top && !inR(def.bridges, u) && !inR(def.tunnels, u) && !inR(def.open, u) && (u > 0.04 && u < 0.96) && !apex.some(a => Math.abs(a - i) < 60)) apex.push(i);
    }
    const chevT = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = NIGHT ? '#140c22' : '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = NIGHT ? '#ff3fbf' : '#d8262e';
      for (let k = 0; k < 3; k++) { const x = 30 + k * 72; g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 40, h / 2); g.lineTo(x, h - 12); g.lineTo(x + 22, h - 12); g.lineTo(x + 62, h / 2); g.lineTo(x + 22, 12); g.closePath(); g.fill(); }
      g.strokeStyle = NIGHT ? '#39e0ff' : '#222'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    });
    const chevM = new T.MeshStandardMaterial({ map: chevT, roughness: 0.5, side: T.DoubleSide });
    if (NIGHT) { chevM.emissiveMap = chevT; chevM.emissive = new T.Color(0xffffff); chevM.emissiveIntensity = 1.2; }
    const postM = new T.MeshStandardMaterial({ color: 0x55585f, metalness: 0.6, roughness: 0.4 });
    const tireG = new T.TorusGeometry(0.42, 0.2, 8, 16).rotateX(Math.PI / 2);
    const tireM = new T.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.85 });
    const tireN = apex.length * 3 * 3 * 2;
    const tires = new T.InstancedMesh(tireG, tireM, Math.max(1, tireN)); let ti = 0;
    const tcol = [new T.Color(0x1b1c20), new T.Color(NIGHT ? 0x39e0ff : 0xd8262e), new T.Color(0xf2f2f2)];
    const mtx = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1);
    for (const ai of apex) {
      const out = tr.curv[ai] > 0 ? 1 : -1; // +면 왼쪽으로 굽음 → 바깥은 오른쪽
      const turnLeft = out > 0;
      // 표지판: 꼭짓점 조금 앞, 바깥 벽 뒤에서 들어오는 차를 본다
      const si = (ai - 14 + N) % N, L = edge + 1.6;
      const sx = tr.x[si] + tr.rx[si] * L * out, sz = tr.z[si] + tr.rz[si] * L * out, sy = tr.y[si];
      const board = new T.Mesh(new T.PlaneGeometry(4.2, 1.6), chevM);
      board.position.set(sx, sy + 1.9, sz); board.rotation.y = Math.atan2(tr.fx[si], tr.fz[si]) + Math.PI;
      board.scale.x = turnLeft ? -1 : 1; // 화살표가 도는 쪽을 가리키게
      scene.add(board);
      for (const px of [-1.5, 1.5]) { const p = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 1.9, 6), postM); p.position.set(sx, sy + 0.55, sz); p.position.x += tr.rx[si] * px; p.position.z += tr.rz[si] * px; scene.add(p); }
      // 타이어 벽: 꼭짓점 바깥에 3줄 × 3단
      for (let j = -1; j <= 1; j++) {
        const k = (ai + j * 6 + N) % N;
        for (const dl of [0.9, 1.8]) {
          const bx = tr.x[k] + tr.rx[k] * (edge + dl) * out, bz = tr.z[k] + tr.rz[k] * (edge + dl) * out;
          for (let h = 0; h < 3 && ti < tireN; h++) {
            mtx.compose(new T.Vector3(bx, tr.y[k] + 0.2 + h * 0.4, bz), q, one); tires.setMatrixAt(ti, mtx);
            tires.setColorAt(ti, tcol[h === 1 ? 1 : (j + 1) % 2 ? 0 : 2]); ti++;
          }
        }
      }
    }
    tires.count = ti; tires.castShadow = quality >= 2; if (ti) scene.add(tires);
  }
  // 출발선 앞 노면 글자
  {
    const tt = canvasTex(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.font = '400 150px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,.82)'; g.fillText('SUPERSTAR', w / 2, h / 2 + 8);
    });
    const i0 = Math.round(N - 22 / tr.seg);
    const m = new T.Mesh(new T.PlaneGeometry(2 * half * 0.86, 2 * half * 0.86 / 4).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: tt, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.position.set(tr.x[i0], tr.y[i0] + 0.05, tr.z[i0]); m.rotation.y = Math.atan2(tr.fx[i0], tr.fz[i0]) + Math.PI;
    scene.add(m);
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

  PROF('// ---------- ');
  // ---------- 테마별 소품 ----------
  const dense = quality >= 2 ? 1 : 0.6;
  if (def.theme === 'beach') {
    // 야자수 — 휜 줄기 + 사진 잎 카드
    const palms = scatter(Math.round(210 * dense), 2.5, 70, (x, y) => y > th.sea + 0.5).map(o => ({ ...o, s: 0.85 + R() * 0.45 }));
    plantPalms(scene, palms, quality, W);
    // 모래언덕 풀
    plantGrass(scene, scatter(Math.round(1400 * dense), 0.5, 40, (x, y) => y > 0.8).map(o => ({ ...o, s: 0.7 + R() * 0.6 })), W, 0xd8e0a0);
    // 파라솔
    const upar = [];
    const top = new T.ConeGeometry(2.1, 0.8, 10); top.translate(0, 2.6, 0); upar.push(colored(top, 0xffffff));
    const pole = new T.CylinderGeometry(0.05, 0.05, 2.6, 5); pole.translate(0, 1.3, 0); upar.push(colored(pole, 0xeeeeee));
    const umb = mergeGeometries(upar.map(p => p.index ? p.toNonIndexed() : p));
    const umbs = scatter(Math.round(60 * dense), 4, 26, (x, y) => y > th.sea + 0.3);
    const cols = [0xff5a5a, 0x2fb0ff, 0xffd23a, 0x3ad28f, 0xff8ad0];
    instanced(umb, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), umbs, true, (o, k) => new T.Color(cols[k % cols.length]));
    // 바위
    placeRocks(scene, scatter(Math.round(90 * dense), 5, 70).map(o => ({ ...o, s: o.s * 1.5, sy: o.s * 1.1, rx: R() * 0.4, rz: R() * 0.4 })));
    // 먼 바다의 섬과 등대
    islands(scene, (b.minx + b.maxx) / 2, (b.minz + b.maxz) / 2, th.sea, R);
    if (ENV_ART.includes('bg-beach')) backdrop(scene, 'bg-beach', (b.minx + b.maxx) / 2, (b.minz + b.maxz) / 2, th.sea, { haze: th.fog, hazeAmt: 0.22, sink: 2 });
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
    // 빌딩 — 창문은 셰이더로 3m 격자에 찍는다(크기가 달라도 창 크기는 같게)
    const bm = windowMaterial();
    const bg = new T.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    const blds = scatter(Math.round(200 * dense), 16, 170).map(o => {
      const w = 14 + R() * 18, d = 14 + R() * 18, hh = 24 + R() * R() * 130;
      return { ...o, y: o.y - 0.5, sx: w, sy: hh, sz: d, r: tr.nearest(o.x, o.z).i >= 0 ? Math.atan2(tr.fx[o.i], tr.fz[o.i]) : 0 };
    });
    instanced(bg, bm, blds, true, () => new T.Color().setHSL(0.62 + R() * 0.2, 0.35, 0.5 + R() * 0.3));
    // 옥상 네온 테두리·간판
    const signCols = [0xff2fa0, 0x1ee6ff, 0xffd24a, 0x7dff8a, 0xb47bff];
    const rims = [], signs = [];
    blds.forEach((o, k) => {
      if (R() < 0.55) rims.push({ ...o, y: o.y + o.sy, sy: 0.6, sx: o.sx * 1.02, sz: o.sz * 1.02, c: signCols[k % 5] });
      if (R() < 0.3) { const c = Math.cos(o.r), sn = Math.sin(o.r); signs.push({ x: o.x - sn * 0 + c * 0, y: o.y + o.sy * (0.45 + R() * 0.35), z: o.z, r: o.r + (R() < 0.5 ? 0 : Math.PI / 2), s: 1, sx: o.sx * 1.04, sy: 5 + R() * 4, sz: 1.2, c: signCols[(k + 2) % 5] }); }
    });
    const rimM = new T.MeshBasicMaterial({ color: 0xffffff, fog: true });
    const rimI = instanced(new T.BoxGeometry(1, 1, 1), rimM, rims, false, (o) => new T.Color(o.c).multiplyScalar(1.4));
    const signI = instanced(new T.BoxGeometry(1, 1, 1), rimM, signs, false, (o) => new T.Color(o.c).multiplyScalar(1.1));
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
    skyline(scene, (b.minx + b.maxx) / 2, (b.minz + b.maxz) / 2, bm, R);
    if (ENV_ART.includes('bg-neon')) backdrop(scene, 'bg-neon', (b.minx + b.maxx) / 2, (b.minz + b.maxz) / 2, 0, { haze: th.fog, hazeAmt: 0.12, gain: 1.1, sink: 20 });
    fireworks(scene, W, tr, R);
  }

  if (def.theme === 'blossom') {
    // 벚나무 — 꽃송이 사진 카드로 부풀린 수관
    plantCherries(scene, scatter(Math.round(300 * dense), 1.5, 70).map(o => ({ ...o, s: 1.0 + R() * 0.5 })), quality, W);
    // 소나무
    plantPines(scene, scatter(Math.round(200 * dense), 22, 150).map(o => ({ ...o, s: 1 + R() * 0.6 })), quality, W);
    // 바위
    placeRocks(scene, scatter(Math.round(90 * dense), 3, 60).map(o => ({ ...o, s: o.s * 1.3, sy: o.s * 0.9, rx: R() * 0.4, rz: R() * 0.4 })));
    // 들풀과 꽃
    plantGrass(scene, scatter(Math.round(3200 * dense), 0.3, 45).map(o => ({ ...o, s: 0.7 + R() * 0.7 })), W);
    // 먼 산맥
    mountains(scene, (b.minx + b.maxx) / 2, (b.minz + b.maxz) / 2, 0, R);
    if (ENV_ART.includes('bg-blossom')) backdrop(scene, 'bg-blossom', (b.minx + b.maxx) / 2, (b.minz + b.maxz) / 2, 0, { haze: th.fog, hazeAmt: 0.3, sink: 30, r: 3000 });
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

  PROF('// ---------- ');
  if (def.theme === 'kpop') {
    const ct = crowdTexture(true);
    kpopArena(scene, W, tr, def, edge, quality, R, { crowdTex: ct });
    fireworks(scene, W, tr, R);
    // 트랙 위 트러스 게이트(LED)
    const trussM = new T.MeshStandardMaterial({ color: 0x9aa0ae, metalness: 0.9, roughness: 0.35 });
    for (let k = 0; k < 10; k++) {
      const i = Math.floor(((k + 0.3) / 10) * N), g = new T.Group();
      for (const sx of [-1, 1]) { const p = new T.Mesh(new T.BoxGeometry(0.9, 9, 0.9), trussM); p.position.set(sx * (edge - 0.4), 4.5, 0); g.add(p); }
      const beam = new T.Mesh(new T.BoxGeometry(2 * edge, 0.9, 0.9), trussM); beam.position.y = 9; g.add(beam);
      const led = new T.Mesh(new T.BoxGeometry(2 * edge - 2, 1.4, 0.2), new T.MeshBasicMaterial({ color: [0xff3fbf, 0x39e0ff, 0xffe14a][k % 3] })); led.position.set(0, 7.9, 0); g.add(led);
      g.position.set(tr.x[i], tr.y[i], tr.z[i]); g.rotation.y = Math.atan2(tr.fx[i], tr.fz[i]); scene.add(g);
    }
  }
  // ---------- 점프대 ----------
  W.ramps = [];
  if (def.ramps) {
    const rT = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#12081e'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 4; k++) { const y = k * 64 + 8; g.fillStyle = k % 2 ? '#ff3fbf' : '#39e0ff'; g.beginPath(); g.moveTo(10, y + 40); g.lineTo(64, y); g.lineTo(118, y + 40); g.lineTo(118, y + 56); g.lineTo(64, y + 18); g.lineTo(10, y + 56); g.closePath(); g.fill(); }
    });
    const rM = new T.MeshStandardMaterial({ map: rT, emissiveMap: rT, emissive: new T.Color(0xffffff), emissiveIntensity: 1.1, roughness: 0.4 });
    const sideM = new T.MeshStandardMaterial({ color: 0x1a1024, metalness: 0.6, roughness: 0.3 });
    for (const u of def.ramps) {
      const s0 = u * N, L = 7 / tr.seg, HGT = 1.1, SEGS = 10, hw = half + 0.2;
      const pos = [], uv = [], idx = [];
      for (let k = 0; k <= SEGS; k++) {
        const s = s0 + L * k / SEGS, p = tr.point(s, 0), hgt = HGT * Math.pow(k / SEGS, 1.4), i0 = Math.floor(((s % N) + N) % N);
        const rx = tr.rx[i0], rz = tr.rz[i0];
        pos.push(p.x - rx * hw, p.y + hgt + 0.03, p.z - rz * hw, p.x + rx * hw, p.y + hgt + 0.03, p.z + rz * hw);
        uv.push(0, k / SEGS * 1.2, 1, k / SEGS * 1.2);
        if (k < SEGS) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      scene.add(new T.Mesh(g, rM));
      // 끝 벽면(뒤에서 보이는 턱)
      const e = tr.point(s0 + L, 0), i1 = Math.floor(((s0 + L) % N + N) % N);
      const back = new T.Mesh(new T.BoxGeometry(2 * hw, HGT, 0.3), sideM); back.position.set(e.x, e.y + HGT / 2, e.z); back.rotation.y = Math.atan2(tr.fx[i1], tr.fz[i1]); scene.add(back);
      W.ramps.push({ s0, L, H: HGT });
    }
  }

  // ---------- 다리: 도로 밑 상판 + 기둥 ----------
  if (def.bridges) {
    const nightB = NIGHT;
    const deckM = new T.MeshStandardMaterial({ color: nightB ? 0x1a1030 : 0x8d8579, roughness: 0.8, metalness: nightB ? 0.5 : 0 });
    const ledM = new T.MeshBasicMaterial({ color: 0x39e0ff });
    for (const [u0, u1] of def.bridges) {
      const pos = [], idx = []; let vi = 0;
      const i0 = Math.floor(u0 * N), i1 = Math.ceil(u1 * N);
      for (let i = i0; i <= i1; i += 2) {
        const k = ((i % N) + N) % N, L = edge + 0.4, y = tr.y[k];
        for (const [sx, dy] of [[-1, -0.05], [1, -0.05], [1, -1.3], [-1, -1.3]]) pos.push(tr.x[k] + tr.rx[k] * L * sx, y + dy, tr.z[k] + tr.rz[k] * L * sx);
        if (i + 2 <= i1) for (const [a, b2] of [[0, 3], [1, 2], [2, 3]]) { idx.push(vi + a, vi + 4 + a, vi + b2, vi + b2, vi + 4 + a, vi + 4 + b2); }
        vi += 4;
        // 기둥과 가장자리 빛띠
        if (i % 24 === 0) for (const sx of [-1, 1]) {
          const px = tr.x[k] + tr.rx[k] * (edge - 1) * sx, pz = tr.z[k] + tr.rz[k] * (edge - 1) * sx, gy = groundAt(px, pz);
          const hgt = y - 1.3 - gy;
          if (hgt > 1) { const pl = new T.Mesh(new T.CylinderGeometry(0.9, 1.1, hgt, 12), deckM); pl.position.set(px, gy + hgt / 2, pz); pl.castShadow = quality >= 2; scene.add(pl); }
        }
        if (nightB && i % 6 === 0) for (const sx of [-1, 1]) { const led = new T.Mesh(new T.BoxGeometry(0.25, 0.25, 4.5), ledM); led.position.set(tr.x[k] + tr.rx[k] * (edge + 0.45) * sx, y - 0.5, tr.z[k] + tr.rz[k] * (edge + 0.45) * sx); led.rotation.y = Math.atan2(tr.fx[k], tr.fz[k]); scene.add(led); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const deck = new T.Mesh(g, deckM); deck.material.side = T.DoubleSide; deck.castShadow = quality >= 2; deck.receiveShadow = true; scene.add(deck);
    }
  }
  // ---------- 터널: 도로를 덮는 반원 지붕 + 천장 빛 ----------
  if (def.tunnels) {
    const tunM = new T.MeshStandardMaterial({ color: 0x14121e, roughness: 0.5, metalness: 0.6, side: T.DoubleSide });
    const lampM = new T.MeshBasicMaterial({ color: 0xffffff });
    const cols = [0xff2fa0, 0x1ee6ff, 0xffd24a, 0x9d7bff];
    for (const [u0, u1] of def.tunnels) {
      const pos = [], idx = []; const SEG = 16; let rows = 0;
      for (let i = Math.floor(u0 * N); i <= Math.ceil(u1 * N); i += 2) {
        const k = ((i % N) + N) % N, R = edge + 0.3;
        for (let a = 0; a <= SEG; a++) { const t = Math.PI * a / SEG, c = Math.cos(t), s2 = Math.sin(t); pos.push(tr.x[k] + tr.rx[k] * R * c, tr.y[k] - 0.3 + s2 * 9, tr.z[k] + tr.rz[k] * R * c); }
        if (rows) for (let a = 0; a < SEG; a++) { const p0 = (rows - 1) * (SEG + 1) + a, p1 = rows * (SEG + 1) + a; idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); }
        rows++;
        if (i % 12 === 0) { // 고리 빛
          const ring = new T.Mesh(new T.TorusGeometry(R - 0.2, 0.18, 6, 32, Math.PI), new T.MeshBasicMaterial({ color: cols[(i / 12) % cols.length] }));
          ring.scale.y = 9 / R; ring.position.set(tr.x[k], tr.y[k] - 0.3, tr.z[k]); ring.rotation.y = Math.atan2(tr.fx[k], tr.fz[k]) + Math.PI / 2; ring.rotation.y = Math.atan2(tr.rx[k], tr.rz[k]) - Math.PI / 2; scene.add(ring);
        }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      scene.add(new T.Mesh(g, tunM));
    }
  }

  // ---------- 출발 게이트 + 관중석 + 대형 화면 ----------
  startArea(scene, W, tr, def, edge, quality, R);

  PROF('// ---------- ');
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
  PROF('끝');
  return W;
}

function startArea(scene, W, tr, def, edge, quality, R) {
  const i = 0, h = Math.atan2(tr.fx[i], tr.fz[i]);
  const gate = new T.Group();
  const night = def.theme === 'neon' || def.theme === 'kpop';
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
  const crowdT = crowdTexture(night);
  crowdT.repeat.set(3, 1);
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
  W.update.push((dt, t) => { crowdT.offset.y = Math.sin(t * 9) > 0.6 ? 0.006 : 0; });

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
