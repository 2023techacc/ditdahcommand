// Morse alphabet, prosigns and pattern layout helpers.
import { t } from './i18n.js';

export const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '?': '..--..', '.': '.-.-.-', ',': '--..--', '/': '-..-.',
};

// Prosigns are sent as one run of elements with no letter gaps.
export const PROSIGNS = {
  AR: '.-.-.',
  SOS: '...---...',
  SK: '...-.-',
  BT: '-...-',
};

const REVERSE = {};
for (const [k, v] of Object.entries(MORSE)) REVERSE[v] = k;
for (const [k, v] of Object.entries(PROSIGNS)) REVERSE[v] = k;

export function decodeCode(code) {
  return REVERSE[code] || null;
}

export function codeOf(token) {
  return PROSIGNS[token] || MORSE[token] || '';
}

// '.-' -> '·—'
export function pretty(code) {
  return [...code].map((c) => (c === '.' ? '·' : c === '-' ? '—' : c)).join('');
}

export function prettyTokens(tokens) {
  return tokens.map((t) => pretty(codeOf(t))).join('  ');
}

// Lay out tokens on a unit grid: dot = 1, dash = 3, gap 1 inside a letter,
// 3 between letters. Returns elements with start offsets in units.
export function layoutTokens(tokens, letterGap = 3) {
  let t = 0;
  const els = [];
  const letters = [];
  tokens.forEach((tok, i) => {
    if (i > 0) t += letterGap;
    const code = codeOf(tok);
    const start = t;
    [...code].forEach((c, j) => {
      if (j > 0) t += 1;
      const len = c === '.' ? 1 : 3;
      els.push({ start: t, len, token: i });
      t += len;
    });
    letters.push({ token: tok, start, end: t });
  });
  return { els, letters, total: t };
}

export function unitsOf(tokens) {
  return layoutTokens(tokens).total;
}

// Units and orders used on the battlefield.
export const UNIT_INFO = {
  T: { name: 'Tanks', role: 'Heavy push, slow to turn' },
  I: { name: 'Infantry', role: 'Takes and holds ground' },
  S: { name: 'Scouts', role: 'Reveals fog of war' },
  M: { name: 'Medics', role: 'Restores morale and health' },
  A: { name: 'Artillery', role: 'Long-range fire on a marked zone' },
};

export const ORDER_INFO = {
  G: { name: 'Advance', verb: 'advance', effect: 'Move one zone forward' },
  H: { name: 'Hold', verb: 'hold', effect: 'Stay and defend; +armour' },
  F: { name: 'Fire', verb: 'fire', effect: 'Attack the nearest marked target' },
  R: { name: 'Retreat', verb: 'retreat', effect: 'Fall back one zone, saves the unit' },
  D: { name: 'Dig in', verb: 'dig in', effect: "Big defence boost, can't move next phrase" },
  C: { name: 'Smoke', verb: 'pop smoke', effect: 'Hides the unit for one phrase' },
};

export const SPECIAL_INFO = {
  K: { name: 'Over', effect: 'Closes every order' },
  CQ: { name: 'All units', effect: 'Instead of a call sign: everyone obeys' },
  SOS: { name: 'Reinforcements', effect: 'Sent with no letter gaps; once per mission' },
  AR: { name: 'End of message', effect: 'Close the mission for a bonus' },
};

export function orderTokens(unit, order) {
  const who = unit === 'CQ' ? ['C', 'Q'] : [unit];
  return [...who, order, 'K'];
}

export function describeOrder(unit, order) {
  const who = unit === 'CQ' ? t('All units') : t(UNIT_INFO[unit]?.name || unit);
  const what = t(ORDER_INFO[order]?.verb || order);
  return t('{who}, {what}', { who, what });
}

export function unitName(u) {
  return t(UNIT_INFO[u]?.name || u);
}

// WPM by the PARIS standard: WPM = 1.2 / unit (seconds)
export function wpmFromUnit(unitSec) {
  return 1.2 / unitSec;
}
