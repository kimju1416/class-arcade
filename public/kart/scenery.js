// 배경 고급화 — 실시간 하늘(구름 포함)·반사 물·섞어 칠한 지형·잎 카드 나무·풀·먼 산/섬/도시
import * as T from 'three';
import { Sky } from '/fps/addons/objects/Sky.js';
import { Water } from '/fps/addons/objects/Water.js';
import { mergeGeometries } from '/fps/addons/utils/BufferGeometryUtils.js';

const loader = new T.TextureLoader();
export function tex(name, rep = 1, srgb = true, ext = 'webp') {
  const t = loader.load(`/kart/tex/${name}.${ext}`);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8;
  return t;
}
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s; }
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------- 하늘 ----------------
// 낮·노을: three Sky(대기 산란 + 구름). 밤: 그라데이션 돔 + 별 + 달 + 서치라이트
export function makeSky(scene, theme, renderer, W) {
  const sunDir = new T.Vector3();
  const envScene = new T.Scene();
  if (theme !== 'neon') {
    const P = theme === 'beach'
      ? { elev: 9, azim: 70, turbidity: 4.5, rayleigh: 2.2, mie: 0.003, g: 0.75, cov: 0.45, dens: 0.6, elevC: 0.55, gain: 0.5 }
      : { elev: 48, azim: 140, turbidity: 2.2, rayleigh: 1.1, mie: 0.004, g: 0.8, cov: 0.4, dens: 0.5, elevC: 0.5, gain: 0.5 };
    const phi = T.MathUtils.degToRad(90 - P.elev), th = T.MathUtils.degToRad(P.azim);
    sunDir.setFromSphericalCoords(1, phi, th);
    const mk = (scale) => {
      const s = new Sky(); s.scale.setScalar(scale);
      const u = s.material.uniforms;
      u.turbidity.value = P.turbidity; u.rayleigh.value = P.rayleigh; u.mieCoefficient.value = P.mie; u.mieDirectionalG.value = P.g;
      u.sunPosition.value.copy(sunDir);
      if (theme === 'beach' && u.showSunDisc) u.showSunDisc.value = 0; // 정면 역광에서 해 원반이 블룸으로 번져 카트를 가림
      // 대기 셰이더는 노출 0.5 기준이라 너무 밝다 → 하늘만 낮춘다(장면 전체 노출은 그대로)
      s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', () => `gl_FragColor = vec4( min( texColor * ${P.gain.toFixed(3)}, vec3( 0.93 ) ), 1.0 );`);
      if (u.cloudCoverage) { u.cloudCoverage.value = P.cov; u.cloudDensity.value = P.dens; u.cloudElevation.value = P.elevC; u.cloudScale.value = 0.00022; u.cloudSpeed.value = 0.00003; }
      return s;
    };
    const sky = mk(4400); scene.add(sky); W.sky = sky;
    W.update.push((dt, t, cam) => { if (cam) sky.position.copy(cam.position); if (sky.material.uniforms.time) sky.material.uniforms.time.value = t; });
    envScene.add(mk(80));
  } else {
    sunDir.set(0.35, 0.55, -0.75).normalize();
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform float time;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float y = vD.y;
          vec3 zen = vec3(0.012,0.016,0.07), mid = vec3(0.09,0.05,0.25), hor = vec3(0.85,0.25,0.55);
          vec3 c = mix(mid, zen, smoothstep(0.05, 0.6, y));
          c = mix(hor, c, smoothstep(-0.02, 0.16, y));
          c += vec3(0.25,0.12,0.35) * exp(-abs(y) * 18.0) * 0.6; // 도시 불빛에 물든 지평선
          vec3 q = floor(vD * 420.0);
          float s = step(0.9965, h(q)) * smoothstep(0.02, 0.25, y);
          c += vec3(s) * (0.6 + 0.4 * sin(time * 3.0 + h(q + 1.0) * 40.0));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const dome = new T.Mesh(new T.SphereGeometry(2000, 48, 24), mat); dome.renderOrder = -3; scene.add(dome); W.sky = dome;
    const envDome = new T.Mesh(new T.SphereGeometry(60, 32, 16), mat); envScene.add(envDome);
    // 달
    const mcv = document.createElement('canvas'); mcv.width = mcv.height = 256;
    const g = mcv.getContext('2d');
    const halo = g.createRadialGradient(128, 128, 30, 128, 128, 128); halo.addColorStop(0, 'rgba(255,245,230,.55)'); halo.addColorStop(1, 'rgba(255,245,230,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
    const body = g.createRadialGradient(112, 112, 6, 128, 128, 44); body.addColorStop(0, '#fffdf5'); body.addColorStop(1, '#e8e1d2');
    g.fillStyle = body; g.beginPath(); g.arc(128, 128, 44, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,150,140,.35)'; for (const [x, y, r] of [[112, 118, 9], [140, 140, 12], [132, 104, 6], [110, 146, 5], [150, 118, 5]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    const mt = new T.CanvasTexture(mcv); mt.colorSpace = T.SRGBColorSpace;
    const moon = new T.Sprite(new T.SpriteMaterial({ map: mt, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
    moon.scale.set(420, 420, 1); scene.add(moon);
    // 서치라이트
    const beamM = new T.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.09, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
    const beamG = new T.ConeGeometry(28, 900, 24, 1, true).translate(0, 450, 0);
    const beams = [];
    for (let i = 0; i < 6; i++) { const b = new T.Mesh(beamG, beamM); b.userData.a = i * 1.05; beams.push(b); scene.add(b); }
    W.update.push((dt, t, cam) => {
      mat.uniforms.time.value = t;
      if (!cam) return;
      dome.position.copy(cam.position);
      moon.position.set(cam.position.x + sunDir.x * 1500, cam.position.y + sunDir.y * 1500, cam.position.z + sunDir.z * 1500);
      beams.forEach((b, i) => {
        const a = b.userData.a + 0.35, r = 900;
        b.position.set(cam.position.x + Math.cos(a) * r, -20, cam.position.z + Math.sin(a) * r);
        b.rotation.set(Math.sin(t * 0.4 + i) * 0.45, 0, Math.cos(t * 0.33 + i * 2) * 0.45);
      });
    });
  }
  // 반사 환경맵
  const pm = new T.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0, 0.1, 1000);
  scene.environment = rt.texture;
  W.sunDir = sunDir;
  return sunDir;
}

// ---------------- 물 ----------------
export function makeWater(scene, y, theme, sunDir, quality, W) {
  const normals = tex('waternormals', 1, false, 'jpg');
  const size = 6000;
  if (quality >= 2) {
    const water = new Water(new T.PlaneGeometry(size, size), {
      textureWidth: 512, textureHeight: 512, waterNormals: normals, sunDirection: sunDir.clone(),
      sunColor: theme === 'beach' ? 0xffd2a0 : 0xffffff, waterColor: theme === 'beach' ? 0x0a4f6a : 0x1d5f7a,
      distortionScale: theme === 'beach' ? 3.2 : 2.2, fog: true,
    });
    water.rotation.x = -Math.PI / 2; water.position.y = y;
    water.material.uniforms.size.value = 3.5;
    scene.add(water);
    W.update.push((dt) => { water.material.uniforms.time.value += dt * 0.55; });
    return water;
  }
  normals.repeat.set(220, 220);
  // 폰: 반사 렌더 없이 환경맵 + 물결 노멀로 반짝이게
  const m = new T.MeshPhysicalMaterial({ color: theme === 'beach' ? 0x06607e : 0x2a78a8, roughness: 0.2, metalness: 0.0, normalMap: normals, normalScale: new T.Vector2(0.6, 0.6), clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 0.7 });
  const water = new T.Mesh(new T.PlaneGeometry(size, size).rotateX(-Math.PI / 2), m);
  water.position.y = y; scene.add(water);
  W.update.push((dt, t) => { normals.offset.set(t * 0.006, t * 0.009); });
  return water;
}

// ---------------- 지형 재질: 네 가지 바닥을 섞어 칠한다 ----------------
// splat 속성(vec4) = 네 텍스처의 비율. 두 크기로 겹쳐 찍어 타일 반복이 안 보이게 한다.
export function splatMaterial(names, opts = {}) {
  const ts = names.map(n => tex(n));
  const m = new T.MeshStandardMaterial({ roughness: opts.rough ?? 0.92, metalness: opts.metal ?? 0, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tS0 = { value: ts[0] }; sh.uniforms.tS1 = { value: ts[1] }; sh.uniforms.tS2 = { value: ts[2] }; sh.uniforms.tS3 = { value: ts[3] };
    sh.uniforms.sc = { value: new T.Vector4(...(opts.scales || [9, 10, 14, 8])) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tS0, tS1, tS2, tS3; uniform vec4 sc; varying vec4 vSplat; varying vec3 vWP;
        vec3 two(sampler2D t, float s){ vec2 u = vWP.xz / s; vec3 a = texture2D(t, u).rgb; vec3 b = texture2D(t, u * 0.27 + 0.31).rgb; return mix(a, b, 0.38); }`)
      .replace('#include <map_fragment>', `
        vec4 w = vSplat; w /= max(0.001, w.x + w.y + w.z + w.w);
        vec3 col = vec3(0.0);
        if (w.x > 0.01) col += two(tS0, sc.x) * w.x;
        if (w.y > 0.01) col += two(tS1, sc.y) * w.y;
        if (w.z > 0.01) col += two(tS2, sc.z) * w.z;
        if (w.w > 0.01) col += two(tS3, sc.w) * w.w;
        float mac = sin(vWP.x * 0.021 + sin(vWP.z * 0.017) * 2.0) * sin(vWP.z * 0.019 + 1.3) * 0.5 + 0.5;
        col *= 0.86 + mac * 0.24;
        diffuseColor.rgb *= col;`);
  };
  return m;
}

// ---------------- 잎 카드 재질 ----------------
function cardMaterial(name, wind = 0) {
  const t = tex(name); t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
  const m = new T.MeshStandardMaterial({ map: t, alphaTest: 0.42, side: T.DoubleSide, roughness: 0.85 });
  const u = { time: { value: 0 } };
  if (wind) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.time = u.time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float time;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;
          float k = ${wind.toFixed(3)} * max(0.0, position.y);
          transformed.x += sin(time * 1.6 + ph) * k; transformed.z += cos(time * 1.3 + ph) * k * 0.6;`);
    };
  }
  const depth = new T.MeshDepthMaterial({ map: t, alphaTest: 0.42, depthPacking: T.RGBADepthPacking, side: T.DoubleSide });
  return { m, u, depth };
}

// 평면을 휘게: 길이 방향 x에 따라 y를 내린다
function frondGeo(len, wid) {
  const g = new T.PlaneGeometry(len, wid, 10, 2);
  g.translate(len / 2, 0, 0); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, 0.55 * x - 0.13 * x * x - Math.abs(z) * 0.25);
  }
  g.computeVertexNormals();
  return g;
}
function card(w, h, cx, cy, cz, ry, rx = 0) {
  const g = new T.PlaneGeometry(w, h);
  g.rotateX(rx); g.rotateY(ry); g.translate(cx, cy, cz);
  return g;
}
// 잎 뭉치는 법선을 나무 중심에서 바깥으로 — 솜처럼 부드럽게 빛을 받는다
function puffNormals(g, cx, cy, cz) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const v = new T.Vector3(p.getX(i) - cx, (p.getY(i) - cy) * 1.4, p.getZ(i) - cz).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

function placeInstanced(scene, geo, mat, list, shadow, depth) {
  const im = new T.InstancedMesh(geo, mat, list.length);
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
  list.forEach((o, k) => {
    e.set(o.rx || 0, o.r, o.rz || 0); q.setFromEuler(e); s.set(o.sx || o.s, o.sy || o.s, o.sz || o.s); p.set(o.x, o.y, o.z);
    m4.compose(p, q, s); im.setMatrixAt(k, m4);
  });
  im.castShadow = !!shadow; im.receiveShadow = true;
  if (depth) im.customDepthMaterial = depth;
  scene.add(im); return im;
}

// ---------------- 나무·풀 ----------------
export function plantPalms(scene, list, quality, W) {
  const R = () => Math.random();
  const bark = tex('tex-bark'); bark.repeat.set(1, 4);
  const trunkM = new T.MeshStandardMaterial({ map: bark, roughness: 0.95 });
  const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0.35, 3, 0), new T.Vector3(1.1, 6.5, 0), new T.Vector3(2.1, 9.4, 0)]);
  const trunk = new T.TubeGeometry(curve, 14, 0.3, 8);
  // 아래가 굵게
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); const k = 1 + Math.max(0, (3 - y)) * 0.12; const c = curve.getPointAt(Math.min(1, Math.max(0, y / 9.6))); tp.setX(i, c.x + (tp.getX(i) - c.x) * k); tp.setZ(i, c.z + tp.getZ(i) * k); }
  trunk.computeVertexNormals();
  const leaf = cardMaterial('leaf-palm', 0.05);
  const parts = [];
  for (let k = 0; k < 10; k++) {
    const f = frondGeo(5.4, 1.9);
    f.rotateZ(k % 2 ? -0.05 : 0.12);
    f.rotateY(k * (Math.PI * 2 / 10) + (k % 3) * 0.2);
    f.translate(2.1, 9.35, 0);
    parts.push(f);
  }
  const top = mergeGeometries(parts);
  const co = new T.SphereGeometry(0.28, 8, 6);
  const coM = new T.MeshStandardMaterial({ color: 0x5b3a1a, roughness: 0.6 });
  const cocos = [];
  placeInstanced(scene, trunk, trunkM, list, quality >= 2);
  placeInstanced(scene, top, leaf.m, list, quality >= 2, leaf.depth);
  for (const o of list) for (let i = 0; i < 3; i++) {
    const a = o.r + i * 2.1; const c = Math.cos(o.r), s = Math.sin(o.r);
    const lx = 2.1 + Math.cos(a) * 0.35, lz = Math.sin(a) * 0.35;
    cocos.push({ x: o.x + (lx * c + lz * s) * o.s, y: o.y + 9.0 * o.s, z: o.z + (-lx * s + lz * c) * o.s, r: 0, s: o.s });
  }
  placeInstanced(scene, co, coM, cocos, false);
  W.update.push((dt, t) => { leaf.u.time.value = t; });
}

