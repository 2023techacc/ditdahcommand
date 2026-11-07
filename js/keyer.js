// Judges key edges against the beat grid and decodes elements into letters.
import { decodeCode } from './morse.js';

export const J_CRISP = 0, J_CLEAR = 1, J_STATIC = 2, J_GARBLED = 3;
export const J_NAMES = ['Crisp', 'Clear', 'Static', 'Garbled'];
export const J_POINTS = [300, 200, 50, 0];
export const J_SHAPES = ['◆', '●', '▲', '✕'];
export const J_CLASS = ['crisp', 'clear', 'static', 'garbled'];

// Base windows (seconds) for Normal difficulty.
export const BASE_WINDOWS = [0.035, 0.070, 0.120];

/**
 * Straight-key decoder.
 * gridFn(t) -> { origin, unit } gives the beat grid around time t.
 * windowsFn(unit) -> [crisp, clear, static] in seconds.
 */
export class Keyer {
  constructor({ gridFn, windowsFn, onLetter, onEdge, onElement, judged = true }) {
    this.gridFn = gridFn;
    this.windowsFn = windowsFn;
    this.onLetter = onLetter;
    this.onEdge = onEdge;
    this.onElement = onElement;
    this.judged = judged;
    this.reset();
  }

  reset() {
    this.isDown = false;
    this.cur = null;
    this.letterEls = [];
    this.lastUp = null;
    this.flagGarble = false;
    this.history = [];
    this.letters = [];
  }

  judge(t) {
    const { origin, unit } = this.gridFn(t);
    const k = Math.round((t - origin) / unit);
    const g = origin + k * unit;
    const err = t - g;
    const a = Math.abs(err);
    const w = this.windowsFn(unit);
    const j = !this.judged ? J_CLEAR : a <= w[0] ? J_CRISP : a <= w[1] ? J_CLEAR : a <= w[2] ? J_STATIC : J_GARBLED;
    return { k, g, err, j, unit };
  }

  down(t, opts = {}) {
    if (this.isDown) return null;
    const unit = this.gridFn(t).unit;
    if (this.lastUp !== null && this.letterEls.length) {
      const gap = (t - this.lastUp) / unit;
      if (gap >= 2) {
        this.finishLetter();
        // A 2-unit gap is neither a letter gap nor an element gap.
        if (Math.round(gap) === 2 && this.judged) this.flagGarble = true;
      } else if (Math.round(gap) !== 1 && !opts.perfect && this.judged) {
        this.flagGarble = true;
      }
    }
    const dj = this.judge(t);
    this.isDown = true;
    this.cur = { down: t, up: null, dj, uj: null, perfect: !!opts.perfect, sym: null, lenOk: true, j: dj.j };
    this.history.push(this.cur);
    if (this.history.length > 200) this.history.shift();
    this.onEdge?.(dj, 'down', t, this.cur);
    return dj;
  }

  up(t, opts = {}) {
    if (!this.isDown) return null;
    const e = this.cur;
    e.up = t;
    const unit = e.dj.unit;
    const raw = (t - e.down) / unit;
    e.sym = raw < 2 ? '.' : '-';
    if (e.perfect) {
      e.uj = e.dj;
      e.lenOk = true;
    } else {
      e.uj = this.judge(t);
      const want = e.sym === '.' ? 1 : 3;
      e.lenOk = !this.judged || e.uj.k - e.dj.k === want;
    }
    e.j = e.lenOk ? Math.max(e.dj.j, e.uj.j) : J_GARBLED;
    this.isDown = false;
    this.cur = null;
    this.lastUp = t;
    this.letterEls.push(e);
    if (!opts.perfect) this.onEdge?.(e.uj, 'up', t, e);
    this.onElement?.(e);
    return e.uj;
  }

  update(now) {
    if (!this.isDown && this.letterEls.length && this.lastUp !== null) {
      const unit = this.gridFn(now).unit;
      if ((now - this.lastUp) / unit >= 2) this.finishLetter();
    }
  }

  finishLetter() {
    const els = this.letterEls;
    if (!els.length) return null;
    this.letterEls = [];
    const code = els.map((e) => e.sym).join('');
    const sym = decodeCode(code);
    let q = 0;
    for (const e of els) q = Math.max(q, e.j);
    if (this.flagGarble) q = J_GARBLED;
    this.flagGarble = false;
    const letter = { code, sym, q, start: els[0].down, end: els[els.length - 1].up, els };
    for (const e of els) e.letter = letter;
    this.letters.push(letter);
    if (this.letters.length > 60) this.letters.shift();
    this.onLetter?.(letter);
    return letter;
  }

  // Force-close: release a held key and finish the pending letter.
  flush(t) {
    if (this.isDown) this.up(t);
    return this.finishLetter();
  }

  // Drop the held key and any half-finished letter without decoding it.
  abort() {
    if (this.cur) {
      const i = this.history.indexOf(this.cur);
      if (i >= 0) this.history.splice(i, 1);
    }
    this.isDown = false;
    this.cur = null;
    this.letterEls = [];
    this.flagGarble = false;
  }
}

/**
 * Iambic paddle keyer: left = dot, right = dash, squeeze alternates.
 * Makes perfectly sized elements; the player is judged on element starts and gaps.
 * Drives a straight Keyer and a tone callback.
 */
export class IambicKeyer {
  constructor({ keyer, unitFn, toneOn, toneOff }) {
    this.keyer = keyer;
    this.unitFn = unitFn;
    this.toneOn = toneOn;
    this.toneOff = toneOff;
    this.held = { dit: false, dah: false };
    this.latch = { dit: false, dah: false };
    this.lastPressed = null;
    this.el = null; // current element {type, start, end}
    this.gapEnd = null;
    this.lastType = null;
  }

  paddle(side, pressed, t) {
    this.held[side] = pressed;
    if (pressed) {
      this.latch[side] = true;
      this.lastPressed = side;
      if (!this.el && (this.gapEnd === null || t >= this.gapEnd)) {
        this.start(side, t, false);
      }
    }
  }

  start(type, t, perfectTiming) {
    const unit = this.unitFn(t);
    const len = type === 'dit' ? unit : unit * 3;
    this.el = { type, start: t, end: t + len };
    this.latch[type] = false;
    this.lastType = type;
    this.keyer.down(t, { perfect: true, inherit: perfectTiming });
    this.toneOn?.(t, this.el.end);
  }

  pickNext() {
    const { dit, dah } = this.held;
    if (dit && dah) return this.lastType === 'dit' ? 'dah' : 'dit';
    // Memory: a paddle tapped during the element or gap is honoured.
    const opp = this.lastType === 'dit' ? 'dah' : 'dit';
    if (this.latch[opp]) return opp;
    if (dit) return 'dit';
    if (dah) return 'dah';
    if (this.latch[this.lastType]) return this.lastType;
    return null;
  }

  update(now) {
    if (this.el && now >= this.el.end) {
      const end = this.el.end;
      this.keyer.up(end, { perfect: true });
      this.toneOff?.(end);
      this.el = null;
      this.gapEnd = end + this.unitFn(end);
    }
    if (!this.el && this.gapEnd !== null && now >= this.gapEnd) {
      const next = this.pickNext();
      const at = this.gapEnd;
      this.gapEnd = null;
      if (next) this.start(next, at, true);
    }
  }

  reset() {
    this.held = { dit: false, dah: false };
    this.latch = { dit: false, dah: false };
    this.el = null;
    this.gapEnd = null;
  }
}
