// Every sound is synthesised at runtime with the Web Audio API — gunshots,
// footsteps, the traffic bed, cicadas after dark, and the sirens that show up
// when you've earned them.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.sfxGain = null;
    this.ambGain = null;
    this.noiseBuf = null;
    this.sirenOsc = null;
    this.engine = null;
    this._lastPlay = new Map();
    this.enabled = true;
  }

  resume() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(ctx.destination);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.16;
      comp.connect(this.master);
      this.bus = comp;

      this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = 0.9; this.sfxGain.connect(comp);
      this.ambGain = ctx.createGain(); this.ambGain.gain.value = 0.0; this.ambGain.connect(comp);

      this.noiseBuf = this.makeNoise(2.0);
      this.startAmbience();
      this.ready = true;
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;   // a touch of brown for weight
      d[i] = white * 0.7 + last * 3.2;
    }
    return buf;
  }

  noiseSource(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    return s;
  }

  /* ---------------------------------------------------------------- */
  /* ambience                                                          */
  /* ---------------------------------------------------------------- */

  startAmbience() {
    const ctx = this.ctx;
    // low traffic rumble
    const rumble = this.noiseSource(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.5;
    const rg = ctx.createGain(); rg.gain.value = 0.55;
    rumble.connect(lp); lp.connect(rg); rg.connect(this.ambGain);
    rumble.start();
    this.rumbleGain = rg;

    // wind / air
    const air = this.noiseSource(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    const ag = ctx.createGain(); ag.gain.value = 0.12;
    air.connect(bp); bp.connect(ag); ag.connect(this.ambGain);
    air.start();
    this.airGain = ag;

    // cicadas — a resonant shimmer that only comes up in the evening
    const cic = this.noiseSource(true);
    const cbp = ctx.createBiquadFilter();
    cbp.type = 'bandpass'; cbp.frequency.value = 4600; cbp.Q.value = 8;
    const cg = ctx.createGain(); cg.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7.5;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG); lfoG.connect(cg.gain);
    cic.connect(cbp); cbp.connect(cg); cg.connect(this.ambGain);
    cic.start(); lfo.start();
    this.cicadaGain = cg;

    this.ambGain.gain.setTargetAtTime(0.5, ctx.currentTime, 1.5);
  }

  /* ---------------------------------------------------------------- */
  /* one-shots                                                         */
  /* ---------------------------------------------------------------- */

  play(name, opts = {}) {
    if (!this.ready || !this.enabled) return;
    const now = this.ctx.currentTime;
    const last = this._lastPlay.get(name) || 0;
    if (now - last < 0.012) return;
    this._lastPlay.set(name, now);
    const fn = this['s_' + name];
    if (fn) fn.call(this, now, opts);
  }

  env(node, now, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + a + d);
    node.connect(g);
    g.connect(this.sfxGain);
    return g;
  }

  gunshot(now, { boom = 90, crackF = 2600, dur = 0.30, level = 1, body = 0.24 }) {
    const ctx = this.ctx;
    // crack
    const n = this.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 700;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(crackF, now);
    bp.frequency.exponentialRampToValueAtTime(crackF * 0.35, now + dur);
    bp.Q.value = 0.9;
    n.connect(hp); hp.connect(bp);
    this.env(bp, now, 0.001, dur, 0.9 * level);
    n.start(now); n.stop(now + dur + 0.05);

    // body thump
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(boom, now);
    o.frequency.exponentialRampToValueAtTime(boom * 0.35, now + body);
    this.env(o, now, 0.002, body, 0.85 * level);
    o.start(now); o.stop(now + body + 0.05);

    // tail — the whole downtown grid slapping it back at you
    const t = this.noiseSource();
    const tlp = ctx.createBiquadFilter();
    tlp.type = 'lowpass'; tlp.frequency.value = 1400;
    const dly = ctx.createDelay(0.4);
    dly.delayTime.value = 0.09;
    t.connect(tlp); tlp.connect(dly);
    this.env(dly, now, 0.02, 0.85, 0.22 * level);
    t.start(now); t.stop(now + 1.0);
  }

  s_pistol(now) { this.gunshot(now, { boom: 110, crackF: 2800, dur: 0.22, level: 0.85 }); }
  s_smg(now) { this.gunshot(now, { boom: 130, crackF: 3200, dur: 0.16, level: 0.62, body: 0.14 }); }
  s_rifle(now) { this.gunshot(now, { boom: 95, crackF: 3000, dur: 0.26, level: 0.95 }); }
  s_shotgun(now) { this.gunshot(now, { boom: 66, crackF: 1700, dur: 0.42, level: 1.15, body: 0.36 }); }

  s_punch(now) {
    const n = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400;
    n.connect(lp);
    this.env(lp, now, 0.004, 0.11, 0.5);
    n.start(now); n.stop(now + 0.2);
  }

  s_dry(now) {
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 1800;
    this.env(o, now, 0.001, 0.03, 0.14);
    o.start(now); o.stop(now + 0.06);
  }

  s_reload(now) {
    for (const [t, f, d] of [[0, 900, 0.05], [0.16, 640, 0.06], [0.42, 1400, 0.04], [0.6, 780, 0.07]]) {
      const o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = f;
      const g = this.env(o, now + t, 0.001, d, 0.10);
      o.start(now + t); o.stop(now + t + d + 0.05);
    }
  }

  s_switch(now) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.07);
    this.env(o, now, 0.002, 0.08, 0.10);
    o.start(now); o.stop(now + 0.14);
  }

  s_impact(now) {
    const n = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400 + Math.random() * 1800; bp.Q.value = 2.2;
    n.connect(bp);
    this.env(bp, now, 0.001, 0.09, 0.22);
    n.start(now); n.stop(now + 0.16);
  }

  s_flesh(now) {
    const n = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    n.connect(lp);
    this.env(lp, now, 0.002, 0.14, 0.3);
    n.start(now); n.stop(now + 0.24);
  }

  s_headshot(now) {
    this.s_flesh(now);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1600, now);
    o.frequency.exponentialRampToValueAtTime(700, now + 0.1);
    this.env(o, now, 0.001, 0.11, 0.16);
    o.start(now); o.stop(now + 0.18);
  }

  s_step(now, { level = 0.5 } = {}) {
    const n = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320 + Math.random() * 380;
    bp.Q.value = 1.1;
    n.connect(bp);
    this.env(bp, now, 0.002, 0.07, 0.11 * level);
    n.start(now); n.stop(now + 0.14);
  }

  s_land(now, { level = 1 } = {}) {
    const n = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    n.connect(lp);
    this.env(lp, now, 0.002, 0.18, 0.24 * level);
    n.start(now); n.stop(now + 0.3);
  }

  s_hurt(now) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(90, now + 0.22);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    o.connect(lp);
    this.env(lp, now, 0.004, 0.25, 0.2);
    o.start(now); o.stop(now + 0.35);
  }

  s_bats(now) {
    for (let i = 0; i < 5; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      const t = now + i * 0.04 + Math.random() * 0.05;
      o.frequency.setValueAtTime(5200 + Math.random() * 2600, t);
      o.frequency.exponentialRampToValueAtTime(3200, t + 0.05);
      this.env(o, t, 0.002, 0.05, 0.03);
      o.start(t); o.stop(t + 0.1);
    }
  }

  /* ---------------------------------------------------------------- */
  /* engine                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * A car engine is two detuned saws an octave apart through a lowpass, with
   * the cutoff opening under load. Crude, but the pitch tracking is what
   * sells it — you hear the revs climb and drop through the gears.
   */
  startEngine() {
    if (!this.ready || this.engine) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.bus);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3.4;
    lp.connect(out);

    const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 60;
    const b = ctx.createOscillator(); b.type = 'square'; b.frequency.value = 30;
    const ag = ctx.createGain(); ag.gain.value = 0.7;
    const bg = ctx.createGain(); bg.gain.value = 0.4;
    a.connect(ag); ag.connect(lp);
    b.connect(bg); bg.connect(lp);

    // a little induction hiss on top
    const n = this.noiseSource(true);
    const nbp = ctx.createBiquadFilter();
    nbp.type = 'bandpass'; nbp.frequency.value = 1800; nbp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.04;
    n.connect(nbp); nbp.connect(ng); ng.connect(out);

    // tyre squeal, gated by slip
    const sk = this.noiseSource(true);
    const sbp = ctx.createBiquadFilter();
    sbp.type = 'bandpass'; sbp.frequency.value = 2400; sbp.Q.value = 9;
    const sg = ctx.createGain(); sg.gain.value = 0;
    sk.connect(sbp); sbp.connect(sg); sg.connect(this.bus);

    a.start(); b.start(); n.start(); sk.start();
    this.engine = { out, lp, a, b, ng, sg, sbp };
    out.gain.setTargetAtTime(0.16, ctx.currentTime, 0.25);
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.18);
    e.sg.gain.setTargetAtTime(0, t, 0.1);
    const dead = e;
    setTimeout(() => {
      try { dead.a.stop(); dead.b.stop(); } catch { /* already gone */ }
    }, 700);
    this.engine = null;
  }

  /**
   * @param {number} rpm  0..1
   * @param {number} load 0..1 throttle
   * @param {number} slip 0..1 lateral slide
   */
  setEngine(rpm, load, slip) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const f = 42 + rpm * 155;
    this.engine.a.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.b.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engine.lp.frequency.setTargetAtTime(420 + rpm * 1500 + load * 700, t, 0.08);
    this.engine.ng.gain.setTargetAtTime(0.02 + rpm * 0.06, t, 0.1);
    this.engine.sg.gain.setTargetAtTime(slip > 0.18 ? (slip - 0.18) * 0.14 : 0, t, 0.06);
    this.engine.sbp.frequency.setTargetAtTime(1800 + slip * 1800, t, 0.1);
  }

  s_crash(now, { level = 1 } = {}) {
    const n = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    n.connect(lp);
    this.env(lp, now, 0.002, 0.32, Math.min(0.5, 0.12 * level));
    n.start(now); n.stop(now + 0.5);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(52, now + 0.28);
    this.env(o, now, 0.002, 0.3, Math.min(0.4, 0.1 * level));
    o.start(now); o.stop(now + 0.4);
  }

  s_horn(now) {
    for (const f of [370, 440]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2200;
      o.connect(lp);
      this.env(lp, now, 0.01, 0.42, 0.06);
      o.start(now); o.stop(now + 0.5);
    }
  }

  /* ---------------------------------------------------------------- */
  /* sirens                                                            */
  /* ---------------------------------------------------------------- */

  setSiren(on, intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (on && !this.sirenOsc) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const lfo = ctx.createOscillator();
      lfo.type = 'triangle';
      lfo.frequency.value = 0.55;
      const lg = ctx.createGain();
      lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.value = 720;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(bp); bp.connect(g); g.connect(this.bus);
      o.start(); lfo.start();
      this.sirenOsc = { o, lfo, g };
    }
    if (this.sirenOsc) {
      this.sirenOsc.g.gain.setTargetAtTime(on ? 0.05 * intensity : 0, ctx.currentTime, 0.5);
    }
  }

  /* ---------------------------------------------------------------- */

  update(dt, player, sky, game) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const night = sky.nightFactor;
    // traffic quietens overnight; cicadas take over
    if (this.rumbleGain) this.rumbleGain.gain.setTargetAtTime(0.55 - night * 0.28, t, 1.2);
    if (this.cicadaGain) this.cicadaGain.gain.setTargetAtTime(night * 0.055, t, 2.0);
    if (this.airGain) this.airGain.gain.setTargetAtTime(0.10 + night * 0.03, t, 2.0);
    this.setSiren(game.wanted > 0, clamp01(game.wanted / 3));
  }
}
