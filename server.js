// ============================================================
// 교실 아케이드 — 게임 서버
// 역할: ① 웹페이지(public/index.html) 서빙  ② WebSocket으로 방·게임 관리
// 게임: bomb(폭탄 피하기) / tag(감염 술래잡기) / coin(동전 줍기)
//       word(낱말 빨리치기) / cho(초성 퀴즈) / mos(모기 잡기) / claw(인형 뽑기)
// 실행: node server.js  (기본 포트 3000, Render에서는 PORT 환경변수 사용)
// ============================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ---------- 공통 상수 ----------
const TICK_MS = 50;          // 게임 계산 주기: 50ms = 초당 20번
const SPEED = 230;           // 이동 속도 (유닛/초)
const PLAYER_R = 16;
const COUNTDOWN_MS = 3500;
const ROOM_IDLE_MS = 30 * 60 * 1000;

// 폭탄 피하기
const BOMB_WARN_MS = 1000;
const BOMB_BOOM_MS = 350;
const BOMB_ROUND_MS = 90000;
// 감염 술래잡기
const TAG_ROUND_MS = 60000;
const ZOMBIE_SPEED_MULT = 1.08; // 좀비가 살짝 빠름 (게임이 끝나게 하는 장치)
// 동전 줍기
const COIN_ROUND_MS = 60000;
const COIN_BOMB_WARN_MS = 900;   // 폭탄 경고(깜빡임) 시간
const COIN_BOMB_LIVE_MS = 4200;  // 경고 후 폭탄이 놓여 있는 시간
// 모기 잡기
const MOS_ROUND_MS = 60000;
const MOS_SWAT_R = 62;           // 파리채 반경
const MOS_COOLDOWN_MS = 320;     // 헛스윙 연타 방지
// 인형 뽑기
const CLAW_ROUND_MS = 60000;
const CLAW_DROP_MS = 900;        // 집게가 내려갔다 올라오는 시간
const CLAW_GRAB_R = 34;          // 집게가 닿는 반경
// 낱말 빨리치기
const WORD_ROUNDS = 5;
const WORD_TIME_MS = 20000;
const WORD_BREAK_MS = 4000;
const WORD_POINTS = [10, 8, 6, 5, 4, 3, 2]; // 정답 순서별 점수 (이후는 1점)

const BAD_WORDS = ['시발', '씨발', '병신', '개새', '좆', '지랄', 'fuck', 'shit', '섹스'];

// 낱말 빨리치기 제시어 (짧은 것 → 긴 것 순으로 라운드 구성)
const WORDS_SHORT = [
  '훈민정음', '무지개', '고슴도치', '청개구리', '보름달', '도서관', '운동장',
  '떡볶이', '김치볶음밥', '지우개', '방학', '소풍', '짝꿍', '문어발', '솜사탕',
];
const WORDS_LONG = [
  '가는 말이 고와야 오는 말이 곱다', '티끌 모아 태산', '백지장도 맞들면 낫다',
  '소 잃고 외양간 고친다', '원숭이도 나무에서 떨어진다', '돌다리도 두들겨 보고 건너라',
  '우물 안 개구리', '등잔 밑이 어둡다', '말 한마디에 천 냥 빚을 갚는다',
  '호랑이도 제 말 하면 온다', '세 살 버릇 여든까지 간다', '바늘 도둑이 소 도둑 된다',
  '무궁화 꽃이 피었습니다', '구슬이 서 말이라도 꿰어야 보배', '하늘이 무너져도 솟아날 구멍이 있다',
];

// ---------- 초성 퀴즈 데이터 ----------
const CHO_ROUND_MS = 25000;
const CHO_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
// 한글 음절의 초성만 추출 (공백·영문·숫자는 무시)
function choseongOf(s) {
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) out += CHO_LIST[Math.floor((c - 0xAC00) / 588)];
  }
  return out;
}

