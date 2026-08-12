// 치팅 방지 회귀 — 이 프로젝트에서 실제로 뚫렸던 것들이 다시 뚫리지 않는지.
// "학생 40명 중 한 명은 개발자도구를 연다"는 전제로 만든 방어선을 지킨다.
const H = require('./helpers');

module.exports = async function run() {
  const t = H.makeT('치팅 방지');

  // ---------- 1. 비밀 필드가 state로 새지 않는가 ----------
  {
    const r = await H.makeRoom(3);

    // 퀴즈쇼: 문제 표시(show) 중엔 정답·분포가 없어야
    H.send(r.host, { type: 'start_game', game: 'quiz', opt: { cat: '역사', count: 5 } });
    await H.waitRoom(r.code, x => x.quiz && x.quiz.phase === 'show', 12000, 'quiz show');
    await H.sleep(300);
    const q = H.lastState(r.bots[0], 'quiz');
    t.ok(q && q.correct === undefined && q.counts === undefined, '퀴즈쇼: show 중 정답·선택분포 미전송');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 5000);

    // 사이먼: 패턴(seq)은 호스트에게만 별도 메시지, state엔 길이만
    H.clearFrames(r.host, ...r.bots);
    H.send(r.host, { type: 'start_game', game: 'simon' });
    await H.waitRoom(r.code, x => x.simon && x.simon.phase === 'show', 12000, 'simon show');
    await H.sleep(300);
    t.ok(!!H.last(r.host, 'simon_seq'), '사이먼: 호스트는 패턴 수신');
    t.ok(!H.last(r.bots[0], 'simon_seq'), '사이먼: 학생은 패턴 미수신');
    const si = H.lastState(r.bots[0], 'simon');
    t.ok(si && si.seq === undefined && typeof si.seqLen === 'number', '사이먼: state엔 패턴 없이 길이만');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 5000);

    // 침팬지: 숫자 배치는 memo 때 호스트만
    H.clearFrames(r.host, ...r.bots);
    H.send(r.host, { type: 'start_game', game: 'chimp' });
    await H.waitRoom(r.code, x => x.chimp && x.chimp.phase === 'memo', 12000, 'chimp memo');
    await H.sleep(300);
    t.ok(!!H.last(r.host, 'chimp_nums'), '침팬지: 호스트는 숫자 수신');
    t.ok(!H.last(r.bots[0], 'chimp_nums'), '침팬지: 학생은 숫자 미수신');
    const ch = H.lastState(r.bots[0], 'chimp');
    t.ok(ch && ch.nums === undefined, '침팬지: memo 중 state에 숫자 없음');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 5000);

    // 사다리: 가로줄·경로는 reveal 때만 (미리 보내면 추적 가능)
    H.clearFrames(r.host, ...r.bots);
    H.send(r.host, { type: 'start_game', game: 'sadari' });
    await H.waitRoom(r.code, x => x.sadari && x.sadari.phase === 'pick', 12000, 'sadari pick');
    await H.sleep(300);
    const sa = H.lastState(r.bots[0], 'sadari');
    t.ok(sa && sa.map === undefined && sa.rungs === undefined, '사다리: pick 중 경로·가로줄 미전송');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 5000);

    // OX: 정답은 reveal 때만
    H.clearFrames(r.host, ...r.bots);
    H.send(r.host, { type: 'start_game', game: 'ox' });
    await H.waitRoom(r.code, x => x.ox && x.ox.phase === 'show', 12000, 'ox show');
    await H.sleep(300);
    const ox = H.lastState(r.bots[0], 'ox');
    t.ok(ox && ox.oxAnswer === undefined, 'OX: show 중 정답 미전송');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 5000);

    r.close();
  }

  // ---------- 2. 같은 그림: 소켓별 비밀 필드 분리 ----------
  {
    const r = await H.makeRoom(3);
    H.send(r.host, { type: 'start_game', game: 'pairs' });
    await H.waitPlaying(r.code);
    await H.sleep(300);
    H.clearFrames(r.host, ...r.bots);
    H.send(r.bots[0], { type: 'pick', v: 0 });
    await H.sleep(150);
    H.send(r.bots[0], { type: 'pick', v: 1 });
    await H.sleep(500);

    const flips = r.bots[0].frames.filter(f => f.type === 'pairs_flip');
    t.ok(flips.length === 2 && flips.every(f => typeof f.face === 'string'), '같은그림: 뒤집은 본인만 앞면 수신');
    t.ok(r.bots[1].frames.filter(f => f.type === 'pairs_flip').length === 0, '같은그림: 남의 뒤집기 앞면 미수신');

    const other = H.lastState(r.bots[1], 'pairs');
    const row = other && other.players.find(x => x[0] === r.ids[0]);
    t.ok(row && row[4] === 0 && row[5] === -1 && row[6] === -1, '같은그림: 타인 시점에서 상대 카드 상태 가림');
    const mine = H.lastState(r.bots[0], 'pairs').players.find(x => x[0] === r.ids[0]);
    t.ok(mine && (mine[5] >= 0 || mine[6] >= 0 || mine[4] > 0), '같은그림: 본인 행은 자기 상태 보임');
    const hostSt = H.lastState(r.host, 'pairs');
    t.ok(hostSt && hostSt.players.every(x => x[4] === 0 && x[5] === -1 && x[6] === -1),
      '같은그림: 교사 화면에도 카드 상태 가림(관전 컨닝 차단)');
    r.close();
  }

  // ---------- 3. 그림 퀴즈: 정답·추천 유출 ----------
  {
    const r = await H.makeRoom(3);
    H.send(r.host, { type: 'start_game', game: 'draw' });
    await H.waitPlaying(r.code);
    await H.waitRoom(r.code, x => x.draw && x.draw.phase === 'pick', 8000, 'draw pick');
    H.clearFrames(r.host, ...r.bots);
    H.send(r.host, { type: 'dpick', id: r.ids[0] });
    await H.waitRoom(r.code, x => x.draw.phase === 'write', 8000, 'draw write');
    await H.sleep(300);
    t.ok(!!H.last(r.bots[0], 'dsuggest'), '그림퀴즈: 출제자만 제시어 추천 수신');
    t.ok(!H.last(r.bots[1], 'dsuggest'), '그림퀴즈: 다른 학생은 추천 미수신');

    H.send(r.bots[0], { type: 'dword', text: '기린' });
    await H.waitRoom(r.code, x => x.draw.phase === 'draw', 8000, 'draw 단계');
    await H.sleep(400);
    const d = H.lastState(r.bots[1], 'draw');
    t.ok(d && d.answer === undefined && d.ansLen === 2, '그림퀴즈: 그리는 중 정답 미전송(글자수만)');

    // 출제자 아닌 학생이 그림 그리기 시도 → 릴레이 안 됨
    H.clearFrames(r.host);
    H.send(r.bots[1], { type: 'dstroke', begin: 1, c: 0, w: 1, pts: [10, 10, 20, 20] });
    await H.sleep(300);
    t.ok(H.last(r.host, 'dseg') === undefined, '그림퀴즈: 출제자 아닌 학생의 그리기 무시');
    r.close();
  }

  // ---------- 4. 입력 검증: Infinity 무적 치트 ----------
  {
    const r = await H.makeRoom(2);
    H.send(r.host, { type: 'start_game', game: 'bomb' });
    await H.waitPlaying(r.code);
    // JSON.stringify로는 재현 불가 — 반드시 원시 문자열로 보내야 잡힌다
    H.sendRaw(r.bots[0], '{"type":"input","x":1e400,"y":1e400}');
    await H.sleep(400);
    const rm = await H.room(r.code);
    const p = rm.players[0];
    t.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `Infinity 주입 차단 (x=${p.x}, y=${p.y})`);
    r.close();
  }

  // ---------- 5. 호스트 권한 ----------
  {
    const r = await H.makeRoom(3);
    // 학생이 게임 시작 시도
    H.send(r.bots[0], { type: 'start_game', game: 'bomb' });
    await H.sleep(400);
    t.ok((await H.room(r.code)).state === 'lobby', '학생의 게임 시작 무시');
    // 학생이 방 닫기 시도
    H.send(r.bots[0], { type: 'close_room' });
    await H.sleep(400);
    t.ok(!!(await H.room(r.code)), '학생의 방 닫기 무시');
    // 학생이 챔피언 초기화 시도 (권한 확인용 — 값 비교는 champ 테스트에서)
    H.send(r.bots[0], { type: 'champ_reset' });
    await H.sleep(300);
    t.ok(!!(await H.room(r.code)), '학생의 챔피언 초기화 요청에도 방 정상');

    // 자기 방을 만든 학생이 남의 방을 조종하지 못하는가 (권한 승계 차단)
    const evil = await H.mkClient('evil');
    H.send(evil, { type: 'create_room' });
    await H.waitFor(() => H.last(evil, 'room_created'), 3000);
    H.send(evil, { type: 'join', code: r.code, nick: '침입자' });
    await H.waitFor(() => H.last(evil, 'join_ok'), 3000);
    H.send(evil, { type: 'start_game', game: 'bomb' });
    await H.sleep(400);
    t.ok((await H.room(r.code)).state === 'lobby', '자기 방 만든 뒤 남의 방 조종 차단(권한 승계)');
    try { evil.close(); } catch {}
    r.close();
  }

  // ---------- 6. 방 갈아타기 유령 ----------
  {
    const a = await H.makeRoom(1);
    const b = await H.makeRoom(0);
    const wanderer = a.bots[0];
    H.send(wanderer, { type: 'join', code: b.code, nick: '떠돌이' });
    await H.sleep(500);
    const ra = await H.room(a.code);
    t.ok(ra.players.length === 0, `이전 방에 유령 안 남음 (남은 인원 ${ra.players.length})`);
    a.close(); b.close();
  }

  t.ok(H.serverErrors().length === 0, '서버 예외 0건');
  return t;
};
