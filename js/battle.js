// Light tactics layer: a 3-lane, 6-zone tabletop map. Squads only move by
// order; the enemy acts on the downbeat of every phrase.
import { UNIT_INFO, ORDER_INFO } from './morse.js';

export const ROWS = 3;
export const COLS = 6;

export const SQUAD_STATS = {
  T: { fire: 40, range: 1, vision: 1, armor: 0.7, ram: 30 },
  I: { fire: 30, range: 1, vision: 1, armor: 1.0 },
  S: { fire: 15, range: 1, vision: 3, armor: 1.1 },
  M: { fire: 0, heal: 35, range: 1, vision: 1, armor: 1.0 },
  A: { fire: 40, range: 4, vision: 0, armor: 1.0, indirect: true },
};

export const ENEMY_TYPES = {
  rifle: { name: 'Rifles', icon: 'R', hp: 60, dmg: 16, range: 1, move: 1 },
  armor: { name: 'Armour', icon: 'Ar', hp: 100, dmg: 24, range: 1, move: 2 }, // moves every 2nd turn
  gun: { name: 'Battery', icon: 'B', hp: 80, dmg: 20, range: 3, move: 0 },
  post: { name: 'Outpost', icon: 'O', hp: 60, dmg: 12, range: 1, move: 0 },
};

let uid = 1;

export class Battle {
  constructor(setup, opts = {}) {
    this.fog = !!setup.fog;
    this.dmgMult = opts.dmgMult ?? 1;
    this.smart = !!opts.smart;
    this.noFail = !!opts.noFail;
    this.squads = (setup.squads || []).map((s) => this.makeSquad(s));
    this.enemies = (setup.enemies || []).map((e) => this.makeEnemy(e));
    this.waves = (setup.waves || []).map((w) => ({ ...w, done: false }));
    this.turn = 0;
    this.breakthrough = 0;
    this.sosUsed = false;
    this.destroyed = {};
    this.lost = 0;
    this.updateMarks();
  }

  makeSquad(s) {
    return {
      id: uid++, t: s.t, row: s.row, col: s.col, hp: s.hp ?? 100,
      hold: 0, dig: 0, smoke: 0, digLock: 0, alive: true,
    };
  }

  makeEnemy(e) {
    const T = ENEMY_TYPES[e.k];
    return { id: uid++, k: e.k, row: e.row, col: e.col, hp: e.hp ?? T.hp, maxhp: e.hp ?? T.hp, alive: true, fake: !!e.fake };
  }

  aliveSquads() {
    return this.squads.filter((s) => s.alive);
  }

  aliveEnemies() {
    return this.enemies.filter((e) => e.alive);
  }

  squad(letter) {
    return this.squads.find((s) => s.alive && s.t === letter) || null;
  }

  hasSquad(letter) {
    return this.squads.some((s) => s.t === letter);
  }

  enemyAt(row, col) {
    return this.enemies.find((e) => e.alive && e.row === row && e.col === col) || null;
  }

  visionEdge() {
    if (!this.fog) return COLS;
    let edge = 1;
    for (const s of this.aliveSquads()) edge = Math.max(edge, s.col + SQUAD_STATS[s.t].vision);
    return edge;
  }

  // Static positions stay pinned on the map once spotted.
  isRevealed(e) {
    return !this.fog || e.col <= this.visionEdge() || (e.marked && !ENEMY_TYPES[e.k].move);
  }

  updateMarks() {
    const edge = this.visionEdge();
    for (const e of this.enemies) if (e.alive && e.col <= edge) e.marked = true;
  }

  hiddenEnemies() {
    return this.aliveEnemies().filter((e) => !this.isRevealed(e)).length;
  }

  // Expected damage a squad would take next enemy turn at a given column.
  threatAt(sq, col, row = sq.row) {
    let dmg = 0;
    for (const e of this.aliveEnemies()) {
      const T = ENEMY_TYPES[e.k];
      if (e.row !== row) continue;
      if (Math.abs(e.col - col) <= T.range) dmg += T.dmg * SQUAD_STATS[sq.t].armor * this.dmgMult;
    }
    return dmg;
  }