export function plantCherries(scene, list, quality, W) {
  const bark = tex('tex-bark'); bark.repeat.set(2, 2);
  const trunkM = new T.MeshStandardMaterial({ map: bark, color: 0x8a6a5a, roughness: 0.95 });
  const branches = [];
  const tube = (pts, r) => new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p => new T.Vector3(...p))), 8, r, 6);
  branches.push(tube([[0, 0, 0], [0.2, 2, 0.1], [-0.1, 4, 0], [0.1, 5.2, 0]], 0.38));
  branches.push(tube([[0, 3.6, 0], [-1.2, 4.6, 0.3], [-2.4, 5.6, 0.5]], 0.17));
  branches.push(tube([[0, 3.9, 0], [1.3, 4.9, -0.4], [2.3, 6, -0.8]], 0.16));
  branches.push(tube([[0, 4.6, 0], [0.3, 5.8, 1.2], [0.6, 6.8, 1.9]], 0.14));
  const trunk = mergeGeometries(branches);
  // 수관: 울퉁불퉁한 공 여러 개를 뭉쳐 부피를 만들고, 꽃 무더기 텍스처를 세 방향에서 투영해 입힌다
  const Rn = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const blobs = [];
  const centers = [[0, 6.6, 0, 2.3], [-1.9, 5.9, 0.4, 1.7], [1.9, 6.1, -0.5, 1.8], [0.3, 8.0, 0.6, 1.6], [-0.7, 6.9, -1.8, 1.6], [1.0, 6.8, 1.8, 1.5], [-2.6, 6.4, -0.9, 1.2], [2.5, 7.0, 1.0, 1.2], [0.0, 5.4, -1.6, 1.3], [-1.2, 7.8, 1.3, 1.2]];
  for (const [x, y, z, r] of centers) {
    const g = new T.IcosahedronGeometry(r, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new T.Vector3().fromBufferAttribute(p, i).normalize();
      const n = fbm(v.x * 2.4 + x * 3, v.z * 2.4 + v.y * 1.7 + z * 3, 3);
      const rr = r * (0.82 + n * 0.42);
      p.setXYZ(i, x + v.x * rr, y + v.y * rr * 0.86, z + v.z * rr);
    }
    g.computeVertexNormals();
    blobs.push(g);
  }
  const crown = mergeGeometries(blobs);
  // 안쪽(아래·중심)은 어둡게 — 부피감
  { const p = crown.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), d = Math.hypot(p.getX(i), p.getZ(i)); const k = 0.6 + 0.4 * smooth(4.6, 8.2, y) * (0.75 + 0.25 * smooth(0.5, 2.8, d)); col[i * 3] = k; col[i * 3 + 1] = k * 0.96; col[i * 3 + 2] = k; }
    crown.setAttribute('color', new T.BufferAttribute(col, 3)); }
  const bt = tex('tex-blossom');
  const crownM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  crownM.onBeforeCompile = (sh) => {
    sh.uniforms.tB = { value: bt };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vOP; varying vec3 vON;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vOP = position; vON = normal;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tB; varying vec3 vOP; varying vec3 vON;`)
      .replace('#include <map_fragment>', `vec3 bw = pow(abs(normalize(vON)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        float sc = 0.28;
        vec3 tb = texture2D(tB, vOP.zy * sc).rgb * bw.x + texture2D(tB, vOP.xz * sc).rgb * bw.y + texture2D(tB, vOP.xy * sc).rgb * bw.z;
        diffuseColor.rgb *= tb;`);
  };
  // 가장자리 꽃송이 카드 — 실루엣을 보송하게
  const leaf = cardMaterial('leaf-cherry', 0.03);
  leaf.m.color.set(0xf2b3cc);
  const cards = [];
  for (let i = 0; i < 16; i++) {
    const [x, y, z, r] = centers[i % centers.length];
    const a = Rn() * Math.PI * 2, e = (Rn() - 0.2) * 1.3;
    const px = x + Math.cos(a) * Math.cos(e) * r * 0.95, py = y + Math.sin(e) * r * 0.85, pz = z + Math.sin(a) * Math.cos(e) * r * 0.95;
    const sz = 1.2 + Rn() * 0.8;
    cards.push(card(sz, sz, px, py, pz, -a + Math.PI / 2, (Rn() - 0.5) * 0.8));
  }
  const fringe = puffNormals(mergeGeometries(cards), 0, 6.6, 0);
  placeInstanced(scene, trunk, trunkM, list, quality >= 2);
  placeInstanced(scene, crown, crownM, list, quality >= 2);
  placeInstanced(scene, fringe, leaf.m, list, false);
  W.update.push((dt, t) => { leaf.u.time.value = t; });
}

export function plantPines(scene, list, quality, W) {
  const bark = tex('tex-bark'); bark.repeat.set(1, 3);
  const trunkM = new T.MeshStandardMaterial({ map: bark, color: 0x7a5a48, roughness: 0.95 });
  const trunk = new T.CylinderGeometry(0.18, 0.34, 11, 7).translate(0, 5.5, 0);
  const leaf = cardMaterial('leaf-pine', 0.02);
  const cards = [];
  for (let l = 0; l < 6; l++) {
    const y = 3.2 + l * 1.45, rr = 2.9 - l * 0.42, n = 7 - Math.floor(l / 2);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + l; cards.push(card(rr * 1.5, 1.9, Math.cos(a) * rr * 0.55, y, Math.sin(a) * rr * 0.55, -a, 0.5)); }
  }
  cards.push(card(1.6, 1.8, 0, 12, 0, 0)); cards.push(card(1.6, 1.8, 0, 12, 0, Math.PI / 2));
  const crown = puffNormals(mergeGeometries(cards), 0, 7, 0);
  placeInstanced(scene, trunk, trunkM, list, quality >= 2);
  placeInstanced(scene, crown, leaf.m, list, quality >= 2, leaf.depth);
}

export function plantGrass(scene, list, W, tint) {
  const leaf = cardMaterial('leaf-grass', 0.18);
  if (tint) leaf.m.color.set(tint);
  const g = mergeGeometries([card(2.4, 0.95, 0, 0.45, 0, 0), card(2.4, 0.95, 0, 0.45, 0, Math.PI / 2)]);
  // 풀은 위를 향한 법선이라야 땅과 같은 밝기로 보인다
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  placeInstanced(scene, g, leaf.m, list, false);
  W.update.push((dt, t) => { leaf.u.time.value = t; });
}

export function placeRocks(scene, list) {
  const rt = tex('tex-rock'); rt.repeat.set(1, 1);
  const geo = new T.IcosahedronGeometry(1.2, 3);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new T.Vector3().fromBufferAttribute(p, i);
    const d = 1 + (fbm(v.x * 1.3 + 5, v.z * 1.3 + v.y * 0.7, 3) - 0.5) * 0.7;
    v.multiplyScalar(d); v.y *= 0.72; p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return placeInstanced(scene, geo, new T.MeshStandardMaterial({ map: rt, roughness: 0.95 }), list, true);
}

// ---------------- 먼 풍경 ----------------
// 섬: 노이즈로 부풀린 반구 — 아래는 바위·모래, 위는 초록
export function islands(scene, cx, cz, seaY, R) {
  const rock = tex('tex-rock'); rock.repeat.set(6, 3);
  const m = new T.MeshStandardMaterial({ map: rock, vertexColors: true, roughness: 0.95 });
  const make = (r, h, seed) => {
    const g = new T.SphereGeometry(1, 64, 28, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = fbm(x * 2.2 + seed, z * 2.2 - seed, 4);
      const k = 0.75 + n * 0.6;
      const yy = Math.pow(y, 0.8) * (0.7 + n * 0.7);
      p.setXYZ(i, x * r * k, yy * h - 3, z * r * k);
      const top = smooth(0.35, 0.7, yy), sand = 1 - smooth(0.02, 0.12, yy);
      const c = new T.Color(0x9a8d80).lerp(new T.Color(0x3f8f3a), top * 0.9).lerp(new T.Color(0xe8cf98), sand);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const out = [];
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, d = 650 + R() * 1100;
    const r = 60 + R() * 140, h = 30 + R() * 110;
    const mesh = new T.Mesh(make(r, h, i * 3.7), m);
    mesh.position.set(cx + Math.cos(a) * d, seaY, cz + Math.sin(a) * d); mesh.rotation.y = R() * 6;
    scene.add(mesh); out.push({ mesh, h });
  }
  // 등대
  const big = out[0];
  const lh = new T.Group();
  const stripe = document.createElement('canvas'); stripe.width = 8; stripe.height = 64;
  const sg = stripe.getContext('2d'); for (let i = 0; i < 4; i++) { sg.fillStyle = i % 2 ? '#fff' : '#d23a2e'; sg.fillRect(0, i * 16, 8, 16); }
  const st = new T.CanvasTexture(stripe); st.colorSpace = T.SRGBColorSpace;
  const tower = new T.Mesh(new T.CylinderGeometry(3, 4.2, 30, 16), new T.MeshStandardMaterial({ map: st, roughness: 0.6 })); tower.position.y = 15; lh.add(tower);
  const lamp = new T.Mesh(new T.SphereGeometry(3.2, 12, 8), new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 3 })); lamp.position.y = 32; lh.add(lamp);
  lh.position.copy(big.mesh.position); lh.position.y += big.h * 0.75; scene.add(lh);
}

// 산맥: 먼 거리를 빙 두른 봉우리들 — 아래는 벚꽃 숲 분홍·초록, 위는 바위
export function mountains(scene, cx, cz, baseY, R, far = 1300) {
  const rock = tex('tex-rock'); rock.repeat.set(10, 5);
  const m = new T.MeshStandardMaterial({ map: rock, vertexColors: true, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + R() * 0.3, d = far + R() * 500;
    const r = 260 + R() * 320, h = 160 + R() * 300;
    const g = new T.ConeGeometry(1, 1, 72, 24, true);
    const p = g.attributes.position, col = [];
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k) + 0.5, z = p.getZ(k);
      const ang = Math.atan2(z, x);
      const n = fbm(Math.cos(ang) * 2 + i * 5, Math.sin(ang) * 2 + y * 3, 5);
      const rad = (1 - y) * (0.8 + n * 0.5);
      p.setXYZ(k, Math.cos(ang) * rad * r, y * h * (0.85 + n * 0.3), Math.sin(ang) * rad * r);
      const hh = y;
      const pinkN = fbm(x * 9 + i, z * 9, 3);
      let c = new T.Color(0x4f7d45).lerp(new T.Color(0xf2a9c6), smooth(0.45, 0.7, pinkN) * (1 - smooth(0.25, 0.45, hh)));
      c = c.lerp(new T.Color(0x8d8a86), smooth(0.35, 0.65, hh));
      c = c.lerp(new T.Color(0xf4f6fa), smooth(0.82, 0.95, hh) * 0.8);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new T.Mesh(g, m);
    mesh.position.set(cx + Math.cos(a) * d, baseY - 10, cz + Math.sin(a) * d);
    scene.add(mesh);
  }
}

// 먼 도시: 창문 불빛 빌딩 숲
export function skyline(scene, cx, cz, winMat, R) {
  const bg = new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const uvA = bg.attributes.uv; for (let k = 8; k < 16; k++) uvA.setXY(k, 0.01, 0.01);
  const list = [];
  for (let i = 0; i < 420; i++) {
    const a = R() * Math.PI * 2, d = 560 + R() * 900;
    const w = 25 + R() * 45, h = 50 + Math.pow(R(), 2) * 320;
    list.push({ x: cx + Math.cos(a) * d, y: -2, z: cz + Math.sin(a) * d, r: R() * 3, s: 1, sx: w, sy: h, sz: w * (0.6 + R() * 0.6) });
  }
  const im = placeInstanced(scene, bg, winMat, list, false);
  const c = new T.Color();
  list.forEach((o, k) => im.setColorAt(k, c.setHSL(0.62 + R() * 0.25, 0.35, 0.35 + R() * 0.3)));
  // 꼭대기 빨간 항공등
  const tops = list.filter(o => o.sy > 180).map(o => ({ x: o.x, y: o.sy - 1, z: o.z, r: 0, s: 3 }));
  placeInstanced(scene, new T.SphereGeometry(1, 8, 6), new T.MeshBasicMaterial({ color: 0xff3040, fog: false }), tops, false);
}

// ---------------- 빌딩 창문: 월드 좌표로 창을 찍는다 ----------------
// 한 장 그림을 건물 전체에 늘이면 창 하나가 방만 해져 도트처럼 보인다 → 셰이더로 창 크기를 3m 안팎으로 고정
export function windowMaterial() {
  const m = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP2; varying vec3 vWN2; varying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vWP2 = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          vWN2 = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vSeed = instanceMatrix[3].x * 0.013 + instanceMatrix[3].z * 0.029;
        #else
          vWP2 = (modelMatrix * vec4(position, 1.0)).xyz; vWN2 = normalize(mat3(modelMatrix) * normal); vSeed = 0.0;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP2; varying vec3 vWN2; varying float vSeed;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `
        vec3 n2 = normalize(vWN2);
        float roof = step(0.6, abs(n2.y));
        float u = (abs(n2.x) > abs(n2.z) ? vWP2.z : vWP2.x) / 3.1;
        float v = vWP2.y / 3.5;
        vec2 cell = floor(vec2(u, v)); vec2 f = fract(vec2(u, v));
        float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.8) * (1.0 - roof) * step(1.2, vWP2.y);
        float r = hh(cell + vSeed * 37.0);
        float lit = step(0.56, r) * win;
        vec3 wc = mix(vec3(1.0, 0.86, 0.55), vec3(0.62, 0.9, 1.0), step(0.78, hh(cell + 3.1)));
        wc = mix(wc, vec3(1.0, 0.55, 0.85), step(0.93, hh(cell + 7.7)));
        vec3 wall = diffuseColor.rgb * mix(0.10, 0.16, hh(vec2(floor(v * 0.5), vSeed)));
        diffuseColor.rgb = mix(wall, vec3(0.05, 0.07, 0.12), win) * (1.0 - roof * 0.4);
        vec3 winGlow = wc * lit * (0.35 + 0.65 * hh(cell + 11.0));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += winGlow * 1.05;');
  };
  return m;
}

