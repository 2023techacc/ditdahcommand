// Unit icons as SVG path data on a 24×24 grid (filled with even-odd rule).
// The same paths draw on the canvas map (Path2D) and in HTML (inline SVG).

const TANK = 'M2 15h20v3a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18z'
  + 'M4.6 17.8a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z'
  + 'M10.9 17.8a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z'
  + 'M17.2 17.8a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z'
  + 'M6 9.5h8.5l2.5 5H4z'
  + 'M14.2 10.6h8.3v1.9h-8.3z';
const HELMET = 'M3.2 15a8.8 8 0 0 1 17.6 0z'
  + 'M1.2 15h21.6v2.4H1.2z'
  + 'M5.5 17.4h2v3.4h-2z M16.5 17.4h2v3.4h-2z';
const BINOCULARS = 'M2.5 9a1.5 1.5 0 0 1 1.5-1.5h4.5A1.5 1.5 0 0 1 10 9v9.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z'
  + 'M14 9a1.5 1.5 0 0 1 1.5-1.5H20A1.5 1.5 0 0 1 21.5 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-4.5a1.5 1.5 0 0 1-1.5-1.5z'
  + 'M10 10.5h4v4h-4z M3.8 4h4.8v3.5H3.8z M15.4 4h4.8v3.5h-4.8z'
  + 'M4.6 16.2a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0z M16.2 16.2a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0z';
const CROSS = 'M9 2.5h6v6.5h6.5v6H15v6.5H9V15H2.5V9H9z';
const GUN = 'M3 17a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0z'
  + 'M6 17a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0z'
  + 'M6.4 15.3l13.4-8.6 1.4 2.2-13.4 8.6z'
  + 'M8.6 18.4l-6.4 3.4-0.8-1.5 6.4-3.4z';
const POST = 'M3.5 21h17v-2.5h-17z M6 18.5V10h12v8.5z M9 12.5h6v3H9z'
  + 'M11.3 10V2.5h1.4v1h6.5v3.6h-6.5V10z';

export const ICONS = {
  T: TANK,
  I: HELMET,
  S: BINOCULARS,
  M: CROSS,
  A: GUN,
  rifle: HELMET,
  armor: TANK,
  gun: GUN,
  post: POST,
};

const cache = {};
export function iconPath(key) {
  if (!ICONS[key]) return null;
  if (!cache[key] && typeof Path2D !== 'undefined') cache[key] = new Path2D(ICONS[key]);
  return cache[key];
}

// Draw an icon centred at (x, y) with the given size on a 2D context.
export function drawIcon(g, key, x, y, size, color) {
  const p = iconPath(key);
  if (!p) return;
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.fillStyle = color;
  g.fill(p, 'evenodd');
  g.restore();
}

export function iconSvg(key, cls = 'ico') {
  const d = ICONS[key];
  if (!d) return '';
  const fill = key === 'M' ? '#c8402d' : 'currentColor';
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path fill="${fill}" fill-rule="evenodd" d="${d}"/></svg>`;
}
