// App shell: screens, save data, settings, input, HUD and the frame loop.
import { AudioEngine } from './audio.js';
import { TapeView } from './tape.js';
import { MapView } from './mapview.js';
import { MissionRun } from './mission.js';
import { DrillRun, FreeKeyRun, CalibRun, tokenName } from './drill.js';
import { MISSIONS, ACTS, PADDLE_LESSONS, CODEBOOK, ENDING, ADA_LINES } from './missions.js';
import { MORSE, PROSIGNS, pretty, codeOf, layoutTokens, UNIT_INFO, ORDER_INFO, SPECIAL_INFO } from './morse.js';
import { J_SHAPES, J_NAMES } from './keyer.js';

// ---------------------------------------------------------------- helpers
const $ = (s) => document.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pct = (x) => Math.round(x * 100) + '%';

// ---------------------------------------------------------------- save
const SAVE_KEY = 'ditdah-command.save.v1';
const DEFAULT_SETTINGS = {
  difficulty: 'normal', playMode: 'standard', speed: 1, inputOffset: 0, visualOffset: 0,
  visualOnly: false, haptics: true, gapGuide: true, ghost: 'ahead', showCodes: 'auto', noFail: false,
  music: 0.8, tone: 0.8, sfx: 0.8, input: 'straight',
};
function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
  s = s || {};
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.progress = s.progress || {};
  s.encore = s.encore || {};
  s.codes = s.codes || [];
  s.paddle = s.paddle || {};
  s.medals = s.medals || {};
  s.longwatch = s.longwatch || { best: 0, phrases: 0 };
  s.daily = s.daily || {};
  return s;
}

// ---------------------------------------------------------------- app
const app = {
  save: loadSave(),
  audio: new AudioEngine(),
  session: null,
  pending: null,
};
app.settings = app.save.settings;
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(app.save)); } catch (e) { /* private mode */ }
}
app.unlockCode = (sym) => {
  if (!app.save.codes.includes(sym)) {
    app.save.codes.push(sym);
    persist();
  }
};
function applyAudioSettings() {
  const S = app.settings;
  app.audio.vol = { music: S.music, tone: S.tone, sfx: S.sfx };
  app.audio.visualOnly = S.visualOnly;
  app.audio.applyVolumes();
}
const iambicUnlocked = () => !!app.save.medals.paddle;
const useIambic = () => iambicUnlocked() && app.settings.input === 'iambic';
const cleared = (id) => !!app.save.progress[id]?.cleared;
const missionUnlocked = (m) => m.n === 1 || cleared('m' + (m.n - 1));

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  window.scrollTo(0, 0);
}
function menu(...kids) {
  const root = $('#scr-menu');
  root.replaceChildren(h('div', { class: 'menu-inner' }, ...kids));
  show('scr-menu');
  root.scrollTop = 0;
}
function backBtn(fn = titleScreen, label = '← Back') {
  return h('button', { class: 'btn ghost back', onclick: fn }, label);
}

function titleScreen() {
  stopSession();
  show('scr-title');
  const nav = $('#title-nav');
  const done = MISSIONS.filter((m) => cleared(m.id)).length;
  const next = MISSIONS.find((m) => !cleared(m.id) && missionUnlocked(m));
  nav.replaceChildren(
    h('button', { class: 'btn primary big', onclick: () => (next ? briefing(next) : campaignScreen()) }, done ? (next ? `Continue — ${next.n}. ${next.title}` : 'Campaign') : 'Start Campaign'),
    h('button', { class: 'btn', onclick: campaignScreen }, `Campaign  ·  ${done}/${MISSIONS.length}`),
    h('div', { class: 'row2' },
      h('button', { class: 'btn', onclick: practiceScreen }, 'Practice'),
      h('button', { class: 'btn', onclick: freeKeyScreen }, 'Free Key')),
    h('button', { class: 'btn', onclick: paddleScreen }, cleared('m10') ? 'Paddle School' : 'Paddle School 🔒'),
    h('div', { class: 'row2' },
      h('button', { class: 'btn', onclick: dailyScreen }, 'Daily Dispatch'),
      h('button', { class: 'btn', onclick: longWatchScreen }, 'Long Watch')),
    h('div', { class: 'row2' },
      h('button', { class: 'btn', onclick: codebookScreen }, 'Codebook'),
      h('button', { class: 'btn', onclick: () => calibrateScreen(titleScreen) }, 'Calibrate')),
    h('button', { class: 'btn', onclick: () => settingsScreen(titleScreen) }, 'Settings'),
    easyToggle(),
  );
  $('#title-cal').classList.toggle('hidden', !!app.save.calibrated);
}

// ---------------------------------------------------------------- campaign
function campaignScreen() {
  stopSession();
  const finaleDone = cleared('m23');
  const kids = [h('h1', {}, 'Campaign')];
  if (finaleDone) {
    kids.push(h('label', { class: 'toggle encore' },
      h('input', { type: 'checkbox', checked: !!app.encoreMode, onchange: (e) => { app.encoreMode = e.target.checked; campaignScreen(); } }),
      h('span', {}, 'Encore charts — Hard remix: faster, no ghost tone, audio-only reports')));
  }
  for (const act of ACTS) {
    const ms = MISSIONS.filter((m) => m.act === act.n);
    kids.push(h('section', { class: 'act' },
      h('h2', {}, act.n <= 4 ? `Act ${act.n}: ${act.name}` : act.name),
      h('p', { class: 'muted' }, act.blurb),
      h('div', { class: 'mission-grid' }, ms.map((m) => missionCard(m)))));
  }
  kids.push(backBtn());
  menu(...kids);
}

function missionCard(m) {
  const unlocked = missionUnlocked(m);
  const pr = (app.encoreMode ? app.save.encore : app.save.progress)[m.id];
  const letters = m.newLetters.map((l) => h('span', { class: 'chip small' }, l));
  return h('button', {
    class: 'mission-card' + (unlocked ? '' : ' locked') + (m.decode ? ' decode' : ''),
    disabled: !unlocked,
    onclick: () => briefing(m),
  },
  h('div', { class: 'mc-n' }, m.n),
  h('div', { class: 'mc-body' },
    h('div', { class: 'mc-title' }, m.title),
    h('div', { class: 'mc-meta' }, m.decode ? h('span', { class: 'chip small dark' }, 'DECODE') : null, letters)),
  h('div', { class: 'mc-rank rank-' + (pr?.rank || 'none') }, unlocked ? (pr?.rank && pr.rank !== '—' ? pr.rank : pr?.cleared ? '✓' : '') : '🔒'));
}

function playCodeDemo(tokens, unitSec = 0.1) {
  app.audio.init();
  const t = app.audio.ctxNow() + 0.08;
  const lay = layoutTokens(tokens);
  for (const e of lay.els) app.audio.tone(t + e.start * unitSec, e.len * unitSec, 650, 0.25, 'sine', 'key');
}

