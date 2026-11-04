// VR room add-on (optional, self-contained).
// Adds a "VR" button (bottom right) that opens a virtual octagonal room: every section of the page is drawn on its own
// wall from the page's live text, the morphing orb hangs from the ceiling and the floor is a real-time mirror.
// Navigation is mouse and touch only: drag / swipe to look around, wheel / pinch to zoom, click / tap to get closer.
//
// To remove this feature: delete js/vr.js, css/vr.css and the two tags that load them in index.html.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TAU = Math.PI * 2, rad = d => d * Math.PI / 180, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = x => 1 - Math.pow(1 - clamp(x, 0, 1), 4);
const coarse = matchMedia('(pointer: coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- UI strings ----------
const UI = {
  es: {
    btn: 'Ver el sitio en VR', close: 'Salir', back: 'Volver',
    loading: 'Construyendo la sala', fail: 'No se pudo iniciar WebGL en este dispositivo.',
    hintDesk: 'Arrastra para girar · clic en una pared o tarjeta para entrar · doble clic para volver',
    hintTouch: 'Desliza para girar · toca una pared o tarjeta para entrar · doble toque para volver',
    walls: ['Inicio', 'Servicios', 'Trading', 'Estrategias', 'Pipeline', 'Trayectoria', 'Formación', 'Stack', 'Contacto'],
    walkDesk: 'También puedes desplazarte con las flechas del teclado', walkTouch: 'Con el panel táctil te puedes desplazar libremente',
    pathHint: 'Sigue el camino de luz en el suelo: cada hito es una etapa de mi carrera.',
    pipeline: 'Cómo opera', strategies: 'Estrategias', education: 'Formación',
    wait: 'Cargando datos de Bitget…', down: 'Datos de Bitget no disponibles, reintentando…', view: 'ver', drag: 'girar',
  },
  en: {
    btn: 'View the site in VR', close: 'Exit', back: 'Back',
    loading: 'Building the room', fail: 'WebGL could not start on this device.',
    hintDesk: 'Drag to turn · click a wall or card to step in · double-click to go back',
    hintTouch: 'Swipe to turn · tap a wall or card to step in · double-tap to go back',
    walls: ['Home', 'Services', 'Trading', 'Strategies', 'Pipeline', 'Experience', 'Education', 'Stack', 'Contact'],
    walkDesk: 'You can also move around with the arrow keys', walkTouch: 'Use the touch panel to move around freely',
    pathHint: 'Follow the path of light on the floor: each milestone is a stage of my career.',
    pipeline: 'How it runs', strategies: 'Strategies', education: 'Education',
    wait: 'Loading Bitget data…', down: 'Bitget data unavailable, retrying…', view: 'view', drag: 'turn',
  },
};
const lang = () => (document.documentElement.lang === 'es' ? 'es' : 'en');
const L = () => UI[lang()];

// ---------- Room constants ----------
const N = 9;                  // walls
const STEP = TAU / N;
const A = 9.2;                // apothem: distance from the centre to each wall
const R = A / Math.cos(Math.PI / N);
const SLAB = 0.6;              // panels are solid slabs coming out of the wall this far
const AP = A - SLAB + 0.05;
const PW = 6.3, PH = 3.94;    // wall panel size (metres), ratio 1.6
const EYE = 2.2, HEIGHT = 6.6, ORB_Y = 4.75, ORB_R = 0.95;
const TW = 2048, TH = 1280;   // logical texture size (drawn at this size, rasterised at `scale`)
const CHART = { x: 82, y: 356, w: 906, h: 342 };   // where the live chart goes on the Trading wall
const TICK = { x: 1000, y: 82, w: 958, h: 90 };    // where the live ticker goes on the Home wall

// Same section states as the page background (js/scene.js): shape and palette of the orb per section
const STATES = [
  { s: 1.0, amp: 0.35, freq: 0.9, spikes: 0.0, a: '#7cf7d4', b: '#8b7cff', flow: 0 },
  { s: 0.8, amp: 0.55, freq: 1.4, spikes: 0.0, a: '#8b7cff', b: '#ff5fa2', flow: 0 },
  { s: 0.75, amp: 0.25, freq: 2.2, spikes: 0.35, a: '#3ef0a8', b: '#ff4d6d', flow: 1 },
  { s: 0.9, amp: 0.45, freq: 0.6, spikes: 0.0, a: '#ffb86b', b: '#8b7cff', flow: 0 },
  { s: 0.6, amp: 0.8, freq: 1.0, spikes: 0.15, a: '#7cf7d4', b: '#2f6bff', flow: 0.4 },
  { s: 1.5, amp: 0.3, freq: 0.7, spikes: 0.0, a: '#ffffff', b: '#7cf7d4', flow: 0 },
];
const WALL_STATE = [0, 1, 2, 2, 2, 3, 3, 4, 5]; // wall -> page section state
const WALL_PATH = 5, WALL_TRADING = 2;

// ---------- Canvas drawing helpers ----------
const SANS = '"Space Grotesk", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const C = { fg: '#eef0f6', muted: '#b6bbcd', line: 'rgba(238,240,246,0.16)', accent: '#7cf7d4', a2: '#8b7cff', up: '#3ef0a8', down: '#ff4d6d' };
const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const num = b => (b ? (b.dataset.prefix || '') + (+b.dataset.count).toFixed(+b.dataset.dec || 0) + (b.dataset.suffix || '') : '');

function path(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function glass(g, x, y, w, h, r = 18, fill = 'rgba(8,10,20,0.78)', stroke = C.line) {
  g.save(); path(g, x, y, w, h, r); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 26; g.shadowOffsetY = 10; g.fillStyle = fill; g.fill(); g.shadowColor = 'transparent'; g.lineWidth = 2; g.strokeStyle = stroke; g.stroke(); g.restore();
}
function lines(g, text, w) {
  const out = []; let cur = '';
  for (const word of text.split(' ')) {
    const t = cur ? cur + ' ' + word : word;
    if (cur && g.measureText(t).width > w) { out.push(cur); cur = word; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}
// Draws wrapped text, shrinking the font until it fits maxH (then truncating). Returns the height used.
function text(g, str, x, y, w, o = {}) {
  const { size = 32, min = size, weight = 400, font = SANS, color = C.fg, lh = 1.28, maxH = 1e9, align = 'left', spacing = 0, upper = false } = o;
  if (upper) str = str.toUpperCase();
  let s = size, ls;
  g.textBaseline = 'top'; g.textAlign = align; g.fillStyle = color;
  if ('letterSpacing' in g) g.letterSpacing = spacing ? spacing + 'px' : '0px';
  for (;;) {
    g.font = `${weight} ${s}px ${font}`;
    ls = lines(g, str, w);
    if (ls.length * s * lh <= maxH || s <= min) break;
    s -= 1;
  }
  const maxLines = Math.max(1, Math.floor(maxH / (s * lh)));
  if (ls.length > maxLines) {
    ls = ls.slice(0, maxLines);
    let last = ls[maxLines - 1];
    while (last.length > 1 && g.measureText(last + '…').width > w) last = last.slice(0, -1);
    ls[maxLines - 1] = last.replace(/[ ,.;:]+$/, '') + '…';
  }
  const ax = align === 'right' ? x + w : align === 'center' ? x + w / 2 : x;
  g.save(); g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 6; g.shadowOffsetY = 1;
  ls.forEach((l, i) => g.fillText(l, ax, y + i * s * lh));
  g.restore();
  return ls.length * s * lh;
}
const mono = (g, str, x, y, w, o = {}) => text(g, str, x, y, w, { font: MONO, weight: 400, spacing: 1.5, upper: true, lh: 1.4, ...o });

function pill(g, str, x, y, o = {}) { // returns width
  const { size = 20, color = C.muted, pad = 14 } = o;
  g.font = `400 ${size}px ${MONO}`; if ('letterSpacing' in g) g.letterSpacing = '1px';
  const w = g.measureText(str.toUpperCase()).width + pad * 2, h = size + 16;
  path(g, x, y, w, h, h / 2); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke();
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(str.toUpperCase(), x + pad, y + h / 2 + 1);
  return w;
}
function heading(g, idx, title, intro, zones) {
  mono(g, idx, 70, 62, 200, { size: 26, color: C.accent });
  text(g, title, 64, 96, 900, { size: 124, weight: 500, spacing: -4 });
  if (!intro) return;
  text(g, intro, 1010, 108, 970, { size: 29, min: 21, color: C.muted, maxH: 150 });
  zones.push({ x: 1000, y: 96, w: 990, h: 172 });
}
function frame(g) { // outer wall panel
  glass(g, 20, 20, TW - 40, TH - 40, 28, 'rgba(6,8,16,0.84)', 'rgba(124,247,212,0.32)');
  g.save(); g.strokeStyle = 'rgba(139,124,255,0.35)'; g.lineWidth = 2; path(g, 32, 32, TW - 64, TH - 64, 22); g.stroke(); g.restore();
}

// ---------- Wall painters (read the live text of the page) ----------
// Every piece of information lives in exactly one place. `zones` collects what can be clicked (the camera moves in to
// that rectangle, or follows `href`). A zone with `d` is built as a real block standing `d` metres out of the panel;
// `passive` zones are blocks only. `count` collects the numbers that count up on arrival.
const CARD = { w: 640, h: 450, gx: 33, gy: 22, x: 70, y: 290 };
const DEPTH = 0.14;
const cell = i => ({ x: CARD.x + (i % 3) * (CARD.w + CARD.gx), y: CARD.y + Math.floor(i / 3) * (CARD.h + CARD.gy), w: CARD.w, h: CARD.h });
const REAL = { x: 1040, y: 300, w: 938, h: 910 };

// One point of light per closed trade, built only from the per-strategy counts the page already shows
function tradeLights() {
  const out = [];
  $$('.real .strat').slice(0, 4).forEach((s, i) => {
    if ($('.strat__id', s).dataset.i18n === 'rl.total') return;   // the total row is just the sum of the others
    const n = Math.min(30, parseInt(txt($('.strat__meta', s)), 10) || 0);
    for (let j = 0; j < n; j++) out.push({ x: REAL.x + 160 + j * 26, y: 414 + i * 150 + 102 });
  });
  return out;
}
function counter(count, b, x, y, w, h, o) {
  count.push({ b, x, y, w, h, o });
}

const WALLS = [
  function hero(g, zones) {
    mono(g, txt($('.hero .eyebrow')), 90, 92, 900, { size: 27, color: C.muted });
    let y = 190;
    $$('.hero__title .split').forEach(el => {
      const t = txt(el), outline = el.classList.contains('outline'), accent = el.classList.contains('accent');
      g.font = `500 150px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '-8px';
      g.textBaseline = 'top'; g.textAlign = 'left';
      g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = outline ? 0 : 8;
      if (outline) { g.lineWidth = 2.5; g.strokeStyle = C.fg; g.strokeText(t, 86, y); }
      else { g.fillStyle = accent ? C.accent : C.fg; g.fillText(t, 86, y); }
      g.restore(); y += 140;
    });
    text(g, txt($('.hero__lead')), 90, 1000, 1150, { size: 36, min: 26, color: C.muted, maxH: 210 });
    zones.push({ x: 70, y: 980, w: 1190, h: 230 });
  },

  function services(g, zones) {
    heading(g, '01', txt($('#services .section__title')), txt($('#services .section__intro')), zones);
    $$('#services .card').slice(0, 6).forEach((c, i) => {
      const { x, y, w: cw, h: ch } = cell(i);
      glass(g, x, y, cw, ch);
      mono(g, txt($('.card__num', c)), x + 30, y + 24, 200, { size: 22, color: C.accent });
      const th = text(g, txt($('h3', c)), x + 30, y + 62, cw - 60, { size: 40, min: 28, weight: 500, lh: 1.1, maxH: 100, spacing: -1 });
      text(g, txt($('p', c)), x + 30, y + 74 + Math.max(th, 48) + 8, cw - 60, { size: 26, min: 19, color: C.muted, maxH: ch - 74 - Math.max(th, 48) - 8 - 74 });
      let tx = x + 30;
      $$('.tags li', c).forEach(t => { tx += pill(g, txt(t), tx, y + ch - 62, { size: 17 }) + 8; });
      zones.push({ x, y, w: cw, h: ch, d: DEPTH });
    });
  },

  function trading(g, zones, count) {
    heading(g, '02', txt($('#trading .section__title')), txt($('#trading .section__intro')), zones);
    // the chart's axes are a live layer and its candles are 3D bars (see buildRoom)
    const cx = 70, cy = 300, cw = 930, chh = 410;
    glass(g, cx, cy, cw, chh);
    mono(g, txt($('.chart__head span')), cx + 24, cy + 18, 640, { size: 19, color: C.muted });
    mono(g, 'LIVE', cx + cw - 24 - 120, cy + 18, 120, { size: 19, color: C.up, align: 'right' });
    zones.push({ x: cx, y: cy, w: cw, h: chh, d: 0.1, noLift: true });
    const sw = 455, sh = 242;
    $$('#trading .stat').slice(0, 4).forEach((s, i) => {
      const x = cx + (i % 2) * (sw + 20), y = cy + chh + 18 + Math.floor(i / 2) * (sh + 16);
      glass(g, x, y, sw, sh);
      counter(count, $('b', s), x + 24, y + 24, sw - 48, 70, { size: 58, color: C.accent, spacing: -2, upper: false });
      text(g, txt($('span', s)), x + 24, y + 104, sw - 48, { size: 22, min: 16, color: C.muted, maxH: sh - 116 });
      zones.push({ x, y, w: sw, h: sh, d: DEPTH });
    });
    const { x: rx, w: rw } = REAL;
    const rh = $('.real__head');
    glass(g, rx, REAL.y, rw, REAL.h, 18, 'rgba(8,10,20,0.78)', 'rgba(62,240,168,0.35)');
    zones.push({ x: rx, y: REAL.y, w: rw, h: REAL.h, d: 0.08, passive: true });
    const hs = rh ? $$(':scope > span', rh) : [];
    mono(g, txt(hs[0]), rx + 28, 318, rw - 56, { size: 22, color: C.up });
    text(g, txt(hs[1]), rx + 28, 354, rw - 56, { size: 21, min: 16, color: C.muted, maxH: 54 });
    $$('.real .strat').slice(0, 4).forEach((s, i) => {
      const y = 414 + i * 150;
      g.fillStyle = C.line; g.fillRect(rx + 28, y - 4, rw - 56, 1.5);
      mono(g, txt($('.strat__id', s)), rx + 28, y + 4, 130, { size: 19, color: C.a2 });
      text(g, txt($('h4', s)), rx + 28, y + 30, 400, { size: 27, weight: 500, min: 21, maxH: 60, lh: 1.05 });
      const b = $('b', s);
      counter(count, b, rx + 430, y + 8, 260, 62, { size: 50, color: num(b).startsWith('−') ? C.down : C.accent, spacing: -2, upper: false, align: 'right' });
      mono(g, txt($('.strat__unit', s)), rx + 700, y + 24, 210, { size: 15, color: C.muted, maxH: 40 });
      mono(g, txt($('.strat__meta', s)), rx + 28, y + 92, rw - 56, { size: 17, color: C.muted, upper: false });
      zones.push({ x: rx + 10, y: y - 2, w: rw - 20, h: 146 });
    });
    const noteY = 1024;
    g.fillStyle = C.line; g.fillRect(rx + 28, noteY - 6, rw - 56, 1.5);
    text(g, txt($('.real > .backtest-date')), rx + 28, noteY + 4, rw - 56, { size: 20, min: 14, color: C.muted, maxH: 170, lh: 1.25 });
    zones.push({ x: rx + 10, y: noteY - 4, w: rw - 20, h: 182 });
  },

  function strategies(g, zones, count) {
    heading(g, '02', L().strategies, txt($('#trading > .backtest-date')), zones);
    const cw = 640, ch = 900, gx = 33, x0 = 70, y0 = 290;
    $$('#trading > .strats > .strat').slice(0, 3).forEach((s, i) => {
      const x = x0 + i * (cw + gx);
      glass(g, x, y0, cw, ch);
      mono(g, txt($('.strat__id', s)), x + 30, y0 + 26, 100, { size: 26, color: C.a2 });
      text(g, txt($('h4', s)), x + 30, y0 + 66, cw - 60, { size: 38, weight: 500, min: 28, maxH: 100, lh: 1.1, spacing: -1 });
      counter(count, $('b', s), x + 30, y0 + 170, 400, 130, { size: 110, color: C.accent, spacing: -4, upper: false });
      mono(g, txt($('.strat__unit', s)), x + 30, y0 + 300, cw - 60, { size: 19, color: C.muted });
      let y = y0 + 360;
      $$('.strat__meta', s).forEach(m => {
        const lab = $('.strat__lab', m), lt = txt(lab), rest = txt(m).replace(lt, '').trim();
        g.fillStyle = C.line; g.fillRect(x + 30, y - 10, cw - 60, 1.5);
        mono(g, lt, x + 30, y + 4, cw - 60, { size: 19, color: C.fg });
        text(g, rest, x + 30, y + 40, cw - 60, { size: 26, min: 18, color: C.muted, maxH: 120 });
        y += 176;
      });
      zones.push({ x, y: y0, w: cw, h: ch, d: DEPTH });
    });
  },

  function pipeline(g, zones) {
    heading(g, '02', L().pipeline, '', zones);
    $$('#trading .pipeline .step').slice(0, 5).forEach((s, i) => {
      const { x, y, w: cw, h: ch } = cell(i);
      glass(g, x, y, cw, ch);
      g.fillStyle = C.accent; g.fillRect(x + 24, y + 1, cw - 48, 3);
      mono(g, txt($('span', s)), x + 30, y + 22, 100, { size: 22, color: C.accent });
      text(g, txt($('h4', s)), x + 90, y + 14, cw - 120, { size: 36, min: 28, weight: 500, lh: 1.1, maxH: 44, spacing: -1 });
      text(g, txt($('p', s)), x + 30, y + 70, cw - 60, { size: 26, min: 15, color: C.muted, maxH: ch - 86, lh: 1.24 });
      zones.push({ x, y, w: cw, h: ch, d: DEPTH });
    });
    const d = cell(5);
    glass(g, d.x, d.y, d.w, d.h);
    text(g, txt($('#trading > .disclaimer')), d.x + 30, d.y + 22, d.w - 60, { size: 24, min: 13, color: C.muted, maxH: d.h - 40, lh: 1.24 });
    zones.push({ x: d.x, y: d.y, w: d.w, h: d.h, d: DEPTH });
  },

  // The jobs themselves stand along the path of light on the floor (see buildRoom); this wall is where the path arrives
  function experience(g) {
    mono(g, '03', 90, 90, 200, { size: 26, color: C.accent });
    const title = txt($('#experience .section__title'));
    g.font = `500 170px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '-8px';
    g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = C.fg;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8; g.fillText(title, 84, 120); g.restore();
    const dates = jobEls().map(j => txt($('.job__date', j)));
    const years = dates.join(' ').match(/\d{4}/g) || [];
    if (years.length) {
      const span = `${Math.min(...years)} — ${Math.max(...years)}`;
      mono(g, span, 90, 320, 1400, { size: 70, color: C.accent, spacing: -2, upper: false });
    }
    text(g, L().pathHint, 90, 424, 1860, { size: 36, min: 26, color: C.muted, maxH: 60 });
  },

  function education(g, zones) {
    heading(g, '03', L().education, '', zones);
    eduEls().slice(0, 2).forEach((j, i) => {
      const x = 70 + i * 968, y = 300, cw = 940, h = 880;
      glass(g, x, y, cw, h);
      mono(g, txt($('.job__date', j)), x + 44, y + 44, 500, { size: 34, color: C.accent });
      text(g, txt($('h3', j)), x + 44, y + 110, cw - 88, { size: 72, min: 44, weight: 500, lh: 1.08, maxH: 250, spacing: -2 });
      mono(g, txt($('.job__role', j)), x + 44, y + 380, cw - 88, { size: 32, upper: false, maxH: 100, color: C.fg });
      text(g, txt($('p:last-child', j)), x + 44, y + 500, cw - 88, { size: 44, min: 28, color: C.muted, maxH: 340 });
      zones.push({ x, y, w: cw, h, d: DEPTH });
    });
  },

  function stack(g, zones) {
    heading(g, '04', txt($('#stack .section__title')), '', zones);
    let y = 300;
    $$('#stack .marquee__row').forEach((r, i) => {
      const t = txt($('span', r)).replace(/[ ·]+$/, '');
      const h = text(g, t, 70, y, TW - 140, { size: 84, min: 56, weight: 500, lh: 1.12, maxH: 300, spacing: -2, color: i ? C.a2 : C.fg });
      zones.push({ x: 60, y: y - 6, w: TW - 120, h: h + 12 });
      y += h + 56;
    });
    let bx = 70, by = y + 24;
    $$('#stack .badge').forEach(b => {
      const tag = txt($('span', b)), name = txt(b).replace(tag, '').trim();
      g.font = `400 34px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '0px';
      const w = g.measureText(name).width + 142;
      if (bx + w > TW - 70) { bx = 70; by += 92; }
      glass(g, bx, by, w, 76, 38);
      mono(g, tag, bx + 26, by + 28, 84, { size: 17, color: C.accent });
      text(g, name, bx + 112, by + 18, w - 124, { size: 34, color: C.fg });
      zones.push({ x: bx, y: by, w, h: 76, d: 0.07 });
      bx += w + 16;
    });
  },

  function contact(g, zones) {
    mono(g, '05', 90, 90, 200, { size: 26, color: C.accent });
    mono(g, txt($('#contact .eyebrow')), 90, 140, 1500, { size: 28, color: C.muted });
    let y = 220;
    $$('.contact__big .split').forEach(el => {
      const t = txt(el), outline = el.classList.contains('outline');
      g.font = `500 230px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '-12px'; g.textBaseline = 'top'; g.textAlign = 'left';
      g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = outline ? 0 : 8;
      if (outline) { g.lineWidth = 3; g.strokeStyle = C.fg; g.strokeText(t, 84, y); } else { g.fillStyle = C.fg; g.fillText(t, 84, y); }
      g.restore(); y += 215;
    });
    zones.push({ x: 60, y: 200, w: 1500, h: 450, href: 'mailto:smurilloo@unal.edu.co' });
    let x = 90, py = 800;
    $$('.contact__links a').forEach(a => {
      g.font = `400 34px ${MONO}`; if ('letterSpacing' in g) g.letterSpacing = '1px';
      const label = txt(a), w = g.measureText(label).width + 84, h = 104;
      if (x + w > TW - 70) { x = 90; py += h + 20; }
      glass(g, x, py, w, h, 52, 'rgba(8,10,20,0.78)', 'rgba(124,247,212,0.55)');
      g.font = `400 34px ${MONO}`; g.fillStyle = C.fg; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(label, x + 42, py + h / 2 + 2);
      zones.push({ x, y: py, w, h, href: a.getAttribute('href'), d: 0.1 });
      x += w + 22;
    });
    mono(g, `© ${new Date().getFullYear()} Samuel Murillo Ospina`, 90, 1180, 900, { size: 20, color: C.muted });
    const v = $('#visits');
    if (v && !v.hidden) mono(g, txt(v), 1000, 1180, 958, { size: 20, color: C.muted, align: 'right' });
  },
];

const isEdu = j => !!$('h3[data-i18n^="edu."]', j);
const jobEls = () => $$('#experience .job').filter(j => !isEdu(j));
const eduEls = () => $$('#experience .job').filter(isEdu);

// One upright plate per job, standing along the path (logical size PLATE_W x PLATE_H)
const PLATE_W = 1024, PLATE_H = 640;
function paintPlate(g, j, n) {
  const W = PLATE_W, H = PLATE_H;
  g.save(); path(g, 8, 8, W - 16, H - 16, 20); g.fillStyle = 'rgba(8,10,20,0.92)'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(124,247,212,0.4)'; g.stroke(); g.restore();
  mono(g, txt($('.job__date', j)), 44, 36, W - 180, { size: 28, color: C.accent });
  mono(g, String(n), W - 124, 26, 80, { size: 46, color: C.accent, align: 'right', spacing: 0 });
  text(g, txt($('h3', j)), 44, 78, W - 88, { size: 62, min: 40, weight: 500, lh: 1.05, maxH: 76, spacing: -2 });
  mono(g, txt($('.job__role', j)), 44, 162, W - 88, { size: 24, color: C.fg, upper: false, maxH: 38 });
  text(g, txt($('p:last-child', j)), 44, 214, W - 88, { size: 34, min: 22, color: C.muted, maxH: H - 240, lh: 1.26 });
}

// ---------- Shaders ----------
// 3D simplex noise (Ashima / Stefan Gustavson), the same one the page background uses
const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// Orb: same shape function and colour formula as the page background (js/scene.js). The one addition is the normal
// rebuilt from the displaced surface, so the lumps keep their volume when seen from below inside the room.
const ORB_VS = /* glsl */`
  uniform float uTime, uAmp, uFreq, uSpikes;
  varying float vDisp; varying vec3 vN; varying vec3 vN0; varying vec3 vViewPos;
  ${NOISE}
  float disp(vec3 n){
    vec3 p = n * 1.6;
    float a = snoise(p * uFreq + vec3(uTime * 0.25, uTime * 0.18, 0.0));
    float ridge = 1.0 - abs(snoise(p * 3.0 + uTime * 0.4));
    return a * uAmp + pow(ridge, 6.0) * uSpikes;
  }
  void main(){
    vec3 n = normalize(position);
    vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(n, t);
    const float e = 0.02;
    vec3 n1 = normalize(n + t * e), n2 = normalize(n + b * e);
    float d0 = disp(n);
    vec3 p0 = n * (1.0 + d0 / 1.6);
    vec3 p1 = n1 * (1.0 + disp(n1) / 1.6);
    vec3 p2 = n2 * (1.0 + disp(n2) / 1.6);
    vec3 N = normalize(cross(p1 - p0, p2 - p0));
    if (dot(N, n) < 0.0) N = -N;
    vDisp = d0;
    vN = normalMatrix * N;
    vN0 = normalMatrix * n;
    vec4 mv = modelViewMatrix * vec4(p0, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const ORB_FS = /* glsl */`
  uniform vec3 uColA, uColB;
  uniform float uTime, uBurst, uMirror;
  varying float vDisp; varying vec3 vN; varying vec3 vN0; varying vec3 vViewPos;
  void main(){
    vec3 N = normalize(vN), N0 = normalize(vN0), V = normalize(-vViewPos);
    float fresPage = pow(1.0 - max(dot(N0, V), 0.0), 2.5);
    float fresLump = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    float fres = mix(fresPage, fresLump, 0.2);
    vec3 col = mix(uColB, uColA, smoothstep(-0.3, 0.45, vDisp));
    col = col * (0.18 + fres * 1.4);
    // volume: soft directional light and shaded valleys, on top of the page's colours
    float lit = 0.88 + 0.28 * max(dot(N, normalize(vec3(0.35, 0.3, 0.85))), 0.0);
    col *= lit * mix(0.78, 1.0, smoothstep(-0.35, 0.2, vDisp));
    float bands = smoothstep(0.92, 1.0, sin(vDisp * 40.0 + uTime) * 0.5 + 0.5) * 0.25;
    col += bands * uColA;
    col += uColA * uBurst * (0.12 + fres * 0.5);
    // The page writes these values straight to the screen; the mirror pass stores linear light, so convert there only
    gl_FragColor = vec4(uMirror > 0.5 ? pow(max(col, vec3(0.0)), vec3(2.2)) : col, 1.0);
  }`;

// Panels are real geometry: a slab coming out of the wall with cards standing out of it. Every vertex keeps the wall
// uv of the spot it sits on, so ripples, pointer bulge and lift move fronts and sides together without cracks.
const PANEL_VS = /* glsl */`
  uniform float uHover, uLiftAmt, uAsp;
  uniform vec2 uPtr; uniform vec3 uRip; uniform vec4 uLift;
  attribute float aKind, aH, aLiftable;
  varying vec2 vUv; varying float vKind, vH;
  void main(){
    vUv = uv; vKind = aKind; vH = aH;
    vec3 p = position;
    vec2 asp = vec2(uAsp, 1.0);
    if (uRip.z >= 0.0 && uRip.z < 2.0) {                    // physical ripple where it was touched
      float d = length((uv - uRip.xy) * asp), r = uRip.z * 1.1;
      p.z += sin((d - r) * 22.0) * exp(-pow((d - r) * 5.0, 2.0)) * (1.0 - uRip.z / 2.0) * 0.09 * aH;
    }
    float pd = length((uv - uPtr) * asp);
    p.z += exp(-pd * pd * 14.0) * uHover * 0.05 * aH;        // bulges toward the pointer
    if (aLiftable > 0.5 && uv.x >= uLift.x - 0.001 && uv.x <= uLift.z + 0.001 && uv.y >= uLift.y - 0.001 && uv.y <= uLift.w + 0.001) p.z += uLiftAmt * 0.16;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const PANEL_FS = /* glsl */`
  uniform sampler2D uMap, uLive, uNum;
  uniform vec4 uLiveRect, uZone;
  uniform vec3 uRip, uColA, uColB;
  uniform vec2 uPtr;
  uniform float uTime, uReveal, uHover, uFocus, uZoneAmt, uSheen, uPhase, uLiveOn, uNumOn, uAsp;
  varying vec2 vUv; varying float vKind, vH;
  void main(){
    if (vKind > 1.5) {                                        // edges: light gathers at the front and fades into the wall
      vec3 side = vec3(0.004, 0.005, 0.01) + mix(uColB, uColA, vH) * (0.012 + pow(vH, 5.0) * 0.5);
      gl_FragColor = vec4(side * mix(0.45, 1.0, uFocus), 1.0);
      #include <colorspace_fragment>
      return;
    }
    vec2 asp = vec2(uAsp, 1.0);
    vec4 tex = texture2D(uMap, vUv);
    if (uReveal < 0.999) {                                    // chromatic split while it comes out of the wall
      float s = (1.0 - uReveal) * 0.006;
      tex.r = texture2D(uMap, vUv + vec2(s, 0.0)).r;
      tex.b = texture2D(uMap, vUv - vec2(s, 0.0)).b;
    }
    if (uLiveOn > 0.5) {                                      // live chart axes / ticker layer
      vec2 q = (vUv - uLiveRect.xy) / (uLiveRect.zw - uLiveRect.xy);
      if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
        vec4 l = texture2D(uLive, q);
        tex.rgb = mix(tex.rgb, l.rgb, l.a);
        tex.a = max(tex.a, l.a);
      }
    }
    if (uNumOn > 0.5) { vec4 n = texture2D(uNum, vUv); tex.rgb = mix(tex.rgb, n.rgb, n.a); tex.a = max(tex.a, n.a); }
    vec3 col = mix(vec3(0.002, 0.0026, 0.0055), tex.rgb, tex.a) * mix(0.4, 1.0, uFocus);
    if (vKind > 0.5) col += vec3(0.0012, 0.0015, 0.0026);        // cards catch a little more light than the slab
    // pointer glow, same idea as the page's service cards
    float pd = length((vUv - uPtr) * asp);
    col += uColA * exp(-pd * pd * 26.0) * uHover * 0.035;
    // hovered / selected card outline
    if (uZoneAmt > 0.001) {
      vec2 c = (uZone.xy + uZone.zw) * 0.5, h = abs(uZone.zw - uZone.xy) * 0.5;
      float sd = length(max(abs((vUv - c) * asp) - h * asp + 0.012, 0.0)) - 0.012;
      float border = smoothstep(0.005, 0.0, abs(sd));
      float fill = smoothstep(0.003, -0.003, sd);
      float halo = exp(-max(sd, 0.0) * 60.0) * (1.0 - fill);
      col += uColA * (border * 0.7 + fill * 0.012 + halo * 0.05) * uZoneAmt;
    }
    float sx = (vUv.x + vUv.y * 0.35) / 1.35;
    if (uSheen < 1.0) { float s1 = exp(-pow((sx - (uSheen * 1.6 - 0.3)) * 12.0, 2.0)); col += mix(uColA, vec3(1.0), 0.3) * s1 * 0.4; }
    float idle = fract(uTime * 0.045 + uPhase * 0.31);
    col += uColA * exp(-pow((sx - (idle * 3.0 - 1.0)) * 26.0, 2.0)) * 0.012;
    if (uRip.z >= 0.0 && uRip.z < 2.0) {                      // touch ring
      float d = length((vUv - uRip.xy) * asp), r = uRip.z * 1.1;
      col += uColA * exp(-pow((d - r) * 30.0, 2.0)) * (1.0 - uRip.z / 2.0) * 0.7;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// BTC candles: the page's slim candles and hairline wicks in its exact flat colours, with just enough thickness to stand
// out of the wall. The face you look at is the page's colour; only the thin sides are shaded.
const BARS_VS = /* glsl */`
  uniform float uGrow, uCount;
  attribute vec3 aBarColor;
  varying vec3 vC; varying float vG, vFace;
  void main(){
    float g = clamp(uGrow * (uCount + 10.0) - float(gl_InstanceID), 0.0, 1.0);
    g = 1.0 - pow(1.0 - g, 3.0);
    vG = g;
    vec3 p = position;
    p.y *= g; p.z *= g;
    vC = aBarColor;
    vFace = abs(normal.z);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const BARS_FS = /* glsl */`
  uniform float uFocus;
  varying vec3 vC; varying float vG, vFace;
  void main(){
    if (vG < 0.01) discard;
    gl_FragColor = vec4(vC * mix(0.42, 1.0, vFace) * mix(0.4, 1.0, uFocus), 1.0);
    #include <colorspace_fragment>
  }`;

// One point of light per closed trade; they appear in order after the candles
const LIGHTS_VS = /* glsl */`
  uniform float uTime, uSize, uShow, uCount;
  attribute vec3 aColor; attribute float aScale, aIdx;
  varying vec3 vC; varying float vA;
  void main(){
    vC = aColor;
    vA = smoothstep(aIdx, aIdx + 1.0, uShow * (uCount + 1.0));
    vec3 p = position;
    p.z += 0.03 * sin(uTime * 1.3 + aIdx * 1.7);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * aScale * (1.0 + 0.14 * sin(uTime * 2.2 + aIdx * 2.1)) * mix(2.2, 1.0, vA) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const LIGHTS_FS = /* glsl */`
  varying vec3 vC; varying float vA;
  void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.32, 0.12, d), halo = pow(max(1.0 - d, 0.0), 2.2);
    gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.75), (core + halo * 0.7) * vA);
    #include <colorspace_fragment>
  }`;

// Career milestones: small spheres in the orb's material with their number always facing the viewer
const MILE_VS = /* glsl */`
  varying vec3 vN, vV, vCenter;
  void main(){
    vN = normalMatrix * normal;
    vCenter = -(modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;
const MILE_FS = /* glsl */`
  uniform sampler2D uNum;
  uniform vec3 uColA, uColB;
  uniform float uOn, uMirror;
  varying vec3 vN, vV, vCenter;
  void main(){
    vec3 N = normalize(vN), V = normalize(vV);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    vec3 L = normalize(vec3(0.35, 0.55, 0.75));
    float diff = max(dot(N, L), 0.0);
    vec3 col = mix(uColB, uColA, 0.5 + 0.5 * N.y) * (0.2 + diff * 0.45 + fres * 1.3) * (1.0 + uOn * 0.6);
    col += vec3(1.0) * pow(max(dot(N, normalize(L + V)), 0.0), 70.0) * 0.55;
    vec3 fwd = normalize(vCenter), rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwd)), upv = cross(fwd, rgt);
    col = mix(col, vec3(1.0), texture2D(uNum, vec2(dot(N, rgt), dot(N, upv)) * 0.62 + 0.5).a);
    gl_FragColor = vec4(uMirror > 0.5 ? pow(max(col, vec3(0.0)), vec3(2.2)) : col, 1.0);
  }`;

// Mirror floor: planar reflection (the room re-rendered from below the floor), which gives the exact
// result a ray traced mirror would give for a flat floor at the cost of one cheap extra pass.
const FLOOR_VS = /* glsl */`
  uniform mat4 uTexMat;
  varying vec4 vClip; varying vec3 vW;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vClip = uTexMat * w;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const floorFS = taps => /* glsl */`
  uniform sampler2D uRefl;
  uniform vec3 uColA, uColB;
  uniform vec3 uRings[3];
  uniform vec3 uMiles[5];
  uniform vec2 uArcC, uAxis, uRight;
  uniform float uArcR, uArcMax;
  uniform float uTime, uR;
  varying vec4 vClip; varying vec3 vW;
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    float rr = length(vW.xz) / uR;
    // polished surface: faint swell + rings pushed out by every touch
    vec2 wob = vec2(sin(vW.x * 2.7 + uTime * 0.5) + sin(vW.z * 4.1 - uTime * 0.37), sin(vW.z * 3.1 + uTime * 0.43) + sin(vW.x * 3.9 + uTime * 0.31)) * 0.0005;
    vec3 ringCol = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float age = uRings[i].z;
      if (age < 0.0 || age > 2.6) continue;
      vec2 dv = vW.xz - uRings[i].xy;
      float d = length(dv), r = age * 4.2, fade = 1.0 - age / 2.6;
      float w = exp(-pow(d - r, 2.0) * 3.0) * fade;
      wob += (d > 0.001 ? dv / d : vec2(0.0)) * sin((d - r) * 8.0) * w * 0.022;
      ringCol += uColA * exp(-pow((d - r) * 7.0, 2.0)) * fade * 0.5;
    }
    vec2 uv = vClip.xy / vClip.w + wob;
    // soft near the middle of the room, razor sharp where objects meet the floor
    float blur = mix(${taps > 4 ? '0.0032' : '0.0016'}, 0.0004, rr * rr);
    float lod = mix(${taps > 4 ? '1.5' : '2.0'}, 0.0, rr * rr);
    vec3 refl = vec3(0.0);
    ${taps > 4 ? `
    const int NT = 8;
    vec2 o[8];
    o[0]=vec2(-0.33,-0.92);o[1]=vec2(0.71,-0.57);o[2]=vec2(-0.86,-0.21);o[3]=vec2(0.18,-0.12);
    o[4]=vec2(0.88,0.31);o[5]=vec2(-0.48,0.42);o[6]=vec2(0.26,0.83);o[7]=vec2(-0.12,0.97);` : `
    const int NT = 4;
    vec2 o[4];
    o[0]=vec2(-0.5,-0.8);o[1]=vec2(0.8,-0.4);o[2]=vec2(-0.8,0.4);o[3]=vec2(0.5,0.8);`}
    for (int i = 0; i < NT; i++) refl += texture2D(uRefl, uv + o[i] * vec2(blur, blur * 2.0), lod).rgb;
    refl /= float(NT);
    float F = 0.38 + 0.62 * pow(1.0 - max(V.y, 0.0), 3.0);    // Fresnel: more mirror at grazing angles
    // slab: dark stone, thin joints, an energy pulse travelling out from under the orb
    vec2 g = vW.xz / 1.6;
    vec2 gd = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(0.0005));
    float joint = 1.0 - min(min(gd.x, gd.y), 1.0);
    joint *= exp(-length(cameraPosition.xz - vW.xz) * 0.09);
    float pr = rr * uR;
    float pulse = exp(-pow(pr - mod(uTime * 1.5, 13.0), 2.0) * 1.4);
    vec3 col = vec3(0.0035, 0.004, 0.008);
    col += mix(uColB, uColA, 0.45) * exp(-rr * rr * 7.0) * 0.05;   // light pool under the orb
    col += mix(uColB, uColA, rr) * joint * (0.018 + pulse * 0.4);
    col += refl * F;
    col += ringCol;
    // the career path: an arc of light running through the milestones, oldest to newest
    vec2 prel = vW.xz - uArcC;
    float pang = atan(dot(prel, uRight), dot(prel, uAxis)), plat = length(prel) - uArcR;
    float pmask = 1.0 - smoothstep(uArcMax, uArcMax + 0.03, abs(pang));
    float pflow = pow(fract(pang / uArcMax * 1.2 - uTime * 0.22), 6.0);
    col += mix(uColB, uColA, pang / uArcMax * 0.5 + 0.5) * (exp(-plat * plat * 260.0) * (0.5 + pflow * 1.4) + exp(-plat * plat * 16.0) * 0.05 * (0.4 + pflow)) * pmask;
    for (int i = 0; i < 5; i++) {     // soft pool of light under each sphere
      float md = length(vW.xz - uMiles[i].xy);
      col += uColA * exp(-md * md * 9.0) * (0.05 + uMiles[i].z * 0.16);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const UV_VS = /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SPACE = /* glsl */`
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 + 9.1) * 0.15; }
  float stars(vec2 p, float time){
    vec2 id = floor(p), f = fract(p) - 0.5;
    float h = h21(id);
    if (h < 0.93) return 0.0;
    vec2 o = (vec2(h21(id + 3.1), h21(id + 7.7)) - 0.5) * 0.6;
    float tw = 0.55 + 0.45 * sin(time * (0.5 + h * 2.0) + h * 40.0);
    return smoothstep(0.1, 0.0, length(f - o)) * tw * (h - 0.9) * 8.0;
  }`;
const SHELL_FS = /* glsl */`
  uniform vec3 uColA, uColB; uniform float uTime;
  varying vec2 vUv;
  ${SPACE}
  void main(){
    float y = vUv.y;
    vec3 col = vec3(0.0015, 0.0018, 0.0034);
    vec2 sky = vec2(vUv.x * 16.0, y * 2.4);
    float neb = fbm(sky + vec2(uTime * 0.006, 0.0));
    col += mix(uColB, uColA, neb) * smoothstep(0.45, 0.85, neb) * 0.009;
    col += vec3(0.8, 0.86, 1.0) * stars(vec2(vUv.x * 300.0, y * 62.0), uTime) * 0.35;
    col += uColB * exp(-y * 10.0) * 0.012;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const CEIL_FS = /* glsl */`
  uniform vec3 uColA, uColB; uniform float uTime, uBurst;
  varying vec2 vUv;
  ${SPACE}
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    vec3 col = vec3(0.0015, 0.0018, 0.0034);
    float neb = fbm(p * 5.0 + vec2(uTime * 0.005, -uTime * 0.004));
    col += mix(uColB, uColA, neb) * smoothstep(0.4, 0.85, neb) * 0.014;
    col += mix(uColA, uColB, r) * exp(-r * r * 6.0) * (0.012 + uBurst * 0.3);
    col += vec3(0.8, 0.86, 1.0) * stars(vUv * 110.0, uTime) * 0.4;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
const BAR_FS = /* glsl */`
  uniform vec3 uColA, uColB; uniform float uTime;
  varying vec2 vUv; varying vec3 vW;
  void main(){
    float ph = fract(atan(vW.z, vW.x) * 0.637);
    float pulse = pow(fract(vUv.y * 1.2 - uTime * 0.22 + ph), 7.0);
    gl_FragColor = vec4(mix(uColB, uColA, vUv.y) * (0.05 + pulse * 0.55), 1.0);
    #include <colorspace_fragment>
  }`;
const PTS_VS = /* glsl */`
  uniform float uTime, uSize, uSpin, uMax; uniform vec3 uOrb, uColA, uColB;
  attribute float aSeed, aKind;
  varying float vA; varying vec3 vC;
  void main(){
    vec3 p = position;
    float size, alpha;
    if (aKind < 0.5) {            // distant stars: almost still, tiny, twinkling
      float a = uTime * 0.002;
      p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
      size = 0.5 + aSeed * 0.5;
      alpha = (0.35 + 0.65 * abs(sin(uTime * (0.25 + aSeed * 0.9) + aSeed * 60.0))) * 0.9;
      vC = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.93, 0.85), aSeed);
    } else if (aKind < 1.5) {     // cosmic dust drifting through the room
      float a = uTime * (0.006 + aSeed * 0.014) + uSpin * 0.2;
      p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
      p.y += sin(uTime * 0.11 + aSeed * 40.0) * 0.35;
      p.x += sin(uTime * 0.07 + aSeed * 21.0) * 0.3;
      size = 0.6 + aSeed * 1.5;
      alpha = (0.08 + 0.3 * fract(aSeed * 13.7 + uTime * 0.05)) * 0.8;
      vC = mix(vec3(0.8, 0.85, 1.0), mix(uColA, uColB, aSeed), 0.6);
    } else {                      // the page's particle field, orbiting the orb
      float a = uTime * (0.03 + aSeed * 0.05) + uSpin * (0.4 + aSeed);
      p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
      p += uOrb;
      size = 0.5 + aSeed * 0.9;
      alpha = 0.25 + 0.75 * fract(aSeed * 13.7 + uTime * 0.2);
      vC = uColA;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = min(uSize * size / -mv.z, uMax);
    vA = alpha * smoothstep(0.5, 2.5, -mv.z);    // never a big blob right in front of the camera
    gl_Position = projectionMatrix * mv;
  }`;
const PTS_FS = /* glsl */`
  varying float vA; varying vec3 vC;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d); a *= a;
    gl_FragColor = vec4(vC, a * vA);
    #include <colorspace_fragment>
  }`;

// ---------- Live data on the walls ----------
const CANDLES_URL = 'https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES&granularity=1H&limit=';
const CH_N = 72, CH_WARM = 60;

function ema(vals, n) {
  const k = 2 / (n + 1), out = [];
  vals.forEach((v, i) => out.push(i ? v * k + out[i - 1] * (1 - k) : v));
  return out;
}
async function fetchCandles() {
  const r = await fetch(CANDLES_URL + (CH_N + CH_WARM), { cache: 'no-store' });
  const j = await r.json();
  if (j.code !== '00000' || !Array.isArray(j.data)) throw new Error('bitget');
  const k = j.data.map(d => ({ t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4] })).sort((a, b) => a.t - b.t);
  if (k.length < 2) throw new Error('bitget');
  return { candles: k.slice(-CH_N), line: ema(k.map(c => c.c), 20).slice(-CH_N) };
}
// Same scales as the page chart, as fractions of the chart rectangle
function chartScale(all) {
  const hi = Math.max(...all.map(k => k.h)), lo = Math.min(...all.map(k => k.l));
  const axis = 0.09, pad = 0.05, bottom = 0.09, plotW = 1 - axis, plotH = 1 - pad - bottom;
  return { hi, lo, axis, pad, plotW, plotH, step: plotW / all.length, y: v => pad + (hi - v) / (hi - lo || 1) * plotH };
}
// Axes, EMA and last price. The candles themselves are 3D bars in front of this layer.
function drawChartLayer(g, W, H, data, status) {
  g.clearRect(0, 0, W, H);
  g.font = `400 ${Math.round(H * 0.042)}px ${MONO}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  if (!data) { g.fillStyle = C.muted; g.fillText(status, W * 0.03, H / 2); return null; }
  const { candles: all, line } = data, sc = chartScale(all), plotW = sc.plotW * W, plotH = sc.plotH * H, pad = sc.pad * H, step = sc.step * W;
  const y = v => sc.y(v) * H;
  g.strokeStyle = 'rgba(238,240,246,0.05)'; g.lineWidth = 1; g.fillStyle = C.muted;
  for (let i = 0; i <= 4; i++) {
    const gy = pad + i * plotH / 4;
    g.beginPath(); g.moveTo(0, gy); g.lineTo(plotW, gy); g.stroke();
    g.fillText((sc.hi - i * (sc.hi - sc.lo) / 4).toFixed(0), plotW + W * 0.008, gy + H * 0.012);
  }
  const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
  all.forEach((k, i) => {
    const x = i * step + step / 2, d = new Date(k.t);
    if (d.getHours() % 12 || d.getMinutes()) return;
    const label = d.getHours() === 0 ? dayFmt.format(d) : hourFmt.format(d);
    g.fillText(label, x - g.measureText(label).width / 2, H - H * 0.02);
  });
  g.strokeStyle = 'rgba(139,124,255,0.95)'; g.lineWidth = Math.max(1.5, W / 600); g.beginPath();
  line.forEach((v, i) => { const x = i * step + step / 2; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
  g.stroke();
  const last = all[all.length - 1].c, ly = y(last), lh = H * 0.06, axis = sc.axis * W;
  g.setLineDash([4, 5]); g.strokeStyle = 'rgba(124,247,212,0.7)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, ly); g.lineTo(plotW, ly); g.stroke(); g.setLineDash([]);
  g.fillStyle = C.accent; g.fillRect(plotW + 2, ly - lh / 2, axis - 2, lh);
  g.fillStyle = '#05060a'; g.font = `500 ${Math.round(H * 0.04)}px ${MONO}`; g.fillText(last.toFixed(1), plotW + W * 0.006, ly + H * 0.013);
  return { x: plotW / W, y: ly / H };
}

// A slab of size pw x ph (metres) with blocks standing out of it. Blocks are given in logical canvas units (lw x lh).
function slabGeometry(T, pw, ph, lw, lh, blocks, depth, nx = 40, ny = 25) {
  const P = [], UV = [], K = [], H = [], Li = [], I = [];
  const X = x => (x / lw - 0.5) * pw, Y = y => (0.5 - y / lh) * ph;
  function grid(x0, y0, x1, y1, z, gx, gy, kind, lift) {
    const base = P.length / 3;
    for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
      const lx = lerp(x0, x1, i / gx), ly = lerp(y0, y1, j / gy);
      P.push(X(lx), Y(ly), z); UV.push(lx / lw, 1 - ly / lh); K.push(kind); H.push(1); Li.push(lift);
    }
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const a = base + j * (gx + 1) + i, b = a + 1, c = a + gx + 1, d = c + 1;
      I.push(a, c, b, b, c, d);
    }
  }
  function side(x0, y0, x1, y1, zTop, zBase, n, lift) {
    const base = P.length / 3;
    for (let i = 0; i <= n; i++) {
      const lx = lerp(x0, x1, i / n), ly = lerp(y0, y1, i / n);
      P.push(X(lx), Y(ly), zTop); UV.push(lx / lw, 1 - ly / lh); K.push(2); H.push(1); Li.push(lift);
      P.push(X(lx), Y(ly), zBase); UV.push(lx / lw, 1 - ly / lh); K.push(2); H.push(0); Li.push(0);
    }
    for (let i = 0; i < n; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; I.push(a, b, c, c, b, d); }
  }
  const box = (x, y, w, h, zTop, zBase, gx, gy, lift) => {
    side(x, y, x + w, y, zTop, zBase, gx, lift); side(x + w, y, x + w, y + h, zTop, zBase, gy, lift);
    side(x + w, y + h, x, y + h, zTop, zBase, gx, lift); side(x, y + h, x, y, zTop, zBase, gy, lift);
  };
  grid(0, 0, lw, lh, 0, nx, ny, 0, 0);
  box(0, 0, lw, lh, 0, -depth, nx, ny, 0);
  blocks.forEach(z => { grid(z.x, z.y, z.x + z.w, z.y + z.h, z.d, 8, 6, 1, z.noLift || z.passive ? 0 : 1); box(z.x, z.y, z.w, z.h, z.d, 0, 8, 6, z.noLift || z.passive ? 0 : 1); });
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(UV, 2));
  g.setAttribute('aKind', new T.Float32BufferAttribute(K, 1));
  g.setAttribute('aH', new T.Float32BufferAttribute(H, 1));
  g.setAttribute('aLiftable', new T.Float32BufferAttribute(Li, 1));
  g.setIndex(I);
  return g;
}

// ---------- State ----------
let THREE = null, ui = null, room = null, closing = false;
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

// ---------- Launcher button ----------
function mountButton() {
  const b = el('button', 'vr-btn mono', `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5h18a1 1 0 0 1 1 1V15a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-1.7-1l-.9-1.6a1.4 1.4 0 0 0-2.4 0L10.9 16a2 2 0 0 1-1.7 1H4a2 2 0 0 1-2-2V9.5a1 1 0 0 1 1-1z"/></svg><span>VR</span>`);
  b.type = 'button';
  b.setAttribute('aria-label', L().btn);
  b.dataset.cursor = 'vr';
  b.addEventListener('click', openVR);
  document.body.appendChild(b);
  new MutationObserver(() => b.setAttribute('aria-label', L().btn)).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

// ---------- Open / close ----------
async function openVR(ev) {
  if (ui || closing) return;
  const t = L();
  ui = el('div', 'vr');
  ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-modal', 'true'); ui.setAttribute('aria-label', 'VR');
  const r = (ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect) ? ev.currentTarget.getBoundingClientRect() : null;
  ui.style.setProperty('--vr-x', r ? `${r.left + r.width / 2}px` : '100%');
  ui.style.setProperty('--vr-y', r ? `${r.top + r.height / 2}px` : '100%');
  ui.innerHTML = `
    <div class="vr__top mono">
      <span class="vr__title"><i>VR</i><b data-vr="wall"></b></span>
      <span class="vr__tools">
        <button class="vr__tool mono is-off" type="button" data-vr="back">← ${t.back}</button>
        <button class="vr__tool mono" type="button" data-vr="close" data-cursor="exit">✕ ${t.close}</button>
      </span>
    </div>
    <p class="vr__hint mono" data-vr="hint">${coarse ? t.hintTouch : t.hintDesk}</p>
    <p class="vr__walk mono" data-vr="walk">${coarse ? t.walkTouch : t.walkDesk}</p>
    <nav class="vr__nav mono"><i class="vr__ind" data-vr="ind"></i>${t.walls.map((w, i) => `<button type="button" data-wall="${i}" aria-label="${w}">${String(i + 1).padStart(2, '0')}<span> ${w}</span></button>`).join('')}</nav>
    <div class="vr__load" data-vr="load">
      <div class="vr__count" data-vr="count">000</div>
      <div class="vr__bar"><span data-vr="bar"></span></div>
      <div class="vr__msg mono" data-vr="msg">${t.loading}</div>
    </div>`;
  document.body.appendChild(ui);
  document.body.classList.add('vr-open');
  dispatchEvent(new Event('site:sleep')); // pause the page's own WebGL scene while inside the room
  void ui.offsetWidth;
  ui.classList.add('is-open');
  setTimeout(() => { if (ui && !closing) document.body.classList.add('vr-settled'); }, 1150);
  $('[data-vr="close"]', ui).addEventListener('click', closeVR);
  $('[data-vr="close"]', ui).focus({ preventScroll: true });

  try {
    THREE = THREE || await import('./vendor/three.module.js');
    if (!ui || closing) return;
    room = await buildRoom();
    if (closing && room) { room.dispose(); room = null; }
  } catch (err) {
    console.error('VR room failed', err);
    if (ui) { $('[data-vr="msg"]', ui).textContent = L().fail; }
  }
}

function closeVR() {
  if (!ui || closing) return;
  closing = true;
  document.body.classList.remove('vr-settled');
  void document.body.offsetWidth;
  const u = ui;
  u.classList.remove('is-open');
  setTimeout(() => {
    if (room) { room.dispose(); room = null; }
    u.remove(); ui = null; closing = false;
    document.body.classList.remove('vr-open');
    dispatchEvent(new Event('site:wake'));
    const b = $('.vr-btn'); if (b) b.focus({ preventScroll: true });
  }, reduceMotion ? 30 : 1000);
}

// ---------- Room ----------
async function buildRoom() {
  const T = THREE;
  const q = s => $(`[data-vr="${s}"]`, ui);
  const setLoad = p => {
    q('count').textContent = String(Math.round(p * 100)).padStart(3, '0');
    q('bar').style.transform = `scaleX(${p})`;
  };
  const cv = el('canvas');
  ui.insertBefore(cv, ui.firstChild);
  const small = coarse || Math.min(innerWidth, innerHeight) < 600;
  const scale = small ? 0.85 : 1;   // wall texture resolution
  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setClearColor(0x05060a, 1);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(70, 1, 0.05, 60);
  const rig = new T.Group(); rig.add(camera); scene.add(rig);
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // uniforms shared by everything that follows the orb's palette and the clock
  const shared = {
    uTime: { value: 0 }, uBurst: { value: 0 },
    uColA: { value: new T.Color(STATES[0].a) }, uColB: { value: new T.Color(STATES[0].b) },
  };
  const shaderMat = (o) => keep(new T.ShaderMaterial({ toneMapped: false, ...o }));

  // --- shell: walls, ceiling, light columns and rings
  const shell = new T.Mesh(keep(new T.CylinderGeometry(R, R, HEIGHT, N, 1, true)),
    shaderMat({ uniforms: { uTime: shared.uTime, uColA: shared.uColA, uColB: shared.uColB }, vertexShader: UV_VS, fragmentShader: SHELL_FS, side: T.BackSide }));
  shell.position.y = HEIGHT / 2; shell.rotation.y = Math.PI / N; scene.add(shell);

  const ceil = new T.Mesh(keep(new T.CircleGeometry(R, N)),
    shaderMat({ uniforms: { uTime: shared.uTime, uBurst: shared.uBurst, uColA: shared.uColA, uColB: shared.uColB }, vertexShader: UV_VS, fragmentShader: CEIL_FS }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = HEIGHT; scene.add(ceil);

  const barMat = shaderMat({ uniforms: { uTime: shared.uTime, uColA: shared.uColA, uColB: shared.uColB }, vertexShader: UV_VS, fragmentShader: BAR_FS });
  const barGeo = keep(new T.BoxGeometry(0.05, HEIGHT, 0.05));
  for (let k = 0; k < N; k++) {
    const a = (k + 0.5) * STEP, b = new T.Mesh(barGeo, barMat);
    b.position.set(-Math.sin(a) * (R - 0.05), HEIGHT / 2, -Math.cos(a) * (R - 0.05)); scene.add(b);
  }
  const edgeA = keep(new T.MeshBasicMaterial({ color: 0x7cf7d4, toneMapped: false, transparent: true, opacity: 0.3 }));
  const edgeB = keep(new T.MeshBasicMaterial({ color: 0x8b7cff, toneMapped: false, transparent: true, opacity: 0.22 }));
  const ringGeo = keep(new T.TorusGeometry(R - 0.03, 0.02, 6, N));
  [[0.02, edgeA], [HEIGHT - 0.02, edgeB]].forEach(([y, m]) => {
    const r = new T.Mesh(ringGeo, m); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / N; r.position.y = y; scene.add(r);
  });

  // --- the orb, with the page's wire shell around it
  const orbUniforms = { uTime: shared.uTime, uBurst: shared.uBurst, uColA: shared.uColA, uColB: shared.uColB, uAmp: { value: 0.35 }, uFreq: { value: 0.9 }, uSpikes: { value: 0 }, uMirror: { value: 0 } };
  const orbMat = shaderMat({ uniforms: orbUniforms, vertexShader: ORB_VS, fragmentShader: ORB_FS });
  const orb = new T.Group(); orb.position.set(0, ORB_Y, 0); scene.add(orb);
  const orbHi = new T.Mesh(keep(small ? new T.SphereGeometry(1, 192, 128) : new T.SphereGeometry(1, 320, 220)), orbMat);
  const orbLo = new T.Mesh(keep(new T.SphereGeometry(1, 64, 48)), orbMat); // used in the mirror pass
  orbLo.visible = false; orb.add(orbHi, orbLo);
  const wire = new T.Mesh(keep(new T.IcosahedronGeometry(2.3 / 1.6, 2)), keep(new T.MeshBasicMaterial({ color: 0x8b7cff, wireframe: true, transparent: true, opacity: 0.08, depthWrite: false })));
  orb.add(wire);

  // --- space: a thin haze of nebula clouds drifting through the room
  const hazeTex = (() => {
    const c = el('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const x = 28 + Math.random() * 72, y = 28 + Math.random() * 72, r = 16 + Math.random() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    return keep(new T.CanvasTexture(c));
  })();
  const hazes = [];
  for (let i = 0, n = small ? 4 : 8; i < n; i++) {
    const m = keep(new T.SpriteMaterial({ map: hazeTex, blending: T.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, rotation: Math.random() * TAU }));
    const h = new T.Sprite(m), a = (i / n) * TAU, r = 3.2 + (i % 3) * 1.4;
    h.position.set(Math.cos(a) * r, 3.4 + (i % 2) * 1.5, Math.sin(a) * r);
    h.scale.setScalar(8 + (i % 3) * 2.5);
    h.userData = { rate: (i % 2 ? 1 : -1) * (0.008 + i * 0.002), mix: i / Math.max(1, n - 1) };
    scene.add(h); hazes.push(h);
  }

  // --- particles: far stars + drifting dust + the page's field around the orb
  const PCOUNT = small ? 1400 : 3600;
  const ppos = new Float32Array(PCOUNT * 3), pseed = new Float32Array(PCOUNT), pkind = new Float32Array(PCOUNT);
  for (let i = 0; i < PCOUNT; i++) {
    // shuffled kinds, so lowering the draw range on slow devices thins all three evenly
    const roll = Math.random(), kind = roll < 0.5 ? 0 : roll < 0.78 ? 1 : 2;
    let x, y, z;
    if (kind === 2) {
      const r = 1.5 + Math.pow(Math.random(), 1.6) * 3.2, th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1);
      x = r * Math.sin(ph) * Math.cos(th); y = r * Math.sin(ph) * Math.sin(th) * 0.55; z = r * Math.cos(ph);
    } else {
      const r = kind ? Math.sqrt(Math.random()) * (R - 1) : (R - 1.2) * (0.6 + Math.random() * 0.4), th = Math.random() * TAU;
      x = Math.cos(th) * r; y = (kind ? 0.2 : 4.35) + Math.random() * (HEIGHT - (kind ? 0.4 : 4.5)); z = Math.sin(th) * r;
    }
    ppos[i * 3] = x; ppos[i * 3 + 1] = y; ppos[i * 3 + 2] = z;
    pseed[i] = Math.random(); pkind[i] = kind;
  }
  const pgeo = keep(new T.BufferGeometry());
  pgeo.setAttribute('position', new T.BufferAttribute(ppos, 3));
  pgeo.setAttribute('aSeed', new T.BufferAttribute(pseed, 1));
  pgeo.setAttribute('aKind', new T.BufferAttribute(pkind, 1));
  const pUni = { uTime: shared.uTime, uColA: shared.uColA, uColB: shared.uColB, uSize: { value: 30 }, uMax: { value: 12 }, uSpin: { value: 0 }, uOrb: { value: orb.position } };
  const particles = new T.Points(pgeo, shaderMat({ uniforms: pUni, vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  particles.frustumCulled = false; scene.add(particles);

  // --- mirror floor
  const canHalf = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const reflRT = keep(new T.WebGLRenderTarget(4, 4, { type: canHalf ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: true, stencilBuffer: false, generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, magFilter: T.LinearFilter }));
  const texMat = new T.Matrix4();
  const floorUni = {
    uTime: shared.uTime, uColA: shared.uColA, uColB: shared.uColB, uR: { value: R }, uRefl: { value: reflRT.texture }, uTexMat: { value: texMat },
    uRings: { value: [new T.Vector3(0, 0, -1), new T.Vector3(0, 0, -1), new T.Vector3(0, 0, -1)] },
    uMiles: { value: [0, 1, 2, 3, 4].map(() => new T.Vector3(0, 0, 0)) }, uAxis: { value: new T.Vector2() }, uRight: { value: new T.Vector2() }, uArcC: { value: new T.Vector2() }, uArcR: { value: 6 }, uArcMax: { value: 1 },
  };
  const floor = new T.Mesh(keep(new T.CircleGeometry(R, N)), shaderMat({ uniforms: floorUni, vertexShader: FLOOR_VS, fragmentShader: floorFS(small ? 4 : 8) }));
  floor.rotation.x = -Math.PI / 2; floor.rotation.z = Math.PI / N; scene.add(floor);
  const virt = new T.PerspectiveCamera();
  const _p = new T.Vector3(), _d = new T.Vector3(), _u = new T.Vector3(), _t = new T.Vector3();
  function renderMirror() {
    camera.getWorldPosition(_p); camera.getWorldDirection(_d);
    _u.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new T.Quaternion()));
    virt.position.set(_p.x, -_p.y, _p.z);
    virt.up.set(_u.x, -_u.y, _u.z);
    virt.lookAt(_t.set(_p.x + _d.x, -_p.y - _d.y, _p.z + _d.z));
    virt.near = camera.near; virt.far = camera.far;
    virt.projectionMatrix.copy(camera.projectionMatrix);
    virt.updateMatrixWorld();
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse);
    floor.visible = false; particles.visible = false; orbHi.visible = false; orbLo.visible = true; wire.visible = false; orbUniforms.uMirror.value = 1;
    hazes.forEach(h => { h.visible = false; });
    renderer.setRenderTarget(reflRT); renderer.clear(); renderer.render(scene, virt); renderer.setRenderTarget(null);
    floor.visible = true; particles.visible = true; orbHi.visible = true; orbLo.visible = false; wire.visible = true; orbUniforms.uMirror.value = 0;
    hazes.forEach(h => { h.visible = true; });
  }

  // --- wall panels (text drawn on canvases from the live page)
  await Promise.race([
    Promise.all([`500 40px "Space Grotesk"`, `400 40px "Space Grotesk"`, `400 20px "JetBrains Mono"`, `500 20px "JetBrains Mono"`].map(f => document.fonts.load(f))).catch(() => {}),
    new Promise(r => setTimeout(r, 2500)),
  ]);
  const maxAniso = Math.min(small ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const panels = [], proxies = [], counts = [];
  const proxyGeo = keep(new T.PlaneGeometry(PW, PH));
  const blank = keep(new T.DataTexture(new Uint8Array(4), 1, 1)); blank.needsUpdate = true;
  const panelUniforms = (tex, phase, asp) => ({
    uTime: shared.uTime, uColA: shared.uColA, uColB: shared.uColB,
    uMap: { value: tex }, uLive: { value: blank }, uNum: { value: blank }, uNumOn: { value: 0 }, uLiveRect: { value: new T.Vector4() }, uLiveOn: { value: 0 },
    uReveal: { value: 0 }, uHover: { value: 0 }, uFocus: { value: 0.7 }, uPhase: { value: phase }, uPtr: { value: new T.Vector2(0.5, 0.5) }, uAsp: { value: asp },
    uRip: { value: new T.Vector3(0.5, 0.5, -1) }, uZone: { value: new T.Vector4() }, uZoneAmt: { value: 0 }, uSheen: { value: 1 }, uLift: { value: new T.Vector4(-1, -1, -1, -1) }, uLiftAmt: { value: 0 },
  });
  const panelMat = u => shaderMat({ uniforms: u, vertexShader: PANEL_VS, fragmentShader: PANEL_FS, side: T.DoubleSide });
  for (let i = 0; i < N; i++) {
    const c = el('canvas'); c.width = TW * scale; c.height = TH * scale;
    const g = c.getContext('2d'); g.scale(scale, scale);
    const zones = [], cnt = [];
    frame(g);
    try { WALLS[i](g, zones, cnt); } catch (e) { console.error('VR wall', i, e); }
    // numbers that count up: remember what is behind them, then draw their final value
    let numLayer = null;
    if (cnt.length) {
      const w2 = small ? 768 : 1024, h2 = Math.round(w2 * TH / TW), ls = w2 / TW;
      const clean = el('canvas'); clean.width = w2; clean.height = h2; clean.getContext('2d').drawImage(c, 0, 0, w2, h2);
      const oc = el('canvas'); oc.width = w2; oc.height = h2;
      const og = oc.getContext('2d'); og.scale(ls, ls);
      const nt = keep(new T.CanvasTexture(oc)); nt.colorSpace = T.SRGBColorSpace; nt.generateMipmaps = false; nt.minFilter = T.LinearFilter;
      numLayer = { clean, og, nt, ls, items: cnt, t: 1 };
      cnt.forEach(k => mono(g, num(k.b), k.x, k.y, k.w, k.o));
    }
    const tex = keep(new T.CanvasTexture(c)); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = maxAniso;
    const u = panelUniforms(tex, i * 1.37, PW / PH);
    if (numLayer) u.uNum.value = numLayer.nt;
    const mesh = new T.Mesh(keep(slabGeometry(T, PW, PH, TW, TH, zones.filter(z => z.d), SLAB + 1)), panelMat(u));
    const a = -i * STEP;     // walls run clockwise: swiping left brings the next one
    mesh.userData = { wall: i, zones, u, base: new T.Vector3(-Math.sin(a) * AP, EYE, -Math.cos(a) * AP), n: new T.Vector3(Math.sin(a), 0, Math.cos(a)), numLayer };
    mesh.position.copy(mesh.userData.base);
    mesh.rotation.y = a;
    mesh.frustumCulled = false;
    const proxy = new T.Mesh(proxyGeo); proxy.visible = false; proxy.userData.panel = mesh; mesh.add(proxy);
    scene.add(mesh); panels.push(mesh); proxies.push(proxy);
    renderer.initTexture(tex);               // upload now, in slices, instead of one long hitch on the first frame
    setLoad((i + 1) / (N + 2));
    await new Promise(r => setTimeout(r));
    if (!ui || closing) break;
  }
  if (!ui || closing) { disposables.forEach(d => d.dispose && d.dispose()); renderer.dispose(); return null; }

  function startCount(p) {
    const l = p.userData.numLayer; if (!l || reduceMotion) return;
    l.t = 0; p.userData.u.uNumOn.value = 1;
  }
  function stepCount(p, dt) {
    const l = p.userData.numLayer; if (!l || l.t >= 1) return;
    l.t = Math.min(1, l.t + dt / 1.8);
    const e0 = easeOut(l.t);
    l.og.clearRect(0, 0, TW, TH);
    l.items.forEach(k => {
      const sx = k.x * l.ls, sy = k.y * l.ls, sw = k.w * l.ls, sh = k.h * l.ls;
      l.og.drawImage(l.clean, sx, sy, sw, sh, k.x, k.y, k.w, k.h);
      const d = k.b.dataset, val = (d.prefix || '') + (parseFloat(d.count) * e0).toFixed(+d.dec || 0) + (d.suffix || '');
      mono(l.og, val, k.x, k.y, k.w, k.o);
    });
    l.nt.needsUpdate = true;
    if (l.t >= 1) p.userData.u.uNumOn.value = 0;
  }

  // --- live layers: chart axes on the Trading wall and BTC ticker on the Home wall
  const rectUv = r => new T.Vector4(r.x / TW, 1 - (r.y + r.h) / TH, (r.x + r.w) / TW, 1 - r.y / TH);
  const chartW = small ? 768 : 1280, chartH = Math.round(chartW * CHART.h / CHART.w);
  const chartC = el('canvas'); chartC.width = chartW; chartC.height = chartH;
  const chartG = chartC.getContext('2d');
  const chartTex = keep(new T.CanvasTexture(chartC)); chartTex.colorSpace = T.SRGBColorSpace; chartTex.anisotropy = maxAniso;
  const tradingPanel = panels[WALL_TRADING], tp = tradingPanel.userData.u;
  tp.uLive.value = chartTex; tp.uLiveRect.value.copy(rectUv(CHART)); tp.uLiveOn.value = 1;

  // BTC candles as solid bars standing out of the chart
  const CHART_Z = 0.1;
  const barUni = { uGrow: { value: 1 }, uCount: { value: CH_N }, uFocus: tp.uFocus };
  const barMat3D = shaderMat({ uniforms: barUni, vertexShader: BARS_VS, fragmentShader: BARS_FS });
  const barBox = keep(new T.BoxGeometry(1, 1, 1)); barBox.translate(0, 0, 0.5);
  const barColors = new T.InstancedBufferAttribute(new Float32Array(CH_N * 3), 3);
  barBox.setAttribute('aBarColor', barColors);
  const bodies = new T.InstancedMesh(barBox, barMat3D, CH_N), wicks = new T.InstancedMesh(barBox, barMat3D, CH_N);
  [bodies, wicks].forEach(m => { m.frustumCulled = false; m.count = 0; tradingPanel.add(m); disposables.push(m); });
  const colUp = new T.Color(C.up), colDown = new T.Color(C.down), mtx = new T.Matrix4();
  function layoutBars(data) {
    const all = data.candles, sc = chartScale(all);
    const cw = CHART.w / TW * PW, chh = CHART.h / TH * PH;
    const cx0 = (CHART.x / TW - 0.5) * PW, cy0 = (0.5 - CHART.y / TH) * PH;
    all.forEach((k, i) => {
      const x = cx0 + (i + 0.5) * sc.step * cw, up = k.c >= k.o, step = sc.step * cw;
      const yT = cy0 - sc.y(Math.max(k.o, k.c)) * chh, yB = cy0 - sc.y(Math.min(k.o, k.c)) * chh;
      const yH = cy0 - sc.y(k.h) * chh, yL = cy0 - sc.y(k.l) * chh;
      mtx.makeScale(step * 0.64, Math.max(0.004, yT - yB), 0.035).setPosition(x, (yT + yB) / 2, CHART_Z);
      bodies.setMatrixAt(i, mtx);
      const cc = up ? colUp : colDown; barColors.setXYZ(i, cc.r, cc.g, cc.b);
      mtx.makeScale(Math.max(0.0045, step * 0.09), Math.max(0.004, yH - yL), 0.012).setPosition(x, (yH + yL) / 2, CHART_Z + 0.011);
      wicks.setMatrixAt(i, mtx);
    });
    [bodies, wicks].forEach(m => { m.count = all.length; m.instanceMatrix.needsUpdate = true; });
    barColors.needsUpdate = true;
    barUni.uCount.value = all.length;
  }

  // One point of light per closed trade, from the per-strategy counts the page already shows
  const lightPts = tradeLights();
  const lightUni = { uTime: shared.uTime, uSize: { value: 40 }, uShow: { value: 1 }, uCount: { value: Math.max(1, lightPts.length) } };
  if (lightPts.length) {
    const n = lightPts.length, lp = new Float32Array(n * 3), lc = new Float32Array(n * 3), ls = new Float32Array(n), li = new Float32Array(n);
    const tmpC = new T.Color(C.accent);
    lightPts.forEach((p, i) => {
      lp[i * 3] = (p.x / TW - 0.5) * PW; lp[i * 3 + 1] = (0.5 - p.y / TH) * PH; lp[i * 3 + 2] = 0.2;
      lc[i * 3] = tmpC.r; lc[i * 3 + 1] = tmpC.g; lc[i * 3 + 2] = tmpC.b;
      ls[i] = 1; li[i] = i;
    });
    const lg = keep(new T.BufferGeometry());
    lg.setAttribute('position', new T.BufferAttribute(lp, 3)); lg.setAttribute('aColor', new T.BufferAttribute(lc, 3));
    lg.setAttribute('aScale', new T.BufferAttribute(ls, 1)); lg.setAttribute('aIdx', new T.BufferAttribute(li, 1));
    const lights = new T.Points(lg, shaderMat({ uniforms: lightUni, vertexShader: LIGHTS_VS, fragmentShader: LIGHTS_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    lights.frustumCulled = false; tradingPanel.add(lights);
  }

  const live = { alive: true, data: null, failed: false };
  function paintChart() {
    drawChartLayer(chartG, chartW, chartH, live.data, live.failed ? L().down : L().wait);
    chartTex.needsUpdate = true;
  }
  let arrival = { t: 1 };   // candles, then trades, on every arrival at the Trading wall
  async function refreshChart() {
    if (!live.alive || document.hidden || document.body.classList.contains('is-asleep')) return;
    try {
      const data = await fetchCandles();
      if (!live.alive) return;
      const first = !live.data;
      live.data = data; live.failed = false;
      layoutBars(data);
      if (first && s.wall === WALL_TRADING) arrival.t = 0;
    } catch (e) { live.failed = !live.data; }
    if (live.alive) paintChart();
  }

  const tickC = el('canvas'); tickC.width = 1024; tickC.height = Math.round(1024 * TICK.h / TICK.w);
  const tickG = tickC.getContext('2d');
  const tickTex = keep(new T.CanvasTexture(tickC)); tickTex.colorSpace = T.SRGBColorSpace;
  const hp = panels[0].userData.u;
  hp.uLive.value = tickTex; hp.uLiveRect.value.copy(rectUv(TICK)); hp.uLiveOn.value = 1;
  let tickShown = '';
  function paintTicker() {
    const price = txt($('#tickPrice')), d = $('#tickDelta'), delta = txt(d);
    if (price === '—' || !price || price + delta === tickShown) return; // main.js keeps these two updated
    tickShown = price + delta;
    const W = tickC.width, H = tickC.height;
    tickG.clearRect(0, 0, W, H); tickG.textAlign = 'right'; tickG.textBaseline = 'top';
    if ('letterSpacing' in tickG) tickG.letterSpacing = '1.5px';
    tickG.font = `400 ${H * 0.34}px ${MONO}`; tickG.fillStyle = C.fg; tickG.fillText(`BTC/USDT  ${price}`, W - 4, 4);
    tickG.font = `400 ${H * 0.3}px ${MONO}`; tickG.fillStyle = d.classList.contains('down') ? C.down : C.up; tickG.fillText(delta, W - 4, H * 0.52);
    tickTex.needsUpdate = true;
  }
  paintTicker();
  const tickTimer = setInterval(paintTicker, 2000);

  // --- career: one standing plate and one numbered sphere per job, oldest first. layoutCareer() places them so that
  // all of them can be seen at once from where the camera stands when facing this wall.
  const pa = -WALL_PATH * STEP;
  const axis = new T.Vector2(-Math.sin(pa), -Math.cos(pa)), right = new T.Vector2(-axis.y, axis.x);
  const viewC = axis.clone().multiplyScalar(-(AP + 4.4 - AP));   // the overview camera when facing this wall
  floorUni.uAxis.value.copy(axis); floorUni.uRight.value.copy(right); floorUni.uArcC.value.copy(viewC);
  const jobs = jobEls().slice(0, 5).reverse();
  const PLATE = { w: 2.56, h: 1.6 };
  const plates = [], spheres = [];
  const plateProxy = keep(new T.PlaneGeometry(PLATE.w, PLATE.h));
  const plateGeo = keep(slabGeometry(T, PLATE.w, PLATE.h, PLATE_W, PLATE_H, [], 0.14, 8, 5));
  const sphereGeo = keep(new T.SphereGeometry(0.24, 32, 24));
  jobs.forEach((j, i) => {
    const c = el('canvas'); c.width = PLATE_W; c.height = PLATE_H;
    const g = c.getContext('2d');
    try { paintPlate(g, j, i + 1); } catch (e) { console.error('VR plate', i, e); }
    const tex = keep(new T.CanvasTexture(c)); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = maxAniso;
    const u = panelUniforms(tex, i * 2.1, PLATE.w / PLATE.h);
    const mesh = new T.Mesh(plateGeo, panelMat(u));
    mesh.frustumCulled = false;
    mesh.userData = { plate: i, u, rise: 0, x: 0, y: 1.72, z: 0, k: 1, yaw: 0, nx: 0, nz: 1, zones: [], milestone: new T.Vector2() };
    const proxy = new T.Mesh(plateProxy); proxy.visible = false; proxy.userData.panel = mesh; mesh.add(proxy);
    scene.add(mesh); plates.push(mesh);
    renderer.initTexture(tex);
    const nc = el('canvas'); nc.width = nc.height = 128;
    const ng = nc.getContext('2d'); ng.font = `500 92px ${SANS}`; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.fillStyle = '#fff'; ng.fillText(String(i + 1), 64, 68);
    const nt = keep(new T.CanvasTexture(nc));
    const ball = new T.Mesh(sphereGeo, shaderMat({ uniforms: { uNum: { value: nt }, uColA: shared.uColA, uColB: shared.uColB, uOn: { value: 0 }, uMirror: orbUniforms.uMirror }, vertexShader: MILE_VS, fragmentShader: MILE_FS }));
    ball.userData.phase = i * 1.3;
    scene.add(ball); spheres.push(ball);
  });
  function layoutCareer() {
    const { w, h } = size(), asp = w / h;
    const vfov = rad(asp < 1 ? 78 : 74), half = Math.atan(Math.tan(vfov / 2) * asp) * 180 / Math.PI;
    const put = (p, x, z, y, k = 1) => {
      p.userData.k = k; p.scale.set(k, k, 1);
      const m = p.userData, dx = viewC.x - x, dz = viewC.y - z, l = Math.hypot(dx, dz);
      m.x = x; m.z = z; m.y = y; m.nx = dx / l; m.nz = dz / l; m.yaw = Math.atan2(m.nx, m.nz);
      p.position.x = x; p.position.z = z; p.rotation.y = m.yaw;
    };
    let stepA, arcR;
    if (half - 10 >= 40) {
      // wide screens: a fan, every plate side by side at the same distance from the viewer
      stepA = rad(Math.min(23, (half - 10) / 2)); arcR = 6.4;
      const D = 7.4;
      plates.forEach((p, i) => {
        const a = (i - (plates.length - 1) / 2) * stepA;
        put(p, viewC.x + (axis.x * Math.cos(a) + right.x * Math.sin(a)) * D, viewC.y + (axis.y * Math.cos(a) + right.y * Math.sin(a)) * D, 1.72);
      });
    } else {
      // narrow screens: rows of two, oldest at the top, so nothing hides behind anything else
      stepA = rad(Math.max(5, (half - 3) / 2.2)); arcR = 5.6;
      const D = 8, K = 0.85, rows = [[0, 3.8], [0, 2.38], [0, 0.96]];
      plates.forEach((p, i) => {
        const row = Math.floor(i / 2), last = i === plates.length - 1 && i % 2 === 0;
        const lat = last ? 0 : (i % 2 ? 1.16 : -1.16), y = rows[row][1];
        put(p, viewC.x + axis.x * D + right.x * lat, viewC.y + axis.y * D + right.y * lat, y, K);
      });
    }
    spheres.forEach((b, i) => {
      const a = (i - (spheres.length - 1) / 2) * stepA;
      const x = viewC.x + (axis.x * Math.cos(a) + right.x * Math.sin(a)) * arcR, z = viewC.y + (axis.y * Math.cos(a) + right.y * Math.sin(a)) * arcR;
      b.position.x = x; b.position.z = z; b.userData.base = 0.42;
      plates[i].userData.milestone.set(x, z);
      floorUni.uMiles.value[i].x = x; floorUni.uMiles.value[i].y = z;
    });
    floorUni.uArcR.value = arcR; floorUni.uArcMax.value = stepA * (spheres.length - 1) / 2 + 0.1;
  }
  setLoad((N + 1) / (N + 2));

  // --- view state: overview of the room -> one wall -> one card
  const s = {
    mode: 'over', wall: 0, zone: null, zoneWall: -1,
    yaw: 0, tYaw: 0, pitch: rad(46), tPitch: rad(8), dist: AP + 1, tDist: AP + 4.4, fov: 84, tFov: 74,
    panX: 0, panY: 0, tPanX: 0, tPanY: 0, pull: 0, tPull: 0, vel: 0,
    walking: false, walkX: 0, walkZ: 0, tWalkX: 0, tWalkZ: 0, plate: -1,
    px: 0, py: 0, mx: 0, my: 0, lastInput: performance.now(), spin: 0,
  };
  const size = () => ({ w: ui ? ui.clientWidth : innerWidth, h: ui ? ui.clientHeight : innerHeight });
  // How far back the camera must be for a rectangle (metres) to fit the screen at the framed fov
  function frameDist(w, h, mw, mh) {
    const { w: W, h: H } = size(), asp = W / H, fov = asp < 1 ? 66 : 50;
    const tv = Math.tan(rad(fov) / 2), th = tv * asp;
    // never closer than where one texel of the wall would cover more than ~1.6 screen pixels (text would blur)
    const sharp = H / (2 * tv) * (PW / (TW * scale)) / 1.6;
    return { fov, dist: clamp(Math.max((w / 2) / (th * mw), (h / 2) / (tv * mh), sharp), 1.05, AP + 4.6) };
  }
  function applyMode() {
    if (s.mode === 'over') {
      const asp = size().w / size().h;
      s.tPanX = s.tPanY = 0; s.tFov = asp < 1 ? 78 : 74;
      if (s.walking) s.tDist = AP;
      else { s.tDist = AP + 4.4; s.tPitch = rad(8); s.tWalkX = s.tWalkZ = 0; }
    } else if (s.mode === 'wall') {
      const f = frameDist(PW, PH, 0.94, 0.74);
      s.tDist = f.dist; s.tFov = f.fov; s.tPitch = 0; s.tPanX = s.tPanY = 0;
    } else if (s.mode === 'zone' && s.zone) {
      const z = s.zone;
      const f = frameDist(z.w / TW * PW, z.h / TH * PH, 0.96, 0.72);
      s.tDist = f.dist; s.tFov = f.fov; s.tPitch = 0;
      s.tPanX = ((z.x + z.w / 2) / TW - 0.5) * PW;
      s.tPanY = (0.5 - (z.y + z.h / 2) / TH) * PH;
    }
    else if (s.mode === 'plate') {
      const m = plates[s.plate].userData, f = frameDist(PLATE.w * m.k, PLATE.h * m.k, 0.94, 0.72);
      s.tDist = AP; s.tFov = f.fov; s.tPitch = 0; s.tPanX = 0; s.tPanY = m.y - EYE;
      s.tYaw += shortest(m.yaw - s.tYaw);
      const nl = Math.hypot(m.nx, m.nz);
      s.tWalkX = m.x + m.nx / nl * f.dist; s.tWalkZ = m.z + m.nz / nl * f.dist;
    }
    if (s.mode !== 'over' && s.mode !== 'plate') s.tWalkX = s.tWalkZ = 0;
    q('back').classList.toggle('is-off', s.mode === 'over' && !s.walking);
  }
  const shortest = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  function toWall(i) {
    s.tYaw += shortest(-i * STEP - s.tYaw);
    panels[i].userData.u.uSheen.value = 0;
  }
  function setMode(mode, wall, zone) {
    if (wall != null) toWall(wall);
    if (mode === 'wall' && wall === WALL_PATH) mode = 'over';   // this wall is seen from down the path
    if (mode !== 'plate') s.plate = -1;
    s.walking = false;
    s.mode = mode; s.zone = zone || null; s.zoneWall = zone ? wall : -1; s.tPull = 0;
    applyMode();
    hideHint();
  }
  function stepOut() {
    if (s.mode === 'zone') setMode('wall', wrap(-Math.round(s.tYaw / STEP)));
    else setMode('over');
  }
  const wrap = i => ((i % N) + N) % N;

  // --- walking: the orbit offset becomes a position in the room, from then on the camera turns on the spot
  const WALK_R = A - 1.75;
  function startWalk() {
    if (s.mode !== 'over' || !s.walking) {
      const d = s.dist - AP;
      s.walkX += Math.sin(s.yaw) * d; s.walkZ += Math.cos(s.yaw) * d;
      s.tWalkX = s.walkX; s.tWalkZ = s.walkZ;
      s.dist = s.tDist = AP;
      s.mode = 'over'; s.zone = null; s.zoneWall = -1; s.plate = -1; s.walking = true; s.tPull = 0;
      s.tPitch = rad(4); s.tPanX = s.tPanY = 0;
      applyMode();
    }
    hintWalkSeen();
  }
  function limitWalk() {
    const r = Math.hypot(s.tWalkX, s.tWalkZ);
    if (r > WALK_R) { s.tWalkX *= WALK_R / r; s.tWalkZ *= WALK_R / r; }
  }
  function walkBy(forward, strafe) {
    startWalk();
    s.tWalkX += -Math.sin(s.yaw) * forward + Math.cos(s.yaw) * strafe;
    s.tWalkZ += -Math.cos(s.yaw) * forward - Math.sin(s.yaw) * strafe;
    limitWalk();
  }
  function walkTo(x, z) { startWalk(); s.tWalkX = x; s.tWalkZ = z; limitWalk(); }
  function hintWalkSeen() { hideHint(); }
  const keys = { ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0 };
  let walkVF = 0, walkVS = 0;

  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposables.push({ dispose: () => t.removeEventListener(ev, fn, o) }); };
  on(q('back'), 'click', stepOut);

  // --- hint
  const hintEl = q('hint');
  let hintTimer = setTimeout(() => hintEl.classList.add('is-off'), 10000);
  function hideHint() { clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.add('is-off'), 1800); }

  // --- adaptive quality: drops resolution before it would ever drop frames
  const TIERS = [
    { pr: 2, refl: 720, every: 1, pts: 1 },
    { pr: 1.5, refl: 512, every: 1, pts: 1 },
    { pr: 1.25, refl: 360, every: 2, pts: 0.7 },
    { pr: 1, refl: 256, every: 3, pts: 0.4 },
  ];
  let tier = 0, frameNo = 0, mirrorFresh = false;
  function applySize() {
    const { w, h } = size(), T0 = TIERS[tier], pr = Math.min(devicePixelRatio, T0.pr);
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const rh = Math.min(T0.refl, h * pr), rw = Math.round(rh * w / h);
    reflRT.setSize(rw, Math.round(rh));
    pUni.uSize.value = 30 * pr; pUni.uMax.value = 7 * pr;
    lightUni.uSize.value = 110 * pr;
    pgeo.setDrawRange(0, Math.floor(PCOUNT * T0.pts));
  }
  const ro = new ResizeObserver(() => { applySize(); layoutCareer(); applyMode(); });
  ro.observe(ui);
  applySize();
  layoutCareer();

  // --- picking
  const ray = new T.Raycaster(), v2 = new T.Vector2(), orbCenter = new T.Vector3(), orbHit = new T.Vector3(), _sph = new T.Sphere(), _mid = new T.Vector2(0.5, 0.5);
  function pick(cx, cy) {
    const { w, h } = size();
    v2.set(cx / w * 2 - 1, -(cy / h) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const risen = proxies.concat(plates.filter(p => p.userData.rise > 0.6).map(p => p.children[0]));
    const hit = ray.intersectObjects(risen, false)[0];
    orb.getWorldPosition(orbCenter);
    const oh = ray.ray.intersectSphere(_t.copy(orbCenter) && new T.Sphere(orbCenter, ORB_R * orb.scale.x * 1.2), orbHit);
    if (oh && (!hit || oh.distanceTo(ray.ray.origin) < hit.distance)) return { orb: true };
    for (let i = 0; i < spheres.length; i++) {
      const b = ray.ray.intersectSphere(_sph.set(spheres[i].position, 0.34), orbHit);
      if (b && (!hit || b.distanceTo(ray.ray.origin) < hit.distance)) return { panel: plates[i], plate: i, uv: _mid };
    }
    let point = null;
    if (ray.ray.direction.y < 0) { const k = -ray.ray.origin.y / ray.ray.direction.y; point = ray.ray.origin.clone().addScaledVector(ray.ray.direction, k); }
    if (!hit || !hit.uv) return { floor: point };
    const mesh = hit.object.userData.panel;
    if (mesh.userData.plate != null) return { panel: mesh, plate: mesh.userData.plate, uv: hit.uv };
    const px = hit.uv.x * TW, py = (1 - hit.uv.y) * TH;
    const zone = mesh.userData.zones.find(z => !z.passive && px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) || null;
    return { panel: mesh, wall: mesh.userData.wall, uv: hit.uv, zone, point: hit.point };
  }
  let ringI = 0;
  function floorRing(x, z) { floorUni.uRings.value[ringI].set(x, z, 0); ringI = (ringI + 1) % 3; }
  function wallRipple(p, uv) {
    const u = p.userData.u; u.uRip.value.set(uv.x, uv.y, 0);
    floorRing(p.position.x * 0.98, p.position.z * 0.98);
  }
  function ping(x, y) {
    if (reduceMotion) return;
    const n = el('i', 'vr__ping'); n.style.left = `${x}px`; n.style.top = `${y}px`;
    n.addEventListener('animationend', () => n.remove()); ui.appendChild(n);
  }
  const zoneUv = (u, z) => u.uZone.value.set(z.x / TW, 1 - (z.y + z.h) / TH, (z.x + z.w) / TW, 1 - z.y / TH);

  // --- input: one code path for mouse and touch
  const cursorEl = $('#cursor'), cursorLabel = $('#cursorLabel');
  const setCursor = (active, label) => { if (cursorEl) { cursorEl.classList.toggle('is-hover', active); if (cursorLabel) cursorLabel.textContent = label || ''; } };
  const ptrs = new Map();
  const DOUBLE_MS = 280;
  let pendingTap = null;
  let moved = 0, downAt = 0, pinch0 = 0, dist0 = 0, hoverDirty = false, hx = 0, hy = 0, hoverPanel = null, hoverZone = null, lastMoveT = 0, dragging = false;
  const pdist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  function touchWake() { s.lastInput = performance.now(); }

  on(ui, 'pointerdown', e => ping(e.clientX, e.clientY));
  on(cv, 'pointerdown', e => {
    if (e.button && e.button !== 0) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touchWake();
    if (ptrs.size === 1) { moved = 0; downAt = performance.now(); s.vel = 0; dragging = false; hx = e.clientX; hy = e.clientY; hoverDirty = true; }
    if (ptrs.size === 2) { pinch0 = pdist(); dist0 = s.tDist; moved = 99; }
    ui.classList.add('is-drag'); hideHint();
  });
  on(cv, 'pointermove', e => {
    s.mx = e.clientX / size().w * 2 - 1; s.my = e.clientY / size().h * 2 - 1;
    hx = e.clientX; hy = e.clientY; hoverDirty = true;
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    touchWake();
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2) {
      if (s.mode === 'over') { const pd = pdist(); walkBy((pd - pinch0) * 0.012, 0); pinch0 = pd; return; }
      s.tDist = clamp(dist0 * pinch0 / pdist(), 1.05, AP + 4.6);
      if (s.mode === 'wall' && s.tDist < frameDist(PW, PH, 0.94, 0.74).dist * 0.8) { s.mode = 'zone'; s.zone = null; q('back').classList.remove('is-off'); }
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 8) return;
    dragging = true;
    const { w, h } = size();
    if (s.mode === 'zone') {                     // close to a card: the drag slides along the wall
      const m = 2 * s.dist * Math.tan(rad(s.fov) / 2) / h;
      s.tPanX = clamp(s.tPanX - dx * m, -PW / 2, PW / 2);
      s.tPanY = clamp(s.tPanY + dy * m, -PH / 2 - 0.6, PH / 2);
      return;
    }
    const k = STEP / (Math.min(w, 760) * 0.72);  // a swipe across the screen moves about one wall
    s.tYaw += dx * k;
    const now = performance.now(), dtm = Math.max(1, now - lastMoveT); lastMoveT = now;
    s.vel = lerp(s.vel, dx * k / (dtm / 1000), 0.35);
    if (s.mode === 'over') {
      // touch: vertical drag walks (finger up = forward). Mouse: vertical drag looks up and down.
      if (coarse) walkBy(-dy * 0.014, 0);
      else s.tPitch = clamp(s.tPitch + dy * rad(s.fov) / h, rad(-22), rad(62));
    }
    else if (s.mode === 'plate') { setMode('over'); }
    else s.tPull = 1;                            // pull back while swiping between walls, then push in again
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    const wasOne = ptrs.size === 1; ptrs.delete(e.pointerId);
    if (ptrs.size === 0) ui.classList.remove('is-drag');
    if (!wasOne) { moved = 99; return; }
    const stale = performance.now() - lastMoveT > 90;
    if (dragging) {
      if (s.mode === 'wall') {                   // snap to the wall the swipe was heading to
        const next = wrap(-Math.round((s.tYaw + (stale ? 0 : clamp(s.vel, -3.2, 3.2) * 0.16)) / STEP));
        s.tPull = 0; setMode('wall', next);
      } else if (s.mode === 'over' && !stale) s.tYaw += clamp(s.vel, -3, 3) * 0.1;  // glide
      dragging = false; return;
    }
    if (e.type === 'pointerup' && moved < 8 && performance.now() - downAt < 600) {
      const tx = e.clientX, ty = e.clientY;
      if (pendingTap && Math.hypot(tx - pendingTap.x, ty - pendingTap.y) < 48) {
        clearTimeout(pendingTap.timer); pendingTap = null;
        stepOut();                                 // double click / double tap = the Back button
        return;
      }
      if (pendingTap) { clearTimeout(pendingTap.timer); tap(pendingTap.x, pendingTap.y); }
      pendingTap = { x: tx, y: ty, timer: setTimeout(() => { const t = pendingTap; pendingTap = null; if (t) tap(t.x, t.y); }, DOUBLE_MS) };
    }
  };
  on(cv, 'pointerup', up); on(cv, 'pointercancel', up);
  on(cv, 'wheel', e => {
    e.preventDefault(); touchWake();
    if (s.mode === 'over') { walkBy(-e.deltaY * 0.004, 0); return; }
    s.tDist = clamp(s.tDist * Math.exp(e.deltaY * 0.0011), 1.05, AP + 4.6);
    if (s.mode === 'wall' && s.tDist < frameDist(PW, PH, 0.94, 0.74).dist * 0.8) { s.mode = 'zone'; s.zone = null; q('back').classList.remove('is-off'); }
    hideHint();
  }, { passive: false });

  function tap(x, y) {
    const h = pick(x, y);
    if (h.orb) { s.burst = 1; s.spin += 1.4; if (s.mode !== 'over') setMode('over'); return; }
    if (h.plate != null) {
      h.panel.userData.u.uRip.value.set(h.uv.x, h.uv.y, 0);
      const m = h.panel.userData.milestone; floorRing(m.x, m.y);
      if (s.mode === 'plate' && s.plate === h.plate) { setMode('over'); return; }
      s.plate = h.plate; s.walking = false; s.mode = 'plate'; s.zone = null; s.zoneWall = -1;
      applyMode(); hideHint();
      return;
    }
    if (h.panel) {
      wallRipple(h.panel, h.uv);
      if (h.zone && h.zone.href) { openLink(h.zone.href); return; }
      if (h.wall !== s.wall || s.mode === 'over') { setMode('wall', h.wall); return; }
      if (h.zone) {
        if (s.mode === 'zone' && s.zone === h.zone) { setMode('wall', h.wall); return; }
        zoneUv(h.panel.userData.u, h.zone);
        setMode('zone', h.wall, h.zone);
        return;
      }
      if (s.mode === 'zone') setMode('wall', h.wall);
      return;
    }
    if (h.floor && Math.hypot(h.floor.x, h.floor.z) < R) {
      floorRing(h.floor.x, h.floor.z);
      const mile = plates.findIndex(p => Math.hypot(p.userData.milestone.x - h.floor.x, p.userData.milestone.y - h.floor.z) < 0.7);
      if (mile >= 0) { s.plate = mile; s.walking = false; s.mode = 'plate'; s.zone = null; s.zoneWall = -1; applyMode(); hideHint(); return; }
      walkTo(h.floor.x, h.floor.z);
      return;
    }
    stepOut();
  }
  function openLink(href) {
    if (href.startsWith('mailto:')) { const big = $('.contact__big'); if (big) big.click(); else location.href = href; }
    else window.open(href, '_blank', 'noopener');
  }

  on(window, 'keydown', e => {
    if (document.body.classList.contains('mail-open')) return;
    touchWake();
    if (e.key === 'Escape') { if (s.mode === 'over' && !s.walking) closeVR(); else stepOut(); }
    else if (e.key in keys) { e.preventDefault(); keys[e.key] = 1; }
  });
  on(window, 'keyup', e => { if (e.key in keys) keys[e.key] = 0; });
  on(window, 'blur', () => { for (const k in keys) keys[k] = 0; });
  // Page-level idle logic may wake the page's scene; keep it paused for as long as the room is open
  on(window, 'site:wake', () => { if (!closing) dispatchEvent(new Event('site:sleep')); });

  // --- nav + animated wall title
  const navBtns = $$('.vr__nav button', ui), ind = q('ind');
  navBtns.forEach(b => on(b, 'click', () => { touchWake(); setMode('wall', +b.dataset.wall); }));
  function moveInd(i) {
    const b = navBtns[i];
    ind.style.width = `${b.offsetWidth}px`; ind.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  const titleEl = q('wall');
  function setWall(i) {
    s.wall = i;
    titleEl.textContent = '';
    [...L().walls[i]].forEach((c, k) => {
      const sp = el('span'); sp.textContent = c; sp.style.animationDelay = `${k * 0.025}s`; titleEl.appendChild(sp);
    });
    navBtns.forEach((b, k) => b.classList.toggle('is-on', k === i));
    moveInd(i);
    startCount(panels[i]);                 // numbers count up on every arrival
    panels[i].userData.u.uSheen.value = 0;
    if (i === WALL_TRADING && !reduceMotion) arrival.t = 0;
  }
  setWall(0);
  paintChart(); refreshChart();
  const chartTimer = setInterval(refreshChart, 5000);
  on(window, 'resize', () => moveInd(s.wall));

  // Everything is built: compile shaders while the loader is still up so the first frame does not hitch
  scene.updateMatrixWorld();
  renderer.compile(scene, camera);
  setLoad(1);
  await new Promise(r => setTimeout(r, 120));
  if (!ui || closing) { dispose(); return null; }

  // --- render loop
  const clock = new T.Clock();
  const cur = { s: 1, amp: 0.35, freq: 0.9, spikes: 0, flow: 0, a: new T.Color(STATES[0].a), b: new T.Color(STATES[0].b) };
  const palette = STATES.map(x => ({ ...x, a: new T.Color(x.a), b: new T.Color(x.b) }));
  const tmpA = new T.Color(), tmpB = new T.Color();
  const smooth = (a, b, dt, r) => a + (b - a) * (1 - Math.exp(-r * dt));
  const speed = reduceMotion ? 0.2 : 1;
  let time = 0, startedAt = -1, frameSum = 0, frameCount = 0, perfWindow = 0;
  s.burst = 0;

  renderer.setAnimationLoop(() => {
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
    if (document.body.classList.contains('is-asleep')) return;  // page idle timer: stop the GPU as well
    time += dt * speed;
    if (startedAt < 0) startedAt = time;
    const since = time - startedAt;
    shared.uTime.value = time;

    // quality governor (skips the opening seconds and hidden-tab gaps)
    if (since > 2 && raw < 0.25) {
      frameSum += raw; frameCount++; perfWindow += raw;
      if (perfWindow > 1.2) {
        const avg = frameSum / frameCount;
        if (avg > 1 / 42 && tier < TIERS.length - 1) { tier++; applySize(); }
        frameSum = 0; frameCount = 0; perfWindow = 0;
      }
    }

    // camera
    if (s.mode === 'over' && !s.walking && !ptrs.size && !reduceMotion && performance.now() - s.lastInput > 5000) s.tYaw += dt * 0.04;  // slow orbit when idle
    // arrow keys: forward, back and sideways relative to where the camera looks
    const fw = keys.ArrowUp - keys.ArrowDown, st = keys.ArrowRight - keys.ArrowLeft;
    walkVF = smooth(walkVF, fw * 3.4, dt, 7); walkVS = smooth(walkVS, st * 2.8, dt, 7);
    if (fw || st || Math.abs(walkVF) > 0.02 || Math.abs(walkVS) > 0.02) { touchWake(); walkBy(walkVF * dt, walkVS * dt); }
    s.yaw = smooth(s.yaw, s.tYaw, dt, 6);
    s.pitch = smooth(s.pitch, s.tPitch, dt, 3.6);
    s.dist = smooth(s.dist, s.tDist, dt, 3.6);
    s.fov = smooth(s.fov, s.tFov, dt, 3.6);
    s.panX = smooth(s.panX, s.tPanX, dt, 4.2); s.panY = smooth(s.panY, s.tPanY, dt, 4.2);
    s.pull = smooth(s.pull, s.tPull, dt, 5);
    s.walkX = smooth(s.walkX, s.tWalkX, dt, 4); s.walkZ = smooth(s.walkZ, s.tWalkZ, dt, 4);
    s.px = smooth(s.px, coarse ? 0 : s.mx, dt, 2.5); s.py = smooth(s.py, coarse ? 0 : s.my, dt, 2.5);
    const dist = lerp(s.dist, Math.max(s.dist, AP + 1.6), s.pull);
    const d = dist - AP;
    rig.position.set(Math.sin(s.yaw) * d + s.walkX, 0, Math.cos(s.yaw) * d + s.walkZ);
    rig.rotation.y = s.yaw;
    const sway = reduceMotion ? 0 : 1;
    camera.position.set(s.panX + s.px * 0.12 + Math.sin(time * 0.31) * 0.015 * sway, EYE + s.panY - s.py * 0.08 + Math.sin(time * 0.43) * 0.012 * sway, 0);
    camera.rotation.set(s.pitch - s.py * 0.006, -s.px * 0.012, Math.sin(time * 0.23) * 0.0016 * sway);
    if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }

    // which wall is in front, and the orb state it maps to (blends continuously while turning, like scrolling the page)
    const f = (((-s.yaw / STEP) % N) + N) % N;
    const w = s.mode === 'plate' ? WALL_PATH : wrap(Math.round(f));   // a career plate belongs to the Experience wall
    if (w !== s.wall) setWall(w);
    const i0 = Math.floor(f), kk = f - i0, ks = kk * kk * (3 - 2 * kk);
    const A0 = palette[WALL_STATE[i0 % N]], B0 = palette[WALL_STATE[(i0 + 1) % N]];
    const ease = 1 - Math.pow(0.04, dt);
    for (const key of ['s', 'amp', 'freq', 'spikes', 'flow']) cur[key] = lerp(cur[key], lerp(A0[key], B0[key], ks), ease);
    tmpA.copy(A0.a).lerp(B0.a, ks); tmpB.copy(A0.b).lerp(B0.b, ks);
    cur.a.lerp(tmpA, ease); cur.b.lerp(tmpB, ease);
    shared.uColA.value.copy(cur.a); shared.uColB.value.copy(cur.b);
    s.burst = Math.max(0, s.burst - dt * 1.4);
    shared.uBurst.value = s.burst * s.burst;
    const turn = Math.abs(s.tYaw - s.yaw);
    orbUniforms.uAmp.value = cur.amp + Math.min(turn * 0.2, 0.22) + shared.uBurst.value * 0.35;
    orbUniforms.uFreq.value = cur.freq;
    orbUniforms.uSpikes.value = cur.spikes + shared.uBurst.value * 0.25;
    const orbS = ORB_R * (1 + (cur.s - 1) * 0.55) * (1 + Math.sin(time * 0.6) * 0.012);
    orb.scale.setScalar(orbS);
    orb.position.y = ORB_Y + Math.sin(time * 0.5) * 0.05;
    s.spin = smooth(s.spin, 0, dt, 2.2);
    orbHi.rotation.y = orbLo.rotation.y += dt * (0.12 + s.spin) * speed + (s.tYaw - s.yaw) * 0.02;
    wire.rotation.y -= dt * 0.05; wire.rotation.z += dt * 0.03;
    wire.material.color.copy(cur.b);
    edgeA.color.copy(cur.a); edgeB.color.copy(cur.b);
    hazes.forEach(h => { h.material.rotation += dt * h.userData.rate * speed; h.material.color.copy(cur.a).lerp(cur.b, h.userData.mix).multiplyScalar(0.012 + shared.uBurst.value * 0.05); });
    pUni.uSpin.value += dt * cur.flow * 0.35 * speed;

    // panels: staged reveal, focus, pointer glow, ripples
    const hoverTarget = coarse ? ptrs.size > 0 : true;
    panels.forEach((p, i) => {
      const u = p.userData.u;
      const order = Math.min(i, N - i);
      u.uReveal.value = reduceMotion ? 1 : easeOut((since - 0.25 - order * 0.14) / 1.3);
      const focusT = s.mode === 'over' ? (i === s.wall ? 1 : 0.82) : (i === s.wall ? 1 : 0.32);
      u.uFocus.value = smooth(u.uFocus.value, focusT, dt, 4);
      // comes out of the wall on opening; the wall you face stands a little further forward
      const out = (u.uReveal.value - 1) * 1.25 + (u.uFocus.value - 0.82) * 0.3;
      p.position.copy(p.userData.base).addScaledVector(p.userData.n, out);
      stepCount(p, dt);
      const isHover = hoverTarget && hoverPanel === p;
      u.uHover.value = smooth(u.uHover.value, isHover ? 1 : 0, dt, 7);
      const sel = s.mode === 'zone' && s.zone && s.zoneWall === i;
      if (isHover && hoverZone) zoneUv(u, hoverZone); else if (sel) zoneUv(u, s.zone);
      u.uZoneAmt.value = smooth(u.uZoneAmt.value, (isHover && hoverZone) || sel ? 1 : 0, dt, 9);
      const lifted = isHover && hoverZone && hoverZone.d && !hoverZone.noLift ? hoverZone : sel && s.zone.d && !s.zone.noLift ? s.zone : null;
      if (lifted) u.uLift.value.set(lifted.x / TW, 1 - (lifted.y + lifted.h) / TH, (lifted.x + lifted.w) / TW, 1 - lifted.y / TH);
      u.uLiftAmt.value = smooth(u.uLiftAmt.value, lifted ? 1 : 0, dt, 9);
      if (u.uSheen.value < 1) u.uSheen.value = Math.min(1, u.uSheen.value + dt / 1.1);
      if (u.uRip.value.z >= 0) { u.uRip.value.z += dt; if (u.uRip.value.z > 2) u.uRip.value.z = -1; }
    });
    // Trading arrival: candles grow out one by one, then the real trades light up in order
    if (arrival.t < 1) arrival.t = Math.min(1, arrival.t + dt / 4.2);
    barUni.uGrow.value = Math.min(1, arrival.t / 0.62);
    lightUni.uShow.value = clamp((arrival.t - 0.58) / 0.42, 0, 1);
    // career plates rise from the floor when the path is in front of you, and step aside for the one being read
    const facingPath = Math.abs(shortest(s.yaw + WALL_PATH * STEP)) < STEP * 0.72;
    plates.forEach((p, i) => {
      const m = p.userData, u = m.u;
      const want = s.mode === 'plate' ? (s.plate === i ? 1 : 0) : (facingPath && (s.mode === 'over') ? 1 : 0);
      m.rise = reduceMotion ? want : smooth(m.rise, want, dt, 3.2 - i * 0.25);
      p.position.y = m.y - (1 - m.rise) * (m.y + PLATE.h * m.k / 2 + 0.2);
      p.visible = m.rise > 0.01;
      u.uReveal.value = 1; u.uFocus.value = 1;
      u.uHover.value = smooth(u.uHover.value, hoverPanel === p ? 1 : 0, dt, 7);
      if (u.uSheen.value < 1) u.uSheen.value = Math.min(1, u.uSheen.value + dt / 1.1);
      if (u.uRip.value.z >= 0) { u.uRip.value.z += dt; if (u.uRip.value.z > 2) u.uRip.value.z = -1; }
      const lit = s.plate === i ? 1 : hoverPanel === p ? 0.7 : 0;
      floorUni.uMiles.value[i].z = lit;
      const ball = spheres[i], bu = ball.material.uniforms.uOn;
      bu.value = smooth(bu.value, lit, dt, 8);
      ball.position.y = ball.userData.base + Math.sin(time * 1.1 + ball.userData.phase) * 0.05;
      ball.scale.setScalar(1 + bu.value * 0.18);
    });
    floorUni.uRings.value.forEach(r => { if (r.z >= 0) { r.z += dt; if (r.z > 2.6) r.z = -1; } });

    // hover is resolved once per frame, however many pointer events arrived
    if (hoverDirty) {
      hoverDirty = false;
      const h = pick(hx, hy);
      hoverPanel = h.panel || null; hoverZone = h.zone || null;
      if (hoverPanel) hoverPanel.userData.u.uPtr.value.copy(h.uv);
      const link = !!(h.zone && h.zone.href), active = !!(h.zone || h.orb || h.plate != null || (h.panel && s.mode === 'over'));
      ui.classList.toggle('is-link', active || h.plate != null);
      if (!coarse && !dragging) setCursor(active, link ? '↗' : active ? L().view : '');
      else if (!coarse) setCursor(false, '');
    }

    // mirror pass: skipped when the floor is off-screen (zoomed in on a wall), and throttled on the lowest tiers
    scene.updateMatrixWorld();
    frameNo++;
    const below = rad(s.fov) / 2 - s.pitch, camY = camera.position.y;
    const floorSeen = s.walking || s.mode === 'plate' || (below > 0 && camY / Math.tan(below) < dist + 0.4);
    if (floorSeen && (!mirrorFresh || frameNo % TIERS[tier].every === 0)) { renderMirror(); mirrorFresh = true; }
    if (!floorSeen) mirrorFresh = false;
    renderer.render(scene, camera);
  });

  on(cv, 'webglcontextlost', e => { e.preventDefault(); closeVR(); });

  // curtain up
  requestAnimationFrame(() => { if (!ui) return; q('load').classList.add('is-done'); ui.classList.add('is-ready'); moveInd(s.wall); });
  const walkHintTimer = setTimeout(() => q('walk').classList.add('is-off'), 5000);  // always gone after 5 seconds
  applyMode();

  function dispose() {
    live.alive = false;
    clearInterval(chartTimer); clearInterval(tickTimer); clearTimeout(hintTimer); clearTimeout(walkHintTimer); if (pendingTap) clearTimeout(pendingTap.timer);
    ro.disconnect();
    renderer.setAnimationLoop(null);
    setCursor(false, '');
    disposables.forEach(d => d.dispose && d.dispose());
    const gl = renderer.getContext();
    renderer.dispose();
    const lose = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    cv.remove();
  }
  return { dispose };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
else mountButton();
