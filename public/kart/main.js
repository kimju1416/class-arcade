// SUPERSTAR KART — 화면 흐름·레이스 진행·아이템·카메라·HUD
import * as T from 'three';
import { EffectComposer } from '/fps/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '/fps/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/fps/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/fps/addons/postprocessing/OutputPass.js';
import { CHARS, TRACKS, ITEMS, rollItem, BOT_NAMES } from './data.js';
import { buildTrack, N } from './trackmath.js';
import { makeKart, stepKart, spinOut, bump, MAXSPD } from './physics.js';
import { KartView, driverTextures } from './kart.js';
import { buildWorld } from './world.js';
import { audio } from './audio.js';
import { icon } from './icons.js';
import { botInput, botWantsItem } from './ai.js';
import { Net } from './net.js';
import { Particles, Skids, softDot } from './fx.js';
import { BODIES, PAINTS, FINISHES, RIMS, DECALS, defaultCar, cleanCar } from './carbody.js';
import { Garage } from './garage.js';

const $ = (id) => document.getElementById(id);
const ROOM_Q = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');
const store = { get(k, d) { try { const v = localStorage.getItem('kart_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('kart_' + k, JSON.stringify(v)); } catch (e) { } } };

// ---------------- 설정 ----------------
const S = {
  name: store.get('name', ''), char: store.get('char', Math.floor(Math.random() * CHARS.length)),
  track: store.get('track', 0), diff: store.get('diff', 1), qual: store.get('qual', 'auto'),
  mode: 'solo',
};
S.car = cleanCar(store.get('car', null), S.char);
function qualityLevel() {
  if (S.qual === 'high') return 2; if (S.qual === 'low') return 1;
  return IS_TOUCH || (navigator.hardwareConcurrency || 4) <= 4 ? 1 : 2;
}

// ---------------- 렌더러 ----------------
const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.type = T.PCFShadowMap;
const camera = new T.PerspectiveCamera(70, 1, 0.3, 4200);
let scene = new T.Scene();
let composer = null, bloom = null;
function setupRenderer() {
  const q = qualityLevel();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q >= 2 ? 2 : 1.3));
  renderer.shadowMap.enabled = q >= 2;
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}
addEventListener('resize', resize);
setupRenderer();

// ---------------- 화면 전환 ----------------
let screen = 'title';
const backMap = { select: 'title', track: 'select', online: 'select', room: 'online', garage: 'select' };
function show(name) {
  for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === 'scr-' + name);
  screen = name;
  if (['title', 'select', 'track', 'online', 'room', 'results'].includes(name)) { $('hud').hidden = true; }
}
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => {
  audio.play('click', 0.6);
  if (screen === 'room' && net) { net.close(); net = null; }
  show(backMap[screen] || 'title');
};
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }
const unlock = () => { audio.init(); if (screen === 'title' || screen === 'select' || screen === 'track' || screen === 'online' || screen === 'room') audio.bgm('bgm-menu', 0.8); };
addEventListener('pointerdown', unlock, { once: false });
addEventListener('keydown', unlock, { once: false });

// 첫 화면
$('bSolo').onclick = () => { audio.play('click', 0.6); S.mode = 'solo'; openSelect(); };
$('bOnline').onclick = () => { audio.play('click', 0.6); S.mode = 'online'; openSelect(); };
$('bTV').onclick = () => { audio.play('click', 0.6); S.mode = 'tv'; show('online'); $('onErr').textContent = ''; connect({ create: true, tv: true, name: '선생님' }); };
const soundBtn = $('bSound');
const syncSound = () => soundBtn.textContent = audio.on ? '소리 켬' : '소리 끔';
soundBtn.onclick = (e) => { e.stopPropagation(); audio.init(); audio.setOn(!audio.on); syncSound(); };
syncSound();
const QN = { auto: '화질 자동', high: '화질 높음', low: '화질 가볍게' };
$('bQual').textContent = QN[S.qual];
$('bQual').onclick = () => { S.qual = S.qual === 'auto' ? 'high' : S.qual === 'high' ? 'low' : 'auto'; store.set('qual', S.qual); $('bQual').textContent = QN[S.qual]; setupRenderer(); };

// ---------------- 캐릭터 고르기 ----------------
const STAT_N = [['spd', '최고 속도'], ['acc', '가속'], ['han', '핸들링'], ['wgt', '무게']];
function portrait(c) { return `/kart/chars/${c.id}-front.webp`; }
function buildCharGrid() {
  const g = $('charGrid'); g.innerHTML = '';
  CHARS.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'cc'; b.style.setProperty('--cc', c.color);
    b.innerHTML = `<img src="${portrait(c)}" alt="" loading="lazy"><span>${c.name}</span>`;
    b.onclick = () => { S.char = i; store.set('char', i); audio.play('select', 0.7); renderHero(); if (net && net.id) net.send({ t: 'char', char: i }); };
    g.appendChild(b);
  });
}
function renderHero() {
  const c = CHARS[S.char];
  [...$('charGrid').children].forEach((b, i) => b.classList.toggle('on', i === S.char));
  document.querySelector('.sel-hero').style.setProperty('--hc', c.color);
  const img = $('heroImg'); img.src = portrait(c); img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
  $('heroName').textContent = c.name; $('heroRole').textContent = c.role;
  $('heroStats').innerHTML = STAT_N.map(([k, n]) => `<span>${n}</span><div class="b"><i style="width:${c[k] * 20}%"></i></div>`).join('');
}
function openSelect() {
  buildCharGrid(); renderHero();
  $('nick').value = S.name;
  document.querySelector('#scr-select .step').textContent = '1 / 2';
  show('select');
}
$('bSelNext').onclick = () => {
  audio.play('click', 0.6);
  S.name = $('nick').value.replace(/[<>]/g, '').trim().slice(0, 10) || CHARS[S.char].name;
  store.set('name', S.name);
  if (S.mode === 'solo') openTracks();
  else if (ROOM_Q) { show('online'); connect({ room: ROOM_Q }); }
  else openOnline();
};

// ---------------- 카트 꾸미기 ----------------
let garage = null;
function garageUI() {
  const c = S.car;
  const opts = (el, list, key) => { el.innerHTML = ''; list.forEach((o, i) => { const b = document.createElement('button'); b.textContent = o.name; b.className = c[key] === i ? 'on' : ''; b.onclick = () => setCar(key, i); el.appendChild(b); }); };
  opts($('gBody'), BODIES, 'b'); opts($('gFinish'), FINISHES, 'f'); opts($('gRim'), RIMS, 'w'); opts($('gDecal'), DECALS, 'd');
  const sw = $('gPaint'); sw.innerHTML = '';
  [-1, ...PAINTS.keys()].forEach((i) => {
    const b = document.createElement('button'); b.style.background = i < 0 ? CHARS[S.char].color : PAINTS[i];
    b.className = (c.c === i ? 'on' : '') + (i < 0 ? ' me' : ''); b.title = i < 0 ? '캐릭터 색' : '';
    b.onclick = () => setCar('c', i); sw.appendChild(b);
  });
  $('gNumWrap').hidden = !(c.d === 2 || (c.d === 3 && ![2, 3].includes(c.b)));
  $('gNum').value = c.n;
}
function setCar(key, v) {
  S.car = cleanCar({ ...S.car, [key]: v }, S.char); store.set('car', S.car);
  audio.play('click', 0.5); garageUI(); garage.show(CHARS[S.char], S.car);
  if (net && net.id) net.send({ t: 'car', car: S.car });
}
$('gNum').onchange = () => setCar('n', Math.max(1, Math.min(99, parseInt($('gNum').value, 10) || 1)));
function openGarage() {
  if (!garage) { garage = new Garage(renderer); garage.bind($('garDrag')); }
  garage.show(CHARS[S.char], S.car); garageUI(); show('garage');
}
$('bGarage').onclick = () => { audio.play('click', 0.6); openGarage(); };
$('bGarDone').onclick = () => { audio.play('select', 0.7); show('select'); };
function randomCar(k) { const r = (n) => Math.floor(Math.random() * n); return { b: r(BODIES.length), c: r(PAINTS.length + 1) - 1, f: r(FINISHES.length), w: r(RIMS.length), d: r(DECALS.length), n: k + 2 }; }

// ---------------- 코스 고르기 ----------------
function trackThumb(def) {
  const tr = buildTrack(def), cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), b = tr.bounds, sc = 108 / Math.max(b.maxx - b.minx, b.maxz - b.minz);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= N; i += 8) { const k = i % N; const x = 10 + (tr.x[k] - b.minx) * sc, y = 10 + (tr.z[k] - b.minz) * sc; i ? g.lineTo(x, y) : g.moveTo(x, y); } };
  path(); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 12; g.stroke();
  path(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(10 + (tr.x[0] - b.minx) * sc, 10 + (tr.z[0] - b.minz) * sc, 6, 0, 7); g.fill();
  return cv;
}
function buildTrackCards(el, onPick, cur) {
  el.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const b = document.createElement('button'); b.className = 'tc' + (i === cur ? ' on' : '');
    b.style.backgroundImage = `url(/kart/tex/${t.sky}.webp)`;
    const best = bestOf(t.id);
    b.innerHTML = `<div class="tt"><b>${t.name}</b><small>${t.sub}</small>${best ? `<em class="best">내 최고 ${fmt(best.t)}</em>` : ''}</div>`;
    b.appendChild(trackThumb(t));
    b.onclick = () => { audio.play('click', 0.6); onPick(i); [...el.children].forEach((x, j) => x.classList.toggle('on', j === i)); };
    el.appendChild(b);
  });
}
function openTracks() {
  buildTrackCards($('trackGrid'), (i) => { S.track = i; store.set('track', i); }, S.track);
  [...$('diff').children].forEach(b => b.classList.toggle('on', +b.dataset.d === S.diff));
  show('track');
}
$('diff').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.diff = +b.dataset.d; store.set('diff', S.diff); [...$('diff').children].forEach(x => x.classList.toggle('on', x === b)); };
$('bGo').onclick = () => { audio.play('select', 0.8); startSolo(); };

