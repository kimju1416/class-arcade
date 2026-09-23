// 3D 캐릭터: 무료 Hunyuan3D로 만든 모양(GLB)에 코덱스 원래 앞·뒤 그림을 앞뒤로 비춰 색을 입힌다.
// 모양·그림은 tools/kart-3d.py가 public/kart/chars3d/ 에 만든다. 없는 캐릭터는 예전 2D 그림 그대로.
import * as T from 'three';
import { GLTFLoader } from '/fps/addons/loaders/GLTFLoader.js';
import { CHAR3D } from './char3d.js';

const cache = {};
const tl = new T.TextureLoader(), gl = new GLTFLoader();

export function has3D(id) { return !!CHAR3D[id]; }

// 모델에서 두 주먹 찾기: 키의 15~62% 높이에서 가장 앞(+z)으로 나온 부분을 왼쪽·오른쪽으로 나눠 가운데를 잡는다
function findFists(geo, bb) {
  const p = geo.attributes.position, H = bb.max.y - bb.min.y, y0 = bb.min.y + H * 0.15, y1 = bb.min.y + H * 0.62, cx = (bb.min.x + bb.max.x) / 2;
  let zmax = -Infinity;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > y0 && y < y1) zmax = Math.max(zmax, p.getZ(i)); }
  const L = [0, 0, 0, 0], Rt = [0, 0, 0, 0], band = H * 0.09;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i); if (y <= y0 || y >= y1 || z < zmax - band) continue;
    const a = p.getX(i) < cx ? L : Rt; a[0] += p.getX(i); a[1] += y; a[2] += z; a[3]++;
  }
  const c = (a) => a[3] ? new T.Vector3(a[0] / a[3], a[1] / a[3], a[2] / a[3]) : null;
  const l = c(L), r = c(Rt);
  if (!l || !r) return null;
  return { l, r };
}

// 캐릭터 하나의 모양+재질(여러 카트가 같이 쓴다)
export function load3D(id) {
  if (cache[id]) return cache[id];
  const R = CHAR3D[id];
  const tex = (s) => { const t = tl.load(`/kart/chars3d/${id}-${s}.jpg`); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
  const tf = tex('f'), tb = tex('b'), ts = R.s ? tex('s') : tf, th = R.h ? tex('h') : tf, tw = R.w ? tex('w') : tf;
  const V = (r) => new T.Vector4(...(r || R.f));
  cache[id] = new Promise((res, rej) => gl.load(`/kart/chars3d/${id}.glb`, (g) => {
    let mesh; g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return rej(new Error('no mesh'));
    const geo = mesh.geometry; geo.applyMatrix4(mesh.matrixWorld); geo.computeVertexNormals(); geo.computeBoundingBox();
    const bb = geo.boundingBox;
    // 재질은 카트마다 따로 만든다(맞았을 때·우승 때 얼굴 그림을 카트마다 바꾸려고). 셰이더는 같아서 프로그램은 하나
    const make = () => {
    const m = new T.MeshStandardMaterial({ roughness: 0.7 });
    m.userData.u = { face: { value: 0 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, m.userData.u, { tF: { value: tf }, tB: { value: tb }, tS: { value: ts }, tH: { value: th }, tW: { value: tw }, bmin: { value: bb.min.clone() }, bmax: { value: bb.max.clone() },
        rF: { value: V(R.f) }, rB: { value: V(R.b) }, rS: { value: V(R.s) }, rH: { value: V(R.h) }, rW: { value: V(R.w) }, hasS: { value: R.s ? 1 : 0 } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D tF, tB, tS, tH, tW; uniform vec3 bmin, bmax; uniform vec4 rF, rB, rS, rH, rW; uniform float face, hasS; varying vec3 vOP; varying vec3 vON;
        // bias: 옆으로 누운 면일수록 흐린 단계(밉맵)로 뽑아 늘어난 줄무늬 대신 부드러운 색이 되게
        vec3 pick(sampler2D t, vec4 r, float u, float v, float bias) { return texture(t, vec2(mix(r.x, r.z, u), 1.0 - mix(r.y, r.w, v)), bias).rgb; }`)
        .replace('#include <map_fragment>', `
        vec3 q = (vOP - bmin) / (bmax - bmin); vec3 N = normalize(vON);
        // 앞: 평소·어지러움·우승 얼굴 중 하나 / 뒤: 좌우 반대 / 옆: 앞(+z)이 그림 왼쪽(반대쪽은 같은 그림)
        float bias = smoothstep(0.55, 0.97, abs(N.x)) * 5.0;
        vec3 cf = face > 1.5 ? pick(tW, rW, q.x, 1.0 - q.y, bias) : face > 0.5 ? pick(tH, rH, q.x, 1.0 - q.y, bias) : pick(tF, rF, q.x, 1.0 - q.y, bias);
        vec3 cb = pick(tB, rB, 1.0 - q.x, 1.0 - q.y, bias);
        diffuseColor.rgb = mix(cb, cf, smoothstep(-0.18, 0.18, N.z));`);
    };
    return m;
    };
    res({ geo, make, size: bb.getSize(new T.Vector3()), min: bb.min.clone(), fists: findFists(geo, bb) });
  }, undefined, rej));
  return cache[id];
}