  fireTarget(sq) {
    const st = SQUAD_STATS[sq.t];
    let best = null;
    let bestScore = Infinity;
    for (const e of this.aliveEnemies()) {
      if (!this.isRevealed(e)) continue;
      const dc = e.col - sq.col;
      if (st.indirect) {
        if (dc < 0 || dc > st.range) continue;
        const score = dc + Math.abs(e.row - sq.row) * 0.5 - (e.k === 'gun' ? 6 : 0);
        if (score < bestScore) { bestScore = score; best = e; }
      } else {
        if (e.row !== sq.row || Math.abs(dc) > st.range) continue;
        const score = Math.abs(dc);
        if (score < bestScore) { bestScore = score; best = e; }
      }
    }
    return best;
  }

  healTarget(sq) {
    let best = null;
    for (const s of this.aliveSquads()) {
      if (Math.abs(s.col - sq.col) > 1) continue;
      if (s.hp >= 100) continue;
      if (!best || s.hp < best.hp) best = s;
    }
    return best;
  }

  // ---- enemy phase (phrase downbeat) ----
  enemyTurn() {
    const ev = [];
    this.turn++;
    for (const w of this.waves) {
      if (!w.done && this.turn >= w.turn) {
        w.done = true;
        for (const e of w.enemies) {
          if (!this.enemyAt(e.row, e.col)) {
            const en = this.makeEnemy(e);
            this.enemies.push(en);
            ev.push({ type: 'spawn', id: en.id });
          }
        }
      }
    }
    const order = this.aliveEnemies().sort((a, b) => a.col - b.col);
    for (const e of order) {
      if (!e.alive) continue;
      const T = ENEMY_TYPES[e.k];
      const targets = this.aliveSquads().filter((s) => s.row === e.row && Math.abs(s.col - e.col) <= T.range && !s.smoke);
      if (targets.length) {
        targets.sort((a, b) => (this.smart ? a.hp - b.hp : Math.abs(a.col - e.col) - Math.abs(b.col - e.col)));
        const s = targets[0];
        let mult = SQUAD_STATS[s.t].armor * this.dmgMult;
        if (s.dig) mult *= s.dig;
        else if (s.hold) mult *= s.hold;
        const dmg = Math.round(T.dmg * mult);
        s.hp -= dmg;
        ev.push({ type: 'hit', from: e.id, to: s.id, dmg, hidden: !this.isRevealed(e) });
        if (s.hp <= 0) {
          if (this.noFail) {
            s.hp = 1;
          } else {
            s.hp = 0;
            s.alive = false;
            this.lost++;
            ev.push({ type: 'out', id: s.id });
          }
        }
        continue;
      }
      // Smoked squads in range: enemy holds fire.
      const smoked = this.aliveSquads().some((s) => s.row === e.row && Math.abs(s.col - e.col) <= T.range && s.smoke);
      if (smoked) {
        ev.push({ type: 'miss', from: e.id });
        continue;
      }
      if (!T.move || (T.move === 2 && this.turn % 2 === 1)) continue;
      const nc = e.col - 1;
      if (nc < 0) {
        e.alive = false;
        this.breakthrough++;
        ev.push({ type: 'breakthrough', id: e.id });
        continue;
      }
      if (this.enemyAt(e.row, nc)) continue;
      if (this.aliveSquads().some((s) => s.row === e.row && s.col === nc)) continue;
      e.col = nc;
      ev.push({ type: 'emove', id: e.id });
    }
    for (const s of this.squads) {
      s.hold = 0;
      s.dig = 0;
      s.smoke = 0;
      if (s.digLock > 0) s.digLock--;
    }
    this.updateMarks();
    return ev;
  }

