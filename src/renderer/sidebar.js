// Menu de gauche : choix du projet, sections (et sous-sections) et liste des documents.
(function () {
  const tree = document.getElementById('tree');
  const menu = document.getElementById('context-menu');
  const UNSORTED = '__non_classes__';
  const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

  // ----- Menu contextuel (clic droit ou bouton « ⋯ ») -----

  // Sous-menu (« Synonymes… ») : il s'ouvre au survol, à côté de l'entrée.
  const submenu = document.createElement('div');
  submenu.id = 'context-submenu';
  submenu.className = 'context-menu';
  submenu.hidden = true;
  document.body.appendChild(submenu);
  let subOwner = null;
  // Un clic dans le menu laisse le curseur dans le texte (Ctrl+Z annule aussitôt ce que le menu a fait).
  for (const box of [menu, submenu]) box.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });

  // Remplit un menu. Entrées possibles : '-', { label }, { note }, { explain },
  // { icons: [{ html, title, on, action }] } (rangée de petits boutons), { text, action | submenu }.
  function fill(box, items) {
    box.innerHTML = '';
    for (const item of items) {
      if (item === '-') {
        box.appendChild(document.createElement('hr'));
        continue;
      }
      if (item.note || item.explain) {
        const n = document.createElement('div');
        n.className = item.note ? 'menu-note' : 'menu-explain';
        n.textContent = item.note || item.explain;
        box.appendChild(n);
        continue;
      }
      if (item.icons) {
        const row = document.createElement('div');
        row.className = 'menu-icons';
        for (const icon of item.icons) {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = icon.html;
          b.title = icon.title;
          if (icon.on) b.classList.add('on');
          b.addEventListener('mouseenter', closeSub);
          b.addEventListener('click', () => { hideMenu(); icon.action(); });
          row.appendChild(b);
        }
        box.appendChild(row);
        continue;
      }
      if (item.label && !item.action && !item.submenu) {
        const l = document.createElement('div');
        l.className = 'menu-label';
        l.textContent = item.label;
        box.appendChild(l);
        continue;
      }
      const b = document.createElement('button');
      b.textContent = item.text;
      if (item.danger) b.className = 'danger';
      if (item.strong) b.className = 'strong';
      b.disabled = !!item.disabled;
      if (item.submenu) {
        b.classList.add('has-sub');
        b.addEventListener('mouseenter', () => openSub(b, item));
        b.addEventListener('click', () => openSub(b, item));
      } else {
        if (box === menu) b.addEventListener('mouseenter', closeSub);
        b.addEventListener('click', () => { hideMenu(); item.action(); });
      }
      box.appendChild(b);
    }
  }

  function placeSub(anchor) {
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const r = submenu.getBoundingClientRect();
    const right = m.right - 2;
    submenu.style.left = (right + r.width > window.innerWidth - 8 ? m.left - r.width + 2 : right) + 'px';
    submenu.style.top = Math.max(8, Math.min(a.top - 5, window.innerHeight - r.height - 8)) + 'px';
  }

  async function openSub(anchor, item) {
    if (subOwner === anchor && !submenu.hidden) return;
    subOwner = anchor;
    menu.querySelectorAll('.has-sub.open').forEach((b) => b.classList.remove('open'));
    anchor.classList.add('open');
    fill(submenu, [{ label: 'Recherche…' }]);
    submenu.hidden = false;
    placeSub(anchor);
    let items;
    try { items = await item.submenu(); } catch { items = []; }
    if (subOwner !== anchor || menu.hidden) return;
    fill(submenu, items.length ? items : [{ label: 'Rien trouvé' }]);
    placeSub(anchor);
  }

  function closeSub() {
    subOwner = null;
    submenu.hidden = true;
    menu.querySelectorAll('.has-sub.open').forEach((b) => b.classList.remove('open'));
  }

  function showMenu(x, y, items) {
    closeSub();
    fill(menu, items);
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  }

  function hideMenu() {
    menu.hidden = true;
    closeSub();
  }

  document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target) && !submenu.contains(e.target)) hideMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu(); });
  window.addEventListener('blur', hideMenu);

  function attachMenu(el, moreBtn, getItems) {
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, getItems());
    });
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = moreBtn.getBoundingClientRect();
      showMenu(r.left, r.bottom + 2, getItems());
    });
  }

  function moreButton(title) {
    const b = document.createElement('button');
    b.className = 'more-btn';
    b.textContent = '⋯';
    b.title = title;
    return b;
  }

  // ----- Affichage -----

  // Une section peut contenir jusqu'à trois étages de sous-sections.
  const MAX_DEPTH = 3;

  function children(section) {
    return Array.isArray(section.children) ? section.children : [];
  }

  // Liste à plat de toutes les sections, avec leur profondeur (pour « Déplacer vers »).
  function flatten(sections, depth = 0, out = []) {
    for (const s of sections) {
      out.push({ section: s, depth });
      flatten(children(s), depth + 1, out);
    }
    return out;
  }

  function renderProjects(state, h) {
    const select = document.getElementById('project-select');
    select.replaceChildren(...state.projects.map((name) => {
      const o = new Option(name, name);
      o.selected = name === state.project;
      return o;
    }));
    select.title = `Projet : dossier « ${state.folder} »`;
    select.onchange = () => h.switchProject(select.value);
  }

  // state : { projects, project, sections, placement, docs }, active : nom du fichier ouvert,
  // h : actions fournies par app.js.
  let shown = null;
  let last = null;
  const search = document.getElementById('tree-search');

  // Recherche : par nom (document ou section) et par tag ; « #mot » ne regarde que les tags.
  function matcher() {
    const raw = search.value.trim();
    if (!raw) return null;
    const fold = window.FTTags.fold;
    const tagOnly = raw.startsWith('#');
    const q = fold(raw.replace(/^#/, ''));
    if (!q) return null;
    const tagHit = (doc) => (doc.tags || []).some((t) => fold(t.name).includes(q));
    return {
      doc: (doc) => tagHit(doc) || (!tagOnly && fold(doc.title).includes(q)),
      section: (section) => !tagOnly && section.id !== UNSORTED && fold(section.name).includes(q)
    };
  }

  search.addEventListener('input', () => { if (last) render(...last); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; if (last) render(...last); } });

  function render(state, active, h) {
    last = [state, active, h];
    if (active !== shown) tree.classList.remove('idle'); // un autre document vient de s'ouvrir
    shown = active;
    renderProjects(state, h);
    tree.innerHTML = '';
    const flat = flatten(state.sections);
    const known = new Set(flat.map((f) => f.section.id));
    const groups = new Map(flat.map((f) => [f.section.id, []]));
    groups.set(UNSORTED, []);
    for (const doc of state.docs) {
      const sid = state.placement[doc.id];
      groups.get(known.has(sid) ? sid : UNSORTED).push(doc);
    }
    for (const list of groups.values()) list.sort((a, b) => collator.compare(a.title, b.title));
    const match = matcher();
    const ctx = { state, active, h, groups, flat, match };
    tree.classList.toggle('searching', !!match);

    state.sections.forEach((section, i) => {
      if (!match || hasMatch(section, ctx)) tree.appendChild(sectionEl(section, 0, state.sections, i, ctx));
    });

    const unsorted = groups.get(UNSORTED);
    const unsortedSection = { id: UNSORTED, name: 'Non classés', collapsed: !!state.unsortedCollapsed };
    if ((state.sections.length === 0 || unsorted.length > 0) && (!match || hasMatch(unsortedSection, ctx))) {
      tree.appendChild(sectionEl(unsortedSection, 0, [], 0, ctx));
    }
    if (match && !tree.children.length) {
      const none = document.createElement('p');
      none.className = 'tree-none';
      none.textContent = 'Aucun document ni section ne correspond.';
      tree.appendChild(none);
    }
  }

  // La section, un de ses documents ou une de ses sous-sections correspond à la recherche.
  function hasMatch(section, ctx) {
    const { match, groups } = ctx;
    return match.section(section) || (groups.get(section.id) || []).some(match.doc) || children(section).some((c) => hasMatch(c, ctx));
  }

  function countDocs(section, groups) {
    return (groups.get(section.id) || []).length + children(section).reduce((n, c) => n + countDocs(c, groups), 0);
  }

  // inside : un parent correspond déjà à la recherche (tout son contenu est montré).
  function sectionEl(section, depth, siblings, index, ctx, inside = false) {
    const { h, groups, match } = ctx;
    const isUnsorted = section.id === UNSORTED;
    const all = match && (inside || match.section(section));
    const docs = (groups.get(section.id) || []).filter((d) => !match || all || match.doc(d));
    const subs = children(section).filter((c) => !match || all || hasMatch(c, ctx));

    const wrap = document.createElement('div');
    wrap.className = 'section' + (section.collapsed && !match ? ' collapsed' : '');
    wrap.dataset.depth = depth;

    const header = document.createElement('div');
    header.className = 'section-header';
    header.innerHTML = '<span class="chevron">▼</span><span class="name"></span><span class="count"></span>';
    header.querySelector('.name').textContent = section.name;
    header.querySelector('.count').textContent = String(countDocs(section, groups));
    header.addEventListener('click', () => h.toggleSection(section.id));
    const more = moreButton('Options de la section');
    header.appendChild(more);
    attachMenu(header, more, () => {
      const items = [{ text: 'Nouveau document ici', action: () => h.newDoc(isUnsorted ? null : section.id) }];
      if (!isUnsorted) {
        if (depth < MAX_DEPTH) items.push({ text: 'Nouvelle sous-section', action: () => h.newSection(section.id) });
        items.push(
          '-',
          { text: 'Renommer la section', action: () => h.renameSection(section.id) },
          { text: 'Monter', disabled: index === 0, action: () => h.moveSection(section.id, -1) },
          { text: 'Descendre', disabled: index === siblings.length - 1, action: () => h.moveSection(section.id, 1) },
          '-',
          { text: 'Supprimer la section', danger: true, action: () => h.deleteSection(section.id) }
        );
      }
      return items;
    });
    wrap.appendChild(header);

    const body = document.createElement('div');
    body.className = 'section-body';
    subs.forEach((sub, i) => body.appendChild(sectionEl(sub, depth + 1, subs, i, ctx, all)));
    const ul = document.createElement('ul');
    ul.className = 'doc-list';
    if (docs.length === 0 && subs.length === 0 && !match) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Glissez un document ici';
      ul.appendChild(li);
    }
    for (const doc of docs) ul.appendChild(docItem(doc, ctx));
    body.appendChild(ul);
    wrap.appendChild(body);

    // Glisser-déposer d'un document vers une section (la plus intérieure sous la souris).
    wrap.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-frametext-doc')) return;
      e.preventDefault();
      e.stopPropagation();
      tree.querySelectorAll('.drop-target').forEach((el) => { if (el !== wrap) el.classList.remove('drop-target'); });
      wrap.classList.add('drop-target');
    });
    wrap.addEventListener('dragleave', (e) => {
      if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('drop-target');
    });
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wrap.classList.remove('drop-target');
      const id = e.dataTransfer.getData('application/x-frametext-doc');
      if (id) h.moveDoc(id, isUnsorted ? null : section.id);
    });
    return wrap;
  }

  function docItem(doc, { state, active, h, flat }) {
    const li = document.createElement('li');
    li.className = 'doc-item' + (doc.fileName === active ? ' active' : '') + (doc.missing ? ' missing' : '');
    li.draggable = true;
    li.title = doc.missing
      ? `${doc.title}\nFichier introuvable : ${doc.fileName}\nClic droit : « Localiser le fichier… »`
      : `${doc.title}\nModifié le ${new Date(doc.modified).toLocaleString('fr-FR')}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = doc.title || 'Sans titre';
    li.appendChild(name);
    // Tags : de petits points de couleur à droite du nom.
    const tags = window.FTTags.clean(doc.tags);
    if (tags.length) {
      const dots = document.createElement('span');
      dots.className = 'doc-tags';
      for (const t of tags.slice(0, 4)) {
        const dot = document.createElement('span');
        dot.style.setProperty('--tag', window.FTTags.colorOf(t.color));
        dots.appendChild(dot);
      }
      li.appendChild(dots);
      li.title += '\nTags : ' + tags.map((t) => t.name).join(', ');
    }
    // Résumé du document par l'AAT (summary.js).
    const sum = document.createElement('button');
    sum.className = 'more-btn sum-btn';
    sum.title = 'Résumer ce document (Aide au Texte)';
    sum.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3 3.5h10M3 6.5h10M3 9.5h6"/><path d="M11.5 9.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z"/></svg>';
    sum.addEventListener('click', (e) => { e.stopPropagation(); h.summarize(doc.fileName); });
    li.appendChild(sum);
    const more = moreButton('Options du document');
    li.appendChild(more);

    li.addEventListener('click', () => h.openDoc(doc.fileName));
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-frametext-doc', doc.id);
      e.dataTransfer.effectAllowed = 'move';
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));

    attachMenu(li, more, () => {
      const current = state.placement[doc.id] || null;
      const targets = [{ id: null, name: 'Non classés', depth: 0 }, ...flat.map((f) => ({ id: f.section.id, name: f.section.name, depth: f.depth }))];
      const moves = targets
        .filter((t) => t.id !== current && (t.id === null ? current !== null : true))
        .map((t) => ({ text: '\u00a0\u00a0\u00a0'.repeat(t.depth) + '→ ' + t.name, action: () => h.moveDoc(doc.id, t.id) }));
      if (doc.missing) {
        return [
          { note: 'Fichier introuvable : ' + doc.fileName },
          { text: 'Localiser le fichier…', action: () => h.locateDoc(doc.id) },
          { text: 'Retirer de la liste', action: () => h.forgetDoc(doc.id) },
          '-',
          { label: 'Déplacer vers' },
          ...moves
        ];
      }
      return [
        { text: 'Ouvrir', action: () => h.openDoc(doc.fileName) },
        { text: 'Renommer', action: () => h.renameDoc(doc.fileName) },
        { text: 'Enregistrer une copie sous…', action: () => h.exportDoc(doc.fileName) },
        { text: 'Historique des versions…', action: () => h.versions(doc.fileName) },
        { text: 'Résumer (AAT)…', action: () => h.summarize(doc.fileName) },
        { text: 'Vérifier la cohérence…', action: () => window.FTCoherence.open(doc.id) },
        '-',
        { label: 'Déplacer vers' },
        ...targets
          .filter((t) => t.id !== current && (t.id === null ? current !== null : true))
          .map((t) => ({ text: '\u00a0\u00a0\u00a0'.repeat(t.depth) + '→ ' + t.name, action: () => h.moveDoc(doc.id, t.id) })),
        '-',
        { text: 'Supprimer (corbeille)', danger: true, action: () => h.deleteDoc(doc.fileName) }
      ];
    });
    return li;
  }

  // Un clic ailleurs que sur un document retire la surbrillance du document ouvert ; elle revient
  // au prochain clic sur un document.
  document.addEventListener('mousedown', (e) => {
    const item = e.target.closest && e.target.closest('.doc-item');
    if (e.target.closest && e.target.closest('.context-menu')) return;
    tree.classList.toggle('idle', !item);
  }, true);

  window.FTSidebar = { render, showMenu, UNSORTED, MAX_DEPTH };
})();
