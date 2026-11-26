// Notes de bas de page, notes de fin, citations et bibliographies dans le nouveau moteur.
// Les appels de note (sup.ft-fn-ref, sup.ft-en-ref) et les citations (span.ft-cite) sont des objets fermés
// du texte ; le texte des notes s'écrit dans div.ft-endnotes puis div.ft-footnotes, tout à la fin du
// document (une ligne de liste par note, comme dans les versions 1.x). La bibliographie (2.4.3) est du texte
// ordinaire : un titre puis un paragraphe par référence (voir « Bibliographie » plus bas).
// Une modification qui touche un appel de note ou une citation remet numéros, notes et bibliographies
// d'accord dans la même étape d'annulation ; la frappe ordinaire ne coûte qu'un coup d'œil à ce qu'elle change.
(function () {
  const M = window.FTMoteur;
  const { view, schema } = M;
  const { Plugin, PluginKey, TextSelection, NodeSelection, Selection } = PM.state;
  const { Fragment } = PM.model;
  const N = schema.nodes;
  const C = () => window.FTCite;
  const KEY = new PluginKey('ft-notes');

  const newId = (p) => p + Math.random().toString(36).slice(2, 9);
  const hasClass = (a, c) => !!(a && a.class) && (' ' + a.class + ' ').includes(' ' + c + ' ');
  function fromHtml(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.firstElementChild;
  }

  // ----- Ce que contient le texte -----

  // Objet fermé dans la ligne : appel de note de bas de page (fn), de fin (en), citation (cite), date (date).
  const infos = new WeakMap();
  const INLINE = /^<(sup|span)\b[^>]*\bclass="[^"]*\bft-(fn-ref|en-ref|cite|date)\b/;
  function info(node) {
    let i = infos.get(node);
    if (i !== undefined) return i;
    i = null;
    const m = INLINE.exec(node.attrs.html);
    if (m) {
      const el = fromHtml(node.attrs.html);
      const kind = { 'fn-ref': 'fn', 'en-ref': 'en', cite: 'cite', date: 'date' }[m[2]];
      if (el && el.classList.contains('ft-' + m[2]) && (kind !== 'cite' || el.hasAttribute('data-src')) && (kind !== 'date' || el.hasAttribute('data-fmt'))) i = { kind, el };
    }
    infos.set(node, i);
    return i;
  }

  // Équation sur sa propre ligne avec un appel de note (sup.ft-fn-ref ou ft-en-ref après la formule) :
  // { kind, el (l'appel), host (l'équation) }.
  const blocks = new WeakMap();
  const BLOCK_REF = /^<div\b[^>]*\bclass="[^"]*\bft-math\b[^>]*>[\s\S]*<sup\b[^>]*\bclass="[^"]*\bft-(?:fn|en)-ref\b/;
  function blockInfo(node) {
    if (node.type !== N.raw_block) return null;
    let i = blocks.get(node);
    if (i !== undefined) return i;
    i = null;
    if (BLOCK_REF.test(node.attrs.html)) {
      const host = fromHtml(node.attrs.html);
      const el = host && host.querySelector(':scope > sup.ft-fn-ref, :scope > sup.ft-en-ref');
      if (el) i = { kind: el.classList.contains('ft-fn-ref') ? 'fn' : 'en', el, host };
    }
    blocks.set(node, i);
    return i;
  }

  // Bloc du haut : notes de bas de page (foot), notes de fin (end) ; bibliographie (bib), où qu'elle soit.
  function boxKind(n) {
    if (n.type === N.container) return hasClass(n.attrs.a, 'ft-footnotes') ? 'foot' : hasClass(n.attrs.a, 'ft-endnotes') ? 'end' : null;
    if (n.type === N.raw_block && /^<div\b[^>]*\bclass="[^"]*\bft-biblio\b/.test(n.attrs.html)) return 'bib';
    return null;
  }

  // Tout le document, dans l'ordre du texte.
  function scan(doc) {
    const s = { fn: [], en: [], cites: [], dates: [], foots: [], ends: [], bibs: [] };
    const inline = (block, start, where) => {
      block.forEach((ch, off) => {
        if (ch.type !== N.raw_inline) return;
        const i = info(ch);
        if (!i) return;
        const r = { node: ch, pos: start + off, ...i };
        if (i.kind === 'date') s.dates.push(r);
        else if (where === 'end') return; // dans les notes de fin : laissé tel quel (comme dans les versions 1.x)
        else if (i.kind === 'cite') { s.cites.push(r); if (where !== 'foot') s.en.push(r); }
        else if (!where) s[i.kind].push(r);
      });
    };
    const block = (node, pos, where) => {
      const i = blockInfo(node);
      if (i && !where) s[i.kind].push({ node, pos, ...i });
    };
    const walk = (node, pos, where) => {
      if (node.isTextblock) return inline(node, pos + 1, where);
      node.descendants((n, p) => {
        if (n.isTextblock) { inline(n, pos + 1 + p + 1, where); return false; }
        if (n.type === N.raw_block) block(n, pos + 1 + p, where);
        if (n.type === N.raw_block && boxKind(n) === 'bib') s.bibs.push({ node: n, pos: pos + 1 + p });
        return !n.isAtom;
      });
    };
    doc.forEach((top, pos) => {
      const k = boxKind(top);
      if (k === 'bib') s.bibs.push({ node: top, pos });
      else if (k === 'foot') { s.foots.push({ node: top, pos }); walk(top, pos, 'foot'); }
      else if (k === 'end') { s.ends.push({ node: top, pos }); walk(top, pos, 'end'); }
      else if (!top.isAtom) walk(top, pos, null);
      else if (top.type === N.raw_block) block(top, pos, null);
    });
    return s;
  }

  // ----- Bibliographie -----
  // Un titre (h1-h6.ft-bib-title ; data-bib="tout" : toutes les sources du projet) suivi d'un paragraphe
  // p.ft-bib par référence : du texte ordinaire, modifiable et déplaçable, que la mise en page coupe entre
  // les pages comme tout paragraphe. Sur chaque référence : data-src (la source), data-h (empreinte du texte
  // écrit par le logiciel : une référence retouchée à la main n'est plus jamais réécrite), data-n (numéro en
  // style numérique, affiché devant). Sur le titre : data-ids, les sources de la dernière mise à jour (une
  // référence effacée à la main ne revient pas tant que sa source reste citée). Les paragraphes p.ft-bib sans
  // source (ajoutés à la main) restent où ils sont. L'ancien bloc fermé (div.ft-biblio) est converti.
  const BIB_TITLES = new Set(['bibliographie', 'références', 'ouvrages cités', 'bibliography', 'references', 'works cited']);
  const isBibHead = (n) => !!n && n.type === N.heading && hasClass(n.attrs.a, 'ft-bib-title');
  const isBibEntry = (n) => !!n && n.type === N.paragraph && hasClass(n.attrs.a, 'ft-bib');
  function hashOf(node) {
    const t = node.content.toString();
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  const edited = (e) => e.attrs.a['data-h'] !== hashOf(e);
  const parseLine = (html) => window.FTSchema.parse('<p>' + html + '</p>').firstChild.content;
  function bibEntry(it, numbered, base) {
    const content = parseLine(it.html);
    const a = { ...(base ? base.attrs.a : {}), class: (base && base.attrs.a.class) || 'ft-bib', 'data-src': it.id };
    a['data-h'] = hashOf(N.paragraph.create(null, content));
    if (numbered) a['data-n'] = String(it.n); else delete a['data-n'];
    return N.paragraph.create({ tag: 'p', a, bare: false }, content);
  }
  function withNum(e, n) {
    const want = n ? String(n) : undefined;
    if (e.attrs.a['data-n'] === want) return e;
    const a = { ...e.attrs.a };
    if (want) a['data-n'] = want; else delete a['data-n'];
    return N.paragraph.create({ ...e.attrs, a }, e.content, e.marks);
  }
  // Ordre de première citation (style numérique, bibliographie des sources citées).
  function citeOrder(s) {
    const order = [];
    for (const c of s.cites) for (const id of c.el.getAttribute('data-src').split(',')) if (!order.includes(id)) order.push(id);
    return order;
  }
  // Niveau du titre : celui des grands titres du document (pas le titre du document seul en tête), sinon 2.
  function bibLevel(doc) {
    let min = 7;
    let count = 0;
    let firstPos = -1;
    doc.descendants((n, pos) => {
      if (n.type === N.heading && !isBibHead(n) && !hasClass(n.attrs.a, 'ft-title')) {
        if (n.attrs.level < min) { min = n.attrs.level; count = 1; firstPos = pos; } else if (n.attrs.level === min) count++;
      }
      return !n.isTextblock && !n.isAtom;
    });
    if (min === 7) return 2;
    return count === 1 && firstPos === 0 ? Math.min(6, min + 1) : min;
  }
  function bibHead(level, title, all, a0) {
    const a = { ...(a0 || {}), class: ((a0 && a0.class ? a0.class + ' ' : '') + 'ft-bib-title').trim(), 'data-nonum': 'oui' };
    if (all) a['data-bib'] = 'tout'; else delete a['data-bib'];
    return N.heading.create({ level, a }, title ? schema.text(title) : null);
  }
  function bibHeads(doc) {
    const out = [];
    doc.descendants((n, pos) => {
      if (isBibHead(n)) out.push(pos);
      return !n.isTextblock && !n.isAtom;
    });
    return out;
  }
  // Remet à jour la bibliographie dont le titre est à headPos (full : refaite entièrement depuis les sources,
  // retouches comprises).
  function bibFix(tr, headPos, order, full) {
    const $h = tr.doc.resolve(headPos);
    const parent = $h.parent;
    const index = $h.index();
    const head = parent.child(index);
    const b = C().biblioList(head.attrs.a['data-bib'] === 'tout', order);
    const run = [];
    for (let i = index + 1; i < parent.childCount && isBibEntry(parent.child(i)); i++) run.push(parent.child(i));
    const known = full ? new Set() : new Set((head.attrs.a['data-ids'] || '').split(',').filter(Boolean));
    const wanted = new Set(b.items.map((it) => it.id));
    const byId = new Map();
    const extras = new Map(); // source de la référence d'avant ('' : en tête) → paragraphes gardés tels quels
    let anchor = '';
    for (const e of run) {
      const id = e.attrs.a['data-src'];
      if (id && wanted.has(id) && !byId.has(id)) { byId.set(id, e); anchor = id; continue; }
      // Gardés : paragraphes ajoutés à la main ; références retouchées dont la source n'est plus citée.
      if (full ? !!id : id && !edited(e)) continue;
      if (!extras.has(anchor)) extras.set(anchor, []);
      extras.get(anchor).push(e);
    }
    const out = [...(extras.get('') || [])];
    for (const it of b.items) {
      const e = byId.get(it.id);
      if (!e && known.has(it.id)) continue; // effacée à la main
      out.push(e && !full && edited(e) ? withNum(e, b.numbered ? it.n : 0) : bibEntry(it, b.numbered, e), ...(extras.get(it.id) || []));
    }
    const cur = N.container.create(null, Fragment.from(run));
    const want = N.container.create(null, Fragment.from(out));
    replaceDiff(tr, headPos + head.nodeSize - 1, cur, want);
    // Titre : celui de la norme, s'il n'a pas été changé à la main ; sources de cette mise à jour.
    const ids = [...wanted].sort().join(',');
    if ((head.attrs.a['data-ids'] || '') !== ids) {
      const a = { ...head.attrs.a };
      if (ids) a['data-ids'] = ids; else delete a['data-ids'];
      tr.setNodeMarkup(headPos, null, { ...head.attrs, a });
    }
    const text = head.textContent.trim();
    if (BIB_TITLES.has(text.toLowerCase()) && text !== b.title) tr.replaceWith(headPos + 1, headPos + head.nodeSize - 1, schema.text(b.title));
  }
  // Ancien bloc fermé (versions 2.4.2 et d'avant) : titre et paragraphes ; sans les sources du projet, ses
  // références sont gardées telles quelles (paragraphes ajoutés à la main).
  function bibConvert(tr, pos, node, order) {
    const el = fromHtml(node.attrs.html);
    const all = el.getAttribute('data-scope') === 'tout';
    const b = C().biblioList(all, order);
    const t = el.querySelector('.ft-biblio-title');
    const title = (t && t.textContent.trim()) || b.title;
    const kids = [bibHead(bibLevel(tr.doc), title, all)];
    if (!b.items.length) {
      for (const li of el.querySelectorAll('li:not(.empty)')) {
        const a = { class: 'ft-bib' };
        if (li.parentElement.tagName === 'OL') a['data-n'] = String(kids.length);
        kids.push(N.paragraph.create({ tag: 'p', a, bare: false }, parseLine(li.innerHTML)));
      }
    }
    tr.replaceWith(pos, pos + node.nodeSize, kids);
  }

  // ----- Mise à jour -----

  const olOf = (box) => {
    let ol = null;
    if (box) box.forEach((c) => { if (!ol && c.type === N.ordered_list) ol = c; });
    return ol;
  };
  const noteEmpty = (li) => li.content.size < 64 && li.textContent.trim() === '' && !hasAtom(li);
  function hasAtom(li) {
    let found = false;
    li.descendants((n) => { if (found) return false; if (n.isAtom && n.isInline) found = true; return !found; });
    return found;
  }
  // Ligne de note avec la classe « empty » à jour (elle affiche l'invite des versions 1.x).
  function withEmpty(li) {
    const empty = noteEmpty(li);
    if (hasClass(li.attrs.a, 'empty') === empty) return li;
    const cls = (' ' + (li.attrs.a.class || '') + ' ').replace(' empty ', ' ').trim();
    const a = { ...li.attrs.a };
    if (empty) a.class = cls ? cls + ' empty' : 'empty';
    else if (cls) a.class = cls;
    else delete a.class;
    return N.list_item.create({ ...li.attrs, a }, li.content, li.marks);
  }
  const blankNote = (attrs) => withEmpty(N.list_item.create({ a: attrs }, N.paragraph.create()));

  // Bloc de notes voulu, fait à partir de l'actuel (cur) : ses lignes gardées, dans l'ordre des appels.
  function buildBox(cur, kind, items) {
    const ol = N.ordered_list.create({ a: olOf(cur) ? olOf(cur).attrs.a : {} }, items);
    if (!cur) {
      if (kind === 'foot') return N.container.create({ a: { class: 'ft-footnotes' } }, ol);
      const title = N.raw_block.create({ html: '<div class="ft-endnotes-title" contenteditable="false">Notes</div>' });
      return N.container.create({ a: { class: 'ft-endnotes' } }, [title, ol]);
    }
    const kids = [];
    let put = false;
    cur.forEach((c) => {
      if (c.type === N.ordered_list && !put) { kids.push(ol); put = true; } else kids.push(c);
    });
    if (!put) kids.push(ol);
    return cur.copy(Fragment.from(kids));
  }

  // Remplace un bloc par sa nouvelle version en ne touchant que ce qui change (le curseur reste en place).
  function replaceDiff(tr, pos, cur, want) {
    const start = cur.content.findDiffStart(want.content);
    if (start == null) return;
    let { a: endA, b: endB } = cur.content.findDiffEnd(want.content);
    const over = start - Math.min(endA, endB);
    if (over > 0) { endA += over; endB += over; }
    tr.replace(pos + 1 + start, pos + 1 + endA, want.slice(start, endB));
  }

  // Remet notes, numéros, citations et bibliographies d'accord. Renvoie la transaction, ou null.
  function syncTr(state) {
    const s = scan(state.doc);
    const tr = state.tr;
    const style = C() ? C().style() : 'auteur-date';
    const edits = new Map(); // position d'un objet fermé → son élément modifié
    const edit = (r) => {
      let e = edits.get(r.pos);
      if (!e && r.host) {
        // (Appel dans une équation : l'équation entière est réécrite.)
        const host = r.host.cloneNode(true);
        e = { r, host, el: host.querySelector(':scope > sup.ft-fn-ref, :scope > sup.ft-en-ref') };
        edits.set(r.pos, e);
      }
      if (!e) { e = { r, el: r.el.cloneNode(true) }; edits.set(r.pos, e); }
      return e.el;
    };
    const now = (r) => (edits.has(r.pos) ? edits.get(r.pos).el : r.el);
    const setText = (r, text) => { if (now(r).textContent !== text) edit(r).textContent = text; };
    const setAttr = (r, name, value) => { if (now(r).getAttribute(name) !== value) edit(r).setAttribute(name, value); };
    const toggle = (r, cls, on) => { if (now(r).classList.contains(cls) !== on) edit(r).classList.toggle(cls, on); };

    // Dates mises à jour à l'ouverture.
    if (C()) for (const r of s.dates) setText(r, C().formatDate(r.el.getAttribute('data-fmt')));

    // Citations dans le texte (ordre de première citation : style numérique et bibliographie).
    const order = citeOrder(s);
    if (C()) {
      for (const c of s.cites) {
        const ids = c.el.getAttribute('data-src').split(',');
        const page = (c.el.getAttribute('data-page') || '').trim();
        const missing = ids.every((id) => !C().findSource(id));
        toggle(c, 'missing', missing);
        if (missing) continue;
        const label = C().citeLabel(ids, page, order);
        if (label !== null) setText(c, label);
        toggle(c, 'as-note', style === 'note');
      }
    }

    // Appels de note de bas de page : 1, 2, 3…
    const seenF = new Set();
    const fnIds = s.fn.map((r, i) => {
      let id = r.el.getAttribute('data-fn');
      if (!id || seenF.has(id)) { id = newId('n'); setAttr(r, 'data-fn', id); }
      seenF.add(id);
      setText(r, String(i + 1));
      if (r.el.getAttribute('contenteditable') !== 'false') setAttr(r, 'contenteditable', 'false');
      return id;
    });

    // Appels de note de fin (et citations en style « note ») : i, ii, iii…
    const roman = C() ? C().roman : (n) => String(n);
    const seenE = new Set();
    const enList = s.en.filter((r) => r.kind === 'en' || style === 'note');
    const enRefs = enList.map((r, i) => {
      const cite = r.kind === 'cite';
      let id = r.el.getAttribute('data-en');
      if (!id || seenE.has(id)) { id = newId(cite ? 'c' : 'e'); setAttr(r, 'data-en', id); }
      seenE.add(id);
      setText(r, roman(i + 1));
      return { id, cite, r };
    });

    for (const { r, el, host } of edits.values()) {
      const html = (host || el).outerHTML;
      if (html !== r.node.attrs.html) tr.setNodeMarkup(r.pos, null, { html });
    }

    // Blocs de notes : les lignes suivent les appels ; notes de fin puis notes de bas de page, à la fin.
    const curOf = (list) => (list.length ? tr.doc.nodeAt(list[0].pos) : null);
    const footCur = curOf(s.foots);
    const endCur = curOf(s.ends);
    // Lignes de note de tous les blocs (deux blocs collés l'un après l'autre : rien ne se perd).
    const lines = (list, attr) => {
      const m = new Map();
      for (const b of list) {
        const ol = olOf(tr.doc.nodeAt(b.pos));
        if (ol) ol.forEach((li) => { const id = li.attrs.a[attr]; if (id && !m.has(id)) m.set(id, li); });
      }
      return m;
    };
    let footWant = null;
    if (fnIds.length) {
      const old = lines(s.foots, 'data-fn');
      footWant = buildBox(footCur, 'foot', fnIds.map((id) => (old.has(id) ? withEmpty(old.get(id)) : blankNote({ 'data-fn': id }))));
    }
    let endWant = null;
    if (enRefs.length) {
      const old = lines(s.ends, 'data-en');
      endWant = buildBox(endCur, 'end', enRefs.map(({ id, cite, r }) => {
        const li = old.get(id);
        if (!cite) return li && !li.attrs.a['data-cite'] ? withEmpty(li) : blankNote({ 'data-en': id });
        const el = now(r);
        const html = C() ? C().noteHtml(el.getAttribute('data-src').split(','), (el.getAttribute('data-page') || '').trim()) : '';
        const content = window.FTSchema.parse('<p>' + html + '</p>').firstChild.content;
        const fresh = N.list_item.create({ a: { 'data-en': id, 'data-cite': 'oui', contenteditable: 'false' } }, N.paragraph.create(null, content));
        return li && li.eq(fresh) ? li : fresh;
      }));
    }

    // Blocs en trop (collés…) : retirés.
    for (const extra of [...s.foots.slice(1), ...s.ends.slice(1)].sort((a, b) => b.pos - a.pos)) {
      const pos = tr.mapping.map(extra.pos);
      tr.delete(pos, pos + tr.doc.nodeAt(pos).nodeSize);
    }
    const place = (list, cur, want, last) => {
      const pos = list.length ? tr.mapping.map(list[0].pos) : null;
      if (!want) {
        if (pos !== null) tr.delete(pos, pos + cur.nodeSize);
        return;
      }
      const end = tr.doc.content.size;
      const target = last(end);
      if (pos !== null && pos + cur.nodeSize === target) {
        replaceDiff(tr, pos, cur, want);
        return;
      }
      if (pos !== null) tr.delete(pos, pos + cur.nodeSize);
      tr.insert(last(tr.doc.content.size), want);
    };
    // Notes de bas de page : tout à la fin.
    place(s.foots, footCur, footWant, (end) => end);
    // Notes de fin : juste avant les notes de bas de page.
    place(s.ends, endCur, endWant, (end) => {
      const lastChild = tr.doc.lastChild;
      return lastChild && boxKind(lastChild) === 'foot' ? end - lastChild.nodeSize : end;
    });
    // Le document finit par les notes : une ligne vide les précède toujours, pour écrire avant elles.
    if ((footWant || endWant) && tr.docChanged) {
      const first = tr.doc.firstChild;
      if (boxKind(first) === 'foot' || boxKind(first) === 'end') tr.insert(0, N.paragraph.create({ bare: false }));
    }
    // Bibliographies : anciens blocs convertis, puis chacune remise à jour (de la dernière à la première).
    if (C() && C().ready()) {
      for (const b of [...s.bibs].sort((x, y) => y.pos - x.pos)) bibConvert(tr, tr.mapping.map(b.pos), b.node, order);
      for (const pos of bibHeads(tr.doc).reverse()) bibFix(tr, pos, order, false);
    }
    return tr.docChanged ? tr : null;
  }

  // ----- Ce que touche une modification -----

  function touched(doc, from, to) {
    const $a = doc.resolve(from);
    const $b = doc.resolve(to);
    const inLine = $a.parent.isTextblock && $a.sameParent($b);
    let hit = false;
    doc.nodesBetween(from, to, (n) => {
      if (hit) return false;
      if (n.type === N.raw_inline) { const i = info(n); if (i && i.kind !== 'date') hit = true; return false; }
      if (blockInfo(n)) { hit = true; return false; }
      const k = boxKind(n);
      if (k === 'bib' || (isBibHead(n) && !inLine)) { hit = true; return false; }
      if (k && !inLine) { hit = true; return false; }
      return !n.isAtom;
    });
    return hit;
  }

  function needsSync(trs) {
    for (const tr of trs) {
      // Ctrl+Z, Ctrl+Y : le texte revient tel qu'il était, notes comprises.
      if (!tr.docChanged || tr.getMeta(KEY) || tr.getMeta('history$')) continue;
      for (let i = 0; i < tr.steps.length; i++) {
        const before = tr.docs[i];
        const after = i + 1 < tr.docs.length ? tr.docs[i + 1] : tr.doc;
        let hit = false;
        tr.steps[i].getMap().forEach((oa, ob, na, nb) => {
          if (!hit) hit = touched(before, oa, ob) || touched(after, na, nb);
        });
        if (hit) return true;
      }
    }
    return false;
  }

  // Frappe dans une note : seule sa classe « empty » (invite) suit.
  function noteFix(state) {
    const $p = state.selection.$from;
    if ($p.depth < 3 || !boxKind($p.node(1)) || $p.node(2).type !== N.ordered_list) return null;
    const li = $p.node(3);
    if (li.attrs.a['data-cite']) return null;
    const fixed = withEmpty(li);
    if (fixed === li) return null;
    return state.tr.setNodeMarkup($p.before(3), null, fixed.attrs).setMeta(KEY, true);
  }

  // ----- Aller d'un appel à sa note, et retour -----

  function findRef(doc, kind, id) {
    const attr = kind === 'fn' ? 'data-fn' : 'data-en';
    let found = null;
    const s = scan(doc);
    for (const r of kind === 'fn' ? s.fn : s.en) if (r.el.getAttribute(attr) === id) { found = r; break; }
    return found;
  }
  function findNote(doc, kind, id) {
    const attr = kind === 'fn' ? 'data-fn' : 'data-en';
    let found = null;
    doc.forEach((top, pos) => {
      if (found || boxKind(top) !== (kind === 'fn' ? 'foot' : 'end')) return;
      top.descendants((n, p) => {
        if (found) return false;
        if (n.type === N.list_item) { if (n.attrs.a[attr] === id) found = { node: n, pos: pos + 1 + p }; return false; }
        return true;
      });
    });
    return found;
  }

  // Montre une position (son bloc est d'abord affiché s'il était loin, très long document).
  function reveal(pos, center) {
    const top = view.state.doc.resolve(pos);
    const block = top.depth ? view.nodeDOM(top.before(1)) : null;
    const workspace = document.getElementById('workspace');
    const go = () => {
      let c;
      try { c = view.coordsAtPos(Math.min(pos, view.state.doc.content.size)); } catch { return; }
      const box = workspace.getBoundingClientRect();
      if (center || c.top < box.top + 40 || c.bottom > box.bottom - 24) workspace.scrollTop += c.top - box.top - box.height / (center ? 2 : 3);
    };
    if (block && block.nodeType === 1 && block.hasAttribute('data-pm-far')) {
      block.scrollIntoView({ block: 'center' });
      requestAnimationFrame(go);
    } else {
      go();
    }
  }

  function goToNote(kind, id) {
    const note = findNote(view.state.doc, kind, id);
    if (!note) return false;
    if (!note.node.attrs.a['data-cite']) {
      const sel = Selection.near(view.state.doc.resolve(note.pos + note.node.nodeSize - 1), -1);
      view.dispatch(view.state.tr.setSelection(sel));
      view.focus();
    }
    reveal(note.pos + 1, kind === 'en');
    return true;
  }

  function backToRef(kind, id) {
    const ref = findRef(view.state.doc, kind, id);
    if (!ref) return false;
    // (Appel dans une équation sur sa propre ligne : l'équation est sélectionnée.)
    const sel = ref.host ? NodeSelection.create(view.state.doc, ref.pos) : TextSelection.create(view.state.doc, ref.pos + 1);
    view.dispatch(view.state.tr.setSelection(sel));
    view.focus();
    reveal(ref.pos + 1, kind === 'en');
    return true;
  }

  // Note où se trouve le curseur : { kind, id, li, pos }.
  function noteAt($p) {
    for (let d = $p.depth; d > 0; d--) {
      const n = $p.node(d);
      if (n.type !== N.list_item || d < 3) continue;
      const box = boxKind($p.node(d - 2));
      if (box !== 'foot' && box !== 'end') continue;
      const kind = box === 'foot' ? 'fn' : 'en';
      return { kind, id: n.attrs.a[kind === 'fn' ? 'data-fn' : 'data-en'], li: n, pos: $p.before(d) };
    }
    return null;
  }
  const inNotes = ($p) => $p.depth > 0 && !!boxKind($p.node(1));

  // ----- Insertion -----

  // Appel de note au curseur (après la sélection), puis le curseur va dans la note.
  // Équation choisie ou en cours de modification : l'appel se pose juste après elle (dans le bloc pour une
  // équation sur sa propre ligne, qui n'a qu'un appel : s'il y en a déjà un, le curseur va dans sa note).
  const isMathNode = (n) => !!n && window.FTFormuleVue && window.FTFormuleVue.isMath(n);
  function mathTarget(state) {
    const FV = window.FTFormuleVue;
    const editing = FV && FV.activeAt ? FV.activeAt() : undefined;
    if (editing !== undefined && isMathNode(state.doc.nodeAt(editing))) return editing;
    const sel = state.selection;
    if (sel instanceof NodeSelection && isMathNode(sel.node)) return sel.from;
    return null;
  }
  function insertRef(kind, replaceFrom) {
    const id = newId(kind === 'fn' ? 'n' : 'e');
    const html = kind === 'fn'
      ? `<sup class="ft-fn-ref" data-fn="${id}" contenteditable="false">*</sup>`
      : `<sup class="ft-en-ref" data-en="${id}" contenteditable="false">*</sup>`;
    const mp = replaceFrom == null ? mathTarget(view.state) : null;
    if (mp !== null) {
      if (window.FTFormuleVue.activeAt() !== undefined) window.FTFormuleVue.finish();
      const node = view.state.doc.nodeAt(mp);
      if (!isMathNode(node)) return false;
      if (node.isBlock) {
        if (inNotes(view.state.doc.resolve(mp))) return false;
        const had = blockInfo(node);
        if (had) return goToNote(had.kind, had.el.getAttribute(had.kind === 'fn' ? 'data-fn' : 'data-en'));
        const host = fromHtml(node.attrs.html);
        host.insertAdjacentHTML('beforeend', html);
        view.dispatch(PM.history.closeHistory(view.state.tr.setNodeMarkup(mp, null, { html: host.outerHTML })));
        goToNote(kind, id);
        M.closeHistory();
        return true;
      }
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, mp + node.nodeSize)));
    }
    const state = view.state;
    const at = state.selection.to;
    const $p = state.doc.resolve(at);
    if (!$p.parent.isTextblock || inNotes($p)) return false;
    const tr = state.tr;
    if (replaceFrom != null) tr.delete(replaceFrom, at);
    tr.insert(tr.mapping.map(at), N.raw_inline.create({ html }));
    view.dispatch(PM.history.closeHistory(tr));
    goToNote(kind, id);
    M.closeHistory();
    return true;
  }

  // Bibliographie : son titre au curseur (avant la ligne vide du curseur, sinon après son bloc), puis les
  // références, puis une ligne vide pour continuer d'écrire. Ligne vide juste sous un titre « Bibliographie »
  // (modèles de mise en page) : ce titre devient celui de la bibliographie.
  function insertBiblio(all) {
    if (!C()) return;
    const state = view.state;
    const title = C().biblioList(all, []).title;
    const $p = state.selection.$from;
    const tr = state.tr;
    const blank = (n) => n && n.type === N.paragraph && n.childCount === 0 && !isBibEntry(n);
    let trailer;
    if ($p.depth && !inNotes($p)) {
      const top = $p.node(1);
      const pos = $p.before(1);
      const prev = $p.index(0) > 0 ? state.doc.child($p.index(0) - 1) : null;
      if (blank(top) && prev && prev.type === N.heading && !isBibHead(prev) && BIB_TITLES.has(prev.textContent.trim().toLowerCase())) {
        const a = bibHead(prev.attrs.level, '', all, prev.attrs.a).attrs.a;
        tr.setNodeMarkup(pos - prev.nodeSize, null, { ...prev.attrs, a });
        trailer = pos;
      } else if (blank(top)) {
        tr.insert(pos, bibHead(bibLevel(state.doc), title, all));
        trailer = tr.mapping.map(pos, 1);
      } else {
        const at = pos + top.nodeSize;
        const head = bibHead(bibLevel(state.doc), title, all);
        tr.insert(at, head);
        trailer = at + head.nodeSize;
      }
    } else {
      // Avant les blocs de notes.
      let end = tr.doc.content.size;
      for (let i = tr.doc.childCount - 1; i >= 0 && boxKind(tr.doc.child(i)) && boxKind(tr.doc.child(i)) !== 'bib'; i--) end -= tr.doc.child(i).nodeSize;
      const head = bibHead(bibLevel(state.doc), title, all);
      tr.insert(end, head);
      trailer = end + head.nodeSize;
    }
    if (!blank(tr.doc.resolve(trailer).nodeAfter)) tr.insert(trailer, N.paragraph.create({ bare: false }));
    tr.setSelection(TextSelection.create(tr.doc, trailer + 1));
    view.dispatch(PM.history.closeHistory(tr).scrollIntoView());
    M.closeHistory();
    view.focus();
  }

  // Titre de la bibliographie d'un paragraphe (le titre lui-même, ou une référence sous lui) : sa position.
  function bibHeadAt(pos) {
    const $p = view.state.doc.resolve(pos);
    let d = $p.depth;
    while (d > 0 && !$p.node(d).isTextblock) d--;
    if (!d) return null;
    const parent = $p.node(d - 1);
    let i = $p.index(d - 1);
    let at = $p.before(d);
    if (isBibHead(parent.child(i))) return at;
    while (i > 0 && isBibEntry(parent.child(i))) {
      i--;
      at -= parent.child(i).nodeSize;
      if (isBibHead(parent.child(i))) return at;
    }
    return null;
  }
  // Refaite entièrement depuis les sources (retouches et références effacées comprises) ; une annulation.
  function bibRebuild(headPos) {
    if (!C()) return;
    const tr = view.state.tr;
    bibFix(tr, headPos, citeOrder(scan(view.state.doc)), true);
    if (!tr.docChanged) return;
    view.dispatch(PM.history.closeHistory(tr.setMeta(KEY, true)));
    M.closeHistory();
  }
  function bibItems(target) {
    const el = target && target.closest && target.closest('p.ft-bib, .ft-bib-title');
    if (!el || !view.dom.contains(el)) return [];
    let pos;
    try { pos = view.posAtDOM(el, 0); } catch { return []; }
    const head = bibHeadAt(pos);
    return head === null ? [] : [{ text: 'Refaire la bibliographie depuis les sources', action: () => bibRebuild(head) }];
  }

  // Citation changée dans la fenêtre « Sourcer ».
  function setCite(el, src, page) {
    const pos = window.FTObjets.posOf(el);
    const node = pos === null ? null : view.state.doc.nodeAt(pos);
    if (!node || node.type !== N.raw_inline) return;
    const c = fromHtml(node.attrs.html);
    c.setAttribute('data-src', src);
    if (page) c.setAttribute('data-page', page); else c.removeAttribute('data-page');
    view.dispatch(PM.history.closeHistory(view.state.tr.setNodeMarkup(pos, null, { html: c.outerHTML })));
    M.closeHistory();
  }

  // Remise à jour demandée (document ouvert, sources ou style changés) : hors annulation.
  function syncNow() {
    const tr = syncTr(view.state);
    if (tr) view.dispatch(tr.setMeta(KEY, true).setMeta('addToHistory', false));
  }

  // ----- Menu des notes -----

  function noteMenu(kind, id) {
    const note = findNote(view.state.doc, kind, id);
    const ref = findRef(view.state.doc, kind, id);
    const items = [
      { text: 'Aller à la note', disabled: !note, action: () => goToNote(kind, id) },
      { text: "Revenir à l'appel de note", disabled: !ref, action: () => backToRef(kind, id) }
    ];
    if (ref && ref.kind !== 'cite') {
      items.push('-', {
        text: 'Supprimer la note',
        danger: true,
        action: () => {
          const r = findRef(view.state.doc, kind, id);
          if (!r) return;
          const tr = view.state.tr;
          if (r.host) {
            const host = r.host.cloneNode(true);
            host.querySelector(':scope > sup.ft-fn-ref, :scope > sup.ft-en-ref').remove();
            tr.setNodeMarkup(r.pos, null, { html: host.outerHTML });
          } else tr.delete(r.pos, r.pos + 1);
          view.dispatch(PM.history.closeHistory(tr));
          M.closeHistory();
        }
      });
    }
    return items;
  }

  // Appel de note ou citation sous la souris.
  function refOf(target) {
    const el = target && target.closest && target.closest('sup.ft-fn-ref, sup.ft-en-ref, span.ft-cite');
    return el && view.dom.contains(el) && !el.closest('.ft-endnotes, .ft-biblio') ? el : null;
  }

  M.addPlugin(new Plugin({
    key: KEY,
    appendTransaction(trs, old, state) {
      if (!trs.some((t) => t.docChanged)) return null;
      if (needsSync(trs)) {
        const tr = syncTr(state);
        return tr ? tr.setMeta(KEY, true) : null;
      }
      return noteFix(state);
    },
    props: {
      // « ^^ » : note de bas de page (comme dans les versions 1.x).
      handleTextInput(v, from, to, text) {
        if (text !== '^' || from !== to) return false;
        const $p = v.state.doc.resolve(from);
        if (!$p.parent.isTextblock || inNotes($p) || $p.parentOffset < 1) return false;
        if ($p.parent.textBetween($p.parentOffset - 1, $p.parentOffset) !== '^') return false;
        return insertRef('fn', from - 1);
      },
      handleKeyDown(v, e) {
        if (e.ctrlKey || e.altKey || e.metaKey) return false;
        const sel = v.state.selection;
        // Entrée sur une ligne vide de la bibliographie : la ligne redevient du texte ordinaire.
        if (e.key === 'Enter' && !e.shiftKey && sel.empty && isBibEntry(sel.$from.parent) && sel.$from.parent.childCount === 0) {
          const p = sel.$from.parent;
          const a = { ...p.attrs.a };
          const cls = (' ' + a.class + ' ').replace(' ft-bib ', ' ').trim();
          if (cls) a.class = cls; else delete a.class;
          for (const k of ['data-src', 'data-h', 'data-n']) delete a[k];
          v.dispatch(v.state.tr.setNodeMarkup(sel.$from.before(), null, { ...p.attrs, a }));
          return true;
        }
        const note = noteAt(sel.$from);
        if (!note) return false;
        // Entrée dans une note : retour au texte, juste après l'appel.
        if (e.key === 'Enter' && !e.shiftKey) {
          backToRef(note.kind, note.id);
          return true;
        }
        // Les notes ne se fusionnent pas.
        if (sel.empty && e.key === 'Backspace' && sel.$from.pos === Selection.atStart(note.li).from + note.pos + 1) return true;
        if (sel.empty && e.key === 'Delete' && sel.$from.pos === Selection.atEnd(note.li).from + note.pos + 1) return true;
        return false;
      },
      handleDOMEvents: {
        contextmenu(v, e) {
          const ref = refOf(e.target);
          let kind = null;
          let id = null;
          if (ref && !ref.classList.contains('ft-cite')) {
            kind = ref.classList.contains('ft-fn-ref') ? 'fn' : 'en';
            id = ref.getAttribute(kind === 'fn' ? 'data-fn' : 'data-en');
          } else if (!ref) {
            const li = e.target.closest && e.target.closest('.ft-footnotes li, .ft-endnotes li');
            if (!li || !v.dom.contains(li)) return false;
            kind = li.closest('.ft-footnotes') ? 'fn' : 'en';
            id = li.getAttribute(kind === 'fn' ? 'data-fn' : 'data-en');
          }
          if (!kind || !id) return false;
          e.preventDefault();
          window.FTSidebar.showMenu(e.clientX, e.clientY, noteMenu(kind, id));
          return true;
        }
      }
    }
  }), true);

  // Un clic sur un appel de note mène à la note ; sur une citation, ouvre « Sourcer ».
  view.dom.addEventListener('click', (e) => {
    const ref = refOf(e.target);
    if (!ref || e.button !== 0) return;
    if (ref.classList.contains('ft-fn-ref')) goToNote('fn', ref.getAttribute('data-fn'));
    else if (ref.classList.contains('ft-en-ref') || (ref.classList.contains('as-note') && ref.hasAttribute('data-en'))) goToNote('en', ref.getAttribute('data-en'));
    else if (C()) C().open(ref);
  });

  window.FTNotes = {
    sync: syncNow,
    footnote: () => insertRef('fn'),
    endnote: () => insertRef('en'),
    // Citation (html) au curseur ; spaced : une espace la sépare du mot d'avant.
    inline: (html, spaced) => window.FTEcriture.insertInline(html, null, !!spaced) && true,
    setCite,
    biblio: insertBiblio,
    bibItems,
    start() {
      if (C()) C().useEngine(view.dom, window.FTNotes);
    }
  };
})();
