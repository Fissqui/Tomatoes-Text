// Équations : dessin (MathLive), élément du document, et fenêtre d'écriture.
// Une équation est un petit bloc fermé du texte :
//   span.ft-math[data-latex]                      dans la ligne
//   div.ft-math[data-display="block"][data-latex] sur sa propre ligne, avec en plus :
//     data-numero   équation numérotée (son numéro, data-eq « (3) », est tenu à jour par moteur/formules.js)
//     data-align    « gauche » (sinon centrée)
//     data-box      encadrement « cadre » ou « colore », data-color sa couleur
// Le code LaTeX est la référence ; le dessin est refait depuis lui à l'ouverture.
// Modification dans le texte même : moteur/formules.js. Équations collées : formules-collage.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const ML = window.MathLive;
  if (ML && ML.MathfieldElement) {
    ML.MathfieldElement.fontsDirectory = new URL('vendor/mathlive/fonts/', location.href).href;
    ML.MathfieldElement.soundsDirectory = null;
    // Virgule décimale française : 3,14 s'écrit 3{,}14 (sans espace après la virgule).
    try { ML.MathfieldElement.decimalSeparator = ','; } catch { /* réglage absent */ }
  }

  // ----- Élément du document -----

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function render(latex, block) {
    if (!ML) return esc(latex);
    try { return ML.convertLatexToMarkup(latex, { defaultMode: block ? 'math' : 'inline-math' }); } catch { return esc(latex); }
  }

  // Cases vides laissées par la palette, espaces en trop.
  function clean(latex) {
    return String(latex || '')
      .replace(/\\placeholder(\[[^\]]*\])?\{\}/g, '')
      .replace(/\\left\.\\right\./g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Réglages d'une équation affichée ou de son HTML.
  function infoOf(el) {
    if (typeof el === 'string') {
      const t = document.createElement('template');
      t.innerHTML = el;
      el = t.content.firstElementChild;
    }
    if (!el) return null;
    return {
      latex: el.dataset.latex || '',
      block: el.tagName === 'DIV',
      numbered: el.hasAttribute('data-numero'),
      eq: el.dataset.eq || '',
      align: el.dataset.align || '',
      box: el.dataset.box || '',
      color: el.dataset.color || '',
      xid: el.dataset.xid || ''
    };
  }

  function element(o) {
    const el = document.createElement(o.block ? 'div' : 'span');
    el.className = 'ft-math';
    el.setAttribute('contenteditable', 'false');
    if (o.block) el.dataset.display = 'block';
    el.dataset.latex = o.latex;
    if (o.block && o.numbered) {
      el.setAttribute('data-numero', '');
      if (o.eq) el.dataset.eq = o.eq;
    }
    if (o.block && o.align === 'gauche') el.dataset.align = 'gauche';
    if (o.box) el.dataset.box = o.box;
    if (o.box === 'colore' && o.color) el.dataset.color = o.color;
    if (o.xid) el.dataset.xid = o.xid;
    el.innerHTML = render(o.latex, o.block);
    return el;
  }
  const html = (o) => element(o).outerHTML;

  // ----- Zone d'écriture (fenêtre et texte) -----

  // Raccourcis de frappe gardés : symboles tapés (>=, +-, ->…) et noms de fonctions (sin, log…). Ceux qui
  // changent des lettres tapées (CC → ℂ, AA → ∀, alpha → α…) sont retirés : ces caractères sont dans la palette.
  const FUNCTION = /^\\(operatorname|sin|cos|tan|cot|sec|csc|arc|sinh|cosh|tanh|coth|log|ln|lg|exp|lim|liminf|limsup|det|max|min|sup|inf|gcd|deg|dim|ker|hom|arg|Pr|bmod|pmod)\b/;
  let shortcuts = null;
  function setupField(field, opts = {}) {
    field.mathVirtualKeyboardPolicy = 'manual';
    field.smartFence = true;
    field.smartSuperscript = true;
    field.letterShapeStyle = 'tex';
    field.popoverPolicy = 'off';
    try { field.menuItems = []; } catch { /* menu absent de cette version */ }
    if (!shortcuts) {
      shortcuts = {};
      for (const [key, v] of Object.entries(field.inlineShortcuts || {})) {
        const value = typeof v === 'string' ? v : v && v.value;
        if (!/^[A-Za-z]+$/.test(key) || FUNCTION.test(String(value || ''))) shortcuts[key] = v;
      }
    }
    field.inlineShortcuts = shortcuts;
    field.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || field.mode === 'latex') return;
      // Tab : case suivante ; sans case à remplir, sortie de la structure (fraction, racine…) où est le curseur.
      if (e.key === 'Tab' && !e.shiftKey && !/\\placeholder/.test(field.value)) {
        e.preventDefault();
        e.stopPropagation();
        field.executeCommand('moveAfterParent');
        return;
      }
      // « / » crée une fraction quel que soit le clavier ; ce qui précède devient le numérateur.
      if (e.key === '/') {
        e.preventDefault();
        e.stopPropagation();
        field.insert('\\frac{#@}{#?}', { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
        return;
      }
      // Clavier français : « ^ » est une touche morte (elle attend la lettre suivante) ; ici, exposant direct.
      if (e.key === 'Dead' && (e.code === 'BracketLeft' || e.code === 'Digit6' || e.code === 'Digit9')) {
        e.preventDefault();
        e.stopPropagation();
        field.executeCommand('moveToSuperscript');
        deadUntil = Date.now() + 600;
      }
    }, true);
    // (Caractère produit malgré tout par la touche morte : retiré.)
    let deadUntil = 0;
    field.addEventListener('beforeinput', (e) => {
      if (Date.now() < deadUntil && /^[\^ˆ]$/.test(e.data || '')) { e.preventDefault(); deadUntil = 0; }
    }, true);
    if (opts.inline) field.classList.add('ft-mf-inline');
    return field;
  }

  // Équation collée dans la zone d'écriture : MathML ou HTML d'une page (Word, Wikipédia…) repris en LaTeX.
  function pasteInto(field, e) {
    const cd = e.clipboardData;
    if (!cd || !window.FTFormulesCollage) return;
    const latex = window.FTFormulesCollage.latexFromClipboard(cd);
    if (!latex) return;
    e.preventDefault();
    e.stopPropagation();
    field.insert(latex, { insertionMode: 'replaceSelection', selectionMode: 'after', format: 'latex' });
  }

  // ----- Palette -----

  // [affiché, inséré, titre] ; #? : case à remplir, #0 / #@ : sélection (ou ce qui précède).
  const P = (d, i, title) => [d, i === undefined ? d : i, title];
  function matrix(env, r, c, title) {
    const body = (cell) => Array.from({ length: r }, () => Array(c).fill(cell).join('&')).join('\\\\');
    return [`\\begin{${env}}${body('\\square')}\\end{${env}}`, `\\begin{${env}}${body('#?')}\\end{${env}}`, title];
  }
  const size = { r: 2, c: 2 };
  const greek = (names) => names.map((n) => P('\\' + n, '\\' + n, n.replace(/^var/, '') + (n.startsWith('var') ? ' (variante)' : '')));

  const CATS = [
    { id: 'recents', name: 'Récents', icon: '\\star', sections: [] },
    {
      id: 'structures', name: 'Structures', icon: '\\frac{a}{b}', sections: [
        ['Fractions', [
          P('\\frac{a}{b}', '\\frac{#@}{#?}', 'Fraction (/)'),
          P('\\tfrac{a}{b}', '\\tfrac{#@}{#?}', 'Petite fraction'),
          P('a/b', '#@/#?', 'Fraction en ligne'),
          P('\\frac{\\mathrm{d}y}{\\mathrm{d}x}', '\\frac{\\mathrm{d}#?}{\\mathrm{d}#?}', 'Dérivée'),
          P('\\frac{\\partial f}{\\partial x}', '\\frac{\\partial #?}{\\partial #?}', 'Dérivée partielle'),
          P('\\binom{n}{k}', '\\binom{#?}{#?}', 'Coefficient binomial')
        ]],
        ['Exposants et indices', [
          P('x^{n}', '#@^{#?}', 'Exposant (^)'),
          P('x_{i}', '#@_{#?}', 'Indice (_)'),
          P('x_{i}^{n}', '#@_{#?}^{#?}', 'Indice et exposant'),
          P('e^{x}', 'e^{#?}', 'Exponentielle'),
          P("f'", "#@'", 'Prime'),
          P("f''", "#@''", 'Seconde'),
          P('{}_{k}^{n}X', '{}_{#?}^{#?}#?', 'Indice et exposant à gauche')
        ]],
        ['Racines', [
          P('\\sqrt{x}', '\\sqrt{#0}', 'Racine carrée'),
          P('\\sqrt[3]{x}', '\\sqrt[3]{#0}', 'Racine cubique'),
          P('\\sqrt[n]{x}', '\\sqrt[#?]{#0}', 'Racine n-ième')
        ]],
        ['Parenthèses et délimiteurs', [
          P('\\left(x\\right)', '\\left(#0\\right)', 'Parenthèses'),
          P('\\left[x\\right]', '\\left[#0\\right]', 'Crochets'),
          P('\\left\\lbrace x\\right\\rbrace', '\\left\\lbrace #0\\right\\rbrace', 'Accolades'),
          P('\\left|x\\right|', '\\left|#0\\right|', 'Valeur absolue'),
          P('\\left\\lVert x\\right\\rVert', '\\left\\lVert #0\\right\\rVert', 'Norme'),
          P('\\left\\langle x\\right\\rangle', '\\left\\langle #0\\right\\rangle', 'Chevrons'),
          P('\\left\\lfloor x\\right\\rfloor', '\\left\\lfloor #0\\right\\rfloor', 'Partie entière'),
          P('\\left\\lceil x\\right\\rceil', '\\left\\lceil #0\\right\\rceil', 'Partie entière supérieure'),
          P('\\left[a;b\\right]', '\\left[#?;#?\\right]', 'Intervalle fermé'),
          P('\\left]a;b\\right[', '\\left]#?;#?\\right[', 'Intervalle ouvert'),
          P('\\left\\lbrace x\\mid P\\right\\rbrace', '\\left\\lbrace #?\\mid #?\\right\\rbrace', 'Ensemble défini par une propriété')
        ]],
        ['Accents', [
          P('\\vec{u}', '\\vec{#0}', 'Vecteur'),
          P('\\overrightarrow{AB}', '\\overrightarrow{#0}', 'Vecteur entre deux points'),
          P('\\hat{x}', '\\hat{#0}', 'Chapeau'),
          P('\\widehat{ABC}', '\\widehat{#0}', 'Angle'),
          P('\\overline{z}', '\\overline{#0}', 'Barre (conjugué, moyenne)'),
          P('\\underline{x}', '\\underline{#0}', 'Soulignement'),
          P('\\tilde{x}', '\\tilde{#0}', 'Tilde'),
          P('\\dot{x}', '\\dot{#0}', 'Point (dérivée par rapport au temps)'),
          P('\\ddot{x}', '\\ddot{#0}', 'Deux points (dérivée seconde)'),
          P('\\underbrace{a+b}_{n}', '\\underbrace{#0}_{#?}', 'Accolade dessous'),
          P('\\overbrace{a+b}^{n}', '\\overbrace{#0}^{#?}', 'Accolade dessus'),
          P('\\boxed{x}', '\\boxed{#0}', 'Encadré')
        ]],
        ['Texte', [
          P('\\text{abc}', '\\text{#?}', 'Texte dans l’équation'),
          P('\\mathrm{d}x', '\\mathrm{d}#?', 'd droit (différentielle)'),
          P('\\overset{!}{=}', '\\overset{#?}{#0}', 'Au-dessus'),
          P('\\underset{x}{\\to}', '\\underset{#?}{#0}', 'Au-dessous')
        ]]
      ]
    },
    {
      id: 'operateurs', name: 'Grands opérateurs', icon: '\\sum', sections: [
        ['Sommes et produits', [
          P('\\sum_{i=1}^{n}', '\\sum_{#?}^{#?}', 'Somme'),
          P('\\sum_{i}', '\\sum_{#?}', 'Somme (indice seul)'),
          P('\\prod_{i=1}^{n}', '\\prod_{#?}^{#?}', 'Produit'),
          P('\\coprod_{i=1}^{n}', '\\coprod_{#?}^{#?}', 'Coproduit'),
          P('\\bigcup_{i=1}^{n}', '\\bigcup_{#?}^{#?}', 'Réunion'),
          P('\\bigcap_{i=1}^{n}', '\\bigcap_{#?}^{#?}', 'Intersection'),
          P('\\bigoplus_{i}', '\\bigoplus_{#?}', 'Somme directe')
        ]],
        ['Intégrales', [
          P('\\int f\\,\\mathrm{d}x', '\\int #0\\,\\mathrm{d}#?', 'Intégrale'),
          P('\\int_{a}^{b}f\\,\\mathrm{d}x', '\\int_{#?}^{#?}#0\\,\\mathrm{d}#?', 'Intégrale avec bornes'),
          P('\\iint', '\\iint_{#?}#0\\,\\mathrm{d}#?\\,\\mathrm{d}#?', 'Intégrale double'),
          P('\\iiint', '\\iiint_{#?}#0', 'Intégrale triple'),
          P('\\oint', '\\oint_{#?}#0', 'Intégrale sur un contour'),
          P('\\left[F\\right]_{a}^{b}', '\\left[#0\\right]_{#?}^{#?}', 'Crochet d’intégration')
        ]],
        ['Limites', [
          P('\\lim_{x\\to a}', '\\lim_{#?\\to #?}', 'Limite'),
          P('\\lim_{n\\to+\\infty}', '\\lim_{#?\\to+\\infty}', 'Limite en +∞'),
          P('\\limsup', '\\limsup_{#?}', 'Limite supérieure'),
          P('\\liminf', '\\liminf_{#?}', 'Limite inférieure'),
          P('\\max_{x}', '\\max_{#?}', 'Maximum'),
          P('\\min_{x}', '\\min_{#?}', 'Minimum'),
          P('\\sup_{x}', '\\sup_{#?}', 'Borne supérieure'),
          P('\\inf_{x}', '\\inf_{#?}', 'Borne inférieure')
        ]]
      ]
    },
    {
      id: 'fonctions', name: 'Fonctions', icon: 'f(x)', sections: [
        ['Fonctions', [
          P('f\\left(x\\right)', '#?\\left(#?\\right)', 'Fonction'),
          P('f\\colon E\\to F', '#?\\colon #?\\to #?', 'Fonction de E dans F'),
          P('x\\mapsto f(x)', '#?\\mapsto #?', 'Associe à'),
          P('f\\circ g', '#?\\circ #?', 'Composée'),
          P('f^{-1}', '#@^{-1}', 'Réciproque'),
          P('n!', '#@!', 'Factorielle'),
          P('\\left|x\\right|', '\\left|#0\\right|', 'Valeur absolue')
        ]],
        ['Fonctions usuelles', [
          P('\\sin', '\\sin\\left(#0\\right)', 'Sinus'), P('\\cos', '\\cos\\left(#0\\right)', 'Cosinus'), P('\\tan', '\\tan\\left(#0\\right)', 'Tangente'),
          P('\\arcsin', '\\arcsin\\left(#0\\right)', 'Arc sinus'), P('\\arccos', '\\arccos\\left(#0\\right)', 'Arc cosinus'), P('\\arctan', '\\arctan\\left(#0\\right)', 'Arc tangente'),
          P('\\sinh', '\\sinh\\left(#0\\right)', 'Sinus hyperbolique'), P('\\cosh', '\\cosh\\left(#0\\right)', 'Cosinus hyperbolique'), P('\\tanh', '\\tanh\\left(#0\\right)', 'Tangente hyperbolique'),
          P('\\ln', '\\ln\\left(#0\\right)', 'Logarithme népérien'), P('\\log', '\\log\\left(#0\\right)', 'Logarithme décimal'), P('\\log_{b}', '\\log_{#?}\\left(#0\\right)', 'Logarithme en base b'),
          P('\\exp', '\\exp\\left(#0\\right)', 'Fonction exponentielle'), P('\\det', '\\det\\left(#0\\right)', 'Déterminant'),
          P('\\gcd', '\\gcd\\left(#?,#?\\right)', 'PGCD'), P('\\operatorname{ppcm}', '\\operatorname{ppcm}\\left(#?,#?\\right)', 'PPCM'),
          P('\\operatorname{f}', '\\operatorname{#?}', 'Nom de fonction (droit)')
        ]]
      ]
    },
    {
      id: 'matrices', name: 'Matrices et systèmes', icon: '\\begin{pmatrix}a\\\\b\\end{pmatrix}', sized: true, sections: [
        ['Matrices', [
          { size: (r, c) => matrix('pmatrix', r, c, `Matrice ${r} × ${c}`) },
          { size: (r, c) => matrix('bmatrix', r, c, `Matrice ${r} × ${c} entre crochets`) },
          { size: (r, c) => matrix('vmatrix', r, c, `Déterminant ${r} × ${c}`) },
          { size: (r, c) => matrix('matrix', r, c, `Tableau ${r} × ${c} sans délimiteurs`) },
          { size: (r) => matrix('pmatrix', r, 1, `Vecteur colonne à ${r} composantes`) },
          { size: (r, c) => matrix('pmatrix', 1, c, `Vecteur ligne à ${c} composantes`) }
        ]],
        ['Systèmes et alignements', [
          { size: (r) => matrix('cases', r, 1, `Système de ${r} équations`) },
          { size: (r) => [`\\begin{cases}\\square & \\text{si } \\square\\\\\\square & \\text{sinon}\\end{cases}`, `\\begin{cases}#? & \\text{si } #?\\\\#? & \\text{sinon}\\end{cases}`, 'Fonction définie par morceaux'] },
          { size: (r) => [`\\begin{aligned}a&=b\\\\&=c\\end{aligned}`, `\\begin{aligned}${Array.from({ length: r }, (_, k) => (k ? '&=#?' : '#?&=#?')).join('\\\\')}\\end{aligned}`, `Calcul aligné sur « = » (${r} lignes)`] }
        ]],
        ['Points', [P('\\cdots', '\\cdots', 'Points médians'), P('\\vdots', '\\vdots', 'Points verticaux'), P('\\ddots', '\\ddots', 'Points diagonaux'), P('\\ldots', '\\ldots', 'Points de suspension')]]
      ]
    },
    {
      id: 'relations', name: 'Opérateurs et relations', icon: '\\leq', sections: [
        ['Opérations', [
          P('+'), P('-', '-', 'Moins'), P('\\times', '\\times', 'Multiplication'), P('\\cdot', '\\cdot', 'Point de multiplication'), P('\\div', '\\div', 'Division'),
          P('\\pm', '\\pm', 'Plus ou moins'), P('\\mp', '\\mp', 'Moins ou plus'), P('\\circ', '\\circ', 'Rond (composée)'), P('\\ast', '\\ast', 'Étoile'),
          P('\\oplus', '\\oplus', 'Plus cerclé'), P('\\otimes', '\\otimes', 'Produit tensoriel'), P('\\wedge', '\\wedge', 'Produit vectoriel'),
          P('\\%', '\\%', 'Pourcentage'), P('\\degree', '\\degree', 'Degré'), P('\\infty', '\\infty', 'Infini'), P('\\partial', '\\partial', 'Dérivée partielle (symbole)'), P('\\nabla', '\\nabla', 'Nabla')
        ]],
        ['Relations', [
          P('='), P('\\neq', '\\neq', 'Différent'), P('<', '<', 'Inférieur'), P('>', '>', 'Supérieur'), P('\\leq', '\\leq', 'Inférieur ou égal'), P('\\geq', '\\geq', 'Supérieur ou égal'),
          P('\\leqslant', '\\leqslant', 'Inférieur ou égal (français)'), P('\\geqslant', '\\geqslant', 'Supérieur ou égal (français)'),
          P('\\approx', '\\approx', 'Environ égal'), P('\\simeq', '\\simeq', 'Asymptotiquement égal'), P('\\sim', '\\sim', 'Équivalent à'), P('\\equiv', '\\equiv', 'Identique, congru'),
          P('\\cong', '\\cong', 'Isomorphe'), P('\\propto', '\\propto', 'Proportionnel'), P('\\ll', '\\ll', 'Très inférieur'), P('\\gg', '\\gg', 'Très supérieur'),
          P('\\perp', '\\perp', 'Perpendiculaire'), P('\\parallel', '\\parallel', 'Parallèle'), P('\\mid', '\\mid', 'Divise'), P('\\coloneqq', '\\coloneqq', 'Défini par')
        ]]
      ]
    },
    {
      id: 'fleches', name: 'Flèches', icon: '\\Rightarrow', sections: [
        ['Flèches', [
          P('\\to', '\\to', 'Tend vers'), P('\\leftarrow', '\\leftarrow', 'Flèche à gauche'), P('\\leftrightarrow', '\\leftrightarrow', 'Flèche double'),
          P('\\mapsto', '\\mapsto', 'Associe à'), P('\\longrightarrow', '\\longrightarrow', 'Longue flèche'), P('\\uparrow', '\\uparrow', 'Croît'), P('\\downarrow', '\\downarrow', 'Décroît'),
          P('\\nearrow', '\\nearrow', 'Flèche montante'), P('\\searrow', '\\searrow', 'Flèche descendante'), P('\\hookrightarrow', '\\hookrightarrow', 'Injection'),
          P('\\rightleftharpoons', '\\rightleftharpoons', 'Équilibre'), P('\\xrightarrow{f}', '\\xrightarrow{#?}', 'Flèche avec texte')
        ]],
        ['Implications', [
          P('\\Rightarrow', '\\Rightarrow', 'Implique'), P('\\Leftarrow', '\\Leftarrow', 'Est impliqué par'), P('\\Leftrightarrow', '\\Leftrightarrow', 'Équivaut à'),
          P('\\Longrightarrow', '\\Longrightarrow', 'Implique (longue)'), P('\\Longleftrightarrow', '\\Longleftrightarrow', 'Équivaut à (longue)')
        ]]
      ]
    },
    {
      id: 'ensembles', name: 'Ensembles et logique', icon: '\\in', sections: [
        ['Ensembles', [
          P('\\in', '\\in', 'Appartient à'), P('\\notin', '\\notin', "N'appartient pas à"), P('\\ni', '\\ni', 'Contient'),
          P('\\subset', '\\subset', 'Inclus dans'), P('\\subseteq', '\\subseteq', 'Inclus ou égal'), P('\\not\\subset', '\\not\\subset', 'Non inclus'), P('\\supset', '\\supset', 'Contient (ensemble)'),
          P('\\cup', '\\cup', 'Union'), P('\\cap', '\\cap', 'Intersection'), P('\\setminus', '\\setminus', 'Privé de'), P('\\emptyset', '\\emptyset', 'Ensemble vide'),
          P('\\mathbb{N}', '\\mathbb{N}', 'Entiers naturels'), P('\\mathbb{Z}', '\\mathbb{Z}', 'Entiers relatifs'), P('\\mathbb{Q}', '\\mathbb{Q}', 'Rationnels'),
          P('\\mathbb{R}', '\\mathbb{R}', 'Réels'), P('\\mathbb{C}', '\\mathbb{C}', 'Complexes'), P('\\mathbb{R}^{*}', '\\mathbb{R}^{*}', 'Réels non nuls'),
          P('\\mathbb{R}_{+}', '\\mathbb{R}_{+}', 'Réels positifs'), P('\\overline{A}', '\\overline{#0}', 'Complémentaire'), P('\\mathcal{P}(E)', '\\mathcal{P}\\left(#?\\right)', 'Ensemble des parties')
        ]],
        ['Logique', [
          P('\\forall', '\\forall', 'Pour tout'), P('\\exists', '\\exists', 'Il existe'), P('\\exists!', '\\exists!', 'Il existe un unique'), P('\\nexists', '\\nexists', "Il n'existe pas"),
          P('\\neg', '\\neg', 'Non'), P('\\land', '\\land', 'Et'), P('\\lor', '\\lor', 'Ou'), P('\\Rightarrow', '\\Rightarrow', 'Implique'), P('\\Leftrightarrow', '\\Leftrightarrow', 'Équivaut à'),
          P('\\vdash', '\\vdash', 'Déduit'), P('\\models', '\\models', 'Modèle de'), P('\\top', '\\top', 'Vrai'), P('\\bot', '\\bot', 'Faux')
        ]]
      ]
    },
    {
      id: 'grec', name: 'Lettres grecques', icon: '\\alpha', sections: [
        ['Minuscules', greek(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega'])],
        ['Majuscules', greek(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'])]
      ]
    },
    // Lettres et symboles que la frappe ne produit pas (les majuscules tapées restent des lettres normales).
    {
      id: 'speciaux', name: 'Caractères spéciaux', icon: '\\mathbb{R}', sections: [
        ['Lettres double barre', [
          P('\\mathbb{N}', '\\mathbb{N}', 'N double barre'), P('\\mathbb{Z}', '\\mathbb{Z}', 'Z double barre'), P('\\mathbb{Q}', '\\mathbb{Q}', 'Q double barre'),
          P('\\mathbb{R}', '\\mathbb{R}', 'R double barre'), P('\\mathbb{C}', '\\mathbb{C}', 'C double barre'), P('\\mathbb{K}', '\\mathbb{K}', 'K double barre'),
          P('\\mathbb{P}', '\\mathbb{P}', 'P double barre'), P('\\mathbb{A}', '\\mathbb{#?}', 'Lettre double barre')
        ]],
        ['Styles de lettres', [
          P('\\mathcal{A}', '\\mathcal{#?}', 'Lettre calligraphique'), P('\\mathscr{A}', '\\mathscr{#?}', 'Lettre de ronde'), P('\\mathfrak{A}', '\\mathfrak{#?}', 'Lettre gothique'),
          P('\\mathbf{A}', '\\mathbf{#?}', 'Lettre grasse'), P('\\boldsymbol{\\alpha}', '\\boldsymbol{#?}', 'Symbole gras'), P('\\mathrm{A}', '\\mathrm{#?}', 'Lettre droite'), P('\\mathsf{A}', '\\mathsf{#?}', 'Lettre sans empattement')
        ]],
        ['Symboles', [
          P('\\ell', '\\ell', 'L minuscule cursif'), P('\\hbar', '\\hbar', 'h barré'), P('\\aleph', '\\aleph', 'Aleph'), P('\\wp', '\\wp', 'P de Weierstrass'),
          P('\\Re', '\\Re', 'Partie réelle'), P('\\Im', '\\Im', 'Partie imaginaire'), P('\\imath', '\\imath', 'i sans point'), P('\\angle', '\\angle', 'Angle'),
          P('\\triangle', '\\triangle', 'Triangle'), P('\\square', '\\square', 'Carré'), P('\\dagger', '\\dagger', 'Croix'), P('\\star', '\\star', 'Étoile'), P('\\checkmark', '\\checkmark', 'Coche')
        ]]
      ]
    }
  ];

  // ----- Fenêtre -----

  const dialog = $('math-dialog');
  const field = $('math-input');
  const codeBox = $('math-code');
  const errorsBox = $('math-errors');
  const catsBox = $('math-cats');
  const palette = $('math-palette');
  const search = $('math-search');
  const okBtn = $('math-ok');
  const deleteBtn = $('math-delete');
  const titleEl = $('math-title');
  let editing = null; // équation du texte en cours de modification
  let savedRange = null; // endroit du texte où insérer
  let built = false;
  let current = 'structures';
  let alignTouched = false;
  let EM = null; // pont du moteur : insert / replace / remove (moteur/ecriture.js)

  const RECENTS = 'ft-formules-recents';
  const OPTIONS = 'ft-formules-options';
  const store = {
    get(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? def : v; } catch { return def; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
  };
  function remember(item) {
    const list = store.get(RECENTS, []).filter((r) => Array.isArray(r) && r[1] !== item[1]);
    list.unshift(item);
    store.set(RECENTS, list.slice(0, 24));
  }

  const insertCode = (ins) => {
    field.focus();
    field.insert(ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
    field.focus();
    syncCode();
  };

  function paletteButton(item) {
    const [d, ins, title] = item;
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title || d;
    b.innerHTML = render(d, false);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { insertCode(ins); remember(item); });
    return b;
  }

  // Taille des matrices, et lignes / colonnes à ajouter ou retirer dans la matrice où est le curseur.
  function sizeBar() {
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
      i.dataset.key = key;
      i.addEventListener('change', () => {
        size[key] = Math.max(1, Math.min(10, parseInt(i.value, 10) || 1));
        show(current);
        palette.querySelector(`.math-size input[data-key="${key}"]`).focus();
      });
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
      b.addEventListener('click', () => { field.focus(); field.executeCommand(cmd); syncCode(); });
      return b;
    };
    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    bar.append(
      input('r', 'Lignes'), input('c', 'Colonnes'), spacer,
      command('+ ligne', 'addRowAfter', 'Ajouter une ligne sous le curseur'),
      command('+ colonne', 'addColumnAfter', 'Ajouter une colonne après le curseur'),
      command('− ligne', 'removeRow', 'Retirer la ligne du curseur'),
      command('− colonne', 'removeColumn', 'Retirer la colonne du curseur')
    );
    return bar;
  }

  const itemOf = (it) => (it.size ? it.size(size.r, size.c) : it);
  function section(name, items) {
    const box = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = name;
    const grid = document.createElement('div');
    grid.className = 'math-grid';
    for (const it of items) {
      const b = paletteButton(itemOf(it));
      if (it.size) b.classList.add('sized');
      grid.append(b);
    }
    box.append(h, grid);
    return box;
  }

  function show(id) {
    current = id;
    for (const b of catsBox.querySelectorAll('button')) b.classList.toggle('on', b.dataset.cat === id);
    const cat = CATS.find((c) => c.id === id) || CATS[1];
    const out = [];
    if (cat.sized) out.push(sizeBar());
    if (cat.id === 'recents') {
      const list = store.get(RECENTS, []).filter((r) => Array.isArray(r) && r.length === 3);
      if (list.length) out.push(section('Récemment insérés', list));
      else {
        const p = document.createElement('p');
        p.className = 'math-empty';
        p.textContent = 'Aucun élément inséré récemment.';
        out.push(p);
      }
    }
    for (const [name, items] of cat.sections) out.push(section(name, items));
    palette.replaceChildren(...out);
    palette.scrollTop = 0;
  }

  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function find(q) {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return show(current);
    const seen = new Set();
    const hits = [];
    for (const cat of CATS) {
      for (const [name, items] of cat.sections) {
        for (const it of items) {
          const item = itemOf(it);
          const hay = fold(`${item[2]} ${item[0]} ${name} ${cat.name}`);
          if (words.every((w) => hay.includes(w)) && !seen.has(item[1])) { seen.add(item[1]); hits.push(item); }
        }
      }
    }
    for (const b of catsBox.querySelectorAll('button')) b.classList.remove('on');
    if (!hits.length) {
      const p = document.createElement('p');
      p.className = 'math-empty';
      p.textContent = 'Aucun symbole trouvé.';
      palette.replaceChildren(p);
      return;
    }
    palette.replaceChildren(section(`Résultats (${hits.length})`, hits.slice(0, 120)));
  }

  function build() {
    if (built) return;
    built = true;
    catsBox.append(...CATS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.cat = c.id;
      b.innerHTML = `<span class="math-cat-icon">${render(c.icon, false)}</span><span>${c.name}</span>`;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { search.value = ''; show(c.id); });
      return b;
    }));
    setupField(field);
    field.addEventListener('input', syncCode);
    field.addEventListener('paste', (e) => pasteInto(field, e), true);
    search.addEventListener('input', () => find(search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const b = palette.querySelector('.math-grid button'); if (b) b.click(); }
      if (e.key === 'Escape' && search.value) { e.preventDefault(); e.stopPropagation(); search.value = ''; show(current); }
    });
    codeBox.addEventListener('input', () => {
      field.setValue(codeBox.value, { silenceNotifications: true });
      showErrors(codeBox.value);
    });
    codeBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); validate(); }
    });
    for (const r of dialog.querySelectorAll('input[name="math-mode"], input[name="math-align"], input[name="math-box"], #math-numero')) {
      r.addEventListener('change', () => {
        if (r.name === 'math-align') alignTouched = true;
        // Équation numérotée : à gauche, numéro à droite (sauf alignement choisi).
        if (r.id === 'math-numero' && r.checked && !alignTouched) dialog.querySelector('input[name="math-align"][value="gauche"]').checked = true;
        syncOptions();
      });
    }
    $('math-code-toggle').addEventListener('click', () => {
      const open = !$('math-code-row').classList.contains('open');
      $('math-code-row').classList.toggle('open', open);
      $('math-code-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      store.set(OPTIONS, { ...store.get(OPTIONS, {}), code: open });
      if (open) syncCode();
    });
  }

  function syncCode() {
    if (document.activeElement !== codeBox) codeBox.value = field.value;
    showErrors(field.value);
  }
  function showErrors(latex) {
    const errs = window.FTLatex ? window.FTLatex.check(clean(latex)) : [];
    errorsBox.textContent = errs.length ? 'Code LaTeX : ' + errs.join(' ; ') + '.' : '';
    errorsBox.hidden = !errs.length;
  }

  const radio = (name) => (dialog.querySelector(`input[name="${name}"]:checked`) || {}).value || '';
  const setRadio = (name, value) => { const r = dialog.querySelector(`input[name="${name}"][value="${value}"]`); if (r) r.checked = true; };
  function syncOptions() {
    const block = radio('math-mode') === 'block';
    dialog.classList.toggle('math-inline-mode', !block);
    $('math-box-color').disabled = radio('math-box') !== 'colore';
    field.classList.toggle('math-field-block', block);
  }
  function options() {
    const block = radio('math-mode') === 'block';
    return {
      block,
      numbered: block && $('math-numero').checked,
      align: block ? radio('math-align') : '',
      box: radio('math-box'),
      color: radio('math-box') === 'colore' ? $('math-box-color').value : ''
    };
  }

  // Ouvre la fenêtre : équation du texte à modifier, ou nouvelle (o : réglages de départ).
  function open(target, o = {}) {
    if (!ML) return;
    build();
    editing = target && target.isConnected ? target : null;
    savedRange = editing ? null : (EM ? EM.mark() : null);
    const info = editing ? infoOf(editing) : { ...store.get(OPTIONS, {}), latex: o.latex || '', ...o };
    field.value = info.latex || '';
    setRadio('math-mode', info.block ? 'block' : 'inline');
    setRadio('math-align', info.align === 'gauche' ? 'gauche' : '');
    $('math-numero').checked = !!(info.block && info.numbered);
    setRadio('math-box', info.box || '');
    $('math-box-color').value = info.color || '';
    alignTouched = !!editing;
    syncOptions();
    const codeOpen = !!store.get(OPTIONS, {}).code;
    $('math-code-row').classList.toggle('open', codeOpen);
    $('math-code-toggle').setAttribute('aria-expanded', codeOpen ? 'true' : 'false');
    syncCode();
    titleEl.textContent = editing ? 'Modifier l’équation' : 'Nouvelle équation';
    okBtn.textContent = editing ? 'Valider' : 'Insérer';
    deleteBtn.hidden = !editing;
    search.value = '';
    show(store.get(RECENTS, []).length && !editing ? current : current);
    dialog.showModal();
    setTimeout(() => field.focus(), 0);
  }

  function validate() {
    const latex = clean(field.value);
    const o = options();
    dialog.close();
    // Réglages gardés pour la prochaine équation.
    store.set(OPTIONS, { ...store.get(OPTIONS, {}), block: o.block, align: o.align, numbered: o.numbered, box: o.box, color: o.color });
    if (!EM) return;
    if (!latex) {
      if (editing && editing.isConnected) EM.remove(editing);
      return;
    }
    const info = editing ? infoOf(editing) : {};
    const el = element({ ...o, latex, eq: o.numbered ? info.eq : '', xid: info.xid });
    if (editing && editing.isConnected) EM.replace(editing, el);
    else EM.insert(el, savedRange);
  }

  if (dialog) {
    okBtn.addEventListener('click', validate);
    $('math-cancel').addEventListener('click', () => dialog.close());
    deleteBtn.addEventListener('click', () => {
      dialog.close();
      if (editing && editing.isConnected && EM) EM.remove(editing);
    });
    // Entrée valide (Maj+Entrée : nouvelle ligne dans un tableau ou un système) ; Échap ferme.
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); validate(); }
      if (e.key === 'Escape' && field.mode !== 'latex') { e.preventDefault(); e.stopPropagation(); dialog.close(); }
    }, true);
    const btn = $('math-btn');
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => open(null));
  }

  window.FTFormules = {
    render,
    clean,
    infoOf,
    element,
    html,
    setupField,
    pasteInto,
    open,
    // Éléments de la palette (barre d'outils de l'équation modifiée dans le texte).
    quick: () => [
      ['\\frac{a}{b}', '\\frac{#@}{#?}', 'Fraction'],
      ['x^{n}', '#@^{#?}', 'Exposant'],
      ['x_{i}', '#@_{#?}', 'Indice'],
      ['\\sqrt{x}', '\\sqrt{#0}', 'Racine carrée'],
      ['\\left(x\\right)', '\\left(#0\\right)', 'Parenthèses'],
      ['\\sum_{i=1}^{n}', '\\sum_{#?}^{#?}', 'Somme'],
      ['\\int_{a}^{b}', '\\int_{#?}^{#?}#0\\,\\mathrm{d}#?', 'Intégrale'],
      ['\\lim_{x\\to a}', '\\lim_{#?\\to #?}', 'Limite'],
      ['\\vec{u}', '\\vec{#0}', 'Vecteur'],
      ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', 'Matrice 2 × 2'],
      ['\\alpha', '\\alpha', 'Alpha'],
      ['\\leq', '\\leq', 'Inférieur ou égal'],
      ['\\infty', '\\infty', 'Infini']
    ],
    remember,
    // Réglages changés (clic droit) : l'équation est refaite avec eux.
    apply(target, changes) {
      if (!EM || !target || !target.isConnected) return;
      const info = infoOf(target);
      const o = { ...info, ...changes };
      // Équation numérotée : à gauche, numéro à droite (usage des ouvrages de mathématiques).
      if (changes.numbered && !info.numbered && !('align' in changes)) o.align = 'gauche';
      if (!o.block) { o.numbered = false; o.align = ''; }
      if (o.box !== 'colore') o.color = '';
      EM.replace(target, element({ ...o, eq: o.numbered ? info.eq : '' }));
    },
    remove(target) { if (EM && target && target.isConnected) EM.remove(target); },
    useEngine(bridge) { EM = bridge; },
    isOpen: () => !!(dialog && dialog.open)
  };
})();
