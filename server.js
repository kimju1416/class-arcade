// ============================================================
// 교실 아케이드 — 게임 서버
// 역할: ① 웹페이지(public/index.html) 서빙  ② WebSocket으로 방·게임 관리
// 게임: bomb(폭탄 피하기) / tag(감염 술래잡기) / coin(동전 줍기) / word(낱말 빨리치기)
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
  ],
  '노래': [
    '곰세마리','산토끼','나비야','학교종','반달','고향의봄','아기상어','퐁당퐁당','옹달샘','섬집아기','과수원길','노을',
    '루돌프사슴코','징글벨','고요한밤거룩한밤','스승의은혜','어머님은혜','애국가','아리랑','도라지','강강술래',
    '반짝반짝작은별','머리어깨무릎발','그대로멈춰라','꼬부랑할머니','네잎클로버','파란나라','아름다운나라','강남스타일',
    '젠틀맨','벚꽃엔딩','봄날','다이너마이트','버터','아이돌','라일락','밤편지','좋은날','팔레트','넥스트레벨','하입보이',
    '어텐션','디토','사건의지평선','거짓말','하루하루','붉은노을','소원을말해봐','너에게난나에게넌','당신은사랑받기위해태어난사람',
  ],
};
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

const GAME_KEYS = ['bomb', 'tag', 'coin', 'word', 'cho'];

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
      if (room.gameType === 'coin') g.nextCoinAt = now + 500;
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

  // 줍기 판정
  for (const c of g.coins) {
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy <= (PLAYER_R + 13) * (PLAYER_R + 13)) { p.score += c.v; c.taken = true; break; }
    }
  }
  g.coins = g.coins.filter(c => !c.taken);

  if (now >= room.phaseEndAt) { endCoin(room); return; }
  sendState(room, now);
}

function endCoin(room) {
  const parts = [...room.players.values()].filter(p => !p.waiting);
  const sorted = parts.sort((a, b) => b.score - a.score);
  finishGame(room, sorted, p => p.score + '개', p => String(p.score));
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
  // 아직 안 쓴 초성 패턴을 가진 문제를 랜덤 카테고리에서 뽑는다.
  // 1~3라운드는 정답이 여러 개인 문제 우선(중복 금지 눈치싸움), 4~5라운드는 아무 문제나(스피드전)
  const cats = Object.keys(CHO_INDEX);
  const preferMulti = g.round <= 3;
  for (let tryN = 0; tryN < 100; tryN++) {
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const patterns = [...CHO_INDEX[cat].keys()];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    if (g.usedPatterns.has(cat + ':' + pattern)) continue;
    const answers = CHO_INDEX[cat].get(pattern);
    if (preferMulti && answers.length < 2 && tryN < 70) continue; // 70번까지는 다중 정답만 노림
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
    // 정답 단어가 다 나왔으면 더 기다릴 필요 없음
    const exhausted = g.claimed.length >= g.answers.size;
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
      const extra = type === 'tag' ? (p.infected ? 1 : 0) : (type === 'coin' ? p.score : 0);
      return [p.id, Math.round(p.x), Math.round(p.y), p.alive ? 1 : 0, p.waiting ? 1 : 0, extra];
    }),
  };
  if (type === 'bomb') msg.bombs = g.bombs.map(b => {
    const boom = now >= b.explodeAt;
    const prog = boom ? (now - b.explodeAt) / BOMB_BOOM_MS
      : (now - (b.explodeAt - BOMB_WARN_MS)) / BOMB_WARN_MS;
    return [Math.round(b.x), Math.round(b.y), Math.round(b.r), boom ? 1 : 0, Math.round(prog * 100)];
  });
  if (type === 'coin') msg.coins = g.coins.map(c => [Math.round(c.x), Math.round(c.y), c.v]);
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
          if (choseongOf(norm) !== g.pattern) {
            roomSend(ws, { type: 'word_bad', reason: 'cho' });
          } else if (!g.answers.has(norm)) {
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
