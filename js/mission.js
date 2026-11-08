// Runs one mission: the 8-bar loop of report → choose → transmit → resolve,
// locked to the music.
import { Session } from './session.js';
import { Battle, ENEMY_TYPES, COLS } from './battle.js';
import { SONGS, Music, keyToneFor, scaleNote, mtof } from './audio.js';
import { J_POINTS, J_NAMES, J_SHAPES, J_CLASS, J_GARBLED } from './keyer.js';
import { layoutTokens, unitsOf, orderTokens, describeOrder, UNIT_INFO, ORDER_INFO, pretty, codeOf, wpmFromUnit } from './morse.js';
import { ADA_LINES } from './missions.js';
import { t } from './i18n.js';
const uname = (u) => t(UNIT_INFO[u]?.name || u);

const clone = (o) => JSON.parse(JSON.stringify(o));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const OPEN_BAR = 2.75;

export class MissionRun extends Session {
  constructor(app, cfg) {
    super(app, { iambic: cfg.iambic });
    this.cfg = cfg;
    const m = (this.m = cfg.mission);
    this.mode = cfg.mode || 'campaign';
    const S = this.settings;
    this.unitDiv = m.unitDiv || 2;
    this.speed = S.speed * (cfg.encore ? 1.15 : 1);
    this.forceHard = !!cfg.encore;
    this.song = SONGS[m.song] || SONGS.boot;
    this.known = m.known;
    this.copilot = S.playMode === 'copilot';
    this.strategist = S.playMode === 'strategist';
    this.guide = this.computeGuidance();
    this.battle = new Battle(clone(m.setup), {
      dmgMult: this.strategist ? 1.25 : 1,
      smart: this.strategist,
      noFail: (S.noFail || this.mode === 'practice') && this.mode !== 'longwatch',
    });
    this.objectives = clone(m.objectives || []);
    this.ph = [];
    this.P = [];
    this.curK = -1;
    this.queue = [];
    this.nextMode = 'order';
    this.endAfter = null;
    this.stats = {
      score: 0, combo: 0, maxCombo: 0, mult: 1, counts: [0, 0, 0, 0], letters: 0, points: 0,
      bonus: 0, relayed: 0, relayAsked: 0, badOrders: 0, orders: 0, phrases: 0,
    };
    this.music = new Music(this.audio);
    this.makeKeyer((t) => {
      const p = this.phrase(this.phraseIndexAt(t));
      return { origin: p.start, unit: p.unit };
    });
    this.lastBeat = -1;
  }

  computeGuidance() {
    const m = this.m, S = this.settings, act = m.act;
    let g = { suggest: 'always', lane: true, ghost: 1, subtitles: 'full', reportVisual: true, codes: true };
    if (act === 2) g.subtitles = m.subtitles || 'full';
    if (act === 3) {
      g = { suggest: 'hesitate', lane: true, ghost: Math.max(0, ((16 - m.n) / 5) * 0.6), subtitles: 'none', reportVisual: false, codes: true };
    }
    if (act >= 4) g = { suggest: 'none', lane: false, ghost: 0, subtitles: 'none', reportVisual: false, codes: false };
    if (m.decode) {
      g.suggest = 'none';
      g.lane = false;
      g.ghost = 0;
      g.subtitles = 'none';
      g.reportVisual = act <= 2;
    }
    if (this.mode === 'longwatch') g = { suggest: 'none', lane: false, ghost: 0, subtitles: 'partial', reportVisual: false, codes: true };
    if (this.cfg.encore) {
      g.ghost = 0;
      g.subtitles = 'none';
      g.reportVisual = false;
      if (g.suggest === 'always') g.suggest = 'hesitate';
    }
    if (this.copilot) {
      g.suggest = 'always';
      g.lane = true;
      g.codes = true;
    }
    if (S.visualOnly) {
      if (!m.decode) g.subtitles = 'full';
      g.reportVisual = true;
    }
    if (S.showCodes === 'always') g.codes = true;
    // Easy mode shows everything: suggestion, code on the tape, ghost tone,
    // subtitles, the lamp flashing the report — even in decode missions.
    if (S.difficulty === 'easy') {
      g = { suggest: 'always', lane: true, ghost: Math.max(g.ghost, 0.8), subtitles: 'full', reportVisual: true, codes: true, easy: true };
    }
    if (S.ghost === 'off') g.ghost = 0;
    return g;
  }

  // ---------------- timeline ----------------
  tempoAt(k) {
    const m = this.m;
    let b = m.tempos ? m.tempos[k % m.tempos.length] : m.bpm;
    if (this.mode === 'longwatch') b = Math.min(176, m.bpm + k * 3);
    return b * this.speed;
  }

  swingAt(k) {
    return this.m.swing ? this.m.swing[k % this.m.swing.length] : 0;
  }

