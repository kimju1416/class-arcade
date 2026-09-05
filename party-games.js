'use strict';

// Playground pack. Clients send directions/actions only; time, catches and tiles
// are adjudicated here. No dependencies on the websocket transport or renderer.
const KEYS = ['freeze', 'paint', 'fishing'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const active = room => [...room.players.values()].filter(p => p.alive && !p.waiting);
const moving = p => p.connected && Math.hypot(p.dirX || 0, p.dirY || 0) > .15;
const has = key => KEYS.includes(key);

function start(room, random = Math.random) {
  const g = room.game, ps = active(room);
  g.partyRandom = random;
  g.partyBegun = false;
  g.roundMs = room.gameType === 'freeze' ? 75000 : room.gameType === 'paint' ? 70000 : 60000;
  g.arenaW = room.gameType === 'freeze' ? 900 : 1000;
  g.arenaH = room.gameType === 'freeze' ? 1000 : 700;
  ps.forEach((p, i) => {
    p.score = 0;
    p.party = { seq: 0, event: '', eventAt: 0, readyAt: 0 };
    p.x = 65 + (i + .5) / ps.length * (g.arenaW - 130);
    p.y = 900;
  });
  if (room.gameType === 'freeze') {
    g.signal = 'ready'; g.signalAt = 0; g.switchAt = 0;
    ps.forEach(p => { p.party.finished = false; p.party.stunUntil = 0; p.party.penaltyCycle = -1; });
    g.cycle = 0;
  } else if (room.gameType === 'paint') {
    g.cols = 20; g.rows = 14; g.cell = 50;
    g.tiles = Array(g.cols * g.rows).fill(0);
    // Evenly spaced perimeter starts, instead of everyone fighting over the middle.
    ps.forEach((p, i) => {
      const a = Math.PI * 2 * i / ps.length;
      p.x = 500 + Math.cos(a) * 380;
      p.y = 350 + Math.sin(a) * 250;
      p.party.splash = false;
    });
  } else {
    ps.forEach(p => { p.x = 0; p.y = 0; p.party.stage = 'ready'; p.party.combo = 0; p.party.caught = 0; });
  }
}

function event(p, name, now) {
  p.party.event = name; p.party.eventAt = now; p.party.seq++;
}
function move(p, dt, speed, w, h) {
  if (!p.connected) return;
  // Defense in depth for direct callers as well as websocket input sanitation.
  let dx = Number.isFinite(p.dirX) ? p.dirX : 0, dy = Number.isFinite(p.dirY) ? p.dirY : 0;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  p.x = clamp(p.x + dx * speed * dt, 24, w - 24);
  p.y = clamp(p.y + dy * speed * dt, 24, h - 24);
}

function tick(room, now, dt) {
  const g = room.game;
  if (room.state !== 'playing') return false;
  // Stop before accepting any movement/catch on the deadline tick.
  if (now >= room.phaseEndAt) return true;
  if (!g.partyBegun) {
    g.partyBegun = true;
    if (room.gameType === 'freeze') { g.signal = 'go'; g.signalAt = now; g.switchAt = now + 2600; }
    if (room.gameType === 'fishing') active(room).forEach(p => cast(room, p, now));
  }
  if (room.gameType === 'freeze') return freezeTick(room, now, dt);
  if (room.gameType === 'paint') paintTick(room, now, dt);
  if (room.gameType === 'fishing') fishingTick(room, now);
  return false;
}

function freezeTick(room, now, dt) {
  const g = room.game;
  if (now >= g.switchAt) {
    g.signal = g.signal === 'go' ? 'warn' : g.signal === 'warn' ? 'stop' : 'go';
    g.signalAt = now;
    if (g.signal === 'stop') g.cycle++;
    g.switchAt = now + (g.signal === 'warn' ? 1000 : g.signal === 'stop' ? 1500 + g.partyRandom() * 1300 : 1800 + g.partyRandom() * 1700);
  }
  for (const p of active(room)) {
    const q = p.party;
    if (!q || q.finished) continue;
    if (g.signal === 'stop') {
      // A visible 1s amber warning + 180ms network grace; one penalty per red light.
      if (now - g.signalAt > 180 && moving(p) && q.penaltyCycle !== g.cycle) {
        p.y = Math.min(900, p.y + 150);
        q.stunUntil = now + 1100; q.penaltyCycle = g.cycle;
        event(p, 'oops', now);
      }
    } else if (now >= q.stunUntil) {
      move(p, dt, 210, g.arenaW, g.arenaH);
      p.y = Math.min(900, p.y);
    }
    p.score = Math.round(clamp((900 - p.y) / 790, 0, 1) * 900);
    if (p.y <= 110 && g.signal !== 'stop') {
      q.finished = true;
      p.score = 1000 + Math.ceil((room.phaseEndAt - now) / 100);
      event(p, 'finish', now);
    }
  }
  const ps = active(room);
  return ps.length > 0 && ps.every(p => p.party && p.party.finished);
}

function paintTick(room, now, dt) {
  const g = room.game, claims = new Map();
  const claim = (x, y, id) => {
    if (x < 0 || x >= g.cols || y < 0 || y >= g.rows) return;
    const k = y * g.cols + x;
    if (!claims.has(k)) claims.set(k, id);
    else if (claims.get(k) !== id) claims.set(k, -1); // contested cells retain their previous owner
  };
  for (const p of active(room)) {
    if (!p.connected || !p.party) continue;
    move(p, dt, 235, g.arenaW, g.arenaH);
    const x = Math.floor(p.x / g.cell), y = Math.floor(p.y / g.cell);
    const r = p.party.splash ? 1 : 0;
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) claim(xx, yy, p.id);
    p.party.splash = false;
  }
  for (const [cell, owner] of claims) if (owner > 0) g.tiles[cell] = owner;
  const counts = new Map();
  for (const owner of g.tiles) if (owner) counts.set(owner, (counts.get(owner) || 0) + 1);
  for (const p of room.players.values()) if (!p.waiting) p.score = counts.get(p.id) || 0;
}

