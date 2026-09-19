import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  makePlayer,
  stepPlayer,
  ISLANDS,
  BRIDGES,
  COURSE,
  validBlock,
  canPlace,
  blockSolid,
} from "../public/nexus/physics.mjs";
const require = createRequire(import.meta.url),
  { WebSocket, WebSocketServer } = require("ws");
const base = [...ISLANDS, ...BRIDGES, ...COURSE];
const input = (x = 0, z = 0, extra = {}) => ({
  x,
  z,
  jump: false,
  dash: false,
  holdJump: false,
  ...extra,
});
test("standing is stable and a double jump lands back on the island", () => {
  const p = makePlayer();
  for (let i = 0; i < 120; i++) stepPlayer(p, input(), base, 1 / 60);
  assert.equal(p.y, 0);
  assert.equal(p.grounded, true);
  stepPlayer(p, input(0, 0, { jump: true }), base, 1 / 60);
  assert.ok(p.vy > 8);
  for (let i = 0; i < 20; i++) stepPlayer(p, input(), base, 1 / 60);
  stepPlayer(p, input(0, 0, { jump: true }), base, 1 / 60);
  assert.equal(p.jumps, 2);
  const vy = p.vy;
  stepPlayer(p, input(0, 0, { jump: true }), base, 1 / 60);
  assert.ok(p.vy < vy);
  for (let i = 0; i < 180; i++) stepPlayer(p, input(), base, 1 / 60);
  assert.equal(p.y, 0);
  assert.equal(p.grounded, true);
});
test("diagonal speed is normalized, dash cools down, glide limits falling", () => {
  const p = makePlayer();
  for (let i = 0; i < 40; i++) stepPlayer(p, input(1, 1), base, 1 / 60);
  assert.ok(Math.hypot(p.vx, p.vz) <= 7.41);
  stepPlayer(p, input(1, 0, { dash: true }), base, 1 / 60);
  assert.ok(p.cooldown > 1.4);
  for (let i = 0; i < 16; i++)
    stepPlayer(p, input(1, 0, { dash: true }), base, 1 / 60);
  assert.equal(p.dash, 0);
  Object.assign(p, { x: 80, y: 20, vy: -15, jumps: 2, grounded: false });
  stepPlayer(p, input(0, 0, { holdJump: true }), base, 1 / 60);
  assert.ok(p.vy >= -2.8);
  assert.equal(p.gliding, true);
});
test("all nine parkour platforms are reachable with the actual movement rules", () => {
  const p = makePlayer();
  Object.assign(p, { x: 0, z: -10, y: 0 });
  for (const gate of COURSE) {
    let reached = false;
    for (let i = 0; i < 300; i++) {
      const dx = gate.x - p.x,
        dz = gate.z - p.z,
        dist = Math.hypot(dx, dz);
      const jump =
        (p.grounded && dist > 1.3) ||
        (!p.grounded && p.jumps === 1 && p.vy < 1.5);
      stepPlayer(
        p,
        input(dist > 0.5 ? dx / dist : 0, dist > 0.5 ? dz / dist : 0, { jump }),
        base,
        1 / 60,
      );
      if (p.y < -20) break;
      if (
        p.grounded &&
        Math.hypot(p.x - gate.x, p.z - gate.z) < 1.5 &&
        Math.abs(p.y - gate.y) < 0.1
      ) {
        reached = true;
        break;
      }
    }
    assert.ok(
      reached,
      `platform ${gate.index + 1} reachable: ${JSON.stringify(p)}`,
    );
  }
});
test("build bounds, support, overlap, block cap and solid top are enforced", () => {
  const p = { x: 0, y: 0, z: 31 },
    b = { x: 0, z: 36, level: 0, material: 0 };
  assert.ok(validBlock(b));
  assert.ok(canPlace([], b, p));
  assert.equal(canPlace([b], b, p), false);
  assert.equal(canPlace([], { ...b, level: 1 }, p), false);
  assert.ok(canPlace([b], { ...b, level: 1 }, p));
  assert.equal(canPlace([], { ...b, x: 100 }, p), false);
  assert.equal(canPlace([], { ...b, z: 31 }, p), false);
  assert.equal(canPlace(Array(150).fill(b), { ...b, x: 2 }, p), false);
  assert.equal(blockSolid(b).y, 1.5);
});
test("presence rooms isolate users, validate numeric input and clean up disconnects", async () => {
  const server = createServer(),
    wss = require("../nexus-server.js")(WebSocketServer);
  server.on("upgrade", (req, socket, head) =>
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port,
    sockets = [];
  async function join(room, nick) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/nexus/ws?room=${room}`);
    sockets.push(ws);
    ws.messages = [];
    ws.on("message", (r) => ws.messages.push(JSON.parse(r)));
    await once(ws, "open");
    ws.send(JSON.stringify({ type: "hello", nick, skin: 1 }));
    return ws;
  }
  async function waitFor(ws, predicate) {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const m = ws.messages.find(predicate);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("Message timeout");
  }
  try {
    const a = await join("test-one", "Alice"),
      b = await join("test-one", "<Bob>"),
      c = await join("test-two", "Carol");
    const welcome = await waitFor(a, (m) => m.type === "welcome");
    assert.ok(welcome.id);
    const state = await waitFor(
      a,
      (m) => m.type === "state" && m.players.length === 2,
    );
    assert.deepEqual(state.players.map((p) => p.nick).sort(), ["Alice", "Bob"]);
    const isolated = await waitFor(c, (m) => m.type === "state");
    assert.equal(isolated.players.length, 1);
    a.send(JSON.stringify({ type: "pose", x: 5, y: 2, z: 7, angle: 1 }));
    await waitFor(
      b,
      (m) =>
        m.type === "state" &&
        m.players.some((p) => p.nick === "Alice" && p.x === 5),
    );
    a.send('{"type":"pose","x":1e400,"y":2,"z":7,"angle":1}');
    a.send(JSON.stringify({ type: "pose", x: 900, y: 2, z: 7, angle: 1 }));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(
      b.messages.at(-1).players.find((p) => p.nick === "Alice").x,
      5,
    );
    b.messages = [];
    a.close();
    await waitFor(b, (m) => m.type === "state" && m.players.length === 1);
  } finally {
    for (const ws of sockets) ws.terminate();
    await new Promise((r) => wss.close(r));
    await new Promise((r) => server.close(r));
  }
});
