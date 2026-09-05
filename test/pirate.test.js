// 통아저씨: 구멍은 인원수에 맞춰 나고, 한 구멍에는 한 자루만 (선착순)
// 예전엔 24칸 고정에 여러 명이 같은 칸을 꽂을 수 있었다.
const H = require('./helpers');

module.exports = async function run() {
  const t = H.makeT('통아저씨');

  for (const [nBots, knives] of [[4, 1], [10, 1], [6, 2]]) {
    const r = await H.makeRoom(nBots);
    H.send(r.host, { type: 'start_game', game: 'pirate', opt: { knives } });
    await H.waitPlaying(r.code);
    await H.waitRoom(r.code, x => x.pirate && x.pirate.phase === 'pick', 9000, 'pick');
    let room = await H.room(r.code);
    const slots = room.pirate.slots, need = nBots * knives;
    t.ok(slots >= need + 3 && slots <= 48, `${nBots}명·칼${knives}자루 → 구멍 ${slots}개 (필요 ${need}, 여유 포함)`);

    // 먼저 꽂은 사람이 차지하고, 남은 못 꽂는다
    H.clearFrames(r.bots[1]);
    H.send(r.bots[0], { type: 'pick', v: 3 });
    await H.sleep(250);
    H.send(r.bots[1], { type: 'pick', v: 3 });
    await H.sleep(300);
    room = await H.room(r.code);
    const pick = n => (room.pirate.picks.find(x => x[0] === n) || [null, []])[1];
    t.ok(pick('봇1').includes(3), '먼저 꽂은 사람이 구멍을 차지한다');
    t.ok(!pick('봇2').includes(3), '남이 꽂은 구멍에는 못 꽂는다');
    t.ok(!!H.last(r.bots[1], 'pick_taken'), '거절당하면 pick_taken 을 받는다');

    // 같은 구멍을 다시 누르면 뽑히고, 그러면 남이 쓸 수 있다
    H.send(r.bots[0], { type: 'pick', v: 3 });
    await H.sleep(300);
    room = await H.room(r.code);
    t.ok(!pick('봇1').includes(3), '같은 구멍을 다시 누르면 칼을 뽑는다');
    H.send(r.bots[1], { type: 'pick', v: 3 });
    await H.sleep(300);
    room = await H.room(r.code);
    t.ok(pick('봇2').includes(3), '뽑은 구멍은 다른 사람이 쓸 수 있다');

    // 시간이 다 되면 서버가 남은 칼을 빈 구멍에 넣는다 — 그래도 겹치면 안 된다
    await H.waitRoom(r.code, x => x.pirate.phase === 'reveal', 16000, 'reveal');
    room = await H.room(r.code);
    const all = room.pirate.picks.flatMap(x => x[1]);
    t.ok(all.length === new Set(all).size, `자동 배정 뒤에도 겹친 구멍 0 (${all.length}자루)`);
    t.ok(all.length === need, `전원이 ${knives}자루씩 꽂았다 (${all.length}자루)`);
    t.ok(all.every(v => v >= 0 && v < slots), '모든 칼이 구멍 범위 안');
    t.ok(room.pirate.triggers.length >= 1 && room.pirate.triggers.length <= slots - need,
         `위험 칸 ${room.pirate.triggers.length}개 — 전원이 안전하게 꽂을 자리는 남는다`);
    r.close();
    await H.sleep(200);
  }

  t.ok(H.serverErrors().length === 0, '서버 예외 0건');
  return t;
};
