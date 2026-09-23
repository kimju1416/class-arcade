// 3D 차: 무료 Hunyuan3D로 만든 모양(GLB)에 코덱스가 그린 옆·앞·뒤·위 그림을 비춰 색을 입힌다.
// 흰 차체 부분은 캐릭터(또는 고른) 색으로 물들인다. 모양·그림은 tools/kart-car3d.py가 public/kart/cars3d/ 에 만든다.
import * as T from 'three';
import { GLTFLoader } from '/fps/addons/loaders/GLTFLoader.js';
import { CAR3D } from './car3d.js';

const cache = {};
const tl = new T.TextureLoader(), gl = new GLTFLoader();
export function hasCar3D(id) { return !!CAR3D[id]; }

// 좌석 찾기: 차 가운데 띠(|x| 작음)에서 앞뒤로 잘라 윗면 높이를 재고, 가운데 구간에서 가장 낮은 곳 = 운전석
function findSeat(geo, bb) {
  const p = geo.attributes.position, W = bb.max.x - bb.min.x, L = bb.max.z - bb.min.z, cx = (bb.min.x + bb.max.x) / 2;
  const NB = 40, top = new Float32Array(NB).fill(-Infinity);
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i) - cx) > W * 0.1) continue;
    const b = Math.min(NB - 1, Math.floor((p.getZ(i) - bb.min.z) / L * NB)); top[b] = Math.max(top[b], p.getY(i));
  }
  let best = -1, by = Infinity;
  for (let b = Math.floor(NB * 0.22); b < Math.floor(NB * 0.62); b++) if (top[b] > -Infinity && top[b] < by) { by = top[b]; best = b; }
  if (best < 0) return { y: bb.min.y + (bb.max.y - bb.min.y) * 0.35, z: bb.min.z + L * 0.4 };
  return { y: by, z: bb.min.z + (best + 0.5) / NB * L };
}

