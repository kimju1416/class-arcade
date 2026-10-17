"use strict";
// 광평중 탐험대(학교 구경 게임) 서버 — 같은 방 친구들의 위치·이모지·짧은 말·도장 수만 넘겨준다.
// 지도·미션 판정은 각자 브라우저가 한다. 아케이드 방(wss)과 완전히 따로 논다 — 경로 /campus/ws.
const crypto = require("crypto");

const ROOM_MAX = 50, ROOMS_MAX = 60, CLIENTS_MAX = 600;
const AREA_MAX = 15, XY_MAX = 400, EMO_MAX = 11, SAY_MAX = 15, STAMP_MAX = 99;

module.exports = function createCampusServer(WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const rooms = new Map();

  const send = (ws, o) => { if (ws.readyState === 1 && ws.bufferedAmount < 65536) ws.send(typeof o === "string" ? o : JSON.stringify(o)); };
  const bcast = (room, o) => { const s = JSON.stringify(o); for (const e of room.members.values()) if (e.hello) send(e.ws, s); };
  const okCh = (c) => c >= 32 && c !== 127 && !(c >= 0x200b && c <= 0x200f) && !(c >= 0x2028 && c <= 0x202e) && !"<>&\"'`".includes(String.fromCharCode(c));
  const clean = (v, n, d) => {
    if (typeof v !== "string") return d;
    const s = [...v].filter(ch => okCh(ch.codePointAt(0))).join("").trim();
    return [...s].slice(0, n).join("").trim() || d;
  };
  const int = (v, lo, hi, d) => Number.isInteger(v) && v >= lo && v <= hi ? v : d;
  const roster = (room) => [...room.members.values()].filter(e => e.hello).map(e => ({ id: e.id, nick: e.nick, look: e.look, n: e.stamps, s: e.stars, done: e.done }));

  wss.on("connection", (ws, req) => {
    let name = "광평";
    try { name = new URL(req.url, "http://localhost").searchParams.get("room") || "광평"; } catch {}
    name = clean(name, 12, "");
    if (!name) { ws.close(1008, "bad room"); return; }
    if (wss.clients.size > CLIENTS_MAX || (!rooms.has(name) && rooms.size >= ROOMS_MAX)) { ws.close(1013, "busy"); return; }
    let room = rooms.get(name);
    if (!room) { room = { members: new Map(), dirty: false, boardT: null }; rooms.set(name, room); }
    if (room.members.size >= ROOM_MAX) { ws.close(1013, "full"); return; }

    const id = crypto.randomBytes(4).toString("hex");
    const e = { ws, id, hello: false, alive: true, nick: "탐험가", look: [], a: 0, x: 0, y: 0, d: 0, m: 0, stamps: 0, stars: 0, done: false };
    room.members.set(id, e);
    let tokens = 40, last = Date.now();
    const helloT = setTimeout(() => { if (!e.hello) ws.close(1008, "hello"); }, 10000);
    helloT.unref();

    ws.on("pong", () => { e.alive = true; });
    ws.on("message", (raw) => {
      const now = Date.now();
      tokens = Math.min(40, tokens + (now - last) * 0.03); last = now;
      if (--tokens < 0) return; // 넘치면 버린다(끊지는 않는다 — 폰이 잠깐 몰아 보내는 일이 있다)
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "hi" && !e.hello) {
        e.nick = clean(m.nick, 8, "탐험가");
        e.look = Array.isArray(m.look) ? m.look.slice(0, 8).map(v => int(v, 0, 15, 0)) : [];
        e.stamps = int(m.n, 0, STAMP_MAX, 0); e.stars = int(m.s, 0, STAMP_MAX, 0);
        e.hello = true; clearTimeout(helloT);
        send(ws, { t: "hi", id, room: name });
        bcast(room, { t: "ro", list: roster(room) });
        return;
      }
      if (!e.hello) return;
      if (m.t === "p") {
        const a = int(m.a, 0, AREA_MAX, -1);
        if (a < 0 || typeof m.x !== "number" || typeof m.y !== "number" || !(Math.abs(m.x) <= XY_MAX) || !(Math.abs(m.y) <= XY_MAX)) return;
        e.a = a; e.x = Math.round(m.x * 10); e.y = Math.round(m.y * 10);
        e.d = int(m.d, 0, 3, 0); e.m = m.m ? 1 : 0;
        room.dirty = true;
      } else if (m.t === "e") {
        const v = int(m.e, 0, EMO_MAX, -1);
        if (v >= 0) bcast(room, { t: "e", id, e: v });
      } else if (m.t === "s") {
        const v = int(m.s, 0, SAY_MAX, -1);
        if (v >= 0) bcast(room, { t: "s", id, s: v });
      } else if (m.t === "g") {
        const n = int(m.n, 0, STAMP_MAX, e.stamps), st = int(m.s, 0, STAMP_MAX, e.stars);
        const done = !!m.done;
        if (n !== e.stamps || st !== e.stars || done !== e.done) {
          const firstDone = done && !e.done;
          e.stamps = n; e.stars = st; e.done = done;
          if (firstDone) bcast(room, { t: "win", id });
          // 도장 판은 몰려도 0.5초에 한 번만
          if (!room.boardT) room.boardT = setTimeout(() => { room.boardT = null; bcast(room, { t: "ro", list: roster(room) }); }, 500);
        }
      }
    });
    ws.on("close", () => {
      clearTimeout(helloT);
      room.members.delete(id);
      if (!room.members.size) { clearTimeout(room.boardT); rooms.delete(name); return; }
      bcast(room, { t: "ro", list: roster(room) });
    });
    ws.on("error", () => {});
  });

  // 위치는 바뀐 방만 초당 10번 묶어서 보낸다
  const tick = setInterval(() => {
    for (const room of rooms.values()) {
      if (!room.dirty) continue;
      room.dirty = false;
      const p = [];
      for (const e of room.members.values()) if (e.hello) p.push([e.id, e.a, e.x, e.y, e.d, e.m]);
      bcast(room, { t: "st", p });
    }
  }, 100);
  const heartbeat = setInterval(() => {
    for (const room of rooms.values())
      for (const e of room.members.values()) {
        if (!e.alive) { e.ws.terminate(); continue; }
        e.alive = false; try { e.ws.ping(); } catch {}
      }
  }, 30000);
  tick.unref(); heartbeat.unref();
  wss.on("close", () => { clearInterval(tick); clearInterval(heartbeat); });
  wss.on("error", () => {});
  return wss;
};
