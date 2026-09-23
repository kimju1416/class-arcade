// 3D 카트 모델 + 운전자 그림(앞/뒤 두 장) + 불꽃·연기 효과
import * as T from 'three';

const tireGeo = new T.CylinderGeometry(0.34, 0.34, 0.3, 20).rotateZ(Math.PI / 2);
const tireWide = new T.CylinderGeometry(0.4, 0.4, 0.42, 20).rotateZ(Math.PI / 2);
const rimGeo = new T.CylinderGeometry(0.2, 0.2, 0.32, 10).rotateZ(Math.PI / 2);
const rimWide = new T.CylinderGeometry(0.24, 0.24, 0.44, 10).rotateZ(Math.PI / 2);
const tireMat = new T.MeshStandardMaterial({ color: 0x17171b, roughness: 0.85 });
const chrome = new T.MeshStandardMaterial({ color: 0xd9dde6, metalness: 1, roughness: 0.22 });
const darkMetal = new T.MeshStandardMaterial({ color: 0x2c2f38, metalness: 0.7, roughness: 0.4 });
const seatMat = new T.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.7 });
const lightMat = new T.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 2 });
const tailMat = new T.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 1.6 });

function roundedBody(len, wid, hgt, r) {
  // 위에서 본 카트 윤곽(앞이 좁음)을 둥글게 밀어 올린 몸체
  const s = new T.Shape();
  const hw = wid / 2, hl = len / 2, nw = hw * 0.62;
  s.moveTo(-hw + r, -hl);
  s.lineTo(hw - r, -hl); s.quadraticCurveTo(hw, -hl, hw, -hl + r);
  s.lineTo(hw, hl * 0.2); s.quadraticCurveTo(hw, hl * 0.55, nw, hl - r);
  s.quadraticCurveTo(nw, hl, nw - r, hl);
  s.lineTo(-nw + r, hl); s.quadraticCurveTo(-nw, hl, -nw, hl - r);
  s.quadraticCurveTo(-hw, hl * 0.55, -hw, hl * 0.2);
  s.lineTo(-hw, -hl + r); s.quadraticCurveTo(-hw, -hl, -hw + r, -hl);
  const g = new T.ExtrudeGeometry(s, { depth: hgt, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0);
  return g;
}
const bodyGeo = roundedBody(2.3, 1.3, 0.22, 0.25);
const noseGeo = new T.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.55, 1.2);
const podGeo = new T.CapsuleGeometry(0.2, 0.9, 6, 12).rotateX(Math.PI / 2);
const wingGeo = new T.BoxGeometry(1.5, 0.08, 0.42);
const DRV_W = 1.5, DRV_H = DRV_W * 640 / 480;
const driverGeo = new T.PlaneGeometry(DRV_W, DRV_H);
const plateGeo = new T.BoxGeometry(0.06, 0.34, 0.46);

