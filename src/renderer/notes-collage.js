// Notes de bas de page venues d'ailleurs, reconnues au collage (paste.js) :
// - Word : appels « mso-footnote-id » et notes du bloc « footnote-list » (notes de fin : « endnote ») ;
// - LibreOffice : appels « sdfootnoteanc » et notes « sdfootnote » (notes de fin : « sdendnote ») ;
// - pages web : appel en exposant qui mène à la note (Wikipédia, Pandoc, blogs…), note retrouvée dans le
//   passage copié ; sinon (paragraphe copié sans la liste des notes), la note est relue sur la page même ;
// - texte d'un PDF : « mot¹ » ou « mot1 » dans le texte, et plus bas une ligne « 1 Texte de la note ».
// Chaque appel devient un appel de note du logiciel, et sa note une vraie note de bas de page.
(function () {
  // Texte d'un appel : 1, [1], (1), a, [a], iv, *, †, [N 1], [note 2].
  const MARK = /^[[(]?\s*(?:(?:n(?:ote)?\.?\s*)?(?:\d{1,4}|[a-z]{1,2}|[ivxlc]{1,7})|[*†‡§¶]{1,3})\s*[\])]?$/i;
  // Classes, identifiants et cibles qui désignent une note.
  const NOTEY = /(foot|end)note|ftn|edn|\bfn|cite_note|cite_ref|noteref|note-?ref|\breference\b|sd(foot|end)note/i;
  const BOX = 'li, p, div, dd, dt, aside, section, footer, td, blockquote';
  const BLOCK = new Set(['LI', 'P', 'DIV', 'DD', 'DT', 'ASIDE', 'SECTION', 'FOOTER', 'TD', 'BLOCKQUOTE']);
  const NOTES_TITLE = /^(notes?( et références| and references)?|références|references|footnotes|endnotes|notes de bas de page|notes de fin)\s*$/i;

  const attr = (el, name) => (el.getAttribute && el.getAttribute(name)) || '';
  function fragOf(a) {
    const h = attr(a, 'href');
    const i = h.indexOf('#');
    if (i < 0) return '';
    const f = h.slice(i + 1);
    try { return decodeURIComponent(f); } catch { return f; }
  }
  // Adresse de la page (lien absolu, comme le navigateur l'écrit en copiant).
  const pageOf = (a) => (/^https?:\/\//i.test(attr(a, 'href')) ? attr(a, 'href').replace(/#.*$/, '') : '');

  function targetOf(doc, frag) {
    if (!frag) return null;
    return doc.getElementById(frag) || doc.getElementsByName(frag)[0] || null;
  }

  // Lien qui a l'air d'un appel de note.
  function refLike(a) {
    const t = a.textContent.replace(/\s+/g, ' ').trim();
    if (!t || t.length > 14 || !MARK.test(t) || !fragOf(a)) return false;
    if (/mso-(foot|end)note-id/i.test(attr(a, 'style'))) return true;
    let sup = !!a.querySelector('sup, [style*="super"]');
    for (let e = a, i = 0; e && e.tagName !== 'BODY' && i < 3; e = e.parentElement, i++) {
      if (e.tagName === 'SUP' || /vertical-align:\s*super/i.test(attr(e, 'style'))) sup = true;
      if (NOTEY.test(attr(e, 'class') + ' ' + (e.id || ''))) return true;
    }
    return sup || NOTEY.test(fragOf(a));
  }

  // Cadre d'une note : la ligne ou le paragraphe qui contient sa cible (inner) ; pour une note de plusieurs
  // paragraphes (Word, LibreOffice), le cadre qui les réunit (outer).
  function boxesOf(t, body) {
    const inner = BLOCK.has(t.tagName) ? t : t.closest(BOX);
    if (!inner || inner === body || !body.contains(inner)) return null;
    let outer = inner;
    const p = inner.parentElement;
    if (inner.tagName === 'P' && p && p !== body && /^(DIV|ASIDE|SECTION)$/.test(p.tagName)
      && /(foot|end)note|ftn|edn|^fn/i.test((p.id || '') + ' ' + attr(p, 'style') + ' ' + attr(p, 'class'))
      && !/(foot|end)note-list/i.test(attr(p, 'style'))) outer = p;
    return { inner, outer };
  }

  // Note telle qu'elle sera écrite : sans les liens de retour vers l'appel ni son propre numéro.
  function cleanNote(box, mark) {
    const c = box.cloneNode(true);
    c.querySelectorAll('.mw-cite-backlink, .cite-accessibility-label, .footnote-back, .footnote-backref, .reversefootnote, a.sdfootnotesym, a.sdendnotesym, [style*="mso-footnote-id"], [style*="mso-endnote-id"], .MsoFootnoteReference, .MsoEndnoteReference')
      .forEach((n) => n.remove());
    for (const a of c.querySelectorAll('a[href*="#"]')) {
      const t = a.textContent.trim();
      if (!t || /^[[(]?\s*(\d{1,4}|[a-z]{1,2}|[*†‡]{1,3}|[↑^↩⤴︎\s]+)\s*[\])]?[.)]?$/i.test(t)) a.remove();
    }
    // Numéro écrit en tête de la note (« 1. Texte ») : retiré s'il est celui de l'appel.
    const num = String(mark || '').replace(/[[\]()\s]/g, '');
    const walker = c.ownerDocument.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.data.trim()) continue;
      const m = /^[\s ]*(?:[↑^]\s*)?(?:[[(]?([\w*†‡]{1,4})[\])]?[.)]?(?=[\s ]))?/.exec(n.data);
      if (m && ((m[1] && m[1] === num) || (!m[1] && m[0]))) n.data = n.data.slice(m[0].length);
      break;
    }
    return c;
  }

  // Appels et notes d'un document HTML collé. Chaque appel est remplacé par un repère
  // <span class="ft-paste-fn" data-k="k"> ; ses notes sont retirées du texte.
  // Renvoie [{ kind: 'fn' | 'en', box: élément (note, nettoyée) | null, url, frag }] (indice = k).
  function extract(doc) {
    const body = doc.body;
    if (!body) return [];
    const found = [];
    for (const a of body.querySelectorAll('a[href*="#"]')) {
      if (!refLike(a)) continue;
      const frag = fragOf(a);
      const t = targetOf(doc, frag);
      // Lien de retour (de la note vers l'appel) : la cible est avant lui.
      if (t && (t.contains(a) || !(a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
      found.push({ a, t, frag, url: pageOf(a) });
    }
    if (!found.length) return [];
    const targets = new Set(found.map((f) => f.t).filter(Boolean));
    for (const f of found) {
      if (!f.t) continue;
      const b = boxesOf(f.t, body);
      if (!b || b.inner.contains(f.a) || b.inner.textContent.length > 12000) { f.t = null; f.skip = !!b && b.inner.contains(f.a); continue; }
      // Le cadre réunit plusieurs notes : seule la ligne de celle-ci.
      const others = [...targets].some((o) => o !== f.t && b.outer.contains(o) && !b.inner.contains(o));
      f.box = others ? b.inner : b.outer;
    }
    const boxes = [...new Set(found.map((f) => f.box).filter(Boolean))];
    const notes = [];
    for (const f of found) {
      if (f.skip || !f.a.isConnected) continue;
      // Appel à l'intérieur d'une note (référence citée dans une note) : retiré.
      if (boxes.some((b) => b.contains(f.a))) { (f.a.closest('sup') || f.a).remove(); continue; }
      // Appel sans note dans le passage ni page où la relire : laissé tel quel (paste.js retire ceux des
      // pages web).
      if (!f.box && !f.url) continue;
      const style = attr(f.a, 'style');
      const kind = /mso-endnote-id/i.test(style) || /^_?edn\d|sdendnote|^endnote/i.test(f.frag) ? 'en' : 'fn';
      const mark = f.a.textContent.trim();
      notes.push({ kind, box: f.box ? cleanNote(f.box, mark) : null, url: f.box ? '' : f.url, frag: f.frag });
      const span = doc.createElement('span');
      span.className = 'ft-paste-fn';
      span.dataset.k = String(notes.length - 1);
      const sup = f.a.parentElement && f.a.parentElement.tagName === 'SUP' && f.a.parentElement.textContent.trim() === mark ? f.a.parentElement : f.a;
      sup.replaceWith(span);
    }
    // Notes retirées du texte, avec leurs cadres devenus vides (liste des notes, trait de séparation) et le
    // titre « Notes » qui les précédait.
    for (const b of boxes) {
      let p = b.parentElement;
      b.remove();
      let last = null;
      while (p && p !== body && !p.textContent.trim() && !p.querySelector('img, table, .ft-math')) {
        const q = p.parentElement;
        last = p;
        p = q;
      }
      if (last) {
        let prev = last.previousElementSibling;
        last.remove();
        while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling;
        // (Wikipédia : le titre est dans un cadre, avec le lien « modifier ».)
        const h = prev && (/^H[1-6]$/.test(prev.tagName) ? prev : prev.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6'));
        if (h && NOTES_TITLE.test(h.textContent.replace(/\[.*?\]/g, '').trim())) prev.remove();
      }
    }
    return notes;
  }

  // ----- Texte brut (PDF) -----

  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const toSup = (n) => String(n).replace(/\d/g, (d) => SUP[d]);
  const fromSup = (s) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String(SUP.indexOf(c)));
  const NOTE_LINE = /^\s*(\d{1,3}|[⁰¹²³⁴⁵⁶⁷⁸⁹]{1,3})[.)]?\s+(\S.*)$/;
  // Appel n dans le texte : chiffres collés à la fin d'un mot ou d'une ponctuation (« mot1 », « mot.1 »,
  // « mot¹ »), suivis d'une espace, d'une ponctuation ou de la fin de la ligne.
  const markRe = (n) => new RegExp(`(?<=[\\p{L}.,;:!?»”"’)\\]])(?:${n}|${toSup(n)})(?![\\p{L}\\p{N}])|(?<=\\S)${toSup(n)}(?![⁰¹²³⁴⁵⁶⁷⁸⁹])`, 'gu');

  // Remplace les appels et retire les notes d'un texte copié d'un PDF. make(texte de la note, n) rend le
  // repère posé à la place de l'appel. Renvoie le texte, ou null s'il n'y a pas de note.
  function fromText(text, make) {
    if (!/\n\s*(\d{1,3}|[⁰¹²³⁴⁵⁶⁷⁸⁹])/.test(text)) return null;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const body = [];         // lignes du texte : { s }
    const notes = [];        // { n, text, line, at }
    let next = null;
    let cur = null;          // note en cours (ses lignes suivantes la continuent)
    let from = { line: 0, at: 0 };
    const findMark = (n) => {
      const re = markRe(n);
      for (let l = from.line; l < body.length; l++) {
        re.lastIndex = l === from.line ? from.at : 0;
        const m = re.exec(body[l].s);
        if (m) return { line: l, at: m.index, len: m[0].length };
      }
      return null;
    };
    for (const raw of lines) {
      const m = NOTE_LINE.exec(raw);
      const n = m ? Number(fromSup(m[1])) : null;
      if (m && (next === null || n === next)) {
        const mark = findMark(n);
        if (mark) {
          cur = { n, text: m[2].trim(), ...mark };
          notes.push(cur);
          from = { line: mark.line, at: mark.at + mark.len };
          next = n + 1;
          continue;
        }
      }
      if (!raw.trim()) { cur = null; body.push({ s: raw }); continue; }
      // Suite d'une note : sa ligne précédente ne finit pas une phrase.
      if (cur && !/[.!?»”)]$/.test(cur.text)) {
        cur.text = /\p{L}-$/u.test(cur.text) && /^\s*\p{Ll}/u.test(raw) ? cur.text.slice(0, -1) + raw.trim() : cur.text + ' ' + raw.trim();
        continue;
      }
      cur = null;
      body.push({ s: raw });
    }
    if (!notes.length) return null;
    for (const nt of notes.slice().reverse()) {
      const b = body[nt.line];
      b.s = b.s.slice(0, nt.at) + make(nt.text, nt.n) + b.s.slice(nt.at + nt.len);
    }
    return body.map((b) => b.s).join('\n');
  }

  // ----- Notes relues sur la page (passage copié sans la liste des notes) -----

  // list : [{ kind, id, url, frag }] ; fill(kind, id, html) écrit la note (html : ses paragraphes).
  async function fetchMissing(list, fill) {
    const api = window.frameText;
    if (!api || !api.pastePage || !list.length) return;
    const pages = new Map();
    for (const it of list) (pages.get(it.url) || pages.set(it.url, []).get(it.url)).push(it);
    for (const [url, items] of pages) {
      let text = null;
      try { text = await api.pastePage(url); } catch { text = null; }
      if (!text) continue;
      const doc = new DOMParser().parseFromString(text, 'text/html');
      if (window.FTFormulesCollage) window.FTFormulesCollage.markMath(doc);
      for (const it of items) {
        const t = targetOf(doc, it.frag);
        const b = t && boxesOf(t, doc.body);
        if (!b) continue;
        const html = window.FTPaste && window.FTPaste.noteHtml(cleanNote(b.inner));
        if (html) fill(it.kind, it.id, html);
      }
    }
  }

  window.FTNotesCollage = { extract, fromText, fetchMissing };
})();
