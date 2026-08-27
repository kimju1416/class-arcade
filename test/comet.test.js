// 꼬리별 규칙 검사 — 사용자가 정한 핵심 규칙이 실제로 지켜지는지.
// ① 크면 느리다  ② 1.25배 이상이어야 잡아먹는다  ③ 먹혀도 탈락 없이 부활
// ④ 부활 크기는 판 상황에 맞춘다  ⑤ 점수는 최고 몸집(먹혀도 기록은 남는다)
//
// 규칙 검증은 합성 방 객체로 결정적으로 한다 — 검사 서버는 별도 프로세스라
// 살아있는 상태를 직접 만질 수 없고, 봇으로 유도하면 우연에 기대게 된다.
const H = require('./helpers');
const comet = require('../comet');

// 서버와 같은 모양의 가짜 방 (comet 모듈이 쓰는 필드만)
function fakeRoom(n, masses) {
  const players = new Map();
  for (let i = 0; i < n; i++) {
    players.set(i + 1, {
      id: i + 1, nick: '봇' + (i + 1), ci: i, waiting: false, alive: true,
      x: 0, y: 0, dirX: 0, dirY: 0,
    });
  }
  const room = { players, game: {} };
  comet.start(room, {});
  if (masses) [...players.values()].forEach((p, i) => { if (masses[i] != null) p.cMass = masses[i]; });
  return room;
}
// 두 뱀을 같은 자리에 겹쳐 놓는다 (충돌 판정 강제)
function overlap(A, B, x, y) {
  A.cInvUntil = 0; B.cInvUntil = 0;
  A.cDownUntil = 0; B.cDownUntil = 0;
  A.x = x; A.y = y; B.x = x; B.y = y;
  A.cPts = [{ x, y }]; B.cPts = [{ x, y }];
  // 실제 게임에선 먹어서 커지므로 최고 기록도 같이 올라가 있다
  if (!(A.cMax >= A.cMass)) A.cMax = A.cMass;
  if (!(B.cMax >= B.cMass)) B.cMax = B.cMass;
}

