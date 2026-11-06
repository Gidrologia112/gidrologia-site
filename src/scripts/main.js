// Гидрология — интерактив главной страницы. Без зависимостей.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.add('rv-on'); // скрипт загрузился — можно прятать блоки до появления

/* ---------- Живая вода на первом экране ---------- */
function initWater() {
  const canvas = $('[data-water]');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const W = 320, H = 180;
  canvas.width = W; canvas.height = H;
  let a = new Float32Array(W * H), b = new Float32Array(W * H);
  const img = ctx.createImageData(W, H), d = img.data;
  const drop = (x, y, r, s) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const dd = Math.hypot(i, j);
      if (dd <= r) a[yy * W + xx] += s * (1 - dd / r);
    }
  };
  const poke = (e, r, s) => {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    if (!p || !rect.width) return;
    drop(Math.floor((p.clientX - rect.left) / rect.width * W), Math.floor((p.clientY - rect.top) / rect.height * H), r, s);
  };
  const hero = canvas.parentElement;
  let lastMove = 0;
  hero.addEventListener('pointermove', (e) => { const n = performance.now(); if (n - lastMove > 16) { lastMove = n; poke(e, 2, 70); } }, { passive: true });
  hero.addEventListener('pointerdown', (e) => poke(e, 5, 420), { passive: true });

  let t = 0, last = 0, raf = 0, visible = true;
  const frame = (now) => {
    t += 0.016;
    if (now - last > 650) { last = now; drop(20 + Math.floor(Math.random() * (W - 40)), 20 + Math.floor(Math.random() * (H - 40)), 3, 160); }
    for (let y = 1; y < H - 1; y++) {
      const o = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = o + x;
        b[i] = ((a[i - 1] + a[i + 1] + a[i - W] + a[i + W]) * 0.5 - b[i]) * 0.984;
      }
    }
    const tmp = a; a = b; b = tmp;
    for (let y = 0; y < H; y++) {
      const ty = y / H, br = 3 + ty * 3, bg = 20 + ty * 34, bb = 30 + ty * 52, o = y * W;
      for (let x = 0; x < W; x++) {
        const i = o + x;
        const l = x > 0 ? a[i - 1] : a[i], r = x < W - 1 ? a[i + 1] : a[i];
        const u = y > 0 ? a[i - W] : a[i], dn = y < H - 1 ? a[i + W] : a[i];
        const caus = Math.sin(x * 0.045 + t * 0.55) * Math.sin(y * 0.06 - t * 0.4) + Math.sin((x + y) * 0.028 + t * 0.3) * 0.6;
        const sh = (l - r) * 0.32 + (u - dn) * 0.5 + caus * 7;
        const sp = sh > 0 ? sh * sh * 0.018 : 0;
        const p = i * 4;
        d[p] = br + sh * 0.35 + sp; d[p + 1] = bg + sh + sp; d[p + 2] = bb + sh * 1.5 + sp; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (!reduceMotion && visible) raf = requestAnimationFrame(frame);
  };
  // Не тратим батарею, когда первый экран не виден
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible && !reduceMotion) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  }).observe(hero);
  raf = requestAnimationFrame(frame);
}

/* ---------- Мобильное меню ---------- */
function initMenu() {
  const menu = $('#mnav'), openBtn = $('[data-menu-open]');
  if (!menu || !openBtn) return;
  const open = () => { menu.hidden = false; openBtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('[data-menu-close]', menu).focus(); };
  const close = () => { menu.hidden = true; openBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; openBtn.focus(); };
  openBtn.addEventListener('click', open);
  $('[data-menu-close]', menu).addEventListener('click', close);
  $$('[data-menu-link]', menu).forEach((a) => a.addEventListener('click', () => { menu.hidden = true; document.body.style.overflow = ''; openBtn.setAttribute('aria-expanded', 'false'); }));
  menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---------- Вкладки (решения, история объекта) ---------- */
function initTabs() {
  $$('[data-tabs]').forEach((root) => {
    const tabs = $$('[role="tab"]', root);
    const select = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus(); select(next);
      });
    });
  });
}

