// Dates, notes de fin, sources, citations et bibliographie (barre d'insertion : « Date », « Note de fin »,
// « Sourcer »).
// - Date du jour en plusieurs formats ; « mise à jour à chaque ouverture » = span.ft-date[data-fmt].
// - Notes de fin : sup.ft-en-ref[data-en] dans le texte (i, ii, iii…), leur texte dans div.ft-endnotes,
//   placé avant les notes de bas de page (qui restent tout à la fin).
// - Sources : celles du projet, dans <projet>\sources.json ({ id, type, authors: [« Nom, Prénom »], title,
//   year, container, publisher, place, volume, issue, pages, url, accessed, editors, edition, doi, isbn }).
//   Import BibTeX, RIS, CSL JSON et Zotero ouvert sur l'ordinateur (biblio.js).
// - Citation : span.ft-cite[data-src][data-page], écrite selon le style du document
//   (doc.settings.citeStyle : 'auteur-date' « (Dupont, 2020, p. 12) », 'numerique' « [1] », 'note' :
//   une note de fin avec la référence complète).
// - Bibliographie (2.4.3) : un titre h1-h6.ft-bib-title suivi d'un paragraphe p.ft-bib par référence, du texte
//   ordinaire (modifiable, coupé entre les pages) tenu à jour par le moteur (moteur/notes.js) : les sources
//   citées dans le document (ou toutes celles du projet, data-bib="tout"). Ancien bloc fermé div.ft-biblio
//   converti à l'ouverture.
// - Norme (doc.settings.citeNorm) : 'classique' (à la française), 'apa', 'chicago', 'iso690', 'mla'
//   (biblio.js) ; elle règle les références, les citations auteur-date et le titre de la bibliographie.
(function () {
  const api = window.frameText;
  const $ = (id) => document.getElementById(id);
  let editor = $('editor');
  const dialog = $('sources-dialog');
  const pane = $('srcpane');
  const paneInner = $('srcpane-inner');

  let sources = [];
  let style = 'auteur-date';
  let norm = 'classique';
  let version = 0; // change à chaque modification des sources (lettres 2020a, 2020b)
  let onChange = () => {};
  let syncTimer = null;
  let editing = null; // source affichée dans le formulaire
  let loading = true; // sources du document ouvert pas encore lues (la bibliographie attend)

  const S = () => window.FTStructure;
  const changed = () => editor.dispatchEvent(new Event('input'));
  const newId = (p) => p + Math.random().toString(36).slice(2, 9);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ----- Insertion à l'endroit du curseur -----

  function insertInline(node, withSpace) {
    S().restoreSelection();
    S().checkpoint();
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return false;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    // Une date collée au mot d'avant reçoit une espace.
    if (withSpace === 'avant') {
      const c = range.startContainer;
      const prev = c.nodeType === 3 ? c.data.slice(0, range.startOffset) : (c.childNodes[range.startOffset - 1] || {}).textContent || '';
      if (/\S$/.test(prev) && !/[(«“'’\u00a0]$/.test(prev)) range.insertNode(document.createTextNode(' ')), range.collapse(false);
      withSpace = false;
    }
    range.insertNode(node);
    let after = node;
    if (withSpace) {
      after = document.createTextNode(' ');
      node.after(after);
    }
    const r = document.createRange();
    r.setStartAfter(after);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }

  // ----- Dates -----

  const DATE_FORMATS = [
    ['long', (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['jour', (d) => { const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }],
    ['court', (d) => d.toLocaleDateString('fr-FR')],
    ['iso', (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`],
    ['mois', (d) => { const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }],
    ['heure', (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })]
  ];
  const formatDate = (fmt, d = new Date()) => (DATE_FORMATS.find(([k]) => k === fmt) || DATE_FORMATS[0])[1](d);

  function buildDatePop() {
    const pop = $('date-pop');
    pop.textContent = '';
    const title = document.createElement('div');
    title.className = 'pop-title';
    title.textContent = 'Insérer la date';
    pop.appendChild(title);
    for (const [fmt] of DATE_FORMATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'date-choice';
      b.textContent = formatDate(fmt);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => {
        pop.hidden = true;
        insertDate(fmt, $('date-auto').checked);
      });
      pop.appendChild(b);
    }
    const label = document.createElement('label');
    label.className = 'date-auto';
    label.innerHTML = '<input type="checkbox" id="date-auto"> Mettre à jour à chaque ouverture';
    pop.appendChild(label);
  }

  // Moteur 2.0 : date écrite par le moteur (moteur/ecriture.js).
  let engineInline = null;
  function insertDate(fmt, auto) {
    if (engineInline) {
      const text = formatDate(fmt);
      return engineInline(auto ? `<span class="ft-date" data-fmt="${fmt}" contenteditable="false" title="Date mise à jour à chaque ouverture du document">${text}</span>` : null, text);
    }
    let node;
    if (auto) {
      node = document.createElement('span');
      node.className = 'ft-date';
      node.dataset.fmt = fmt;
      node.setAttribute('contenteditable', 'false');
      node.title = 'Date mise à jour à chaque ouverture du document';
      node.textContent = formatDate(fmt);
    } else {
      node = document.createTextNode(formatDate(fmt));
    }
    if (insertInline(node, 'avant')) changed();
  }

  function refreshDates() {
    let any = false;
    editor.querySelectorAll('span.ft-date[data-fmt]').forEach((el) => {
      const text = formatDate(el.dataset.fmt);
      if (el.textContent !== text) { el.textContent = text; any = true; }
    });
    return any;
  }

  // ----- Sources -----

  const authorsOf = (s) => (Array.isArray(s.authors) ? s.authors : []).map((a) => String(a).trim()).filter(Boolean);
  const lastName = (a) => a.split(',')[0].trim();

  function shortAuthors(s) {
    const names = authorsOf(s).map(lastName);
    if (!names.length) return s.title ? `« ${s.title} »` : 'Anonyme';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} et ${names[1]}`;
    return `${names[0]} et al.`;
  }

  // « NOM, Prénom » pour le premier auteur, « Prénom NOM » ensuite.
  function fullAuthors(s) {
    const list = authorsOf(s).map((a, i) => {
      const [last, first] = a.split(',').map((x) => (x || '').trim());
      const LAST = last.toUpperCase();
      if (!first) return LAST;
      return i === 0 ? `${LAST}, ${first}` : `${first} ${LAST}`;
    });
    if (!list.length) return '';
    if (list.length > 3) return list[0] + ' et al.';
    return list.length === 1 ? list[0] : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
  }

  const B = () => window.FTBiblio;
  const lang = () => (window.FTLang ? window.FTLang.principal() : 'fr');
  const suffix = (s) => (B() ? B().suffixes(sources, version, norm).get(s.id) || '' : '');

  // La référence complète, en HTML (titres en italique), selon la norme du document.
  function reference(s) {
    if (norm !== 'classique' && B()) return B().reference(s, norm, lang(), suffix(s));
    return classic(s);
  }

  // Norme « classique », à la française.
  function classic(s) {
    const parts = [];
    const auth = fullAuthors(s);
    if (auth) parts.push(esc(auth) + '.');
    const title = s.title ? s.title.trim() : '';
    const year = (s.year ? String(s.year).trim() : 's. d.') + suffix(s);
    const pages = s.pages ? (/[-–]/.test(s.pages) ? 'p. ' : 'p. ') + esc(s.pages.trim()) : '';
    if (s.type === 'article') {
      if (title) parts.push(`« ${esc(title)} ».`);
      const bits = [s.container ? `<i>${esc(s.container)}</i>` : '', s.volume ? `vol. ${esc(s.volume)}` : '', s.issue ? `n° ${esc(s.issue)}` : '', esc(year), pages].filter(Boolean);
      parts.push(bits.join(', ') + '.');
    } else if (s.type === 'chapitre' || s.type === 'conference') {
      if (title) parts.push(`« ${esc(title)} »,`);
      const eds = authorsOf({ authors: s.editors }).map((a) => a.split(',').reverse().map((x) => x.trim()).filter(Boolean).join(' '));
      parts.push(`dans ${eds.length ? esc(eds.join(', ')) + ' (dir.), ' : ''}<i>${esc(s.container || '')}</i>.`);
      const pub = [s.place, s.publisher].filter(Boolean).map(esc).join(' : ');
      parts.push([pub, esc(year), pages].filter(Boolean).join(', ') + '.');
    } else if (s.type === 'web') {
      if (title) parts.push(`« ${esc(title)} ».`);
      parts.push([s.container ? `<i>${esc(s.container)}</i>` : '', esc(year)].filter(Boolean).join(', ') + '.');
      if (s.url) parts.push(`Disponible sur : ${esc(s.url)}`);
      if (s.accessed) parts.push(`(consulté le ${esc(new Date(s.accessed + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }))}).`);
    } else {
      if (title) parts.push(`<i>${esc(title)}</i>.`);
      if (s.edition) parts.push(esc(s.edition) + (/\D$/.test(s.edition) ? '.' : ' éd.'));
      if (s.type === 'these') parts.push(s.thesis === 'master' ? 'Mémoire de master.' : 'Thèse de doctorat.');
      const pub = [s.place, s.publisher].filter(Boolean).map(esc).join(' : ');
      parts.push([pub, esc(year)].filter(Boolean).join(', ') + '.');
      if (s.type === 'rapport' && s.issue) parts.push(`Rapport n° ${esc(s.issue)}.`);
      if (s.url && s.type === 'autre') parts.push(esc(s.url));
    }
    if (s.doi && s.type !== 'web') parts.push(`DOI : ${esc(s.doi)}`);
    return parts.join(' ').replace(/\s+\./g, '.').replace(/\.\./g, '.');
  }

  const findSource = (id) => sources.find((s) => s.id === id);

  // ----- Mise à jour des citations, des notes de fin et de la bibliographie -----

  const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'];
  function roman(n) {
    const tens = ['', 'x', 'xx', 'xxx', 'xl', 'l', 'lx', 'lxx', 'lxxx', 'xc'];
    if (n >= 100) return String(n);
    return tens[Math.floor(n / 10)] + ROMAN[n % 10];
  }

  const setText = (el, text) => { if (el.textContent !== text) { el.textContent = text; return true; } return false; };
  const setHtml = (el, html) => { if (el.innerHTML !== html) { el.innerHTML = html; return true; } return false; };

  // Texte d'une citation dans le texte (styles « auteur-date » et « numérique ») ; null en style « note »
  // (le numéro de la note de fin est donné avec les autres notes de fin).
  function citeLabel(ids, page, order) {
    const pageText = page ? `, ${/^\d/.test(page) ? 'p. ' : ''}${page}` : '';
    if (style === 'numerique') return '[' + ids.map((id) => order.indexOf(id) + 1).join(', ') + (pageText ? pageText : '') + ']';
    if (style === 'note') return null;
    if (norm !== 'classique' && B()) {
      const sep = lang() === 'fr' ? ' ; ' : '; ';
      return '(' + ids.map((id, i) => { const s = findSource(id); return s ? B().inText(s, norm, lang(), i === ids.length - 1 ? page : '', suffix(s)) : '?'; }).join(sep) + ')';
    }
    return '(' + ids.map((id) => { const s = findSource(id); return s ? `${shortAuthors(s)}, ${s.year || 's. d.'}${suffix(s)}` : '?'; }).join(' ; ') + pageText + ')';
  }

  // Citation en note de fin : la référence complète (et la page).
  function noteHtml(ids, page) {
    if (norm === 'chicago' && B()) return ids.map((id, i) => { const s = findSource(id); return s ? B().note(s, norm, lang(), i === ids.length - 1 ? page : '') : 'Source inconnue.'; }).join(' ');
    return ids.map((id) => { const s = findSource(id); return s ? reference(s) : 'Source inconnue.'; }).join(' ; ')
      .replace(/\.$/, '') + (page ? `, ${/^\d/.test(page) ? 'p. ' : ''}${esc(page)}` : '') + '.';
  }

  // Références d'une bibliographie : les sources citées (order), ou toutes celles du projet, triées selon la
  // norme (ordre des citations en style numérique). { title, numbered, items: [{ id, html, n }] }.
  function biblioList(all, order) {
    let list = all ? [...sources] : order.map(findSource).filter(Boolean);
    const numbered = style === 'numerique' && !all;
    if (!numbered && norm !== 'classique' && B()) list.sort((a, b) => B().sortKey(a).localeCompare(B().sortKey(b), 'fr') || String(a.year || '').localeCompare(String(b.year || '')) || suffix(a).localeCompare(suffix(b)));
    else if (!numbered) list.sort((a, b) => shortAuthors(a).localeCompare(shortAuthors(b), 'fr') || String(a.year || '').localeCompare(String(b.year || '')));
    const title = norm !== 'classique' && B() ? B().title(norm, lang()) : 'Bibliographie';
    return { title, numbered, items: list.map((s, i) => ({ id: s.id, html: reference(s), n: numbered ? order.indexOf(s.id) + 1 || i + 1 : 0 })) };
  }

  // Contenu d'une bibliographie des versions 2.4 et d'avant (bloc fermé div.ft-biblio).
  function biblioHtml(all, title, order) {
    const b = biblioList(all, order);
    const items = b.items.length
      ? b.items.map((it) => `<li>${it.html}</li>`).join('')
      : '<li class="empty">Aucune source citée pour le moment : utilisez « Sourcer » dans la barre principale.</li>';
    return `<div class="ft-biblio-title">${esc(title || b.title)}</div><${b.numbered ? 'ol' : 'ul'}>${items}</${b.numbered ? 'ol' : 'ul'}>`;
  }

  // Moteur 2.0 : notes, citations et bibliographies remises à jour par le moteur (moteur/notes.js).
  let engine = null;

  // Remet tout à jour ; renvoie true si le texte a changé.
  function sync() {
    if (engine) { engine.sync(); return false; }
    let any = refreshDates();
    const cites = [...editor.querySelectorAll('span.ft-cite[data-src]')].filter((c) => !c.closest('.ft-biblio, .ft-endnotes'));
    // Ordre de première citation (style numérique et bibliographie numérotée).
    const order = [];
    for (const c of cites) for (const id of c.dataset.src.split(',')) if (!order.includes(id)) order.push(id);

    // Citations dans le texte.
    for (const c of cites) {
      const ids = c.dataset.src.split(',');
      const page = c.dataset.page ? c.dataset.page.trim() : '';
      const missing = ids.every((id) => !findSource(id));
      c.classList.toggle('missing', missing);
      if (missing) continue; // source inconnue (document venu d'un autre projet) : le texte reste tel quel
      const label = citeLabel(ids, page, order);
      if (label !== null) any = setText(c, label) || any;
      c.classList.toggle('as-note', style === 'note');
    }

    // Notes de fin : notes écrites (sup.ft-en-ref) et citations en style « note », dans l'ordre du texte.
    const refs = [...editor.querySelectorAll('sup.ft-en-ref, span.ft-cite[data-src]')].filter((r) => !r.closest('.ft-endnotes, .ft-footnotes, .ft-biblio') && (r.tagName === 'SUP' || style === 'note'));
    let box = editor.querySelector('.ft-endnotes');
    if (!refs.length) {
      if (box) { box.remove(); any = true; }
    } else {
      if (!box) {
        box = document.createElement('div');
        box.className = 'ft-endnotes';
        box.innerHTML = '<div class="ft-endnotes-title" contenteditable="false">Notes</div><ol></ol>';
        any = true;
      }
      // Avant les notes de bas de page, qui restent tout à la fin.
      const foot = editor.querySelector(':scope > .ft-footnotes');
      if (foot ? box.nextElementSibling !== foot : box !== editor.lastElementChild) { editor.insertBefore(box, foot); any = true; }
      let ol = box.querySelector('ol');
      if (!ol) { ol = document.createElement('ol'); box.appendChild(ol); }
      const old = new Map([...ol.children].filter((li) => li.dataset.en).map((li) => [li.dataset.en, li]));
      const seen = new Set();
      refs.forEach((ref, i) => {
        const n = roman(i + 1);
        let li;
        if (ref.tagName === 'SUP') {
          if (!ref.dataset.en || seen.has(ref.dataset.en)) ref.dataset.en = newId('e');
          seen.add(ref.dataset.en);
          any = setText(ref, n) || any;
          li = old.get(ref.dataset.en);
          if (!li || li.dataset.cite) {
            li = document.createElement('li');
            li.dataset.en = ref.dataset.en;
            li.appendChild(document.createElement('br'));
          }
          const empty = li.textContent.trim() === '';
          if (li.classList.contains('empty') !== empty) li.classList.toggle('empty', empty);
        } else {
          // Citation en note de fin : la note donne la référence complète (et la page).
          if (!ref.dataset.en || seen.has(ref.dataset.en)) ref.dataset.en = newId('c');
          seen.add(ref.dataset.en);
          any = setText(ref, n) || any;
          li = old.get(ref.dataset.en);
          if (!li || !li.dataset.cite) {
            li = document.createElement('li');
            li.dataset.en = ref.dataset.en;
            li.dataset.cite = 'oui';
            li.setAttribute('contenteditable', 'false');
          }
          any = setHtml(li, noteHtml(ref.dataset.src.split(','), ref.dataset.page ? ref.dataset.page.trim() : '')) || any;
        }
        if (ol.children[i] !== li) { ol.insertBefore(li, ol.children[i] || null); any = true; }
      });
      while (ol.children.length > refs.length) { ol.lastElementChild.remove(); any = true; }
    }

    // Bibliographies.
    for (const bib of editor.querySelectorAll('.ft-biblio')) any = setHtml(bib, biblioHtml(bib.dataset.scope === 'tout', bib.dataset.title, order)) || any;
    return any;
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { if (sync()) changed(); }, 300);
  }

  // ----- Notes de fin écrites à la main -----

  function insertEndnote() {
    if (engine) return engine.endnote();
    const ref = document.createElement('sup');
    ref.className = 'ft-en-ref';
    ref.dataset.en = newId('e');
    ref.setAttribute('contenteditable', 'false');
    ref.textContent = '*';
    if (!insertInline(ref, false)) return;
    sync();
    const li = editor.querySelector(`.ft-endnotes li[data-en="${ref.dataset.en}"]`);
    if (li) S().placeCaret(li, true);
    changed();
  }

  // Entrée dans une note de fin ramène au texte, juste après l'appel de note.
  editor.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const sel = window.getSelection();
    const li = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('.ft-endnotes li');
    if (!li) return;
    e.preventDefault();
    const ref = editor.querySelector(`sup.ft-en-ref[data-en="${li.dataset.en}"]`);
    if (!ref) return;
    const r = document.createRange();
    r.setStartAfter(ref);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    ref.scrollIntoView({ block: 'center' });
  });
  // Un clic sur un appel de note mène à la note ; sur le numéro d'une note, à son appel.
  editor.addEventListener('click', (e) => {
    const ref = e.target.closest && e.target.closest('sup.ft-en-ref, span.ft-cite.as-note');
    if (ref && ref.dataset.en) {
      const li = editor.querySelector(`.ft-endnotes li[data-en="${ref.dataset.en}"]`);
      if (li) { li.scrollIntoView({ block: 'center' }); if (!li.dataset.cite) S().placeCaret(li, true); }
      return;
    }
    const cite = e.target.closest && e.target.closest('span.ft-cite');
    if (cite) openDialog(cite);
  });

  // ----- Fenêtre des sources -----

  const FIELDS = ['type', 'authors', 'editors', 'title', 'year', 'container', 'publisher', 'place', 'volume', 'issue', 'pages', 'edition', 'doi', 'isbn', 'url', 'accessed'];
  const LISTS = ['authors', 'editors'];
  let citeTarget = null; // citation cliquée, à modifier

  async function loadSources() {
    await flushSources();
    try {
      const list = await api.loadSources();
      sources = Array.isArray(list) ? list.filter((s) => s && s.id) : [];
    } catch {
      sources = [];
    }
    version++;
  }

  let saveTimer = null;
  function saveSources() {
    version++;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSources, 400);
    if (sync()) changed();
  }

  // Enregistre sans attendre ce qui est en attente : avant de relire les sources, et quand la
  // fenêtre se ferme (sinon un changement de projet juste après pourrait l'enregistrer au mauvais endroit).
  function flushSources() {
    if (!saveTimer) return Promise.resolve();
    clearTimeout(saveTimer);
    saveTimer = null;
    return api.saveSources(sources).catch(() => {});
  }

  function renderList() {
    const box = $('src-list');
    const q = $('src-search').value.trim().toLowerCase();
    box.textContent = '';
    const list = [...sources].sort((a, b) => shortAuthors(a).localeCompare(shortAuthors(b), 'fr'));
    const shown = list.filter((s) => !q || [s.title, authorsOf(s).join(' '), s.year, s.container].join(' ').toLowerCase().includes(q));
    if (!shown.length) {
      const p = document.createElement('div');
      p.className = 'src-empty';
      p.textContent = sources.length ? 'Aucune source ne correspond.' : 'Pas encore de source dans ce projet. « + Nouvelle source » pour en ajouter une.';
      box.appendChild(p);
    }
    for (const s of shown) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'src-item' + (editing === s ? ' on' : '');
      b.innerHTML = `<b></b><span></span>`;
      b.querySelector('b').textContent = `${shortAuthors(s)}, ${s.year || 's. d.'}`;
      b.querySelector('span').textContent = s.title || '(sans titre)';
      b.addEventListener('click', () => { editing = s; renderList(); renderForm(); });
      b.addEventListener('dblclick', () => { editing = s; cite(); });
      box.appendChild(b);
    }
  }

  function renderForm() {
    const form = $('src-form');
    form.hidden = !editing;
    $('src-none').hidden = !!editing;
    if (!editing) return;
    for (const f of FIELDS) {
      const input = $('src-' + f);
      if (!input) continue;
      input.value = LISTS.includes(f) ? authorsOf({ authors: editing[f] }).join('\n') : editing[f] || '';
    }
    form.dataset.type = editing.type || 'livre';
    $('src-preview').innerHTML = reference(editing);
  }

  function readForm() {
    if (!editing) return;
    for (const f of FIELDS) {
      const input = $('src-' + f);
      if (!input) continue;
      editing[f] = LISTS.includes(f) ? input.value.split('\n').map((x) => x.trim()).filter(Boolean) : input.value.trim();
    }
    $('src-form').dataset.type = editing.type || 'livre';
    $('src-preview').innerHTML = reference(editing);
    saveSources();
    renderList();
  }

  function cite() {
    if (!editing) return;
    const page = $('src-page').value.trim();
    if (engine) {
      done();
      if (citeTarget && citeTarget.isConnected) engine.setCite(citeTarget, editing.id, page);
      else engine.inline(`<span class="ft-cite" data-src="${esc(editing.id)}"${page ? ` data-page="${esc(page)}"` : ''} contenteditable="false">(…)</span>`, false);
      afterInsert();
      return;
    }
    if (citeTarget && citeTarget.isConnected) {
      S().checkpoint();
      citeTarget.dataset.src = editing.id;
      if (page) citeTarget.dataset.page = page; else delete citeTarget.dataset.page;
    } else {
      const span = document.createElement('span');
      span.className = 'ft-cite';
      span.dataset.src = editing.id;
      if (page) span.dataset.page = page;
      span.setAttribute('contenteditable', 'false');
      span.textContent = '(…)';
      if (!insertInline(span, false)) return;
    }
    done();
    sync();
    changed();
    afterInsert();
  }

  function insertBibliography() {
    if (engine) {
      done();
      engine.biblio($('src-scope').value === 'tout');
      afterInsert();
      return;
    }
    const box = document.createElement('div');
    box.className = 'ft-biblio';
    box.setAttribute('contenteditable', 'false');
    if ($('src-scope').value === 'tout') box.dataset.scope = 'tout';
    S().restoreSelection();
    S().checkpoint();
    const sel = window.getSelection();
    let top = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.anchorNode : null;
    while (top && top.parentNode !== editor) top = top.parentNode;
    if (top && top.nodeType === 1 && !top.matches('.ft-endnotes, .ft-footnotes')) {
      if (top.textContent.trim() === '' && !top.querySelector('img')) top.replaceWith(box); else top.after(box);
    } else {
      editor.insertBefore(box, editor.querySelector(':scope > .ft-endnotes, :scope > .ft-footnotes'));
    }
    if (!box.nextElementSibling || box.nextElementSibling.matches('.ft-endnotes, .ft-footnotes')) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      box.after(p);
    }
    done();
    sync();
    changed();
    afterInsert();
  }

  // ----- Fenêtre ou volet à droite du texte -----
  // Le volet reçoit le contenu même de la fenêtre (mêmes champs, mêmes boutons) : le texte reste modifiable
  // à côté, « Citer cette source » insère à l'endroit du curseur et le volet reste ouvert.
  const DOCK = 'ft-sources-volet';
  const pref = (() => { try { return JSON.parse(localStorage.getItem(DOCK) || '{}') || {}; } catch { return {}; } })();
  const savePref = () => { try { localStorage.setItem(DOCK, JSON.stringify(pref)); } catch { /* indisponible */ } };
  if (pref.width) pane.style.setProperty('--src-w', pref.width + 'px');
  const docked = () => pane.classList.contains('open');

  function moveContent(to) {
    const from = to === paneInner ? dialog : paneInner;
    while (from.firstChild) to.appendChild(from.firstChild);
  }
  function showPane(on) {
    if (on && !docked()) {
      if (dialog.open) dialog.close();
      moveContent(paneInner);
    } else if (!on && docked()) {
      moveContent(dialog);
    }
    pane.classList.toggle('open', on);
    pane.setAttribute('aria-hidden', String(!on));
    $('src-dock').textContent = on ? 'Fenêtre' : 'Volet à droite';
    $('src-dock').title = on ? 'Afficher les sources dans une fenêtre' : "Afficher les sources dans un volet à droite du texte, pour continuer d'écrire";
    const btn = $('cite-btn');
    if (btn) btn.classList.toggle('on', on);
    if (!on) flushSources();
  }
  // Après « Citer » ou « Insérer la bibliographie » : la fenêtre se ferme, le volet reste ouvert.
  function done() {
    if (!docked()) dialog.close();
  }
  function afterInsert() {
    if (!docked()) return;
    citeTarget = null;
    $('src-cite').textContent = 'Citer cette source';
    $('src-page').value = '';
    editor = $('editor');
    if (!editor.contains(document.activeElement)) editor.focus({ preventScroll: true });
  }
  $('src-dock').addEventListener('click', () => {
    pref.docked = !docked();
    savePref();
    if (pref.docked) showPane(true);
    else { showPane(false); dialog.showModal(); }
  });
  $('srcpane-resize').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = pane.getBoundingClientRect().width;
    document.body.classList.add('resizing-col');
    const move = (ev) => pane.style.setProperty('--src-w', Math.round(Math.max(300, Math.min(window.innerWidth * 0.5, w0 - (ev.clientX - x0)))) + 'px');
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing-col');
      pref.width = Math.round(pane.getBoundingClientRect().width);
      savePref();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  async function openDialog(target, sourceId) {
    if (!window.FTApp.currentId()) return;
    await loadSources();
    citeTarget = target && target.classList && target.classList.contains('ft-cite') ? target : null;
    editing = citeTarget ? findSource(citeTarget.dataset.src.split(',')[0]) || null : findSource(sourceId) || (editing && findSource(editing.id) ? editing : sources[0] || null);
    $('src-search').value = '';
    $('src-page').value = citeTarget ? citeTarget.dataset.page || '' : '';
    $('src-style').value = style;
    $('src-norm').value = norm;
    $('src-import-pop').hidden = true;
    $('src-paste-box').hidden = true;
    $('src-zotero-box').hidden = true;
    $('src-found-box').hidden = true;
    $('src-lookup').value = '';
    message('');
    $('src-cite').textContent = citeTarget ? 'Changer la référence' : 'Citer cette source';
    renderList();
    renderForm();
    if (pref.docked) showPane(true);
    else if (!dialog.open) dialog.showModal();
  }

  $('src-search').addEventListener('input', renderList);
  $('src-new').addEventListener('click', () => {
    const s = { id: newId('s'), type: 'livre', authors: [], title: '', year: '' };
    sources.push(s);
    editing = s;
    $('src-search').value = '';
    renderList();
    renderForm();
    $('src-authors').focus();
    saveSources();
  });
  $('src-delete').addEventListener('click', async () => {
    if (!editing) return;
    const used = [...editor.querySelectorAll('span.ft-cite[data-src]')].filter((c) => c.dataset.src.split(',').includes(editing.id)).length;
    const ok = await window.FTApp.ask(`Supprimer la source « ${editing.title || shortAuthors(editing)} » du projet ?${used ? ` Elle est citée ${used} fois dans ce document.` : ''}`, '', { okLabel: 'Supprimer', input: false });
    if (!ok) return;
    sources = sources.filter((s) => s !== editing);
    editing = sources[0] || null;
    saveSources();
    renderList();
    renderForm();
  });
  // (Entrée dans un champ : la fiche n'est pas un formulaire à envoyer.)
  $('src-form').addEventListener('submit', (e) => e.preventDefault());
  $('src-form').addEventListener('input', readForm);
  $('src-form').addEventListener('change', readForm);
  $('src-cite').addEventListener('click', cite);
  $('src-biblio').addEventListener('click', insertBibliography);
  $('src-close').addEventListener('click', () => { if (docked()) showPane(false); else dialog.close(); });
  dialog.addEventListener('close', () => { flushSources(); });
  $('src-style').addEventListener('change', () => {
    style = $('src-style').value;
    onChange(style);
    if (sync()) changed();
  });
  $('src-norm').addEventListener('change', () => {
    norm = $('src-norm').value;
    onChange(style);
    if (editing) $('src-preview').innerHTML = reference(editing);
    if (sync()) changed();
  });

  // ----- Import : fichier (BibTeX, RIS, CSL JSON), texte collé, Zotero ouvert -----

  function message(text, bad) {
    const m = $('src-msg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    m.hidden = !text;
  }

  // Ajoute les sources lues (sans doublon) ; renvoie le message du résultat.
  function addImported(list, format) {
    let added = 0;
    let known = 0;
    let first = null;
    for (const raw of list) {
      if (!raw.title && !(raw.authors && raw.authors.length)) continue;
      if (sources.some((s) => B().sameSource(s, raw))) { known++; continue; }
      const s = { id: newId('s'), ...raw };
      sources.push(s);
      first = first || s;
      added++;
    }
    if (added) {
      editing = first;
      $('src-search').value = '';
      saveSources();
      renderList();
      renderForm();
    }
    const parts = [];
    parts.push(added ? `${added} source${added > 1 ? 's' : ''} importée${added > 1 ? 's' : ''}` : 'Aucune nouvelle source');
    if (known) parts.push(`${known} déjà présente${known > 1 ? 's' : ''}`);
    message(parts.join(', ') + (format ? ` (${format}).` : '.'), !added && !known);
    return added;
  }

  function importText(text) {
    const res = B().parse(text);
    if (!res.list.length) { message('Format non reconnu : BibTeX, RIS ou CSL JSON attendu.', true); return 0; }
    return addImported(res.list, res.format);
  }

  $('src-import').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('src-import-pop');
    pop.hidden = !pop.hidden;
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#src-import-pop, #src-import')) $('src-import-pop').hidden = true; });
  $('src-import-file').addEventListener('click', async () => {
    $('src-import-pop').hidden = true;
    const files = await api.importReferences();
    if (!files || !files.length) return;
    const all = [];
    const formats = new Set();
    for (const f of files) {
      const res = B().parse(f.text);
      if (res.format) formats.add(res.format);
      all.push(...res.list);
    }
    if (!all.length) { message('Aucune référence lue dans ce fichier : BibTeX, RIS ou CSL JSON attendu.', true); return; }
    addImported(all, [...formats].join(', '));
  });
  $('src-import-paste').addEventListener('click', () => {
    $('src-import-pop').hidden = true;
    $('src-zotero-box').hidden = true;
    $('src-paste-box').hidden = false;
    $('src-paste').value = '';
    $('src-paste').focus();
  });
  $('src-paste-ok').addEventListener('click', async () => {
    const text = $('src-paste').value;
    // Une liste de DOI, ISBN ou liens (un par ligne) : chaque ligne est cherchée en ligne.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!B().parse(text).list.length && lines.length && lines.length <= 100 && lines.every((l) => ID_LINE.test(l))) {
      if (await lookupMany(lines)) $('src-paste-box').hidden = true;
      return;
    }
    if (importText(text)) $('src-paste-box').hidden = true;
  });
  $('src-paste-cancel').addEventListener('click', () => { $('src-paste-box').hidden = true; });

  // ----- Remplissage automatique : DOI, ISBN, arXiv, PMID, HAL, ARK, lien ou titre (sources-en-ligne.js) -----

  const ID_LINE = /^(doi:|10\.\d{4,}\/|https?:\/\/|www\.|arxiv:|\d{4}\.\d{4,5}(v\d+)?$|pmid|pmc\d|isbn|ark:\/|[\dX][\dX\s-]{8,16}$|[a-z]+-\d{6,}(v\d+)?$)/i;
  const KIND = { doi: 'ce DOI', isbn: 'cet ISBN', arxiv: 'cet identifiant arXiv', pmid: 'ce PMID', pmcid: 'ce PMCID', hal: 'cet identifiant HAL', gallica: 'ce document Gallica', bnf: 'cette notice de la BnF', archive: 'ce document', openlibrary: 'cette notice', gbooks: 'ce livre', url: 'cette page', search: 'ce titre' };
  const OFFLINE = 'Pas de connexion à Internet : remplissage automatique impossible.';

  function failText(res) {
    if (!res) return 'La recherche a échoué.';
    if (res.offline) return OFFLINE;
    if (res.bad) return 'Identifiant non reconnu : DOI, ISBN, arXiv, PMID, HAL, ARK, lien ou titre attendu.';
    if (res.blocked) return 'Ce site refuse la lecture automatique de ses pages. Essayez avec le DOI, l\'ISBN ou le titre.';
    return `Aucune notice trouvée pour ${KIND[res.kind] || 'cet identifiant'}.`;
  }

  // Notices CSL JSON (ou BibTeX de HAL) → sources ; la base qui a répondu est gardée pour le message.
  function toSources(items) {
    const out = [];
    for (const it of items || []) {
      const list = it.bibtex ? B().parse(it.bibtex).list : B().fromCsl([it]);
      for (const s of list) out.push({ s, base: it.base || '' });
    }
    return out.filter((x) => x.s.title || x.s.authors.length);
  }

  // Ajoute une source trouvée ; une source déjà présente est seulement choisie.
  function addFound(s, base) {
    const known = sources.find((x) => B().sameSource(x, s));
    if (known) {
      editing = known;
      $('src-search').value = '';
      renderList();
      renderForm();
      message('Cette source est déjà dans le projet.');
      return known;
    }
    const src = { id: newId('s'), ...s };
    sources.push(src);
    editing = src;
    $('src-search').value = '';
    saveSources();
    renderList();
    renderForm();
    message(`Source ajoutée${base ? ` (${base})` : ''}. Vérifiez les champs avant de citer.`);
    return src;
  }

  function showFound(list) {
    const box = $('src-found');
    box.textContent = '';
    for (const { s, base } of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'src-item';
      b.innerHTML = '<b></b><span></span><i></i>';
      b.querySelector('b').textContent = `${s.authors.length ? shortAuthors(s) : 'Sans auteur'}, ${s.year || 's. d.'}`;
      b.querySelector('span').textContent = s.title || '(sans titre)';
      b.querySelector('i').textContent = [s.container, s.publisher, s.place, base].filter(Boolean).join(' · ');
      b.addEventListener('click', () => { addFound(s, base); $('src-found-box').hidden = true; });
      box.appendChild(b);
    }
    $('src-paste-box').hidden = true;
    $('src-zotero-box').hidden = true;
    $('src-found-box').hidden = false;
  }

  let looking = false;
  async function lookup() {
    const q = $('src-lookup').value.trim();
    if (!q || looking) return;
    looking = true;
    $('src-lookup').closest('.src-lookup').classList.add('busy');
    $('src-found-box').hidden = true;
    message('Recherche en ligne…');
    const res = await api.lookupSource(q).catch(() => null);
    looking = false;
    $('src-lookup').closest('.src-lookup').classList.remove('busy');
    const list = res && res.ok ? toSources(res.items) : [];
    if (!list.length) { message(failText(res && !res.ok ? res : { kind: res && res.kind }), true); return; }
    if (res.search) {
      message(`${list.length} notice${list.length > 1 ? 's' : ''} trouvée${list.length > 1 ? 's' : ''}.`);
      showFound(list);
      return;
    }
    addFound(list[0].s, list[0].base);
    $('src-lookup').value = '';
  }

  // Liste collée de DOI, ISBN ou liens : cherchés un à un.
  async function lookupMany(lines) {
    const got = [];
    let missed = 0;
    let offline = false;
    for (let i = 0; i < lines.length; i++) {
      message(`Recherche en ligne… ${i + 1} / ${lines.length}`);
      const res = await api.lookupSource(lines[i]).catch(() => null);
      if (res && res.offline) { offline = true; break; }
      const list = res && res.ok && !res.search ? toSources(res.items) : [];
      if (list.length) got.push(list[0].s); else missed++;
    }
    if (offline && !got.length) { message(OFFLINE, true); return 0; }
    const added = addImported(got, '');
    if (missed || offline) {
      const m = $('src-msg');
      m.textContent = m.textContent.replace(/\.$/, '') + (offline ? ' ; connexion perdue.' : `, ${missed} introuvable${missed > 1 ? 's' : ''}.`);
      m.classList.toggle('bad', !added);
    }
    return added;
  }

  $('src-lookup-go').addEventListener('click', lookup);
  $('src-lookup').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
  $('src-found-cancel').addEventListener('click', () => { $('src-found-box').hidden = true; });

  const ZOTERO_HELP = 'Zotero ne répond pas. Ouvrez Zotero, puis cochez « Autoriser les autres applications de cet ordinateur à communiquer avec Zotero » (Réglages > Avancé).';
  $('src-import-zotero').addEventListener('click', async () => {
    $('src-import-pop').hidden = true;
    $('src-paste-box').hidden = true;
    message('Connexion à Zotero…');
    const res = await api.zoteroCollections().catch(() => null);
    if (!res || !res.ok) { message(ZOTERO_HELP, true); return; }
    message('');
    const sel = $('src-zotero-coll');
    sel.textContent = '';
    sel.add(new Option('Toute la bibliothèque', ''));
    // Collections rangées sous leur parent, en retrait.
    const byParent = new Map();
    for (const c of res.collections) { const k = c.parent || ''; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(c); }
    const walk = (parent, depth) => {
      for (const c of (byParent.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
        sel.add(new Option('\u00a0\u00a0'.repeat(depth) + c.name, c.key));
        walk(c.key, depth + 1);
      }
    };
    walk('', 0);
    $('src-zotero-box').hidden = false;
  });
  $('src-zotero-ok').addEventListener('click', async () => {
    message('Lecture de Zotero…');
    const res = await api.zoteroItems($('src-zotero-coll').value).catch(() => null);
    if (!res || !res.ok) { message(ZOTERO_HELP, true); return; }
    if (addImported(B().fromZotero(res.items), 'Zotero') || res.items.length) $('src-zotero-box').hidden = true;
  });
  $('src-zotero-cancel').addEventListener('click', () => { $('src-zotero-box').hidden = true; });

  // ----- Boutons de la barre -----

  buildDatePop();
  $('date-btn').addEventListener('click', () => { if (window.FTApp.currentId()) insertDate('long', false); });
  $('date-more').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('date-pop');
    if (!pop.hidden) { pop.hidden = true; return; }
    buildDatePop();
    pop.hidden = false;
    if (window.FTToolbar && window.FTToolbar.placePop) window.FTToolbar.placePop(pop, $('date-more'));
  });
  $('date-btn').addEventListener('mousedown', (e) => e.preventDefault());
  $('date-more').addEventListener('mousedown', (e) => e.preventDefault());
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#date-pop, #date-more')) $('date-pop').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('date-pop').hidden = true; });
  $('endnote-btn').addEventListener('mousedown', (e) => e.preventDefault());
  $('endnote-btn').addEventListener('click', () => { if (window.FTApp.currentId()) insertEndnote(); });
  $('cite-btn').addEventListener('mousedown', (e) => e.preventDefault());
  // Volet ouvert : le bouton le referme.
  $('cite-btn').addEventListener('click', () => { if (docked()) showPane(false); else openDialog(null); });

  editor.addEventListener('input', () => scheduleSync());

  window.FTCite = {
    // Nouveau document ouvert.
    async load(settings) {
      style = ['auteur-date', 'numerique', 'note'].includes(settings && settings.citeStyle) ? settings.citeStyle : 'auteur-date';
      norm = window.FTBiblio && window.FTBiblio.NORMS.includes(settings && settings.citeNorm) ? settings.citeNorm : 'classique';
      loading = true;
      try { await loadSources(); } finally { loading = false; }
      if (sync()) changed();
      // Volet ouvert : il montre les sources du projet du nouveau document.
      if (docked()) {
        editing = editing && findSource(editing.id) ? findSource(editing.id) : sources[0] || null;
        citeTarget = null;
        $('src-cite').textContent = 'Citer cette source';
        renderList();
        renderForm();
      }
    },
    ready: () => !loading,
    getStyle: () => (style === 'auteur-date' ? undefined : style),
    getNorm: () => (norm === 'classique' ? undefined : norm),
    norm: () => norm,
    reference,
    onStyleChange(fn) { onChange = fn; },
    open: openDialog,
    // Source PDF côte à côte (sourcepdf.js).
    sources: () => sources,
    loadSources,
    findSource,
    label: (s) => `${shortAuthors(s)}, ${s.year || 's. d.'}`,
    addSource(fields) {
      const s = { id: newId('s'), type: 'livre', authors: [], title: '', year: '', ...fields };
      sources.push(s);
      saveSources();
      return s;
    },
    saveSources,
    // Passage cité (entre guillemets, si donné) puis la citation de la source, à l'endroit du curseur.
    citeAt({ sourceId, page, quote, open, close }) {
      if (!findSource(sourceId)) return false;
      if (engine) {
        const span = `<span class="ft-cite" data-src="${esc(sourceId)}"${page ? ` data-page="${esc(String(page))}"` : ''} contenteditable="false">(…)</span>`;
        return engine.inline(quote ? esc(open + quote + close) + '\u00a0' + span : span, 'avant');
      }
      const span = document.createElement('span');
      span.className = 'ft-cite';
      span.dataset.src = sourceId;
      if (page) span.dataset.page = String(page);
      span.setAttribute('contenteditable', 'false');
      span.textContent = '(…)';
      if (quote) {
        const frag = document.createDocumentFragment();
        frag.append(document.createTextNode(open + quote + close + '\u00a0'), span);
        const holder = document.createElement('span');
        holder.append(frag);
        if (!insertInline(holder, 'avant')) return false;
        holder.replaceWith(...holder.childNodes);
      } else if (!insertInline(span, 'avant')) {
        return false;
      }
      // Le curseur reste après la citation, pour continuer à écrire.
      const sel = window.getSelection();
      const r = document.createRange();
      r.setStartAfter(span);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      sync();
      changed();
      return true;
    },
    insertEndnote,
    insertDate: () => insertDate('long', false),
    useInline(fn) { engineInline = fn; },
    // Moteur 2.0 : le moteur écrit et tient à jour notes de fin, citations et bibliographies.
    useEngine(mount, api) {
      editor = mount;
      engine = api;
    },
    style: () => style,
    roman,
    citeLabel,
    noteHtml,
    biblioHtml,
    biblioList,
    formatDate
  };
})();
