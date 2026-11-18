// Aides à la frappe dans le nouveau moteur : guillemets (« » ou “ ”), point médian (touche * du pavé
// numérique), majuscule automatique en début de phrase, caractères spéciaux, date et formules insérés au
// curseur.
// Les réglages restent ceux des versions 1.x (insert.js, layout.js) ; seule l'écriture passe par le moteur.
(function () {
  const M = window.FTMoteur;
  const { view, schema } = M;
  const { Plugin, TextSelection } = PM.state;
  const OBJ = '￼';
  const I = () => window.FTInsert;
  const L = () => window.FTLayout;

  // Bloc de texte du curseur (paragraphe, titre, ligne de liste, case de tableau…).
  function blockBefore(state, pos) {
    const $p = state.doc.resolve(pos);
    if (!$p.parent.isTextblock) return null;
    return { node: $p.parent, start: $p.start(), text: $p.parent.textBetween(0, $p.parentOffset, '', OBJ) };
  }

  // Outil (caractère, date) : une étape d'annulation à part.
  function insert(tr) {
    view.dispatch(PM.history.closeHistory(tr).scrollIntoView());
    M.closeHistory();
    view.focus();
  }

  // Texte à la place de la sélection.
  function insertText(text) {
    const { from, to } = view.state.selection;
    insert(view.state.tr.insertText(text, from, to));
  }

  // Élément dans la ligne (html, ou texte simple si html est null) ; collé au mot d'avant, il reçoit une
  // espace (sauf si spaced est false).
  function insertInline(html, text, spaced = true) {
    const state = view.state;
    const { from, to } = state.selection;
    const b = blockBefore(state, from);
    const space = spaced && b && /\S$/.test(b.text) && !/[(«“'’ ]$/.test(b.text) ? ' ' : '';
    const tr = state.tr;
    if (html === null) {
      tr.insertText(space + text, from, to);
    } else {
      const content = window.FTSchema.parse('<p>' + html + '</p>').firstChild.content;
      tr.replaceWith(from, to, content);
      if (space) tr.insertText(space, from);
      tr.setSelection(TextSelection.create(tr.doc, from + space.length + content.size));
    }
    insert(tr);
    return true;
  }

  // ----- Guillemets -----

  let afterOpening = -1; // juste après « : l'espace tapée est déjà là (insécable)
  const count = (text, ch) => text.split(ch).length - 1;

  function quote(v, from, to) {
    const b = blockBefore(v.state, from);
    const text = b ? b.text : '';
    const prev = text.slice(-1);
    const english = I().quotes() === 'anglais';
    const [open, close] = english ? ['“', '”'] : ['«', '»'];
    // Un guillemet resté ouvert dans le paragraphe se ferme, même après une espace.
    const unclosed = count(text, open) > count(text, close);
    const opening = !unclosed && (!prev || /[\s  (\[{—–'’\-/]/.test(prev));
    const tr = v.state.tr;
    if (opening) {
      const s = english ? '“' : '« ';
      tr.insertText(s, from, to);
      v.dispatch(tr.scrollIntoView());
      afterOpening = english ? -1 : tr.selection.from;
      return true;
    }
    let start = from;
    if (prev === ' ' && from === to) start = from - 1;
    const s = english ? '”' : (prev === ' ' && from === to ? '»' : ' »');
    v.dispatch(tr.insertText(s, start, to).scrollIntoView());
    return true;
  }

  // ----- Typographie automatique (bouton ’–… de la barre, insert.js) -----
  // ' devient ’ (‘ en ouverture avec les guillemets “ ”), -- devient –, puis un troisième - donne —,
  // ... devient …. Le texte tapé s'écrit d'abord : Ctrl+Z revient aux caractères du clavier.
  // Rien dans le code (blocs de code, code dans la ligne).

  let lastDash = -1; // juste après un – venu de « -- » : un - de plus en fait un —

  function inCodeAt(state, pos) {
    const $p = state.doc.resolve(pos);
    return !!$p.parent.type.spec.code || $p.marks().some((m) => m.type === schema.marks.inl && /^(code|kbd)$/.test(m.attrs.tag));
  }

  function typography(v, from, to, text) {
    const dash = lastDash;
    lastDash = -1;
    if (!I() || !I().typo() || !/^['.\-]$/.test(text) || inCodeAt(v.state, from)) return false;
    const b = blockBefore(v.state, from);
    if (!b) return false;
    if (text === "'") {
      const prev = from === to ? b.text.slice(-1) : '';
      const open = I().quotes() === 'anglais' && (!prev || /[\s\u00a0\u202f(\[{“«—–\-\/]/.test(prev));
      v.dispatch(v.state.tr.insertText(open ? '‘' : '’', from, to).scrollIntoView());
      return true;
    }
    if (from !== to) return false;
    let size = 0;
    let by = '';
    if (text === '-' && dash === from && b.text.endsWith('–')) { size = 1; by = '—'; }
    else if (text === '-' && /(^|[^\s\u00a0\-–—]\s?)-$/.test(b.text)) { size = 1; by = '–'; }
    else if (text === '.' && /(^|[^.])\.\.$/.test(b.text)) { size = 2; by = '…'; }
    if (!by) return false;
    // (« -- » au début d'une ligne de liste la décale : moteur/blocs.js.)
    if (b.text === '-') {
      const $p = v.state.doc.resolve(from);
      if ($p.depth > 1 && $p.node(-1).type === schema.nodes.list_item && $p.index(-1) === 0) return false;
    }
    v.dispatch(v.state.tr.insertText(text, from).scrollIntoView());
    M.closeHistory();
    const tr = v.state.tr.insertText(by, from - size, from + 1);
    v.dispatch(PM.history.closeHistory(tr).scrollIntoView());
    M.closeHistory();
    if (by === '–') lastDash = tr.selection.from;
    return true;
  }

  // ----- Majuscule automatique -----

  let lastCap = null; // { start, letter } : lettre mise en majuscule au début d'un bloc

  function capital(v, from, to, text) {
    if (from !== to || [...text].length !== 1) return false;
    const up = text.toLocaleUpperCase('fr-FR');
    if (up === text || [...up].length !== 1) return false;
    const b = blockBefore(v.state, from);
    if (!b || !L().startsSentence(b.text)) return false;
    v.dispatch(v.state.tr.insertText(up, from, to).scrollIntoView());
    lastCap = b.text.trim() === '' ? { start: b.start, letter: up } : null;
    return true;
  }

  // ----- Ordinaux (19ᵉ), adresses tapées, « ((texte)) » (ordinals.js, links.js) -----
  // Le caractère tapé s'écrit d'abord, puis la mise en forme, à part : Ctrl+Z revient au texte tapé.

  const Od = () => window.FTOrdinals;
  const Lk = () => window.FTLinks;
  const BOUNDARY = /^[\s\u00a0\u202f.,;:!?)\]}»”'’…\-–—/]$/;
  const mk = schema.marks;
  // Pas dans un lien, un exposant, un indice ou du code.
  const plainMarks = (marks) => !marks.some((m) => m.type === mk.link || m.type === mk.sup || m.type === mk.sub
    || (m.type === mk.inl && /^(code|kbd)$/.test(m.attrs.tag)));
  function langOf(v, pos) {
    const Lg = window.FTLang;
    if (!Lg) return 'fr';
    let node = null;
    try { node = v.domAtPos(pos).node; } catch { /* position hors affichage */ }
    return (node && Lg.fixedLang(node)) || Lg.principal();
  }
  function autoFormat(v, from, typed) {
    const state = v.state;
    const $p = state.doc.resolve(from);
    const b = blockBefore(state, from);
    if (!b || !plainMarks($p.marks())) return false;
    const text = b.text + typed;
    let make = null;
    if (typed === ')' && Lk() && text.endsWith('))')) {
      const start = text.lastIndexOf('((', text.length - 3);
      const inner = start < 0 ? '' : text.slice(start + 2, -2);
      if (inner.trim() && inner.length <= 150 && !/\(\(|\)\)|\n|￼/.test(inner)) {
        make = (tr) => {
          const node = window.FTSchema.parse('<p>' + Lk().docLinkHtml(inner.trim()) + '</p>').firstChild.content;
          const a = b.start + start;
          tr.replaceWith(a, from + typed.length, node);
          tr.setSelection(TextSelection.create(tr.doc, a + node.size));
        };
      }
    }
    const O = Od();
    if (!make && (typed === '' || BOUNDARY.test(typed)) && O && O.options().auto) {
      const found = O.parse(b.text, langOf(v, from));
      if (found) {
        make = (tr) => {
          const marks = $p.marks();
          const a = b.start + found.start;
          const sup = mk.sup.create({ tag: 'sup', a: { class: 'ft-ord' } });
          tr.replaceWith(a, from, [schema.text(found.number, marks), schema.text(found.sup, sup.addToSet(marks))]);
        };
      }
    }
    const url = !make && Lk() && (typed === '' || /\s/.test(typed)) ? Lk().urlBefore(b.text) : null;
    if (url) {
      make = (tr) => {
        const a = b.start + url.index;
        const end = a + url.word.length;
        if (url.text !== url.word) tr.insertText(url.text, a, end);
        tr.addMark(a, end, mk.link.create({ tag: 'a', a: { href: url.href, title: url.title } }));
      };
    }
    if (!make) return false;
    if (typed) v.dispatch(state.tr.insertText(typed, from).scrollIntoView());
    const tr = v.state.tr;
    make(tr);
    v.dispatch(PM.history.closeHistory(tr).scrollIntoView());
    M.closeHistory();
    return true;
  }

  M.addPlugin(new Plugin({
    props: {
      handleTextInput(v, from, to, text) {
        const swallow = afterOpening === from && from === to && text === ' ';
        afterOpening = -1;
        if (swallow) return true;
        if (text === '"') return quote(v, from, to);
        if (typography(v, from, to, text)) return true;
        // Typographie française : l'espace tapée avant ; : ! ? devient insécable (fine pour ; ! ?), pour que
        // le signe ne parte jamais seul au début de la ligne suivante (comme la correction automatique de Word).
        if (/^[;:!?]$/.test(text) && from === to) {
          const b = blockBefore(v.state, from);
          if (b && b.text.endsWith(' ') && /\S/.test(b.text.slice(-2, -1)) && langOf(v, from) === 'fr') {
            v.dispatch(v.state.tr.insertText((text === ':' ? ' ' : ' ') + text, from - 1, from).scrollIntoView());
            return true;
          }
        }
        // « i. » ou « a. » tapés en minuscule restent une numérotation en minuscules (moteur/blocs.js).
        if (text === ' ' && lastCap && from === to) {
          const b = blockBefore(v.state, from);
          const lower = b && b.start === lastCap.start && b.text === lastCap.letter + '.' && /^[IA]$/.test(lastCap.letter);
          const letter = lastCap.letter;
          lastCap = null;
          if (lower) {
            v.dispatch(v.state.tr.insertText(letter.toLowerCase(), b.start, b.start + 1));
            return false;
          }
        }
        if (from === to && [...text].length === 1 && autoFormat(v, from, text)) return true;
        if (L() && L().capitalizeOn()) return capital(v, from, to, text);
        return false;
      },
      handleKeyDown(v, e) {
        // Entrée : l'ordinal ou l'adresse de fin de ligne est posé avant la coupure.
        if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey && v.state.selection.empty) {
          autoFormat(v, v.state.selection.from, '');
          return false;
        }
        if (e.code !== 'NumpadMultiply' || e.ctrlKey || e.altKey || e.metaKey || !I() || !I().median()) return false;
        const { from, to } = v.state.selection;
        v.dispatch(v.state.tr.insertText('·', from, to).scrollIntoView());
        return true;
      }
    }
  }), true);

  // Légende d'image (écrite directement dans l'affichage, voir objets.js) : majuscule comme dans le texte.
  view.dom.addEventListener('beforeinput', (e) => {
    if (!L() || !L().capitalizeOn() || e.inputType !== 'insertText' || !e.data || [...e.data].length !== 1 || e.isComposing) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    const cap = el && el.closest('.ft-caption');
    if (!cap || !view.dom.contains(cap)) return;
    const up = e.data.toLocaleUpperCase('fr-FR');
    if (up === e.data || [...up].length !== 1) return;
    const before = document.createRange();
    before.setStart(cap, 0);
    before.setEnd(sel.anchorNode, sel.anchorOffset);
    if (!L().startsSentence(before.toString())) return;
    e.preventDefault();
    document.execCommand('insertText', false, up);
  });

  // ----- Formules (insert.js) -----

  const O = () => window.FTObjets;
  const nodeOf = (el) => window.FTSchema.parse(el.tagName === 'DIV' ? el.outerHTML : '<p>' + el.outerHTML + '</p>').firstChild;
  const math = {
    // Endroit où la formule sera placée (la fenêtre prend le clavier entre-temps).
    mark: () => ({ from: view.state.selection.from, to: view.state.selection.to }),
    insert(el, at) {
      const size = view.state.doc.content.size;
      const from = at ? Math.min(at.from, size) : view.state.selection.from;
      const to = at ? Math.min(at.to, size) : view.state.selection.to;
      if (el.tagName === 'DIV') {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
        return O().insertBlockObject(el);
      }
      const content = nodeOf(el).content;
      const tr = view.state.tr.replaceWith(from, to, content);
      tr.setSelection(TextSelection.create(tr.doc, from + content.size));
      insert(tr);
    },
    replace(old, el) {
      const pos = O().posOf(old);
      if (pos === null) return;
      const tr = view.state.tr;
      const was = tr.doc.nodeAt(pos);
      const block = el.tagName === 'DIV';
      const fresh = nodeOf(el);
      if (was.isInline === !block) {
        const repl = block ? fresh : fresh.content;
        tr.replaceWith(pos, pos + was.nodeSize, repl);
      } else if (block) {
        // De la ligne vers un bloc centré : après le paragraphe qui la contenait.
        const after = tr.doc.resolve(pos).after(1);
        tr.delete(pos, pos + was.nodeSize);
        const at = tr.mapping.map(after);
        tr.insert(at, fresh);
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + fresh.nodeSize, tr.doc.content.size))));
      } else {
        tr.replaceWith(pos, pos + was.nodeSize, fresh);
        tr.setSelection(TextSelection.create(tr.doc, pos + 1 + fresh.content.size));
      }
      insert(tr);
    },
    remove(el) {
      const pos = O().posOf(el);
      if (pos === null) return;
      insert(view.state.tr.delete(pos, pos + view.state.doc.nodeAt(pos).nodeSize));
    }
  };

  window.FTEcriture = {
    insertText,
    insertInline,
    // Moteur 2.0 : les boutons des versions 1.x écrivent par le moteur.
    start() {
      if (I()) {
        I().useText(insertText);
        I().useEngine(view.dom, O(), math);
      }
      if (window.FTCite) window.FTCite.useInline(insertInline);
    }
  };
})();
