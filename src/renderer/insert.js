// Boutons d'insertion : note de bas de page, caractères spéciaux (avec favoris). (Équations : formules.js.)
(function () {
  let editor = document.getElementById('editor');
  let S = () => window.FTStructure;

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
    // (Équations : formules.js et moteur/formules.js.)
    useEngine(mount, bridge) {
      editor = mount;
      S = () => bridge;
    }
  };
})();