  phrase(k) {
    while (this.ph.length <= k) {
      const i = this.ph.length;
      const bpm = this.tempoAt(i);
      const start = i === 0 ? this.t0 : this.ph[i - 1].start + this.ph[i - 1].bar * 8;
      const beat = 60 / bpm;
      this.ph.push({ k: i, start, bpm, beat, bar: beat * 4, unit: beat / this.unitDiv, swing: this.swingAt(i) });
    }
    return this.ph[k];
  }

  phraseIndexAt(t) {
    let k = Math.max(0, this.curK);
    while (k > 0 && t < this.phrase(k).start) k--;
    while (t >= this.phrase(k + 1).start) k++;
    return k;
  }

  at(k, bar) {
    const p = this.phrase(k);
    return p.start + bar * p.bar;
  }

  schedule(t, fn) {
    this.queue.push({ t, fn });
    this.queue.sort((a, b) => a.t - b.t);
  }

  // ---------------- lifecycle ----------------
  start() {
    const hud = this.app.hud;
    this.audio.setKeyFreq(keyToneFor(this.song));
    this.t0 = this.audio.heardNow() + 0.7 + 4 * (60 / this.tempoAt(0));
    this.phrase(0);
    this.music.start(this.song, { phrase: (k) => this.phrase(k) });
    this.app.map.apply(this.battle.snapshot());
    this.app.map.setFlags(this.objectiveFlags());
    hud.setMission(t(this.m.title) + (this.m.subtitle ? ' ' + this.m.subtitle : '') + (this.mode === 'practice' ? ' · ' + t('PRACTICE') : '') + (this.guide.easy ? ' · ' + t('EASY') : ''), this.mode);
    hud.setScore(0, 1);
    hud.radio('', '', '');
    hud.ada(this.m.decode ? 'Listen for HQ. Decode it, then relay it.' : 'Here we go — one bar count-in…');
    this.updateObjectives(0);
    this.refreshCodecard(null);
    this.planNext(0);
  }

  objectiveFlags() {
    const out = [];
    for (const o of this.objectives) {
      if (o.type === 'reach' || o.type === 'holdzone') {
        const sq = o.unit === 'ALL' ? null : this.battle.squads.find((s) => s.t === o.unit);
        out.push({ col: o.col, row: sq ? sq.row : undefined });
      }
    }
    return out;
  }

  // Prepare phrase k: enemy turn (shown on its downbeat), report, advice.
  planNext(k) {
    if (this.ended || this.endAfter !== null && k > this.endAfter) return;
    const p = this.phrase(k);
    const mode = this.nextMode;
    const P = (this.P[k] = {
      k, mode, tx: { letters: [], finalized: false, closing: false, keying: false },
      deadline: mode === 'peace' ? 7.7 : 7.5, targets: [], showTargets: false, reportEls: [],
    });

    if (k > 0 && mode === 'order') {
      const ev = this.battle.enemyTurn();
      const snap = this.battle.snapshot();
      this.schedule(p.start, () => this.showEnemyTurn(snap, ev));
    }
    if (this.mode === 'longwatch' && k > 0) this.spawnWatch(k);

    let reportTokens = [];
    let text = '';
    if (mode === 'signoff') {
      reportTokens = ['AR'];
      P.sugg = { unit: 'AR' };
      P.tokens = ['AR'];
      text = t('Objective secured. Close the line with AR.');
    } else if (mode === 'peace') {
      reportTokens = ['P', 'E', 'A', 'C', 'E'];
      P.tokens = reportTokens;
      text = t('To all stations, both sides: PEACE.');
    } else {
      const sug = this.battle.suggest(this.known, this.objectives, k);
      P.sugg = sug;
      if (this.m.decode) {
        const hqKnown = new Set([...this.known].filter((l) => l !== 'SOS' && l !== 'Q'));
        let hq = this.battle.suggest(hqKnown, this.objectives, k) || sug;
        P.realHq = hq;
        P.fake = (this.m.spoof || []).includes(k);
        if (P.fake) {
          const bad = this.battle.badOrder(hqKnown);
          if (bad && !(bad.unit === hq.unit && bad.order === hq.order)) hq = bad;
          else P.fake = false;
        }
        P.hq = hq;
        P.sugg = hq;
        if (this.guide.easy && P.fake) P.sugg = P.realHq;
        reportTokens = [hq.unit, hq.order];
      } else if (sug) {
        reportTokens = sug.unit === 'SOS' ? ['SOS'] : sug.unit === 'CQ' ? ['C', 'Q', sug.order] : [sug.unit, sug.order];
      }
      if (sug) P.tokens = sug.unit === 'SOS' ? ['SOS'] : orderTokens(P.sugg.unit, P.sugg.order);
      text = this.situation();
    }
    P.reportTokens = reportTokens;
    P.text = text;
    this.scheduleReport(k, reportTokens, !!P.fake);

    // Lane targets and the ghost track for the suggested order.
    if (P.tokens) {
      const lay = layoutTokens(P.tokens);
      const t0 = this.at(k, 3);
      P.targets = lay.els.map((e) => ({ t0: t0 + e.start * p.unit, t1: t0 + (e.start + e.len) * p.unit }));
      P.targetLetters = lay.letters.map((l) => ({ t0: t0 + l.start * p.unit, t1: t0 + l.end * p.unit, label: l.token }));
      const forced = mode === 'peace' || (mode === 'signoff' && this.guide.lane);
      P.showTargets = forced || (this.guide.lane && this.guide.suggest === 'always');
      if (this.guide.ghost > 0 && mode === 'order') {
        const shift = this.settings.ghost === 'sync' ? 0 : -p.bar;
        const f = this.audio.keyFreq / 2;
        for (const e of P.targets) {
          this.audio.tone(this.audio.toCtx(e.t0 + shift), e.t1 - e.t0, f, 0.12 * this.guide.ghost, 'triangle', 'music', { attack: 0.006, release: 0.01 });
        }
      }
    }
  }