const CHO_DATA = {
  '음식': [
    '김치','김밥','라면','떡볶이','순대','튀김','만두','짜장면','짬뽕','탕수육','피자','치킨','햄버거','감자튀김','스파게티',
    '돈가스','카레','비빔밥','불고기','삼겹살','갈비','냉면','칼국수','수제비','김치찌개','된장찌개','미역국','떡국','삼계탕',
    '설렁탕','갈비탕','육개장','잡채','파전','김치전','계란말이','계란찜','멸치볶음','소시지','치즈','요구르트','우유','주스',
    '콜라','사이다','아이스크림','팥빙수','케이크','쿠키','초콜릿','사탕','젤리','도넛','붕어빵','호떡','호두과자','군고구마',
    '옥수수','감자','고구마','사과','바나나','딸기','포도','수박','참외','복숭아','자두','오렌지','키위','망고','파인애플',
    '토마토','오이','당근','양파','마늘','배추','상추','깻잎','버섯','두부','콩나물','시금치','브로콜리','파프리카','고추',
    '계란','국수','샌드위치','토스트','시리얼','유부초밥','초밥','어묵','핫도그','솜사탕','슬러시','마카롱','와플','츄러스',
  ],
  '동물': [
    '강아지','고양이','토끼','사자','호랑이','코끼리','기린','얼룩말','하마','코뿔소','원숭이','고릴라','침팬지','판다',
    '북극곰','여우','늑대','사슴','다람쥐','두더지','고슴도치','너구리','수달','멧돼지','돼지','염소','오리','거위','타조',
    '병아리','참새','비둘기','까치','까마귀','제비','독수리','부엉이','올빼미','딱따구리','앵무새','공작','두루미','백조',
    '펭귄','갈매기','물개','돌고래','고래','상어','문어','오징어','낙지','새우','가재','조개','소라','불가사리','해파리',
    '거북이','악어','도마뱀','이구아나','카멜레온','개구리','두꺼비','올챙이','금붕어','잉어','붕어','메기','장어','연어',
    '고등어','갈치','멸치','나비','잠자리','메뚜기','사마귀','무당벌레','개미','거미','달팽이','지렁이','사슴벌레',
    '장수풍뎅이','매미','귀뚜라미','반딧불이','모기','파리','낙타','캥거루','코알라','나무늘보','미어캣','알파카','순록','박쥐',
  ],
  '사물·장소': [
    '지우개','연필','볼펜','색연필','크레파스','공책','스케치북','가방','필통','가위','테이프','책상','의자','칠판','분필',
    '창문','교실','운동장','도서관','급식실','화장실','계단','복도','학교','학원','놀이터','미끄럼틀','그네','시소','철봉',
    '축구공','농구공','야구공','배구공','줄넘기','자전거','킥보드','헬멧','우산','장화','우비','장갑','목도리','모자','안경',
    '시계','달력','거울','칫솔','치약','비누','수건','샴푸','휴지','베개','이불','침대','소파','텔레비전','냉장고','세탁기',
    '청소기','에어컨','선풍기','전자레인지','밥솥','냄비','프라이팬','주전자','접시','숟가락','젓가락','포크','도마','앞치마',
    '휴대폰','컴퓨터','노트북','키보드','마우스','이어폰','헤드폰','충전기','카메라','텀블러','물통','운동화','슬리퍼','양말',
    '티셔츠','바지','치마','원피스','점퍼','조끼','한복','무지개','구름','하늘','바다','계곡','폭포','사막','나무','장미',
    '해바라기','튤립','민들레','벚꽃','단풍','소나무','대나무','눈사람','눈싸움','썰매','스키','얼음','고드름','지구','우주',
    '로켓','비행기','헬리콥터','기차','지하철','버스','택시','트럭','소방차','구급차','경찰차','보트','요트','잠수함','등대',
    '터널','신호등','횡단보도','병원','약국','은행','우체국','경찰서','소방서','시장','마트','편의점','문방구','서점','영화관',
    '박물관','미술관','동물원','식물원','놀이공원','수영장','태권도','피아노','바이올린','기타','드럼','플루트','리코더',
    '탬버린','트라이앵글','캐스터네츠','하모니카','마이크','무궁화','태극기',
  ],
  '영화': [
    '겨울왕국','라이온킹','알라딘','인어공주','토이스토리','인사이드아웃','코코','니모를찾아서','몬스터주식회사','주토피아',
    '모아나','엔칸토','라푼젤','슈렉','쿵푸팬더','마다가스카','미니언즈','슈퍼배드','하울의움직이는성','이웃집토토로',
    '센과치히로의행방불명','마녀배달부키키','벼랑위의포뇨','너의이름은','날씨의아이','스즈메의문단속','극한직업','명량',
    '국제시장','베테랑','부산행','신과함께','택시운전사','왕의남자','광해','관상','암살','도둑들','괴물','웰컴투동막골',
    '미나리','기생충','어벤져스','아이언맨','스파이더맨','배트맨','슈퍼맨','캡틴아메리카','토르','블랙팬서','앤트맨',
    '아쿠아맨','원더우먼','쥬라기공원','타이타닉','아바타','인터스텔라','해리포터','반지의제왕','나니아연대기',
    '찰리와초콜릿공장','나홀로집에','백투더퓨처','킹콩','고질라','트랜스포머','스타워즈','알라딘과요술램프','정글북','덤보',
    '뽀로로','타요','로보카폴리','헬로카봇','또봇','신비아파트','안녕자두야','검정고무신','짱구는못말려',
    '도라에몽','포켓몬스터','디지몬어드벤처','원피스','슬램덩크','드래곤볼','명탐정코난','스파이패밀리',
    '인크레더블','라따뚜이','굿다이노','온워드','루카','메이의새빨간비밀','버즈라이트이어','업그레이드',
    '엘리멘탈','위시','인사이드아웃2','겨울왕국2','토이스토리4','미니언즈2','마당을나온암탉','우리들','아이캔스피크',
  ],
  '노래': [
    '곰세마리','산토끼','나비야','학교종','반달','고향의봄','아기상어','퐁당퐁당','옹달샘','섬집아기','과수원길','노을',
    '루돌프사슴코','징글벨','고요한밤거룩한밤','스승의은혜','어머님은혜','애국가','아리랑','도라지','강강술래',
    '반짝반짝작은별','머리어깨무릎발','그대로멈춰라','꼬부랑할머니','네잎클로버','파란나라','아름다운나라','강남스타일',
    '젠틀맨','벚꽃엔딩','봄날','다이너마이트','버터','아이돌','라일락','밤편지','좋은날','팔레트','넥스트레벨','하입보이',
    '어텐션','디토','사건의지평선','거짓말','하루하루','붉은노을','소원을말해봐','너에게난나에게넌','당신은사랑받기위해태어난사람',
    '작은별','옹헤야','따르릉','우리집에왜왔니','여우야여우야뭐하니','쎄쎄쎄','두꺼비집','기찻길옆오막살이','앞으로',
    '텔레비전','솜사탕','악어떼','상어가족','바나나차차','올챙이송','우리모두다같이','비행기','나비잠','산너머남촌에는',
    '겨울바람','눈꽃송이','흰눈사이로','아빠힘내세요','아기염소','예쁜아기곰','숲속을걸어요','새싹들이다','오빠생각',
    '푸른하늘은하수','작은동물원','새나라의어린이','우리는꿈나무','아름다운강산','바람이불어오는곳','이등병의편지',
  ],
};
// 영화·노래는 "제목"이라 목록에 있는 것만 정답.
// 나머지(음식·동물·사물장소)는 초성만 맞으면 무슨 단어든 정답으로 인정한다.
// (교실에서 TV에 단어가 그대로 뜨므로 이상한 단어는 자연히 걸러진다)
const CHO_FREE_CATS = new Set(['음식', '동물', '사물·장소']);

// 카테고리별 초성 사전: 패턴 → 정답 단어 목록
const CHO_INDEX = {};
for (const [cat, words] of Object.entries(CHO_DATA)) {
  CHO_INDEX[cat] = new Map();
  for (const w of words) {
    const key = choseongOf(w);
    if (key.length < 2) continue;
    if (!CHO_INDEX[cat].has(key)) CHO_INDEX[cat].set(key, []);
    CHO_INDEX[cat].get(key).push(w.replace(/\s+/g, ''));
  }
}

const GAME_KEYS = ['bomb', 'tag', 'coin', 'word', 'cho', 'mos', 'claw'];

