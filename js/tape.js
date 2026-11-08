// Ticker-tape lane: time flows right to left into the transmit line.
import { J_SHAPES } from './keyer.js';

const COL = {
  paper: '#efe3c6',
  paper2: '#e3d3ae',
  edge: '#c9b48a',
  ink: '#2a1d12',
  grid: 'rgba(60,40,20,0.10)',
  beat: 'rgba(60,40,20,0.22)',
  bar: 'rgba(60,40,20,0.55)',
  window: 'rgba(95,211,138,0.10)',
  hole: '#3a2a1a',
  holeRim: '#9c8257',
  report: '#b8862f',
  line: '#c8a14a',
  j: ['#2f9e5b', '#3f8fc0', '#d58a1d', '#c8402d'],
};

export class TapeView {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.resize();
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(10, r.width);
    this.h = Math.max(10, r.height);
    this.c.width = Math.round(this.w * dpr);
    this.c.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * s: {
   *  now, unit, grid: [{t, kind:'unit'|'beat'|'bar', label}],
   *  windows: [[t0,t1]], targets: [{t0,t1}], targetLetters: [{t0,t1,label}],
   *  keyed: [{down, up, j, offAir}], curDown: {down, j}|null,
   *  letters: [{start,end,label,q,offAir}], report: [{t0,t1}],
   *  lineFrac
   * }
   */
  draw(s) {
    const g = this.g;
    const W = this.w, H = this.h;
    if (this.c.width === 0) return;
    const pxPerUnit = Math.max(12, Math.min(36, W / 26));
    const pps = pxPerUnit / s.unit;
    const lineX = Math.round(W * (s.lineFrac ?? 0.3));
    const X = (t) => lineX + (t - s.now) * pps;
    const tMin = s.now - lineX / pps;
    const tMax = s.now + (W - lineX) / pps;

    // Paper.
    g.fillStyle = COL.paper;
    g.fillRect(0, 0, W, H);
    g.fillStyle = COL.paper2;
    g.fillRect(0, 0, W, 6);
    g.fillRect(0, H - 6, W, 6);
    // Sprocket holes drift with time.
    g.fillStyle = COL.edge;
    const sp = 18;
    const shift = ((s.now * pps) % sp + sp) % sp;
    for (let x = -shift; x < W; x += sp) {
      g.fillRect(x, 2, 6, 2);
      g.fillRect(x, H - 4, 6, 2);
    }

    const midY = H * 0.5;
    const holeH = Math.max(10, Math.min(18, H * 0.2));
    const inkY = midY + holeH * 0.15;

    // Transmit windows.
    for (const [a, b] of s.windows || []) {
      if (b < tMin || a > tMax) continue;
      g.fillStyle = COL.window;
      g.fillRect(X(a), 6, X(b) - X(a), H - 12);
    }

    // Grid.
    for (const l of s.grid || []) {
      if (l.t < tMin - 0.01 || l.t > tMax) continue;
      const x = Math.round(X(l.t)) + 0.5;
      g.strokeStyle = l.kind === 'bar' ? COL.bar : l.kind === 'beat' ? COL.beat : COL.grid;
      g.lineWidth = l.kind === 'bar' ? 1.5 : 1;
      g.beginPath();
      g.moveTo(x, l.kind === 'unit' ? H * 0.28 : 6);
      g.lineTo(x, l.kind === 'unit' ? H * 0.72 : H - 6);
      g.stroke();
      if (l.label) {
        g.fillStyle = COL.bar;
        g.font = '600 10px ui-monospace, Menlo, monospace';
        g.fillText(l.label, x + 3, 16);
      }
    }

    // Incoming report (top band).
    g.fillStyle = COL.report;
    for (const r of s.report || []) {
      if (r.t1 < tMin || r.t0 > tMax) continue;
      g.fillRect(X(r.t0), 9, Math.max(2, X(r.t1) - X(r.t0)), 4);
    }

    // Target holes.
    for (const tg of s.targets || []) {
      if (tg.t1 < tMin || tg.t0 > tMax) continue;
      const x0 = X(tg.t0), x1 = X(tg.t1);
      const pad = Math.min(3, pxPerUnit * 0.12);
      const w = Math.max(holeH * 0.9, x1 - x0 - pad * 2);
      g.fillStyle = COL.holeRim;
      roundRect(g, x0 + pad - 1.5, midY - holeH / 2 - 1.5, w + 3, holeH + 3, holeH / 2 + 1.5);
      g.fill();
      g.fillStyle = tg.done ? 'rgba(58,42,26,0.35)' : COL.hole;
      roundRect(g, x0 + pad, midY - holeH / 2, w, holeH, holeH / 2);
      g.fill();
    }
    g.font = '700 12px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(42,29,18,0.75)';
    for (const tl of s.targetLetters || []) {
      if (tl.t1 < tMin || tl.t0 > tMax) continue;
      g.fillText(tl.label, X(tl.t0), midY - holeH / 2 - 5);
    }

    // Gap guide: where the current element should end, or when the next
    // element / letter may start, measured from the player's own last edge.
    for (const m of s.guide || []) {
      if (m.kind === 'bad') {
        if (m.t1 < tMin || m.t0 > tMax) continue;
        g.fillStyle = 'rgba(200,64,45,0.16)';
        g.fillRect(X(m.t0), 20, X(m.t1) - X(m.t0), H - 40);
        continue;
      }
      if (m.t < tMin || m.t > tMax) continue;
      const x = Math.round(X(m.t)) + 0.5;
      const strong = m.kind === 'letter' || m.kind === 'dah';
      g.strokeStyle = strong ? 'rgba(47,158,91,0.95)' : 'rgba(47,158,91,0.6)';
      g.lineWidth = strong ? 2.5 : 1.5;
      g.setLineDash(strong ? [] : [3, 3]);
      g.beginPath();
      g.moveTo(x, 20);
      g.lineTo(x, H - 20);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(31,110,62,0.95)';
      g.font = '800 10px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(m.label, x, strong || m.kind === 'word' ? H - 7 : 29);
      g.textAlign = 'left';
    }

    // Keyed ink.
    const inkH = Math.max(4, holeH * 0.45);
    for (const k of s.keyed || []) {
      const up = k.up ?? s.now;
      if (up < tMin || k.down > tMax) continue;
      g.fillStyle = k.offAir ? 'rgba(42,29,18,0.3)' : COL.j[k.j ?? 1];
      g.fillRect(X(k.down), inkY - inkH / 2, Math.max(2, X(up) - X(k.down)), inkH);
    }

    // Decoded letters.
    g.textAlign = 'center';
    for (const l of s.letters || []) {
      if (l.end < tMin || l.start > tMax) continue;
      const x = (X(l.start) + X(l.end)) / 2;
      g.fillStyle = l.offAir ? 'rgba(42,29,18,0.4)' : COL.j[l.q];
      g.font = '800 15px ui-monospace, Menlo, monospace';
      g.fillText(l.label, x, H - 12);
      if (!l.offAir) {
        g.font = '700 10px system-ui, sans-serif';
        g.fillText(J_SHAPES[l.q], x + g.measureText(l.label).width + 6, H - 13);
      }
    }
    g.textAlign = 'left';

    // Transmit line (the key head).
    g.fillStyle = COL.line;
    g.fillRect(lineX - 1.5, 0, 3, H);
    g.fillStyle = s.keyDown ? '#5fd38a' : '#8a6a2a';
    g.beginPath();
    g.moveTo(lineX - 7, 0);
    g.lineTo(lineX + 7, 0);
    g.lineTo(lineX, 9);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(lineX - 7, H);
    g.lineTo(lineX + 7, H);
    g.lineTo(lineX, H - 9);
    g.closePath();
    g.fill();
    if (s.keyDown) {
      g.fillStyle = 'rgba(95,211,138,0.25)';
      g.fillRect(lineX - 6, 6, 12, H - 12);
    }

    // Fade the past a little.
    const grad = g.createLinearGradient(0, 0, lineX, 0);
    grad.addColorStop(0, 'rgba(239,227,198,0.75)');
    grad.addColorStop(1, 'rgba(239,227,198,0)');
    g.fillStyle = grad;
    g.fillRect(0, 6, lineX - 2, H - 12);
  }
}

export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