function briefing(m) {
  stopSession();
  const hasDrill = !!(m.drill && m.drill.length);
  const pr = app.save.progress[m.id];
  const actName = ACTS.find((a) => a.n === m.act)?.name;
  const objectives = m.objectives.filter((o) => o.text).map((o) => h('li', {}, o.text));
  const letters = m.newLetters.map((l) => h('button', { class: 'letter-card', onclick: () => playCodeDemo(l === 'Q' ? ['Q'] : [l]) },
    h('div', { class: 'lc-l' }, l),
    h('div', { class: 'lc-code' }, pretty(codeOf(l))),
    h('div', { class: 'lc-name' }, UNIT_INFO[l]?.name || ORDER_INFO[l]?.name || SPECIAL_INFO[l]?.name || (l === 'Q' ? 'CQ = all units' : '')),
    h('div', { class: 'lc-play' }, '▶ hear it')));
  const wpm = (1.2 / (60 / (m.bpm * app.settings.speed) / m.unitDiv)).toFixed(1);
  const startMission = () => runMission(m, { encore: !!app.encoreMode });
  menu(
    h('div', { class: 'brief-head' },
      h('div', { class: 'muted' }, m.act <= 4 ? `Act ${m.act} · ${actName} · Mission ${m.n}` : `Finale · Mission ${m.n}`),
      h('h1', {}, m.title),
      h('div', { class: 'muted small' }, `${m.bpm} BPM · ${m.unitDiv === 4 ? '16th' : '8th'}-note units · ≈${wpm} WPM${m.decode ? ' · Decode mission' : ''}${app.encoreMode ? ' · ENCORE' : ''}`)),
    h('div', { class: 'dialogue' },
      h('div', { class: 'ada-face big' }, 'AV'),
      h('div', {}, m.briefing.map((l) => h('p', {}, l)))),
    letters.length ? h('div', { class: 'letters' }, letters) : null,
    h('div', { class: 'obj-box' }, h('b', {}, 'Objective'), h('ul', {}, objectives)),
    h('div', { class: 'brief-actions' },
      hasDrill && !pr?.cleared ? h('button', { class: 'btn primary big', onclick: () => runDrill(m, startMission) }, 'Drill (30 s), then mission') : null,
      h('button', { class: 'btn' + (hasDrill && !pr?.cleared ? '' : ' primary big'), onclick: startMission }, hasDrill && !pr?.cleared ? 'Skip drill — start mission' : 'Start mission'),
      hasDrill && pr?.cleared ? h('button', { class: 'btn', onclick: () => runDrill(m, () => briefing(m)) }, 'Practise drill') : null,
      h('button', { class: 'btn', onclick: () => runMission(m, { mode: 'practice' }) }, 'Practice (no fail, not saved)'),
      backBtn(campaignScreen, '← Campaign')),
    easyToggle(() => briefing(m)),
    h('p', { class: 'muted small tip' }, useIambic()
      ? 'Iambic paddles: left (Z / ← / left button) = dit, right (X / → / right button) = dah.'
      : 'Key: Space or any key, mouse button, or tap/hold the big KEY button. Esc pauses.'),
  );
}

// ---------------------------------------------------------------- session control
function setLayout(layout) {
  const g = $('#scr-game');
  g.dataset.layout = layout;
  g.classList.toggle('iambic', !!(app.session?.iambic));
}

async function startSession(sess, layout) {
  stopSession();
  app.audio.init();
  try { await app.audio.resume(); } catch (e) { /* ignore */ }
  applyAudioSettings();
  app.session = sess;
  show('scr-game');
  setLayout(layout);
  hideOverlay();
  app.tape.resize();
  app.map.resize();
  app.map.snap = null;
  app.map.disp.clear();
  app.map.fx = [];
  app.map.bubbles = [];
  app.map.flags = [];
  app.hud.pop('', '');
  app.audio.sync(true);
  sess.start();
}

function stopSession() {
  if (app.session) {
    app.session.stop();
    app.session = null;
    app.audio.silence();
  }
  if (app.audio.ctx && app.audio.ctx.state === 'suspended') app.audio.resume();
  hideOverlay();
}

function runMission(m, opts = {}) {
  const sess = new MissionRun(app, { mission: m, mode: opts.mode || 'campaign', iambic: opts.iambic ?? useIambic(), encore: opts.encore });
  sess.ctx = opts;
  startSession(sess, 'mission');
}

function runDrill(m, then) {
  const sess = new DrillRun(app, {
    title: `Drill — ${m.newLetters.join(', ')}`,
    items: m.drill, bpm: Math.min(m.bpm, 120), unitDiv: m.unitDiv, iambic: useIambic(), timeLimit: 32,
  });
  sess.then = then;
  startSession(sess, 'drill');
}

app.onSessionEnd = (r) => {
  const sess = app.session;
  app.session = null;
  if (r.mode === 'drill') return drillDone(sess, r);
  if (r.mode === 'longwatch') return longWatchDone(r);
  if (r.mode === 'daily') return dailyDone(r);
  if (r.mode === 'paddle') return paddleExamDone(r);
  missionDone(r, sess?.ctx || {});
};

function drillDone(sess, r) {
  const cfg = sess.cfg;
  if (cfg.paddle) {
    const passed = r.correct / Math.max(1, r.total) >= 0.6;
    if (passed) { app.save.paddle[cfg.paddle] = true; persist(); }
    return resultsDrill(r, passed, () => paddleScreen());
  }
  if (cfg.practice) return resultsDrill(r, true, practiceScreen, { title: 'Practice complete', back: '← Practice', again: () => startPracticeDrill() });
  overlay(
    h('h2', {}, 'Drill complete'),
    h('p', { class: 'big-num' }, `${r.correct} / ${r.total}`),
    h('p', { class: 'muted' }, r.correct === r.total ? 'Perfect. Ada nods.' : 'Good enough to go. You will get better under fire.'),
    h('div', { class: 'brief-actions' },
      h('button', { class: 'btn primary big', onclick: () => { hideOverlay(); sess.then?.(); } }, 'Continue'),
      h('button', { class: 'btn', onclick: () => { hideOverlay(); startSession(new DrillRun(app, cfg), 'drill'); app.session.then = sess.then; } }, 'Drill again')),
  );
}

function resultsDrill(r, passed, back, opts = {}) {
  menu(
    h('h1', {}, opts.title || (passed ? 'Lesson passed' : 'Not yet')),
    h('p', { class: 'big-num' }, `${r.correct} / ${r.total}`),
    h('ul', { class: 'drill-list' }, r.results.map((x) => h('li', { class: x.ok ? 'ok' : 'bad' }, `${x.ok ? '✓' : '✗'} ${x.want}`, x.ok ? h('span', { class: 'muted' }, ` ${J_NAMES[x.q]}`) : h('span', { class: 'muted' }, ` heard "${x.got || '…'}"`)))),
    opts.title ? h('p', { class: 'muted' }, `Signal accuracy ${pct(r.accuracy)} · ${r.wpm.toFixed(1)} WPM`) : h('p', { class: 'muted' }, 'Pass mark: 60% correct letters.'),
    h('div', { class: 'brief-actions' },
      opts.again ? h('button', { class: 'btn primary', onclick: opts.again }, 'Again') : null,
      backBtn(back, opts.back || '← Paddle School')),
  );
}

