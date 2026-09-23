// SUPERSTAR KART — 캐릭터·트랙·아이템 정의 (클라이언트 공용 데이터)
// 스탯은 1~5. 합이 비슷하도록 맞춰 어느 캐릭터를 골라도 이길 수 있게 한다.
export const CHARS = [
  { id: 'c01', name: '홈런 준', role: '야구 에이스', color: '#e53935', accent: '#ffffff', spd: 4, acc: 3, han: 3, wgt: 4 },
  { id: 'c02', name: '덩크 하린', role: '농구 스타', color: '#ff8a1c', accent: '#ffffff', spd: 4, acc: 3, han: 3, wgt: 4 },
  { id: 'c03', name: '골잡이 민', role: '축구 스트라이커', color: '#1f63e0', accent: '#ffffff', spd: 3, acc: 4, han: 4, wgt: 3 },
  { id: 'c04', name: '루나', role: '아이돌 보컬', color: '#ff4fa3', accent: '#ffe3f2', spd: 3, acc: 4, han: 4, wgt: 2 },
  { id: 'c05', name: '제이', role: '아이돌 댄서', color: '#14c9b0', accent: '#101820', spd: 3, acc: 5, han: 4, wgt: 2 },
  { id: 'c06', name: '태린', role: '태권도 국가대표', color: '#2a2d3a', accent: '#ff3b3b', spd: 4, acc: 4, han: 3, wgt: 3 },
  { id: 'c07', name: '세라', role: '피겨 스케이터', color: '#6ec6ff', accent: '#ffffff', spd: 3, acc: 4, han: 5, wgt: 2 },
  { id: 'c08', name: '픽셀', role: '프로게이머', color: '#35c94d', accent: '#0d0d0d', spd: 5, acc: 3, han: 3, wgt: 3 },
  { id: 'c09', name: '보드 리오', role: '스케이트보더', color: '#ffc72c', accent: '#1d2a5a', spd: 4, acc: 4, han: 3, wgt: 3 },
  { id: 'c10', name: '명궁 하늘', role: '양궁 국가대표', color: '#7c4dff', accent: '#ffffff', spd: 5, acc: 3, han: 4, wgt: 2 },
];

// 트랙: 점(x,z,높이)을 잇는 닫힌 곡선. scale로 전체 크기를 맞춘다.
// pads = 부스터 발판 [곡선 위치 0~1, 옆 위치(-1~1)], boxes = 아이템 상자 줄 위치 0~1
export const TRACKS = [
  {
    id: 'beach', name: '선셋 비치 서킷', sub: '노을 해변을 달리는 입문 코스', laps: 3,
    theme: 'beach', sky: 'sky-beach', ground: 'tex-sand', bgm: 'bgm-beach', width: 17, band: 8, scale: 1.25,
    pts: [[0, 0, 0], [80, -6, 0], [150, 8, 1], [205, 50, 3], [215, 115, 5], [180, 165, 6], [120, 170, 4], [85, 135, 2], [40, 118, 1], [-5, 150, 2], [-45, 205, 4], [-110, 215, 5], [-165, 170, 3], [-178, 100, 1], [-150, 40, 0], [-85, 8, 0]],
    pads: [[0.13, 0], [0.47, -0.4], [0.47, 0.4], [0.8, 0]], boxes: [0.07, 0.3, 0.56, 0.86],
  },
  {
    id: 'neon', name: '네온 시티 스테이지', sub: '불꽃놀이 아래 K-POP 야간 시가지', laps: 3,
    theme: 'neon', sky: 'sky-neon', ground: 'tex-neon', bgm: 'bgm-neon', width: 16, band: 6, scale: 1.2,
    pts: [[0, 0, 0], [90, 0, 0], [160, 0, 0], [200, 30, 0], [205, 90, 0], [170, 120, 0], [120, 110, 0], [95, 150, 0], [120, 200, 0], [90, 245, 0], [20, 250, 0], [-30, 215, 0], [-20, 160, 0], [-70, 130, 0], [-130, 150, 0], [-175, 110, 0], [-165, 40, 0], [-90, 5, 0]],
    pads: [[0.06, 0], [0.34, 0], [0.62, -0.35], [0.62, 0.35], [0.9, 0]], boxes: [0.02, 0.26, 0.5, 0.74],
  },
  {
    id: 'blossom', name: '벚꽃 캐니언', sub: '오르막 내리막 봄날 산길', laps: 3,
    theme: 'blossom', sky: 'sky-blossom', ground: 'tex-grass', bgm: 'bgm-blossom', width: 16, band: 7, scale: 1.3,
    pts: [[0, 0, 0], [70, -10, 2], [140, 10, 7], [190, 60, 13], [185, 125, 17], [135, 160, 14], [75, 150, 9], [45, 105, 6], [0, 95, 8], [-40, 140, 13], [-95, 175, 16], [-155, 150, 12], [-175, 85, 6], [-140, 25, 2], [-75, -5, 0]],
    pads: [[0.1, 0], [0.38, 0], [0.66, -0.4], [0.66, 0.4]], boxes: [0.05, 0.3, 0.54, 0.8],
  },
  {
    id: 'kpop', name: 'K-POP 콘서트 아레나', sub: '레이저·응원봉 사이 공연장 한 바퀴', laps: 3,
    theme: 'kpop', sky: 'keyart', ground: 'tex-neon', bgm: 'bgm-menu', width: 16, band: 6, scale: 1.25,
    pts: [[0, 0, 0], [80, 0, 0], [140, 12, 0], [178, 55, 0], [182, 110, 0], [150, 150, 0], [100, 158, 0], [60, 135, 0], [20, 150, 0], [-25, 185, 0], [-85, 190, 0], [-135, 160, 0], [-160, 105, 0], [-150, 45, 0], [-90, 6, 0]],
    pads: [[0.16, 0], [0.45, -0.35], [0.45, 0.35], [0.78, 0]], boxes: [0.05, 0.29, 0.56, 0.84],
    ramps: [0.22, 0.63],
  },
];

// 아이템. weight[등수구간] — 앞(0)·중간(1)·뒤(2)
export const ITEMS = {
  boost:  { name: '부스터 캔',   icon: 'boost',  w: [2, 4, 5] },
  boost3: { name: '트리플 부스터', icon: 'boost3', w: [0, 2, 5] },
  ball:   { name: '야구공',     icon: 'ball',   w: [5, 4, 2] },
  hball:  { name: '유도 농구공',  icon: 'hball',  w: [1, 4, 4] },
  banana: { name: '바나나',     icon: 'banana', w: [6, 3, 1] },
  star:   { name: '슈퍼스타',    icon: 'star',   w: [0, 1, 4] },
  mic:    { name: '샤우팅 마이크', icon: 'mic',    w: [0, 1, 3] },
  soccer: { name: '축구공',     icon: 'soccer', w: [1, 3, 3] },
};

export function rollItem(rank, total, rnd = Math.random) {
  const band = total <= 1 ? 1 : rank === 0 ? 0 : rank >= Math.ceil(total * 0.6) ? 2 : 1;
  let sum = 0;
  for (const k in ITEMS) sum += ITEMS[k].w[band];
  let r = rnd() * sum;
  for (const k in ITEMS) { r -= ITEMS[k].w[band]; if (r <= 0) return k; }
  return 'boost';
}

export const BOT_NAMES = ['번개', '씽씽', '로켓', '질주', '바람', '터보', '회오리', '별빛', '해피', '스피드'];