function bestOf(id) { return store.get('best_' + id, null); }
function startSolo() {
  const def = TRACKS[S.track];
  if (S.ta) {
    // 타임 어택: 나 혼자 + 내 최고 기록 고스트, 부스터 3개
    startRace({ def, grid: [{ id: 'me', name: S.name, char: S.char, bot: false, car: S.car }], t0: performance.now() + 5200, online: false, myId: 'me', host: true, ta: true });
    return;
  }
  const pool = [...Array(CHARS.length).keys()].filter(i => i !== S.char);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const grid = [];
  const skills = [[0.86, 0.9], [0.93, 0.975], [0.99, 1.03]][S.diff];
  for (let k = 0; k < 7; k++) grid.push({ id: 'b' + k, name: BOT_NAMES[k], char: pool[k], bot: true, skill: skills[0] + (skills[1] - skills[0]) * (k / 6), car: randomCar(k) });
  grid.push({ id: 'me', name: S.name, char: S.char, bot: false, car: S.car });
  if (S.teams) grid.forEach((g, i) => g.team = g.id === 'me' ? 0 : (i % 2 ? 0 : 1));
  startRace({ def, grid, t0: performance.now() + 5200, online: false, myId: 'me', host: true, teams: !!S.teams });
}
$('taMode').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.ta = b.dataset.m === 'ta'; [...$('taMode').children].forEach(x => x.classList.toggle('on', x === b)); $('diffWrap').hidden = S.ta; $('soloTeamWrap').hidden = S.ta; };
$('soloTeams').onchange = () => { S.teams = $('soloTeams').checked; };

// ---------------- 온라인 ----------------
let net = null, room = null;
function openOnline() {
  $('onErr').textContent = '';
  const q = new URLSearchParams(location.search).get('room');
  if (q) $('joinCode').value = q.toUpperCase().slice(0, 4);
  show('online');
}
function connect(hello) {
  if (net) net.close();
  $('onErr').textContent = '연결하는 중…';
  net = new Net(onNet);
  net.connect({ name: S.name, char: S.char, car: S.car, ...hello });
}
$('bCreate').onclick = () => { audio.play('click', 0.6); connect({ create: true }); };
$('bJoin').onclick = () => {
  audio.play('click', 0.6);
  const code = $('joinCode').value.toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { $('onErr').textContent = '코드 네 글자를 적어 주세요.'; return; }
  connect({ room: code });
};
$('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('bJoin').click(); });
$('bCopy').onclick = () => {
  const url = joinURL();
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('링크를 복사했어요'), () => toast(url));
};
$('roomBots').onchange = () => net && net.send({ t: 'set', bots: $('roomBots').checked });
$('roomTeams').onchange = () => net && net.send({ t: 'set', teams: $('roomTeams').checked });
$('bRoomStart').onclick = () => { audio.play('select', 0.8); net && net.send({ t: 'start' }); };

function joinURL() { return `${location.origin}/kart/?room=${room.code}`; }
let qrLib = null;
function drawQR() {
  const el = $('roomQR');
  const put = () => { const q = qrcode(0, 'M'); q.addData(joinURL()); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); el.dataset.code = room.code; };
  if (el.dataset.code === room.code) return;
  if (window.qrcode) return put();
  if (!qrLib) { qrLib = document.createElement('script'); qrLib.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; document.head.appendChild(qrLib); }
  qrLib.addEventListener('load', put, { once: true });
}
function renderRoom() {
  if (!room) return;
  const meHost = room.host === net.id;
  const tv = !!(room.players.find(p => p.id === net.id) || {}).tv;
  $('scr-room').classList.toggle('tv', tv);
  $('roomCode').textContent = room.code;
  $('roomURL').textContent = joinURL().replace(/^https?:\/\//, '');
  if (tv) drawQR();
  const pl = $('players'); pl.innerHTML = '';
  const racers = room.players.filter(p => !p.tv);
  for (const p of racers) {
    const c = CHARS[p.char] || CHARS[0];
    const d = document.createElement('div'); d.className = 'pl' + (p.id === net.id ? ' me' : ''); d.style.setProperty('--cc', c.color);
    d.innerHTML = `<img src="${portrait(c)}" alt="">${p.host ? '<em>방장</em>' : ''}<span></span>`;
    d.querySelector('span').textContent = p.name;
    pl.appendChild(d);
  }
  for (let i = racers.length; i < 8; i++) { const d = document.createElement('div'); d.className = 'pl empty'; d.textContent = room.bots ? 'AI' : '빈 자리'; pl.appendChild(d); }
  const tl = $('roomTracks'); tl.innerHTML = '';
  TRACKS.forEach((t) => {
    const b = document.createElement('button'); b.textContent = t.name; b.className = t.id === room.track ? 'on' : ''; b.disabled = !meHost;
    b.onclick = () => net.send({ t: 'set', track: t.id });
    tl.appendChild(b);
  });
  $('roomBots').checked = room.bots; $('roomBots').disabled = !meHost;
  $('roomTeams').checked = !!room.teams; $('roomTeams').disabled = !meHost;
  $('bRoomStart').hidden = !meHost;
  $('roomWait').textContent = room.state === 'race' ? '지금 레이스가 진행 중이에요. 이번 판이 끝나면 함께 달려요.'
    : racers.length > room.max ? `한 판에 ${room.max}명씩 달려요. 이번에 못 탄 사람은 다음 판에 먼저 타요.`
    : meHost ? (tv ? '학생들이 QR로 다 들어오면 출발을 눌러요.' : '친구들이 다 들어오면 출발을 눌러요.') : '방장이 출발을 누르면 시작돼요.';
  $('roomState').textContent = `${racers.length}명 접속`;
}

function onNet(m) {
  switch (m.type) {
    case 'err': if (room && screen === 'room') { toast(m.msg); break; } $('onErr').textContent = m.msg; if (net) { net.close(); net = null; } break;
    case 'welcome': $('onErr').textContent = ''; history.replaceState(null, '', `/kart/?room=${m.code}`); break;
    case 'lobby':
      room = m;
      if (screen === 'online' || screen === 'select') show('room');
      if (screen === 'room') renderRoom();
      break;
    case 'start': {
      const def = TRACKS.find(t => t.id === m.track) || TRACKS[0];
      startRace({ def, grid: m.grid, t0: m.t0, online: true, myId: net.id, host: m.host === net.id, teams: !!m.teams });
      break;
    }
    case 'ss': if (race && race.online) onPoses(m); break;
    case 'item': if (race && race.online) onItem(m); break;
    case 'gone': if (race) { const h = race.hazards.get(m.id); if (h) killHazard(h, false); } break;
    case 'hit': if (race) feedHit(m.by, m.v, m.k); break;
    case 'fin': if (race) onFin(m); break;
    case 'closing': if (race && !(race.me && race.me.k.finished)) feed(`${m.sec}초 뒤 레이스가 끝나요`); break;
    case 'results': if (race && race.online) showResults(m.order); break;
    case 'host': if (race) becomeHost(m.id); break;
    case 'left': if (race) { const r = race.byId[m.id]; if (r && !r.bot) { r.gone = true; r.view.root.visible = false; feed(`${r.name} 님이 나갔어요`); } } break;
    case 'closed':
      if (race && race.online) { toast('서버 연결이 끊어졌어요'); }
      else if (screen === 'room' || screen === 'online') { $('onErr').textContent = '서버 연결이 끊어졌어요. 다시 시도해 주세요.'; show('online'); }
      net = null; break;
  }
}

// ---------------- 레이스 ----------------
let race = null;
const loc = {};
const keys = {};
const touch = { l: false, r: false, drift: false, brake: false };

async function startRace(opt) {
  $('loading').hidden = false; $('loadTxt').textContent = '코스를 만드는 중…';
  await new Promise(r => setTimeout(r, 30));
  const buildStart = performance.now(); window.__kartBuild = 0;
  if (race) disposeRace();
  scene = new T.Scene();
  const def = opt.def, tr = buildTrack(def);
  const q = qualityLevel();
  const world = buildWorld(scene, tr, def, q, renderer);
  renderer.toneMappingExposure = world.theme.exposure;
  // 블룸은 성능 여유가 있을 때만
  if (q >= 2) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), (def.theme === 'neon' || def.theme === 'kpop') ? 0.55 : 0.18, 0.45, (def.theme === 'neon' || def.theme === 'kpop') ? 0.78 : 0.97);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    composer.setSize(innerWidth, innerHeight);
  } else { composer = null; bloom = null; }

  const clock = opt.online ? () => net.now() : () => performance.now();
  if (!opt.online) opt.t0 = performance.now() + 1e9; // 혼자면 다 만든 뒤에 출발 시각을 정한다(아래)
  race = {
    def, tr, world, online: opt.online, myId: opt.myId, host: opt.host, clock, t0: opt.t0, laps: def.laps,
    racers: [], byId: {}, hazards: new Map(), nonce: 1, finOrder: [], phase: 'intro', lastSend: 0, time: 0,
    myFinT: 0, doneAt: 0, rings: [], started: false, lastRank: 0, lapShown: 0, ended: false,
    ta: !!opt.ta, teams: !!opt.teams, me: null, spec: false, specIdx: 0, rec: [], recT: 0, rsPress: null,
  };
  opt.grid.forEach((g, slot) => {
    const row = Math.floor(slot / 2), side = slot % 2 ? 1 : -1;
    const s = -(9 + row * 7.5 + (slot % 2) * 2.5) / tr.seg;
    const lat = side * tr.half * 0.42;
    const ch = CHARS[g.char] || CHARS[0];
    const k = makeKart(g.id, ch, tr, s, lat);
    k.mul = g.bot ? (g.skill || 0.95) : 1;
    const me = g.id === opt.myId;
    const r = { id: g.id, name: g.name, char: ch, bot: !!g.bot, skill: g.skill || 1, k, me, buf: [], gone: false, team: opt.teams ? g.team : undefined,
      view: new KartView(ch, scene, { team: opt.teams ? g.team : undefined, label: me || (g.bot && !opt.online && !opt.teams) ? null : g.name, car: g.car || (g.bot ? randomCar(slot) : null) }) };
    if (def.theme === 'neon' || def.theme === 'kpop') r.view.driverMat.color.setScalar(0.72);
    r.local = me || (r.bot && opt.host);
    race.racers.push(r); race.byId[g.id] = r;
    if (me) race.me = r;
  });
  race.fx = { add: new Particles(scene, 2600, true), dust: new Particles(scene, 1400, false), skids: new Skids(scene) };
  race.spec = !race.me;
  document.body.classList.toggle('spec', race.spec);
  $('specBanner').hidden = !race.spec;
  $('specBanner').textContent = room && (room.players.find(p => p.id === race.myId) || {}).tv ? 'LIVE 실시간 중계' : '이번 판은 관전 — 다음 판에 먼저 달려요';
  // 타임 어택: 고스트
  if (race.ta) {
    race.me.k.item = 'boost3'; race.me.k.itemN = 3;
    const best = bestOf(def.id);
    if (best && best.g && best.g.length > 10) {
      const gc = CHARS[best.c] || CHARS[0];
      const gv = new KartView(gc, scene, { label: '내 최고 기록' });
      gv.root.traverse(o => { if (o.isMesh || o.isSprite) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.42; o.material.depthWrite = false; o.castShadow = false; } });
      gv.driverMat = gv.driver.material;
      race.ghost = { data: best.g, view: gv, k: makeKart('ghost', gc, tr, 0, 0) };
    }
  }
  $('rankOf').textContent = '/ ' + race.racers.length;
  $('teamBar').hidden = !race.teams;
  drawMiniBase();
  // 셰이더를 미리 굽는다 — 안 하면 첫 화면에서 몇 초 멈춘다
  $('loadTxt').textContent = '그래픽을 준비하는 중…';
  { const c = tr.point(-10 / tr.seg, 0); camera.position.set(c.x, c.y + 12, c.z + 30); camera.lookAt(c.x, c.y, c.z); }
  const myRace = race;
  try { await renderer.compileAsync(scene, camera); } catch (e) { }
  if (race !== myRace) return;
  window.__kartBuild = performance.now() - buildStart;
  if (!opt.online) race.t0 = performance.now() + 5200;
  $('loading').hidden = true;
  show('race');
  $('hud').hidden = false; $('lapNum').textContent = '1';
  setItem(race.ta ? 'boost3' : null); if (race.ta) $('itemN').textContent = 3;
  audio.init(); audio.bgm(null); audio.musicVol(0.42); audio.musicRate(1);
  race.crowd = null;
  camIntro = 0; camYaw = null;
  lastT = performance.now();
}