  // ---- player order ----
  // q: 0 crisp (bonus), 1 clear, 2 static, 3 garbled
  applyOrder(sq, ord, q) {
    const st = SQUAD_STATS[sq.t];
    const name = UNIT_INFO[sq.t].name;
    const boost = q === 0 ? 1.5 : 1;
    const ev = [];
    let ok = true;
    let msg = '';
    switch (ord) {
      case 'G': {
        if (sq.digLock) { ok = false; msg = "We're dug in, can't move!"; break; }
        const steps = sq.t === 'S' && q === 0 ? 2 : 1;
        let moved = 0;
        for (let i = 0; i < steps; i++) {
          const nc = sq.col + 1;
          if (nc >= COLS) { if (!moved) { ok = false; msg = 'End of the map, sir!'; } break; }
          const en = this.enemyAt(sq.row, nc);
          if (en) {
            if (st.ram && !moved) {
              const dmg = Math.round(st.ram * boost);
              this.damageEnemy(en, dmg, ev, sq);
              msg = en.alive ? 'Ramming through!' : 'Rolled right over them!';
              if (!en.alive) { sq.col = nc; moved++; }
            } else if (!moved) {
              ok = false;
              msg = 'Enemy blocking the way!';
            }
            break;
          }
          sq.col = nc;
          moved++;
        }
        if (moved) ev.push({ type: 'move', id: sq.id });
        if (moved && !msg) msg = q === 0 ? 'Advancing at the double!' : 'Advancing!';
        break;
      }
      case 'H':
        sq.hold = q === 0 ? 0.35 : 0.5;
        if (sq.t === 'M') {
          for (const o of this.aliveSquads()) if (o.col === sq.col && o.row === sq.row && o.hp < 100) o.hp = Math.min(100, o.hp + 10);
        }
        msg = 'Holding position.';
        ev.push({ type: 'status', id: sq.id, s: 'hold' });
        break;
      case 'F': {
        if (sq.t === 'M') {
          const tgt = this.healTarget(sq);
          if (!tgt) { ok = false; msg = 'Everyone is patched up!'; break; }
          const amt = Math.round(st.heal * boost);
          tgt.hp = Math.min(100, tgt.hp + amt);
          ev.push({ type: 'heal', from: sq.id, to: tgt.id, amt });
          msg = tgt === sq ? 'Patching ourselves up.' : `Treating ${UNIT_INFO[tgt.t].name}.`;
          break;
        }
        const tgt = this.fireTarget(sq);
        if (!tgt) { ok = false; msg = this.fog && this.hiddenEnemies() ? "Can't see a target!" : 'No target in range!'; break; }
        const dmg = Math.round(st.fire * boost);
        ev.push({ type: 'shot', from: sq.id, to: tgt.id, indirect: !!st.indirect });
        this.damageEnemy(tgt, dmg, ev, sq);
        msg = tgt.alive ? 'Rounds on target!' : 'Target down!';
        break;
      }
      case 'R':
        if (sq.digLock) { ok = false; msg = "We're dug in, can't move!"; break; }
        if (sq.col > 0) { sq.col--; ev.push({ type: 'move', id: sq.id }); }
        sq.hp = Math.min(100, sq.hp + (q === 0 ? 20 : 10));
        sq.hold = 0.5;
        msg = 'Falling back!';
        break;
      case 'D':
        sq.dig = q === 0 ? 0.15 : 0.25;
        sq.digLock = 2;
        msg = 'Digging in!';
        ev.push({ type: 'status', id: sq.id, s: 'dig' });
        break;
      case 'C':
        sq.smoke = 1;
        msg = 'Smoke out!';
        ev.push({ type: 'status', id: sq.id, s: 'smoke' });
        break;
      default:
        ok = false;
        msg = `${name}... say again?`;
    }
    this.updateMarks();
    return { ok, msg, ev };
  }

  damageEnemy(en, dmg, ev, by) {
    en.hp -= dmg;
    ev.push({ type: 'ehit', id: en.id, dmg });
    if (en.hp <= 0) {
      en.hp = 0;
      en.alive = false;
      this.destroyed[en.k] = (this.destroyed[en.k] || 0) + 1;
      ev.push({ type: 'eout', id: en.id });
    }
  }

  reinforce() {
    this.sosUsed = true;
    const ev = [];
    for (const s of this.squads) {
      if (s.alive) s.hp = Math.min(100, s.hp + 40);
    }
    // Bring back the first squad that was knocked out, or send fresh infantry.
    const down = this.squads.find((s) => !s.alive);
    if (down) {
      down.alive = true;
      down.hp = 60;
      down.col = 0;
      this.lost = Math.max(0, this.lost - 1);
      ev.push({ type: 'spawnsq', id: down.id });
    } else if (!this.hasSquad('I')) {
      const rows = [1, 0, 2];
      const row = rows.find((r) => !this.aliveSquads().some((s) => s.row === r && s.col === 0)) ?? 1;
      const s = this.makeSquad({ t: 'I', row, col: 0, hp: 100 });
      this.squads.push(s);
      ev.push({ type: 'spawnsq', id: s.id });
    }
    return ev;
  }

  snapshot() {
    return {
      squads: this.squads.map((s) => ({ ...s })),
      enemies: this.enemies.map((e) => ({ ...e })),
      edge: this.visionEdge(),
      fog: this.fog,
    };
  }