/* ---------- Карта городов ---------- */
function initGeo() {
  const root = $('[data-geo]'), dataEl = $('#cities-data');
  if (!root || !dataEl) return;
  const cities = JSON.parse(dataEl.textContent);
  const role = $('[data-city-role]', root), name = $('[data-city-name]', root), text = $('[data-city-text]', root), links = $('[data-city-links]', root);
  $$('[data-city]', root).forEach((btn) => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.city), c = cities[i];
    $$('[data-city]', root).forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.city) === i ? 'true' : 'false'));
    role.textContent = c.role; name.textContent = c.name; text.textContent = c.text;
    if (links) {
      links.textContent = '';
      (c.links || []).forEach((l) => { const li = document.createElement('li'), a = document.createElement('a'); a.href = l.href; a.textContent = l.t; li.append(a); links.append(li); });
    }
  }));
}

/* ---------- Схема водоёма ---------- */
function initScheme() {
  const root = $('[data-scheme]'), dataEl = $('#scheme-data');
  if (!root || !dataEl) return;
  const spots = JSON.parse(dataEl.textContent);
  const n = $('[data-spot-n]', root), title = $('[data-spot-title]', root), text = $('[data-spot-text]', root);
  $$('[data-spot]', root).forEach((btn) => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.spot);
    $$('[data-spot]', root).forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    n.textContent = i + 1; title.textContent = spots[i].title; text.textContent = spots[i].text;
  }));
}

/* ---------- До / после ---------- */
function initBeforeAfter() {
  $$('[data-ba]').forEach((root) => {
    const input = $('input[type="range"]', root);
    const set = () => root.style.setProperty('--ba', input.value + '%');
    input.addEventListener('input', set); set();
  });
}

/* ---------- Поиск по статьям ---------- */
function initKb() {
  const root = $('[data-kb]');
  if (!root) return;
  const q = $('[data-kb-q]', root), empty = $('[data-kb-empty]', root);
  const arts = $$('[data-art]', root), rubs = $$('[data-rub]', root);
  let rub = 'all';
  const apply = () => {
    const s = q.value.trim().toLowerCase();
    let shown = 0;
    arts.forEach((a) => {
      const ok = (rub === 'all' || a.dataset.r.includes(`|${rub}|`)) && (!s || a.dataset.t.includes(s)) && shown < 4;
      a.hidden = !ok; if (ok) shown++;
    });
    empty.hidden = shown > 0;
  };
  q.addEventListener('input', apply);
  rubs.forEach((b) => b.addEventListener('click', () => {
    rub = b.dataset.rub;
    rubs.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    apply();
  }));
  apply();
}

/* ---------- Форма ---------- */
function initForm() {
  const wrap = $('[data-form-wrap]');
  if (!wrap) return;
  const form = $('[data-form]', wrap), msg = $('[data-form-msg]', wrap);
  const modes = [
    { type: 'project', label: 'Расскажите об участке и задаче', btn: 'Отправить заявку' },
    { type: 'tz', label: 'Кратко о техническом задании', btn: 'Отправить ТЗ на расчёт' },
  ];
  const setMode = (i) => {
    $$('[data-ft]', wrap).forEach((b) => b.setAttribute('aria-selected', Number(b.dataset.ft) === i ? 'true' : 'false'));
    $('[data-ft-type]', wrap).value = modes[i].type;
    $('[data-ft-label]', wrap).textContent = modes[i].label;
    $('[data-ft-btn]', wrap).textContent = modes[i].btn;
    $('[data-ft-file]', wrap).hidden = i !== 1;
    const tzn = $('[data-ft-file2]', wrap); if (tzn) tzn.hidden = i !== 1;
  };
  $$('[data-ft]', wrap).forEach((b) => b.addEventListener('click', () => setMode(Number(b.dataset.ft))));
  if (location.hash === '#tz' || wrap.dataset.formStart === '1') setMode(1);
  $$('[data-form-tab]').forEach((a) => a.addEventListener('click', () => setMode(Number(a.dataset.formTab))));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    const name = form.name.value.trim(), phone = form.phone.value.trim();
    if (!name || phone.replace(/\D/g, '').length < 10) { msg.classList.add('err'); msg.textContent = 'Укажите имя и телефон.'; return; }
    if (!form.consent.checked) { msg.classList.add('err'); msg.textContent = 'Нужно согласие на обработку персональных данных.'; return; }
    const file = form.file && form.file.files[0];
    if (file && file.size > 10 * 1024 * 1024) { msg.classList.add('err'); msg.textContent = 'Файл больше 10 МБ — пришлите его на почту.'; return; }
    const btn = $('[data-ft-btn]', form);
    btn.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'fetch' } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset(); setMode(wrap.dataset.formStart === '1' ? 1 : 0);
        msg.classList.add('ok'); msg.textContent = 'Спасибо! Инженер свяжется с вами в рабочее время.';
        if (window.ym) try { window.ym(114014482, 'reachGoal', 'lead'); } catch (_) {}
      } else {
        msg.classList.add('err'); msg.textContent = data.error || 'Не получилось отправить. Позвоните нам: +7 812 748-22-44.';
      }
    } catch (_) {
      msg.classList.add('err'); msg.textContent = 'Нет связи с сервером. Позвоните нам: +7 812 748-22-44.';
    } finally { btn.disabled = false; }
  });
}