module.exports = async function run() {
  const t = H.makeT('꼬리별 규칙');

  // ---------- ① 크면 느리다 (이 게임의 핵심 균형추) ----------
  {
    const sSmall = comet.speedOf(comet.START_MASS);
    const sBig = comet.speedOf(1500);
    t.ok(sSmall > sBig, `크면 느리다 (작을 때 ${Math.round(sSmall)} > 클 때 ${Math.round(sBig)} u/s)`);
    t.ok(sSmall - sBig > 60, `작은 뱀이 도망칠 만큼 차이가 난다 (${Math.round(sSmall - sBig)} u/s)`);
    t.ok(sBig * 1.55 > sSmall, '큰 뱀도 부스터를 쓰면 따라잡을 수 있다');
    t.ok(sBig * 1.55 < sSmall * 1.35, '부스터를 써도 압도적이지는 않다');
    t.ok(comet.turnOf(comet.START_MASS) > comet.turnOf(1500), '크면 회전도 둔하다');
    t.ok(comet.girthOf(1000) > comet.girthOf(comet.START_MASS), '크면 굵다');
    t.ok(comet.bodyLenOf(1000) > comet.bodyLenOf(comet.START_MASS), '크면 몸이 길다');
    // 속도는 단조 감소여야 한다 (중간에 되레 빨라지는 구간이 없어야)
    let mono = true;
    for (let m = comet.START_MASS; m < 3000; m += 37) if (comet.speedOf(m + 37) > comet.speedOf(m) + 1e-9) mono = false;
    t.ok(mono, '몸집이 커질수록 속도는 계속 느려진다 (역전 구간 없음)');
  }

  // ---------- ④ 부활 크기는 판 상황에 맞춘다 ----------
  {
    const mk = (masses) => ({
      players: new Map(masses.map((m, i) => [i, { id: i, cMass: m, waiting: false, cDownUntil: 0 }])),
    });
    const early = comet.respawnMassOf(mk([20, 20, 22, 25]), Date.now());
    t.ok(early === comet.START_MASS, `초반엔 사실상 최소 크기로 부활 (${early})`);
    const late = comet.respawnMassOf(mk([300, 500, 700, 900]), Date.now());
    t.ok(late > comet.START_MASS * 3, `후반엔 따라잡을 몸집을 갖고 부활 (${late})`);
    t.ok(late < 500, `그래도 선두보다 한참 작다 (${late} vs 900)`);
    t.ok(comet.respawnMassOf(mk([]), Date.now()) === comet.START_MASS, '아무도 없으면 최소 크기');
    // 부활 대기 중인 사람은 중앙값 계산에서 빠진다
    const withDown = { players: new Map([[0, { id: 0, cMass: 900, waiting: false, cDownUntil: 0 }],
                                          [1, { id: 1, cMass: 20, waiting: false, cDownUntil: Date.now() + 9e5 }]]) };
    t.ok(comet.respawnMassOf(withDown, Date.now()) === Math.round(900 * 0.4), '부활 대기자는 중앙값에서 제외');
  }

  // ---------- 판 시작 상태 ----------
  {
    const room = fakeRoom(6);
    const ps = [...room.players.values()];
    t.ok(ps.every(p => p.cMass === comet.START_MASS), '전원 같은 크기로 시작');
    t.ok(ps.every(p => p.alive), '이 게임은 탈락이 없다 — 전원 alive');
    t.ok(ps.every(p => p.cMax === comet.START_MASS), '최고 몸집 초기화');
    t.ok(room.game.foods.size > 40, `먹이가 뿌려져 있다 (${room.game.foods.size})`);
    t.ok(room.game.roundMs === comet.ROUND_MS, `한 판 ${comet.ROUND_MS / 1000}초`);
    let minD = Infinity;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++)
      minD = Math.min(minD, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
    t.ok(minD > 200, `시작 배치가 넉넉히 떨어져 있다 (${Math.round(minD)} 유닛 — 시작하자마자 먹히지 않게)`);
    t.ok(ps.every(p => p.cInvUntil > Date.now()), '시작 직후엔 잠시 무적');
    // 아레나는 인원에 비례
    t.ok(fakeRoom(30).game.arenaW > fakeRoom(4).game.arenaW, '인원이 많으면 아레나가 넓어진다');
  }

  // ---------- ② 1.25배 이상이어야 잡아먹는다 ----------
  {
    const room = fakeRoom(2);
    const [A, B] = [...room.players.values()];
    const now = Date.now();

    // 비슷한 크기 — 겹쳐도 아무 일 없어야 한다
    A.cMass = 100; B.cMass = 95;
    overlap(A, B, 600, 400);
    comet.tick(room, now, 0.05);
    t.ok(!A.cDownUntil && !B.cDownUntil, '크기가 비슷하면 부딪혀도 그냥 지나간다');

    // 경계 바로 아래(1.24배) — 아직 못 먹는다
    A.cMass = 124; B.cMass = 100;
    overlap(A, B, 600, 400);
    comet.tick(room, now, 0.05);
    t.ok(!B.cDownUntil, '1.24배로는 못 먹는다 (경계 검사)');

    // 경계를 넘으면 먹는다
    A.cMass = 400; B.cMass = 100;
    overlap(A, B, 600, 400);
    const massBefore = A.cMass, eatsBefore = A.cEats || 0, foodsBefore = room.game.foods.size;
    comet.tick(room, now, 0.05);
    t.ok(B.cDownUntil > now, '1.25배를 넘으면 잡아먹는다');
    t.ok(A.cMass > massBefore, `잡아먹은 쪽이 커진다 (${massBefore} → ${Math.round(A.cMass)})`);
    t.ok(A.cMass < massBefore + 100, '상대 몸집을 통째로 먹지는 않는다 (일부는 먹이로 흩어짐)');
    t.ok((A.cEats || 0) === eatsBefore + 1, '잡아먹은 수가 올라간다');
    t.ok(room.game.foods.size > foodsBefore, `먹힌 몸이 먹이로 환원된다 (${foodsBefore} → ${room.game.foods.size})`);
    t.ok(room.game.cFeed.length > 0, '킬 피드가 생긴다');
    t.ok(room.game.cBooms.length > 0, '폭발 연출이 생긴다');

    // ③ 먹혀도 탈락은 아니다
    t.ok(A.alive && B.alive, '먹혀도 탈락(alive=false)은 아니다 — 아무도 구경만 하지 않는다');
    t.ok(B.cDownUntil - now <= comet.RESPAWN_MS + 60, `부활까지 ${comet.RESPAWN_MS / 1000}초 (${B.cDownUntil - now}ms)`);

    // 부활 대기 중엔 중복으로 먹히지 않는다
    const downAt = B.cDownUntil;
    comet.tick(room, now + 100, 0.05);
    t.ok(B.cDownUntil === downAt, '부활 대기 중엔 중복으로 먹히지 않는다');

    // 시간이 되면 부활 + 무적 (스폰킬 방지)
    comet.tick(room, downAt + 60, 0.05);
    t.ok(B.cDownUntil === 0, '시간이 되면 부활한다');
    t.ok(B.cInvUntil > downAt, '부활 직후 잠시 무적 (스폰킬 방지)');
    t.ok(B.cMass >= comet.START_MASS, `부활 크기 ${Math.round(B.cMass)}`);

    // ⑤ 점수는 최고 몸집 — 먹혀서 작아져도 기록은 남는다
    t.ok(B.cMax >= 100, `먹혀도 최고 기록은 남는다 (현재 ${Math.round(B.cMass)} / 최고 ${Math.round(B.cMax)})`);
    t.ok(B.cMax >= B.cMass, '최고 기록이 현재 몸집보다 작아지는 일은 없다');

    // 무적인 동안엔 못 먹는다
    A.cMass = 900;
    overlap(A, B, 700, 300);
    B.cInvUntil = now + 5000;
    comet.tick(room, now + 200, 0.05);
    t.ok(!B.cDownUntil, '무적인 상대는 못 먹는다');
  }

  // ---------- 먹이·성장 ----------
  {
    const room = fakeRoom(1);
    const A = [...room.players.values()][0];
    A.cInvUntil = 0;
    const f = [...room.game.foods.values()][0];
    A.x = f.x; A.y = f.y; A.cPts = [{ x: f.x, y: f.y }];
    const before = A.cMass, nFoods = room.game.foods.size;
    comet.tick(room, Date.now(), 0.05);
    t.ok(A.cMass > before, `먹이를 먹으면 몸집이 는다 (${before} → ${Math.round(A.cMass * 10) / 10})`);
    t.ok(A.cMax >= A.cMass, '최고 몸집이 따라 갱신된다');
    t.ok(room.game.fDel.length > 0, '먹은 먹이는 삭제 델타로 나간다');
    t.ok(room.game.foods.size <= nFoods + 6, '먹이 총량이 폭주하지 않는다');
  }

  // ---------- 부스터는 몸을 태운다 ----------
  {
    const room = fakeRoom(1);
    const A = [...room.players.values()][0];
    A.cMass = 300; A.cBoost = true; A.cInvUntil = 0;
    A.x = room.game.arenaW / 2; A.y = room.game.arenaH / 2;
    const before = A.cMass;
    for (let i = 0; i < 10; i++) comet.tick(room, Date.now() + i * 50, 0.05);
    t.ok(A.cMass < before, `부스터는 질량을 태운다 (${before} → ${Math.round(A.cMass)})`);
    t.ok(room.game.foods.size > 40, '태운 만큼 펠릿을 흘린다');
    // 너무 작으면 더 깎이지 않는다
    A.cMass = comet.BOOST_MIN - 1;
    const tiny = A.cMass;
    comet.tick(room, Date.now(), 0.05);
    t.ok(A.cMass >= tiny - 1e-6, '최소 크기 이하에선 부스터로 더 깎이지 않는다');
  }

  // ---------- 벽은 죽이지 않고 막는다 (사고사 방지) ----------
  {
    const room = fakeRoom(1);
    const A = [...room.players.values()][0];
    A.cMass = 100; A.cInvUntil = 0;
    A.x = 30; A.y = 30;
    for (let i = 0; i < 25; i++) { A.dirX = -1; A.dirY = -1; comet.tick(room, Date.now() + i * 50, 0.05); }
    t.ok(A.x >= 0 && A.x <= room.game.arenaW && A.y >= 0 && A.y <= room.game.arenaH,
      `벽 밖으로 안 나간다 (${Math.round(A.x)},${Math.round(A.y)})`);
    t.ok(!A.cDownUntil, '벽에 부딪혀도 죽지 않는다 — 사고사보다 쫓고 쫓기는 재미가 우선');
  }

  // ---------- 치팅 방어: 이상한 입력에도 좌표가 무너지지 않는다 ----------
  {
    const room = fakeRoom(2);
    const [A] = [...room.players.values()];
    A.cInvUntil = 0;
    for (const bad of [Infinity, -Infinity, NaN, 1e400, undefined, null, 'x']) {
      A.dirX = bad; A.dirY = bad;
      comet.tick(room, Date.now(), 0.05);
    }
    t.ok(Number.isFinite(A.x) && Number.isFinite(A.y) && Number.isFinite(A.cAng),
      `Infinity/NaN 주입에도 좌표가 유한 (x=${Math.round(A.x)} ang=${Math.round(A.cAng * 100) / 100})`);
    t.ok(Number.isFinite(A.cMass), '질량도 유한');
  }

  // ---------- 스냅샷 행 ----------
  {
    const room = fakeRoom(2);
    const A = [...room.players.values()][0];
    A.cMass = 250; A.cBoost = true;
    const r0 = comet.row(A, Date.now());
    t.ok(r0.length === 7, `꼬리별 행 7필드 (${r0.length})`);
    t.ok(r0[1] === 250, '몸집이 실린다');
    t.ok(r0[2] === 1, '부스터 상태가 실린다');
    A.cDownUntil = Date.now() + 2000;
    t.ok(comet.row(A, Date.now())[3] > 0, '부활 대기 남은 시간이 실린다');
    // 먹이는 델타로만 나가고, 전체 목록은 따로 요청받을 때만
    const full = comet.payload(room.game, true);
    t.ok(Array.isArray(full.fall) && full.fall.length > 40, `전체 동기화엔 먹이 전량 (${full.fall ? full.fall.length : 0})`);
    comet.clearDeltas(room.game);
    const delta = comet.payload(room.game, false);
    t.ok(!delta.fall, '평소 스냅샷엔 전체 목록이 안 실린다 (대역폭)');
  }

  // ---------- 순위: 최고 몸집 순 ----------
  {
    const players = [
      { waiting: false, cMax: 100, cEats: 0, nick: 'a' },
      { waiting: false, cMax: 500, cEats: 2, nick: 'b' },
      { waiting: false, cMax: 300, cEats: 9, nick: 'c' },
      { waiting: true, cMax: 9999, cEats: 0, nick: '관전' },
    ];
    const sorted = comet.sortForRank(players);
    t.ok(sorted.length === 3, '관전자는 순위에서 빠진다');
    t.ok(sorted[0].nick === 'b', '최고 몸집이 1등 (잡아먹은 수보다 우선)');
    t.ok(sorted[1].nick === 'c' && sorted[2].nick === 'a', '나머지도 몸집 순');
    t.ok(comet.labelOf(sorted[0]).includes('500'), `순위 라벨에 몸집 (${comet.labelOf(sorted[0])})`);
    t.ok(comet.labelOf(sorted[1]).includes('9마리'), `잡아먹은 수도 표시 (${comet.labelOf(sorted[1])})`);
    t.ok(comet.keyOf(sorted[0]) !== comet.keyOf(sorted[1]), '동점 판정 키가 구분된다');
  }

  // ---------- 실제 서버에서 판이 도는가 ----------
  {
    const r = await H.makeRoom(3);
    H.send(r.host, { type: 'start_game', game: 'comet' });
    await H.waitPlaying(r.code);

    let info = null;
    await H.waitFor(async () => { const rm = await H.room(r.code); info = rm && rm.comet; return info; }, 4000, '꼬리별 디버그 정보');
    t.ok(!!info, '서버가 꼬리별 상태를 보고한다');
    if (info) {
      t.ok(info.snakes.length === 3, `참가자 3명 (${info.snakes.length})`);
      t.ok(info.foods > 40, `먹이 ${info.foods}개`);
      t.ok(info.snakes.every(s => s.mass >= comet.START_MASS * 0.9), '전원 시작 크기 이상');
    }

    // 조이스틱 입력이 실제로 뱀을 움직이는가 (usesStick·inputMoves 둘 다 걸려 있어야 한다)
    const before = (await H.room(r.code)).players.map(p => `${p.x},${p.y}`).join('|');
    r.bots.forEach((b, i) => H.send(b, { type: 'input', x: Math.cos(i), y: Math.sin(i) }));
    await H.sleep(700);
    const after = (await H.room(r.code)).players.map(p => `${p.x},${p.y}`).join('|');
    t.ok(before !== after, '조이스틱 입력으로 뱀이 움직인다');

    // 부스터 버튼
    H.send(r.bots[0], { type: 'cboost', v: 1 });
    await H.sleep(400);
    const rm2 = await H.room(r.code);
    t.ok(rm2.comet.snakes.some(s => s.boost), '부스터 버튼이 서버에 전달된다');
    H.send(r.bots[0], { type: 'cboost', v: 0 });
    await H.sleep(300);
    t.ok(!(await H.room(r.code)).comet.snakes.every(s => s.boost), '버튼을 떼면 꺼진다');

    // 몸통 경로가 실제로 쌓이는가 (클라 렌더가 이걸 근거로 몸을 그린다)
    await H.sleep(900);
    const rm3 = await H.room(r.code);
    t.ok(rm3.comet.snakes.some(s => s.pts > 3), `몸통 경로가 쌓인다 (최대 ${Math.max(...rm3.comet.snakes.map(s => s.pts))}점)`);

    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 5000, '로비 복귀');
    t.ok(true, '중단 후 로비 복귀');
  }

  const errs = H.serverErrors();
  t.ok(errs.length === 0, `서버 예외 0건${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`);
  return t;
};
