// 소리 — 효과음은 AudioBuffer, 배경음악은 루프 버퍼 + 크로스페이드, 엔진은 합성음
const SFX = ['countdown', 'go', 'itembox', 'roulette', 'boost', 'drift', 'spark', 'throw', 'hit', 'shield', 'bump', 'lap', 'finallap', 'finish', 'crowd', 'click', 'select', 'splash'];

class Audio {
  constructor() {
    this.ctx = null; this.buf = {}; this.on = true; this.bgmName = null;
    try { this.on = localStorage.getItem('kart_sound') !== '0'; } catch (e) { }
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 1 : 0; this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.42; this.music.connect(this.master);
    this.fx = this.ctx.createGain(); this.fx.gain.value = 0.85; this.fx.connect(this.master);
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
  setOn(v) {
    this.on = v; try { localStorage.setItem('kart_sound', v ? '1' : '0'); } catch (e) { }
    if (this.master) this.master.gain.setTargetAtTime(v ? 1 : 0, this.ctx.currentTime, 0.05);
  }
  play(n, vol = 1, rate = 1) {
    if (!this.ctx) return null;
    const b = this.buf[n];
    if (!b || b instanceof Promise) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.fx); s.start();
    return { s, g };
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
  musicVol(v) { if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }

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
    const f = 48 + speed01 * 120 + (boost ? 30 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.06);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.lp.frequency.setTargetAtTime(500 + speed01 * 1400 + (boost ? 600 : 0), t, 0.08);
    this.eng.gain.setTargetAtTime(on ? 0.075 + speed01 * 0.06 : 0, t, 0.1);
    this.lg.gain.setTargetAtTime(on ? 0.018 : 0, t, 0.1);
  }
}
export const audio = new Audio();