/* ---------- Списки публикаций и событий ---------- */
function initLists() {
  $$('[data-list]').forEach((root) => {
    const per = Number(root.dataset.per) || 12;
    const q = $('[data-list-q]', root), items = $$('[data-item]', root), rubs = $$('[data-list-rub]', root);
    const more = $('[data-list-more]', root), empty = $('[data-list-empty]', root);
    let rub = 'all', limit = per;
    // старые ссылки вида /publikatsii/?r=vodoemy-plavatelnye
    const key = new URLSearchParams(location.search).get('r');
    const ALIAS = { 'vodoemy-dlya-ryb': 'vodoemydlyaryb' };
    if (key) { const b = rubs.find((x) => x.dataset.key === (ALIAS[key] || key)); if (b) rub = b.dataset.listRub; }
    const apply = () => {
      const s = q.value.trim().toLowerCase();
      const match = items.filter((a) => (rub === 'all' || a.dataset.r.includes(`|${rub}|`)) && (!s || a.dataset.t.includes(s)));
      items.forEach((a) => { a.hidden = true; });
      match.slice(0, limit).forEach((a) => { a.hidden = false; });
      more.hidden = match.length <= limit;
      empty.hidden = match.length > 0;
      rubs.forEach((x) => x.setAttribute('aria-pressed', x.dataset.listRub === rub ? 'true' : 'false'));
    };
    q.addEventListener('input', () => { limit = per; apply(); });
    rubs.forEach((b) => b.addEventListener('click', () => { rub = b.dataset.listRub; limit = per; apply(); }));
    more.addEventListener('click', () => { limit += per; apply(); });
    apply();
  });
}

