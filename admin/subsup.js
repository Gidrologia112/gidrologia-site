/* Кабинет редактора «Гидрологии»: кнопки x₂ (подстрочный) и x² (надстрочный) в панели редактора текста.
 * В Decap CMS таких кнопок нет, поэтому они добавляются сюда отдельно.
 * Как работает: выделить текст → нажать кнопку → выделенное оборачивается в <sub>…</sub> или <sup>…</sup>.
 * Повторное нажатие на выделенный «<sub>dyn</sub>» убирает тег.
 * На сайте теги показываются как настоящие индексы (H с маленьким dyn снизу, м²).
 * Если после обновления Decap кнопки пропали — проверить заголовок кнопки «Курсив» ниже (ITALIC).
 */
(function () {
  var ITALIC = ['Курсив', 'Italic'];
  var BTNS = [
    { tag: 'sub', label: 'x₂', title: 'Подстрочный индекс (H₂O, Q_x): выделите текст и нажмите' },
    { tag: 'sup', label: 'x²', title: 'Надстрочный индекс (м², 10³): выделите текст и нажмите' },
  ];

  function findEditor(from) {
    var n = from;
    for (var i = 0; i < 8 && n; i++) {
      var ed = n.querySelector && n.querySelector('[data-slate-editor]');
      if (ed) return ed;
      n = n.parentElement;
    }
    return null;
  }

  // Экземпляр редактора Slate, которым пользуется Decap: ищем его в данных React у элемента редактора.
  // Менять текст нужно через него — иначе правка видна на экране, но не попадает в сохранённую статью.
  function slateOf(el) {
    var key = Object.keys(el).find(function (k) { return k.indexOf('__reactFiber$') === 0; });
    var f = key && el[key];
    for (var i = 0; f && i < 60; i++, f = f.return) {
      var ed = f.memoizedProps && f.memoizedProps.editor;
      if (ed && typeof ed.insertText === 'function' && 'selection' in ed) return ed;
    }
    return null;
  }

  function hint(btn, text) {
    var tip = document.createElement('span');
    tip.textContent = text;
    tip.style.cssText = 'position:absolute;top:100%;left:0;z-index:1000;margin-top:4px;padding:4px 8px;border-radius:4px;' +
      'background:#313d3e;color:#fff;font:13px/1.3 system-ui,sans-serif;white-space:nowrap;pointer-events:none';
    btn.style.position = 'relative';
    btn.appendChild(tip);
    setTimeout(function () { tip.remove(); }, 2200);
  }

  function apply(tag, btn) {
    var ed = findEditor(btn);
    var sel = window.getSelection();
    if (!ed || !sel || !sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode) || !ed.contains(sel.focusNode)) {
      hint(btn, 'Сначала выделите в тексте символы для индекса');
      return;
    }
    var text = sel.toString();
    if (/\n/.test(text)) { hint(btn, 'Выделите символы внутри одной строки'); return; }
    var open = '<' + tag + '>', close = '</' + tag + '>';
    var out = text.indexOf(open) === 0 && text.slice(-close.length) === close
      ? text.slice(open.length, -close.length)          // уже в теге — снять
      : open + text + close;
    var slate = slateOf(ed);
    if (!slate || !slate.selection) { hint(btn, 'Не получилось — напишите вручную: H<sub>dyn</sub>'); return; }
    slate.insertText(out);
    ed.focus();
  }

  function makeButton(def, sample) {
    var b = document.createElement('button');
    b.type = 'button';
    b.title = def.title;
    b.className = sample.className;
    b.setAttribute('data-gidro-subsup', def.tag);
    b.textContent = def.label;
    b.style.cssText = 'font:600 15px/1 system-ui,sans-serif;color:#7a8291;min-width:30px';
    // не даём кнопке забрать выделение у текста
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) { e.preventDefault(); apply(def.tag, b); });
    return b;
  }

  function inject() {
    var sel = ITALIC.map(function (t) { return 'button[title="' + t + '"]'; }).join(',');
    document.querySelectorAll(sel).forEach(function (italic) {
      var bar = italic.parentElement;
      if (!bar || bar.querySelector('[data-gidro-subsup]')) return;
      var after = bar.querySelector('button[title="Ссылка"], button[title="Link"]') || italic;
      BTNS.slice().reverse().forEach(function (def) { after.after(makeButton(def, italic)); });
    });
  }

  new MutationObserver(inject).observe(document.documentElement, { childList: true, subtree: true });
})();
