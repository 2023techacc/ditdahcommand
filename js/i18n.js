// Tiny translation layer. English text is the key; other languages map it.
// Missing entries fall back to English.
import { KO } from './lang-ko.js';

const DICTS = { ko: KO };
export const LANGS = [
  ['en', 'English'],
  ['ko', '한국어'],
];

let lang = 'en';

export function setLang(l) {
  lang = DICTS[l] || l === 'en' ? l : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang() {
  return lang;
}

export function has(s) {
  return lang !== 'en' && typeof s === 'string' && !!DICTS[lang]?.[s];
}

// t('Hello {name}', { name }) — translate, then fill {placeholders}.
export function t(s, vars) {
  if (typeof s !== 'string') return s;
  let out = (lang !== 'en' && DICTS[lang]?.[s]) || s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
  return out;
}
