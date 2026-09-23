// 3D 캐릭터: 무료 Hunyuan3D로 만든 모양(GLB)에 코덱스 원래 앞·뒤 그림을 앞뒤로 비춰 색을 입힌다.
// 모양·그림은 tools/kart-3d.py가 public/kart/chars3d/ 에 만든다. 없는 캐릭터는 예전 2D 그림 그대로.
import * as T from 'three';
import { GLTFLoader } from '/fps/addons/loaders/GLTFLoader.js';
import { CHAR3D } from './char3d.js';

const cache = {};
const tl = new T.TextureLoader(), gl = new GLTFLoader();

export function has3D(id) { return !!CHAR3D[id]; }

// 캐릭터 하나의 모양+재질(여러 카트가 같이 쓴다)
export function load3D(id) {
  if (cache[id]) return cache[id];
  const R = CHAR3D[id];
  const tex = (s) => { const t = tl.load(`/kart/chars3d/${id}-${s}.jpg`); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
  const tf = tex('f'), tb = tex('b');
  cache[id] = new Promise((res, rej) => gl.load(`/kart/chars3d/${id}.glb`, (g) => {
    let mesh; g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return rej(new Error('no mesh'));
    const geo = mesh.geometry; geo.applyMatrix4(mesh.matrixWorld); geo.computeVertexNormals(); geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const m = new T.MeshStandardMaterial({ roughness: 0.7 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { tF: { value: tf }, tB: { value: tb }, bmin: { value: bb.min.clone() }, bmax: { value: bb.max.clone() }, rF: { value: new T.Vector4(...R.f) }, rB: { value: new T.Vector4(...R.b) } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D tF, tB; uniform vec3 bmin, bmax; uniform vec4 rF, rB; varying vec3 vOP; varying vec3 vON;`)
        .replace('#include <map_fragment>', `
        vec2 n = (vOP.xy - bmin.xy) / (bmax.xy - bmin.xy);
        vec2 uf = vec2(mix(rF.x, rF.z, n.x), mix(rF.w, rF.y, n.y));
        vec2 ub = vec2(mix(rB.z, rB.x, n.x), mix(rB.w, rB.y, n.y)); // 뒤 그림은 좌우가 반대
        vec3 cf = texture2D(tF, vec2(uf.x, 1.0 - uf.y)).rgb, cb = texture2D(tB, vec2(ub.x, 1.0 - ub.y)).rgb;
        float w = smoothstep(-0.18, 0.18, normalize(vON).z);
        diffuseColor.rgb = mix(cb, cf, w);`);
    };
    res({ geo, mat: m, size: bb.getSize(new T.Vector3()), min: bb.min.clone() });
  }, undefined, rej));
  return cache[id];
}
