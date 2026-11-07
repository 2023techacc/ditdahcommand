// Web Audio engine: clock mapping, key tone, scheduled tones, and a small
// procedural music sequencer. All music is synthesised in the browser.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.off = undefined;
    this.lastSync = 0;
    this.keyFreq = 650;
    this.vol = { music: 0.8, tone: 0.8, sfx: 0.8 };
    this.visualOnly = false;
    this.keyIsOn = false;
  }

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* not supported */ }
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.musicBus.connect(this.musicDuck).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.keyBus = ctx.createGain();
    this.keyBus.connect(this.master);

    // Noise buffers.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.crackleBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const c = this.crackleBuf.getChannelData(0);
    for (let i = 0; i < len; i++) c[i] = Math.random() < 0.004 ? (Math.random() * 2 - 1) : c[i - 1] * 0.6 || 0;

    // Always-running key oscillator, gated by gain (no clicks, low latency).
    this.keyOsc = ctx.createOscillator();
    this.keyOsc.type = 'sine';
    this.keyOsc.frequency.value = this.keyFreq;
    this.keyGain = ctx.createGain();
    this.keyGain.gain.value = 0;
    this.keyOsc.connect(this.keyGain).connect(this.keyBus);
    this.keyOsc.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noiseBuf;
    hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2800;
    bp.Q.value = 0.7;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hiss.connect(bp).connect(this.hissGain).connect(this.keyBus);
    hiss.start();

    const crk = ctx.createBufferSource();
    crk.buffer = this.crackleBuf;
    crk.loop = true;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    crk.connect(this.crackleGain).connect(this.keyBus);
    crk.start();

    // iOS unlock.
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    this.applyVolumes();
    this.sync(true);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicBus.gain.value = this.vol.music * 0.7;
    this.sfxBus.gain.value = this.vol.sfx * 0.8;
    this.keyBus.gain.value = this.visualOnly ? 0 : this.vol.tone;
  }

  suspend() {
    this.keyOffNow();
    return this.ctx?.suspend();
  }

  resume() {
    return this.ctx?.resume();
  }

  // Output latency estimate (seconds).
  get lat() {
    if (!this.ctx) return 0;
    return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  // Track offset between performance clock and audio clock. currentTime
  // advances in blocks, so take the running max and let it decay slowly.
  sync(force) {
    if (!this.ctx) return;
    const p = performance.now();
    const s = this.ctx.currentTime - p / 1000;
    if (force || this.off === undefined || this.ctx.state !== 'running') {
      this.off = s;
    } else {
      const dt = Math.max(0, (p - this.lastSync) / 1000);
      this.off = Math.max(s, this.off - dt * 0.002);
      if (this.off - s > 0.08) this.off = s;
    }
    this.lastSync = p;
  }

  // Time (in audio-clock seconds) at which a sound scheduled now is heard.
  perfToHeard(pMs) {
    return pMs / 1000 + (this.off || 0) - this.lat;
  }

  heardNow() {
    this.sync();
    return this.perfToHeard(performance.now());
  }

  // A sound scheduled at context time C reaches the speaker when
  // heardNow() == C, so heard times schedule directly.
  toCtx(tHeard) {
    return tHeard;
  }

  ctxNow() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setKeyFreq(f) {
    this.keyFreq = f;
    if (this.keyOsc) this.keyOsc.frequency.setValueAtTime(f, this.ctx.currentTime);
  }

  // quality: 0..3 (crisp..garbled) colours the tone.
  keyOn(quality = 0, atCtx) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, atCtx || 0);
    const g = this.keyGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.32, t + 0.005);
    this.keyIsOn = true;
    this.setKeyQuality(quality, t);
  }

  setKeyQuality(q, atCtx) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, atCtx || 0);
    this.hissGain.gain.setTargetAtTime(q === 2 ? 0.22 : q === 3 ? 0.12 : 0, t, 0.005);
    this.crackleGain.gain.setTargetAtTime(q === 3 ? 0.9 : 0, t, 0.005);
  }

  keyOff(atCtx) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, atCtx || 0);
    const g = this.keyGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this.keyIsOn ? 0.32 : g.value, t);
    g.linearRampToValueAtTime(0, t + 0.006);
    this.hissGain.gain.setTargetAtTime(0, t, 0.01);
    this.crackleGain.gain.setTargetAtTime(0, t, 0.01);
    this.keyIsOn = false;
  }

  keyOffNow() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.keyGain.gain.cancelScheduledValues(t);
    this.keyGain.gain.setValueAtTime(0, t);
    this.hissGain.gain.setValueAtTime(0, t);
    this.crackleGain.gain.setValueAtTime(0, t);
    this.keyIsOn = false;
  }

  // Scheduled timed key tone (used by the iambic keyer).
  keyPulse(startCtx, endCtx) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const t0 = Math.max(now, startCtx);
    const g = this.keyGain.gain;
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(0.32, t0 + 0.005);
    g.setValueAtTime(0.32, Math.max(t0 + 0.006, endCtx));
    g.linearRampToValueAtTime(0, Math.max(t0 + 0.012, endCtx + 0.006));
  }

  crackleBurst(atCtx, dur = 0.12) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, atCtx || 0);
    this.crackleGain.gain.setTargetAtTime(0.9, t, 0.003);
    this.crackleGain.gain.setTargetAtTime(0, t + dur, 0.02);
  }

  // A scheduled tone with soft attack/release. t is context time.
  tone(t, dur, freq, gain = 0.15, type = 'sine', bus = 'sfx', opts = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    t = Math.max(t, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    const r = opts.release ?? 0.008;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.setValueAtTime(gain, Math.max(t + a, t + dur - r));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.001);
    let node = o;
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.lowpass, t);
      if (opts.lpEnv) f.frequency.exponentialRampToValueAtTime(opts.lpEnv, t + dur);
      f.Q.value = opts.q ?? 0.8;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(bus === 'music' ? this.musicBus : bus === 'key' ? this.keyBus : this.sfxBus);
    if (opts.detune) o.detune.value = opts.detune;
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(t, dur, { gain = 0.2, type = 'highpass', freq = 6000, q = 0.7, bus = 'music', decay = true } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    t = Math.max(t, ctx.currentTime);
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    if (decay) g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    else g.gain.setValueAtTime(0, t + dur);
    s.connect(f).connect(g).connect(bus === 'music' ? this.musicBus : this.sfxBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  // --- drum voices (context times) ---
  kick(t, v = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  snare(t, v = 1) {
    this.noise(t, 0.16, { gain: 0.32 * v, type: 'bandpass', freq: 1900, q: 0.6 });
    this.tone(t, 0.06, 200, 0.12 * v, 'triangle', 'music', { slideTo: 140 });
  }

  rim(t, v = 1) {
    this.noise(t, 0.04, { gain: 0.25 * v, type: 'bandpass', freq: 3200, q: 3 });
  }

  hat(t, v = 1, open = false) {
    this.noise(t, open ? 0.18 : 0.045, { gain: 0.11 * v, type: 'highpass', freq: 7500 });
  }

  ride(t, v = 1) {
    this.noise(t, 0.3, { gain: 0.07 * v, type: 'bandpass', freq: 6000, q: 1.2 });
  }

  crash(t, v = 1) {
    this.noise(t, 1.1, { gain: 0.12 * v, type: 'highpass', freq: 4500 });
  }

  click(t, accent) {
    this.tone(t, 0.03, accent ? 1600 : 1100, accent ? 0.22 : 0.14, 'square', 'sfx', { lowpass: 3000 });
  }

  sticks(t) {
    this.noise(t, 0.05, { gain: 0.35, type: 'bandpass', freq: 2600, q: 4, bus: 'sfx' });
  }

  // --- sfx (context times) ---
  thud(t) {
    this.tone(t, 0.18, 90, 0.35, 'sine', 'sfx', { slideTo: 50 });
    this.noise(t, 0.12, { gain: 0.12, type: 'lowpass', freq: 700, bus: 'sfx' });
  }

  pop(t) {
    this.noise(t, 0.25, { gain: 0.25, type: 'lowpass', freq: 1200, bus: 'sfx' });
  }

  chime(t, good = true) {
    const base = good ? 880 : 330;
    this.tone(t, 0.12, base, 0.1, 'triangle', 'sfx');
    this.tone(t + 0.08, 0.18, good ? base * 1.5 : base * 0.8, 0.1, 'triangle', 'sfx');
  }

  bell(t) {
    [1, 2.01, 3.02].forEach((h, i) => this.tone(t, 1.2, 523 * h, 0.08 / (i + 1), 'sine', 'sfx', { release: 1.0 }));
  }
}

// ---------------------------------------------------------------------------

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
};

export const SONGS = {
  boot: { name: 'Boot Camp Shuffle', style: 'march', root: 62, scale: 'major', prog: [0, 3, 4, 0] },
  front: { name: 'The Front (Big Band)', style: 'bigband', root: 63, scale: 'mixo', prog: [0, 5, 1, 4] },
  night: { name: 'Night Ops', style: 'noir', root: 64, scale: 'minor', prog: [0, 5, 3, 4] },
  silence: { name: 'Radio Silence', style: 'electro', root: 65, scale: 'dorian', prog: [0, 6, 3, 4] },
  finale: { name: 'Peace Signal', style: 'finale', root: 62, scale: 'major', prog: [0, 4, 5, 3] },
  drill: { name: 'Drill', style: 'drill', root: 64, scale: 'major', prog: [0, 3, 4, 0] },
  watch: { name: 'Long Watch', style: 'noir', root: 62, scale: 'dorian', prog: [0, 3, 6, 4] },
};

// Key tone pitch in the 580-720 Hz CW range, tuned to the song's root.
export function keyToneFor(song) {
  let m = song.root;
  while (mtof(m) < 580) m += 12;
  while (mtof(m) > 720) m -= 12;
  if (mtof(m) < 580) m += 7; // fall back to the fifth
  return mtof(m);
}

function chordNotes(song, degree, octave = 0) {
  const sc = SCALES[song.scale] || SCALES.major;
  const out = [];
  for (const step of [0, 2, 4]) {
    const i = degree + step;
    out.push(song.root + sc[i % 7] + 12 * Math.floor(i / 7) + octave * 12);
  }
  return out;
}

export function scaleNote(song, degree, octave = 0) {
  const sc = SCALES[song.scale] || SCALES.major;
  const i = ((degree % 7) + 7) % 7;
  return song.root + sc[i] + 12 * (Math.floor(degree / 7) + octave);
}

/**
 * Step sequencer. timeline.phrase(k) -> { start, bpm, swing } in heard time.
 * 128 sixteenth steps per 8-bar phrase. A one-bar count-in precedes phrase 0.
 */
export class Music {
  constructor(engine) {
    this.e = engine;
    this.timer = null;
    this.playing = false;
  }

  start(song, timeline, opts = {}) {
    this.stop();
    this.song = song;
    this.tl = timeline;
    this.opts = opts;
    this.k = -1; // count-in
    this.step = 0;
    this.playing = true;
    this.endAt = null;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  // Stop after the given heard time (with a final chord).
  finishAt(tHeard) {
    this.endAt = tHeard;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
  }

  stepTime(k, s) {
    if (k < 0) {
      const p0 = this.tl.phrase(0);
      const beat = 60 / p0.bpm;
      return p0.start - 4 * beat + s * beat / 4;
    }
    const p = this.tl.phrase(k);
    const st = 60 / p.bpm / 4;
    let t = p.start + s * st;
    if (p.swing && s % 2 === 1) t += (p.swing - 0.5) * 2 * st;
    return t;
  }

  tick() {
    if (!this.playing || !this.e.ctx) return;
    if (this.e.ctx.state !== 'running') return;
    const horizon = this.e.ctx.currentTime + 0.15;
    let guard = 0;
    while (guard++ < 64) {
      const tHeard = this.stepTime(this.k, this.step);
      const tCtx = this.e.toCtx(tHeard);
      if (tCtx > horizon) break;
      if (this.endAt !== null && tHeard >= this.endAt - 1e-6) {
        this.outro(tCtx);
        this.stop();
        return;
      }
      if (tCtx >= this.e.ctx.currentTime - 0.05) this.play(this.k, this.step, tCtx);
      this.step++;
      const n = this.k < 0 ? 16 : 128;
      if (this.step >= n) {
        this.step = 0;
        this.k++;
      }
    }
  }

  outro(t) {
    const s = this.song;
    const ch = chordNotes(s, 0, -1);
    this.e.crash(t, 1);
    this.e.kick(t, 1);
    ch.forEach((m, i) => this.e.tone(t, 1.6, mtof(m), 0.07, 'sawtooth', 'music', { lowpass: 1800, lpEnv: 400, release: 0.9, detune: i * 4 }));
    this.e.tone(t, 1.6, mtof(s.root - 24), 0.25, 'triangle', 'music', { release: 0.9 });
  }

  play(k, s, t) {
    const e = this.e;
    if (k < 0) {
      if (s % 4 === 0) e.sticks(t);
      return;
    }
    const song = this.song;
    const bar = Math.floor(s / 16);
    const st = s % 16;
    const p = this.tl.phrase(k);
    const beat = 60 / p.bpm;
    const deg = song.prog[bar % song.prog.length];
    const transmit = bar >= 3 && bar <= 6;
    const report = bar <= 1;
    const style = this.opts.styleOverride || song.style;

    // Duck the music a little during transmission.
    if (st === 0) {
      const target = transmit ? 0.62 : 1;
      e.musicDuck.gain.setTargetAtTime(target, t, 0.05);
    }
    if (bar === 0 && st === 0) e.crash(t, 0.8);

    const root = scaleNote(song, deg, -2);
    const ch = chordNotes(song, deg, -1);
    const sixteenth = beat / 4;

    if (style === 'drill') {
      if (st % 4 === 0) e.kick(t, st === 0 ? 0.8 : 0.45);
      if (st % 4 === 2) e.hat(t, 0.6);
      if (st === 0) ch.forEach((m) => e.tone(t, beat * 3.5, mtof(m), 0.035, 'triangle', 'music', { attack: 0.05, release: 0.3 }));
      return;
    }

    if (style === 'march') {
      if (st === 0 || st === 8) e.kick(t, 0.9);
      if (!report && (st === 4 || st === 12)) e.snare(t, 0.7);
      if (bar === 7 && st >= 8 && st % 2 === 0) e.snare(t, 0.35 + st / 40);
      if (st % 2 === 0 && bar !== 0) e.hat(t, st % 4 === 0 ? 0.7 : 0.4);
      if (st === 0) e.tone(t, beat * 0.9, mtof(root), 0.3, 'triangle', 'music', { lowpass: 900 });
      if (st === 8) e.tone(t, beat * 0.9, mtof(root + 7), 0.26, 'triangle', 'music', { lowpass: 900 });
      if (st === 4 || st === 12) ch.forEach((m, i) => e.tone(t, beat * 0.35, mtof(m + 12), 0.045, 'sawtooth', 'music', { lowpass: 2200, lpEnv: 700, detune: i * 3 }));
      return;
    }

    if (style === 'bigband' || style === 'finale') {
      // Walking bass in quarters.
      if (st % 4 === 0) {
        const walk = [0, 2, 4, 5][st / 4];
        e.tone(t, beat * 0.85, mtof(scaleNote(song, deg + walk, -2)), 0.28, 'triangle', 'music', { lowpass: 800 });
      }
      if (st % 4 === 0) e.ride(t, st === 0 ? 1 : 0.7);
      if (st % 4 === 2 && !report) e.ride(t, 0.45);
      if (st === 0 || st === 8) e.kick(t, report ? 0.5 : 0.75);
      if (st === 4 || st === 12) e.snare(t, report ? 0.35 : 0.55);
      if (bar === 7 && st >= 8 && st % 2 === 0) e.snare(t, 0.5);
      // Brass stabs.
      const stab = (st === 14 && bar % 2 === 1) || (bar === 2 && (st === 0 || st === 6 || st === 12)) || (bar === 7 && st === 0);
      if (stab) ch.forEach((m, i) => e.tone(t, beat * 0.4, mtof(m + 12), 0.06, 'sawtooth', 'music', { lowpass: 2600, lpEnv: 900, detune: i * 5 - 5 }));
      if (style === 'finale') {
        if (st % 2 === 0 && !report) e.hat(t, 0.5);
        if (st === 0) ch.forEach((m, i) => e.tone(t, beat * 3.8, mtof(m), 0.03, 'sawtooth', 'music', { lowpass: 1200, attack: 0.2, release: 0.5, detune: i * 7 }));
      }
      return;
    }

    if (style === 'noir') {
      if (st === 0 || st === 10) e.kick(t, 0.6);
      if (!report && (st === 4 || st === 12)) e.rim(t, 0.8);
      if (st % 2 === 0) e.hat(t, st % 4 === 0 ? 0.45 : 0.25);
      if (st === 0 || st === 8) e.tone(t, beat * 1.8, mtof(st === 0 ? root : root + 7), 0.26, 'sine', 'music', { lowpass: 600 });
      if (st === 0) ch.forEach((m, i) => e.tone(t, beat * 3.8, mtof(m), 0.035, 'triangle', 'music', { attack: 0.25, release: 0.8, detune: i * 6 }));
      if (bar === 7 && st >= 12) e.rim(t, 0.6);
      return;
    }

    if (style === 'electro') {
      if (st % 4 === 0) e.kick(t, 0.85);
      if (st % 4 === 2) e.hat(t, 0.8, st === 14);
      else if (!report) e.hat(t, 0.25);
      if (!report && (st === 4 || st === 12)) e.snare(t, 0.5);
      if (st % 2 === 0) {
        const n = st % 8 === 6 ? root + 12 : root;
        e.tone(t, sixteenth * 1.6, mtof(n), 0.18, 'sawtooth', 'music', { lowpass: 1400, lpEnv: 250, q: 4 });
      }
      if (st === 0) ch.forEach((m, i) => e.tone(t, beat * 3.9, mtof(m), 0.028, 'sawtooth', 'music', { lowpass: 1500, attack: 0.15, release: 0.6, detune: i * 8 - 8 }));
      if (bar === 7 && st >= 8) e.snare(t, 0.2 + (st - 8) * 0.06);
    }
  }
}

export { mtof };
