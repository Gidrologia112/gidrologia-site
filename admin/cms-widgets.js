/* Кабинет редактора «Гидрологии»: свои виджеты и предпросмотр.
 * 1) «photos» — фотографии альбома пачкой: выбрать или перетащить сразу много файлов.
 *    Каждое фото уменьшается до 2000 px (и миниатюра 640 px), чтобы сайт грузился быстро.
 * 2) Предпросмотр статей, событий и галереи в стилях сайта (preview.css).
 */
(function () {
  var MAX = 2000, THUMB = 640, Q = 0.85;
  // только что загруженные фото: показываем их сразу, ещё до выкладки на сайт
  var BLOBS = window.__gidroBlobs = window.__gidroBlobs || {};
  function look(path) { return BLOBS[path] || path; }
  var TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  function slug(s) {
    return String(s || '').toLowerCase().split('').map(function (c) { return TR[c] !== undefined ? TR[c] : c; }).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  }
  function toArr(v) {
    if (!v) return [];
    if (v.toJS) v = v.toJS();
    return Array.isArray(v) ? v.map(function (p) { return typeof p === 'string' ? { src: p, thumb: '' } : { src: p.src || '', thumb: p.thumb || '' }; }) : [];
  }
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
    }
    return new Promise(function (res, rej) {
      var img = new Image(); img.onload = function () { res(img); }; img.onerror = rej; img.src = URL.createObjectURL(file);
    });
  }
  function shrink(bmp, max, name) {
    var w = bmp.width, hgt = bmp.height, k = Math.min(1, max / Math.max(w, hgt));
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(hgt * k);
    var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(function (b) { res(new File([b], name, { type: 'image/jpeg' })); }, 'image/jpeg', Q); });
  }
  function publicFolder(props) {
    var f = props.field && props.field.get && props.field.get('public_folder');
    if (!f && props.config && props.config.get) f = props.config.get('public_folder');
    return String(f || '/img/uploads').replace(/\/+$/, '');
  }

  var PhotosControl = createClass({
    getInitialState: function () { return { busy: false, done: 0, total: 0, err: '', over: false }; },
    list: function () { return toArr(this.props.value); },
    set: function (arr) { this.props.onChange(arr); },
    add: function (files) {
      var self = this, props = this.props;
      files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name); });
      if (!files.length || this.state.busy) return;
      var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      var title = '';
      try { title = props.entry && props.entry.getIn(['data', 'title']); } catch (e) {}
      var base = 'gal-' + stamp + '-' + (slug(title) || 'foto') + '-' + Math.random().toString(36).slice(2, 6);
      var folder = publicFolder(props);
      var added = [];
      this.setState({ busy: true, done: 0, total: files.length, err: '' });
      var i = 0;
      function next() {
        if (i >= files.length) {
          self.set(self.list().concat(added));
          self.setState({ busy: false });
          return;
        }
        var f = files[i], n = String(i + 1).padStart(2, '0'); i++;
        loadBitmap(f).then(function (bmp) {
          return Promise.all([shrink(bmp, MAX, base + '-' + n + '.jpg'), shrink(bmp, THUMB, base + '-' + n + '-m.jpg')]);
        }).then(function (pair) {
          return props.onPersistMedia(pair[0], { field: props.field }).then(function () {
            return props.onPersistMedia(pair[1], { field: props.field });
          }).then(function () {
            var a = folder + '/' + pair[0].name, t = folder + '/' + pair[1].name;
            BLOBS[a] = URL.createObjectURL(pair[0]); BLOBS[t] = URL.createObjectURL(pair[1]);
            added.push({ src: a, thumb: t });
          });
        }).catch(function () {
          self.setState({ err: 'Не удалось обработать «' + f.name + '». Если это HEIC с iPhone — сохраните фото как JPEG.' });
        }).then(function () {
          self.setState({ done: i });
          next();
        });
      }
      next();
    },
    move: function (idx, d) {
      var a = this.list(), j = idx + d; if (j < 0 || j >= a.length) return;
      var t = a[idx]; a[idx] = a[j]; a[j] = t; this.set(a);
    },
    remove: function (idx) { var a = this.list(); a.splice(idx, 1); this.set(a); },
    render: function () {
      var self = this, list = this.list(), st = this.state, props = this.props;
      var src = function (p) { return look(p.thumb || p.src); };
      var btn = { border: '1px solid #c9ccd4', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', padding: '2px 8px', minHeight: '28px' };
      return h('div', { className: props.classNameWrapper, style: { padding: '14px' } },
        h('label', {
          onDragOver: function (e) { e.preventDefault(); if (!st.over) self.setState({ over: true }); },
          onDragLeave: function () { self.setState({ over: false }); },
          onDrop: function (e) { e.preventDefault(); self.setState({ over: false }); self.add(e.dataTransfer.files); },
          style: { display: 'block', border: '2px dashed ' + (st.over ? '#3a69c7' : '#b9c0cc'), background: st.over ? '#eef3fd' : '#f7f8fa', borderRadius: '10px', padding: '22px', textAlign: 'center', cursor: st.busy ? 'progress' : 'pointer', fontSize: '15px', color: '#313d3e' }
        },
          h('input', { type: 'file', accept: 'image/*', multiple: true, disabled: st.busy, style: { display: 'none' }, onChange: function (e) { self.add(e.target.files); e.target.value = ''; } }),
          st.busy
            ? h('span', null, 'Загружаю фото: ' + st.done + ' из ' + st.total + '…')
            : h('span', null, h('b', null, 'Добавить фотографии'), ' — выберите сразу несколько файлов или перетащите их сюда')
        ),
        st.err ? h('p', { style: { color: '#b3261e', fontSize: '13px', margin: '8px 0 0' } }, st.err) : null,
        h('p', { style: { fontSize: '13px', color: '#5e6470', margin: '10px 0' } },
          list.length ? 'Фото в альбоме: ' + list.length + '. Порядок меняется стрелками, лишнее — крестиком.' : 'В альбоме пока нет фото.'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '10px' } },
          list.map(function (p, idx) {
            return h('div', { key: p.src + idx, style: { border: '1px solid #dfe3ea', borderRadius: '8px', overflow: 'hidden', background: '#fff' } },
              h('img', { src: src(p), alt: '', style: { display: 'block', width: '100%', height: '90px', objectFit: 'cover', background: '#e9ecf1' } }),
              h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px' } },
                h('button', { type: 'button', style: btn, title: 'Левее', 'aria-label': 'Переместить левее', onClick: function () { self.move(idx, -1); } }, '←'),
                h('button', { type: 'button', style: btn, title: 'Правее', 'aria-label': 'Переместить правее', onClick: function () { self.move(idx, 1); } }, '→'),
                h('button', { type: 'button', style: Object.assign({}, btn, { color: '#b3261e' }), title: 'Убрать из альбома', 'aria-label': 'Убрать фото из альбома', onClick: function () { self.remove(idx); } }, '✕')
              )
            );
          })
        )
      );
    },
  });
  var PhotosPreview = function (props) {
    return h('div', null, toArr(props.value).map(function (p, i) { return h('img', { key: i, src: look(p.thumb || p.src), style: { width: '80px', marginRight: '4px' } }); }));
  };
  CMS.registerWidget('photos', PhotosControl, PhotosPreview);

  /* ---------- Предпросмотр в стилях сайта ---------- */
  CMS.registerPreviewStyle('/admin/preview.css');
  var MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  function fmt(d) {
    var m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '';
  }
  function asset(props, path) {
    if (!path) return '';
    if (BLOBS[path]) return BLOBS[path];
    var a = props.getAsset(path); var u = a && a.toString();
    return u && u.indexOf('blob:') === 0 ? u : path;
  }

  function PostPreview(section) {
    return function (props) {
      var d = props.entry.get('data');
      var title = d.get('title') || 'Без заголовка', cover = d.get('cover');
      return h('main', null,
        h('section', { className: 'page-hero' },
          h('div', { className: 'w' },
            h('nav', { className: 'crumbs' }, h('span', null, h('a', null, 'Главная'), h('i', null, '/')), h('span', null, h('a', null, section), h('i', null, '/')), h('span', null, title)),
            h('p', { className: 'lbl' }, d.get('rubric') || section),
            h('h1', { className: 'h t-h1 page-h1' }, title),
            d.get('excerpt') ? h('p', { className: 'page-lead' }, d.get('excerpt')) : null,
            h('div', { className: 'meta' },
              d.get('date') ? h('span', null, fmt(d.get('date'))) : null,
              d.get('rubric') ? h('a', null, d.get('rubric')) : null,
              d.get('source') ? h('span', null, 'По материалам: ' + d.get('source')) : null),
            cover ? h('div', { className: 'ph cover' }, h('img', { src: asset(props, cover), alt: '' })) : null
          )
        ),
        h('section', null, h('div', { className: 'w sec-sm g-article' },
          h('article', { className: 'prose' }, props.widgetFor('body')),
          h('aside', { className: 'aside' })
        ))
      );
    };
  }
  CMS.registerPreviewTemplate('publikatsii', PostPreview('Публикации'));
  CMS.registerPreviewTemplate('sobytiya', PostPreview('События'));

  function albums(props, list) {
    return toArr2(list).map(function (a, i) {
      return h('div', { className: 'gal-album', key: i },
        h('div', { className: 'gal-head' }, h('h3', { className: 'h' }, a.title || 'Объект без названия'), a.text ? h('p', null, a.text) : null),
        h('div', { className: 'gal-grid' }, toArr(a.photos).map(function (p, j) {
          return h('a', { key: j }, h('div', { className: 'ph' }, h('img', { src: asset(props, p.thumb || p.src), alt: '' })));
        }))
      );
    });
  }
  function toArr2(v) { if (!v) return []; return v.toJS ? v.toJS() : v; }
  CMS.registerPreviewTemplate('galereya', function (props) {
    var d = props.entry.get('data');
    var groups = toArr2(d.get('groups'));
    return h('main', null,
      h('section', { className: 'page-hero' }, h('div', { className: 'w' },
        h('p', { className: 'lbl' }, 'Галерея'),
        h('h1', { className: 'h t-h1 page-h1' }, d.get('title') || 'Новый раздел'))),
      h('section', null, h('div', { className: 'w sec-sm' },
        h('div', { className: 'gal-group' }, albums(props, d.get('albums'))),
        groups.map(function (g, i) {
          return h('div', { className: 'gal-group', key: 'g' + i }, h('h2', { className: 'h t-h3', style: { margin: '0 0 32px' } }, g.title), albums(props, g.albums));
        })
      ))
    );
  });
})();
