/* Playground pack renderer. Transport, sound preferences and results stay in the
   main app; this module only draws the current server state. */
const PartyGames = (() => {
  const keys = ['freeze', 'paint', 'fishing'];
  const art = {};
  let lastKey = '', lastSignal = '', lastSeq = null;
  const paintColor = id => `hsl(${(id * 137.508) % 360} 72% 65%)`;
  function reset() { lastKey = ''; lastSignal = ''; lastSeq = null; }
  function image(key) {
    if (!art[key]) { art[key] = new Image(); art[key].src = 'sprites/thumb-' + key + '.jpg'; }
    return art[key];
  }
  // 게임 오브젝트 그림 (없으면 호출한 쪽이 이모지로 되돌아간다)
  function spr(name) {
    const k = 'spr:' + name;
    if (!art[k]) { art[k] = new Image(); art[k].src = 'sprites/' + name + '.png'; }
    return art[k];
  }
  // 그림을 상자 가운데에 비율 유지로. 아직 안 실려 있으면 false를 돌려 이모지로 대체하게 한다.
  function icon(c, name, cx, cy, size) {
    const im = spr(name);
    if (!im.complete || !im.naturalWidth) return false;
    const k = size / Math.max(im.naturalWidth, im.naturalHeight);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    c.drawImage(im, cx - w / 2, cy - h / 2, w, h);
    return true;
  }
  function box(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); }
  }
  function text(c, value, x, y, size = 18, color = '#fff', align = 'center') {
    c.font = `800 ${size}px Pretendard, sans-serif`; c.textAlign = align;
    c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(String(value), x, y);
  }
  function cover(c, im, x, y, w, h) {
    if (!im.complete || !im.naturalWidth) return;
    const ratio = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const sw = w / ratio, sh = h / ratio;
    c.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function player(e, row, x, y, radius, info) {
    const c = e.ctx, meta = e.roster.get(row[0]) || { nick: '?', ci: 0 };
    const col = e.m.mode === 'paint' ? paintColor(row[0]) : e.colors[meta.ci % e.colors.length] || '#ffc65c';
    c.save();
    if (!row[3]) c.globalAlpha = .45;
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x, y + radius * .65, radius, radius * .35, 0, 0, 7); c.fill();
    c.fillStyle = col; c.strokeStyle = row[0] === e.id ? '#fff' : '#ffffff80'; c.lineWidth = row[0] === e.id ? 3 : 1;
    c.beginPath(); c.arc(x, y, radius, 0, 7); c.fill(); c.stroke();
    const im = e.character(meta.ci);
    if (im && im.complete && im.naturalWidth) c.drawImage(im, x - radius * 1.1, y - radius * 1.55, radius * 2.2, radius * 2.2);
    else text(c, '☺', x, y, radius * 1.5, '#182942');
    const label = meta.nick + (info ? ' ' + info : '');
    const fs = Math.max(10, Math.min(15, radius * .85));
    c.font = `800 ${fs}px Pretendard, sans-serif`;
    const lw = c.measureText(label).width + 12;
    box(c, x - lw / 2, y + radius + 3, lw, fs + 8, 6, row[0] === e.id ? '#ffd36f' : '#14243dee');
    text(c, label, x, y + radius + fs / 2 + 7, fs, row[0] === e.id ? '#322a1d' : '#fff');
    c.restore();
  }
  function header(e, title, hint, color) {
    const c = e.ctx, w = e.W / e.dpr;
    const short = e.H / e.dpr < 500;
    // 화면 가운데 위에는 남은 시간 뱃지가 떠 있다 — 그 아래로 내려야 제목이 안 가린다
    box(c, 12, short ? 52 : 78, w - 24, short ? 62 : 80, 18, '#111b36ed', color);
    text(c, title, w / 2, short ? 74 : 104, Math.min(e.host ? 28 : 23, w / (title.length * 1.05)), color);
    text(c, hint, w / 2, short ? 98 : 137, e.host ? 16 : 12, '#eef2ff');
    // Expose meaningful live status to assistive technologies and UI testing.
    const el = document.getElementById('partyStatus');
    if (el && el.textContent !== title + '. ' + hint) el.textContent = title + '. ' + hint;
  }
  function board(e, ratio) {
    const w = e.W / e.dpr, h = e.H / e.dpr;
    const short = h < 500, top = short ? 130 : 178, foot = e.host || short ? 38 : 155;
    const maxW = e.host && w > 900 ? w - 270 : !e.host && short ? w - 260 : w - 28;
    const bw = Math.min(maxW, Math.max(80, h - top - foot) * ratio), bh = bw / ratio;
    const x = (e.host && w > 900 ? w - 245 : w) / 2 - bw / 2;
    box(e.ctx, x - 5, top - 5, bw + 10, bh + 10, 15, '#eef7fa', '#ffffff');
    return { x, y: top, w: bw, h: bh };
  }
  function leaders(e, rows, unit) {
    const w = e.W / e.dpr, h = e.H / e.dpr;
    if (!e.host || w <= 900) return;
    const c = e.ctx, sorted = rows.filter(r => !r[4]).slice().sort((a, b) =>
      (e.m.mode === 'freeze' ? b[3] - a[3] : 0) || b[5] - a[5]);
    const count = Math.min(sorted.length, Math.floor((h - 208) / 42));
    box(c, w - 236, 154, 220, 56 + count * 42, 18, '#111b36ef', '#59779c');
    text(c, '실시간 순위', w - 126, 183, 18, '#ffda87');
    sorted.slice(0, count).forEach((r, i) => {
      const nick = (e.roster.get(r[0]) || {}).nick || '?';
      text(c, `${i + 1}. ${nick}`, w - 220, 226 + i * 42, 14, '#eef3ff', 'left');
      text(c, e.m.mode === 'freeze' && !r[3] ? '탈락' : r[5] + unit, w - 32, 226 + i * 42, 14, '#8fe5e5', 'right');
    });
  }
  function freeze(e, m) {
    const c = e.ctx, pg = m.party, sig = pg.signal;
    const labels = { ready: ['준비! 결승선을 향해', '초록에 이동 · 빨강에 움직이면 즉시 탈락', '#a8edbb'], go: ['▶ 무궁화 꽃이 피었습니다!', '지금 앞으로! 위쪽 꽃밭에 도착하면 완주', '#9af0bd'], warn: ['△ 곧 돌아봐요!', '조이스틱에서 손을 떼고 멈출 준비!', '#ffdb7e'], stop: ['■ 멈춰요!', '한 번이라도 움직이면 아웃!', '#ff8e95'] };
    const ownRow = m.players.find(r => r[0] === e.id);
    const out = !e.host && ownRow && !ownRow[4] && !ownRow[3];
    if (out) header(e, '아웃! 이번 판은 관전해요', '빨간불에 걸렸어요 · 다음 판에 다시 도전!', '#ff8e95');
    else header(e, ...labels[sig || 'ready']);
    const b = board(e, .9), sx = b.w / 900, sy = b.h / 1000;
    c.fillStyle = '#c0dea1'; c.fillRect(b.x, b.y, b.w, b.h);
    for (let i = 0; i < 10; i++) {
      c.fillStyle = i % 2 ? '#b4d98b' : '#c5e3a7'; c.fillRect(b.x, b.y + i * b.h / 10, b.w, b.h / 10);
    }
    c.fillStyle = '#ffdc7f'; c.fillRect(b.x, b.y, b.w, 110 * sy);
    // 결승선 꽃밭 — 가운데는 술래(꽃 인형), 양옆은 꽃
    const fsz = Math.max(18, 52 * sx);
    for (let i = 0; i < 9; i++) {
      const fx = b.x + (i + .5) * b.w / 9, fy = b.y + 40 * sy;
      if (i === 4) {
        // 술래는 '멈춰' 신호일 때 이쪽을 돌아본다 (커지며 강조)
        const look = sig === 'stop' || sig === 'warn';
        if (!icon(c, 'frzdoll', fx, fy, fsz * (look ? 1.5 : 1.15))) text(c, '🌸', fx, fy, fsz);
      } else if (!icon(c, 'frzdoll', fx, fy, fsz * .62)) text(c, '🌼', fx, fy, Math.max(15, 40 * sx));
    }
    text(c, '도착!', b.x + b.w / 2, b.y + 92 * sy, Math.max(12, 20 * sx), '#71512b');
    c.strokeStyle = '#fff'; c.lineWidth = 3; c.setLineDash([9, 6]);
    for (const yy of [110, 900]) { c.beginPath(); c.moveTo(b.x, b.y + yy * sy); c.lineTo(b.x + b.w, b.y + yy * sy); c.stroke(); }
    c.setLineDash([]);
    const infos = new Map(pg.people.map(p => [p.id, p]));
    for (const r of m.players.filter(r => !r[4])) {
      const q = infos.get(r[0]) || {};
      player(e, r, b.x + r[1] * sx, b.y + r[2] * sy, Math.max(e.host ? 16 : 13, 25 * sx), !r[3] ? '✕ 아웃' : q.done ? '✓' : '');
    }
    const me = infos.get(e.id);
    if (!e.host) {
      const y = Math.min(e.H / e.dpr - 15, b.y + b.h + 28);
      text(c, out ? '탈락했어요. 남은 친구들을 응원해 주세요!' : me && me.done ? '🎉 완주! 친구들을 응원해 주세요' : !ownRow || ownRow[4] ? '다음 판부터 함께해요' : '화면을 누르고 위로 밀어 이동 ↑', e.W / e.dpr / 2, y, 13, '#fff');
    }
    leaders(e, m.players, '점');
  }
  function paint(e, m) {
    const c = e.ctx;
    header(e, '🎨 마지막까지 내 색으로!', '이동하면 칠해져요 · 넓게 칠하기는 7초마다', '#9cebea');
    const b = board(e, 20 / 14), tw = b.w / 20, th = b.h / 14;
    if (e.host) icon(c, 'paintcan', b.x + b.w - 46, b.y - 34, 74);   // 판 위에 페인트통
    m.party.tiles.forEach((id, i) => {
      const col = id ? paintColor(id) : '#e7ebef';
      c.fillStyle = col; c.fillRect(b.x + i % 20 * tw + 1, b.y + Math.floor(i / 20) * th + 1, tw - 2, th - 2);
      if (id === e.id) {
        c.strokeStyle = '#20305490'; c.lineWidth = 1.5;
        const x = b.x + i % 20 * tw, y = b.y + Math.floor(i / 20) * th;
        c.beginPath(); c.moveTo(x + 3, y + th - 3); c.lineTo(x + tw - 3, y + 3); c.stroke();
      }
    });
    for (const r of m.players.filter(r => !r[4])) {
      player(e, r, b.x + r[1] / 1000 * b.w, b.y + r[2] / 700 * b.h, Math.max(11, tw * .48), '');
      const q = m.party.people.find(p => p.id === r[0]);
      if (q && q.event === 'splash') {
        c.strokeStyle = '#fff'; c.lineWidth = 2;
        c.beginPath(); c.arc(b.x + r[1] / 1000 * b.w, b.y + r[2] / 700 * b.h, tw * (1.3 + .15 * Math.sin(e.now / 80)), 0, 7); c.stroke();
      }
    }
    leaders(e, m.players, '칸');
    if (!e.host) text(c, '빗금이 내 땅! 상대 색 위로 지나가 빼앗아요', e.W / e.dpr / 2, b.y + b.h + 30, 12, '#fff');
  }
  function fishing(e, m) {
    const c = e.ctx, w = e.W / e.dpr, h = e.H / e.dpr;
    const me = m.party.people.find(p => p.id === e.id), stage = me ? me.stage : 'wait';
    const messages = { ready: ['🎣 낚시를 준비해요', '입질 → 챔질 → 초록 구간에 맞춰 올리기'], wait: ['찌가 움직일 때까지 기다려요', '아직 누르지 마세요. 입질이 오면 챔질!'], bite: ['❗ 물었다! 지금 챔질!', '오른쪽 버튼을 눌러 물고기를 걸어요'], reel: ['초록 구간에서 낚아 올려요!', '움직이는 바늘이 초록 띠 안에 있을 때 버튼!'], rest: ['다시 낚싯대를 준비 중', '연속으로 잡으면 보너스가 올라가요'] };
    header(e, ...(e.host ? ['🎣 보물 낚시 대회', '각자 폰에서 입질을 기다렸다가 타이밍을 맞혀요'] : messages[stage] || messages.wait), stage === 'bite' ? '#ffd66f' : '#9cecf3');
    if (e.host) {
      const ps = m.players.filter(r => !r[4]);
      // 사람이 적으면 열을 줄여 카드를 큼직하게 (4명을 3열로 깔면 둘째 줄이 한 칸만 찬다)
      const cols = ps.length <= 4 ? Math.max(1, Math.min(2, ps.length))
        : ps.length <= 9 ? 3
        : Math.max(2, Math.ceil(Math.sqrt(ps.length * (w / Math.max(1, h - 170)))));
      const rows = Math.ceil(ps.length / cols), cw = (w - 32) / cols, ch = Math.min(300, (h - 202) / Math.max(1, rows));
      const gridTop = 177 + Math.max(0, (h - 202 - ch * rows) / 2);   // 남는 세로는 위아래로 나눠 가운데에
      ps.forEach((r, i) => {
        const q = m.party.people.find(p => p.id === r[0]) || {}, meta = e.roster.get(r[0]) || {};
        const x = 16 + i % cols * cw, y = gridTop + Math.floor(i / cols) * ch;
        box(c, x + 4, y + 4, cw - 8, ch - 8, 13, '#143a50ed', q.stage === 'bite' ? '#ffd66f' : '#377886');
        // 누구 자리인지 한눈에 — 카드 왼쪽 위에 그 아이 캐릭터
        const fim = e.character(meta.ci || 0);
        if (fim && fim.complete && fim.naturalWidth) {
          const fs2 = Math.min(64, ch * .3);
          c.drawImage(fim, x + 16, y + 14, fs2, fs2);
        }
        // 지금 무슨 일이 벌어지는지 그림으로 (예전엔 전부 이모지라 멀리서 안 보였다)
        const art2 = q.event === 'treasure' ? 'fishchest' : q.event === 'gold' ? 'fishgold'
          : q.event === 'fish' ? 'fish' : q.stage === 'reel' ? 'fish' : 'bobber';
        const isz = Math.min(64, ch * .46) * (q.stage === 'bite' ? 1.18 : 1);
        const iy = y + ch * .34 + (q.stage === 'bite' ? Math.sin(e.now / 90) * 4 : 0);   // 입질이면 찌가 까딱거린다
        if (!icon(c, art2, x + cw / 2, iy, isz)) {
          text(c, q.stage === 'bite' ? '❗' : '🫧', x + cw / 2, iy, Math.min(37, ch * .32));
        }
        if (q.stage === 'bite') text(c, '❗', x + cw / 2 + isz * .5, iy - isz * .35, Math.min(26, ch * .2), '#ffd66f');
        text(c, meta.nick || '?', x + cw / 2, y + ch * .68, Math.min(24, cw / 8), '#fff');
        text(c, r[5] + '점', x + cw / 2, y + ch * .86, Math.min(22, ch * .13), '#ffe09b');
        if (q.combo >= 2) text(c, `${q.combo}연속!`, x + cw - 20, y + 30, Math.min(16, cw / 12), '#ffd66f', 'right');
      });
      return;
    }
    const short = h < 500;
    const x = 16, y = short ? 116 : 152, pw = short ? w * .4 - 20 : w - 32, ph = short ? h - 150 : Math.min(225, (h - 330) * .6);
    c.save(); c.beginPath(); c.roundRect(x, y, pw, ph, 18); c.clip();
    cover(c, image('fishing'), x, y, pw, ph);
    c.fillStyle = '#09385366'; c.fillRect(x, y, pw, ph); c.restore();
    const icons = { treasure: '💎', gold: '🐠', fish: '🐟', early: '💨', escaped: '💨', miss: '💦' };
    const bigArt = me && me.event === 'treasure' ? 'fishchest' : me && me.event === 'gold' ? 'fishgold'
      : me && me.event === 'fish' ? 'fish' : (stage === 'wait' || stage === 'bite' || stage === 'ready') ? 'bobber' : null;
    // 찌는 물 위에서 까딱, 입질이면 크게 흔들린다
    const bob = stage === 'bite' ? Math.sin(e.now / 70) * 9 : Math.sin(e.now / 320) * 3;
    if (!bigArt || !icon(c, bigArt, x + pw / 2, y + ph / 2 + bob, Math.min(150, ph * .78))) {
      text(c, me && icons[me.event] || (stage === 'bite' ? '❗' : '🎣'), x + pw / 2, y + ph / 2, 74);
    }
    if (stage === 'bite') text(c, '❗', x + pw / 2 + 52, y + ph / 2 - 42 + bob, 46, '#ffd66f');
    const gy = short ? 128 : y + ph + 22, gh = 134;
    const panelX = short ? w * .4 + 8 : 16, panelW = short ? w - panelX - 156 : w - 32, mid = panelX + panelW / 2;
    box(c, panelX, gy, panelW, gh, 18, '#101e36f5', '#6298a9');
    if (stage === 'reel') {
      const gx = panelX + 18, gw = panelW - 36, yy = gy + 56;
      box(c, gx, yy, gw, 30, 9, '#36445b');
      box(c, gx + (me.target - .14) * gw, yy, .28 * gw, 30, 5, '#80e6b1');
      text(c, '성공', gx + me.target * gw, yy + 15, 13, '#163d30');
      const t = Math.max(0, e.now - me.stageAt) % 1600 / 800, val = t <= 1 ? t : 2 - t;
      const xx = gx + val * gw;
      c.fillStyle = '#fff'; c.fillRect(xx - 2, yy - 6, 4, 42);
      text(c, '▼', xx, yy - 15, 18, '#ffdc75');
      text(c, '초록 띠 안에서 한 번!', mid, gy + 108, 13, '#e5f5ef');
    } else {
      const msg = me && me.event === 'early' ? '너무 빨랐어요! 입질을 기다려요' : me && (me.event === 'miss' || me.event === 'escaped') ? '아쉽다! 다음 물고기를 노려요' : me && ['fish', 'gold', 'treasure'].includes(me.event) ? `잡았다! +${me.gain}점` : stage === 'bite' ? '지금 챔질 버튼!' : '느긋하게… 찌를 바라봐요';
      text(c, msg, mid, gy + 49, Math.min(16, panelW / (msg.length + 1)), '#ffe3a3');
      text(c, '물고기 30 · 황금 50 · 보물 80점', mid, gy + 87, 12, '#d4e6f4');
    }
    if (me) text(c, `${me.caught || 0}마리  ·  ${me.combo || 0}연속 성공`, mid, gy + gh + 24, 14, '#fff');
  }
  function draw(e) {
    const m = e.m;
    if (!m || !m.party) return;
    if (lastKey !== m.mode) { reset(); lastKey = m.mode; }
    const c = e.ctx, w = e.W / e.dpr, h = e.H / e.dpr;
    c.save(); c.scale(e.dpr, e.dpr);
    cover(c, image(m.mode), 0, 0, w, h);
    c.fillStyle = '#101d36df'; c.fillRect(0, 0, w, h);
    if (m.mode === 'freeze') freeze(e, m);
    else if (m.mode === 'paint') paint(e, m);
    else fishing(e, m);
    c.restore();
    const row = m.players.find(p => p[0] === e.id), q = m.party.people.find(p => p.id === e.id);
    const status = document.getElementById('hudLeft');
    const label = e.host ? (m.mode === 'freeze' ? `생존 ${m.players.filter(p => !p[4] && p[3]).length} / ${m.players.filter(p => !p[4]).length}명` : `${m.players.filter(p => !p[4]).length}명 참가`) : row && !row[4] ? m.mode === 'freeze' && !row[3] ? '탈락 · 관전 중' : `내 기록 ${row[5]}${m.mode === 'paint' ? '칸' : '점'}` : '다음 판부터 함께해요';
    if (status.textContent !== label) status.textContent = label;
    const time = document.getElementById('hudTime'), timeText = Math.ceil(m.timeLeft / 1000) + '초';
    if (time.textContent !== timeText) time.textContent = timeText;
    const btn = document.getElementById('btnAction');
    if (!e.host && m.mode !== 'freeze') {
      const blocked = !row || !row[3] || row[4] || e.phase !== 'playing' || !q || (m.mode === 'paint' ? q.cooldown > 0 : q.stage !== 'bite' && q.stage !== 'reel');
      btn.disabled = !!blocked;
      const label2 = m.mode === 'paint' ? (q && q.cooldown > 0 ? `${Math.ceil(q.cooldown / 1000)}초` : '넓게 칠하기') : q && q.stage === 'reel' ? '낚아 올리기!' : q && q.stage === 'bite' ? '지금 챔질!' : '입질 대기';
      if (btn.textContent !== label2) btn.textContent = label2;
      btn.classList.toggle('wait', !!blocked);
    }
    if (e.host && lastSignal && m.party.signal !== lastSignal && e.phase === 'playing') e.warn();
    lastSignal = m.party.signal || '';
    if (!e.host && q && lastSeq !== null && lastSeq !== q.seq && e.phase === 'playing') {
      if (['finish', 'fish', 'gold', 'treasure'].includes(q.event)) e.good();
    }
    if (q) lastSeq = q.seq;
  }
  return { has: key => keys.includes(key), reset, draw };
})();
