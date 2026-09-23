// 차고 — 카트 꾸미기 화면의 3D 미리보기(스튜디오 조명 + 돌림판)
import * as T from 'three';
import { KartView } from './kart.js';
import { makeKart } from './physics.js';

export class Garage {
  constructor(renderer) {
    this.renderer = renderer;
    const s = this.scene = new T.Scene();
    s.background = new T.Color(0x10141f);
    this.cam = new T.PerspectiveCamera(34, 1, 0.1, 200);
    // 반사용 스튜디오 환경: 밝은 판 몇 장을 둘러 세운 방을 굽는다
    const room = new T.Scene();
    room.add(new T.Mesh(new T.BoxGeometry(40, 20, 40), new T.MeshBasicMaterial({ color: 0x1a1f2c, side: T.BackSide })));
    for (const [x, y, z, w, h, c] of [[0, 9, 0, 16, 16, 0xffffff], [-15, 4, 6, 8, 10, 0xffe2c0], [15, 4, -6, 8, 10, 0xc8dcff], [0, 3, -18, 20, 4, 0xffffff]]) {
      const p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide }));
      p.position.set(x, y, z); p.lookAt(0, 0, 0); room.add(p);
    }
    const pm = new T.PMREMGenerator(renderer);
    s.environment = pm.fromScene(room, 0.03).texture;
    s.environmentIntensity = 1.0;
    s.add(new T.HemisphereLight(0xdfe8ff, 0x1a1a22, 0.8));
    const key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(4, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
    s.add(key);
    const rim = new T.DirectionalLight(0x9fc0ff, 1.4); rim.position.set(-5, 3, -6); s.add(rim);
    // 돌림판 바닥 + 빛 테두리
    const disc = new T.Mesh(new T.CylinderGeometry(3.2, 3.3, 0.18, 64), new T.MeshStandardMaterial({ color: 0x1c212e, metalness: 0.6, roughness: 0.25 }));
    disc.position.y = -0.09; disc.receiveShadow = true; s.add(disc);
    const ring = new T.Mesh(new T.TorusGeometry(3.25, 0.03, 8, 96), new T.MeshBasicMaterial({ color: 0xffd23a }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; s.add(ring);
    const floor = new T.Mesh(new T.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: 0x0c0f17, roughness: 0.9 }));
    floor.position.y = -0.18; s.add(floor);
    this.turn = new T.Group(); s.add(this.turn);
    this.yaw = 0.7; this.spin = 0.25; this.drag = null;
    this.k = null; this.view = null;
  }
  show(char, car) {
    if (this.view) this.scene.remove(this.view.root);
    // 돌림판은 카트의 방향(h)으로 돌린다 — 부모를 돌리면 운전자 그림이 카메라를 못 본다
    this.view = new KartView(char, this.scene, { car });
    this.view.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const tr = { point: () => ({ x: 0, y: 0, z: 0, h: 0 }) };
    this.k = makeKart('g', char, tr, 0, 0); this.k.x = this.k.z = 0; this.k.y = 0; this.k.h = 0;
  }
  bind(el) {
    el.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, yaw: this.yaw }; this.spin = 0; try { el.setPointerCapture(e.pointerId); } catch (er) { } });
    el.addEventListener('pointermove', (e) => { if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012; });
    const up = () => { this.drag = null; this.spin = 0.25; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  render(dt, w, h) {
    if (!this.view) return;
    this.yaw += this.spin * dt;
    const k = this.k; k.h = this.yaw; k.spd = 0; k.steerVis = Math.sin(performance.now() / 900) * 0.4;
    this.view.update(k, dt, this.cam);
    // 화면 왼쪽(넓은 화면) 또는 위쪽(폰 세로)에 차가 오게
    const wide = w > h * 1.1;
    this.cam.aspect = w / h;
    this.cam.setViewOffset(w, h, wide ? w * 0.2 : 0, wide ? 0 : h * 0.22, w, h);
    this.cam.fov = wide ? 30 : 34;
    const dist = wide ? 8.6 : 8.6 / Math.max(0.42, w / h) * 0.5 + 4;
    this.cam.position.set(0, 2.3 * dist / 8.6, dist); this.cam.lookAt(0, 0.9, 0);
    this.cam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam);
  }
}
