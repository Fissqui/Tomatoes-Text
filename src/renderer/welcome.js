// Accueil au lancement : nouveau document, documents récents (tous projets), ouverture d'un fichier, projet.
// Ignoré quand le logiciel est lancé par un document (double-clic dans l'Explorateur) ; se rouvre par
// Fichier > Accueil ou par un clic sur le logo. Les récents sont gardés par app.js (réglages du logiciel).
(function () {
  const $ = (id) => document.getElementById(id);
  const box = $('welcome');
  const list = $('wl-list');
  const search = $('wl-search');
  const resume = $('wl-resume');
  const MAX_SHOWN = 8;
  let h = null; // actions fournies par app.js

  // Logo et nom repris de l'en-tête de la barre latérale (même dessin, mêmes couleurs de thème).
  function brand() {
    const head = document.querySelector('#sidebar .brand');
    const out = box.querySelector('.wl-brand');
    if (head) out.replaceChildren(...[...head.childNodes].map((n) => n.cloneNode(true)));
  }

  const ICONS = {
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15h6M9 18h4"/>',
    plus: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 11v7M8.5 14.5h7"/>',
    open: '<path d="M3 7V5h6l2 2h8v3"/><path d="M3 7v12h15l3-9H6l-3 9"/>',
    word: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M8.5 11l1.5 6 2-4.5 2 4.5 1.5-6"/>',
    project: '<path d="M3 6V5h6l2 2h10v12H3z"/><path d="M12 10.5v6M9 13.5h6"/>',
    tutorial: '<path d="M4 5.5c2.6-1 5.2-1 8 .8 2.8-1.8 5.4-1.8 8-.8v13c-2.6-1-5.2-1-8 .8-2.8-1.8-5.4-1.8-8-.8z"/><path d="M12 6.3v13.5"/>',
    model: '<path d="M4 3h10v14H4z"/><path d="M9 7h11v14H9"/><path d="M7 7h4M7 10h4M12 13h5M12 16h5"/>'
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${ICONS[k]}</svg>`;
  for (const [id, k] of [['wl-new', 'plus'], ['wl-model', 'model'], ['wl-open', 'open'], ['wl-word', 'word'], ['wl-project-new', 'project'], ['wl-tutorial', 'tutorial']]) {
    $(id).insertAdjacentHTML('afterbegin', icon(k));
  }

  // « aujourd'hui à 18:20 », « hier à 09:05 », « le 3 octobre », « le 3 octobre 2025 ».
  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hour = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const gap = Math.round((day(new Date()) - day(d)) / 86400000);
    if (gap === 0) return 'aujourd’hui à ' + hour;
    if (gap === 1) return 'hier à ' + hour;
    const opts = { day: 'numeric', month: 'long' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return 'le ' + d.toLocaleDateString('fr-FR', opts);
  }

  const words = (n) => (n || n === 0 ? `${n.toLocaleString('fr-FR')} mot${n > 1 ? 's' : ''}` : '');

  function meta(r, showProject) {
    return [showProject ? r.project : '', r.modified ? 'Modifié ' + when(r.modified) : '', words(r.words)].filter(Boolean).join(' · ');
  }

  function tagChips(r) {
    const out = document.createElement('span');
    out.className = 'wl-doc-tags';
    for (const t of (r.tags || []).slice(0, 3)) {
      const c = document.createElement('span');
      c.className = 'wl-tag';
      c.textContent = t.name;
      c.style.setProperty('--tag', window.FTTags.colorOf(t.color));
      out.append(c);
    }
    return out;
  }

  function card(r, big) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wl-doc' + (big ? ' wl-doc-big' : '');
    b.insertAdjacentHTML('afterbegin', `<span class="wl-doc-icon">${icon('doc')}</span>`);
    const body = document.createElement('span');
    body.className = 'wl-doc-body';
    const title = document.createElement('span');
    title.className = 'wl-doc-title';
    title.textContent = r.title || 'Sans titre';
    const m = document.createElement('span');
    m.className = 'wl-doc-meta';
    m.textContent = meta(r, true);
    body.append(title, m);
    if (r.excerpt) {
      const ex = document.createElement('span');
      ex.className = 'wl-doc-excerpt';
      ex.textContent = r.excerpt;
      body.append(ex);
    }
    b.append(body, tagChips(r));
    b.addEventListener('click', () => h.openRecent(r));
    return b;
  }

  function fold(s) {
    return window.FTTags.fold(String(s || ''));
  }

  function render() {
    if (!h) return;
    const all = h.recents();
    const q = fold(search.value.trim());
    let items;
    if (q) {
      // Recherche : les récents, puis les autres documents du projet ouvert.
      const pool = [...all];
      for (const d of h.projectDocs()) if (!pool.some((r) => r.id === d.id && r.project === d.project)) pool.push(d);
      items = pool.filter((r) => fold(r.title).includes(q) || fold(r.project).includes(q) || (r.tags || []).some((t) => fold(t.name).includes(q)));
    } else {
      items = all.slice(1, 1 + MAX_SHOWN);
    }
    resume.hidden = !!q || !all.length;
    const slot = resume.querySelector('.wl-resume-slot');
    slot.replaceChildren(...(all.length ? [card(all[0], true)] : []));
    list.replaceChildren(...items.map((r) => {
      const li = document.createElement('li');
      li.append(card(r, false));
      if (all.includes(r)) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'wl-forget';
        x.title = 'Retirer de la liste';
        x.setAttribute('aria-label', 'Retirer de la liste');
        x.textContent = '×';
        x.addEventListener('click', () => { h.forget(r); render(); });
        li.append(x);
      }
      return li;
    }));
    $('wl-list-title').textContent = q ? 'Résultats' : 'Documents récents';
    const none = $('wl-none');
    none.hidden = items.length > 0 || (!q && all.length > 0);
    none.textContent = q ? 'Aucun document trouvé.' : 'Aucun document récent.';
    // Projets.
    const { projects, project } = h.projects();
    const sel = $('wl-project');
    sel.replaceChildren(...projects.map((name) => {
      const o = new Option(name, name);
      o.selected = name === project;
      return o;
    }));
    $('wl-at-start').checked = h.atStart();
  }

  function show() {
    if (!h) return;
    brand();
    search.value = '';
    box.hidden = false;
    document.body.classList.add('welcome-open');
    render();
    const first = resume.hidden ? $('wl-new') : resume.querySelector('.wl-doc');
    first.focus();
  }

  function hide() {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('welcome-open');
  }

  $('wl-new').addEventListener('click', () => h.newDoc());
  $('wl-model').addEventListener('click', () => window.FTModeles.open({ create: true }));
  $('wl-open').addEventListener('click', () => h.openFile());
  $('wl-word').addEventListener('click', () => h.importWord());
  $('wl-project-new').addEventListener('click', () => h.newProject());
  $('wl-project').addEventListener('change', async (e) => { await h.switchProject(e.target.value); render(); });
  $('wl-at-start').addEventListener('change', (e) => h.setAtStart(e.target.checked));
  $('wl-tutorial').addEventListener('click', () => h.tutorial());
  $('wl-update').addEventListener('click', () => h.update());
  $('wl-close').addEventListener('click', () => h.close());
  search.addEventListener('input', render);
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (e.target === search && search.value) { search.value = ''; render(); return; }
    e.preventDefault();
    h.close();
  });

  let msgTimer = 0;
  function message(text) {
    const m = $('wl-msg');
    m.textContent = text;
    m.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { m.hidden = true; }, 6000);
  }

  window.FTWelcome = {
    init(actions) { h = actions; },
    message,
    show,
    hide,
    refresh: () => { if (!box.hidden) render(); },
    isOpen: () => !box.hidden,
    // Pour la palette de commandes : les récents (recent: true), puis les autres documents du projet.
    docs() {
      if (!h) return [];
      const out = h.recents().map((r) => ({ ...r, recent: true }));
      for (const d of h.projectDocs()) if (!out.some((r) => r.id === d.id && r.project === d.project)) out.push(d);
      return out;
    },
    openDoc: (r) => h && h.openRecent(r)
  };
})();
