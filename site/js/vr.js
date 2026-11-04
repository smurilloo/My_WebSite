// VR room add-on (optional, self-contained).
// Adds a "VR" button (bottom right) that opens a virtual octagonal room: every section of the page is
// rendered on its own wall, using the live text of the page (so it follows the ES/EN switch and live data).
// Look around: mouse drag / touch drag / phone gyroscope. Zoom: wheel / pinch. Real headsets via WebXR when available.
//
// To remove this feature: delete js/vr.js, css/vr.css and the two tags that load them in index.html.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TAU = Math.PI * 2, rad = d => d * Math.PI / 180, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const coarse = matchMedia('(pointer: coarse)').matches;

// ---------- UI strings ----------
const UI = {
  es: {
    btn: 'Ver el sitio en VR', close: 'Salir', gyro: 'Giroscopio', overview: 'Vista general', focus: 'Enfocar', headset: 'Gafas VR',
    loading: 'Construyendo la sala…', fail: 'No se pudo iniciar WebGL en este dispositivo.',
    hintDesk: 'Arrastra para mirar · rueda para acercar · doble clic para enfocar · ← → para cambiar de pared',
    hintTouch: 'Mueve el teléfono o arrastra para mirar · pellizca para acercar · doble toque para enfocar',
    walls: ['Inicio', 'Servicios', 'Trading', 'Estrategias', 'Pipeline', 'Trayectoria', 'Stack', 'Contacto'],
    pipeline: 'Cómo opera', strategies: 'Estrategias', education: 'Formación', live: 'Operativa real',
  },
  en: {
    btn: 'View the site in VR', close: 'Exit', gyro: 'Gyroscope', overview: 'Overview', focus: 'Focus', headset: 'VR headset',
    loading: 'Building the room…', fail: 'WebGL could not start on this device.',
    hintDesk: 'Drag to look around · wheel to zoom · double-click to focus · ← → to change wall',
    hintTouch: 'Move your phone or drag to look around · pinch to zoom · double-tap to focus',
    walls: ['Home', 'Services', 'Trading', 'Strategies', 'Pipeline', 'Experience', 'Stack', 'Contact'],
    pipeline: 'How it runs', strategies: 'Strategies', education: 'Education', live: 'Live trading',
  },
};
const lang = () => (document.documentElement.lang === 'es' ? 'es' : 'en');
const L = () => UI[lang()];

// ---------- Room constants ----------
const N = 8;                 // walls
const A = 8;                 // apothem: distance from the centre to each wall
const PW = 6.3, PH = 3.94;   // wall panel size (metres), ratio 1.6
const EYE = 2.2, HEIGHT = 4.8;
const TW = 2048, TH = 1280;  // logical texture size (drawn at this size, rasterised at `scale`)

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
  g.save(); path(g, x, y, w, h, r); g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = stroke; g.stroke(); g.restore();
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
function heading(g, idx, title, intro) {
  mono(g, idx, 70, 62, 200, { size: 26, color: C.accent });
  text(g, title, 64, 96, 900, { size: 124, weight: 500, spacing: -4 });
  if (intro) text(g, intro, 1010, 108, 970, { size: 29, min: 21, color: C.muted, maxH: 150 });
}
function frame(g) { // outer wall panel
  glass(g, 20, 20, TW - 40, TH - 40, 28, 'rgba(6,8,16,0.84)', 'rgba(124,247,212,0.32)');
  g.save(); g.strokeStyle = 'rgba(139,124,255,0.35)'; g.lineWidth = 2; path(g, 32, 32, TW - 64, TH - 64, 22); g.stroke(); g.restore();
}