/* ---------- Магазин: корзина в браузере, оформление заказа ---------- */
function initShop() {
  const KEY = 'gidro-cart';
  let mem = {};
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return mem; } };
  const save = (c) => { mem = c; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {} count(); };
  const count = () => {
    const n = Object.values(load()).reduce((a, b) => a + (Number(b) || 0), 0);
    $$('[data-cart-count]').forEach((el) => { el.textContent = n; const l = el.closest('.cart-link'); if (l) l.classList.toggle('has', n > 0); });
  };
  const rub = (n) => n.toLocaleString('ru-RU') + ' ₽';
  count();
  // На телефоне разделы — лента с прокруткой: показываем текущий раздел
  const curChip = $('.shopnav .chip[aria-current]');
  if (curChip && curChip.parentElement.scrollWidth > curChip.parentElement.clientWidth) curChip.parentElement.scrollLeft = curChip.offsetLeft - 20;

  // Количество на странице товара
  const qi = $('[data-qty-input]');
  $$('[data-qty]').forEach((b) => b.addEventListener('click', () => { qi.value = Math.max(1, Math.min(999, (Number(qi.value) || 1) + Number(b.dataset.qty))); }));

  // «В корзину»
  let tt;
  const toast = () => {
    let el = $('.cart-toast');
    if (!el) {
      el = document.createElement('div'); el.className = 'cart-toast'; el.setAttribute('role', 'status');
      el.innerHTML = 'Товар добавлен в корзину. <a href="/magazin/korzina/">Оформить заказ →</a>';
      document.body.appendChild(el);
    }
    el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 3500);
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-add]');
    if (!b) return;
    const c = load(), id = b.dataset.add, q = b.hasAttribute('data-add-qty') && qi ? Math.max(1, Number(qi.value) || 1) : 1;
    c[id] = Math.min(999, (Number(c[id]) || 0) + q);
    save(c);
    if (!b.dataset.t) b.dataset.t = b.textContent;
    b.textContent = 'В корзине ✓'; b.classList.add('added');
    setTimeout(() => { b.textContent = b.dataset.t; b.classList.remove('added'); }, 1600);
    toast();
  });

  // Страница корзины
  const cart = $('[data-cart]');
  if (!cart) return;
  const list = $('[data-cart-list]', cart), empty = $('[data-cart-empty]', cart), form = $('[data-order]', cart);
  const totalWrap = $('[data-cart-total-wrap]', cart), totalEl = $('[data-cart-total]', cart), onreq = $('[data-cart-onreq]', cart);
  let cat = {};
  const render = () => {
    const c = load();
    Object.keys(c).forEach((id) => { if (!cat[id]) delete c[id]; });
    const ids = Object.keys(c);
    list.textContent = '';
    let total = 0, req = false;
    ids.forEach((id) => {
      const p = cat[id], q = Number(c[id]) || 1, sum = p.p * q;
      total += sum; if (!p.p) req = true;
      const row = document.createElement('div'); row.className = 'cart-row';
      row.innerHTML = '<a class="cart-img" tabindex="-1"></a>' +
        '<div class="cart-t"><a></a><span class="cart-pr"></span></div>' +
        '<div class="qty"><button type="button" aria-label="Меньше">−</button><input type="number" min="1" max="999" inputmode="numeric" aria-label="Количество"><button type="button" aria-label="Больше">+</button></div>' +
        '<div class="cart-sum"></div><button type="button" class="cart-del" aria-label="Удалить из корзины">×</button>';
      const href = '/magazin/tovar/' + p.s + '/';
      const im = $('.cart-img', row); im.href = href;
      if (p.i) { const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.src = p.i; im.appendChild(img); }
      const a = $('.cart-t a', row); a.href = href; a.textContent = p.t;
      $('.cart-pr', row).textContent = p.p ? rub(p.p) + ' за шт.' : 'цена по запросу';
      $('.cart-sum', row).textContent = p.p ? rub(sum) : '—';
      const inp = $('input', row); inp.value = q;
      const setQ = (v) => { const cc = load(); cc[id] = Math.max(1, Math.min(999, v)); save(cc); render(); };
      $$('.qty button', row)[0].addEventListener('click', () => setQ(q - 1));
      $$('.qty button', row)[1].addEventListener('click', () => setQ(q + 1));
      inp.addEventListener('change', () => setQ(Number(inp.value) || 1));
      $('.cart-del', row).addEventListener('click', () => { const cc = load(); delete cc[id]; save(cc); render(); });
      list.appendChild(row);
    });
    save(c);
    empty.hidden = ids.length > 0; form.hidden = ids.length === 0; totalWrap.hidden = ids.length === 0;
    totalEl.textContent = rub(total); onreq.hidden = !req;
    $('[data-order-items]', form).value = JSON.stringify(c);
  };
  fetch('/magazin/catalog.json').then((r) => r.json()).then((d) => { cat = d; render(); })
    .catch(() => { list.textContent = 'Не удалось загрузить корзину. Обновите страницу.'; });

  const msg = $('[data-order-msg]', form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    if (!form.name.value.trim() || form.phone.value.replace(/\D/g, '').length < 10) { msg.classList.add('err'); msg.textContent = 'Укажите имя и телефон.'; return; }
    if (!form.consent.checked) { msg.classList.add('err'); msg.textContent = 'Нужно согласие на обработку персональных данных.'; return; }
    const btn = $('button[type=submit]', form); btn.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'fetch' } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        save({}); form.reset(); form.hidden = true; empty.hidden = true; totalWrap.hidden = true;
        list.innerHTML = '<div class="cart-done"><b>Спасибо, заказ отправлен!</b><p>Менеджер позвонит в рабочее время, подтвердит наличие и стоимость доставки.</p><a href="/magazin/" class="btn btn-line">Вернуться в каталог</a></div>';
        if (window.ym) try { window.ym(114014482, 'reachGoal', 'order'); } catch (_) {}
      } else { msg.classList.add('err'); msg.textContent = data.error || 'Не получилось отправить. Позвоните нам: +7 812 748-22-44.'; }
    } catch (_) { msg.classList.add('err'); msg.textContent = 'Нет связи. Позвоните нам: +7 812 748-22-44.'; }
    btn.disabled = false;
  });
}

