'use strict';
const P = require('../party-games');
const H = require('./helpers');

function room(key, n = 2) {
  const r = { gameType: key, game: {}, state: 'playing', phaseEndAt: 100000, players: new Map() };
  for (let i = 1; i <= n; i++) r.players.set(i, { id: i, x: 0, y: 0, alive: true, waiting: false, connected: true, dirX: 0, dirY: 0 });
  P.start(r, () => .5);
  P.tick(r, 1000, .05);
  return r;
}

module.exports = async () => {
  const t = H.makeT('운동장 게임팩');
  {
    const r = room('freeze'), g = r.game, p = r.players.get(1);
    p.dirY = -1;
    const y = p.y; P.tick(r, 1050, .05);
    t.ok(p.y < y, '무궁화: 초록불에는 전진');
    g.signal = 'warn'; g.switchAt = 1200;
    P.tick(r, 1200, .05);
    const before = p.y;
    t.eq(g.signal, 'stop', '무궁화: 노랑 다음 빨강');
    P.tick(r, 1300, .05);
    t.eq(p.y, before, '무궁화: 빨강 전환 직후 네트워크 유예');
    P.tick(r, 1450, .05);
    const penaltyY = p.y;
    t.ok(penaltyY > before && p.party.event === 'oops', '무궁화: 빨강에 계속 움직이면 뒤로');
    P.tick(r, 1500, .05);
    t.eq(p.y, penaltyY, '무궁화: 빨강 한 번에 중복 벌칙 없음');
    p.dirY = 0; const p2 = r.players.get(2), y2 = p2.y;
    P.tick(r, 1600, .05);
    t.eq(p2.y, y2, '무궁화: 멈춰 있는 학생은 벌칙 없음');
    const publicState = P.state(r, 1600);
    t.ok(!JSON.stringify(publicState).includes('switchAt'), '무궁화: 다음 신호 전환 시각 미공개');
    g.signal = 'go'; g.switchAt = 99999;
    for (const pp of r.players.values()) { pp.y = 105; pp.party.stunUntil = 0; }
    t.ok(P.tick(r, 4000, .05), '무궁화: 전원 완주하면 종료');
    t.ok(p.party.finished && p.score > 1000, '무궁화: 완주 + 남은 시간 보너스');
    const score = p.score; P.tick(r, 4050, .05);
    t.eq(p.score, score, '무궁화: 완주 보너스 중복 지급 없음');
  }
  {
    const r = room('paint'), g = r.game, a = r.players.get(1), b = r.players.get(2);
    a.x = b.x = 225; a.y = b.y = 225;
    g.tiles.fill(0); P.tick(r, 1100, .05);
    t.eq(g.tiles[4 * 20 + 4], 0, '땅따먹기: 동시 진입은 순회 순서에 따른 선점 없음');
    b.x = 425; P.tick(r, 1150, .05);
    t.eq(g.tiles[84], 1, '땅따먹기: 혼자 밟은 칸 소유');
    a.x = 625; b.x = 225; P.tick(r, 1200, .05);
    t.eq(g.tiles[84], 2, '땅따먹기: 상대 칸 빼앗기');
    P.action(r, a, 1250); P.tick(r, 1300, .05);
    const scored = a.score;
    t.ok(scored >= 9, '땅따먹기: 넓게 칠하기 3×3 반영');
    const readyAt = a.party.readyAt;
    P.action(r, a, 1400);
    t.ok(!a.party.splash && a.party.readyAt === readyAt, '땅따먹기: 버튼 연타로 쿨타임 우회 불가');
    P.action(r, a, readyAt + 1);
    t.ok(a.party.splash, '땅따먹기: 쿨타임 후 다시 사용');
    a.x = 1; a.y = 1; a.dirX = -1000; a.dirY = -1000;
    P.tick(r, 8400, .05);
    t.ok(a.x >= 24 && a.y >= 24 && g.tiles.length === 280, '땅따먹기: 맵 경계 밖 확장 불가');
    t.eq([...r.players.values()].reduce((n, p) => n + p.score, 0), g.tiles.filter(Boolean).length, '땅따먹기: 실제 소유 칸과 점수 일치');
  }
  {
    const r = room('fishing', 1), p = r.players.get(1), q = p.party;
    t.eq(q.stage, 'wait', '낚시: 입질 대기로 시작');
    t.ok(!JSON.stringify(P.state(r, 1000)).includes('nextAt'), '낚시: 입질 예정 시각 미공개');
    P.action(r, p, 1100);
    t.ok(q.event === 'early' && p.score === 0, '낚시: 입질 전 연타는 득점 불가');
    P.tick(r, q.nextAt + 1, .05);
    const biteAt = q.nextAt + 1; P.tick(r, biteAt, .05);
    t.eq(q.stage, 'bite', '낚시: 대기 후 입질');
    P.action(r, p, biteAt + 100);
    t.eq(q.stage, 'reel', '낚시: 입질 중 챔질하면 게이지 시작');
    P.action(r, p, q.stageAt + 400);
    t.ok(p.score === 30 && q.caught === 1 && q.combo === 1, '낚시: 초록 구간 적중 득점');
    P.action(r, p, biteAt + 550);
    t.eq(p.score, 30, '낚시: 같은 물고기 중복 득점 불가');
    P.tick(r, q.nextAt + 1, .05);
    P.tick(r, q.nextAt + 1, .05);
    const escapedAt = q.nextAt + 1; P.tick(r, escapedAt, .05);
    t.ok(q.event === 'escaped' && q.combo === 0, '낚시: 입질을 놓치면 연속 보너스 초기화');
    q.stage = 'reel'; q.stageAt = 10000; q.target = .5;
    P.action(r, p, 10000);
    t.ok(q.event === 'miss' && p.score === 30, '낚시: 초록 구간 밖은 득점 없음');
    q.stage = 'reel'; q.stageAt = 20000; q.target = .5; q.rarity = .95;
    P.action(r, p, 20400);
    t.eq(p.score, 110, '낚시: 보물 80점');
  }
  for (const key of P.KEYS) {
    const r = room(key, 40), p = r.players.get(1);
    r.players.set(41, { id: 41, alive: false, waiting: true, connected: true });
    P.tick(r, 1050, .05);
    t.ok(P.state(r, 1050).players.length === 41 && Number.isFinite(p.score), `${key}: 40명 + 중간 입장 대기자 처리`);
    const before = p.score;
    t.ok(P.tick(r, r.phaseEndAt, .05), `${key}: 제한시간 종료`);
    P.action(r, p, r.phaseEndAt + 1);
    t.eq(p.score, before, `${key}: 종료 시각 이후 입력으로 득점 불가`);
    r.state = 'countdown'; P.action(r, p, 1200);
    t.eq(p.score, before, `${key}: 카운트다운 중 입력 차단`);
  }
  // Exercise the real server wiring, including a fresh teacher connection and a
  // student resuming the same token (no duplicated player/score).
  const r = await H.makeRoom(2);
  for (const key of P.KEYS) {
    H.send(r.host, { type: 'start_game', game: key });
    await H.waitPlaying(r.code);
    await H.waitFor(() => H.lastState(r.bots[0], key));
    const s = H.lastState(r.bots[0], key);
    t.ok(s.party && s.arena && s.players.length === 2, `${key}: 실제 소켓에 전체 렌더 상태 전송`);
    const guest = await H.mkClient('late');
    H.send(guest, { type: 'join', code: r.code, nick: '늦은참가' });
    await H.waitFor(() => H.last(guest, 'join_ok'));
    await H.waitFor(() => H.lastState(guest, key));
    t.ok(H.lastState(guest, key).players.some(p => p[0] === H.last(guest, 'join_ok').id && p[4] === 1), `${key}: 게임 중 입장은 대기`);
    guest.close();
    const resumed = await H.mkClient('resume');
    H.send(resumed, { type: 'join', code: r.code, nick: '봇1', token: r.tokens[0] });
    await H.waitFor(() => H.last(resumed, 'join_ok'));
    await H.waitFor(() => H.lastState(resumed, key));
    t.eq(H.last(resumed, 'join_ok').id, r.ids[0], `${key}: 재접속 시 기존 학생 유지`);
    r.bots[0] = resumed;
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby');
    H.clearFrames(r.host, ...r.bots);
  }
  r.close();
  return t;
};