  // ---------------- Ada's advice ----------------
  // Score every (squad, order) pair using only letters the player knows.
  suggest(known, objectives = [], phraseIdx = 0) {
    const has = (l) => known.has(l);
    const reachObj = objectives.filter((o) => o.type === 'reach' || o.type === 'holdzone');
    const destroyObjs = objectives.filter((o) => o.type === 'destroy');
    const wantsKills = destroyObjs.length > 0;
    const isObjTarget = (e) => destroyObjs.some((o) => !o.kind || o.kind === e.k);
    const surviving = objectives.some((o) => o.type === 'survive');
    const hidden = this.fog ? this.aliveEnemies().filter((e) => !this.isRevealed(e)) : [];
    const hiddenObj = hidden.some(isObjTarget);
    const revealedOutOfRange = (sq) => this.aliveEnemies().some((e) => this.isRevealed(e) && e.col - sq.col > SQUAD_STATS[sq.t].range);
    let best = null;
    const consider = (unit, order, score) => {
      if (!best || score > best.score) best = { unit, order, score };
    };
    const squads = this.aliveSquads().filter((s) => has(s.t));
    const perOrder = {};
    const note = (o, s) => { (perOrder[o] = perOrder[o] || []).push(s); };

    for (const sq of squads) {
      const st = SQUAD_STATS[sq.t];
      const threat = this.threatAt(sq, sq.col);
      const reach = reachObj.find((o) => o.unit === sq.t || o.unit === 'ALL');
      const reachDone = reach && sq.col >= reach.col;
      if (has('G')) {
        let s = -100;
        const nc = sq.col + 1;
        if (!sq.digLock && nc < COLS) {
          const blocker = this.enemyAt(sq.row, nc);
          if (!blocker || st.ram) {
            s = 6;
            if (reach && !reachDone) s += 40;
            if (reachDone) s -= 30;
            if (sq.t === 'S' && hidden.length) s += hiddenObj ? 65 : 30;
            if (wantsKills && st.fire && !st.indirect && !this.fireTarget(sq)) s += 18;
            if (st.indirect) {
              const objOut = this.aliveEnemies().some((e) => this.isRevealed(e) && isObjTarget(e) && e.col - sq.col > st.range);
              s += objOut ? 45 : !this.fireTarget(sq) && revealedOutOfRange(sq) ? 22 : -12;
            }
            if (sq.t === 'M') s -= 10;
            if (blocker && st.ram) s += 10 + (isObjTarget(blocker) ? 10 : 0);
            const newThreat = this.threatAt(sq, nc);
            s -= newThreat * (sq.hp < 50 ? 1.6 : 0.9);
            if (surviving && !reach && !wantsKills) s -= 15;
          }
        }
        note('G', s);
        consider(sq.t, 'G', s);
      }
      if (has('F')) {
        let s = -50;
        if (sq.t === 'M') {
          const tgt = this.healTarget(sq);
          const missing = tgt ? 100 - tgt.hp : 0;
          s = missing >= 20 ? missing * 1.1 + 10 : -50;
        } else {
          const tgt = this.fireTarget(sq);
          if (tgt) {
            const T = ENEMY_TYPES[tgt.k];
            const dangerous = this.aliveSquads().some((o) => o.row === tgt.row && Math.abs(o.col - tgt.col) <= T.range);
            s = 38 + (tgt.hp <= st.fire ? 25 : 0) + (isObjTarget(tgt) ? 25 : 0) + (dangerous ? 10 : 0) + threat * 0.3;
          }
        }
        note('F', s);
        consider(sq.t, 'F', s);
      }
      if (has('H')) { const s = threat * 0.55 + (surviving ? 6 : 2); note('H', s); consider(sq.t, 'H', s); }
      if (has('D')) {
        const s = threat > 0 ? threat * 0.8 + (surviving ? 12 : 0) - (reach && !reachDone ? 25 : 0) : -20;
        note('D', s);
        consider(sq.t, 'D', s);
      }
      if (has('C')) {
        const s = threat > 0 ? (sq.hp < 60 ? threat : threat * 0.4) + (reach && !reachDone ? 5 : 0) : -20;
        note('C', s);
        consider(sq.t, 'C', s);
      }
      if (has('R')) {
        const back = sq.col > 0 ? this.threatAt(sq, sq.col - 1) : threat;
        const s = sq.hp < 45 && threat > 0 ? 30 + (threat - back) * 1.2 + (45 - sq.hp) : -30;
        note('R', s - (reach && !reachDone ? 15 : 0));
        consider(sq.t, 'R', s - (reach && !reachDone ? 15 : 0));
      }
    }

    // CQ: one order for every unit.
    if (has('C') && has('Q') && squads.length >= 2) {
      for (const [o, list] of Object.entries(perOrder)) {
        if (list.length !== this.aliveSquads().length) continue;
        const pos = list.filter((x) => x > 0).length;
        if (pos < 2) continue;
        const sum = list.reduce((a, x) => a + Math.max(x, -40), 0);
        consider('CQ', o, sum * 0.8);
      }
    }
    // Reinforcements when things look grim.
    if (known.has('SOS') && !this.sosUsed) {
      const alive = this.aliveSquads();
      const avg = alive.reduce((a, s) => a + s.hp, 0) / Math.max(1, alive.length);
      const anyDown = this.squads.some((s) => !s.alive);
      if (avg < 55 || anyDown) consider('SOS', null, 200);
    }
    if (!best) {
      const sq = squads[0];
      return sq ? { unit: sq.t, order: has('H') ? 'H' : 'G', score: 0 } : null;
    }
    return best;
  }