  scheduleReport(k, tokens, sloppy) {
    if (!tokens.length) return;
    const p = this.phrase(k);
    const P = this.P[k];
    const eighth = p.beat / 2;
    const units = unitsOf(tokens);
    const unit = this.unitDiv === 2 && units + 1 <= 16 ? eighth : p.beat / 4;
    const lay = layoutTokens(tokens);
    const start = p.start + unit;
    const degs = [4, 2, 0, 4, 5, 2];
    for (const e of lay.els) {
      let a = start + e.start * unit;
      let b = a + e.len * unit;
      if (sloppy) {
        a += (Math.random() * 0.8 - 0.4) * unit;
        b += (Math.random() * 0.8 - 0.4) * unit;
        if (b - a < unit * 0.5) b = a + unit * 0.5;
      }
      const note = scaleNote(this.song, degs[e.token % degs.length], 1);
      this.audio.tone(this.audio.toCtx(a), b - a, mtof(note), 0.13, 'square', 'music', { lowpass: 2600, attack: 0.004, release: 0.01 });
      P.reportEls.push({ t0: a, t1: b });
    }
  }

  situation() {
    const b = this.battle;
    for (const s of b.aliveSquads()) {
      if (b.threatAt(s, s.col) > 0) {
        const e = b.aliveEnemies().find((x) => x.row === s.row && Math.abs(x.col - s.col) <= ENEMY_TYPES[x.k].range);
        const who = e && b.isRevealed(e) ? ENEMY_TYPES[e.k].name : 'Unseen enemy';
        return t('{enemy} in range of the {unit}!', { enemy: t(who), unit: uname(s.t) });
      }
    }
    const seen = b.aliveEnemies().filter((e) => b.isRevealed(e));
    if (seen.length) {
      const e = seen.sort((x, y) => x.col - y.col)[0];
      return t('{enemy} spotted in zone {n}.', { enemy: t(ENEMY_TYPES[e.k].name), n: e.col + 1 });
    }
    if (b.hiddenEnemies()) return t('Movement in the fog ahead.');
    if (b.waves.some((w) => !w.done)) return t('Quiet… for now.');
    return t('The road ahead is clear.');
  }

  spawnWatch(k) {
    const b = this.battle;
    const want = 2 + Math.floor(k / 4);
    if (b.aliveEnemies().length >= want) return;
    const kinds = k < 4 ? ['rifle'] : k < 10 ? ['rifle', 'rifle', 'armor', 'post'] : ['rifle', 'armor', 'gun', 'armor'];
    const rows = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (const r of rows) {
      if (!b.enemyAt(r, COLS - 1)) {
        b.enemies.push(b.makeEnemy({ k: pick(kinds), row: r, col: COLS - 1 }));
        break;
      }
    }
  }

  showEnemyTurn(snap, ev) {
    const map = this.app.map;
    map.apply(snap, ev);
    let hits = 0;
    for (const e of ev) {
      if (e.type === 'hit') {
        hits++;
        const s = snap.squads.find((x) => x.id === e.to);
        if (s && hits <= 2) map.bubble(s.id, e.hidden ? 'Taking fire from the fog!' : 'Taking fire!', 1800, 'bad');
      }
      if (e.type === 'out') {
        const s = snap.squads.find((x) => x.id === e.id);
        if (s) map.bubble(s.id, t('{unit} out of action!', { unit: uname(s.t) }), 2600, 'bad');
      }
      if (e.type === 'breakthrough') this.app.hud.ada('They broke through the line!');
    }
    const at = this.audio.ctxNow();
    if (hits) this.audio.thud(at + 0.05);
  }

