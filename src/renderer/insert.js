// Boutons d'insertion : note de bas de page, caractères spéciaux (avec favoris) et formules mathématiques.
(function () {
  let editor = document.getElementById('editor');
  let S = () => window.FTStructure;
  // Moteur 2.0 : formules placées, changées et retirées par le moteur (moteur/ecriture.js).
  let EM = null;

  // ----- Note de bas de page -----

  const noteBtn = document.getElementById('note-btn');
  noteBtn.addEventListener('mousedown', (e) => e.preventDefault());
  noteBtn.addEventListener('click', () => window.FTStructure.insertFootnote());

  // ----- Caractères spéciaux -----

  const CHAR_GROUPS = [
    ['Typographie', '« » “ ” ‘ ’ ‹ › — – … · • ‣ † ‡ § ¶ © ® ™ ° ‰ № ¡ ¿ ⁂ ※'],
    ['Lettres', 'À Â Æ Ç É È Ê Ë Î Ï Ô Œ Ù Û Ü Ÿ à â æ ç é è ê ë î ï ô œ ù û ü ÿ ß ñ Ñ ã õ å ø Ø ð þ'],
    ['Monnaies', '€ £ $ ¥ ¢ ₿ ₽ ₹ ₩ ₺ ¤'],
    ['Maths', '± × ÷ ≈ ≠ ≡ ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ π µ ½ ⅓ ¼ ¾ ² ³ ¹ ⁿ ∈ ∉ ⊂ ∪ ∩ ∅ ∀ ∃ ¬'],
    ['Flèches', '← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇔ ↗ ↘ ↖ ↙ ↺ ↻ ➜'],
    ['Grec', 'α β γ δ ε ζ η θ ι κ λ μ ν ξ π ρ σ τ υ φ χ ψ ω Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω'],
    ['Symboles', '★ ☆ ✓ ✗ ✔ ✘ ♥ ♦ ♣ ♠ ☐ ☑ ☒ ♪ ♫ ☺ ☹ ☀ ☁ ☂ ☎ ✉ ✎ ✂ ⚠ ⚑ ∴ ∵']
  ];
  // Espaces spéciales, invisibles : on les montre par un nom.
  const SPACES = [[' ', 'insécable', 'Espace insécable (évite un retour à la ligne)'], [' ', 'fine', 'Espace fine insécable (avant ; : ! ? en typographie française)']];
  const DEFAULT_FAVORITES = ['«', '»', '—', '…', '€', '°', 'œ', '×'];

  const charsBtn = document.getElementById('chars-btn');
  const favPop = document.getElementById('chars-fav');
  const charsPop = document.getElementById('chars-pop');
  const tool = charsBtn.closest('.chars-tool');
  let favorites = DEFAULT_FAVORITES.slice();
  let onFavoritesChange = () => {};

  // Moteur 2.0 : caractère écrit par le moteur (moteur/ecriture.js).
  let engineText = null;
  function insertChar(ch) {
    if (engineText) return engineText(ch);
    S().restoreSelection();
    document.execCommand('insertText', false, ch);
  }

  const codeOf = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

  function charButton(ch, label, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'char' + (favorites.includes(ch) ? ' fav' : '') + (label ? ' named' : '');
    b.textContent = label || ch;
    b.title = (title || ch) + ` (${codeOf(ch)})`;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => insertChar(ch));
    // Clic droit : ajoute aux favoris, ou les en retire.
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      favorites = favorites.includes(ch) ? favorites.filter((c) => c !== ch) : [...favorites, ch];
      onFavoritesChange(favorites.slice());
      buildFull();
      buildFavorites();
    });
    return b;
  }

  function section(title, buttons, hint) {
    const s = document.createElement('div');
    s.className = 'chars-section';
    const h = document.createElement('div');
    h.className = 'pop-title';
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'chars-grid';
    grid.append(...buttons);
    s.append(h, grid);
    if (hint && !buttons.length) {
      const p = document.createElement('p');
      p.className = 'chars-hint';
      p.textContent = hint;
      s.append(p);
    }
    return s;
  }

  function buildFull() {
    const scroll = charsPop.querySelector('.chars-scroll') || document.createElement('div');
    const top = scroll.scrollTop;
    scroll.className = 'chars-scroll';
    scroll.replaceChildren(
      section('★ Favoris', favorites.map((c) => charButton(c)), 'Aucun favori pour le moment.'),
      ...CHAR_GROUPS.map(([name, list]) => section(name, list.split(' ').map((c) => charButton(c)))),
      section('Espaces', SPACES.map(([c, label, title]) => charButton(c, label, title)))
    );
    if (!scroll.isConnected) {
      const hint = document.createElement('p');
      hint.className = 'chars-hint';
      hint.textContent = 'Clic : insérer le caractère. Clic droit : l\'ajouter aux favoris ou l\'en retirer.';
      charsPop.append(hint, scroll);
    }
    scroll.scrollTop = top;
  }

  function buildFavorites() {
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'chars-all';
    all.textContent = 'Tous les caractères…';
    all.addEventListener('mousedown', (e) => e.preventDefault());
    all.addEventListener('click', openFull);
    const grid = document.createElement('div');
    grid.className = 'chars-grid';
    grid.append(...favorites.map((c) => charButton(c)));
    favPop.replaceChildren(
      ...(favorites.length ? [grid] : [Object.assign(document.createElement('p'), { className: 'chars-hint', textContent: 'Pas encore de favoris : clic droit sur un caractère de la liste complète.' })]),
      all
    );
  }

  function placeUnder(pop) {
    window.FTToolbar.placePop(pop, charsBtn, 2);
  }

  function openFull() {
    favPop.hidden = true;
    buildFull();
    charsPop.hidden = false;
    placeUnder(charsPop);
  }

  // Survol du bouton : les favoris ; clic : la liste complète.
  let hoverTimer = null;
  tool.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    // Retour de la souris sur les favoris déjà ouverts : on les laisse tels quels (les reconstruire
    // pendant un clic faisait perdre ce clic).
    if (!charsPop.hidden || !favPop.hidden || charsBtn.disabled) return;
    hoverTimer = setTimeout(() => {
      buildFavorites();
      favPop.hidden = false;
      placeUnder(favPop);
    }, 200);
  });
  tool.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { favPop.hidden = true; }, 250);
  });
  charsBtn.addEventListener('mousedown', (e) => e.preventDefault());
  charsBtn.addEventListener('click', () => {
    clearTimeout(hoverTimer);
    if (!charsPop.hidden) { charsPop.hidden = true; return; }
    openFull();
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.chars-tool')) { charsPop.hidden = true; favPop.hidden = true; }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { charsPop.hidden = true; favPop.hidden = true; } });

  // ----- Mode point médian -----

  // Activé, la touche * du pavé numérique écrit un point médian (écriture inclusive).
  // Le * obtenu par Maj+$ (ou une autre touche) reste un astérisque.
  const medianBtn = document.getElementById('median-btn');
  let median = false;
  let onMedianChange = () => {};
  function setMedian(on) {
    median = !!on;
    medianBtn.classList.toggle('on', median);
  }
  medianBtn.addEventListener('mousedown', (e) => e.preventDefault());
  medianBtn.addEventListener('click', () => {
    setMedian(!median);
    onMedianChange(median);
  });
  editor.addEventListener('keydown', (e) => {
    if (!median || e.code !== 'NumpadMultiply' || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    document.execCommand('insertText', false, '·');
  });

  // ----- Typographie automatique : ' devient ’, -- devient –, ... devient … (moteur/ecriture.js) -----

  const typoBtn = document.getElementById('typo-btn');
  let typo = true;
  let onTypoChange = () => {};
  function setTypo(on) {
    typo = on !== false;
    typoBtn.classList.toggle('on', typo);
  }
  typoBtn.addEventListener('mousedown', (e) => e.preventDefault());
  typoBtn.addEventListener('click', () => {
    setTypo(!typo);
    onTypoChange(typo);
  });

  // ----- Guillemets : la touche " écrit « » (avec espaces insécables) ou “ ” -----

  const quotesSwitch = document.getElementById('quotes-switch');
  const quoteButtons = [...quotesSwitch.querySelectorAll('button')];
  let quotes = 'francais';
  let onQuotesChange = () => {};
  let afterOpening = false;  // juste après « : l'espace tapée est déjà là (insécable)
  function setQuotes(q, animate = false) {
    quotes = q === 'anglais' ? 'anglais' : 'francais';
    quoteButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === quotes)));
    window.FTSwitch.place(quotesSwitch, animate);
  }
  quoteButtons.forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (b.dataset.q === quotes) return;
      setQuotes(b.dataset.q, true);
      onQuotesChange(quotes);
    });
  });

  // Le texte du paragraphe avant le curseur.
  function textBeforeCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const r = sel.getRangeAt(0);
    const before = document.createRange();
    const block = (r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : r.startContainer)
      .closest('p, li, h1, h2, h3, h4, h5, h6, td, th, div, blockquote') || editor;
    before.setStart(editor.contains(block) ? block : editor, 0);
    before.setEnd(r.startContainer, r.startOffset);
    return before.toString();
  }

  const count = (text, ch) => text.split(ch).length - 1;

  editor.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertText' || e.isComposing) { afterOpening = false; return; }
    if (afterOpening && e.data === ' ') { afterOpening = false; e.preventDefault(); return; }
    afterOpening = false;
    if (e.data !== '"') return;
    e.preventDefault();
    const text = textBeforeCaret();
    const prev = text.slice(-1);
    const [open, close] = quotes === 'anglais' ? ['“', '”'] : ['«', '»'];
    // Un guillemet resté ouvert dans le paragraphe se ferme, même après une espace.
    const unclosed = count(text, open) > count(text, close);
    const opening = !unclosed && (!prev || /[\s\u00a0\u202f(\[{\u2014\u2013'’\-/]/.test(prev));
    if (opening) {
      document.execCommand('insertText', false, quotes === 'anglais' ? '“' : '«\u00a0');
      afterOpening = quotes !== 'anglais';
      return;
    }
    const collapsed = window.getSelection().isCollapsed;
    if (prev === ' ' && collapsed) document.execCommand('delete');
    if (quotes === 'anglais') document.execCommand('insertText', false, '”');
    else document.execCommand('insertText', false, prev === '\u00a0' && collapsed ? '»' : '\u00a0»');
  });

  // ----- Formules mathématiques (MathLive, livré avec le logiciel) -----

  const ML = window.MathLive;
  const fontsUrl = new URL('vendor/mathlive/fonts/', location.href).href;
  if (ML && ML.MathfieldElement) {
    ML.MathfieldElement.fontsDirectory = fontsUrl;
    ML.MathfieldElement.soundsDirectory = null;
  }

  const render = (latex, block) => (ML ? ML.convertLatexToMarkup(latex, { defaultMode: block ? 'math' : 'inline-math' }) : latex);

  // d : ce qui s'affiche sur le bouton ; i : ce qui est inséré (#? = case à remplir, #0 / #@ = sélection).
  const PALETTE = [
    ['Bases', [
      ['\\frac{a}{b}', '\\frac{#@}{#?}', 'Fraction (ou tapez /)'],
      ['x^{n}', '#@^{#?}', 'Exposant (ou tapez ^)'],
      ['x_{i}', '#@_{#?}', 'Indice (ou tapez _)'],
      ['x_{i}^{n}', '#@_{#?}^{#?}', 'Indice et exposant'],
      ['\\sqrt{x}', '\\sqrt{#0}', 'Racine carrée'],
      ['\\sqrt[n]{x}', '\\sqrt[#?]{#0}', 'Racine n-ième'],
      ['\\left(x\\right)', '\\left(#0\\right)', 'Parenthèses'],
      ['\\left[x\\right]', '\\left[#0\\right]', 'Crochets'],
      ['\\left\\lbrace x\\right\\rbrace', '\\left\\lbrace #0\\right\\rbrace', 'Accolades'],
      ['\\left|x\\right|', '\\left|#0\\right|', 'Valeur absolue'],
      ['\\times', '\\times', 'Multiplication'],
      ['\\div', '\\div', 'Division'],
      ['\\cdot', '\\cdot', 'Point de multiplication'],
      ['\\pm', '\\pm', 'Plus ou moins'],
      ['\\neq', '\\neq', 'Différent'],
      ['\\approx', '\\approx', 'Environ égal'],
      ['\\equiv', '\\equiv', 'Équivalent'],
      ['\\leq', '\\leq', 'Inférieur ou égal'],
      ['\\geq', '\\geq', 'Supérieur ou égal'],
      ['\\propto', '\\propto', 'Proportionnel'],
      ['\\infty', '\\infty', 'Infini'],
      ['\\ldots', '\\ldots', 'Points de suspension'],
      ['\\%', '\\%', 'Pourcentage'],
      ['\\degree', '\\degree', 'Degré']
    ]],
    ['Grec', [
      ...['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
        'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega'].map((n) => ['\\' + n, '\\' + n, n])
    ]],
    ['Analyse', [
      ['\\sum_{i=1}^{n}', '\\sum_{#?}^{#?}', 'Somme'],
      ['\\prod_{i=1}^{n}', '\\prod_{#?}^{#?}', 'Produit'],
      ['\\int_{a}^{b}f\\,\\mathrm{d}x', '\\int_{#?}^{#?}#0\\,\\mathrm{d}#?', 'Intégrale avec bornes'],
      ['\\int f\\,\\mathrm{d}x', '\\int #0\\,\\mathrm{d}#?', 'Intégrale'],
      ['\\iint', '\\iint #0\\,\\mathrm{d}#?\\,\\mathrm{d}#?', 'Intégrale double'],
      ['\\iiint', '\\iiint #0', 'Intégrale triple'],
      ['\\oint', '\\oint #0', 'Intégrale sur un contour'],
      ['\\lim_{x\\to a}', '\\lim_{#?\\to #?}', 'Limite'],
      ['\\frac{\\mathrm{d}y}{\\mathrm{d}x}', '\\frac{\\mathrm{d}#?}{\\mathrm{d}#?}', 'Dérivée'],
      ['\\frac{\\mathrm{d}^2y}{\\mathrm{d}x^2}', '\\frac{\\mathrm{d}^2#?}{\\mathrm{d}#?^2}', 'Dérivée seconde'],
      ['\\frac{\\partial f}{\\partial x}', '\\frac{\\partial #?}{\\partial #?}', 'Dérivée partielle'],
      ["f'", "#@'", 'Prime (dérivée)'],
      ['\\dot{x}', '\\dot{#0}', 'Dérivée par rapport au temps'],
      ['\\partial', '\\partial', 'Dérivée partielle (symbole)'],
      ['\\nabla', '\\nabla', 'Nabla (gradient)'],
      ['\\to', '\\to', 'Tend vers'],
      ['\\mapsto', '\\mapsto', 'Associe à']
    ]],
    ['Fonctions', [
      ['f\\left(x\\right)', '#?\\left(#?\\right)', 'Fonction'],
      ['\\sin', '\\sin\\left(#0\\right)', 'Sinus'],
      ['\\cos', '\\cos\\left(#0\\right)', 'Cosinus'],
      ['\\tan', '\\tan\\left(#0\\right)', 'Tangente'],
      ['\\arcsin', '\\arcsin\\left(#0\\right)', 'Arc sinus'],
      ['\\arccos', '\\arccos\\left(#0\\right)', 'Arc cosinus'],
      ['\\arctan', '\\arctan\\left(#0\\right)', 'Arc tangente'],
      ['\\sinh', '\\sinh\\left(#0\\right)', 'Sinus hyperbolique'],
      ['\\cosh', '\\cosh\\left(#0\\right)', 'Cosinus hyperbolique'],
      ['\\ln', '\\ln\\left(#0\\right)', 'Logarithme népérien'],
      ['\\log', '\\log\\left(#0\\right)', 'Logarithme décimal'],
      ['\\log_{b}', '\\log_{#?}\\left(#0\\right)', 'Logarithme en base b'],
      ['e^{x}', 'e^{#?}', 'Exponentielle'],
      ['\\exp', '\\exp\\left(#0\\right)', 'Fonction exponentielle'],
      ['\\max', '\\max\\left(#0\\right)', 'Maximum'],
      ['\\min', '\\min\\left(#0\\right)', 'Minimum'],
      ['\\lfloor x\\rfloor', '\\lfloor #0\\rfloor', 'Partie entière'],
      ['n!', '#@!', 'Factorielle'],
      ['\\binom{n}{k}', '\\binom{#?}{#?}', 'Coefficient binomial']
    ]],
    ['Vecteurs et matrices', [
      ['\\vec{u}', '\\vec{#0}', 'Vecteur'],
      ['\\overrightarrow{AB}', '\\overrightarrow{#0}', 'Vecteur entre deux points'],
      ['\\lVert u\\rVert', '\\lVert #0\\rVert', 'Norme'],
      ['\\hat{u}', '\\hat{#0}', 'Chapeau'],
      ['\\overline{z}', '\\overline{#0}', 'Barre (conjugué, moyenne)'],
      ['\\perp', '\\perp', 'Perpendiculaire'],
      ['\\parallel', '\\parallel', 'Parallèle'],
      // Matrices, vecteurs en colonne et systèmes : à la taille choisie au-dessus de la boîte.
      { size: (r, c) => matrix('pmatrix', r, c, `Matrice ${r} × ${c}`) },
      { size: (r, c) => matrix('bmatrix', r, c, `Matrice ${r} × ${c} entre crochets`) },
      { size: (r, c) => matrix('vmatrix', r, c, `Déterminant ${r} × ${c}`) },
      { size: (r) => matrix('pmatrix', r, 1, `Vecteur colonne à ${r} composantes`) },
      { size: (r, c) => matrix('pmatrix', 1, c, `Vecteur ligne à ${c} composantes`) },
      { size: (r) => matrix('cases', r, 1, `Système de ${r} équations`) }
    ]],
    ['Ensembles et logique', [
      ['\\in', '\\in', 'Appartient à'],
      ['\\notin', '\\notin', "N'appartient pas à"],
      ['\\subset', '\\subset', 'Inclus dans'],
      ['\\subseteq', '\\subseteq', 'Inclus ou égal'],
      ['\\cup', '\\cup', 'Union'],
      ['\\cap', '\\cap', 'Intersection'],
      ['\\setminus', '\\setminus', 'Privé de'],
      ['\\emptyset', '\\emptyset', 'Ensemble vide'],
      ['\\mathbb{N}', '\\mathbb{N}', 'Entiers naturels'],
      ['\\mathbb{Z}', '\\mathbb{Z}', 'Entiers relatifs'],
      ['\\mathbb{Q}', '\\mathbb{Q}', 'Rationnels'],
      ['\\mathbb{R}', '\\mathbb{R}', 'Réels'],
      ['\\mathbb{C}', '\\mathbb{C}', 'Complexes'],
      ['\\left[a;b\\right]', '\\left[#?;#?\\right]', 'Intervalle'],
      ['\\forall', '\\forall', 'Pour tout'],
      ['\\exists', '\\exists', 'Il existe'],
      ['\\Rightarrow', '\\Rightarrow', 'Implique'],
      ['\\Leftrightarrow', '\\Leftrightarrow', 'Équivaut à'],
      ['\\neg', '\\neg', 'Non'],
      ['\\land', '\\land', 'Et'],
      ['\\lor', '\\lor', 'Ou']
    ]],
    // Lettres et symboles que la frappe ne produit pas (les majuscules tapées restent des lettres normales).
    ['Caractères spéciaux', [
      ['\\mathbb{N}', '\\mathbb{N}', 'N double barre'],
      ['\\mathbb{Z}', '\\mathbb{Z}', 'Z double barre'],
      ['\\mathbb{Q}', '\\mathbb{Q}', 'Q double barre'],
      ['\\mathbb{R}', '\\mathbb{R}', 'R double barre'],
      ['\\mathbb{C}', '\\mathbb{C}', 'C double barre'],
      ['\\mathbb{K}', '\\mathbb{K}', 'K double barre'],
      ['\\mathbb{P}', '\\mathbb{P}', 'P double barre'],
      ['\\mathbb{A}', '\\mathbb{#?}', 'Lettre double barre'],
      ['\\mathcal{A}', '\\mathcal{#?}', 'Lettre calligraphique'],
      ['\\mathscr{A}', '\\mathscr{#?}', 'Lettre de ronde'],
      ['\\mathfrak{A}', '\\mathfrak{#?}', 'Lettre gothique'],
      ['\\mathbf{A}', '\\mathbf{#?}', 'Lettre grasse'],
      ['\\mathrm{A}', '\\mathrm{#?}', 'Lettre droite'],
      ['\\ell', '\\ell', 'L minuscule cursif'],
      ['\\hbar', '\\hbar', 'h barré'],
      ['\\partial', '\\partial', 'Dérivée partielle'],
      ['\\nabla', '\\nabla', 'Nabla'],
      ['\\aleph', '\\aleph', 'Aleph'],
      ['\\wp', '\\wp', 'P de Weierstrass'],
      ['\\Re', '\\Re', 'Partie réelle'],
      ['\\Im', '\\Im', 'Partie imaginaire'],
      ['\\top', '\\top', 'Taquet (vrai)'],
      ['\\bot', '\\bot', 'Perpendiculaire (faux)'],
      ['\\nexists', '\\nexists', "Il n'existe pas"],
      ['\\times', '\\times', 'Multiplié par'],
      ['\\cdot', '\\cdot', 'Point médian'],
      ['\\degree', '\\degree', 'Degré'],
      ['\\dagger', '\\dagger', 'Croix'],
      ['\\star', '\\star', 'Étoile']
    ]]
  ];

  // Matrice de r lignes et c colonnes, dont toutes les cases sont à remplir.
  function matrix(env, r, c, title) {
    const body = (cell) => Array.from({ length: r }, () => Array(c).fill(cell).join('&')).join('\\\\');
    return [`\\begin{${env}}${body('\\square')}\\end{${env}}`, `\\begin{${env}}${body('#?')}\\end{${env}}`, title];
  }
  const size = { r: 2, c: 2 };

  const mathBtn = document.getElementById('math-btn');
  const dialog = document.getElementById('math-dialog');
  const field = document.getElementById('math-input');
  const tabs = document.getElementById('math-tabs');
  const palette = document.getElementById('math-palette');
  const okBtn = document.getElementById('math-ok');
  const deleteBtn = document.getElementById('math-delete');
  let editing = null; // formule en cours de modification
  let savedRange = null; // endroit du texte où insérer
  let built = false;

  function paletteButton([d, ins, title]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.innerHTML = render(d, false);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      field.focus();
      field.insert(ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
      field.focus();
    });
    return b;
  }

  // Choix de la taille des matrices, et lignes / colonnes à ajouter ou retirer dans la matrice où est le curseur.
  function sizeBar(index) {
    const bar = document.createElement('div');
    bar.className = 'math-size';
    const input = (key, label) => {
      const l = document.createElement('label');
      const i = document.createElement('input');
      i.type = 'number';
      i.dataset.int = '';
      i.min = 1;
      i.max = 10;
      i.value = size[key];
      i.addEventListener('change', () => {
        size[key] = Math.max(1, Math.min(10, parseInt(i.value, 10) || 1));
        showGroup(index);
        palette.querySelector(`.math-size input[data-key="${key}"]`).focus();
      });
      i.dataset.key = key;
      l.append(label, i);
      return l;
    };
    const command = (text, cmd, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'math-cmd';
      b.textContent = text;
      b.title = title;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { field.focus(); field.executeCommand(cmd); });
      return b;
    };
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    bar.append(
      input('r', 'Lignes'), input('c', 'Colonnes'), spacer,
      command('+ ligne', 'addRowAfter', 'Ajouter une ligne sous le curseur, dans la matrice'),
      command('+ colonne', 'addColumnAfter', 'Ajouter une colonne après le curseur, dans la matrice'),
      command('− ligne', 'removeRow', 'Retirer la ligne du curseur'),
      command('− colonne', 'removeColumn', 'Retirer la colonne du curseur')
    );
    return bar;
  }

  function showGroup(index) {
    tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === index));
    const items = PALETTE[index][1];
    const hasSizes = items.some((item) => item.size);
    palette.replaceChildren(
      ...(hasSizes ? [sizeBar(index)] : []),
      ...items.map((item) => {
        if (!item.size) return paletteButton(item);
        const b = paletteButton(item.size(size.r, size.c));
        b.classList.add('sized');
        return b;
      })
    );
  }

  function buildPalette() {
    if (built) return;
    built = true;
    tabs.append(...PALETTE.map(([name], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => showGroup(i));
      return b;
    }));
    showGroup(0);
    field.mathVirtualKeyboardPolicy = 'manual';
    field.smartFence = true;
    field.letterShapeStyle = 'french';
    // Raccourcis de frappe gardés : symboles tapés (>=, +-, ->…) et noms de fonctions (sin, log…). Ceux qui
    // changent des lettres tapées (CC → ℂ, AA → ∀, alpha → α…) sont retirés : ces caractères sont dans la palette.
    const FUNCTION = /^\\(operatorname|sin|cos|tan|cot|sec|csc|arc|sinh|cosh|tanh|coth|log|ln|lg|exp|lim|liminf|limsup|det|max|min|sup|inf|gcd|deg|dim|ker|hom|arg|Pr|bmod|pmod)\b/;
    const kept = {};
    for (const [key, v] of Object.entries(field.inlineShortcuts || {})) {
      const value = typeof v === 'string' ? v : v && v.value;
      if (!/^[A-Za-z]+$/.test(key) || FUNCTION.test(String(value || ''))) kept[key] = v;
    }
    field.inlineShortcuts = kept;
  }

  const mode = () => (document.querySelector('input[name="math-mode"]:checked') || {}).value || 'inline';
  // Encadrement : '' (aucun), 'cadre' ou 'colore' (comme un encadré « > »), et sa couleur.
  const boxColor = document.getElementById('math-box-color');
  const boxMode = () => (document.querySelector('input[name="math-box"]:checked') || {}).value || '';
  const syncBoxColor = () => { boxColor.disabled = boxMode() !== 'colore'; };
  document.querySelectorAll('input[name="math-box"]').forEach((r) => r.addEventListener('change', syncBoxColor));

  function setBox(el, box, color) {
    if (box) el.dataset.box = box; else delete el.dataset.box;
    if (box === 'colore' && color) el.dataset.color = color; else delete el.dataset.color;
  }

  function openMath(target) {
    if (!ML) return;
    buildPalette();
    editing = target || null;
    const sel = window.getSelection();
    if (EM) savedRange = editing ? null : EM.mark();
    else savedRange = !editing && sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    field.value = editing ? editing.dataset.latex || '' : '';
    const block = editing ? editing.dataset.display === 'block' : false;
    document.querySelector(`input[name="math-mode"][value="${block ? 'block' : 'inline'}"]`).checked = true;
    document.querySelector(`input[name="math-box"][value="${editing ? editing.dataset.box || '' : ''}"]`).checked = true;
    boxColor.value = editing ? editing.dataset.color || '' : boxColor.value;
    syncBoxColor();
    okBtn.textContent = editing ? 'Valider' : 'Insérer';
    deleteBtn.hidden = !editing;
    dialog.showModal();
    setTimeout(() => field.focus(), 0);
  }

  function formulaElement(latex, block) {
    const el = document.createElement(block ? 'div' : 'span');
    el.className = 'ft-math';
    el.setAttribute('contenteditable', 'false');
    el.dataset.latex = latex;
    if (block) el.dataset.display = 'block';
    el.innerHTML = render(latex, block);
    return el;
  }

  function placeAfter(node) {
    const r = document.createRange();
    r.setStartAfter(node);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Formule dans la ligne : à l'endroit du curseur ; centrée : sur sa propre ligne.
  function insertFormula(el, range) {
    if (el.tagName === 'DIV') {
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      S().insertBlockObject(el);
      return;
    }
    if (!range) {
      S().restoreSelection();
      const sel = window.getSelection();
      range = sel.rangeCount ? sel.getRangeAt(0) : null;
    }
    if (!range || !editor.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    range.insertNode(el);
    editor.focus({ preventScroll: true });
    placeAfter(el);
  }

  function validate() {
    // Les cases laissées vides ne sont pas gardées.
    const latex = field.value.replace(/\\placeholder(\[[^\]]*\])?\{\}/g, '').trim();
    const block = mode() === 'block';
    dialog.close();
    if (!latex) return;
    if (EM) {
      const el = formulaElement(latex, block);
      setBox(el, boxMode(), boxColor.value);
      if (editing && editing.isConnected) EM.replace(editing, el);
      else EM.insert(el, savedRange);
      return;
    }
    S().checkpoint();
    const el = formulaElement(latex, block);
    setBox(el, boxMode(), boxColor.value);
    if (editing && editing.isConnected) {
      const wasBlock = editing.tagName === 'DIV';
      if (wasBlock === block) {
        editing.replaceWith(el);
      } else if (block) {
        // De la ligne vers un bloc centré : après le paragraphe qui la contenait.
        const r = document.createRange();
        r.setStartAfter(editing);
        r.collapse(true);
        editing.remove();
        insertFormula(el, r);
      } else {
        const p = document.createElement('p');
        p.appendChild(el);
        editing.replaceWith(p);
      }
      editor.focus({ preventScroll: true });
      if (!block) placeAfter(el);
    } else {
      insertFormula(el, savedRange);
    }
    S().changed();
  }

  okBtn.addEventListener('click', validate);
  document.getElementById('math-cancel').addEventListener('click', () => dialog.close());
  deleteBtn.addEventListener('click', () => {
    dialog.close();
    if (!editing || !editing.isConnected) return;
    if (EM) return EM.remove(editing);
    S().checkpoint();
    const parent = editing.parentNode;
    editing.remove();
    if (parent === editor && !editor.firstElementChild) editor.innerHTML = '<p><br></p>';
    S().changed();
  });
  // Entrée valide la formule (Maj+Entrée reste disponible dans la zone de saisie).
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); validate(); }
    // Échap ferme la fenêtre, comme partout ailleurs (la zone de saisie le gardait pour elle ; en saisie
    // LaTeX, Échap sert d'abord à en sortir).
    if (e.key === 'Escape' && field.mode !== 'latex') { e.preventDefault(); e.stopPropagation(); dialog.close(); }
    // « / » crée une fraction, quel que soit le clavier (sur un clavier français, MathLive
    // ne la reconnaît pas toujours) ; ce qui précède devient le numérateur.
    if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      field.insert('\\frac{#@}{#?}', { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
    }
  }, true);
  mathBtn.addEventListener('mousedown', (e) => e.preventDefault());
  mathBtn.addEventListener('click', () => openMath(null));

  // Un clic sur une formule du texte l'ouvre pour la modifier.
  function onClick(e) {
    const f = e.target.closest && e.target.closest('.ft-math');
    if (f && editor.contains(f)) openMath(f);
  }
  editor.addEventListener('click', onClick);
  function onMenu(e) {
    const f = e.target.closest && e.target.closest('.ft-math');
    if (!f || !editor.contains(f)) return;
    e.preventDefault();
    window.FTSidebar.showMenu(e.clientX, e.clientY, [
      { text: 'Modifier la formule', action: () => openMath(f) },
      {
        text: 'Encadrement',
        submenu: () => [['', 'Aucun'], ['cadre', 'Cadre'], ['colore', 'Encadré coloré']].map(([box, name]) => ({
          text: ((f.dataset.box || '') === box ? '✓ ' : ' ') + name,
          action: () => {
            if (EM) {
              const el = f.cloneNode(true);
              setBox(el, box, f.dataset.color);
              return EM.replace(f, el);
            }
            S().checkpoint(); setBox(f, box, f.dataset.color); S().changed();
          }
        }))
      },
      ...(f.tagName === 'DIV' ? [{ text: 'Sélectionner (pour la déplacer)', action: () => S().selectObject(f) }] : []),
      '-',
      { text: 'Supprimer la formule', danger: true, action: () => { if (EM) return EM.remove(f); S().checkpoint(); f.remove(); S().changed(); } }
    ]);
  }
  editor.addEventListener('contextmenu', onMenu);

  window.FTInsert = {
    setFavorites(list) {
      if (Array.isArray(list)) favorites = list.filter((c) => typeof c === 'string' && c.length <= 4);
    },
    onFavoritesChange(fn) { onFavoritesChange = fn; },
    setMedian,
    onMedianChange(fn) { onMedianChange = fn; },
    setQuotes,
    onQuotesChange(fn) { onQuotesChange = fn; },
    setTypo,
    onTypoChange(fn) { onTypoChange = fn; },
    typo: () => typo,
    // Moteur 2.0 (moteur/ecriture.js) : réglages lus par le moteur, caractères écrits par lui.
    median: () => median,
    quotes: () => quotes,
    useText(fn) { engineText = fn; },
    useEngine(mount, bridge, math) {
      editor.removeEventListener('click', onClick);
      editor.removeEventListener('contextmenu', onMenu);
      editor = mount;
      S = () => bridge;
      EM = math;
      editor.addEventListener('click', onClick);
      editor.addEventListener('contextmenu', onMenu);
    },
    // Document ouvert : les formules sont redessinées depuis leur code (data-latex).
    refresh() {
      if (!ML) return;
      editor.querySelectorAll('.ft-math[data-latex]').forEach((f) => {
        f.setAttribute('contenteditable', 'false');
        f.innerHTML = render(f.dataset.latex, f.tagName === 'DIV');
      });
    }
  };
})();