// ---------- 정적 파일 서빙 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/debug') { // 운영 확인용: 방·플레이어 현황
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify([...rooms.values()].map(r => ({
      code: r.code, state: r.state, game: r.gameType, players: [...r.players.values()].map(p =>
        ({ nick: p.nick, x: Math.round(p.x), y: Math.round(p.y), alive: p.alive,
           infected: p.infected, score: p.score, connected: p.connected })),
      coins: r.game && r.game.coins ? r.game.coins.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), v: c.v })) : undefined,
      mines: r.game && r.game.mines ? r.game.mines.map(m => ({ x: Math.round(m.x), y: Math.round(m.y), live: Date.now() >= m.liveAt })) : undefined,
      mos: r.game && r.game.mos ? r.game.mos.map(m => ({ x: Math.round(m.x), y: Math.round(m.y), gold: m.gold })) : undefined,
      dolls: r.game && r.game.dolls ? r.game.dolls.map(d => ({ x: Math.round(d.x), y: Math.round(d.y), v: d.v })) : undefined,
      cho: r.gameType === 'cho' && r.game && r.game.pattern
        ? { category: r.game.category, pattern: r.game.pattern, answers: [...r.game.answers], claimed: r.game.claimed.map(c => c.w) }
        : undefined,
    }))));
    return;
  }
  if (url === '/') url = '/index.html';
  const safe = path.normalize(url).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(__dirname, 'public', safe);
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 방 관리 ----------
const rooms = new Map();

function makeCode() {
  for (let i = 0; i < 100; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  return null;
}
function token() { return crypto.randomBytes(12).toString('hex'); }

function cleanNick(raw) {
  let nick = String(raw || '').trim().slice(0, 8);
  if (!nick) nick = '익명';
  for (const w of BAD_WORDS) if (nick.toLowerCase().includes(w)) return '착한어린이';
  return nick;
}

function createRoom() {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code, hostWs: null, hostToken: token(),
    players: new Map(), state: 'lobby', gameType: null,
    nextId: 1, lastActive: Date.now(), game: null, timer: null, phaseEndAt: 0,
  };
  rooms.set(code, room);
  return room;
}

function roomSend(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(room, obj) {
  const msg = JSON.stringify(obj);
  if (room.hostWs && room.hostWs.readyState === 1) room.hostWs.send(msg);
  for (const p of room.players.values())
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
}

function sendRoster(room) {
  broadcast(room, {
    type: 'roster',
    players: [...room.players.values()].map(p => ({
      id: p.id, nick: p.nick, ci: p.ci, connected: p.connected, waiting: p.waiting,
    })),
    state: room.state,
  });
}

// 새로 붙은(또는 다시 붙은) 접속에게 지금 진행 중인 판 상태를 알려준다.
// 이게 없으면 새로고침한 교사 화면이 로비에 머물고, 학생 화면은 남은 시간이 0초로 보인다.
function sendCurrentPhase(room, ws) {
  if (room.state === 'lobby') return;
  roomSend(ws, {
    type: 'phase', state: room.state, gameType: room.gameType,
    endAt: room.phaseEndAt, st: Date.now(),
  });
}

function closeRoom(room, reason) {
  if (room.timer) clearInterval(room.timer);
  broadcast(room, { type: 'room_closed', msg: reason });
  for (const p of room.players.values()) { try { p.ws.close(); } catch {} }
  rooms.delete(room.code);
}

// ---------- 게임 시작 ----------
function startGame(room, type) {
  if (!GAME_KEYS.includes(type)) return;
  const actives = [...room.players.values()].filter(p => p.connected);
  if (actives.length < 1) return;
  const n = actives.length;
  room.gameType = type;

  // 공통 초기화
  for (const p of room.players.values()) {
    p.alive = false; p.waiting = true; p.deadAt = 0;
    p.infected = false; p.infectedAt = 0; p.patientZero = false;
    p.score = 0; p.wordDone = false;
    p.dirX = 0; p.dirY = 0;
    p.lostAmount = 0; p.lostAt = 0;
    p.swatReadyAt = 0; p.swatAt = 0; p.hitAt = 0; p.hitGold = false;
    p.clawState = 'move'; p.clawT = 0; p.clawGot = null; p.clawJudged = false;
    p.gotAt = 0; p.missAt = 0;
  }

  const size = Math.round(Math.min(1100, 460 + n * 35));
  room.game = { arenaW: size, arenaH: size, startedAt: 0, startingCount: n };
  const g = room.game;

  // 참가자 원형 배치 + 참전 처리
  actives.forEach((p, i) => {
    const ang = (i / n) * Math.PI * 2;
    p.x = size / 2 + Math.cos(ang) * size * 0.33;
    p.y = size / 2 + Math.sin(ang) * size * 0.33;
    p.alive = true; p.waiting = false;
  });

  // 게임별 초기화
  if (type === 'bomb') {
    g.bombs = []; g.nextBombId = 1; g.spawnInterval = 1100; g.nextSpawnAt = 0;
    g.roundMs = BOMB_ROUND_MS;
  } else if (type === 'tag') {
    g.roundMs = TAG_ROUND_MS;
    const zombieCount = Math.max(1, Math.floor(n / 8));
    const shuffled = [...actives].sort(() => Math.random() - 0.5);
    shuffled.slice(0, zombieCount).forEach(p => { p.infected = true; p.patientZero = true; });
  } else if (type === 'coin') {
    g.roundMs = COIN_ROUND_MS;
    g.coins = []; g.nextCoinId = 1; g.nextCoinAt = 0; g.coinCap = 12 + n;
    g.mines = []; g.nextMineId = 1; g.nextMineAt = 0; g.mineCap = 3 + Math.round(n / 3);
  } else if (type === 'mos') {
    g.roundMs = MOS_ROUND_MS;
    g.mos = []; g.nextMosId = 1;
    const target = 6 + Math.round(n * 0.8);
    for (let i = 0; i < target; i++) g.mos.push(spawnMosquito(g));
    g.mosTarget = target;
  } else if (type === 'claw') {
    g.roundMs = CLAW_ROUND_MS;
    g.dolls = []; g.nextDollId = 1;
    g.dollCap = 8 + n;
    for (let i = 0; i < g.dollCap; i++) g.dolls.push(spawnDoll(g));
    // 플레이어마다 자기 집게가 위에서 좌우로 왕복한다
    actives.forEach((p, i) => {
      p.clawX = 60 + Math.random() * (g.arenaW - 120);
      p.clawDir = i % 2 ? 1 : -1;
      p.clawSpeed = 240 + Math.random() * 60;
      p.clawState = 'move'; p.clawT = 0; p.clawGot = null;
    });
  } else if (type === 'word') {
    g.roundMs = 0; // 라운드 방식이라 전체 제한시간 없음
    const shorts = [...WORDS_SHORT].sort(() => Math.random() - 0.5);
    const longs = [...WORDS_LONG].sort(() => Math.random() - 0.5);
    g.words = [...shorts.slice(0, 2), ...longs.slice(0, WORD_ROUNDS - 2)];
    g.round = 0; g.wordPhase = 'idle'; g.correctOrder = [];
  } else if (type === 'cho') {
    g.roundMs = 0;
    g.round = 0; g.wordPhase = 'idle'; g.correctOrder = [];
    g.usedPatterns = new Set(); g.claimed = [];
  }

  room.state = 'countdown';
  room.phaseEndAt = Date.now() + COUNTDOWN_MS;
  broadcast(room, { type: 'phase', state: 'countdown', gameType: type, endAt: room.phaseEndAt, st: Date.now() });
  sendRoster(room);

  if (room.timer) clearInterval(room.timer);
  room.timer = setInterval(() => tick(room), TICK_MS);
}

// ---------- 틱 ----------
function tick(room) {
  const now = Date.now();
  const g = room.game;
  if (!g) return;

  if (room.state === 'countdown') {
    if (now >= room.phaseEndAt) {
      room.state = 'playing';
      g.startedAt = now;
      room.phaseEndAt = g.roundMs ? now + g.roundMs : 0;
      if (room.gameType === 'bomb') g.nextSpawnAt = now + 2500;
      if (room.gameType === 'coin') { g.nextCoinAt = now + 500; g.nextMineAt = now + 6000; }
      if (room.gameType === 'word') startWordRound(room, now);
      if (room.gameType === 'cho') startChoRound(room, now);
      broadcast(room, { type: 'phase', state: 'playing', gameType: room.gameType, endAt: room.phaseEndAt, st: now });
    }
    sendState(room, now);
    return;
  }
  if (room.state !== 'playing') return;

  const dt = TICK_MS / 1000;
  if (room.gameType === 'bomb') bombTick(room, now, dt);
  else if (room.gameType === 'tag') tagTick(room, now, dt);
  else if (room.gameType === 'coin') coinTick(room, now, dt);
  else if (room.gameType === 'mos') mosTick(room, now, dt);
  else if (room.gameType === 'claw') clawTick(room, now, dt);
  else if (room.gameType === 'word') wordTick(room, now);
  else if (room.gameType === 'cho') choTick(room, now);
}

function movePlayers(room, dt, speedOf) {
  const g = room.game;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const sp = speedOf ? speedOf(p) : SPEED;
    p.x = Math.max(PLAYER_R, Math.min(g.arenaW - PLAYER_R, p.x + p.dirX * sp * dt));
    p.y = Math.max(PLAYER_R, Math.min(g.arenaH - PLAYER_R, p.y + p.dirY * sp * dt));
  }
}