function disposeRace() {
  $('scr-results').classList.remove('over'); $('podTitle').hidden = true; document.body.classList.remove('spec');
  if (!race) return;
  if (race.driftLoop) race.driftLoop.stop();
  if (race.crowd) race.crowd.stop();
  scene.traverse(o => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
  race = null;
  audio.engine(0, false, false);
}

// 온라인: 위치 받기
function onPoses(m) {
  for (const a of m.k) {
    const r = race.byId[a[0]]; if (!r || r.local) continue;
    r.buf.push({ t: m.s, x: a[1], y: a[2], z: a[3], h: a[4], spd: a[5], f: a[6], prog: a[7], yaw: a[8] });
    if (r.buf.length > 30) r.buf.shift();
  }
}
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function interpRemote(r, now, dt) {
  const b = r.buf; if (!b.length) return;
  const rt = now - 120;
  let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--;
  const A = b[Math.max(0, i - 1)], B = b[i];
  const t = B.t === A.t ? 1 : Math.max(0, Math.min(1.3, (rt - A.t) / (B.t - A.t)));
  const k = r.k, ph = k.h;
  k.x = A.x + (B.x - A.x) * t; k.y = A.y + (B.y - A.y) * t; k.z = A.z + (B.z - A.z) * t;
  k.h = lerpAng(A.h, B.h, Math.min(1, t)); k.spd = A.spd + (B.spd - A.spd) * t; k.prog = A.prog + (B.prog - A.prog) * t;
  k.yawVis = B.yaw;
  const f = B.f;
  k.starT = f & 1 ? 1 : 0; k.boostT = f & 4 ? 1 : 0;
  k.drift = f & 8 ? 1 : f & 16 ? -1 : 0; k.driftLv = (f >> 5) & 3;
  // 원격 카트가 맞은 순간(깃발이 켜지는 순간)부터 내 화면에서 같은 회전 연출을 돌린다
  if (f & 2) { if (!k._spinOn) { k.spinT = k.spinDur = 1.25; k.dizzyT = 1.9; fxBurst(k.x, k.y + 1, k.z, 1); } k._spinOn = true; }
  else k._spinOn = false;
  if (k.spinT > 0) k.spinT -= dt;
  if (k.dizzyT > 0) k.dizzyT -= dt;
  k.finished = !!(f & 128);
  const turn = lerpAng(0, k.h - ph, 1) / Math.max(dt, 1e-3);
  k.steerVis += (Math.max(-1, Math.min(1, -turn / 1.5)) - k.steerVis) * Math.min(1, dt * 8);
  tr_locate(k);
  k.lat = loc.lat; k.li = loc.i; k.hop = 0;
}
function tr_locate(k) { race.tr.locate(k.x, k.z, k.li, loc); }
function flagsOf(k) {
  return (k.starT > 0 ? 1 : 0) | (k.spinT > 0 ? 2 : 0) | (k.boostT > 0 ? 4 : 0) | (k.drift > 0 ? 8 : 0) | (k.drift < 0 ? 16 : 0) | ((k.driftLv & 3) << 5) | (k.finished ? 128 : 0);
}
function sendPoses(now) {
  if (!race.online || now - race.lastSend < 66) return;
  race.lastSend = now;
  const k = [];
  for (const r of race.racers) if (r.local && !r.gone) {
    const q = r.k, R2 = (v) => Math.round(v * 100) / 100;
    k.push([r.id, R2(q.x), R2(q.y), R2(q.z), R2(q.h), R2(q.spd), flagsOf(q), R2(q.prog), R2(q.yawVis)]);
  }
  net.send({ t: 'st', k });
}
function becomeHost(id) {
  race.host = id === race.myId;
  if (!race.host) return;
  for (const r of race.racers) if (r.bot) { r.local = true; r.k.li = race.tr.locate(r.k.x, r.k.z, -1, loc).i; r.k.events.length = 0; }
  feed('내가 방장이 됐어요');
}

// ---------------- 아이템 ----------------
const iconURL = {};
function setItem(k) {
  const cv = $('itemCv'), g = cv.getContext('2d');
  g.clearRect(0, 0, 160, 160);
  if (k) g.drawImage(icon(k, 160), 8, 8, 144, 144);
  $('itemN').textContent = '';
  const tb = $('tItem'); if (tb.dataset.k !== (k || '')) { tb.dataset.k = k || ''; tb.style.backgroundImage = k ? `url(${iconURL[k] || (iconURL[k] = icon(k, 128).toDataURL())})` : ''; tb.classList.toggle('has', !!k); }
}
function giveItem(r) {
  const k = r.k;
  if (race.ta) return;
  if (k.item || k.rollT > 0) return;
  const ranked = rankList();
  const rank = ranked.indexOf(r);
  k.rollT = r.me ? 1.1 : 0.9;
  k.pending = rollItem(rank, ranked.length);
  if (r.me) { audio.play('itembox', 0.8); race.rollSnd = audio.play('roulette', 0.5); }
}
function tickRoll(r, dt) {
  const k = r.k;
  if (k.rollT <= 0) return;
  k.rollT -= dt;
  if (r.me) {
    const keys = Object.keys(ITEMS); setItem(keys[Math.floor(performance.now() / 80) % keys.length]);
  }
  if (k.rollT <= 0) {
    k.item = k.pending; k.itemN = k.item === 'boost3' ? 3 : 1;
    if (r.ai) r.ai.hold = 0;
    if (r.me) { setItem(k.item); $('itemN').textContent = k.itemN > 1 ? k.itemN : ''; audio.play('select', 0.5); }
  }
}
function useItem(r) {
  const k = r.k, it = k.item;
  if (!it || k.rollT > 0 || k.spinT > 0) return;
  const tr = race.tr;
  const consume = () => { k.itemN--; if (k.itemN <= 0) { k.item = null; } if (r.me) { if (k.item) { $('itemN').textContent = k.itemN > 1 ? k.itemN : ''; } else setItem(null); } if (r.ai) r.ai.hold = 0; };
  if (it === 'boost' || it === 'boost3') {
    k.boostT = Math.max(k.boostT, 1.25); consume();
    if (r.me) audio.play('boost', 0.9); else nearSound(r, 'boost', 0.5);
    return;
  }
  if (it === 'star') {
    k.starT = 7.5; consume();
    if (r.me) { audio.play('shield', 0.9); audio.musicRate(1.12); } else nearSound(r, 'shield', 0.5);
    return;
  }
  let s = k.prog, lat = k.lat, tg = null;
  if (it === 'ball') s = k.prog + 3 / tr.seg;
  if (it === 'hball') {
    s = k.prog + 3 / tr.seg;
    const ranked = rankList(); const i = ranked.indexOf(r);
    const t = i > 0 ? ranked[i - 1] : null; tg = t ? t.id : null;
  }
  if (it === 'banana') s = k.prog - 3 / tr.seg;
  consume();
  if (r.me) audio.play('throw', 0.8); else nearSound(r, 'throw', 0.5);
  const msg = { k: it, by: r.id, s, lat, tg };
  if (race.online) {
    const n = race.nonce++;
    net.send({ t: 'item', ...msg, n });
    // 내 화면에는 바로 띄우고, 서버 번호가 오면 바꿔 단다
    spawnHazard({ ...msg, id: 'L' + n, at: race.clock(), n, mine: true });
  } else spawnHazard({ ...msg, id: race.nonce++, at: race.clock() });
}
function onItem(m) {
  if (race.byId[m.by] && race.byId[m.by].local) {
    // 내가 던진 것: 임시 번호를 서버 번호로 바꾼다
    for (const h of race.hazards.values()) if (h.mine && h.n === m.n && h.by === m.by) { race.hazards.delete(h.id); h.id = m.id; h.mine = false; race.hazards.set(h.id, h); if (h.dead) net.send({ t: 'gone', id: m.id }); return; }
    return;
  }
  spawnHazard(m);
}

const hazGeo = new T.SphereGeometry(0.55, 28, 20);
let glowTex = null;
function hazardTexture(k) { const t = new T.CanvasTexture(icon(k, 128)); t.colorSpace = T.SRGBColorSpace; return t; }
const hazTex = {};
function spawnHazard(m) {
  const h = { ...m, dead: false, life: m.k === 'banana' ? 90000 : m.k === 'hball' ? 8000 : m.k === 'mic' ? 900 : 3600 };
  const tr = race.tr;
  if (m.k === 'mic') {
    // 샤우팅: 주변 30m 안의 내 쪽 레이서들을 돌려 버린다
    const by = race.byId[m.by];
    const c = by ? by.k : tr.point(m.s, m.lat);
    const ring = new T.Mesh(new T.RingGeometry(0.8, 1.6, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    ring.position.set(c.x, (c.y || 0) + 0.6, c.z); scene.add(ring);
    race.rings.push({ mesh: ring, t: 0 });
    if (by && by.me) audio.play('shield', 0.8, 1.4); else nearSound(by, 'shield', 0.7, 1.4);
    for (const r of race.racers) {
      if (!r.local || r.id === m.by || r.gone || sameTeam(r.id, m.by)) continue;
      if (Math.hypot(r.k.x - c.x, r.k.z - c.z) < 30 && spinOut(r.k, 1.1)) { onSpun(r, m.by, 'mic'); }
    }
    return;
  }
  hazTex[m.k] = hazTex[m.k] || hazardTexture(m.k);
  if (m.k === 'banana') {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: hazTex.banana }));
    sp.scale.set(1.5, 1.5, 1); h.mesh = sp;
  } else {
    const mat = new T.MeshStandardMaterial({ map: hazTex[m.k], roughness: 0.4 });
    h.mesh = new T.Mesh(hazGeo, mat); h.mesh.castShadow = true;
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex || (glowTex = softDot()), color: m.k === 'hball' ? 0xff8a2a : 0xfff2c0, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.4, 2.4, 1); h.mesh.add(glow);
  }
  scene.add(h.mesh);
  race.hazards.set(h.id, h);
  placeHazard(h, race.clock());
}
const HSPD = { ball: 50, hball: 60 };
function placeHazard(h, now) {
  const tr = race.tr, el = Math.max(0, now - h.at);
  let s = h.s, lat = h.lat;
  if (h.k === 'ball') s = h.s + HSPD.ball * el / 1000 / tr.seg;
  if (h.k === 'hball') {
    s = h.s + HSPD.hball * el / 1000 / tr.seg;
    const t = race.byId[h.tg];
    if (t) { const a = Math.min(1, el / 900); lat = h.lat + (t.k.lat - h.lat) * a; if (s > t.k.prog + 1) s = t.k.prog + 0.5; }
  }
  h.cs = s; h.cl = lat;
  const p = tr.point(s, lat);
  h.x = p.x; h.z = p.z; h.y = p.y + (h.k === 'banana' ? 0.7 : 0.6 + Math.abs(Math.sin(el / 160)) * (h.k === 'hball' ? 1.2 : 0.4));
  h.mesh.position.set(h.x, h.y, h.z);
  if (h.k !== 'banana') {
    h.mesh.rotation.set(el / 90, 0, el / 140);
    if (race.fx) { const c = h.k === 'hball' ? [1, 0.55, 0.15] : [1, 1, 0.85]; race.fx.add.emit(h.x, h.y, h.z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.35, 0.55, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0, -0.6); }
  }
}
function killHazard(h, tell) {
  if (h.dead) return;
  h.dead = true; if (h.mesh) scene.remove(h.mesh);
  race.hazards.delete(h.id);
  if (tell && race.online && !h.mine) net.send({ t: 'gone', id: h.id });
  if (h.mine) { h.dead = true; race.hazards.set(h.id, h); } // 서버 번호가 오면 그때 gone 보냄
}
function hazardsTick(now) {
  for (const h of [...race.hazards.values()]) {
    if (h.dead) { if (now - h.at > 3000) race.hazards.delete(h.id); continue; }
    if (now - h.at > h.life) { killHazard(h, false); continue; }
    placeHazard(h, now);
    for (const r of race.racers) {
      if (!r.local || r.gone || r.k.finished && !r.me) continue;
      if (r.id === h.by && now - h.at < 700) continue;
      if (sameTeam(r.id, h.by)) continue;
      const k = r.k;
      let hit = Math.hypot(k.x - h.x, k.z - h.z) < (h.k === 'banana' ? 1.6 : 1.8) && Math.abs(k.y + 0.6 - h.y) < 2.2;
      if (!hit && h.k === 'hball' && h.tg === r.id && h.cs >= k.prog - 0.3) hit = true;
      if (!hit) continue;
      killHazard(h, true);
      if (k.starT > 0) { if (r.me) audio.play('bump', 0.6); break; }
      if (spinOut(k, h.k === 'banana' ? 1.0 : 1.35)) onSpun(r, h.by, h.k);
      break;
    }
  }
}
function onSpun(r, by, kind) {
  fxBurst(r.k.x, r.k.y + 1, r.k.z, 1);
  if (r.me) { audio.play('hit', 1); shake = 0.5; }
  else nearSound(r, 'hit', 0.7);
  if (race.online) net.send({ t: 'hit', v: r.id, by, k: kind });
  feedHit(by, r.id, kind);
}
const KIND_N = { ball: '야구공', hball: '농구공', banana: '바나나', mic: '샤우팅', star: '슈퍼스타' };
function feedHit(by, v, kind) {
  const a = race.byId[by], b = race.byId[v];
  if (!a || !b || a === b) return;
  if (!(a.me || b.me)) return; // 나와 상관있는 것만
  if (race.feedDup === by + v + kind && performance.now() - race.feedDupT < 800) return;
  race.feedDup = by + v + kind; race.feedDupT = performance.now();
  const kn = KIND_N[kind] || '아이템';
  feed(a.me ? `${kn}${josa(kn, '으로', '로')} ${b.name}${josa(b.name, '을', '를')} 맞혔어요!` : `${a.name}의 ${kn}에 맞았어요`);
}
function josa(w, a, b) {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return b;
  const jong = (c - 0xac00) % 28;
  if (a === '으로') return jong === 0 || jong === 8 ? b : a; // ㄹ받침은 '로'
  return jong ? a : b;
}
function nearSound(r, n, vol, rate = 1) {
  const f = race.me || race.focus;
  if (!r || !f) return;
  const d = Math.hypot(r.k.x - f.k.x, r.k.z - f.k.z);
  if (d < 45) audio.play(n, vol * (1 - d / 45), rate);
}
function feed(msg) {
  const f = $('feed'), d = document.createElement('div'); d.textContent = msg; f.appendChild(d);
  while (f.children.length > 3) f.firstChild.remove();
  setTimeout(() => d.remove(), 2600);
}

