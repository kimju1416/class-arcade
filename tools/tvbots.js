// 교사 TV 화면 점검용 학생 봇 — 실제 방에 붙어 계속 움직인다.
//
// 사용: node tools/tvbots.js <방코드> [인원]      (기본 6명, 서버는 localhost:3000)
// TV 화면은 «6명으로는 멀쩡하고 25명에서 무너지는» 결함이 많다 — 명단이 잘리거나
// 판이 세로로 쌓이는 것들. 화면을 손볼 때는 25명으로 붙여 두고 확인할 것.
//
// 주의: 방을 먼저 만들고(교사 TV에서) 그 코드로 붙인다. 봇을 죽여도 서버는 잠시
// 자리를 붙들고 있어서(재접속 대기), 바로 다시 붙이면 «방이 가득 찼습니다»가 난다.
// 그럴 땐 서버를 다시 띄우고 새 방을 만드는 게 빠르다.
const WS = require('ws');

const CODE = process.argv[2];
const N = +(process.argv[3] || 6);
const URL = 'ws://127.0.0.1:3000';
const NAMES = ['서준','하윤','도윤','지우','시우','수아','예준','지호','유나','민서','건우','서연','현우','채원','우진','다은','준호','예린','정우','소율','태윤','하린','승우','나윤','재원','시윤','유진','민준','아윤','성민'];

if (!CODE) { console.error('방 코드를 주세요'); process.exit(1); }

const bots = [];
let mode = '', phase = '';

function mk(i) {
  const ws = new WS(URL);
  ws.i = i;
  ws.on('error', () => {});
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'join', code: CODE, nick: NAMES[i % NAMES.length] }));
  });
  ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.type === 'join_ok') {
      ws.pid = m.id;
      // 캐릭터를 서로 다르게 골라 TV에서 구분이 되게
      ws.send(JSON.stringify({ type: 'set_char', ci: i % 30 }));
    }
    if (m.type === 'phase') { phase = m.state; mode = m.gameType || mode; }
    if (m.type === 'state') { mode = m.mode || mode; }
  });
  return ws;
}

for (let i = 0; i < N; i++) bots.push(mk(i));

// 게임마다 조작 방식이 달라서, 모든 입력을 골고루 흘려 보낸다.
// (서버가 안 쓰는 입력은 무시하므로 안전하다)
// 25명이 매 틱마다 여러 종류를 보내면 서버 도배 방어(rate limit)에 걸려 통째로 끊긴다.
// 실제로 겪었다 — 한 틱에 한 봇당 «한 종류»만 보내고 주기도 넉넉히 둔다.
let t = 0;
setInterval(() => {
  t++;
  for (const ws of bots) {
    if (ws.readyState !== 1) continue;
    const i = ws.i;
    const slot = (t + i) % 6;
    if (slot === 0) {                       // 조이스틱: 봇마다 다른 원을 그리며 돈다
      const a = (t / 6) + i * 1.1;
      ws.send(JSON.stringify({ type: 'input', x: Math.cos(a), y: Math.sin(a) }));
    } else if (slot === 1) {
      ws.send(JSON.stringify({ type: 'pick', v: (t + i) % 8 }));
    } else if (slot === 2) {
      ws.send(JSON.stringify({ type: 'tap', x: 300 + (i * 71) % 500, y: 250 + (i * 53) % 400 }));
    } else if (slot === 3) {
      ws.send(JSON.stringify({ type: 'action' }));
    } else if (slot === 4) {
      ws.send(JSON.stringify({ type: 'answer', a: (t + i) % 4 }));
    } else if (t % 24 === i % 24) {
      ws.send(JSON.stringify({ type: 'word_submit', w: ['사과', '바나나', '나비', '가방', '고래'][i % 5] }));
    }
  }
}, 300);

console.log(`봇 ${N}명이 방 ${CODE}에 붙었습니다`);
process.on('SIGTERM', () => { bots.forEach(b => { try { b.close(); } catch {} }); process.exit(0); });
