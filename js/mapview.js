// Tabletop war-room map: paper, wooden blocks, pins, and a lamp that pulses
// with the beat. Non-graphic: units that are knocked out are tipped over.
import { ROWS, COLS, ENEMY_TYPES } from './battle.js';
import { UNIT_INFO } from './morse.js';
import { roundRect } from './tape.js';

const ENEMY_ICON = { rifle: 'R', armor: 'Ar', gun: 'B', post: 'O' };

export class MapView {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.snap = null;
    this.disp = new Map();
    this.fx = [];
    this.bubbles = [];
    this.flags = [];
    this.lampFlash = 0;
    this.edgeDisp = COLS;
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
    this.layout();
    this.paper = null;
  }

  layout() {
    const m = Math.max(8, Math.min(this.w, this.h) * 0.04);
    const top = m + 14;
    this.gx = m;
    this.gy = top;
    this.gw = this.w - m * 2;
    this.gh = this.h - top - m;
    this.cw = this.gw / COLS;
    this.ch = this.gh / ROWS;
    this.block = Math.max(18, Math.min(this.cw, this.ch) * 0.5);
  }

  cellCenter(row, col) {
    return { x: this.gx + (col + 0.5) * this.cw, y: this.gy + (row + 0.5) * this.ch };
  }

  setFlags(flags) {
    this.flags = flags || [];
  }

  // Apply a battle snapshot, animating moves and showing events.
  apply(snap, events = []) {
    const prev = this.snap;
    this.snap = snap;
    const now = performance.now();
    const all = [...snap.squads.map((s) => ({ ...s, side: 'us' })), ...snap.enemies.map((e) => ({ ...e, side: 'them' }))];
    for (const u of all) {
      // Squads sharing a cell are offset so both stay visible.
      const p = this.cellCenter(u.row, u.col);
      if (u.side === 'us') {
        const mates = snap.squads.filter((s) => s.row === u.row && s.col === u.col && s.alive === u.alive);
        if (mates.length > 1) {
          const i = mates.findIndex((s) => s.id === u.id);
          p.x += (i - (mates.length - 1) / 2) * this.block * 0.7;
          p.y += (i - (mates.length - 1) / 2) * this.block * 0.25;
        }
      }
      const d = this.disp.get(u.id);
      if (!d) this.disp.set(u.id, { x: p.x, y: p.y, fx: p.x, fy: p.y, tx: p.x, ty: p.y, t0: now, born: now });
      else {
        d.fx = d.x; d.fy = d.y; d.tx = p.x; d.ty = p.y; d.t0 = now;
      }
    }
    for (const ev of events) this.event(ev, now);
    if (!prev) this.edgeDisp = snap.edge;
  }

  find(id) {
    if (!this.snap) return null;
    return this.snap.squads.find((s) => s.id === id) || this.snap.enemies.find((e) => e.id === id) || null;
  }

  pos(id) {
    const d = this.disp.get(id);
    return d ? { x: d.x, y: d.y } : null;
  }

  event(ev, now) {
    const P = (id) => this.pos(id) || (this.find(id) ? this.cellCenter(this.find(id).row, this.find(id).col) : null);
    switch (ev.type) {
      case 'hit': {
        const a = P(ev.from), b = P(ev.to);
        if (a && b) this.fx.push({ k: 'line', a, b, c: '#c8402d', t0: now, d: 500, hidden: ev.hidden });
        if (b) this.fx.push({ k: 'puff', p: b, c: '#6b5a48', t0: now + 150, d: 700 });
        if (b) this.fx.push({ k: 'num', p: b, text: '-' + ev.dmg, c: '#c8402d', t0: now + 150, d: 1100 });
        break;
      }
      case 'shot': {
        const a = P(ev.from), b = P(ev.to);
        if (a && b) this.fx.push({ k: ev.indirect ? 'arc' : 'line', a, b, c: '#2f7a4a', t0: now, d: 600 });
        break;
      }
      case 'ehit': {
        const b = P(ev.id);
        if (b) {
          this.fx.push({ k: 'puff', p: b, c: '#5a4a3a', t0: now + 200, d: 700 });
          this.fx.push({ k: 'num', p: b, text: '-' + ev.dmg, c: '#2f7a4a', t0: now + 200, d: 1100 });
        }
        break;
      }
      case 'heal': {
        const b = P(ev.to);
        if (b) this.fx.push({ k: 'num', p: b, text: '+' + ev.amt, c: '#2f9e5b', t0: now, d: 1200 });
        break;
      }
      case 'eout': {
        const b = P(ev.id);
        if (b) this.fx.push({ k: 'puff', p: b, c: '#8a7a68', t0: now + 250, d: 1200, big: true });
        break;
      }
      case 'breakthrough':
        this.fx.push({ k: 'edge', c: '#c8402d', t0: now, d: 900 });
        break;
      case 'miss': {
        const a = P(ev.from);
        if (a) this.fx.push({ k: 'num', p: a, text: '?', c: '#6b5a48', t0: now, d: 900 });
        break;
      }
      default:
    }
  }

  bubble(id, text, ms = 2600, tone = 'normal') {
    this.bubbles = this.bubbles.filter((b) => b.id !== id);
    this.bubbles.push({ id, text, t0: performance.now(), d: ms, tone });
  }

  makePaper() {
    const cv = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(this.w * dpr);
    cv.height = Math.round(this.h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Table.
    g.fillStyle = '#3a2618';
    g.fillRect(0, 0, this.w, this.h);
    // Paper map.
    const px = this.gx - 4, py = this.gy - 4, pw = this.gw + 8, ph = this.gh + 8;
    g.fillStyle = '#e7d7b1';
    g.fillRect(px, py, pw, ph);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(120,90,50,${rnd() * 0.06})`;
      g.beginPath();
      g.arc(px + rnd() * pw, py + rnd() * ph, rnd() * 18 + 2, 0, Math.PI * 2);
      g.fill();
    }
    // Ridge on the enemy side.
    g.strokeStyle = 'rgba(110,80,45,0.45)';
    g.lineWidth = 1;
    const rx = this.gx + this.cw * 5;
    for (let r = 0; r < ROWS; r++) {
      const cy = this.gy + (r + 0.5) * this.ch;
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.ellipse(rx + this.cw * 0.55, cy, this.cw * (0.15 + j * 0.09), this.ch * (0.12 + j * 0.08), 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // Road through the middle lane.
    g.strokeStyle = 'rgba(120,90,50,0.35)';
    g.setLineDash([6, 5]);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(this.gx, this.gy + this.ch * 1.5);
    for (let c = 0; c <= COLS; c++) g.lineTo(this.gx + c * this.cw, this.gy + this.ch * 1.5 + Math.sin(c * 1.7) * this.ch * 0.12);
    g.stroke();
    g.setLineDash([]);
    // Trees.
    for (let i = 0; i < 14; i++) {
      const x = this.gx + rnd() * this.gw, y = this.gy + rnd() * this.gh;
      g.fillStyle = 'rgba(90,110,60,0.18)';
      g.beginPath();
      g.arc(x, y, 4 + rnd() * 5, 0, Math.PI * 2);
      g.fill();
    }
    // Grid.
    g.strokeStyle = 'rgba(80,55,30,0.25)';
    g.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      g.beginPath();
      g.moveTo(this.gx + c * this.cw + 0.5, this.gy);
      g.lineTo(this.gx + c * this.cw + 0.5, this.gy + this.gh);
      g.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      g.beginPath();
      g.moveTo(this.gx, this.gy + r * this.ch + 0.5);
      g.lineTo(this.gx + this.gw, this.gy + r * this.ch + 0.5);
      g.stroke();
    }
    // Our trench line.
    g.strokeStyle = 'rgba(60,90,60,0.5)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(this.gx + 2, this.gy);
    g.lineTo(this.gx + 2, this.gy + this.gh);
    g.stroke();
    // Zone labels.
    g.fillStyle = '#d9c7a0';
    g.font = '600 11px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    for (let c = 0; c < COLS; c++) g.fillText('ZONE ' + (c + 1), this.gx + (c + 0.5) * this.cw, this.gy - 6);
    g.textAlign = 'left';
    this.paper = cv;
  }

  draw(beatPhase = 0, lampOn = false) {
    const g = this.g;
    const W = this.w, H = this.h;
    if (!this.paper) this.makePaper();
    g.drawImage(this.paper, 0, 0, W, H);
    const now = performance.now();

    // Objective flags.
    for (const f of this.flags) {
      const rows = f.row === undefined ? [0, 1, 2] : [f.row];
      for (const r of rows) {
        const p = this.cellCenter(r, f.col);
        const x = p.x + this.cw * 0.32, y = p.y - this.ch * 0.3;
        g.strokeStyle = '#6b4a2a';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + this.ch * 0.3);
        g.stroke();
        g.fillStyle = '#5fa46f';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 10, y + 4);
        g.lineTo(x, y + 8);
        g.closePath();
        g.fill();
      }
    }

    if (!this.snap) return;
    const snap = this.snap;

    // Fog.
    const edge = snap.fog ? snap.edge : COLS;
    this.edgeDisp += (edge - this.edgeDisp) * 0.08;
    if (snap.fog && this.edgeDisp < COLS - 0.01) {
      const fx = this.gx + (this.edgeDisp + 1) * this.cw;
      if (fx < this.gx + this.gw) {
        const grad = g.createLinearGradient(fx - this.cw * 0.3, 0, fx + this.cw * 0.2, 0);
        grad.addColorStop(0, 'rgba(40,30,22,0)');
        grad.addColorStop(1, 'rgba(40,30,22,0.82)');
        g.fillStyle = grad;
        g.fillRect(fx - this.cw * 0.3, this.gy - 2, this.gx + this.gw - fx + this.cw * 0.3 + 2, this.gh + 4);
        g.fillStyle = 'rgba(230,215,180,0.25)';
        g.font = '700 16px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        for (let c = Math.ceil(this.edgeDisp + 1); c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const p = this.cellCenter(r, c);
            g.fillText('?', p.x, p.y + 5);
          }
        }
        g.textAlign = 'left';
      }
    }

    // Animate positions.
    for (const [, d] of this.disp) {
      const k = Math.min(1, (now - d.t0) / 450);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      d.x = d.fx + (d.tx - d.fx) * e;
      d.y = d.fy + (d.ty - d.fy) * e;
    }

    const B = this.block;
    // Enemies.
    for (const e of snap.enemies) {
      const d = this.disp.get(e.id);
      if (!d) continue;
      const visible = !snap.fog || e.col <= edge || e.marked && !ENEMY_TYPES[e.k].move;
      if (!e.alive || !visible) continue;
      const fade = Math.min(1, (now - d.born) / 400);
      g.globalAlpha = fade;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(g, d.x - B / 2 + 3, d.y - B / 2 + 4, B, B, 4);
      g.fill();
      g.fillStyle = e.k === 'gun' ? '#7a2e24' : e.k === 'armor' ? '#6a2a22' : '#8a3a2c';
      roundRect(g, d.x - B / 2, d.y - B / 2, B, B, 4);
      g.fill();
      g.strokeStyle = '#3a140f';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#f2dccb';
      g.font = `800 ${Math.round(B * 0.42)}px ui-monospace, Menlo, monospace`;
      g.textAlign = 'center';
      g.fillText(ENEMY_ICON[e.k], d.x, d.y + B * 0.15);
      this.hpBar(d.x, d.y + B / 2 + 4, B, e.hp / e.maxhp, '#c8402d');
      g.globalAlpha = 1;
    }

    // Squads.
    for (const s of snap.squads) {
      const d = this.disp.get(s.id);
      if (!d) continue;
      g.save();
      g.translate(d.x, d.y);
      if (!s.alive) {
        g.rotate(Math.PI / 2.4);
        g.globalAlpha = 0.6;
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      roundRect(g, -B / 2 + 3, -B / 2 + 4, B, B, 5);
      g.fill();
      const wood = g.createLinearGradient(-B / 2, -B / 2, B / 2, B / 2);
      wood.addColorStop(0, '#d9a75e');
      wood.addColorStop(1, '#a8743a');
      g.fillStyle = s.alive ? wood : '#8a7a68';
      roundRect(g, -B / 2, -B / 2, B, B, 5);
      g.fill();
      g.strokeStyle = '#5a3a1a';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#2a1a0c';
      g.font = `800 ${Math.round(B * 0.55)}px ui-monospace, Menlo, monospace`;
      g.textAlign = 'center';
      g.fillText(s.t, 0, B * 0.19);
      g.restore();
      g.textAlign = 'center';
      if (s.alive) {
        this.hpBar(d.x, d.y + B / 2 + 4, B, s.hp / 100, s.hp > 50 ? '#3fa45f' : s.hp > 25 ? '#d58a1d' : '#c8402d');
        // Status icons.
        let ix = d.x + B / 2 + 2;
        const icon = (txt, col) => {
          g.fillStyle = col;
          g.font = '700 11px system-ui, sans-serif';
          g.fillText(txt, ix + 6, d.y - B / 2 + 8);
          ix += 12;
        };
        if (s.hold) icon('⛨', '#2a4a6a');
        if (s.dig) icon('▤', '#5a3a1a');
        if (s.digLock && !s.dig) icon('▤', 'rgba(90,58,26,0.5)');
        if (s.smoke) {
          g.fillStyle = 'rgba(235,235,230,0.65)';
          for (let i = 0; i < 5; i++) {
            const a = now / 700 + i * 1.3;
            g.beginPath();
            g.arc(d.x + Math.cos(a) * B * 0.45, d.y + Math.sin(a) * B * 0.3, B * 0.28, 0, Math.PI * 2);
            g.fill();
          }
        }
      } else {
        g.fillStyle = '#e7d7b1';
        g.font = '700 9px system-ui, sans-serif';
        g.fillText('OUT', d.x, d.y + B / 2 + 12);
      }
      g.textAlign = 'left';
    }

    // Effects.
    this.fx = this.fx.filter((f) => now < f.t0 + f.d);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.d;
      if (k < 0) continue;
      g.globalAlpha = 1 - k;
      if (f.k === 'line') {
        g.strokeStyle = f.c;
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.beginPath();
        const a = f.hidden ? { x: this.gx + this.gw, y: f.b.y } : f.a;
        g.moveTo(a.x, a.y);
        g.lineTo(a.x + (f.b.x - a.x) * Math.min(1, k * 3), a.y + (f.b.y - a.y) * Math.min(1, k * 3));
        g.stroke();
        g.setLineDash([]);
      } else if (f.k === 'arc') {
        g.strokeStyle = f.c;
        g.lineWidth = 2;
        g.setLineDash([3, 4]);
        g.beginPath();
        const mx = (f.a.x + f.b.x) / 2, my = Math.min(f.a.y, f.b.y) - this.ch;
        g.moveTo(f.a.x, f.a.y);
        g.quadraticCurveTo(mx, my, f.b.x, f.b.y);
        g.stroke();
        g.setLineDash([]);
      } else if (f.k === 'puff') {
        g.fillStyle = f.c;
        const r = B * (f.big ? 0.9 : 0.5) * (0.4 + k);
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.arc(f.p.x + Math.cos(i * 1.6) * r * 0.5, f.p.y + Math.sin(i * 1.6) * r * 0.4 - k * 10, r * 0.5, 0, Math.PI * 2);
          g.fill();
        }
      } else if (f.k === 'num') {
        g.fillStyle = f.c;
        g.font = '800 14px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        g.fillText(f.text, f.p.x, f.p.y - B * 0.7 - k * 18);
        g.textAlign = 'left';
      } else if (f.k === 'edge') {
        g.fillStyle = f.c;
        g.fillRect(0, 0, 8, H);
      }
      g.globalAlpha = 1;
    }

    // Speech bubbles.
    this.bubbles = this.bubbles.filter((b) => now < b.t0 + b.d);
    for (const b of this.bubbles) {
      const p = this.pos(b.id);
      if (!p) continue;
      this.drawBubble(p.x, p.y - B * 0.65, b.text, b.tone, Math.min(1, (b.t0 + b.d - now) / 300));
    }

    // Lamp light pulsing on the beat (and flashing the incoming report).
    const pulse = Math.pow(1 - beatPhase, 3);
    const lg = g.createRadialGradient(W * 0.5, -H * 0.1, 10, W * 0.5, H * 0.2, Math.max(W, H) * 0.9);
    const a = 0.10 + pulse * 0.12;
    lg.addColorStop(0, lampOn ? `rgba(140,255,170,${0.32 + a})` : `rgba(255,214,140,${a})`);
    lg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    // Lamp bulb.
    g.fillStyle = lampOn ? '#8cffaa' : `rgba(255,214,140,${0.5 + pulse * 0.5})`;
    g.beginPath();
    g.arc(W - 16, 12, 6, 0, Math.PI * 2);
    g.fill();
  }

  hpBar(x, y, w, f, col) {
    const g = this.g;
    g.fillStyle = 'rgba(30,20,10,0.55)';
    g.fillRect(x - w / 2, y, w, 4);
    g.fillStyle = col;
    g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), 4);
  }

  drawBubble(x, y, text, tone, alpha) {
    const g = this.g;
    g.font = '600 12px system-ui, sans-serif';
    const maxW = Math.min(170, this.w * 0.45);
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    if (line) lines.push(line);
    const lw = Math.max(...lines.map((l) => g.measureText(l).width)) + 14;
    const lh = 15;
    const bh = lines.length * lh + 8;
    let bx = Math.max(4, Math.min(this.w - lw - 4, x - lw / 2));
    let by = Math.max(4, y - bh - 8);
    g.globalAlpha = alpha;
    g.fillStyle = tone === 'bad' ? '#f6d6cc' : tone === 'good' ? '#e2f4df' : '#fbf5e6';
    g.strokeStyle = '#5a3a1a';
    g.lineWidth = 1.2;
    roundRect(g, bx, by, lw, bh, 6);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(Math.max(bx + 6, Math.min(bx + lw - 6, x - 5)), by + bh);
    g.lineTo(x, by + bh + 7);
    g.lineTo(Math.max(bx + 10, Math.min(bx + lw - 2, x + 5)), by + bh);
    g.fill();
    g.fillStyle = '#2a1a0c';
    lines.forEach((l, i) => g.fillText(l, bx + 7, by + 16 + i * lh));
    g.globalAlpha = 1;
  }
}

export function unitName(t) {
  return UNIT_INFO[t]?.name || t;
}
