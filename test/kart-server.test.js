// 슈퍼스타 카트 서버 방어 검사: node test/kart-server.test.js (서버가 3000번에 떠 있어야 함)
const WebSocket = require('ws');
const URL = process.env.KART_WS || 'ws://localhost:3000/kart/ws';
const open = () => new Promise((res, rej) => { const w = new WebSocket(URL); w.msgs = []; w.on('message', d => w.msgs.push(JSON.parse(d))); w.on('open', () => res(w)); w.on('error', rej); });
const SLOW = process.env.KART_WS ? 4 : 1; // 라이브는 왕복 120ms라 기다림을 늘린다
const wait = (ms) => new Promise(r => setTimeout(r, ms * SLOW));
const last = (w, t) => [...w.msgs].reverse().find(m => m.type === t);
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const A = await open(), B = await open();
  A.send(JSON.stringify({ t: 'hello', create: true, name: '<b>' + 'x'.repeat(500), char: 99 }));
  await wait(300);
  const code = last(A, 'welcome').code;
  const lob = last(A, 'lobby');
  ok(lob.players[0].name.length <= 10 && !lob.players[0].name.includes('<'), '이름 자르기·꺾쇠 제거');
  ok(lob.players[0].char === 9, '캐릭터 번호 범위 제한');
  B.send(JSON.stringify({ t: 'hello', room: code.toLowerCase(), name: '친구', char: 1 }));
  await wait(300);
  B.send(JSON.stringify({ t: 'start' })); await wait(300);
  ok(!B.msgs.find(m => m.type === 'start'), '방장 아닌 사람은 출발 못 함');
  B.send(JSON.stringify({ t: 'set', track: 'neon' })); await wait(200);
  ok(last(B, 'lobby').track === 'beach', '방장 아닌 사람은 코스 못 바꿈');
  A.send(JSON.stringify({ t: 'start' })); await wait(300);
  const st = last(B, 'start'); ok(st && st.grid.length === 8, '출발 + 봇 채움(8명)');
  const bId = last(B, 'welcome').id;
  // 무한대·NaN·남의 카트·봇 위조
  B.send('{"t":"st","k":[["' + bId + '",1e400,0,0,0,0,0,0,0]]}');
  B.send(JSON.stringify({ t: 'st', k: [[last(A, 'welcome').id, 5, 5, 5, 0, 0, 0, 0, 0], ['b0', 9, 9, 9, 0, 0, 0, 0, 0]] }));
  B.send(JSON.stringify({ t: 'st', k: [[bId, 1, 2, 3, 0, 10, 0, 50, 0]] }));
  await wait(250);
  const ss = last(A, 'ss');
  const mine = ss && ss.k.find(x => x[0] === bId);
  ok(mine && mine[1] === 1 && mine[7] === 50, '정상 위치는 중계');
  ok(ss && !ss.k.find(x => x[0] === 'b0') && !ss.k.find(x => x[0] === last(A, 'welcome').id), '남의 카트·봇 위치 위조 차단');
  B.send(JSON.stringify({ t: 'fin', id: bId })); await wait(200);
  ok(!A.msgs.find(m => m.type === 'fin'), '출발 20초 안 결승 거부');
  B.send(JSON.stringify({ t: 'item', k: 'nuke', by: bId, s: 1, lat: 0 }));
  B.send(JSON.stringify({ t: 'item', k: 'ball', by: 'b1', s: 1, lat: 0 }));
  B.send(JSON.stringify({ t: 'item', k: 'ball', by: bId, s: 1, lat: 0, n: 7 }));
  await wait(200);
  const items = A.msgs.filter(m => m.type === 'item');
  ok(items.length === 1 && items[0].n === 7 && typeof items[0].id === 'number', '아이템: 없는 종류·봇 사칭 차단, 번호 붙임');
  // 레이스 중 끊겼다 다시 들어오기 + 방장이 화면을 끄면 봇 권한 이관
  const wB = last(B, 'welcome');
  ok(typeof wB.token === 'string' && wB.token.length >= 8, '입장 때 재접속 토큰을 준다');
  A.send(JSON.stringify({ t: 'vis', hidden: true })); await wait(300);
  ok(B.msgs.some(m => m.type === 'host' && m.id === wB.id), '방장이 화면을 끄면 다른 사람이 봇을 맡는다');
  B.close(); await wait(300);
  const lobA = last(A, 'lobby'); ok(lobA.players.find(p => p.id === wB.id && p.away), '레이스 중 끊긴 사람은 자리를 지킨다(away)');
  const B2 = await open();
  B2.send(JSON.stringify({ t: 'hello', rejoin: { code, id: wB.id, token: 'wrong' } })); await wait(300);
  ok(B2.msgs.some(m => m.type === 'err' && m.norejoin), '토큰이 틀리면 다시 못 들어온다');
  const B3 = await open();
  B3.send(JSON.stringify({ t: 'hello', rejoin: { code, id: wB.id, token: wB.token } })); await wait(400);
  const w3 = last(B3, 'welcome'), s3 = last(B3, 'start');
  ok(w3 && w3.rejoined && w3.id === wB.id, '같은 자리로 다시 들어온다');
  ok(s3 && Array.isArray(s3.resume) && s3.resume[6] === 50, '레이스 정보와 마지막 위치를 다시 받는다');
  // 도배
  const C = await open(); let closed = false; C.on('close', () => closed = true);
  for (let i = 0; i < 300; i++) C.send('{"t":"ping","c":1}');
  await wait(400); ok(closed, '초당 메시지 도배는 연결 끊음');
  // 봇을 맡던 사람이 끊기면 남은 사람이 넘겨받는다
  A.send(JSON.stringify({ t: 'vis', hidden: false })); await wait(150);
  B3.close(); await wait(400);
  ok(A.msgs.some(m => m.type === 'host' && m.id === last(A, 'welcome').id), '방장이 끊기면 남은 사람이 봇을 맡는다');
  A.close();
  console.log(fail ? `실패 ${fail}` : '모두 통과'); process.exit(fail ? 1 : 0);
})();