// 운전자 텍스처: 앞모습/뒷모습 두 장 (tools/kart-sprites.py가 480x640으로 잘라 둔 것)
const loader = new T.TextureLoader();
const driverTex = {};
export function driverTextures(id) {
  if (driverTex[id]) return driverTex[id];
  const mk = (v) => { const t = loader.load(`/kart/chars/${id}-${v}.webp`); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
  driverTex[id] = { front: mk('front'), back: mk('back') };
  return driverTex[id];
}

export class KartView {
  constructor(char, scene, opts = {}) {
    this.char = char;
    this.root = new T.Group();
    this.body = new T.Group(); // 흔들림·점프·스핀용
    this.root.add(this.body);
    const paint = new T.MeshPhysicalMaterial({ color: char.color, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
    const accent = new T.MeshPhysicalMaterial({ color: char.accent, metalness: 0.2, roughness: 0.4, clearcoat: 0.8 });
    this.paint = paint;
    const body = new T.Mesh(bodyGeo, paint); body.position.y = 0.32; this.body.add(body);
    const nose = new T.Mesh(noseGeo, paint); nose.position.set(0, 0.55, 0.62); this.body.add(nose);
    const stripe = new T.Mesh(new T.BoxGeometry(0.18, 0.02, 1.1), accent); stripe.position.set(0, 0.84, 0.55); stripe.rotation.x = -0.28; this.body.add(stripe);
    for (const sx of [-1, 1]) {
      const pod = new T.Mesh(podGeo, accent); pod.position.set(sx * 0.72, 0.42, -0.05); this.body.add(pod);
      const hl = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), lightMat); hl.position.set(sx * 0.3, 0.62, 1.12); this.body.add(hl);
      const tl = new T.Mesh(new T.BoxGeometry(0.22, 0.08, 0.05), tailMat); tl.position.set(sx * 0.42, 0.52, -1.28); this.body.add(tl);
      const pipe = new T.Mesh(new T.CylinderGeometry(0.075, 0.09, 0.4, 12).rotateX(Math.PI / 2), chrome); pipe.position.set(sx * 0.22, 0.5, -1.32); this.body.add(pipe);
      const stand = new T.Mesh(new T.BoxGeometry(0.06, 0.42, 0.12), darkMetal); stand.position.set(sx * 0.45, 0.78, -1.08); this.body.add(stand);
      const plate = new T.Mesh(plateGeo, paint); plate.position.set(sx * 0.77, 1.02, -1.1); this.body.add(plate);
    }
    const wing = new T.Mesh(wingGeo, paint); wing.position.set(0, 1.02, -1.1); wing.rotation.x = 0.12; this.body.add(wing);
    const engine = new T.Mesh(new T.BoxGeometry(0.72, 0.36, 0.5), darkMetal); engine.position.set(0, 0.62, -0.95); this.body.add(engine);
    const seat = new T.Mesh(new T.BoxGeometry(0.62, 0.55, 0.14), seatMat); seat.position.set(0, 0.82, -0.5); seat.rotation.x = -0.2; this.body.add(seat);
    const col = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.55), darkMetal); col.position.set(0, 0.78, 0.32); col.rotation.x = 0.9; this.body.add(col);
    this.wheel = new T.Mesh(new T.TorusGeometry(0.17, 0.035, 8, 20), seatMat); this.wheel.position.set(0, 0.96, 0.18); this.wheel.rotation.x = -0.6; this.body.add(this.wheel);

    // 바퀴 — 앞바퀴는 조향 피벗 안에
    this.wheels = [];
    this.fronts = [];
    const W = [[-0.78, 0.34, 0.78, false], [0.78, 0.34, 0.78, false], [-0.8, 0.4, -0.85, true], [0.8, 0.4, -0.85, true]];
    for (const [x, y, z, rear] of W) {
      const pivot = new T.Group(); pivot.position.set(x, y, z);
      const spin = new T.Group();
      spin.add(new T.Mesh(rear ? tireWide : tireGeo, tireMat));
      const rim = new T.Mesh(rear ? rimWide : rimGeo, chrome); spin.add(rim);
      pivot.add(spin); this.body.add(pivot);
      this.wheels.push(spin); if (!rear) this.fronts.push(pivot);
    }
    body.castShadow = true; engine.castShadow = true; wing.castShadow = true;
    this.body.traverse(o => { if (o.isMesh) { o.castShadow = true; } });

    // 운전자 그림
    const tex = driverTextures(char.id);
    this.tex = tex;
    this.driverMat = new T.MeshBasicMaterial({ map: tex.back, transparent: true, alphaTest: 0.35, side: T.DoubleSide, toneMapped: false });
    this.driver = new T.Mesh(driverGeo, this.driverMat);
    this.driver.position.set(0, 0.62 + DRV_H / 2, -0.42);
    this.body.add(this.driver);
    // 운전자 그림자(평면 원)
    const shadow = new T.Mesh(new T.CircleGeometry(1.35, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.scale.set(0.85, 1, 1.3); shadow.position.y = 0.04; this.root.add(shadow); this.shadow = shadow;

    // 부스터 불꽃
    this.flames = [];
    for (const sx of [-1, 1]) {
      const f = new T.Sprite(new T.SpriteMaterial({ map: flameTex(), color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      f.position.set(sx * 0.22, 0.5, -1.62); f.scale.set(0.5, 0.5, 1); this.body.add(f); this.flames.push(f);
    }
    // 드리프트 불꽃 (뒷바퀴 옆)
    this.sparks = [];
    for (const sx of [-1, 1]) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: sparkTex(), color: 0x4aa8ff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      sp.position.set(sx * 0.85, 0.2, -1.15); sp.scale.set(0.9, 0.9, 1); sp.visible = false; this.body.add(sp); this.sparks.push(sp);
    }
    // 무적(스타) 오라
    this.aura = new T.Mesh(new T.SphereGeometry(1.55, 20, 14), new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.13, blending: T.AdditiveBlending, depthWrite: false }));
    this.aura.position.y = 0.9; this.aura.visible = false; this.root.add(this.aura);
    // 이름표
    if (opts.label) {
      this.label = makeLabel(opts.label, char.color);
      this.label.position.set(0, 3.0, 0); this.root.add(this.label);
    }
    scene.add(this.root);
    this.wheelA = 0; this.t = Math.random() * 10;
  }

  update(k, dt, cam) {
    this.t += dt;
    this.root.position.set(k.x, k.y - k.hop, k.z);
    this.root.rotation.y = k.h;
    this.body.position.y = k.hop;
    this.body.rotation.y = k.yawVis + (k.spinT > 0 ? k.spinA : 0);
    const bob = Math.sin(this.t * 38) * 0.012 * Math.min(1, Math.abs(k.spd) / 10) + (k.off ? Math.sin(this.t * 55) * 0.03 : 0);
    this.body.position.y += bob;
    this.body.rotation.z = -k.steerVis * 0.05 * Math.min(1, Math.abs(k.spd) / 20) + (k.drift ? k.drift * 0.07 : 0);
    this.body.rotation.x = -(k.pitch || 0);
    const sq = k.squash || 0;
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.3);
    this.wheelA += k.spd * dt / 0.36;
    for (const w of this.wheels) w.rotation.x = this.wheelA;
    for (const f of this.fronts) f.rotation.y = -k.steerVis * 0.45;
    this.wheel.rotation.z = k.steerVis * 0.9;
    this.shadow.material.opacity = 0.35 / (1 + k.hop * 0.8);

    // 운전자: 카메라가 앞쪽에 있으면 앞모습
    if (cam) {
      const dx = cam.position.x - k.x, dz = cam.position.z - k.z;
      const fwd = Math.sin(k.h + this.body.rotation.y) * dx + Math.cos(k.h + this.body.rotation.y) * dz;
      const want = fwd > 0 ? this.tex.front : this.tex.back;
      if (this.driverMat.map !== want) { this.driverMat.map = want; this.driverMat.needsUpdate = true; }
      // 원통형 빌보드: 카메라 쪽으로 y축만 돌린다
      const ang = Math.atan2(dx, dz) - (k.h + this.body.rotation.y);
      this.driver.rotation.y = ang;
      this.driver.position.x = -k.steerVis * 0.05;
      this.driver.rotation.z = k.steerVis * 0.08 * (fwd > 0 ? -1 : 1);
    }

    // 불꽃
    const boosting = k.boostT > 0;
    for (const f of this.flames) {
      f.visible = boosting || k.spd > 3;
      const s = boosting ? 1.1 + Math.random() * 0.5 : 0.28 + Math.random() * 0.08;
      f.scale.set(s * 0.7, s, 1);
      f.material.color.set(boosting ? 0xffffff : 0x66aaff);
      f.material.opacity = boosting ? 1 : 0.6;
    }
    const lvCol = [0, 0x4aa8ff, 0xff9a1a, 0xff4fd8][k.driftLv || 0];
    for (const sp of this.sparks) {
      sp.visible = !!k.drift && k.driftLv > 0;
      if (sp.visible) { sp.material.color.setHex(lvCol); const s = 0.7 + Math.random() * 0.7; sp.scale.set(s, s, 1); sp.material.rotation = Math.random() * 6; }
    }
    this.aura.visible = k.starT > 0;
    if (this.aura.visible) {
      this.aura.material.color.setHSL((this.t * 1.5) % 1, 1, 0.6);
      this.aura.scale.setScalar(1 + Math.sin(this.t * 20) * 0.05);
      this.paint.emissive.setHSL((this.t * 1.5) % 1, 1, 0.35);
    } else this.paint.emissive.setHex(0);
  }
  dispose(scene) { scene.remove(this.root); }
}

let _flame, _spark;
function flameTex() {
  if (_flame) return _flame;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,220,120,.95)'); gr.addColorStop(0.55, 'rgba(255,110,30,.6)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _flame = new T.CanvasTexture(cv); return _flame;
}
function sparkTex() {
  if (_spark) return _spark;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31); g.stroke(); }
  _spark = new T.CanvasTexture(cv); return _spark;
}
export { sparkTex, flameTex };

export function makeLabel(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '700 30px Pretendard, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(text).width + 34);
  g.fillStyle = 'rgba(10,14,24,.72)'; g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 22); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(128 - w / 2 + 16, 32, 6, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.fillText(text, 136, 33);
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthTest: false, sizeAttenuation: false, toneMapped: false }));
  s.scale.set(0.15, 0.0375, 1); s.renderOrder = 10;
  return s;
}
