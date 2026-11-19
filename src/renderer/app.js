// Logique générale : bibliothèque, ouverture/enregistrement, thème.
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const nameLabel = $('doc-name');
  const statusSave = $('status-save');
  const statusCount = $('status-count');
  const AUTOSAVE_DELAY = 1200;

  let lib = { projects: [], project: null, sections: [], placement: {}, docs: [] };
  let settings = {};
  let current = null; // { fileName, doc }
  let dirty = false;
  let saveTimer = null;
  let saving = Promise.resolve();
  // Raison du dernier échec d'enregistrement ('' : le dernier enregistrement a réussi).
  let saveError = '';
  // Mode présentation : { lastFile } (document ouvert avant d'y entrer), sinon null.
  let presenting = null;

  // Raison d'une erreur, sans l'en-tête technique ajouté quand elle vient du processus principal ; les
  // refus courants du système sont dits en clair (le chemin du fichier n'apprend rien de plus).
  const CAUSES = {
    ENOSPC: 'disque plein', EACCES: 'accès refusé', EPERM: 'accès refusé', EROFS: 'disque en lecture seule',
    EBUSY: 'fichier utilisé par un autre programme', ENOENT: 'dossier introuvable', ENOTDIR: 'dossier introuvable'
  };
  const reason = (err) => {
    const text = String((err && err.message) || err).replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^(Error:\s*)+/, '');
    const code = /^(E[A-Z]+):/.exec(text);
    return (code && CAUSES[code[1]]) || text;
  };

  // ----- Fenêtre de saisie (remplace prompt/confirm, absents d'Electron) -----

  const modal = $('modal');
  // Entrée valide (le bouton Annuler n'est pas celui du formulaire), Échap annule.
  $('modal-cancel').addEventListener('click', () => modal.close('cancel'));

  function ask(message, value = '', { okLabel = 'Valider', cancelLabel = 'Annuler', input = true, maxLength = 80 } = {}) {
    return new Promise((resolve) => {
      $('modal-message').textContent = message;
      const field = $('modal-input');
      field.hidden = !input;
      field.maxLength = maxLength;
      field.value = value;
      $('modal-ok').textContent = okLabel;
      $('modal-cancel').textContent = cancelLabel;
      modal.returnValue = '';
      modal.showModal();
      if (input) { field.focus(); field.select(); } else $('modal-ok').focus();
      modal.addEventListener('close', () => {
        if (modal.returnValue !== 'ok') return resolve(null);
        resolve(input ? field.value.trim() : true);
      }, { once: true });
    });
  }
  const confirmAction = (message, okLabel) => ask(message, '', { okLabel, input: false });

  // ----- Réglages -----

  function applyTheme() {
    // Trois modes : jour (tout clair), crépuscule (tout sombre sauf la page et son texte), lune (tout sombre).
    const mode = THEME_MODES.includes(settings.theme)
      ? settings.theme
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const root = document.documentElement;
    root.dataset.theme = mode === 'light' ? 'light' : 'dark';
    if (mode === 'twilight') root.dataset.paper = 'light';
    else delete root.dataset.paper;
    window.FTCustomize.apply();
    const btn = $('theme-toggle');
    btn.dataset.mode = mode;
    btn.innerHTML = THEME_ICONS[mode];
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    btn.title = `Mode ${THEME_NAMES[mode]}. Cliquez pour passer en mode ${THEME_NAMES[next]} (Ctrl+D).`;
    btn.setAttribute('aria-label', 'Mode ' + THEME_NAMES[mode]);
  }

  const THEME_MODES = ['light', 'twilight', 'dark'];
  const THEME_NAMES = { light: 'jour', twilight: 'crépuscule', dark: 'lune' };
  const THEME_ICONS = {
    light: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.6"/><path d="M10 2.2v2M10 15.8v2M2.2 10h2M15.8 10h2M4.5 4.5l1.4 1.4M14.1 14.1l1.4 1.4M4.5 15.5l1.4-1.4M14.1 5.9l1.4-1.4"/></svg>',
    twilight: '<svg viewBox="0 0 20 20"><path d="M5.6 13.2a4.4 4.4 0 0 1 8.8 0"/><path d="M2.2 13.2h15.6M5 16.4h10M10 4.2v2.2M4.1 7.3l1.5 1.5M15.9 7.3l-1.5 1.5"/></svg>',
    dark: '<svg viewBox="0 0 20 20"><path d="M15.6 12.6A6.4 6.4 0 0 1 7.4 4.4a6.4 6.4 0 1 0 8.2 8.2z"/><path d="M14.2 3.2v2.4M13 4.4h2.4"/></svg>'
  };

  function toggleTheme() {
    const cur = THEME_MODES.includes(settings.theme)
      ? settings.theme
      : (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    settings.theme = THEME_MODES[(THEME_MODES.indexOf(cur) + 1) % THEME_MODES.length];
    applyTheme();
    api.saveSettings(settings);
  }

  function toggleSidebar() {
    settings.sidebarHidden = !settings.sidebarHidden;
    $('app').classList.toggle('sidebar-hidden', settings.sidebarHidden);
    api.saveSettings(settings);
  }

  // ----- Place du document -----
  // Volets trop nombreux pour la fenêtre : la zone du document garde une largeur utile. Les volets PDF et
  // Sources cèdent d'abord (styles.css) ; s'il le faut, les autres volets se referment, le dernier ouvert reste.
  const DOC_MIN = 360;
  const isOpen = (id) => $(id).classList.contains('open');
  const PANES = [
    { open: () => window.FTNav.isVisible(), need: () => parseFloat(getComputedStyle($('navpane')).getPropertyValue('--nav-w')) || 250, close: () => window.FTNav.toggle() },
    { open: () => !!settings && !settings.sidebarHidden, need: () => $('sidebar').offsetWidth, close: toggleSidebar },
    { open: () => isOpen('srcpane'), need: () => 300, close: () => $('src-close').click() },
    { open: () => isOpen('pdfpane'), need: () => 300, close: () => window.FTSourcePdf.toggle() },
    { open: () => isOpen('assist'), need: () => 340, close: () => window.FTAssistant.toggle(false) }
  ];
  let paneOrder = []; // ordre d'ouverture, le plus récent en dernier
  function fitPanes() {
    if (!settings || $('app').classList.contains('reading-mode')) return;
    const now = PANES.filter((p) => p.open());
    paneOrder = paneOrder.filter((p) => now.includes(p)).concat(now.filter((p) => !paneOrder.includes(p)));
    const latest = paneOrder[paneOrder.length - 1];
    let need = DOC_MIN + now.reduce((n, p) => n + p.need(), 0);
    for (const p of now) {
      if (need <= window.innerWidth) break;
      if (p === latest) continue;
      need -= p.need();
      p.close();
    }
  }
  const paneWatch = new MutationObserver(fitPanes);
  for (const id of ['app', 'srcpane', 'pdfpane', 'assist']) paneWatch.observe($(id), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', fitPanes);

  // ----- Bibliothèque -----

  async function reloadLibrary(project) {
    const before = lib && lib.project;
    lib = await api.loadLibrary(project);
    if (before !== undefined && before !== lib.project && window.FTSourcePdf) window.FTSourcePdf.reset();
    renderSidebar();
    if (window.FTMindmap) window.FTMindmap.refresh();
  }

  function saveIndex() {
    return api.saveLibraryIndex({ sections: lib.sections, placement: lib.placement, unsortedCollapsed: !!lib.unsortedCollapsed });
  }

  // Liens (( )) du document ouvert, tels qu'ils sont à l'écran.
  function liveLinks() {
    return [...new Set([...document.querySelectorAll('#editor a.ft-doclink[data-doc]')].map((a) => a.dataset.doc))];
  }

  // Tous les tags du projet (une fois chacun), avec leur couleur ; ceux du document ouvert tels qu'à l'écran.
  function projectTags() {
    const out = [];
    const open = current ? current.doc.id : null;
    for (const d of lib.docs) {
      for (const t of d.id === open ? window.FTTags.get() : d.tags || []) {
        if (!out.some((o) => window.FTTags.fold(o.name) === window.FTTags.fold(t.name))) out.push(t);
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  // Contenu d'un document (non ouvert) lu sur le disque, gardé tant qu'il n'a pas changé.
  const bodies = new Map();
  async function docBody(entry) {
    const key = entry.fileName + '|' + entry.modified;
    if (bodies.has(key)) return bodies.get(key);
    let body = null;
    try {
      const doc = await api.readDoc(entry.fileName);
      // Un espace à la fin de chaque paragraphe : les mots de deux lignes ne se collent pas.
      const html = String((doc.content && doc.content.html) || '').replace(/<\/(p|li|h[1-6]|td|th|div|blockquote)>|<br\s*\/?>/gi, ' $&');
      body = new DOMParser().parseFromString(html, 'text/html').body;
    } catch { /* fichier illisible */ }
    if (bodies.size > 60) bodies.delete(bodies.keys().next().value);
    bodies.set(key, body);
    return body;
  }

  // La phrase autour d'un lien (( )), coupée à quelques centaines de caractères.
  function snippetOf(a) {
    const block = a.closest('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, div:not(#editor)') || a.parentElement;
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEndBefore(a);
    let before = range.toString().replace(/\s+/g, ' ');
    range.selectNodeContents(block);
    range.setStartAfter(a);
    let after = range.toString().replace(/\s+/g, ' ');
    const cut = before.search(/[.!?…]\s+(?=[^.!?…]*$)/);
    if (cut >= 0) before = before.slice(cut + 1).trimStart();
    const end = after.search(/[.!?…](\s|$)/);
    if (end >= 0) after = after.slice(0, end + 1);
    if (before.length > 160) before = '…' + before.slice(-160).replace(/^\S*\s/, '');
    if (after.length > 160) after = after.slice(0, 160).replace(/\s\S*$/, '') + '…';
    return { before, link: a.textContent, after };
  }

  function renderSidebar() {
    window.FTSidebar.render(lib, current && current.fileName, handlers);
  }

  function newId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Sections imbriquées : retrouve une section, la liste qui la contient et ses ancêtres.
  function findSection(id, list = lib.sections, parents = []) {
    for (const s of list) {
      if (s.id === id) return { section: s, siblings: list, parents };
      const found = findSection(id, s.children || [], [...parents, s]);
      if (found) return found;
    }
    return null;
  }

  function allIds(section) {
    return [section.id, ...(section.children || []).flatMap(allIds)];
  }

  async function addSection(parentId) {
    const parent = parentId ? findSection(parentId) : null;
    const name = await ask(parent ? `Nom de la sous-section de « ${parent.section.name} » :` : 'Nom de la nouvelle section :', '');
    if (!name) return;
    const section = { id: newId(), name, collapsed: false, children: [] };
    if (parent) {
      parent.section.children = parent.section.children || [];
      parent.section.children.push(section);
      parent.section.collapsed = false;
    } else {
      lib.sections.push(section);
    }
    await saveIndex();
    renderSidebar();
  }

  // ----- Projets -----

  async function switchProject(name) {
    if (name === lib.project) return;
    await flushSave();
    if (current) closeDoc();
    await reloadLibrary(name);
    if (lib.docs.length === 0) await newDoc(null, { quiet: true });
  }

  async function createProject() {
    const name = await ask('Nom du nouveau projet (un dossier de ce nom sera créé dans le stockage) :', '');
    if (!name) return;
    const res = await api.createProject(name);
    if (res.error) return flash(res.error);
    await flushSave();
    if (current) closeDoc();
    await reloadLibrary(res.project);
    await newDoc(null);
  }

  async function renameProject() {
    const name = await ask('Nouveau nom du projet (son dossier sera renommé) :', lib.project);
    if (!name) return;
    await flushSave();
    const reopen = current && current.fileName;
    if (current) closeDoc();
    const before = lib.project;
    const res = await api.renameProject(name);
    if (res.error) flash(res.error);
    else if (res.project !== before) {
      for (const r of recents()) if (r.project === before) r.project = res.project;
      api.saveSettings(settings);
    }
    await reloadLibrary(res.project || lib.project);
    if (reopen && lib.docs.some((d) => d.fileName === reopen)) await openDoc(reopen);
  }

  async function deleteProject() {
    const count = lib.docs.length;
    const what = count === 1 ? ' et son document' : count > 1 ? ` et ses ${count} documents` : '';
    const ok = await confirmAction(`Supprimer le projet « ${lib.project} »${what} ? Son dossier sera mis à la corbeille de Windows : vous pourrez encore le récupérer.`, 'Supprimer le projet');
    if (!ok) return;
    await flushSave();
    if (current) {
      clearTimeout(saveTimer);
      dirty = false;
      closeDoc();
    }
    const gone = lib.project;
    const res = await api.deleteProject();
    if (res.error) flash(res.error);
    else {
      settings.recent = recents().filter((r) => r.project !== gone);
      api.saveSettings(settings);
    }
    await reloadLibrary();
    if (lib.docs.length === 0) await newDoc(null, { quiet: true });
  }

  async function chooseStorage() {
    await flushSave();
    const dir = await api.chooseStorage();
    if (!dir) return;
    if (current) closeDoc();
    await reloadLibrary();
    flash('Dossier de stockage : ' + dir);
    if (lib.docs.length === 0) await newDoc(null, { quiet: true });
  }

  function projectMenu() {
    const r = $('project-more').getBoundingClientRect();
    window.FTSidebar.showMenu(r.left, r.bottom + 2, [
      { text: 'Nouveau projet…', action: createProject },
      { text: 'Renommer le projet…', action: renameProject },
      { text: 'Ouvrir le dossier du projet', action: () => api.openLibraryFolder() },
      { text: 'Supprimer le projet…', danger: true, action: deleteProject },
      ...(presenting ? [] : ['-',
        { label: 'Dossier de stockage' },
        { note: lib.storageDir },
        { text: 'Changer le dossier de stockage…', action: chooseStorage }])
    ]);
  }

  // ----- Mode présentation -----
  // Un projet de démonstration recopié à part ; les projets de l'utilisateur ne sont pas touchés.

  const PRESENTATION_FIRST = 'Bienvenue';

  async function startPresentation() {
    if (presenting) return;
    await flushSave();
    presenting = { lastFile: settings.lastFile };
    if (current) closeDoc();
    const res = await api.presentationStart();
    await reloadLibrary(res.project);
    showPresentation(true);
    const first = lib.docs.find((d) => d.title === PRESENTATION_FIRST) || lib.docs[0];
    if (first) await openDoc(first.fileName);
  }

  async function stopPresentation() {
    if (!presenting) return;
    await flushSave();
    if (current) {
      clearTimeout(saveTimer);
      dirty = false;
      closeDoc();
    }
    const { lastFile } = presenting;
    await api.presentationStop();
    presenting = null;
    showPresentation(false);
    await reloadLibrary();
    if (lastFile && lib.docs.some((d) => d.fileName === lastFile)) await openDoc(lastFile);
    else if (lib.docs.length === 0) await newDoc(null, { quiet: true });
  }

  function showPresentation(on) {
    $('presentation-bar').hidden = !on;
    $('app').classList.toggle('presenting', on);
  }
  $('presentation-quit').addEventListener('click', stopPresentation);

  // ----- Tutoriel -----
  // Projet « Tutoriel » installé dans le stockage (main.js) ; on y ouvre le document d'accueil.

  const TUTORIAL_FIRST = '1. Bienvenue dans Tomatoes Text';

  async function openTutorial() {
    if (presenting) await stopPresentation();
    const res = await api.tutorialOpen();
    if (res.error) return flash(res.error);
    window.FTWelcome.hide();
    await flushSave();
    if (current) closeDoc();
    await reloadLibrary(res.project);
    const first = lib.docs.find((d) => d.title === TUTORIAL_FIRST) || lib.docs[0];
    if (first) await openDoc(first.fileName);
  }

  // Premier lancement (une seule fois) : fenêtre qui présente LanguageTool (bouton d'installation, avec
  // l'avancement), le LLM local de l'aide au texte (bouton pour indiquer son emplacement), puis le tutoriel.
  let firstRunOpen = false;
  const LT_STEPS = {
    download: 'Téléchargement…',
    extract: 'Installation des fichiers…',
    start: 'Premier démarrage…',
    done: 'Installé.',
    error: 'Installation impossible.'
  };

  function firstRunState(id, text, kind) {
    const el = $(id);
    el.textContent = text || '';
    el.classList.toggle('fr-ok', kind === 'ok');
    el.classList.toggle('fr-error', kind === 'error');
  }

  // Avancement de l'installation de LanguageTool, dans la fenêtre.
  function firstRunLanguageTool(p) {
    const finished = p.step === 'done' || p.step === 'error';
    $('fr-lt-install').hidden = p.step !== 'error';
    $('fr-lt-install').textContent = 'Réessayer';
    firstRunState('fr-lt-state', LT_STEPS[p.step] + (finished ? '' : ` ${p.pct} %`), p.step === 'done' ? 'ok' : p.step === 'error' ? 'error' : '');
    $('fr-lt-bar').hidden = finished;
    $('fr-lt-bar').querySelector('.fr-fill').style.width = (p.pct || 0) + '%';
    $('fr-lt-detail').textContent = p.detail || '';
  }

  function firstRunModel(res) {
    if (!res || res.cancelled) return;
    if (res.error) firstRunState('fr-llm-state', res.error, 'error');
    else {
      firstRunState('fr-llm-state', `Connecté : ${res.label}`, 'ok');
      $('fr-llm-state').title = res.file || '';
      $('fr-llm-locate').textContent = 'Changer…';
    }
  }

  async function offerTutorial() {
    const res = await api.tutorialFirst().catch(() => ({ offer: false }));
    if (!res || !res.offer) return;
    const dlg = $('first-run');
    // État actuel : LanguageTool livré avec le programme d'installation ou déjà installé, LLM déjà réglé.
    const lt = await api.languageToolStatus().catch(() => ({}));
    $('fr-lt-install').hidden = !!lt.installed;
    $('fr-lt-install').textContent = 'Télécharger et installer';
    $('fr-lt-bar').hidden = true;
    $('fr-lt-detail').textContent = '';
    firstRunState('fr-lt-state', lt.installed ? 'LanguageTool est installé.' : '', lt.installed ? 'ok' : '');
    if (lt.installing && lt.progress) firstRunLanguageTool(lt.progress);
    const aat = await api.assistGetSettings().catch(() => null);
    const model = aat && aat.models.find((m) => m.id === aat.localModel);
    $('fr-llm-locate').textContent = 'Indiquer l’emplacement du LLM…';
    if (model && model.downloaded) firstRunModel({ label: model.label, file: model.file });
    else firstRunState('fr-llm-state', '');
    firstRunOpen = true;
    const choice = await new Promise((resolve) => {
      const done = (value) => { dlg.close(); resolve(value); };
      $('fr-tutorial').onclick = () => done(true);
      $('fr-later').onclick = () => done(false);
      dlg.oncancel = (e) => { e.preventDefault(); done(false); };
      dlg.showModal();
      $('fr-tutorial').focus();
    });
    firstRunOpen = false;
    // Installation toujours en cours : l'encadré en bas à droite prend le relais.
    const now = await api.languageToolStatus().catch(() => ({}));
    if (now.installing && now.progress) showLanguageToolProgress(now.progress);
    if (choice) await openTutorial();
    else if (lib.projects && !lib.projects.includes(res.project)) await reloadLibrary(lib.project);
  }

  $('fr-lt-install').addEventListener('click', async () => {
    firstRunLanguageTool({ step: 'download', pct: 0, detail: '' });
    const res = await api.installLanguageTool().catch(() => null);
    if (res && res.installed && firstRunOpen) firstRunLanguageTool({ step: 'done', pct: 100, detail: '' });
  });
  $('fr-llm-locate').addEventListener('click', async () => {
    firstRunModel(await api.assistLocateModel().catch((err) => ({ error: String((err && err.message) || err) })));
  });

  const handlers = {
    openDoc: (fileName) => openDoc(fileName),
    newDoc: (sectionId) => newDoc(sectionId),
    newSection: (parentId) => addSection(parentId),
    switchProject: (name) => switchProject(name),
    toggleSection(id) {
      if (id === window.FTSidebar.UNSORTED) lib.unsortedCollapsed = !lib.unsortedCollapsed;
      else {
        const s = findSection(id).section;
        s.collapsed = !s.collapsed;
      }
      saveIndex();
      renderSidebar();
    },
    async renameSection(id) {
      const s = findSection(id).section;
      const name = await ask('Nouveau nom de la section :', s.name);
      if (!name) return;
      s.name = name;
      await saveIndex();
      renderSidebar();
    },
    async moveSection(id, delta) {
      const { siblings } = findSection(id);
      const i = siblings.findIndex((x) => x.id === id);
      const j = i + delta;
      if (j < 0 || j >= siblings.length) return;
      [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
      await saveIndex();
      renderSidebar();
    },
    // Les documents de la section (et de ses sous-sections) remontent dans la section parente,
    // ou dans « Non classés » pour une section du premier niveau.
    async deleteSection(id) {
      const { section, siblings, parents } = findSection(id);
      const parent = parents[parents.length - 1];
      const where = parent ? `dans « ${parent.name} »` : 'dans « Non classés »';
      const subs = (section.children || []).length ? ' et ses sous-sections' : '';
      const ok = await confirmAction(`Supprimer la section « ${section.name} »${subs} ? Les documents ne sont pas effacés : ils seront rangés ${where}.`, 'Supprimer');
      if (!ok) return;
      const removed = new Set(allIds(section));
      siblings.splice(siblings.indexOf(section), 1);
      for (const [docId, sid] of Object.entries(lib.placement)) {
        if (!removed.has(sid)) continue;
        if (parent) lib.placement[docId] = parent.id;
        else delete lib.placement[docId];
      }
      await saveIndex();
      renderSidebar();
    },
    async moveDoc(docId, sectionId) {
      if (sectionId) lib.placement[docId] = sectionId;
      else delete lib.placement[docId];
      await saveIndex();
      renderSidebar();
    },
    // Document introuvable (fichier déplacé hors du logiciel ou effacé) : retrouvé, ou retiré de la liste.
    async locateDoc(id) {
      const res = await api.locateDoc(id);
      if (!res) return;
      if (res.error) { flash(res.error); return; }
      await reloadLibrary();
      await openDoc(res.fileName);
    },
    async forgetDoc(id) {
      await api.forgetDoc(id);
      await reloadLibrary();
    },
    async renameDoc(fileName) {
      if (current && current.fileName === fileName) return renameCurrent();
      const doc = await api.readDoc(fileName);
      const title = await ask('Nom du document :', doc.title);
      if (!title) return;
      doc.title = title;
      await api.saveDoc(fileName, doc);
      await reloadLibrary();
    },
    summarize(fileName) {
      const entry = lib.docs.find((d) => d.fileName === fileName);
      if (entry) window.FTSummary.open(entry.id);
    },
    async versions(fileName) {
      await openDoc(fileName);
      if (current && current.fileName === fileName) window.FTVersions.open();
    },
    async exportDoc(fileName) {
      if (current && current.fileName === fileName) return exportCurrent();
      const doc = await api.readDoc(fileName);
      const path = await api.exportDoc(doc);
      if (path) flash('Copie enregistrée : ' + path);
    },
    async deleteDoc(fileName) {
      const entry = lib.docs.find((d) => d.fileName === fileName);
      const ok = await confirmAction(`Mettre « ${entry ? entry.title : fileName} » à la corbeille ?`, 'Supprimer');
      if (!ok) return;
      if (current && current.fileName === fileName) {
        clearTimeout(saveTimer);
        dirty = false;
        closeDoc();
      }
      await api.deleteDoc(fileName);
      if (entry) forget({ project: lib.project, id: entry.id });
      await reloadLibrary();
    }
  };

  // ----- Documents -----

  function showPage(visible) {
    if (!visible) $('doc-tags').hidden = true;
    if (!visible) window.FTBookmarks.hide();
    if (window.FTFind) window.FTFind.reset();
    $('page').hidden = !visible;
    nameLabel.hidden = !visible;
    $('empty-state').hidden = visible;
    document.querySelectorAll('.ft-toolbar button:not(#sidebar-toggle):not(.tb-lock):not(.tb-fold), .ft-toolbar select').forEach((el) => { el.disabled = !visible; });
    window.FTPages.enable(visible);
    if (visible) window.FTPages.refresh();
    if (window.FTZoom) window.FTZoom.refresh();
    window.FTCover.syncButton();
  }

  // Un autre document s'ouvre, ou le document se ferme, pendant la lecture (fichier ouvert depuis
  // l'Explorateur, commande du menu…) : la lecture est quittée, sauf si elle suit elle-même un lien.
  function leaveReading() {
    const R = window.FTReading;
    if (R && R.isOn() && !R.following()) R.set(false);
  }

  function closeDoc() {
    leaveReading();
    keepPlace();
    hidePlaceNote();
    current = null;
    showPage(false);
    statusSave.textContent = '';
    statusCount.textContent = '';
    if (!presenting) {
      settings.lastFile = null;
      api.saveSettings(settings);
    }
    renderSidebar();
  }

  async function openDoc(fileName) {
    if (window.FTMindmap) window.FTMindmap.show(false);
    if (window.FTTimeline) window.FTTimeline.show(false);
    if (current && current.fileName === fileName) return;
    leaveReading();
    const known = lib.docs.find((d) => d.fileName === fileName);
    if (known && known.missing) {
      flash(`Fichier introuvable : ${fileName}. Clic droit sur le document > « Localiser le fichier… ».`);
      return;
    }
    await flushSave();
    keepPlace();
    let doc;
    try {
      doc = await api.readDoc(fileName);
    } catch (err) {
      flash("Impossible d'ouvrir ce document.");
      await reloadLibrary();
      return;
    }
    marksReady = false;
    current = { fileName, doc: upgradeTitle(doc) };
    dirty = false;
    showName();
    window.FTTheme.load(doc.settings);
    window.FTLang.load(doc.settings);
    window.FTEditor.load(doc);
    showPage(true);
    window.FTTags.load(doc.tags);
    window.FTToc.refresh();
    window.FTCover.refresh();
    window.FTCaptions.refresh();
    window.FTXref.refresh();
    window.FTIndex.load(doc.settings);
    window.FTComments.load(doc.settings);
    setSavedStatus(doc.modified);
    window.FTGoals.load(doc.settings && doc.settings.goal, window.FTEditor.countWords().words);
    window.FTTrack.load(doc.settings);
    window.FTCite.load(doc.settings);
    window.FTBookmarks.load();
    updateCount();
    resetMarks();
    if (!presenting) {
      settings.lastFile = fileName;
      remember(current, { opened: new Date().toISOString(), excerpt: excerpt() });
      api.saveSettings(settings);
    }
    window.FTWelcome.hide();
    renderSidebar();
    $('workspace').scrollTop = 0;
    if (!presenting) await backToPlace(doc);
  }

  // ----- Reprise là où on s'est arrêté : curseur et défilement gardés avec les documents récents -----

  function keepPlace() {
    if (!current || presenting) return;
    const r = recents().find((x) => x.project === lib.project && x.id === current.doc.id);
    if (r) r.place = { caret: window.FTMoteur.caret(), scroll: Math.round($('workspace').scrollTop) };
  }

  // « aujourd'hui à 18:20 », « hier à 09:05 », « le 3 octobre à 14:10 », « le 3 octobre 2025 ».
  function whenText(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const hour = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const gap = Math.round((day(new Date()) - day(d)) / 86400000);
    if (gap === 0) return 'aujourd’hui à ' + hour;
    if (gap === 1) return 'hier à ' + hour;
    const opts = { day: 'numeric', month: 'long' };
    if (d.getFullYear() !== new Date().getFullYear()) return 'le ' + d.toLocaleDateString('fr-FR', { ...opts, year: 'numeric' });
    return 'le ' + d.toLocaleDateString('fr-FR', opts) + ' à ' + hour;
  }

  let placeTimer = 0;
  function hidePlaceNote() {
    clearTimeout(placeTimer);
    const n = $('place-note');
    if (n) n.hidden = true;
  }

  async function backToPlace(doc) {
    hidePlaceNote();
    const r = recents().find((x) => x.project === lib.project && x.id === doc.id);
    const place = r && r.place;
    if (!place) return;
    const opened = current;
    window.FTMoteur.placeCaret(place.caret);
    // (Mise en page et pages refaites avant de défiler.)
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    if (current !== opened) return;
    $('workspace').scrollTop = place.scroll || 0;
    window.FTMoteur.view.focus();
    const when = whenText(doc.modified);
    if (!when) return;
    let n = $('place-note');
    if (!n) {
      n = document.createElement('div');
      n.id = 'place-note';
      n.setAttribute('role', 'status');
      n.title = 'Revenir à la dernière modification';
      n.addEventListener('click', () => {
        hidePlaceNote();
        const m = window.FTMoteur;
        if (n.dataset.caret) m.placeCaret(+n.dataset.caret);
        m.view.focus();
        m.view.dispatch(m.view.state.tr.scrollIntoView());
      });
      document.body.append(n);
    }
    n.innerHTML = '<strong></strong><span>Reprise à la dernière position</span>';
    n.firstChild.textContent = 'Dernière modification ' + when;
    n.dataset.caret = place.caret;
    n.hidden = false;
    placeTimer = setTimeout(hidePlaceNote, 5000);
  }

  // Nouveau document : son nom est demandé d'abord (sauf quand le logiciel en crée un tout seul,
  // dans un projet vide). Le texte commence par un titre à ce nom, qu'on peut changer ou effacer.
  async function newDoc(sectionId, { quiet = false } = {}) {
    let name = 'Sans titre';
    if (!quiet) {
      name = await ask('Nom du document :', '', { okLabel: 'Créer' });
      if (name === null) return;
      name = name || 'Sans titre';
    }
    await flushSave();
    const created = await api.createDoc(name);
    const doc = created.doc;
    doc.settings = { ...doc.settings, theme: window.FTTheme.forNewDoc(), languages: window.FTLang.forNewDoc() };
    const { fileName } = await api.saveDoc(created.fileName, doc);
    // Un nouveau projet range son premier document dans sa première section.
    if (!sectionId && lib.docs.length === 0 && lib.sections.length) sectionId = lib.sections[0].id;
    if (sectionId) lib.placement[doc.id] = sectionId;
    await saveIndex();
    await reloadLibrary();
    await openDoc(fileName);
    // Le curseur sur la ligne sous le titre, prêt à écrire.
    window.FTEditor.focusAfterTitle();
  }

  // Avant la 1.1.4, le titre était un champ fixe au-dessus du texte, confondu avec le nom du document.
  // Il devient un bloc « Titre du document » en tête du texte, qu'on peut déplacer, changer ou effacer ;
  // le nom du document reste à part (gestion des projets).
  function upgradeTitle(doc) {
    doc.settings = doc.settings || {};
    if (doc.settings.titleInText) return doc;
    doc.settings.titleInText = true;
    const name = String(doc.title || '').trim();
    if (!name || name === 'Sans titre') return doc;
    const html = String((doc.content && doc.content.html) || '');
    const empty = !html.replace(/<p><br><\/p>/g, '').trim();
    const safe = name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    doc.content = { ...doc.content, html: `<h1 class="ft-title">${safe}</h1>` + (empty ? '<p><br></p>' : html) };
    return doc;
  }

  const docName = () => (current && current.doc.title) || 'Sans titre';
  function showName() {
    nameLabel.textContent = docName();
    document.title = docName() + ' – Tomatoes Text';
    document.dispatchEvent(new Event('ft-docname'));
  }

  // Change le nom du document ouvert (le fichier est renommé à l'enregistrement).
  function setName(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!current || !name || name === current.doc.title) return;
    current.doc.title = name;
    showName();
    markDirty();
    save();
    flash(`Le document s'appelle maintenant « ${name} ».`);
  }
  async function renameCurrent() {
    if (!current) return;
    const name = await ask('Nom du document :', current.doc.title);
    if (name) setName(name);
  }

  function collectDoc() {
    const doc = current.doc;
    doc.content = { ...doc.content, html: window.FTEditor.getHtml() };
    doc.tags = window.FTTags.get();
    doc.settings = collectSettings();
    return doc;
  }
  // Document ouvert, pour l'enregistrement automatique : le texte porte les références des images, et
  // seules les images pas encore envoyées l'accompagnent (layout.js packImages).
  function packDoc() {
    const raw = window.FTEditor.getRawHtml();
    const doc = current.doc;
    doc.content = { ...doc.content, html: window.FTLayout.serialize(raw) };
    doc.tags = window.FTTags.get();
    doc.settings = collectSettings();
    const pack = window.FTLayout.packImages(raw);
    return { doc: { ...doc, content: { ...doc.content, html: pack.html }, imageSession: pack.session }, pack };
  }
  function collectSettings() {
    return {
      ...current.doc.settings,
      autoIndent: window.FTEditor.getAutoIndent(),
      columns: window.FTLayout.getColumns(),
      goal: window.FTGoals.getDocGoal(),
      track: window.FTTrack.get(),
      citeStyle: window.FTCite.getStyle(),
      citeNorm: window.FTCite.getNorm(),
      languages: window.FTLang.get(),
      index: window.FTIndex.get(),
      comments: window.FTComments.get(),
      theme: window.FTTheme.get(),
      ...window.FTPages.getSettings()
    };
  }

  // Annuler / Rétablir pour les réglages du document (pages, colonnes, styles, thème, langues, tags,
  // objectif, index…) comme pour le texte : chaque changement de réglage devient une étape du moteur,
  // qui change l'attribut « reglages » du document ; Ctrl+Z / Ctrl+Y le remettent et les réglages
  // gardés pour ce repère sont rechargés.
  const marks = new Map();
  let markCount = 0;
  let markNow = '';
  let restoringMarks = false;
  let marksReady = false; // (pas pendant l'ouverture d'un document)
  let lastEdit = null;
  // (Le texte de départ du suivi des modifications, aussi long que le document, n'est pas recopié.)
  // (Commentaires et suivi des modifications : ils suivent déjà le texte annulé, avec leurs passages.)
  const markState = () => {
    const s = collectSettings();
    delete s.comments;
    delete s.track;
    return JSON.stringify({ s, t: window.FTTags.get() });
  };
  function resetMarks() {
    marks.clear();
    markNow = current ? markState() : '';
    marks.set(window.FTMoteur.view.state.doc.attrs.reglages, markNow);
    marksReady = true;
  }
  // Texte chargé (ouverture, version restaurée…) : repères repris une fois tout le document chargé.
  window.FTMoteur.onLoad(() => {
    marksReady = false;
    setTimeout(() => { if (!marksReady) resetMarks(); });
  });
  // (Après l'action en cours : un outil appliqué d'un coup — objets.js — forme sa propre étape avant.)
  let notePending = false;
  function noteSettings() {
    if (notePending) return;
    notePending = true;
    queueMicrotask(() => {
      notePending = false;
      if (window.FTObjets && window.FTObjets.busy()) setTimeout(noteSettings);
      else noteSettingsNow();
    });
  }
  function noteSettingsNow() {
    if (restoringMarks || !marksReady || !current) return;
    const now = markState();
    if (now === markNow) return;
    const M = window.FTMoteur;
    const id = ++markCount;
    marks.set(id, now);
    markNow = now;
    const tr = M.view.state.tr.setDocAttribute('reglages', id);
    // Réglage changé avec le texte par la même action (style posé sur les titres…) : une seule étape.
    // (L'outil a déjà fermé son étape : elle est rouverte pour y joindre le réglage.)
    if (lastEdit && performance.now() - lastEdit.at < 40) {
      const h = M.view.state.plugins.find((p) => p.key === 'history$');
      const hs = h && h.getState(M.view.state);
      if (hs && !hs.prevTime) hs.prevTime = Date.now();
      tr.setMeta('appendedTransaction', lastEdit.tr);
    } else M.closeHistory();
    M.view.dispatch(tr);
    M.closeHistory();
    lastEdit = null; // (réglage suivant : son étape, sauf nouveau texte changé)
  }
  window.FTMoteur.onUpdate((tr) => {
    if (tr.docChanged && !tr.getMeta('history$') && tr.getMeta('addToHistory') !== false) lastEdit = { tr, at: performance.now() };
    if (!tr.getMeta('history$') || !current) return;
    const id = tr.doc.attrs.reglages;
    const saved = marks.get(id);
    if (saved === undefined || saved === markNow) return;
    restoringMarks = true;
    try {
      const { s, t } = JSON.parse(saved);
      current.doc.settings = { ...current.doc.settings, ...s };
      window.FTEditor.setAutoIndent(s.autoIndent);
      window.FTTheme.load(s);
      window.FTLang.load(s);
      window.FTLayout.load(s);
      window.FTPages.load(s);
      window.FTTags.load(t);
      window.FTGoals.load(s.goal, window.FTEditor.countWords().words);
      window.FTIndex.load(s);
      window.FTCite.load(s);
      window.FTToc.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      restoringMarks = false;
    }
    markNow = markState();
    marks.set(id, markNow);
  });

  let countTimer = null;
  function markDirty(fromText) {
    if (!current) return;
    dirty = true;
    // (Frappe : pas de réglage changé, et rien à relire à chaque touche.)
    if (!(fromText === true && lastEdit && performance.now() - lastEdit.at < 40)) noteSettings();
    // Texte changé seulement s'il est différent : chaque changement de la barre d'état oblige le
    // navigateur à remesurer la fenêtre (long sur un très gros document).
    if (statusSave.textContent !== 'Modifications en cours…') statusSave.textContent = 'Modifications en cours…';
    // Le compte des mots relit tout le texte : dans un long document, on attend une pause de frappe.
    clearTimeout(countTimer);
    countTimer = setTimeout(updateCount, 500);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, AUTOSAVE_DELAY);
  }

  // Les enregistrements se suivent les uns après les autres, jamais en même temps.
  function save() {
    clearTimeout(saveTimer);
    saving = saving.then(async () => {
      if (!current || !dirty) return;
      const target = current;
      dirty = false;
      saveError = '';
      try {
        let res;
        if (target === current && window.FTLayout.packImages) {
          let { doc, pack } = packDoc();
          try {
            await window.FTLayout.sendImages(pack);
            res = await api.saveDoc(target.fileName, doc);
          } catch (err) {
            // (Images inconnues du processus principal : toutes renvoyées.)
            if (!/FT_IMAGES/.test(String(err && err.message))) throw err;
            window.FTLayout.resetImages();
            ({ doc, pack } = packDoc());
            await window.FTLayout.sendImages(pack);
            res = await api.saveDoc(target.fileName, doc);
          }
        } else {
          res = await api.saveDoc(target.fileName, collectDocFor(target));
        }
        const renamed = res.fileName !== target.fileName;
        target.fileName = res.fileName;
        target.doc.modified = res.modified;
        if (target === current) setSavedStatus(res.modified);
        const entry = lib.docs.find((d) => d.id === target.doc.id);
        if (entry) {
          const titleChanged = entry.title !== target.doc.title;
          const tagsChanged = JSON.stringify(entry.tags || []) !== JSON.stringify(target.doc.tags || []);
          Object.assign(entry, { fileName: res.fileName, title: target.doc.title, modified: res.modified, tags: target.doc.tags || [] });
          if (target === current) entry.links = liveLinks();
          if (titleChanged || renamed || tagsChanged) renderSidebar();
          if (tagsChanged && window.FTMindmap) window.FTMindmap.refresh();
        } else {
          await reloadLibrary();
        }
        if (!presenting) remember(target, {}, false);
        if (renamed && target === current && !presenting) {
          settings.lastFile = res.fileName;
          api.saveSettings(settings);
        }
      } catch (err) {
        dirty = true;
        saveError = reason(err);
        statusSave.textContent = "⚠ Échec de l'enregistrement : " + saveError;
      }
    });
    return saving;
  }

  function collectDocFor(target) {
    return target === current ? collectDoc() : target.doc;
  }

  function flushSave() {
    // (Légende ou page de titre en cours d'écriture : reprise dans le texte avant d'enregistrer.)
    if (window.FTObjets && window.FTObjets.finishCaption) window.FTObjets.finishCaption();
    if (dirty) return save();
    return saving;
  }

  async function exportCurrent() {
    if (!current) return;
    await flushSave();
    const path = await api.exportDoc(collectDoc());
    if (path) flash('Copie enregistrée : ' + path);
  }

  // « Exporter… » : on choisit Word ou PDF.
  const exportDialog = $('export-dialog');
  function chooseExport() {
    if (!current) return;
    $('export-typo').checked = settings.exportTypo !== false;
    exportDialog.showModal();
  }
  exportDialog.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => {
    exportDialog.close();
    const kind = b.dataset.export;
    if (kind === 'pdf') exportPdfCurrent();
    else if (kind === 'livre') window.FTLivre.open(exportBookCurrent);
    else if (kind === 'epub') exportEpubCurrent();
    else exportWordCurrent();
  }));
  // Typographie soignée de l'export PDF (coupure des mots, justification) : réglage du logiciel.
  $('export-typo').addEventListener('change', (e) => {
    settings.exportTypo = e.target.checked;
    api.saveSettings(settings);
  });
  $('export-cancel').addEventListener('click', () => exportDialog.close());

  async function exportPdfCurrent() {
    if (!current) return;
    await flushSave();
    flash('Export PDF en cours…');
    try {
      const path = await api.exportPdf(docName(), await window.FTPdf.build({ typo: settings.exportTypo !== false }));
      if (path) flash('Document PDF enregistré : ' + path);
      else flash('');
    } catch (err) {
      flash("⚠ L'export PDF a échoué : " + reason(err));
      console.error(err);
    }
  }

  async function exportBookCurrent(choice) {
    if (!current) return;
    await flushSave();
    // (Les étapes s'affichent sans minuterie ; le texte d'avant revient avant le message final.)
    const before = statusSave.textContent;
    clearTimeout(flashTimer);
    statusSave.textContent = 'Export du livre en cours…';
    try {
      const res = await api.exportBook(docName(), await window.FTLivre.build(choice));
      statusSave.textContent = before;
      if (res) flash(`Livre enregistré (${res.pages} pages) : ${res.filePath}`);
    } catch (err) {
      statusSave.textContent = before;
      flash("⚠ L'export du livre a échoué : " + reason(err));
      console.error(err);
    }
  }
  if (api.onBookStep) api.onBookStep((text) => { statusSave.textContent = 'Export du livre : ' + text.charAt(0).toLowerCase() + text.slice(1); });

  async function exportEpubCurrent() {
    if (!current) return;
    await flushSave();
    flash('Export EPUB en cours…');
    try {
      const path = await api.exportEpub(docName(), await window.FTEpub.build());
      if (path) flash('Livre numérique enregistré : ' + path);
      else flash('');
    } catch (err) {
      flash("⚠ L'export EPUB a échoué : " + reason(err));
      console.error(err);
    }
  }

  async function exportWordCurrent() {
    if (!current) return;
    await flushSave();
    flash('Export Word en cours…');
    try {
      const data = await window.FTWord.exportWord();
      const path = await api.exportWord(docName(), data);
      if (path) flash('Document Word enregistré : ' + path);
      else flash('');
    } catch (err) {
      flash("⚠ L'export Word a échoué : " + reason(err));
      console.error(err);
    }
  }

  async function importDocs(kind) {
    await flushSave();
    await openImported(await api.importDocs(kind === 'word' ? 'word' : undefined));
  }

  // Fichiers rangés dans la bibliothèque par main.js (ouverture, import, double-clic dans l'Explorateur).
  async function openImported(files) {
    if (!Array.isArray(files) || !files.length) return;
    await flushSave();
    const opened = [];
    const problems = [];
    const lost = new Set();
    const reviewed = { changes: 0, comments: 0 };
    for (const f of files) {
      if (typeof f === 'string') { opened.push(f); continue; }
      // Document d'un autre projet : ce projet est ouvert (le document reste à sa place).
      if (f.project) {
        if (current) closeDoc();
        await reloadLibrary(f.project);
        opened.push(f.fileName);
        continue;
      }
      // Document Word : converti ici, puis rangé comme un nouveau document dans la section du document ouvert.
      flash(`Import de « ${f.word} »…`);
      try {
        const { title, html, before, comments, warnings } = await window.FTWordImport.convert(f.data, f.word);
        warnings.forEach((w) => lost.add(w));
        const { fileName, doc } = await api.createDoc(title);
        doc.content = { ...doc.content, html };
        doc.settings = { ...doc.settings, titleInText: true }; // le titre du fichier Word est déjà dans le texte
        // Commentaires Word : commentaires en marge. Modifications suivies : le suivi part du texte d'avant.
        if (comments.length) doc.settings.comments = comments;
        if (before && window.FTTrack) {
          const base = window.FTTrack.baseOf(before);
          const changes = window.FTTrack.countOf(base, html);
          if (changes) {
            doc.settings.track = { since: new Date().toISOString(), base };
            reviewed.changes += changes;
          }
        }
        reviewed.comments += comments.length;
        const res = await api.saveDoc(fileName, doc);
        const section = current && lib.placement[current.doc.id];
        if (section) lib.placement[doc.id] = section;
        opened.push(res.fileName);
      } catch (err) {
        problems.push(`« ${f.word} » : ${reason(err)}`);
      }
    }
    await saveIndex();
    await reloadLibrary();
    if (opened.length) await openDoc(opened[opened.length - 1]);
    if (problems.length) flash('⚠ Import impossible : ' + problems.join(' ; '));
    else if (lost.size) flash(`Document Word importé (sans ${[...lost].map((w) => ({ images: 'certaines images' }[w] || w)).join(' ni ')}).`);
    else if (files.some((f) => f && f.word)) {
      const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
      const parts = [reviewed.changes && plural(reviewed.changes, 'modification') + ' à relire', reviewed.comments && plural(reviewed.comments, 'commentaire')].filter(Boolean);
      flash('Document Word importé' + (parts.length ? ' : ' + parts.join(', ') + '.' : '.'));
    }
  }

  // ----- Accueil et documents récents -----
  // Récents : tous projets confondus (settings.recent), le dernier ouvert en tête.

  const RECENT_MAX = 20;
  const EXCERPT = 160;

  function recents() {
    if (!Array.isArray(settings.recent)) settings.recent = [];
    return settings.recent;
  }

  // Début du texte (sans les titres ni la page de titre), pour l'accueil.
  function excerpt() {
    const M = window.FTMoteur;
    if (!M) return '';
    let out = '';
    M.view.state.doc.forEach((n) => {
      if (out.length >= EXCERPT || n.type.name === 'heading' || n.type.name === 'raw_block') return;
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t) out += (out ? ' ' : '') + t;
    });
    return out.length > EXCERPT ? out.slice(0, EXCERPT).replace(/\s+\S*$/, '') + '…' : out;
  }

  // Document ouvert ou enregistré : mis à jour dans la liste (en tête s'il vient d'être ouvert).
  function remember(target, extra = {}, toFront = true) {
    const list = recents();
    const doc = target.doc;
    const k = list.findIndex((r) => r.project === lib.project && r.id === doc.id);
    if (k < 0 && !toFront) return;
    const old = k >= 0 ? list.splice(k, 1)[0] : {};
    const r = {
      ...old,
      project: lib.project,
      id: doc.id,
      fileName: target.fileName,
      title: doc.title,
      modified: doc.modified,
      tags: (doc.tags || []).map((t) => ({ name: t.name, color: t.color })),
      ...extra
    };
    if (target === current && lastWords !== null) r.words = lastWords;
    if (toFront) list.unshift(r);
    else list.splice(k, 0, r);
    list.length = Math.min(list.length, RECENT_MAX);
  }

  function forget(r) {
    settings.recent = recents().filter((x) => !(x.project === r.project && x.id === r.id));
    api.saveSettings(settings);
  }

  // Première fois (aucun récent gardé) : les derniers documents modifiés du projet, lus sur le disque.
  async function seedRecents() {
    if (recents().length || !lib.docs.length) return;
    const docs = [...lib.docs].sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
    const at = docs.findIndex((d) => d.fileName === settings.lastFile);
    if (at > 0) docs.unshift(docs.splice(at, 1)[0]);
    for (const d of docs.slice(0, 9)) {
      const r = { project: lib.project, id: d.id, fileName: d.fileName, title: d.title, modified: d.modified, opened: d.modified, tags: d.tags || [] };
      const body = await docBody(d);
      if (body) {
        r.words = (body.textContent.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
        body.querySelectorAll('h1, h2, h3, h4, h5, h6, .ft-cover, .ft-toc').forEach((e) => e.remove());
        const text = body.textContent.replace(/\s+/g, ' ').trim();
        r.excerpt = text.length > EXCERPT ? text.slice(0, EXCERPT).replace(/\s+\S*$/, '') + '…' : text;
      }
      recents().push(r);
    }
    api.saveSettings(settings);
  }

  async function openRecent(r) {
    if (current && current.doc.id === r.id && lib.project === r.project) {
      window.FTWelcome.hide();
      return;
    }
    await flushSave();
    if (r.project !== lib.project) {
      if (!lib.projects.includes(r.project)) return lostRecent(r);
      if (current) closeDoc();
      await reloadLibrary(r.project);
    }
    const find = () => lib.docs.find((x) => x.id === r.id) || lib.docs.find((x) => x.fileName === r.fileName);
    const d = find();
    if (d) await openDoc(d.fileName);
    // (Fichier effacé ou déplacé hors du logiciel : openDoc a relu la bibliothèque.)
    if (!current || current.doc.id !== r.id) lostRecent(r);
  }

  function lostRecent(r) {
    forget(r);
    window.FTWelcome.refresh();
    window.FTWelcome.message(`« ${r.title} » est introuvable. Il a été retiré de la liste.`);
  }

  async function showWelcome() {
    if (presenting) return;
    await flushSave();
    if (current) {
      remember(current, { excerpt: excerpt() }, false);
      api.saveSettings(settings);
    }
    window.FTWelcome.show();
  }

  // Fermer l'accueil sans choisir : retour au document ouvert, sinon au dernier document.
  async function closeWelcome() {
    window.FTWelcome.hide();
    if (current) return;
    if (settings.lastFile && lib.docs.some((d) => d.fileName === settings.lastFile)) await openDoc(settings.lastFile);
  }

  window.FTWelcome.init({
    recents,
    projectDocs: () => lib.docs.map((d) => ({ project: lib.project, id: d.id, fileName: d.fileName, title: d.title, modified: d.modified, tags: d.tags || [] })),
    projects: () => ({ projects: lib.projects || [], project: lib.project }),
    openRecent,
    forget,
    newDoc: () => newDoc(null),
    openFile: () => importDocs(),
    importWord: () => importDocs('word'),
    newProject: () => createProject(),
    switchProject: (name) => switchProject(name),
    atStart: () => settings.welcome !== false,
    setAtStart(on) {
      settings.welcome = !!on;
      api.saveSettings(settings);
    },
    update: () => window.FTUpdate.open(),
    tutorial: () => openTutorial(),
    close: closeWelcome
  });
  $('empty-home').addEventListener('click', showWelcome);
  document.querySelector('#sidebar .brand').addEventListener('click', showWelcome);

  // ----- Barre d'état -----

  function setSavedStatus(iso) {
    const d = new Date(iso);
    statusSave.textContent = 'Enregistré à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  let lastWords = null;
  function updateCount() {
    const { words, chars } = window.FTEditor.countWords();
    lastWords = words;
    statusCount.textContent = `${words} mot${words > 1 ? 's' : ''} · ${chars} caractère${chars > 1 ? 's' : ''}`;
    window.FTGoals.track(words);
  }

  let flashTimer;
  // Installation de LanguageTool (menu Édition) : encadré en bas à droite, avec l'étape, la barre
  // d'avancement et, en cas d'échec, la raison. Il reste affiché jusqu'à la fin.
  let ltBox = null;
  function showLanguageToolProgress(p) {
    // (Fenêtre du premier lancement ouverte : l'avancement s'y affiche.)
    if (firstRunOpen) {
      firstRunLanguageTool(p);
      return;
    }
    if (!ltBox) {
      ltBox = document.createElement('div');
      ltBox.id = 'lt-progress';
      ltBox.setAttribute('role', 'status');
      ltBox.innerHTML = '<div class="lt-head"><strong>LanguageTool</strong><button type="button" class="lt-close" title="Fermer" hidden>×</button></div>' +
        '<div class="lt-step"></div><div class="lt-bar"><div class="lt-fill"></div></div><div class="lt-detail"></div>';
      ltBox.querySelector('.lt-close').addEventListener('click', () => { ltBox.hidden = true; });
      document.body.appendChild(ltBox);
    }
    const STEPS = {
      download: 'Téléchargement…',
      extract: 'Installation des fichiers…',
      start: 'Premier démarrage…',
      done: 'Installé. La grammaire est vérifiée par LanguageTool.',
      error: 'Installation impossible.'
    };
    const finished = p.step === 'done' || p.step === 'error';
    ltBox.hidden = false;
    ltBox.classList.toggle('lt-error', p.step === 'error');
    ltBox.querySelector('.lt-step').textContent = STEPS[p.step] + (finished ? '' : ` ${p.pct} %`);
    ltBox.querySelector('.lt-fill').style.width = (p.step === 'error' ? 0 : p.pct) + '%';
    ltBox.querySelector('.lt-bar').hidden = finished;
    ltBox.querySelector('.lt-detail').textContent = p.detail || '';
    ltBox.querySelector('.lt-close').hidden = !finished;
    clearTimeout(ltBox.timer);
    if (p.step === 'done') ltBox.timer = setTimeout(() => { ltBox.hidden = true; }, 10000);
  }

  // Message passager de la barre d'état. Le texte d'avant revient ensuite : celui d'avant le premier
  // message quand plusieurs se suivent (« Export en cours… » puis « Document enregistré »), jamais un
  // message précédent. Un message vide retire tout de suite le message affiché.
  let flashShown = null; // { text, previous }
  function flash(text) {
    const previous = flashShown && statusSave.textContent === flashShown.text ? flashShown.previous : statusSave.textContent;
    clearTimeout(flashTimer);
    if (!text) {
      statusSave.textContent = current ? previous : '';
      flashShown = null;
      return;
    }
    statusSave.textContent = text;
    flashShown = { text, previous };
    flashTimer = setTimeout(() => {
      if (statusSave.textContent === text) statusSave.textContent = current ? previous : '';
      flashShown = null;
    }, 5000);
  }

  // ----- Événements -----

  // Ctrl+A : tout le texte du document, ou tout le contenu de la case où l'on écrit (titre, recherche,
  // fenêtre, légende…), mais jamais toute la fenêtre du logiciel.
  function selectAll() {
    const a = document.activeElement;
    if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|url|email|number|)$/i.test(a.type)))) { a.select(); return; }
    const editor = $('editor');
    const sel = window.getSelection();
    if (a && a.isContentEditable && a !== editor) {
      // (Légende d'une image : son texte seulement.)
      const host = a.closest('[contenteditable="true"]') || a;
      if (host !== editor) {
        sel.selectAllChildren(host);
        return;
      }
    }
    // Une fenêtre ouverte (schéma, réglages…) garde la touche pour elle.
    if (document.querySelector('dialog[open]:modal')) return;
    if (!current || $('workspace').hidden) return;
    window.FTEditor.selectAll();
  }

  // Pour les liens entre documents (links.js).
  window.FTApp = {
    ask,
    flash,
    docs: () => lib.docs.map(({ id, title, fileName }) => ({ id, title, fileName })),
    // Pour la mindmap : les documents du projet et leurs liens (ceux du document ouvert, à jour).
    graph() {
      const open = current ? current.doc.id : null;
      return {
        project: lib.project,
        nodes: lib.docs.map((d) => ({
          id: d.id,
          title: d.id === open ? docName() : d.title,
          tags: d.id === open ? window.FTTags.get() : window.FTTags.clean(d.tags)
        })),
        tags: projectTags(),
        links: lib.docs.flatMap((d) => (d.id === open ? liveLinks() : d.links || []).map((to) => [d.id, to]))
      };
    },
    currentId: () => (current ? current.doc.id : null),
    // Réglages du document ouvert, tels qu'ils seraient enregistrés (signalement d'un défaut).
    docSettings: () => (current ? collectDoc().settings : {}),
    // Nouveau document (nom demandé) ; vrai s'il a été créé et ouvert (modèles de mise en page).
    async newDocument() {
      const before = current;
      await newDoc(null);
      return !!current && current !== before;
    },
    // Nom du document ouvert (gestion des projets), distinct du titre écrit dans le texte.
    docName,
    setName,
    // Pour le résumé (summary.js) : le titre et le texte d'un document, un paragraphe par ligne.
    async docText(id) {
      const entry = lib.docs.find((d) => d.id === id);
      if (!entry) return null;
      const open = current && current.doc.id === id;
      const root = open ? $('editor') : await docBody(entry);
      if (!root) return null;
      const lines = [];
      let line = '';
      const walk = (n) => {
        if (n.nodeType === 3) { line += n.data; return; }
        if (n.nodeType !== 1 || n.matches('.ft-pg-gap, .ft-toc, .ft-lof, .ft-index, .ft-biblio, .ft-math, #track-layer, script, style')) return;
        const block = /^(P|LI|H[1-6]|DIV|TR|BLOCKQUOTE|FIGCAPTION|UL|OL|TABLE)$/.test(n.tagName);
        if (block && line.trim()) { lines.push(line); line = ''; }
        if (n.tagName === 'BR') { lines.push(line); line = ''; return; }
        n.childNodes.forEach(walk);
        if (n.tagName === 'TD' || n.tagName === 'TH') line += ' | ';
        if (block && line.trim()) { lines.push(line); line = ''; }
      };
      walk(root);
      if (line.trim()) lines.push(line);
      const text = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
      return { id, title: open ? docName() : entry.title, text };
    },
    // Pour la carte du temps : le texte de chaque document du projet (ou du seul document ouvert).
    async projectBodies(onlyCurrent) {
      const open = current ? current.doc.id : null;
      const list = onlyCurrent ? lib.docs.filter((d) => d.id === open) : lib.docs;
      const out = [];
      for (const d of list) {
        const root = d.id === open ? $('editor') : await docBody(d);
        if (root) out.push({ id: d.id, title: d.id === open ? docName() : d.title, root });
      }
      return out;
    },
    // Pour les infobulles de la mindmap : titre, tags, nombre de mots et date d'un document.
    async docInfo(id) {
      const entry = lib.docs.find((d) => d.id === id);
      if (!entry) return null;
      if (current && current.doc.id === id) {
        return { title: docName(), tags: window.FTTags.get(), words: window.FTEditor.countWords().words, modified: current.doc.modified };
      }
      const body = await docBody(entry);
      const text = body ? body.textContent.trim() : '';
      return { title: entry.title, tags: window.FTTags.clean(entry.tags), words: text ? text.split(/\s+/).length : 0, modified: entry.modified };
    },
    // Les phrases d'un document qui contiennent un lien (( )) vers un autre : [{ before, link, after }].
    async linkSnippets(fromId, toId) {
      const entry = lib.docs.find((d) => d.id === fromId);
      if (!entry) return [];
      const root = current && current.doc.id === fromId ? $('editor') : await docBody(entry);
      if (!root) return [];
      return [...root.querySelectorAll('a.ft-doclink')].filter((a) => a.dataset.doc === toId).slice(0, 3).map(snippetOf);
    },
    // Pour l'historique des versions (versions.js).
    async versionDoc() {
      if (!current) return null;
      await flushSave();
      return JSON.parse(JSON.stringify(collectDoc()));
    },
    // Remet le document ouvert comme dans une version ; l'état actuel est d'abord gardé dans l'historique.
    async restoreVersion(version) {
      if (!current) return;
      await flushSave();
      await api.saveVersion(JSON.parse(JSON.stringify(collectDoc())), 'restauration');
      // Le nom du document ne change pas ; une version d'avant la 1.1.4 retrouve son titre dans le texte.
      const v = upgradeTitle(JSON.parse(JSON.stringify(version)));
      marksReady = false;
      const doc = current.doc;
      doc.content = { ...doc.content, html: v.content.html };
      doc.settings = { ...v.settings };
      doc.tags = Array.isArray(v.tags) ? v.tags : [];
      window.FTTheme.load(doc.settings);
      window.FTLang.load(doc.settings);
      window.FTEditor.load(doc);
      window.FTTags.load(doc.tags);
      window.FTToc.refresh();
      window.FTPages.refresh();
      window.FTGoals.load(doc.settings.goal, window.FTEditor.countWords().words);
      window.FTTrack.load(doc.settings);
      window.FTIndex.load(doc.settings);
      window.FTComments.load(doc.settings);
      window.FTCite.load(doc.settings);
      window.FTBookmarks.load();
      updateCount();
      resetMarks();
      dirty = true;
      await save();
      flash('Version restaurée.');
    },
    // Une version ouverte comme un nouveau document, dans la même section.
    async copyVersion(version, suffix) {
      await flushSave();
      const v = upgradeTitle(JSON.parse(JSON.stringify(version)));
      const { fileName, doc } = await api.createDoc((version.title || 'Sans titre') + suffix);
      doc.content = { ...doc.content, html: v.content.html };
      doc.settings = { ...v.settings };
      doc.tags = Array.isArray(v.tags) ? v.tags : [];
      const res = await api.saveDoc(fileName, doc);
      const section = current && lib.placement[current.doc.id];
      if (section) lib.placement[doc.id] = section;
      await saveIndex();
      await reloadLibrary();
      await openDoc(res.fileName);
    },
    async openDocById(id) {
      const doc = lib.docs.find((d) => d.id === id);
      if (!doc) return false;
      await openDoc(doc.fileName);
      return true;
    },
    // Nouveau document vide, rangé dans la même section que le document ouvert (sans l'ouvrir).
    async createDoc(title) {
      await flushSave();
      const { fileName, doc } = await api.createDoc(title);
      doc.settings = { ...doc.settings, theme: window.FTTheme.forNewDoc(), languages: window.FTLang.forNewDoc() };
      await api.saveDoc(fileName, doc);
      const section = current && lib.placement[current.doc.id];
      if (section) lib.placement[doc.id] = section;
      await saveIndex();
      await reloadLibrary();
      return doc.id;
    }
  };

  window.FTEditor.onChange(() => markDirty(true));
  window.FTPages.onChange(markDirty);
  nameLabel.addEventListener('click', renameCurrent);

  $('new-doc').addEventListener('click', () => newDoc(null));
  $('empty-new').addEventListener('click', () => newDoc(null));
  $('new-section').addEventListener('click', () => addSection(null));
  $('project-more').addEventListener('click', (e) => { e.stopPropagation(); projectMenu(); });
  $('import-doc').addEventListener('click', () => importDocs());
  $('open-folder').addEventListener('click', () => api.openLibraryFolder());
  $('theme-toggle').addEventListener('click', toggleTheme);
  statusSave.addEventListener('click', () => window.FTVersions.open());
  statusCount.addEventListener('click', () => window.FTGoals.open());
  $('sidebar-toggle').addEventListener('click', toggleSidebar);

  // Mode lecture : le texte est fermé. Les commandes qui le modifieraient sont sans effet ; celles qui
  // ouvrent un autre document, une autre vue ou un outil du texte quittent d'abord la lecture.
  const READING_KEEPS = new Set(['focus', 'fullscreen-left', 'theme', 'save', 'before-close', 'tags-on', 'tags-off', 'minibar-on', 'minibar-off',
    'grammar-on', 'grammar-off', 'grammar-reset', 'export', 'export-word', 'export-pdf', 'export-choose', 'report', 'update', 'goals', 'readability',
    'shortcuts', 'customize']);
  const READING_IGNORES = new Set(['undo', 'redo', 'select-all', 'zoom-in', 'zoom-out', 'zoom-reset']);

  async function menuAction(action) {
    if (window.FTReading && window.FTReading.isOn() && !READING_KEEPS.has(action)) {
      if (READING_IGNORES.has(action)) return;
      window.FTReading.set(false);
    }
    switch (action) {
      case 'new': return newDoc(null);
      case 'home': return showWelcome();
      case 'import': return importDocs();
      case 'import-word': return importDocs('word');
      case 'save': if (current) { dirty = true; return save(); } return;
      case 'export': return exportCurrent();
      case 'export-word': return exportWordCurrent();
      case 'export-pdf': return exportPdfCurrent();
      case 'export-choose': return chooseExport();
      case 'theme': return toggleTheme();
      case 'undo': return window.FTHistory.undo();
      case 'redo': return window.FTHistory.redo();
      case 'sidebar': return toggleSidebar();
      case 'navpane': return window.FTNav.toggle();
      case 'assist': return window.FTAssistant.toggle();
      case 'mindmap': return window.FTMindmap.toggle();
      case 'timeline': return window.FTTimeline.toggle();
      case 'select-all': return selectAll();
      case 'coherence': return window.FTCoherence.open();
      case 'readability': return window.FTReadability.open();
      case 'languages': return window.FTLang.open();
      case 'find': return window.FTFind.open(false);
      case 'replace': return window.FTFind.open(true);
      case 'palette': return window.FTPalette.toggle();
      case 'customize': return window.FTCustomize.open();
      case 'doc-theme': return window.FTTheme.open();
      case 'layout-model': return window.FTModeles.open();
      case 'new-model': return window.FTModeles.open({ create: true });
      case 'versions': return window.FTVersions.open();
      case 'focus': return window.FTReading.toggle();
      case 'fullscreen-left': return window.FTReading.fullScreenLeft();
      case 'goals': return window.FTGoals.open();
      case 'shortcuts': return window.FTShortcuts.open();
      case 'update': return window.FTUpdate.open();
      case 'report': return window.FTSignaler.open();
      case 'presentation': return presenting ? stopPresentation() : startPresentation();
      case 'tutorial': return openTutorial();
      case 'track': return window.FTTrack.toggle();
      case 'bookmarks': return window.FTBookmarks.toggle();
      case 'tags-on':
      case 'tags-off':
        settings.showTags = action === 'tags-on';
        api.saveSettings(settings);
        return window.FTTags.setVisible(settings.showTags);
      case 'minibar-on':
      case 'minibar-off':
        settings.miniBar = action === 'minibar-on';
        api.saveSettings(settings);
        return window.FTMiniBarre.setEnabled(settings.miniBar);
      case 'zoom-in': return window.FTZoom.in();
      case 'zoom-out': return window.FTZoom.out();
      case 'zoom-reset': return window.FTZoom.reset();
      case 'grammar-on':
      case 'grammar-off':
        settings.grammarCheck = action === 'grammar-on';
        api.saveSettings(settings);
        return window.FTSpell.setGrammar(settings.grammarCheck);
      case 'grammar-reset': // moteur de grammaire installé : les passages sont relus
        return window.FTSpell.resetGrammar();
      case 'before-close': {
        window.FTGoals.flush();
        let quit = true;
        try {
          await flushSave();
          // L'enregistrement a échoué (disque plein, fichier verrouillé…) : la fenêtre reste ouverte,
          // sauf si l'on choisit de quitter sans enregistrer.
          if (current && dirty && saveError) {
            if (api.closeCancelled) api.closeCancelled();
            quit = false;
            if (modal.open) modal.close('cancel');
            quit = !!(await confirmAction(`L’enregistrement a échoué (${saveError}). Quitter sans enregistrer les dernières modifications ?`, 'Quitter sans enregistrer'));
          }
          if (quit && current && !presenting) {
            keepPlace();
            remember(current, { excerpt: excerpt() }, false);
            await api.saveSettings(settings);
          }
        } catch (err) {
          console.error(err);
        }
        if (quit) api.readyToClose();
        return;
      }
    }
  }
  api.onMenu(menuAction);
  if (api.onLanguageToolProgress) api.onLanguageToolProgress(showLanguageToolProgress);
  window.FTApp.menu = menuAction;

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!settings.theme) applyTheme();
  });

  // ----- Démarrage -----

  // Fin du lancement : la fenêtre se montre (accueil ou document déjà en place). Au plus tard après 10 s.
  const started = () => document.body.classList.remove('ft-starting');
  setTimeout(started, 10000);

  (async function start() {
    settings = await api.loadSettings();
    // Numéro de la version installée à côté de son nom (« 1.4 », « 1.4.1 »).
    api.appVersion().then((v) => {
      const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(v || '');
      if (!m) return;
      const label = m[3] && m[3] !== '0' ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`;
      document.querySelector('.brand-version').textContent = label;
      document.querySelector('.brand-codename').title = 'Version ' + label;
    }).catch(() => {});
    window.FTCustomize.init(settings.appearance, (appearance) => {
      settings.appearance = appearance;
      api.saveSettings(settings);
    });
    applyTheme();
    window.FTGoals.init(settings.goals, (goals) => {
      settings.goals = goals;
      api.saveSettings(settings);
    });
    window.FTGoals.onDocChange(() => markDirty());
    window.FTTrack.onChange(() => markDirty());
    window.FTIndex.onChange(() => markDirty());
    window.FTComments.onChange(() => markDirty());
    window.FTComments.init(settings.author, (name) => {
      settings.author = name;
      api.saveSettings(settings);
    });
    window.FTCite.onStyleChange(() => markDirty());
    window.FTShortcuts.init(settings.shortcuts, (shortcuts) => {
      settings.shortcuts = shortcuts;
      api.saveSettings(settings);
    });
    window.FTReading.init(settings.reading, (reading) => {
      settings.reading = reading;
      api.saveSettings(settings);
    });
    window.FTMindmap.init(settings.mindmapLook, (look) => {
      settings.mindmapLook = look;
      api.saveSettings(settings);
    });
    window.FTTimeline.init(settings.timeline, (timeline) => {
      settings.timeline = timeline;
      api.saveSettings(settings);
    });
    window.FTOrdinals.init(settings.ordinals, (ordinals) => {
      settings.ordinals = ordinals;
      api.saveSettings(settings);
    });
    window.FTZoom.init(settings.zoom, (zoom) => {
      settings.zoom = zoom;
      api.saveSettings(settings);
    });
    window.FTToolbar.apply(settings.toolbar);
    window.FTToolbar.onChange((toolbar) => {
      settings.toolbar = toolbar;
      api.saveSettings(settings);
    });
    window.FTTags.setVisible(settings.showTags !== false);
    window.FTMiniBarre.setEnabled(settings.miniBar !== false);
    window.FTTags.onVisibleChange(async (on) => {
      settings.showTags = on;
      await api.saveSettings(settings);
      api.rebuildMenu(settings.shortcuts || {});
    });
    window.FTBookmarks.init(settings.bookmarkFlags, (on) => {
      settings.bookmarkFlags = on;
      api.saveSettings(settings);
    });
    window.FTTags.setProjectTags(projectTags);
    window.FTTags.onChange(() => markDirty());
    // Styles des titres : avant la 1.1.8, communs à tous les documents (settings.textStyles) ;
    // ils font maintenant partie du thème de chaque document.
    window.FTTheme.init(settings, (themes) => {
      Object.assign(settings, themes);
      api.saveSettings(settings);
    });
    window.FTTheme.onChange(markDirty);
    window.FTModeles.init(settings.layoutModels, (models) => {
      settings.layoutModels = models;
      api.saveSettings(settings);
    });
    window.FTLivre.init(settings.livre, (livre) => {
      settings.livre = livre;
      api.saveSettings(settings);
    });
    window.FTLang.init(settings.defaultLanguages, (list) => {
      settings.defaultLanguages = list;
      api.saveSettings(settings);
    });
    window.FTInsert.setFavorites(settings.favoriteChars);
    window.FTInsert.onFavoritesChange((favoriteChars) => {
      settings.favoriteChars = favoriteChars;
      api.saveSettings(settings);
    });
    window.FTSpell.setGrammar(settings.grammarCheck !== false);
    window.FTLayout.setCapitalize(settings.autoCapitalize !== false);
    window.FTLayout.onCapitalizeChange((on) => {
      settings.autoCapitalize = on;
      api.saveSettings(settings);
    });
    window.FTInsert.setQuotes(settings.quotes);
    window.FTInsert.onQuotesChange((q) => {
      settings.quotes = q;
      api.saveSettings(settings);
    });
    window.FTInsert.setTypo(settings.autoTypo !== false);
    window.FTInsert.onTypoChange((on) => {
      settings.autoTypo = on;
      api.saveSettings(settings);
    });
    window.FTInsert.setMedian(settings.medianDot);
    window.FTInsert.onMedianChange((on) => {
      settings.medianDot = on;
      api.saveSettings(settings);
    });
    $('app').classList.toggle('sidebar-hidden', !!settings.sidebarHidden);
    window.FTNav.init(settings.navpane, (v) => { settings.navpane = v; api.saveSettings(settings); });
    showPage(false);
    await reloadLibrary();
    // Documents renommés en .tmtx (version 1.2.3).
    if (settings.lastFile && /\.ftxt$/.test(settings.lastFile) && !lib.docs.some((d) => d.fileName === settings.lastFile)) {
      settings.lastFile = settings.lastFile.replace(/\.ftxt$/, '.tmtx');
    }
    // Fichier ouvert par un double-clic dans l'Explorateur (au lancement, ou logiciel déjà ouvert) : pas
    // d'accueil. Sinon l'accueil, ou le dernier document si l'accueil est désactivé.
    const pending = await api.pendingFiles();
    if (Array.isArray(pending) && pending.length) await openImported(pending);
    if (!current) {
      const last = settings.lastFile && lib.docs.some((d) => d.fileName === settings.lastFile) ? settings.lastFile : null;
      // (Affichage relancé après un arrêt inattendu : on reprend là où l'on était.)
      const resumed = api.resumed ? await api.resumed().catch(() => false) : false;
      if (!lib.docs.length && !recents().length) await newDoc(null, { quiet: true });
      else if (settings.welcome === false || (resumed && last)) { if (last) await openDoc(last); }
      else {
        await seedRecents();
        await showWelcome();
      }
    }
    // (Pas quand le logiciel est lancé par un document.)
    if (!(Array.isArray(pending) && pending.length)) await offerTutorial();
    api.onOpenFiles((files) => { openImported(files); });
    // Document Tomatoes Text ou Word glissé sur la fenêtre : ouvert (une image glissée reste insérée dans
    // la page, layout.js).
    window.addEventListener('drop', async (e) => {
      const list = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
      const docs = list.filter((f) => /\.(tmtx|ftxt|docx)$/i.test(f.name));
      if (!docs.length || !api.pathOf) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const paths = docs.map((f) => api.pathOf(f)).filter(Boolean);
      if (paths.length) await openImported(await api.openDropped(paths));
    }, true);
  })().finally(started);
})();
