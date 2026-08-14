// 게임별 핵심 규칙 회귀 — 그림 퀴즈 흐름, 블록 배틀 조작·공격, 오늘의 챔피언 누적
const H = require('./helpers');

module.exports = async function run() {
  const t = H.makeT('게임 규칙');

  // ---------- 그림 퀴즈 전체 흐름 ----------
  {
    const r = await H.makeRoom(3);
    H.send(r.host, { type: 'start_game', game: 'draw' });
    await H.waitPlaying(r.code);
    await H.waitRoom(r.code, x => x.draw.phase === 'pick', 8000, 'pick');

    // 학생은 출제자를 지목할 수 없다
    H.send(r.bots[1], { type: 'dpick', id: r.ids[1] });
    await H.sleep(300);
    t.ok((await H.room(r.code)).draw.phase === 'pick', '그림퀴즈: 학생의 출제자 지목 무시');

    H.send(r.host, { type: 'dpick', id: r.ids[0] });
    await H.waitRoom(r.code, x => x.draw.phase === 'write', 8000, 'write');

    // 형식 검증
    H.send(r.bots[0], { type: 'dword', text: '가' });
    await H.sleep(250);
    t.ok(H.last(r.bots[0], 'dword_bad'), '그림퀴즈: 한 글자 정답 거부');
    // 출제자 아닌 사람의 답 설정 무시
    H.send(r.bots[1], { type: 'dword', text: '침입' });
    await H.sleep(250);
    t.ok((await H.room(r.code)).draw.answer === '', '그림퀴즈: 출제자 아닌 사람의 답 설정 무시');

    H.send(r.bots[0], { type: 'dword', text: '사과' });
    await H.waitRoom(r.code, x => x.draw.phase === 'draw', 8000, 'draw');

    // 그리기 릴레이 방향: 출제자 제외 전원 + TV
    H.clearFrames(r.host, ...r.bots);
    H.send(r.bots[0], { type: 'dstroke', begin: 1, c: 1, w: 1, pts: [100, 100, 200, 200] });
    await H.sleep(350);
    t.ok(r.bots[1].frames.filter(f => f.type === 'dseg').length === 1, '그림퀴즈: 맞히는 학생에게 선 릴레이');
    t.ok(r.host.frames.filter(f => f.type === 'dseg').length === 1, '그림퀴즈: TV에도 선 릴레이');
    t.ok(r.bots[0].frames.filter(f => f.type === 'dseg').length === 0, '그림퀴즈: 출제자 본인에겐 릴레이 안 함');

    // 정답 판정(공백 무시) + 출제자 보너스
    H.send(r.bots[1], { type: 'dguess', text: '바나나' });
    await H.sleep(250);
    t.ok(H.last(r.host, 'dmiss'), '그림퀴즈: 오답이 TV 티커로');
    H.send(r.bots[1], { type: 'dguess', text: '사 과' });
    await H.sleep(300);
    const cor = H.last(r.host, 'dcorrect');
    t.ok(cor && cor.points === 10, '그림퀴즈: 첫 정답 10점(공백 무시 판정)');
    const rm = await H.room(r.code);
    const drawer = rm.draw.players.find(p => p[0] === '봇1');
    t.ok(drawer && drawer[1] === 2, '그림퀴즈: 출제자 보너스 +2점');

    // 재접속 시 그림 복구
    const tok = r.tokens[2];
    r.bots[2].close();
    await H.sleep(300);
    const re = await H.mkClient('재접속');
    H.send(re, { type: 'join', code: r.code, token: tok, nick: '봇3' });
    await H.sleep(500);
    const full = H.last(re, 'dfull');
    t.ok(full && full.strokes.length === 1, '그림퀴즈: 재접속 시 그림 복구');
    try { re.close(); } catch {}
    r.close();
  }

  // ---------- 블록 배틀 ----------
  {
    const r = await H.makeRoom(2);
    H.send(r.host, { type: 'start_game', game: 'tetris' });
    await H.waitPlaying(r.code);
    await H.sleep(400);

    const me = async () => (await H.room(r.code)).tetris.players[0];
    const before = await me();
    t.ok(before.board && before.board.length === 200, `보드 10×20 표준 (${before.board.length}칸)`);
    t.ok(before.piece >= 0 && before.piece <= 6, '조각 7종 중 하나 스폰');

    // 좌우 이동
    const x0 = (await me()).x;
    H.send(r.bots[0], { type: 'tmove', v: -1 });
    await H.sleep(200);
    t.ok((await me()).x === x0 - 1, '왼쪽 이동');
    H.send(r.bots[0], { type: 'tmove', v: 1 });
    await H.sleep(200);
    t.ok((await me()).x === x0, '오른쪽 이동');

    // 회전
    const rot0 = (await me()).rot;
    H.send(r.bots[0], { type: 'trot' });
    await H.sleep(200);
    const rot1 = (await me()).rot;
    t.ok(rot1 !== rot0 || (await me()).piece === 3, '회전 동작 (O조각은 제자리)');

    // 하드드롭 → 바닥에 블록이 쌓인다 (빈 칸은 '0')
    const filledOf = b => [...b].filter(c => c !== '0').length;
    const beforeFilled = filledOf((await me()).board);
    H.send(r.bots[0], { type: 'tdrop' });
    await H.sleep(400);
    const afterFilled = filledOf((await me()).board);
    t.ok(afterFilled === beforeFilled + 4,
      `하드드롭으로 4칸짜리 조각 고정 (${beforeFilled} → ${afterFilled}칸)`);

    // 벽 넘어 이동 불가 — 계속 눌러도 더 이상 안 밀린다
    for (let i = 0; i < 12; i++) { H.send(r.bots[0], { type: 'tmove', v: -1 }); await H.sleep(50); }
    const wallX = (await me()).x;
    H.send(r.bots[0], { type: 'tmove', v: -1 });
    await H.sleep(200);
    t.ok((await me()).x === wallX, `왼쪽 벽에서 멈춤 (x=${wallX} 유지)`);
    // 조각의 실제 칸이 보드 안에 있는지도 확인
    t.ok(wallX >= -2 && wallX <= 9, `벽 위치가 보드 범위 안 (x=${wallX})`);

    r.close();
  }

  // ---------- 사다리: 칸 수는 인원수대로 ----------
  {
    const r = await H.makeRoom(4);
    H.send(r.host, { type: 'start_game', game: 'sadari' });
    await H.waitPlaying(r.code);
    const rm = await H.waitRoom(r.code, x => x.sadari && x.sadari.round >= 1, 8000, '사다리 1라운드');
    t.eq(rm.sadari.lanes, 4, '사다리: 4명 → 4칸');
    t.eq(rm.sadari.prizes.length, 4, '사다리: 상품도 4개');
    // 개편: 꽝 칸은 선택이 끝난 뒤 '사람이 실제로 도착하는 칸' 중에서 정한다
    // (선택 중에 미리 정해두면 빈 칸이 뽑혀 아무도 안 걸리는 판이 생긴다)
    t.ok(rm.sadari.prizes.every(v => v === 0), '사다리: 선택 중엔 꽝 칸 미정');
    t.ok(rm.sadari.map.length === 4 && rm.sadari.map.every(v => v >= 0 && v < 4), '사다리: 경로가 4칸 안에서 매핑');
    // 범위 밖 칸 선택은 무시된다
    H.send(r.bots[0], { type: 'pick', v: 7 });
    await H.sleep(300);
    t.ok((await H.room(r.code)).sadari.picks.find(p => p[0] === '봇1')[1] === -1, '사다리: 없는 칸(7) 선택 무시');
    H.send(r.bots[0], { type: 'pick', v: 3 });
    await H.sleep(300);
    t.ok((await H.room(r.code)).sadari.picks.find(p => p[0] === '봇1')[1] === 3, '사다리: 유효 칸(3) 선택 반영');
    // 1인 1칸 선착순 — 남이 잡은 칸은 못 가져간다
    H.send(r.bots[1], { type: 'pick', v: 3 });
    await H.sleep(300);
    t.ok((await H.room(r.code)).sadari.picks.find(p => p[0] === '봇2')[1] !== 3, '사다리: 이미 찬 칸은 선택 불가(선착순)');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 6000);
    r.close();
  }

  // ---------- 사다리: 최소 2칸 보장 (bd57fc6 개편: 1인 1칸·최소 2) ----------
  {
    const r = await H.makeRoom(2);
    H.send(r.host, { type: 'start_game', game: 'sadari' });
    await H.waitPlaying(r.code);
    const rm = await H.waitRoom(r.code, x => x.sadari && x.sadari.round >= 1, 8000, '사다리 1라운드');
    t.eq(rm.sadari.lanes, 2, '사다리: 2명이면 2칸 (1인 1칸)');
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 6000);
    r.close();
  }

  // ---------- 오늘의 챔피언 ----------
  {
    const r = await H.makeRoom(3);
    // 1판
    H.send(r.host, { type: 'start_game', game: 'draw' });
    await H.waitPlaying(r.code);
    await H.waitRoom(r.code, x => x.draw.phase === 'pick', 8000);
    H.send(r.host, { type: 'dpick', id: r.ids[0] });
    await H.waitRoom(r.code, x => x.draw.phase === 'write', 8000);
    H.send(r.bots[0], { type: 'dword', text: '토끼' });
    await H.waitRoom(r.code, x => x.draw.phase === 'draw', 8000);
    H.send(r.bots[1], { type: 'dguess', text: '토끼' });
    await H.sleep(200);
    H.send(r.bots[2], { type: 'dguess', text: '토끼' });
    await H.waitRoom(r.code, x => x.draw.phase === 'reveal', 8000);
    await H.waitRoom(r.code, x => x.draw.phase === 'pick', 12000);
    H.send(r.host, { type: 'dend' });
    await H.sleep(400);

    const res1 = H.last(r.host, 'result');
    t.ok(res1 && Array.isArray(res1.champ) && res1.champ.length === 3, '챔피언: result에 누적 순위 포함');
    t.ok(res1.champ[0][3] === 10 && res1.champ[0][4] === 1, '챔피언: 1등 10점·우승 1회');
    t.ok(H.last(r.bots[0], 'result').champ, '챔피언: 학생도 누적 수신');

    // 2판 → 누적
    H.send(r.host, { type: 'start_game', game: 'tetris' });
    await H.waitPlaying(r.code);
    H.send(r.host, { type: 'back_to_lobby' });
    await H.waitRoom(r.code, x => x.state === 'lobby', 6000);
    const ros = H.last(r.host, 'roster');
    t.ok(ros && ros.champ && ros.champ.length === 3, '챔피언: 로비 roster에도 누적 전달');

    // 초기화 권한
    H.send(r.bots[0], { type: 'champ_reset' });
    await H.sleep(300);
    t.ok(H.last(r.host, 'roster').champ.length === 3, '챔피언: 학생의 초기화 무시');
    H.send(r.host, { type: 'champ_reset' });
    await H.sleep(300);
    t.ok(H.last(r.host, 'roster').champ.length === 0, '챔피언: 방장 초기화 → 빈 배열 전파');
    r.close();
  }

  t.ok(H.serverErrors().length === 0, '서버 예외 0건');
  return t;
};