  // ---------------- per-frame ----------------
  update(now) {
    while (this.queue.length && this.queue[0].t <= now) this.queue.shift().fn();
    if (this.ended) return;
    const hud = this.app.hud;
    const p0 = this.phrase(0);
    if (now < p0.start) {
      const beat = Math.floor((now - (p0.start - 4 * p0.beat)) / p0.beat);
      hud.phase(-1, beat >= 0 ? 4 - beat : 4);
      return;
    }
    const k = this.phraseIndexAt(now);
    if (this.endAfter !== null && k > this.endAfter) return;
    const P = this.P[k];
    if (!P) return;
    const p = this.phrase(k);
    const bp = (now - p.start) / p.bar;
    if (k !== this.curK) {
      this.curK = k;
      this.onPhraseStart(k);
    }
    if (bp >= 2 && !P.chose) {
      P.chose = true;
      this.onChoose(k);
    }
    if (this.guide.suggest === 'hesitate' && P.mode === 'order' && !P.hinted && bp >= 4 && !P.tx.keying) {
      P.hinted = true;
      this.showSuggestion(k, true);
    }
    if (bp >= 7 && P.tx.finalized && !P.resolved) this.resolve(k);
    if (bp >= P.deadline && !P.tx.finalized) this.finalize(k, now);
    if (bp >= 7.82 && !P.planned) {
      P.planned = true;
      if (this.endAfter === null || k + 1 <= this.endAfter) this.planNext(k + 1);
    }
    hud.phase(bp, P.mode);

    // Beat pulse for haptics / visual-only mode.
    const beatIdx = Math.floor((now - p.start) / p.beat);
    if (beatIdx !== this.lastBeat) {
      this.lastBeat = beatIdx;
      if (this.settings.haptics && navigator.vibrate && bp >= OPEN_BAR && bp < 7) {
        try { navigator.vibrate(beatIdx % 4 === 0 ? 25 : 12); } catch (e) { /* ignore */ }
      }
      if (this.settings.visualOnly) hud.edgePulse(beatIdx % 4 === 0);
    }
  }

  onPhraseStart(k) {
    const P = this.P[k];
    const hud = this.app.hud;
    this.stats.phrases = k + 1;
    if (P.mode === 'signoff' || P.mode === 'peace') {
      hud.radio('ADA', P.text, pretty(P.reportTokens.map(codeOf).join(' ')));
      hud.ada(P.mode === 'peace' ? 'Slow and clean, Lieutenant. Everyone is listening.' : 'Send AR to close the line.');
      return;
    }
    let from = 'HQ';
    let text = '';
    let code = '';
    const sub = this.guide.subtitles;
    if (this.m.decode && this.guide.easy && P.hq) {
      text = t('HQ order: {order}.', { order: describeOrder(P.hq.unit, P.hq.order) }) + (P.fake ? ' ' + t('It wobbles off the beat — FAKE! Send something else.') : '');
      code = pretty(codeOf(P.hq.unit) + ' ' + codeOf(P.hq.order));
    } else if (this.m.decode) {
      text = 'Incoming order… decode it and relay it.';
    } else if (sub === 'full') {
      text = P.text + (P.sugg ? ' ' + t('Suggest: {order}.', { order: P.sugg.unit === 'SOS' ? 'SOS' : describeOrder(P.sugg.unit, P.sugg.order) }) : '');
      code = P.reportTokens.length ? pretty(P.reportTokens.map(codeOf).join(' ')) : '';
    } else if (sub === 'partial') {
      text = P.text;
    } else {
      text = '· · ·  ' + t('audio only') + '  · · ·';
    }
    if (this.mode === 'longwatch') from = t('WATCH {n}', { n: k + 1 });
    hud.radio(from, text, code);
    if (this.m.decode) hud.ada('Listen…');
    else if (this.guide.suggest !== 'always') hud.ada('');
    this.refreshCodecard(null);
  }

  onChoose(k) {
    const P = this.P[k];
    if (P.mode !== 'order') {
      P.showTargets = P.showTargets || P.mode === 'peace';
      return;
    }
    if (this.guide.suggest === 'always' && P.sugg) this.showSuggestion(k, false);
    else if (this.m.decode) this.app.hud.ada(P.fake !== undefined && this.m.spoof ? 'Real or fake? Relay it… or don\'t.' : 'Relay what HQ sent.');
    else if (this.guide.suggest === 'none') this.app.hud.ada(pick(['Your call, Lieutenant.', 'Your orders, sir?', 'Standing by.']));
  }

  showSuggestion(k, hesitated) {
    const P = this.P[k];
    if (!P.sugg) return;
    const s = P.sugg;
    const tok = P.tokens.join(' ');
    const what = s.unit === 'SOS' ? t('call for reinforcements') : describeOrder(s.unit, s.order);
    const fake = P.fake && this.guide.easy ? t('That HQ order was a fake. Send this instead:') + ' ' : '';
    this.app.hud.ada(`${fake}${hesitated ? t('Try:') + ' ' : ''}${tok} — ${what}.`);
    if (this.guide.lane) P.showTargets = true;
    this.refreshCodecard(s);
  }