// ---------- 폭탄 피하기 ----------
function bombTick(room, now, dt) {
  const g = room.game;
  const W = g.arenaW, H = g.arenaH;
  movePlayers(room, dt);

  const elapsed = now - g.startedAt;
  if (now >= g.nextSpawnAt) {
    const waves = 1 + Math.floor(elapsed / 15000) + Math.max(0, Math.round(g.startingCount / 8));
    const alivePs = [...room.players.values()].filter(p => p.alive);
    for (let i = 0; i < waves; i++) {
      let bx = 0, by = 0;
      for (let tryN = 0; tryN < 8; tryN++) {
        bx = PLAYER_R + Math.random() * (W - PLAYER_R * 2);
        by = PLAYER_R + Math.random() * (H - PLAYER_R * 2);
        if (elapsed > 8000) break;
        if (!alivePs.some(p => Math.hypot(p.x - bx, p.y - by) < 150)) break;
      }
      g.bombs.push({
        id: g.nextBombId++, x: bx, y: by, r: 55 + Math.random() * 45,
        explodeAt: now + BOMB_WARN_MS, endAt: now + BOMB_WARN_MS + BOMB_BOOM_MS,
      });
    }
    g.spawnInterval = Math.max(320, g.spawnInterval * 0.97);
    g.nextSpawnAt = now + g.spawnInterval;
  }

  for (const b of g.bombs) {
    if (now < b.explodeAt || now > b.endAt) continue;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - b.x, dy = p.y - b.y;
      if (dx * dx + dy * dy <= (b.r + PLAYER_R) * (b.r + PLAYER_R)) { p.alive = false; p.deadAt = now; }
    }
  }
  g.bombs = g.bombs.filter(b => now <= b.endAt);

  const alive = [...room.players.values()].filter(p => p.alive);
  if (now >= room.phaseEndAt || (g.startingCount >= 2 && alive.length <= 1) || alive.length === 0) {
    endBomb(room, now); return;
  }
  sendState(room, now);
}

function endBomb(room, now) {
  const g = room.game;
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return (b.deadAt || 0) - (a.deadAt || 0);
  });
  finishGame(room, sorted, p => {
    const ms = (p.alive ? now - g.startedAt : p.deadAt - g.startedAt) || 0;
    return (ms / 1000).toFixed(1) + '초 생존';
  }, p => p.alive ? 'alive' : String(p.deadAt));
}

// ---------- 감염 술래잡기 ----------
function tagTick(room, now, dt) {
  const g = room.game;
  movePlayers(room, dt, p => p.infected ? SPEED * ZOMBIE_SPEED_MULT : SPEED);

  // 감염 판정: 좀비와 닿으면 감염
  const ps = [...room.players.values()].filter(p => p.alive);
  const zombies = ps.filter(p => p.infected);
  const humans = ps.filter(p => !p.infected);
  for (const z of zombies) {
    for (const h of humans) {
      if (h.infected) continue;
      const dx = z.x - h.x, dy = z.y - h.y;
      if (dx * dx + dy * dy <= (PLAYER_R * 2) * (PLAYER_R * 2)) { h.infected = true; h.infectedAt = now; }
    }
  }

  const remaining = ps.filter(p => !p.infected).length;
  if (now >= room.phaseEndAt || remaining === 0) { endTag(room, now); return; }
  sendState(room, now);
}