/* ---------- Калькулятор испарения ---------- */
function initCalc() {
  const root = $('[data-calc]');
  if (!root) return;
  const v = (sel) => { const el = $(sel, root); return el ? parseFloat(String(el.value).replace(',', '.')) : NaN; };
  const shapes = $$('[data-calc-shape]', root), temp = $('[data-calc-temp]', root);
  const out = {
    day: $('[data-calc-day]', root), month: $('[data-calc-month]', root), season: $('[data-calc-season-out]', root),
    mm: $('[data-calc-mm]', root), hint: $('[data-calc-hint]', root), area: $('[data-calc-area-out]', root),
  };
  const nf = (n, d = 0) => n.toLocaleString('ru-RU', { maximumFractionDigits: d });
  const vol = (l) => (l >= 10000 ? `${nf(l / 1000, 1)} м³` : `${nf(Math.round(l))} л`);
  const shape = () => (shapes.find((r) => r.checked) || {}).value || 'area';

  // Методика старого калькулятора gidrologia.ru/isparenie:
  // слой, мм/мес = 11,6 · (E − e) · (1 + 0,134 · V), где E — давление насыщенного пара при температуре воды (гПа),
  // e = E · влажность / 100, V — скорость ветра; объём = площадь · (слой − 70 мм).
  const run = () => {
    const s = shape();
    let area = NaN;
    if (s === 'area') area = v('[data-calc-area]');
    if (s === 'rect') area = v('[data-calc-len]') * v('[data-calc-wid]');
    if (s === 'circle') { const d = v('[data-calc-dia]'); area = Math.PI * d * d / 4; }
    out.area.hidden = !(s !== 'area' && area > 0);
    if (s !== 'area' && area > 0) out.area.textContent = `Площадь зеркала: ${nf(area, 1)} м²`;
    if (!(area > 0)) {
      [out.day, out.month, out.season, out.mm].forEach((el) => { el.textContent = '—'; });
      out.hint.textContent = 'Укажите размер водоёма — расчёт появится сразу.';
      return;
    }
    const wind = Math.max(0, isNaN(v('[data-calc-wind]')) ? 7 : v('[data-calc-wind]'));
    const hum = Math.min(100, Math.max(0, isNaN(v('[data-calc-hum]')) ? 75 : v('[data-calc-hum]')));
    const months = Math.min(12, Math.max(1, Math.round(isNaN(v('[data-calc-season]')) ? 5 : v('[data-calc-season]'))));
    const E = Number(temp.value) / 100;
    const depth = Math.round(11.6 * (E - hum * E / 100) * (1 + 0.134 * wind));
    const month = Math.max(0, area * (depth - 70));
    out.mm.textContent = `${depth} мм`;
    out.month.textContent = vol(month);
    out.day.textContent = vol(month / 30);
    out.season.textContent = vol(month * months);
    const t = temp.selectedOptions[0]?.dataset.t;
    out.hint.textContent = month > 0
      ? `Площадь ${nf(area, 1)} м², вода ${t} °C, ветер ${nf(wind, 1)} м/с, влажность ${hum} %. Уровень опускается примерно на ${nf((depth - 70) / 10, 1)} см в месяц.`
      : `При таких условиях испарение не превышает 70 мм в месяц, заметных потерь по методике нет.`;
  };
  shapes.forEach((r) => r.addEventListener('change', () => {
    $$('[data-shape]', root).forEach((el) => { el.hidden = el.dataset.shape !== shape(); });
    run();
  }));
  root.addEventListener('input', run);
  root.addEventListener('change', run);
  run();
}

/* ---------- Галерея: просмотр фото и скрытие ещё не перенесённых картинок ---------- */
function initGallery() {
  $$('.prose img, .gal-grid img').forEach((img) => {
    const bad = () => img.classList.add('broken');
    if (img.complete && img.naturalWidth === 0) bad(); else img.addEventListener('error', bad);
  });
  const links = $$('a[data-lb]');
  if (!links.length) return;
  const box = document.createElement('div');
  box.className = 'lb'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  box.innerHTML = '<img alt=""><p></p><button class="lb-x" aria-label="Закрыть">×</button><button class="lb-p" aria-label="Предыдущее фото">‹</button><button class="lb-n" aria-label="Следующее фото">›</button>';
  document.body.appendChild(box);
  const im = $('img', box), cap = $('p', box);
  let i = 0, last = null;
  const show = (k) => { i = (k + links.length) % links.length; im.style.animation = 'none'; void im.offsetWidth; im.style.animation = ''; im.src = links[i].href; cap.textContent = links[i].dataset.lb; };
  const close = () => { box.hidden = true; document.body.style.overflow = ''; last && last.focus(); };
  links.forEach((a, k) => a.addEventListener('click', (e) => { e.preventDefault(); last = a; show(k); box.hidden = false; document.body.style.overflow = 'hidden'; $('.lb-x', box).focus(); }));
  $('.lb-x', box).addEventListener('click', close);
  $('.lb-p', box).addEventListener('click', () => show(i - 1));
  $('.lb-n', box).addEventListener('click', () => show(i + 1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(i - 1); else if (e.key === 'ArrowRight') show(i + 1);
  });
}

