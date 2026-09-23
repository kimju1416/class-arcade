// 효과: 입자(불꽃·먼지·연기·별 터짐) + 드리프트 타이어 자국 + 어지러운 별
import * as T from 'three';

export function softDot() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new T.CanvasTexture(cv); return t;
}
export function starTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 28; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = '#ffe14a'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#ff9a00'; g.stroke();
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
}

// 입자: 한 번에 그리는 Points. 각 입자는 색·크기·수명을 가진다
export class Particles {
  constructor(scene, max = 2400, additive = true) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.s0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.alpha = new Float32Array(max);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new T.BufferAttribute(this.col, 3));
    g.setAttribute('size', new T.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new T.BufferAttribute(this.alpha, 1));
    const m = new T.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = ${additive ? 'vec4(vC * a, a)' : 'vec4(vC, a)'}; }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
    });
    this.pts = new T.Points(g, m); this.pts.frustumCulled = false; this.pts.renderOrder = 5;
    scene.add(this.pts); this.mat = m;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav = 0, grow = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.age[i] = 0; this.s0[i] = size; this.grav[i] = grav; this.grow[i] = grow;
    this.c0[i * 3] = r; this.c0[i * 3 + 1] = g; this.c0[i * 3 + 2] = b;
  }
  update(dt, viewH) {
    this.mat.uniforms.scale.value = viewH * 0.9;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { // 마지막 것과 자리 바꿔 지운다
        const j = --this.n;
        for (const a of [this.pos, this.vel, this.c0]) { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
        for (const a of [this.life, this.age, this.s0, this.grav, this.grow]) a[i] = a[j];
        i--; continue;
      }
      const k = this.age[i] / this.life[i];
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = 1 - 1.6 * dt;
      for (let a = 0; a < 3; a++) { this.vel[i * 3 + a] *= drag; this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt; }
      this.alpha[i] = (1 - k) * Math.min(1, this.age[i] * 12);
      this.col[i * 3] = this.c0[i * 3]; this.col[i * 3 + 1] = this.c0[i * 3 + 1]; this.col[i * 3 + 2] = this.c0[i * 3 + 2];
      this.size[i] = this.s0[i] * (1 + this.grow[i] * k);
    }
    const g = this.pts.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
  }
}

// 타이어 자국: 작은 검은 사각형을 길바닥에 줄줄이. 오래된 것부터 덮어 쓴다
export class Skids {
  constructor(scene, max = 1400) {
    this.max = max; this.i = 0;
    const m = new T.MeshBasicMaterial({ color: 0x111114, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.mesh = new T.InstancedMesh(new T.PlaneGeometry(0.34, 0.62).rotateX(-Math.PI / 2), m, max);
    const z = new T.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < max; k++) this.mesh.setMatrixAt(k, z);
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.m4 = new T.Matrix4(); this.q = new T.Quaternion(); this.e = new T.Euler(); this.s = new T.Vector3(1, 1, 1); this.p = new T.Vector3();
  }
  add(x, y, z, h) {
    this.e.set(0, h, 0); this.q.setFromEuler(this.e); this.p.set(x, y + 0.04, z);
    this.m4.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.i, this.m4); this.i = (this.i + 1) % this.max;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// 어지러운 별: 맞은 카트 머리 위를 도는 별 세 개
export class Dizzy {
  constructor(parent, tex) {
    this.g = new T.Group(); this.g.position.y = 3.1; this.g.visible = false; parent.add(this.g);
    this.stars = [];
    for (let i = 0; i < 3; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.set(0.55, 0.55, 1); this.g.add(s); this.stars.push(s);
    }
  }
  update(on, t) {
    this.g.visible = on;
    if (!on) return;
    this.stars.forEach((s, i) => { const a = t * 6 + i * 2.09; s.position.set(Math.cos(a) * 0.8, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.8); s.material.rotation = t * 4; });
  }
}
