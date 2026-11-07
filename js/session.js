// Shared plumbing for anything the player keys into: missions, drills,
// Free Key and calibration.
import { Keyer, IambicKeyer, BASE_WINDOWS, J_GARBLED } from './keyer.js';

export const DIFF_MULT = { easy: 1.3, normal: 1, hard: 0.8 };

export class Session {
  constructor(app, opts = {}) {
    this.app = app;
    this.audio = app.audio;
    this.settings = app.settings;
    this.iambic = !!opts.iambic;
    this.paused = false;
    this.ended = false;
    this.keyDown = false;
  }

  windowsFn(unit) {
    const S = this.settings;
    let m = DIFF_MULT[S.difficulty] ?? 1;
    if (S.playMode === 'strategist') m *= 1.6;
    if (this.forceHard) m = Math.min(m, 0.8);
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) m *= 1.15;
    const scale = Math.min(1, unit / 0.2);
    return BASE_WINDOWS.map((w) => w * m * scale);
  }

  makeKeyer(gridFn, judged = true) {
    this.keyer = new Keyer({
      gridFn,
      judged,
      windowsFn: (u) => this.windowsFn(u),
      onLetter: (l) => this.onLetter(l),
      onEdge: (j, edge, t, el) => this.onEdge(j, edge, t, el),
    });
    if (this.iambic) {
      this.ikeyer = new IambicKeyer({
        keyer: this.keyer,
        unitFn: (t) => gridFn(t).unit,
        toneOn: (t, end) => {
          const shift = this.audio.lat + this.settings.inputOffset / 1000;
          this.audio.keyPulse(t + shift, end + shift);
          this.keyDown = true;
        },
        toneOff: () => {
          this.keyDown = false;
        },
      });
    }
  }

  // Called by the input manager. side: 'key' | 'dit' | 'dah'.
  input(side, down, perfMs) {
    if (this.paused || this.ended || !this.keyer) return;
    const t = this.audio.perfToHeard(perfMs) - this.settings.inputOffset / 1000;
    if (this.iambic) {
      if (side === 'key') return;
      this.ikeyer.paddle(side, down, t);
      return;
    }
    if (down) {
      const j = this.keyer.down(t);
      if (j) {
        const onAir = this.isOnAir(t);
        this.audio.keyOn(onAir ? j.j : 0);
        this.keyDown = true;
      }
    } else {
      const j = this.keyer.up(t);
      this.audio.keyOff();
      this.keyDown = false;
      const last = this.keyer.history[this.keyer.history.length - 1];
      if (j && last && !last.offAir && last.j === J_GARBLED && this.keyer.judged) this.audio.crackleBurst();
    }
  }

  releaseAll() {
    if (this.keyer?.isDown) this.keyer.abort();
    this.ikeyer?.reset();
    this.audio.keyOffNow();
    this.keyDown = false;
  }

  isOnAir() {
    return true;
  }

  onEdge(j, edge, t, el) {
    if (edge === 'down') el.offAir = !this.isOnAir(t);
  }

  onLetter() {}

  frame() {
    const now = this.audio.heardNow();
    if (!this.paused && !this.ended) {
      this.keyer?.update(now);
      this.ikeyer?.update(now);
      this.update(now);
    }
    this.render(now + (this.settings.visualOffset || 0) / 1000);
  }

  update() {}
  render() {}

  pause() {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.releaseAll();
    this.audio.suspend();
  }

  async resume() {
    if (!this.paused) return;
    await this.audio.resume();
    this.audio.sync(true);
    this.paused = false;
  }

  stop() {
    this.ended = true;
    this.releaseAll();
    this.audio.silence();
  }

  keyedForTape() {
    if (!this.keyer) return [];
    return this.keyer.history.map((e) => ({ down: e.down, up: e.up, j: e.up === null ? e.dj.j : e.j, offAir: e.offAir }));
  }
}
