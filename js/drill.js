// Drills ("listen, then repeat"), Free Key practice, and latency calibration.
import { Session } from './session.js';
import { SONGS, Music, keyToneFor } from './audio.js';
import { layoutTokens, unitsOf, pretty, codeOf, UNIT_INFO, ORDER_INFO, SPECIAL_INFO, wpmFromUnit, describeOrder } from './morse.js';
import { J_POINTS, J_SHAPES, J_NAMES, J_CLASS } from './keyer.js';
import { t } from './i18n.js';

export function tokenName(tokens) {
  const j = tokens.join('');
  if (tokens.length === 1) {
    const tk = tokens[0];
    const n = UNIT_INFO[tk]?.name || ORDER_INFO[tk]?.name || SPECIAL_INFO[tk]?.name;
    return n ? `${tk} — ${t(n)}` : tk;
  }
  if (j === 'CQ') return 'CQ — ' + t('all units');
  if (tokens.length === 3 && tokens[2] === 'K' && UNIT_INFO[tokens[0]] && ORDER_INFO[tokens[1]]) return `${describeOrder(tokens[0], tokens[1])}, ${t('over')}`;
  return tokens.join(' ');
}

export class DrillRun extends Session {
  constructor(app, cfg) {
    super(app, { iambic: cfg.iambic });
    this.cfg = cfg;
    this.song = SONGS.drill;
    this.music = new Music(this.audio);
    this.results = [];
    this.segIdx = -1;
  }

  start() {
    const cfg = this.cfg;
    const bpm = cfg.bpm * this.settings.speed;
    const beat = 60 / bpm;
    this.beat = beat;
    this.bar = beat * 4;
    this.unit = beat / cfg.unitDiv;
    this.barUnits = 4 * cfg.unitDiv;
    this.audio.setKeyFreq(keyToneFor(this.song));
    this.t0 = this.audio.heardNow() + 0.7 + this.bar;
    let t = this.t0;
    this.segs = [];
    for (const item of cfg.items) {
      const units = unitsOf(item);
      const bars = Math.ceil((units + 2) / this.barUnits);
      const seg = { item, listen: t, key: t + bars * this.bar, end: t + 2 * bars * this.bar, letters: [] };
      const lay = layoutTokens(item);
      seg.listenEls = lay.els.map((e) => ({ t0: seg.listen + e.start * this.unit, t1: seg.listen + (e.start + e.len) * this.unit }));
      seg.targets = lay.els.map((e) => ({ t0: seg.key + e.start * this.unit, t1: seg.key + (e.start + e.len) * this.unit }));
      seg.targetLetters = lay.letters.map((l) => ({ t0: seg.key + l.start * this.unit, t1: seg.key + l.end * this.unit, label: l.token }));
      t = seg.end;
      this.segs.push(seg);
      if (cfg.timeLimit && t - this.t0 >= cfg.timeLimit && this.segs.length >= 3) break;
    }
    this.tEnd = t;
    this.schedIdx = 0;
    this.scheduleAhead(this.audio.heardNow());
    const tl = { phrase: (k) => ({ start: this.t0 + k * 8 * this.bar, bpm, swing: 0 }) };
    this.music.start(this.song, tl);
    this.music.finishAt(this.tEnd);
    this.makeKeyer(() => ({ origin: this.t0, unit: this.unit }));
    this.app.hud.drill({ title: cfg.title, phase: 'Get ready…', tokens: this.segs[0].item, progress: `0 / ${this.segs.length}` });
  }

  // Schedule "listen" tones a little ahead, so long or endless drills stay light.
  scheduleAhead(now) {
    while (this.schedIdx < this.segs.length && this.segs[this.schedIdx].listen < now + 2) {
      for (const e of this.segs[this.schedIdx].listenEls) {
        this.audio.tone(this.audio.toCtx(e.t0), e.t1 - e.t0, this.audio.keyFreq, 0.2, 'sine', 'music', { attack: 0.005, release: 0.008 });
      }
      this.schedIdx++;
    }
  }

  segAt(t) {
    return this.segs.find((s) => t >= s.key - this.unit * 0.5 && t < s.end - this.unit * 0.5) || null;
  }

  isOnAir(t) {
    return !!this.segAt(t);
  }

  onLetter(l) {
    const seg = this.segAt(l.start);
    l.offAir = !seg || l.els[0].offAir;
    if (!seg || l.offAir) return;
    seg.letters.push(l);
    this.app.hud.pop(`${J_SHAPES[l.q]} ${t(J_NAMES[l.q])}  ${l.sym || '?'}`, J_CLASS[l.q]);
    if (l.q <= 1 && l.sym) this.app.unlockCode(l.sym);
  }

