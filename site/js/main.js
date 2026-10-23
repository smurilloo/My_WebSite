(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const body = document.body;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let asleep = false; // set by the inactivity suspension below
  const idle = () => asleep || document.hidden;

  // ---------- Split text into chars ----------
  function split(el) {
    const text = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-label', text);
    [...text].forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'char';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = c;
      s.style.transitionDelay = `${i * 0.025}s`;
      el.appendChild(s);
    });
  }
  $$('.split').forEach(split);

  // ---------- i18n ----------
  const ES = {};
  $$('[data-i18n]').forEach(el => { ES[el.dataset.i18n] = el.getAttribute('aria-label') || el.textContent; });
  // Attribute translations: data-i18n-attr="attr:key;attr:key"
  const attrPairs = el => el.dataset.i18nAttr.split(';').map(p => p.split(':'));
  $$('[data-i18n-attr]').forEach(el => attrPairs(el).forEach(([a, k]) => { ES[k] = el.getAttribute(a); }));
  ES['mail.copied'] = '¡Copiada! ✓';
  let lang = 'en';
  try { if (localStorage.getItem('lang') === 'es') lang = 'es'; } catch (e) {}

  function applyLang(l) {
    const dict = l === 'en' ? window.I18N_EN : ES;
    document.documentElement.lang = l;
    $$('[data-i18n]').forEach(el => {
      const v = dict[el.dataset.i18n];
      if (v == null) return;
      if (el.classList.contains('split')) {
        const wasIn = el.classList.contains('is-in');
        el.classList.remove('is-in');
        el.textContent = v;
        split(el);
        if (wasIn) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
      } else {
        el.textContent = v;
      }
    });
    $$('[data-i18n-attr]').forEach(el => attrPairs(el).forEach(([a, k]) => { if (dict[k] != null) el.setAttribute(a, dict[k]); }));
    $('#langToggle').classList.toggle('is-en', l === 'en');
    try { localStorage.setItem('lang', l); } catch (e) {}
  }
  $('#langToggle').addEventListener('click', () => { lang = lang === 'es' ? 'en' : 'es'; applyLang(lang); });
  applyLang(lang);

  // ---------- Reveal on scroll ----------
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      if (e.target.dataset.count != null) countUp(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });

  function startReveals() {
    $$('.split, .reveal, [data-count]').forEach((el, i) => {
      // stagger siblings inside grids
      if (el.classList.contains('reveal')) el.style.transitionDelay = `${(i % 6) * 0.07}s`;
      io.observe(el);
    });
  }

  // ---------- Count up ----------
  function countUp(el) {
    const to = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0;
    const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
    const t0 = performance.now(), dur = 1800;
    const step = now => {
      const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 4);
      el.textContent = pre + (to * e).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Loader ----------
  const loader = $('#loader'), countEl = $('#loaderCount'), barEl = $('#loaderBar');
  let progress = 0, sceneReady = false, pageReady = false;
  window.addEventListener('scene:ready', () => { sceneReady = true; });
  window.addEventListener('load', () => { pageReady = true; });
  setTimeout(() => { sceneReady = true; pageReady = true; }, 6000); // never block on a slow CDN

  (function loadTick() {
    const cap = sceneReady && pageReady ? 100 : 88;
    progress += Math.max(0.4, (cap - progress) * 0.06);
    progress = Math.min(progress, cap);
    countEl.textContent = String(Math.floor(progress)).padStart(3, '0');
    barEl.style.width = progress + '%';
    if (progress >= 100) {
      setTimeout(() => {
        loader.classList.add('is-done');
        body.classList.remove('is-loading');
        startReveals();
      }, 250);
      return;
    }
    requestAnimationFrame(loadTick);
  })();

  // ---------- Cursor ----------
  const cursor = $('#cursor'), cursorLabel = $('#cursorLabel');
  if (finePointer) {
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; });
    let following = false;
    function follow() {
      if (asleep) { following = false; return; }
      following = true;
      cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      requestAnimationFrame(follow);
    }
    follow();
    addEventListener('site:wake', () => { if (!following) follow(); });
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('a, button, [data-cursor]');
      cursor.classList.toggle('is-hover', !!t);
      cursorLabel.textContent = t && t.dataset.cursor && t.dataset.cursor.length <= 6 ? t.dataset.cursor : '';
    });
  }

  // ---------- Magnetic links ----------
  if (finePointer) {
    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
      el.style.transition = 'transform .5s cubic-bezier(.19,1,.22,1), background .4s, color .4s, border-color .4s';
    });
  }

  // ---------- Card glow follows pointer ----------
  $$('.card').forEach(card => {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  // ---------- Menu ----------
  const menuBtn = $('#menuToggle'), menu = $('#menu');
  function setMenu(open) {
    body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
  }
  menuBtn.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
  $$('.menu a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') { setMenu(false); setMail(false); } });

  // ---------- Email client picker ----------
  const mail = $('#mailpick'), mailCopy = $('#mailCopy');
  const EMAIL = 'smurilloo@unal.edu.co';
  function setMail(open) {
    body.classList.toggle('mail-open', open);
    mail.setAttribute('aria-hidden', !open);
    if (open) $('.mailpick__opt', mail).focus();
  }
  $$('a[href^="mailto:"]:not([data-mail-native])').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    setMenu(false);
    setMail(true);
  }));
  $$('.mailpick__opt[href]', mail).forEach(a => a.addEventListener('click', () => setMail(false)));
  $('#mailClose').addEventListener('click', () => setMail(false));
  mail.addEventListener('click', e => { if (e.target === mail) setMail(false); });
  mailCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(EMAIL); }
    catch (e) {
      const t = document.createElement('textarea');
      t.value = EMAIL; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
    }
    const label = $('span', mailCopy), dict = () => (lang === 'en' ? window.I18N_EN : ES);
    label.textContent = dict()['mail.copied'];
    setTimeout(() => { label.textContent = dict()['mail.copy']; }, 1800);
  });

  // ---------- Progress ----------
  const sections = $$('[data-scene]'), pNum = $('#progressNum'), pBar = $('#progressBar');
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    pBar.style.height = (max > 0 ? scrollY / max * 100 : 0) + '%';
    let idx = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < innerHeight * 0.5) idx = i; });
    pNum.textContent = String(idx).padStart(2, '0');
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Clock / year ----------
  $('#year').textContent = new Date().getFullYear();
  const clockEl = $('#clock');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setInterval(() => { if (!idle()) clockEl.textContent = `MEDELLÍN ${fmt.format(new Date())} GMT-5`; }, 1000);

  // ---------- BTC ticker (public endpoints, graceful fallback) ----------
  const tickPrice = $('#tickPrice'), tickDelta = $('#tickDelta');
  async function ticker() {
    try {
      const r = await fetch('https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES');
      const j = await r.json();
      const d = j.data[0];
      return { price: +d.lastPr, change: +d.change24h * 100 };
    } catch (e) {
      const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
      const j = await r.json();
      return { price: +j.lastPrice, change: +j.priceChangePercent };
    }
  }
  async function updateTicker() {
    try {
      const { price, change } = await ticker();
      if (!isFinite(price)) throw new Error('bad price');
      tickPrice.textContent = price.toLocaleString('en-US', { maximumFractionDigits: 1 });
      tickDelta.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      tickDelta.className = change >= 0 ? 'up' : 'down';
    } catch (e) {
      $('.ticker').style.display = 'none';
    }
  }
  updateTicker();
  setInterval(() => { if (!idle()) updateTicker(); }, 15000);

  // ---------- Live BTCUSDT 1H candlestick chart (Bitget public API) ----------
  const cv = $('#candles'), ctx = cv.getContext('2d'), chartLive = $('#chartLive');
  const CANDLES_URL = 'https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES&granularity=1H&limit=';
  const N = 72;
  let candles = [], visible = false, W = 0, H = 0, failed = false;

  async function fetchCandles(limit) {
    const r = await fetch(CANDLES_URL + limit, { cache: 'no-store' });
    const j = await r.json();
    if (j.code !== '00000' || !Array.isArray(j.data)) throw new Error('bitget');
    return j.data.map(d => ({ t: +d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4] }));
  }
  async function refreshCandles() {
    try {
      if (!candles.length) candles = await fetchCandles(N);
      else {
        // merge the latest candles: update the forming one, append when a new hour opens
        (await fetchCandles(2)).forEach(k => {
          const i = candles.findIndex(c => c.t === k.t);
          if (i >= 0) candles[i] = k;
          else if (k.t > candles[candles.length - 1].t) { candles.push(k); candles.shift(); }
        });
      }
      failed = false;
    } catch (e) {
      failed = !candles.length;
    }
    chartLive.classList.toggle('is-off', failed);
    drawChart();
  }
  refreshCandles();
  setInterval(() => { if (visible && !idle()) refreshCandles(); }, 5000);

  function resizeChart() {
    const dpr = Math.min(devicePixelRatio, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', () => { resizeChart(); drawChart(); });
  resizeChart();

  function ema(vals, n) {
    const k = 2 / (n + 1), out = [];
    vals.forEach((v, i) => out.push(i ? v * k + out[i - 1] * (1 - k) : v));
    return out;
  }

  const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

  function drawChart() {
    if (!visible) return;
    if (!W) resizeChart();
    ctx.clearRect(0, 0, W, H);
    ctx.font = '10px JetBrains Mono, monospace';
    if (!candles.length) {
      ctx.fillStyle = 'rgba(138,144,163,0.8)';
      ctx.fillText(failed ? 'Bitget data unavailable — retrying…' : 'Loading Bitget data…', 20, H / 2);
      return;
    }

    const all = candles;
    const hi = Math.max(...all.map(k => k.h)), lo = Math.min(...all.map(k => k.l));
    const pad = 24, bottom = 22, plotW = W - 64, plotH = H - pad - bottom, step = plotW / all.length;
    const y = v => pad + (hi - v) / (hi - lo || 1) * (plotH - pad);

    // grid + price axis
    ctx.strokeStyle = 'rgba(238,240,246,0.05)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(138,144,163,0.8)';
    for (let g = 0; g <= 4; g++) {
      const gy = pad + g * (plotH - pad) / 4;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(plotW, gy); ctx.stroke();
      ctx.fillText((hi - g * (hi - lo) / 4).toFixed(0), plotW + 8, gy + 3);
    }
    // time axis (local time), one label every 12 hours
    all.forEach((k, i) => {
      if (i % 12 !== 6) return;
      const x = i * step + step / 2, d = new Date(k.t);
      const label = d.getHours() === 0 ? dayFmt.format(d) : hourFmt.format(d);
      ctx.fillText(label, x - ctx.measureText(label).width / 2, H - 8);
    });
    // candles
    all.forEach((k, i) => {
      const x = i * step + step / 2, up = k.c >= k.o;
      ctx.strokeStyle = ctx.fillStyle = up ? '#3ef0a8' : '#ff4d6d';
      ctx.beginPath(); ctx.moveTo(x, y(k.h)); ctx.lineTo(x, y(k.l)); ctx.stroke();
      const top = y(Math.max(k.o, k.c)), hgt = Math.max(1, Math.abs(y(k.o) - y(k.c)));
      ctx.fillRect(x - step * 0.32, top, step * 0.64, hgt);
    });
    // EMA 20
    const e = ema(all.map(k => k.c), 20);
    ctx.strokeStyle = 'rgba(139,124,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath();
    e.forEach((v, i) => { const x = i * step + step / 2; i ? ctx.lineTo(x, y(v)) : ctx.moveTo(x, y(v)); });
    ctx.stroke();
    // last price line
    const lastC = all[all.length - 1].c;
    ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(124,247,212,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y(lastC)); ctx.lineTo(plotW, y(lastC)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#7cf7d4'; ctx.fillRect(plotW + 2, y(lastC) - 8, 62, 16);
    ctx.fillStyle = '#05060a'; ctx.fillText(lastC.toFixed(1), plotW + 6, y(lastC) + 3);
  }
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) { resizeChart(); refreshCandles(); }
  }).observe(cv);

  // ---------- Inactivity suspension ----------
  // After 10 minutes without input, stop the WebGL scene, data polling and timers.
  // Any interaction wakes the page and refreshes the live data.
  // ?idle=<seconds> shortens the timeout for testing; default is 10 minutes
  const IDLE_MS = (+new URLSearchParams(location.search).get('idle') || 600) * 1000;
  const sleepEl = $('#sleep');
  let lastActivity = Date.now();
  function sleep() {
    if (asleep) return;
    asleep = true;
    body.classList.add('is-asleep');
    sleepEl.setAttribute('aria-hidden', 'false');
    dispatchEvent(new Event('site:sleep'));
  }
  function wake() {
    lastActivity = Date.now();
    if (!asleep) return;
    asleep = false;
    body.classList.remove('is-asleep');
    sleepEl.setAttribute('aria-hidden', 'true');
    dispatchEvent(new Event('site:wake'));
    updateTicker();
    if (visible) refreshCandles();
  }
  // Only real user input counts: browsers fire synthetic pointermove events while the mouse
  // is still (animations under the cursor), which would otherwise reset the timer forever.
  let px = null, py = null, sy = scrollY;
  addEventListener('pointermove', e => {
    if (!e.isTrusted) return;
    if (px !== null && Math.abs(e.clientX - px) + Math.abs(e.clientY - py) < 3) return;
    px = e.clientX; py = e.clientY;
    wake();
  }, { passive: true });
  addEventListener('scroll', () => {
    if (Math.abs(scrollY - sy) < 2) return;
    sy = scrollY;
    wake();
  }, { passive: true });
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
    addEventListener(ev, e => { if (e.isTrusted) wake(); }, { passive: true }));
  setInterval(() => { if (!asleep && Date.now() - lastActivity >= IDLE_MS) sleep(); }, Math.min(15000, IDLE_MS / 2));
})();