  refreshCodecard(highlight) {
    this.app.hud.codecard({
      known: this.known,
      units: [...new Set(this.battle.squads.map((s) => s.t))],
      showCodes: this.guide.codes,
      highlight,
    });
  }

  isOnAir(t) {
    if (t < this.phrase(0).start - this.phrase(0).bar) return false;
    const k = this.phraseIndexAt(t);
    const P = this.P[k];
    if (!P || P.tx.finalized) return false;
    const p = this.phrase(k);
    const bp = (t - p.start) / p.bar;
    return bp >= OPEN_BAR && bp < P.deadline;
  }

  onEdge(j, edge, t, el) {
    super.onEdge(j, edge, t, el);
    if (edge === 'down' && !el.offAir) {
      const P = this.P[this.phraseIndexAt(t)];
      if (P) P.tx.keying = true;
    }
  }

  onLetter(letter) {
    const k = this.phraseIndexAt(letter.start);
    const P = this.P[k];
    const onAir = P && !P.tx.finalized && !letter.els[0].offAir;
    letter.offAir = !onAir;
    const hud = this.app.hud;
    if (!onAir) {
      hud.pop('Off air', 'offair');
      return;
    }
    P.tx.letters.push(letter);
    const st = this.stats;
    const q = letter.q;
    st.counts[q]++;
    st.letters++;
    st.points += J_POINTS[q];
    st.combo = q <= 1 ? st.combo + 1 : 0;
    st.maxCombo = Math.max(st.maxCombo, st.combo);
    st.mult = Math.min(4, 1 + Math.floor(st.combo / 4));
    const pts = J_POINTS[q] * st.mult;
    st.score += pts;
    hud.setScore(st.score, st.mult);
    hud.pop(`${J_SHAPES[q]} ${t(J_NAMES[q])}  ${letter.sym || '?'}${pts ? '  +' + pts : ''}`, J_CLASS[q]);
    if (q <= 1 && letter.sym) this.app.unlockCode(letter.sym);

    const sym = letter.sym;
    if (P.tx.closing) return;
    if (P.mode === 'signoff' && sym === 'AR') this.finalize(k);
    else if (sym === 'SOS' && P.mode === 'order') this.finalize(k);
    else if (P.mode === 'peace' && P.tx.letters.length >= 5) this.finalize(k);
    else if (P.mode === 'order' && sym === 'K' && P.tx.letters.length >= 2) this.finalize(k);
  }

  finalize(k, now) {
    const P = this.P[k];
    if (!P || P.tx.finalized || P.tx.closing) return;
    P.tx.closing = true;
    if (now !== undefined) {
      if (this.keyer.isDown) {
        this.keyer.abort();
        this.audio.keyOff();
        this.keyDown = false;
      }
      this.ikeyer?.reset();
      if (this.keyer.letterEls.length) this.keyer.finishLetter();
    }
    P.tx.finalized = true;
    const at = now ?? this.audio.heardNow();
    const p = this.phrase(k);
    if ((at - p.start) / p.bar >= 7) this.resolve(k);
  }

  parse(letters) {
    const syms = letters.map((l) => l.sym);
    const r = { who: null, order: null, over: false, q: 0, sos: false, ar: false, arQ: 3, undecodable: false, syms };
    const iSos = syms.indexOf('SOS');
    if (iSos >= 0) {
      r.sos = true;
      r.q = letters[iSos].q;
      return r;
    }
    const iAr = syms.indexOf('AR');
    if (iAr >= 0) {
      r.ar = true;
      r.arQ = letters[iAr].q;
    }
    let i;
    if (syms[0] === 'C' && syms[1] === 'Q') {
      r.who = 'CQ';
      i = 2;
    } else {
      r.who = syms[0];
      i = 1;
      if (!syms[0]) r.undecodable = true;
    }
    r.order = syms[i] ?? null;
    if (syms[i] === null && letters.length > i) r.undecodable = true;
    r.over = syms.slice(i + 1).includes('K');
    for (let j = 0; j <= Math.min(i, letters.length - 1); j++) r.q = Math.max(r.q, letters[j].q);
    return r;
  }