function endTag(room, now) {
  const g = room.game;
  const parts = [...room.players.values()].filter(p => !p.waiting);
  // 순위: 생존자 공동 1위 → 늦게 감염된 순 → 술래(처음 좀비)는 순위 밖 표시
  const sorted = parts.sort((a, b) => {
    const av = a.patientZero ? -1 : (a.infected ? a.infectedAt - now : 1); // 클수록 위
    const bv = b.patientZero ? -1 : (b.infected ? b.infectedAt - now : 1);
    return bv - av;
  });
  finishGame(room, sorted, p => {
    if (p.patientZero) return '🧟 술래';
    if (!p.infected) return '끝까지 생존!';
    return ((p.infectedAt - g.startedAt) / 1000).toFixed(1) + '초 버팀';
  }, p => p.patientZero ? 'zero' : (p.infected ? String(p.infectedAt) : 'alive'));
}

// ---------- 동전 줍기 ----------
function coinTick(room, now, dt) {
  const g = room.game;
  movePlayers(room, dt);

  if (now >= g.nextCoinAt && g.coins.length < g.coinCap) {
    const gold = Math.random() < 0.12;
    g.coins.push({
      id: g.nextCoinId++,
      x: 30 + Math.random() * (g.arenaW - 60),
      y: 30 + Math.random() * (g.arenaH - 60),
      v: gold ? 3 : 1,
    });
    g.nextCoinAt = now + 450;
  }

  // 폭탄 생성 (잠깐 경고 후 활성 → 밟으면 점수 전부 0)
  if (now >= g.nextMineAt && g.mines.length < g.mineCap) {
    g.mines.push({
      id: g.nextMineId++,
      x: 40 + Math.random() * (g.arenaW - 80),
      y: 40 + Math.random() * (g.arenaH - 80),
      liveAt: now + COIN_BOMB_WARN_MS,
      endAt: now + COIN_BOMB_WARN_MS + COIN_BOMB_LIVE_MS,
    });
    g.nextMineAt = now + Math.max(900, 2600 - (now - g.startedAt) / 40);
  }

  // 줍기 판정
  for (const c of g.coins) {
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy <= (PLAYER_R + 13) * (PLAYER_R + 13)) { p.score += c.v; c.taken = true; break; }
    }
  }
  g.coins = g.coins.filter(c => !c.taken);

  // 폭탄 판정: 활성 상태에서 닿으면 그 사람 점수 0
  for (const m of g.mines) {
    if (now < m.liveAt || m.taken) continue;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - m.x, dy = p.y - m.y;
      if (dx * dx + dy * dy <= (PLAYER_R + 16) * (PLAYER_R + 16)) {
        p.lostAt = now; p.lostAmount = p.score;
        p.score = 0; m.taken = true;
        break;
      }
    }
  }
  g.mines = g.mines.filter(m => !m.taken && now <= m.endAt);

  if (now >= room.phaseEndAt) { endCoin(room); return; }
  sendState(room, now);
}

function endCoin(room) {
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => b.score - a.score);
  finishGame(room, sorted, p => p.score + '원' + (p.lostAmount ? ` (💥 ${p.lostAmount}원 날림)` : ''), p => String(p.score));
}

// ---------- 모기 잡기 ----------
function spawnMosquito(g) {
  const gold = Math.random() < 0.14;
  const ang = Math.random() * Math.PI * 2;
  const sp = (gold ? 210 : 130) + Math.random() * 80;
  return {
    id: g.nextMosId++,
    x: 40 + Math.random() * (g.arenaW - 80),
    y: 40 + Math.random() * (g.arenaH - 80),
    vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    gold, turnAt: 0,
  };
}

function mosTick(room, now, dt) {
  const g = room.game;
  // 모기는 제멋대로 방향을 꺾으며 날아다닌다
  for (const m of g.mos) {
    if (now >= m.turnAt) {
      const ang = Math.atan2(m.vy, m.vx) + (Math.random() - 0.5) * 1.9;
      const sp = Math.hypot(m.vx, m.vy);
      m.vx = Math.cos(ang) * sp; m.vy = Math.sin(ang) * sp;
      m.turnAt = now + 300 + Math.random() * 500;
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.x < 20 || m.x > g.arenaW - 20) { m.vx *= -1; m.x = Math.max(20, Math.min(g.arenaW - 20, m.x)); }
    if (m.y < 20 || m.y > g.arenaH - 20) { m.vy *= -1; m.y = Math.max(20, Math.min(g.arenaH - 20, m.y)); }
  }
  // 잡힌 만큼 다시 채운다
  while (g.mos.length < g.mosTarget) g.mos.push(spawnMosquito(g));

  if (now >= room.phaseEndAt) {
    const parts = [...room.players.values()].filter(p => !p.waiting);
    finishGame(room, parts.sort((a, b) => b.score - a.score), p => p.score + '마리', p => String(p.score));
    return;
  }
  sendState(room, now);
}

// 학생이 화면을 탭했을 때: 파리채 반경 안의 가장 가까운 모기 1마리를 잡는다
function mosSwat(room, p, x, y, now) {
  const g = room.game;
  if (!g || room.gameType !== 'mos' || room.state !== 'playing') return;
  if (now < (p.swatReadyAt || 0)) return;
  p.swatReadyAt = now + MOS_COOLDOWN_MS;
  p.swatX = x; p.swatY = y; p.swatAt = now;

  let best = null, bd = MOS_SWAT_R * MOS_SWAT_R;
  for (const m of g.mos) {
    const d = (m.x - x) * (m.x - x) + (m.y - y) * (m.y - y);
    if (d <= bd) { bd = d; best = m; }
  }
  if (best) {
    p.score += best.gold ? 3 : 1;
    p.hitAt = now; p.hitGold = best.gold;
    g.mos = g.mos.filter(m => m !== best);
  }
}

