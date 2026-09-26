"use strict";
// 말랑 대전(뿌요뿌요식 1:1) 서버 — 방 목록·입장·준비·라운드 시작/판정·공격 중계만 맡는다.
// 판은 각자 브라우저가 돌리고(같은 시드로 같은 뿌요 순서), 서버는 상대 판 모습과 방해뿌요 수만 넘겨준다.
// 아케이드 방(wss)과 완전히 따로 논다 — 경로 /mallang-7xq4/ws, 방 목록도 따로.
const crypto = require("crypto");

const MAX_ROOMS = 60, GRACE_MS = 15000, MSG_LIMIT = 50;

module.exports = function createPuyoServer(WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const rooms = new Map();
  const lobby = new Set();

  const send = (ws, o) => { if (ws && ws.readyState === 1 && ws.bufferedAmount < 131072) ws.send(JSON.stringify(o)); };
  const okCh = (c) => c >= 32 && c !== 127 && !(c >= 0x200b && c <= 0x200f) && !(c >= 0x2028 && c <= 0x202e) && !"<>&\"'".includes(String.fromCharCode(c));
  const clean = (v, n, d) => typeof v === "string" ? ([...v].filter(ch => okCh(ch.charCodeAt(0))).join("").trim().slice(0, n) || d) : d;
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  const newCode = () => { let c; do { c = String(crypto.randomInt(1000, 10000)); } while (rooms.has(c)); return c; };

  const listRooms = () => [...rooms.values()].map(r => ({
    code: r.code, name: r.name, ft: r.ft, n: r.players.length, state: r.state, lock: !!r.pw,
    host: r.players[0] ? r.players[0].name : "",
  }));
  let lobbyTimer = null;
  function pushLobby() {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = null;
      const s = JSON.stringify({ t: "rooms", list: listRooms() });
      for (const ws of lobby) if (ws.readyState === 1) ws.send(s);
    }, 150);
  }
  function roomState(r) {
    return { t: "room", code: r.code, name: r.name, ft: r.ft, pw: r.pw || "", state: r.state, round: r.round,
      players: r.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, wins: p.wins, on: !!p.ws })) };
  }
  const bcast = (r, o) => { for (const p of r.players) send(p.ws, o); };
  const other = (r, p) => r.players.find(q => q !== p);

  function leave(r, p, why) {
    clearTimeout(p.graceT);
    r.players = r.players.filter(q => q !== p);
    if (p.ws) { p.ws.room = null; p.ws.player = null; }
    const o = r.players[0];
    if (!o) { clearTimeout(r.nextT); rooms.delete(r.code); pushLobby(); return; }
    if (r.state === "play" || r.state === "between") {
      // 경기 중에 나가면 남은 사람이 그 경기를 이긴 것으로 끝낸다
      clearTimeout(r.nextT);
      send(o.ws, { t: "forfeit", why: why || "left" });
    }
    r.state = "wait"; r.round = 0;
    for (const q of r.players) { q.ready = false; q.wins = 0; }
    bcast(r, roomState(r));
    pushLobby();
  }

  function startRound(r) {
    r.state = "play"; r.round++;
    r.seed = crypto.randomInt(1, 2147483647);
    r.colors = [0, 1, 2, 3, 4].sort(() => crypto.randomInt(3) - 1).slice(0, 4);
    for (const p of r.players) { p.dead = false; p.snap = null; }
    bcast(r, roomState(r));
    bcast(r, { t: "start", seed: r.seed, colors: r.colors, round: r.round, at: 3000 });
    pushLobby();
  }

  function onDead(r, p) {
    if (r.state !== "play" || p.dead) return;
    p.dead = true;
    const w = other(r, p);
    if (!w) return;
    w.wins++;
    const match = w.wins >= r.ft;
    r.state = match ? "over" : "between";
    bcast(r, { t: "roundEnd", winner: w.id, loser: p.id, wins: r.players.map(q => [q.id, q.wins]), match });
    bcast(r, roomState(r));
    if (!match) r.nextT = setTimeout(() => { if (r.players.length === 2 && r.state === "between") startRound(r); }, 3500);
    else { for (const q of r.players) q.ready = false; pushLobby(); }
  }

  wss.on("error", (e) => console.error("[puyo wss 오류]", e.message));
  wss.on("connection", (ws) => {
    ws.on("error", () => {});
    ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; });
    ws.cnt = 0; ws.win = Date.now();
    lobby.add(ws);
    send(ws, { t: "rooms", list: listRooms() });

    ws.on("message", (raw) => {
      try {
        const now = Date.now();
        if (now - ws.win > 1000) { ws.win = now; ws.cnt = 0; }
        if (++ws.cnt > MSG_LIMIT) return;
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (!m || typeof m !== "object") return;
        const r = ws.room, p = ws.player;

        switch (m.t) {
          case "create": {
            if (r) return;
            if (rooms.size >= MAX_ROOMS) return send(ws, { t: "err", msg: "방이 너무 많아요. 잠시 후 다시 해 주세요." });
            const code = newCode();
            const room = { code, name: clean(m.room, 16, "한 판 붙자"), ft: int(m.ft, 1, 7) || 2, players: [], state: "wait", round: 0,
              pw: typeof m.pw === "string" && /^[0-9]{4}$/.test(m.pw) ? m.pw : "" };
            rooms.set(code, room);
            join(ws, room, m);
            return;
          }
          case "join": {
            if (r) return;
            const room = rooms.get(clean(m.code, 4, "").toUpperCase());
            if (!room) return send(ws, { t: "err", msg: "그 방이 없어요. 코드를 확인해 주세요." });
            if (room.players.length >= 2) return send(ws, { t: "err", msg: "이미 두 명이 있어요." });
            if (room.pw && m.pw !== room.pw) return send(ws, { t: "err", msg: m.pw ? "비밀번호가 달라요." : "비밀번호 4자리를 넣어 주세요.", need: "pw", code: room.code });
            join(ws, room, m);
            return;
          }
          case "resume": {
            // 잠깐 끊겼다 다시 붙은 경우 — 같은 토큰이면 자리를 돌려준다
            const room = rooms.get(clean(m.code, 4, "").toUpperCase());
            const q = room && room.players.find(x => x.token === m.token && typeof m.token === "string");
            if (!q) return send(ws, { t: "resumeFail" });
            clearTimeout(q.graceT);
            if (q.ws && q.ws !== ws) { try { q.ws.room = null; q.ws.close(); } catch {} }
            q.ws = ws; ws.room = room; ws.player = q; lobby.delete(ws);
            send(ws, { t: "joined", id: q.id, token: q.token });
            bcast(room, roomState(room));
            const o = other(room, q); if (o && o.snap) send(ws, o.snap);
            if (o) send(o.ws, { t: "oppBack" });
            return;
          }
          case "leave": if (r) { leave(r, p); lobby.add(ws); send(ws, { t: "rooms", list: listRooms() }); } return;
          case "ready": {
            if (!r || (r.state !== "wait" && r.state !== "over")) return;
            if (r.state === "over") { r.state = "wait"; r.round = 0; for (const q of r.players) q.wins = 0; }
            p.ready = !!m.v;
            if (r.players.length === 2 && r.players.every(q => q.ready)) startRound(r);
            else bcast(r, roomState(r));
            return;
          }
          case "ft": {
            if (!r || r.players[0] !== p || r.state !== "wait") return;
            r.ft = int(m.v, 1, 7) || r.ft; bcast(r, roomState(r)); pushLobby();
            return;
          }
          case "s": {
            // 내 판 모습 → 상대에게. 판 문자열은 모양만 검사하고 그대로 넘긴다
            if (!r || r.state !== "play") return;
            if (typeof m.f !== "string" || m.f.length !== 78 || !/^[.RGBYPOrgbypo]+$/.test(m.f)) return;
            const snap = { t: "s", f: m.f,
              a: Array.isArray(m.a) && m.a.length === 5 && m.a.every(v => Number.isInteger(v) && v >= -2 && v <= 40) ? m.a : null,
              sc: int(m.sc, 0, 99999999) || 0, p: int(m.p, 0, 99999) || 0, ch: int(m.ch, 0, 40) || 0, n: Array.isArray(m.n) && m.n.length <= 4 && m.n.every(v => int(v, 0, 4) !== null) ? m.n : [] };
            p.snap = snap;
            const o = other(r, p); if (o) send(o.ws, snap);
            return;
          }
          case "atk": {
            // 방해뿌요 전송. done=연쇄 끝(이때 상대 쪽 예고가 확정되어 떨어질 수 있게 된다)
            if (!r || r.state !== "play") return;
            const n = int(m.n, 0, 2000); if (n === null) return;
            const o = other(r, p); if (o) send(o.ws, { t: "atk", n, done: !!m.done, ch: int(m.ch, 0, 40) || 0 });
            return;
          }
          case "dead": if (r) onDead(r, p); return;
          case "emo": {
            if (!r) return; const v = int(m.v, 0, 5); if (v === null) return;
            if (now - (p.emoAt || 0) < 800) return; p.emoAt = now;
            const o = other(r, p); if (o) send(o.ws, { t: "emo", v });
            return;
          }
        }
      } catch (e) { console.error("[puyo 메시지 오류]", e && e.stack || e); }
    });

    ws.on("close", () => {
      lobby.delete(ws);
      const r = ws.room, p = ws.player;
      if (!r || !p || p.ws !== ws) return;
      p.ws = null;
      bcast(r, roomState(r));
      const o = other(r, p); if (o) send(o.ws, { t: "oppAway" });
      p.graceT = setTimeout(() => { if (!p.ws && rooms.get(r.code) === r) leave(r, p, "away"); }, GRACE_MS);
    });
  });

  function join(ws, room, m) {
    const p = { id: crypto.randomBytes(4).toString("hex"), token: crypto.randomBytes(12).toString("hex"),
      name: clean(m.name, 10, "플레이어"), ws, ready: false, wins: 0 };
    room.players.push(p);
    ws.room = room; ws.player = p; lobby.delete(ws);
    send(ws, { t: "joined", id: p.id, token: p.token });
    if (room.state === "over") { room.state = "wait"; for (const q of room.players) { q.wins = 0; q.ready = false; } }
    bcast(room, roomState(room));
    pushLobby();
  }

  // 죽은 연결 정리
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
      ws.isAlive = false; try { ws.ping(); } catch {}
    }
  }, 20000);
  hb.unref && hb.unref();

  return wss;
};
