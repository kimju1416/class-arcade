const B='../../public/kart/';
const { buildTrack, N } = await import(B+'trackmath.js');
const { TRACKS, CHARS } = await import(B+'data.js');
const { makeKart, stepKart } = await import(B+'physics.js');
const { botInput } = await import(B+'ai.js');
for (const def of TRACKS) {
  const tr = buildTrack(def);
  const race = { tr, hazards: new Map(), world: { boxes: [] }, racers: [] };
  for (let i = 0; i < 8; i++) { const k = makeKart('b'+i, CHARS[i%10], tr, -20 - i*8, (i%2?1:-1)*3); race.racers.push({ id:'b'+i, k, bot:true, skill: 1 }); }
  const loc = {}; const dt = 1/90; let t = 0; const stats = race.racers.map(()=>({lat:0,n:0,wall:0,off:0,lapT:[]})); race.racers.forEach(r=>{r.skill=1});
  while (t < 400) {
    for (const [j, r] of race.racers.entries()) {
      const inp = botInput(r, race, dt); stepKart(r.k, inp, tr, dt, loc);
      const s = stats[j]; s.lat += r.k.lat; s.n++; if (r.k.spd < 3 && t > 5) { s.slow = (s.slow||0) + dt; s.maxSlow = Math.max(s.maxSlow||0, s.slow); } else s.slow = 0; if (r.k.off) s.off++;
      for (const e of r.k.events) if (e==='wall') s.wall++; r.k.events.length=0;
      const lap = Math.floor(r.k.prog / N); if (lap > s.lapT.length - 1 && r.k.prog>0) s.lapT.push(+t.toFixed(1));
    }
    t += dt;
  }
  console.log(def.id, stats.map(s=>({meanLat:+(s.lat/s.n).toFixed(2), offPct:+(100*s.off/s.n).toFixed(1), wall:s.wall, laps:s.lapT.length, maxSlow: +(s.maxSlow||0).toFixed(1)})));
}