function missionDone(r, ctx) {
  const m = r.mission;
  if (r.success && r.mode !== 'practice') {
    const book = r.encore ? app.save.encore : app.save.progress;
    const prev = book[m.id] || {};
    const order = ['S', 'A', 'B', 'C', '—'];
    const better = !prev.rank || order.indexOf(r.rank) < order.indexOf(prev.rank);
    book[m.id] = { cleared: true, rank: better ? r.rank : prev.rank, score: Math.max(prev.score || 0, r.score) };
    for (const l of m.newLetters) app.unlockCode(l);
    if (m.newLetters.includes('Q')) app.unlockCode('CQ');
    for (const c of CODEBOOK) if (c.mission && m.n >= c.mission) app.unlockCode(c.key);
    persist();
  }
  if (m.finale && r.success && r.mode !== 'practice') return endingScreen(() => resultsScreen(r));
  resultsScreen(r);
}

function resultsScreen(r) {
  const m = r.mission;
  const next = MISSIONS.find((x) => x.n === m.n + 1);
  const lines = r.success ? ADA_LINES.win : ADA_LINES.lose;
  menu(
    h('div', { class: 'results' },
      h('div', { class: 'muted' }, `Mission ${m.n} · ${m.title}${r.mode === 'practice' ? ' · Practice (not saved)' : ''}${r.encore ? ' · Encore' : ''}${r.iambic ? ' · Paddles' : ''}`),
      h('h1', {}, r.success ? 'Mission complete' : 'Mission failed'),
      r.success ? null : h('p', { class: 'bad' }, r.reason),
      h('div', { class: 'rank-big rank-' + r.rank }, r.rank),
      h('div', { class: 'stat-grid' },
        stat('Score', r.score.toLocaleString()),
        stat('Signal', pct(r.accuracy)),
        stat('Command', pct(r.command)),
        stat('Best combo', r.maxCombo),
        stat('Keying speed', `${r.wpm.toFixed(1)} WPM`),
        stat(m.decode ? 'Relayed' : 'Units saved', m.decode ? r.relayed : `${r.alive}/${r.total}`)),
      h('div', { class: 'counts' }, r.counts.map((c, i) => h('span', { class: 'cnt j' + i }, `${J_SHAPES[i]} ${J_NAMES[i]} ${c}`))),
      r.bonus ? h('p', {}, `Bonus: +${r.bonus}`) : null,
      h('div', { class: 'dialogue small' }, h('div', { class: 'ada-face' }, 'AV'), h('p', {}, pick(lines))),
      h('div', { class: 'brief-actions' },
        r.success && r.mode !== 'practice' && next && missionUnlocked(next) ? h('button', { class: 'btn primary big', onclick: () => briefing(next) }, `Next: ${next.title}`) : null,
        h('button', { class: 'btn' + (r.success ? '' : ' primary big'), onclick: () => runMission(m, { encore: r.encore, mode: r.mode === 'practice' ? 'practice' : undefined }) }, 'Retry'),
        r.mode === 'practice' ? backBtn(practiceScreen, '← Practice') : backBtn(campaignScreen, '← Campaign'))),
  );
}
function stat(label, value) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));
}

function endingScreen(then) {
  let i = 0;
  const box = h('div', { class: 'ending' });
  const nextLine = () => {
    if (i >= ENDING.length) return then();
    box.append(h('p', { class: 'fade-in' }, ENDING[i++]));
  };
  menu(h('h1', {}, 'Peace Signal'), box, h('div', { class: 'brief-actions' }, h('button', { class: 'btn primary big', onclick: nextLine }, 'Continue')));
  nextLine();
  app.save.finale = true;
  persist();
}

// ---------------------------------------------------------------- easy mode
function easyToggle(onChange) {
  const on = app.settings.difficulty === 'easy';
  return h('label', { class: 'toggle easy-toggle' + (on ? ' on' : '') },
    h('input', { type: 'checkbox', checked: on, onchange: (e) => {
      app.settings.difficulty = e.target.checked ? 'easy' : 'normal';
      persist();
      (onChange || titleScreen)();
    } }),
    h('span', {}, h('b', {}, 'Easy mode'), ' — shows every hint: the code on the tape, a guide tone, subtitles and HQ orders. Wider timing.'));
}

// ---------------------------------------------------------------- practice
const GAME_LETTERS = ['T', 'I', 'S', 'M', 'A', 'G', 'H', 'F', 'R', 'D', 'C', 'K', 'Q'];
const PROSIGN_LIST = ['SOS', 'AR'];
const OTHER_LETTERS = Object.keys(MORSE).filter((k) => /[A-Z0-9]/.test(k) && !GAME_LETTERS.includes(k));

function practiceCfg() {
  const p = app.save.practice || {};
  app.save.practice = {
    letters: p.letters || ['T', 'I', 'G', 'H', 'K'],
    kind: p.kind || 'letters', bpm: p.bpm || 100, div: p.div || 2, count: p.count ?? 12,
  };
  return app.save.practice;
}

function practiceItems(cfg) {
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const L = cfg.letters.length ? cfg.letters : ['E', 'T'];
  const n = cfg.count || 300;
  const items = [];
  let last = null;
  for (let i = 0; i < n; i++) {
    let item;
    if (cfg.kind === 'orders') {
      const us = L.filter((l) => UNIT_INFO[l]);
      const os = L.filter((l) => ORDER_INFO[l]);
      item = [rnd(us.length ? us : Object.keys(UNIT_INFO)), rnd(os.length ? os : Object.keys(ORDER_INFO)), 'K'];
    } else if (cfg.kind === 'groups') {
      const len = 2 + Math.floor(Math.random() * 2);
      item = Array.from({ length: len }, () => rnd(L));
    } else {
      item = [rnd(L)];
      if (L.length > 1 && item[0] === last) item = [rnd(L.filter((x) => x !== last))];
      last = item[0];
    }
    items.push(item);
  }
  return items;
}

function startPracticeDrill() {
  const cfg = practiceCfg();
  persist();
  const what = cfg.kind === 'orders' ? 'orders' : cfg.kind === 'groups' ? 'letter groups' : 'letters';
  const sess = new DrillRun(app, {
    title: `Practice — ${what}${cfg.count ? '' : ' (endless)'}`,
    items: practiceItems(cfg), bpm: cfg.bpm, unitDiv: cfg.div, iambic: useIambic(), practice: true,
  });
  startSession(sess, 'drill');
}

