// 3D 카트 모델 + 운전자 그림(앞/뒤 두 장) + 불꽃·연기 효과
import * as T from 'three';
import { Dizzy, starTex } from './fx.js';
import { buildCar, cleanCar } from './carbody.js';
import { CHAR_EXTRA } from './extra.js';
let _star;

const DRV_W = 1.5, DRV_H = DRV_W * 640 / 480;
const driverGeo = new T.PlaneGeometry(DRV_W, DRV_H);

// 운전자 텍스처: 앞모습/뒷모습 두 장 (tools/kart-sprites.py가 480x640으로 잘라 둔 것)
const loader = new T.TextureLoader();
const driverTex = {};
export function driverTextures(id) {
  if (driverTex[id]) return driverTex[id];
  // ok: 실제로 받아진 그림만 쓴다(없는 파일은 앞/뒤 두 장으로 돌아감)
  const has = CHAR_EXTRA[id] || [];
  const mk = (v) => { if (v !== 'front' && v !== 'back' && !has.includes(v)) return { ok: false }; const t = loader.load(`/kart/chars/${id}-${v}.webp`, () => { t.ok = true; }); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };
  driverTex[id] = { front: mk('front'), back: mk('back'), side: mk('side'), q3f: mk('q3f'), q3b: mk('q3b'), hit: mk('hit'), win: mk('win') };
  return driverTex[id];
}

