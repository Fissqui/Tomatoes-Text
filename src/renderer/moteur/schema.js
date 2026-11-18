// Modèle du document du nouveau moteur : les sortes de blocs et de mises en forme qu'il connaît.
// Chaque élément garde tous ses attributs d'origine (classe, style, data-…) dans « a », pour que le HTML
// enregistré ressorte tel qu'il est entré : les fichiers .tmtx restent lisibles et réenregistrés à l'identique.
// Les blocs que le moteur ne sait pas encore modifier (page de titre, plan, index, formules, notes…) sont
// gardés tels quels, comme des objets fermés (raw_block, raw_inline).
(function () {
  const { Schema, DOMParser: PMParser, DOMSerializer, Fragment } = PM.model;
  const { tableNodes } = PM.tables;

  // Attributs d'un élément, dans leur ordre d'origine.
  // Marques d'affichage posées par le moteur sur les blocs à l'écran (jamais lues ni enregistrées).
  const SCREEN = new Set(['data-pm-far', 'data-pm-sp', 'data-pm-spf', 'data-pm-sb', 'data-pm-sbf', 'data-pm-cs']);
  // HTML d'un objet fermé, sans les marques d'affichage.
  function outer(d) {
    if (![...SCREEN].some((n) => d.hasAttribute(n))) return d.outerHTML;
    const c = d.cloneNode(true);
    for (const n of SCREEN) c.removeAttribute(n);
    return c.outerHTML;
  }
  function bag(dom, skip) {
    const o = {};
    for (const at of dom.attributes) if (!SCREEN.has(at.name) && (!skip || !skip.includes(at.name))) o[at.name] = at.value;
    return o;
  }
  const A = { a: { default: {} } };
  // Marques posées à la lecture par le moteur lui-même (jamais enregistrées).
  const OWN = ['data-pm-bare', 'data-pm-nobr'];

  function fromHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstChild || document.createTextNode('');
  }

  const BLOCK_TAGS = /^(P|DIV|UL|OL|TABLE|BLOCKQUOTE|H[1-6]|HR|FIGURE|PRE)$/;
  const hasBlockChild = (d) => [...d.children].some((c) => BLOCK_TAGS.test(c.tagName) || c.classList.contains('ft-image'));

  // Objets fermés : gardés tels quels (leur HTML complet).
  // Les notes de bas de page et de fin (div.ft-footnotes, div.ft-endnotes) s'écrivent dans le moteur
  // (moteur/notes.js) : blocs ordinaires, une ligne de liste par note.
  const RAW_BLOCK = 'div.ft-cover, div.ft-toc, div.ft-lof, div.ft-index, div.ft-biblio, div.ft-math, div[contenteditable="false"], hr';
  const RAW_INLINE = 'a.ft-doclink, span.ft-xref, sup.ft-fn-ref, span.ft-math, span.ft-date, span.ft-cite, [contenteditable="false"]';
  const RAW_ANY = RAW_BLOCK + ', ' + RAW_INLINE;

  const tables = tableNodes({
    tableGroup: 'block',
    cellContent: 'block+',
    cellAttributes: {
      a: {
        default: {},
        getFromDOM: (d) => bag(d, ['colspan', 'rowspan', 'data-colwidth']),
        setDOMAttr: (v, attrs) => { Object.assign(attrs, v); }
      }
    }
  });
  // Largeurs des colonnes réglées à la souris : <colgroup> gardé (attributs de chaque <col>).
  tables.table = {
    ...tables.table,
    attrs: { a: { default: {} }, cols: { default: null } },
    parseDOM: [{
      tag: 'table',
      getAttrs: (d) => {
        const group = [...d.children].find((c) => c.tagName === 'COLGROUP');
        return { a: bag(d), cols: group ? [...group.children].filter((c) => c.tagName === 'COL').map((c) => bag(c)) : null };
      }
    }],
    toDOM: (n) => (n.attrs.cols
      ? ['table', n.attrs.a, ['colgroup', ...n.attrs.cols.map((c) => ['col', c])], ['tbody', 0]]
      : ['table', n.attrs.a, ['tbody', 0]])
  };
  tables.table_row = {
    ...tables.table_row,
    attrs: A,
    parseDOM: [{ tag: 'tr', getAttrs: (d) => ({ a: bag(d) }) }],
    toDOM: (n) => ['tr', n.attrs.a, 0]
  };

  const leaf = (tag) => (n) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(n.attrs.a)) el.setAttribute(k, v);
    el.innerHTML = n.attrs.inner;
    return el;
  };

  const nodes = {
    // (reglages : repère des réglages du document pour Annuler / Rétablir, app.js ; pas enregistré.)
    doc: { content: 'block+', attrs: { reglages: { default: 0 } } },
    text: { group: 'inline' },

    // Paragraphe (p, ou div qui ne contient que du texte). « bare » : paragraphe ajouté par le moteur
    // autour d'un texte nu (« <li>texte</li> », « <td>texte</td> ») : il disparaît à l'enregistrement.
    // « nobr » : ligne vide enregistrée sans <br> (« <td></td> ») ; elle le reste.
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { tag: { default: 'p' }, a: { default: {} }, bare: { default: true }, nobr: { default: false } },
      parseDOM: [
        { tag: 'p', getAttrs: (d) => ({ tag: 'p', a: bag(d, OWN), bare: d.hasAttribute('data-pm-bare'), nobr: d.hasAttribute('data-pm-nobr') }) },
        { tag: 'div', priority: 45, getAttrs: (d) => (hasBlockChild(d) ? false : { tag: 'div', a: bag(d, OWN), bare: d.hasAttribute('data-pm-bare'), nobr: d.hasAttribute('data-pm-nobr') }) }
      ],
      toDOM: (n) => [n.attrs.tag, n.attrs.bare ? { ...n.attrs.a, 'data-pm-bare': '' } : n.attrs.a, 0]
    },
    heading: {
      group: 'block',
      content: 'inline*',
      defining: true,
      attrs: { level: { default: 2 }, a: { default: {} }, nobr: { default: false } },
      parseDOM: [1, 2, 3, 4, 5, 6].map((l) => ({ tag: 'h' + l, getAttrs: (d) => ({ level: l, a: bag(d, OWN), nobr: d.hasAttribute('data-pm-nobr') }) })),
      toDOM: (n) => ['h' + n.attrs.level, n.attrs.a, 0]
    },
    // Encadrés et citations.
    blockquote: {
      group: 'block',
      content: 'block+',
      defining: true,
      attrs: A,
      parseDOM: [{ tag: 'blockquote', getAttrs: (d) => ({ a: bag(d) }) }],
      toDOM: (n) => ['blockquote', n.attrs.a, 0]
    },
    // div qui contient des blocs (zone en colonnes…).
    container: {
      group: 'block',
      content: 'block+',
      attrs: A,
      parseDOM: [{ tag: 'div', priority: 40, getAttrs: (d) => ({ a: bag(d) }) }],
      toDOM: (n) => ['div', n.attrs.a, 0]
    },
    bullet_list: {
      group: 'block',
      content: 'list_item+',
      attrs: A,
      parseDOM: [{ tag: 'ul', getAttrs: (d) => ({ a: bag(d) }) }],
      toDOM: (n) => ['ul', n.attrs.a, 0]
    },
    ordered_list: {
      group: 'block',
      content: 'list_item+',
      attrs: A,
      parseDOM: [{ tag: 'ol', getAttrs: (d) => ({ a: bag(d) }) }],
      toDOM: (n) => ['ol', n.attrs.a, 0]
    },
    // Une ligne de liste commence par du texte, un titre, ou directement une sous-liste : ligne
    // « porteuse » sans tiret ni texte, quand une ligne est décalée sans ligne au-dessus d'elle
    // (« -- » sur la première ligne : 1. devient 1.1.). Son attribut data-porteur n'est pas gardé : il
    // est remis à l'enregistrement (fixBlocks) et à l'affichage (moteur/blocs.js).
    list_item: {
      content: '(paragraph | heading | bullet_list | ordered_list) block*',
      defining: true,
      attrs: A,
      // Avant les objets fermés : une note de fin tirée d'une citation (li non modifiable) reste une ligne de liste.
      parseDOM: [{ tag: 'li', priority: 61, getAttrs: (d) => ({ a: bag(d, ['data-porteur']) }) }],
      toDOM: (n) => ['li', n.attrs.a, 0]
    },
    // Image posée dans la ligne, comme une lettre (habillage « ligne »), ou à côté du texte à partir
    // d'une ligne de son paragraphe (« gauche », « droite »).
    image_inline: {
      group: 'inline',
      inline: true,
      atom: true,
      draggable: true,
      attrs: { a: { default: {} }, inner: { default: '' } },
      parseDOM: [
        { tag: 'span.ft-image', priority: 75, getAttrs: (d) => (d.getAttribute('data-wrap') === 'ligne' ? { a: bag(d), inner: d.innerHTML } : false) },
        { tag: 'span.ft-image', priority: 74, context: 'paragraph/|heading/', getAttrs: (d) => (/^(gauche|droite)$/.test(d.getAttribute('data-wrap') || '') ? { a: bag(d), inner: d.innerHTML } : false) }
      ],
      toDOM: leaf('span')
    },
    // Image posée entre deux blocs.
    image: {
      group: 'block',
      atom: true,
      draggable: true,
      attrs: { a: { default: {} }, inner: { default: '' } },
      parseDOM: [{ tag: 'span.ft-image', priority: 70, getAttrs: (d) => ({ a: bag(d), inner: d.innerHTML }) }],
      toDOM: leaf('span')
    },
    // Bloc de code (moteur/code.js) : texte seul, retours à la ligne et espaces gardés tels quels.
    // <pre class="ft-code" data-lang="…"><code>…</code></pre> ; un <pre> collé d'une page web en devient un.
    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      attrs: A,
      parseDOM: [{
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (d) => {
          const C = window.FTCode;
          const own = (d.getAttribute('class') || '').split(/\s+/).includes('ft-code');
          return { a: own ? (C ? C.cleanAttrs(bag(d)) : bag(d)) : { class: 'ft-code', 'data-lang': C ? C.langOfEl(d) : 'texte' } };
        },
        getContent: (d, s) => {
          const text = window.FTCode ? window.FTCode.textOf(d) : d.textContent;
          return text ? Fragment.from(s.text(text)) : Fragment.empty;
        }
      }],
      toDOM: (n) => ['pre', n.attrs.a, ['code', 0]]
    },
    raw_block: {
      group: 'block',
      atom: true,
      attrs: { html: { default: '' } },
      parseDOM: [{ tag: RAW_BLOCK, priority: 60, getAttrs: (d) => ({ html: outer(d) }) }],
      toDOM: (n) => fromHtml(n.attrs.html)
    },
    raw_inline: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { html: { default: '' } },
      parseDOM: [{ tag: RAW_INLINE, priority: 60, getAttrs: (d) => ({ html: outer(d) }) }],
      toDOM: (n) => fromHtml(n.attrs.html)
    },
    hard_break: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br']
    },
    ...tables
  };

  const simpleMark = (tags) => ({
    attrs: { tag: { default: tags[0] }, a: { default: {} } },
    parseDOM: tags.map((t) => ({ tag: t, getAttrs: (d) => ({ tag: t, a: bag(d) }) })),
    toDOM: (m) => [m.attrs.tag, m.attrs.a, 0]
  });

  const marks = {
    link: { ...simpleMark(['a']), inclusive: false },
    strong: simpleMark(['b', 'strong']),
    em: simpleMark(['i', 'em']),
    underline: simpleMark(['u']),
    strike: simpleMark(['s', 'strike', 'del']),
    sup: simpleMark(['sup']),
    sub: simpleMark(['sub']),
    // Tout le reste (span avec style, commentaire, surlignage, petites capitales…), imbriquable.
    inl: { ...simpleMark(['span', 'mark', 'small', 'code', 'kbd', 'abbr', 'q', 'cite', 'font', 'ins']), excludes: '' }
  };

  const schema = new Schema({ nodes, marks });
  const parser = PMParser.fromSchema(schema);
  const serializer = DOMSerializer.fromSchema(schema);

  // ----- Lecture du HTML -----

  // Contenu venu d'un fichier : ni script, ni attribut on…, ni adresse javascript:.
  function sanitize(root) {
    root.querySelectorAll('script, iframe, object, embed, link, meta, style, base, form').forEach((n) => n.remove());
    root.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    });
  }

  const BETWEEN = /^(DIV|UL|OL|TABLE|TBODY|THEAD|TFOOT|TR|BLOCKQUOTE)$/;
  const isBlockEl = (x) => x && x.nodeType === 1 && (BLOCK_TAGS.test(x.tagName) || /^(LI|TR|TD|TH|TBODY|THEAD)$/.test(x.tagName));
  const meaningful = (n) => n && !(n.nodeType === 3 && n.data === '') && n.nodeType !== 8;
  const nextOf = (n) => { let x = n.nextSibling; while (x && !meaningful(x)) x = x.nextSibling; return x; };
  const prevOf = (n) => { let x = n.previousSibling; while (x && !meaningful(x)) x = x.previousSibling; return x; };

  // Dernier <br> d'un bloc : il ne fait que rendre visible une ligne vide (règle des navigateurs). Le
  // moteur dessine lui-même ces lignes : ce <br> est retiré à la lecture et remis à l'enregistrement.
  function isTrailingBreak(br) {
    let n = br;
    while (n.parentNode && !isBlockEl(n.parentNode) && n.parentNode.nodeName !== 'BODY' && n.parentNode.nodeType === 1) {
      if (nextOf(n)) return false;
      n = n.parentNode;
    }
    // (Un <br> suivi d'une sous-liste dans une ligne de liste — « <li>texte<br><ul>… » — finit aussi sa
    // ligne : gardé, il en ajoutait une à chaque enregistrement.)
    const next = nextOf(n);
    return !next || isBlockEl(next);
  }

  // Prépare un HTML pour le moteur, dans un document à part (rien ne s'affiche ni ne se charge).
  function prepare(html, { clean = true } = {}) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const box = doc.body;
    if (clean) sanitize(box);
    // Les espaces sont gardés tels quels (deux espaces de suite restent deux espaces), sauf les retours
    // à la ligne de mise en forme entre deux blocs, qui ne sont pas du texte.
    const walker = doc.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const drop = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/^[ \t\r\n]*$/.test(n.data)) continue;
      const parent = n.parentNode;
      if (parent === box || BETWEEN.test(parent.nodeName) || isBlockEl(n.previousSibling) || isBlockEl(n.nextSibling)) drop.push(n);
    }
    for (const n of drop) n.remove();
    // Ligne de liste ou case qui ne contient qu'une espace : elle la garde (lue seule, l'espace disparaissait).
    for (const el of box.querySelectorAll('li, td, th')) {
      if (el.childNodes.length !== 1 || el.firstChild.nodeType !== 3 || !/^[ \u00a0\u2003\u202f]+$/.test(el.firstChild.data) || el.closest(RAW_ANY)) continue;
      const p = doc.createElement('p');
      p.setAttribute('data-pm-bare', '');
      p.append(el.firstChild);
      el.append(p);
    }
    // Ligne vide écrite sans <br> : elle sera réenregistrée sans <br>.
    for (const el of box.querySelectorAll('p:empty, h1:empty, h2:empty, h3:empty, h4:empty, h5:empty, h6:empty, li:empty, td:empty, th:empty')) {
      if (el.closest(RAW_ANY) || el.hasAttribute('data-pm-nobr')) continue;
      if (/^(LI|TD|TH)$/.test(el.tagName)) {
        const p = doc.createElement('p');
        p.setAttribute('data-pm-bare', '');
        p.setAttribute('data-pm-nobr', '');
        el.append(p);
      } else {
        el.setAttribute('data-pm-nobr', '');
      }
    }
    for (const br of [...box.getElementsByTagName('br')]) {
      if (br.parentNode === box || br.parentElement.closest(RAW_ANY)) continue;
      // Ligne vide d'une ligne de liste ou d'une case suivie d'une sous-liste (« <li><br><ul>… ») : un
      // paragraphe vide, comme à l'écran (lu comme saut de ligne, il en ajoutait un à chaque enregistrement).
      if (/^(LI|TD|TH)$/.test(br.parentNode.nodeName) && isBlockEl(nextOf(br)) && !prevOf(br)) {
        const p = doc.createElement('p');
        p.setAttribute('data-pm-bare', '');
        br.replaceWith(p);
        continue;
      }
      if (isTrailingBreak(br)) br.remove();
    }
    return box;
  }

  function parse(html) {
    return parser.parse(prepare(html), { preserveWhitespace: true });
  }

  // ----- Écriture du HTML -----

  // Une ligne vide, ou finie par un retour à la ligne, retrouve le <br> qui la rend visible.
  function needsBreak(n) {
    if (!n.isTextblock || n.attrs.nobr || n.type.spec.code) return false;
    return n.childCount === 0 || n.lastChild.type === schema.nodes.hard_break;
  }

  function fixBlocks(root) {
    for (const li of root.querySelectorAll('li')) {
      if (li.firstElementChild && /^(UL|OL)$/.test(li.firstElementChild.tagName) && li.firstChild === li.firstElementChild) li.setAttribute('data-porteur', '');
    }
    // Le paragraphe ajouté autour d'un texte nu (ligne de liste, case de tableau) redevient texte nu,
    // sauf si un autre paragraphe le suit (case ou ligne coupée en deux par Entrée).
    for (const p of root.querySelectorAll('[data-pm-bare]')) {
      const host = p.parentElement;
      const next = p.nextElementSibling;
      if (host && /^(LI|TD|TH)$/.test(host.tagName) && host.firstChild === p && !(next && next.tagName === 'P')) p.replaceWith(...p.childNodes);
      else p.removeAttribute('data-pm-bare');
    }
  }

  function serializeNodes(fragment) {
    const box = document.createElement('div');
    box.append(serializer.serializeFragment(fragment, { document }));
    return box;
  }

  // Ajoute les <br> des lignes vides : on parcourt le modèle et le HTML produit ensemble.
  function addBreaks(node, dom) {
    if (node.isTextblock) {
      if (needsBreak(node)) dom.appendChild(document.createElement('br'));
      return;
    }
    if (node.isLeaf) return;
    // Le HTML d'un nœud : ses enfants sont dans l'élément « contenu » (tbody pour un tableau).
    const holder = node.type.name === 'table' ? dom.querySelector(':scope > tbody') || dom : dom;
    let i = 0;
    for (const el of holder.children) {
      if (i >= node.childCount) break;
      addBreaks(node.child(i), el);
      i++;
    }
  }

  // HTML d'un bloc de premier niveau. Les blocs ne changent pas (le moteur en crée de nouveaux à chaque
  // modification) : leur HTML est gardé, et seul celui des blocs modifiés est refait à l'enregistrement.
  const cache = new WeakMap();
  function blockHtml(node) {
    let html = cache.get(node);
    if (html !== undefined) return html;
    const box = serializeNodes(Fragment.from(node));
    if (box.firstChild) addBreaks(node, box.firstChild);
    fixBlocks(box);
    html = box.innerHTML;
    cache.set(node, html);
    return html;
  }

  function serialize(doc) {
    const parts = [];
    doc.forEach((n) => parts.push(blockHtml(n)));
    return parts.join('');
  }

  // Prépare le HTML des blocs pendant les temps morts, par petits morceaux : le premier enregistrement
  // d'un long document n'a plus à tout produire d'un coup.
  let warmJob = 0;
  function warm(doc) {
    const job = ++warmJob;
    let i = 0;
    const step = (deadline) => {
      if (job !== warmJob) return;
      while (i < doc.childCount && deadline.timeRemaining() > 2) blockHtml(doc.child(i++));
      if (i < doc.childCount) requestIdleCallback(step, { timeout: 2000 });
    };
    requestIdleCallback(step, { timeout: 2000 });
  }

  // HTML d'un morceau de document (copier).
  function serializeFragment(fragment) {
    const parts = [];
    fragment.forEach((n) => parts.push(n.isBlock ? blockHtml(n) : null));
    if (parts.every((p) => p !== null)) return parts.join('');
    const box = serializeNodes(fragment);
    fixBlocks(box);
    return box.innerHTML;
  }

  // Forme canonique d'un HTML (attributs triés, style normalisé) pour comparer l'entrée et la sortie.
  function canonical(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    const out = [];
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { out.push(c.data); continue; }
        if (c.nodeType !== 1) continue;
        const attrs = [...c.attributes].map((at) => at.name + '="' + (at.name === 'style' ? c.style.cssText : at.value) + '"').sort();
        out.push('<' + c.tagName.toLowerCase() + (attrs.length ? ' ' + attrs.join(' ') : '') + '>');
        walk(c);
        out.push('</' + c.tagName.toLowerCase() + '>');
      }
    })(box);
    return out.join('');
  }

  // Compare le HTML d'origine et celui que le moteur réenregistre.
  function roundTrip(html) {
    const a = canonical(html);
    const b = canonical(serialize(parse(html)));
    if (a === b) return { same: true, size: a.length };
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return { same: false, size: a.length, at: i, before: a.slice(Math.max(0, i - 120), i + 160), after: b.slice(Math.max(0, i - 120), i + 160) };
  }

  window.FTSchema = { schema, parser, parse, prepare, serialize, serializeFragment, warm, canonical, roundTrip, bag, outer, RAW_BLOCK, RAW_INLINE };
})();
