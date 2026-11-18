// Modèles de mise en page (bouton « Modèle » à côté du thème du document, Affichage > « Modèle de mise en
// page… », Fichier > « Nouveau document depuis un modèle… », accueil).
// Un modèle règle tout le document d'un coup : thème du document (police, styles des titres, plan…),
// format et marges des pages, numéros, en-tête et pied de page, nouvelle page avant les chapitres, page de
// titre, sommaire et, dans un document vide, une structure type (titres, ou lignes d'une lettre). Le
// document passe en mode avancé.
// Quatre modèles prêts ; chacun se règle, s'enregistre dans « Mes modèles » (réglages du logiciel) et
// s'exporte en fichier .ttmodele pour être partagé.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.frameText;
  const dialog = $('model-dialog');
  const panel = $('model-panel');
  const applyBtn = $('model-apply');

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  };
  const num = (v, min, max, def) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    return v !== '' && v !== null && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mmText = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const T = () => window.FTTheme;
  const P = () => window.FTPages;

  // ----- Contenu d'un modèle -----
  // { v, id, name, note,
  //   theme : thème du document (theme.js), ou null (le document garde le sien),
  //   page : { size, w, h, orient, margins, numbers { on, pos, format, from, first }, header, footer (HTML ;
  //          {titre} : nom du document), chapters (nouvelle page avant les titres 1 : 1, 1 et 2 : 2) },
  //   cover : { model (page de titre, '' : aucune), surtitre, mention },
  //   toc : { place ('' | 'debut' | 'fin'), page (sur une page à part) },
  //   structure : [{ k (p, h1…h5), t (texte ; {date}, {titre}), al ('' | right | center | half), b (gras),
  //                n (titre sans numéro) }] }

  const S = (k, t, o = {}) => ({ k, t, al: '', b: false, n: false, ...o });
  const H = (align, inner) => `<p style="text-align: ${align}">${inner}</p>`;

  function theme(id, change) {
    const all = T().builtins();
    const t = all.find((x) => x.id === id) || all[0];
    if (change) change(t);
    return t;
  }
  const tocCfg = (preset, change) => ({ ...window.FTToc.presetConfig(preset), ...change });

  function builtins() {
    return [
      {
        id: 'memoire', name: 'Mémoire universitaire',
        note: 'Page de titre, sommaire, titres numérotés 1.1, interligne 1,5, chaque partie sur une nouvelle page.',
        theme: theme('academique', (t) => {
          t.text.line = 1.5;
          t.margins = null;
          t.toc = tocCfg('academique', { title: 'Sommaire', number: 'titres', levels: 3 });
        }),
        page: { size: 'A4', orient: 'portrait', margins: { top: 25, bottom: 25, left: 30, right: 25 },
          numbers: { on: true, pos: 'bas-centre', format: '1', from: 2, first: 1 }, header: '', footer: '', chapters: 1 },
        cover: { model: 'academique', surtitre: '', mention: 'Mémoire de master' },
        toc: { place: 'debut', page: true },
        structure: [
          S('h1', 'Remerciements', { n: true }), S('p', ''),
          S('h1', 'Introduction', { n: true }), S('p', ''),
          S('h1', 'Titre de la première partie'), S('h2', 'Titre du premier chapitre'), S('p', ''), S('h2', 'Titre du deuxième chapitre'), S('p', ''),
          S('h1', 'Titre de la deuxième partie'), S('h2', 'Titre du premier chapitre'), S('p', ''), S('h2', 'Titre du deuxième chapitre'), S('p', ''),
          S('h1', 'Conclusion', { n: true }), S('p', ''),
          S('h1', 'Bibliographie', { n: true }), S('p', ''),
          S('h1', 'Annexes', { n: true }), S('p', '')
        ]
      },
      {
        id: 'roman', name: 'Roman',
        note: 'Format livre A5, Garamond justifié, chapitres en chiffres romains, table des matières à la fin.',
        theme: theme('roman', (t) => {
          Object.assign(t.text, { size: 11.5, line: 1.45, space: 0 });
          t.margins = null;
          t.toc = tocCfg('livre', { number: 'titres', levels: 1 });
        }),
        page: { size: 'A5', orient: 'portrait', margins: { top: 20, bottom: 20, left: 18, right: 15 },
          numbers: { on: true, pos: 'bas-centre', format: '1', from: 1, first: 1 }, header: H('center', '<em>{titre}</em>'), footer: '', chapters: 1 },
        cover: { model: 'edition', surtitre: '', mention: 'Roman' },
        toc: { place: 'fin', page: true },
        structure: [S('h1', 'Titre du chapitre'), S('p', ''), S('h1', 'Titre du chapitre'), S('p', '')]
      },
      {
        id: 'rapport', name: 'Rapport',
        note: 'Page de titre, sommaire, titres numérotés 1. et 1.1, numéros « Page 1 sur 12 », en-tête au nom du rapport.',
        theme: theme('rapport', (t) => {
          t.margins = null;
          t.toc = tocCfg('rapport', { number: 'titres' });
        }),
        page: { size: 'A4', orient: 'portrait', margins: { top: 25, bottom: 25, left: 25, right: 25 },
          numbers: { on: true, pos: 'bas-droite', format: 'page-sur', from: 2, first: 1 }, header: H('right', '{titre}'), footer: '', chapters: 0 },
        cover: { model: 'rapport', surtitre: '', mention: 'Rapport' },
        toc: { place: 'debut', page: true },
        structure: [
          S('h1', 'Synthèse', { n: true }), S('p', ''),
          S('h1', 'Introduction'), S('p', ''),
          S('h1', 'Contexte'), S('h2', 'Objectifs'), S('p', ''), S('h2', 'Méthode'), S('p', ''),
          S('h1', 'Résultats'), S('p', ''),
          S('h1', 'Recommandations'), S('p', ''),
          S('h1', 'Conclusion'), S('p', ''),
          S('h1', 'Annexes', { n: true }), S('p', '')
        ]
      },
      {
        id: 'lettre', name: 'Lettre',
        note: 'Lettre à la française : expéditeur, destinataire, lieu et date, objet, formule de politesse, signature.',
        theme: theme('classique', (t) => {
          Object.assign(t.text, { font: 'Source Serif 4', size: 11.5, line: 1.4, space: 0.4 });
          t.margins = null;
        }),
        page: { size: 'A4', orient: 'portrait', margins: { top: 25, bottom: 20, left: 25, right: 20 },
          numbers: { on: true, pos: 'bas-droite', format: 'sur', from: 2, first: 2 }, header: '', footer: '', chapters: 0 },
        cover: { model: '', surtitre: '', mention: '' },
        toc: { place: '', page: false },
        structure: [
          S('p', 'Prénom Nom\nAdresse\nCode postal Ville\nTéléphone · Courriel'),
          S('p', ''),
          S('p', 'Nom du destinataire\nAdresse\nCode postal Ville', { al: 'half' }),
          S('p', ''),
          S('p', 'Ville, le {date}', { al: 'right' }),
          S('p', ''),
          S('p', 'Objet : ', { b: true }),
          S('p', ''),
          S('p', 'Madame, Monsieur,'),
          S('p', ''),
          S('p', 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.'),
          S('p', ''),
          S('p', 'Prénom Nom', { al: 'half' })
        ]
      }
    ].map((m) => normalize(m));
  }
  let BUILTIN = null;
  const builtin = () => BUILTIN || (BUILTIN = builtins());

  const TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5'];
  // Modèle lu dans les réglages ou dans un fichier : chaque valeur est vérifiée, les manques complétés.
  function normalize(m) {
    if (!m || typeof m !== 'object') return null;
    const p = m.page && typeof m.page === 'object' ? m.page : {};
    const n = p.numbers && typeof p.numbers === 'object' ? p.numbers : {};
    const mg = p.margins && typeof p.margins === 'object' ? p.margins : {};
    const c = m.cover && typeof m.cover === 'object' ? m.cover : {};
    const toc = m.toc && typeof m.toc === 'object' ? m.toc : {};
    const sizes = P().sizes();
    const size = sizes.find((z) => z.id === p.size);
    const pick = (v, list, def) => (list.some(([k]) => k === v) ? v : def);
    return {
      v: 1,
      id: str(m.id, 40) || 'perso',
      name: str(m.name, 60).trim() || 'Modèle',
      note: str(m.note, 240),
      modified: !!m.modified,
      theme: m.theme && typeof m.theme === 'object' ? T().normalize(m.theme) : null,
      page: {
        size: size ? size.id : p.size === 'perso' ? 'perso' : 'A4',
        w: size ? size.w : num(p.w, 40, 1000, 210),
        h: size ? size.h : num(p.h, 40, 1000, 297),
        orient: p.orient === 'paysage' ? 'paysage' : 'portrait',
        margins: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((k) => [k, num(mg[k], 0, 120, 25)])),
        numbers: {
          on: n.on !== false,
          pos: pick(n.pos, P().positions(), 'bas-centre'),
          format: pick(n.format, P().formats(), '1'),
          from: Math.round(num(n.from, 1, 9999, 1)),
          first: Math.round(num(n.first, 0, 99999, 1))
        },
        header: str(p.header, 4000),
        footer: str(p.footer, 4000),
        chapters: [1, 2].includes(Number(p.chapters)) ? Number(p.chapters) : 0
      },
      cover: {
        model: window.FTCover.models().some((x) => x.id === c.model) ? c.model : '',
        surtitre: str(c.surtitre, 200),
        mention: str(c.mention, 200)
      },
      toc: { place: ['debut', 'fin'].includes(toc.place) ? toc.place : '', page: !!toc.page },
      structure: (Array.isArray(m.structure) ? m.structure : []).slice(0, 300).filter((x) => x && typeof x === 'object').map((x) => ({
        k: TAGS.includes(x.k) ? x.k : 'p',
        t: str(x.t, 4000),
        al: ['right', 'center', 'half'].includes(x.al) ? x.al : '',
        b: !!x.b,
        n: !!x.n
      }))
    };
  }
  const plain = (m) => {
    const out = clone(m);
    delete out.modified;
    return out;
  };

  // ----- Réglages du logiciel : Mes modèles -----

  let mine = [];
  let saveSettings = () => {};
  const persist = () => saveSettings(clone(mine.map(plain)));

  // ----- Appliquer un modèle -----

  const vars = () => ({ date: today(), titre: (window.FTApp && window.FTApp.docName()) || '' });
  const fill = (text, v) => String(text).replace(/\{(date|titre)\}/g, (_, k) => v[k]);

  function blockHtml(x, v) {
    const text = esc(fill(x.t, v)).replace(/\n/g, '<br>');
    const style = { right: 'text-align: right', center: 'text-align: center', half: 'margin-left: 50%' }[x.al];
    const inner = text ? (x.b ? `<strong>${text}</strong>` : text) : '<br>';
    return `<${x.k}${style ? ` style="${style}"` : ''}${x.n && x.k !== 'p' ? ' data-nonum="oui"' : ''}>${inner}</${x.k}>`;
  }

  // Document vide : rien d'autre que son titre, des lignes vides, une page de titre ou un plan.
  const isGap = (c) => c.classList.contains('ft-pg-gap');
  function isEmpty(ed) {
    return [...ed.children].every((c) => isGap(c) || c.matches('h1.ft-title, .ft-cover, .ft-toc') ||
      (c.matches('p, div') && !c.className && !c.textContent.trim() && !c.querySelector('img, .ft-image, .ft-math, table')));
  }
  const docEmpty = () => { const ed = $('editor'); return !!ed && isEmpty(ed); };

  let seq = 0;
  const keepId = () => 'm' + Date.now().toString(36) + (++seq);

  // Contenu du document : page de titre, sommaire, structure type (une étape d'annulation).
  function placeContent(m, withStructure) {
    const ed = $('editor');
    const v = vars();
    const empty = isEmpty(ed);
    const structure = withStructure && empty && m.structure.length;
    let first = null;
    // Document vide qui reçoit une page de titre ou une structure : son titre et ses lignes vides partent
    // (la page de titre reprend le nom du document).
    if (empty && (m.cover.model || structure)) {
      for (const c of [...ed.children]) if (!c.matches('.ft-cover, .ft-toc')) c.remove();
    }
    const tocAtEnd = ed.querySelector(':scope > .ft-toc') && m.toc.place === 'fin' && empty ? ed.querySelector(':scope > .ft-toc') : null;
    if (structure) {
      const box = document.createElement('template');
      box.innerHTML = m.structure.map((x) => blockHtml(x, v)).join('');
      first = box.content.firstElementChild;
      if (tocAtEnd) tocAtEnd.before(box.content);
      else ed.append(box.content);
    }
    if (m.toc.place && !ed.querySelector(':scope > .ft-toc')) {
      const toc = window.FTToc.create();
      if (m.toc.place === 'debut') {
        let after = null;
        for (const c of ed.children) {
          if (c.matches('.ft-cover, h1.ft-title') || isGap(c)) after = c;
          else break;
        }
        if (after) after.after(toc);
        else ed.prepend(toc);
        let next = toc.nextElementSibling;
        while (next && isGap(next)) next = next.nextElementSibling;
        if (!next || next.matches('.ft-footnotes, .ft-endnotes')) {
          next = document.createElement('p');
          next.append(document.createElement('br'));
          toc.after(next);
        }
        if (m.toc.page) next.setAttribute('data-pg-start', keepId());
      } else {
        const notes = ed.querySelector(':scope > :is(.ft-footnotes, .ft-endnotes)');
        if (notes) notes.before(toc);
        else ed.append(toc);
        if (m.toc.page) toc.setAttribute('data-pg-start', keepId());
      }
    }
    if (m.cover.model) window.FTCover.build(m.cover.model, { surtitre: m.cover.surtitre, mention: fill(m.cover.mention, v) });
    if (!ed.firstElementChild) ed.innerHTML = '<p><br></p>';
    // Curseur au début de la structure type. (Pas dans la page de titre : tant que l'on écrit dans un de ses
    // champs, le plan et les numéros de page ne sont pas refaits.)
    if (first && first.isConnected && window.FTGeneres) window.FTGeneres.caret(first, !!first.textContent.trim());
  }

  function apply(m, { structure = true } = {}) {
    if (!window.FTApp || !window.FTApp.currentId() || $('page').hidden) return false;
    m = normalize(m);
    const v = vars();
    if (m.theme) T().apply(m.theme);
    const p = clone(m.page);
    p.header = fill(p.header, { ...v, titre: esc(v.titre) });
    p.footer = fill(p.footer, { ...v, titre: esc(v.titre) });
    P().applyLayout(p);
    const G = window.FTGeneres;
    if (G) G.edit(() => placeContent(m, structure));
    else placeContent(m, structure);
    P().refresh();
    // Le document se montre depuis le début (page de titre, sommaire).
    $('workspace').scrollTop = 0;
    requestAnimationFrame(() => { $('workspace').scrollTop = 0; });
    return true;
  }

  // ----- Reprendre la mise en page du document ouvert -----

  function fromDocument(base) {
    const ed = $('editor');
    const out = clone(base);
    out.theme = T().get();
    if (out.theme) delete out.theme.modified;
    out.page = P().layout();
    const cover = ed.querySelector(':scope > .ft-cover');
    const field = (f) => { const x = cover && cover.querySelector(`.ft-cover-field[data-field="${f}"]`); return x ? x.textContent.trim() : ''; };
    out.cover = { model: cover ? cover.dataset.model : '', surtitre: field('surtitre'), mention: field('mention') };
    const toc = ed.querySelector(':scope > .ft-toc');
    if (toc) {
      const blocks = [...ed.children].filter((c) => !isGap(c));
      const i = blocks.indexOf(toc);
      const atEnd = i > blocks.length / 2;
      const next = blocks[i + 1];
      out.toc = { place: atEnd ? 'fin' : 'debut', page: atEnd ? toc.hasAttribute('data-pg-start') : !!(next && next.hasAttribute('data-pg-start')) };
    } else out.toc = { place: '', page: false };
    out.modified = true;
    return normalize(out);
  }

  // Structure type reprise du document : ses titres, ou tous ses blocs de texte (titres et paragraphes).
  function structureOf(all) {
    const ed = $('editor');
    const out = [];
    for (const c of ed.children) {
      if (out.length >= 300) break;
      if (!c.matches(all ? 'p, h1, h2, h3, h4, h5' : 'h1, h2, h3, h4, h5') || c.matches('.ft-title') || c.closest('.ft-cover, .ft-toc')) continue;
      const k = c.tagName.toLowerCase();
      const copy = c.cloneNode(true);
      copy.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
      const t = copy.textContent.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
      const ta = c.style.textAlign;
      const al = ta === 'right' ? 'right' : ta === 'center' ? 'center' : parseFloat(c.style.marginLeft) >= 40 && /%$/.test(c.style.marginLeft) ? 'half' : '';
      const b = !!t && [...c.querySelectorAll('strong, b')].reduce((n, x) => n + x.textContent.length, 0) >= t.replace(/\n/g, '').length;
      out.push({ k, t, al, b, n: c.hasAttribute('data-nonum') });
      if (!all) out.push({ k: 'p', t: '', al: '', b: false, n: false });
    }
    return out;
  }

  // ----- Fenêtre -----

  let current = null;   // modèle choisi, avec ses réglages (modified : changé depuis son choix)
  let tab = 'choisir';
  let creating = false; // fenêtre ouverte pour un nouveau document
  let withStructure = true;

  const allModels = () => [...builtin(), ...mine];

  // Aperçu : quelques feuilles à l'échelle (page de titre, sommaire, page de texte).
  function sheets(m, big) {
    const k = (big ? 92 : 46) / (m.page.orient === 'paysage' ? Math.max(m.page.w, m.page.h) : Math.min(m.page.w, m.page.h));
    const [w, h] = m.page.orient === 'paysage' ? [Math.max(m.page.w, m.page.h), Math.min(m.page.w, m.page.h)] : [Math.min(m.page.w, m.page.h), Math.max(m.page.w, m.page.h)];
    const accent = (m.theme && m.theme.accent) || 'var(--accent)';
    const align = (m.theme && m.theme.styles.headings[0].align) || 'left';
    const sheet = (kind, n) => {
      const s = el('div', { className: 'md-sheet md-' + kind });
      s.style.width = w * k + 'px';
      s.style.height = h * k + 'px';
      s.style.setProperty('--md-accent', accent);
      if (kind === 'cover') {
        const t = window.FTCover.thumb(m.cover.model, { titre: m.name, mention: m.cover.mention || '', surtitre: m.cover.surtitre || '' });
        t.style.setProperty('--md-k', String(w * k / 120));
        t.style.height = 120 * h / w + 'px';
        t.firstChild.style.height = 600 * h / w + 'px';
        if (m.theme && m.theme.accent) t.style.setProperty('--doc-accent', m.theme.accent);
        s.append(t);
        return s;
      }
      const mg = m.page.margins;
      const body = el('div', { className: 'md-body' });
      Object.assign(body.style, { top: mg.top * k + 'px', bottom: mg.bottom * k + 'px', left: mg.left * k + 'px', right: mg.right * k + 'px' });
      const line = (cls, width) => { const x = el('i', { className: cls }); if (width) x.style.width = width; return x; };
      if (kind === 'toc') {
        body.append(line('md-h', '45%'));
        for (let i = 0; i < 7; i++) body.append(line('md-toc' + (i % 3 ? ' md-sub' : '')));
      } else if (kind === 'letter') {
        body.append(line('md-l', '35%'), line('md-l', '30%'), line('md-l', '32%'), el('b', { className: 'md-sp' }),
          line('md-l md-half', '30%'), line('md-l md-half', '26%'), el('b', { className: 'md-sp' }), line('md-l md-right', '30%'),
          el('b', { className: 'md-sp' }), line('md-l md-strong', '40%'));
        for (let i = 0; i < 6; i++) body.append(line('md-l', i === 5 ? '60%' : ''));
      } else {
        const hd = line('md-h', '55%');
        if (align === 'center') hd.style.margin = '0 auto 4%';
        body.append(hd);
        for (let i = 0; i < 9; i++) body.append(line('md-l', i === 4 ? '70%' : ''));
      }
      s.append(body);
      const hf = (html, top) => {
        if (!html) return;
        const t = document.createElement('div');
        t.innerHTML = html;
        if (!t.textContent.trim()) return;
        const p = t.querySelector('[style*="text-align"]');
        const a = p ? p.style.textAlign : 'left';
        const x = line('md-hf', '30%');
        x.style[top ? 'top' : 'bottom'] = Math.max(2, mg[top ? 'top' : 'bottom'] * k * 0.4) + 'px';
        x.style.left = a === 'center' ? '35%' : a === 'right' ? 'auto' : mg.left * k + 'px';
        if (a === 'right') x.style.right = mg.right * k + 'px';
        s.append(x);
      };
      hf(m.page.header, true);
      hf(m.page.footer, false);
      const nb = m.page.numbers;
      if (nb.on && n >= nb.from) {
        const [vpos, hpos] = nb.pos.split('-');
        const x = el('span', { className: 'md-num', textContent: String(nb.first + n - nb.from) });
        x.style[vpos === 'haut' ? 'top' : 'bottom'] = Math.max(2, mg[vpos === 'haut' ? 'top' : 'bottom'] * k * 0.4) + 'px';
        if (hpos === 'gauche') x.style.left = mg.left * k + 'px';
        else if (hpos === 'droite') x.style.right = mg.right * k + 'px';
        else { x.style.left = '0'; x.style.right = '0'; x.style.textAlign = 'center'; }
        s.append(x);
      }
      return s;
    };
    const list = [];
    if (m.cover.model) list.push('cover');
    if (m.toc.place === 'debut') list.push('toc');
    if (!m.cover.model && !m.toc.place && m.structure.some((x) => x.k === 'p' && x.al)) list.push('letter');
    else list.push('text', 'text');
    if (m.toc.place === 'fin') list.push('toc');
    return el('div', { className: 'md-sheets' + (big ? ' big' : '') }, list.slice(0, big ? 4 : 3).map((kind, i) => sheet(kind, i + 1)));
  }

  // Résumé d'un modèle, une ligne par réglage.
  function summary(m) {
    const size = P().sizes().find((z) => z.id === m.page.size);
    const mg = m.page.margins;
    const nb = m.page.numbers;
    const pos = (P().positions().find(([k]) => k === nb.pos) || [, ''])[1].toLowerCase();
    const fmt = (P().formats().find(([k]) => k === nb.format) || [, '1'])[1];
    const coverName = (window.FTCover.models().find((x) => x.id === m.cover.model) || {}).name;
    const heads = m.structure.filter((x) => x.k !== 'p').length;
    const paras = m.structure.filter((x) => x.k === 'p' && x.t.trim()).length;
    const rows = [
      ['Thème du document', m.theme ? m.theme.name + ' · ' + m.theme.text.font : 'Celui du document'],
      ['Pages', `${size ? size.id : mmText(m.page.w) + ' × ' + mmText(m.page.h) + ' mm'}, ${m.page.orient}, marges ${['top', 'bottom', 'left', 'right'].map((s) => mmText(mg[s])).join(' / ')} mm`],
      ['Numéros', nb.on ? `${pos}, forme « ${fmt} », dès la page ${nb.from}` : 'Aucun'],
      ['En-tête, pied de page', [m.page.header && 'en-tête', m.page.footer && 'pied de page'].filter(Boolean).join(', ') || 'Aucun'],
      ['Nouvelle page avant', ['Aucun titre', 'Chaque titre 1', 'Chaque titre 1 et 2'][m.page.chapters]],
      ['Page de titre', coverName ? coverName + (m.cover.mention ? ` (« ${m.cover.mention} »)` : '') : 'Aucune'],
      ['Sommaire', m.toc.place ? (m.toc.place === 'debut' ? 'Au début' : 'À la fin') + (m.toc.page ? ', sur une page à part' : '') : 'Aucun'],
      ['Structure type', m.structure.length ? [heads && `${heads} titre${heads > 1 ? 's' : ''}`, paras && `${paras} paragraphe${paras > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'Lignes vides' : 'Aucune']
    ];
    return el('dl', { className: 'md-summary' }, rows.flatMap(([a, b]) => [el('dt', { textContent: a }), el('dd', { textContent: b })]));
  }

  function card(m, { own } = {}) {
    const on = current && current.id === m.id;
    const b = el('button', { type: 'button', className: 'theme-card md-card' + (on ? ' on' : '') }, [
      sheets(m),
      el('span', { className: 'theme-name', textContent: m.name }),
      el('span', { className: 'theme-note', textContent: m.note || (own ? 'Mon modèle' : '') })
    ]);
    b.dataset.model = m.id;
    b.addEventListener('click', () => choose(m));
    b.addEventListener('dblclick', () => { choose(m); confirm(); });
    if (own) {
      const menu = (x, y) => window.FTSidebar.showMenu(x, y, [
        { text: creating ? 'Créer un document' : 'Appliquer au document', action: () => { choose(m); confirm(); } },
        { text: 'Renommer…', action: () => renameMine(m) },
        { text: 'Exporter en fichier…', action: () => exportModel(m) },
        '-',
        { text: 'Supprimer de Mes modèles', danger: true, action: () => removeMine(m) }
      ]);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
      const more = el('span', { className: 'th-more', textContent: '⋯', title: 'Renommer, exporter, supprimer' });
      more.addEventListener('click', (e) => { e.stopPropagation(); const r = more.getBoundingClientRect(); menu(r.left, r.bottom + 2); });
      b.append(more);
    }
    return b;
  }

  function choose(m) {
    current = normalize(clone(m));
    current.modified = false;
    render();
  }

  function structureCheck() {
    const empty = creating || docEmpty();
    const box = el('input', { type: 'checkbox', checked: empty && withStructure, disabled: !empty || !current.structure.length });
    box.addEventListener('change', () => { withStructure = box.checked; });
    return el('label', { className: 'pop-check md-structure', title: empty ? '' : 'Document non vide : la structure type n’est ajoutée qu’à un document vide' },
      [box, ' Ajouter la structure type' + (empty ? '' : ' (document vide uniquement)')]);
  }

  function renderChoose() {
    const out = [
      el('div', { className: 'toc-dlg-label', textContent: 'Modèles prêts' }),
      el('div', { className: 'theme-grid md-grid' }, builtin().map((m) => card(m))),
      el('div', { className: 'toc-dlg-label', textContent: 'Mes modèles' }),
      mine.length
        ? el('div', { className: 'theme-grid md-grid' }, mine.map((m) => card(m, { own: true })))
        : el('p', { className: 'custom-help', textContent: 'Aucun modèle enregistré. Réglez un modèle, puis « Enregistrer dans Mes modèles… », ou importez un fichier de modèle.' })
    ];
    out.push(el('div', { className: 'md-chosen' }, [
      el('div', { className: 'toc-dlg-label' }, ['Modèle choisi : ', el('b', { textContent: current.name + (current.modified ? ' (modifié)' : '') })]),
      summary(current),
      structureCheck()
    ]));
    return out;
  }

  function button(text, title, fn) {
    const b = el('button', { type: 'button', textContent: text, title });
    b.addEventListener('click', fn);
    return b;
  }
  function select(options, value, fn, title) {
    const s = el('select', { title: title || '' });
    for (const [v, label] of options) s.append(new Option(label, String(v)));
    s.value = String(value);
    s.addEventListener('change', () => fn(s.value));
    return s;
  }
  function input(value, fn, o = {}) {
    const i = el('input', { type: 'text', value: String(value), ...o });
    i.addEventListener('change', () => fn(i.value));
    return i;
  }
  const numInput = (value, min, max, fn, step = 1) => {
    const i = input(String(value).replace('.', ','), (v) => fn(v), { inputMode: 'decimal' });
    Object.assign(i, { min: String(min), max: String(max), step: String(step) });
    i.setAttribute('inputmode', 'decimal');
    i.setAttribute('min', String(min));
    i.setAttribute('max', String(max));
    i.setAttribute('step', String(step));
    return i;
  };
  const row = (label, ...controls) => el('label', { className: 'custom-field th-field md-field' }, [el('span', { textContent: label }), ...controls]);
  const group = (label) => el('div', { className: 'toc-dlg-label', textContent: label });

  // Un réglage du modèle change : le modèle choisi devient « modifié ».
  function update(fn) {
    fn(current);
    current.modified = true;
    current = normalize(current);
    current.modified = true;
    render();
  }

  // En-tête ou pied de page d'un modèle : un texte et son alignement (le HTML posé dans le document).
  function hfParts(html) {
    const t = document.createElement('div');
    t.innerHTML = html || '';
    const p = t.querySelector('[style*="text-align"]');
    const a = p ? p.style.textAlign : '';
    return { text: t.textContent, align: ['center', 'right'].includes(a) ? a : 'left', italic: !!t.querySelector('em, i') };
  }
  const hfHtml = (text, align, italic) => (text.trim() ? H(align, italic ? `<em>${esc(text.trim())}</em>` : esc(text.trim())) : '');

  function hfRow(label, kind) {
    const parts = hfParts(current.page[kind]);
    const text = input(parts.text, (v) => update((c) => { c.page[kind] = hfHtml(v, parts.align, parts.italic); }), { placeholder: 'Aucun', maxLength: 200 });
    const align = select([['left', 'À gauche'], ['center', 'Centré'], ['right', 'À droite']], parts.align,
      (v) => update((c) => { c.page[kind] = hfHtml(parts.text, v, parts.italic); }), 'Alignement');
    return row(label, text, align);
  }

  function themeSelect() {
    const builtinThemes = T().builtins();
    const myThemes = T().mine();
    const s = el('select', { title: 'Thème du document appliqué par le modèle' });
    s.append(new Option('Conserver celui du document', ''));
    const g1 = el('optgroup', { label: 'Thèmes prêts' });
    builtinThemes.forEach((t) => g1.append(new Option(t.name, 'b:' + t.id)));
    s.append(g1);
    if (myThemes.length) {
      const g2 = el('optgroup', { label: 'Mes thèmes' });
      myThemes.forEach((t) => g2.append(new Option(t.name, 'm:' + t.id)));
      s.append(g2);
    }
    s.append(new Option('Thème actuel du document', 'doc'));
    const t = current.theme;
    let value = '';
    if (t) {
      const b = builtinThemes.find((x) => x.id === t.id);
      const mm = myThemes.find((x) => x.id === t.id);
      value = mm ? 'm:' + t.id : b ? 'b:' + t.id : 'own';
      if (value === 'own') s.insertBefore(new Option(t.name + ' (thème du modèle)', 'own'), s.options[1]);
    }
    s.value = value;
    s.addEventListener('change', () => update((c) => {
      const v = s.value;
      if (!v) c.theme = null;
      else if (v === 'doc') c.theme = T().get();
      else if (v.startsWith('b:')) c.theme = builtinThemes.find((x) => 'b:' + x.id === v) || c.theme;
      else if (v.startsWith('m:')) c.theme = myThemes.find((x) => 'm:' + x.id === v) || c.theme;
    }));
    return s;
  }

  function renderSettings() {
    const m = current;
    const pg = m.page;
    const nb = pg.numbers;
    const size = select([...P().sizes().map((z) => [z.id, z.label]), ...(pg.size === 'perso' ? [['perso', `Personnalisée (${mmText(pg.w)} × ${mmText(pg.h)} mm)`]] : [])], pg.size, (v) => update((c) => {
      const z = P().sizes().find((x) => x.id === v);
      if (z) { c.page.size = z.id; c.page.w = z.w; c.page.h = z.h; }
    }), 'Taille des pages');
    const margins = el('div', { className: 'md-margins' }, ['top', 'bottom', 'left', 'right'].map((side) => el('label', {}, [
      { top: 'Haut', bottom: 'Bas', left: 'Gauche', right: 'Droite' }[side] + ' ',
      numInput(pg.margins[side], 0, 120, (v) => update((c) => { c.page.margins[side] = num(v, 0, 120, c.page.margins[side]); })),
      ' mm'
    ])));
    const numOn = el('input', { type: 'checkbox', checked: nb.on });
    numOn.addEventListener('change', () => update((c) => { c.page.numbers.on = numOn.checked; }));
    const coverSel = select([['', 'Aucune'], ...window.FTCover.models().map((x) => [x.id, x.name])], m.cover.model, (v) => update((c) => { c.cover.model = v; }), 'Page de titre');
    const tocSel = select([['', 'Aucun'], ['debut', 'Au début'], ['fin', 'À la fin']], m.toc.place, (v) => update((c) => { c.toc.place = v; }), 'Sommaire');
    const tocPage = el('label', { className: 'pop-check' }, [el('input', { type: 'checkbox', checked: m.toc.page, disabled: !m.toc.place }), ' Sur une page à part']);
    tocPage.firstChild.addEventListener('change', (e) => update((c) => { c.toc.page = e.target.checked; }));
    const heads = m.structure.filter((x) => x.k !== 'p');
    const outline = el('ul', { className: 'md-outline' }, (heads.length ? heads : m.structure.filter((x) => x.t.trim())).slice(0, 14).map((x) =>
      el('li', { className: 'md-o-' + x.k, textContent: x.t.split('\n')[0] + (x.n ? ' (sans numéro)' : '') })));
    const left = el('div', { className: 'th-form' }, [
      group('Modèle'),
      row('Nom', input(m.name, (v) => update((c) => { c.name = v.trim() || c.name; }), { maxLength: 60 })),
      row('Thème du document', themeSelect()),
      group('Pages'),
      row('Taille', size),
      row('Orientation', select([['portrait', 'Portrait'], ['paysage', 'Paysage']], pg.orient, (v) => update((c) => { c.page.orient = v; }))),
      row('Marges', margins),
      row('Nouvelle page avant', select([[0, 'Aucun titre'], [1, 'Chaque titre 1'], [2, 'Chaque titre 1 et 2']], pg.chapters, (v) => update((c) => { c.page.chapters = Number(v); }))),
      group('Numéros de page'),
      el('label', { className: 'pop-check md-check' }, [numOn, ' Numéroter les pages']),
      row('Emplacement', select(P().positions(), nb.pos, (v) => update((c) => { c.page.numbers.pos = v; }))),
      row('Forme', select(P().formats(), nb.format, (v) => update((c) => { c.page.numbers.format = v; }))),
      row('Commencer à la page', numInput(nb.from, 1, 9999, (v) => update((c) => { c.page.numbers.from = Math.round(num(v, 1, 9999, 1)); }))),
      row('Avec le numéro', numInput(nb.first, 0, 99999, (v) => update((c) => { c.page.numbers.first = Math.round(num(v, 0, 99999, 1)); }))),
      group('En-tête et pied de page'),
      hfRow('En-tête', 'header'),
      hfRow('Pied de page', 'footer'),
      el('p', { className: 'custom-help', textContent: '{titre} : nom du document. {date} : date du jour.' }),
      group('Page de titre et sommaire'),
      row('Page de titre', coverSel),
      row('Mention', input(m.cover.mention, (v) => update((c) => { c.cover.mention = v; }), { placeholder: 'Type de document, version', maxLength: 200 })),
      row('Organisme', input(m.cover.surtitre, (v) => update((c) => { c.cover.surtitre = v; }), { placeholder: 'Organisme ou établissement', maxLength: 200 })),
      row('Sommaire', tocSel, tocPage),
      group('Structure type'),
      el('p', { className: 'custom-help', textContent: 'Titres et lignes posés dans un document vide.' }),
      outline,
      el('div', { className: 'th-kinds' }, [
        button('Titres de ce document', 'Reprendre les titres du document ouvert', () => update((c) => { c.structure = structureOf(false); })),
        button('Texte de ce document', 'Reprendre les titres et les paragraphes du document ouvert', () => update((c) => { c.structure = structureOf(true); })),
        button('Aucune structure', '', () => update((c) => { c.structure = []; }))
      ])
    ]);
    const right = el('div', { className: 'th-side' }, [
      group('Aperçu'),
      sheets(m, true),
      summary(m)
    ]);
    return [el('div', { className: 'th-settings' }, [left, right])];
  }

  function render() {
    if (!dialog.open || !current) return;
    dialog.querySelectorAll('.styles-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const head = el('div', { className: 'th-current' }, [
      el('span', {}, ['Modèle : ', el('b', { textContent: current.name }), current.modified ? ' (modifié)' : '']),
      el('span', { className: 'spacer' }),
      button('Enregistrer dans Mes modèles…', 'Garder ce modèle, avec ses réglages, pour d’autres documents', saveMine),
      button('Exporter…', 'Enregistrer ce modèle dans un fichier .ttmodele, pour le partager', () => exportModel(current)),
      ...(creating ? [] : [button('Reprendre la mise en page de ce document', 'Thème, pages, numéros, page de titre et sommaire du document ouvert', () => {
        const name = current.name;
        current = fromDocument(current);
        current.name = name;
        tab = 'regler';
        render();
      })])
    ]);
    const scroll = panel.scrollTop;
    panel.replaceChildren(head, ...(tab === 'choisir' ? renderChoose() : renderSettings()));
    panel.scrollTop = scroll;
    applyBtn.textContent = creating ? 'Créer le document' : 'Appliquer au document';
  }

  // ----- Mes modèles, fichiers -----

  const ask = (...a) => window.FTApp.ask(...a);

  async function saveMine() {
    const known = mine.find((x) => x.id === current.id);
    const name = await ask('Nom du modèle :', known && !current.modified ? current.name : current.name + (current.modified && !known ? ' (perso)' : ''), { okLabel: 'Enregistrer', maxLength: 60 });
    if (!name) return;
    const existing = mine.find((x) => x.name === name);
    const m = { ...plain(current), id: existing ? existing.id : 'u' + Math.random().toString(36).slice(2, 9), name, note: current.modified ? '' : current.note };
    if (existing) mine[mine.indexOf(existing)] = m; else mine.push(m);
    current = { ...clone(m), modified: false };
    persist();
    render();
  }

  async function renameMine(m) {
    const name = await ask('Nouveau nom du modèle :', m.name, { okLabel: 'Renommer', maxLength: 60 });
    if (!name) return;
    m.name = name;
    if (current && current.id === m.id) current.name = name;
    persist();
    render();
  }

  async function removeMine(m) {
    const ok = await ask(`Supprimer le modèle « ${m.name} » de Mes modèles ?`, '', { okLabel: 'Supprimer', input: false });
    if (!ok) return;
    mine = mine.filter((x) => x !== m);
    if (current && current.id === m.id) current = normalize(builtin()[0]);
    persist();
    render();
  }

  async function exportModel(m) {
    const path = await api.exportModel(m.name, plain(m));
    if (path) await ask(`Modèle exporté dans le fichier :\n${path}`, '', { okLabel: 'OK', input: false });
  }

  async function importModel() {
    const data = await api.importModel();
    if (!data) return;
    if (data.error) return ask(data.error, '', { okLabel: 'OK', input: false });
    const m = normalize(data);
    delete m.modified;
    if (allModels().some((x) => x.id === m.id)) m.id = 'u' + Math.random().toString(36).slice(2, 9);
    while (mine.some((x) => x.name === m.name)) m.name += ' (importé)';
    mine.push(m);
    persist();
    current = { ...clone(m), modified: false };
    tab = 'choisir';
    render();
  }

  // ----- Ouvrir, appliquer -----

  async function confirm() {
    if (!current) return;
    const m = clone(current);
    const structure = withStructure;
    dialog.close();
    if (creating) {
      const made = await window.FTApp.newDocument();
      if (!made) return;
      apply(m, { structure: true });
      return;
    }
    apply(m, { structure: structure && docEmpty() });
  }

  function open(o = {}) {
    const docOpen = !!(window.FTApp && window.FTApp.currentId()) && !$('page').hidden;
    creating = !!o.create || !docOpen;
    if (!current) current = normalize(clone(builtin()[0]));
    withStructure = true;
    tab = 'choisir';
    if (!dialog.open) dialog.showModal();
    render();
    const on = panel.querySelector('.md-card.on');
    if (on) on.focus({ preventScroll: true });
  }

  dialog.querySelectorAll('.styles-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  $('model-close').addEventListener('click', () => dialog.close());
  $('model-import').addEventListener('click', importModel);
  applyBtn.addEventListener('click', confirm);
  $('layout-tab').addEventListener('click', () => open());

  window.FTModeles = {
    // saved : Mes modèles (réglages du logiciel, settings.layoutModels).
    init(saved, save) {
      saveSettings = save;
      mine = (Array.isArray(saved) ? saved : []).map(normalize).filter(Boolean).map((m) => { delete m.modified; return m; });
    },
    open,
    // Applique un modèle au document ouvert (par son identifiant ou en entier).
    apply: (m, o) => apply(typeof m === 'string' ? allModels().find((x) => x.id === m) : m, o),
    builtins: () => builtin().map(clone),
    mine: () => mine.map(clone),
    normalize
  };
})();