// ---------- Wall painters (read the live text of the page) ----------
const WALLS = [
  function hero(g) {
    mono(g, txt($('.hero .eyebrow')), 90, 92, 1500, { size: 27, color: C.muted });
    const tk = $('#tickPrice');
    if (tk && txt(tk) !== '—') {
      const d = $('#tickDelta');
      mono(g, 'BTC/USDT  ' + txt(tk), 1000, 92, 958, { size: 27, align: 'right', color: C.fg });
      mono(g, txt(d), 1000, 134, 958, { size: 24, align: 'right', color: d.classList.contains('down') ? C.down : C.up });
    }
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
    mono(g, txt($('.scroll-cue span')), 90, 1190, 800, { size: 22, color: C.accent });
  },

  function services(g) {
    heading(g, '01', txt($('#services .section__title')), txt($('#services .section__intro')));
    const cw = 640, ch = 450, gx = 33, x0 = 70, y0 = 290;
    $$('#services .card').slice(0, 6).forEach((c, i) => {
      const x = x0 + (i % 3) * (cw + gx), y = y0 + Math.floor(i / 3) * (ch + 22);
      glass(g, x, y, cw, ch);
      mono(g, txt($('.card__num', c)), x + 30, y + 24, 200, { size: 22, color: C.accent });
      const th = text(g, txt($('h3', c)), x + 30, y + 62, cw - 60, { size: 40, min: 28, weight: 500, lh: 1.1, maxH: 100, spacing: -1 });
      text(g, txt($('p', c)), x + 30, y + 74 + Math.max(th, 48) + 8, cw - 60, { size: 26, min: 19, color: C.muted, maxH: ch - 74 - Math.max(th, 48) - 8 - 74 });
      let tx = x + 30;
      $$('.tags li', c).forEach(t => { const w = pill(g, txt(t), tx, y + ch - 62, { size: 17 }); tx += w + 8; });
    });
  },

  function trading(g, hot, ctxInfo) {
    heading(g, '02', txt($('#trading .section__title')), txt($('#trading .section__intro')));
    // live chart (copied from the page canvas)
    const cx = 70, cy = 300, cw = 930, chh = 410;
    glass(g, cx, cy, cw, chh);
    mono(g, txt($('.chart__head span')), cx + 24, cy + 18, 640, { size: 19, color: C.muted });
    mono(g, 'LIVE', cx + cw - 24 - 120, cy + 18, 120, { size: 19, color: C.up, align: 'right' });
    const cv = $('#candles');
    if (cv && cv.width > 10 && cv.height > 10) {
      try { g.drawImage(cv, 0, 0, cv.width, cv.height, cx + 12, cy + 56, cw - 24, chh - 68); } catch (e) { /* tainted or empty */ }
    }
    // stats 2x2
    const sw = 455, sh = 242;
    $$('#trading .stat').slice(0, 4).forEach((s, i) => {
      const x = cx + (i % 2) * (sw + 20), y = cy + chh + 18 + Math.floor(i / 2) * (sh + 16);
      glass(g, x, y, sw, sh);
      mono(g, num($('b', s)), x + 24, y + 24, sw - 48, { size: 58, color: C.accent, spacing: -2, upper: false });
      text(g, txt($('span', s)), x + 24, y + 104, sw - 48, { size: 22, min: 16, color: C.muted, maxH: sh - 116 });
    });
    // real account
    const rx = 1040, rw = 938;
    const rh = $('.real__head');
    glass(g, rx, 300, rw, 910, 18, 'rgba(8,10,20,0.78)', 'rgba(62,240,168,0.35)');
    const hs = rh ? $$(':scope > span', rh) : [];
    mono(g, txt(hs[0]), rx + 28, 322, rw - 56, { size: 22, color: C.up });
    text(g, txt(hs[1]), rx + 28, 362, rw - 56, { size: 21, min: 16, color: C.muted, maxH: 62 });
    $$('.real .strat').slice(0, 4).forEach((s, i) => {
      const y = 450 + i * 188;
      g.fillStyle = C.line; g.fillRect(rx + 28, y - 8, rw - 56, 1.5);
      mono(g, txt($('.strat__id', s)), rx + 28, y + 14, 130, { size: 22, color: C.a2 });
      text(g, txt($('h4', s)), rx + 28, y + 50, 380, { size: 29, weight: 500, min: 21, maxH: 70, lh: 1.1 });
      mono(g, num($('b', s)), rx + 420, y + 16, 270, { size: 56, color: txt($('b', s)).startsWith('−') ? C.down : C.accent, spacing: -2, upper: false, align: 'right' });
      mono(g, txt($('.strat__unit', s)), rx + 700, y + 38, 210, { size: 15, color: C.muted, maxH: 40 });
      mono(g, txt($('.strat__meta', s)), rx + 28, y + 116, rw - 56, { size: 18, color: C.muted, upper: false });
    });
  },

  function strategies(g) {
    heading(g, '02', L().strategies, txt($('#trading > .backtest-date')));
    const cw = 640, ch = 830, gx = 33, x0 = 70, y0 = 290;
    $$('#trading > .strats > .strat').slice(0, 3).forEach((s, i) => {
      const x = x0 + i * (cw + gx);
      glass(g, x, y0, cw, ch);
      mono(g, txt($('.strat__id', s)), x + 30, y0 + 26, 100, { size: 26, color: C.a2 });
      text(g, txt($('h4', s)), x + 30, y0 + 66, cw - 60, { size: 38, weight: 500, min: 28, maxH: 100, lh: 1.1, spacing: -1 });
      mono(g, num($('b', s)), x + 30, y0 + 170, 300, { size: 110, color: C.accent, spacing: -4, upper: false });
      mono(g, txt($('.strat__unit', s)), x + 30, y0 + 300, cw - 60, { size: 19, color: C.muted });
      let y = y0 + 360;
      $$('.strat__meta', s).forEach(m => {
        const lab = $('.strat__lab', m), lt = txt(lab), rest = txt(m).replace(lt, '').trim();
        g.fillStyle = C.line; g.fillRect(x + 30, y - 10, cw - 60, 1.5);
        mono(g, lt, x + 30, y + 4, cw - 60, { size: 19, color: C.fg });
        text(g, rest, x + 30, y + 40, cw - 60, { size: 24, min: 18, color: C.muted, maxH: 100 });
        y += 150;
      });
    });
    text(g, txt($('#trading > .disclaimer')), 70, 1138, TW - 140, { size: 20, min: 14, color: C.muted, maxH: 86, lh: 1.25 });
  },

  function pipeline(g) {
    heading(g, '02', L().pipeline, '');
    const cw = 372, gx = 28, x0 = 70, y0 = 290, ch = 790;
    $$('#trading .pipeline .step').slice(0, 5).forEach((s, i) => {
      const x = x0 + i * (cw + gx);
      glass(g, x, y0, cw, ch);
      g.fillStyle = C.accent; g.fillRect(x + 24, y0 + 1, cw - 48, 3);
      mono(g, txt($('span', s)), x + 26, y0 + 26, 100, { size: 24, color: C.accent });
      const th = text(g, txt($('h4', s)), x + 26, y0 + 64, cw - 52, { size: 38, min: 28, weight: 500, lh: 1.1, maxH: 90, spacing: -1 });
      text(g, txt($('p', s)), x + 26, y0 + 64 + Math.max(th, 44) + 18, cw - 52, { size: 24, min: 17, color: C.muted, maxH: ch - 64 - Math.max(th, 44) - 40 });
    });
    text(g, txt($('#trading > .disclaimer')), 70, 1110, TW - 140, { size: 20, min: 14, color: C.muted, maxH: 100, lh: 1.25 });
  },

  function experience(g) {
    heading(g, '03', txt($('#experience .section__title')), '');
    const jobs = $$('#experience .job').filter(j => !$('h3[data-i18n^="edu."]', j));
    const cw = TW - 140, ch = 176, x0 = 70, y0 = 280;
    jobs.slice(0, 5).forEach((j, i) => {
      const x = x0, y = y0 + i * (ch + 12);
      glass(g, x, y, cw, ch);
      mono(g, txt($('.job__date', j)), x + 28, y + 24, 250, { size: 22, color: C.accent });
      text(g, txt($('h3', j)), x + 290, y + 12, 800, { size: 46, min: 32, weight: 500, lh: 1.05, maxH: 56, spacing: -1 });
      mono(g, txt($('.job__role', j)), x + 1000, y + 26, cw - 1028, { size: 20, color: C.fg, maxH: 30, upper: false, align: 'right' });
      text(g, txt($('p:last-child', j)), x + 28, y + 76, cw - 56, { size: 27, min: 19, color: C.muted, maxH: ch - 86, lh: 1.22 });
    });
  },

  function stack(g) {
    heading(g, '04', txt($('#stack .section__title')), '');
    const rows = $$('#stack .marquee__row');
    let y = 270;
    rows.forEach((r, i) => {
      const t = txt($('span', r)).replace(/[ ·]+$/, '');
      const h = text(g, t, 70, y, TW - 140, { size: 56, min: 40, weight: 500, lh: 1.15, maxH: 140, spacing: -1, color: i ? C.a2 : C.fg });
      y += h + 22;
    });
    let bx = 70, by = y + 14;
    $$('#stack .badge').forEach(b => {
      const tag = txt($('span', b)), name = txt(b).replace(tag, '').trim();
      g.font = `400 28px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '0px';
      const w = g.measureText(name).width + 130;
      if (bx + w > TW - 70) { bx = 70; by += 76; }
      glass(g, bx, by, w, 60, 30);
      mono(g, tag, bx + 22, by + 20, 80, { size: 15, color: C.accent });
      text(g, name, bx + 100, by + 14, w - 110, { size: 28, color: C.fg });
      bx += w + 14;
    });
    // education
    const ey = by + 110;
    mono(g, L().education, 70, ey, 600, { size: 24, color: C.accent });
    $$('#experience .job').filter(j => $('h3[data-i18n^="edu."]', j)).slice(0, 2).forEach((j, i) => {
      const x = 70 + i * 968, cw = 940, h = Math.min(300, TH - 56 - (ey + 44));
      glass(g, x, ey + 44, cw, h);
      mono(g, txt($('.job__date', j)), x + 28, ey + 66, 300, { size: 21, color: C.accent });
      text(g, txt($('h3', j)), x + 28, ey + 96, cw - 56, { size: 36, min: 26, weight: 500, lh: 1.1, maxH: 50, spacing: -1 });
      mono(g, txt($('.job__role', j)), x + 28, ey + 150, cw - 56, { size: 19, upper: false, maxH: 28 });
      text(g, txt($('p:last-child', j)), x + 28, ey + 192, cw - 56, { size: 23, min: 16, color: C.muted, maxH: h - 170 });
    });
  },

  function contact(g, hot) {
    mono(g, '05', 90, 90, 200, { size: 26, color: C.accent });
    mono(g, txt($('#contact .eyebrow')), 90, 140, 1500, { size: 28, color: C.muted });
    const ls = $$('.contact__big .split');
    let y = 220;
    ls.forEach(el => {
      const t = txt(el), outline = el.classList.contains('outline');
      g.font = `500 230px ${SANS}`; if ('letterSpacing' in g) g.letterSpacing = '-12px'; g.textBaseline = 'top'; g.textAlign = 'left';
      g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = outline ? 0 : 8;
      if (outline) { g.lineWidth = 3; g.strokeStyle = C.fg; g.strokeText(t, 84, y); } else { g.fillStyle = C.fg; g.fillText(t, 84, y); }
      g.restore(); y += 215;
    });
    hot.push({ x: 60, y: 200, w: 1100, h: 450, href: 'mailto:smurilloo@unal.edu.co' });
    let x = 90; const py = 800;
    $$('.contact__links a').forEach(a => {
      g.font = `400 28px ${MONO}`; if ('letterSpacing' in g) g.letterSpacing = '1px';
      const label = txt(a), w = g.measureText(label).width + 70, h = 84;
      glass(g, x, py, w, h, 42, 'rgba(8,10,20,0.78)', 'rgba(124,247,212,0.55)');
      g.fillStyle = C.fg; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(label, x + 35, py + h / 2 + 2);
      hot.push({ x, y: py, w, h, href: a.getAttribute('href') });
      x += w + 22;
      if (x > TW - 400) { x = 90; }
    });
    mono(g, `© ${new Date().getFullYear()} Samuel Murillo Ospina`, 90, 1180, 900, { size: 20, color: C.muted });
    const v = $('#visits');
    if (v && !v.hidden) mono(g, txt(v), 1000, 1180, 958, { size: 20, color: C.muted, align: 'right' });
  },
];

// ---------- State ----------
let THREE = null, ui = null, room = null;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

// ---------- Launcher button ----------
function mountButton() {
  const b = el('button', 'vr-btn mono', `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5h18a1 1 0 0 1 1 1V15a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-1.7-1l-.9-1.6a1.4 1.4 0 0 0-2.4 0L10.9 16a2 2 0 0 1-1.7 1H4a2 2 0 0 1-2-2V9.5a1 1 0 0 1 1-1z"/></svg><span>VR</span>`);
  b.type = 'button';
  b.setAttribute('aria-label', L().btn);
  b.setAttribute('data-cursor', 'vr');
  b.addEventListener('click', openVR);
  document.body.appendChild(b);
  new MutationObserver(() => b.setAttribute('aria-label', L().btn)).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

// ---------- Open / close ----------
async function openVR() {
  if (room || ui) return;
  // iOS only grants motion access from inside a user gesture, so ask before any await
  let motion = null;
  if (coarse && 'DeviceOrientationEvent' in window) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { motion = (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch (e) { motion = false; }
    } else motion = true;
  }
  const t = L();
  ui = el('div', 'vr');
  ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-modal', 'true'); ui.setAttribute('aria-label', 'VR');
  ui.innerHTML = `
    <div class="vr__top mono">
      <span class="vr__title">VR · <b data-vr="wall"></b></span>
      <span class="vr__tools">
        <button class="vr__tool mono" type="button" data-vr="gyro" aria-pressed="false" hidden>${t.gyro}</button>
        <button class="vr__tool mono" type="button" data-vr="xr" hidden>${t.headset}</button>
        <button class="vr__tool mono" type="button" data-vr="zoom">${t.overview}</button>
        <button class="vr__tool mono" type="button" data-vr="close">✕ ${t.close}</button>
      </span>
    </div>
    <p class="vr__hint mono" data-vr="hint">${coarse ? t.hintTouch : t.hintDesk}</p>
    <nav class="vr__nav mono">${t.walls.map((w, i) => `<button type="button" data-wall="${i}">${String(i + 1).padStart(2, '0')}<span> ${w}</span></button>`).join('')}</nav>
    <div class="vr__load mono" data-vr="load">${t.loading}</div>`;
  document.body.appendChild(ui);
  document.body.classList.add('vr-open');
  dispatchEvent(new Event('site:sleep')); // pause the page's own WebGL scene while inside the room
  requestAnimationFrame(() => ui.classList.add('is-open'));
  $('[data-vr="close"]', ui).addEventListener('click', closeVR);
  $('[data-vr="close"]', ui).focus({ preventScroll: true });

  try {
    THREE = THREE || await import('./vendor/three.module.js');
    if (!ui) return;
    room = await buildRoom(motion);
  } catch (err) {
    console.error('VR room failed', err);
    const ld = $('[data-vr="load"]', ui); if (ld) ld.textContent = L().fail;
  }
}

function closeVR() {
  if (room) { room.dispose(); room = null; }
  if (ui) {
    const u = ui; ui = null;
    u.classList.remove('is-open');
    setTimeout(() => u.remove(), 600);
  }
  document.body.classList.remove('vr-open');
  dispatchEvent(new Event('site:wake'));
  const b = $('.vr-btn'); if (b) b.focus({ preventScroll: true });
}

// ---------- Room ----------
async function buildRoom(motionAllowed) {
  const T = THREE;
  const cv = el('canvas');
  ui.insertBefore(cv, ui.firstChild);
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { cv.remove(); throw e; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x05060a, 1);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x05060a, 0.018);
  const camera = new T.PerspectiveCamera(70, 1, 0.05, 80);
  const rig = new T.Group(); rig.add(camera); scene.add(rig);
  camera.position.y = EYE;

  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // --- shell: octagonal walls, floor, ceiling
  const R = A / Math.cos(Math.PI / N);
  const wallTex = (() => {
    const c = el('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#07080f'); gr.addColorStop(0.55, '#0a0c18'); gr.addColorStop(1, '#161236');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = keep(new T.CanvasTexture(c)); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  const shell = new T.Mesh(keep(new T.CylinderGeometry(R, R, HEIGHT, N, 1, true)), keep(new T.MeshBasicMaterial({ map: wallTex, side: T.BackSide })));
  shell.position.y = HEIGHT / 2; shell.rotation.y = Math.PI / N; scene.add(shell);

  const floorTex = (() => {
    const c = el('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
    const gr = g.createRadialGradient(512, 512, 40, 512, 512, 512);
    gr.addColorStop(0, '#1a1440'); gr.addColorStop(0.55, '#0b0b1c'); gr.addColorStop(1, '#05060a');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(124,247,212,0.10)'; g.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) { const p = i * 64 + 32; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 1024); g.moveTo(0, p); g.lineTo(1024, p); g.stroke(); }
    g.strokeStyle = 'rgba(139,124,255,0.28)';
    for (const r of [120, 250, 380, 500]) { g.beginPath(); g.arc(512, 512, r, 0, TAU); g.stroke(); }
    const t = keep(new T.CanvasTexture(c)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const floor = new T.Mesh(keep(new T.CircleGeometry(R, 64)), keep(new T.MeshBasicMaterial({ map: floorTex })));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = new T.Mesh(keep(new T.CircleGeometry(R, 64)), keep(new T.MeshBasicMaterial({ color: 0x07080f })));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = HEIGHT; scene.add(ceil);

  // --- light strips along the floor / ceiling edge and at every corner
  const accentMat = keep(new T.MeshBasicMaterial({ color: 0x7cf7d4, transparent: true, opacity: 0.85 }));
  const violetMat = keep(new T.MeshBasicMaterial({ color: 0x8b7cff, transparent: true, opacity: 0.8 }));
  const ringGeo = keep(new T.TorusGeometry(R - 0.02, 0.025, 6, N));
  [[0.03, accentMat], [HEIGHT - 0.03, violetMat]].forEach(([y, m]) => {
    const r = new T.Mesh(ringGeo, m); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / N; r.position.y = y; scene.add(r);
  });
  const barGeo = keep(new T.BoxGeometry(0.05, HEIGHT, 0.05));
  for (let k = 0; k < N; k++) {
    const a = (k + 0.5) * TAU / N;
    const b = new T.Mesh(barGeo, k % 2 ? violetMat : accentMat);
    b.position.set(-Math.sin(a) * (R - 0.03), HEIGHT / 2, -Math.cos(a) * (R - 0.03)); scene.add(b);
  }

  // --- floating core + particles (same atmosphere as the page background)
  const core = new T.Mesh(keep(new T.IcosahedronGeometry(0.55, 2)), keep(new T.MeshBasicMaterial({ color: 0x8b7cff, wireframe: true, transparent: true, opacity: 0.7 })));
  core.position.set(0, HEIGHT - 0.9, 0); scene.add(core);
  const core2 = new T.Mesh(keep(new T.IcosahedronGeometry(0.3, 1)), keep(new T.MeshBasicMaterial({ color: 0x7cf7d4, wireframe: true, transparent: true, opacity: 0.9 })));
  core2.position.copy(core.position); scene.add(core2);
  const pts = (() => {
    const n = 700, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * (R - 0.6), th = Math.random() * TAU;
      a[i * 3] = Math.cos(th) * r; a[i * 3 + 1] = 0.2 + Math.random() * (HEIGHT - 0.4); a[i * 3 + 2] = Math.sin(th) * r;
    }
    const geo = keep(new T.BufferGeometry()); geo.setAttribute('position', new T.BufferAttribute(a, 3));
    const dc = el('canvas'); dc.width = dc.height = 32; const dg = dc.getContext('2d');
    const gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
    const dot = keep(new T.CanvasTexture(dc));
    return new T.Points(geo, keep(new T.PointsMaterial({ color: 0x7cf7d4, size: 0.06, map: dot, transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending })));
  })();
  scene.add(pts);

  // --- wall panels (text drawn on canvases from the live page)
  await (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve());
  const scale = (coarse || innerWidth < 800) ? 0.75 : 1;
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const panels = [];
  const panelGeo = keep(new T.PlaneGeometry(PW, PH));
  for (let i = 0; i < N; i++) {
    const c = el('canvas'); c.width = TW * scale; c.height = TH * scale;
    const g = c.getContext('2d'); g.scale(scale, scale);
    const hot = [];
    frame(g);
    try { WALLS[i](g, hot); } catch (e) { console.error('VR wall', i, e); }
    const tex = keep(new T.CanvasTexture(c)); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = maxAniso;
    const mesh = new T.Mesh(panelGeo, keep(new T.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false })));
    const a = i * TAU / N;
    mesh.position.set(-Math.sin(a) * (A - 0.02), EYE, -Math.cos(a) * (A - 0.02));
    mesh.rotation.y = a; mesh.userData = { wall: i, hot };
    scene.add(mesh); panels.push(mesh);
    await new Promise(r => setTimeout(r));
  }

  // --- view state
  const s = {
    yaw: 0, pitch: 0, fov: 70, tYaw: 0, tPitch: 0, tFov: 70,
    gyro: false, focus: true, wall: 0, qd: new T.Quaternion(), hasDev: false, hasEv: false,
  };
  const focusFov = () => {
    const asp = innerWidth / innerHeight;
    if (asp < 1) return 34;
    const hw = 2 * Math.atan((PW / 2) / A / 0.94);                       // horizontal fov that fits the panel width
    const vw = 2 * Math.atan(Math.tan(hw / 2) / asp);                    // ...as a vertical fov
    const vh = 2 * Math.atan((PH / 2) / A / 0.9);                        // vertical fov that fits the panel height
    return clamp(Math.max(vw, vh) * 180 / Math.PI, 18, 80);
  };
  const OVERVIEW = 78;

  const facing = () => {
    const d = new T.Vector3(); camera.getWorldDirection(d);
    return Math.atan2(-d.x, -d.z);
  };
  const shortest = a => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };
  function jump(i, keepFov) {
    i = (i + N) % N;
    const delta = shortest(i * TAU / N - facing());
    s.tYaw += delta; s.tPitch = 0;
    if (!keepFov) { s.focus = true; s.tFov = focusFov(); setZoomLabel(); }
    hideHint();
  }
  function setZoomLabel() { const b = $('[data-vr="zoom"]', ui); if (b) b.textContent = s.focus ? L().overview : L().focus; }
  const hintEl = $('[data-vr="hint"]', ui);
  let hintTimer = setTimeout(() => hintEl && hintEl.classList.add('is-off'), 9000);
  function hideHint() { clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl && hintEl.classList.add('is-off'), 2500); }

  // --- gyroscope (phones)
  const gyroBtn = $('[data-vr="gyro"]', ui);
  const zee = new T.Vector3(0, 0, 1), eul = new T.Euler(), q0 = new T.Quaternion(), q1 = new T.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  const orient = () => rad(((screen.orientation && screen.orientation.angle) || window.orientation || 0));
  function onDev(e) {
    if (e.beta == null && e.alpha == null) return;
    s.hasEv = true;
    eul.set(rad(e.beta || 0), rad(e.alpha || 0), -rad(e.gamma || 0), 'YXZ');
    s.qd.setFromEuler(eul).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient()));
    if (!s.hasDev) { // first sample: keep looking where we were looking
      s.hasDev = true;
      const f = facing(), d = new T.Vector3(0, 0, -1).applyQuaternion(s.qd);
      const dy = Math.atan2(-d.x, -d.z);
      s.tYaw = s.yaw = f - dy; camera.quaternion.copy(s.qd);
    }
  }
  function setGyro(on) {
    s.gyro = on;
    gyroBtn.setAttribute('aria-pressed', String(on));
    if (on) { s.hasDev = false; addEventListener('deviceorientation', onDev); }
    else {
      removeEventListener('deviceorientation', onDev);
      const f = facing(); s.tYaw = s.yaw = f; s.tPitch = s.pitch = 0;
    }
  }
  if (coarse && motionAllowed) { gyroBtn.hidden = false; gyroBtn.addEventListener('click', () => setGyro(!s.gyro)); setGyro(true); }

  // --- headset (WebXR), only when the browser reports support
  const xrBtn = $('[data-vr="xr"]', ui);
  let xrSession = null;
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => {
      if (!ok || !ui) return;
      renderer.xr.enabled = true; xrBtn.hidden = false;
      xrBtn.addEventListener('click', async () => {
        try {
          if (xrSession) { await xrSession.end(); return; }
          xrSession = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
          xrSession.addEventListener('end', () => { xrSession = null; });
          await renderer.xr.setSession(xrSession);
        } catch (e) { console.warn('XR', e); }
      });
    }).catch(() => {});
  }

  // --- resize
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (s.focus) s.tFov = focusFov();
  }
  addEventListener('resize', resize); resize();
  s.fov = s.tFov = OVERVIEW; s.focus = true; s.tFov = focusFov();

  // --- input
  const ray = new T.Raycaster(), v2 = new T.Vector2();
  function pick(cx, cy) {
    v2.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = ray.intersectObjects(panels, false)[0];
    if (!hit || !hit.uv) return null;
    const px = hit.uv.x * TW, py = (1 - hit.uv.y) * TH;
    return hit.object.userData.hot.find(h => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) || null;
  }
  const ptrs = new Map();
  let moved = 0, downAt = 0, pinch0 = 0, fov0 = 0, lastTap = 0, lastX = 0, lastY = 0;
  const pdist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); disposables.push({ dispose: () => t.removeEventListener(ev, fn, o) }); };

  on(cv, 'pointerdown', e => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { moved = 0; downAt = performance.now(); lastX = e.clientX; lastY = e.clientY; }
    if (ptrs.size === 2) { pinch0 = pdist(); fov0 = s.tFov; moved = 99; }
    ui.classList.add('is-drag'); hideHint();
  });
  on(cv, 'pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { ui.classList.toggle('is-link', !!pick(e.clientX, e.clientY)); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { s.tFov = clamp(fov0 * pinch0 / pdist(), 14, 85); s.focus = false; setZoomLabel(); return; }
    moved += Math.abs(dx) + Math.abs(dy);
    const k = rad(s.fov) / innerHeight;       // radians per pixel: the scene follows the finger/mouse
    s.tYaw += dx * k;
    if (!s.gyro) s.tPitch = clamp(s.tPitch + dy * k, -rad(65), rad(65));
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    const wasOne = ptrs.size === 1; ptrs.delete(e.pointerId);
    if (ptrs.size === 0) ui.classList.remove('is-drag');
    if (wasOne && e.type === 'pointerup' && moved < 8 && performance.now() - downAt < 500) {
      const h = pick(e.clientX, e.clientY);
      if (h) { if (h.href.startsWith('mailto:')) location.href = h.href; else window.open(h.href, '_blank', 'noopener'); return; }
      const now = performance.now();
      if (now - lastTap < 350) { toggleZoom(); lastTap = 0; } else lastTap = now;
    }
  };
  on(cv, 'pointerup', up); on(cv, 'pointercancel', up);
  on(cv, 'wheel', e => { e.preventDefault(); s.tFov = clamp(s.tFov * Math.exp(e.deltaY * 0.0012), 14, 85); s.focus = false; setZoomLabel(); hideHint(); }, { passive: false });
  function toggleZoom() {
    if (s.focus) { s.focus = false; s.tFov = OVERVIEW; s.tPitch = 0; } else { s.focus = true; s.tFov = focusFov(); }
    setZoomLabel();
  }
  on($('[data-vr="zoom"]', ui), 'click', toggleZoom);
  on(window, 'keydown', e => {
    if (e.key === 'Escape') closeVR();
    else if (e.key === 'ArrowRight' || e.key === 'd') jump(s.wall - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'a') jump(s.wall + 1);
    else if (e.key === '+' || e.key === '=') { s.tFov = clamp(s.tFov * 0.85, 14, 85); s.focus = false; setZoomLabel(); }
    else if (e.key === '-') { s.tFov = clamp(s.tFov / 0.85, 14, 85); s.focus = false; setZoomLabel(); }
  });
  const navBtns = $$('.vr__nav button', ui);
  navBtns.forEach(b => on(b, 'click', () => jump(+b.dataset.wall)));
  const wallLabel = $('[data-vr="wall"]', ui);
  function setWall(i) {
    s.wall = i; wallLabel.textContent = L().walls[i];
    navBtns.forEach((b, k) => b.classList.toggle('is-on', k === i));
  }
  setWall(0);

  // language switch while inside: rebuild the walls' text
  const lm = new MutationObserver(() => { if (room) { closeVR(); setTimeout(openVR, 700); } });
  lm.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  disposables.push({ dispose: () => lm.disconnect() });

  // --- render loop
  const clock = new T.Clock();
  const smooth = (a, b, dt, r = 9) => a + (b - a) * (1 - Math.exp(-r * dt));
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    core.rotation.y = t * 0.25; core.rotation.x = t * 0.15; core2.rotation.y = -t * 0.4; core2.rotation.z = t * 0.2;
    core.position.y = core2.position.y = HEIGHT - 0.9 + Math.sin(t * 0.8) * 0.06;
    pts.rotation.y = t * 0.012;
    if (!renderer.xr.isPresenting) {
      s.yaw = smooth(s.yaw, s.tYaw, dt); s.pitch = smooth(s.pitch, s.tPitch, dt); s.fov = smooth(s.fov, s.tFov, dt, 6);
      if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      rig.rotation.y = s.yaw;
      if (s.gyro && s.hasDev) camera.quaternion.slerp(s.qd, 1 - Math.exp(-20 * dt));
      else camera.rotation.set(s.pitch, 0, 0);
    }
    const f = facing(), w = ((Math.round(shortest(f) / (TAU / N)) % N) + N) % N;
    if (w !== s.wall) setWall(w);
    renderer.render(scene, camera);
  });
  ui.classList.add('is-ready');
  $('[data-vr="load"]', ui).classList.add('is-done');
  jump(0);
  s.yaw = s.tYaw; // start already facing wall 0

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      if (xrSession) xrSession.end().catch(() => {});
      removeEventListener('resize', resize); removeEventListener('deviceorientation', onDev);
      disposables.forEach(d => d.dispose && d.dispose());
      panels.forEach(p => { p.material.map && p.material.map.dispose(); });
      renderer.dispose(); cv.remove();
      const lose = renderer.getContext().getExtension && renderer.getContext().getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
else mountButton();
