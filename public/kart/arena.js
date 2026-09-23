// K-POP 콘서트 아레나 — 메인 무대·LED 화면·무빙 라이트·레이저·관중석 응원봉 물결·꽃가루 대포
import * as T from 'three';

const ADD = { transparent: true, blending: T.AdditiveBlending, depthWrite: false };

function pointInTrack(tr, x, z) { // 중심선 다각형 안쪽인가
  let inside = false;
  for (let i = 0, j = tr.N - 1; i < tr.N; j = i, i += 4) {
    const xi = tr.x[i], zi = tr.z[i], xj = tr.x[j], zj = tr.z[j];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

function screenMaterial(label) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 256);
  g.font = 'italic 900 150px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.fillText(label, 512, 136);
  const tt = new T.CanvasTexture(cv);
  return new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { t: { value: 0 }, txt: { value: tt } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float t; uniform sampler2D txt;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
      void main(){
        vec2 u = vUv;
        // 이퀄라이저 막대
        float col = floor(u.x * 48.0);
        float amp = 0.25 + 0.55 * abs(sin(t * 3.1 + col * 0.63) * sin(t * 1.7 + col * 0.21));
        float bar = step(u.y, amp) * step(0.12, fract(u.x * 48.0));
        vec3 c = hue(u.x * 0.6 + t * 0.08) * bar * (0.55 + 0.45 * u.y);
        // 물결 배경
        c += hue(0.75 + sin(u.y * 3.0 + t) * 0.1) * 0.18 * (0.5 + 0.5 * sin(u.x * 20.0 - t * 4.0 + u.y * 6.0));
        // 가운데 글자(반짝임)
        float a = texture2D(txt, vec2(u.x, (u.y - 0.35) / 0.4)).r * step(0.35, u.y) * step(u.y, 0.75);
        c = mix(c, vec3(1.0) * (0.85 + 0.15 * sin(t * 8.0)), a);
        // LED 격자
        vec2 px = fract(u * vec2(160.0, 64.0));
        c *= 0.55 + 0.45 * step(0.18, px.x) * step(0.18, px.y);
        gl_FragColor = vec4(c * 1.6, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function kpopArena(scene, W, tr, def, edge, quality, R, H) {
  const b = tr.bounds, cx = (b.minx + b.maxx) / 2, cz = (b.minz + b.maxz) / 2;
  // ---------- 무대 자리: 안쪽에서 트랙과 가장 먼 곳 ----------
  let best = null;
  for (let x = b.minx; x <= b.maxx; x += 6) for (let z = b.minz; z <= b.maxz; z += 6) {
    if (!pointInTrack(tr, x, z)) continue;
    const d = tr.nearest(x, z, 200).d;
    if (!best || d > best.d) best = { x, z, d };
  }
  const S = best || { x: cx, z: cz, d: 40 };
  const nn = tr.nearest(S.x, S.z, 400);
  const faceA = Math.atan2(tr.x[nn.i] - S.x, tr.z[nn.i] - S.z); // 무대 앞이 가장 가까운 트랙 쪽
  const scale = Math.max(0.7, Math.min(1.7, (S.d - edge - 6) / 24));
  const stage = new T.Group(); stage.position.set(S.x, 0, S.z); stage.rotation.y = faceA; stage.scale.setScalar(scale);
  scene.add(stage);
  const black = new T.MeshStandardMaterial({ color: 0x0d0d14, metalness: 0.6, roughness: 0.25 });
  const truss = new T.MeshStandardMaterial({ color: 0x8c93a3, metalness: 0.9, roughness: 0.35 });
  const deck = new T.Mesh(new T.BoxGeometry(46, 2.4, 22), black); deck.position.set(0, 1.2, -4); stage.add(deck);
  const run = new T.Mesh(new T.BoxGeometry(6, 2.0, 16), black); run.position.set(0, 1.0, 14); stage.add(run);
  const ledStrip = new T.Mesh(new T.BoxGeometry(46.2, 0.25, 0.2), new T.MeshBasicMaterial({ color: 0xff3fbf })); ledStrip.position.set(0, 2.3, 7.05); stage.add(ledStrip);
  const runStrip = new T.Mesh(new T.BoxGeometry(6.2, 0.2, 16.2), new T.MeshBasicMaterial({ color: 0x39e0ff })); runStrip.position.set(0, 2.05, 14); stage.add(runStrip);
  // LED 화면들
  const scrM = screenMaterial('SUPERSTAR');
  const main = new T.Mesh(new T.PlaneGeometry(40, 15), scrM); main.position.set(0, 11.5, -14.5); stage.add(main);
  const mainB = new T.Mesh(new T.PlaneGeometry(40, 15), scrM); mainB.position.set(0, 11.5, -15.3); mainB.rotation.y = Math.PI; stage.add(mainB); // 뒤쪽에서 달릴 때도 보이게
  const frame = new T.Mesh(new T.BoxGeometry(41, 16, 0.6), black); frame.position.set(0, 11.5, -14.9); stage.add(frame);
  const kt = new T.TextureLoader().load('/kart/tex/keyart.webp'); kt.colorSpace = T.SRGBColorSpace;
  for (const sx of [-1, 1]) {
    const side = new T.Mesh(new T.PlaneGeometry(13, 8.6), new T.MeshBasicMaterial({ map: kt, toneMapped: false, side: T.DoubleSide }));
    side.position.set(sx * 29, 9, -10); side.rotation.y = -sx * 0.45; stage.add(side);
    const sf = new T.Mesh(new T.BoxGeometry(13.6, 9.2, 0.4), black); sf.rotation.y = -sx * 0.45; stage.add(sf);
    const nrm = new T.Vector3(Math.sin(-sx * 0.45), 0, Math.cos(-sx * 0.45));
    sf.position.set(sx * 29 - nrm.x * 0.3, 9, -10 - nrm.z * 0.3);
    const back = side.clone(); back.rotation.y = -sx * 0.45 + Math.PI; back.position.set(sx * 29 - nrm.x * 0.6, 9, -10 - nrm.z * 0.6); stage.add(back);
    // 스피커 기둥
    for (let k = 0; k < 6; k++) { const sp = new T.Mesh(new T.BoxGeometry(2.4, 1.3, 1.8), black); sp.position.set(sx * 21, 21 - k * 1.35, 2); sp.rotation.x = 0.04 * k; stage.add(sp); }
    // 트러스 기둥
    for (const z of [-12, 6]) { const tw = new T.Mesh(new T.BoxGeometry(1.2, 24, 1.2), truss); tw.position.set(sx * 24, 12, z); stage.add(tw); }
  }
  for (const z of [-12, 6]) { const beam = new T.Mesh(new T.BoxGeometry(49.2, 1.2, 1.2), truss); beam.position.set(0, 23.4, z); stage.add(beam); }
  for (const sx of [-1, 1]) { const beam = new T.Mesh(new T.BoxGeometry(1.2, 1.2, 19), truss); beam.position.set(sx * 24, 23.4, -3); stage.add(beam); }

  // ---------- 무빙 라이트(원뿔 빛) ----------
  const beams = [];
  const beamG = new T.ConeGeometry(4.5, 34, 20, 1, true).translate(0, -17, 0);
  const cols = [0xff3fbf, 0x39e0ff, 0xffe14a, 0x9d7bff, 0xffffff];
  for (let i = 0; i < 12; i++) {
    const piv = new T.Group(); piv.position.set(-22 + i * 4, 22.6, i % 2 ? 6 : -12); stage.add(piv);
    const m = new T.MeshBasicMaterial({ color: cols[i % cols.length], opacity: 0.12, side: T.DoubleSide, ...ADD, fog: false });
    const cone = new T.Mesh(beamG, m); piv.add(cone);
    const head = new T.Mesh(new T.SphereGeometry(0.5, 10, 8), new T.MeshBasicMaterial({ color: cols[i % cols.length] })); piv.add(head);
    beams.push({ piv, m, ph: i * 0.7 });
  }
  // ---------- 레이저 ----------
  const lasers = [];
  const lg = new T.BoxGeometry(0.12, 0.12, 260).translate(0, 0, 130);
  for (let i = 0; i < 16; i++) {
    const m = new T.MeshBasicMaterial({ color: [0x39ff88, 0x39e0ff, 0xff3fbf][i % 3], opacity: 0.55, ...ADD, fog: false });
    const l = new T.Mesh(lg, m); l.position.set(-15 + i * 2, 19, -13); stage.add(l);
    lasers.push({ l, m, ph: i * 0.39 });
  }

  // ---------- 관중석(경기장을 두른 타원 그릇) ----------
  const rx = (b.maxx - b.minx) / 2 + edge + 70, rz = (b.maxz - b.minz) / 2 + edge + 70;
  const SEG = 128, rows = 4;
  const pos = [], uv = [], idx = [];
  const circ = Math.PI * (rx + rz);
  for (let i = 0; i <= SEG; i++) {
    const a = i / SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, grow = 1 + t * 0.16;
      pos.push(cx + ca * rx * grow, 1 + t * 34, cz + sa * rz * grow);
      uv.push(i / SEG * circ / 23, t * 6);
    }
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < rows; j++) { const a = i * (rows + 1) + j, c = a + rows + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const bowlG = new T.BufferGeometry();
  bowlG.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bowlG.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); bowlG.setIndex(idx); bowlG.computeVertexNormals();
  const ct = H.crowdTex; // world.js가 넘겨 준 관중 그림
  const bowl = new T.Mesh(bowlG, new T.MeshStandardMaterial({ map: ct, emissiveMap: ct, emissive: new T.Color(0x6a6a80), side: T.DoubleSide, roughness: 0.9 }));
  scene.add(bowl);
  // 지붕 테두리 LED 띠
  const ringPts = []; for (let i = 0; i <= SEG; i++) { const a = i / SEG * Math.PI * 2; ringPts.push(new T.Vector3(cx + Math.cos(a) * rx * 1.17, 36, cz + Math.sin(a) * rz * 1.17)); }
  const ringG = new T.TubeGeometry(new T.CatmullRomCurve3(ringPts, true), 256, 0.8, 6, true);
  const ringM = new T.MeshBasicMaterial({ color: 0xff3fbf, fog: false }); scene.add(new T.Mesh(ringG, ringM));

  // ---------- 응원봉: 관중석과 무대 앞 바닥에 수천 개, 색이 물결친다 ----------
  const NS = quality >= 2 ? 7000 : 3500, NF = quality >= 2 ? 5000 : 2500;
  const sp = new Float32Array((NS + NF) * 3), sc = new Float32Array((NS + NF) * 3), sa = new Float32Array(NS + NF);
  for (let i = 0; i < NS; i++) {
    const a = R() * Math.PI * 2, t = R() * 0.95 + 0.03, grow = 1 + t * 0.16;
    sp[i * 3] = cx + Math.cos(a) * rx * grow; sp[i * 3 + 1] = 2.2 + t * 34; sp[i * 3 + 2] = cz + Math.sin(a) * rz * grow; sa[i] = a;
  }
  const fwdX = Math.sin(faceA), fwdZ = Math.cos(faceA);
  for (let i = NS; i < NS + NF; i++) { // 안쪽 바닥 스탠딩석(트랙·무대만 비운다)
    let x = 0, z = 0, ok = false;
    for (let tries = 0; tries < 12 && !ok; tries++) {
      x = b.minx + R() * (b.maxx - b.minx); z = b.minz + R() * (b.maxz - b.minz);
      const lx = (x - S.x) * Math.cos(faceA) - (z - S.z) * Math.sin(faceA), lz = (x - S.x) * Math.sin(faceA) + (z - S.z) * Math.cos(faceA);
      const onStage = (Math.abs(lx) < 26 * scale && lz > -16 * scale && lz < 8 * scale) || (Math.abs(lx) < 4 * scale && lz < 23 * scale && lz > 0);
      ok = pointInTrack(tr, x, z) && !onStage && tr.nearest(x, z, 60).d > edge + 3;
    }
    if (!ok) { sp[i * 3 + 1] = -99; continue; }
    sp[i * 3] = x; sp[i * 3 + 1] = 1.7 + R() * 0.5; sp[i * 3 + 2] = z; sa[i] = Math.atan2(z - S.z, x - S.x) + 10;
  }
  const stG = new T.BufferGeometry(); stG.setAttribute('position', new T.BufferAttribute(sp, 3)); stG.setAttribute('color', new T.BufferAttribute(sc, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32; { const g = dot.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }
  const sticks = new T.Points(stG, new T.PointsMaterial({ size: 1.1, map: new T.CanvasTexture(dot), vertexColors: true, ...ADD, fog: false }));
  sticks.frustumCulled = false; scene.add(sticks);
  const pal = [new T.Color(0xff3fbf), new T.Color(0x39e0ff), new T.Color(0xffe14a), new T.Color(0x9d7bff)];

  // ---------- 꽃가루 대포 ----------
  const NC = 900, cp = new Float32Array(NC * 3), cv = new Float32Array(NC * 3), cc = new Float32Array(NC * 3); let cn = 0, cT = 2;
  const cG = new T.BufferGeometry(); cG.setAttribute('position', new T.BufferAttribute(cp, 3)); cG.setAttribute('color', new T.BufferAttribute(cc, 3));
  const conf = new T.Points(cG, new T.PointsMaterial({ size: 0.55, vertexColors: true })); conf.frustumCulled = false; scene.add(conf);
  for (let i = 0; i < NC; i++) cp[i * 3 + 1] = -99;

  W.update.push((dt, t) => {
    scrM.uniforms.t.value = t;
    beams.forEach((B, i) => { B.piv.rotation.set(Math.sin(t * 0.7 + B.ph) * 0.7 + 0.35, 0, Math.cos(t * 0.53 + B.ph * 1.3) * 0.6); B.m.color.setHSL(((t * 0.05 + i * 0.13) % 1), 1, 0.6); });
    lasers.forEach((L, i) => { L.l.rotation.set(-0.12 - Math.abs(Math.sin(t * 0.8 + L.ph)) * 0.25, Math.sin(t * 0.6 + L.ph) * 0.9, 0); L.m.opacity = 0.35 + 0.3 * Math.max(0, Math.sin(t * 2 + i)); });
    ringM.color.setHSL((t * 0.04) % 1, 1, 0.55);
    // 응원봉 물결: 경기장을 따라 색 띠가 돌고, 박자에 맞춰 반짝
    const beat = 0.75 + 0.25 * Math.max(0, Math.sin(t * Math.PI * 2 * 2.1));
    for (let i = 0; i < NS + NF; i++) {
      const w = Math.floor(((sa[i] * 2 - t * 0.9) / (Math.PI * 2)) * 6);
      const c = pal[((w % 4) + 4) % 4], k = beat * (0.7 + 0.3 * Math.sin(i * 12.9898 + t * 6));
      sc[i * 3] = c.r * k; sc[i * 3 + 1] = c.g * k; sc[i * 3 + 2] = c.b * k;
    }
    stG.attributes.color.needsUpdate = true;
    // 꽃가루: 몇 초마다 무대 양쪽에서 펑
    cT -= dt;
    if (cT <= 0) {
      cT = 4 + R() * 3;
      for (const sx of [-1, 1]) for (let k = 0; k < 160; k++) {
        const i = cn; cn = (cn + 1) % NC;
        const lx = sx * 18 * stage.scale.x, lz = 6 * stage.scale.x;
        cp[i * 3] = S.x + Math.cos(faceA) * lx + fwdX * lz; cp[i * 3 + 1] = 3; cp[i * 3 + 2] = S.z - Math.sin(faceA) * lx + fwdZ * lz;
        const a = R() * 6.28;
        cv[i * 3] = (fwdX * 6 - sx * Math.cos(faceA) * 3) + Math.cos(a) * 3; cv[i * 3 + 1] = 16 + R() * 8; cv[i * 3 + 2] = (fwdZ * 6 + sx * Math.sin(faceA) * 3) + Math.sin(a) * 3;
        const col = new T.Color().setHSL(R(), 0.9, 0.62); cc[i * 3] = col.r; cc[i * 3 + 1] = col.g; cc[i * 3 + 2] = col.b;
      }
    }
    for (let i = 0; i < NC; i++) {
      if (cp[i * 3 + 1] < -50) continue;
      cv[i * 3 + 1] -= 9 * dt; for (let a = 0; a < 3; a++) { cv[i * 3 + a] *= 1 - 1.4 * dt; cp[i * 3 + a] += cv[i * 3 + a] * dt; }
      cp[i * 3] += Math.sin(t * 3 + i) * dt * 0.8;
      if (cp[i * 3 + 1] < 0.1) cp[i * 3 + 1] = -99;
    }
    cG.attributes.position.needsUpdate = true;
  });
  W.stage = S;
}