  update(now) {
    this.scheduleAhead(now);
    const idx = this.segs.findIndex((s) => now >= s.listen && now < s.end);
    if (idx !== this.segIdx && idx >= 0) {
      if (this.segIdx >= 0) this.grade(this.segs[this.segIdx]);
      this.segIdx = idx;
    }
    const seg = this.segs[this.segIdx];
    if (seg) {
      const phase = now < seg.key ? 'LISTEN' : 'YOUR TURN';
      this.app.hud.drill({ title: this.cfg.title, phase, tokens: seg.item, progress: `${this.segIdx + 1} / ${this.segs.length}` });
    }
    if (now >= this.tEnd + 0.3 && !this.done) {
      this.done = true;
      if (seg && !seg.graded) this.grade(seg);
      this.finish();
    }
  }

  grade(seg) {
    if (seg.graded) return;
    if (this.keyer.letterEls.length) this.keyer.finishLetter();
    seg.graded = true;
    const want = seg.item.join('');
    const got = seg.letters.map((l) => l.sym || '?').join('');
    const q = seg.letters.reduce((a, l) => Math.max(a, l.q), 0);
    const ok = want === got;
    const pts = ok ? J_POINTS[q] : 0;
    this.results.push({ want, got, ok, q, pts });
    this.app.hud.pop(ok ? `${want} ✓ ${t(J_NAMES[q])}` : `${want} ✗ ${t('heard "{w}"', { w: got || '…' })}`, ok ? J_CLASS[q] : 'garbled');
  }

  finish() {
    this.ended = true;
    this.music.stop();
    this.releaseAll();
    const n = this.results.length || 1;
    const acc = this.results.reduce((a, r) => a + r.pts, 0) / (n * 300);
    const correct = this.results.filter((r) => r.ok).length;
    this.app.onSessionEnd({ mode: 'drill', cfg: this.cfg, accuracy: acc, correct, total: this.results.length, results: this.results, wpm: wpmFromUnit(this.unit) });
  }

  stop() {
    super.stop();
    this.music.stop();
  }

  render(now) {
    const seg = this.segs[Math.max(0, this.segIdx)];
    const next = this.segs[this.segIdx + 1];
    const targets = [], tl = [], report = [], windows = [];
    for (const s of [seg, next]) {
      if (!s) continue;
      targets.push(...s.targets);
      tl.push(...s.targetLetters);
      report.push(...s.listenEls);
      windows.push([s.key, s.end]);
    }
    const span = this.unit * 40;
    const grid = [];
    const per = this.barUnits;
    const u0 = Math.floor((now - span - this.t0) / this.unit);
    const u1 = Math.ceil((now + span - this.t0) / this.unit);
    for (let u = u0; u <= u1; u++) {
      const kind = ((u % per) + per) % per === 0 ? 'bar' : u % this.cfg.unitDiv === 0 ? 'beat' : 'unit';
      grid.push({ t: this.t0 + u * this.unit, kind });
    }
    const letters = this.keyer.letters.map((l) => ({ start: l.start, end: l.end, label: l.sym || '?', q: l.q, offAir: l.offAir }));
    this.app.tape.draw({ now, unit: this.unit, grid, windows, targets, targetLetters: tl, keyed: this.keyedForTape(), letters, report, keyDown: this.keyDown, guide: this.gapGuide(now) });
    let lamp = false;
    for (const r of report) if (now >= r.t0 && now < r.t1) lamp = true;
    this.app.hud.drillLamp(lamp, ((now - this.t0) / this.beat) % 1);
  }
}

// ---------------------------------------------------------------------------

export class FreeKeyRun extends Session {
  constructor(app, cfg) {
    super(app, { iambic: cfg.iambic });
    this.cfg = cfg;
    this.text = '';
  }

  start() {
    this.audio.setKeyFreq(650);
    this.setWpm(this.cfg.wpm || 8);
    this.t0 = this.audio.heardNow();
    this.makeKeyer(() => ({ origin: this.t0, unit: this.unit }), !!this.cfg.metronome);
    this.metTimer = setInterval(() => this.metTick(), 25);
    this.nextClick = null;
  }

  setWpm(w) {
    this.wpm = w;
    this.unit = 1.2 / w;
    if (this.t0 !== undefined) this.t0 = this.audio.heardNow();
    this.nextClick = null;
  }