// 관중: 사람 머리·어깨를 음영까지 그린 촘촘한 줄
export function crowdTexture(night) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = night ? '#141226' : '#2e3442'; g.fillRect(0, 0, 1024, 512);
  const shirts = ['#e8413c', '#ffcf3a', '#2f9bff', '#35c07f', '#ff7fc4', '#f4f4f4', '#ff8a2f', '#8a6bff', '#1f2a44', '#c0392b'];
  const skins = ['#f3cfae', '#e8b58f', '#c98f66', '#f6dcc4'];
  const hairs = ['#1c1410', '#3a2618', '#5a3b22', '#101018'];
  for (let row = 0; row < 8; row++) {
    const y = row * 64 + 30;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 26, 1024, 8); // 계단 그림자
    for (let i = 0; i < 38; i++) {
      const x = i * 27 + (row % 2) * 13 + (Math.random() - 0.5) * 6, s = 0.9 + Math.random() * 0.25;
      const sh = shirts[Math.floor(Math.random() * shirts.length)];
      const grd = g.createLinearGradient(0, y, 0, y + 30); grd.addColorStop(0, sh); grd.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x, y + 20 * s, 11 * s, 12 * s, 0, Math.PI, 0); g.fill(); g.fillRect(x - 11 * s, y + 20 * s, 22 * s, 10);
      g.fillStyle = skins[Math.floor(Math.random() * skins.length)]; g.beginPath(); g.arc(x, y + 2, 8 * s, 0, 7); g.fill();
      g.fillStyle = hairs[Math.floor(Math.random() * hairs.length)]; g.beginPath(); g.arc(x, y - 1, 8.2 * s, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      if (Math.random() < 0.28) { g.strokeStyle = sh; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + 8, y + 16); g.lineTo(x + 14, y - 10); g.stroke(); }
      if (Math.random() < 0.12) { g.fillStyle = shirts[Math.floor(Math.random() * 6)]; g.fillRect(x - 12, y - 24, 24, 13); } // 응원 피켓
      if (night && Math.random() < 0.3) { g.fillStyle = ['#ff4fd8', '#39e0ff', '#ffe14a'][Math.floor(Math.random() * 3)]; g.fillRect(x + 10, y - 18, 3, 16); }
    }
  }
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
  return t;
}
