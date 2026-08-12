// 배포 생존 — 서버를 실제로 죽였다 살려서, 교사 화면이 방을 되살리고 학생이 돌아오는지.
// Render는 재배포 때 컨테이너를 새로 띄우므로 디스크 저장이 통하지 않는다.
// 복원 주체는 '교사 화면이 들고 있는 방 코드·토큰·챔피언 점수'다.
const H = require('./helpers');

module.exports = async function run() {
  const t = H.makeT('배포 생존');

  // 1) 방을 만들고 챔피언 점수를 쌓는다
  const r = await H.makeRoom(3, ['가람', '나래', '다솜']);
  H.send(r.host, { type: 'start_game', game: 'draw' });
  await H.waitPlaying(r.code);
  await H.waitRoom(r.code, x => x.draw.phase === 'pick', 8000);
  H.send(r.host, { type: 'dpick', id: r.ids[0] });
  await H.waitRoom(r.code, x => x.draw.phase === 'write', 8000);
  H.send(r.bots[0], { type: 'dword', text: '사자' });
  await H.waitRoom(r.code, x => x.draw.phase === 'draw', 8000);
  H.send(r.bots[1], { type: 'dguess', text: '사자' });
  await H.sleep(200);
  H.send(r.bots[2], { type: 'dguess', text: '사자' });
  await H.waitRoom(r.code, x => x.draw.phase === 'reveal', 8000);
  await H.waitRoom(r.code, x => x.draw.phase === 'pick', 12000);
  H.send(r.host, { type: 'dend' });
  await H.sleep(400);

  const before = H.last(r.host, 'result').champ;
  t.ok(before && before.length === 3, `재시작 전 챔피언 3명 (선두 ${before[0][1]} ${before[0][3]}점)`);
  const code = r.code, hostToken = r.hostToken;
  const stuTokens = r.tokens;

  // 2) 종료 예고(SIGTERM) → 클라이언트가 server_restart를 받는가
  // Windows에는 POSIX 시그널이 없어 다른 프로세스에 SIGTERM을 보내면 즉시 강제 종료된다
  // (핸들러가 돌지 않음). 실제 운영지인 Render는 리눅스라 정상 동작한다.
  H.clearFrames(r.host, ...r.bots);
  const proc = await H.startServer();          // 이미 떠 있는 프로세스 핸들
  if (process.platform === 'win32') {
    t.skipped('재시작 예고(server_restart) 전송', 'Windows는 SIGTERM 전달 불가 — 리눅스(Render)에서만 검증 가능');
  } else {
    process.kill(proc.pid, 'SIGTERM');
    await H.waitFor(() => H.last(r.host, 'server_restart'), 4000, '재시작 예고').catch(() => {});
    t.ok(!!H.last(r.host, 'server_restart'), '교사 화면이 재시작 예고 수신');
    t.ok(!!H.last(r.bots[0], 'server_restart'), '학생도 재시작 예고 수신');
  }

  // 3) 서버가 완전히 죽고 새로 뜬다 (재배포 시뮬레이션)
  await H.sleep(1200);
  H.stopServer();
  r.close();
  await H.startServer();
  t.ok((await H.dbg()).length === 0, '새 서버는 방이 비어 있음 (메모리 소실 재현)');

  // 4) 교사 화면이 같은 코드·토큰·점수로 방을 되살린다
  const host2 = await H.mkClient('교사-복귀');
  H.send(host2, { type: 'rejoin_host', code, hostToken });
  await H.waitFor(() => H.last(host2, 'host_rejoin_fail'), 4000, '복원 실패 응답');
  t.ok(!!H.last(host2, 'host_rejoin_fail'), '방이 없으니 rejoin은 실패 (복원 경로로 넘어감)');

  H.send(host2, { type: 'restore_room', code, hostToken, champ: before });
  await H.waitFor(() => H.last(host2, 'room_created'), 4000, '방 복원');
  const rc = H.last(host2, 'room_created');
  t.ok(rc && rc.code === code && rc.restored === 1, `같은 코드로 방 복원 (${rc && rc.code})`);

  const restored = await H.room(code);
  t.ok(!!restored, '복원된 방이 서버에 존재');
  const ros = H.last(host2, 'roster');
  t.ok(ros && ros.champ && ros.champ.length === 3, '챔피언 점수 3명 복원');
  t.ok(ros.champ[0][1] === before[0][1] && ros.champ[0][3] === before[0][3],
    `선두 유지 (${ros.champ[0][1]} ${ros.champ[0][3]}점)`);

  // 5) 학생이 기존 토큰으로 돌아온다 (서버엔 그 토큰이 없으니 새 참가자로 합류)
  const stu = await H.mkClient('학생-복귀');
  H.send(stu, { type: 'join', code, token: stuTokens[0], nick: '가람' });
  await H.waitFor(() => H.last(stu, 'join_ok'), 4000, '학생 재입장');
  t.ok(!!H.last(stu, 'join_ok'), '학생이 같은 방 코드로 재입장');

  // 6) 되살린 방에서 게임이 정상 동작
  const stu2 = await H.mkClient('학생2');
  H.send(stu2, { type: 'join', code, nick: '나래' });
  await H.waitFor(() => H.last(stu2, 'join_ok'), 4000);
  H.send(host2, { type: 'start_game', game: 'bomb' });
  await H.waitPlaying(code);
  t.ok(true, '복원된 방에서 게임 정상 시작');

  // 7) 이미 살아있는 방은 복원으로 덮어쓸 수 없다 (남의 방 탈취 방지)
  const evil = await H.mkClient('탈취시도');
  H.send(evil, { type: 'restore_room', code, hostToken: 'aaaaaaaaaaaa', champ: [] });
  await H.sleep(400);
  t.ok(!!H.last(evil, 'host_rejoin_fail'), '살아있는 방은 복원으로 덮어쓰기 불가');
  const still = await H.room(code);
  t.ok(still.state === 'playing', '기존 방 상태 그대로 유지');

  [host2, stu, stu2, evil].forEach(w => { try { w.close(); } catch {} });
  H.send(host2, { type: 'close_room' });
  await H.sleep(200);
  return t;
};