// ---------- 인형 뽑기 ----------
function spawnDoll(g) {
  const r = Math.random();
  const v = r < 0.08 ? 5 : (r < 0.3 ? 3 : 1); // 5점(대형)·3점(중형)·1점(소형)
  return {
    id: g.nextDollId++,
    x: 40 + Math.random() * (g.arenaW - 80),
    y: g.arenaH * 0.55 + Math.random() * (g.arenaH * 0.3), // 아래쪽 인형 웅덩이
    v,
  };
}

function clawTick(room, now, dt) {
  const g = room.game;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    if (p.clawState === 'move') {
      p.clawX += p.clawDir * p.clawSpeed * dt;
      if (p.clawX < 30) { p.clawX = 30; p.clawDir = 1; }
      if (p.clawX > g.arenaW - 30) { p.clawX = g.arenaW - 30; p.clawDir = -1; }
    } else if (p.clawState === 'drop') {
      p.clawT += dt * 1000;
      // 내려가는 중간(절반)에 집기 판정
      if (!p.clawJudged && p.clawT >= CLAW_DROP_MS / 2) {
        p.clawJudged = true;
        // 집게는 세로로 쭉 내려가므로 가로 위치(x)만 맞으면 집는다
        let best = null, bd = CLAW_GRAB_R * CLAW_GRAB_R;
        for (const d of g.dolls) {
          const dist = (d.x - p.clawX) * (d.x - p.clawX);
          if (dist <= bd) { bd = dist; best = d; }
        }
        if (best) {
          p.score += best.v; p.clawGot = best.v; p.gotAt = now;
          g.dolls = g.dolls.filter(d => d !== best);
          g.dolls.push(spawnDoll(g));
        } else { p.clawGot = 0; p.missAt = now; }
      }
      if (p.clawT >= CLAW_DROP_MS) {
        p.clawState = 'move'; p.clawT = 0; p.clawJudged = false;
        p.clawSpeed = Math.min(430, p.clawSpeed + 12); // 갈수록 빨라져 어려워진다
      }
    }
  }

  if (now >= room.phaseEndAt) {
    const parts = [...room.players.values()].filter(p => !p.waiting);
    finishGame(room, parts.sort((a, b) => b.score - a.score), p => p.score + '점', p => String(p.score));
    return;
  }
  sendState(room, now);
}

function clawDrop(room, p) {
  if (room.gameType !== 'claw' || room.state !== 'playing') return;
  if (!p.alive || p.clawState !== 'move') return;
  p.clawState = 'drop'; p.clawT = 0; p.clawJudged = false; p.clawGot = null;
}

// ---------- 낱말 빨리치기 ----------
function startWordRound(room, now) {
  const g = room.game;
  g.round++;
  g.word = g.words[g.round - 1];
  g.wordPhase = 'show';
  g.roundEndAt = now + WORD_TIME_MS;
  g.correctOrder = [];
  for (const p of room.players.values()) p.wordDone = false;
}

function wordTick(room, now) {
  const g = room.game;
  const actives = [...room.players.values()].filter(p => p.alive && p.connected);

  if (g.wordPhase === 'show') {
    const allDone = actives.length > 0 && actives.every(p => p.wordDone);
    if (now >= g.roundEndAt || allDone) {
      g.wordPhase = 'break';
      g.breakEndAt = now + WORD_BREAK_MS;
    }
  } else if (g.wordPhase === 'break') {
    if (now >= g.breakEndAt) {
      if (g.round >= WORD_ROUNDS) { endWord(room); return; }
      startWordRound(room, now);
    }
  }
  sendState(room, now);
}

function normalizeWord(s) {
  return String(s || '').normalize('NFC').replace(/\s+/g, '').trim();
}

function endWord(room) {
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => b.score - a.score);
  finishGame(room, sorted, p => p.score + '점', p => String(p.score));
}

// ---------- 초성 퀴즈 ----------
function startChoRound(room, now) {
  const g = room.game;
  g.round++;
  // 1~4라운드: 자유 카테고리(음식·동물·사물장소)의 짧은 초성 → 아무 단어나 떠올려 쓰는 재미
  // 5라운드: 영화·노래 제목 (목록 대조, 마무리 보너스 라운드)
  const freeCats = Object.keys(CHO_INDEX).filter(c => CHO_FREE_CATS.has(c));
  const titleCats = Object.keys(CHO_INDEX).filter(c => !CHO_FREE_CATS.has(c));
  const useTitle = g.round >= WORD_ROUNDS && titleCats.length > 0;
  const pool = useTitle ? titleCats : (freeCats.length ? freeCats : Object.keys(CHO_INDEX));

  for (let tryN = 0; tryN < 120; tryN++) {
    const cat = pool[Math.floor(Math.random() * pool.length)];
    const patterns = [...CHO_INDEX[cat].keys()];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    if (g.usedPatterns.has(cat + ':' + pattern)) continue;
    const answers = CHO_INDEX[cat].get(pattern);
    // 자유 카테고리는 2~3글자 초성이라야 떠올릴 단어가 많다
    if (!useTitle && tryN < 90 && (pattern.length < 2 || pattern.length > 3)) continue;
    // 제목 카테고리는 정답이 여러 개인 쪽이 눈치싸움이 된다
    if (useTitle && tryN < 60 && answers.length < 2) continue;
    g.usedPatterns.add(cat + ':' + pattern);
    g.category = cat; g.pattern = pattern;
    g.answers = new Set(answers);
    break;
  }
  g.wordPhase = 'show';
  g.roundEndAt = now + CHO_ROUND_MS;
  g.correctOrder = []; g.claimed = [];
  for (const p of room.players.values()) p.wordDone = false;
}

function choTick(room, now) {
  const g = room.game;
  const actives = [...room.players.values()].filter(p => p.alive && p.connected);
  if (g.wordPhase === 'show') {
    const allDone = actives.length > 0 && actives.every(p => p.wordDone);
    // 목록 대조 카테고리(영화·노래)에서 정답이 다 나왔으면 더 기다릴 필요 없음
    const exhausted = !CHO_FREE_CATS.has(g.category) && g.claimed.length >= g.answers.size;
    if (now >= g.roundEndAt || allDone || exhausted) {
      g.wordPhase = 'break';
      g.breakEndAt = now + WORD_BREAK_MS;
    }
  } else if (g.wordPhase === 'break') {
    if (now >= g.breakEndAt) {
      if (g.round >= WORD_ROUNDS) { endWord(room); return; }
      startChoRound(room, now);
    }
  }
  sendState(room, now);
}

