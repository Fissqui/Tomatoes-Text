// Mise en page : images (bouton, glisser-déposer, coller), placement des images, tableaux et
// encadrés par rapport au texte (habillage, position libre, ancrage), texte en colonnes
// (tout le document ou une zone) et majuscule automatique en début de phrase.
(function () {
  // Moteur 2.0 : les objets sont dans la zone du nouveau moteur (useEngine) ; S() est alors le pont
  // d'objets.js (chaque geste devient une modification du moteur, annulable d'un coup).
  let editor = document.getElementById('editor');
  const legacyEditor = editor;
  const page = document.getElementById('page');
  let S = () => window.FTStructure;
  let engine = false;
  // Écoutes de la zone d'écriture reprises par la zone du moteur.
  const engineListeners = [];
  function listen(type, fn, opts) {
    editor.addEventListener(type, fn, opts);
    engineListeners.push([type, fn, opts]);
  }
  // Après la modification en cours (le moteur refait alors les éléments touchés).
  const after = (fn) => (S().after ? S().after(fn) : fn());
  // Mesure qui touche l'objet un instant puis le remet en l'état : le moteur n'en tient pas compte.
  const quiet = (fn) => (S().quiet ? S().quiet(fn) : fn());
  // Zoom de la page (zoom.js) : les écarts mesurés à l'écran sont divisés par ce facteur avant d'être posés en pixels.
  const Z = () => editor.currentCSSZoom || 1;
  const showMenu = (...args) => window.FTSidebar.showMenu(...args);
  const check = (on, text) => (on ? '✓ ' : ' ') + text;

  // ----- Images : données gardées en mémoire, adresses courtes dans le texte -----
  // Le texte affiche les images par des adresses « blob: » (courtes, pour que l'annulation reste
  // légère) ; le fichier enregistré contient les données de l'image elle-même.

  const images = new Map(); // adresse blob: -> données (data:…)
  const urls = new Map(); // données (data:…) -> adresse blob: (une seule adresse par image)
  const blobs = new Map(); // adresse blob: -> données binaires (enregistrement : sendImages)
  const MAX_SIDE = 1600; // les grandes photos sont réduites à l'import (fichiers plus légers)

  // Une image déjà vue (document rouvert, image copiée) reprend son adresse : elle n'est pas
  // décodée ni gardée une deuxième fois en mémoire.
  function blobUrlFor(dataUrl) {
    const known = urls.get(dataUrl);
    if (known) return known;
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!m) return dataUrl;
    let bytes;
    if (m[2]) {
      const bin = atob(m[3]);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(m[3]));
    }
    const blob = new Blob([bytes], { type: m[1] || 'image/png' });
    const url = URL.createObjectURL(blob);
    blobs.set(url, blob);
    images.set(url, dataUrl);
    urls.set(dataUrl, url);
    return url;
  }

  // Autre version affichée d'une image (schéma avec ses polices, diagram.js) : le document garde saved.
  function displayUrl(dataUrl, saved) {
    const url = blobUrlFor(dataUrl);
    images.set(url, saved);
    return url;
  }

  // Images d'un document ouvert ou collé : adresses blob:, et enveloppe .ft-image pour les images seules.
  function adopt(root) {
    root.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('data:')) img.src = blobUrlFor(src);
      else if (!src.startsWith('blob:') || !images.has(src)) { img.remove(); return; } // image extérieure : non affichable
      img.draggable = false;
      img.alt = img.alt || '';
      // (Portrait d'un repère biographique : dans son propre cadre, bio.js.)
      if (!img.parentElement.classList.contains('ft-image') && !img.parentElement.classList.contains('ft-bio-photo')) {
        const box = document.createElement('span');
        box.className = 'ft-image';
        box.dataset.wrap = 'ligne';
        img.replaceWith(box);
        box.appendChild(img);
      }
      img.parentElement.setAttribute('contenteditable', 'false');
    });
  }

  const serialize = (html) => html.replace(/blob:[^"'\s)]+/g, (url) => images.get(url) || url);

  // Enregistrement : chaque image n'est envoyée qu'une fois au processus principal, qui la garde ; le
  // texte envoyé ne porte ensuite que sa référence (ftimg-<session>-<n>). Recopier les données de toutes
  // les images à chaque enregistrement figeait la fenêtre (plus d'une seconde pour quelques photos).
  // L'image part en binaire (lue depuis son adresse blob:, sans bloquer la fenêtre) ; le processus
  // principal refait les mêmes données (data:…;base64,…).
  const imgSession = 'ftimg-' + Math.random().toString(36).slice(2, 10);
  const imgIds = new Map(); // adresse blob: -> référence
  const imgSent = new Set(); // références déjà reçues par le processus principal
  function packImages(raw) {
    const pending = [];
    const html = raw.replace(/blob:[^"'\s)]+/g, (url) => {
      const data = images.get(url);
      if (!data) return url;
      let id = imgIds.get(url);
      if (!id) { id = `${imgSession}-${imgIds.size + 1}`; imgIds.set(url, id); }
      if (!imgSent.has(id) && !pending.some((p) => p.id === id)) pending.push({ id, url, data });
      return id;
    });
    return { html, pending, session: imgSession };
  }
  async function sendImages(pack) {
    for (const { id, url, data } of pack.pending) {
      if (imgSent.has(id)) continue;
      const comma = data.indexOf(',');
      const head = data.slice(0, comma + 1);
      if (/;base64,$/.test(head) && blobs.has(url)) {
        const buf = new Uint8Array(await blobs.get(url).arrayBuffer());
        await window.frameText.saveImage(id, head, buf);
      } else {
        await window.frameText.saveImage(id, data, null);
      }
      imgSent.add(id);
    }
  }
  // Processus principal sans ces images : tout est renvoyé.
  const resetImages = () => imgSent.clear();

  const readFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  // Lit une image et la réduit si elle est très grande. Renvoie { data, width } (largeur affichée).
  async function prepare(file) {
    const data = await readFile(file);
    const img = await loadImage(data);
    const w = img.naturalWidth || 300;
    const h = img.naturalHeight || 200;
    // Les GIF (animés) et les dessins SVG sont gardés tels quels.
    if (/image\/(gif|svg)/.test(file.type)) return { data, width: w };
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    if (scale === 1 && file.size < 1.5e6) return { data, width: w };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let transparent = false;
    if (file.type !== 'image/jpeg') {
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 250) { transparent = true; break; }
    }
    const out = transparent ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
    return { data: out, width: canvas.width };
  }

  function makeImage(src, width) {
    const box = document.createElement('span');
    box.className = 'ft-image';
    box.setAttribute('contenteditable', 'false');
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.draggable = false;
    box.appendChild(img);
    // Taille de départ : la taille réelle de l'image, sans dépasser la largeur du texte.
    const full = editor.clientWidth || 640;
    box.style.width = Math.max(10, Math.min(100, Math.round((width / full) * 100))) + '%';
    return box;
  }

  const isImageFile = (f) => f && /^image\//.test(f.type);

  // Insère des images à l'endroit indiqué (ou à celui du curseur), chacune sur sa propre ligne.
  async function insertImages(files, range, point) {
    const list = [...files].filter(isImageFile);
    if (!list.length) return;
    if (range) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      S().restoreSelection();
    }
    const ready = [];
    for (const file of list) {
      try {
        ready.push(await prepare(file));
      } catch {
        flash(`Image illisible : ${file.name}`);
      }
    }
    if (!ready.length) return;
    // Moteur 2.0 (version 2.5) : images en déplacement libre, au curseur ou à l'endroit du dépôt (moteur/images.js).
    if (engine && window.FTImages && window.FTImages.active()) {
      let at = point || null;
      for (const { data, width } of ready) {
        const el = makeImage(blobUrlFor(data), width);
        el.style.width = Math.min(50, parseFloat(el.style.width) || 50) + '%';
        window.FTImages.insert(el, at);
        at = null;
      }
      return;
    }
    S().checkpoint();
    let last = null;
    for (const { data, width } of ready) {
      last = makeImage(blobUrlFor(data), width);
      S().insertBlockObject(last);
    }
    S().changed();
    // L'image est sélectionnée quand elle est affichée (sa taille est alors connue).
    const img = last.querySelector('img');
    const select = () => { if (last.isConnected || engine) S().selectObject(last); };
    if (img.complete) select();
    else img.addEventListener('load', select, { once: true });
  }

  function flash(text) {
    const status = document.getElementById('status-save');
    if (status) status.textContent = text;
  }

  const imageBtn = document.getElementById('image-btn');
  const imageFile = document.getElementById('image-file');
  imageBtn.addEventListener('mousedown', (e) => e.preventDefault());
  imageBtn.addEventListener('click', () => { imageFile.value = ''; imageFile.click(); });
  imageFile.addEventListener('change', () => insertImages(imageFile.files));

  // Glisser une image depuis l'ordinateur sur la page.
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (hasFiles(e)) e.preventDefault(); });
  page.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  page.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    let range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    editor.focus({ preventScroll: true });
    insertImages(e.dataTransfer.files, range, { x: e.clientX, y: e.clientY });
  });

  // Coller une image (copiée depuis un navigateur, une capture d'écran…).
  listen('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [...cd.files].filter(isImageFile);
    // Un texte copié (depuis Word par exemple) arrive aussi avec une image de lui-même : le texte l'emporte.
    if (!files.length || (cd.getData('text/plain') || '').trim()) return;
    e.preventDefault();
    const sel = window.getSelection();
    insertImages(files, sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null);
  }, true);
  editor.addEventListener('input', (e) => {
    if (/^insertFrom(Paste|Drop)/.test(e.inputType || '') && editor.querySelector('img:not(.ft-image > img), img[src^="data:"]')) adopt(editor);
    placeZoneOutline();
  });

  // ----- Placement des objets par rapport au texte -----
  // Tableaux, encadrés, images et schémas suivent les mêmes règles.
  // Position :
  //   « rigide » (par défaut) : l'objet se déplace seulement vers le haut ou le bas, entre les blocs voisins ;
  //   « texte mouvant » : il se déplace librement, le texte s'écarte autour de lui ;
  //   « mouvement fixe » : il ne se déplace pas ; seule sa taille change.
  // Habillage : au niveau du texte (le texte lui laisse la place), devant ou derrière le texte (le texte ne bouge pas).
  // Dans le texte enregistré :
  //   data-wrap   (rien) : bloc entre les paragraphes ; « gauche » / « droite » : à côté du texte (--mx : écart avec le bord) ;
  //               « devant » / « derriere » (--x, --y ; data-anchor="page" : fixé sur la page) ;
  //               « ligne » : image dans une ligne de texte (anciens documents).
  //   data-pos    seulement quand data-wrap ne suffit pas : « fixe » (bloc, ou à côté du texte), « rigide » (devant ou derrière).
  //   data-align  bloc : « gauche », « droite » ou « libre » (--ml : marge de gauche) ; centré sinon.
  // Taille : largeur en % du texte ; image : --ar (proportions choisies) ; tableau : hauteur des lignes ;
  // encadré : hauteur minimale.

  const svg = (body) => `<svg class="thin" viewBox="0 0 16 16">${body}</svg>`;
  const block = (x) => `<rect class="fill" x="${x}" y="5" width="7" height="6"/>`;
  const ICONS = {
    rigide: svg('<path d="M1.5 2h13M1.5 14h13"/><rect class="fill" x="2" y="5" width="8" height="6"/><path d="M13 4.6v6.8M11.7 5.9 13 4.6l1.3 1.3M11.7 10.1 13 11.4l1.3-1.3"/>'),
    mouvant: svg('<rect class="fill" x="5" y="5" width="6" height="6"/><path d="M8 1.2v13.6M1.2 8h13.6M6.7 2.5 8 1.2l1.3 1.3M6.7 13.5 8 14.8l1.3-1.3M2.5 6.7 1.2 8l1.3 1.3M13.5 6.7 14.8 8l-1.3 1.3"/>'),
    fixe: svg('<rect class="fill" x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2M8 9.6v2"/>'),
    niveau: svg('<rect class="fill" x="1.5" y="4" width="6" height="6.5"/><path d="M1.5 1.8h13M9.5 4.5h5M9.5 7.2h5M9.5 10h5M1.5 13h13"/>'),
    derriere: svg('<rect class="fill" x="4" y="2.5" width="8" height="11"/><path d="M1.5 5h13M1.5 8h13M1.5 11h13"/>'),
    devant: svg('<path d="M1.5 4h13M1.5 8h13M1.5 12h13"/><rect class="solid" x="4.5" y="5" width="7" height="6"/>'),
    alignGauche: svg('<path d="M1.5 2.5h13M1.5 13.5h13"/>' + block(1.5)),
    alignCentre: svg('<path d="M1.5 2.5h13M1.5 13.5h13"/>' + block(4.5)),
    alignDroite: svg('<path d="M1.5 2.5h13M1.5 13.5h13"/>' + block(7.5)),
    legende: svg('<rect class="fill" x="3" y="1.5" width="10" height="7.5"/><path d="M3.5 11.8h9M5.5 14.3h5"/>'),
    cadre: svg('<rect x="1.8" y="1.8" width="12.4" height="12.4" rx="0.8"/><rect class="fill" x="4.6" y="4.6" width="6.8" height="6.8"/>'),
    supprimer: svg('<path d="M2.5 4.2h11M6.2 4.2V2.5h3.6v1.7M4 4.2l.8 9.3h6.4l.8-9.3M6.6 6.6v4.6M9.4 6.6v4.6"/>')
  };
  const POSITIONS = [['rigide', 'Position rigide'], ['mouvant', 'Texte mouvant'], ['fixe', 'Mouvement fixe']];
  const WRAPS = [['niveau', 'Au niveau du texte'], ['devant', 'Devant le texte'], ['derriere', 'Derrière le texte']];
  const ALIGNS = [['gauche', 'Aligner à gauche', 'alignGauche'], ['', 'Centrer', 'alignCentre'], ['droite', 'Aligner à droite', 'alignDroite']];
  const WIDTHS = [25, 50, 75, 100];
  const TEXT_BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6, td, th, div:not(.ft-cols):not(.ft-footnotes):not(.ft-math)';

  const isImage = (obj) => obj.classList.contains('ft-image');
  // Tableaux, encadrés et blocs de code (2.2.12) : même position et même taille, seul leur contenu change.
  const BOXES = 'table.ft-table, blockquote.ft-callout, pre.ft-code';
  const isBox = (obj) => obj.matches(BOXES);
  const isObject = (obj) => !!obj && obj.nodeType === Node.ELEMENT_NODE && (isImage(obj) || isBox(obj));
  const isFree = (obj) => obj.dataset.wrap === 'devant' || obj.dataset.wrap === 'derriere';
  const isFloat = (obj) => obj.dataset.wrap === 'gauche' || obj.dataset.wrap === 'droite';
  const isInline = (obj) => obj.dataset.wrap === 'ligne';
  const isContainer = (el) => el === editor || S().isZone(el);

  // Position et habillage d'un objet (les anciens documents n'ont que data-wrap et data-anchor).
  function posOf(obj) {
    if (isInline(obj)) return 'ligne';
    if (obj.dataset.pos === 'fixe') return 'fixe';
    if (isFree(obj)) {
      if (obj.dataset.pos === 'rigide') return 'rigide';
      return obj.dataset.anchor === 'page' ? 'fixe' : 'mouvant';
    }
    return isFloat(obj) ? 'mouvant' : 'rigide';
  }
  const wrapOf = (obj) => (isFree(obj) ? obj.dataset.wrap : 'niveau');
  const isLocked = (obj) => isObject(obj) && posOf(obj) === 'fixe';

  // Position (par rapport au haut à gauche du texte) d'un objet devant ou derrière le texte.
  // Il garde sa place près de son paragraphe, ou, fixé, au même endroit de la page.
  // left et top : écarts mesurés à l'écran (le zoom de la page est retiré ici).
  function placeAt(obj, left, top) {
    const k = Z();
    left /= k;
    top /= k;
    // L'objet reste dans la largeur du texte.
    const width = obj.getBoundingClientRect().width / k;
    left = Math.max(0, Math.min(editor.clientWidth - width, left));
    top = Math.max(0, top);
    obj.style.setProperty('--x', '0px');
    obj.style.setProperty('--y', '0px');
    const e = editor.getBoundingClientRect();
    const r = obj.getBoundingClientRect();
    obj.style.setProperty('--x', Math.round(left - (r.left - e.left) / k) + 'px');
    obj.style.setProperty('--y', Math.round(top - (r.top - e.top) / k) + 'px');
  }

  function offsetInEditor(obj) {
    const e = editor.getBoundingClientRect();
    const r = obj.getBoundingClientRect();
    return { left: r.left - e.left, top: r.top - e.top };
  }

  // Un objet qui suit le texte se rattache au paragraphe à côté duquel il se trouve.
  function reanchor(obj) {
    if (obj.dataset.anchor === 'page') return;
    const { left, top } = offsetInEditor(obj);
    const e = editor.getBoundingClientRect();
    let target = null;
    for (const b of editor.children) {
      if (b === obj || b.classList.contains('ft-footnotes') || (b.matches('.ft-image, table, blockquote') && isFree(b))) continue;
      if (b.getBoundingClientRect().top - e.top <= top + 2) target = b;
      else break;
    }
    target = target || editor.firstElementChild;
    if (target && target !== obj && target.previousElementSibling !== obj) target.before(obj);
    placeAt(obj, left, top);
  }

  // ----- Texte mouvant : l'objet se pose dans le texte, qui s'écarte autour de lui -----

  // Morceaux de texte d'un paragraphe (hors formules, appels de note et images).
  function textNodes(blockEl) {
    const list = [];
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.ft-math, sup.ft-fn-ref, .ft-image') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.length) list.push(n);
    return list;
  }

  function charRect(node, i) {
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    const rects = r.getClientRects();
    return rects.length ? rects[rects.length - 1] : null;
  }

  // Début de la ligne du paragraphe qui se trouve à la hauteur y : [nœud, position], ou null (début du paragraphe).
  function lineStart(blockEl, y) {
    const chars = [];
    for (const n of textNodes(blockEl)) for (let i = 0; i < n.length; i++) chars.push([n, i]);
    if (!chars.length) return null;
    const bottom = (k) => {
      for (let j = k; j < chars.length && j < k + 4; j++) {
        const r = charRect(...chars[j]);
        if (r && r.height) return r.bottom;
      }
      return null;
    };
    // Premier caractère dont la ligne descend sous y (les lignes se suivent de haut en bas).
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const b = bottom(mid);
      if (b !== null && b <= y) lo = mid + 1;
      else hi = mid;
    }
    if (lo >= chars.length) return lineStart(blockEl, (bottom(chars.length - 1) || y) - 4);
    if (lo === 0) return null;
    // Recule jusqu'au premier caractère de cette ligne.
    const top = charRect(...chars[lo]);
    while (lo > 0 && top) {
      const prev = charRect(...chars[lo - 1]);
      if (!prev || !prev.height || prev.bottom > top.top + 2) lo--;
      else break;
    }
    return lo === 0 ? null : chars[lo];
  }

  // Bloc de texte (paragraphe, titre, élément de liste) qui se trouve à la hauteur y, près de x.
  function textBlockAt(obj, x, y) {
    const ed = editor.getBoundingClientRect();
    for (const px of [x, ed.left + 2, ed.left + ed.width / 2, ed.right - 2]) {
      const r = document.caretRangeFromPoint(px, y);
      if (!r || !editor.contains(r.startContainer) || obj.contains(r.startContainer)) continue;
      const el = r.startContainer.nodeType === Node.ELEMENT_NODE ? r.startContainer : r.startContainer.parentElement;
      if (!el || el.closest('td, th, .ft-math, .ft-footnotes, .ft-image')) continue;
      const b = el.closest(TEXT_BLOCKS);
      if (b && b !== editor && editor.contains(b) && !b.closest('td, th')) return b;
    }
    return null;
  }

  // Tableaux et encadrés : avant le bloc dont le haut est le plus proche de y.
  function boxSpot(obj, y) {
    let best = null;
    const blocks = [...editor.children].flatMap((b) => (S().isZone(b) ? [...b.children] : [b]));
    for (const b of blocks) {
      if (b === obj || b.classList.contains('ft-footnotes') || isFree(b) || isFloat(b)) continue;
      const r = b.getBoundingClientRect();
      for (const [edge, after] of [[r.top, false], [r.bottom, true]]) {
        const d = Math.abs(y - edge);
        if (!best || d < best.d) best = { d, b, after };
      }
    }
    return best;
  }

  // ----- Paragraphe coupé autour d'un tableau ou d'un encadré à côté du texte -----
  // Un tableau ne peut pas entrer dans un paragraphe : le paragraphe est coupé au début de la ligne visée,
  // l'objet se place entre les deux morceaux (data-coupe : suit dans le paragraphe d'après ; data-suite :
  // suite du paragraphe d'avant). Les deux morceaux se lisent comme un seul (ni espace, ni retrait) et se
  // recollent dès que l'objet part ailleurs.
  const isPageGap = (el) => el && el.classList.contains('ft-pg-gap');
  const nextBlock = (el) => { let n = el && el.nextElementSibling; while (isPageGap(n)) n = n.nextElementSibling; return n; };
  const prevBlock = (el) => { let n = el && el.previousElementSibling; while (isPageGap(n)) n = n.previousElementSibling; return n; };

  function joinCut(a, b) {
    while (b.firstChild) a.appendChild(b.firstChild);
    b.remove();
    delete a.dataset.coupe;
    if (!b.hasAttribute('data-coupe')) a.style.removeProperty('text-align-last');
    else a.dataset.coupe = '';
    if (!a.getAttribute('style')) a.removeAttribute('style');
    a.normalize();
  }

  // L'objet quitte sa place : le paragraphe coupé pour lui se recolle.
  function uncut(obj) {
    const a = prevBlock(obj);
    const b = nextBlock(obj);
    if (a && b && a.hasAttribute('data-coupe') && b.hasAttribute('data-suite')) joinCut(a, b);
  }

  function cutAt(host, node, i) {
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(host, host.childNodes.length);
    const tail = host.cloneNode(false);
    tail.removeAttribute('id');
    for (const k of ['bm', 'pgStart', 'coupe']) delete tail.dataset[k];
    tail.dataset.suite = '';
    if (host.hasAttribute('data-coupe')) tail.dataset.coupe = '';
    tail.append(r.extractContents());
    host.after(tail);
    host.dataset.coupe = '';
    // Texte justifié : la dernière ligne du premier morceau reste justifiée, comme au milieu du paragraphe.
    if (getComputedStyle(host).textAlign === 'justify') host.style.setProperty('text-align-last', 'justify');
    return tail;
  }

  // Morceaux restés côte à côte sans objet entre eux (objet supprimé, déplacé) : recollés.
  function healCuts() {
    for (const a of editor.querySelectorAll('[data-coupe]')) {
      if (!a.isConnected) continue;
      const b = nextBlock(a);
      if (b && b.hasAttribute('data-suite')) { joinCut(a, b); continue; }
      if (!b || !(isObject(b) && isFloat(b))) {
        delete a.dataset.coupe;
        a.style.removeProperty('text-align-last');
        if (!a.getAttribute('style')) a.removeAttribute('style');
      }
    }
    for (const b of editor.querySelectorAll('[data-suite]')) {
      const a = prevBlock(b);
      if (!a || !(isObject(a) && isFloat(a) && prevBlock(a) && prevBlock(a).hasAttribute('data-coupe'))) delete b.dataset.suite;
    }
  }
  let healTimer = null;
  editor.addEventListener('input', () => {
    if (!editor.querySelector('[data-coupe], [data-suite]')) return;
    clearTimeout(healTimer);
    healTimer = setTimeout(healCuts, 300);
  });

  // Pose un objet à côté du texte, son coin haut gauche en (x, y) (coordonnées de la fenêtre).
  function placeFloat(obj, x, y) {
    if (isImage(obj)) {
      const host = textBlockAt(obj, x, y + 4);
      if (host) {
        const at = lineStart(host, y + 4);
        const from = obj.parentNode;
        if (!at) {
          if (host.firstChild !== obj) host.prepend(obj);
        } else {
          const [node, i] = at;
          const same = i === 0 ? node.previousSibling === obj : false;
          if (!same) {
            const r = document.createRange();
            r.setStart(node, i);
            r.collapse(true);
            r.insertNode(obj);
          }
        }
        if (from && from !== obj.parentNode && from.isConnected && !isContainer(from)) from.normalize();
      }
    } else {
      uncut(obj);
      // Tableau, encadré : au début de la ligne visée, le paragraphe coupé en deux autour de lui.
      // (La ligne visée est cherchée dans le texte sans l'objet : il descend ligne par ligne, même quand il est
      // aussi large que le texte et que rien ne passe à côté.)
      const shown = obj.style.display;
      obj.style.display = 'none';
      let host = null;
      let dy = 4;
      // (Entre deux lignes, le point ne tombe dans aucun texte : un peu plus haut ou plus bas.)
      for (const d of [4, 1, 8, -2]) if ((host = textBlockAt(obj, x, y + d))) { dy = d; break; }
      const at = host && host.tagName === 'P' && isContainer(host.parentNode) ? lineStart(host, y + dy) : null;
      obj.style.display = shown;
      if (!obj.getAttribute('style')) obj.removeAttribute('style');
      if (at) {
        cutAt(host, at[0], at[1]).before(obj);
        setSide(obj, x);
        return;
      }
      const spot = host && host.tagName === 'P' && isContainer(host.parentNode) ? { b: host, after: false } : boxSpot(obj, y);
      if (spot) {
        const sibling = spot.after ? spot.b.nextElementSibling : spot.b.previousElementSibling;
        if (sibling !== obj) {
          if (spot.after) spot.b.after(obj);
          else spot.b.before(obj);
        }
      }
    }
    setSide(obj, x);
  }

  // Côté (le texte passe de l'autre côté) et écart avec le bord, d'après la position horizontale.
  function setSide(obj, x) {
    const host = isContainer(obj.parentNode) ? (obj.nextElementSibling || obj.previousElementSibling || obj.parentNode) : obj.parentElement;
    const a = host.getBoundingClientRect();
    const w = obj.getBoundingClientRect().width;
    const rel = x - a.left;
    const side = rel + w / 2 <= a.width / 2 ? 'gauche' : 'droite';
    let gap = side === 'gauche' ? rel : a.width - rel - w;
    gap = Math.max(0, Math.min(a.width - w, gap));
    if (gap < 12) gap = 0; // collé au bord
    obj.dataset.wrap = side;
    if (gap) obj.style.setProperty('--mx', Math.round(gap / Z()) + 'px');
    else obj.style.removeProperty('--mx');
  }

  // ----- Changer la position ou l'habillage -----

  const clearPlace = (obj) => { for (const v of ['--x', '--y', '--mx', '--ml']) obj.style.removeProperty(v); };

  // Bloc entre les paragraphes. Une image prise dans une ligne coupe son paragraphe à cet endroit.
  function toBlock(obj) {
    const side = isFloat(obj) ? obj.dataset.wrap : '';
    if (side && !isImage(obj)) uncut(obj);
    if (!isContainer(obj.parentNode)) {
      const from = obj.parentNode;
      const range = document.createRange();
      range.setStartBefore(obj);
      range.collapse(true);
      obj.remove();
      S().placeBlockAt(obj, range);
      if (from.isConnected) from.normalize();
    }
    clearPlace(obj);
    delete obj.dataset.wrap;
    delete obj.dataset.anchor;
    // Un objet qui était à côté du texte reste du même côté.
    if (side) obj.dataset.align = side;
    else if (obj.dataset.align === 'libre') delete obj.dataset.align;
  }

  // À côté du texte, à l'endroit où l'objet se trouve.
  function toFloat(obj, r) {
    clearPlace(obj);
    delete obj.dataset.anchor;
    delete obj.dataset.align;
    // Tableaux et encadrés pleine largeur, ou image presque aussi large que le texte : place pour le texte à côté.
    if (isBox(obj) && !obj.style.width) obj.style.width = '50%';
    if (isImage(obj) && (currentWidth(obj) || 100) > 70) obj.style.width = '50%';
    obj.dataset.wrap = 'gauche';
    obj.classList.add('ft-moving');
    placeFloat(obj, r.left, r.top);
    obj.classList.remove('ft-moving');
    obj.style.removeProperty('--mx'); // collé au bord le plus proche ; on peut ensuite le glisser
  }

  // Devant ou derrière le texte, à l'endroit où l'objet se trouve.
  function toFree(obj, wrap, r) {
    if (isFloat(obj) && !isImage(obj)) uncut(obj);
    if (!isContainer(obj.parentNode)) {
      const from = obj.parentNode;
      const top = S().topBlock(obj);
      if (top && top !== obj) top.before(obj);
      if (from.isConnected) from.normalize();
    }
    clearPlace(obj);
    delete obj.dataset.align;
    obj.dataset.wrap = wrap;
    const ed = editor.getBoundingClientRect();
    placeAt(obj, r.left - ed.left, r.top - ed.top);
  }

  // Change la position (rigide, mouvant, fixe) et/ou l'habillage (niveau, devant, derriere).
  function arrange(obj, pos, wrap) {
    const was = { pos: posOf(obj), wrap: wrapOf(obj) };
    if (pos === was.pos && wrap === was.wrap) return;
    S().checkpoint();
    const r = obj.getBoundingClientRect();
    if (wrap === 'niveau') {
      if (pos === 'rigide') toBlock(obj);
      else if (pos === 'mouvant' && !isFloat(obj)) toFloat(obj, r);
      else if (pos === 'fixe' && (isFree(obj) || isInline(obj))) {
        if (isFree(obj)) toFloat(obj, r);
        else toBlock(obj);
      }
      delete obj.dataset.anchor;
      if (pos === 'fixe') obj.dataset.pos = 'fixe';
      else delete obj.dataset.pos;
    } else {
      if (!isFree(obj)) toFree(obj, wrap, r);
      obj.dataset.wrap = wrap;
      const { left, top } = offsetInEditor(obj);
      // Fixé : au même endroit de la page ; sinon il suit son paragraphe.
      if (pos === 'fixe') obj.dataset.anchor = 'page';
      else delete obj.dataset.anchor;
      if (pos === 'rigide') obj.dataset.pos = 'rigide';
      else delete obj.dataset.pos;
      placeAt(obj, left, top);
      if (pos !== 'fixe') reanchor(obj);
    }
    if (!obj.getAttribute('style')) obj.removeAttribute('style');
    S().changed();
    S().selectObject(obj);
  }

  const setPos = (obj, pos) => arrange(obj, pos, wrapOf(obj));
  // Une image dans une ligne qui passe devant ou derrière le texte devient d'abord un objet rigide.
  const setWrap = (obj, wrap) => arrange(obj, posOf(obj) === 'ligne' ? 'rigide' : posOf(obj), wrap);

  // Tableau qui déborde sur les marges (styles.css) : il revient dans la largeur du texte.
  function dropOverflow(obj) {
    if (!obj.hasAttribute('data-deborde')) return;
    delete obj.dataset.deborde;
    obj.style.removeProperty('--dg');
    obj.style.removeProperty('--dd');
  }
  // Un tableau entre les paragraphes (pas dans une case, un encadré ou des colonnes) peut déborder sur les marges.
  const canOverflow = (obj) => obj.tagName === 'TABLE' && !obj.dataset.wrap && obj.parentNode === editor && !editor.hasAttribute('data-cols');
  const CM = 96 / 2.54;

  function setAlign(obj, value) {
    S().checkpoint();
    dropOverflow(obj);
    obj.style.removeProperty('--ml');
    if (value) obj.dataset.align = value;
    else delete obj.dataset.align;
    if (!obj.getAttribute('style')) obj.removeAttribute('style');
    S().changed();
    S().selectObject(obj);
  }

  function setWidth(obj, pct) {
    S().checkpoint();
    dropOverflow(obj);
    if (isBox(obj)) setBoxWidth(obj, pct);
    else obj.style.width = pct + '%';
    // La marge de gauche choisie à la souris ne doit pas faire sortir l'objet du texte.
    if (obj.dataset.align === 'libre' && pct + (parseFloat(obj.style.getPropertyValue('--ml')) || 0) > 100) {
      obj.style.removeProperty('--ml');
      delete obj.dataset.align;
    }
    S().changed();
    S().selectObject(obj);
  }

  // Image : proportions d'origine.
  function resetRatio(obj) {
    S().checkpoint();
    obj.style.removeProperty('--ar');
    S().changed();
    S().selectObject(obj);
  }

  function currentWidth(obj) {
    const m = /^([\d.]+)%$/.exec(obj.style.width || '');
    return m ? Math.round(Number(m[1])) : null;
  }

  // Groupes de petites icônes : position, habillage, puis alignement d'un objet rigide.
  function iconGroups(obj) {
    const pos = posOf(obj);
    const wrap = wrapOf(obj);
    const groups = [
      POSITIONS.map(([value, title]) => ({ html: ICONS[value], title, on: pos === value, action: () => setPos(obj, value) })),
      WRAPS.map(([value, title]) => ({ html: ICONS[value], title, on: wrap === value, action: () => setWrap(obj, value) }))
    ];
    if (pos === 'rigide' && wrap === 'niveau') {
      groups.push(ALIGNS.map(([value, title, icon]) => ({
        html: ICONS[icon], title, on: (obj.dataset.align || '') === value, action: () => setAlign(obj, value)
      })));
    }
    return groups;
  }

  // Menu du clic droit : les mêmes icônes, et la largeur.
  function layoutItems(obj) {
    const [positions, wraps, aligns] = iconGroups(obj);
    const items = [{ label: 'Position' }, { icons: positions }, { label: 'Habillage' }, { icons: wraps }];
    if (aligns) items.push({ label: 'Alignement' }, { icons: aligns });
    const w = currentWidth(obj) || (isBox(obj) && !obj.style.width ? 100 : null);
    items.push({ label: 'Largeur' }, {
      icons: WIDTHS.map((p) => ({ html: `${p} %`, title: `${p} % de la largeur du texte`, on: w === p, action: () => setWidth(obj, p) }))
    });
    if (isImage(obj) && obj.style.getPropertyValue('--ar')) items.push({ text: "Proportions d'origine", action: () => resetRatio(obj) });
    return items;
  }

  let menuPoint = { x: 0, y: 0 };
  listen('contextmenu', (e) => { menuPoint = { x: e.clientX, y: e.clientY }; }, true);

  // Entrée ajoutée aux menus du clic droit des tableaux et des encadrés (structure.js).
  function wrapMenu(obj) {
    if (!obj || !isBox(obj)) return [];
    return [{ text: 'Position et habillage…', action: () => showMenu(menuPoint.x, menuPoint.y, layoutItems(obj)) }];
  }

  function imageMenu(obj) {
    return [
      ...(obj.dataset.diagram && window.FTDiagram ? [{ text: 'Modifier le schéma…', action: () => window.FTDiagram.open(obj) }, { text: 'Style…', action: () => window.FTStyles.open('schemas', obj) }, '-'] : []),
      ...layoutItems(obj),
      '-',
      { text: captionOf(obj) ? 'Légende…' : 'Ajouter une légende…', action: () => openImagePop(obj, 'legende', menuPoint) },
      { text: obj.dataset.frame ? 'Cadre…' : 'Ajouter un cadre…', action: () => openImagePop(obj, 'cadre', menuPoint) },
      '-',
      { text: obj.dataset.diagram ? 'Supprimer le schéma' : "Supprimer l'image", danger: true, action: () => S().removeObject(obj) },
      '-',
      ...S().insertItems(menuPoint.x, menuPoint.y)
    ];
  }

  // ----- Légende et cadre des images -----
  // La légende est un petit texte modifiable dans l'image (au-dessus ou en dessous). Le cadre
  // entoure l'image et sa légende ; son apparence est gardée dans l'attribut style de l'image.

  const captionOf = (obj) => obj.querySelector(':scope > .ft-caption');
  const alignIcon = (rows) => `<svg class="thin" viewBox="0 0 16 16"><path d="${rows}"/></svg>`;
  const CAPTION_ALIGNS = [
    ['gauche', 'Aligner à gauche', alignIcon('M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8')],
    ['', 'Centrer', alignIcon('M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8')],
    ['droite', 'Aligner à droite', alignIcon('M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8')],
    ['justifie', 'Justifier', alignIcon('M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12')]
  ];
  const FRAME_STYLES = [['', 'Aucun'], ['plein', 'Plein'], ['pointille', 'Pointillés'], ['tirets', 'Tirets'], ['double', 'Double']];
  const FRAME_WIDTHS = [['1px', 'Fin'], ['2px', 'Moyen'], ['4px', 'Épais']];
  const FRAME_PADDINGS = [['0px', 'Aucune'], ['6px', 'Petite'], ['14px', 'Grande']];
  const FRAME_COLORS = [['', 'Automatique'], ['#1f1f1f', 'Noir'], ['#6b6b6b', 'Gris'], ['#7b4a2a', 'Marron'], ['#c0392b', 'Rouge'],
    ['#e67e22', 'Orange'], ['#27ae60', 'Vert'], ['#2e86c1', 'Bleu'], ['#1f3a93', 'Bleu marine'], ['#8e44ad', 'Violet']];

  function focusCaption(cap) {
    cap.focus();
    const r = document.createRange();
    r.selectNodeContents(cap);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function setCaption(obj, where) {
    S().checkpoint();
    let cap = captionOf(obj);
    const fresh = !cap;
    if (!where) {
      if (cap) cap.remove();
      delete obj.dataset.caption;
      delete obj.dataset.captionAlign;
      delete obj.dataset.captionBox;
      delete obj.dataset.num;
    } else {
      if (!cap) {
        cap = document.createElement('span');
        cap.className = 'ft-caption';
        cap.setAttribute('contenteditable', 'true');
        // Nouvelle légende : numérotée (Figure n, ou Schéma n pour un schéma).
        obj.dataset.num = obj.dataset.diagram ? 'schema' : 'figure';
      }
      const img = obj.querySelector('img');
      if (where === 'haut') img.before(cap);
      else img.after(cap);
      obj.dataset.caption = where;
    }
    S().changed();
    if (where && fresh) {
      closeImagePop();
      S().selectObject(obj);
      after(() => {
        let o = S().selected();
        // Moteur 2.0 : numéro posé avant que la légende ne s'écrive (il ne l'est sinon qu'à la fin) ;
        // l'image, refaite, est sélectionnée de nouveau.
        if (engine && o) {
          const pos = S().posOf(o);
          window.FTGeneres.now();
          const fresh = pos === null ? null : window.FTMoteur.view.nodeDOM(pos);
          if (fresh && fresh !== o && isObject(fresh)) { S().selectObject(fresh); o = S().selected(); }
        }
        const c = o && captionOf(o);
        if (c) focusCaption(c);
      });
    } else {
      S().selectObject(obj);
    }
  }

  function setFrame(obj, changes) {
    S().checkpoint();
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'style') {
        if (value) obj.dataset.frame = value;
        else delete obj.dataset.frame;
      } else if (key === 'shadow') {
        if (value) obj.dataset.shadow = '1';
        else delete obj.dataset.shadow;
      } else if (value) obj.style.setProperty(key, value);
      else obj.style.removeProperty(key);
    }
    if (!obj.dataset.frame) for (const v of ['--fw', '--fc', '--fr', '--fp']) obj.style.removeProperty(v);
    S().changed();
    S().selectObject(obj);
  }

  // Entrée dans la légende : on en sort, juste après l'image.
  function leaveCaption(cap) {
    const obj = cap.closest('.ft-image');
    const r = document.createRange();
    if (isContainer(obj.parentNode)) {
      let next = obj.nextElementSibling;
      if (!next || !next.matches('p, h1, h2, h3, h4, h5, h6, div:not(.ft-cols):not(.ft-footnotes):not(.ft-math)')) {
        S().checkpoint();
        next = document.createElement('p');
        next.appendChild(document.createElement('br'));
        obj.after(next);
        S().changed();
      }
      editor.focus({ preventScroll: true });
      S().placeCaret(next);
      return;
    }
    editor.focus({ preventScroll: true });
    r.setStartAfter(obj);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // Avant les raccourcis du texte (listes, titres, tabulation…), qui ne s'appliquent pas à la légende.
  document.addEventListener('keydown', (e) => {
    const cap = e.target.closest && e.target.closest('#editor .ft-caption');
    if (!cap || e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    const sel = window.getSelection();
    const atStart = sel.isCollapsed && (() => {
      const r = document.createRange();
      r.setStart(cap, 0);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      return r.toString() === '';
    })();
    if (e.key === 'Tab') {
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      if (e.key === 'Escape') S().selectObject(cap.closest('.ft-image'));
      else leaveCaption(cap);
    } else if (e.key === 'Backspace' && atStart) {
      e.preventDefault(); // la légende ne se fond pas dans le texte voisin
    } else if (e.key === 'Delete' && sel.isCollapsed && sel.anchorNode && (() => {
      const r = document.createRange();
      r.setStart(sel.anchorNode, sel.anchorOffset);
      r.setEnd(cap, cap.childNodes.length);
      return r.toString() === '';
    })()) {
      e.preventDefault();
    }
  }, true);

  listen('input', (e) => {
    const cap = e.target.closest && e.target.closest('.ft-caption');
    const sel = window.getSelection();
    const node = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement);
    const c = cap || (node && node.closest('.ft-caption'));
    // Légende vidée : le navigateur y laisse un <br> qui cacherait l'invitation à écrire.
    if (c && c.textContent === '' && c.firstChild) c.replaceChildren();
  });

  // Légende : on n'y colle que du texte.
  listen('paste', (e) => {
    const cap = e.target.closest && e.target.closest('.ft-caption');
    if (!cap) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const text = (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, text);
  }, true);

  // Petite fenêtre d'options (légende ou cadre), sous l'icône de la barre ou au point du clic droit.
  const imagePop = document.createElement('div');
  imagePop.id = 'image-pop';
  imagePop.className = 'ft-pop';
  imagePop.hidden = true;
  document.body.appendChild(imagePop);
  let popObj = null;
  let popPos = null;
  let popKind = '';

  function closeImagePop() {
    imagePop.hidden = true;
    popObj = null;
  }

  function segButton(text, on, action, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (on) b.classList.add('on');
    if (title) b.title = title;
    b.addEventListener('click', () => { action(livePop()); if (popObj) buildImagePop(); });
    return b;
  }

  // Moteur 2.0 : l'image a pu être refaite par le moteur pendant que la fenêtre est ouverte (numéro de
  // légende mis à jour…) ; la fenêtre agit sur la nouvelle, retrouvée à sa place dans le texte.
  function livePop() {
    if (engine && popObj && !popObj.isConnected && popPos != null) {
      let dom = null;
      try { dom = window.FTMoteur.view.nodeDOM(popPos); } catch { /* place disparue */ }
      if (isObject(dom)) popObj = dom;
    }
    return popObj;
  }

  function buildImagePop() {
    const obj = livePop();
    popPos = engine ? S().posOf(obj) : null;
    const parts = [];
    if (popKind === 'legende') {
      const where = captionOf(obj) ? obj.dataset.caption || 'bas' : '';
      parts.push(
        el('div', { className: 'pop-title', textContent: 'Légende' }),
        el('div', { className: 'seg' }, [['', 'Aucune'], ['haut', 'En haut'], ['bas', 'En bas']].map(([v, t]) => segButton(t, where === v, (o) => setCaption(o, v))))
      );
      if (where) {
        const align = obj.dataset.captionAlign || '';
        parts.push(
          el('div', { className: 'pop-title', textContent: 'Alignement du texte' }),
          el('div', { className: 'seg icons' }, CAPTION_ALIGNS.map(([v, t, icon]) => {
            const b = segButton('', align === v, (o) => setCaptionStyle(o, 'captionAlign', v), t);
            b.innerHTML = icon;
            return b;
          })),
          el('div', { className: 'pop-title', textContent: 'Couleur du texte' }),
          ...swatches(obj.style.getPropertyValue('--cap-c'), (o, v) => setCaptionColor(o, '--cap-c', v)),
          captionBoxCheck(obj)
        );
        if (obj.dataset.captionBox) parts.push(
          el('div', { className: 'pop-title', textContent: 'Couleur du contour' }),
          ...swatches(obj.style.getPropertyValue('--cap-bc'), (o, v) => setCaptionColor(o, '--cap-bc', v)),
          el('div', { className: 'pop-title', textContent: 'Fond de la légende' }),
          ...swatches(obj.style.getPropertyValue('--cap-bg'), (o, v) => setCaptionColor(o, '--cap-bg', v)),
          el('div', { className: 'pop-title', textContent: 'Coins de la légende' }),
          el('div', { className: 'seg' }, CAPTION_CORNERS.map(([v, t]) => segButton(t, obj.style.getPropertyValue('--cap-r').trim() === v, (o) => setCaptionColor(o, '--cap-r', v))))
        );
        parts.push(
          el('div', { className: 'pop-title', textContent: 'Numérotation' }),
          el('div', { className: 'seg' }, [['', 'Aucune'], ['figure', 'Figure n'], ['schema', 'Schéma n']].map(([v, t]) =>
            segButton(t, (obj.dataset.num || '') === v, (o) => setCaptionStyle(o, 'num', v))))
        );
      }
    } else {
      const style = obj.dataset.frame || '';
      const get = (v, d) => obj.style.getPropertyValue(v) || d;
      parts.push(
        el('div', { className: 'pop-title', textContent: 'Cadre' }),
        el('div', { className: 'seg' }, FRAME_STYLES.map(([v, t]) => segButton(t, style === v, (o) => setFrame(o, { style: v })))));
      if (style) {
        const color = get('--fc', '');
        parts.push(
          el('div', { className: 'pop-title', textContent: 'Épaisseur' }),
          el('div', { className: 'seg' }, FRAME_WIDTHS.map(([v, t]) => segButton(t, get('--fw', '1px') === v, (o) => setFrame(o, { '--fw': v === '1px' ? '' : v })))),
          el('div', { className: 'pop-title', textContent: 'Couleur' }),
          ...swatches(color, (o, v) => setFrame(o, { '--fc': v })),
          el('div', { className: 'pop-title', textContent: 'Coins' }),
          el('div', { className: 'seg' }, [['', 'Droits'], ['8px', 'Arrondis']].map(([v, t]) => segButton(t, get('--fr', '') === v, (o) => setFrame(o, { '--fr': v })))),
          el('div', { className: 'pop-title', textContent: "Espace autour de l'image" }),
          el('div', { className: 'seg' }, FRAME_PADDINGS.map(([v, t]) => segButton(t, get('--fp', '6px') === v, (o) => setFrame(o, { '--fp': v === '6px' ? '' : v }))))
        );
      }
      const shadow = el('input', { type: 'checkbox', checked: !!obj.dataset.shadow });
      shadow.addEventListener('change', () => { setFrame(livePop(), { shadow: shadow.checked }); buildImagePop(); });
      parts.push(el('label', { className: 'pop-check' }, [shadow, ' Ombre légère']));
    }
    imagePop.replaceChildren(...parts);
    // (Fenêtre agrandie — contour coché… : elle reste dans la fenêtre.)
    if (!imagePop.hidden) {
      const top = parseFloat(imagePop.style.top) || 0;
      imagePop.style.top = Math.max(8, Math.min(top, window.innerHeight - imagePop.offsetHeight - 8)) + 'px';
    }
  }

  // Couleurs (cadre, légende) : automatique, palette, couleur au choix, puis les 6 dernières choisies.
  function swatches(current, apply) {
    const now = window.FTCouleurs.norm(current) || '';
    const set = (v) => {
      if (v) window.FTCouleurs.add(v);
      const o = livePop();
      if (!o) return;
      apply(o, v);
      if (popObj) buildImagePop();
    };
    const box = el('div', { className: 'frame-colors' }, FRAME_COLORS.map(([v, t]) => {
      const b = el('button', { type: 'button', title: t, className: 'swatch' + (now === v ? ' on' : '') + (v ? '' : ' auto') });
      if (v) b.style.background = v;
      b.addEventListener('click', () => set(v));
      return b;
    }));
    const custom = el('input', { type: 'color', className: 'swatch-custom', title: 'Autre couleur', value: /^#[0-9a-f]{6}$/.test(now) ? now : '#888888' });
    custom.addEventListener('change', () => set(custom.value));
    box.append(custom);
    return [box, window.FTCouleurs.row(set, { title: '' })];
  }

  // Coins du contour de la légende (--cap-r ; vide = légèrement arrondis).
  const CAPTION_CORNERS = [['0px', 'Droits'], ['', 'Légers'], ['8px', 'Arrondis'], ['1em', 'Très arrondis']];

  // Couleur de la légende : texte (--cap-c), contour (--cap-bc), fond (--cap-bg) ; aussi ses coins (--cap-r).
  function setCaptionColor(obj, prop, value) {
    S().checkpoint();
    if (value) obj.style.setProperty(prop, value);
    else obj.style.removeProperty(prop);
    S().changed();
    S().selectObject(obj);
  }

  function captionBoxCheck(obj) {
    const box = el('input', { type: 'checkbox', checked: !!obj.dataset.captionBox });
    box.addEventListener('change', () => { setCaptionStyle(livePop(), 'captionBox', box.checked ? '1' : ''); buildImagePop(); });
    return el('label', { className: 'pop-check' }, [box, ' Contour autour de la légende']);
  }

  // Alignement (data-caption-align) ou contour (data-caption-box) de la légende.
  function setCaptionStyle(obj, key, value) {
    S().checkpoint();
    if (value) obj.dataset[key] = value;
    else delete obj.dataset[key];
    S().changed();
    S().selectObject(obj);
    // Moteur 2.0 : numéro refait tout de suite (une légende en cours d'écriture ne l'est qu'à la fin).
    if (engine && key === 'num') S().after(() => window.FTGeneres.now());
  }

  // at : bouton (sous lequel ouvrir) ou point { x, y }.
  function openImagePop(obj, kind, at) {
    if (!imagePop.hidden && popObj === obj && popKind === kind) return closeImagePop();
    popObj = obj;
    popKind = kind;
    buildImagePop();
    imagePop.hidden = false;
    const r = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, bottom: at.y };
    imagePop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - imagePop.offsetWidth - 8)) + 'px';
    imagePop.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - imagePop.offsetHeight - 8)) + 'px';
  }

  imagePop.addEventListener('mousedown', (e) => { if (!e.target.closest('label')) e.preventDefault(); });
  document.addEventListener('mousedown', (e) => {
    if (!imagePop.hidden && !e.target.closest('#image-pop, #object-tools, .context-menu')) closeImagePop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeImagePop(); });

  // Une image derrière le texte se sélectionne là où il n'y a pas de lettres par-dessus.
  function overText(x, y) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r || r.startContainer.nodeType !== Node.TEXT_NODE) return false;
    const node = r.startContainer;
    for (const o of [r.startOffset - 1, r.startOffset]) {
      if (o < 0 || o >= node.length) continue;
      const c = document.createRange();
      c.setStart(node, o);
      c.setEnd(node, o + 1);
      if ([...c.getClientRects()].some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) return true;
    }
    return false;
  }

  function behindAt(x, y) {
    for (const obj of editor.querySelectorAll('[data-wrap="derriere"]:not([data-pm-far])')) {
      const r = obj.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return overText(x, y) ? null : obj;
    }
    return null;
  }

  listen('contextmenu', (e) => {
    const target = e.target.nodeType === Node.ELEMENT_NODE ? e.target : e.target.parentElement;
    if (target && target.closest('.ft-caption')) return; // menu du texte (synonymes…)
    const obj = (target && target.closest('.ft-image')) || behindAt(e.clientX, e.clientY);
    if (!obj || !editor.contains(obj)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    S().selectObject(obj);
    // (Tableau ou encadré derrière le texte : sa position et son habillage.)
    showMenu(e.clientX, e.clientY, isImage(obj) ? imageMenu(obj) : layoutItems(obj));
  }, true);

  // ----- Déplacer un objet en le saisissant : le texte se réarrange pendant le geste -----

  listen('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.ft-caption')) return; // écrire dans la légende
    let obj = e.target.closest && e.target.closest('.ft-image');
    if (!obj) {
      obj = behindAt(e.clientX, e.clientY);
      if (!obj) return;
    }
    e.preventDefault();
    editor.focus({ preventScroll: true });
    startDrag(obj, e);
  }, true);

  // Image saisie, ou poignée d'un objet (structure.js). Faux : objet sans position (formule, plan…).
  function startDrag(obj, e) {
    if (!isObject(obj)) return false;
    const pos = posOf(obj);
    if (pos === 'fixe') S().selectObject(obj);
    else if (pos === 'ligne') startInlineDrag(obj, e);
    else if (pos === 'rigide') {
      // Devant ou derrière le texte : il se pose en haut du bloc près duquel on le lâche.
      S().startBlockDrag(obj, e, isFree(obj) ? () => obj.style.setProperty('--y', '0px') : null);
    } else if (isFree(obj)) startFreeDrag(obj, e);
    else startFloatDrag(obj, e);
    return true;
  }

  // Suivi de la souris, une mise à jour par image affichée. move(ev) déplace l'objet.
  function follow(obj, e, move) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let last = null;
    let frame = 0;
    S().selectObject(obj);
    const step = () => {
      frame = 0;
      move(last);
      S().placeFrame();
    };
    function onMove(ev) {
      if (!moved && Math.abs(ev.clientX - x0) < 4 && Math.abs(ev.clientY - y0) < 4) return;
      if (!moved) {
        moved = true;
        S().checkpoint();
        obj.classList.add('ft-moving');
        document.body.classList.add('ft-dragging');
      }
      last = ev;
      if (!frame) frame = requestAnimationFrame(step);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (frame) { cancelAnimationFrame(frame); step(); }
      obj.classList.remove('ft-moving');
      document.body.classList.remove('ft-dragging');
      if (moved) {
        if (isFree(obj)) reanchor(obj);
        S().changed();
      }
      S().selectObject(obj);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Devant ou derrière le texte : l'objet suit la souris, le texte ne bouge pas.
  function startFreeDrag(obj, e) {
    const r0 = obj.getBoundingClientRect();
    const dx = e.clientX - r0.left;
    const dy = e.clientY - r0.top;
    follow(obj, e, (ev) => {
      const ed = editor.getBoundingClientRect();
      placeAt(obj, ev.clientX - dx - ed.left, ev.clientY - dy - ed.top);
    });
  }

  // Au niveau du texte : l'objet suit la souris et le texte s'écarte autour de lui.
  function startFloatDrag(obj, e) {
    const r0 = obj.getBoundingClientRect();
    const dx = e.clientX - r0.left;
    const dy = e.clientY - r0.top;
    follow(obj, e, (ev) => placeFloat(obj, ev.clientX - dx, ev.clientY - dy));
  }

  // L'image est-elle déjà à cet endroit du texte ?
  function nextTo(range, obj) {
    const n = range.startContainer;
    const o = range.startOffset;
    if (n.nodeType === Node.TEXT_NODE) return (o === n.length && n.nextSibling === obj) || (o === 0 && n.previousSibling === obj);
    return n.childNodes[o] === obj || n.childNodes[o - 1] === obj;
  }

  // Image dans la ligne (anciens documents) : elle se glisse entre les mots, sous la souris.
  function startInlineDrag(obj, e) {
    follow(obj, e, (ev) => {
      const r = document.caretRangeFromPoint(ev.clientX, ev.clientY);
      if (!r || !editor.contains(r.startContainer) || obj.contains(r.startContainer) || nextTo(r, obj)) return;
      const el = r.startContainer.nodeType === Node.ELEMENT_NODE ? r.startContainer : r.startContainer.parentElement;
      if (!el || el.closest('.ft-math, .ft-image, .ft-footnotes, sup.ft-fn-ref')) return;
      const host = el.closest(TEXT_BLOCKS);
      if (!host || host === editor || !editor.contains(host)) return;
      const from = obj.parentNode;
      r.insertNode(obj);
      if (from !== obj.parentNode && from.isConnected && !isContainer(from)) from.normalize();
    });
  }

  // Double-clic sur une image derrière le texte (le texte est au-dessus d'elle).
  listen('dblclick', (e) => {
    const obj = behindAt(e.clientX, e.clientY);
    if (!obj) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    S().selectObject(obj);
  }, true);

  // ----- Barre de l'objet et poignées de taille -----
  // Affichées pour l'objet sélectionné, ou pour le tableau ou l'encadré où se trouve le curseur.

  const tools = document.createElement('div');
  tools.id = 'object-tools';
  tools.hidden = true;
  page.append(tools);

  // Huit poignées : un côté change une seule dimension, un coin change les deux (proportions gardées).
  const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const DIR_TITLES = { n: 'Hauteur', s: 'Hauteur', e: 'Largeur', w: 'Largeur' };
  const grips = DIRS.map((dir) => {
    const g = document.createElement('div');
    g.className = 'ft-rz ft-rz-' + dir;
    g.dataset.dir = dir;
    g.title = DIR_TITLES[dir] || 'Taille';
    if (dir === 'e' || dir === 'w') g.title += ' (double-clic : toute la largeur)';
    g.hidden = true;
    page.append(g);
    return g;
  });

  let current = null;
  let toolsObj = null;
  let toolsKey = '';

  function toolButton(icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = icon.html;
    b.title = icon.title;
    if (icon.on) b.classList.add('on');
    if (icon.disabled) b.disabled = true;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => icon.action(b));
    return b;
  }

  // Tableau : outils du tableau (moteur/blocs.js), puis position et habillage dans un menu.
  const tableTools = (obj) => obj.tagName === 'TABLE' && window.FTBlocs && window.FTBlocs.tableTools ? window.FTBlocs.tableTools() : null;

  function buildTools(obj) {
    const parts = [];
    const own = tableTools(obj);
    const groups = own || iconGroups(obj);
    if (own) {
      const wrap = wrapOf(obj);
      own.push([{ html: ICONS[wrap] || ICONS.niveau, title: 'Position et habillage', action: (b) => {
        const r = b.getBoundingClientRect();
        showMenu(r.left, r.bottom + 4, layoutItems(obj));
      } }]);
    }
    if (isImage(obj)) {
      groups.push([
        { html: ICONS.legende, title: 'Légende', on: !!captionOf(obj), action: (b) => openImagePop(obj, 'legende', b) },
        { html: ICONS.cadre, title: 'Cadre', on: !!obj.dataset.frame, action: (b) => openImagePop(obj, 'cadre', b) }
      ]);
    }
    for (const group of groups) {
      if (parts.length) parts.push(Object.assign(document.createElement('span'), { className: 'sep' }));
      parts.push(...group.map(toolButton));
    }
    parts.push(Object.assign(document.createElement('span'), { className: 'sep' }));
    const what = obj.dataset.diagram ? 'Supprimer le schéma' : isImage(obj) ? "Supprimer l'image" : obj.tagName === 'TABLE' ? 'Supprimer le tableau' : obj.tagName === 'PRE' ? 'Supprimer le bloc de code' : "Supprimer l'encadré";
    parts.push(toolButton({ html: ICONS.supprimer, title: what, action: () => S().removeObject(obj) }));
    tools.replaceChildren(...parts);
  }

  // Tableau, encadré ou bloc de code (le plus extérieur) où se trouve le curseur.
  function caretObject() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
    let el = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
    let found = null;
    for (el = el && el.closest(BOXES); el && editor.contains(el); el = el.parentElement && el.parentElement.closest(BOXES)) found = el;
    return found && (isContainer(found.parentNode) || isFloat(found) || isFree(found)) ? found : null;
  }

  function hideTools() {
    current = null;
    toolsObj = null;
    tools.hidden = true;
    for (const g of grips) g.hidden = true;
  }

  function showTools(obj, r) {
    // Images (version 2.5) : leur barre et leurs poignées sont dans moteur/images.js.
    if (isImage(obj) && window.FTImages && window.FTImages.active()) { hideTools(); window.FTImages.placeTools(); return; }
    current = obj;
    if (document.getElementById('app').classList.contains('reading-mode')) return hideTools();
    tools.hidden = false;
    // Les icônes ne sont refaites que si l'objet ou sa disposition change (pas à chaque mouvement).
    const key = [posOf(obj), wrapOf(obj), obj.dataset.align, !!captionOf(obj), obj.dataset.frame,
      obj.tagName === 'TABLE' && window.FTBlocs && window.FTBlocs.tableToolsKey ? window.FTBlocs.tableToolsKey() : ''].join('|');
    if (obj !== toolsObj || key !== toolsKey) {
      toolsObj = obj;
      toolsKey = key;
      buildTools(obj);
    }
    // La barre et les poignées gardent leur taille quand la page est zoomée (zoom inverse en CSS) :
    // leur position est donc donnée à l'échelle de l'écran.
    const k = Z();
    r = { top: r.top * k, left: r.left * k, width: r.width * k, height: r.height * k };
    const top = r.top < 40 ? r.top + r.height + 8 : r.top - 40;
    tools.style.top = top + 'px';
    tools.style.left = Math.max(0, Math.min(page.clientWidth * k - tools.offsetWidth, r.left + r.width - tools.offsetWidth + 5)) + 'px';
    const xs = { w: r.left, e: r.left + r.width, '': r.left + r.width / 2 };
    const ys = { n: r.top, s: r.top + r.height, '': r.top + r.height / 2 };
    for (const g of grips) {
      const d = g.dataset.dir;
      g.hidden = false;
      g.style.left = xs[d.replace(/[ns]/, '')] + 'px';
      g.style.top = ys[d.replace(/[ew]/, '')] + 'px';
    }
  }

  // L'objet sélectionné, sinon celui du curseur.
  function refreshTools() {
    const sel = S().selected();
    const obj = sel && isObject(sel) ? sel : caretObject();
    if (!obj || !obj.isConnected) return hideTools();
    showTools(obj, S().pageRect(obj));
  }
  let refreshFrame = 0;
  const scheduleTools = () => { if (!refreshFrame) refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; refreshTools(); }); };
  document.addEventListener('selectionchange', scheduleTools);
  listen('input', scheduleTools);
  document.addEventListener('ft-paginated', scheduleTools);
  window.addEventListener('resize', scheduleTools);
  // Image affichée après coup (document ouvert, image insérée) : sa taille est maintenant connue.
  listen('load', () => { S().placeFrame(); scheduleTools(); }, true);

  function objectChanged(obj, r) {
    if (obj && isObject(obj)) showTools(obj, r);
    else refreshTools();
    if (!obj || !isImage(obj)) {
      // Pendant qu'on écrit la légende, l'image n'est plus sélectionnée : la fenêtre d'options reste.
      const sel = window.getSelection();
      const inPop = popObj && sel.anchorNode && popObj.contains(sel.anchorNode);
      if (!inPop) closeImagePop();
    } else if (popObj && popObj !== obj) {
      // Moteur 2.0 : l'image vient d'être refaite par le moteur (même image) ; la fenêtre la suit.
      if (engine && !popObj.isConnected && !imagePop.hidden) {
        popObj = obj;
        buildImagePop();
      } else closeImagePop();
    }
  }
  S().onObjectChange(objectChanged);

  tools.addEventListener('mousedown', (e) => e.preventDefault());

  // ----- Changer la taille -----

  // Bord gauche et largeur qu'aurait l'objet à 100 % (coordonnées de la fenêtre).
  function fullBox(obj) {
    return quiet(() => measureFull(obj));
  }
  function measureFull(obj) {
    if (isFree(obj)) {
      const e = editor.getBoundingClientRect();
      return { left: e.left, width: editor.clientWidth * Z() };
    }
    const style = obj.getAttribute('style');
    const align = obj.dataset.align;
    const over = obj.dataset.deborde;
    delete obj.dataset.deborde;
    obj.style.width = '100%';
    obj.style.removeProperty('--mx');
    obj.style.removeProperty('--ml');
    if (!isFloat(obj)) obj.dataset.align = 'gauche';
    const r = obj.getBoundingClientRect();
    if (style === null) obj.removeAttribute('style');
    else obj.setAttribute('style', style);
    if (align) obj.dataset.align = align;
    else delete obj.dataset.align;
    if (over) obj.dataset.deborde = over;
    return { left: r.left, width: r.width || editor.clientWidth * Z() };
  }

  const round1 = (n) => Math.round(n * 10) / 10;

  // Largeur et place horizontale : left et w en pixels (coordonnées de la fenêtre).
  function applyWidth(obj, left, w, full) {
    const pct = Math.min(100, round1((w / full.width) * 100));
    const offL = left - full.left;
    const offR = full.left + full.width - (left + w);
    if (isFloat(obj)) {
      obj.style.width = pct + '%';
      const gap = obj.dataset.wrap === 'gauche' ? offL : offR;
      if (gap >= 4) obj.style.setProperty('--mx', Math.round(gap / Z()) + 'px');
      else obj.style.removeProperty('--mx');
    } else if (isFree(obj) || isInline(obj)) {
      obj.style.width = pct + '%';
    } else {
      // Bloc : collé à un bord, centré, ou à la marge choisie.
      obj.style.removeProperty('--ml');
      if (pct >= 99.5) {
        setBoxWidth(obj, 100);
        delete obj.dataset.align;
      } else {
        obj.style.width = pct + '%';
        if (offL < 3) obj.dataset.align = 'gauche';
        else if (offR < 3) obj.dataset.align = 'droite';
        else if (Math.abs(offL - offR) < 3) delete obj.dataset.align;
        else {
          obj.dataset.align = 'libre';
          obj.style.setProperty('--ml', round1((offL / full.width) * 100) + '%');
        }
      }
    }
  }

  function startResize(obj, dir, e) {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const zk = Z();
    const r0 = obj.getBoundingClientRect();
    const full = fullBox(obj);
    const img = isImage(obj) ? obj.querySelector('img') : null;
    const ir0 = img && img.getBoundingClientRect();
    // Hauteur : celle de l'image, des lignes du tableau, ou de l'encadré.
    const rows = obj.tagName === 'TABLE' ? [...obj.rows].filter((tr) => !tr.classList.contains('ft-pg-gap')).map((tr) => [tr, tr.getBoundingClientRect().height]) : null;
    const h0 = img ? ir0.height : r0.height;
    let natural = 0;
    let extra = 0;
    if (obj.matches('blockquote.ft-callout, pre.ft-code')) {
      const min = obj.style.minHeight;
      natural = quiet(() => {
        obj.style.minHeight = '';
        const h = obj.getBoundingClientRect().height;
        obj.style.minHeight = min;
        return h;
      });
      const cs = getComputedStyle(obj);
      extra = cs.boxSizing === 'border-box' ? 0 : r0.height - parseFloat(cs.height) * zk;
    }
    const hx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0;
    const vy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0;
    const corner = hx && vy;
    const minW = Math.max(16, full.width * (isBox(obj) ? 0.1 : 0.05));
    // Le bord opposé ne bouge pas ; l'objet reste dans la largeur du texte. Un tableau peut aller dans les
    // marges, jusqu'à 0,5 cm du bord de la feuille (comme dans Word).
    const over = canOverflow(obj) && !corner;
    const sheet = over ? page.getBoundingClientRect() : null;
    const lim = over
      ? { left: Math.min(full.left, sheet.left + 0.5 * CM * zk), right: Math.max(full.left + full.width, sheet.right - 0.5 * CM * zk) }
      : { left: full.left, right: full.left + full.width };
    const maxW = hx > 0 ? lim.right - r0.left : hx < 0 ? r0.right - lim.left : full.width;
    let moved = false;
    let last = null;
    let frame = 0;
    const ed0 = editor.getBoundingClientRect();
    const top0 = r0.top - ed0.top;

    function setHeight(h) {
      if (img) {
        const iw = img.getBoundingClientRect().width;
        obj.style.setProperty('--ar', String(Math.round((iw / Math.max(8, h)) * 10000) / 10000));
      } else if (rows) {
        const k = h / h0;
        for (const [tr, rh] of rows) tr.style.height = Math.max(18, Math.round((rh * k) / zk)) + 'px';
      } else if (h <= natural + 1) {
        obj.style.minHeight = '';
      } else {
        obj.style.minHeight = Math.round((h - extra) / zk) + 'px';
      }
    }

    function apply(ev) {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      let w = r0.width;
      let k = 1;
      if (corner) {
        // Proportions gardées : le plus grand des deux mouvements l'emporte.
        const kx = (r0.width + dx * hx) / r0.width;
        const ky = (h0 + dy * vy) / h0;
        k = Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky;
        w = Math.max(minW, Math.min(maxW, r0.width * k));
        k = w / r0.width;
      } else if (hx) {
        w = Math.max(minW, Math.min(maxW, r0.width + dx * hx));
      }
      const left = hx < 0 ? r0.right - w : r0.left;
      if (hx && over && (left < full.left - 1 || left + w > full.left + full.width + 1)) {
        // Dans les marges : avancée de chaque bord au-delà du texte, en cm.
        const cm = (px) => Math.round((px / zk / CM) * 100) / 100 + 'cm';
        obj.style.removeProperty('width');
        obj.style.removeProperty('--ml');
        delete obj.dataset.align;
        delete obj.dataset.width;
        obj.dataset.deborde = 'oui';
        obj.style.setProperty('--dg', cm(full.left - left));
        obj.style.setProperty('--dd', cm(left + w - full.left - full.width));
      } else if (hx) {
        dropOverflow(obj);
        applyWidth(obj, left, w, full);
      }
      let h = null;
      if (corner && !img) h = h0 * k;
      else if (vy && !hx) h = Math.max(12, h0 + dy * vy);
      // Image étirée par un côté : sa hauteur ne change pas.
      if (img && hx && !corner) h = ir0.height;
      if (h !== null) setHeight(h);
      // Devant ou derrière le texte : le bord opposé reste en place.
      if (isFree(obj)) {
        const r = obj.getBoundingClientRect();
        placeAt(obj, left - ed0.left, vy < 0 ? top0 + r0.height - r.height : top0);
      }
      if (!obj.getAttribute('style')) obj.removeAttribute('style');
    }

    function onMove(ev) {
      if (!moved && Math.abs(ev.clientX - x0) < 2 && Math.abs(ev.clientY - y0) < 2) return;
      if (!moved) {
        moved = true;
        S().checkpoint();
        document.body.classList.add('ft-resizing');
        document.body.dataset.rz = dir;
      }
      last = ev;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; apply(last); placeTools(obj); });
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (frame) { cancelAnimationFrame(frame); frame = 0; apply(last); }
      document.body.classList.remove('ft-resizing');
      delete document.body.dataset.rz;
      if (moved) S().changed();
      if (isImage(obj) || S().selected() === obj) S().selectObject(obj);
      else refreshTools();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Pendant un geste : cadre de sélection, barre et poignées suivent l'objet.
  function placeTools(obj) {
    if (S().selected() === obj) S().placeFrame();
    else showTools(obj, S().pageRect(obj));
  }

  // Toute la largeur : plus de largeur propre (le tableau ou l'encadré suit les marges).
  function fullWidth(obj) {
    S().checkpoint();
    dropOverflow(obj);
    setBoxWidth(obj, 100);
    obj.style.removeProperty('--ml');
    if (obj.dataset.align === 'libre') delete obj.dataset.align;
    if (!obj.getAttribute('style')) obj.removeAttribute('style');
    S().changed();
    if (isImage(obj) || S().selected() === obj) S().selectObject(obj);
    else refreshTools();
  }

  for (const g of grips) {
    g.addEventListener('mousedown', (e) => { if (e.button === 0 && current) startResize(current, g.dataset.dir, e); });
    g.addEventListener('dblclick', (e) => { if (current && (g.dataset.dir === 'e' || g.dataset.dir === 'w')) { e.preventDefault(); fullWidth(current); } });
  }

  // Sans passer par les poignées : le bord gauche ou droit d'un tableau ou d'un encadré se saisit directement.
  const SIDE = 5;
  function sideAt(e) {
    if (document.getElementById('app').classList.contains('reading-mode')) return null;
    for (const obj of editor.querySelectorAll('table.ft-table:not([data-pm-far]), blockquote.ft-callout:not([data-pm-far]), pre.ft-code:not([data-pm-far])')) {
      if (!isContainer(obj.parentNode) && !isFloat(obj)) continue;
      const r = obj.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) continue;
      if (Math.abs(e.clientX - r.left) <= SIDE) return { obj, dir: 'w' };
      if (Math.abs(e.clientX - r.right) <= SIDE) return { obj, dir: 'e' };
    }
    return null;
  }
  // Moteur 2.0 : une bande posée sur le bord porte le curseur (une classe sur la zone d'écriture ferait
  // recalculer l'apparence de tout le texte, très long sur un gros document).
  const sideZone = document.createElement('div');
  sideZone.className = 'ft-side-zone';
  sideZone.hidden = true;
  sideZone.title = 'Largeur (double-clic : toute la largeur)';
  document.body.append(sideZone);
  let sideHit = null;
  function placeSideZone(hit) {
    sideHit = hit;
    sideZone.hidden = !hit;
    if (!hit) return;
    const r = hit.obj.getBoundingClientRect();
    const x = hit.dir === 'w' ? r.left : r.right;
    Object.assign(sideZone.style, { left: x - SIDE + 'px', top: r.top + 'px', width: 2 * SIDE + 'px', height: r.height + 'px' });
  }
  sideZone.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !sideHit) return;
    const hit = sideHit;
    placeSideZone(null);
    startResize(hit.obj, hit.dir, e);
  });
  sideZone.addEventListener('dblclick', (e) => {
    if (!current) return;
    e.preventDefault();
    fullWidth(current);
  });
  sideZone.addEventListener('mousemove', (e) => { if (!e.buttons) placeSideZone(sideAt(e)); });
  document.getElementById('workspace').addEventListener('scroll', () => { if (!sideZone.hidden) placeSideZone(null); }, { passive: true });

  listen('mousemove', (e) => {
    if (e.buttons) return;
    if (engine) {
      placeSideZone(sideAt(e));
      return;
    }
    const hit = !!sideAt(e);
    editor.classList.toggle('resize-side', hit);
    // Le bord d'un tableau passe avant le trait d'une ligne qui y aboutit (structure.js).
    if (hit) editor.classList.remove('resize-col', 'resize-row');
  });
  listen('mouseleave', () => editor.classList.remove('resize-side'));
  // Écouté sur la fenêtre, avant le réglage des lignes et colonnes de structure.js.
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !editor.contains(e.target)) return;
    const hit = sideAt(e);
    if (!hit) return;
    e.stopImmediatePropagation();
    startResize(hit.obj, hit.dir, e);
  }, true);
  window.addEventListener('dblclick', (e) => {
    if (!editor.contains(e.target)) return;
    const hit = sideAt(e);
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fullWidth(hit.obj);
  }, true);

  // 100 % : un tableau ou un encadré entre les paragraphes n'a plus de largeur propre (il suit les marges).
  function setBoxWidth(obj, pct) {
    if (pct >= 100 && isBox(obj) && !obj.dataset.wrap) obj.style.width = '';
    else obj.style.width = round1(pct) + '%';
    if (!obj.getAttribute('style')) obj.removeAttribute('style');
  }

  // ----- Colonnes -----

  let docColumns = { count: 1, rule: false };

  // (Toujours posées sur l'ancienne zone : le démarrage du moteur les recopie sur sa zone.)
  function applyDocColumns() {
    const ed = legacyEditor;
    if (docColumns.count > 1) ed.dataset.cols = String(docColumns.count);
    else delete ed.dataset.cols;
    if (docColumns.rule && docColumns.count > 1) ed.dataset.rule = 'oui';
    else delete ed.dataset.rule;
  }

  function setDocColumns(count, rule = docColumns.rule) {
    docColumns = { count, rule };
    applyDocColumns();
    // (Moteur 2.0 : réglage du document, hors du texte du moteur.)
    if (engine) window.FTEditor.changed();
    else S().changed();
    S().placeFrame();
  }

  const zoneOf = (node) => {
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    const zone = el && el.closest('.ft-cols');
    return zone && zone.parentNode === editor ? zone : null;
  };

  function caretZone() {
    const sel = window.getSelection();
    return sel.rangeCount && editor.contains(sel.anchorNode) ? zoneOf(sel.anchorNode) : null;
  }

  // Lignes de texte qu'une sélection peut couper en deux (pas les listes, tableaux, encadrés…).
  const SPLIT_LINES = 'p, h1, h2, h3, h4, h5, h6, div:not(.ft-cols):not(.ft-footnotes):not(.ft-math):not(.ft-image):not([contenteditable="false"])';
  const blankRange = (r) => r.toString().replace(/[\s\u200b\u00a0]/g, '') === '' && !r.cloneContents().querySelector('img, .ft-image, .ft-math, sup.ft-fn-ref');
  const topOf = (node) => { while (node && node.parentNode && node.parentNode !== editor) node = node.parentNode; return node && node.parentNode === editor ? node : null; };

  // Le passage sélectionné commence ou finit au milieu d'une ligne : la ligne est coupée là, pour que
  // seul le passage passe en colonnes. Le reste de la ligne garde son type (paragraphe, titre…).
  function splitAround(range) {
    const end = topOf(range.endContainer);
    if (end && end.matches(SPLIT_LINES)) {
      const before = document.createRange();
      before.setStart(end, 0);
      before.setEnd(range.endContainer, range.endOffset);
      const after = document.createRange();
      after.setStart(range.endContainer, range.endOffset);
      after.setEnd(end, end.childNodes.length);
      if (!blankRange(before) && !blankRange(after)) {
        const tail = end.cloneNode(false);
        tail.removeAttribute('id');
        for (const k of ['bm', 'lettrine', 'pgStart']) delete tail.dataset[k];
        tail.appendChild(after.extractContents());
        end.after(tail);
        trimEdge(tail, true);
        trimEdge(end, false);
      }
    }
    const start = topOf(range.startContainer);
    if (start && start.matches(SPLIT_LINES)) {
      const before = document.createRange();
      before.setStart(start, 0);
      before.setEnd(range.startContainer, range.startOffset);
      const after = document.createRange();
      after.setStart(range.startContainer, range.startOffset);
      after.setEnd(start, start.childNodes.length);
      if (!blankRange(before) && !blankRange(after)) {
        const head = start.cloneNode(false);
        head.removeAttribute('id');
        for (const k of ['bm', 'pgStart']) delete head.dataset[k];
        delete start.dataset.lettrine;
        head.appendChild(before.extractContents());
        start.before(head);
        trimEdge(head, false);
        trimEdge(start, true);
      }
    }
  }

  // Espace laissée au bord d'une ligne coupée (« Avant. | Début ») : retirée.
  function trimEdge(block, atStart) {
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
    const t = atStart ? nodes[0] : nodes[nodes.length - 1];
    if (!t) return;
    const m = atStart ? /^[ \u00a0]+/.exec(t.data) : /[ \u00a0]+$/.exec(t.data);
    if (m && m[0].length < t.length) t.deleteData(atStart ? 0 : t.length - m[0].length, m[0].length);
  }

  // Met en colonnes le passage sélectionné (ou le paragraphe du curseur).
  function makeZone(count) {
    S().restoreSelection();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const existing = zoneOf(range.commonAncestorContainer);
    if (existing) return setZone(existing, count);
    S().checkpoint();
    if (!range.collapsed) splitAround(range);
    const mark = [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset];
    let blocks = [...editor.children].filter((b) => !b.classList.contains('ft-footnotes') && range.intersectsNode(b));
    // Une sélection qui finit tout au début d'une ligne ne prend pas cette ligne.
    if (blocks.length > 1 && !range.collapsed) {
      const last = blocks[blocks.length - 1];
      const r = document.createRange();
      r.setStart(last, 0);
      r.setEnd(range.endContainer, range.endOffset);
      if (blankRange(r)) blocks.pop();
    }
    if (!blocks.length) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      const notes = editor.querySelector('.ft-footnotes');
      editor.insertBefore(p, notes);
      blocks = [p];
      mark[0] = mark[2] = p;
      mark[1] = mark[3] = 0;
    }
    const zone = document.createElement('div');
    zone.className = 'ft-cols';
    zone.dataset.cols = String(count);
    blocks[0].before(zone);
    for (const b of blocks) {
      if (S().isZone(b)) { if (b.dataset.rule) zone.dataset.rule = 'oui'; zone.append(...b.children); b.remove(); }
      else zone.appendChild(b);
    }
    // Toujours une ligne de texte après la zone, pour continuer à écrire en dehors.
    const next = zone.nextElementSibling;
    if (!next || next.classList.contains('ft-footnotes') || S().isZone(next)) {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      zone.after(p);
    }
    try { sel.setBaseAndExtent(...mark); } catch { S().placeCaret(zone.firstElementChild, true); }
    S().changed();
  }

  function setZone(zone, count, rule) {
    S().checkpoint();
    if (count) zone.dataset.cols = String(count);
    if (rule !== undefined) { if (rule) zone.dataset.rule = 'oui'; else delete zone.dataset.rule; }
    S().changed();
  }

  function removeZone(zone) {
    S().checkpoint();
    const sel = window.getSelection();
    const mark = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
    zone.replaceWith(...zone.childNodes);
    if (mark) { try { sel.setBaseAndExtent(...mark); } catch { /* le curseur reste où il est */ } }
    S().changed();
  }

  // Clic droit sur un passage sélectionné : « Colonnes » (deux ou trois).
  function selectionItems() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) return [];
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (zoneOf(node) || (el && el.closest('td, th, .ft-footnotes, .ft-callout, .ft-math, .ft-image, .ft-toc, .ft-cover'))) return [];
    return [{
      text: 'Colonnes',
      submenu: () => [
        { text: 'Passage en 2 colonnes', action: () => makeZone(2) },
        { text: 'Passage en 3 colonnes', action: () => makeZone(3) }
      ]
    }];
  }

  function zoneMenu(zone) {
    const n = Number(zone.dataset.cols) || 2;
    return [
      { label: 'Zone en colonnes' },
      { text: check(n === 2, 'Deux colonnes'), action: () => setZone(zone, 2) },
      { text: check(n === 3, 'Trois colonnes'), action: () => setZone(zone, 3) },
      { text: check(!!zone.dataset.rule, 'Ligne entre les colonnes'), action: () => setZone(zone, 0, !zone.dataset.rule) },
      { text: 'Retirer les colonnes (garder le texte)', action: () => removeZone(zone) }
    ];
  }

  // Entrée sur une ligne vide à la fin d'une zone : on en sort ; retour arrière au début : idem.
  listen('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || (e.key !== 'Enter' && e.key !== 'Backspace')) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const block = S().topBlock(sel.anchorNode);
    if (!block || !S().isZone(block.parentNode) || !block.matches('p, div, h1, h2, h3, h4, h5, h6')) return;
    const zone = block.parentNode;
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(sel.anchorNode, sel.anchorOffset);
    const atStart = before.toString() === '' && !before.cloneContents().querySelector('img, .ft-image, .ft-math');
    const exitDown = e.key === 'Enter' && !e.shiftKey && block === zone.lastElementChild && block.textContent === '' && !block.querySelector('.ft-image, .ft-math');
    const exitUp = e.key === 'Backspace' && atStart && block === zone.firstElementChild;
    if (!exitDown && !exitUp) return;
    e.preventDefault();
    S().checkpoint();
    if (exitDown) zone.after(block);
    else zone.before(block);
    if (!zone.firstElementChild) zone.remove();
    S().placeCaret(block, exitDown);
    S().changed();
  }, true);

  // Contour discret de la zone en colonnes où se trouve le curseur.
  const zoneOutline = document.createElement('div');
  zoneOutline.id = 'zone-outline';
  zoneOutline.hidden = true;
  page.appendChild(zoneOutline);

  function placeZoneOutline() {
    const zone = caretZone();
    zoneOutline.hidden = !zone;
    if (!zone) return;
    const r = S().pageRect(zone);
    Object.assign(zoneOutline.style, { top: r.top - 6 + 'px', left: r.left - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 12 + 'px' });
  }
  document.addEventListener('selectionchange', placeZoneOutline);
  window.addEventListener('resize', placeZoneOutline);

  // ----- Bouton « Colonnes » -----

  const layoutBtn = document.getElementById('layout-btn');
  const layoutPop = document.getElementById('layout-pop');

  function popButton(text, on, action, title, off) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.disabled = !!off;
    if (on) b.classList.add('on');
    if (title) b.title = title;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { action(); buildPop(); });
    return b;
  }

  function el(tag, props = {}, children = []) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  }

  function ruleCheck(on, action) {
    const box = el('input', { type: 'checkbox', checked: on });
    box.addEventListener('change', () => { action(box.checked); buildPop(); });
    return el('label', { className: 'pop-check' }, [box, ' Ligne entre les colonnes']);
  }

  function buildPop() {
    const n = docColumns.count;
    const zone = caretZone();
    // En mode avancé (pages), tout le document ne peut pas passer en colonnes : seulement des zones.
    const paged = window.FTPages && window.FTPages.isPaged();
    layoutPop.replaceChildren(
      el('div', { className: 'pop-title', textContent: 'Tout le document' }),
      // (En mode avancé : grisé, avec la raison.)
      el('div', { className: 'seg' }, [
        popButton('Texte normal', n === 1, () => setDocColumns(1), paged ? "Disponible dans l'interface note" : 'Une seule colonne, sur toute la largeur', paged),
        popButton('2 colonnes', n === 2, () => setDocColumns(2), paged ? "Disponible dans l'interface note" : '', paged),
        popButton('3 colonnes', n === 3, () => setDocColumns(3), paged ? "Disponible dans l'interface note" : '', paged)
      ]),
      ...(paged
        ? [el('p', { className: 'pop-help pop-off', textContent: "Disponible dans l'interface note. Dans l'interface avancée, mettez une partie du document en colonnes (ci-dessous)." })]
        : (n > 1 ? [ruleCheck(docColumns.rule, (on) => setDocColumns(docColumns.count, on))] : [])),
      el('div', { className: 'pop-title', textContent: 'Seulement une partie du document' }),
      zone
        ? el('p', { className: 'pop-note', textContent: 'Le curseur est dans une zone en colonnes :' })
        : el('p', { className: 'pop-help', textContent: 'Le passage sélectionné (ou le paragraphe du curseur) passe en colonnes ; le reste du texte ne change pas.' }),
      el('div', { className: 'seg' }, zone
        ? [
            popButton('2 colonnes', zone.dataset.cols === '2', () => setZone(zone, 2)),
            popButton('3 colonnes', zone.dataset.cols === '3', () => setZone(zone, 3)),
            popButton('Retirer', false, () => removeZone(zone), 'Retirer les colonnes de cette zone (le texte reste)')
          ]
        : [
            popButton('En 2 colonnes', false, () => makeZone(2)),
            popButton('En 3 colonnes', false, () => makeZone(3))
          ]),
      ...(zone ? [ruleCheck(!!zone.dataset.rule, (on) => setZone(zone, 0, on))] : [])
    );
  }

  layoutBtn.addEventListener('mousedown', (e) => e.preventDefault());
  layoutBtn.addEventListener('click', () => {
    if (!layoutPop.hidden) { layoutPop.hidden = true; return; }
    buildPop();
    layoutPop.hidden = false;
    window.FTToolbar.placePop(layoutPop, layoutBtn);
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#layout-pop, #layout-btn')) layoutPop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') layoutPop.hidden = true; });

  // ----- Majuscule automatique en début de phrase -----

  let capitalize = true;
  let onCapitalizeChange = () => {};
  const capBtn = document.getElementById('capitalize-btn');
  function setCapitalize(on) {
    capitalize = on !== false;
    capBtn.classList.toggle('on', capitalize);
  }
  capBtn.addEventListener('mousedown', (e) => e.preventDefault());
  capBtn.addEventListener('click', () => {
    setCapitalize(!capitalize);
    onCapitalizeChange(capitalize);
  });
  // Abréviations après lesquelles la phrase continue (« p. 12 », « cf. », « M. Dupont »…).
  const ABBREVIATIONS = new Set(['etc', 'cf', 'ex', 'p', 'pp', 'env', 'av', 'apr', 'mme', 'mmes', 'mlle', 'mm', 'dr', 'pr', 'st', 'ste',
    'vol', 'chap', 'fig', 'art', 'al', 'réf', 'tél', 'éd', 'coll', 'cad', 'vs', 'resp', 'sq', 'id', 'op', 'cit', 'ibid', 'no', 'nº']);

  function startsSentence(before) {
    if (before.trim() === '') return true;
    if (!/[.!?…][»”"’)\]]*[\s  ]+$/.test(before)) return false;
    const word = /([\p{L}º°]+)\.[\s  ]+$/u.exec(before);
    if (word && (word[1].length === 1 || ABBREVIATIONS.has(word[1].toLowerCase()))) return false;
    return true;
  }

  editor.addEventListener('beforeinput', (e) => {
    if (!capitalize || e.inputType !== 'insertText' || !e.data || [...e.data].length !== 1 || e.isComposing) return;
    const up = e.data.toLocaleUpperCase('fr-FR');
    if (up === e.data || [...up].length !== 1) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const elNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!elNode || !editor.contains(elNode) || elNode.closest('.ft-math') || (elNode.closest('.ft-image') && !elNode.closest('.ft-caption'))) return;
    const block = elNode.closest('.ft-caption, p, li, h1, h2, h3, h4, h5, h6, td, th, div:not(.ft-cols):not(.ft-footnotes)');
    if (!block || block === editor || !editor.contains(block)) return;
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(sel.anchorNode, sel.anchorOffset);
    // Dans une liste, seul le texte de l'élément compte (pas celui de l'élément qui le contient).
    if (!startsSentence(before.toString())) return;
    e.preventDefault();
    document.execCommand('insertText', false, up);
    // Retenu pour structure.js : « i. » ou « a. » tapés en minuscule restent une numérotation en minuscules.
    lastCap = before.toString().trim() === '' ? { block, letter: up } : null;
  });
  let lastCap = null;

  // ----- Pour les autres fichiers -----

  window.FTLayout = {
    // Document ouvert : ses colonnes et ses images.
    load(settings) {
      const c = settings && settings.columns;
      docColumns = { count: c && [2, 3].includes(c.count) ? c.count : 1, rule: !!(c && c.rule) };
      applyDocColumns();
      if (!engine) adopt(editor);
      layoutPop.hidden = true;
      zoneOutline.hidden = true;
    },
    getColumns: () => ({ ...docColumns }),
    // La première lettre de ce paragraphe a-t-elle été mise en majuscule automatiquement ?
    autoCapital: (block, letter) => !!lastCap && lastCap.block === block && lastCap.letter === letter,
    serialize,
    packImages,
    sendImages,
    resetImages,
    wrapMenu,
    zoneMenu,
    columnItems: selectionItems,
    makeZone,
    startDrag,
    // Mouvement fixe : l'objet ne se déplace pas (structure.js : poignée, Alt+flèches).
    isLocked,
    setCapitalize,
    onCapitalizeChange(fn) { onCapitalizeChange = fn; },
    // Moteur 2.0 (moteur/ecriture.js) : la majuscule automatique est donnée par le moteur.
    capitalizeOn: () => capitalize,
    startsSentence,
    insertImages,
    // Moteur 2.0 : les objets sont ceux de la zone du moteur ; api remplace FTStructure (objets.js).
    useEngine(mount, api) {
      for (const [type, fn, opts] of engineListeners) {
        editor.removeEventListener(type, fn, opts);
        mount.addEventListener(type, fn, opts);
      }
      editor = mount;
      S = () => api;
      engine = true;
      api.onObjectChange(objectChanged);
    },
    imageMenu,
    isObject,
    isImage,
    posOf,
    refreshTools: scheduleTools,
    closeImagePop,
    // Pour les schémas (diagram.js) : adresse affichable d'une image data:, et enveloppe .ft-image.
    imageUrl: blobUrlFor,
    displayUrl,
    makeImage
  };
})();
