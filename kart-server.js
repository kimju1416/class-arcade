"use strict";
// SUPERSTAR KART 멀티플레이 서버 — 방·출발 시각·위치 중계·아이템 번호·결승 순서만 맡는다.
// 카트 물리는 각자 폰/PC에서 돌리고(117ms 왕복을 기다리지 않게), 서버는 값이 말이 되는지만 거른다.
const crypto = require("crypto");

const MAX_ROOM = 40, MAX_RACERS = 12, GRID = 8, TICK_MS = 66, TRACKS = ["beach", "neon", "blossom", "kpop"];
const CHAR_N = 10;

module.exports = function createKartServer(WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const rooms = new Map();

  const send = (ws, o) => { if (ws.readyState === 1 && ws.bufferedAmount < 262144) ws.send(JSON.stringify(o)); };
  const bcast = (room, o, except) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p.ws !== except && p.ws.readyState === 1 && p.ws.bufferedAmount < 262144) p.ws.send(s); };
  const cleanName = (v) => typeof v === "string" ? (v.replace(/[<>\u0000-\u001f\u007f]/g, "").trim().slice(0, 10) || "레이서") : "레이서";
  const cleanCar = (o) => { const n = (v, lo, hi, d) => Number.isInteger(v) && v >= lo && v <= hi ? v : d; return o && typeof o === "object" ? { b: n(o.b, 0, 4, 0), c: n(o.c, -1, 13, -1), f: n(o.f, 0, 3, 0), w: n(o.w, 0, 3, 0), d: n(o.d, 0, 3, 0), n: n(o.n, 1, 99, 7) } : null; };
  const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : null;
  const newCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ"; let c; do { c = ""; for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)]; } while (rooms.has(c)); return c; };

  function lobbyState(room) {
    return {
      type: "lobby", code: room.code, host: room.host, track: room.track, bots: room.bots, teams: !!room.teams, state: room.state,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, char: p.char, host: p.id === room.host, racing: p.racing, tv: p.tv })),
      max: MAX_RACERS,
    };
  }
  function pickHost(room) {
    const first = room.players.values().next().value;
    room.host = first ? first.id : null;
  }
  function endRace(room, reason) {
    if (room.state !== "race") return;
    clearTimeout(room.endTimer);
    const r = room.race;
    // 결승 못 한 사람은 마지막 진행도 순
    const rest = r.grid.filter(g => !r.fin.find(f => f.id === g.id))
      .sort((a, b) => (r.prog[b.id] || -1e9) - (r.prog[a.id] || -1e9))
      .map(g => ({ id: g.id, time: null }));
    const order = [...r.fin, ...rest];
    bcast(room, { type: "results", order, reason });
    room.state = "lobby"; room.race = null;
    for (const p of room.players.values()) p.racing = false;
    bcast(room, lobbyState(room));
  }

  wss.on("connection", (ws) => {
    let room = null, me = null, tokens = 80, last = Date.now();
    ws.alive = true; ws.on("pong", () => ws.alive = true);
    const hello = setTimeout(() => { if (!me) ws.close(1008, "hello"); }, 10000);
    ws.on("error", () => { });
    ws.on("message", (raw) => {
      const now = Date.now();
      tokens = Math.min(80, tokens + (now - last) * 0.05); last = now;
      // Render 앞단 프록시를 거치면 close 프레임이 안 닿는 일이 있어 바로 끊는다
      if (--tokens < 0) { ws.terminate(); return; }
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== "object" || typeof m.t !== "string") return;
      try { handle(m, now); } catch (e) { console.error("[kart]", e && e.message); }
    });
    ws.on("close", () => {
      clearTimeout(hello);
      if (!room || !me) return;
      room.players.delete(me.id);
      if (!room.players.size) { clearTimeout(room.endTimer); rooms.delete(room.code); return; }
      if (room.host === me.id) { pickHost(room); if (room.state === "race") bcast(room, { type: "host", id: room.host }); }
      if (room.state === "race") {
        // 레이스 중 나간 사람은 그 자리에 남긴다(결과엔 미완주로)
        if (![...room.players.values()].some(p => p.racing && !room.race.fin.find(f => f.id === p.id))) endRace(room, "left");
      }
      bcast(room, { type: "left", id: me.id });
      bcast(room, lobbyState(room));
    });

    function handle(m, now) {
      if (m.t === "ping") { send(ws, { type: "pong", c: num(m.c, 0, 1e15), s: now }); return; }
      if (m.t === "hello" && !me) {
        let code = typeof m.room === "string" ? m.room.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) : "";
        if (m.create) {
          if (rooms.size >= 60) { send(ws, { type: "err", msg: "지금은 방이 너무 많아요. 잠시 뒤 다시 해 주세요." }); return; }
          code = newCode();
          rooms.set(code, { code, players: new Map(), host: null, track: "beach", bots: true, state: "lobby", race: null, seq: 1, sat: new Set() });
        }
        room = rooms.get(code);
        if (!room) { send(ws, { type: "err", msg: "그런 방이 없어요. 코드를 다시 확인해 주세요." }); return; }
        if (room.players.size >= MAX_ROOM) { send(ws, { type: "err", msg: "방이 꽉 찼어요 (최대 40명)." }); room = null; return; }
        clearTimeout(hello);
        me = { id: "p" + crypto.randomBytes(4).toString("hex"), ws, name: cleanName(m.name), char: Math.floor(num(m.char, 0, CHAR_N - 1) || 0), racing: false, tv: !!(m.create && m.tv), car: cleanCar(m.car) };
        room.players.set(me.id, me);
        if (!room.host) room.host = me.id;
        send(ws, { type: "welcome", id: me.id, code: room.code, s: now });
        bcast(room, lobbyState(room));
        return;
      }
      if (!me || !room) return;
      const isHost = room.host === me.id;
      switch (m.t) {
        case "car": { me.car = cleanCar(m.car); break; }
        case "char": {
          const c = num(m.char, 0, CHAR_N - 1); if (c == null) return;
          me.char = Math.floor(c); bcast(room, lobbyState(room)); break;
        }
        case "set": {
          if (!isHost || room.state !== "lobby") return;
          if (TRACKS.includes(m.track)) room.track = m.track;
          if (typeof m.bots === "boolean") room.bots = m.bots;
          if (typeof m.teams === "boolean") room.teams = m.teams;
          bcast(room, lobbyState(room)); break;
        }
        case "start": {
          if (!isHost || room.state !== "lobby") return;
          // 교실 TV(tv)는 달리지 않는다. 12명이 넘으면 지난 판에 쉰 사람부터 태운다
          let humans = [...room.players.values()].filter(p => !p.tv);
          if (!humans.length) { send(ws, { type: "err", msg: "달릴 학생이 아직 없어요." }); return; }
          humans.sort((a, b) => (room.sat.has(b.id) ? 1 : 0) - (room.sat.has(a.id) ? 1 : 0));
          const riders = humans.slice(0, MAX_RACERS);
          room.sat = new Set(humans.slice(MAX_RACERS).map(p => p.id));
          for (let i = riders.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [riders[i], riders[j]] = [riders[j], riders[i]]; }
          const grid = riders.map(p => ({ id: p.id, name: p.name, char: p.char, bot: false, car: p.car }));
          if (room.bots) {
            const used = new Set(grid.map(g => g.char));
            const free = [...Array(CHAR_N).keys()].filter(c => !used.has(c));
            const names = ["번개", "씽씽", "로켓", "질주", "바람", "터보", "회오리", "별빛"];
            let k = 0;
            while (grid.length < GRID) {
              const c = free.length ? free.splice(crypto.randomInt(free.length), 1)[0] : crypto.randomInt(CHAR_N);
              grid.unshift({ id: "b" + k, name: names[k % names.length], char: c, bot: true, skill: 0.9 + (k / GRID) * 0.08 }); k++;
            }
          }
          // 팀전: 사람과 봇을 번갈아 빨강(0)·파랑(1)으로
          if (room.teams) { const hs = grid.filter(g => !g.bot), bs = grid.filter(g => g.bot); hs.forEach((g, i) => g.team = i % 2); const c0 = hs.filter(g => g.team === 0).length; bs.forEach((g, i) => g.team = (c0 + i) % 2 === 0 ? 0 : 1); }
          room.state = "race";
          room.race = { id: crypto.randomBytes(3).toString("hex"), grid, t0: now + 9000, fin: [], prog: {}, poses: {}, firstFin: 0 };
          for (const p of room.players.values()) p.racing = riders.includes(p);
          bcast(room, { type: "start", race: room.race.id, track: room.track, t0: room.race.t0, grid, host: room.host, laps: 3, teams: !!room.teams });
          bcast(room, lobbyState(room));
          room.endTimer = setTimeout(() => endRace(room, "timeout"), 8 * 60 * 1000);
          break;
        }
        case "st": { // 내 카트(+방장은 봇들) 위치
          if (room.state !== "race" || !Array.isArray(m.k)) return;
          const r = room.race;
          for (const a of m.k.slice(0, MAX_RACERS + GRID)) {
            if (!Array.isArray(a) || a.length < 9) continue;
            const id = a[0];
            if (id !== me.id && !(isHost && typeof id === "string" && /^b\d$/.test(id))) continue;
            const v = a.slice(1, 9).map(x => num(x, -1e6, 1e6));
            if (v.some(x => x === null)) continue;
            r.poses[id] = v; r.prog[id] = v[6];
          }
          break;
        }
        case "item": { // 아이템 사용 — 서버가 번호와 시각을 붙여 모두에게
          if (room.state !== "race") return;
          const kind = ["ball", "hball", "banana", "mic", "star", "boost"].includes(m.k) ? m.k : null; if (!kind) return;
          const by = typeof m.by === "string" && (m.by === me.id || (isHost && /^b\d$/.test(m.by))) ? m.by : null; if (!by) return;
          const s = num(m.s, -1e5, 1e6), lat = num(m.lat, -40, 40); if (s === null || lat === null) return;
          const target = typeof m.tg === "string" ? m.tg.slice(0, 12) : null;
          bcast(room, { type: "item", id: room.seq++, k: kind, by, s, lat, tg: target, at: now, n: num(m.n, 0, 1e9) });
          break;
        }
        case "gone": { const id = num(m.id, 0, 1e9); if (id !== null && room.state === "race") bcast(room, { type: "gone", id }, ws); break; }
        case "hit": {
          if (room.state !== "race") return;
          const v = typeof m.v === "string" ? m.v.slice(0, 12) : null, by = typeof m.by === "string" ? m.by.slice(0, 12) : null;
          if (v && by) bcast(room, { type: "hit", v, by, k: typeof m.k === "string" ? m.k.slice(0, 8) : "" });
          break;
        }
        case "fin": {
          if (room.state !== "race") return;
          const r = room.race;
          const id = m.id === me.id || (isHost && /^b\d$/.test(m.id)) ? m.id : null; if (!id) return;
          if (r.fin.find(f => f.id === id) || !r.grid.find(g => g.id === id)) return;
          const time = Math.max(0, now - r.t0);
          if (time < 20000) return; // 말이 안 되는 기록
          r.fin.push({ id, time });
          bcast(room, { type: "fin", id, rank: r.fin.length, time });
          const humansLeft = [...room.players.values()].filter(p => p.racing && !r.fin.find(f => f.id === p.id));
          if (!humansLeft.length) { clearTimeout(room.endTimer); room.endTimer = setTimeout(() => endRace(room, "done"), 3500); }
          else if (!/^b/.test(id) && !r.firstFin) {
            r.firstFin = now;
            clearTimeout(room.endTimer);
            room.endTimer = setTimeout(() => endRace(room, "timeout"), 40000);
            bcast(room, { type: "closing", sec: 40 });
          }
          break;
        }
        case "back": { if (isHost && room.state === "race") endRace(room, "host"); break; }
      }
    }
  });

  // 위치 중계 — 15Hz
  const tick = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.state !== "race") continue;
      const r = room.race, k = [];
      for (const id in r.poses) k.push([id, ...r.poses[id]]);
      if (k.length) bcast(room, { type: "ss", s: now, k });
    }
  }, TICK_MS);
  const hb = setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { } } }, 30000);
  wss.on("close", () => { clearInterval(tick); clearInterval(hb); });
  return wss;
};