// ---------- 공통 종료·상태 ----------
function finishGame(room, sorted, labelOf, keyOf) {
  clearInterval(room.timer); room.timer = null;
  room.state = 'result';
  let rank = 0, prevKey = null;
  const ranking = sorted.map((p, i) => {
    const key = keyOf(p);
    if (key !== prevKey) { rank = i + 1; prevKey = key; }
    return { id: p.id, nick: p.nick, ci: p.ci, rank, label: labelOf(p) };
  });
  broadcast(room, { type: 'result', gameType: room.gameType, ranking });
  sendRoster(room);
}

function sendState(room, now) {
  const g = room.game;
  const type = room.gameType;
  if (type === 'word' || type === 'cho') {
    broadcast(room, {
      type: 'state', mode: type, st: now,
      round: g.round, totalRounds: WORD_ROUNDS,
      word: g.wordPhase === 'show' ? (type === 'cho' ? g.pattern : g.word) : null,
      category: type === 'cho' ? g.category : undefined,
      claimed: type === 'cho' && g.claimed ? g.claimed.map(c => [c.w, c.id]) : undefined,
      answerCount: type === 'cho' && g.answers ? g.answers.size : 0,
      freeMode: type === 'cho' ? CHO_FREE_CATS.has(g.category) : undefined,
      wordPhase: g.wordPhase || 'idle',
      timeLeft: g.wordPhase === 'show' ? Math.max(0, g.roundEndAt - now) : 0,
      roundTotal: type === 'cho' ? CHO_ROUND_MS : WORD_TIME_MS,
      scores: [...room.players.values()].filter(p => !p.waiting).map(p => {
        const ord = g.correctOrder.indexOf(p.id);
        return [p.id, p.score, p.wordDone ? ord + 1 : 0];
      }),
    });
    return;
  }
  const msg = {
    type: 'state', mode: type, st: now,
    arena: { w: g.arenaW, h: g.arenaH },
    timeLeft: room.state === 'playing' && room.phaseEndAt ? Math.max(0, room.phaseEndAt - now) : (g.roundMs || 0),
    players: [...room.players.values()].map(p => {
      const extra = type === 'tag' ? (p.infected ? 1 : 0)
        : (type === 'coin' || type === 'mos' || type === 'claw') ? p.score : 0;
      const row = [p.id, Math.round(p.x), Math.round(p.y), p.alive ? 1 : 0, p.waiting ? 1 : 0, extra];
      // 폭탄 밟은 직후 1초간 "0원!" 연출
      if (type === 'coin') row.push(now - (p.lostAt || 0) < 1000 ? 1 : 0);
      // 파리채 위치·최근 명중 표시
      if (type === 'mos') {
        row.push(now - (p.swatAt || 0) < 260 ? 1 : 0,
                 Math.round(p.swatX || 0), Math.round(p.swatY || 0),
                 now - (p.hitAt || 0) < 500 ? (p.hitGold ? 2 : 1) : 0);
      }
      // 집게 위치·상태
      if (type === 'claw') {
        row.push(Math.round(p.clawX || 0),
                 p.clawState === 'drop' ? Math.round(Math.min(1, p.clawT / CLAW_DROP_MS) * 100) : 0,
                 now - (p.gotAt || 0) < 700 ? (p.clawGot || 0) : 0,
                 now - (p.missAt || 0) < 500 ? 1 : 0);
      }
      return row;
    }),
  };
  if (type === 'bomb') msg.bombs = g.bombs.map(b => {
    const boom = now >= b.explodeAt;
    const prog = boom ? (now - b.explodeAt) / BOMB_BOOM_MS
      : (now - (b.explodeAt - BOMB_WARN_MS)) / BOMB_WARN_MS;
    return [Math.round(b.x), Math.round(b.y), Math.round(b.r), boom ? 1 : 0, Math.round(prog * 100)];
  });
  if (type === 'coin') {
    msg.coins = g.coins.map(c => [Math.round(c.x), Math.round(c.y), c.v]);
    msg.mines = g.mines.map(m => [Math.round(m.x), Math.round(m.y), now >= m.liveAt ? 1 : 0]);
  }
  if (type === 'mos') msg.mos = g.mos.map(m => [Math.round(m.x), Math.round(m.y), m.gold ? 1 : 0]);
  if (type === 'claw') msg.dolls = g.dolls.map(d => [Math.round(d.x), Math.round(d.y), d.v]);
  broadcast(room, msg);
}

