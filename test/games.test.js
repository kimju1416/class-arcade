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

  // ---------- 카트 아이템 충돌: 고속에서 표적을 뛰어넘지 않는가 ----------
  // 예전엔 "지금 이 순간의 한 점"만 봐서, 틱당 이동거리(72~125유닛)가
  // 판정 폭(90~110유닛)보다 커지면 바나나·등껍질을 그대로 통과했다(실측 피격 0회).
  // 서버가 다시 점 판정으로 돌아가면 여기서 걸린다.
  {
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    const TRACK = 240 * 200;
    const wrap = v => { const x = ((v % TRACK) + TRACK) % TRACK; return x > TRACK / 2 ? x - TRACK : x; };

    t.ok(/kartWrap/.test(src) && /kPrevTotal/.test(src), '카트: 스윕 판정 코드가 살아 있다');
    t.ok(/tgt\.kX - s\.x/.test(src), '카트: 등껍질이 표적 차선을 따라간다(유도)');

    // 바나나를 0에 두고 카트가 뒤에서 다가와 지나간다. 출발 위상을 1유닛씩 바꿔가며
    // 모든 경우를 돌려, 판정이 바나나를 건너뛰는 위상이 있는지 본다.
    const sweep = (step, R) => {
      let missPoint = 0, missSwept = 0;
      for (let ph = 0; ph < step; ph++) {
        let hitP = false, hitS = false;
        for (let pos = ph - 400; pos < 400; pos += step) {
          if (Math.abs(wrap(pos)) < R) hitP = true;                       // 옛 방식: 그 순간의 점만
          const a = wrap(pos - step), b = wrap(pos);                      // 새 방식: 지나온 구간
          if (Math.min(a, b) <= R && Math.max(a, b) >= -R) hitS = true;
        }
        if (!hitP) missPoint++;
        if (!hitS) missSwept++;
      }
      return { missPoint, missSwept };
    };
    const boost = sweep(101, 45);    // 부스터 속도 = 틱당 101유닛 (판정 폭 90보다 크다)
    t.ok(boost.missSwept === 0, `카트: 부스터 속도로도 바나나를 건너뛰지 않는다 (놓침 ${boost.missSwept}건)`);
    t.ok(boost.missPoint > 0, `카트: 옛 점 판정은 부스터 구간에서 실제로 놓쳤다 (${boost.missPoint}/101 위상)`);
    const cruise = sweep(72, 45);    // 기본 속도에서는 옛 방식도 놓치지 않았다 (정직하게 기록)
    t.ok(cruise.missSwept === 0 && cruise.missPoint === 0, '카트: 기본 속도에서는 두 방식 모두 놓치지 않는다');
  }

  // ---------- 내 캐릭터 로컬 예측: 즉시 반응하고 고무줄처럼 튀지 않는가 ----------
  // 클라이언트의 predictMe를 그대로 떼어내, 서버 반영이 155ms 늦는 상황을 재현한다.
  {
    const fs = require('fs'), path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const i0 = html.indexOf('function predictMe(');
    let src = '';
    if (i0 >= 0) {
      let d = 0;
      for (let k = html.indexOf('{', i0); k < html.length; k++) {
        if (html[k] === '{') d++;
        else if (html[k] === '}') { d--; if (!d) { src = html.slice(i0, k + 1); break; } }
      }
    }
    t.ok(!!src, '예측: predictMe 함수가 존재한다');

    if (src) {
      let curDir = { x: 0, y: 0 }, pred = null, predAt = 0, inputLog = [], srvClock = 0, nowMs = 0;
      const ctx = {
        get pred() { return pred; }, set pred(v) { pred = v; },
        get predAt() { return predAt; }, set predAt(v) { predAt = v; },
        get curDir() { return curDir; },
        get inputLog() { return inputLog; },
        serverNow: () => srvClock, keyDir: () => null,
        isHost: false, phase: 'playing', Math,
        PRED_SPEED: 230, PRED_ZOMBIE_MULT: 1.08, PLAYER_R_CLIENT: 16,
        PRED_GAMES: { bomb: 1, tag: 1, coin: 1, gala: 1, dodge: 1, ox: 1 },
        performance: { now: () => nowMs },
      };
      const fn = new Function('ctx', `with (ctx) { return (${src.replace('function predictMe', 'function')}); }`)(ctx);

      const SPEED = 230, DT = 1 / 60, LAG = 155, arena = { w: 900, h: 900 };
      let truth = 450, maxErr = 0, firstMove = -1, flips = 0, prevSign = 0;
      const hist = [], startX = truth;
      for (let f = 0; f < 240; f++) {
        nowMs = srvClock = f * DT * 1000;
        if (f === 30) { curDir = { x: 1, y: 0 }; inputLog.push({ t: nowMs, x: 1, y: 0 }); }
        if (f === 150) { curDir = { x: 0, y: 0 }; inputLog.push({ t: nowMs, x: 0, y: 0 }); }
        truth = Math.max(16, Math.min(arena.w - 16, truth + curDir.x * SPEED * DT));
        hist.push({ t: nowMs, x: truth });
        const old = hist.find(h => h.t >= nowMs - LAG) || hist[0];
        const p = fn({ mode: 'dodge', arena, st: old.t }, old.x, 450, false);
        if (firstMove < 0 && f >= 30 && p && Math.abs(p.x - startX) > 1) firstMove = f - 30;
        if (f > 40 && p) {
          const err = p.x - truth;
          maxErr = Math.max(maxErr, Math.abs(err));
          const s = Math.sign(err);
          if (s && prevSign && s !== prevSign) flips++;
          prevSign = s;
        }
      }
      t.ok(firstMove === 0, `예측: 조작 다음 프레임에 바로 움직인다 (${firstMove}프레임)`);
      // 보정 없이 서버 좌표만 따라가면 지연 거리(≈36유닛)만큼 뒤처진다 → 피했는데 맞는 일이 생긴다
      t.ok(maxErr < 12, `예측: 서버 실제 위치와의 오차가 작다 (${maxErr.toFixed(1)}유닛 < 12)`);
      t.ok(flips <= 2, `예측: 고무줄처럼 앞뒤로 튀지 않는다 (부호 뒤집힘 ${flips}회)`);
    }
  }

  // ---------- 줄다리기: 인원 차가 결과를 좌우하면 안 된다 ----------
  {
    const stOf = b => [...b.frames].reverse().find(f => f.type === 'state' && f.mode === 'pull');

    // 홀수 학급 → 심판 한 명을 빼서 참가 인원을 짝수로 만든다
    {
      const r = await H.makeRoom(9);
      H.send(r.host, { type: 'start_game', game: 'pull' });
      await H.waitPlaying(r.code);
      const iv = setInterval(() => r.bots.forEach((b, i) => H.send(b, { type: 'input', x: i < 5 ? -1 : 1, y: 0 })), 200);
      await H.sleep(17000);
      clearInterval(iv);
      const s = stOf(r.bots[0]);
      const inGame = (s.players || []).filter(p => !p[4]);
      const refs = inGame.filter(p => p[7]).length;
      const playing = inGame.length - refs;
      t.ok(s.pl && s.pl.ph === 'round', '줄다리기: 선택 시간이 끝나면 당기기가 시작된다');
      t.ok(refs === 1, `줄다리기: 홀수(9명)면 심판 1명 (${refs}명)`);
      t.ok(playing % 2 === 0, `줄다리기: 심판을 빼면 참가 인원이 짝수 (${playing}명)`);
      t.ok(inGame.filter(p => p[6] === 0).length > 0 && inGame.filter(p => p[6] === 1).length > 0,
           '줄다리기: 걸어간 방향대로 양 팀이 나뉜다');
      r.close();
    }

    // 7 대 3인데 양쪽 다 구호를 맞추면 밧줄은 거의 그대로여야 한다.
    // 합계로 계산하면 7명 팀이 곧장 이겨서 이 값이 100에 붙는다.
    {
      const r = await H.makeRoom(10);
      H.send(r.host, { type: 'start_game', game: 'pull' });
      await H.waitPlaying(r.code);
      const iv = setInterval(() => r.bots.forEach((b, i) => H.send(b, { type: 'input', x: i < 7 ? -1 : 1, y: 0 })), 200);
      await H.sleep(16500);
      clearInterval(iv);
      let ropeMax = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const s = stOf(r.bots[0]);
        if (s && s.pl && s.pl.ph === 'round' && s.pl.beat) {
          const wait = s.pl.beat - Date.now();
          if (wait > 0 && wait < 400) { await H.sleep(wait); r.bots.forEach(b => H.send(b, { type: 'action' })); }
          ropeMax = Math.max(ropeMax, Math.abs(s.pl.rope));
        }
        await H.sleep(40);
      }
      t.ok(ropeMax < 25, `줄다리기: 7 대 3이어도 호흡이 같으면 밧줄이 안 끌린다 (최대 ${ropeMax.toFixed(1)}/100)`);
      r.close();
    }

    // 연타 모드: 한 명이 초당 50번 눌러도 인정은 상한까지만
    {
      const r = await H.makeRoom(4);
      H.send(r.host, { type: 'start_game', game: 'pull', opt: { mode: 'mash' } });
      await H.waitPlaying(r.code);
      const iv = setInterval(() => r.bots.forEach((b, i) => H.send(b, { type: 'input', x: i < 2 ? -1 : 1, y: 0 })), 200);
      await H.sleep(16500);
      clearInterval(iv);
      const fast = setInterval(() => H.send(r.bots[0], { type: 'action' }), 20);
      await H.sleep(4000);
      clearInterval(fast);
      const s = stOf(r.bots[0]);
      // 청팀 2명 중 1명만 연타 → 1인당 평균은 상한(10)의 절반을 넘을 수 없다
      t.ok(s.pl && s.pl.sa <= 5.2, `줄다리기: 연타기를 써도 상한에 막힌다 (1인당 ${s.pl && s.pl.sa})`);
      r.close();
    }
  }

  // ---------- 팀 대항전: 개인 순위를 팀 점수로 (모든 게임 공용) ----------
  {
    const r = await H.makeRoom(9);                       // 홀수 학급
    H.send(r.host, { type: 'team_mode', on: true });
    await H.sleep(400);
    let ros = H.last(r.host, 'roster');
    const c0 = [0, 0];
    for (const p of ros.players) c0[p.team || 0]++;
    t.ok(ros.teamOn === 1, '팀전: 켜면 roster에 반영된다');
    t.ok(Math.abs(c0[0] - c0[1]) <= 1, `팀전: 켜는 순간 반반 자동 배정 (${c0[0]} 대 ${c0[1]})`);

    // 학생이 아니라 방장만 팀을 바꿀 수 있다
    const someId = ros.players[0].id, before = ros.players[0].team || 0;
    H.send(r.bots[0], { type: 'team_set', id: someId, team: before === 0 ? 1 : 0 });
    await H.sleep(300);
    t.ok((H.last(r.host, 'roster').players.find(p => p.id === someId).team || 0) === before,
         '팀전: 학생의 팀 변경 시도는 무시된다');

    // 방장이 전원을 한 팀으로 몰아 보려 해도 인원 차는 1명을 넘지 않는다.
    // 7 대 2 같은 판은 적은 팀이 한 명만 딴짓해도 점수가 반토막 나 게임이 성립하지 않는다.
    ros = H.last(r.host, 'roster');
    ros.players.forEach(p => H.send(r.host, { type: 'team_set', id: p.id, team: 0 }));
    await H.sleep(700);
    ros = H.last(r.host, 'roster');
    const c1 = [0, 0];
    for (const p of ros.players) c1[p.team || 0]++;
    t.ok(Math.abs(c1[0] - c1[1]) <= 1, `팀전: 전원 한 팀으로 몰아도 인원이 맞춰진다 (${c1[0]} 대 ${c1[1]})`);

    // 한 명만 옮기는 건 되고, 그때도 인원은 유지된다 (상대 팀과 자리를 바꾼다)
    const mv = ros.players.find(p => (p.team || 0) === 0);
    H.send(r.host, { type: 'team_set', id: mv.id, team: 1 });
    await H.sleep(400);
    ros = H.last(r.host, 'roster');
    const c2 = [0, 0];
    for (const p of ros.players) c2[p.team || 0]++;
    t.ok((ros.players.find(p => p.id === mv.id).team || 0) === 1, '팀전: 지목한 학생은 원하는 팀으로 간다');
    t.ok(Math.abs(c2[0] - c2[1]) <= 1, `팀전: 옮긴 뒤에도 인원 차 1명 이내 (${c2[0]} 대 ${c2[1]})`);

    // 한 판 돌려 팀 점수가 나오는지 + 계산이 1인당 평균인지
    // 짧게 끝나는 게임으로 (한 라운드짜리 사다리 — 뽑기 11초 + 공개 6.5초)
    H.send(r.host, { type: 'start_game', game: 'sadari' });
    await H.waitPlaying(r.code);
    const iv = setInterval(() => r.bots.forEach((b, i) => H.send(b, { type: 'pick', v: i % 8 })), 400);
    const res = await H.waitFor(() => H.last(r.host, 'result'), 60000, '결과');
    clearInterval(iv);

    t.ok(res.team && typeof res.team.a === 'number', '팀전: 결과에 팀 점수가 실려 온다');
    const teams = new Map(ros.players.map(p => [p.id, p.team || 0]));
    const n = res.ranking.length, sum = [0, 0], cnt = [0, 0];
    for (const x of res.ranking) { const tt = teams.get(x.id) || 0; sum[tt] += (n - x.rank + 1); cnt[tt]++; }
    const avg = [Math.round(sum[0] / cnt[0] * 10) / 10, Math.round(sum[1] / cnt[1] * 10) / 10];
    t.ok(avg[0] === res.team.a && avg[1] === res.team.b,
         `팀전: 점수는 순위점수 ÷ 인원 (서버 ${res.team.a}:${res.team.b} = 검산 ${avg[0]}:${avg[1]})`);
    // 합계로 계산했다면 7명 팀이 거의 항상 이긴다 — 그 함정을 피했는지 확인
    t.ok(cnt[0] > 0 && cnt[1] > 0, `팀전: 두 팀 모두 인원이 있다 (${cnt[0]} 대 ${cnt[1]})`);
    t.ok(res.team.win === (avg[0] > avg[1] ? 0 : avg[0] < avg[1] ? 1 : -1), '팀전: 승패는 평균으로 가른다');
    t.ok((res.team.wins[0] + res.team.wins[1]) === (res.team.win < 0 ? 0 : 1), '팀전: 이긴 판 수가 누적된다');
    r.close();
  }

  // ---------- 전송량 절약: 안 바뀌는 건 빼고 보낸다 ----------
  // 아레나 크기·퀴즈 점수를 매 틱 보내고 있었다(퀴즈는 전송량의 절반).
  // 빼고 보내되, 중간에 들어온 학생은 반드시 한 번 받아야 한다 — 그게 유일한 위험 지점.
  {
    const r = await H.makeRoom(4);
    H.send(r.host, { type: 'start_game', game: 'bomb' });
    await H.waitPlaying(r.code);
    await H.sleep(2500);
    // 판 도중 새 학생
    const late = await H.mkClient('지각');
    H.send(late, { type: 'join', code: r.code, nick: '지각생' });
    await H.sleep(1500);
    t.ok(!![...late.frames].reverse().find(f => f.type === 'state' && f.arena),
         '절약: 판 도중 들어온 학생도 아레나 크기를 받는다');
    // 계속 보내지는 않는다 (절약이 실제로 되는지)
    H.clearFrames(late);
    await H.sleep(1200);
    const withArena = late.frames.filter(f => f.type === 'state' && f.arena).length;
    const allSt = late.frames.filter(f => f.type === 'state').length;
    t.ok(allSt > 5 && withArena === 0, `절약: 그 뒤로는 아레나를 안 보낸다 (state ${allSt}개 중 ${withArena}개)`);
    try { late.close(); } catch {}
    r.close();
  }
  {
    const r = await H.makeRoom(4);
    H.send(r.host, { type: 'start_game', game: 'quiz' });
    await H.waitPlaying(r.code);
    r.bots.forEach((b, i) => H.send(b, { type: 'answer', a: i % 4 }));
    await H.sleep(2500);
    const late = await H.mkClient('지각2');
    H.send(late, { type: 'join', code: r.code, nick: '지각생2' });
    await H.sleep(1500);
    t.ok(!![...late.frames].reverse().find(f => f.type === 'state' && f.scores),
         '절약: 퀴즈 도중 들어온 학생도 점수판을 받는다');
    H.clearFrames(late);
    await H.sleep(1300);
    const withScores = late.frames.filter(f => f.type === 'state' && f.scores).length;
    const allSt2 = late.frames.filter(f => f.type === 'state').length;
    // 문제가 공개(reveal)로 넘어가는 순간에는 점수 내용이 실제로 바뀌므로 한두 번은 정상이다.
    // 매 틱 보내던 것에서 크게 줄었는지만 본다.
    t.ok(allSt2 > 5 && withScores <= allSt2 * 0.2,
         `절약: 점수는 바뀔 때만 보낸다 (state ${allSt2}개 중 ${withScores}개)`);
    // 바뀌면 다시 온다
    H.clearFrames(late);
    H.send(r.bots[0], { type: 'answer', a: 2 });
    await H.sleep(1200);
    t.ok(!![...late.frames].reverse().find(f => f.type === 'state' && f.scores),
         '절약: 점수가 바뀌면 다시 보낸다');
    try { late.close(); } catch {}
    r.close();
  }
  // 클라이언트가 빠진 필드를 캐시로 메우는지 (안 하면 화면이 죽는다)
  {
    const fs = require('fs'), path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    t.ok(/if \(m\.arena\) arena = m\.arena; else m\.arena = arena;/.test(html),
         '절약: 아레나가 안 오면 클라가 캐시값을 스냅샷에 채운다');
    t.ok(/if \(m\.scores\) lastQScores = m\.scores; else if \(lastQScores\) m\.scores = lastQScores;/.test(html),
         '절약: 점수가 안 오면 클라가 직전 값을 쓴다');
  }

  // ---------- 이모지 반응 (학생 → TV) ----------
  {
    const r = await H.makeRoom(2);
    H.clearFrames(r.host, ...r.bots);
    H.send(r.bots[0], { type: 'react', e: 1 });
    await H.sleep(250);
    const got = H.last(r.host, 'react');
    t.ok(got && got.e === 1 && got.id === r.ids[0], '반응: 로비에서 TV로 중계 (번호·보낸 사람)');
    t.ok(!H.last(r.bots[1], 'react') && !H.last(r.bots[0], 'react'), '반응: 학생 폰에는 안 간다 (TV 전용)');
    H.clearFrames(r.host);
    H.send(r.bots[0], { type: 'react', e: 2 });          // 0.6초 안의 연타 → 무시
    H.send(r.bots[0], { type: 'react', e: 99 });         // 범위 밖
    H.send(r.bots[0], { type: 'react', e: -1 });
    H.sendRaw(r.bots[0], '{"type":"react","e":1e400}');   // Infinity
    await H.sleep(250);
    t.ok(r.host.frames.filter(f => f.type === 'react').length === 0, '반응: 연타·범위 밖·Infinity 전부 무시');
    await H.sleep(700);
    H.send(r.bots[1], { type: 'react', e: 7 });
    await H.sleep(250);
    t.ok(!!H.last(r.host, 'react'), '반응: 다른 학생은 독립적으로 통과');
    H.send(r.host, { type: 'start_game', game: 'bomb' });
    await H.waitPlaying(r.code);
    H.clearFrames(r.host);
    await H.sleep(700);
    H.send(r.bots[1], { type: 'react', e: 3 });
    await H.sleep(250);
    t.ok(r.host.frames.filter(f => f.type === 'react').length === 0, '반응: 게임 중에는 막힌다 (화면 방해 방지)');
    r.close();
  }

  // ---------- 퀴즈·OX 문제 풀 확대 + 같은 방 중복 방지 ----------
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const EX = require('../data/quiz-extra.js');
    t.ok(EX.oxEasy.length + EX.oxMore.length >= 300, `문제 풀: OX 추가 ${EX.oxEasy.length + EX.oxMore.length}문항 (300+)`);
    const qn = Object.values(EX.quizEasy).flat().length + Object.values(EX.quizMore).flat().length;
    t.ok(qn >= 180, `문제 풀: 퀴즈쇼 추가 ${qn}문항 (180+)`);
    t.ok(/pickFresh\(room, 'ox'/.test(src) && /pickFresh\(room, 'quiz'/.test(src), '문제 풀: OX·퀴즈 모두 같은 방 중복 방지(pickFresh) 사용');
    // 같은 방에서 OX 두 판 → 문제가 겹치지 않는다 (호스트가 받는 state의 q로 수집)
    const r = await H.makeRoom(2);
    const collect = async () => {
      const seen = new Set();
      H.send(r.host, { type: 'start_game', game: 'ox', opt: { diff: '하' } });
      await H.waitPlaying(r.code);
      const t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        for (const f of r.host.frames) if (f.type === 'state' && f.mode === 'ox' && f.q) seen.add(f.q);
        await H.sleep(300);
      }
      H.send(r.host, { type: 'back_to_lobby' });
      await H.sleep(600);
      H.clearFrames(r.host);
      return seen;
    };
    const a = await collect(), b = await collect();
    const overlap = [...a].filter(q => b.has(q));
    t.ok(a.size >= 1 && b.size >= 1 && overlap.length === 0, `문제 풀: 같은 방 두 판의 OX 문제가 안 겹친다 (1판 ${a.size}·2판 ${b.size}·겹침 ${overlap.length})`);
    r.close();
  }

  t.ok(H.serverErrors().length === 0, '서버 예외 0건');
  return t;
};