  resolve(k) {
    const P = this.P[k];
    if (P.resolved) return;
    P.resolved = true;
    const hud = this.app.hud;
    const map = this.app.map;
    const letters = P.tx.letters;
    const st = this.stats;

    if (P.mode === 'signoff') {
      const r = this.parse(letters);
      if (r.ar) {
        const bonus = [1500, 1000, 400, 100][r.arQ];
        st.bonus += bonus;
        st.score += bonus;
        hud.setScore(st.score, st.mult);
        hud.ada(t('AR received. Line closed. +{n} bonus.', { n: bonus }));
        this.audio.chime(this.audio.ctxNow(), true);
      } else {
        hud.ada(letters.length ? "That wasn't AR, but HQ got the idea." : 'Line closed without AR. No bonus.');
      }
      this.endMission(k, true);
      return;
    }
    if (P.mode === 'peace') {
      const word = letters.map((l) => l.sym || '?').join('');
      const worst = letters.reduce((a, l) => Math.max(a, l.q), 0);
      const okWord = word === 'PEACE';
      const bonus = okWord ? [3000, 2000, 1000, 500][worst] : 300;
      st.bonus += bonus;
      st.score += bonus;
      hud.setScore(st.score, st.mult);
      hud.ada(okWord ? 'Message received… on both sides.' : t('They heard "{w}". Close enough — they understood.', { w: word || '…' }));
      this.audio.bell(this.audio.ctxNow());
      this.peaceSent = true;
      this.endMission(k, true);
      return;
    }

    if (!letters.length) {
      hud.ada(pick(ADA_LINES.silent));
      if (this.m.decode) {
        st.relayAsked++;
        if (P.fake) {
          st.relayed++;
          hud.ada('Silence… and that one was a fake. Good instinct.');
        }
        this.revealHQ(P);
      }
      if (this.mode === 'longwatch') this.badOrder('Silent watch!');
      this.afterResolve(k);
      return;
    }

    st.orders++;
    let r = this.parse(letters);
    // Copilot: the order is chosen for you; only the rhythm counts.
    if (this.copilot && P.sugg && !r.sos) {
      const want = P.sugg;
      const match = want.unit === 'SOS' ? r.sos : r.who === want.unit && r.order === want.order;
      if (want.unit === 'SOS') r = { ...r, sos: true };
      else r = { ...r, who: want.unit, order: want.order, over: true, q: match ? r.q : J_GARBLED, undecodable: false };
    }

    if (r.sos) {
      if (!this.known.has('SOS')) {
        hud.ada("SOS? We haven't been cleared for that yet!");
      } else if (this.battle.sosUsed) {
        hud.ada('We already used our SOS this mission.');
      } else {
        const ev = this.battle.reinforce();
        map.apply(this.battle.snapshot(), ev);
        const s = this.battle.aliveSquads()[0];
        if (s) map.bubble(s.id, 'Reinforcements inbound!', 2600, 'good');
        hud.ada(r.q <= 1 ? 'SOS received loud and clear. Help is here!' : 'They heard the SOS. Help is coming.');
        this.audio.chime(this.audio.ctxNow(), true);
      }
      if (this.m.decode) { st.relayAsked++; this.revealHQ(P); }
      this.afterResolve(k);
      return;
    }

    const quality = r.q;
    const late = quality >= 2 || !r.over;
    // Decode missions: was this the order HQ sent?
    if (this.m.decode && P.hq) {
      st.relayAsked++;
      const match = r.who === P.hq.unit && r.order === P.hq.order;
      if (P.fake) {
        if (match) hud.ada('That was a FAKE order — they spoofed HQ!');
        else { st.relayed++; hud.ada('Good catch — that was a fake!'); }
      } else if (match) {
        st.relayed++;
        hud.ada(`${t('Relayed correctly.')} ${t(pick(['HQ thanks you.', 'Exactly what they sent.', 'Copy that.']))}`);
      } else {
        hud.ada(t('HQ sent {a}. You sent {b}.', { a: `${P.hq.unit} ${P.hq.order}`, b: `${r.who || '?'} ${r.order || '?'}` }));
      }
      this.revealHQ(P);
    }

    // Who answers?
    let squads = [];
    if (r.who === 'CQ') squads = this.battle.aliveSquads();
    else if (r.who) {
      const s = this.battle.squad(r.who);
      if (s) squads = [s];
    }
    const sayAgain = (msg) => {
      hud.radio('RADIO OP', msg, pretty('..--..'));
      this.playCode(['?'], this.audio.ctxNow() + 0.1);
      if (this.mode === 'longwatch') this.badOrder();
      st.badOrders++;
    };
    if (r.undecodable || !r.who) {
      sayAgain('Say again? (undecodable signal)');
      if (!this.m.decode) hud.ada(pick(ADA_LINES.garbled));
      this.afterResolve(k);
      return;
    }
    if (!squads.length) {
      const known = UNIT_INFO[r.who];
      const dead = this.battle.squads.find((s) => s.t === r.who);
      sayAgain(known ? (dead ? t('{unit} are out of action.', { unit: t(known.name) }) : t('No {unit} on this map. Say again?', { unit: t(known.name) })) : t('No unit answers to "{l}". Say again?', { l: r.who }));
      this.afterResolve(k);
      return;
    }
    if (!r.order || !ORDER_INFO[r.order]) {
      for (const s of squads) this.app.map.bubble(s.id, r.order ? t('{unit}, …{l}? Say again?', { unit: uname(s.t), l: r.order }) : t("{unit} here… what's the order?", { unit: uname(s.t) }), 2600, 'bad');
      sayAgain('Say again? (no valid order)');
      this.afterResolve(k);
      return;
    }
    if (r.who === 'CQ' && !(this.known.has('Q'))) {
      // Allowed anyway — the alphabet is the alphabet.
    }

    // Ada's reaction to the signal quality.
    if (!this.m.decode) {
      if (!r.over) hud.ada(pick(ADA_LINES.nok));
      else hud.ada(pick(ADA_LINES[['crisp', 'clear', 'static', 'garbled'][quality]]));
    }
    if (this.mode === 'longwatch' && quality === J_GARBLED) this.badOrder();

    const verb = ORDER_INFO[r.order].verb;
    if (late) {
      for (const s of squads) map.bubble(s.id, t('{unit}… {verb}?', { unit: uname(s.t), verb: t(verb) }), 2400, 'bad');
      const when = this.at(k + 1, 3);
      this.schedule(when, () => {
        if (this.ended) return;
        this.applyOrder(r, squads.filter((s) => s.alive), 1, true);
        this.evaluateNow(k + 1, false, k + 1);
      });
    } else {
      this.applyOrder(r, squads, quality, false);
    }
    this.afterResolve(k);
  }

