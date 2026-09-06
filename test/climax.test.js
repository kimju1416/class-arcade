// 결정적 순간: 최후의 1인이 가려지면 서버가 잠깐(CLIMAX_MS) 뜸을 들인 뒤 결과로 넘어간다.
// 예전엔 폭탄·갤러그·스모만 그랬고 의자 뺏기·OX는 승부가 나자마자 결과창으로 넘어가
// 교실에서 제일 시끄러운 순간이 통째로 사라졌다.
const H = require('./helpers');
const CLIMAX_MS = 1800;

// 봇을 목표 지점으로 계속 밀어 준다 (한 번 보내고 마는 게 아니라 도착할 때까지)
function walk(bot, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, l = Math.hypot(dx, dy) || 1;
  H.send(bot, { type: 'input', x: dx / l, y: dy / l });
}

module.exports = async function run() {
  const t = H.makeT('결정적 순간');

  // ── 의자 뺏기: 한 명만 남으면 뜸 들인 뒤 결과 ──────────────────────
  {
    const r = await H.makeRoom(4);
    H.send(r.host, { type: 'start_game', game: 'chair' });
    await H.waitPlaying(r.code);
    let sawClimax = false, endedAt = 0, climaxSeenAt = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const rm = await H.room(r.code);
      if (!rm) break;
      if (rm.state !== 'playing') { endedAt = Date.now(); break; }
      const ch = rm.chairs;
      const alive = rm.players.filter(p => p.alive);
      // 앉을 시간이 되면 봇마다 다른 의자로 달린다 (안 그러면 전원 탈락한다)
      if (ch && ch.phase === 'grab' && ch.list.length) {
        alive.forEach((p, i) => {
          const seat = ch.list[i % ch.list.length];
          const bot = r.bots[(parseInt(p.nick.replace(/[^0-9]/g, ''), 10) || 1) - 1];
          if (bot && seat) walk(bot, p, seat);
        });
      }
      // 마지막 한 명이 남은 순간을 봤나
      if (alive.length === 1 && !climaxSeenAt) climaxSeenAt = Date.now();
      if (climaxSeenAt) sawClimax = true;
      await H.sleep(120);
    }
    if (sawClimax && endedAt) {
      t.ok(endedAt - climaxSeenAt >= CLIMAX_MS * 0.7,
        `의자 뺏기: 최후 1인부터 결과까지 ${endedAt - climaxSeenAt}ms 뜸을 들인다 (기준 ${Math.round(CLIMAX_MS * 0.7)}ms)`);
    } else {
      t.ok(endedAt > 0, '의자 뺏기: 판이 정상적으로 끝난다 (최후 1인 구간은 이번 판에 안 나왔다)');
    }
    r.close();
    await H.sleep(200);
  }

  // ── OX 서바이벌: 정답을 아는 봇만 살아남게 해 최후 1인을 만든다 ──────
  {
    const r = await H.makeRoom(4);
    H.send(r.host, { type: 'start_game', game: 'ox' });
    await H.waitPlaying(r.code);
    let climaxSeenAt = 0, endedAt = 0, everOne = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 200000) {
      const rm = await H.room(r.code);
      if (!rm) break;
      if (rm.state !== 'playing') { endedAt = Date.now(); break; }
      const ox = rm.ox;
      const alive = rm.players.filter(p => p.alive);
      if (ox && ox.phase === 'show') {
        // 첫 번째 봇만 정답 쪽으로, 나머지는 반대쪽으로 → 한 명씩 떨어진다
        alive.forEach((p, i) => {
          const bot = r.bots[(parseInt(p.nick.replace(/[^0-9]/g, ''), 10) || 1) - 1];
          if (!bot) return;
          const wantO = (i === 0) ? !!ox.answer : !ox.answer;
          walk(bot, p, { x: wantO ? 200 : 800, y: 400 });
        });
      }
      if (alive.length === 1) { everOne = true; if (!climaxSeenAt) climaxSeenAt = Date.now(); }
      await H.sleep(120);
    }
    if (everOne && endedAt) {
      t.ok(endedAt - climaxSeenAt >= CLIMAX_MS * 0.7,
        `OX: 최후 1인부터 결과까지 ${endedAt - climaxSeenAt}ms 뜸을 들인다`);
    } else {
      t.ok(endedAt > 0, 'OX: 판이 정상적으로 끝난다 (최후 1인 구간은 이번 판에 안 나왔다)');
    }
    r.close();
    await H.sleep(200);
  }

  t.ok(H.serverErrors().length === 0, '서버 예외 0건');
  return t;
};
