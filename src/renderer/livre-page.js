// Export livre, dans la page cachée que Chromium met en pages (main.js) :
// 1. prepare() : chaque élément dont il faut connaître la page (début de chapitre, titre du sommaire,
//    légende de la table des illustrations, cible d'un renvoi, mot de l'index) reçoit un identifiant, et
//    un lien vers lui est posé en fin de document : Chromium inscrit alors sa page dans le PDF (/Dests).
// 2. Première impression, lue par main.js (pdf-livre.js) : la page de chaque élément.
// 3. finish(pages) : liens retirés ; page blanche avant un chapitre qui tomberait sur une page de gauche ;
//    numéros de page écrits dans le sommaire, la table des illustrations, les renvois et l'index.
//    Renvoie les pages d'ouverture des chapitres (sans titre courant).
(function () {
  const ed = () => document.getElementById('editor');
  const OUTSIDE = '.ft-toc, .ft-lof, .ft-index, .ft-cover, .ft-footnotes, .ft-endnotes';
  let anchors = new Map(); // id -> élément
  let opts = {};

  const chapters = () => [...ed().querySelectorAll('.lv-chap')];
  // Les titres du sommaire (toc.js : même liste, même ordre).
  const headings = () => [...ed().querySelectorAll('h1, h2, h3, h4, h5')].filter((h) => !h.closest('.ft-toc, .ft-footnotes') && h.textContent.trim());
  // Les légendes numérotées (captions.js) : l'objet légendé.
  const captions = () => [...ed().querySelectorAll('.ft-image[data-num] > .ft-caption, p.ft-legend[data-kind]')]
    .filter((el) => !el.closest('.ft-lof, .ft-footnotes, .ft-endnotes') && ['figure', 'schema', 'tableau'].includes(el.classList.contains('ft-legend') ? el.dataset.kind : el.parentElement.dataset.num))
    .map((el) => (el.classList.contains('ft-legend') ? el : el.parentElement));

  let seq = 0;
  function mark(el, prefix) {
    if (!el) return null;
    if (!el.dataset.lvId) {
      el.dataset.lvId = prefix + ++seq;
      if (!el.id) el.id = el.dataset.lvId;
      anchors.set(el.id, el);
    }
    return el.id;
  }

  function prepare(o = {}) {
    opts = o;
    anchors = new Map();
    const root = ed();
    chapters().forEach((h) => mark(h, 'lvc'));
    const hs = headings();
    root.querySelectorAll('.ft-toc-item[data-target]').forEach((row) => { row.dataset.lvRef = mark(hs[Number(row.dataset.target)], 'lvh') || ''; });
    const caps = captions();
    root.querySelectorAll('.ft-lof-item[data-target]').forEach((row) => { row.dataset.lvRef = mark(caps[Number(row.dataset.target)], 'lvf') || ''; });
    root.querySelectorAll('span.ft-xref[data-target]').forEach((span) => {
      const key = span.dataset.target;
      const id = key.slice(key.indexOf(':') + 1);
      if (!/^[\w-]+$/.test(id)) return;
      const el = root.querySelector(key.startsWith('bm:') ? `[data-bm="${id}"]` : `[data-xid="${id}"]`);
      if (el && !el.closest(OUTSIDE)) span.dataset.lvRef = mark(el, 'lvx');
    });
    // Mots de l'index : déjà entourés (livre.js), avec leur identifiant.
    root.querySelectorAll('span.lv-ix[id]').forEach((s) => anchors.set(s.id, s));
    if (!anchors.size) return { anchors: 0 };
    const links = document.createElement('div');
    links.id = 'lv-liens';
    links.style.cssText = 'break-before: page; font-size: 2px; line-height: 1; color: transparent;';
    for (const id of anchors.keys()) {
      const a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = '.';
      links.append(a, ' ');
    }
    document.body.append(links);
    return { anchors: anchors.size };
  }

  // « 3, 7, 12–14 » (index-terms.js).
  function pageList(pages) {
    const list = [...new Set(pages)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      let j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      out.push(j > i + 1 ? `${list[i]}–${list[j]}` : j === i + 1 ? `${list[i]}, ${list[j]}` : String(list[i]));
      i = j;
    }
    return out.join(', ');
  }

  // pages : identifiant -> page (à partir de 0) dans la première impression.
  function finish(pages = {}) {
    const links = document.getElementById('lv-liens');
    if (links) links.remove();
    const root = ed();
    const chaps = chapters();
    // Pages blanches : un chapitre ouvre sur une page de droite (numéro impair).
    const blanks = [];
    let shift = 0;
    const openings = [];
    for (const h of chaps) {
      const p = pages[h.id];
      if (p === undefined) continue;
      let n = p + 1 + shift;
      if (opts.recto && n % 2 === 0 && n > 1) {
        const blank = document.createElement('div');
        blank.className = 'lv-blanc';
        h.before(blank);
        blanks.push({ el: blank, after: shift + 1 });
        shift++;
        n++;
      }
      openings.push(n);
    }
    // Page finale d'un élément : sa page, plus les pages blanches posées avant lui.
    const final = (el) => {
      const p = pages[el.id];
      if (p === undefined) return null;
      let s = 0;
      for (const b of blanks) if (b.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) s = b.after;
      return p + 1 + s;
    };
    const setPage = (row, cls, n) => {
      let span = row.querySelector('.' + cls);
      if (!span) {
        span = document.createElement('span');
        span.className = cls;
        row.append(span);
      }
      span.textContent = String(n);
    };
    root.querySelectorAll('.ft-toc-item, .ft-lof-item').forEach((row) => {
      const toc = row.classList.contains('ft-toc-item');
      const el = row.dataset.lvRef ? anchors.get(row.dataset.lvRef) : null;
      const n = el ? final(el) : toc && row.dataset.level === '0' ? 1 : null;
      if (n !== null) setPage(row, toc ? 'ft-toc-page' : 'ft-lof-page', n);
    });
    root.querySelectorAll('span.ft-xref[data-lv-ref]').forEach((span) => {
      const el = anchors.get(span.dataset.lvRef);
      const n = el ? final(el) : null;
      if (n === null) return;
      const show = span.dataset.show || 'label';
      if (show !== 'page' && show !== 'label-page') return;
      let text = span.textContent;
      if (/(page|Page) \S+$/.test(text)) text = text.replace(/(page|Page) \S+$/, (_m, w) => `${w} ${n}`);
      else if (/ci-dessus$|ci-dessous$/i.test(text)) {
        const upper = /^C/.test(text);
        text = show === 'page' ? (upper ? 'Page ' : 'page ') + n : text.replace(/ (ci-dessus|ci-dessous)$/i, ', page ' + n);
      }
      span.textContent = text;
    });
    root.querySelectorAll('.ft-index-entry[data-lv]').forEach((row) => {
      const list = row.dataset.lv.split(' ').map((id) => anchors.get(id)).filter(Boolean).map(final).filter((n) => n !== null);
      if (!list.length) return;
      let span = row.querySelector('.ft-index-pages');
      if (!span) {
        span = document.createElement('span');
        span.className = 'ft-index-pages';
        row.append(span);
      }
      span.textContent = ', ' + pageList(list);
      row.classList.remove('absent');
    });
    return { openings, blanks: blanks.length };
  }

  // Titres courants (feuille de style lv-tetes) : retirés pour imprimer les pages d'ouverture.
  function heads(on) {
    const s = document.getElementById('lv-tetes');
    if (s) s.disabled = !on;
    return true;
  }

  window.FTLivrePage = { prepare, finish, heads };
})();
