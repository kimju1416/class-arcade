export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const COURSE = Array.from({ length: 9 }, (_, i) => ({
  x: [-3, 1, 4, 0, -4, -1, 3, 0, 0][i],
  y: [1, 2, 2.5, 3.5, 4, 4.5, 5, 5.5, 6][i],
  z: -18 - i * 6,
  w: 4.8,
  d: 4.8,
  h: 2.8,
  kind: "course",
  index: i,
}));
export const ISLANDS = [
  { x: 0, y: 0, z: 0, w: 28, d: 26, h: 5, kind: "hub" },
  { x: 53, y: 3, z: 0, w: 22, d: 23, h: 8, kind: "crystal" },
  { x: 0, y: 6, z: -78, w: 21, d: 20, h: 8, kind: "summit" },
  { x: 0, y: 0, z: 39, w: 26, d: 25, h: 6, kind: "garden" },
];
export const BRIDGES = [
  ...Array.from({ length: 7 }, (_, i) => ({
    x: 16 + i * 4,
    z: 0,
    y: 0.4 + i * 0.43,
    w: 4.1,
    d: 3.6,
    h: 0.5,
    kind: "bridge",
  })),
  { x: 0, z: 20, y: 0, w: 3.8, d: 16, h: 0.55, kind: "bridge" },
];
export const CRYSTALS = [
  [-7, 1.4, 5],
  [7, 1.4, 6],
  [-9, 1.4, -6],
  [9, 1.4, -8],
  [24, 2.6, 0],
  [36, 3.7, 0],
  [47, 4.4, 7],
  [59, 4.4, -6],
  [4, 3.9, -30],
  [-1, 5.9, -48],
  [0, 7.4, -66],
  [0, 7.4, -80],
];
export function makePlayer() {
  return {
    x: 0,
    y: 0,
    z: 7,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: Math.PI,
    grounded: true,
    jumps: 0,
    coyote: 0.12,
    dash: 0,
    cooldown: 0,
    gliding: false,
  };
}
export function overlaps(x, z, p, radius = 0.32) {
  return (
    Math.abs(x - p.x) < p.w / 2 + radius && Math.abs(z - p.z) < p.d / 2 + radius
  );
}
export function stepPlayer(p, input, solids, dt) {
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.dash = Math.max(0, p.dash - dt);
  p.coyote = p.grounded ? 0.12 : Math.max(0, p.coyote - dt);
  if (input.jump && (p.grounded || p.coyote > 0 || p.jumps < 2)) {
    if (!p.grounded && p.coyote <= 0 && p.jumps === 0) p.jumps = 1;
    p.vy = p.jumps === 0 ? 9.5 : 8.7;
    p.jumps++;
    p.grounded = false;
    p.coyote = 0;
  }
  const length = Math.hypot(input.x, input.z);
  let dx = input.x / Math.max(1, length),
    dz = input.z / Math.max(1, length);
  if (length > 0.08) p.angle = Math.atan2(dx, dz);
  if (input.dash && p.cooldown <= 0) {
    p.dash = 0.2;
    p.cooldown = 1.5;
  }
  if (p.dash > 0) {
    dx = Math.sin(p.angle);
    dz = Math.cos(p.angle);
  }
  const speed = p.dash > 0 ? 19 : 7.4;
  const smooth = 1 - Math.exp(-dt * (p.grounded ? 16 : 6));
  p.vx += (dx * speed - p.vx) * smooth;
  p.vz += (dz * speed - p.vz) * smooth;
  const blocked = (x, z) =>
    solids.some(
      (s) =>
        overlaps(x, z, s) && p.y < s.y - 0.46 && p.y + 1.7 > s.y - s.h + 0.1,
    );
  const nx = p.x + p.vx * dt;
  if (!blocked(nx, p.z)) p.x = nx;
  else p.vx = 0;
  const nz = p.z + p.vz * dt;
  if (!blocked(p.x, nz)) p.z = nz;
  else p.vz = 0;
  const oldY = p.y;
  p.gliding = !!input.holdJump && p.vy < -0.5 && !p.grounded && p.jumps >= 2;
  p.vy = Math.max(p.gliding ? -2.8 : -32, p.vy - (p.gliding ? 6 : 25) * dt);
  p.y += p.vy * dt;
  p.grounded = false;
  if (p.vy <= 0) {
    let surface = -Infinity;
    for (const s of solids)
      if (
        overlaps(p.x, p.z, s) &&
        oldY >= s.y - 0.46 &&
        p.y <= s.y &&
        s.y > surface
      )
        surface = s.y;
    if (surface !== -Infinity) {
      p.y = surface;
      p.vy = 0;
      p.grounded = true;
      p.jumps = 0;
      p.gliding = false;
    }
  } else {
    for (const s of solids)
      if (
        overlaps(p.x, p.z, s) &&
        oldY + 1.7 <= s.y - s.h &&
        p.y + 1.7 >= s.y - s.h
      ) {
        p.y = s.y - s.h - 1.71;
        p.vy = 0;
        break;
      }
  }
}
export function validBlock(b) {
  return (
    b &&
    Number.isInteger(b.x) &&
    Number.isInteger(b.z) &&
    Number.isInteger(b.level) &&
    Number.isInteger(b.material) &&
    Math.abs(b.x) <= 10 &&
    b.z >= 30 &&
    b.z <= 48 &&
    b.level >= 0 &&
    b.level <= 7 &&
    b.material >= 0 &&
    b.material <= 3
  );
}
export function canPlace(blocks, b, p) {
  if (
    !validBlock(b) ||
    blocks.length >= 150 ||
    blocks.some((a) => a.x === b.x && a.z === b.z && a.level === b.level)
  )
    return false;
  const bottom = b.level * 1.5;
  if (
    Math.abs(p.x - b.x) < 1.1 &&
    Math.abs(p.z - b.z) < 1.1 &&
    p.y < bottom + 1.5 &&
    p.y + 1.7 > bottom
  )
    return false;
  if (Math.hypot(p.x - b.x, p.z - b.z) > 9) return false;
  return (
    b.level === 0 ||
    blocks.some((a) => a.x === b.x && a.z === b.z && a.level === b.level - 1)
  );
}
export function blockSolid(b) {
  return { x: b.x, z: b.z, y: (b.level + 1) * 1.5, w: 1.5, d: 1.5, h: 1.5 };
}