// ---------------- 효과 ----------------
// kind 1 = 맞음(노란 별 불꽃), 2 = 아이템 상자(무지개 색종이)
function fxBurst(x, y, z, kind) {
  if (!race || !race.fx) return;
  const A = race.fx.add;
  const rain = [[1, 0.35, 0.6], [1, 0.85, 0.25], [0.3, 0.9, 0.6], [0.35, 0.6, 1], [0.8, 0.45, 1]];
  for (let i = 0; i < (kind === 1 ? 34 : 26); i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 0.9 + 0.1, sp = kind === 1 ? 7 + Math.random() * 6 : 5 + Math.random() * 5;
    const c = kind === 1 ? (i % 3 ? [1, 0.85, 0.3] : [1, 1, 1]) : rain[i % rain.length];
    A.emit(x, y, z, Math.cos(a) * sp * (1 - u * 0.5), u * sp, Math.sin(a) * sp * (1 - u * 0.5), 0.55 + Math.random() * 0.3, kind === 1 ? 0.6 : 0.45, c[0], c[1], c[2], 9);
  }
  if (kind === 1) for (let i = 0; i < 8; i++) race.fx.dust.emit(x, y - 0.4, z, (Math.random() - 0.5) * 4, 1 + Math.random(), (Math.random() - 0.5) * 4, 0.9, 1.4, 0.92, 0.92, 0.92, -0.5, 1.8);
}
const DUST = { beach: [0.93, 0.8, 0.6], blossom: [0.62, 0.6, 0.45], neon: null, kpop: null };
const DRIFT_C = [null, [0.35, 0.65, 1], [1, 0.6, 0.15], [1, 0.35, 0.9]];
function fxKart(r, dt) {
  const k = r.k, F = race.fx;
  const dx = k.x - camera.position.x, dz = k.z - camera.position.z;
  if (dx * dx + dz * dz > 110 * 110) return;
  const yaw = k.h + k.yawVis, s = Math.sin(yaw), c = Math.cos(yaw);
  const wheel = (side) => [k.x + (-c * 0.82 * side) + s * -0.9, k.y + 0.1, k.z + (s * 0.82 * side) + c * -0.9];
  r.fxT = (r.fxT || 0) + dt;
  const tick = r.fxT > 1 / 45; if (tick) r.fxT = 0;
  // 드리프트 불꽃 + 타이어 자국
  if (k.drift && k.spd > 8 && k.hop <= 0.05) {
    const dist = Math.hypot(k.x - (r.skX || 0), k.z - (r.skZ || 0));
    if (dist > 0.45) { for (const sd of [-1, 1]) { const w = wheel(sd); F.skids.add(w[0], k.y, w[2], yaw); } r.skX = k.x; r.skZ = k.z; }
    const col = DRIFT_C[k.driftLv];
    if (col && tick) for (const sd of [-1, 1]) { const w = wheel(sd); for (let i = 0; i < 2; i++) F.add.emit(w[0], w[1] + 0.1, w[2], (Math.random() - 0.5) * 3 - s * 2, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 3 - c * 2, 0.28, 0.32, col[0], col[1], col[2], 14); }
    if (tick && Math.random() < 0.5) { const w = wheel(k.drift); F.dust.emit(w[0], w[1] + 0.3, w[2], (Math.random() - 0.5), 0.8, (Math.random() - 0.5), 0.7, 0.9, 0.85, 0.85, 0.88, -0.3, 2); }
  }
  // 흙·모래 먼지
  const dc = DUST[race.def.theme];
  if (dc && k.off && Math.abs(k.spd) > 6 && tick) for (const sd of [-1, 1]) { const w = wheel(sd); F.dust.emit(w[0], w[1] + 0.2, w[2], (Math.random() - 0.5) * 1.5 - s * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5 - c * 1.5, 0.8, 1.1, dc[0], dc[1], dc[2], 1, 2.2); }
  // 부스터 불길
  if (k.boostT > 0 && tick) for (const sd of [-0.22, 0.22]) {
    const ex = k.x + (-c * sd) - s * 1.6, ez = k.z + (s * sd) - c * 1.6;
    F.add.emit(ex, k.y + 0.5, ez, -s * 6 + (Math.random() - 0.5), 0.6, -c * 6 + (Math.random() - 0.5), 0.22, 0.7, 1, 0.55 + Math.random() * 0.3, 0.15, 0, 1);
  }
  // 슈퍼스타 무지개 가루
  if (k.starT > 0 && tick) { const h = (performance.now() / 300) % 1; const col = new T.Color().setHSL(h, 1, 0.6); F.add.emit(k.x + (Math.random() - 0.5) * 2, k.y + Math.random() * 2, k.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.6, 0.5, col.r, col.g, col.b, -1); }
}