/* ---------- Анимации внутренних страниц: появление списков, счётчики, шапка ---------- */
function initMotion() {
  // 1. Появление элементов списков и карточек с небольшой «лесенкой»
  const groups = [
    ['.cards', ':scope > *'], ['.svc-list', ':scope > *'], ['[data-list] > div', ':scope > *'],
    ['.gal-grid', ':scope > *'], ['.thread', ':scope > .fpost'], ['.arts', ':scope > *'],
    ['.g-proc', ':scope > li'], ['.aside', ':scope > *'], ['.facts-row', ':scope > *'], ['.calc', ':scope > *'],
  ];
  if (!reduceMotion) {
    groups.forEach(([g, child]) => $$(g).forEach((box) => {
      if (box.closest('.rv')) return;
      [...box.querySelectorAll(child)].forEach((el, i) => {
        if (el.classList.contains('rv')) return;
        el.classList.add('rv', 'rv-s');
        el.style.setProperty('--d', `${Math.min(i % 8, 6) * 70}ms`);
      });
    }));
    $$('main .page-hero ~ section h2, .prose > h2, .gal-album').forEach((el) => { if (!el.closest('.rv')) el.classList.add('rv', 'rv-s'); });
  }
  // 2. Счётчики цифр: 300+ «набегает» при появлении (годы не трогаем)
  const nums = $$('.t-num').filter((el) => /^\d{1,3}$/.test(el.firstChild?.textContent?.trim() || ''));
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const node = en.target.firstChild, end = Number(node.textContent.trim()), t0 = performance.now(), dur = 1400;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); node.textContent = String(Math.round(end * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); };
      node.textContent = '0'; requestAnimationFrame(step);
    }), { threshold: 0.6 });
    nums.forEach((n) => io.observe(n));
  }
  // 3. Шапка всегда на месте, после прокрутки становится компактнее
  const hdr = $('.hdr');
  if (hdr) {
    let ticking = false;
    const upd = () => { hdr.classList.toggle('hdr-scrolled', window.scrollY > 24); ticking = false; };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }
  // 4. Картинки в текстах проявляются по загрузке
  $$('.prose img, .gal-grid img, .card .ph > img, .post .ph > img').forEach((img) => {
    if (img.complete) return;
    img.classList.add('img-fade');
    img.addEventListener('load', () => img.classList.add('img-on'), { once: true });
  });
}

/* ---------- Плавное появление блоков ---------- */
function initReveal() {
  const els = $$('.rv');
  const show = (e) => e.classList.add('in');
  if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach(show); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
  // Запасной путь: если наблюдатель не сработал (встроенные просмотрщики, старые браузеры),
  // показываем всё, что уже на экране или выше, — контент не должен оставаться невидимым.
  let t = 0;
  const check = () => {
    t = 0;
    const h = window.innerHeight;
    els.forEach((e) => { if (!e.classList.contains('in') && e.getBoundingClientRect().top < h) show(e); });
  };
  const later = () => { if (!t) t = setTimeout(check, 250); };
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later);
  setTimeout(check, 1500);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href^="tel:"], a[href^="mailto:"]');
  if (a && window.ym) try { window.ym(114014482, 'reachGoal', a.href.startsWith('tel:') ? 'phone' : 'email'); } catch (_) {}
});
// Ошибка в одном блоке не должна ломать остальные (и прятать контент): каждый запускаем отдельно.
// initMotion размечает блоки для появления, initReveal их показывает — эти двое последними.
[initWater, initMenu, initTabs, initGeo, initScheme, initBeforeAfter, initKb, initForm, initLists, initCalc, initGallery, initShop, initMotion, initReveal]
  .forEach((f) => { try { f(); } catch (e) { console.error(e); } });
