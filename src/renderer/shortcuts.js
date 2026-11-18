// Raccourcis clavier personnalisables (Affichage > « Raccourcis clavier… »).
// Chaque commande a un raccourci d'origine ; les changements sont gardés dans settings.shortcuts
// ({ id: 'Ctrl+Shift+X' }, '' = aucun raccourci). Trois sortes de commandes :
// - menu : raccourci du menu de la fenêtre (main.js refait le menu avec les nouveaux raccourcis) ;
// - touche : raccourci déjà traité dans la page (gras, alignement…) : la nouvelle combinaison rejoue
//   l'ancienne, et l'ancienne est bloquée ;
// - action : une fonction (bouton de la barre d'outils, titre, liste…).
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  const dialog = $('keys-dialog');
  const listBox = $('keys-list');
  const msg = $('keys-msg');

  const click = (sel) => () => {
    const b = document.querySelector(sel);
    if (b && !b.disabled) b.click();
  };
  const structure = (name) => () => window.FTStructure.command(name);

  // [groupe, id, nom, raccourci d'origine, sorte, action | élément de la barre (pour l'infobulle)]
  const COMMANDS = [
    ['Fichier', 'home', 'Accueil', '', 'menu'],
    ['Fichier', 'new', 'Nouveau document', 'Ctrl+N', 'menu'],
    ['Fichier', 'new-model', 'Nouveau document depuis un modèle', '', 'menu'],
    ['Fichier', 'import', 'Ouvrir un document', 'Ctrl+O', 'menu'],
    ['Fichier', 'import-word', 'Importer un document Word', '', 'menu'],
    ['Fichier', 'save', 'Enregistrer', 'Ctrl+S', 'menu'],
    ['Fichier', 'export', 'Enregistrer une copie sous', 'Ctrl+Shift+S', 'menu'],
    ['Fichier', 'export-choose', 'Exporter', 'Ctrl+Shift+E', 'menu'],
    ['Fichier', 'versions', 'Historique des versions', 'Ctrl+Shift+H', 'menu'],
    ['Fichier', 'presentation', 'Mode présentation', '', 'menu'],
    ['Édition', 'undo', 'Annuler', 'Ctrl+Z', 'touche', '#undo-btn'],
    ['Édition', 'redo', 'Rétablir', 'Ctrl+Y', 'touche', '#redo-btn'],
    ['Édition', 'find', 'Rechercher', 'Ctrl+F', 'menu'],
    ['Édition', 'replace', 'Remplacer', 'Ctrl+H', 'menu'],
    ['Édition', 'track', 'Suivi des modifications', 'Ctrl+Shift+R', 'menu', '#track-btn'],
    ['Édition', 'bookmarks', 'Signets', 'Ctrl+Shift+G', 'menu', '#bookmarks-btn'],
    ['Édition', 'coherence', 'Vérifier la cohérence', '', 'menu'],
    ['Édition', 'readability', 'Statistiques de lisibilité', '', 'menu'],
    ['Édition', 'languages', 'Langues du document', '', 'menu'],
    ['Édition', 'lorem', 'Faux texte (lorem ipsum)', '', 'action', () => window.FTLorem.open()],
    ['Affichage', 'theme', 'Mode jour / crépuscule / lune', 'Ctrl+D', 'menu', '#theme-toggle'],
    ['Affichage', 'sidebar', 'Liste des documents', 'Ctrl+Shift+B', 'menu', '#sidebar-toggle'],
    ['Affichage', 'navpane', 'Volet de navigation', 'Ctrl+Shift+P', 'menu', '#navpane-toggle'],
    ['Affichage', 'assist', "Aide au Texte (AAT)", 'Ctrl+Shift+A', 'menu', '#assist-toggle'],
    ['Affichage', 'mindmap', 'Mindmap', 'Ctrl+M', 'menu'],
    ['Affichage', 'timeline', 'Carte du temps', 'Ctrl+Shift+T', 'menu'],
    ['Affichage', 'focus', 'Mode lecture', 'Ctrl+Shift+F', 'menu', '#reading-btn'],
    ['Affichage', 'goals', 'Objectifs et statistiques', '', 'menu'],
    ['Affichage', 'layout-model', 'Modèle de mise en page', '', 'menu', '#layout-tab'],
    ['Affichage', 'doc-theme', 'Thème du document', '', 'menu', '#doc-theme-tab'],
    ['Affichage', 'customize', 'Thème du logiciel', '', 'menu'],
    ['Affichage', 'shortcuts', 'Raccourcis clavier', '', 'menu'],
    ['Aide', 'update', 'Rechercher une mise à jour', '', 'menu'],
    ['Aide', 'report', 'Signaler un défaut', 'Ctrl+Shift+F1', 'menu'],
    ['Mise en forme', 'bold', 'Gras', 'Ctrl+G', 'touche', '[data-tb="bold"]', ['Ctrl+B']],
    ['Mise en forme', 'italic', 'Italique', 'Ctrl+I', 'touche', '[data-tb="italic"]'],
    ['Mise en forme', 'underline', 'Souligné', 'Ctrl+U', 'touche', '[data-tb="underline"]'],
    ['Mise en forme', 'strike', 'Barré', 'Ctrl+Shift+X', 'touche', '[data-tb="strike"]'],
    ['Mise en forme', 'smallcaps', 'Petites capitales', 'Ctrl+Shift+K', 'touche', '#smallcaps-btn'],
    ['Mise en forme', 'case', 'Changer la casse', 'Shift+F3', 'action', () => window.FTCase.cycle()],
    ['Mise en forme', 'highlight', 'Surligner', '', 'action', click('#hl-btn')],
    ['Mise en forme', 'align-left', 'Aligner à gauche', 'Ctrl+L', 'touche', '[data-tb="align-left"]'],
    ['Mise en forme', 'align-center', 'Centrer', 'Ctrl+E', 'touche', '[data-tb="align-center"]'],
    ['Mise en forme', 'align-right', 'Aligner à droite', 'Ctrl+R', 'touche', '[data-tb="align-right"]'],
    ['Mise en forme', 'align-justify', 'Justifier', 'Ctrl+J', 'touche', '[data-tb="align-justify"]'],
    ['Mise en forme', 'link', 'Lien hypertexte', 'Ctrl+Shift+L', 'touche'],
    ['Structure', 'normal', 'Texte normal', '', 'action', structure('p')],
    ['Structure', 'title', 'Titre du document', '', 'action', structure('title')],
    ['Structure', 'h1', 'Titre 1', '', 'action', structure('h1')],
    ['Structure', 'h2', 'Titre 2', '', 'action', structure('h2')],
    ['Structure', 'h3', 'Titre 3', '', 'action', structure('h3')],
    ['Structure', 'h4', 'Titre 4', '', 'action', structure('h4')],
    ['Structure', 'bullets', 'Liste à tirets', '', 'action', structure('ul')],
    ['Structure', 'numbers', 'Liste numérotée', '', 'action', structure('ol')],
    ['Structure', 'checks', 'Liste à cocher', '', 'action', structure('check')],
    ['Structure', 'callout', 'Encadré', '', 'action', structure('callout')],
    ['Insertion', 'table', 'Tableau 3 × 3', '', 'action', click('#table-quick')],
    ['Insertion', 'image', 'Image', '', 'action', click('#image-btn')],
    ['Insertion', 'math', 'Formule', '', 'action', click('#math-btn')],
    ['Insertion', 'note', 'Note de bas de page', '', 'action', click('#note-btn')],
    ['Insertion', 'chars', 'Caractères spéciaux', '', 'action', click('#chars-btn')],
    ['Insertion', 'diagram', 'Schéma', '', 'action', click('#diagram-btn')],
    ['Insertion', 'bio', 'Repère biographique', '', 'action', click('#bio-btn')],
    ['Insertion', 'lettrine', 'Lettrine', '', 'action', click('#lettrine-btn')],
    ['Insertion', 'date', 'Date du jour', '', 'action', () => window.FTCite.insertDate()],
    ['Insertion', 'endnote', 'Note de fin', '', 'action', () => window.FTCite.insertEndnote()],
    ['Insertion', 'cite', 'Sourcer (renvoi à une source)', '', 'action', () => window.FTCite.open(null)],
    ['Insertion', 'pdf-source', 'Source PDF côte à côte', '', 'action', () => window.FTSourcePdf.toggle()],
    ['Insertion', 'quote', 'Citation (bloc)', '', 'action', click('#quote-btn')],
    ['Insertion', 'bookmark-add', 'Signet à la ligne du curseur', '', 'action', () => window.FTBookmarks.add()],
    ['Insertion', 'cover', 'Page de titre', '', 'action', () => window.FTCover.open()],
    ['Insertion', 'pagenum', 'Numéros de page', '', 'action', click('#pagenum-btn')],
    ['Insertion', 'lof', 'Table des illustrations', '', 'action', () => window.FTCaptions.insert('tout')],
    ['Insertion', 'xref', 'Renvoi', '', 'action', () => window.FTXref.open()],
    ['Insertion', 'index-words', 'Mots de l’index', '', 'action', () => window.FTIndex.open()],
    ['Insertion', 'index', 'Index', '', 'action', () => window.FTIndex.insert()],
    ['Insertion', 'comment', 'Nouveau commentaire', 'Ctrl+Shift+M', 'action', () => window.FTComments.add()],
    ['Outils', 'palette', 'Rechercher un outil', 'Ctrl+K', 'action', click('#palette-btn')],
    ['Outils', 'capitalize', 'Majuscule automatique', '', 'action', click('#capitalize-btn')],
    ['Outils', 'typo', 'Typographie automatique', '', 'action', click('#typo-btn')],
    ['Outils', 'median', 'Point médian', '', 'action', click('#median-btn')],
    ['Outils', 'indent', 'Alinéa automatique', '', 'action', click('#auto-indent')],
    ['Outils', 'styles', 'Styles des titres', '', 'action', () => window.FTStyles.open('titres')],
    ['Affichage', 'docstyles', 'Styles du document', '', 'action', click('#docstyles-btn')]
  ].map(([group, id, label, def, kind, extra, aliases]) => ({
    group, id, label, def, kind, aliases: aliases || [],
    run: typeof extra === 'function' ? extra : null,
    target: typeof extra === 'string' ? extra : null
  }));
  const byId = new Map(COMMANDS.map((c) => [c.id, c]));

  // Combinaisons réservées : on ne peut pas les donner à une commande.
  const RESERVED = { 'Ctrl+C': 'copier', 'Ctrl+V': 'coller', 'Ctrl+X': 'couper', 'Ctrl+A': 'tout sélectionner', 'Ctrl+Shift+V': 'coller sans mise en forme', 'F11': 'plein écran', 'Ctrl+Shift+I': 'outils de développement' };

  let custom = {};
  let onSave = () => {};

  const binding = (c) => (Object.prototype.hasOwnProperty.call(custom, c.id) ? custom[c.id] : c.def);

  // ----- Combinaisons de touches -----

  const NAMED = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' };

  // La combinaison d'un appui de touche, au format des menus d'Electron (Ctrl+Shift+K), ou null.
  function comboOf(e) {
    let key = null;
    if (/^[a-z]$/i.test(e.key)) key = e.key.toUpperCase();
    else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
    else if (/^Numpad\d$/.test(e.code)) key = 'num' + e.code.slice(6);
    else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
    else if (NAMED[e.key]) key = NAMED[e.key];
    else if (/^Key[A-Z]$/.test(e.code) && (e.ctrlKey || e.altKey)) key = e.code.slice(3); // lettre avec AltGr
    if (!key) return null;
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return [...mods, key].join('+');
  }

  const SHOW = { Shift: 'Maj', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Espace', Enter: 'Entrée', Tab: 'Tab', Backspace: 'Retour arrière', Delete: 'Suppr', Insert: 'Inser', Home: 'Début', End: 'Fin', PageUp: 'Page préc.', PageDown: 'Page suiv.' };
  const display = (combo) => (combo ? combo.split('+').map((k) => SHOW[k] || k.replace(/^num(\d)$/, 'Pavé $1')).join('+') : '');

  // Rejoue l'ancienne combinaison, pour les raccourcis déjà traités dans la page.
  function replay(combo) {
    const parts = combo.split('+');
    const key = parts[parts.length - 1];
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : $('editor');
    const ev = new KeyboardEvent('keydown', {
      key: key.length === 1 ? key.toLowerCase() : key,
      code: /^[A-Z]$/.test(key) ? 'Key' + key : '',
      ctrlKey: parts.includes('Ctrl'),
      altKey: parts.includes('Alt'),
      shiftKey: parts.includes('Shift'),
      bubbles: true,
      cancelable: true
    });
    ev.ftReplay = true;
    target.dispatchEvent(ev);
  }

  function run(c) {
    if (c.kind === 'touche') return replay(c.def);
    if (c.kind === 'menu') return window.FTApp.menu(c.id);
    if (c.run) return c.run();
  }

  // Écoute avant tous les autres (phase de capture sur la fenêtre).
  window.addEventListener('keydown', (e) => {
    if (e.ftReplay || capturing) return;
    const combo = comboOf(e);
    if (!combo) return;
    // Raccourcis du menu : c'est le menu qui les traite.
    const own = COMMANDS.find((c) => c.kind !== 'menu' && binding(c) === combo);
    if (own) {
      if (own.kind === 'touche' && combo === own.def) return; // raccourci d'origine : traité comme avant
      e.preventDefault();
      e.stopImmediatePropagation();
      run(own);
      return;
    }
    // Ancien raccourci d'une commande qui en a changé : il ne fait plus rien.
    const moved = COMMANDS.find((c) => (c.def === combo || c.aliases.includes(combo)) && binding(c) !== c.def);
    if (moved && !COMMANDS.some((c) => c.kind === 'menu' && binding(c) === combo)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // ----- Infobulles de la barre d'outils -----

  const COMBO_IN_TITLE = /\s*\((?:Ctrl|Alt|Maj|F\d)[^),]*\)/;
  function applyTitles() {
    for (const c of COMMANDS) {
      if (!c.target) continue;
      document.querySelectorAll(c.target).forEach((el) => {
        if (!el.dataset.titleBase) {
          if (!el.title) return;
          el.dataset.titleBase = el.title;
        }
        const base = el.dataset.titleBase;
        const b = binding(c);
        el.title = COMBO_IN_TITLE.test(base)
          ? base.replace(COMBO_IN_TITLE, b ? ` (${display(b)})` : '')
          : (b ? base.replace(/^([^:]+)/, `$1 (${display(b)})`) : base);
      });
    }
  }

  function save() {
    onSave({ ...custom });
    api.rebuildMenu({ ...custom });
    applyTitles();
  }

  // ----- Fenêtre -----

  let capturing = null; // commande en attente de sa nouvelle combinaison
  let pending = null; // { command, combo, other } : combinaison déjà prise, en attente de confirmation

  function render() {
    const query = $('keys-search').value.trim().toLowerCase();
    listBox.textContent = '';
    let group = null;
    for (const c of COMMANDS) {
      if (query && !(c.label.toLowerCase().includes(query) || c.group.toLowerCase().includes(query) || display(binding(c)).toLowerCase().includes(query))) continue;
      if (c.group !== group) {
        group = c.group;
        const h = document.createElement('div');
        h.className = 'keys-group';
        h.textContent = group;
        listBox.appendChild(h);
      }
      const row = document.createElement('div');
      row.className = 'keys-row';
      const name = document.createElement('span');
      name.className = 'keys-name';
      name.textContent = c.label;
      const combo = document.createElement('button');
      combo.type = 'button';
      combo.className = 'keys-combo' + (capturing === c ? ' capturing' : '') + (binding(c) ? '' : ' none');
      combo.textContent = capturing === c ? 'Appuyez sur les touches…' : (display(binding(c)) || 'Aucun');
      combo.title = 'Cliquez puis appuyez sur la nouvelle combinaison de touches';
      combo.addEventListener('click', () => startCapture(c));
      const changed = binding(c) !== c.def;
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'keys-icon';
      reset.textContent = '↺';
      reset.title = c.def ? `Remettre le raccourci d'origine (${display(c.def)})` : "Remettre sans raccourci, comme à l'origine";
      reset.hidden = !changed;
      reset.addEventListener('click', () => { delete custom[c.id]; capturing = null; save(); render(); });
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'keys-icon';
      clear.textContent = '✕';
      clear.title = 'Retirer le raccourci';
      clear.hidden = !binding(c);
      clear.addEventListener('click', () => { setBinding(c, ''); render(); });
      row.append(name, combo, reset, clear);
      row.classList.toggle('changed', changed);
      listBox.appendChild(row);
    }
  }

  function setBinding(c, combo) {
    if (combo === c.def) delete custom[c.id];
    else custom[c.id] = combo;
    save();
  }

  function say(text, actions) {
    msg.textContent = text;
    msg.hidden = !text;
    if (actions) msg.append(...actions);
  }

  function startCapture(c) {
    capturing = c;
    api.suspendMenuShortcuts(true);
    pending = null;
    say('Appuyez sur la nouvelle combinaison de touches (Échap pour annuler).');
    render();
    const btn = listBox.querySelector('.keys-combo.capturing');
    if (btn) btn.focus();
  }

  function stopCapture() {
    capturing = null;
    api.suspendMenuShortcuts(false);
    render();
  }

  function check(combo) {
    const parts = combo.split('+');
    const key = parts[parts.length - 1];
    if (RESERVED[combo]) return `${display(combo)} est réservé (${RESERVED[combo]}).`;
    if (parts.includes('Ctrl') && parts.includes('Alt')) return `${display(combo)} n'est pas possible : sur un clavier français, Ctrl+Alt fait AltGr, qui sert à écrire €, @, #…`;
    if (parts.length === 1 && !/^F\d+$/.test(key)) return 'Il faut au moins une touche Ctrl ou Alt (les touches F1 à F12 peuvent servir seules).';
    if (parts.length === 2 && parts[0] === 'Shift' && !/^F\d+$/.test(key)) return 'Maj seule ne suffit pas : ajoutez Ctrl ou Alt.';
    return null;
  }

  dialog.addEventListener('keydown', (e) => {
    if (!capturing) return;
    if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { say(''); stopCapture(); return; }
    const combo = comboOf(e);
    if (!combo) { say("Cette touche ne peut pas servir de raccourci. Essayez une lettre, un chiffre ou une touche F1 à F12, avec Ctrl ou Alt."); return; }
    const problem = check(combo);
    if (problem) { say(problem + ' Essayez une autre combinaison.'); return; }
    const c = capturing;
    const other = COMMANDS.find((o) => o !== c && binding(o) === combo);
    capturing = null;
    api.suspendMenuShortcuts(false);
    if (other) {
      pending = { command: c, combo, other };
      const yes = document.createElement('button');
      yes.type = 'button';
      yes.textContent = 'Remplacer';
      yes.className = 'primary';
      yes.addEventListener('click', () => {
        setBinding(pending.other, '');
        setBinding(pending.command, pending.combo);
        pending = null;
        say('');
        render();
      });
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = 'Annuler';
      no.addEventListener('click', () => { pending = null; say(''); render(); });
      say(`${display(combo)} sert déjà à « ${other.label} ». Le donner à « ${c.label} » ? « ${other.label} » n'aura plus de raccourci. `, [yes, ' ', no]);
      render();
      return;
    }
    setBinding(c, combo);
    say(`« ${c.label} » : ${display(combo)}.`);
    render();
  }, true);

  // Échap pendant la saisie d'une combinaison ne ferme pas la fenêtre.
  dialog.addEventListener('cancel', (e) => {
    if (capturing) { e.preventDefault(); say(''); stopCapture(); }
  });
  dialog.addEventListener('close', () => {
    if (capturing) api.suspendMenuShortcuts(false);
    capturing = null;
    pending = null;
  });

  $('keys-search').addEventListener('input', render);
  $('keys-reset-all').addEventListener('click', async () => {
    const ok = await window.FTApp.ask("Remettre tous les raccourcis clavier d'origine ?", '', { okLabel: 'Tout remettre', input: false });
    if (!ok) return;
    custom = {};
    save();
    say('Tous les raccourcis sont revenus à leur réglage d’origine.');
    render();
  });
  $('keys-close').addEventListener('click', () => dialog.close());

  function open() {
    $('keys-search').value = '';
    capturing = null;
    say('');
    render();
    if (!dialog.open) dialog.showModal();
    $('keys-search').focus();
  }

  window.FTShortcuts = {
    init(saved, saveFn) {
      custom = {};
      if (saved && typeof saved === 'object') {
        for (const [id, combo] of Object.entries(saved)) if (byId.has(id) && typeof combo === 'string') custom[id] = combo;
      }
      onSave = saveFn;
      applyTitles();
    },
    open,
    display,
    // Pour la palette de commandes (palette.js).
    commands: () => COMMANDS.map(({ group, id, label, kind, target }) => ({ group, id, label, kind, target })),
    run: (id) => { if (byId.has(id)) run(byId.get(id)); },
    // Commande donnée à la combinaison d'un appui de touche ({ id, kind }), ou null (mode lecture).
    commandAt(e) {
      const combo = comboOf(e);
      const c = combo && COMMANDS.find((o) => binding(o) === combo);
      return c ? { id: c.id, kind: c.kind } : null;
    },
    binding: (id) => (byId.has(id) ? binding(byId.get(id)) : '')
  };
})();
