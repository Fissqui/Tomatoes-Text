// Sources côte à côte : un PDF s'ouvre dans un volet à droite du texte (pdf.js, hors ligne). Le PDF est
// copié dans le dossier du projet (« Sources PDF ») et rattaché à une source du projet (sources.json :
// champs pdf, pdfFirst = numéro imprimé de la première page du PDF, highlights). Un passage sélectionné
// dans le PDF se cite d'un clic : le passage entre guillemets puis la citation (auteur, année, page) à
// l'endroit du curseur dans le texte ; le passage reste surligné dans le PDF.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.frameText;
  const pane = $('pdfpane');
  const pagesBox = $('pdf-pages');
  const bar = $('pdf-selbar');
  const PREFS = 'ft-source-pdf';
  const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];

  let lib = null;         // module pdf.js, chargé à la première ouverture
  let pdf = null;         // document pdf.js ouvert
  let source = null;      // source du projet rattachée au PDF ouvert
  // Les sources sont relues du disque (ouverture d'un document, fenêtre des sources) : on reprend toujours
  // l'objet actuel de la liste, sinon un changement irait dans une copie périmée.
  const fresh = () => { if (source) source = window.FTCite.findSource(source.id) || source; return source; };
  let zoomIndex = 3;
  let fitWidth = true;
  let observer = null;
  let token = 0;          // ouverture en cours (une plus récente annule l'ancienne)
  let lastSel = null;     // { text, pages } de la sélection dans le PDF

  const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch { return {}; } })();
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* indisponible */ } };
  if (prefs.width) pane.style.setProperty('--pdf-w', prefs.width + 'px');

  // pdf.js est chargé à la première ouverture (scripts ordinaires préparés par scripts/pdfjs-classique.js :
  // pdf.worker.js d'abord, pour que la lecture du PDF se fasse dans la page même).
  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(src));
    document.head.append(s);
  });
  let loading = null;
  function loadLib() {
    if (!loading) {
      loading = (async () => {
        await loadScript('vendor/pdfjs/pdf.worker.js');
        await loadScript('vendor/pdfjs/pdf.js');
        lib = window.pdfjsLib;
        return lib;
      })();
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  // Polices de base, tables de caractères (chinois…) : lues par le logiciel, pas par la page.
  const vendorBytes = async (rel) => {
    const b64 = await api.pdfjsData(rel);
    if (!b64) throw new Error(rel);
    return base64ToBytes(b64);
  };
  class CMaps { async fetch({ name }) { return { cMapData: await vendorBytes('cmaps/' + name + '.bcmap'), isCompressed: true }; } }
  class Fonts { async fetch({ filename }) { return vendorBytes('standard_fonts/' + filename); } }
  class Wasm { async fetch({ filename }) { return vendorBytes('wasm/' + filename); } }
  const OPTIONS = {
    verbosity: 0, // erreurs seulement (pas l'avertissement de lecture dans la page)
    isEvalSupported: false,
    useWorkerFetch: false,
    CMapReaderFactory: CMaps,
    StandardFontDataFactory: Fonts,
    WasmFactory: Wasm,
    cMapUrl: 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'standard_fonts/',
    wasmUrl: 'wasm/'
  };

  const base64ToBytes = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // ----- Volet -----

  function show(on) {
    pane.classList.toggle('open', on);
    pane.setAttribute('aria-hidden', String(!on));
    const btn = $('pdf-source-btn');
    if (btn) btn.classList.toggle('on', on);
    if (!on) bar.hidden = true;
  }

  async function toggle() {
    if (pane.classList.contains('open')) return show(false);
    show(true);
    await window.FTCite.loadSources();
    fillSourceList();
    if (!pdf) {
      const last = window.FTCite.findSource(prefs.last) || window.FTCite.sources().find((s) => s.pdf);
      if (last && last.pdf) await openSource(last);
      else empty();
    }
  }

  function empty() {
    pagesBox.replaceChildren();
    const p = document.createElement('div');
    p.className = 'pdf-empty';
    p.textContent = 'Aucun PDF ouvert. « Ouvrir un PDF… » le copie dans le projet et l’ajoute aux sources.';
    pagesBox.append(p);
    $('pdf-info').hidden = true;
    $('pdf-pageno').textContent = '';
  }

  // Liste des PDF du projet (sources qui en ont un).
  function fillSourceList() {
    fresh();
    const sel = $('pdf-list');
    const list = window.FTCite.sources().filter((s) => s.pdf);
    sel.replaceChildren(...list.map((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${window.FTCite.label(s)} — ${s.title || s.pdf}`;
      return o;
    }));
    sel.hidden = list.length < 2;
    if (source) sel.value = source.id;
    // Source rattachée : toutes les sources du projet (pour rattacher le PDF à une autre).
    const link = $('pdf-link');
    link.replaceChildren(...window.FTCite.sources().map((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${window.FTCite.label(s)}${s.title ? ' — ' + s.title : ''}`;
      return o;
    }));
    if (source) link.value = source.id;
  }

  function fillInfo() {
    fresh();
    $('pdf-info').hidden = !source;
    if (!source) return;
    $('pdf-first').value = String(source.pdfFirst || 1);
    fillSourceList();
  }

  // ----- Ouverture -----

  async function importPdf() {
    if (!window.FTApp.currentId()) return;
    const res = await api.importPdf();
    if (!res) return;
    await window.FTCite.loadSources();
    let s = window.FTCite.sources().find((x) => x.pdf === res.file);
    const bytes = base64ToBytes(res.data);
    if (!s) {
      // Nouvelle source, remplie avec les informations du PDF (à vérifier par « Modifier »).
      const meta = await readMeta(bytes);
      s = window.FTCite.addSource({
        type: 'livre',
        title: meta.title || res.name,
        authors: meta.authors,
        year: meta.year,
        pdf: res.file,
        pdfFirst: 1
      });
    }
    await openSource(s, bytes);
  }

  async function readMeta(bytes) {
    try {
      const L = await loadLib();
      const doc = await L.getDocument({ ...OPTIONS, data: bytes.slice() }).promise;
      const { info } = await doc.getMetadata();
      doc.destroy();
      const title = String((info && info.Title) || '').trim();
      // « Prénom Nom » → « Nom, Prénom » ; plusieurs auteurs séparés par ; ou « et ».
      const authors = String((info && info.Author) || '').split(/\s*(?:;|\bet\b|\band\b|&)\s*/).map((a) => a.trim()).filter(Boolean)
        .map((a) => (a.includes(',') ? a : a.split(/\s+/).length > 1 ? `${a.split(/\s+/).pop()}, ${a.split(/\s+/).slice(0, -1).join(' ')}` : a));
      const m = /D:(\d{4})/.exec((info && info.CreationDate) || '');
      return { title: /^(untitled|sans titre|microsoft word)/i.test(title) ? '' : title, authors, year: m ? m[1] : '' };
    } catch {
      return { title: '', authors: [], year: '' };
    }
  }

  async function openSource(s, bytes) {
    const my = ++token;
    source = s;
    prefs.last = s.id;
    savePrefs();
    fillInfo();
    pagesBox.replaceChildren();
    const wait = document.createElement('div');
    wait.className = 'pdf-empty';
    wait.textContent = 'Ouverture…';
    pagesBox.append(wait);
    try {
      if (!bytes) {
        const b64 = await api.readPdf(s.pdf);
        if (!b64) throw new Error('absent');
        bytes = base64ToBytes(b64);
      }
      const L = await loadLib();
      const doc = await L.getDocument({ ...OPTIONS, data: bytes }).promise;
      if (my !== token) { doc.destroy(); return; }
      if (pdf) pdf.destroy();
      pdf = doc;
      await layout();
    } catch (e) {
      console.warn('Source PDF :', e && e.message);
      if (my !== token) return;
      pagesBox.replaceChildren();
      const p = document.createElement('div');
      p.className = 'pdf-empty';
      p.textContent = `PDF introuvable ou illisible : « ${s.pdf} » (dossier « Sources PDF » du projet).`;
      pagesBox.append(p);
    }
  }

  // ----- Pages : cadres à la bonne taille tout de suite, dessin quand elles approchent de la vue -----

  let sizes = [];
  async function layout() {
    if (!pdf) return;
    const my = token;
    if (observer) observer.disconnect();
    pagesBox.replaceChildren();
    sizes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      if (my !== token) return;
      const v = p.getViewport({ scale: 1 });
      sizes.push([v.width, v.height]);
    }
    const scale = currentScale();
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) draw(e.target);
    }, { root: pagesBox, rootMargin: '600px 0px' });
    sizes.forEach(([w, h], i) => {
      const div = document.createElement('div');
      div.className = 'pdf-page';
      div.dataset.page = String(i + 1);
      div.style.width = Math.round(w * scale) + 'px';
      div.style.height = Math.round(h * scale) + 'px';
      pagesBox.append(div);
      observer.observe(div);
    });
    $('pdf-zoom-label').textContent = Math.round(scale * 100) + ' %';
    updatePageNo();
  }

  function currentScale() {
    if (fitWidth && sizes.length) return Math.max(0.3, (pagesBox.clientWidth - 28) / Math.max(...sizes.map((s) => s[0])));
    return ZOOMS[zoomIndex];
  }

  async function draw(div) {
    if (div.dataset.drawn || !pdf) return;
    div.dataset.drawn = '1';
    const n = Number(div.dataset.page);
    const page = await pdf.getPage(n);
    const scale = currentScale();
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    const hl = document.createElement('div');
    hl.className = 'pdf-hl-layer';
    const text = document.createElement('div');
    text.className = 'textLayer';
    div.style.setProperty('--scale-factor', String(scale));
    div.replaceChildren(canvas, hl, text);
    try {
      await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
      const layer = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport });
      await layer.render();
    } catch { /* page illisible : elle reste blanche */ }
    paintHighlights(div);
  }

  function zoom(step) {
    if (!pdf) return;
    const now = currentScale();
    if (fitWidth) {
      fitWidth = false;
      zoomIndex = ZOOMS.findIndex((z) => z >= now - 0.01);
      if (zoomIndex < 0) zoomIndex = ZOOMS.length - 1;
      if (step > 0 && ZOOMS[zoomIndex] <= now + 0.01) zoomIndex++;
      if (step < 0) zoomIndex--;
    } else {
      zoomIndex += step;
    }
    zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, zoomIndex));
    relayout();
  }

  // Nouvelle taille : on garde la page affichée.
  async function relayout() {
    const at = currentPage();
    await layout();
    const div = pagesBox.querySelector(`.pdf-page[data-page="${at}"]`);
    if (div) pagesBox.scrollTop = div.offsetTop - 8;
  }

  function currentPage() {
    const top = pagesBox.scrollTop + 40;
    let n = 1;
    for (const d of pagesBox.querySelectorAll('.pdf-page')) { if (d.offsetTop <= top) n = Number(d.dataset.page); else break; }
    return n;
  }
  function updatePageNo() {
    $('pdf-pageno').textContent = pdf ? `${currentPage()} / ${pdf.numPages}` : '';
  }

  // ----- Numéro de page imprimé -----

  const printed = (n) => n + (Number(fresh() && source.pdfFirst) || 1) - 1;
  function pageText(pages) {
    const a = printed(Math.min(...pages));
    const b = printed(Math.max(...pages));
    return a === b ? String(a) : `${a}-${b}`;
  }

  // ----- Surlignages (gardés avec la source, en fractions de la page) -----

  function paintHighlights(div) {
    const layer = div.querySelector('.pdf-hl-layer');
    if (!layer || !fresh()) return;
    const n = Number(div.dataset.page);
    layer.replaceChildren();
    (source.highlights || []).forEach((h, k) => {
      if (h.page !== n) return;
      for (const [x, y, w, hh] of h.rects) {
        const r = document.createElement('div');
        r.className = 'pdf-hl';
        r.dataset.k = String(k);
        Object.assign(r.style, { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: hh * 100 + '%' });
        layer.append(r);
      }
    });
  }

  function rectsOf(range) {
    const byPage = new Map();
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const div = [...pagesBox.querySelectorAll('.pdf-page')].find((d) => {
        const b = d.getBoundingClientRect();
        return r.top + r.height / 2 >= b.top && r.top + r.height / 2 <= b.bottom;
      });
      if (!div) continue;
      const b = div.getBoundingClientRect();
      const n = Number(div.dataset.page);
      if (!byPage.has(n)) byPage.set(n, []);
      byPage.get(n).push([(r.left - b.left) / b.width, (r.top - b.top) / b.height, r.width / b.width, r.height / b.height].map((v) => Math.round(v * 10000) / 10000));
    }
    return byPage;
  }

  function addHighlight(range, text) {
    if (!fresh()) return;
    const byPage = rectsOf(range);
    source.highlights = source.highlights || [];
    for (const [page, rects] of byPage) source.highlights.push({ page, rects, text: text.slice(0, 500) });
    window.FTCite.saveSources();
    for (const page of byPage.keys()) {
      const div = pagesBox.querySelector(`.pdf-page[data-page="${page}"]`);
      if (div) paintHighlights(div);
    }
  }

  // Surlignage sous la souris (calque sans pointeur : recherche par la position, pas par l'élément touché).
  function highlightAt(x, y) {
    for (const el of pagesBox.querySelectorAll('.pdf-hl')) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
    }
    return null;
  }

  function removeHighlight(k) {
    const h = source.highlights && source.highlights[k];
    if (!h) return;
    source.highlights.splice(k, 1);
    window.FTCite.saveSources();
    // Les numéros des surlignages suivants changent : toutes les pages dessinées sont refaites.
    for (const div of pagesBox.querySelectorAll('.pdf-page[data-drawn]')) paintHighlights(div);
  }

  function highlightMenu(e) {
    if (!fresh()) return false;
    const hit = highlightAt(e.clientX, e.clientY);
    if (!hit) return false;
    e.preventDefault();
    bar.hidden = true;
    window.FTSidebar.showMenu(e.clientX, e.clientY, [{ text: 'Retirer le surlignage', action: () => removeHighlight(Number(hit.dataset.k)) }]);
    return true;
  }

  // Clic droit sur un surlignage, ou clic simple (sans sélection) : le retirer.
  pagesBox.addEventListener('contextmenu', highlightMenu);
  pagesBox.addEventListener('click', (e) => {
    if (e.button !== 0 || e.detail > 1) return;
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) return;
    highlightMenu(e);
  });

  // ----- Sélection dans le PDF -----

  // Texte propre : lignes recollées, mots coupés en fin de ligne recollés, espaces simples.
  const tidy = (s) => s.replace(/­/g, '').replace(/(\p{L})-\s*\n\s*(\p{Ll})/gu, '$1$2').replace(/\s+/g, ' ').trim();

  function selectionInPdf() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!pagesBox.contains(range.commonAncestorContainer)) return null;
    const text = tidy(sel.toString());
    if (!text) return null;
    const pages = [...rectsOf(range).keys()];
    return pages.length ? { range: range.cloneRange(), text, pages } : null;
  }

  function placeBar() {
    lastSel = selectionInPdf();
    if (!lastSel || !fresh()) { bar.hidden = true; return; }
    const rects = [...lastSel.range.getClientRects()].filter((r) => r.width > 0);
    const last = rects[rects.length - 1] || lastSel.range.getBoundingClientRect();
    const box = pane.getBoundingClientRect();
    bar.hidden = false;
    $('pdf-sel-page').textContent = 'p. ' + pageText(lastSel.pages);
    const left = Math.max(box.left + 6, Math.min(box.right - bar.offsetWidth - 6, last.left));
    const top = last.bottom + 6 + bar.offsetHeight > box.bottom ? last.top - bar.offsetHeight - 6 : last.bottom + 6;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }

  pagesBox.addEventListener('mouseup', () => setTimeout(placeBar, 0));
  pagesBox.addEventListener('keyup', () => setTimeout(placeBar, 0));
  pagesBox.addEventListener('scroll', () => { bar.hidden = true; updatePageNo(); });
  document.addEventListener('mousedown', (e) => { if (!bar.hidden && !bar.contains(e.target)) bar.hidden = true; });

  // Guillemets selon la langue principale du document.
  function quoteMarks() {
    const lang = window.FTLang && window.FTLang.principal ? window.FTLang.principal() : 'fr';
    if (lang === 'fr') return ['« ', ' »'];
    if (lang === 'de') return ['„', '“'];
    if (lang === 'zh') return ['“', '”'];
    if (['es', 'it', 'pt'].includes(lang)) return ['«', '»'];
    return ['“', '”'];
  }

  function cite(withQuote) {
    const s = lastSel;
    bar.hidden = true;
    if (!s || !fresh()) return;
    const [open, close] = quoteMarks();
    const ok = window.FTCite.citeAt({ sourceId: source.id, page: pageText(s.pages), quote: withQuote ? s.text : '', open, close });
    if (ok && withQuote) addHighlight(s.range, s.text);
    window.getSelection().removeAllRanges();
    if (!ok && window.FTApp.flash) window.FTApp.flash('Placez d’abord le curseur dans le texte.');
  }

  bar.addEventListener('mousedown', (e) => e.preventDefault());
  $('pdf-cite').addEventListener('click', () => cite(true));
  $('pdf-cite-ref').addEventListener('click', () => cite(false));
  $('pdf-highlight').addEventListener('click', () => {
    const s = lastSel;
    bar.hidden = true;
    if (s) addHighlight(s.range, s.text);
    window.getSelection().removeAllRanges();
  });

  // ----- Commandes du volet -----

  $('pdf-open').addEventListener('click', importPdf);
  $('pdf-close').addEventListener('click', () => show(false));
  $('pdf-zoom-out').addEventListener('click', () => zoom(-1));
  $('pdf-zoom-in').addEventListener('click', () => zoom(1));
  $('pdf-zoom-fit').addEventListener('click', () => { fitWidth = true; relayout(); });
  $('pdf-list').addEventListener('change', () => {
    const s = window.FTCite.findSource($('pdf-list').value);
    if (s && s !== source) openSource(s);
  });
  // Rattacher le PDF à une autre source du projet (ses surlignages suivent).
  $('pdf-link').addEventListener('change', () => {
    const to = window.FTCite.findSource($('pdf-link').value);
    if (!to || !fresh() || to === source) return;
    for (const k of ['pdf', 'pdfFirst', 'highlights']) { if (source[k] !== undefined) to[k] = source[k]; delete source[k]; }
    source = to;
    prefs.last = to.id;
    savePrefs();
    window.FTCite.saveSources();
    fillInfo();
  });
  $('pdf-first').addEventListener('change', () => {
    if (!fresh()) return;
    const v = Math.max(1, Math.round(Number(String($('pdf-first').value).replace(',', '.')) || 1));
    source.pdfFirst = v;
    window.FTCite.saveSources();
    if (lastSel) $('pdf-sel-page').textContent = 'p. ' + pageText(lastSel.pages);
  });
  $('pdf-edit').addEventListener('click', () => { if (fresh()) window.FTCite.open(null, source.id); });

  // Largeur du volet : poignée sur son bord gauche.
  $('pdf-resize').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = pane.getBoundingClientRect().width;
    document.body.classList.add('resizing-col');
    const move = (ev) => {
      const w = Math.max(300, Math.min(window.innerWidth * 0.7, w0 - (ev.clientX - x0)));
      pane.style.setProperty('--pdf-w', Math.round(w) + 'px');
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.classList.remove('resizing-col');
      prefs.width = Math.round(pane.getBoundingClientRect().width);
      savePrefs();
      if (fitWidth) relayout();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // Volet élargi ou rétréci (fenêtre, autre volet ouvert) : « Ajuster à la largeur » suit.
  let resizeTimer = null;
  let lastWidth = 0;
  new ResizeObserver(() => {
    const w = Math.round(pane.getBoundingClientRect().width);
    if (w === lastWidth) return;
    lastWidth = w;
    // (Pendant que l'on tire la poignée du volet : fait une fois, au lâcher.)
    if (!pdf || !fitWidth || !pane.classList.contains('open') || document.body.classList.contains('resizing-col')) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 250);
  }).observe(pane);

  const btn = $('pdf-source-btn');
  if (btn) {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', toggle);
  }

  window.FTSourcePdf = {
    toggle,
    // Changement de projet : le PDF ouvert appartient à l'ancien.
    reset() {
      token++;
      if (pdf) { pdf.destroy(); pdf = null; }
      source = null;
      if (pane.classList.contains('open')) empty();
    },
    // Pour le banc d'essai.
    state: () => ({ open: pane.classList.contains('open'), source: source && source.id, pages: pdf ? pdf.numPages : 0 })
  };
})();
