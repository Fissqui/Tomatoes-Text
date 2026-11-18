// Repères biographiques : courte notice sur une personne (portrait, nom, dates, présentation, idées,
// œuvres), posée dans le texte comme un encadré, à droite ou à gauche du texte, ou sur toute la largeur.
// - Données : bio/economie.js (FTBioData), vérifiées sur Wikidata et la BnF. Portrait pris sur Wikimedia
//   Commons avec sa licence (main.js, « bio:portrait »), ou image de l'ordinateur, ou silhouette.
// - Dans le document : <blockquote class="ft-callout ft-bio" data-bio="Q…"> ; ses paragraphes s'écrivent
//   comme ceux d'un encadré. La forme (modèle, couleur, police, taille, photo) est portée par ses attributs
//   data-bio-* ; le contenu choisi, par data-bio-r (JSON), pour rouvrir la fenêtre avec les mêmes réglages.
// - Fenêtre « Repère biographique » : personne, contenu, forme, aperçu ; la forme peut s'appliquer à tous
//   les repères du document. Les réglages servent de départ au repère suivant.
(function () {
  const $ = (id) => document.getElementById(id);
  const DATA = window.FTBioData || { groupes: {}, personnes: [] };
  const PEOPLE = DATA.personnes;
  const byId = new Map(PEOPLE.map((p) => [p.id, p]));
  const PREFS = 'ft-bio-reglages';

  const MODELES = [
    ['medaillon', 'Médaillon'],
    ['fiche', 'Fiche'],
    ['bandeau', 'Bandeau'],
    ['sobre', 'Sobre'],
    ['carte', 'Carte'],
    ['marge', 'Note de marge'],
    ['classique', 'Double filet'],
    ['encyclopedie', 'Encyclopédie'],
    ['presse', 'Presse'],
    ['onglet', 'Onglet'],
    ['ombre', 'Ombre décalée'],
    ['aplat', 'Aplat'],
    ['pointilles', 'Pointillés'],
    ['coins', 'Coins'],
    ['parchemin', 'Parchemin'],
    ['sombre', 'Fond sombre']
  ];
  const COULEURS = [
    ['brun', 'Brun', '#a8552b'],
    ['bordeaux', 'Bordeaux', '#8e2f3c'],
    ['bleu', 'Bleu', '#2f5d8a'],
    ['vert', 'Vert', '#3d7a4f'],
    ['ardoise', 'Ardoise', '#4f5b66'],
    ['or', 'Or', '#a8801f'],
    ['orange', 'Orange', '#c2621a'],
    ['violet', 'Violet', '#6a4c8c'],
    ['sarcelle', 'Sarcelle', '#24727a'],
    ['noir', 'Noir', '#2b2b2b'],
    ['doc', 'Couleur du document', '']
  ];

  const DEFAULTS = {
    // Contenu
    id: 'Q9061',
    libre: null,
    precision: 'standard',
    angle: 'equilibre',
    bandeau: true,
    bandeauTexte: 'Repère biographique',
    photo: 'commons',
    dates: true,
    dateFormat: 'annees',
    lieux: false,
    nationalite: false,
    courant: false,
    texte: true,
    idees: false,
    oeuvres: false,
    sources: false,
    // Forme
    modele: 'medaillon',
    couleur: 'brun',
    police: 'sans',
    taille: 85,
    forme: 'ronde',
    aligne: 'gauche',
    entete: 'modele',
    position: 'droite',
    largeur: 36
  };
  const CONTENT_KEYS = ['id', 'libre', 'precision', 'angle', 'bandeau', 'bandeauTexte', 'photo', 'dates', 'dateFormat', 'lieux', 'nationalite', 'courant', 'texte', 'idees', 'oeuvres', 'sources'];

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) || 'null');
      return p && typeof p === 'object' ? { ...DEFAULTS, ...p, libre: null } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function savePrefs(o) {
    try { localStorage.setItem(PREFS, JSON.stringify({ ...o, libre: null, photoData: undefined })); } catch { /* rien */ }
  }

  // ----- Texte de la notice -----

  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateText(s, full) {
    if (!s) return '';
    const approx = s.startsWith('~');
    const [y, m, d] = s.replace('~', '').split('-');
    if (approx) return 'v. ' + y;
    if (!full || !m) return y;
    const month = MOIS[parseInt(m, 10) - 1];
    if (!d) return month + ' ' + y;
    const day = parseInt(d, 10);
    return (day === 1 ? '1er' : day) + ' ' + month + ' ' + y;
  }
  function datesLine(p, o) {
    const full = o.dateFormat === 'complet';
    const a = dateText(p.n, full);
    if (p.vivant || !p.d) return (p.sexe === 'f' ? 'Née ' : 'Né ') + (full && /\d{4}-\d\d-\d\d/.test(p.n) ? 'le ' : 'en ') + a;
    const b = dateText(p.d, full);
    return full ? a + ' – ' + b : a + ' — ' + b;
  }
  // Adjectif de nationalité accordé avec « nationalité » (féminin).
  function feminin(nat) {
    let after = false;
    return nat.split(' ').map((w) => {
      if (/^d['’]origine$/.test(w)) after = true;
      if (after || /^(puis|et|d['’]origine)$/.test(w) || /e$/.test(w)) return w;
      if (/ien$/.test(w)) return w + 'ne';
      return w + 'e';
    }).join(' ');
  }
  const sentences = (t) => (t || '').match(/[^.!?]+(?:[.!?]+|$)/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const title = (t) => {
    const m = /^(.*?)( \((?:avec|with) [^)]*\))$/.exec(t);
    return m ? `<i>${esc(m[1])}</i>${esc(m[2])}` : `<i>${esc(t)}</i>`;
  };

  // Paragraphes de présentation selon le degré de précision et l'angle.
  function presentation(p, o) {
    const out = [p.role];
    if (o.precision === 'bref') return out;
    const parcours = sentences(p.parcours);
    const pensee = sentences(p.pensee);
    if (o.precision === 'standard') {
      if (o.angle === 'parcours') out.push(parcours.join(' '));
      else if (o.angle === 'pensee') out.push(pensee.join(' '));
      else out.push([parcours[0], pensee[0]].filter(Boolean).join(' '));
      return out.filter(Boolean);
    }
    const parts = o.angle === 'pensee' ? [p.pensee, p.parcours] : [p.parcours, p.pensee];
    return [...out, ...parts].filter(Boolean);
  }

  const SILHOUETTE = '<svg class="ft-bio-silhouette" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="38" r="17"/><path d="M50 58c-20 0-34 11-37 34h74c-3-23-17-34-37-34z"/><rect x="45" y="50" width="10" height="10"/></svg>';

  function portraitHtml(o, person, photo) {
    if (o.photo === 'aucune') return '';
    const alt = esc(person.nom);
    const inner = photo && photo.src ? `<img src="${esc(photo.src)}" alt="${alt}">` : SILHOUETTE;
    return `<p class="ft-bio-portrait"><span class="ft-bio-photo" contenteditable="false">${inner}</span></p>`;
  }

  function creditOf(photo) {
    if (!photo || !photo.src || !photo.licence) return '';
    const free = /domaine public|public domain|^pd|cc0/i.test(photo.licence);
    if (free) return 'Portrait : Wikimedia Commons, domaine public.';
    return `Portrait : ${photo.auteur ? photo.auteur + ', ' : ''}${photo.licence}, Wikimedia Commons${photo.recadre ? ' (recadré)' : ''}.`;
  }

  // HTML du contenu du repère (sans le cadre).
  function contentHtml(o, photo) {
    const libre = o.id === 'libre';
    const p = libre ? freePerson(o.libre) : byId.get(o.id);
    if (!p) return '';
    const parts = [];
    if (o.bandeau && o.bandeauTexte.trim()) parts.push(`<p class="ft-bio-kicker">${esc(o.bandeauTexte.trim())}</p>`);
    parts.push(portraitHtml(o, p, photo));
    parts.push(`<p class="ft-bio-name">${esc(p.complet && o.precision === 'detaille' ? p.complet : p.nom)}</p>`);
    if (o.dates) {
      const line = libre ? p.datesTexte : datesLine(p, o);
      if (line) parts.push(`<p class="ft-bio-dates">${esc(line)}</p>`);
    }
    const meta = [];
    if (o.lieux && !libre && p.ln) {
      const f = p.sexe === 'f';
      meta.push(`${f ? 'Née' : 'Né'} à ${p.ln}` + (p.ld ? `, ${f ? 'morte' : 'mort'} à ${p.ld}` : ''));
    } else if (o.lieux && libre && p.lieux) meta.push(p.lieux);
    if (o.nationalite && !libre && p.nat) meta.push('Nationalité ' + feminin(p.nat));
    if (o.courant && !libre && p.courant) meta.push('Courant : ' + p.courant);
    for (const m of meta) parts.push(`<p class="ft-bio-meta">${esc(m)}</p>`);
    if (o.texte) {
      const paras = libre ? (p.texte || '').split(/\n+/).map((s) => s.trim()).filter(Boolean) : presentation(p, o);
      for (const t of paras) parts.push(`<p class="ft-bio-text">${esc(t)}</p>`);
    }
    if (o.idees && !libre && p.idees && p.idees.length) {
      parts.push('<p class="ft-bio-head">Notions clés</p>');
      parts.push(`<ul class="ft-bio-list">${p.idees.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
    }
    if (o.oeuvres && !libre && p.oeuvres && p.oeuvres.length) {
      parts.push(`<p class="ft-bio-head">${p.oeuvres.length > 1 ? 'Œuvres majeures' : 'Œuvre majeure'}</p>`);
      parts.push(`<ul class="ft-bio-list">${p.oeuvres.map(([t, y]) => `<li>${title(t)} (${esc(y)})</li>`).join('')}</ul>`);
    }
    // Crédit du portrait : toujours là quand la licence le demande.
    const credit = o.photo === 'commons' ? creditOf(photo) : '';
    const needCredit = credit && photo.attribution;
    if (o.sources && !libre) {
      const bits = [`Wikidata (${p.id})`];
      if (p.bnf) bits.push(`BnF (notice ${p.bnf})`);
      parts.push(`<p class="ft-bio-src">Sources : ${esc(bits.join(', '))}.${credit ? ' ' + esc(credit) : ''}</p>`);
    } else if (needCredit) {
      parts.push(`<p class="ft-bio-src">${esc(credit)}</p>`);
    }
    return parts.join('');
  }

  function freePerson(l) {
    l = l || {};
    return { id: 'libre', nom: l.nom || 'Nom de la personne', datesTexte: l.dates || '', lieux: l.lieux || '', texte: l.texte || '' };
  }

  // Attributs de forme du cadre.
  function frameAttrs(o) {
    const a = {
      class: 'ft-callout ft-bio',
      'data-bio': o.id === 'libre' ? 'libre' : o.id,
      'data-bio-modele': o.modele,
      'data-bio-couleur': o.couleur,
      'data-bio-police': o.police,
      'data-bio-forme': o.forme
    };
    if (o.aligne && o.aligne !== 'gauche') a['data-bio-aligne'] = o.aligne;
    if (o.entete && o.entete !== 'modele') a['data-bio-entete'] = o.entete;
    const style = [];
    if (o.position !== 'pleine') {
      a['data-wrap'] = o.position;
      style.push(`width: ${Math.min(80, Math.max(20, Math.round(o.largeur)))}%`);
    }
    if (o.taille !== 100) style.push(`--bio-t: ${Math.min(160, Math.max(50, Math.round(o.taille))) / 100}`);
    if (style.length) a.style = style.join('; ');
    return a;
  }

  function contentSettings(o) {
    const c = {};
    for (const k of CONTENT_KEYS) c[k] = o[k];
    return c;
  }

  function buildElement(o, photo) {
    const el = document.createElement('blockquote');
    for (const [k, v] of Object.entries(frameAttrs(o))) el.setAttribute(k, v);
    el.setAttribute('data-bio-r', JSON.stringify(contentSettings(o)));
    el.innerHTML = contentHtml(o, photo);
    return el;
  }

  // Réglages d'un repère du document.
  function settingsOf(box) {
    const o = loadPrefs();
    try { Object.assign(o, JSON.parse(box.getAttribute('data-bio-r') || '{}')); } catch { /* réglages illisibles */ }
    const d = box.dataset;
    if (d.bioModele) o.modele = d.bioModele;
    if (d.bioCouleur) o.couleur = d.bioCouleur;
    if (d.bioPolice) o.police = d.bioPolice;
    if (d.bioForme) o.forme = d.bioForme;
    o.aligne = d.bioAligne || 'gauche';
    o.entete = d.bioEntete || 'modele';
    o.position = d.wrap === 'gauche' || d.wrap === 'droite' ? d.wrap : 'pleine';
    const w = parseFloat(box.style.width);
    if (w) o.largeur = w;
    const t = parseFloat(box.style.getPropertyValue('--bio-t'));
    o.taille = t ? Math.round(t * 100) : 100;
    return o;
  }

  // ----- Portrait -----

  const portraits = new Map();
  async function fetchPortrait(person) {
    if (!person || !person.photo || !window.frameText || !window.frameText.bioPortrait) return null;
    if (portraits.has(person.id)) return portraits.get(person.id);
    let got = null;
    try { got = await window.frameText.bioPortrait(person.id, person.photo); } catch { got = null; }
    if (got && got.src) portraits.set(person.id, got);
    return got && got.src ? got : null;
  }

  // ----- Fenêtre -----

  const dialog = $('bio-dialog');
  let state = loadPrefs();
  let editing = null;      // repère modifié (élément du document), ou null pour un nouveau
  let original = null;     // réglages de contenu à l'ouverture (pour savoir s'il faut refaire le texte)
  let photo = null;        // portrait affiché : { src, licence, auteur, attribution } ou null
  let fileImage = null;    // image choisie sur l'ordinateur
  let mark = null;         // endroit du curseur à l'ouverture
  let photoJob = 0;

  function fillLists() {
    $('bio-modele').innerHTML = MODELES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
    $('bio-couleurs').innerHTML = COULEURS.map(([v, n, c]) => `<button type="button" class="bio-swatch" data-c="${v}" title="${n}" style="--sw: ${c || 'var(--accent)'}">${v === 'doc' ? 'Doc' : ''}</button>`).join('');
  }

  function renderList() {
    const q = $('bio-search').value.trim().toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
    const norm = (s) => s.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '');
    const box = $('bio-list');
    const parts = [];
    for (const [g, name] of Object.entries(DATA.groupes)) {
      const people = PEOPLE.filter((p) => p.g === g && (!q || norm(p.nom + ' ' + (p.complet || '') + ' ' + (p.courant || '')).includes(q)));
      if (!people.length) continue;
      parts.push(`<div class="bio-group">${esc(name)}</div>`);
      for (const p of people) {
        const years = p.vivant ? 'né' + (p.sexe === 'f' ? 'e' : '') + ' en ' + p.n.slice(0, 4) : dateText(p.n) + '–' + dateText(p.d);
        parts.push(`<button type="button" class="bio-item${state.id === p.id ? ' on' : ''}" data-id="${p.id}"><span>${esc(p.nom)}</span><small>${esc(years)}</small></button>`);
      }
    }
    if (!q || norm('autre personne').includes(q)) {
      parts.push('<div class="bio-group">Autre</div>');
      parts.push(`<button type="button" class="bio-item${state.id === 'libre' ? ' on' : ''}" data-id="libre"><span>Autre personne…</span><small>notice à écrire</small></button>`);
    }
    box.innerHTML = parts.join('') || '<p class="bio-empty">Aucun résultat.</p>';
    const on = box.querySelector('.bio-item.on');
    if (on && !q) on.scrollIntoView({ block: 'nearest' });
  }

  function syncFields() {
    const o = state;
    for (const k of ['precision', 'angle', 'dateFormat', 'photo', 'modele', 'police', 'forme', 'aligne', 'entete', 'position']) {
      const el = $('bio-' + k);
      if (el) el.value = o[k];
    }
    for (const k of ['bandeau', 'dates', 'lieux', 'nationalite', 'courant', 'texte', 'idees', 'oeuvres', 'sources']) $('bio-' + k).checked = !!o[k];
    $('bio-bandeauTexte').value = o.bandeauTexte;
    $('bio-taille').value = o.taille;
    $('bio-largeur').value = o.largeur;
    $('bio-largeur').disabled = o.position === 'pleine';
    $('bio-bandeauTexte').disabled = !o.bandeau;
    $('bio-angle').disabled = o.precision === 'bref' || !o.texte;
    $('bio-precision').disabled = !o.texte;
    const libre = o.id === 'libre';
    $('bio-libre').hidden = !libre;
    for (const k of ['nationalite', 'courant', 'idees', 'oeuvres', 'sources']) $('bio-' + k).closest('label').classList.toggle('off', libre);
    if (libre) {
      const l = o.libre || {};
      $('bio-l-nom').value = l.nom || '';
      $('bio-l-dates').value = l.dates || '';
      $('bio-l-lieux').value = l.lieux || '';
      $('bio-l-texte').value = l.texte || '';
    }
    for (const b of $('bio-couleurs').children) b.classList.toggle('on', b.dataset.c === o.couleur);
    const commons = $('bio-photo').querySelector('option[value="commons"]');
    const p = byId.get(o.id);
    commons.disabled = libre || !(p && p.photo);
  }

  function readFields() {
    const o = state;
    for (const k of ['precision', 'angle', 'dateFormat', 'photo', 'modele', 'police', 'forme', 'aligne', 'entete', 'position']) o[k] = $('bio-' + k).value;
    for (const k of ['bandeau', 'dates', 'lieux', 'nationalite', 'courant', 'texte', 'idees', 'oeuvres', 'sources']) o[k] = $('bio-' + k).checked;
    o.bandeauTexte = $('bio-bandeauTexte').value;
    o.taille = parseFloat($('bio-taille').value) || 100;
    o.largeur = parseFloat($('bio-largeur').value) || 36;
    if (o.id === 'libre') o.libre = { nom: $('bio-l-nom').value, dates: $('bio-l-dates').value, lieux: $('bio-l-lieux').value, texte: $('bio-l-texte').value };
  }

  function currentPhoto() {
    if (state.photo === 'fichier') return fileImage ? { src: fileImage } : null;
    if (state.photo === 'commons') return photo;
    return null;
  }

  function renderPreview() {
    const el = buildElement(state, currentPhoto());
    // Dans l'aperçu : un cadre à côté de lignes de texte grisées.
    const page = document.createElement('div');
    page.className = 'bio-apercu-in';
    $('bio-apercu').replaceChildren(page);
    page.append(el);
    const filler = document.createElement('div');
    filler.className = 'bio-filler';
    filler.innerHTML = '<p></p>'.repeat(9).replace(/<p><\/p>/g, () => '<p>' + '<span></span>'.repeat(9) + '</p>');
    page.append(filler);
    $('bio-info').textContent = infoLine();
  }

  function infoLine() {
    if (state.id === 'libre') return 'Notice à écrire : les champs vides ne sont pas affichés.';
    const p = byId.get(state.id);
    if (!p) return '';
    if (state.photo === 'commons' && !p.photo) return 'Aucun portrait libre de droits pour cette personne : silhouette affichée.';
    if (state.photo === 'commons' && !photo) return loadingPhoto ? 'Recherche du portrait sur Wikimedia Commons…' : 'Portrait indisponible (pas de connexion) : silhouette affichée.';
    return 'Sources : Wikidata, BnF' + (state.photo === 'commons' && photo ? ', portrait Wikimedia Commons (' + (photo.licence || 'licence non précisée') + ')' : '') + '.';
  }

  let loadingPhoto = false;
  async function loadPhoto() {
    const job = ++photoJob;
    const p = byId.get(state.id);
    photo = p ? portraits.get(p.id) || null : null;
    if (photo || state.photo !== 'commons' || !p || !p.photo) { loadingPhoto = false; renderPreview(); return; }
    loadingPhoto = true;
    renderPreview();
    const got = await fetchPortrait(p);
    if (job !== photoJob) return;
    loadingPhoto = false;
    photo = got;
    renderPreview();
  }

  function choose(id) {
    if (id === state.id) return;
    state.id = id;
    if (id === 'libre') {
      state.libre = state.libre || { nom: '', dates: '', lieux: '', texte: '' };
      if (state.photo === 'commons') state.photo = 'silhouette';
    } else if (/^(aucune|silhouette)$/.test(state.photo) && byId.get(id) && byId.get(id).photo && !editing) {
      state.photo = 'commons';
    }
    renderList();
    syncFields();
    loadPhoto();
  }

  function open(box) {
    if (!(window.FTApp && window.FTApp.currentId())) return;
    editing = box && box.isConnected ? box : null;
    state = editing ? settingsOf(editing) : loadPrefs();
    if (!byId.has(state.id) && state.id !== 'libre') state.id = DEFAULTS.id;
    original = JSON.stringify(contentSettings(state));
    fileImage = null;
    photo = null;
    if (editing) {
      const img = editing.querySelector('.ft-bio-photo img');
      if (img && state.photo === 'fichier') fileImage = img.getAttribute('src');
      if (img && state.photo === 'commons') {
        // Portrait déjà dans le document (le crédit est relu sur la ligne des sources).
        const src = editing.querySelector('.ft-bio-src');
        const kept = portraits.get(state.id);
        photo = kept || { src: img.getAttribute('src'), licence: '', auteur: '', attribution: false, keptCredit: src ? src.textContent : '' };
      }
    }
    const M = window.FTMoteur;
    mark = M && M.view ? { from: M.view.state.selection.from, to: M.view.state.selection.to } : null;
    $('bio-search').value = '';
    $('bio-ok').textContent = editing ? 'Valider' : 'Insérer';
    $('bio-remove').hidden = !editing;
    $('bio-scope').hidden = !editing;
    $('bio-scope-all').checked = false;
    renderList();
    syncFields();
    if (!dialog.open) dialog.showModal();
    if (photo) renderPreview();
    else loadPhoto();
    setTimeout(() => $('bio-search').focus(), 0);
  }

  // ----- Écriture dans le document -----

  const O = () => window.FTObjets;
  function nodeOf(el) { return window.FTSchema.parse(el.outerHTML).firstChild; }

  function insertNew(el) {
    const M = window.FTMoteur;
    if (!M || !M.view) return;
    const view = M.view;
    const { TextSelection, Selection } = PM.state;
    view.focus();
    const size = view.state.doc.content.size;
    if (mark) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(mark.from, size)))));
    if (state.position === 'pleine') { O().insertBlockObject(el); return; }
    // À côté du texte : avant le paragraphe du curseur, que le texte entoure.
    const node = nodeOf(el);
    if (!node) return;
    const tr = view.state.tr;
    const $at = tr.selection.$from;
    const at = $at.depth ? $at.before(1) : $at.pos;
    tr.insert(at, node);
    const after = at + node.nodeSize;
    if (!tr.doc.resolve(after).nodeAfter) tr.insert(after, view.state.schema.nodes.paragraph.create());
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(after + 1, tr.doc.content.size)), 1));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  }

  // Attributs du cadre d'un repère déjà posé, avec la nouvelle forme. keepPlace : sa place (habillage,
  // largeur, position réglée à la souris) reste telle quelle.
  const styleParts = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);
  function mergeFrame(a, o, keepPlace) {
    const out = { ...a };
    const f = frameAttrs(o);
    for (const k of ['data-bio-modele', 'data-bio-couleur', 'data-bio-police', 'data-bio-forme', 'data-bio-aligne', 'data-bio-entete']) {
      if (f[k]) out[k] = f[k];
      else delete out[k];
    }
    let rest = styleParts(out.style).filter((x) => !x.startsWith('--bio-t'));
    if (!keepPlace) {
      for (const k of ['data-wrap', 'data-pos', 'data-anchor', 'data-align']) delete out[k];
      rest = rest.filter((x) => !/^(width|left|top|--x|--y|--mx|--ml)\s*:/.test(x));
      if (f['data-wrap']) {
        out['data-wrap'] = f['data-wrap'];
        rest.push(styleParts(f.style).find((x) => x.startsWith('width')));
      }
    }
    if (o.taille !== 100) rest.push(`--bio-t: ${Math.min(160, Math.max(50, Math.round(o.taille))) / 100}`);
    if (rest.length) out.style = rest.join('; ');
    else delete out.style;
    return out;
  }
  const isBioNode = (n) => n.type.name === 'blockquote' && /(^|\s)ft-bio(\s|$)/.test(n.attrs.a.class || '');

  function validate() {
    readFields();
    dialog.close();
    savePrefs(state);
    const el = buildElement(state, currentPhoto());
    if (!editing || !editing.isConnected) { insertNew(el); return; }
    const view = window.FTMoteur.view;
    const pos = O().posOf(editing);
    if (pos === null) return;
    const node = view.state.doc.nodeAt(pos);
    const before = settingsOf(editing);
    const keepPlace = before.position === state.position && Math.round(before.largeur) === Math.round(state.largeur);
    const a = mergeFrame(node.attrs.a, state, keepPlace);
    a['data-bio-r'] = JSON.stringify(contentSettings(state));
    const tr = view.state.tr;
    const sameContent = JSON.stringify(contentSettings(state)) === original &&
      !(state.photo === 'fichier' && fileImage && !editing.querySelector('.ft-bio-photo img[src="' + CSS.escape(fileImage) + '"]'));
    if (sameContent) {
      // Forme seule : le texte, peut-être retouché à la main, reste.
      tr.setNodeMarkup(pos, null, { ...node.attrs, a });
    } else {
      for (const at of [...el.attributes]) el.removeAttribute(at.name);
      for (const [k, v] of Object.entries(a)) el.setAttribute(k, v);
      const fresh = nodeOf(el);
      if (fresh) tr.replaceWith(pos, pos + node.nodeSize, fresh);
    }
    if ($('bio-scope-all').checked) {
      tr.doc.descendants((n, p) => {
        if (!isBioNode(n)) return n.isBlock;
        if (p !== pos) tr.setNodeMarkup(p, null, { ...n.attrs, a: mergeFrame(n.attrs.a, state, true) });
        return false;
      });
    }
    if (tr.docChanged) view.dispatch(tr);
  }

  function remove() {
    dialog.close();
    if (editing && editing.isConnected) O().removeObject(editing);
  }

  // ----- Évènements de la fenêtre -----

  if (dialog) {
    fillLists();
    $('bio-search').addEventListener('input', renderList);
    $('bio-search').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = $('bio-list').querySelector('.bio-item');
      if (first) choose(first.dataset.id);
    });
    $('bio-list').addEventListener('click', (e) => {
      const b = e.target.closest('.bio-item');
      if (b) choose(b.dataset.id);
    });
    dialog.addEventListener('change', (e) => {
      if (e.target.closest('#bio-list, #bio-search, #bio-file')) return;
      const wasPhoto = state.photo;
      const wasPrecision = state.precision;
      readFields();
      // Degré de précision : les listes suivent (détaillé : notions et œuvres ; bref : sans).
      if (e.target.id === 'bio-precision' && state.precision !== wasPrecision) {
        state.idees = state.oeuvres = state.precision === 'detaille';
      }
      if (e.target.id === 'bio-photo' && state.photo === 'fichier' && !fileImage) {
        state.photo = wasPhoto;
        $('bio-file').click();
      }
      syncFields();
      if (e.target.id === 'bio-photo' && state.photo === 'commons') loadPhoto();
      else renderPreview();
    });
    dialog.addEventListener('input', (e) => {
      if (e.target.matches('#bio-libre input, #bio-libre textarea, #bio-bandeauTexte')) { readFields(); renderPreview(); }
    });
    $('bio-couleurs').addEventListener('click', (e) => {
      const b = e.target.closest('.bio-swatch');
      if (!b) return;
      state.couleur = b.dataset.c;
      syncFields();
      renderPreview();
    });
    $('bio-file').addEventListener('change', () => {
      const f = $('bio-file').files[0];
      $('bio-file').value = '';
      if (!f || !/^image\//.test(f.type) || f.size > 8e6) return;
      const r = new FileReader();
      r.onload = () => {
        shrink(String(r.result)).then((src) => {
          fileImage = src;
          state.photo = 'fichier';
          syncFields();
          renderPreview();
        });
      };
      r.readAsDataURL(f);
    });
    $('bio-pick').addEventListener('click', () => $('bio-file').click());
    $('bio-ok').addEventListener('click', validate);
    $('bio-cancel').addEventListener('click', () => dialog.close());
    $('bio-remove').addEventListener('click', remove);
    $('bio-btn').addEventListener('mousedown', (e) => e.preventDefault());
    $('bio-btn').addEventListener('click', () => open(null));
  }

  // Image de l'ordinateur ramenée à 400 pixels au plus (le document reste léger).
  function shrink(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 400 / Math.max(img.width, img.height));
        if (k >= 1) { resolve(src); return; }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  // ----- Dans le texte : clic sur le portrait, clic droit -----

  const editorEl = () => $('editor');
  document.addEventListener('click', (e) => {
    const ph = e.target.closest && e.target.closest('.ft-bio .ft-bio-photo');
    if (!ph || !editorEl() || !editorEl().contains(ph)) return;
    e.preventDefault();
    open(ph.closest('.ft-bio'));
  });

  function menuItems(box) {
    return [
      { text: 'Modifier le repère biographique…', action: () => open(box) }
    ];
  }

  window.FTBio = {
    open,
    menuItems,
    isBio: (el) => !!(el && el.classList && el.classList.contains('ft-bio')),
    // Pour le banc d'essai.
    build: (o, ph) => buildElement({ ...DEFAULTS, ...o }, ph || null),
    settingsOf,
    people: () => PEOPLE.slice(),
    defaults: () => ({ ...DEFAULTS })
  };
})();
