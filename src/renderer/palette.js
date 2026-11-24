// Palette de commandes (Ctrl+K, bouton « Outils » de la barre principale) : on tape le nom d'une fonction
// et Entrée l'ouvre. Elle réunit les commandes des menus et des raccourcis (shortcuts.js), les outils
// des deux barres, les styles du document, les réglages (thème du logiciel, thème du document, pages,
// mode note / avancé, zoom) et les documents (récents, puis ceux du projet ouvert).
// Sans saisie : les dernières commandes utilisées, puis les documents récents.
(function () {
  const $ = (id) => document.getElementById(id);
  const dialog = $('palette-dialog');
  const input = $('palette-search');
  const listBox = $('palette-list');
  const LAST_KEY = 'ft-palette-last';
  const LAST_MAX = 6;
  const SHOWN_MAX = 60;

  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const bars = () => [$('toolbar'), $('toolbar2'), $('tb-side-l'), $('tb-side-r')].filter(Boolean);
  const welcomeOpen = () => !!(window.FTWelcome && window.FTWelcome.isOpen());

  // Libellé court d'une infobulle : « Insérer une image (vous pouvez…) » → « Insérer une image ».
  const shortTitle = (t) => String(t || '').split(/\s+[:(]\s*|\s+—\s+/)[0].trim();

  // Icône d'un outil de la barre (copie de son image, avec la couleur de sa famille).
  function iconOf(el) {
    if (!el) return null;
    const svg = el.matches('svg') ? el : el.querySelector('svg.ic') || el.querySelector(':scope > svg');
    if (!svg) return null;
    const copy = svg.cloneNode(true);
    copy.classList.add('ic');
    copy.removeAttribute('id');
    const holder = el.closest('[data-tb]') || el;
    const c = getComputedStyle(holder).getPropertyValue('--c').trim();
    if (c) copy.style.setProperty('--c', c);
    return copy;
  }

  const toolEl = (id) => bars().map((b) => b.querySelector(`[data-tb="${id}"]`)).find(Boolean) || null;

  // Bouton à cliquer pour un outil de la barre (le bouton principal d'un menu déroulant).
  function pressable(el) {
    if (!el) return null;
    if (el.matches('button')) return el;
    return el.querySelector(':scope > button:not(.caret-btn)') || null;
  }

  function useEditor() {
    const M = window.FTMoteur;
    if (M && M.view) M.view.focus();
    else if ($('editor')) $('editor').focus();
  }

  // Ouvre une fenêtre puis l'onglet demandé.
  const openTab = (open, dialogId, tab) => () => {
    open();
    const b = document.querySelector(`#${dialogId} .styles-tabs [data-tab="${tab}"]`);
    if (b) b.click();
  };

  function collect() {
    const items = [];
    const seen = new Set();
    const add = (it) => { items.push(it); return it; };

    // 1. Commandes des menus et des raccourcis.
    const S = window.FTShortcuts;
    for (const c of S ? S.commands() : []) {
      if (c.id === 'palette') continue;
      const el = (c.target && document.querySelector(c.target)) || toolEl(c.id);
      const tb = el && el.closest('[data-tb]');
      if (tb) seen.add(tb);
      add({
        key: 'cmd:' + c.id, group: c.group, label: c.label, combo: S.display(S.binding(c.id)),
        words: (el && (el.title || '')) || '', icon: el, menu: c.kind === 'menu',
        run: () => S.run(c.id)
      });
    }

    // 2. Outils des barres qui ne sont pas déjà des commandes.
    for (const bar of bars()) {
      for (const tb of bar.querySelectorAll('.tb-group > [data-tb]')) {
        if (seen.has(tb)) continue;
        const btn = pressable(tb);
        const field = tb.matches('select') ? tb : null;
        if (!btn && !field) continue;
        const title = (btn || field).title || tb.title || '';
        const lab = tb.querySelector('.tb-label');
        const label = shortTitle(title) || (lab && lab.textContent.trim());
        if (!label) continue;
        add({
          key: 'tb:' + tb.dataset.tb, group: 'Barre d’outils', label, words: title + ' ' + (lab ? lab.textContent : ''),
          icon: tb, run: () => {
            if (field) { field.focus(); try { field.showPicker(); } catch (e) { /* ancien moteur */ } return; }
            btn.click();
          }
        });
      }
    }

    // 3. Styles du document, un par type d'élément.
    if (window.FTStyles) {
      for (const [id, name] of window.FTStyles.kinds()) {
        add({ key: 'style:' + id, group: 'Styles', label: 'Styles : ' + name, words: 'style styles du document ' + name, icon: $('docstyles-btn'), run: () => window.FTStyles.open(id) });
      }
    }

    // 4. Réglages : onglets des fenêtres de réglage, modes, zoom.
    const menu = (id) => () => window.FTApp.menu(id);
    const tabs = [
      ['custom-dialog', 'Thème du logiciel', menu('customize'), true],
      ['theme-dialog', 'Thème du document', menu('doc-theme'), false],
      ['pages-dialog', 'Réglages des pages', () => $('page-setup').click(), false]
    ];
    for (const [dialogId, name, open, app] of tabs) {
      document.querySelectorAll(`#${dialogId} .styles-tabs [data-tab]`).forEach((b) => {
        if (b.classList.contains('pg-adv-only') && !document.querySelector('#mode-switch [data-mode="avance"][aria-pressed="true"]')) return;
        add({ key: `tab:${dialogId}:${b.dataset.tab}`, group: 'Réglages', label: `${name} : ${b.textContent.trim()}`, words: 'réglages', menu: app, run: openTab(open, dialogId, b.dataset.tab) });
      });
    }
    document.querySelectorAll('#mode-switch [data-mode]').forEach((b) => {
      add({ key: 'mode:' + b.dataset.mode, group: 'Réglages', label: b.textContent.trim(), words: b.title, icon: b, run: () => b.click() });
    });
    for (const [id, label, combo] of [['zoom-in', 'Zoom avant', 'Ctrl++'], ['zoom-out', 'Zoom arrière', 'Ctrl+-'], ['zoom-reset', 'Taille réelle (zoom 100 %)', 'Ctrl+0'], ['export-word', 'Exporter en Word (.docx)', ''], ['export-pdf', 'Exporter en PDF', '']]) {
      add({ key: 'menu:' + id, group: id.startsWith('export') ? 'Fichier' : 'Affichage', label, combo, words: '', run: menu(id) });
    }

    // 5. Documents : les récents de tous les projets, puis ceux du projet ouvert.
    const W = window.FTWelcome;
    for (const d of W && W.docs ? W.docs() : []) {
      add({
        key: `doc:${d.project}:${d.id}`, group: 'Documents', label: d.title || 'Sans titre', hint: d.project,
        words: (d.tags || []).map((t) => t.name).join(' '), doc: true, recent: d.recent, menu: true, run: () => W.openDoc(d)
      });
    }
    return items;
  }

  // ----- Recherche -----

  // Note d'un élément pour la saisie : tous les mots doivent s'y trouver ; le nom compte plus que
  // les mots-clés, un début de mot plus qu'un milieu.
  function score(it, words) {
    const label = fold(it.label);
    const extra = fold(`${it.group} ${it.words || ''} ${it.hint || ''}`);
    let total = 0;
    for (const w of words) {
      const i = label.indexOf(w);
      if (i === 0) total += 30;
      else if (i > 0 && /[\s'’(«:-]/.test(label[i - 1])) total += 20;
      else if (i > 0) total += 8;
      else if (extra.includes(w)) total += 2;
      else return 0;
    }
    if (label === words.join(' ')) total += 40;
    if (it.doc) total -= 1;
    return total;
  }

  function lastUsed() {
    try {
      const v = JSON.parse(localStorage.getItem(LAST_KEY) || '[]');
      return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : [];
    } catch (e) { return []; }
  }
  function remember(key) {
    if (key.startsWith('doc:')) return;
    try { localStorage.setItem(LAST_KEY, JSON.stringify([key, ...lastUsed().filter((k) => k !== key)].slice(0, LAST_MAX))); } catch (e) { /* stockage indisponible */ }
  }

  let all = [];
  let shown = [];
  let active = 0;

  function results() {
    const pool = welcomeOpen() ? all.filter((it) => it.menu) : all;
    const words = fold(input.value).split(/\s+/).filter(Boolean);
    if (!words.length) {
      const byKey = new Map(pool.map((it) => [it.key, it]));
      const last = lastUsed().map((k) => byKey.get(k)).filter(Boolean).map((it) => ({ ...it, section: 'Utilisés récemment' }));
      const docs = pool.filter((it) => it.recent).slice(0, 5).map((it) => ({ ...it, section: 'Documents récents' }));
      const rest = last.length + docs.length ? [] : pool.filter((it) => !it.doc).slice(0, 12).map((it) => ({ ...it, section: 'Commandes' }));
      return [...last, ...docs, ...rest];
    }
    return pool
      .map((it, i) => ({ it, i, s: score(it, words) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, SHOWN_MAX)
      .map((x) => x.it);
  }

  function render() {
    shown = results();
    active = Math.min(active, Math.max(0, shown.length - 1));
    listBox.textContent = '';
    let section = null;
    shown.forEach((it, i) => {
      if (it.section && it.section !== section) {
        section = it.section;
        const h = document.createElement('div');
        h.className = 'palette-section';
        h.textContent = section;
        listBox.append(h);
      }
      const row = document.createElement('div');
      row.className = 'palette-row' + (i === active ? ' active' : '');
      row.id = 'palette-row-' + i;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === active ? 'true' : 'false');
      const ic = document.createElement('span');
      ic.className = 'palette-icon';
      const svg = it.doc ? docIcon() : iconOf(it.icon);
      if (svg) ic.append(svg);
      const name = document.createElement('span');
      name.className = 'palette-name';
      name.textContent = it.label;
      const meta = document.createElement('span');
      meta.className = 'palette-meta';
      meta.textContent = it.hint || it.group;
      row.append(ic, name, meta);
      if (it.combo) {
        const k = document.createElement('kbd');
        k.textContent = it.combo;
        row.append(k);
      }
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('mousemove', () => { if (active !== i) { active = i; mark(); } });
      row.addEventListener('click', () => choose(i));
      listBox.append(row);
    });
    $('palette-none').hidden = shown.length > 0;
    input.setAttribute('aria-activedescendant', shown.length ? 'palette-row-' + active : '');
  }

  function docIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ic');
    svg.innerHTML = '<path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4"/><path class="ic-a" d="M9 11h6M9 14.5h6M9 18h4"/>';
    return svg;
  }

  function mark() {
    listBox.querySelectorAll('.palette-row').forEach((r, i) => {
      r.classList.toggle('active', i === active);
      r.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
    const row = $('palette-row-' + active);
    if (row) row.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', row ? row.id : '');
  }

  function choose(i) {
    const it = shown[i];
    if (!it) return;
    remember(it.key);
    dialog.close();
    if (!it.menu) useEditor();
    // Après la fermeture : la sélection du texte est revenue, la commande agit dessus.
    setTimeout(() => {
      try { it.run(); } catch (e) { console.error('Palette de commandes :', e); }
    }, 0);
  }

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      mark();
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(shown.length - 1, active + (e.key === 'PageDown' ? 8 : -8)));
      mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  });
  dialog.addEventListener('mousedown', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (!welcomeOpen() && !document.querySelector('dialog[open]')) useEditor(); });

  function open() {
    if (dialog.open) { input.select(); return; }
    if (document.querySelector('dialog[open]')) return; // une autre fenêtre est ouverte
    all = collect();
    input.value = '';
    active = 0;
    render();
    dialog.showModal();
    input.focus();
  }

  document.getElementById('palette-btn').addEventListener('click', () => (dialog.open ? dialog.close() : open()));
  window.FTPalette = { open, toggle: () => (dialog.open ? dialog.close() : open()), items: () => collect() };
})();