  revealHQ(P) {
    if (!P.hq) return;
    const fake = P.fake ? ' — ' + t('FAKE (sloppy rhythm)') : '';
    this.app.hud.radio('HQ', t('HQ sent: {code} ({order})', { code: `${P.hq.unit} ${P.hq.order}`, order: describeOrder(P.hq.unit, P.hq.order) }) + fake, pretty(codeOf(P.hq.unit) + ' ' + codeOf(P.hq.order)));
  }

  applyOrder(r, squads, q, wasLate) {
    const map = this.app.map;
    const all = [];
    let n = 0;
    for (const s of squads) {
      const res = this.battle.applyOrder(s, r.order, q);
      all.push(...res.ev);
      const name = uname(s.t);
      if (n++ < 3) map.bubble(s.id, `${name}${wasLate ? ' (' + t('late') + ')' : ''}: ${res.msg}`, 2400, res.ok ? 'good' : 'bad');
    }
    map.apply(this.battle.snapshot(), all);
    const at = this.audio.ctxNow();
    if (all.some((e) => e.type === 'shot')) this.audio.thud(at + 0.02);
    if (all.some((e) => e.type === 'eout')) this.audio.pop(at + 0.25);
    if (all.some((e) => e.type === 'heal')) this.audio.chime(at, true);
    if (all.some((e) => e.type === 'status' && e.s === 'smoke')) this.audio.pop(at);
  }

  badOrder(msg) {
    this.watchStrikes = (this.watchStrikes || 0) + 1;
    this.app.hud.ada(`${t(msg || 'Garbled order.')} ${t('Strike {n} of 3.', { n: this.watchStrikes })}`);
  }

  afterResolve(k) {
    this.battle.tickHoldzones(this.objectives);
    this.evaluateNow(k, true);
  }

  updateObjectives(phrasesDone) {
    if (this.mode === 'longwatch') {
      this.app.hud.objectives([{ text: t('Watch {n} · strikes {s}/3', { n: this.stats.phrases, s: this.watchStrikes || 0 }), done: false }]);
      return null;
    }
    const ev = this.battle.evaluate(this.objectives, { phrasesDone, relayed: this.stats.relayed });
    this.app.hud.objectives(ev.status);
    return ev;
  }

  evaluateNow(k, atResolve, phrasesDone = k + 1) {
    if (this.endAfter !== null) return;
    if (this.mode === 'longwatch') {
      this.updateObjectives(phrasesDone);
      if ((this.watchStrikes || 0) >= 3 || !this.battle.aliveSquads().length) this.endMission(k, true, 'The watch is over.');
      return;
    }
    const ev = this.updateObjectives(phrasesDone);
    if (ev.failed) {
      this.endMission(k, false, ev.reason);
    } else if (ev.done) {
      this.objectivesMet = true;
      if (this.m.finale) {
        this.nextMode = 'peace';
        this.app.hud.ada('The guns are quiet. One more transmission, Lieutenant…');
      } else if (this.m.signoff) {
        this.nextMode = 'signoff';
        this.app.hud.ada(t(pick(ADA_LINES.win)) + ' ' + t('Now close the line: AR.'));
      } else {
        this.app.hud.ada(pick(ADA_LINES.win));
        this.endMission(k, true);
      }
    } else if (atResolve && k + 1 >= this.m.maxPhrases) {
      this.endMission(k, false, 'Out of time — the song is over.');
    }
  }

