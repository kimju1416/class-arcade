import * as T from "../fps/three.module.js";
import { COURSE, ISLANDS, BRIDGES, CRYSTALS } from "./physics.mjs";
// Shared beveled box geometry: soft highlights without heavyweight character models.
const geo = new T.BoxGeometry(1, 1, 1, 4, 4, 4);
const positions = geo.attributes.position;
for (let i = 0; i < positions.count; i++) {
  const v = new T.Vector3().fromBufferAttribute(positions, i);
  const inner = v.clone().clampScalar(-0.445, 0.445);
  v.sub(inner).normalize().multiplyScalar(0.055).add(inner);
  positions.setXYZ(i, v.x, v.y, v.z);
}
geo.computeVertexNormals();
const crystalGeo = new T.OctahedronGeometry(0.55);
function mat(color, more = {}) {
  return new T.MeshStandardMaterial({ color, roughness: 0.82, ...more });
}
export async function createWorld(canvas, mobile) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.35 : 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new T.Scene();
  scene.background = new T.Color("#a4d8e3");
  scene.fog = new T.Fog("#b6dce2", 95, 240);
  const camera = new T.PerspectiveCamera(57, 1, 0.1, 500);
  const hemi = new T.HemisphereLight("#e4f9ff", "#6c8c85", 2.5);
  scene.add(hemi);
  const sun = new T.DirectionalLight("#fff0ca", 3.6);
  sun.position.set(-32, 65, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {
    left: -48,
    right: 48,
    top: 48,
    bottom: -48,
    near: 1,
    far: 160,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  const loader = new T.TextureLoader();
  const textures = await Promise.all(
    ["stone-texture", "grass-texture", "sky-panorama"].map((n) =>
      loader.loadAsync(`/nexus/assets/${n}.webp`),
    ),
  );
  textures.forEach((t) => {
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  });
  for (let i = 0; i < 2; i++) {
    textures[i].wrapS = textures[i].wrapT = T.RepeatWrapping;
    textures[i].repeat.set(i === 0 ? 2 : 5, i === 0 ? 2 : 5);
  }
  // A camera background keeps the painted sky clean at every aspect ratio, without panorama seams.
  scene.background = textures[2];
  const sky = new T.Object3D();
  const stone = mat("#e9dec2", { map: textures[0] }),
    grass = mat("#779d88", { map: textures[1] });
  const rock = mat("#789692"),
    darkRock = mat("#5b777c"),
    wood = mat("#936c4d"),
    leaf = mat("#78b784"),
    leafLight = mat("#a5cc8c");
  const teal = mat("#3eb3ac"),
    gold = mat("#f0c474", { metalness: 0.35, roughness: 0.45 });
  const gemMat = mat("#78edd9", {
    emissive: "#2abfac",
    emissiveIntensity: 0.6,
    metalness: 0.4,
    roughness: 0.12,
  });
  const purple = mat("#9c87d6", {
    emissive: "#6d52ae",
    emissiveIntensity: 0.16,
    roughness: 0.22,
    metalness: 0.2,
  });
  const solids = [...ISLANDS, ...BRIDGES, ...COURSE].map((p) => ({ ...p }));
  const animations = [],
    collectibles = [],
    rings = [],
    scenery = new T.Group();
  scene.add(scenery);
  function box(x, y, z, w, h, d, material, parent = scenery) {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  let seed = 314159;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function tree(x, y, z, scale = 1) {
    box(x, y + 1.5 * scale, z, 0.65 * scale, 3 * scale, 0.65 * scale, wood);
    const a = box(
      x,
      y + 3.9 * scale,
      z,
      3.4 * scale,
      2.7 * scale,
      3.2 * scale,
      leaf,
    );
    a.rotation.y = 0.3;
    box(
      x - 0.8 * scale,
      y + 4.9 * scale,
      z + 0.1,
      2.5 * scale,
      1.2 * scale,
      2.4 * scale,
      leafLight,
    );
    box(
      x + 1.3 * scale,
      y + 3.5 * scale,
      z - 0.4,
      1.7 * scale,
      1.9 * scale,
      2.1 * scale,
      leafLight,
    );
  }
  function island(p, decor = true) {
    box(
      p.x,
      p.y - 0.28,
      p.z,
      p.w,
      0.56,
      p.d,
      p.kind === "crystal" ? stone : grass,
    );
    box(p.x, p.y - 1.25, p.z, p.w - 0.6, 1.6, p.d - 0.6, stone);
    const lower = new T.Mesh(
      new T.CylinderGeometry(Math.max(p.w, p.d) * 0.53, 2, p.h + 5, 7, 1),
      rock,
    );
    lower.position.set(p.x, p.y - 3.2 - p.h / 2, p.z);
    lower.rotation.y = 0.25;
    lower.castShadow = true;
    scenery.add(lower);
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2,
        h = 4 + random() * 4;
      box(
        p.x + Math.sin(a) * p.w * 0.35,
        p.y - 2 - h / 2,
        p.z + Math.cos(a) * p.d * 0.35,
        3,
        h,
        3,
        j % 2 ? rock : darkRock,
      );
    }
    if (!decor) return;
    for (let i = 0; i < 4; i++) {
      const x = p.x + (i % 2 ? 1 : -1) * (p.w / 2 - 3),
        z = p.z + (i < 2 ? 1 : -1) * (p.d / 2 - 3);
      if (p.kind !== "crystal") tree(x, p.y, z, 0.8 + random() * 0.45);
    }
  }
  ISLANDS.forEach((p) => island(p));
  for (const p of BRIDGES) {
    box(p.x, p.y - 0.25, p.z, p.w, 0.5, p.d, wood);
    if (p.d > 5)
      for (let z = 13; z < 28; z += 2)
        for (const x of [-1.9, 1.9]) box(x, 0.65, z, 0.14, 1.3, 0.14, wood);
    else
      for (const z of [-1.8, 1.8]) {
        box(p.x, p.y + 0.6, z, 0.15, 1.2, 0.15, wood);
        box(p.x, p.y + 1.05, z, p.w, 0.09, 0.1, gold);
      }
  }
  for (const p of COURSE) {
    box(p.x, p.y - 0.45, p.z, p.w, 0.9, p.d, stone);
    box(p.x, p.y - 0.13, p.z, p.w + 0.05, 0.1, p.d + 0.05, teal);
    const cone = new T.Mesh(new T.ConeGeometry(2.9, 3.5, 4), rock);
    cone.rotation.z = Math.PI;
    cone.rotation.y = Math.PI / 4;
    cone.position.set(p.x, p.y - 2.5, p.z);
    scenery.add(cone);
    const ring = new T.Mesh(
      new T.TorusGeometry(1.55, 0.08, 6, 40),
      new T.MeshStandardMaterial({
        color: "#80ffdf",
        emissive: "#33d6b0",
        emissiveIntensity: 0.8,
      }),
    );
    ring.position.set(p.x, p.y + 1.8, p.z);
    scenery.add(ring);
    rings.push(ring);
    const label = makeLabel(String(p.index + 1), "#d9ffdc");
    label.position.set(p.x, p.y + 4, p.z);
    label.scale.set(1.3, 0.45, 1);
    scenery.add(label);
  }
  // The portal is open in the middle; decorative columns have matching collision bounds.
  for (const x of [-3.5, 3.5]) {
    box(x, 3.8, -8, 1.5, 7.6, 1.5, stone);
    box(x, 7.8, -8, 2, 0.7, 2, gold);
    solids.push({ x, z: -8, y: 7.6, w: 1.5, d: 1.5, h: 7.6 });
  }
  box(0, 8.2, -8, 9, 1, 1.8, stone);
  box(0, 8.8, -8, 7, 0.3, 2.1, gold);
  const portal = new T.Mesh(new T.TorusGeometry(2.75, 0.13, 8, 64), gemMat);
  portal.position.set(0, 3.4, -8);
  scenery.add(portal);
  const portalDisc = new T.Mesh(
    new T.CircleGeometry(2.6, 48),
    new T.MeshBasicMaterial({
      color: "#78ead7",
      transparent: true,
      opacity: 0.12,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  portalDisc.position.set(0, 3.4, -8);
  scenery.add(portalDisc);
  const crown = new T.Mesh(crystalGeo, gemMat);
  crown.position.set(0, 9.8, -8);
  crown.scale.set(1.8, 2.6, 1.8);
  scenery.add(crown);
  animations.push({ kind: "spin", mesh: crown, y: 9.8 });
  for (let z = 8; z > -8; z -= 2.2) box(0, 0.03, z, 4.2, 0.08, 1.85, stone);
  for (let i = 0; i < 20; i++) {
    const x = 44 + random() * 18,
      z = -9 + random() * 18;
    if (
      Math.hypot(x - 53, z) < 4 ||
      CRYSTALS.some((c) => Math.hypot(c[0] - x, c[2] - z) < 2)
    )
      continue;
    const h = 1.4 + random() * 5;
    const mesh = new T.Mesh(
      new T.ConeGeometry(0.6 + random() * 0.65, h, 5),
      purple,
    );
    mesh.position.set(x, 3 + h / 2, z);
    mesh.rotation.z = (random() - 0.5) * 0.25;
    mesh.castShadow = true;
    scenery.add(mesh);
  }
  for (const x of [-5, 5]) {
    box(x, 9, -80, 1.2, 6, 1.2, stone);
    box(x, 12, -80, 2, 0.4, 2, gold);
  }
  box(0, 12.3, -80, 12, 0.7, 1.6, stone);
  const summitGem = new T.Mesh(crystalGeo, purple);
  summitGem.scale.set(3, 5, 3);
  summitGem.position.set(0, 10, -84);
  scenery.add(summitGem);
  animations.push({ kind: "spin", mesh: summitGem, y: 10 });
  const signData = [
    [-8, 2.5, 0, "여명의 섬"],
    [14, 3.3, -3, "크리스털 유적 →"],
    [0, 4, -14, "↑ 하늘의 관문"],
    [8, 2.8, 41, "상상의 정원"],
  ];
  for (const [x, y, z, text] of signData) {
    const label = makeLabel(text);
    label.position.set(x, y, z);
    label.scale.set(3.2, 0.64, 1);
    scenery.add(label);
  }
  // Crafted architectural accents, lanterns, and flags give the hub a inhabited sense of scale.
  for (const x of [-3.5, 3.5]) {
    box(x, 0.25, -8, 2.4, 0.5, 2.4, stone);
    box(x, 0.55, -8, 2.05, 0.16, 2.05, gold);
    for (const y of [2, 4.5, 6.8]) {
      box(x, y, -7.2, 0.8, 0.18, 0.16, teal);
      const inset = box(x, y + 0.7, -7.2, 0.43, 0.43, 0.15, gold);
      inset.rotation.z = Math.PI / 4;
    }
    const flag = box(x + (x < 0 ? -1.4 : 1.4), 5.1, -7.8, 1.5, 2.7, 0.09, teal);
    flag.rotation.z = x < 0 ? -0.04 : 0.04;
  }
  for (const x of [-3.6, 3.6])
    for (const z of [-2, 6]) {
      box(x, 0.14, z, 0.6, 0.28, 0.6, stone);
      box(x, 1.0, z, 0.14, 1.75, 0.14, wood);
      box(x, 1.9, z, 0.52, 0.12, 0.52, gold);
      box(
        x,
        1.63,
        z,
        0.32,
        0.43,
        0.32,
        mat("#ffdf9a", { emissive: "#f5b462", emissiveIntensity: 0.5 }),
      );
    }
  const ruin = [-10, 0, -2];
  for (const side of [-1, 1]) {
    box(ruin[0] + side * 1.2, 1.65, ruin[2], 0.65, 3.3, 0.65, stone);
    box(ruin[0] + side * 1.2, 3.3, ruin[2], 0.9, 0.22, 0.9, gold);
  }
  box(ruin[0], 3.6, ruin[2], 3.5, 0.6, 0.85, stone);
  for (let i = 0; i < 8; i++) {
    const x = -11 + i * 0.4;
    box(x, 0.3, -5, 0.6, 0.6, 0.6, stone);
  }
  // Far islands, waterfalls, and volumetric-looking cloud clusters add depth to the skyline.
  for (let i = 0; i < 17; i++) {
    const a = (i / 17) * Math.PI * 2;
    const r = 100 + random() * 75;
    const p = {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r - 20,
      y: -4 + random() * 27,
      w: 10 + random() * 18,
      d: 12 + random() * 16,
      h: 8 + random() * 8,
    };
    island(p, false);
    if (i % 2 === 0) tree(p.x, p.y, p.z, 1.8);
  }
  const waterMat = new T.MeshBasicMaterial({
    color: "#a8fff0",
    transparent: true,
    opacity: 0.43,
    depthWrite: false,
    side: T.DoubleSide,
  });
  for (const p of ISLANDS) {
    const w = box(
      p.x + p.w / 2 - 0.3,
      p.y - 16,
      p.z + 5,
      1.3,
      32,
      2.7,
      waterMat,
    );
    w.castShadow = false;
    animations.push({ kind: "water", mesh: w });
  }
  const cloudGeo = new T.SphereGeometry(1, 7, 5),
    cloudMat = new T.MeshBasicMaterial({
      color: "#e9f4ed",
      transparent: true,
      opacity: 0.47,
      depthWrite: false,
    });
  const clouds = new T.InstancedMesh(cloudGeo, cloudMat, 90),
    dummy = new T.Object3D();
  for (let i = 0; i < 90; i++) {
    dummy.position.set(
      (random() - 0.5) * 370,
      -19 - random() * 20,
      (random() - 0.5) * 370,
    );
    dummy.scale.set(8 + random() * 15, 2 + random() * 4, 5 + random() * 12);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  scene.add(clouds);
  // Dense ground dressing is instanced to keep touch-device draw calls down.
  const flowers = new T.InstancedMesh(
    new T.IcosahedronGeometry(0.13, 0),
    mat("#fff0b5"),
    130,
  );
  const tufts = new T.InstancedMesh(
    new T.ConeGeometry(0.16, 0.55, 3),
    mat("#7cac69"),
    180,
  );
  for (let i = 0; i < 180; i++) {
    const p = ISLANDS[i % 4];
    const x = p.x + (random() - 0.5) * (p.w - 1),
      z = p.z + (random() - 0.5) * (p.d - 1);
    dummy.position.set(x, p.y + 0.25, z);
    dummy.scale.setScalar(1);
    dummy.rotation.set(0, random() * 6, 0.1);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    if (i < 130) {
      dummy.position.y += 0.1;
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
    }
  }
  scenery.add(flowers, tufts);
  CRYSTALS.forEach((c, i) => {
    const group = new T.Group(),
      gem = new T.Mesh(crystalGeo, gemMat);
    gem.scale.set(0.7, 1.1, 0.7);
    group.add(gem);
    const halo = new T.Mesh(new T.TorusGeometry(0.62, 0.018, 4, 24), gold);
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    group.position.set(...c);
    scene.add(group);
    collectibles.push({ mesh: group, x: c[0], y: c[1], z: c[2], id: i });
  });
  const pet = new T.Group();
  box(0, 0, 0, 0.48, 0.45, 0.48, stone, pet);
  box(0, 0.02, 0.246, 0.34, 0.24, 0.035, teal, pet);
  for (const x of [-0.09, 0.09])
    box(x, 0.04, 0.27, 0.06, 0.11, 0.03, gemMat, pet);
  scene.add(pet);
  const ghost = new T.Mesh(
    geo,
    new T.MeshBasicMaterial({
      color: "#caffc0",
      transparent: true,
      opacity: 0.42,
      wireframe: true,
    }),
  );
  ghost.scale.setScalar(1.52);
  ghost.visible = false;
  scene.add(ghost);
  const blockMaterials = [stone, grass, purple, wood];
  function createBlock(b) {
    const m = box(
      b.x,
      b.level * 1.5 + 0.75,
      b.z,
      1.5,
      1.5,
      1.5,
      blockMaterials[b.material],
      scene,
    );
    m.userData.block = b;
    return m;
  }
  const raycaster = new T.Raycaster();
  function pickGround(x, y, target) {
    raycaster.setFromCamera(new T.Vector2(x, y), camera);
    return raycaster.intersectObjects(target, false)[0];
  }
  const ground = new T.Mesh(
    new T.PlaneGeometry(24, 23),
    new T.MeshBasicMaterial({ visible: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.001, 39);
  scene.add(ground);
  function resize() {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // Static boxes share a handful of GPU draws instead of hundreds of individual draws.
  const staticGroups = new Map();
  const animatedMeshes = new Set(animations.map((a) => a.mesh));
  for (const mesh of [...scenery.children])
    if (
      mesh.isMesh &&
      mesh.geometry === geo &&
      !animatedMeshes.has(mesh) &&
      !mesh.material.transparent
    ) {
      mesh.updateMatrix();
      const group = staticGroups.get(mesh.material) || [];
      group.push(mesh);
      staticGroups.set(mesh.material, group);
    }
  for (const [material, meshes] of staticGroups) {
    const batch = new T.InstancedMesh(geo, material, meshes.length);
    batch.castShadow = true;
    batch.receiveShadow = true;
    meshes.forEach((m, i) => {
      batch.setMatrixAt(i, m.matrix);
      scenery.remove(m);
    });
    batch.computeBoundingSphere();
    scenery.add(batch);
  }
  resize();
  return {
    T,
    renderer,
    scene,
    camera,
    sun,
    solids,
    collectibles,
    rings,
    portal,
    portalDisc,
    ghost,
    ground,
    createBlock,
    pickGround,
    resize,
    pet,
    animations,
    sky,
    update(t, player) {
      for (const a of animations) {
        if (a.kind === "spin") {
          a.mesh.rotation.y = t * 0.55;
          a.mesh.position.y = a.y + Math.sin(t) * 0.25;
        } else a.mesh.material.opacity = 0.4 + Math.sin(t * 2) * 0.05;
      }
      for (const c of collectibles) {
        c.mesh.rotation.y = t * 1.5 + c.id;
        c.mesh.position.y = c.y + Math.sin(t * 2.2 + c.id) * 0.15;
      }
      portal.rotation.z = t * 0.12;
      portalDisc.material.opacity = 0.1 + Math.sin(t * 2) * 0.03;
      pet.position.set(
        player.x + 1.2,
        player.y + 2.1 + Math.sin(t * 3) * 0.15,
        player.z + 0.6,
      );
      pet.rotation.y = t * 0.4;
      sky.position.copy(camera.position);
      sun.position.set(player.x - 32, player.y + 65, player.z + 35);
      sun.target.position.set(player.x, player.y, player.z);
      sun.target.updateMatrixWorld();
    },
  };
}
export function makeLabel(text, color = "#ecfff1") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 100;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#173c45da";
  ctx.beginPath();
  ctx.roundRect(2, 3, 508, 94, 35);
  ctx.fill();
  ctx.strokeStyle = "#bbf2d580";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 32px sans-serif";
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 51, 470);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: texture, depthTest: true }),
  );
  sprite.scale.set(5, 1, 1);
  return sprite;
}
export function makeAvatar(skin = 0, nick = "") {
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  const cream = mat(skin ? "#d7cde9" : "#f1e7cf"),
    dark = mat("#384c51"),
    skinMat = mat("#dca877"),
    hair = mat("#604434"),
    accent = mat(skin ? "#a89bea" : "#368c8d");
  const visor = mat("#124753", { roughness: 0.22, metalness: 0.4 }),
    glow = mat("#adfff1", { emissive: "#55d5d7", emissiveIntensity: 1 });
  const cube = (w, h, d, x, y, z, m, parent = body) => {
    const mesh = new T.Mesh(geo, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  cube(0.72, 0.68, 0.44, 0, 1.04, 0, cream);
  cube(0.77, 0.14, 0.47, 0, 0.79, 0, dark);
  cube(0.57, 0.6, 0.25, 0, 1.07, -0.32, skin ? accent : hair);
  for (const x of [-0.23, 0.23]) {
    cube(0.075, 0.61, 0.06, x, 1.05, 0.25, hair);
    cube(0.1, 0.09, 0.075, x, 1.08, 0.27, accent);
  }
  cube(0.17, 0.12, 0.05, 0, 0.8, 0.26, accent);
  cube(0.44, 0.08, 0.28, 0, 1.22, -0.36, accent);
  const head = new T.Group();
  head.position.y = 1.67;
  body.add(head);
  cube(0.65, 0.62, 0.59, 0, 0, 0, skin ? cream : skinMat, head);
  if (skin) {
    cube(0.53, 0.29, 0.07, 0, 0.03, 0.32, visor, head);
    for (const x of [-0.13, 0.13])
      cube(0.08, 0.16, 0.03, x, 0.04, 0.37, glow, head);
  } else {
    cube(0.7, 0.2, 0.65, 0, 0.28, -0.01, hair, head);
    cube(0.21, 0.3, 0.2, -0.25, 0.19, 0.26, hair, head);
    cube(0.26, 0.2, 0.22, 0.1, 0.36, 0.13, hair, head);
    for (const x of [-0.14, 0.14])
      cube(0.055, 0.075, 0.025, x, 0.03, 0.305, dark, head);
    cube(0.13, 0.035, 0.025, 0, -0.15, 0.305, hair, head);
  }
  cube(0.8, 0.17, 0.52, 0, 1.36, 0, accent);
  const scarf = cube(0.2, 0.46, 0.09, 0.23, 1.03, 0.29, accent);
  const limbs = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(side * 0.53, 1.29, 0);
    body.add(arm);
    cube(0.28, 0.57, 0.3, 0, -0.24, 0, cream, arm);
    cube(0.26, 0.19, 0.27, 0, -0.57, 0, skin ? dark : skinMat, arm);
    limbs.push(arm);
  }
  for (const side of [-1, 1]) {
    const leg = new T.Group();
    leg.position.set(side * 0.21, 0.72, 0);
    body.add(leg);
    cube(0.3, 0.48, 0.32, 0, -0.23, 0, dark, leg);
    cube(0.34, 0.2, 0.46, 0, -0.61, 0.05, hair, leg);
    limbs.push(leg);
  }
  const wings = new T.Group();
  cube(3.4, 0.07, 0.95, 0, 1.48, -0.25, accent, wings);
  cube(0.1, 0.7, 0.08, 0, 1.8, -0.2, dark, wings);
  wings.visible = false;
  body.add(wings);
  if (nick) {
    const label = makeLabel(nick);
    label.position.y = 2.55;
    label.scale.set(2.3, 0.46, 1);
    root.add(label);
  }
  root.userData.animate = (t, speed, airborne, gliding) => {
    const swing = Math.sin(t * 13) * Math.min(speed / 7, 1) * 0.65;
    limbs[0].rotation.x = airborne ? -1 : swing;
    limbs[1].rotation.x = airborne ? -1 : -swing;
    limbs[2].rotation.x = airborne ? 0.3 : -swing;
    limbs[3].rotation.x = airborne ? -0.3 : swing;
    body.position.y = airborne
      ? 0
      : Math.abs(Math.sin(t * 13)) * Math.min(speed / 7, 1) * 0.035;
    scarf.rotation.x = -0.1 - speed * 0.025;
    wings.visible = gliding;
  };
  return root;
}
