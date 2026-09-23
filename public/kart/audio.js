// 소리 — 효과음은 AudioBuffer, 배경음악은 루프 버퍼 + 크로스페이드, 엔진은 합성음
const SFX = ['countdown', 'go', 'itembox', 'roulette', 'boost', 'drift', 'spark', 'throw', 'hit', 'shield', 'bump', 'lap', 'finallap', 'finish', 'crowd', 'click', 'select', 'splash'];

class Audio {
  constructor() {
    this.ctx = null; this.buf = {}; this.on = true; this.bgmName = null;
    this.mScale = 1; this.fScale = 1;
    try { this.on = localStorage.getItem('kart_sound') !== '0'; const v = JSON.parse(localStorage.getItem('kart_vol') || 'null'); if (v) { this.mScale = +v.m; this.fScale = +v.f; } } catch (e) { }
    if (!(this.mScale >= 0 && this.mScale <= 1)) this.mScale = 1; if (!(this.fScale >= 0 && this.fScale <= 1)) this.fScale = 1;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 1 : 0; this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.42 * this.mScale; this.music.connect(this.master);
    this.fx = this.ctx.createGain(); this.fx.gain.value = 0.85 * this.fScale; this.fx.connect(this.master);
    for (const n of SFX) this.load(n);
    this.engineSetup();
  }
  load(n) {
    if (this.buf[n]) return this.buf[n];
    const p = fetch(`/kart/audio/${n}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(a => new Promise((res, rej) => this.ctx.decodeAudioData(a, res, rej)))
      .then(b => { this.buf[n] = b; return b; }).catch(() => { this.buf[n] = null; return null; });
    this.buf[n] = p;
    return p;
  }
  setVol(m, f) {
    this.mScale = m; this.fScale = f;
    try { localStorage.setItem('kart_vol', JSON.stringify({ m, f })); } catch (e) { }
    if (this.ctx) { this.music.gain.setTargetAtTime(0.42 * m, this.ctx.currentTime, 0.05); this.fx.gain.setTargetAtTime(0.85 * f, this.ctx.currentTime, 0.05); }
  }
  setOn(v) {
    this.on = v; try { localStorage.setItem('kart_sound', v ? '1' : '0'); } catch (e) { }
    if (this.master) this.master.gain.setTargetAtTime(v ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  play(n, vol = 1, rate = 1, pan = 0) {
    if (!this.ctx) return null;
    const b = this.buf[n];
    if (!b || b instanceof Promise) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g);
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.fx); }
    else g.connect(this.fx);
    s.start();
    return { s, g };
  }
  // 맞았을 때 등: 음악을 잠깐 낮춘다
  duck(v = 0.4, sec = 0.6) {
    if (!this.music) return;
    const t = this.ctx.currentTime, base = 0.42 * this.mScale;
    this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(base * v, t, 0.03); this.music.gain.setTargetAtTime(base, t + sec, 0.25);
  }
  loop(n, vol) { // 반복 효과음(드리프트 끼익·관중)
    if (!this.ctx) return null;
    const b = this.buf[n]; if (!b || b instanceof Promise) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.fx); s.start();
    return { s, g, stop: () => { try { g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08); s.stop(this.ctx.currentTime + 0.4); } catch (e) { } } };
  }
  async bgm(name, vol = 1) {
    if (!this.ctx || this.bgmName === name) return;
    this.bgmName = name;
    const old = this.cur;
    if (old) { old.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); try { old.s.stop(this.ctx.currentTime + 2); } catch (e) { } }
    this.cur = null;
    if (!name) return;
    const b = await this.load(name);
    if (!b || this.bgmName !== name) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
    s.connect(g); g.connect(this.music); s.start();
    this.cur = { s, g };
  }
  musicRate(r) { if (this.cur) this.cur.s.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.3); }
  musicVol(v) { if (this.music) this.music.gain.setTargetAtTime(v * this.mScale, this.ctx.currentTime, 0.3); }

  // 엔진: 톱니파 두 개 + 저역통과. 속도에 따라 음높이가 오른다
  engineSetup() {
    const c = this.ctx;
    this.eng = c.createGain(); this.eng.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.35;
    // 덜덜거림(LFO)
    const lfo = c.createOscillator(); lfo.frequency.value = 22; const lg = c.createGain(); lg.gain.value = 0.018;
    lfo.connect(lg); lg.connect(this.eng.gain);
    this.o1.connect(lp); this.o2.connect(g2); g2.connect(lp); lp.connect(this.eng); this.eng.connect(this.fx);
    this.lp = lp; this.lg = lg;
    this.o1.start(); this.o2.start(); lfo.start();
  }
  engine(speed01, boost, on) {
    if (!this.ctx || !this.o1) return;
    const t = this.ctx.currentTime;
    // 4단 기어처럼: 한 단 안에서 회전수가 오르다 다음 단에서 툭 떨어진다
    const sp = Math.max(0, Math.min(1.15, speed01)), gear = Math.min(3, Math.floor(sp * 4)), frac = sp * 4 - gear;
    const rpm = gear === 3 ? 0.3 + Math.min(1, (sp - 0.75) / 0.4) * 0.7 : 0.3 + frac * 0.7;
    const f = 42 + rpm * 110 + gear * 10 + (boost ? 45 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.06);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.lp.frequency.setTargetAtTime(500 + speed01 * 1400 + (boost ? 600 : 0), t, 0.08);
    this.eng.gain.setTargetAtTime(on ? 0.075 + speed01 * 0.06 : 0, t, 0.1);
    this.lg.gain.setTargetAtTime(on ? 0.018 : 0, t, 0.1);
  }
}
export const audio = new Audio();