function sameTeam(a, b) { if (!race.teams) return false; const A = race.byId[a], B = race.byId[b]; return !!(A && B && A.team != null && A.team === B.team); }
const TEAM_PTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
function teamScore(list) { const s = [0, 0]; list.forEach((r, i) => { if (r && (r.team === 0 || r.team === 1)) s[r.team] += TEAM_PTS[i] || 0; }); return s; }

// ---------------- 순위 ----------------
function rankList() {
  return race.racers.filter(r => !r.gone).sort((a, b) => {
    const fa = a.k.finished ? a.k.finRank || 99 : 999, fb = b.k.finished ? b.k.finRank || 99 : 999;
    if (fa !== fb) return fa - fb;
    return b.k.prog - a.k.prog;
  });
}
function onFin(m) {
  const r = race.byId[m.id]; if (!r) return;
  r.k.finished = true; r.k.finRank = m.rank; r.k.finTime = m.time;
  if (!race.finOrder.find(f => f.id === m.id)) race.finOrder.push({ id: m.id, time: m.time });
}
function finishRacer(r, now) {
  const k = r.k; if (k.finished) return;
  k.finished = true;
  const time = now - race.t0;
  if (race.online) { net.send({ t: 'fin', id: r.id }); k.finRank = 50 + race.finOrder.length; }
  else { race.finOrder.push({ id: r.id, time }); k.finRank = race.finOrder.length; k.finTime = time; }
  if (r.me && !race.online) {
    const best = bestOf(race.def.id);
    if (!best || time < best.t) { store.set('best_' + race.def.id, { t: Math.round(time), c: CHARS.indexOf(r.char), g: race.rec }); race.newRecord = true; race.prevBest = best && best.t; }
  }
  if (r.me) {
    race.myFinT = now;
    audio.play('finish', 1); audio.bgm('bgm-win', 0.9);
    const rk = rankList().indexOf(r) + 1;
    center(rk === 1 ? '우승!' : 'FINISH', 'go');
    race.crowd = audio.loop('crowd', 0.35);
    confetti(rk <= 3 ? 220 : 90);
  }
}