function practiceScreen() {
  stopSession();
  const cfg = practiceCfg();
  const save = () => persist();
  const chip = (l) => {
    const on = cfg.letters.includes(l);
    return h('button', {
      class: 'pick' + (on ? ' on' : ''),
      onclick: (e) => {
        const i = cfg.letters.indexOf(l);
        if (i >= 0) cfg.letters.splice(i, 1); else cfg.letters.push(l);
        e.currentTarget.classList.toggle('on', i < 0);
        save();
      },
    }, h('b', {}, l), h('span', {}, pretty(codeOf(l))));
  };
  const setAll = (list, on) => {
    for (const l of list) {
      const i = cfg.letters.indexOf(l);
      if (on && i < 0) cfg.letters.push(l);
      if (!on && i >= 0) cfg.letters.splice(i, 1);
    }
    save();
    practiceScreen();
  };
  const seg = (key, opts) => h('div', { class: 'segbtns' }, opts.map(([v, label]) => h('button', {
    class: 'btn small' + (cfg[key] === v ? ' primary' : ''),
    onclick: () => { cfg[key] = v; save(); practiceScreen(); },
  }, label)));
  const wpm = () => (1.2 / (60 / (cfg.bpm * app.settings.speed) / cfg.div)).toFixed(1);
  const wpmOut = h('span', { class: 'range-v' }, `${cfg.bpm} BPM · ≈${wpm()} WPM`);
  const unlocked = MISSIONS.filter((m) => missionUnlocked(m));
  menu(
    h('h1', {}, 'Practice'),
    h('p', { class: 'muted' }, 'Drill any letters at your own speed: listen to each one, then key it back on the beat. Nothing here is scored or saved.'),
    easyToggle(practiceScreen),
    h('h2', {}, 'Letters to drill'),
    h('div', { class: 'pick-head' }, h('b', {}, 'Game letters'),
      h('button', { class: 'btn small ghost', onclick: () => setAll(GAME_LETTERS, true) }, 'All'),
      h('button', { class: 'btn small ghost', onclick: () => setAll([...GAME_LETTERS, ...PROSIGN_LIST, ...OTHER_LETTERS], false) }, 'None')),
    h('div', { class: 'picks' }, GAME_LETTERS.map(chip), PROSIGN_LIST.map(chip)),
    h('div', { class: 'pick-head' }, h('b', {}, 'Rest of the alphabet'),
      h('button', { class: 'btn small ghost', onclick: () => setAll(OTHER_LETTERS, true) }, 'All')),
    h('div', { class: 'picks' }, OTHER_LETTERS.map(chip)),
    h('h2', {}, 'Drill type'),
    seg('kind', [['letters', 'Single letters'], ['groups', 'Groups of 2–3'], ['orders', 'Full orders (who + what + K)']]),
    h('h2', {}, 'Speed'),
    h('div', { class: 'range' }, h('input', { type: 'range', min: 60, max: 160, step: 5, value: cfg.bpm, oninput: (e) => { cfg.bpm = +e.target.value; wpmOut.textContent = `${cfg.bpm} BPM · ≈${wpm()} WPM`; save(); } }), wpmOut),
    seg('div', [[2, 'Dit = 8th note (slower)'], [4, 'Dit = 16th note (faster)']]),
    h('h2', {}, 'Length'),
    seg('count', [[8, '8'], [12, '12'], [20, '20'], [0, 'Endless']]),
    h('div', { class: 'brief-actions' }, h('button', { class: 'btn primary big', onclick: startPracticeDrill }, 'Start drill')),
    h('h2', {}, 'Practise a mission'),
    h('p', { class: 'muted small' }, 'Play any unlocked mission with no fail. Results are not saved.'),
    h('div', { class: 'mission-grid' }, unlocked.map((m) => h('button', { class: 'mission-card', onclick: () => runMission(m, { mode: 'practice' }) },
      h('div', { class: 'mc-n' }, m.n), h('div', { class: 'mc-body' }, h('div', { class: 'mc-title' }, m.title))))),
    backBtn(),
  );
}

// ---------------------------------------------------------------- paddle school
function paddleScreen() {
  stopSession();
  const open = cleared('m10');
  const kids = [h('h1', {}, 'Paddle School'),
    h('p', { class: 'muted' }, "Ada's old instructor teaches iambic keying on a captured paddle key. Left paddle = dit, right paddle = dah. Keyboard: Z / ← and X / →. On touch screens, two buttons appear.")];
  if (!open) kids.push(h('p', { class: 'bad' }, 'Unlocks after Act 2 (Mission 10).'));
  PADDLE_LESSONS.forEach((L, i) => {
    const prevOk = i === 0 || app.save.paddle[PADDLE_LESSONS[i - 1].id];
    const ok = open && prevOk;
    const done = app.save.paddle[L.id];
    kids.push(h('button', { class: 'mission-card' + (ok ? '' : ' locked'), disabled: !ok, onclick: () => startPaddle(L) },
      h('div', { class: 'mc-n' }, L.n),
      h('div', { class: 'mc-body' }, h('div', { class: 'mc-title' }, L.title), h('div', { class: 'mc-meta small' }, L.text)),
      h('div', { class: 'mc-rank' }, done ? '✓' : ok ? '' : '🔒')));
  });
  if (app.save.medals.paddle) kids.push(h('p', { class: 'good' }, '🏅 Paddle medal earned — iambic input is unlocked in Settings for every mission.'));
  kids.push(backBtn());
  menu(...kids);
}

function startPaddle(L) {
  if (L.mission) {
    const m = MISSIONS.find((x) => x.n === L.mission);
    return runMission(m, { mode: 'paddle', iambic: true });
  }
  const sess = new DrillRun(app, { title: `Paddle School ${L.n}: ${L.title}`, items: L.items, bpm: L.bpm, unitDiv: L.unitDiv, iambic: true, paddle: L.id });
  startSession(sess, 'drill');
}

function paddleExamDone(r) {
  if (r.success) {
    app.save.paddle.p5 = true;
    app.save.medals.paddle = true;
    app.settings.input = 'iambic';
    persist();
  }
  menu(
    h('h1', {}, r.success ? '🏅 Paddle medal' : 'Exam failed'),
    h('p', {}, r.success ? 'Iambic input is now unlocked for every mission (switch it in Settings).' : r.reason),
    h('div', { class: 'stat-grid' }, stat('Score', r.score.toLocaleString()), stat('Signal', pct(r.accuracy)), stat('Rank', r.rank)),
    h('div', { class: 'brief-actions' },
      h('button', { class: 'btn primary', onclick: () => startPaddle(PADDLE_LESSONS[4]) }, 'Retry'),
      backBtn(paddleScreen, '← Paddle School')),
  );
}

// ---------------------------------------------------------------- long watch & daily
const ALL_KNOWN = new Set(['T', 'I', 'S', 'M', 'A', 'G', 'H', 'F', 'R', 'D', 'C', 'K', 'Q', 'SOS', 'AR']);