  setMetronome(on) {
    this.cfg.metronome = on;
    if (this.keyer) this.keyer.judged = on;
    this.nextClick = null;
  }

  metTick() {
    if (!this.cfg.metronome || this.paused || this.ended || !this.audio.ctx) return;
    const beat = this.unit * 2;
    const now = this.audio.heardNow();
    if (this.nextClick === null || this.nextClick < now) {
      const n = Math.ceil((now - this.t0) / beat);
      this.nextClick = this.t0 + n * beat;
    }
    while (this.nextClick < now + 0.15 + this.audio.lat) {
      const n = Math.round((this.nextClick - this.t0) / beat);
      this.audio.click(this.audio.toCtx(this.nextClick), n % 4 === 0);
      this.nextClick += beat;
    }
  }

  onLetter(l) {
    this.text += l.sym || '?';
    if (l.sym && (!this.cfg.metronome || l.q <= 1)) this.app.unlockCode(l.sym);
    if (this.cfg.metronome) this.app.hud.pop(`${J_SHAPES[l.q]} ${l.sym || '?'}`, J_CLASS[l.q]);
    this.app.hud.freeText(this.text);
  }

  update(now) {
    const k = this.keyer;
    if (!k.isDown && k.lastUp !== null && this.text && !this.text.endsWith(' ') && (now - k.lastUp) / this.unit >= 5) {
      this.text += ' ';
      this.app.hud.freeText(this.text);
    }
  }

  clear() {
    this.text = '';
    this.app.hud.freeText('');
  }

  stop() {
    super.stop();
    clearInterval(this.metTimer);
  }

  render(now) {
    const span = this.unit * 40;
    const grid = [];
    if (this.cfg.metronome) {
      const u0 = Math.floor((now - span - this.t0) / this.unit);
      const u1 = Math.ceil((now + span - this.t0) / this.unit);
      for (let u = u0; u <= u1; u++) grid.push({ t: this.t0 + u * this.unit, kind: u % 8 === 0 ? 'bar' : u % 2 === 0 ? 'beat' : 'unit' });
    }
    const letters = this.keyer.letters.map((l) => ({ start: l.start, end: l.end, label: l.sym || '?', q: this.cfg.metronome ? l.q : 1 }));
    const keyed = this.keyedForTape().map((e) => (this.cfg.metronome ? e : { ...e, j: 1 }));
    this.app.tape.draw({ now, unit: this.unit, grid, windows: [], targets: [], keyed, letters, report: [], keyDown: this.keyDown, lineFrac: 0.75, guide: this.gapGuide(now, true) });
  }
}

// ---------------------------------------------------------------------------

export class CalibRun extends Session {
  constructor(app, cfg) {
    super(app, {});
    this.cfg = cfg;
    this.taps = [];
  }

  start() {
    this.beat = 0.6;
    this.n = 20;
    this.t0 = this.audio.heardNow() + 1.0;
    for (let i = 0; i < this.n; i++) this.audio.click(this.audio.toCtx(this.t0 + i * this.beat), i % 4 === 0);
    this.makeKeyer(() => ({ origin: this.t0, unit: this.beat }), false);
  }

  input(side, down, perfMs) {
    if (this.ended || !down) return;
    const t = this.audio.perfToHeard(perfMs);
    const i = Math.round((t - this.t0) / this.beat);
    if (i >= 4 && i < this.n) this.taps.push(t - (this.t0 + i * this.beat));
    this.audio.tone(this.audio.ctxNow(), 0.05, 880, 0.08, 'sine', 'key');
  }

  update(now) {
    const done = now > this.t0 + this.n * this.beat + 0.3;
    const beat = Math.floor((now - this.t0) / this.beat);
    this.cfg.onProgress?.(Math.max(0, Math.min(this.n, beat + 1)), this.n, this.taps.length);
    if (done && !this.ended) {
      this.ended = true;
      const s = [...this.taps].sort((a, b) => a - b);
      const med = s.length ? s[Math.floor(s.length / 2)] : null;
      const spread = s.length > 3 ? (s[Math.floor(s.length * 0.8)] - s[Math.floor(s.length * 0.2)]) : null;
      this.cfg.onDone?.(med === null ? null : med * 1000, spread === null ? null : spread * 1000, s.length);
    }
  }

  render(now) {
    const ph = ((now - this.t0) / this.beat) % 1;
    this.cfg.onBeat?.(now >= this.t0 ? ph : 1);
  }
}