export function loadCar3D(id) {
  if (cache[id]) return cache[id];
  const R = CAR3D[id];
  const tex = (s) => { const t = tl.load(`/kart/cars3d/${id}-${s}.jpg`); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
  const ts = tex('s'), tf = tex('f'), tb = tex('b'), tt = tex('t');
  cache[id] = new Promise((res, rej) => gl.load(`/kart/cars3d/${id}.glb`, (g) => {
    let mesh; g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return rej(new Error('no mesh'));
    const geo = mesh.geometry; geo.applyMatrix4(mesh.matrixWorld); geo.computeVertexNormals(); geo.computeBoundingBox();
    const bb = geo.boundingBox;
    // 재질은 카트마다 따로(색이 다르다) — 셰이더 코드는 같아서 프로그램은 하나로 공유된다
    // 바퀴 네 개(모양 좌표): 중심 x,y,z · 반지름 r, 반폭 hw. 0·1 = 앞바퀴(꺾임)
    const wh = R.wh, W4 = [], HW = [];
    if (wh) {
      const L = bb.max.z - bb.min.z, X = (q) => bb.min.x + q * (bb.max.x - bb.min.x), Z = (q) => bb.min.z + q * L;
      for (const [front, left] of [[1, 1], [1, 0], [0, 1], [0, 0]]) {
        const r = (front ? wh.rf : wh.rr) * L, hw = Math.max((wh.w || 0) * (bb.max.x - bb.min.x), r * 0.8) / 2 * 1.08;
        const x = left ? X(wh.xl) + hw : X(wh.xr) - hw;
        W4.push(new T.Vector4(x, bb.min.y + r, Z(front ? wh.zf : wh.zr), r * 1.02)); HW.push(hw);
      }
    }
    const make = (paint) => {
      const m = new T.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
      m.userData.u = { wa: { value: 0 }, ws: { value: 0 } };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, m.userData.u, { whl: { value: W4.length ? W4 : [new T.Vector4(0, -99, 0, 0), new T.Vector4(0, -99, 0, 0), new T.Vector4(0, -99, 0, 0), new T.Vector4(0, -99, 0, 0)] }, whw: { value: HW.length ? HW : [0, 0, 0, 0] } });
        Object.assign(sh.uniforms, { tS: { value: ts }, tF: { value: tf }, tB: { value: tb }, tT: { value: tt }, bmin: { value: bb.min.clone() }, bmax: { value: bb.max.clone() },
          rS: { value: new T.Vector4(...R.s) }, rF: { value: new T.Vector4(...R.f) }, rB: { value: new T.Vector4(...R.b) }, rT: { value: new T.Vector4(...R.t) }, paint: { value: new T.Color(paint) } });
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
          varying vec3 vOP; varying vec3 vON; uniform vec4 whl[4]; uniform float whw[4]; uniform float wa, ws;
          // 점 p(또는 방향 v, isDir)가 바퀴 원통 안이면 바퀴 축(x)으로 돌리고, 앞바퀴는 세로축으로 꺾는다
          vec3 spinW(vec3 p, vec3 v, bool isDir) {
            for (int i = 0; i < 4; i++) {
              vec4 W = whl[i];
              vec2 d = p.yz - W.yz;
              if (abs(p.x - W.x) < whw[i] && dot(d, d) < W.w * W.w) {
                vec3 q = isDir ? v : v - W.xyz;
                float c = cos(wa), s = sin(wa);
                q = vec3(q.x, c * q.y - s * q.z, s * q.y + c * q.z);
                if (i < 2) { float c2 = cos(ws), s2 = sin(ws); q = vec3(c2 * q.x + s2 * q.z, q.y, -s2 * q.x + c2 * q.z); }
                return isDir ? q : q + W.xyz;
              }
            }
            return v;
          }`)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = spinW(position, objectNormal, true);')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal; transformed = spinW(position, transformed, false);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          uniform sampler2D tS, tF, tB, tT; uniform vec3 bmin, bmax, paint; uniform vec4 rS, rF, rB, rT; varying vec3 vOP; varying vec3 vON;
          vec3 pick(sampler2D t, vec4 r, float u, float v, float bias) { return texture(t, vec2(mix(r.x, r.z, u), 1.0 - mix(r.y, r.w, v)), bias).rgb; }`)
          .replace('#include <map_fragment>', `
          vec3 q = (vOP - bmin) / (bmax - bmin); vec3 N = normalize(vON);
          // 비스듬한 면일수록 흐린 단계로(늘어난 줄무늬 방지)
          vec3 cS = pick(tS, rS, 1.0 - q.z, 1.0 - q.y, (1.0 - abs(N.x)) * 3.0);   // 옆: 앞(+z)이 그림 왼쪽
          vec3 cF = pick(tF, rF, q.x, 1.0 - q.y, (1.0 - abs(N.z)) * 3.0);          // 앞: +x가 그림 오른쪽
          vec3 cB = pick(tB, rB, 1.0 - q.x, 1.0 - q.y, (1.0 - abs(N.z)) * 3.0);    // 뒤: 좌우 반대
          vec3 cT = pick(tT, rT, 1.0 - q.x, 1.0 - q.z, (1.0 - abs(N.y)) * 3.0);    // 위: 앞이 그림 위쪽
          float wS = pow(abs(N.x), 3.0), wF = pow(max(N.z, 0.0), 3.0), wB = pow(max(-N.z, 0.0), 3.0), wT = pow(max(N.y, 0.0), 3.0) * 1.2, wD = pow(max(-N.y, 0.0), 3.0);
          vec3 col = (cS * (wS + wD * 0.5) + cF * wF + cB * wB + cT * wT + vec3(0.08) * wD * 0.5) / (wS + wF + wB + wT + wD + 1e-4);
          // 흰 차체(밝고 색이 거의 없는 곳)만 고른 색으로 물들인다
          // 그늘진 흰 부분까지 한 번에(명암은 살리고 색만 바꾼다) — 검은 카본·타이어는 그대로
          float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b)), lum = dot(col, vec3(0.3, 0.59, 0.11));
          float white = smoothstep(0.26, 0.46, lum) * (1.0 - smoothstep(0.1, 0.22, mx - mn));
          vec3 painted = paint * pow(clamp(lum * 1.15, 0.0, 1.0), 0.85) * 1.1 + vec3(pow(clamp(lum - 0.82, 0.0, 1.0), 2.0) * 3.0); // 가장 밝은 곳은 반사광처럼 살짝 하얗게
          col = mix(col, painted, white);
          diffuseColor.rgb = col;`);
      };
      return m;
    };
    res({ geo, make, size: bb.getSize(new T.Vector3()), min: bb.min.clone(), max: bb.max.clone(), seat: findSeat(geo, bb) });
  }, undefined, rej));
  return cache[id];
}
