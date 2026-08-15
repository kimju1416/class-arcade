// 회귀 스모크 — 게임 26종이 전부 시작·진행·중단되는지.
// 새 게임을 추가하다 기존 게임을 깨뜨리는 사고를 잡는 게 목적이라 가장 먼저 돌린다.
const H = require('./helpers');

// [키, 표시이름, 시작 옵션]
const GAMES = [
  ['bomb', '폭탄 피하기'], ['tag', '감염 술래잡기'], ['coin', '동전 줍기'],
  ['mos', '모기 잡기'], ['claw', '인형 뽑기'], ['word', '낱말 빨리치기'],
  ['cho', '초성 퀴즈'], ['race', '레이싱'], ['gala', '갤러그'],
  ['dodge', '탄막 피하기'], ['sumo', '스모 밀치기'], ['chair', '의자 뺏기'],
  ['sadari', '사다리 복불복'], ['pirate', '통아저씨', { knives: 2 }],
  ['quiz', '퀴즈쇼', { cat: '역사', count: 5 }], ['ox', 'OX 서바이벌'],
  ['timing', '10초를 잡아라'], ['run', '설원 러너'], ['simon', '사이먼 가라사대'],
  ['chimp', '침팬지 테스트'], ['flash', '순간 포착'], ['pairs', '같은 그림 찾기'],
  ['tetris', '블록 배틀'], ['draw', '그림 퀴즈'],
  ['cray', '물풍선 대작전'], ['kart', '카트 그랑프리'], ['pull', '줄다리기'],
];

module.exports = async function run() {
  const t = H.makeT('전 게임 회귀 스모크');
  const r = await H.makeRoom(3);

  for (const [key, name, opt] of GAMES) {
    H.clearFrames(r.host, ...r.bots);
    H.send(r.host, { type: 'start_game', game: key, opt });
    let started = false;
    try {
      await H.waitPlaying(r.code);
      started = true;
    } catch (e) { /* 아래 단정에서 실패 처리 */ }
    if (!started) { t.ok(false, `${name}(${key}) 시작`); continue; }

    // 상태 브로드캐스트가 호스트·학생 양쪽에 도착하는가 (mode는 게임 키와 같다)
    let hostSt = null, botSt = null;
    try {
      await H.waitFor(() => {
        hostSt = H.lastState(r.host, key);
        botSt = H.lastState(r.bots[0], key);
        return hostSt && botSt;
      }, 4000, `${key} state 수신`);
    } catch {}
    t.ok(!!hostSt && !!botSt, `${name}(${key}) 시작·TV/학생 state 수신`);

    // 몇 틱 굴려서 예외 없이 도는지 확인
    await H.sleep(700);
    H.send(r.host, { type: 'back_to_lobby' });
    try {
      await H.waitRoom(r.code, x => x.state === 'lobby', 5000, `${key} 로비 복귀`);
    } catch { t.ok(false, `${name}(${key}) 중단 후 로비 복귀`); }
  }

  // 전체 진행 중 서버 예외가 하나도 없어야 한다
  const errs = H.serverErrors();
  t.ok(errs.length === 0, `서버 예외 0건${errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''}`);
  // 서버가 아는 게임과 이 목록이 정확히 같아야 한다.
  // 예전엔 GAMES.length === 24 처럼 '자기 목록 개수'만 확인해서, 서버에 게임을 추가해도
  // 스모크가 통과했다 — 실제로 카트·물풍선이 오래 검사 없이 방치됐다.
  const serverSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  const serverKeys = (serverSrc.match(/const GAME_KEYS = \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g) || [])
    .map(x => x.replace(/'/g, ''));
  const listed = GAMES.map(g => g[0]);
  const missing = serverKeys.filter(k => !listed.includes(k));
  const extra = listed.filter(k => !serverKeys.includes(k));
  t.ok(missing.length === 0 && extra.length === 0,
    `스모크가 서버 게임 ${serverKeys.length}종을 모두 덮는다` +
    (missing.length ? ` — 빠짐: ${missing.join(',')}` : '') +
    (extra.length ? ` — 서버에 없음: ${extra.join(',')}` : ''));

  r.close();
  return t;
};