function backToLobby(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  room.state = 'lobby'; room.game = null; room.gameType = null;
  for (const p of room.players.values()) { p.alive = false; p.waiting = false; }
  broadcast(room, { type: 'phase', state: 'lobby', st: Date.now() });
  sendRoster(room);
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.roomCode = null; ws.playerId = null; ws.isHost = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
    if (room) room.lastActive = Date.now();

    switch (msg.type) {
      case 'ping':
        roomSend(ws, { type: 'pong', ct: msg.ct, st: Date.now() });
        break;

      case 'create_room': {
        const r = createRoom();
        if (!r) { roomSend(ws, { type: 'error', msg: '방을 만들 수 없습니다. 잠시 후 다시 시도하세요.' }); return; }
        r.hostWs = ws; ws.roomCode = r.code; ws.isHost = true;
        roomSend(ws, { type: 'room_created', code: r.code, hostToken: r.hostToken });
        sendRoster(r);
        break;
      }

      case 'rejoin_host': {
        const r = rooms.get(String(msg.code));
        if (!r || r.hostToken !== msg.hostToken) { roomSend(ws, { type: 'host_rejoin_fail' }); return; }
        r.hostWs = ws; ws.roomCode = r.code; ws.isHost = true;
        roomSend(ws, { type: 'room_created', code: r.code, hostToken: r.hostToken });
        sendRoster(r);
        sendCurrentPhase(r, ws); // 게임 중이었다면 TV를 게임 화면으로 되돌린다
        break;
      }

      case 'join': {
        const r = rooms.get(String(msg.code));
        if (!r) { roomSend(ws, { type: 'error', msg: '방이 없습니다. 코드를 확인하세요.' }); return; }

        if (msg.token) {
          const old = [...r.players.values()].find(p => p.token === msg.token);
          if (old) {
            old.ws = ws; old.connected = true;
            ws.roomCode = r.code; ws.playerId = old.id;
            roomSend(ws, { type: 'join_ok', id: old.id, token: old.token, code: r.code, nick: old.nick, ci: old.ci, state: r.state, gameType: r.gameType });
            sendRoster(r);
            sendCurrentPhase(r, ws); // 남은 시간·화면을 진행 중인 판에 맞춘다
            return;
          }
        }

        if (r.players.size >= 40) { roomSend(ws, { type: 'error', msg: '방이 가득 찼습니다. (최대 40명)' }); return; }
        let nick = cleanNick(msg.nick);
        const names = new Set([...r.players.values()].map(p => p.nick));
        if (names.has(nick)) { let i = 2; while (names.has(nick + i)) i++; nick = nick + i; }

        const p = {
          id: r.nextId++, nick, token: token(), ws,
          ci: (r.nextId - 2) % 30,
          x: 0, y: 0, dirX: 0, dirY: 0,
          alive: false, deadAt: 0,
          infected: false, infectedAt: 0, patientZero: false,
          score: 0, wordDone: false,
          waiting: r.state !== 'lobby',
          connected: true,
        };
        r.players.set(p.id, p);
        ws.roomCode = r.code; ws.playerId = p.id;
        roomSend(ws, { type: 'join_ok', id: p.id, token: p.token, code: r.code, nick: p.nick, ci: p.ci, state: r.state, gameType: r.gameType });
        sendRoster(r);
        sendCurrentPhase(r, ws);
        break;
      }

      case 'input': {
        if (!room || ws.playerId == null) return;
        const p = room.players.get(ws.playerId);
        if (!p) return;
        let x = Number(msg.x) || 0, y = Number(msg.y) || 0;
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        p.dirX = x; p.dirY = y;
        break;
      }

      // 모기 잡기: 학생이 아레나를 탭한 좌표
      case 'swat': {
        if (!room || ws.playerId == null) return;
        const p = room.players.get(ws.playerId);
        if (!p || !room.game) return;
        const x = Math.max(0, Math.min(room.game.arenaW, Number(msg.x) || 0));
        const y = Math.max(0, Math.min(room.game.arenaH, Number(msg.y) || 0));
        mosSwat(room, p, x, y, Date.now());
        break;
      }

      // 인형 뽑기: 액션 버튼(집게 내리기)
      case 'action': {
        if (!room || ws.playerId == null) return;
        const p = room.players.get(ws.playerId);
        if (!p) return;
        if (room.gameType === 'claw') clawDrop(room, p);
        break;
      }

      case 'word_submit': {
        if (!room || ws.playerId == null || room.state !== 'playing') return;
        const g = room.game;
        const p = room.players.get(ws.playerId);
        if (!p || !p.alive || p.wordDone || g.wordPhase !== 'show') return;

        if (room.gameType === 'word') {
          if (normalizeWord(msg.text) === normalizeWord(g.word)) {
            p.wordDone = true;
            g.correctOrder.push(p.id);
            const idx = g.correctOrder.length - 1;
            const pts = WORD_POINTS[idx] != null ? WORD_POINTS[idx] : 1;
            p.score += pts;
            roomSend(ws, { type: 'word_ok', order: idx + 1, points: pts });
          } else {
            roomSend(ws, { type: 'word_bad', reason: 'wrong' });
          }
        } else if (room.gameType === 'cho') {
          const norm = normalizeWord(msg.text);
          if (!norm) return;
          const free = CHO_FREE_CATS.has(g.category); // 자유 카테고리: 초성만 맞으면 정답
          if (choseongOf(norm) !== g.pattern) {
            roomSend(ws, { type: 'word_bad', reason: 'cho' });
          } else if (!free && !g.answers.has(norm)) {
            roomSend(ws, { type: 'word_bad', reason: 'list' });
          } else if (g.claimed.some(c => c.w === norm)) {
            roomSend(ws, { type: 'word_bad', reason: 'dup' });
          } else {
            p.wordDone = true;
            g.claimed.push({ w: norm, id: p.id });
            g.correctOrder.push(p.id);
            const idx = g.correctOrder.length - 1;
            const pts = WORD_POINTS[idx] != null ? WORD_POINTS[idx] : 1;
            p.score += pts;
            roomSend(ws, { type: 'word_ok', order: idx + 1, points: pts, word: norm });
          }
        }
        break;
      }

      case 'start_game':
        if (room && ws.isHost && (room.state === 'lobby' || room.state === 'result'))
          startGame(room, String(msg.game || 'bomb'));
        break;

      case 'back_to_lobby':
        if (room && ws.isHost) backToLobby(room);
        break;

      case 'close_room':
        if (room && ws.isHost) closeRoom(room, '선생님이 방을 닫았습니다.');
        break;

      case 'leave': {
        if (!room || ws.playerId == null) return;
        room.players.delete(ws.playerId);
        ws.playerId = null; ws.roomCode = null;
        sendRoster(room);
        break;
      }

      case 'kick': {
        if (!room || !ws.isHost) return;
        const p = room.players.get(msg.playerId);
        if (p) {
          roomSend(p.ws, { type: 'kicked' });
          try { p.ws.close(); } catch {}
          room.players.delete(p.id);
          sendRoster(room);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null;
    if (!room) return;
    if (ws.isHost && room.hostWs === ws) { room.hostWs = null; return; }
    if (ws.playerId != null) {
      const p = room.players.get(ws.playerId);
      if (p && p.ws === ws) {
        p.connected = false; p.dirX = 0; p.dirY = 0;
        if (room.state === 'lobby') room.players.delete(p.id);
        sendRoster(room);
      }
    }
  });
});

// ---------- 방 청소 ----------
setInterval(() => {
  const now = Date.now();
  for (const [, room] of rooms) {
    if (now - room.lastActive > ROOM_IDLE_MS) closeRoom(room, '오래 사용하지 않아 방이 종료되었습니다.');
  }
}, 60 * 1000);

server.listen(PORT, () => console.log(`교실 아케이드 서버 실행 중 → http://localhost:${PORT}`));