export class KartView {
  constructor(char, scene, opts = {}) {
    this.char = char;
    this.root = new T.Group();
    this.body = new T.Group(); // 흔들림·점프·스핀용
    this.root.add(this.body);
    // 차체(차종·색·마감·휠·데칼) — carbody.js
    const car = buildCar(cleanCar(opts.car, 0), char);
    this.car = car;
    this.paint = car.paint;
    this.body.add(car.group);
    this.wheels = car.wheels; this.fronts = car.fronts;
    this.wheel = car.steer || new T.Object3D();

    // 운전자 그림
    const tex = driverTextures(char.id);
    this.tex = tex;
    this.driverMat = new T.MeshBasicMaterial({ map: tex.back, transparent: true, alphaTest: 0.35, side: T.DoubleSide, toneMapped: false });
    this.driver = new T.Mesh(driverGeo, this.driverMat);
    this.driver.position.set(0, car.driverY + DRV_H / 2, car.driverZ);
    this.body.add(this.driver);
    // 운전자 그림자(평면 원)
    const shadow = new T.Mesh(new T.CircleGeometry(1.35, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.scale.set(0.85, 1, 1.3); shadow.position.y = 0.04; this.root.add(shadow); this.shadow = shadow;

    // 부스터 불꽃
    this.flames = [];
    for (const ex of car.exhaust.slice(0, 2)) {
      const f = new T.Sprite(new T.SpriteMaterial({ map: flameTex(), color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      f.position.copy(ex); f.scale.set(0.5, 0.5, 1); this.body.add(f); this.flames.push(f);
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
    // 팀전: 바닥에 팀 색 고리 + 이름표 색
    if (opts.team === 0 || opts.team === 1) {
      const tc = opts.team ? 0x2a6bff : 0xe0303e;
      const ring = new T.Mesh(new T.RingGeometry(1.45, 1.75, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: tc, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.position.y = 0.06; this.root.add(ring); this.teamRing = ring;
    }
    // 이름표
    if (opts.label) {
      this.label = makeLabel(opts.label, opts.team === 0 ? '#e0303e' : opts.team === 1 ? '#2a6bff' : char.color);
      this.label.position.set(0, 3.0, 0); this.root.add(this.label);
    }
    this.dizzy = new Dizzy(this.root, _star || (_star = starTex()));
    // 뒤에 달고 다니는 아이템(방패)
    this.heldSpr = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.heldSpr.scale.set(1.1, 1.1, 1); this.heldSpr.position.set(0, 0.8, -2.1); this.heldSpr.visible = false; this.body.add(this.heldSpr); this.heldKind = null;
    scene.add(this.root);
    this.wheelA = 0; this.t = Math.random() * 10;
  }

  update(k, dt, cam) {
    this.t += dt;
    this.root.position.set(k.x, k.y - k.hop, k.z);
    this.root.rotation.y = k.h;
    this.body.position.y = k.hop;
    // 맞았을 때: 두 바퀴를 빠르게 돌다 부드럽게 멈추고(끝에서 딱 원위치), 살짝 기울며 흔들린다
    let spin = 0, wob = 0;
    if (k.spinT > 0) {
      const p = 1 - k.spinT / (k.spinDur || 1);
      spin = (1 - Math.pow(1 - p, 3)) * Math.PI * 4;
      wob = Math.sin(p * Math.PI * 7) * 0.22 * (1 - p);
    }
    this.body.rotation.y = k.yawVis + spin;
    const bob = Math.sin(this.t * 38) * 0.012 * Math.min(1, Math.abs(k.spd) / 10) + (k.off ? Math.sin(this.t * 55) * 0.03 : 0);
    this.body.position.y += bob;
    this.body.rotation.z = -k.steerVis * 0.05 * Math.min(1, Math.abs(k.spd) / 20) + (k.drift ? k.drift * 0.07 : 0) + wob;
    this.body.rotation.x = -(k.pitch || 0);
    const sq = k.squash || 0;
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.3);
    this.wheelA += k.spd * dt / 0.36;
    for (const w of this.wheels) w.rotation.x = this.wheelA;
    for (const f of this.fronts) f.rotation.y = -k.steerVis * 0.45;
    this.wheel.rotation.z = k.steerVis * 0.9;
    this.shadow.material.opacity = 0.35 / (1 + k.hop * 0.8);

    // 운전자: 카메라가 보는 방향에 따라 8방향(앞·대각앞·옆·대각뒤·뒤, 오른쪽은 좌우 뒤집기)
    if (cam) {
      const dx = cam.position.x - k.x, dz = cam.position.z - k.z;
      const fwd = Math.sin(k.h + this.body.rotation.y) * dx + Math.cos(k.h + this.body.rotation.y) * dz;
      let rel = Math.atan2(dx, dz) - (k.h + this.body.rotation.y);
      rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // +: 카트 왼쪽에서 봄
      const tx = this.tex, oct = Math.round(Math.abs(rel) / (Math.PI / 4)); // 0 앞 … 4 뒤
      let want = [tx.front, tx.q3f, tx.side, tx.q3b, tx.back][oct];
      if (!want.ok) want = fwd > 0 ? tx.front : tx.back;
      if (this.face === 'hit' && tx.hit.ok && fwd > 0) want = tx.hit;
      else if (this.face === 'win' && tx.win.ok && fwd > 0) want = tx.win;
      else if ((k.spinT > 0 || (k.dizzyT || 0) > 0) && tx.hit.ok && fwd > 0) want = tx.hit;
      const flip = want !== tx.front && want !== tx.back && want !== tx.hit && want !== tx.win && rel < 0;
      this.driver.scale.x = flip ? -1 : 1;
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
    this.dizzy.update((k.dizzyT || 0) > 0, this.t);
    // 물에 빠졌을 때 건져 주는 드론
    if (k.rescueT > 0 && !this.drone) {
      const d = new T.Group(), m = new T.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.4 }), dk = new T.MeshStandardMaterial({ color: 0x23262e });
      d.add(new T.Mesh(new T.BoxGeometry(1.4, 0.35, 1.4), m));
      this.rotors = [];
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const arm = new T.Mesh(new T.BoxGeometry(0.12, 0.08, 1.2), dk); arm.position.set(x * 0.6, 0.1, z * 0.6); arm.rotation.y = Math.atan2(x, z); d.add(arm); const r = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.03, 16), new T.MeshBasicMaterial({ color: 0x99a0b0, transparent: true, opacity: 0.5 })); r.position.set(x * 1.0, 0.25, z * 1.0); d.add(r); this.rotors.push(r); }
      const light = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ color: 0xff3040 })); light.position.set(0, -0.2, 0.7); d.add(light);
      const cable = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 1.6, 4), dk); cable.position.y = -0.95; d.add(cable);
      d.position.y = 4.2; this.root.add(d); this.drone = d;
    }
    if (this.drone) {
      this.drone.visible = k.rescueT > 0 && k.rescued;
      for (const r of this.rotors) r.rotation.y += 0.9;
    }
    if ((k.held || null) !== this.heldKind) {
      this.heldKind = k.held || null; this.heldSpr.visible = !!this.heldKind;
      if (this.heldKind && KartView.iconTex) { this.heldSpr.material.map = KartView.iconTex(this.heldKind); this.heldSpr.material.needsUpdate = true; }
    }
    if (this.heldKind) this.heldSpr.position.y = 0.8 + Math.sin(this.t * 6) * 0.08;
    // 무적 시간(맞은 직후)에는 깜빡인다
    this.body.visible = !((k.invT || 0) > 0 && (k.spinT || 0) <= 0 && Math.floor(this.t * 16) % 2 === 0);
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
