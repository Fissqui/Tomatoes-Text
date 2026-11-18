// Mini-barre de mise en forme : après une sélection faite à la souris, une petite barre apparaît
// au-dessus du texte choisi (police, taille, gras, italique, souligné, barré, couleur, surlignage,
// effacer la mise en forme, lien, commentaire). Chaque bouton agit par l'outil correspondant de la barre
// principale : même effet, même annulation (Ctrl+Z). Elle s'estompe quand la souris s'éloigne et
// disparaît dès que l'on écrit, clique ailleurs ou fait défiler la page.
// Menu Affichage : « Mini-barre de mise en forme » (réglage settings.miniBar, app.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const realFont = $('font-family');
  const realSize = $('font-size');
  const colorPop = $('color-pop');
  const hlPop = $('hl-pop');
  const tool = (id) => document.querySelector(`[data-tb="${id}"]`);
  let enabled = true;

  const bar = document.createElement('div');
  bar.id = 'minibar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Mise en forme de la sélection');
  bar.hidden = true;

  const btn = (key, title, html) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mb = key;
    b.title = title;
    b.innerHTML = html;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'mb-sep'; return s; };
  const row = () => { const r = document.createElement('div'); r.className = 'mb-row'; return r; };

  const font = document.createElement('select');
  font.className = 'mb-font';
  font.title = "Police d'écriture";
  const size = document.createElement('select');
  size.className = 'mb-size';
  size.title = 'Taille du texte';
  // (number.js en fait un champ où l'on tape la taille, avec deux flèches pour monter ou descendre d'un cran.)

  const bold = btn('bold', 'Gras (Ctrl+G)', '<b>G</b>');
  const italic = btn('italic', 'Italique (Ctrl+I)', '<i>I</i>');
  const underline = btn('underline', 'Souligné (Ctrl+U)', '<u>S</u>');
  const strike = btn('strike', 'Barré (Ctrl+Maj+X)', '<s>B</s>');
  const marks = { bold, italic, underline, strike };

  const color = btn('color', 'Couleur du texte', '<span class="mb-letter">A</span><span class="mb-swatch"></span>');
  const colorMore = btn('color-more', 'Choisir la couleur du texte', '▾');
  colorMore.className = 'mb-caret';
  const colorBox = document.createElement('span');
  colorBox.className = 'mb-split color-picker';
  colorBox.append(color, colorMore);

  const hl = btn('highlight', 'Surligner', '<svg viewBox="0 0 16 16"><path d="M10.2 2.3l3.5 3.5-6.2 6.2H4v-3.5zM8.6 3.9l3.5 3.5M2.5 14.2h5"/></svg><span class="mb-swatch"></span>');
  const hlMore = btn('hl-more', 'Choisir la couleur du surlignage', '▾');
  hlMore.className = 'mb-caret';
  const hlBox = document.createElement('span');
  hlBox.className = 'mb-split hl-picker';
  hlBox.append(hl, hlMore);

  const clear = btn('clear', 'Effacer la mise en forme', '<svg viewBox="0 0 24 24"><path d="M5 19L10.5 5h1L17 19M7.4 13.5h7.2"/><path class="mb-red" d="M15 15l6 6M21 15l-6 6"/></svg>');
  const link = btn('link', 'Lien vers un site ou une adresse e-mail (Ctrl+Maj+L)', '<svg viewBox="0 0 24 24"><path d="M10.2 13.8a4.2 4.2 0 0 0 6 0l3.4-3.4a4.2 4.2 0 0 0-6-6l-1.4 1.4"/><path d="M13.8 10.2a4.2 4.2 0 0 0-6 0l-3.4 3.4a4.2 4.2 0 0 0 6 6l1.4-1.4"/></svg>');
  const comment = btn('comment', 'Commentaire en marge (Ctrl+Maj+M)', '<svg viewBox="0 0 24 24"><path d="M3 4h18v12H11l-5 4v-4H3z"/><path d="M7 8.5h10M7 11.5h6"/></svg>');

  const top = row();
  top.append(font, size);
  const bottom = row();
  bottom.append(bold, italic, underline, strike, sep(), colorBox, hlBox, sep(), clear, link, comment);
  bar.append(top, bottom);
  document.body.append(bar);

  // ----- Actions : par les outils de la barre principale -----

  const view = () => window.FTMoteur && window.FTMoteur.view;
  const press = (id) => { const t = tool(id); if (t) t.click(); };
  const setReal = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };

  font.addEventListener('change', () => { setReal(realFont, font.value); later(); });
  size.addEventListener('change', () => { setReal(realSize, size.value); later(); });
  for (const [id, b] of Object.entries(marks)) b.addEventListener('click', () => { press(id); later(); });
  color.addEventListener('click', () => { $('color-btn').click(); later(); });
  hl.addEventListener('click', () => { $('hl-btn').click(); later(); });
  colorMore.addEventListener('click', () => openPop(colorPop, colorBox, hlPop));
  hlMore.addEventListener('click', () => openPop(hlPop, hlBox, colorPop));
  clear.addEventListener('click', () => {
    if (window.FTStructure && window.FTStructure.clearFormat) window.FTStructure.clearFormat();
    later();
  });
  comment.addEventListener('click', () => { hide(); $('comment-btn').click(); });
  link.addEventListener('click', () => { hide(); if (window.FTLinks && window.FTLinks.openLinkDialog) window.FTLinks.openLinkDialog(); });

  // Palette de la barre principale, ouverte sous la mini-barre.
  function openPop(pop, anchor, other) {
    other.hidden = true;
    pop.hidden = !pop.hidden;
    if (!pop.hidden) window.FTToolbar.placePop(pop, anchor);
  }

  // ----- État affiché : repris des outils de la barre principale -----

  function sync() {
    if (font.dataset.n !== String(realFont.options.length)) {
      font.innerHTML = realFont.innerHTML;
      font.dataset.n = String(realFont.options.length);
    }
    font.value = realFont.value;
    size.innerHTML = realSize.innerHTML;
    size.value = realSize.value;
    for (const [id, b] of Object.entries(marks)) {
      const t = tool(id);
      b.classList.toggle('on', !!t && t.classList.contains('on'));
    }
    const cs = $('color-swatch');
    const hs = $('hl-swatch');
    color.querySelector('.mb-swatch').style.background = cs ? cs.style.background : '';
    hl.querySelector('.mb-swatch').style.background = hs ? hs.style.background : '';
    comment.hidden = !$('comment-btn');
  }
  // La barre principale se met à jour 150 ms après une modification (editor.js) : on la relit ensuite.
  let syncTimer = 0;
  function later() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { if (!bar.hidden) sync(); }, 250);
  }

  // ----- Afficher, placer, cacher -----

  const usable = () => {
    const v = view();
    if (!enabled || !v) return false;
    const sel = v.state.selection;
    // Pas pour un objet choisi d'un clic (image, schéma, formule) : il a ses propres outils.
    if (sel.empty || sel.node) return false;
    return !($('app') && $('app').classList.contains('presenting'));
  };

  function show() {
    if (!usable()) return hide();
    sync();
    bar.style.opacity = '1';
    bar.hidden = false;
    place();
  }

  // Au-dessus de la ligne où la sélection se termine (là où est la souris), sinon en dessous.
  function place() {
    const v = view();
    let at;
    try { at = v.coordsAtPos(v.state.selection.head); } catch (e) { return hide(); }
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    let left = at.left - 24;
    let topPx = at.top - h - 10;
    if (topPx < 8) topPx = at.bottom + 10;
    // Cases d'un tableau choisies : sous les cases, la barre du tableau étant au-dessus du tableau.
    const sel = v.state.selection;
    if (sel.$anchorCell && sel.forEachCell) {
      let bottom = 0;
      let leftmost = Infinity;
      sel.forEachCell((n, pos) => {
        const dom = v.nodeDOM(pos);
        if (!dom) return;
        const r = dom.getBoundingClientRect();
        bottom = Math.max(bottom, r.bottom);
        leftmost = Math.min(leftmost, r.left);
      });
      if (bottom) { topPx = bottom + 8; left = leftmost; }
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    topPx = Math.max(8, Math.min(topPx, window.innerHeight - h - 8));
    bar.style.left = left + 'px';
    bar.style.top = topPx + 'px';
  }

  function hide() {
    if (bar.hidden) return;
    bar.hidden = true;
    if (bar.contains(document.activeElement)) document.activeElement.blur();
  }

  const inEditor = (el) => !!(el && el.closest && el.closest('#editor'));
  const ours = (el) => !!(el && el.closest && (bar.contains(el) || colorPop.contains(el) || hlPop.contains(el) || el.closest('.ft-num-list')));

  // Sélection faite à la souris (glisser, double ou triple clic) : la barre apparaît au relâchement.
  let downInEditor = false;
  document.addEventListener('mousedown', (e) => {
    downInEditor = e.button === 0 && inEditor(e.target);
    if (!ours(e.target)) hide();
  }, true);
  document.addEventListener('mouseup', (e) => {
    if (!downInEditor || e.button !== 0) return;
    downInEditor = false;
    setTimeout(show, 0);
  });

  // Une touche (lettre, flèche, Entrée…) la fait disparaître ; Ctrl+G, Ctrl+I… la laissent et la mettent à jour.
  document.addEventListener('keydown', (e) => {
    if (bar.hidden) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.length === 1 && !/^[avxz]$/i.test(e.key)) return later();
    if (bar.contains(e.target) && e.key !== 'Escape') return;
    hide();
  }, true);

  // La sélection est défaite (clic, Ctrl+Z, document fermé) : la barre s'en va.
  const watch = () => {
    if (bar.hidden) return;
    const v = view();
    if (!v || v.state.selection.empty) hide();
    else later();
  };

  // La souris s'éloigne : la barre s'estompe, puis disparaît.
  document.addEventListener('mousemove', (e) => {
    if (bar.hidden || downInEditor) return;
    const r = bar.getBoundingClientRect();
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d > 260 && colorPop.hidden && hlPop.hidden) return hide();
    bar.style.opacity = String(d < 24 ? 1 : Math.max(0.2, 1 - (d - 24) / 200));
  });
  document.addEventListener('scroll', (e) => { if (!ours(e.target)) hide(); }, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', () => { if (!bar.contains(document.activeElement)) hide(); });

  function hook() {
    if (!window.FTMoteur) return setTimeout(hook, 100);
    window.FTMoteur.onUpdate(watch);
    window.FTMoteur.onLoad(hide);
  }
  hook();

  window.FTMiniBarre = {
    setEnabled(on) {
      enabled = on !== false;
      if (!enabled) hide();
    },
    isEnabled: () => enabled
  };
})();