function cast(room, p, now) {
  const q = p.party;
  q.stage = 'wait'; q.stageAt = now;
  // The bite schedule is deliberately not included in the client state.
  q.nextAt = now + 1500 + room.game.partyRandom() * 2100;
}
function fishingTick(room, now) {
  for (const p of active(room)) {
    const q = p.party;
    if (!q) continue;
    if (q.stage === 'wait' && now >= q.nextAt) {
      q.stage = 'bite'; q.stageAt = now; q.nextAt = now + 1400;
    } else if (q.stage === 'bite' && now >= q.nextAt) {
      q.combo = 0; q.stage = 'rest'; q.nextAt = now + 900; event(p, 'escaped', now);
    } else if (q.stage === 'reel' && now - q.stageAt >= 5000) {
      q.combo = 0; q.stage = 'rest'; q.nextAt = now + 900; event(p, 'escaped', now);
    } else if (q.stage === 'rest' && now >= q.nextAt) cast(room, p, now);
  }
}
function gauge(now, at) {
  const t = Math.max(0, now - at) % 1600 / 800;
  return t <= 1 ? t : 2 - t;
}

function action(room, p, now) {
  if (room.state !== 'playing' || now >= room.phaseEndAt || !p.alive || p.waiting || !p.connected || !p.party) return;
  const q = p.party;
  if (room.gameType === 'paint') {
    if (now < q.readyAt) return;
    q.splash = true; q.readyAt = now + 7000; event(p, 'splash', now);
  } else if (room.gameType === 'fishing') {
    if (q.stage === 'wait') {
      q.combo = 0; q.stage = 'rest'; q.nextAt = now + 1200; event(p, 'early', now);
    } else if (q.stage === 'bite' && now < q.nextAt) {
      q.stage = 'reel'; q.stageAt = now;
      q.target = .3 + room.game.partyRandom() * .4;
      q.rarity = room.game.partyRandom();
    } else if (q.stage === 'reel' && now - q.stageAt < 5000) {
      const hit = Math.abs(gauge(now, q.stageAt) - q.target) <= .14;
      if (hit) {
        q.combo = Math.min(5, q.combo + 1); q.caught++;
        const base = q.rarity > .88 ? 80 : q.rarity > .6 ? 50 : 30;
        q.gain = base + (q.combo - 1) * 10;
        p.score += q.gain;
        event(p, base === 80 ? 'treasure' : base === 50 ? 'gold' : 'fish', now);
      } else { q.combo = 0; event(p, 'miss', now); }
      q.stage = 'rest'; q.nextAt = now + 1100;
    }
  }
}

function state(room, now) {
  const g = room.game;
  return {
    type: 'state', mode: room.gameType, st: now,
    arena: { w: g.arenaW, h: g.arenaH },
    timeLeft: room.state === 'playing' ? Math.max(0, room.phaseEndAt - now) : g.roundMs,
    players: [...room.players.values()].map(p => [p.id, Math.round(p.x || 0), Math.round(p.y || 0), p.alive ? 1 : 0, p.waiting ? 1 : 0, p.score || 0]),
    party: {
      signal: room.gameType === 'freeze' ? g.signal : undefined,
      cols: g.cols, rows: g.rows, tiles: g.tiles,
      people: [...room.players.values()].filter(p => !p.waiting && p.party).map(p => {
        const q = p.party;
        return {
          id: p.id, seq: q.seq, event: now - q.eventAt < 1400 ? q.event : '',
          done: !!q.finished, stun: Math.max(0, (q.stunUntil || 0) - now),
          cooldown: Math.max(0, q.readyAt - now),
          stage: q.stage, stageAt: q.stage === 'reel' ? q.stageAt : undefined,
          target: q.stage === 'reel' ? q.target : undefined,
          combo: q.combo, caught: q.caught, gain: q.gain,
        };
      }),
    },
  };
}

module.exports = { KEYS, has, start, tick, action, state, gauge };