function longWatchScreen() {
  stopSession();
  const lw = app.save.longwatch;
  menu(
    h('h1', {}, 'Long Watch'),
    h('p', {}, 'An endless night shift. Reports keep coming, the tempo rises every phrase, and three garbled (or silent) orders end the run.'),
    h('p', { class: 'muted' }, `Best: ${lw.phrases || 0} phrases · ${lw.best || 0} points`),
    h('div', { class: 'brief-actions' },
      h('button', { class: 'btn primary big', onclick: startLongWatch }, 'Start the watch'),
      backBtn()),
  );
}

function startLongWatch() {
  const m = {
    n: 0, act: 4, id: 'watch', title: 'Long Watch', song: 'watch', bpm: 96, unitDiv: 2, known: ALL_KNOWN, newLetters: [],
    setup: { fog: true, squads: [{ t: 'T', row: 0, col: 1 }, { t: 'I', row: 1, col: 1 }, { t: 'M', row: 2, col: 0 }, { t: 'A', row: 2, col: 1 }], enemies: [{ k: 'rifle', row: 1, col: 5 }] },
    objectives: [], maxPhrases: 9999, briefing: [],
  };
  runMission(m, { mode: 'longwatch' });
}

function longWatchDone(r) {
  const lw = app.save.longwatch;
  const newBest = r.phrases > (lw.phrases || 0);
  lw.phrases = Math.max(lw.phrases || 0, r.phrases);
  lw.best = Math.max(lw.best || 0, r.score);
  persist();
  menu(
    h('h1', {}, 'Watch relieved'),
    h('p', { class: 'big-num' }, `${r.phrases} phrases`),
    newBest ? h('p', { class: 'good' }, 'New personal best!') : null,
    h('div', { class: 'stat-grid' }, stat('Score', r.score.toLocaleString()), stat('Signal', pct(r.accuracy)), stat('Best combo', r.maxCombo)),
    h('div', { class: 'brief-actions' }, h('button', { class: 'btn primary', onclick: startLongWatch }, 'Again'), backBtn()),
  );
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function seeded(str) {
  let s = 0;
  for (const c of str) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function dailyMission() {
  const key = todayKey();
  const r = seeded(key);
  const types = ['T', 'I', 'S', 'M', 'A'].sort(() => r() - 0.5).slice(0, 3);
  const squads = types.map((t, i) => ({ t, row: i, col: Math.floor(r() * 2) }));
  const kinds = ['rifle', 'armor', 'gun', 'post'];
  const enemies = [0, 1, 2].filter(() => r() < 0.8).map((row) => ({ k: kinds[Math.floor(r() * 4)], row, col: 4 + Math.floor(r() * 2) }));
  if (!enemies.length) enemies.push({ k: 'rifle', row: 1, col: 5 });
  const bpm = 100 + Math.floor(r() * 5) * 8;
  return {
    n: 0, act: 3, id: 'daily-' + key, title: `Daily Dispatch ${key}`, song: ['front', 'night', 'silence'][Math.floor(r() * 3)], bpm, unitDiv: 2,
    decode: true, spoof: r() < 0.5 ? [2] : [], known: ALL_KNOWN, newLetters: [],
    setup: { fog: true, squads, enemies }, objectives: [{ type: 'relay', count: 4, text: "Relay today's orders" }], maxPhrases: 5, briefing: [],
  };
}

function dailyScreen() {
  stopSession();
  const key = todayKey();
  const best = app.save.daily[key];
  menu(
    h('h1', {}, 'Daily Dispatch'),
    h('p', {}, `A new set of HQ orders every day (${key}). Decode each one by ear and relay it. One might be a fake.`),
    h('p', { class: 'muted' }, best ? `Today's best: ${best.score.toLocaleString()} (${best.relayed}/4 relayed)` : 'Not attempted today.'),
    h('p', { class: 'muted small' }, 'Scores are kept on this device only.'),
    h('div', { class: 'brief-actions' }, h('button', { class: 'btn primary big', onclick: () => runMission(dailyMission(), { mode: 'daily' }) }, 'Open the dispatch'), backBtn()),
  );
}

function dailyDone(r) {
  const key = todayKey();
  const prev = app.save.daily[key];
  if (!prev || r.score > prev.score) app.save.daily[key] = { score: r.score, relayed: r.relayed };
  persist();
  menu(
    h('h1', {}, 'Dispatch closed'),
    h('div', { class: 'stat-grid' }, stat('Score', r.score.toLocaleString()), stat('Relayed', `${r.relayed}/4`), stat('Signal', pct(r.accuracy))),
    h('div', { class: 'brief-actions' }, h('button', { class: 'btn', onclick: () => runMission(dailyMission(), { mode: 'daily' }) }, 'Retry'), backBtn()),
  );
}

// ---------------------------------------------------------------- free key
function freeKeyScreen() {
  const sess = new FreeKeyRun(app, { wpm: app.save.freeWpm || 8, metronome: false, iambic: useIambic() });
  startSession(sess, 'free');
  const panel = $('#free-panel');
  const target = h('input', { type: 'text', class: 'free-target', placeholder: 'Practise a word… e.g. SOS', maxlength: 24, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const targetCode = h('div', { class: 'code free-code' });
  const wpmLabel = h('span', {}, `${sess.wpm} WPM`);
  const updateTarget = () => {
    const w = target.value.toUpperCase().replace(/[^A-Z0-9?.,/ ]/g, '');
    targetCode.textContent = w.split('').map((c) => (c === ' ' ? ' / ' : pretty(MORSE[c] || ''))).join('  ');
    app.freeTarget = w.trim();
  };
  target.addEventListener('input', updateTarget);
  target.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') target.blur(); e.stopPropagation(); });
  target.addEventListener('keyup', (e) => e.stopPropagation());
  panel.replaceChildren(
    h('div', { class: 'free-out', id: 'free-out' }, h('span', { class: 'muted' }, 'Key anything — it decodes live.')),
    h('div', { class: 'free-row' }, target, h('button', { class: 'btn small', onclick: () => sess.clear() }, 'Clear')),
    targetCode,
    h('div', { class: 'free-row' },
      h('label', {}, 'Speed ', h('input', { type: 'range', min: 5, max: 20, step: 1, value: sess.wpm, oninput: (e) => { sess.setWpm(+e.target.value); wpmLabel.textContent = `${sess.wpm} WPM`; app.save.freeWpm = sess.wpm; persist(); } }), wpmLabel),
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', onchange: (e) => sess.setMetronome(e.target.checked) }), h('span', {}, 'Metronome + judging'))),
    h('details', { class: 'chart' }, h('summary', {}, 'Alphabet chart'), alphabetChart()),
  );
  $('#hud-mission').textContent = 'Free Key';
}

function alphabetChart() {
  const items = [...Object.keys(MORSE).filter((k) => /[A-Z0-9]/.test(k)), ...Object.keys(PROSIGNS)];
  return h('div', { class: 'alpha' }, items.map((k) => h('button', { class: 'alpha-cell' + (app.save.codes.includes(k) ? ' known' : ''), onclick: () => playCodeDemo([k]) },
    h('b', {}, k), h('span', {}, pretty(codeOf(k))))));
}

// ---------------------------------------------------------------- codebook
function codebookScreen() {
  stopSession();
  const have = new Set(app.save.codes);
  const got = CODEBOOK.filter((c) => have.has(c.key)).length;
  menu(
    h('h1', {}, 'Codebook'),
    h('p', { class: 'muted' }, `${got} / ${CODEBOOK.length} entries · Facts unlock as you key letters cleanly and clear missions.`),
    h('div', { class: 'codebook' }, CODEBOOK.map((c) => have.has(c.key)
      ? h('div', { class: 'cb-card' }, h('h3', {}, c.title), h('p', {}, c.text))
      : h('div', { class: 'cb-card locked' }, h('h3', {}, '???'), h('p', { class: 'muted' }, c.mission ? `Clear mission ${c.mission}` : 'Key this cleanly to unlock')))),
    h('h2', {}, 'Alphabet'),
    h('p', { class: 'muted small' }, 'Tap any letter to hear it. Highlighted letters are ones you have keyed cleanly.'),
    alphabetChart(),
    backBtn(),
  );
}

// ---------------------------------------------------------------- settings
function settingsScreen(back) {
  stopSession();
  const S = app.settings;
  const set = (k, v) => { S[k] = v; persist(); applyAudioSettings(); };
  const select = (k, opts) => h('select', { onchange: (e) => set(k, e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: S[k] === v }, l)));
  const range = (k, min, max, step, fmt) => {
    const out = h('span', { class: 'range-v' }, fmt(S[k]));
    return h('span', { class: 'range' }, h('input', { type: 'range', min, max, step, value: S[k], oninput: (e) => { set(k, +e.target.value); out.textContent = fmt(+e.target.value); } }), out);
  };
  const check = (k) => h('input', { type: 'checkbox', checked: !!S[k], onchange: (e) => set(k, e.target.checked) });
  const row = (label, ctrl, help) => h('div', { class: 'set-row' }, h('label', {}, h('span', { class: 'set-l' }, label), help ? h('span', { class: 'muted small' }, help) : null), ctrl);
  menu(
    h('h1', {}, 'Settings'),
    h('h2', {}, 'Play'),
    row('Judgement windows', select('difficulty', [['easy', 'Easy — wider timing, shows all hints'], ['normal', 'Normal'], ['hard', 'Hard (−20%)']])),
    row('Mode', select('playMode', [['standard', 'Standard'], ['copilot', 'Copilot — order chosen for you'], ['strategist', 'Strategist — wide windows, harder enemy']])),
    row('Song speed', range('speed', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`)),
    row('Gap guide', check('gapGuide'), 'Marks on the tape showing when a dit/dah ends and when the next letter may start'),
    row('Ghost track', select('ghost', [['ahead', 'One bar ahead'], ['sync', 'In sync'], ['off', 'Off']]), 'Faint guide tone for the suggested order'),
    row('Show codes on the order card', select('showCodes', [['auto', 'Until Act 4'], ['always', 'Always']])),
    row('No fail', check('noFail'), 'Units cannot be knocked out (rank capped at C)'),
    iambicUnlocked() ? row('Input', select('input', [['straight', 'Straight key (one button)'], ['iambic', 'Iambic paddles (two buttons)']])) : row('Input', h('span', { class: 'muted' }, 'Straight key · iambic unlocks in Paddle School')),
    h('h2', {}, 'Timing'),
    row('Input offset', range('inputOffset', -200, 200, 1, (v) => `${v} ms`), 'Positive if you tend to press late'),
    row('Visual offset', range('visualOffset', -150, 150, 1, (v) => `${v} ms`), 'Shift the tape if it looks early/late'),
    h('button', { class: 'btn', onclick: () => calibrateScreen(() => settingsScreen(back)) }, 'Run calibration'),
    h('h2', {}, 'Sound & accessibility'),
    row('Music volume', range('music', 0, 1, 0.05, (v) => pct(v))),
    row('Key tone volume', range('tone', 0, 1, 0.05, (v) => pct(v))),
    row('Effects volume', range('sfx', 0, 1, 0.05, (v) => pct(v))),
    row('Visual-only mode', check('visualOnly'), 'Light flash and screen-edge pulse replace the key tone; full subtitles'),
    row('Haptic beat', check('haptics'), 'Vibrates on the beat while transmitting (Android)'),
    h('h2', {}, 'Data'),
    h('button', { class: 'btn danger', onclick: () => {
      if (confirm('Erase all progress and settings on this device?')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        app.save = loadSave();
        app.settings = app.save.settings;
        titleScreen();
      }
    } }, 'Reset progress'),
    backBtn(back),
  );
}

// ---------------------------------------------------------------- calibration
function calibrateScreen(back) {
  stopSession();
  const status = h('p', { class: 'cal-status' }, 'Tap the big button (or Space) on every click. 20 clicks, the first 4 are warm-up.');
  const dot = h('div', { class: 'cal-dot' });
  const result = h('div', {});
  const btn = h('button', { class: 'key cal-key', 'data-key': 'key' }, h('span', {}, 'TAP'));
  const start = async () => {
    result.replaceChildren();
    app.audio.init();
    try { await app.audio.resume(); } catch (e) { /* ignore */ }
    applyAudioSettings();
    app.audio.sync(true);
    const sess = new CalibRun(app, {
      onBeat: (ph) => { dot.style.opacity = String(Math.max(0.15, 1 - ph * 2.5)); },
      onProgress: (b, n, taps) => { status.textContent = `Click ${b} / ${n} · ${taps} taps counted`; },
      onDone: (med, spread, n) => {
        app.session = null;
        if (med === null || n < 6) {
          result.replaceChildren(h('p', { class: 'bad' }, 'Not enough taps. Try again.'), h('button', { class: 'btn primary', onclick: start }, 'Try again'));
          return;
        }
        const newOff = Math.round(Math.max(-200, Math.min(200, med)));
        result.replaceChildren(
          h('p', {}, `You tap ${Math.abs(Math.round(med))} ms ${med >= 0 ? 'after' : 'before'} the click (spread ±${Math.round((spread || 0) / 2)} ms).`),
          h('p', { class: 'muted' }, `Suggested input offset: ${newOff} ms (current ${app.settings.inputOffset} ms).`),
          h('div', { class: 'brief-actions' },
            h('button', { class: 'btn primary', onclick: () => { app.settings.inputOffset = newOff; app.save.calibrated = true; persist(); back(); } }, 'Use it'),
            h('button', { class: 'btn', onclick: start }, 'Again'),
            h('button', { class: 'btn ghost', onclick: () => { app.save.calibrated = true; persist(); back(); } }, 'Keep current')),
        );
      },
    });
    app.session = sess;
    sess.start();
  };
  menu(
    h('h1', {}, 'Calibration'),
    h('p', { class: 'muted' }, 'Headphones and Bluetooth speakers add delay. This test measures how late (or early) your taps land so the game can judge you fairly.'),
    h('div', { class: 'cal-box' }, dot, status),
    btn,
    result,
    h('div', { class: 'brief-actions' }, h('button', { class: 'btn primary', onclick: start }, 'Start test'), backBtn(() => { stopSession(); back(); })),
  );
}

// ---------------------------------------------------------------- overlay / pause
function overlay(...kids) {
  const o = $('#overlay');
  o.replaceChildren(h('div', { class: 'overlay-box' }, ...kids));
  o.classList.remove('hidden');
}
function hideOverlay() {
  $('#overlay').classList.add('hidden');
}

function pauseGame() {
  const s = app.session;
  if (!s || s.ended || s instanceof CalibRun) return;
  if (s instanceof FreeKeyRun) {
    stopSession();
    return titleScreen();
  }
  if (s.paused) return;
  s.pause();
  const quit = () => {
    const m = s.m;
    stopSession();
    if (s instanceof MissionRun && s.mode === 'campaign') briefing(m);
    else if (s instanceof MissionRun && s.mode === 'practice') practiceScreen();
    else if (s instanceof DrillRun && s.cfg.practice) practiceScreen();
    else if (s instanceof DrillRun && s.cfg.paddle) paddleScreen();
    else if (s instanceof MissionRun && s.mode === 'paddle') paddleScreen();
    else titleScreen();
  };
  const restart = () => {
    stopSession();
    if (s instanceof MissionRun) runMission(s.m, { ...(s.ctx || {}), mode: s.mode, iambic: s.iambic, encore: s.cfg.encore });
    else if (s instanceof DrillRun) { const n = new DrillRun(app, s.cfg); n.then = s.then; startSession(n, 'drill'); }
  };
  overlay(
    h('h2', {}, 'Paused'),
    h('div', { class: 'pause-actions' },
      h('button', { class: 'btn primary big', onclick: async () => { hideOverlay(); await s.resume(); } }, 'Resume'),
      h('button', { class: 'btn', onclick: restart }, 'Restart'),
      s instanceof DrillRun && s.then ? h('button', { class: 'btn', onclick: () => { stopSession(); s.then(); } }, 'Skip drill') : null,
      s instanceof DrillRun && s.cfg.practice ? h('button', { class: 'btn', onclick: async () => {
        hideOverlay();
        app.audio.silence();
        await app.audio.resume();
        s.paused = false;
        s.finish();
      } }, 'End practice — see results') : null,
      h('button', { class: 'btn', onclick: quit }, 'Quit')),
    h('p', { class: 'muted small' }, 'Timing feels off? Adjust offsets in Settings from the title screen.'),
  );
}

// ---------------------------------------------------------------- HUD
const hud = {
  setMission(title) {
    $('#hud-mission').textContent = title;
  },
  phase(bp, mode) {
    const cur = $('#phase-cursor');
    const label = $('#phase-count');
    if (bp < 0) {
      label.textContent = mode > 0 ? `COUNT-IN ${mode}` : '';
      label.classList.remove('hidden');
      cur.style.transform = 'translateX(0)';
      setSeg(null);
      return;
    }
    label.classList.add('hidden');
    const w = $('#hud-phase').clientWidth;
    cur.style.transform = `translateX(${(bp / 8) * w}px)`;
    setSeg(mode !== 'order' ? 'tx' : bp < 2 ? 'report' : bp < 3 ? 'choose' : bp < 7 ? 'tx' : 'res');
  },
  setScore(score, mult) {
    $('#hud-score').textContent = score.toLocaleString();
    $('#hud-mult').textContent = `×${mult}`;
    $('#hud-mult').classList.toggle('hot', mult > 1);
  },
  radio(from, text, code) {
    $('#radio-from').textContent = from || 'RADIO';
    $('#radio-text').textContent = text || '';
    $('#radio-code').textContent = code || '';
  },
  ada(text) {
    const el = $('#ada-text');
    if (el.textContent === text) return;
    el.textContent = text || '';
    el.parentElement.classList.remove('flash');
    void el.offsetWidth;
    if (text) el.parentElement.classList.add('flash');
  },
  objectives(list) {
    $('#hud-objs').replaceChildren(...list.map((o) => h('li', { class: o.done ? 'done' : '' }, (o.done ? '✓ ' : '○ ') + o.text)));
  },
  codecard({ known, units, showCodes, highlight }) {
    const chip = (l, name, on) => h('div', { class: 'cc' + (on ? ' on' : '') }, h('b', {}, l), showCodes ? h('span', { class: 'cc-code' }, pretty(codeOf(l))) : null, h('small', {}, name));
    const hu = highlight?.unit, ho = highlight?.order;
    const us = units.filter((u) => known.has(u)).map((u) => chip(u, UNIT_INFO[u].name, hu === u));
    const os = Object.keys(ORDER_INFO).filter((o) => known.has(o)).map((o) => chip(o, ORDER_INFO[o].name, ho === o));
    const sp = [chip('K', 'over', !!highlight && hu !== 'SOS')];
    if (known.has('Q')) sp.push(h('div', { class: 'cc' + (hu === 'CQ' ? ' on' : '') }, h('b', {}, 'CQ'), showCodes ? h('span', { class: 'cc-code' }, pretty('-.-. --.-')) : null, h('small', {}, 'all units')));
    if (known.has('SOS')) sp.push(h('div', { class: 'cc' + (hu === 'SOS' ? ' on' : '') }, h('b', {}, 'SOS'), showCodes ? h('span', { class: 'cc-code' }, pretty('...---...')) : null, h('small', {}, 'reinforce')));
    if (known.has('AR')) sp.push(h('div', { class: 'cc' }, h('b', {}, 'AR'), showCodes ? h('span', { class: 'cc-code' }, pretty('.-.-.')) : null, h('small', {}, 'sign off')));
    $('#codecard').replaceChildren(
      h('div', { class: 'cc-group' }, h('div', { class: 'cc-h' }, 'WHO'), ...us),
      h('div', { class: 'cc-group' }, h('div', { class: 'cc-h' }, 'WHAT'), ...os),
      h('div', { class: 'cc-group' }, h('div', { class: 'cc-h' }, 'SIGNALS'), ...sp));
  },
  pop(text, cls) {
    const p = $('#pop');
    p.className = 'pop';
    if (!text) { p.textContent = ''; return; }
    p.textContent = text;
    void p.offsetWidth;
    p.className = 'pop show ' + (cls || '');
  },
  edgePulse(strong) {
    const e = $('#edge');
    e.classList.remove('pulse', 'strong');
    void e.offsetWidth;
    e.classList.add('pulse');
    if (strong) e.classList.add('strong');
  },
  drill({ title, phase, tokens, progress }) {
    const key = `${title}|${phase}|${tokens.join(',')}|${progress}`;
    if (this._drillKey === key) return;
    this._drillKey = key;
    $('#hud-mission').textContent = title;
    const P = $('#drill-panel');
    P.querySelector('.dp-phase').textContent = phase;
    P.querySelector('.dp-phase').classList.toggle('turn', phase === 'YOUR TURN');
    P.querySelector('.dp-letters').textContent = tokens.join(' ');
    P.querySelector('.dp-code').textContent = tokens.map((t) => pretty(codeOf(t))).join('   ');
    P.querySelector('.dp-name').textContent = tokenName(tokens);
    P.querySelector('.dp-progress').textContent = progress;
  },
  drillLamp(on, ph) {
    const l = $('#drill-panel .dp-lamp');
    l.classList.toggle('on', on);
    l.style.opacity = on ? '1' : String(0.35 + 0.4 * Math.pow(1 - ph, 3));
  },
  freeText(text) {
    const out = $('#free-out');
    if (!out) return;
    const t = text.slice(-120);
    const target = app.freeTarget;
    const hit = target && text.replace(/\s+/g, ' ').trim().endsWith(target.replace(/\s+/g, ' '));
    out.replaceChildren(...[h('span', {}, t || ''), h('span', { class: 'caret' }, '▌'), hit ? h('span', { class: 'good hit' }, ' ✓ ' + target) : null].filter(Boolean));
  },
};
function setSeg(which) {
  for (const s of document.querySelectorAll('#hud-phase .seg')) s.classList.toggle('active', s.dataset.seg === which);
}
app.hud = hud;

// ---------------------------------------------------------------- input
const LEFT = new Set(['KeyZ', 'ArrowLeft', 'KeyF', 'Comma', 'BracketLeft', 'KeyA']);
const RIGHT = new Set(['KeyX', 'ArrowRight', 'KeyJ', 'Period', 'BracketRight', 'Slash', 'KeyD']);
const keysHeld = new Set();
const sideHeld = { key: 0, dit: 0, dah: 0 };

function sendInput(side, down, t) {
  const s = app.session;
  if (!s) return;
  if (side !== 'key' && !s.iambic) side = 'key';
  if (down) {
    sideHeld[side]++;
    if (sideHeld[side] === 1) s.input(side, true, t);
  } else if (sideHeld[side] > 0) {
    sideHeld[side]--;
    if (sideHeld[side] === 0) s.input(side, false, t);
  }
  const g = $('#scr-game');
  g.classList.toggle('k-key', sideHeld.key > 0);
  g.classList.toggle('k-dit', sideHeld.dit > 0);
  g.classList.toggle('k-dah', sideHeld.dah > 0);
}
function resetInput() {
  keysHeld.clear();
  sideHeld.key = sideHeld.dit = sideHeld.dah = 0;
  pointers.clear();
  const g = $('#scr-game');
  g.classList.remove('k-key', 'k-dit', 'k-dah');
}

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.code === 'Escape') {
    if (app.session && !app.session.paused) { e.preventDefault(); pauseGame(); }
    return;
  }
  if (!app.session || app.session.paused || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Tab') return;
  e.preventDefault();
  if (e.repeat || keysHeld.has(e.code)) return;
  keysHeld.add(e.code);
  const side = app.session.iambic ? (LEFT.has(e.code) ? 'dit' : RIGHT.has(e.code) ? 'dah' : null) : 'key';
  if (side) sendInput(side, true, e.timeStamp);
});
window.addEventListener('keyup', (e) => {
  if (!keysHeld.has(e.code)) return;
  keysHeld.delete(e.code);
  if (!app.session) return;
  const side = app.session.iambic ? (LEFT.has(e.code) ? 'dit' : RIGHT.has(e.code) ? 'dah' : null) : 'key';
  if (side) sendInput(side, false, e.timeStamp);
});

const pointers = new Map();
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest && e.target.closest('[data-key]');
  if (!el || !app.session || app.session.paused) return;
  e.preventDefault();
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const side = el.dataset.key;
  pointers.set(e.pointerId, side);
  sendInput(side, true, e.timeStamp);
}, { passive: false });
const pointerUp = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const side = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  sendInput(side, false, e.timeStamp);
};
document.addEventListener('pointerup', pointerUp);
document.addEventListener('pointercancel', pointerUp);
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest && e.target.closest('[data-key], #scr-game')) e.preventDefault();
});
// Stop iOS from turning held key presses into zoom or text selection.
document.addEventListener('touchstart', (e) => {
  if (e.target.closest && e.target.closest('[data-key]')) e.preventDefault();
}, { passive: false });

// Gamepads.
const padPrev = new Map();
const PAD_LEFT = [2, 4, 6, 14];
const PAD_RIGHT = [1, 5, 7, 15];
function pollPads() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  for (const p of pads) {
    if (!p) continue;
    const prev = padPrev.get(p.index) || [];
    const now = p.buttons.map((b) => b.pressed);
    const t = performance.now();
    now.forEach((pressed, i) => {
      if (pressed === !!prev[i]) return;
      if (i === 9) { if (pressed && app.session) pauseGame(); return; }
      if (!app.session) return;
      let side = 'key';
      if (app.session.iambic) side = PAD_LEFT.includes(i) ? 'dit' : PAD_RIGHT.includes(i) ? 'dah' : null;
      if (side) sendInput(side, pressed, t);
    });
    padPrev.set(p.index, now);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.session) {
    resetInput();
    if (app.session instanceof MissionRun || app.session instanceof DrillRun) pauseGame();
    else app.session.releaseAll();
  }
});
window.addEventListener('blur', () => {
  if (app.session) {
    resetInput();
    app.session.releaseAll?.();
  }
});

// ---------------------------------------------------------------- frame loop
function loop() {
  requestAnimationFrame(loop);
  pollPads();
  const s = app.session;
  if (s) {
    s.frame();
    $('#edge').classList.toggle('keyon', !!(app.settings.visualOnly && s.keyDown));
  }
}

function onResize() {
  if ($('#scr-game').classList.contains('active')) {
    app.tape.resize();
    app.map.resize();
  }
}

// ---------------------------------------------------------------- boot
function boot() {
  app.tape = new TapeView($('#tape'));
  app.map = new MapView($('#map'));
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  if (window.ResizeObserver) new ResizeObserver(onResize).observe($('#scr-game'));
  $('#btn-pause').addEventListener('click', pauseGame);
  $('#title-cal-btn').addEventListener('click', () => calibrateScreen(titleScreen));
  $('#title-cal-skip').addEventListener('click', () => { app.save.calibrated = true; persist(); $('#title-cal').classList.add('hidden'); });
  // Unlock audio on the first interaction anywhere.
  const unlock = () => { app.audio.init(); applyAudioSettings(); };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
  titleScreen();
  requestAnimationFrame(loop);
}
boot();

// Exposed for debugging in the console.
window.ditdah = app;
