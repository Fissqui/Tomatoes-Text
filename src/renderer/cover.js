// Page de titre : une page de couverture en tête du document, centrée verticalement, au choix
// parmi plusieurs modèles. Le bloc (div.ft-cover) n'est pas modifiable en entier : seuls ses
// champs le sont (organisme, titre, sous-titre, auteur, date, mention). Les champs vides montrent
// leur nom à l'écran et disparaissent à l'impression, à l'export et en mode lecture.
// En mode avancé, la page de titre occupe toute la première page (hauteur donnée par pages.js),
// sans en-tête, pied de page ni numéro.
(function () {
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  // Moteur 2.0 : le nouveau moteur (moteur/generes.js). La page de titre y est un bloc fermé dont
  // les champs s'écrivent dans l'affichage (comme une légende d'image, moteur/objets.js).
  let G = null;
  const dialog = $('cover-dialog');
  const list = $('cv-models');
  const okBtn = $('cv-ok');
  const removeBtn = $('cv-remove');

  // [identifiant, nom, description, famille]
  const MODELS = [
    ['classique', 'Classique', 'Titre entre deux filets', 'sobre'],
    ['elegant', 'Élégant', 'Italique et ornement', 'sobre'],
    ['minimal', 'Minimal', 'Titre fin et trait court', 'sobre'],
    ['cadre', 'Cadre', 'Double cadre autour de la page', 'sobre'],
    ['edition', 'Édition', 'Page de titre de livre, petites capitales', 'sobre'],
    ['cartouche', 'Cartouche', 'Titre dans un double encadré', 'sobre'],
    ['academique', 'Académique', 'Établissement en haut, auteur en bas', 'etudes'],
    ['these', 'Thèse', 'Établissement souligné, titre entre deux filets épais', 'etudes'],
    ['rapport', 'Rapport', 'Titre en couleur, aligné à gauche', 'etudes'],
    ['moderne', 'Moderne', 'Aligné à gauche, barre de couleur', 'etudes'],
    ['suisse', 'Suisse', 'Grand titre en bas, carré de couleur, pied en colonnes', 'etudes'],
    ['colonne', 'Colonne', 'Colonne de couleur à gauche, texte vertical', 'etudes'],
    ['bandeau', 'Bandeau', 'Titre sur une bande de couleur', 'graphique'],
    ['geometrique', 'Géométrique', 'Disques de couleur, titre en bas', 'graphique'],
    ['diagonale', 'Diagonale', 'Pied sur un fond coupé en biais', 'graphique'],
    ['magazine', 'Magazine', 'Très grand titre en capitales', 'graphique'],
    ['degrade', 'Dégradé', 'Page en dégradé de couleur', 'graphique'],
    ['ondes', 'Ondes', 'Lignes ondulées en bas de page', 'graphique'],
    ['prestige', 'Prestige', 'Filets dorés et coins ornés', 'raffine'],
    ['artdeco', 'Art déco', 'Fond bleu nuit, soleil et filets dorés', 'raffine'],
    ['nuit', 'Nuit', 'Fond sombre étoilé, titre fin', 'raffine'],
    ['botanique', 'Botanique', 'Fond crème et rameaux de feuillage', 'raffine'],
    ['aquarelle', 'Aquarelle', 'Taches de couleur estompées', 'raffine'],
    ['plan', 'Plan technique', 'Fond quadrillé et cartouche', 'raffine'],
    ['filet', 'Filet', 'Aligné à gauche, filet vertical de couleur', 'sobre'],
    ['epure', 'Épuré', 'Titre léger, capitales espacées', 'sobre'],
    ['initiale', 'Initiale', 'Première lettre agrandie, en couleur', 'sobre'],
    ['registre', 'Registre', 'Titre en bas sur un filet', 'sobre'],
    ['memoire', 'Mémoire', 'Établissement souligné, titre sur fond teinté', 'etudes'],
    ['stage', 'Rapport de stage', 'En-tête grisé, titre au centre', 'etudes'],
    ['administratif', 'Administratif', 'Organisme encadré, titre en capitales dans un cadre', 'etudes'],
    ['entreprise', 'Entreprise', 'Bande de couleur en haut, pied teinté', 'pro'],
    ['conseil', 'Conseil', 'Grand titre en bas, pied en colonnes', 'pro'],
    ['proposition', 'Proposition', 'Moitié haute sombre, titre en blanc', 'pro'],
    ['bilan', 'Bilan', 'Cercles de couleur, titre en gras', 'pro'],
    ['angles', 'Angles', 'Triangles de couleur aux coins', 'pro'],
    ['ardoise', 'Ardoise', 'Fond gris foncé, trait de couleur', 'pro'],
    ['roman', 'Roman', 'Grand titre au centre, mention en italique', 'livre'],
    ['poesie', 'Poésie', 'Titre italique, beaucoup de blanc', 'livre'],
    ['polar', 'Polar', 'Fond noir, bande rouge, titre massif', 'livre'],
    ['conte', 'Conte', 'Fond crème, cadre arrondi et fleurons', 'livre'],
    ['collection', 'Collection', 'Bandes de couleur en haut et en bas', 'livre'],
    ['cahier', 'Cahier', 'Lignes de cahier, écriture manuscrite', 'creatif'],
    ['pop', 'Pop', 'Trame de points, titre sur une étiquette', 'creatif'],
    ['confettis', 'Confettis', 'Pastilles de couleur', 'creatif'],
    ['retro', 'Rétro', 'Soleil couchant et bandes années 70', 'creatif'],
    ['pastel', 'Pastel', 'Formes douces aux couleurs pastel', 'creatif'],
    ['typo', 'Typographique', 'Très grand titre italique, guillemet en fond', 'creatif'],
    ['litterature', 'Littérature', 'Fond crème, double filet, titre centré', 'livre'],
    ['bloc', 'Bloc', 'Grand aplat de couleur, titre en blanc', 'livre'],
    ['contemporain', 'Contemporain', 'Grand titre à gauche entre deux filets fins', 'livre'],
    ['nocturne', 'Nocturne', 'Fond anthracite, titre clair centré', 'livre'],
    ['jaquette', 'Jaquette', 'Fond de couleur, titre sur un panneau clair', 'livre'],
    ['arche', 'Arche', 'Titre dans une arche de couleur', 'livre'],
    ['cem-essai', 'Essai', 'Fond crème, sigle et organisme en haut, trait rouge', 'cem'],
    ['cem-rouge', 'Rouge', 'Page rouge profond, textes crème', 'cem'],
    ['cem-reserve', 'Réserve', 'Bande rouge en haut avec le sigle', 'cem'],
    ['cem-pastille', 'Pastille', 'Centré, sigle rond au-dessus de l\'organisme', 'cem'],
    ['cem-affiche', 'Affiche', 'Haut de page rouge, pied crème', 'cem'],
    ['cem-aube', 'Aube', 'Grand disque dans le coin, titre en bas', 'cem']
  ];
  const FAMILIES = [['sobre', 'Sobres'], ['etudes', 'Études et travail'], ['pro', 'Professionnels'], ['livre', 'Livres et romans'], ['graphique', 'Graphiques'], ['creatif', 'Créatifs'], ['raffine', 'Raffinés'], ['cem', 'Essais du CEM']];
  // Champs, rangés en trois groupes : haut, centre, bas.
  const GROUPS = [
    ['head', [['surtitre', 'Organisme ou établissement']]],
    ['main', [['titre', 'Titre'], ['soustitre', 'Sous-titre']]],
    ['foot', [['auteur', 'Auteur'], ['date', 'Date'], ['mention', 'Mention (type de document, version)']]]
  ];
  const SAMPLE = {
    surtitre: 'Université de Lyon', titre: 'Titre du document', soustitre: 'Sous-titre',
    auteur: 'Prénom Nom', date: '', mention: 'Mémoire de master'
  };
  // Essais du Cercle économique marxiste : organisme et mention donnés d'avance (champs vides seulement).
  const CEM = { surtitre: 'Cercle économique marxiste', mention: 'Essai' };
  const isCem = (m) => /^cem-/.test(m);
  const isModel = (m) => MODELS.some(([id]) => id === m);

  const reading = () => document.getElementById('app').classList.contains('reading-mode');
  const current = () => {
    const first = editor.firstElementChild;
    return first && first.classList.contains('ft-cover') ? first : editor.querySelector(':scope > .ft-cover');
  };
  const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  function make(model, values = {}) {
    const cover = document.createElement('div');
    cover.className = 'ft-cover';
    cover.setAttribute('contenteditable', 'false');
    cover.dataset.model = isModel(model) ? model : 'classique';
    for (const [name, fields] of GROUPS) {
      const group = document.createElement('div');
      group.className = 'ft-cover-' + name;
      for (const [field, ph] of fields) {
        const p = document.createElement('p');
        p.className = 'ft-cover-field';
        p.dataset.field = field;
        p.dataset.ph = ph;
        p.setAttribute('contenteditable', 'true');
        p.spellcheck = true;
        if (values[field]) p.textContent = values[field];
        group.append(p);
      }
      cover.append(group);
    }
    return cover;
  }

  // Remet en ordre une page de titre ouverte ou collée : champs modifiables, champs vides vraiment vides.
  function refresh() {
    return G ? G.regen(refreshNow) : refreshNow();
  }
  function refreshNow() {
    const lock = reading();
    for (const cover of editor.querySelectorAll('.ft-cover')) {
      if (cover.getAttribute('contenteditable') !== 'false') cover.setAttribute('contenteditable', 'false');
      if (!isModel(cover.dataset.model)) cover.dataset.model = 'classique';
      for (const f of cover.querySelectorAll('.ft-cover-field')) {
        const want = lock ? 'false' : 'true';
        if (f.getAttribute('contenteditable') !== want) f.setAttribute('contenteditable', want);
        if (!lock && f.hasAttribute('data-rd-locked')) f.removeAttribute('data-rd-locked');
        if (!f.textContent.trim() && !f.querySelector('img') && f.innerHTML !== '') f.innerHTML = '';
      }
    }
  }

  const changed = () => editor.dispatchEvent(new Event('input'));

  function place(caretIn) {
    const r = document.createRange();
    r.selectNodeContents(caretIn);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Insère la page de titre en tête du document, ou change le modèle de celle qui existe.
  function apply(model) {
    if (G) {
      G.edit(() => build(model));
      // Première page refaite avant d'écrire dans le titre (pendant la saisie d'un champ, les pages ne
      // bougent pas).
      if (window.FTPages) window.FTPages.refresh();
      return show(current());
    }
    if (window.FTHistory) window.FTHistory.commit();
    build(model);
    changed();
    if (window.FTPages) window.FTPages.refresh();
    show(current());
  }

  // values : champs donnés par un modèle de mise en page (modeles.js) ; sur une page de titre qui existe,
  // ils ne remplissent que les champs vides.
  function build(model, values = {}) {
    if (isCem(model)) values = { ...CEM, ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)) };
    let cover = current();
    if (cover) {
      cover.dataset.model = isModel(model) ? model : 'classique';
      if (cover !== editor.firstElementChild) editor.prepend(cover);
      for (const [field, text] of Object.entries(values)) {
        const f = cover.querySelector(`.ft-cover-field[data-field="${field}"]`);
        if (f && text && !f.textContent.trim()) f.textContent = text;
      }
    } else {
      const title = editor.querySelector('h1.ft-title');
      const name = (title && title.textContent.trim()) || (window.FTApp && window.FTApp.docName()) || '';
      cover = make(model, { titre: name, date: today(), ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)) });
      editor.prepend(cover);
      // Une ligne après la page de titre pour continuer à écrire.
      let next = cover.nextElementSibling;
      while (next && next.classList.contains('ft-pg-gap')) next = next.nextElementSibling;
      if (!next) {
        next = document.createElement('p');
        next.append(document.createElement('br'));
        cover.after(next);
      }
    }
  }

  // Le curseur dans le titre de la page de titre.
  function show(cover) {
    if (!cover) return;
    const title = cover.querySelector('[data-field="titre"]');
    editor.focus({ preventScroll: true });
    title.focus({ preventScroll: true });
    place(title);
    cover.scrollIntoView({ block: 'start' });
  }

  function remove() {
    const cover = current();
    if (!cover) return;
    if (G) {
      G.edit(() => cover.remove());
      return;
    }
    if (window.FTHistory) window.FTHistory.commit();
    cover.remove();
    if (!editor.firstElementChild) editor.innerHTML = '<p><br></p>';
    changed();
    if (window.FTPages) window.FTPages.refresh();
  }

  // ----- Saisie dans les champs -----

  const fieldOf = (n) => {
    const el = n && (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement);
    const f = el && el.closest('.ft-cover-field');
    return f && editor.contains(f) ? f : null;
  };
  const caretField = () => {
    const sel = window.getSelection();
    return sel.rangeCount ? fieldOf(sel.anchorNode) : null;
  };

  // Entrée : champ suivant (après le dernier, la ligne qui suit la page de titre) ;
  // Maj+Entrée : retour à la ligne dans le champ ; Tab / Maj+Tab : champ suivant ou précédent.
  function onKey(e) {
    const f = caretField();
    if (!f || e.altKey || e.isComposing) return;
    const cover = f.closest('.ft-cover');
    const fields = [...cover.querySelectorAll('.ft-cover-field')];
    const go = (step) => {
      const i = fields.indexOf(f) + step;
      if (i >= 0 && i < fields.length) {
        fields[i].focus({ preventScroll: true });
        place(fields[i]);
        return;
      }
      if (step > 0) {
        let next = cover.nextElementSibling;
        while (next && next.classList.contains('ft-pg-gap')) next = next.nextElementSibling;
        if (!next) { next = document.createElement('p'); next.append(document.createElement('br')); cover.after(next); }
        editor.focus({ preventScroll: true });
        const r = document.createRange();
        r.selectNodeContents(next);
        r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    };
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      stop();
      if (e.shiftKey) document.execCommand('insertLineBreak');
      else go(1);
    } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      stop();
      go(e.shiftKey ? -1 : 1);
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && 'lerj'.includes(e.key.toLowerCase())) {
      // L'alignement suit le modèle.
      stop();
    }
  }

  // Collage : du texte seul, sur une ligne.
  function onPaste(e) {
    if (!fieldOf(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ').trim();
    if (text) document.execCommand('insertText', false, text);
  }
  function onDrop(e) {
    if (fieldOf(e.target)) e.preventDefault();
  }

  // Un champ vidé redevient vraiment vide (pour montrer son nom).
  function onInput(e) {
    const f = fieldOf(e.target);
    if (f && !f.textContent.trim() && !f.querySelector('img') && f.innerHTML !== '') f.innerHTML = '';
  }
  const LISTENERS = [['keydown', onKey, true], ['paste', onPaste, true], ['drop', onDrop, true], ['input', onInput, false]];
  for (const [type, fn, capture] of LISTENERS) editor.addEventListener(type, fn, capture);

  // ----- Fenêtre des modèles -----

  let choice = 'classique';

  function thumb(model, values) {
    const box = document.createElement('div');
    box.className = 'cv-thumb';
    box.append(make(model, values));
    return box;
  }

  function fill() {
    const cover = current();
    const values = { ...SAMPLE, date: today() };
    const own = new Set();
    if (cover) {
      for (const f of cover.querySelectorAll('.ft-cover-field')) if (f.textContent.trim()) { values[f.dataset.field] = f.textContent.trim(); own.add(f.dataset.field); }
    } else {
      const title = editor.querySelector('h1.ft-title');
      const name = (title && title.textContent.trim()) || (window.FTApp && window.FTApp.docName());
      if (name) values.titre = name;
    }
    const card = ([id, name, hint]) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'cv-card';
      c.dataset.model = id;
      c.setAttribute('role', 'option');
      c.setAttribute('aria-selected', String(id === choice));
      c.title = hint;
      const label = document.createElement('span');
      label.className = 'cv-name';
      label.textContent = name;
      const cem = isCem(id) ? Object.fromEntries(Object.entries(CEM).filter(([k]) => !own.has(k))) : {};
      c.append(thumb(id, { ...values, ...cem }), label);
      c.addEventListener('click', () => select(id));
      c.addEventListener('dblclick', () => { select(id); confirm(); });
      return c;
    };
    list.replaceChildren(...FAMILIES.flatMap(([fam, title]) => {
      const head = document.createElement('div');
      head.className = 'cv-family';
      head.textContent = title;
      return [head, ...MODELS.filter((m) => m[3] === fam).map(card)];
    }));
  }

  const cards = () => [...list.querySelectorAll('.cv-card')];

  function select(id) {
    choice = id;
    for (const c of cards()) c.setAttribute('aria-selected', String(c.dataset.model === id));
  }

  function open() {
    if (!window.FTApp || !window.FTApp.currentId() || !window.FTPages.isPaged()) return;
    const cover = current();
    choice = cover ? cover.dataset.model : 'classique';
    okBtn.textContent = cover ? 'Appliquer' : 'Insérer';
    removeBtn.hidden = !cover;
    fill();
    if (!dialog.open) dialog.showModal();
    const sel = list.querySelector('[aria-selected="true"]');
    if (sel) { sel.focus(); sel.scrollIntoView({ block: 'nearest' }); }
  }

  function confirm() {
    dialog.close();
    apply(choice);
  }

  okBtn.addEventListener('click', confirm);
  $('cv-cancel').addEventListener('click', () => dialog.close());
  removeBtn.addEventListener('click', () => { dialog.close(); remove(); });
  // Flèches : la vignette voisine dans ce sens (à l'écran, par-dessus les titres des familles).
  function neighbour(from, key) {
    const a = from.getBoundingClientRect();
    const [dx, dy] = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[key];
    let best = null;
    for (const c of cards()) {
      if (c === from) continue;
      const b = c.getBoundingClientRect();
      const x = b.left + b.width / 2 - (a.left + a.width / 2);
      const y = b.top + b.height / 2 - (a.top + a.height / 2);
      const along = x * dx + y * dy;
      if (along < 4) continue;
      const d = along + Math.abs(dx ? y : x) * 3;
      if (!best || d < best.d) best = { c, d };
    }
    if (best || dy) return best && best.c;
    // Au bout d'une rangée : la vignette suivante ou précédente dans l'ordre.
    const all = cards();
    return all[all.indexOf(from) + dx] || null;
  }
  list.addEventListener('keydown', (e) => {
    if (/^Arrow/.test(e.key)) {
      e.preventDefault();
      const from = cards().find((c) => c.dataset.model === choice) || cards()[0];
      const c = neighbour(from, e.key);
      if (c) {
        select(c.dataset.model);
        c.focus();
        c.scrollIntoView({ block: 'nearest' });
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  });

  const btn = $('cover-btn');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', open);
  // La page de titre n'a de sens qu'en mode avancé (pages) : le bouton est grisé en mode note.
  const title = btn.title;
  const pageEl = $('page');
  const syncBtn = () => {
    const paged = pageEl.classList.contains('paged');
    btn.disabled = !paged || !!$('page').hidden;
    btn.title = paged ? title : 'Page de titre : disponible en mode avancé';
  };
  new MutationObserver(syncBtn).observe(pageEl, { attributes: true, attributeFilter: ['class'] });
  syncBtn();

  const onAnyInput = () => { if (editor.querySelector('.ft-cover')) refresh(); };
  editor.addEventListener('input', onAnyInput);

  window.FTCover = {
    // Moteur 2.0 : page de titre du nouveau moteur.
    useEngine(mount, api) {
      for (const [type, fn, capture] of LISTENERS) {
        editor.removeEventListener(type, fn, capture);
        mount.addEventListener(type, fn, capture);
      }
      editor.removeEventListener('input', onAnyInput);
      editor = mount;
      G = api;
      api.add(() => { if (editor.querySelector(':scope > .ft-cover')) refreshNow(); });
    },
    syncButton: syncBtn,
    open,
    apply,
    remove,
    refresh,
    models: () => MODELS.map(([id, name]) => ({ id, name })),
    // Modèles de mise en page (modeles.js) : page de titre posée pendant un geste du moteur, vignette.
    build,
    thumb: (model, values) => thumb(model, { ...SAMPLE, date: today(), ...values }),
    // Clic droit sur la page de titre (structure.js).
    menuItems(target) {
      const cover = target.closest && target.closest('.ft-cover');
      if (!cover || !editor.contains(cover)) return [];
      return [
        { label: 'Page de titre' },
        { text: 'Changer de modèle…', action: open },
        { text: 'Supprimer la page de titre', danger: true, action: remove }
      ];
    }
  };
})();
