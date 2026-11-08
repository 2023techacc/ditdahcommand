// Ticker-tape lane: time flows right to left into the transmit line.
import { J_SHAPES } from './keyer.js';
import { t as tr } from './i18n.js';

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
    this.style = 'classic';
    this.zoom = 1;
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
    if (this.style === 'clear') return this.drawClear(s);
    const pxPerUnit = Math.max(12, Math.min(36, W / 26)) * this.zoom;
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
      g.fillText(tr(m.label), x, strong || m.kind === 'word' ? H - 7 : 29);
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


// High-contrast lane: dark background, bright notes, beat numbers.
const CL = {
  bg: '#0d110f',
  lane: '#161d19',
  beat: 'rgba(255,255,255,0.14)',
  bar: 'rgba(255,255,255,0.45)',
  unit: 'rgba(255,255,255,0.10)',
  window: 'rgba(95,211,138,0.09)',
  note: '#ffcf5a',
  noteEdge: '#7a5a12',
  text: '#f4efe2',
  muted: 'rgba(244,239,226,0.55)',
  report: '#5ad1ff',
  guide: '#5ad1ff',
  j: ['#5fe39a', '#6fc3ff', '#ffb23f', '#ff6a55'],
};

TapeView.prototype.drawClear = function drawClear(s) {
  const g = this.g;
  const W = this.w, H = this.h;
  const pxPerUnit = Math.max(16, Math.min(44, W / 22)) * this.zoom;
  const pps = pxPerUnit / s.unit;
  const lineX = Math.round(W * (s.lineFrac ?? 0.28));
  const X = (t) => lineX + (t - s.now) * pps;
  const tMin = s.now - lineX / pps;
  const tMax = s.now + (W - lineX) / pps;
  const top = 18, bottom = H - 20;
  const midY = (top + bottom) / 2;
  const noteH = Math.max(12, Math.min(26, (bottom - top) * 0.42));

  g.fillStyle = CL.bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = CL.lane;
  g.fillRect(0, top, W, bottom - top);

  for (const [a, b] of s.windows || []) {
    if (b < tMin || a > tMax) continue;
    g.fillStyle = CL.window;
    g.fillRect(X(a), top, X(b) - X(a), bottom - top);
  }

  // Grid with beat numbers ("1 2 3 4") under the lane.
  const grid = (s.grid || []).slice().sort((a, b) => a.t - b.t);
  let beatNo = 0;
  g.textAlign = 'center';
  for (const l of grid) {
    if (l.kind === 'bar') beatNo = 1;
    else if (l.kind === 'beat') beatNo++;
    if (l.t < tMin - 0.01 || l.t > tMax) continue;
    const x = Math.round(X(l.t)) + 0.5;
    if (l.kind === 'unit') {
      g.strokeStyle = CL.unit;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, bottom - 6);
      g.lineTo(x, bottom);
      g.stroke();
      continue;
    }
    g.strokeStyle = l.kind === 'bar' ? CL.bar : CL.beat;
    g.lineWidth = l.kind === 'bar' ? 2 : 1;
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, bottom);
    g.stroke();
    if (beatNo) {
      g.fillStyle = l.kind === 'bar' ? CL.text : CL.muted;
      g.font = `${l.kind === 'bar' ? 800 : 600} 11px ui-monospace, Menlo, monospace`;
      g.fillText(String(beatNo), x, H - 6);
    }
    if (l.label) {
      g.fillStyle = CL.muted;
      g.font = '700 10px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText(tr('BAR {n}', { n: l.label }), x + 4, 12);
      g.textAlign = 'center';
    }
  }

  // Incoming report along the top edge.
  g.fillStyle = CL.report;
  for (const r of s.report || []) {
    if (r.t1 < tMin || r.t0 > tMax) continue;
    g.fillRect(X(r.t0), top + 2, Math.max(2, X(r.t1) - X(r.t0)), 3);
  }

  // Target notes.
  for (const tg of s.targets || []) {
    if (tg.t1 < tMin || tg.t0 > tMax) continue;
    const x0 = X(tg.t0), x1 = X(tg.t1);
    const w = Math.max(noteH, x1 - x0 - 2);
    g.fillStyle = CL.note;
    g.strokeStyle = CL.noteEdge;
    g.lineWidth = 2;
    roundRect(g, x0 + 1, midY - noteH / 2, w, noteH, noteH / 2);
    g.fill();
    g.stroke();
  }
  g.font = '800 13px ui-monospace, Menlo, monospace';
  g.fillStyle = CL.text;
  g.textAlign = 'left';
  for (const tl of s.targetLetters || []) {
    if (tl.t1 < tMin || tl.t0 > tMax) continue;
    g.fillText(tl.label, X(tl.t0) + 1, midY - noteH / 2 - 5);
  }

  // Gap guide.
  for (const m of s.guide || []) {
    if (m.kind === 'bad') {
      if (m.t1 < tMin || m.t0 > tMax) continue;
      g.fillStyle = 'rgba(255,106,85,0.22)';
      g.fillRect(X(m.t0), top, X(m.t1) - X(m.t0), bottom - top);
      continue;
    }
    if (m.t < tMin || m.t > tMax) continue;
    const x = Math.round(X(m.t)) + 0.5;
    const strong = m.kind === 'letter' || m.kind === 'dah';
    g.strokeStyle = CL.guide;
    g.globalAlpha = strong ? 1 : 0.6;
    g.lineWidth = strong ? 3 : 1.5;
    g.setLineDash(strong ? [] : [4, 3]);
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x, bottom);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    g.fillStyle = CL.guide;
    g.font = '800 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(tr(m.label), x, strong ? bottom - 4 : top + 12);
    g.textAlign = 'left';
  }

  // Keyed signal, drawn inside the notes so the target outline stays visible.
  const inkH = noteH * 0.55;
  for (const k of s.keyed || []) {
    const up = k.up ?? s.now;
    if (up < tMin || k.down > tMax) continue;
    g.fillStyle = k.offAir ? 'rgba(244,239,226,0.25)' : CL.j[k.j ?? 1];
    roundRect(g, X(k.down), midY - inkH / 2, Math.max(3, X(up) - X(k.down)), inkH, inkH / 2);
    g.fill();
  }

  // Decoded letters.
  g.textAlign = 'center';
  for (const l of s.letters || []) {
    if (l.end < tMin || l.start > tMax) continue;
    const x = (X(l.start) + X(l.end)) / 2;
    g.fillStyle = l.offAir ? CL.muted : CL.j[l.q];
    g.font = '900 16px ui-monospace, Menlo, monospace';
    const label = l.offAir ? l.label : `${l.label} ${J_SHAPES[l.q]}`;
    g.fillText(label, x, midY + noteH / 2 + 15);
  }
  g.textAlign = 'left';

  // "Now" line.
  g.fillStyle = s.keyDown ? 'rgba(95,227,154,0.35)' : 'rgba(255,255,255,0.08)';
  g.fillRect(lineX - 8, top, 16, bottom - top);
  g.fillStyle = s.keyDown ? CL.j[0] : CL.text;
  g.fillRect(lineX - 1.5, 0, 3, H);
  g.font = '800 9px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(tr('NOW'), lineX, 10);
  g.textAlign = 'left';
};

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
