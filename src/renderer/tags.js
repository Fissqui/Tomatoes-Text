// Tags des documents : petites étiquettes colorées (un ou deux mots courts) affichées au-dessus
// du titre. Rangées dans le document ({ tags: [{ name, color }] }) ; un tag déjà utilisé dans le
// projet reprend sa couleur. Le bouton « Tags » de la barre d'insertion les liste, en ajoute et règle
// leur affichage au-dessus du document (aussi dans le menu Affichage).
(function () {
  const bar = document.getElementById('doc-tags');
  const page = document.getElementById('page');

  const COLORS = [
    ['rouge', 'Rouge', '#d4513d'], ['orange', 'Orange', '#e08a2e'], ['jaune', 'Jaune', '#c9a227'],
    ['vert', 'Vert', '#4f9a4f'], ['bleu', 'Bleu', '#3f7fcc'], ['violet', 'Violet', '#8560c4'],
    ['rose', 'Rose', '#cf5b98'], ['gris', 'Gris', '#83898f']
  ];
  const MAX_LENGTH = 24;
  const colorOf = (name) => (COLORS.find((c) => c[0] === name) || COLORS[COLORS.length - 1])[2];

  let tags = [];
  let onChange = () => {};
  let projectTags = () => [];
  let visible = true;
  let onVisible = () => {};

  // Pour comparer sans tenir compte des majuscules ni des accents.
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function clean(list) {
    const out = [];
    for (const t of Array.isArray(list) ? list : []) {
      const name = String((t && t.name) || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
      if (!name || out.some((o) => fold(o.name) === fold(name))) continue;
      out.push({ name, color: COLORS.some((c) => c[0] === t.color) ? t.color : 'gris' });
    }
    return out;
  }

  // Une étiquette (aussi utilisée par la gestion des projets et la mindmap).
  function chip(tag, small) {
    const el = document.createElement('span');
    el.className = 'ft-tag' + (small ? ' small' : '');
    el.style.setProperty('--tag', colorOf(tag.color));
    el.textContent = tag.name;
    return el;
  }

  // Couleur proposée pour un nouveau tag : celle qu'il a déjà dans le projet, sinon la suivante de la liste.
  function colorFor(name) {
    const known = projectTags().find((t) => fold(t.name) === fold(name));
    if (known) return known.color;
    const used = new Set(projectTags().map((t) => t.color));
    const free = COLORS.find((c) => !used.has(c[0]));
    return (free || COLORS[projectTags().length % COLORS.length])[0];
  }

  function changed() {
    render();
    onChange(tags.map((t) => ({ ...t })));
  }

  function add(name) {
    name = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
    if (!name || tags.some((t) => fold(t.name) === fold(name))) return;
    tags.push({ name, color: colorFor(name) });
    changed();
  }

  function tagMenu(tag, x, y) {
    window.FTSidebar.showMenu(x, y, [
      { label: `Tag « ${tag.name} »` },
      { icons: COLORS.map(([value, label, hex]) => ({
        html: `<span class="tag-swatch" style="--tag:${hex}"></span>`,
        title: label,
        on: tag.color === value,
        action: () => { tag.color = value; changed(); }
      })) },
      '-',
      { text: 'Renommer le tag…', action: () => edit(tag) },
      { text: 'Retirer ce tag', danger: true, action: () => { tags = tags.filter((t) => t !== tag); changed(); } }
    ]);
  }

  // Champ de saisie à la place du bouton « + Tag » (ou d'un tag qu'on renomme).
  async function edit(tag) {
    // Tags masqués au-dessus du document : le nom se change dans une fenêtre.
    if (tag && bar.hidden) {
      const value = await window.FTApp.ask('Nom du tag :', tag.name, { maxLength: MAX_LENGTH });
      const name = (value || '').replace(/\s+/g, ' ').trim();
      if (name && !tags.some((t) => t !== tag && fold(t.name) === fold(name))) { tag.name = name; changed(); }
      return;
    }
    const input = document.createElement('input');
    input.className = 'tag-input';
    input.maxLength = MAX_LENGTH;
    input.placeholder = 'Nouveau tag';
    input.value = tag ? tag.name : '';
    input.setAttribute('list', 'tag-suggestions');
    const list = document.createElement('datalist');
    list.id = 'tag-suggestions';
    for (const t of projectTags()) if (!tags.some((o) => fold(o.name) === fold(t.name))) list.append(new Option(t.name));
    const target = tag ? [...bar.children].find((c) => c.dataset.name === tag.name) : bar.querySelector('.tag-add');
    if (!target) return;
    target.replaceWith(input, list);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const value = input.value.replace(/\s+/g, ' ').trim();
      if (ok && value && tag) {
        if (!tags.some((t) => t !== tag && fold(t.name) === fold(value))) tag.name = value;
        changed();
      } else if (ok && value) {
        add(value);
      } else {
        render();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function render() {
    renderPop();
    bar.replaceChildren();
    bar.hidden = !visible || page.hidden;
    for (const tag of tags) {
      const el = chip(tag);
      el.dataset.name = tag.name;
      el.title = 'Clic : couleur, renommer ou retirer';
      el.addEventListener('click', (e) => tagMenu(tag, e.clientX, e.clientY));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); tagMenu(tag, e.clientX, e.clientY); });
      bar.append(el);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'tag-add';
    addBtn.textContent = tags.length ? '+' : '+ Tag';
    addBtn.title = 'Ajouter un tag à ce document (un ou deux mots courts)';
    addBtn.addEventListener('click', () => edit(null));
    bar.append(addBtn);
    // Les tags changent de hauteur : les pages suivent (tags placés après la page de titre).
    if (window.FTPages && window.FTPages.isPaged() && window.FTPages.hasCover()) window.FTPages.refresh();
  }

  // ----- Bouton « Tags » de la barre d'insertion -----

  const btn = document.getElementById('tags-btn');
  const pop = document.getElementById('tags-pop');
  const popList = document.getElementById('tags-pop-list');
  const popInput = document.getElementById('tags-pop-input');
  const popShow = document.getElementById('tags-pop-show');
  const suggestions = document.getElementById('tags-pop-suggestions');
  const laterRow = document.getElementById('tags-pop-later-row');
  const laterBox = document.getElementById('tags-pop-later');
  laterBox.addEventListener('change', () => window.FTPages.setTagsAfterCover(laterBox.checked));

  function renderPop() {
    btn.classList.toggle('has-tags', tags.length > 0);
    btn.title = tags.length ? `Tags du document : ${tags.map((t) => t.name).join(', ')}` : 'Tags du document';
    if (pop.hidden) return;
    popList.replaceChildren();
    for (const tag of tags) {
      const el = chip(tag);
      el.title = 'Couleur, renommer ou retirer';
      el.addEventListener('click', (e) => tagMenu(tag, e.clientX, e.clientY));
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); tagMenu(tag, e.clientX, e.clientY); });
      popList.append(el);
    }
    if (!tags.length) {
      const empty = document.createElement('span');
      empty.className = 'tags-pop-empty';
      empty.textContent = 'Aucun tag';
      popList.append(empty);
    }
    // Mode avancé avec une page de titre : les tags peuvent aller en haut de la page 2.
    const cover = window.FTPages && window.FTPages.isPaged() && window.FTPages.hasCover();
    laterRow.hidden = !cover;
    if (cover) laterBox.checked = window.FTPages.tagsAfterCover();
    suggestions.replaceChildren(...projectTags().filter((t) => !tags.some((o) => fold(o.name) === fold(t.name))).map((t) => new Option(t.name)));
    popShow.checked = visible;
  }

  function closePop() { pop.hidden = true; }
  btn.addEventListener('click', () => {
    if (!pop.hidden) return closePop();
    pop.hidden = false;
    renderPop();
    window.FTToolbar.placePop(pop, btn);
    popInput.value = '';
    popInput.focus();
  });
  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !e.target.closest('.tags-tool, .context-menu')) closePop();
  });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); btn.focus(); } });
  popInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    add(popInput.value);
    popInput.value = '';
  });
  popShow.addEventListener('change', () => {
    visible = popShow.checked;
    render();
    onVisible(visible);
  });

  window.FTTags = {
    COLORS,
    colorOf,
    chip,
    clean,
    fold,
    // Document ouvert.
    load(list) { tags = clean(list); render(); },
    get: () => tags.map((t) => ({ ...t })),
    onChange(fn) { onChange = fn; },
    setProjectTags(fn) { projectTags = fn; },
    setVisible(on) { visible = on !== false; render(); },
    onVisibleChange(fn) { onVisible = fn; },
    isVisible: () => visible
  };
})();
