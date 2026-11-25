// Mode maths (interrupteur à côté du mode raccourcis ; l'un ou l'autre) :
// A. un clic dans le texte fait paraître une barre d'équation en groupes nommés : Nouvelle (+ Équation),
//    Structures, Opérateurs, Tableaux, Symboles (trois menus), Fenêtre. Pendant l'écriture d'une équation,
//    la barre est la même, avec « Morceau » (et « Numéro » sur sa ligne) à la place de « Nouvelle ».
// B. un volet à droite de la page, au milieu de la zone visible :
//    - les 10 derniers morceaux d'équations écrits ((1+r), a/b, e^{-x}…), réinsérés d'un clic ; ceux
//      ajoutés à la main (☆, clic droit) restent épinglés ;
//    - les équations du document dans l'ordre : y aller, en insérer une copie au curseur.
(function () {
  const M = window.FTMoteur;
  if (!M) return;
  const view = M.view;
  const F = () => window.FTFormules;
  const V = () => window.FTFormuleVue;
  const $ = (id) => document.getElementById(id);
  const workspace = $('workspace');
  const pageEl = $('page');
  const app = $('app');
  const main = $('main');

  const KEY = 'ft-mode-maths';
  const PIECES = 'ft-maths-morceaux';
  const FOLDED = 'ft-maths-volet-reduit';
  const MAX = 10;
  const store = {
    get(key, def) { try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? def : v; } catch { return def; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
  };

  // ----- Barre d'équation : groupes nommés -----
  // Au clic dans le texte : « Nouvelle » (+ Équation : dans la ligne, ou sur sa propre ligne si la ligne est
  // vide), Structures, Opérateurs, Tableaux, Symboles (trois menus), Fenêtre. Pendant l'écriture d'une
  // équation (moteur/formules.js) : « Morceau » (et « Numéro » sur sa ligne) à la place de « Nouvelle ».

  const STRUCTURES = [
    ['\\frac{a}{b}', '\\frac{#@}{#?}', 'Fraction (/)'],
    ['x^{n}', '#@^{#?}', 'Exposant (^)'],
    ['x_{i}', '#@_{#?}', 'Indice (_)'],
    ['x_{i}^{n}', '#@_{#?}^{#?}', 'Indice et exposant'],
    ['\\sqrt{x}', '\\sqrt{#@}', 'Racine carrée'],
    ['\\left(x\\right)', '\\left(#@\\right)', 'Parenthèses'],
    ['\\left|x\\right|', '\\left|#@\\right|', 'Valeur absolue']
  ];
  const OPERATORS = [
    ['\\textstyle\\sum_{i=1}^{n}', '\\sum_{#?}^{#?}', 'Somme'],
    ['\\textstyle\\int_{a}^{b}', '\\int_{#?}^{#?}#?\\,\\mathrm{d}#?', 'Intégrale'],
    ['\\textstyle\\lim_{x\\to a}', '\\lim_{#?\\to #?}', 'Limite'],
    ['\\vec{u}', '\\vec{#@}', 'Vecteur']
  ];
  const ARRAYS = [
    ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', 'Matrice 2 × 2'],
    ['\\begin{cases}a\\\\b\\end{cases}', '\\begin{cases}#?\\\\#?\\end{cases}', 'Système']
  ];
  const sym = (list) => list.split(' ').map((l) => [l, l]);
  const SYMBOLS = [
    ['\\alpha', 'Lettres grecques', sym('\\alpha \\beta \\gamma \\delta \\varepsilon \\zeta \\eta \\theta \\iota \\kappa \\lambda \\mu \\nu \\xi \\pi \\rho \\sigma \\tau \\upsilon \\varphi \\chi \\psi \\omega \\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Phi \\Psi \\Omega')],
    ['\\leq', 'Relations, opérations et flèches', sym('= \\neq < > \\leq \\geq \\approx \\equiv \\sim \\simeq \\propto \\ll \\gg \\pm \\mp \\times \\div \\cdot \\circ \\infty \\partial \\nabla \\to \\leftarrow \\leftrightarrow \\Rightarrow \\Leftarrow \\Leftrightarrow \\mapsto')],
    ['\\in', 'Ensembles et logique', sym('\\in \\notin \\subset \\subseteq \\supset \\supseteq \\cup \\cap \\setminus \\emptyset \\mathbb{N} \\mathbb{Z} \\mathbb{Q} \\mathbb{R} \\mathbb{C} \\forall \\exists \\neg \\land \\lor')]
  ];
  // (Ancienne liste, pour la barre des équations hors mode maths.)
  const ITEMS = [...STRUCTURES, ...OPERATORS, ...ARRAYS];

  const ICON = {
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>',
    star: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
    window: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 5.5h13M4.5 8.5h4M4.5 10.8h6"/></svg>'
  };

  // Menu d'un groupe de symboles.
  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(button, title, list, put) {
    const same = pop && pop.dataset.for === title;
    closePop();
    if (same) return;
    pop = document.createElement('div');
    pop.className = 'ft-maths-pop';
    pop.dataset.for = title;
    pop.addEventListener('mousedown', (e) => e.preventDefault());
    const head = document.createElement('div');
    head.className = 'mg-pop-title';
    head.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'mg-pop-grid';
    for (const [d, ins] of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = F().render(d, false);
      b.addEventListener('click', () => { closePop(); put(ins); });
      grid.append(b);
    }
    pop.append(head, grid);
    document.body.append(pop);
    const r = button.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    let top = r.bottom + 6;
    if (top + p.height > window.innerHeight - 8) top = r.top - p.height - 6;
    pop.style.left = Math.max(8, Math.min(rightEdge() - p.width - 8, r.left)) + 'px';
    pop.style.top = top + 'px';
  }
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.mg-sym')) closePop(); }, true);

  // Groupes de la barre. ctl : équation en cours d'écriture (sinon : clic dans le texte).
  function groups(ctl) {
    const put = (ins) => {
      if (ctl) {
        const field = ctl.field();
        if (!field) return;
        field.focus();
        field.insert(ins, { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
        field.dispatchEvent(new Event('input'));
      } else {
        hideBar();
        V().insert(ins, { fresh: true });
      }
    };
    const button = (inner, title, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      if (cls) b.className = cls;
      b.title = title;
      b.innerHTML = inner;
      b.addEventListener('click', fn);
      return b;
    };
    const group = (caption, buttons) => {
      const g = document.createElement('div');
      g.className = 'mg-group';
      const row = document.createElement('div');
      row.className = 'mg-btns';
      row.append(...buttons);
      const cap = document.createElement('div');
      cap.className = 'mg-cap';
      cap.textContent = caption;
      g.append(row, cap);
      return g;
    };
    // Matrices et systèmes : rendus plus petits, pour tenir dans la hauteur de la barre.
    const math = (list) => list.map(([d, ins, title]) => button(F().render(d, false), title, () => put(ins), d.includes('\\begin') ? 'mg-tall' : ''));
    const first = [];
    if (!ctl) {
      first.push(group('Nouvelle', [button(ICON.plus + '<span>Équation</span>', 'Nouvelle équation (Alt+=) : dans la ligne, ou sur sa propre ligne si la ligne est vide', () => { hideBar(); V().insert('', { fresh: true }); }, 'txt')]));
    } else {
      first.push(group('Morceau', [button(ICON.star, 'Ajouter la sélection (ou l’équation) aux morceaux', () => {
        const field = ctl.field();
        if (!field) return;
        save(V().selectedLatex(field));
        field.focus();
      })]));
      if (ctl.block()) {
        const numbered = ctl.dom.hasAttribute('data-numero');
        first.push(group('Numéro', [button('(1)', numbered ? 'Retirer le numéro' : 'Numéroter l’équation', () => {
          ctl.set({ numbered: !ctl.dom.hasAttribute('data-numero') });
          V().refreshBar();
          const field = ctl.field();
          if (field) field.focus();
        }, 'txt' + (numbered ? ' on' : ''))]));
      }
    }
    const symbols = SYMBOLS.map(([d, title, list]) => {
      const b = button(F().render(d, false) + '<span class="mg-arrow">▾</span>', title, () => openPop(b, title, list, put), 'mg-sym');
      return b;
    });
    const windowBtn = button(ICON.window, 'Fenêtre d’équation : toutes les structures et les réglages', () => {
      closePop();
      if (ctl) {
        const dom = ctl.dom;
        ctl.finish(null);
        requestAnimationFrame(() => { if (dom.isConnected) F().open(dom); });
      } else {
        hideBar();
        F().open(null);
      }
    });
    return [
      ...first,
      group('Structures', math(STRUCTURES)),
      group('Opérateurs', math(OPERATORS)),
      group('Tableaux', math(ARRAYS)),
      group('Symboles', symbols),
      group('Fenêtre', [windowBtn])
    ];
  }

  let on = false;

  // ----- Barre au clic dans le texte -----

  let bar = null;
  function makeBar() {
    bar = document.createElement('div');
    bar.className = 'ft-math-bar ft-math-groups ft-maths-texte';
    bar.hidden = true;
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.append(...groups(null));
    document.body.append(bar);
    // Largeur connue seulement une fois les polices des équations chargées.
    new ResizeObserver(() => placeBar()).observe(bar);
  }
  function showBar() {
    if (!on || !F() || !V() || V().active() || !view.editable || app.classList.contains('reading-mode')) return;
    const sel = view.state.selection;
    if (!sel.empty || !(sel instanceof PM.state.TextSelection) || !sel.$from.parent.inlineContent || sel.$from.parent.type.spec.code) return;
    if (!bar) makeBar();
    bar.hidden = false;
    placeBar();
  }
  function placeBar() {
    if (!bar || bar.hidden) return;
    let c;
    try { c = view.coordsAtPos(view.state.selection.from); } catch { hideBar(); return; }
    const b = bar.getBoundingClientRect();
    const ws = workspace.getBoundingClientRect();
    // Sous la ligne du curseur (au-dessus quand la place manque en bas).
    let top = c.bottom + 10;
    if (top + b.height > ws.bottom - 4) top = c.top - b.height - 10;
    if (c.bottom < ws.top || c.top > ws.bottom) { hideBar(); return; }
    bar.style.left = Math.max(8, Math.min(rightEdge() - b.width - 8, c.left - 40)) + 'px';
    bar.style.top = top + 'px';
  }
  function hideBar() { if (bar) bar.hidden = true; closePop(); }
  // Bord droit utilisable par les barres : elles ne recouvrent pas le volet du mode maths.
  function rightEdge() {
    return panel && !panel.hidden ? panel.getBoundingClientRect().left : window.innerWidth;
  }

  view.dom.addEventListener('mouseup', (e) => {
    if (!on || e.button !== 0) return;
    setTimeout(showBar, 0);
  });
  document.addEventListener('mousedown', (e) => { if (bar && !bar.hidden && !bar.contains(e.target) && !(pop && pop.contains(e.target))) hideBar(); }, true);
  view.dom.addEventListener('keydown', (e) => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) hideBar(); }, true);
  workspace.addEventListener('scroll', () => { placeBar(); closePop(); }, { passive: true });

  // ----- Morceaux d'équations -----

  // Parties réutilisables d'une équation : fractions, racines, groupes entre parenthèses (avec leur
  // exposant), lettres avec un exposant ou un indice composé, grands opérateurs avec leurs bornes,
  // vecteurs et accents, matrices et systèmes.
  const OPS = /^\\(sum|prod|coprod|int|iint|iiint|oint|lim|limsup|liminf|bigcup|bigcap|max|min|sup|inf)\b/;
  const ACCENT = /^\\(vec|overrightarrow|overline|underline|hat|widehat|bar|tilde|widetilde|dot|ddot)\b/;
  const FRAC = /^\\(frac|dfrac|tfrac|binom)\b/;
  const CLOSE = { '(': ')', '[': ']' };
  function group(s, i) {
    if (s[i] !== '{') return -1;
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) return j + 1;
    }
    return -1;
  }
  // Argument d'une commande à partir de i : {…}, \commande ou un caractère.
  function arg(s, i) {
    while (s[i] === ' ') i++;
    if (s[i] === '{') return group(s, i);
    if (s[i] === '\\') { const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)); return m ? i + m[0].length : -1; }
    return i < s.length ? i + 1 : -1;
  }
  // Exposants et indices qui suivent.
  function scripts(s, i) {
    for (;;) {
      let j = i;
      while (s[j] === ' ') j++;
      if (s[j] !== '^' && s[j] !== '_') return i;
      const e = arg(s, j + 1);
      if (e < 0) return i;
      i = e;
    }
  }
  const visible = (t) => t.replace(/\\(left|right|mathrm|mathbf|operatorname|displaystyle)\b/g, '').replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}\s^_]|\\,/g, '').length;
  function fragments(latex) {
    const s = latex || '';
    const out = [];
    const push = (a, b) => {
      const t = s.slice(a, b).trim();
      if (t.length > 120 || visible(t) < 3) return;
      if (t.replace(/\s/g, '') === s.replace(/\s/g, '')) return; // l'équation entière : dans la liste des équations
      out.push(t);
    };
    for (let i = 0; i < s.length; i++) {
      const rest = s.slice(i);
      let m;
      if (rest.startsWith('\\begin{')) {
        const env = /^\\begin\{([a-zA-Z*]+)\}/.exec(rest);
        const end = env ? s.indexOf(`\\end{${env[1]}}`, i) : -1;
        if (end > 0) push(i, end + `\\end{${env[1]}}`.length);
        if (env) i += env[0].length - 1;
        continue;
      }
      if ((m = FRAC.exec(rest))) {
        const a = arg(s, i + m[0].length);
        const b = a > 0 ? arg(s, a) : -1;
        if (b > 0) push(i, scripts(s, b));
        i += m[0].length - 1;
        continue;
      }
      if ((m = /^\\sqrt\b/.exec(rest))) {
        let j = i + m[0].length;
        if (s[j] === '[') j = s.indexOf(']', j) + 1;
        const e = j > 0 ? arg(s, j) : -1;
        if (e > 0) push(i, scripts(s, e));
        i += m[0].length - 1;
        continue;
      }
      if ((m = ACCENT.exec(rest))) {
        const e = arg(s, i + m[0].length);
        if (e > 0) push(i, scripts(s, e));
        i += m[0].length - 1;
        continue;
      }
      if ((m = OPS.exec(rest))) {
        const e = scripts(s, i + m[0].length);
        if (e > i + m[0].length) push(i, e);
        i += m[0].length - 1;
        continue;
      }
      if (rest.startsWith('\\left')) {
        let depth = 0;
        let j = i;
        for (; j < s.length; j++) {
          if (s.startsWith('\\left', j)) depth++;
          else if (s.startsWith('\\right', j) && --depth === 0) break;
        }
        if (j < s.length) {
          const d = /^\\right(\\[a-zA-Z]+|\\.|.)/.exec(s.slice(j));
          if (d) push(i, scripts(s, j + d[0].length));
        }
        i += '\\left'.length;
        continue;
      }
      // Autre commande (\alpha, \right…) : sautée, sauf lettre grecque avec exposant ou indice composé.
      if (s[i] === '\\') {
        const name = /^\\([a-zA-Z]+|.)/.exec(rest);
        const n = name ? name[0].length : 1;
        if (name && /^[a-zA-Z]/.test(name[1]) && /^\s*[\^_]/.test(s.slice(i + n))) {
          const e = scripts(s, i + n);
          if (e > i + n + 2) push(i, e);
        }
        i += n - 1;
        continue;
      }
      const c = s[i];
      if (CLOSE[c] && !/\\(left|right|[bB]igg?[lr]?)\s*$/.test(s.slice(0, i))) {
        let depth = 0;
        let j = i;
        for (; j < s.length; j++) {
          if (s[j] === '\\') { j++; continue; }
          if (s[j] === c) depth++;
          else if (s[j] === CLOSE[c] && --depth === 0) break;
        }
        if (j < s.length) {
          // Fonction devant ses parenthèses : f(x+1).
          const before = /([a-zA-Z]|\\[a-zA-Z]+)$/.exec(s.slice(0, i));
          const start = c === '(' && before && !/^\\(left|right)$/.test(before[0]) ? i - before[0].length : i;
          push(start, scripts(s, j + 1));
        }
        continue;
      }
      // Lettre ou chiffre avec un exposant ou un indice composé : e^{-x}, u_{n+1}.
      if ((m = /^([a-zA-Z0-9])\s*[\^_]/.exec(rest))) {
        const e = scripts(s, i + m[1].length);
        if (e > i + m[1].length + 2) push(i, e);
      }
    }
    return out;
  }

  // Morceaux : [{ latex, pin }], les épinglés (ajoutés à la main) gardés, 10 au plus.
  // (Comparaison : (1+r)^n et \\left(1+r\\right)^{n} sont le même morceau.)
  const norm = (t) => t.replace(/\\(left|right)\b/g, '').replace(/\s+/g, '').replace(/\{(\\?[a-zA-Z0-9])\}/g, '$1');
  function pieces() { return store.get(PIECES, []).filter((p) => p && typeof p.latex === 'string'); }
  function setPieces(list) {
    const pins = list.filter((p) => p.pin).slice(0, MAX);
    const rest = list.filter((p) => !p.pin).slice(0, Math.max(0, MAX - pins.length));
    const kept = new Set([...pins, ...rest]);
    store.set(PIECES, list.filter((p) => kept.has(p)));
    paintPieces();
  }
  function addPieces(latexes, pin) {
    let list = pieces();
    for (const latex of [...latexes].reverse()) {
      if (!latex) continue;
      const old = list.find((p) => norm(p.latex) === norm(latex));
      list = list.filter((p) => p !== old);
      list.unshift({ latex, pin: pin || !!(old && old.pin) });
    }
    setPieces(list);
  }
  function save(latex) {
    latex = F() ? F().clean(latex || '') : latex;
    if (!latex || !latex.trim()) return;
    addPieces([latex.trim()], true);
  }

  // Équations écrites : leurs morceaux s'ajoutent (une fois l'écriture finie).
  let known = new Map();
  const countOf = (list) => {
    const m = new Map();
    for (const e of list) m.set(e.latex, (m.get(e.latex) || 0) + 1);
    return m;
  };
  let timer = 0;
  function check() {
    clearTimeout(timer);
    if (!V()) return;
    if (V().active()) { timer = setTimeout(check, 600); return; }
    const list = V().list();
    const now = countOf(list);
    if (on) {
      const fresh = [];
      for (const [latex, n] of now) if (n > (known.get(latex) || 0)) fresh.push(latex);
      const found = [];
      for (const latex of fresh) for (const f of fragments(latex).slice(0, 4)) if (!found.some((x) => norm(x) === norm(f))) found.push(f);
      if (found.length) addPieces(found.slice(0, MAX), false);
      paintEquations(list);
    }
    known = now;
  }
  M.onUpdate((tr) => {
    if (!tr.docChanged) return;
    clearTimeout(timer);
    timer = setTimeout(check, 400);
  });
  M.onLoad(() => {
    clearTimeout(timer);
    setTimeout(() => {
      known = V() ? countOf(V().list()) : new Map();
      if (on) paintEquations(V() ? V().list() : []);
    }, 0);
  });

  // ----- B. Volet -----

  let panel = null;
  let piecesBox;
  let eqBox;
  let countEl;
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function makePanel() {
    panel = el('aside', 'maths-panel');
    panel.id = 'maths-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Mode maths');
    panel.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
    const head = el('div', 'mp-head');
    const title = el('span', 'mp-title', 'Mode maths');
    const fold = el('button', 'mp-fold');
    fold.type = 'button';
    fold.addEventListener('click', () => { store.set(FOLDED, !panel.classList.contains('folded')); applyFold(); place(); });
    head.append(title, fold);
    const s1 = el('section', 'mp-section');
    s1.append(el('h3', '', 'Morceaux récents'));
    piecesBox = el('div', 'mp-pieces');
    s1.append(piecesBox);
    const s2 = el('section', 'mp-section mp-eq-section');
    const h = el('h3', '', 'Équations du document');
    countEl = el('span', 'mp-count');
    h.append(' ', countEl);
    s2.append(h);
    eqBox = el('div', 'mp-eqs');
    s2.append(eqBox);
    panel.append(head, s1, s2);
    document.body.append(panel);
    applyFold();
    new ResizeObserver(() => place()).observe(panel);
  }
  function applyFold() {
    const folded = !!store.get(FOLDED, false);
    panel.classList.toggle('folded', folded);
    const fold = panel.querySelector('.mp-fold');
    fold.textContent = folded ? '‹' : '›';
    fold.title = folded ? 'Ouvrir le volet' : 'Réduire le volet';
    fold.setAttribute('aria-expanded', String(!folded));
  }

  function paintPieces() {
    if (!panel) return;
    const list = pieces();
    if (!list.length) {
      piecesBox.replaceChildren(el('p', 'mp-empty', 'Les parties des équations écrites s’ajoutent ici. ☆ ou clic droit : en garder une.'));
      return;
    }
    piecesBox.replaceChildren(...list.map((p) => {
      const b = el('button', 'mp-piece' + (p.pin ? ' pin' : ''));
      b.type = 'button';
      b.title = (p.pin ? 'Morceau épinglé (trait de gauche). ' : '') + 'Clic : insérer ; clic droit : autres choix';
      b.innerHTML = F().render(p.latex, false);
      b.addEventListener('click', () => V().insert(p.latex));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        window.FTSidebar.showMenu(e.clientX, e.clientY, [
          { text: 'Insérer', action: () => V().insert(p.latex) },
          { text: 'Insérer dans une nouvelle équation', action: () => V().insert(p.latex, { fresh: true }) },
          { text: p.pin ? 'Ne plus épingler' : 'Épingler', action: () => setPieces(pieces().map((x) => (norm(x.latex) === norm(p.latex) ? { ...x, pin: !p.pin } : x))) },
          { text: 'Copier le code LaTeX', action: () => V().copyLatex(p.latex) },
          '-',
          { text: 'Retirer', danger: true, action: () => setPieces(pieces().filter((x) => norm(x.latex) !== norm(p.latex))) }
        ]);
      });
      return b;
    }));
  }

  function goTo(pos) {
    const dom = view.nodeDOM(pos);
    if (!dom || !window.FTGeneres) return;
    window.FTGeneres.reveal(dom, Math.max(60, workspace.clientHeight / 2 - 40));
    requestAnimationFrame(() => window.FTGeneres.flash(dom));
  }
  function infoAt(pos) {
    const node = view.state.doc.nodeAt(pos);
    return node && V().isMath(node) ? F().infoOf(node.attrs.html) : null;
  }
  function paintEquations(list) {
    if (!panel || !on) return;
    countEl.textContent = list.length ? `(${list.length})` : '';
    if (!list.length) {
      eqBox.replaceChildren(el('p', 'mp-empty', 'Aucune équation.'));
      return;
    }
    eqBox.replaceChildren(...list.slice(0, 400).map((e) => {
      const row = el('div', 'mp-eq' + (e.block ? ' block' : ''));
      const go = el('button', 'mp-eq-go');
      go.type = 'button';
      go.title = 'Aller à l’équation (clic droit : autres choix)';
      const math = el('span', 'mp-eq-math');
      math.innerHTML = F().render(e.latex || '\\square', false);
      go.append(math);
      if (e.eq) go.append(el('span', 'mp-eq-num', e.eq));
      go.addEventListener('click', () => goTo(e.pos));
      const copy = el('button', 'mp-eq-copy');
      copy.type = 'button';
      copy.title = 'Insérer une copie au curseur';
      copy.innerHTML = '<svg viewBox="0 0 16 16"><rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M3.5 10.5h-.8a1.2 1.2 0 0 1-1.2-1.2V2.7a1.2 1.2 0 0 1 1.2-1.2h6.6a1.2 1.2 0 0 1 1.2 1.2v.8"/></svg>';
      copy.addEventListener('click', () => { const info = infoAt(e.pos); if (info) F().insertCopy(info); });
      row.append(go, copy);
      row.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        window.FTSidebar.showMenu(ev.clientX, ev.clientY, [
          { text: 'Aller à l’équation', action: () => goTo(e.pos) },
          { text: 'Insérer une copie au curseur', action: () => { const info = infoAt(e.pos); if (info) F().insertCopy(info); } },
          { text: 'Modifier l’équation', action: () => { const dom = view.nodeDOM(e.pos); if (dom) F().open(dom); } },
          { text: 'Copier le code LaTeX', action: () => V().copyLatex(e.latex) },
          { text: 'Ajouter aux morceaux', action: () => save(e.latex) }
        ]);
      });
      return row;
    }));
  }

  // À droite de la page, au milieu de la zone visible (il suit le défilement).
  function paperRect() {
    const sheets = pageEl.classList.contains('paged') ? [...pageEl.querySelectorAll('#pg-sheets > .pg-sheet')].slice(0, 2) : [];
    const rects = (sheets.length ? sheets : [pageEl]).map((x) => x.getBoundingClientRect()).filter((r) => r.width);
    if (!rects.length) return null;
    return { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) };
  }
  function shown() {
    return on && !pageEl.hidden && !app.classList.contains('reading-mode') && !main.classList.contains('view-mindmap') && !main.classList.contains('view-timeline');
  }
  function place() {
    if (!panel) return;
    const visible = shown();
    panel.hidden = !visible;
    if (!visible) { hideBar(); return; }
    const ws = workspace.getBoundingClientRect();
    const paper = paperRect();
    if (!ws.width || !paper) { panel.hidden = true; return; }
    const inner = ws.left + workspace.clientWidth;
    panel.style.maxHeight = Math.max(160, ws.height * 0.84) + 'px';
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    panel.style.left = Math.max(ws.left + 4, Math.min(inner - w - 6, paper.right + 18)) + 'px';
    panel.style.top = Math.max(ws.top + 8, ws.top + (ws.height - h) / 2) + 'px';
  }
  let placing = 0;
  const replace = () => { if (!on) return; cancelAnimationFrame(placing); placing = requestAnimationFrame(place); };
  workspace.addEventListener('scroll', replace, { passive: true });
  window.addEventListener('resize', replace);
  new ResizeObserver(replace).observe(workspace);
  new MutationObserver(replace).observe(pageEl, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  new MutationObserver(replace).observe(app, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(replace).observe(main, { attributes: true, attributeFilter: ['class'] });

  // ----- Interrupteur -----

  const sw = $('mathmode-switch');
  function set(value, animate = true) {
    value = !!value;
    if (value && window.FTToolbar && window.FTToolbar.isSide()) window.FTToolbar.setSide(false);
    const changed = value !== on;
    on = value;
    store.set(KEY, on);
    if (sw) {
      sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.maths === 'on') === on)));
      if (window.FTSwitch) requestAnimationFrame(() => window.FTSwitch.place(sw, animate && changed));
    }
    app.classList.toggle('maths-mode', on);
    if (on) {
      if (!panel) makePanel();
      paintPieces();
      paintEquations(V() ? V().list() : []);
      if (changed && animate && document.documentElement.dataset.uiAnim !== 'aucune') {
        panel.classList.remove('mp-opening');
        void panel.offsetWidth;
        panel.classList.add('mp-opening');
      }
    } else hideBar();
    place();
    if (V()) V().refreshBar();
  }
  if (sw) {
    sw.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => set(b.dataset.maths === 'on'));
    });
  }
  // (Après le rétablissement des barres d'outils : le mode raccourcis enregistré passe avant.)
  setTimeout(() => { if (store.get(KEY, false) && !(window.FTToolbar && window.FTToolbar.isSide())) set(true, false); }, 0);

  window.FTModeMaths = {
    on: () => on,
    set,
    toggle() { set(!on); },
    items: () => ITEMS,
    // Groupes de la barre de l'équation en cours d'écriture (moteur/formules.js).
    groups: (ctl) => groups(ctl),
    closePop,
    rightEdge,
    save,
    pieces,
    fragments
  };
})();