  // A bad order, used by enemy spoofing.
  badOrder(known) {
    for (const sq of this.aliveSquads()) {
      if (!known.has(sq.t)) continue;
      const nc = sq.col + 1;
      if (known.has('G') && nc < COLS && this.threatAt(sq, nc) > 0) return { unit: sq.t, order: 'G' };
    }
    for (const sq of this.aliveSquads()) {
      if (!known.has(sq.t)) continue;
      if (known.has('R') && sq.col > 0) return { unit: sq.t, order: 'R' };
    }
    const sq = this.aliveSquads().find((s) => known.has(s.t));
    return sq ? { unit: sq.t, order: 'H' } : null;
  }

  // ---------------- objectives ----------------
  evaluate(objs, ctx) {
    let allDone = true;
    let failed = false;
    let reason = '';
    const status = [];
    for (const o of objs) {
      let done = false;
      let text = o.text || '';
      switch (o.type) {
        case 'reach': {
          if (o.unit === 'ALL') {
            const list = this.squads;
            done = list.every((s) => s.alive && s.col >= o.col);
            if (list.some((s) => !s.alive)) { failed = true; reason = 'A squad was knocked out.'; }
          } else {
            const s = this.squads.find((x) => x.t === o.unit);
            done = !!(s && s.alive && s.col >= o.col);
            if (s && !s.alive) { failed = true; reason = `${UNIT_INFO[o.unit].name} were knocked out.`; }
          }
          break;
        }
        case 'holdzone': {
          const s = this.squads.find((x) => x.t === o.unit);
          o._count = o._count || 0;
          done = (o._count >= o.phrases);
          if (s && !s.alive) { failed = true; reason = `${UNIT_INFO[o.unit].name} were knocked out.`; }
          text = `${o.text} (${Math.min(o._count, o.phrases)}/${o.phrases})`;
          break;
        }
        case 'destroy': {
          const pending = this.waves.some((w) => !w.done && (!o.kind || w.enemies.some((e) => e.k === o.kind)));
          const left = this.aliveEnemies().filter((e) => !o.kind || e.k === o.kind).length;
          done = !pending && left === 0;
          text = `${o.text} (${left + (pending ? '+' : '')} left)`;
          break;
        }
        case 'survive': {
          done = ctx.phrasesDone >= o.phrases;
          const units = o.units || [];
          for (const u of units) {
            const s = this.squads.find((x) => x.t === u);
            if (s && !s.alive) { failed = true; reason = `${UNIT_INFO[u].name} were knocked out.`; }
          }
          text = `${o.text} (${Math.min(ctx.phrasesDone, o.phrases)}/${o.phrases})`;
          break;
        }
        case 'nobreak':
          done = true;
          if (this.breakthrough > (o.allow || 0)) { failed = true; reason = 'The enemy broke through the line.'; }
          break;
        case 'relay':
          done = ctx.relayed >= o.count;
          text = `${o.text} (${ctx.relayed}/${o.count})`;
          break;
        default:
          done = true;
      }
      if (!done) allDone = false;
      status.push({ text, done });
    }
    if (!this.aliveSquads().length) { failed = true; reason = 'Every squad is out of action.'; }
    if (this.noFail) failed = false;
    return { done: allDone && !failed, failed, reason, status };
  }

  // Called after each resolve to count holdzone phrases.
  tickHoldzones(objs) {
    for (const o of objs) {
      if (o.type !== 'holdzone') continue;
      const s = this.squad(o.unit);
      o._count = o._count || 0;
      if (s && s.col >= o.col) o._count++;
      else o._count = 0;
    }
  }
}

export function orderName(o) {
  return ORDER_INFO[o]?.name || o;
}