  endMission(k, success, reason = '') {
    if (this.endAfter !== null) return;
    this.endAfter = k;
    this.success = success;
    this.reason = reason;
    const end = this.phrase(k + 1).start;
    this.music.finishAt(end);
    if (!success) this.app.hud.ada(reason || pick(ADA_LINES.lose));
    this.schedule(end + 1.4, () => this.finish());
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.music.stop();
    this.releaseAll();
    const st = this.stats;
    const acc = st.letters ? st.points / (st.letters * 300) : 0;
    let cmd;
    const alive = this.battle.aliveSquads().length;
    const total = this.battle.squads.length || 1;
    if (this.m.decode) cmd = st.relayAsked ? st.relayed / Math.max(st.relayAsked, this.objectives[0]?.count || 1) : 0;
    else if (this.mode === 'longwatch') cmd = Math.min(1, st.phrases / 20);
    else if (this.success) cmd = 0.6 + 0.4 * (alive / total);
    else {
      const ev = this.battle.evaluate(this.objectives, { phrasesDone: st.phrases, relayed: st.relayed });
      const f = ev.status.filter((s) => s.done).length / Math.max(1, ev.status.length);
      cmd = 0.3 * f;
    }
    let success = this.success;
    if (this.m.decode && this.success === false && this.reason.startsWith('Out of time')) success = false;
    const totalScore = 0.5 * acc + 0.5 * cmd;
    let rank = totalScore >= 0.9 ? 'S' : totalScore >= 0.78 ? 'A' : totalScore >= 0.6 ? 'B' : 'C';
    if (!success) rank = '—';
    if (success && this.settings.noFail && this.battle.lost) rank = 'C';
    const unit = this.phrase(0).unit;
    this.result = {
      mission: this.m, mode: this.mode, success, reason: this.reason, rank,
      score: st.score, accuracy: acc, command: cmd, counts: st.counts, maxCombo: st.maxCombo,
      wpm: wpmFromUnit(unit), letters: st.letters, bonus: st.bonus, relayed: st.relayed,
      phrases: st.phrases, alive, total, peace: !!this.peaceSent, iambic: this.iambic, encore: !!this.cfg.encore,
    };
    this.app.onSessionEnd(this.result);
  }

  stop() {
    super.stop();
    this.music.stop();
  }

  pause() {
    super.pause();
  }

  // Play a short Morse snippet from the radio operator (context time).
  playCode(tokens, t) {
    const p = this.phrase(Math.max(0, this.curK));
    const u = Math.min(0.09, p.unit / 2);
    const lay = layoutTokens(tokens);
    for (const e of lay.els) this.audio.tone(t + e.start * u, e.len * u, 520, 0.1, 'square', 'sfx', { lowpass: 1800 });
  }

  // ---------------- rendering ----------------
  gridLines(tMin, tMax) {
    const out = [];
    const k0 = Math.max(0, this.phraseIndexAt(tMin));
    for (let k = k0; k <= k0 + 2; k++) {
      const p = this.phrase(k);
      if (p.start > tMax) break;
      const per = 4 * this.unitDiv;
      for (let u = 0; u < 8 * per; u++) {
        const t = p.start + u * p.unit;
        if (t < tMin || t > tMax) continue;
        const kind = u % per === 0 ? 'bar' : u % this.unitDiv === 0 ? 'beat' : 'unit';
        out.push({ t, kind, label: kind === 'bar' ? String(u / per + 1) : '' });
      }
    }
    return out;
  }

  render(now) {
    const app = this.app;
    const p0 = this.phrase(0);
    const k = now < p0.start ? 0 : this.phraseIndexAt(now);
    const p = this.phrase(k);
    const span = p.unit * 40;
    const windows = [];
    const targets = [];
    const tl = [];
    const report = [];
    let lamp = false;
    for (const j of [k - 1, k, k + 1]) {
      const P = this.P[j];
      if (!P) continue;
      const pj = this.phrase(j);
      if (!P.tx.finalized || j === k) windows.push([pj.start + OPEN_BAR * pj.bar, pj.start + P.deadline * pj.bar]);
      if (P.showTargets) {
        targets.push(...P.targets);
        tl.push(...(P.targetLetters || []));
      }
      if (this.guide.reportVisual || P.mode !== 'order') {
        report.push(...P.reportEls);
        for (const r of P.reportEls) if (now >= r.t0 && now < r.t1) lamp = true;
      }
    }
    const letters = this.keyer.letters.map((l) => ({ start: l.start, end: l.end, label: l.sym || '?', q: l.q, offAir: l.offAir }));
    app.tape.draw({
      now, unit: p.unit, grid: this.gridLines(now - span, now + span), windows, targets, targetLetters: tl,
      keyed: this.keyedForTape(), letters, report, keyDown: this.keyDown, guide: this.gapGuide(now),
    });
    const beatPhase = now < p0.start ? 0 : ((now - p.start) / p.beat) % 1;
    app.map.draw(beatPhase, lamp);
  }
}