// ---------------- 입력 ----------------
addEventListener('keydown', (e) => {
  if (e.repeat && keys[e.code]) return;
  keys[e.code] = true;
  if (!race) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyX' || e.code === 'KeyE' || e.code === 'ControlLeft' || e.code === 'KeyK') { if (race.phase === 'race' && race.me) useItem(race.me); }
  if (race.spec && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) specStep(e.code === 'ArrowRight' ? 1 : -1);
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function hold(id, key) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); touch[key] = true; el.classList.add('on'); audio.init(); };
  const off = (e) => { e.preventDefault(); touch[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
hold('tDrift', 'drift');
// 원 조이스틱 — 왼쪽 영역 아무 데나 누르면 그 자리가 중심. 좌우 = 핸들(아날로그), 아래로 깊이 = 브레이크
const joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
{
  const zone = $('joyZone'), el = $('joy'), knob = el.querySelector('.knob'), R = 56;
  const home = () => { el.style.left = ''; el.style.top = ''; el.style.bottom = ''; };
  zone.addEventListener('pointerdown', (e) => {
    if (joy.id !== null) return;
    e.preventDefault(); audio.init();
    joy.id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (er) { }
    joy.cx = e.clientX; joy.cy = e.clientY; joy.x = joy.y = 0;
    const r = $('hud').getBoundingClientRect();
    el.style.left = (e.clientX - r.left - 66) + 'px'; el.style.top = (e.clientY - r.top - 66) + 'px'; el.style.bottom = 'auto';
    el.classList.add('on', 'used'); knob.style.transform = '';
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    joy.x = dx / R; joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; el.classList.remove('on'); home(); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
}
$('tItem').addEventListener('pointerdown', (e) => { e.preventDefault(); if (race && race.phase === 'race' && race.me) useItem(race.me); });
function specStep(d) { if (!race) return; const n = race.racers.filter(r => !r.gone).length; race.specIdx = (race.specIdx + d + n) % n; race.specHold = 20; }
$('specPrev').onclick = () => specStep(-1); $('specNext').onclick = () => specStep(1);
$('bPause').onclick = () => togglePause();
function myInput() {
  const L = keys.ArrowLeft || keys.KeyA, Rr = keys.ArrowRight || keys.KeyD;
  let steer = (Rr ? 1 : 0) - (L ? 1 : 0);
  if (joy.id !== null) { const ax = Math.abs(joy.x); steer = ax < 0.12 ? 0 : Math.sign(joy.x) * Math.min(1, (ax - 0.12) / 0.7); }
  return {
    steer,
    gas: 1,
    brake: !!(keys.ArrowDown || keys.KeyS || (joy.id !== null && joy.y > 0.72 && Math.abs(joy.x) < 0.6)),
    drift: !!(keys.Space || keys.ShiftLeft || keys.ShiftRight || touch.drift),
  };
}
let paused = false;
function togglePause() {
  if (!race || race.ended) return;
  paused = !paused;
  $('pause').hidden = !paused;
  $('bRestart').hidden = race.online;
  if (!paused) lastT = performance.now();
  if (!race.online && paused) audio.engine(0, false, false);
}
$('bResume').onclick = () => togglePause();
$('bRestart').onclick = () => { paused = false; $('pause').hidden = true; startSolo(); };
$('bQuit').onclick = () => { paused = false; $('pause').hidden = true; quitRace(); };
function quitRace() {
  disposeRace();
  if (net) { net.close(); net = null; }
  audio.bgm('bgm-menu', 0.8);
  show('title');
}

// ---------------- HUD ----------------
function center(txt, cls = '') {
  const c = $('center'); c.textContent = txt; c.className = ''; void c.offsetWidth; c.className = 'pop ' + cls;
  clearTimeout(center.t); center.t = setTimeout(() => { c.textContent = ''; }, cls === 'keep' ? 99999 : 1100);
}
function fmt(ms) { if (ms == null) return '--:--.--'; ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; }
let miniBase = null, miniX = null;
function drawMiniBase() {
  const tr = race.tr, b = tr.bounds, cv = document.createElement('canvas'); cv.width = cv.height = 300;
  const sc = 250 / Math.max(b.maxx - b.minx, b.maxz - b.minz), ox = (300 - (b.maxx - b.minx) * sc) / 2, oz = (300 - (b.maxz - b.minz) * sc) / 2;
  miniX = (x, z) => [ox + (x - b.minx) * sc, oz + (z - b.minz) * sc];
  const g = cv.getContext('2d'); g.lineJoin = g.lineCap = 'round';
  const path = () => { g.beginPath(); for (let i = 0; i <= N; i += 6) { const k = i % N; const [x, y] = miniX(tr.x[k], tr.z[k]); i ? g.lineTo(x, y) : g.moveTo(x, y); } };
  path(); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 20; g.stroke();
  path(); g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 11; g.stroke();
  const [sx, sy] = miniX(tr.x[0], tr.z[0]); g.fillStyle = '#111'; g.fillRect(sx - 8, sy - 8, 16, 16); g.fillStyle = '#fff'; g.fillRect(sx - 8, sy - 8, 8, 8); g.fillRect(sx, sy, 8, 8);
  miniBase = cv;
}
function drawMini() {
  const cv = $('mini'), g = cv.getContext('2d');
  g.clearRect(0, 0, 300, 300); g.drawImage(miniBase, 0, 0);
  for (const h of race.hazards.values()) { if (h.dead) continue; const [x, y] = miniX(h.x, h.z); g.fillStyle = h.k === 'banana' ? '#ffd92e' : h.k === 'hball' ? '#ff7a1a' : '#fff'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  const list = [...race.racers].filter(r => !r.gone).sort((a) => (a.me || a === race.focus) ? 1 : -1);
  for (const r of list) {
    const [x, y] = miniX(r.k.x, r.k.z);
    const big = r.me || (!race.me && r === race.focus);
    g.fillStyle = r.char.color; g.strokeStyle = big ? '#ffd23a' : '#fff'; g.lineWidth = big ? 5 : 3;
    g.beginPath(); g.arc(x, y, big ? 11 : 8, 0, 7); g.fill(); g.stroke();
  }
}
let hudT = 0;
function board(ranked) {
  const el = $('board');
  el.innerHTML = ranked.map((r, i) => {
    const lap = Math.max(1, Math.min(race.laps, Math.floor(r.k.prog / N) + 1));
    return `<div class="${r === race.focus ? 'on' : ''}${r.k.finished ? ' fin' : ''}${r.team != null ? ' t' + r.team : ''}"><b>${i + 1}</b><i style="background:${r.char.color}"></i><span>${esc(r.name)}</span><small>${r.k.finished ? '완주' : lap + '/' + race.laps}</small></div>`;
  }).join('');
}
function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function hud(now, dt) {
  hudT += dt; if (hudT < 0.05) return; hudT = 0;
  if (race.teams) { const ts = teamScore(rankList()); $('tsR').textContent = ts[0]; $('tsB').textContent = ts[1]; }
  if (!race.me) {
    const ranked = rankList(), lead = ranked[0];
    board(ranked);
    $('lapNum').textContent = Math.max(1, Math.min(race.laps, Math.floor(lead.k.prog / N) + 1));
    $('timeTxt').textContent = fmt(Math.max(0, now - race.t0));
    $('specName').textContent = race.focus ? `${rankList().indexOf(race.focus) + 1}위 ${race.focus.name}` : '';
    drawMini();
    return;
  }
  const me = race.me, k = me.k;
  const ranked = rankList(), rk = ranked.indexOf(me) + 1;
  if (rk !== race.lastRank) { $('rankNum').textContent = rk; const e = $('rankNum'); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); race.lastRank = rk; }
  const lap = Math.max(1, Math.min(race.laps, Math.floor(k.prog / N) + 1));
  $('lapNum').textContent = lap;
  $('timeTxt').textContent = fmt(k.finished ? (k.finTime != null ? k.finTime : race.myFinT - race.t0) : Math.max(0, now - race.t0));
  $('spdNum').textContent = Math.round(Math.abs(k.spd) * 3.6 * 1.1);
  const dl = $('driftLv');
  dl.style.setProperty('--w', k.drift ? Math.min(100, (k.driftT / 2.6) * 100) + '%' : '0%');
  dl.style.setProperty('--dc', ['#8fa0c0', '#4aa8ff', '#ff9a1a', '#ff4fd8'][k.driftLv]);
  drawMini();
}

// ---------------- 카메라 ----------------
let camIntro = 0, shake = 0, camYaw = null;
const camPos = new T.Vector3(), camLook = new T.Vector3();
function updateCamera(now, dt) {
  const tr = race.tr;
  const toGo = race.t0 - now;
  if (race.podium) return podiumCamera(now, dt);
  if (window.__kartCam) { const c = window.__kartCam; camera.position.set(...c.pos); camera.lookAt(...c.look); camera.fov = c.fov || 60; camera.updateProjectionMatrix(); return; }
  if (!race.me) { if ((race.specHold || 0) > 0) race.specHold -= dt; else race.specIdx = 0; }
  const k = (race.focus || race.me || race.racers[0]).k;
  if (toGo > 3000) {
    // 출발 전: 출발선 주위를 크게 돈다
    camIntro += dt;
    const a = camIntro * 0.35 + 0.6, c = tr.point(-10 / tr.seg, 0);
    camera.position.set(c.x + Math.sin(a) * 34, c.y + 13 - camIntro * 1.5, c.z + Math.cos(a) * 34);
    camera.lookAt(c.x, c.y + 1, c.z);
    camPos.copy(camera.position); camLook.set(c.x, c.y + 1, c.z);
    camera.fov = 60; camera.updateProjectionMatrix();
    return;
  }
  const fin = k.finished;
  const tall = camera.aspect < 1; // 폰 세로: 좌우가 좁으니 조금 더 뒤·위에서
  const sp_ = !race.me;
  const back = (fin && !sp_ ? 7.5 : sp_ ? 10.5 : 6.6) + (tall ? 2.2 : 0), up = (fin && !sp_ ? 2.4 : sp_ ? 4.6 : 2.7) + (tall ? 0.9 : 0);
  let yawT = k.h + k.yawVis * 0.5 + (fin && !sp_ ? Math.sin(now / 2400) * 1.6 + Math.PI * 0.85 : 0);
  if (k.spd < -1) yawT += Math.PI;
  if (camYaw == null || toGo > 2900) camYaw = yawT;
  // 위치는 카트에 바로 붙이고, 도는 방향만 부드럽게 따라간다(고속에서도 카트가 멀어지지 않게)
  let dy = yawT - camYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
  camYaw += dy * Math.min(1, dt * (k.spinT > 0 ? 1.5 : sp_ ? 2.5 : 5));
  const tx = k.x - Math.sin(camYaw) * back, tz = k.z - Math.cos(camYaw) * back;
  const gy = race.world.groundAt(tx, tz);
  const ty = Math.max(k.y - k.hop * 0.6 + up, gy + 1.2);
  const f = toGo > 0 ? 1 - Math.exp(-dt * 3) : sp_ ? 1 - Math.exp(-dt * 5) : 1;
  camPos.x += (tx - camPos.x) * f; camPos.z += (tz - camPos.z) * f; camPos.y += (ty - camPos.y) * (1 - Math.exp(-dt * 8));
  const lx = k.x + Math.sin(camYaw) * 6, lz = k.z + Math.cos(camYaw) * 6, ly = k.y + 1.4;
  camLook.set(lx, ly, lz);
  camera.position.copy(camPos);
  if (shake > 0) { shake -= dt; camera.position.x += (Math.random() - 0.5) * shake * 0.8; camera.position.y += (Math.random() - 0.5) * shake * 0.6; }
  camera.lookAt(camLook);
  const sp = Math.max(0, k.spd) / MAXSPD;
  const fov = 62 + sp * 8 + (k.boostT > 0 ? 6 : 0) + (tall ? 12 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  $('speedLines').classList.toggle('on', k.boostT > 0 || k.starT > 0);
}

// ---------------- 한 프레임 ----------------
let lastT = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const t = performance.now();
  let dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  if (!race) { renderIdle(dt); return; }
  if (screen === 'garage' && garage) { renderIdle(dt); return; }
  if (paused && !race.online) { render(); return; }
  if (race.podium) { podiumFrame(dt); return; }
  const now = race.clock();
  race.time += dt;
  const toGo = race.t0 - now;

  // 카운트다운
  if (toGo > 0) {
    const n = Math.ceil(toGo / 1000);
    if (n <= 3 && n !== race.cd) {
      race.cd = n; center(String(n)); audio.play('countdown', 0.9);
      if (n === 3 && race.me) feed(IS_TOUCH ? '팁: GO 직전에 드리프트 버튼을 누르면 로켓 스타트!' : '팁: GO 직전에 Space를 누르면 로켓 스타트!');
      race.world.lights.forEach((l, i) => { const on = i < 4 - n; l.material.emissive.setHex(on ? 0xff2020 : 0); l.material.color.setHex(on ? 0xff4040 : 0x331111); });
    }
    if (race.phase === 'intro' && toGo < 4000) { race.phase = 'count'; audio.bgm(race.def.bgm, 0.9); }
  } else if (race.phase !== 'race' && race.phase !== 'done') {
    race.phase = 'race'; center('GO!', 'go'); audio.play('go', 1);
    if (race.me && race.rsPress != null) {
      if (race.rsPress <= 900) { race.me.k.boostT = 1.5; race.me.k.spd = 16; audio.play('boost', 1); setTimeout(() => center('로켓 스타트!', 'small go'), 450); }
      else if (race.rsPress > 2300) { spinOut(race.me.k, 0.8); setTimeout(() => center('너무 빨랐어요', 'small'), 450); }
    }
    for (const r of race.racers) if (r.bot && r.local && Math.random() < 0.35) r.k.boostT = 0.8 + Math.random() * 0.5;
    race.world.lights.forEach(l => { l.material.emissive.setHex(0x20ff40); l.material.color.setHex(0x40ff60); });
    audio.bgm(race.def.bgm, 0.9);
  }

  // 봇이 맞출 기준: 나(관전이면 가장 앞선 사람)
  { const hp = race.racers.filter(r => !r.bot && !r.gone).map(r => r.k.prog);
    race.refProg = race.me ? race.me.k.prog : hp.length ? Math.max(...hp) : Math.max(...race.racers.map(r => r.k.prog)); }

  // 로켓 스타트: 카운트다운 중 처음 누른 때를 기억한다
  if (toGo > 0 && race.me && race.rsPress == null && (keys.Space || keys.ShiftLeft || keys.ArrowUp || keys.KeyW || touch.drift)) race.rsPress = toGo;

  // 물리 (작은 걸음으로 나눠서)
  const steps = Math.ceil(dt / (1 / 90)), h = dt / steps;
  const running = race.phase === 'race';
  for (const r of race.racers) {
    if (r.gone) continue;
    if (!r.local) { interpRemote(r, now, dt); continue; }
    const k = r.k;
    // 봇 실력: 난이도 + 따라잡기/봐주기
    if (r.bot) {
      const lead = (k.prog - race.refProg) * race.tr.seg;
      let m = r.skill;
      if (!race.online || true) { if (lead > 70) m *= 0.93; else if (lead > 30) m *= 0.97; else if (lead < -110) m *= 1.08; else if (lead < -50) m *= 1.04; }
      k.mul += (m - k.mul) * Math.min(1, dt * 0.8);
    }
    let inp;
    if (!running) inp = { steer: 0, gas: 0, brake: false, drift: false };
    else if (r.bot || k.finished || window.__kartAuto) inp = botInput(r, race, dt);
    else inp = myInput();
    for (let i = 0; i < steps; i++) stepKart(k, inp, race.tr, h, loc);
    // 점프대: 오르막에서는 카트를 들어 올리고, 끝에서 하늘로 튕긴다. 착지하면 부스터
    if (race.world.ramps.length && k.spinT <= 0) {
      for (const rp of race.world.ramps) {
        const ds = (((k.prog - rp.s0) % N) + N) % N;
        if (ds < rp.L && k.spd > 3 && k.hopV <= 0.5) {
          const hgt = rp.H * Math.pow(ds / rp.L, 1.4);
          if (k.hop < hgt) { k.y += hgt - k.hop; k.hop = hgt; k.hopV = 0; }
          k.ramp = rp;
        } else if (k.ramp === rp && ds >= rp.L && ds < rp.L + 6 / race.tr.seg) {
          k.hopV = 6.5 + Math.max(0, k.spd) * 0.14; k.ramp = null; k.jumped = true; k.drift = 0;
          if (r.me) audio.play('throw', 0.7, 0.8);
        }
      }
      if (k.jumped && k.hop <= 0 && k.hopV === 0) { k.jumped = false; k.boostT = Math.max(k.boostT, 0.8); if (r.me) { audio.play('boost', 0.7); shake = 0.25; } fxBurst(k.x, k.y + 0.3, k.z, 2); }
    }
    if (running && !k.finished) {
      // 바퀴
      if (k.prog >= race.laps * N) finishRacer(r, now);
      else if (r.me) {
        const lap = Math.floor(k.prog / N) + 1;
        if (lap > race.lapShown && lap >= 2) {
          if (lap === race.laps) { center('마지막 바퀴!', 'small go'); audio.play('finallap', 1); audio.bgm('bgm-final', 0.9); }
          else { center(`LAP ${lap}`, 'small'); audio.play('lap', 0.9); }
        }
        race.lapShown = Math.max(race.lapShown, lap);
      }
    }
    tickRoll(r, dt);
    // 봇이 어딘가에 끼어 2.5초 넘게 못 가면 트랙 가운데로 되돌린다
    if (running && r.bot) {
      if (Math.abs(k.spd) < 3 && k.spinT <= 0) r.stuckT = (r.stuckT || 0) + dt; else r.stuckT = 0;
      if (r.stuckT > 2.5) { const p = race.tr.point(k.prog, 0); k.x = p.x; k.z = p.z; k.h = p.h; k.spd = 8; k.li = ((Math.floor(k.prog) % N) + N) % N; r.stuckT = 0; fxBurst(p.x, p.y + 1, p.z, 2); }
    }
    if (running && r.bot && !k.finished && botWantsItem(r, race)) useItem(r);
    // 이벤트 소리
    for (const e of k.events) {
      if (r.me) {
        if (e === 'miniturbo') audio.play('spark', 0.8), audio.play('boost', 0.55);
        if (e === 'wall' || e === 'bump') audio.play('bump', 0.55), shake = 0.18;
        if (e === 'driftlv') audio.play('spark', 0.35, 1 + k.driftLv * 0.15);
        if (e === 'hop') audio.play('click', 0.25, 0.6);
      }
    }
    k.events.length = 0;
  }
  if (race.lapShown === 0) race.lapShown = 1;

  // 상자·발판·카트끼리
  if (running) {
    const W = race.world, tr = race.tr;
    for (const r of race.racers) {
      if (r.gone) continue;
      const k = r.k;
      for (const bx of W.boxes) {
        if (bx.off > 0) continue;
        if (Math.hypot(k.x - bx.x, k.z - bx.z) < 2.3) { bx.off = 2.2; bx.mesh.visible = false; fxBurst(bx.x, bx.y + 1.2, bx.z, 2); if (r.local) giveItem(r); }
      }
      if (!r.local) continue;
      for (const p of W.pads) {
        const ds = ((((k.prog - p.s) % N) + N) % N);
        const dd = Math.min(ds, N - ds) * tr.seg;
        if (dd < 3 && Math.abs(k.lat - p.lat) < 2.2 && k.boostT < 0.8) { k.boostT = 1.0; if (r.me) audio.play('boost', 0.8); }
      }
      for (const o of race.racers) {
        if (o === r || o.gone) continue;
        if (o.k.starT > 0 && k.starT <= 0 && !sameTeam(r.id, o.id) && Math.hypot(o.k.x - k.x, o.k.z - k.z) < 2.3) { if (spinOut(k, 1.2)) onSpun(r, o.id, 'star'); continue; }
        if (o.local && o.id < r.id) continue; // 로컬끼리는 한 번만
        bump(k, o.k, o.local);
      }
    }
    hazardsTick(now);
  }
  for (const rg of race.rings) { rg.t += dt; const s = 1 + rg.t * 38; rg.mesh.scale.set(s, 1, s); rg.mesh.material.opacity = Math.max(0, 0.9 - rg.t * 1.3); if (rg.t > 0.8) scene.remove(rg.mesh); }
  race.rings = race.rings.filter(r => r.t <= 0.8);

  // 내 카트 소리
  const focus = race.me || rankList()[Math.min(race.specIdx, race.racers.length - 1)] || race.racers[0];
  race.focus = focus;
  const mk = focus.k;
  audio.engine(Math.min(1.2, Math.abs(mk.spd) / MAXSPD), mk.boostT > 0, toGo < 3500 && !!race.me);
  if (race.me && mk.drift && mk.spd > 8 && running) { if (!race.driftLoop) race.driftLoop = audio.loop('drift', 0.28); }
  else if (race.driftLoop) { race.driftLoop.stop(); race.driftLoop = null; }
  if (mk.starT <= 0 && race.starOn) audio.musicRate(1);
  race.starOn = mk.starT > 0;

  // 끝났나
  if (!race.online && !race.ended) {
    const allDone = race.racers.every(r => r.k.finished);
    if (race.me.k.finished && (allDone || now - race.myFinT > 9000)) {
      const order = [...race.finOrder, ...rankList().filter(r => !r.k.finished).map(r => ({ id: r.id, time: null }))];
      showResults(order);
    }
  }
  if (race && race.online) sendPoses(now);
  if (!race) return;
  if (!race.online && race.me && running && !race.me.k.finished) {
    race.recT += dt;
    while (race.recT >= 0.1) { race.recT -= 0.1; const q = race.me.k, R2 = (v) => Math.round(v * 100) / 100; race.rec.push(R2(q.x), R2(q.y), R2(q.z), R2(q.h), R2(q.yawVis)); }
  }
  if (race.ghost) {
    const G = race.ghost, d = G.data, f = Math.max(0, (now - race.t0) / 100), i = Math.floor(f), a = f - i, n = d.length / 5;
    const g = G.k;
    if (i + 1 < n) {
      const A = i * 5, B = A + 5;
      g.x = d[A] + (d[B] - d[A]) * a; g.y = d[A + 1] + (d[B + 1] - d[A + 1]) * a; g.z = d[A + 2] + (d[B + 2] - d[A + 2]) * a;
      g.h = lerpAng(d[A + 3], d[B + 3], a); g.yawVis = d[A + 4]; g.spd = Math.hypot(d[B] - d[A], d[B + 2] - d[A + 2]) * 10;
      G.view.root.visible = toGo < 0;
    } else G.view.root.visible = false;
    G.view.update(g, dt, camera);
  }

  // 보이는 것
  updateCamera(now, dt);
  for (const f of race.world.update) f(dt, race.time, camera);
  for (const r of race.racers) if (!r.gone) { r.view.update(r.k, dt, camera); fxKart(r, dt); }
  const ph = innerHeight * renderer.getPixelRatio() / Math.tan(camera.fov * Math.PI / 360) / 2;
  race.fx.add.update(dt, ph); race.fx.dust.update(dt, ph);
  const sun = race.world.sun, sd = sun.userData.dir;
  sun.position.set(mk.x + sd.x * 120, mk.y + sd.y * 120, mk.z + sd.z * 120); sun.target.position.set(mk.x, mk.y, mk.z);
  hud(now, dt);
  render();
}
function render() { if (composer) composer.render(); else renderer.render(scene, camera); }

// 메뉴 뒤 배경(레이스가 없을 때): 아무것도 그리지 않는다
function renderIdle(dt) {
  if (screen === 'garage' && garage) { renderer.toneMappingExposure = 1; garage.render(dt, innerWidth, innerHeight); }
}

// ---------------- 결과 + 3D 시상식 ----------------
function showResults(order) {
  if (!race || race.ended) return;
  race.ended = true;
  const meId = race.myId;
  const rows = order.map((o, i) => ({ ...o, r: race.byId[o.id], i })).filter(x => x.r);
  race.resultRows = rows;
  $('resTrack').textContent = race.def.name;
  const ul = $('resList'); ul.innerHTML = '';
  for (const x of rows) {
    const li = document.createElement('li'); li.className = (x.id === meId ? 'me' : '') + (x.r.team != null ? ' t' + x.r.team : '');
    li.innerHTML = `<span class="rk">${x.i + 1}</span><span class="av" style="background-color:${x.r.char.color};background-image:url(${portrait(x.r.char)})"></span><span class="nm"><b></b><small>${x.r.char.role}${x.r.bot ? ' · AI' : ''}</small></span><span class="tm">${x.time != null ? fmt(x.time) : x.r.bot ? '—' : '완주 못 함'}</span>`;
    li.querySelector('b').textContent = x.r.name;
    ul.appendChild(li);
  }
  // 기록 알림(혼자 달리기) / 팀전 점수
  const rec = $('resRecord');
  if (race.teams) {
    const ts = teamScore(rows.map(x => x.r));
    race.teamWin = ts[0] === ts[1] ? -1 : ts[0] > ts[1] ? 0 : 1;
    rec.hidden = false;
    rec.innerHTML = `<b>${race.teamWin < 0 ? '무승부' : race.teamWin ? '파랑팀 승리!' : '빨강팀 승리!'}</b> 빨강 ${ts[0]} : ${ts[1]} 파랑`;
  } else 
  if (!race.online && race.me && race.me.k.finished) {
    const mine = rows.find(x => x.id === meId);
    rec.hidden = false;
    rec.innerHTML = race.newRecord ? `<b>새 기록!</b> ${fmt(mine && mine.time)}${race.prevBest ? ` <small>(전 기록 ${fmt(race.prevBest)})</small>` : ''}` : `내 최고 기록 ${fmt((bestOf(race.def.id) || {}).t)}`;
  } else rec.hidden = true;
  const wasOnline = race.online;
  $('bResAgain').textContent = wasOnline ? '대기실로' : race.ta ? '다시 도전' : '한 판 더';
  $('bResAgain').onclick = () => { audio.play('click', 0.6); disposeRace(); if (wasOnline && net) { show('room'); renderRoom(); audio.bgm('bgm-menu', 0.8); } else startSolo(); };
  setTimeout(() => { if (race && race.ended) startPodium(rows); }, wasOnline ? 1200 : 2200);
}
$('bResMenu').onclick = () => { audio.play('click', 0.6); disposeRace(); if (net) { net.close(); net = null; } audio.bgm('bgm-menu', 0.8); show('title'); };

function numTex(n, col) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 128, 128);
  g.font = '900 96px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillText(n, 66, 70); g.fillStyle = '#fff'; g.fillText(n, 64, 66);
  const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
}
function startPodium(rows) {
  const tr = race.tr, s0 = 20 / tr.seg;
  const C = tr.point(s0, 0), h = C.h, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
  const grp = new T.Group();
  const carpet = new T.Mesh(new T.CylinderGeometry(9, 9.4, 0.3, 48), new T.MeshStandardMaterial({ color: 0xb3232f, roughness: 0.8 }));
  carpet.position.y = 0.15; carpet.receiveShadow = true; grp.add(carpet);
  const tiers = [[0, 2.3, '#f1b400', 1], [-3.5, 1.5, '#aeb6c4', 2], [3.5, 0.95, '#c77a3e', 3]];
  const tops = [];
  for (const [off, ht, col, n] of tiers) {
    const side = new T.MeshStandardMaterial({ color: col, metalness: 0.45, roughness: 0.35 });
    const face = new T.MeshStandardMaterial({ map: numTex(String(n), col), metalness: 0.3, roughness: 0.4 });
    const box = new T.Mesh(new T.BoxGeometry(3.3, ht, 3.3), [side, side, side, side, face, side]);
    box.position.set(off, 0.3 + ht / 2, 0); box.castShadow = true; box.receiveShadow = true; grp.add(box);
    tops.push({ off, y: 0.3 + ht });
  }
  // 앞면(+z)이 카메라 쪽(트랙 앞)을 보게
  grp.position.set(C.x, C.y, C.z); grp.rotation.y = h;
  scene.add(grp);
  for (const r of race.racers) r.view.root.visible = false;
  for (const hz of race.hazards.values()) if (hz.mesh) hz.mesh.visible = false;
  if (race.ghost) race.ghost.view.root.visible = false;
  const podK = [];
  rows.slice(0, 3).forEach((x, i) => {
    const t = tops[i], k = x.r.k;
    const wx = C.x - rx * t.off, wz = C.z - rz * t.off; // 무리의 로컬 +x = 오른쪽의 반대
    Object.assign(k, { x: wx, z: wz, y: C.y + t.y, h: h, spd: 0, hop: 0, hopV: 0, spinT: 0, dizzyT: 0, starT: 0, boostT: 0, drift: 0, driftLv: 0, yawVis: 0, steerVis: 0, squash: 0, off: false });
    x.r.view.root.visible = true;
    podK.push({ r: x.r, baseY: C.y + t.y, rank: i });
  });
  race.podium = { C, fx, fz, rx, rz, t: 0, podK, fireT: 0 };
  audio.engine(0, false, false);
  if (race.driftLoop) { race.driftLoop.stop(); race.driftLoop = null; }
  audio.bgm('bgm-win', 0.9); audio.play('finish', 0.8);
  if (!race.crowd) race.crowd = audio.loop('crowd', 0.3);
  $('hud').hidden = true;
  center('');
  $('podTitle').hidden = false;
  $('podTitle').innerHTML = race.teams && race.teamWin != null ? `<small>${race.def.name} · 팀전</small><b>${race.teamWin < 0 ? '무승부' : race.teamWin ? '파랑팀 승리' : '빨강팀 승리'}</b>` : rows[0] ? `<small>${race.def.name}</small><b>우승 ${esc(rows[0].r.name)}</b>` : '';
  setTimeout(() => { if (!race || !race.podium) return; $('podTitle').hidden = true; show('results'); $('scr-results').classList.add('over'); }, 3600);
}
function podiumCamera(now, dt) {
  const P = race.podium; P.t += dt;
  const a = Math.sin(P.t * 0.25) * 0.55, R = 12.5 - Math.min(3, P.t * 0.6);
  const dx = P.fx * Math.cos(a) - P.rx * Math.sin(a), dz = P.fz * Math.cos(a) - P.rz * Math.sin(a);
  // 결과 표가 오른쪽을 덮으면 시상대가 왼쪽에 오도록 살짝 옆으로
  const shift = document.getElementById('scr-results').classList.contains('over') && innerWidth > 760 ? 3.2 : 0;
  camera.position.set(P.C.x + dx * R - P.rx * shift, P.C.y + 4.2, P.C.z + dz * R - P.rz * shift);
  camera.lookAt(P.C.x - P.rx * shift, P.C.y + 2.4, P.C.z - P.rz * shift);
  camera.fov += (55 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
}
function podiumFrame(dt) {
  const P = race.podium;
  race.time += dt;
  podiumCamera(0, dt);
  for (const q of P.podK) {
    const k = q.r.k;
    k.y = q.baseY + (q.rank === 0 ? Math.abs(Math.sin(P.t * 4)) * 0.7 : Math.abs(Math.sin(P.t * 3 + q.rank)) * 0.25);
    k.hop = 0; k.squash = q.rank === 0 && Math.sin(P.t * 4) > 0.97 ? 0.15 : k.squash * 0.9;
    q.r.view.update(k, dt, camera);
  }
  // 불꽃놀이와 색종이
  P.fireT -= dt;
  if (P.fireT <= 0) {
    P.fireT = 0.45 + Math.random() * 0.4;
    const ox = P.C.x + (Math.random() - 0.5) * 30 - P.fx * 12, oz = P.C.z + (Math.random() - 0.5) * 30 - P.fz * 12, oy = P.C.y + 12 + Math.random() * 10;
    const col = new T.Color().setHSL(Math.random(), 1, 0.6);
    for (let i = 0; i < 60; i++) { const u = Math.random() * 2 - 1, th = Math.random() * 6.28, sq = Math.sqrt(1 - u * u), sp = 9 + Math.random() * 3; race.fx.add.emit(ox, oy, oz, sq * Math.cos(th) * sp, u * sp, sq * Math.sin(th) * sp, 1.3, 0.9, col.r, col.g, col.b, 3); }
    audio.play('spark', 0.25, 0.6 + Math.random() * 0.4);
  }
  for (let i = 0; i < 3; i++) { const c = new T.Color().setHSL(Math.random(), 0.9, 0.6); race.fx.dust.emit(P.C.x + (Math.random() - 0.5) * 16, P.C.y + 12, P.C.z + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, 4, 0.35, c.r, c.g, c.b, 0.5); }
  for (const f of race.world.update) f(dt, race.time, camera);
  const ph = innerHeight * renderer.getPixelRatio() / Math.tan(camera.fov * Math.PI / 360) / 2;
  race.fx.add.update(dt, ph); race.fx.dust.update(dt, ph);
  const sun = race.world.sun, sd = sun.userData.dir;
  sun.position.set(P.C.x + sd.x * 120, P.C.y + sd.y * 120, P.C.z + sd.z * 120); sun.target.position.set(P.C.x, P.C.y, P.C.z);
  render();
}



// ---------------- 색종이 ----------------
function confetti(n) {
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30';
  document.body.appendChild(cv); cv.width = innerWidth; cv.height = innerHeight;
  const g = cv.getContext('2d'), cols = ['#ffd23a', '#ff3b47', '#2fb0ff', '#3ad28f', '#ff8ad0', '#ffffff'];
  const P = Array.from({ length: n }, () => ({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)], w: 6 + Math.random() * 6 }));
  let life = 0;
  const step = () => {
    life++; g.clearRect(0, 0, cv.width, cv.height);
    for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -3, p.w, 6 * Math.abs(Math.cos(life * 0.1 + p.r))); g.restore(); }
    if (life < 260) requestAnimationFrame(step); else cv.remove();
  };
  step();
}

// ---------------- 시작 ----------------
// 캐릭터 그림 미리 받아 두기
for (const c of CHARS) { const i = new Image(); i.src = portrait(c); }
if (ROOM_Q) { S.mode = 'online'; const b = $('bOnline'); b.classList.add('primary'); $('bSolo').classList.remove('primary'); b.innerHTML = `<b>방 ${ROOM_Q} 들어가기</b><small>캐릭터를 고르면 바로 입장해요</small>`; }
requestAnimationFrame(frame);
// 디버그용(검사 스크립트가 상태를 읽는다)
window.__kart = { get race() { return race; }, S, startSolo, keys, touch };
