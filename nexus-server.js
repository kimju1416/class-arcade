"use strict";
const crypto = require("crypto");
// Social exploration presence only. Achievements and builds are personal, never competitive server scores.
module.exports = function createNexusServer(WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const rooms = new Map();
  const send = (ws, data) => {
    if (ws.readyState === 1 && ws.bufferedAmount < 32768)
      ws.send(JSON.stringify(data));
  };
  wss.on("connection", (ws, req) => {
    const name =
      new URL(req.url, "http://localhost").searchParams.get("room") || "public";
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
      ws.close(1008, "Invalid room");
      return;
    }
    if (wss.clients.size > 256 || (!rooms.has(name) && rooms.size >= 64)) {
      ws.close(1013, "Server busy");
      return;
    }
    let room = rooms.get(name);
    if (!room) {
      room = new Map();
      rooms.set(name, room);
    }
    if (room.size >= 16) {
      ws.close(1013, "World full");
      return;
    }
    const id = crypto.randomBytes(6).toString("hex");
    const player = {
      id,
      nick: "탐험가",
      skin: 0,
      x: 0,
      y: 0,
      z: 7,
      angle: Math.PI,
      air: false,
      glide: false,
    };
    const entry = { ws, player, hello: false, alive: true };
    room.set(id, entry);
    let tokens = 50,
      last = Date.now();
    const helloTimeout = setTimeout(() => {
      if (!entry.hello) ws.close(1008, "Hello required");
    }, 10000);
    helloTimeout.unref();
    ws.on("pong", () => {
      entry.alive = true;
    });
    ws.on("message", (raw) => {
      const now = Date.now();
      tokens = Math.min(50, tokens + (now - last) * 0.025);
      last = now;
      if (--tokens < 0) {
        ws.close(1008, "Too many messages");
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "hello" && !entry.hello) {
        player.nick =
          typeof msg.nick === "string"
            ? msg.nick
                .replace(/[<>\u0000-\u001f\u007f]/g, "")
                .trim()
                .slice(0, 12) || "탐험가"
            : "탐험가";
        player.skin = msg.skin === 1 ? 1 : 0;
        entry.hello = true;
        clearTimeout(helloTimeout);
        send(ws, { type: "welcome", id, room: name });
        return;
      }
      if (msg.type !== "pose" || !entry.hello) return;
      if (
        !["x", "y", "z", "angle"].every(
          (k) => typeof msg[k] === "number" && Number.isFinite(msg[k]),
        )
      )
        return;
      if (
        Math.abs(msg.x) > 250 ||
        Math.abs(msg.z) > 250 ||
        msg.y < -40 ||
        msg.y > 100 ||
        Math.abs(msg.angle) > 100
      )
        return;
      for (const k of ["x", "y", "z", "angle"])
        player[k] = Math.round(msg[k] * 100) / 100;
      player.air = msg.air === true;
      player.glide = msg.glide === true;
    });
    ws.on("close", () => {
      clearTimeout(helloTimeout);
      room.delete(id);
      if (!room.size) rooms.delete(name);
    });
    ws.on("error", () => {});
  });
  const broadcast = setInterval(() => {
    for (const room of rooms.values()) {
      const players = [...room.values()]
        .filter((e) => e.hello)
        .map((e) => e.player);
      for (const entry of room.values())
        if (entry.hello) send(entry.ws, { type: "state", players });
    }
  }, 100);
  const heartbeat = setInterval(() => {
    for (const room of rooms.values())
      for (const entry of room.values()) {
        if (!entry.alive) {
          entry.ws.terminate();
          continue;
        }
        entry.alive = false;
        entry.ws.ping();
      }
  }, 30000);
  broadcast.unref();
  heartbeat.unref();
  wss.on("close", () => {
    clearInterval(broadcast);
    clearInterval(heartbeat);
  });
  wss.on("error", () => {});
  return wss;
};
