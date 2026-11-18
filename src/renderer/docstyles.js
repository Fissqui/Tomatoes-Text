// Styles du document : une fenêtre avec un onglet par type d'élément (titres, tirets, tableaux,
// encadrés, plan, schémas), les styles prêts et les réglages détaillés. On y arrive de trois façons :
// le bouton « Styles du document » de la barre principale, la petite flèche à côté du bouton de
// l'outil (menu rapide), et « Style… » au clic droit sur un élément.
// Chaque choix s'applique à l'une de trois portées :
// - doc : tout le document (le thème du document change, les éléments existants le suivent) ;
// - one : l'élément sélectionné seulement (le style est posé sur lui) ;
// - next : les prochains éléments seulement (les existants gardent leur style actuel).
(function () {
  const $ = (id) => document.getElementById(id);
  let S = () => window.FTStructure;
  const T = () => window.FTTheme;
  let editor = $('editor');
  // Moteur 2.0 : éléments du moteur, chaque changement relu d'un coup (moteur/objets.js).
  let run = (fn) => fn();
  const dialog = $('docstyles-dialog');
  const tabsBox = $('ds-tabs');
  const scopeBox = $('ds-scope');
  const panel = $('ds-panel');

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  };
  const sameJson = (a, b, skip = []) => {
    const strip = (o) => JSON.stringify(o, (k, v) => (skip.includes(k) ? undefined : v));
    return strip(a) === strip(b);
  };
  const outside = (n) => !n.closest('.ft-toc, .ft-footnotes, .ft-endnotes');

  // ----- Types d'éléments -----

  const LEVEL = (h) => (h.classList.contains('ft-title') ? 0 : Number(h.tagName[1]));
  const headingsOf = () => [...editor.querySelectorAll('h1, h2, h3, h4, h5')].filter(outside);
  // Liste du haut d'une liste à tirets (les listes imbriquées en font partie).
  function outerList(node) {
    let list = node.closest('ul, ol');
    while (list && list.parentElement && list.parentElement.tagName === 'LI' && list.parentElement.parentElement.matches('ul, ol')) list = list.parentElement.parentElement;
    return list;
  }
  const bulletList = (l) => l && l.tagName === 'UL' && !l.classList.contains('ft-check') && editor.contains(l) && outside(l);
  const topLists = () => [...editor.querySelectorAll('ul')].filter((l) => bulletList(l) && outerList(l) === l);
  // Liste numérotée du haut : la plus haute <ol> qui contient la ligne (hors notes et bibliographie).
  function outerOl(node) {
    let top = null;
    for (let n = node.closest('ol'); n && editor.contains(n); n = n.parentElement && n.parentElement.closest('ol')) top = n;
    return top && !top.closest('.ft-footnotes, .ft-endnotes, .ft-biblio') && outside(top) ? top : null;
  }
  const topOls = () => [...editor.querySelectorAll('ol')].filter((l) => outerOl(l) === l);

  function scaledHeading(h, text, k) {
    const d = el('div', { className: 'ds-h', textContent: text });
    S().inlineHeading(d, h);
    d.style.fontSize = Math.max(8, Math.min(Number(h.size) || 12, 30) * k) + 'pt';
    if (h.font && window.FTEditor) window.FTEditor.loadFont(h.font);
    return d;
  }

  function swatches(options, value, set, cls) {
    return el('div', { className: 'ds-swatches' }, options.map(([v, name]) => {
      const b = el('button', { type: 'button', title: name, className: cls + (value === v ? ' on' : '') });
      if (v) b.dataset.color = v;
      b.addEventListener('click', () => set(v));
      return b;
    }));
  }

  function selectOf(options, value, set, title) {
    const s = el('select', { title: title || '' });
    for (const [v, label] of options) s.append(new Option(label, String(v)));
    if (![...s.options].some((o) => o.value === String(value))) s.append(new Option(/^\d+\.\d+$/.test(String(value)) ? String(value).replace('.', ',') : String(value), String(value)));
    s.value = String(value);
    s.addEventListener('change', () => set(s.value));
    return s;
  }

  // Bornes d'une valeur tapée dans une liste chiffrée (number.js).
  const limits = (s, min, max) => { Object.assign(s.dataset, { min, max }); return s; };

  const fontGroups = () => [...document.querySelectorAll('#font-family optgroup')]
    .filter((g) => g.label !== 'Polices Office')
    .map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]);
  function fontSelect(value, set, first = 'Police du texte') {
    const s = el('select', { title: 'Police' });
    s.append(new Option(first, ''));
    for (const [label, names] of fontGroups()) {
      const g = el('optgroup', { label });
      names.forEach((n) => g.append(new Option(n, n)));
      s.append(g);
    }
    if (value && ![...s.options].some((o) => o.value === value)) s.append(new Option(value, value));
    s.value = value || '';
    s.addEventListener('change', () => { if (s.value && window.FTEditor) window.FTEditor.loadFont(s.value); set(s.value); });
    return s;
  }

  const field = (label, ...controls) => el('label', { className: 'ds-field' }, [el('span', { textContent: label }), ...controls]);
  const section = (label) => el('div', { className: 'ds-label', textContent: label });
  const checkbox = (label, checked, set) => {
    const c = el('input', { type: 'checkbox', checked: !!checked });
    c.addEventListener('change', () => set(c.checked));
    return el('label', { className: 'pop-check' }, [c, ' ' + label]);
  };

  const KINDS = {
    titres: {
      label: 'Titres', one: 'Ce titre', next: 'Les prochains titres',
      oneHelp: 'Le titre sélectionné uniquement.', docHelp: 'Tous les titres du document, existants et à venir.', nextHelp: 'Les titres créés ensuite. Les titres existants conservent leur style actuel.',
      presets: () => S().headingPresets().map((p) => ({ id: p.id, name: p.name, value: { title: p.title, headings: p.headings } })),
      same: (a, b) => sameJson(a, b),
      thumb: (v) => el('div', { className: 'ds-heads' }, [scaledHeading(v.title, 'Titre', 0.55), scaledHeading(v.headings[0], 'Chapitre', 0.6), scaledHeading(v.headings[1], 'Section', 0.7)]),
      targetOf: (n) => { const h = n.closest('h1, h2, h3, h4, h5'); return h && editor.contains(h) && outside(h) ? h : null; },
      valueOf(h) {
        const v = T().part('titres');
        const own = S().headingOwnStyle(h);
        if (own) { if (LEVEL(h) === 0) v.title = own; else v.headings[LEVEL(h) - 1] = own; }
        return v;
      },
      applyOne(h, v) { S().ownHeading(h, LEVEL(h) === 0 ? v.title : v.headings[LEVEL(h) - 1]); },
      applyAll() { headingsOf().forEach((h) => S().clearHeading(h)); },
      freeze() {
        const v = T().part('titres');
        headingsOf().forEach((h) => { if (!S().headingOwnStyle(h)) S().ownHeading(h, LEVEL(h) === 0 ? v.title : v.headings[LEVEL(h) - 1]); });
      },
      controls: (v, changed, target) => [section('Réglages'), S().headingEditor({ value: v, onChange: changed, single: target ? LEVEL(target) : null })]
    },
    tirets: {
      label: 'Tirets', one: 'Cette liste', next: 'Les prochaines listes',
      oneHelp: 'La liste sélectionnée uniquement.', docHelp: 'Toutes les listes à tirets du document, existantes et à venir.', nextHelp: 'Les listes créées ensuite. Les listes existantes conservent leurs tirets actuels.',
      presets: () => S().bulletPresets(),
      same: (a, b) => sameJson(a, b),
      thumb(v) {
        let list = null;
        for (let i = 2; i >= 0; i--) {
          const li = el('li', { textContent: ['Premier', 'Deuxième', 'Troisième'][i] });
          if (list) li.append(list);
          list = el('ul', {}, [li]);
        }
        S().ownList(list, v);
        delete list.dataset.bl;
        return el('div', { className: 'ft-list-preview ds-list' }, [list]);
      },
      targetOf: (n) => { const l = n.closest('li') && outerList(n); return bulletList(l) ? l : null; },
      valueOf: (l) => S().listOwnStyle(l) || T().part('tirets'),
      applyOne: (l, v) => S().ownList(l, v),
      applyAll() { editor.querySelectorAll('ul[data-bl]').forEach((l) => S().clearList(l)); },
      freeze() {
        const v = T().part('tirets');
        topLists().forEach((l) => { if (!l.dataset.bl) S().ownList(l, v); });
      },
      controls: (v, changed) => [section('Réglages'), S().bulletEditor({ value: v, onChange: changed })]
    },
    numeros: {
      label: 'Numéros', one: 'Cette liste', next: 'Les prochaines listes',
      oneHelp: 'La liste numérotée sélectionnée uniquement.', docHelp: 'Toutes les listes numérotées du document, existantes et à venir.', nextHelp: 'Les listes créées ensuite. Les listes existantes conservent leur numérotation actuelle.',
      presets: () => S().numberPresets(),
      same: (a, b) => sameJson(a, b),
      thumb: (v) => el('div', { className: 'ft-list-preview ds-list' }, [S().numberPreview(v, 3, true)]),
      targetOf: (n) => (n.closest('li') ? outerOl(n) : null),
      valueOf: (l) => S().numbersOf(l) || T().part('numeros'),
      applyOne: (l, v) => S().ownNumbers(l, v),
      applyAll() { topOls().forEach((l) => S().clearNumbers(l)); },
      freeze() {
        topOls().forEach((l) => S().ownNumbers(l, S().numbersOf(l) || T().part('numeros')));
      },
      controls: (v, changed) => [section('Réglages'), S().numberEditor({ value: v, onChange: changed })]
    },
    tableaux: {
      label: 'Tableaux', one: 'Ce tableau', next: 'Les prochains tableaux',
      oneHelp: 'Le tableau sélectionné uniquement.', docHelp: 'Tous les tableaux du document, existants et à venir.', nextHelp: 'Les tableaux créés ensuite. Les tableaux existants conservent leur style.',
      presets: () => S().tablePresets().map(([name, value]) => ({ id: name, name, value })),
      same: (a, b) => ['style', 'color', 'font', 'size', 'pad', ...S().tableParts().options].every((k) => (a[k] || '') === (b[k] || '')),
      thumb: (v) => S().tableThumb(v),
      targetOf: (n) => { const t = n.closest('table.ft-table'); return t && editor.contains(t) ? t : null; },
      valueOf: (t) => { const { width, ...look } = S().tableLook(t); return look; },
      applyOne: (t, v) => S().setTableLook(t, v),
      applyAll: (v) => S().restyleTables(v),
      controls(v, changed, target) {
        const parts = S().tableParts();
        const set = (k) => (x) => { v[k] = x; changed(true); };
        const OPTION_LABELS = { header: "Ligne d'en-tête", first: 'Première colonne', total: 'Ligne de total', last: 'Dernière colonne', bands: 'Lignes à bandes', bandcols: 'Colonnes à bandes', sep: 'Barre après la première colonne' };
        const designs = el('div', { className: 'ds-gallery ds-gallery-small' }, parts.themes.map(([value, name]) => {
          const b = el('button', { type: 'button', title: name, className: v.style === value ? 'on' : '' }, [S().tableThumb({ ...v, style: value }), el('span', { textContent: name })]);
          b.addEventListener('click', () => set('style')(value));
          return b;
        }));
        const out = [
          section('Bordures et fond'), designs,
          section('Couleur'), swatches(parts.colors, v.color, set('color'), 'table-color'),
          section('Parties mises en valeur'),
          el('div', { className: 'ds-checks' }, parts.options.map((o) => checkbox(OPTION_LABELS[o], v[o], set(o)))),
          section('Texte'),
          el('div', { className: 'ds-row' }, [
            field('Police', fontSelect(v.font, set('font'))),
            field('Taille', limits(selectOf([[0, 'Taille du texte'], ...[9, 10, 10.5, 11, 12, 13, 14].map((n) => [n, String(n).replace('.', ',') + ' pt'])], v.size || 0, (x) => set('size')(Number(x))), 6, 40)),
            field('Espacement', selectOf(parts.pads, v.pad || '', set('pad')))
          ])
        ];
        if (target) {
          out.push(section('Ce tableau'), field('Largeur', selectOf([['full', 'Toute la largeur de la page'], ['auto', 'Ajustée au contenu']], S().tableLook(target).width, (w) => {
            S().checkpoint();
            S().setTableLook(target, { width: w });
            S().changed();
          })));
        }
        return out;
      }
    },
    encadres: {
      label: 'Encadrés', one: 'Cet encadré', next: 'Les prochains encadrés',
      oneHelp: "L'encadré sélectionné uniquement.", docHelp: 'Tous les encadrés du document, existants et à venir.', nextHelp: 'Les encadrés créés ensuite. Les encadrés existants conservent leur style.',
      presets: () => S().calloutPresets(),
      same: (a, b) => (a.look || '') === (b.look || '') && (a.color || '') === (b.color || ''),
      thumb(v, text = 'Texte encadré') {
        const box = el('blockquote', { className: 'ft-callout', textContent: text });
        S().styleCallout(box, v);
        return el('div', { className: 'ds-sample' }, [box]);
      },
      targetOf: (n) => { const b = n.closest('.ft-callout:not(.ft-quote)'); return b && editor.contains(b) ? b : null; },
      valueOf: (b) => S().calloutLook(b),
      applyOne: (b, v) => S().styleCallout(b, v),
      applyAll: (v) => S().restyleCallouts(v),
      controls(v, changed) {
        const forms = el('div', { className: 'ds-gallery ds-gallery-small' }, S().calloutLooks().map(([look, name]) => {
          const b = el('button', { type: 'button', title: name, className: (v.look || '') === look ? 'on' : '' }, [KINDS.encadres.thumb({ ...v, look }, 'Texte'), el('span', { textContent: name })]);
          b.addEventListener('click', () => { v.look = look; changed(true); });
          return b;
        }));
        return [section('Forme'), forms, section('Couleur'), swatches(S().calloutColors(), v.color || '', (c) => { v.color = c; changed(true); }, 'callout-color')];
      }
    },
    citations: {
      label: 'Citations', one: 'Cette citation', next: 'Les prochaines citations',
      oneHelp: 'La citation sélectionnée uniquement.', docHelp: 'Toutes les citations du document, existantes et à venir.', nextHelp: 'Les citations créées ensuite. Les citations existantes conservent leur style.',
      presets: () => S().quotePresets(),
      same: (a, b) => (a.look || '') === (b.look || '') && (a.color || '') === (b.color || ''),
      thumb(v, text = 'Le style est l’homme même.') {
        const box = el('blockquote', { className: 'ft-callout ft-quote' }, [el('p', { textContent: text }), el('p', { className: 'ft-quote-src', textContent: 'Buffon' })]);
        S().styleQuote(box, v);
        return el('div', { className: 'ds-sample' }, [box]);
      },
      targetOf: (n) => { const b = n.closest('.ft-quote'); return b && editor.contains(b) ? b : null; },
      valueOf: (b) => S().quoteLook(b),
      applyOne: (b, v) => S().styleQuote(b, v),
      applyAll: (v) => S().restyleQuotes(v),
      controls(v, changed) {
        const forms = el('div', { className: 'ds-gallery ds-gallery-small' }, S().quoteLooks().map(([look, name]) => {
          const b = el('button', { type: 'button', title: name, className: (v.look || '') === look ? 'on' : '' }, [KINDS.citations.thumb({ ...v, look }, 'Citation'), el('span', { textContent: name })]);
          b.addEventListener('click', () => { v.look = look; changed(true); });
          return b;
        }));
        return [section('Forme'), forms, section('Couleur'), swatches(S().calloutColors(), v.color || '', (c) => { v.color = c; changed(true); }, 'callout-color')];
      }
    },
    code: {
      label: 'Blocs de code', one: 'Ce bloc de code', next: 'Les prochains blocs de code',
      oneHelp: 'Le bloc de code du curseur uniquement.', docHelp: 'Tous les blocs de code du document, existants et à venir.', nextHelp: 'Les blocs de code insérés ensuite. Les blocs existants conservent leur style.',
      presets: () => window.FTCode.presets(),
      same: (a, b) => window.FTCode.sameStyle(a, b),
      thumb: (v) => window.FTCode.sample(v),
      targetOf: (n) => { const p = n.closest('pre.ft-code'); return p && editor.contains(p) ? p : null; },
      valueOf: (p) => window.FTCode.styleOf(p),
      applyOne: (p, v) => window.FTCode.stylePre(p, v),
      applyAll: (v) => editor.querySelectorAll('pre.ft-code').forEach((p) => window.FTCode.stylePre(p, v)),
      controls: (v, changed) => {
        const h = { el, section, field, selectOf, checkbox };
        return [...window.FTCode.styleControls(v, changed, h), window.FTCode.saisieControls(h)];
      }
    },
    plan: {
      label: 'Plan', one: 'Ce plan', next: 'Les prochains plans',
      oneHelp: 'Le plan sélectionné uniquement.', docHelp: 'Tous les plans du document, existants et à venir.', nextHelp: 'Les plans insérés ensuite. Les plans existants conservent leur style.',
      presets: () => window.FTToc.presets(),
      same: (a, b) => sameJson(window.FTToc.clean(a), window.FTToc.clean(b), ['preset']),
      thumb(v) {
        const toc = window.FTToc.sample(v, 4);
        toc.style.fontSize = '';
        return el('div', { className: 'toc-preview ds-toc' }, [toc]);
      },
      targetOf: (n) => { const t = n.closest('.ft-toc'); return t && editor.contains(t) ? t : null; },
      valueOf: (t) => window.FTToc.configOf(t),
      applyOne: (t, v) => window.FTToc.setConfig(t, v),
      applyAll: (v) => window.FTToc.restyleAll(v),
      controls: (v, changed) => [section('Réglages'), window.FTToc.editor({ value: v, onChange: changed })]
    },
    schemas: {
      label: 'Schémas', one: 'Ce schéma', next: 'Les prochains schémas',
      oneHelp: 'Le schéma sélectionné uniquement.', docHelp: 'Tous les schémas du document, existants et à venir.', nextHelp: 'Les schémas créés ensuite. Les schémas existants conservent leur style.',
      presets: () => window.FTDiagram.presets(),
      same: (a, b) => sameJson(window.FTDiagram.cleanStyle(a), window.FTDiagram.cleanStyle(b)),
      thumb: (v) => el('div', { className: 'ds-diagram' }, [window.FTDiagram.sample(v)]),
      targetOf: (n) => { const b = n.closest('.ft-image[data-diagram]'); return b && editor.contains(b) ? b : null; },
      valueOf: (b) => window.FTDiagram.styleOf(b),
      applyOne: (b, v) => window.FTDiagram.restyle(b, v),
      applyAll: (v) => editor.querySelectorAll('.ft-image[data-diagram]').forEach((b) => window.FTDiagram.restyle(b, v)),
      controls(v, changed) {
        const set = (k) => (x) => { v[k] = x; changed(true); };
        const color = (k, label) => {
          const input = el('input', { type: 'color', value: v[k], title: label, disabled: v.palette && k !== 'link' });
          input.addEventListener('change', () => set(k)(input.value));
          return field(label, input);
        };
        return [
          section('Couleurs'),
          el('div', { className: 'ds-row' }, [color('fill', 'Remplissage'), color('stroke', 'Contour'), color('textColor', 'Texte'), color('link', 'Connecteurs')]),
          checkbox('Une couleur différente par forme', v.palette, set('palette')),
          section('Formes et texte'),
          el('div', { className: 'ds-row' }, [
            field('Police', selectOf(window.FTDiagram.fonts().map((f) => [f, f]), v.font, set('font'))),
            field('Contour', limits(selectOf([[1, 'Fin (1)'], [1.5, 'Normal (1,5)'], [2, 'Épais (2)'], [3, 'Très épais (3)']], v.strokeWidth, (x) => set('strokeWidth')(Number(x))), 0.25, 6)),
            checkbox('Ombre', v.shadow, set('shadow'))
          ])
        ];
      }
    }
  };
  const ORDER = ['titres', 'tirets', 'numeros', 'tableaux', 'encadres', 'citations', 'code', 'plan', 'schemas'];

  // Nœud affiché du curseur (moteur 2.0 : celui du curseur du moteur, même quand une fenêtre a le clavier).
  let caretNode = () => {
    const sel = window.getSelection();
    return sel.rangeCount && editor.contains(sel.anchorNode) ? sel.anchorNode : null;
  };

  // L'élément visé : l'objet sélectionné (tableau, schéma, encadré) ou l'élément du curseur.
  function targetFromSelection(kind) {
    const obj = S().selected && S().selected();
    if (obj && KINDS[kind].targetOf(obj)) return KINDS[kind].targetOf(obj);
    const node = caretNode();
    const elNode = node && (node.nodeType === 1 ? node : node.parentElement);
    return elNode ? KINDS[kind].targetOf(elNode) : null;
  }

  // ----- Appliquer -----

  let lastCommit = 0;
  function checkpoint() {
    // Un réglage glissé (couleur) ne remplit pas l'historique : un point d'annulation par seconde.
    if (Date.now() - lastCommit > 1000) S().checkpoint();
    lastCommit = Date.now();
  }

  function apply(kind, scope, target, value) {
    run(() => applyNow(kind, scope, target, value));
  }
  function applyNow(kind, scope, target, value) {
    const k = KINDS[kind];
    if (scope === 'one') {
      if (!target || !target.isConnected) return;
      checkpoint();
      k.applyOne(target, clone(value));
    } else if (scope === 'doc') {
      checkpoint();
      T().setPart(kind, value);
      k.applyAll(clone(value));
    } else {
      if (k.freeze) { checkpoint(); k.freeze(); }
      T().setPart(kind, value);
    }
    S().changed();
    if (S().selected && S().selected()) S().placeFrame();
  }

  const valueFor = (kind, scope, target) => (scope === 'one' && target ? KINDS[kind].valueOf(target) : T().part(kind));

  // ----- Portée -----

  let lastScope = 'doc'; // portée choisie hors élément sélectionné (gardée pendant la session)

  function scopeControl(kind, scope, target, onPick, compact) {
    const k = KINDS[kind];
    const opts = [['doc', 'Tout le document', k.docHelp], ['one', k.one, target ? k.oneHelp : `Aucun élément sélectionné (${k.label.toLowerCase()}).`], ['next', compact ? 'Les prochains' : k.next, k.nextHelp]];
    const box = el('div', { className: 'ds-scope-buttons', role: 'radiogroup', ariaLabel: 'Appliquer à' }, opts.map(([v, label, help]) => {
      const b = el('button', { type: 'button', textContent: label, title: help, className: scope === v ? 'on' : '', disabled: v === 'one' && !target });
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(scope === v));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => onPick(v));
      return b;
    }));
    const help = (opts.find(([v]) => v === scope) || opts[0])[2];
    return el('div', { className: 'ds-scope-wrap' + (compact ? ' compact' : '') }, [
      el('div', { className: 'ds-scope-row' }, [el('span', { className: 'ds-scope-label', textContent: 'Appliquer à' }), box]),
      compact ? '' : el('p', { className: 'ds-help', textContent: help })
    ]);
  }

  function gallery(kind, value, pick, cls = '') {
    const k = KINDS[kind];
    return el('div', { className: 'ds-gallery ' + cls }, k.presets().map((p) => {
      const b = el('button', { type: 'button', title: p.name, className: k.same(value, p.value) ? 'on' : '' }, [k.thumb(p.value), el('span', { textContent: p.name })]);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => pick(clone(p.value)));
      return b;
    }));
  }

  // ----- Fenêtre -----

  let state = { kind: 'titres', scope: 'doc', target: null, work: null };

  function render(keepScroll) {
    const { kind, target } = state;
    const k = KINDS[kind];
    if (state.scope === 'one' && !(target && target.isConnected)) state.scope = lastScope;
    tabsBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
    scopeBox.replaceChildren(scopeControl(kind, state.scope, target && target.isConnected ? target : null, (s) => {
      state.scope = s;
      if (s !== 'one') lastScope = s;
      state.work = valueFor(kind, s, state.target);
      render();
    }));
    const scroll = panel.scrollTop;
    const work = state.work;
    // Un réglage change : appliqué aussitôt ; « redraw » refait la fenêtre (galeries, cases cochées).
    const changed = (redraw) => {
      apply(kind, state.scope, state.target, work);
      if (redraw) render(true); else refreshGallery();
    };
    const presetBox = el('div', {}, [gallery(kind, work, (v) => {
      state.work = v;
      apply(kind, state.scope, state.target, v);
      render(true);
    })]);
    const refreshGallery = () => presetBox.replaceChildren(gallery(kind, work, (v) => { state.work = v; apply(kind, state.scope, state.target, v); render(true); }));
    panel.replaceChildren(section('Styles prêts'), presetBox, ...k.controls(work, changed, state.scope === 'one' ? target : null));
    if (keepScroll) panel.scrollTop = scroll;
  }

  function open(kind, target, scope) {
    kind = KINDS[kind] ? kind : state.kind;
    if (target === undefined) target = targetFromSelection(kind);
    state = { kind, target: target || null, scope: scope || (target ? 'one' : lastScope), work: null };
    if (state.scope === 'one' && !target) state.scope = lastScope;
    state.work = valueFor(kind, state.scope, state.target);
    closeQuick();
    if (!dialog.open) dialog.showModal();
    render();
  }

  for (const id of ORDER) {
    const b = el('button', { type: 'button', textContent: KINDS[id].label });
    b.dataset.kind = id;
    b.addEventListener('click', () => open(id));
    tabsBox.append(b);
  }
  $('ds-close').addEventListener('click', () => dialog.close());
  $('ds-theme').addEventListener('click', () => { dialog.close(); T().open('choisir'); });

  // ----- Menus rapides (petite flèche à côté du bouton de l'outil) -----

  function renderQuick(kind, container, target) {
    if (target === undefined) target = targetFromSelection(kind);
    target = target || null;
    let scope = target ? 'one' : lastScope;
    const draw = () => {
      const value = valueFor(kind, scope, target);
      container.replaceChildren(
        el('div', { className: 'pop-title', textContent: 'Styles des ' + KINDS[kind].label.toLowerCase() }),
        scopeControl(kind, scope, target, (s) => { scope = s; if (s !== 'one') lastScope = s; draw(); }, true),
        gallery(kind, value, (v) => { apply(kind, scope, target, v); draw(); }, 'ds-gallery-quick'),
        (() => {
          const more = el('button', { type: 'button', className: 'ds-more', textContent: 'Plus de réglages…' });
          more.addEventListener('mousedown', (e) => e.preventDefault());
          more.addEventListener('click', () => { const pop = container.closest('.ft-pop'); if (pop) pop.hidden = true; open(kind, target, scope); });
          return more;
        })()
      );
    };
    draw();
  }

  // Outils de la barre d'insertion : bouton + flèche (encadré, tirets, plan, schéma).
  const quickPops = [];
  function closeQuick() { quickPops.forEach((p) => { p.hidden = true; }); }
  function tool(kind, btnId, moreId, popId, action) {
    const btn = $(btnId);
    const more = $(moreId);
    const pop = $(popId);
    if (!btn || !more || !pop) return;
    quickPops.push(pop);
    if (action) {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => { closeQuick(); action(); });
    }
    more.addEventListener('mousedown', (e) => e.preventDefault());
    more.addEventListener('click', () => {
      const wasOpen = !pop.hidden;
      document.querySelectorAll('.ft-pop').forEach((p) => { p.hidden = true; });
      if (wasOpen) return;
      // Tirets : les tirets puis la numérotation des listes numérotées.
      if (kind === 'tirets') {
        const a = el('div');
        const b = el('div', { className: 'ds-quick-more' });
        pop.replaceChildren(a, b);
        renderQuick('tirets', a);
        renderQuick('numeros', b);
      } else renderQuick(kind, pop);
      pop.hidden = false;
      window.FTToolbar.placePop(pop, btn);
    });
  }
  tool('encadres', 'callout-btn', 'callout-more', 'callout-pop', () => S().toggleCallout());
  tool('citations', 'quote-btn', 'quote-more', 'quote-pop', () => S().toggleQuote());
  tool('tirets', 'bullets-btn', 'bullets-more', 'bullets-pop', () => S().toggleBullets());
  tool('plan', 'toc-btn', 'toc-more', 'toc-pop', () => { S().restoreSelection(); window.FTToc.insert(); });
  tool('schemas', 'diagram-btn', 'diagram-more', 'diagram-pop', null);
  tool('code', 'code-btn', 'code-more', 'code-pop', null);
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.ft-dropdown')) closeQuick(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQuick(); });

  const mainBtn = $('docstyles-btn');
  mainBtn.addEventListener('mousedown', (e) => e.preventDefault());
  mainBtn.addEventListener('click', () => {
    // L'onglet du type de l'élément où se trouve le curseur, sinon le dernier ouvert.
    const kind = ORDER.find((k) => targetFromSelection(k)) || state.kind;
    open(kind);
  });

  window.FTStyles = {
    open,
    renderQuick,
    kinds: () => ORDER.map((id) => [id, KINDS[id].label]),
    // Thème du document choisi : tous les éléments prennent ses styles (theme.js).
    applyAll() { run(() => { for (const id of ORDER) KINDS[id].applyAll(T().part(id)); }); },
    // Les titres et les listes gardent leur style actuel, posé sur chacun (thème choisi sans
    // l'appliquer aux éléments existants).
    freeze() { run(() => { KINDS.titres.freeze(); KINDS.tirets.freeze(); KINDS.numeros.freeze(); }); },
    useEngine(mount, bridge) {
      editor = mount;
      run = bridge.edit;
      caretNode = () => {
        const view = window.FTMoteur.view;
        try { return view.domAtPos(view.state.selection.from).node; } catch { return null; }
      };
      // Les réglages de structure.js qui ne touchent qu'un élément donné restent les siens ; ceux qui
      // parcourent la zone d'écriture, ou agissent au curseur, passent par le moteur.
      const base = window.FTStructure;
      const each = (sel, fn) => mount.querySelectorAll(sel).forEach(fn);
      const facade = Object.assign(Object.create(base), {
        checkpoint: bridge.checkpoint,
        changed: bridge.changed,
        selected: bridge.selected,
        placeFrame: bridge.placeFrame,
        restoreSelection: bridge.restoreSelection,
        restyleTables: (look) => each('table.ft-table', (t) => base.setTableLook(t, { ...look, width: base.tableLook(t).width })),
        restyleCallouts: (look) => each('blockquote.ft-callout:not(.ft-quote):not(.ft-bio)', (b) => base.styleCallout(b, look)),
        restyleQuotes: (look) => each('blockquote.ft-quote', (b) => base.styleQuote(b, look)),
        toggleCallout: () => window.FTBlocs.toggleCallout(),
        toggleQuote: () => window.FTBlocs.toggleQuote(),
        toggleBullets: () => window.FTBlocs.toggleList(false)
      });
      S = () => facade;
    }
  };
})();
