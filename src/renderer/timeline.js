// Carte du temps : une frise chronologique faite des dates trouvées dans les textes du projet.
// Chaque date (« 14 juillet 1789 », « en 1914 », « 25/10/2026 », « XIXe siècle »…) devient un
// événement, avec la phrase qui la contient. Un jour et un mois sans année (« le 3 mai ») prennent
// la dernière année citée plus haut dans le même document, et sont marqués « ~ ».
// Un clic sur un événement ouvre le document et sélectionne la date dans le texte.
(function () {
  const $ = (id) => document.getElementById(id);
  const main = $('main');
  const box = $('timeline');
  const scroller = $('tl-scroll');
  const stage = $('tl-stage');
  const listBox = $('tl-list');
  const tabDocument = $('tab-document');
  const tabMindmap = $('tab-mindmap');
  const tabTimeline = $('tab-timeline');
  const App = () => window.FTApp;

  const AXIS_GAP = 34;
  const PALETTES = {
    vive: ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d68910', '#16a085', '#cb4f8e', '#7f8c8d'],
    douce: ['#d98880', '#7fb3d5', '#82c99a', '#b39ddb', '#e5b06a', '#76c7b7', '#e89ac0', '#a6acaf'],
    sobre: ['#34495e', '#5d6d7e', '#7b6d5d', '#4a6b5d', '#6c5b7b', '#5b6f82', '#856d4d', '#707b7c'],
    contraste: ['#d50000', '#0050d0', '#008a00', '#9c00b0', '#e07000', '#00838f', '#c2185b', '#212121']
  };
  // Réglages de la frise (Réglages, en haut à droite), gardés avec ceux du logiciel.
  const DEFAULTS = { size: 'normal', text: true, from: true, place: 'alterne', colors: 'document', palette: 'vive', docColors: {},
    stem: 'tirets', dot: 'rond', font: 100, grid: false, cut: true, approx: true, excluded: false };
  let opts = { ...DEFAULTS };
  let onSave = () => {};
  const SIZES = { compact: { w: 165, lines: 1 }, normal: { w: 210, lines: 2 }, large: { w: 280, lines: 4 } };
  let CARD_W = 210;
  let CARD_H = 74;
  let LANE = CARD_H + 14;
  function sizeCards() {
    const z = SIZES[opts.size] || SIZES.normal;
    const f = opts.font / 100;
    CARD_W = Math.round(z.w * f);
    CARD_H = Math.round((12 + 17 * f + (opts.text ? z.lines * 15 * f + 2 : 0) + (opts.from ? 15 * f : 0)));
    LANE = CARD_H + 14;
  }

  let visible = false;
  let events = [];
  let docs = [];
  let hiddenDocs = new Set();
  let scope = 'projet';
  let viewMode = 'frise';
  let query = '';
  let pxPerYear = 0; // 0 : à calculer pour tout voir
  let building = 0;

  // ----- Lecture des dates -----

  // Noms des mois (français, anglais, allemand, espagnol, italien, portugais) et abréviations, sans accents.
  const MONTHS = {};
  [
    'janvier janv jan january januar enero gennaio janeiro',
    'fevrier fevr fev february feb februar febrero febbraio fevereiro',
    'mars march mar marz marzo marco',
    'avril avr april apr abril aprile',
    'mai may maggio mayo maio',
    'juin june jun juni junio giugno junho',
    'juillet juil july jul juli julio luglio julho',
    'aout august aug agosto',
    'septembre sept sep september settembre septiembre setiembre setembro',
    'octobre oct october oktober octubre ottobre outubro',
    'novembre nov november noviembre novembro',
    'decembre dec december dezember diciembre dicembre dezembro'
  ].forEach((names, i) => names.split(' ').forEach((n) => { MONTHS[n] = i + 1; }));
  const MONTH_NAMES = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const BC_RE = '(\\s*(?:av(?:ant|\\.)\\s*(?:J\\.?\\s?-?\\s?C\\.?|J[ée]sus[- ]Christ|notre\\s+[èe]re|n\\.\\s?[èe]\\.)|AEC|BCE?|a\\.\\s?C\\.))?';
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const monthOf = (w) => MONTHS[plain(w).replace(/\.$/, '')] || 0;
  // Après une année, ces mots (ou un autre nombre : « 1 500 », « 1932,5 ») montrent que c'est une quantité.
  const UNITS = '(?!\\s?\\d|[.,]\\d|\\s*(?:€|\\$|%|‰|euros?|francs?|dollars?|livres|mots|pages?|km|kilomètres|mètres|m\\b|m²|cm|kg|g\\b|ha\\b|tonnes|habitants|personnes|hommes|femmes|soldats|morts|victimes|blessés|élèves|étudiants|salariés|emplois|membres|voix|entreprises|logements|exemplaires|fois|ans\\b|jours|heures|minutes|lignes|caractères|signes|points|pts|millions?|milliards?|milliers|mille|°))';
  const NB = '(?<![\\p{L}\\d])';
  const SEASONS = { printemps: ['printemps', 0.3], spring: ['printemps', 0.3], ete: ['été', 0.55], summer: ['été', 0.55], automne: ['automne', 0.8], autumn: ['automne', 0.8], fall: ['automne', 0.8], hiver: ['hiver', 0.02], winter: ['hiver', 0.02],
    debut: ['début', 0.1], early: ['début', 0.1], mi: ['mi-', 0.5], mid: ['mi-', 0.5], milieu: ['mi-', 0.5], courant: ['mi-', 0.5], fin: ['fin', 0.9], late: ['fin', 0.9] };
  const PART = { debut: ['début', 15], fin: ['fin', 85], milieu: ['milieu', 50], mi: ['milieu', 50] };
  const ORD = { premier: 1, '1er': 1, deuxieme: 2, second: 2, '2e': 2, '2eme': 2, troisieme: 3, '3e': 3, '3eme': 3, quatrieme: 4, '4e': 4, '4eme': 4 };
  const bcYear = (y, bc) => (bc ? -y : +y);
  const RULES = [
    // 2026-10-25, 2026/10/25
    { re: /(?<![\d.])(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?!\d)/g, read: (m) => ({ y: +m[1], mo: +m[3], d: +m[4] }) },
    // 25/10/2026, 25-10-2026, 25.10.2026, 25/10/26, 25.10.26 ; 10/25/2026 (mois en premier) remis dans l'ordre.
    { re: /(?<![\d.,/-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d]|[.,/-]\d)/g,
      read: (m) => {
        if (m[4].length === 2 && (m[2] === '-' || (m[2] === '.' && (m[1].length < 2 || m[3].length < 2)))) return null; // « 2.1.14 » : un numéro de version
        let d = +m[1], mo = +m[3];
        if (mo > 12 && d <= 12) [d, mo] = [mo, d];
        return { y: m[4].length === 2 ? twoDigits(+m[4]) : +m[4], mo, d };
      } },
    // 09/1932
    { re: /(?<![\d.,/-])(0[1-9]|1[0-2])\/(1\d{3}|20\d{2})(?![\d/])/g, read: (m) => ({ y: +m[2], mo: +m[1] }) },
    // 14 juillet 1789, 1er mai, mars 1871, 18 sept. 1932, 18 de septiembre de 1932, 18. September 1932, 3 mai 480 av. J.-C.
    { re: new RegExp(`${NB}(?:([012]?\\d|3[01])(?:er|ᵉʳ|st|nd|rd|th)?\\.?\\s+(?:(?:de|of)\\s+)?)?(\\p{L}{3,10}\\.?)(?:,?\\s+(?:de\\s+|del\\s+|of\\s+)?(\\d{1,4})${BC_RE}${UNITS})?(?![\\p{L}\\d])`, 'giu'),
      read: (m) => {
        const mo = monthOf(m[2]);
        if (!mo || (!m[1] && !m[3])) return null; // « en mai » tout seul : trop vague
        if (plain(m[2]) === 'mars' && !m[1] && m[0][0] === 'M') return null; // Mars, la planète ou le dieu
        // Une année de moins de trois chiffres n'est gardée qu'avant J.-C. (« 44 av. J.-C. »).
        const y = m[3] && (m[4] || m[3].length >= 3) ? bcYear(m[3], m[4]) : null;
        if (y == null && !m[1]) return null;
        return { y, mo, d: m[1] ? parseInt(m[1], 10) : null };
      } },
    // September 18, 1932
    { re: new RegExp(`${NB}(\\p{L}{3,9}\\.?)\\s+([012]?\\d|3[01])(?:st|nd|rd|th)?,?\\s+(\\d{3,4})(?!\\d)${BC_RE}`, 'giu'),
      read: (m) => { const mo = monthOf(m[1]); return mo ? { y: bcYear(m[3], m[4]), mo, d: +m[2] } : null; } },
    // XIXe siècle, 19e siècle, début du XXe siècle, IIIe s. av. J.-C., 19th century
    { re: new RegExp(`${NB}(?:([Dd]ébut|[Ff]in|[Mm]ilieu|[Mm]i)(?:\\s+du|\\s*-)?\\s*)?([IVXL]+|\\d{1,2})\\s?(?:e|è|ème|eme|er|ère|ᵉ|ᵉʳ|°|st|nd|rd|th)\\.?\\s+(?:siècle|s\\.|century)${BC_RE}`, 'gu'),
      read: (m) => century(m[2], m[3], m[1]) },
    // siglo XIX, XIX secolo, 19. Jahrhundert
    { re: new RegExp(`${NB}(?:(?:siglo|século)\\s+([IVXL]+)|([IVXL]+)\\s+secolo|(\\d{1,2})\\.\\s*Jahrhundert)${BC_RE}`, 'gu'),
      read: (m) => century(m[1] || m[2] || m[3], m[4]) },
    // les années 1930, années 30, début des années 1960, the 1930s, 1930er Jahre
    { re: new RegExp(`${NB}(?:(début|fin|milieu)\\s+des\\s+)?(?:(?:les|des|aux)\\s+)?années\\s+(1\\d|20)?(\\d)0(?![\\d\\p{L}])`, 'giu'),
      read: (m) => ({ decade: (m[2] ? +m[2] * 100 : 1900) + +m[3] * 10, part: m[1] && plain(m[1]) }) },
    { re: /(?<![\p{L}\d])(1\d|20)(\d)0(?:['’]?s|er)(?![\p{L}\d])/gu, read: (m) => ({ decade: +m[1] * 100 + +m[2] * 10 }) },
    // printemps 1932, été 1932, début 1932, mi-1932, fin de l'année 1932, spring 1932
    { re: new RegExp(`${NB}(printemps|été|automne|hiver|spring|summer|autumn|fall|winter|début|early|mi|mid|milieu|courant|fin|late)(?:\\s*-\\s*|\\s+(?:de\\s+l['’]année\\s+|de\\s+|of\\s+)?|\\s+d['’]année\\s+)(1\\d{3}|20\\d{2})(?!\\d)${UNITS}`, 'giu'),
      read: (m) => { const s = SEASONS[plain(m[1])]; return s ? { y: +m[2], frac: s[1], name: s[0] } : null; } },
    // T1 2026, 1er trimestre 2026, second semestre 2026, Q3 2026
    { re: new RegExp(`${NB}(?:(premier|1er|deuxième|second|2e|2ème|troisième|3e|3ème|quatrième|4e|4ème)\\s+(trimestre|semestre)|([TQS])([1-4]))\\s*(?:de\\s+l['’]année\\s+|de\\s+|d['’])?(1\\d{3}|20\\d{2})(?!\\d)`, 'giu'),
      read: (m) => quarter(m[3] ? (m[3].toUpperCase() === 'S' ? 'S' : 'T') : (plain(m[2]) === 'semestre' ? 'S' : 'T'), m[3] ? +m[4] : ORD[plain(m[1])], +m[5], m[3] && m[3] !== m[3].toUpperCase()) },
    // 2026T1, 2026 T1, 2026-Q1
    { re: /(?<![\p{L}\d])(1\d{3}|20\d{2})\s*-?\s*([TQS])([1-4])(?![\p{L}\d])/gu, read: (m) => quarter(m[2] === 'S' ? 'S' : 'T', +m[3], +m[1]) },
    // 1914-1918, 1914 – 1918, 1914/1918
    { re: new RegExp(`${NB}(1\\d{3}|20\\d{2})\\s*[-–—/]\\s*(1\\d{3}|20\\d{2})(?!\\d)${UNITS}`, 'gu'), range: true,
      read: (m) => (+m[2] > +m[1] ? [{ y: +m[1], at: m.index, text: m[1] }, { y: +m[2], at: m.index + m[0].lastIndexOf(m[2]), text: m[2] }] : null) },
    // 1914-18, 1939–45
    { re: new RegExp(`(?<![\\p{L}\\d.,/-])(1\\d{3}|20\\d{2})\\s*[-–—]\\s*(\\d{2})(?![\\d/.-])${UNITS}`, 'gu'), range: true,
      read: (m) => {
        const a = +m[1], b = Math.floor(a / 100) * 100 + +m[2];
        return b > a ? [{ y: a, at: m.index, text: m[1] }, { y: b, at: m.index + m[0].lastIndexOf(m[2]), text: m[2] }] : null;
      } },
    // en 1789, l'an 800, depuis 1950, vers 1500 av. J.-C., entre 1914 et 1918, circa 1500, since 1950
    { re: new RegExp(`${NB}(en|l['’]an|an|année|l['’]année|depuis|dès|vers|jusqu['’]en|jusqu['’]à|avant|après|de|à|et|au|entre|durant|pendant|courant|circa|ca\\.|c\\.|env\\.|environ|in|since|from|until|till|by|to|and|around|seit|bis|von|im|desde|hasta|nel|dal|em|ano)\\s+(\\d{1,4})${BC_RE}(?!\\d)${UNITS}`, 'giu'), year: 2,
      read: (m) => {
        if (m[3]) return { y: -m[2] };
        if (m[2].length === 4) return { y: +m[2] };
        // « de 120 à 150 » : un nombre à trois chiffres n'est une année qu'après « en », « vers », « l'an »…
        return m[2].length === 3 && /^(en|l.an|an|année|l.année|depuis|dès|vers|circa|ca\.|c\.|env\.|environ|in|since|around)$/i.test(m[1]) ? { y: +m[2] } : null;
      } },
    // (1932), (1932, Paris)
    { re: /\((1\d{3}|20\d{2})(?=[),;])/g, year: 1, read: (m) => ({ y: +m[1] }) },
    // « 1789 : prise de la Bastille » en début de paragraphe
    { re: new RegExp(`^\\s*(\\d{3,4})${BC_RE}\\s*[:–—-]`, 'gu'), year: 1, read: (m) => ({ y: bcYear(m[1], m[2]) }) }
  ];

  function century(s, bc, part) {
    const n = /^\d+$/.test(s) ? +s : roman(s);
    if (!n || n > 30) return null;
    return { century: bc ? -n : n, part: part && PART[plain(part)] };
  }
  function quarter(kind, n, y, lower) {
    if (lower || !n || (kind === 'S' && n > 2)) return null;
    return { y, frac: kind === 'S' ? (n - 1) / 2 + 0.25 : (n - 1) / 4 + 0.125, name: kind + n };
  }
  function twoDigits(n) {
    const now = new Date().getFullYear() % 100;
    return n <= now + 10 ? 2000 + n : 1900 + n;
  }
  function roman(s) {
    const v = { I: 1, V: 5, X: 10, L: 50 };
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const a = v[s[i]], b = v[s[i + 1]] || 0;
      n += a < b ? -a : a;
    }
    return n > 0 && n <= 30 ? n : 0;
  }
  const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const valid = (r) => (r.mo == null || (r.mo >= 1 && r.mo <= 12))
    && (r.d == null || (r.d >= 1 && r.d <= (r.mo ? (r.mo === 2 && r.y != null && !leap(r.y) ? 28 : DAYS[r.mo - 1]) : 31)));

  // Position sur la frise, en années (1789.53…), et le texte affiché.
  function when(r) {
    if (r.century) {
      const c = r.century;
      const start = c > 0 ? (c - 1) * 100 : c * 100;
      const [pre, off] = r.part || ['', 50];
      return { t: start + off, prec: 'siecle', label: `${pre ? pre + ' du ' : ''}${romanOf(Math.abs(c))}e siècle${c < 0 ? ' av. J.-C.' : ''}` };
    }
    if (r.decade != null) {
      const [pre, off] = { debut: ['début', 2], fin: ['fin', 8], milieu: ['milieu', 5] }[r.part] || ['', 5];
      return { t: r.decade + off, prec: 'decennie', label: `${pre ? pre + ' des ' : ''}années ${r.decade}` };
    }
    const bc = r.y < 0 ? ' av. J.-C.' : '';
    const ay = Math.abs(r.y);
    if (r.frac != null) return { t: r.y + r.frac, prec: 'saison', label: r.name.endsWith('-') ? `${r.name}${ay}` : `${r.name} ${ay}` };
    if (r.mo && r.d) return { t: r.y + (r.mo - 1) / 12 + (r.d - 1) / 365, prec: 'jour', label: `${r.d === 1 ? '1er' : r.d} ${MONTH_NAMES[r.mo]} ${ay}${bc}` };
    if (r.mo) return { t: r.y + (r.mo - 1) / 12 + 0.04, prec: 'mois', label: `${MONTH_NAMES[r.mo]} ${ay}${bc}` };
    return { t: r.y + 0.5, prec: 'annee', label: `${ay}${bc}` };
  }
  function romanOf(n) {
    const parts = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of parts) while (n >= v) { s += r; n -= v; }
    return s;
  }

  // La phrase autour d'une date, et la place de la date dans cette phrase.
  function sentenceAround(text, start, end) {
    let a = start;
    while (a > 0 && !(/[.!?…]/.test(text[a - 1]) && /\s/.test(text[a] || ' ') && !/\b(?:av|J\.-C|M|Mme|Dr|St|p|n°)\.$/.test(text.slice(Math.max(0, a - 6), a)))) a--;
    let b = end;
    while (b < text.length && !(/[.!?…]/.test(text[b]) && /\s|$/.test(text[b + 1] || ' ') && !/\b(?:av|J|C|M|Mme|Dr|St|p)$/.test(text.slice(Math.max(0, b - 4), b)))) b++;
    if (b < text.length) b++;
    let s = text.slice(a, b);
    let hs = start - a;
    const lead = s.length - s.trimStart().length;
    s = s.trim();
    hs -= lead;
    let he = hs + (end - start);
    // Phrase trop longue : coupée autour de la date.
    const MAX = 230;
    if (s.length > MAX) {
      const from = Math.max(0, Math.min(hs - 80, s.length - MAX));
      const cut = s.slice(from, from + MAX);
      s = (from > 0 ? '…' : '') + cut + (from + MAX < s.length ? '…' : '');
      hs = hs - from + (from > 0 ? 1 : 0);
      he = hs + (end - start);
    }
    return { sentence: s, hs, he };
  }

  // Les dates entourées de cette marque (clic droit > « Ne pas inclure dans la Carte du temps ») sont écartées.
  const OFF = '[data-tl="non"]';
  const SKIP = '.ft-cite, .ft-biblio, .ft-bib, .ft-toc, .ft-lof, .ft-index, .ft-pg-gap, .ft-math, #track-layer, script, style';
  const BLOCK = 'p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption, div';

  // Les paragraphes d'un document, dans l'ordre : leur texte (espaces regroupés) et, pour chaque
  // caractère, s'il fait partie d'une date écartée.
  function blocksOf(root) {
    const map = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest(SKIP)) continue;
      const block = el.closest(BLOCK) || root;
      if (!map.has(block)) map.set(block, { text: '', off: [] });
      const b = map.get(block);
      const off = !!el.closest(OFF);
      for (let i = 0; i < n.data.length; i++) {
        const ch = n.data[i];
        if (/\s/.test(ch)) { if (b.text.endsWith(' ')) continue; b.text += ' '; } else b.text += ch;
        b.off.push(off);
      }
    }
    return [...map.values()].filter((b) => b.text.trim());
  }

  function scan(text) {
    const found = [];
    const taken = [];
    const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      // Un passage lu pour rien (« mardi 18 » n'est pas un mois) est repris au caractère suivant :
      // « 18 septembre 1932 » y commence peut-être.
      for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
        const lead = rule.year ? m[0].indexOf(m[rule.year]) : 0;
        const start = m.index + lead;
        const end = m.index + m[0].length;
        const r = free(m.index, end) && rule.read(m);
        if (!r) { rule.re.lastIndex = m.index + 1; continue; }
        taken.push([m.index, end]);
        if (rule.range) { for (const x of r) found.push({ r: { y: x.y }, start: x.at, end: x.at + x.text.length }); continue; }
        if (!valid(r)) continue;
        found.push({ r, start, end: rule.year ? start + m[0].slice(lead).replace(/\s+$/, '').length : end });
      }
    }
    return found.sort((a, b) => a.start - b.start);
  }

  function eventsOf(doc, root) {
    const out = [];
    let lastYear = null;
    blocksOf(root).forEach(({ text, off }, bi) => {
      for (const f of scan(text)) {
        const r = { ...f.r };
        const excluded = off.slice(f.start, f.end).some(Boolean);
        let approx = false;
        if (r.century == null && r.decade == null) {
          if (r.y == null) {
            if (lastYear == null) continue;
            r.y = lastYear;
            approx = true;
          } else if (!excluded) lastYear = r.y;
          if (r.y === 0 || Math.abs(r.y) > 9999) continue;
        }
        const w = when(r);
        const { sentence, hs, he } = sentenceAround(text, f.start, f.end);
        out.push({ ...w, approx, off: excluded, doc: doc.id, docTitle: doc.title, text: text.slice(f.start, f.end), sentence, hs, he, block: bi });
      }
    });
    // Une même date dans une même phrase : un seul événement.
    const seen = new Set();
    return out.filter((e) => { const k = e.label + '|' + e.sentence; if (seen.has(k)) return false; seen.add(k); return true; });
  }

  async function collect() {
    const ticket = ++building;
    const list = await App().projectBodies(scope === 'document');
    if (ticket !== building) return false;
    docs = list.map((d, i) => ({ id: d.id, title: d.title, index: i }));
    events = list.flatMap((d) => eventsOf(d, d.root)).sort((a, b) => a.t - b.t || a.docTitle.localeCompare(b.docTitle));
    return true;
  }

  // ----- Affichage -----

  const palette = () => PALETTES[opts.palette] || PALETTES.vive;
  const docColor = (d) => (d && opts.docColors[d.id]) || palette()[(d ? d.index : 0) % palette().length];
  // Couleur d'une date : celle de son document, de son siècle, ou une seule pour toutes.
  function colorOf(id, e) {
    if (opts.colors === 'unique') return 'var(--accent)';
    if (opts.colors === 'siecle' && e) return palette()[((Math.floor(e.t / 100) % 8) + 8) % 8];
    return docColor(docs.find((d) => d.id === id));
  }
  function shown() {
    const q = plain(query.trim());
    return events.filter((e) => !hiddenDocs.has(e.doc) && (opts.excluded || !e.off) && (opts.approx || !e.approx)
      && (!q || plain(e.sentence + ' ' + e.label + ' ' + e.docTitle).includes(q)));
  }

  function renderDocs() {
    const bar = $('tl-docs');
    bar.replaceChildren();
    if (docs.length < 2) return;
    for (const d of docs) {
      const n = events.filter((e) => e.doc === d.id).length;
      if (!n) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tl-doc' + (hiddenDocs.has(d.id) ? ' off' : '');
      b.style.setProperty('--c', docColor(d));
      b.title = (hiddenDocs.has(d.id) ? 'Montrer les dates de ce document' : 'Cacher les dates de ce document') + ' · pastille : changer la couleur';
      const dot = document.createElement('i');
      dot.title = 'Couleur du document sur la frise';
      // La pastille ouvre le choix de la couleur du document (gardée dans les réglages de la frise).
      dot.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const pick = document.createElement('input');
        pick.type = 'color';
        pick.value = /^#[0-9a-f]{6}$/i.test(docColor(d)) ? docColor(d) : '#c0392b';
        pick.className = 'tl-pick vs-keep';
        const r = dot.getBoundingClientRect();
        pick.style.left = r.left + 'px';
        pick.style.top = r.bottom + 'px';
        document.body.append(pick);
        pick.addEventListener('input', () => { setOpt('docColors', { ...opts.docColors, [d.id]: pick.value }); });
        pick.addEventListener('change', () => pick.remove());
        pick.addEventListener('blur', () => pick.remove());
        pick.click();
      });
      b.append(dot, `${d.title} (${n})`);
      b.addEventListener('click', () => { if (hiddenDocs.has(d.id)) hiddenDocs.delete(d.id); else hiddenDocs.add(d.id); renderDocs(); render(); });
      bar.append(b);
    }
  }

  function snippet(e) {
    const p = document.createElement('div');
    p.className = 'tl-text';
    const b = document.createElement('b');
    b.textContent = e.sentence.slice(e.hs, e.he);
    p.append(e.sentence.slice(0, e.hs), b, e.sentence.slice(e.he));
    return p;
  }

  function card(e) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'tl-card' + (e.off ? ' tl-off' : '') + (opts.size === 'compact' ? ' tl-l1' : opts.size === 'large' ? ' tl-l4' : '');
    c.style.setProperty('--c', colorOf(e.doc, e));
    c.style.width = CARD_W + 'px';
    c.style.height = CARD_H + 'px';
    c.title = `${e.sentence}\n\n${e.docTitle} : cliquez pour ouvrir le document à cet endroit.${e.approx ? "\n~ : l'année vient de la dernière année citée plus haut dans le texte." : ''}${e.off ? '\nDate exclue de la Carte du temps.' : ''}`;
    const head = document.createElement('div');
    head.className = 'tl-date';
    head.textContent = (e.approx ? '~ ' : '') + e.label;
    const doc = document.createElement('div');
    doc.className = 'tl-from';
    doc.textContent = e.docTitle;
    c.append(head);
    if (opts.text) c.append(snippet(e));
    if (opts.from) c.append(doc);
    c.addEventListener('click', () => jump(e));
    c.addEventListener('contextmenu', (ev) => cardMenu(ev, e));
    return c;
  }

  // Écart entre deux graduations, selon la place disponible.
  function tickStep() {
    const steps = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
    let step = steps[0];
    for (const s of steps) if (s * pxPerYear >= 90) step = s;
    if (pxPerYear >= 90 * 12) return { months: 1 };
    if (pxPerYear >= 90 * 4) return { months: 3 };
    return { years: step };
  }

  // Position à l'écran d'une date. Un long vide entre deux dates (de l'Antiquité à 1789…)
  // est raccourci et marqué d'une coupure, pour que les dates proches ne s'entassent pas.
  const BREAK_AT = 260;
  const BREAK_W = 120;
  let range = { min: 0, max: 1 };
  let knots = [];
  function layout(list, ppy) {
    const times = [...new Set(list.map((e) => e.t))].sort((a, b) => a - b);
    const out = [{ t: range.min, x: 60, cut: false }];
    for (const t of times) {
      const prev = out[out.length - 1];
      if (t <= prev.t) continue;
      const dx = (t - prev.t) * ppy;
      const cut = opts.cut && dx > BREAK_AT;
      out.push({ t, x: prev.x + (cut ? BREAK_W : dx), cut });
    }
    if (range.max > out[out.length - 1].t) out.push({ t: range.max, x: out[out.length - 1].x + (range.max - out[out.length - 1].t) * ppy, cut: false });
    return out;
  }
  function xOf(t) {
    if (t <= knots[0].t) return knots[0].x + (t - knots[0].t) * pxPerYear;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i];
      if (t <= b.t) return a.x + (t - a.t) / (b.t - a.t) * (b.x - a.x);
    }
    const z = knots[knots.length - 1];
    return z.x + (t - z.t) * pxPerYear;
  }
  function tOf(x) {
    if (x <= knots[0].x) return knots[0].t + (x - knots[0].x) / pxPerYear;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i];
      if (x <= b.x) return a.t + (x - a.x) / (b.x - a.x || 1) * (b.t - a.t);
    }
    const z = knots[knots.length - 1];
    return z.t + (x - z.x) / pxPerYear;
  }
  const inCut = (t) => knots.some((b, i) => b.cut && t > knots[i - 1].t && t < b.t);

  // Le zoom qui fait tenir toute la frise dans la fenêtre.
  function fitZoom(list) {
    const w = Math.max(400, scroller.clientWidth - 120 - CARD_W);
    const widthAt = (ppy) => { const k = layout(list, ppy); return k[k.length - 1].x - 60; };
    let lo = Math.log(0.005), hi = Math.log(20000);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (widthAt(Math.exp(mid)) > w) hi = mid; else lo = mid;
    }
    pxPerYear = Math.exp(lo);
    // Toutes les dates au même moment : un zoom raisonnable plutôt qu'infini.
    if (list.every((e) => e.t === list[0].t)) pxPerYear = 300;
  }

  function render() {
    const list = shown();
    const off = events.filter((e) => e.off).length;
    const base = events.length - (opts.excluded ? 0 : off);
    $('tl-count').textContent = events.length ? `${list.length} date${list.length > 1 ? 's' : ''}${list.length !== base ? ` sur ${base}` : ''}`
      + (off && !opts.excluded ? ` · ${off} exclue${off > 1 ? 's' : ''}` : '') : '';
    $('tl-empty').hidden = !!list.length;
    $('tl-empty').textContent = events.length ? 'Aucune date ne correspond au filtre.' : (scope === 'document'
      ? 'Aucune date trouvée dans ce document. Écrivez par exemple « le 14 juillet 1789 » ou « en 1914 ».'
      : 'Aucune date trouvée dans les documents du projet. Écrivez par exemple « le 14 juillet 1789 » ou « en 1914 ».');
    scroller.hidden = viewMode !== 'frise' || !list.length;
    listBox.hidden = viewMode !== 'liste' || !list.length;
    $('tl-zoom').hidden = viewMode !== 'frise';
    if (!list.length) return;
    if (viewMode === 'liste') return renderList(list);
    renderFrise(list);
  }

  function renderFrise(list) {
    sizeCards();
    range = { min: list[0].t, max: list[list.length - 1].t };
    if (range.max - range.min < 1) { range.min -= 0.5; range.max += 0.5; }
    if (!pxPerYear) fitZoom(list);
    knots = layout(list, pxPerYear);
    const width = xOf(range.max) + CARD_W + 60;
    // Cartes posées en rangées, au-dessus puis au-dessous de l'axe, sans se chevaucher.
    const lanes = [];
    const placed = list.map((e) => {
      const x = xOf(e.t);
      let k = lanes.findIndex((right) => right < x - 6);
      if (k < 0) { k = lanes.length; lanes.push(0); }
      lanes[k] = x + CARD_W;
      return { e, x, lane: k };
    });
    // Cartes alternées autour de l'axe, ou toutes au-dessus, ou toutes au-dessous.
    const side = (lane) => (opts.place === 'dessus' ? { up: true, row: lane } : opts.place === 'dessous' ? { up: false, row: lane } : { up: lane % 2 === 0, row: Math.floor(lane / 2) });
    const above = opts.place === 'dessus' ? lanes.length : opts.place === 'dessous' ? 0 : Math.ceil(lanes.length / 2);
    const below = lanes.length - above;
    const axisY = 20 + above * LANE + AXIS_GAP;
    const height = axisY + AXIS_GAP + below * LANE + 30;
    stage.replaceChildren();
    stage.className = `tl-stem-${opts.stem} tl-dot-${opts.dot}`;
    stage.style.setProperty('--tl-fs', opts.font / 100);
    stage.style.width = width + 'px';
    stage.style.height = Math.max(height, scroller.clientHeight - 4) + 'px';
    const axisTop = Math.max(axisY, (scroller.clientHeight - 4 - height) / 2 + axisY);
    const axis = document.createElement('div');
    axis.className = 'tl-axis';
    axis.style.top = axisTop + 'px';
    stage.append(axis);
    // Graduations
    const step = tickStep();
    const frag = document.createDocumentFragment();
    if (step.months) {
      for (let y = Math.floor(range.min); y <= Math.ceil(range.max); y++) {
        for (let mo = 0; mo < 12; mo += step.months) {
          const t = y + mo / 12;
          if (t < range.min - 0.2 || t > range.max + 0.2 || inCut(t)) continue;
          frag.append(tick(t, mo === 0 ? `${Math.abs(y)}${y < 0 ? ' av. J.-C.' : ''}` : MONTH_NAMES[mo + 1].slice(0, 4) + (MONTH_NAMES[mo + 1].length > 4 ? '.' : ''), axisTop, mo === 0));
          if (opts.grid) frag.append(gridLine(t));
        }
      }
    } else {
      const s = step.years;
      for (let y = Math.ceil(range.min / s) * s; y <= range.max + s * 0.2; y += s) {
        if (y === 0 || inCut(y)) continue;
        frag.append(tick(y, `${Math.abs(y)}${y < 0 ? ' av. J.-C.' : ''}`, axisTop, y % (s * 5) === 0));
        if (opts.grid) frag.append(gridLine(y));
      }
    }
    // Coupures de l'axe, là où un long vide a été raccourci.
    knots.forEach((b, i) => {
      if (!b.cut) return;
      const a = knots[i - 1];
      const cut = document.createElement('span');
      cut.className = 'tl-cut';
      cut.style.left = (a.x + b.x) / 2 + 'px';
      cut.style.top = axisTop + 'px';
      const yrs = Math.round(b.t - a.t);
      cut.title = `${yrs} an${yrs > 1 ? 's' : ''} sans date, raccourcis`;
      frag.append(cut);
    });
    stage.append(frag);
    for (const p of placed) {
      const { up, row } = side(p.lane);
      const top = up ? axisTop - AXIS_GAP - CARD_H - row * LANE : axisTop + AXIS_GAP + row * LANE;
      const dot = document.createElement('span');
      dot.className = 'tl-dot';
      dot.style.left = p.x + 'px';
      dot.style.top = axisTop + 'px';
      dot.style.setProperty('--c', colorOf(p.e.doc, p.e));
      if (p.e.off) dot.classList.add('tl-off');
      const stem = document.createElement('span');
      stem.className = 'tl-stem';
      stem.style.left = p.x + 'px';
      stem.style.top = (up ? top + CARD_H : axisTop) + 'px';
      stem.style.height = (up ? axisTop - top - CARD_H : top - axisTop) + 'px';
      stem.style.setProperty('--c', colorOf(p.e.doc, p.e));
      const c = card(p.e);
      c.style.left = (p.x - 10) + 'px';
      c.style.top = top + 'px';
      stage.append(stem, dot, c);
    }
  }

  function gridLine(t) {
    const g = document.createElement('span');
    g.className = 'tl-grid';
    g.style.left = xOf(t) + 'px';
    return g;
  }

  function tick(t, label, axisTop, major) {
    const el = document.createElement('span');
    el.className = 'tl-tick' + (major ? ' major' : '');
    el.style.left = xOf(t) + 'px';
    el.style.top = axisTop + 'px';
    const l = document.createElement('span');
    l.textContent = label;
    el.append(l);
    return el;
  }

  function renderList(list) {
    listBox.replaceChildren();
    let group = null;
    for (const e of list) {
      const wide = e.prec === 'siecle' || e.prec === 'decennie';
      const key = wide ? e.label : String(Math.floor(e.t)) + (e.t < 0 ? ' av. J.-C.' : '');
      if (key !== group) {
        group = key;
        const h = document.createElement('div');
        h.className = 'tl-year';
        h.textContent = wide ? e.label : `${Math.abs(Math.floor(e.t))}${e.t < 0 ? ' av. J.-C.' : ''}`;
        listBox.append(h);
      }
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tl-row' + (e.off ? ' tl-off' : '');
      row.style.setProperty('--c', colorOf(e.doc, e));
      const d = document.createElement('span');
      d.className = 'tl-date';
      d.textContent = (e.approx ? '~ ' : '') + e.label;
      const from = document.createElement('span');
      from.className = 'tl-from';
      from.textContent = e.docTitle;
      row.append(d, snippet(e), from);
      row.title = e.off ? 'Date exclue de la Carte du temps · ouvrir le document à cet endroit' : 'Ouvrir le document à cet endroit';
      row.addEventListener('click', () => jump(e));
      row.addEventListener('contextmenu', (ev) => cardMenu(ev, e));
      listBox.append(row);
    }
  }

  // ----- Aller à la date dans le texte -----

  async function jump(e) {
    await App().openDocById(e.doc);
    show(false);
    const editor = $('editor');
    // Le paragraphe qui contient la phrase, puis la date dans ce paragraphe.
    const want = e.sentence.replace(/^…|…$/g, '');
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const groups = new Map();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest(SKIP)) continue;
      const block = el.closest(BLOCK) || editor;
      if (!groups.has(block)) groups.set(block, []);
      groups.get(block).push(n);
    }
    let target = null;
    for (const [block, nodes] of groups) {
      const text = nodes.map((n) => n.data).join('').replace(/\s+/g, ' ');
      if (text.includes(want) || text.includes(want.slice(0, 60))) { target = { block, nodes }; break; }
    }
    if (!target) return null;
    target.block.scrollIntoView({ block: 'center' });
    // La date elle-même, en tenant compte des espaces regroupés.
    const raw = target.nodes.map((n) => n.data).join('');
    const pattern = new RegExp(e.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    const flat = raw.replace(/\s+/g, ' ');
    const at = flat.indexOf(want);
    const m = pattern.exec(raw.slice(Math.max(0, mapIndex(raw, at))));
    if (!m) return null;
    const startIdx = Math.max(0, mapIndex(raw, at)) + m.index;
    const pos = (i) => {
      let acc = 0;
      for (const n of target.nodes) { if (i <= acc + n.data.length) return [n, i - acc]; acc += n.data.length; }
      const last = target.nodes[target.nodes.length - 1];
      return [last, last.data.length];
    };
    const [sn, so] = pos(startIdx);
    const [en, eo] = pos(startIdx + m[0].length);
    const r = document.createRange();
    r.setStart(sn, so);
    r.setEnd(en, eo);
    editor.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return r;
  }
  // Place dans le texte brut d'une place dans le texte aux espaces regroupés.
  function mapIndex(raw, flatIdx) {
    if (flatIdx < 0) return 0;
    let f = 0;
    for (let i = 0; i < raw.length; i++) {
      if (f === flatIdx) return i;
      if (/\s/.test(raw[i])) { while (i + 1 < raw.length && /\s/.test(raw[i + 1])) i++; }
      f++;
    }
    return raw.length;
  }

  // ----- Écarter une date de la carte, ou la reprendre -----

  // La date est entourée d'une marque invisible (<span data-tl="non">), enregistrée avec le texte.
  function engineRange(range) {
    const M = window.FTMoteur;
    if (!M || !M.view || !range) return null;
    try {
      const from = M.view.posAtDOM(range.startContainer, range.startOffset);
      const to = M.view.posAtDOM(range.endContainer, range.endOffset);
      return to > from ? { from, to } : null;
    } catch (err) { return null; }
  }
  function setExcluded(at, on) {
    const M = window.FTMoteur;
    if (!at || !M) return;
    const { view } = M;
    const type = M.schema.marks.inl;
    const tr = view.state.tr;
    if (on) tr.addMark(at.from, at.to, type.create({ tag: 'span', a: { 'data-tl': 'non' } }));
    else {
      view.state.doc.nodesBetween(at.from, at.to, (node) => {
        for (const m of node.marks) if (m.type === type && m.attrs.a && m.attrs.a['data-tl'] === 'non') tr.removeMark(at.from, at.to, m);
      });
    }
    if (tr.docChanged) view.dispatch(tr);
  }
  const contents = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r; };
  // La date sous le pointeur, dans le texte : une plage du texte affiché.
  function dateAt(x, y) {
    const ed = $('editor');
    const at = document.caretRangeFromPoint && document.caretRangeFromPoint(x, y);
    if (!at || at.startContainer.nodeType !== Node.TEXT_NODE || !ed.contains(at.startContainer)) return null;
    const el = at.startContainer.parentElement;
    if (el.closest(SKIP)) return null;
    const block = el.closest(BLOCK) || ed;
    const nodes = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (p && !p.closest(SKIP) && (p.closest(BLOCK) || ed) === block) nodes.push(n);
    }
    let o = 0;
    for (const n of nodes) { if (n === at.startContainer) { o += at.startOffset; break; } o += n.data.length; }
    const f = scan(nodes.map((n) => n.data).join('')).find((d) => o >= d.start && o <= d.end);
    if (!f) return null;
    const pos = (i) => {
      let acc = 0;
      for (const n of nodes) { if (i <= acc + n.data.length) return [n, i - acc]; acc += n.data.length; }
      const last = nodes[nodes.length - 1];
      return [last, last.data.length];
    };
    const r = document.createRange();
    r.setStart(...pos(f.start));
    r.setEnd(...pos(f.end));
    return r;
  }

  // Clic droit dans le texte (structure.js) : sur une date, ou sur une sélection qui en contient.
  function menuItems(target, x, y) {
    const ed = $('editor');
    if (!target || !ed.contains(target) || target.closest(SKIP)) return [];
    const off = target.closest(OFF);
    if (off) return [{ text: 'Inclure dans la Carte du temps', action: () => setExcluded(engineRange(contents(off)), false) }];
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed && ed.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0);
      const items = [];
      if (scan(r.toString()).length) {
        const at = engineRange(r);
        items.push({ text: 'Ne pas inclure dans la Carte du temps', action: () => setExcluded(at, true) });
      }
      if ([...ed.querySelectorAll(OFF)].some((el) => r.intersectsNode(el))) {
        const at = engineRange(r);
        items.push({ text: 'Inclure dans la Carte du temps', action: () => setExcluded(at, false) });
      }
      if (items.length) return items;
    }
    const at = engineRange(dateAt(x, y));
    return at ? [{ text: 'Ne pas inclure dans la Carte du temps', action: () => setExcluded(at, true) }] : [];
  }

  // Clic droit sur une date de la frise ou de la liste.
  function cardMenu(ev, e) {
    ev.preventDefault();
    ev.stopPropagation();
    window.FTSidebar.showMenu(ev.clientX, ev.clientY, [
      { text: 'Ouvrir à cet endroit', action: () => jump(e) },
      { text: e.off ? 'Inclure dans la Carte du temps' : 'Ne pas inclure dans la Carte du temps', action: () => toggleFromMap(e) }
    ]);
  }
  async function toggleFromMap(e) {
    const keep = { left: scroller.scrollLeft, top: scroller.scrollTop, list: listBox.scrollTop, ppy: pxPerYear };
    const r = await jump(e);
    if (r) {
      if (e.off) {
        const el = (r.startContainer.parentElement || r.startContainer).closest(OFF);
        setExcluded(engineRange(el ? contents(el) : r), false);
      } else setExcluded(engineRange(r), true);
    }
    await show(true, keep);
  }

  // ----- Zoom et déplacement -----

  function zoom(factor, clientX) {
    if (!pxPerYear) return;
    const r = scroller.getBoundingClientRect();
    const px = (clientX == null ? r.left + r.width / 2 : clientX) - r.left;
    const t = tOf(scroller.scrollLeft + px);
    pxPerYear = Math.min(20000, Math.max(0.005, pxPerYear * factor));
    render();
    scroller.scrollLeft = xOf(t) - px;
  }

  scroller.addEventListener('wheel', (e) => {
    if (e.ctrlKey) { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.002), e.clientX); return; }
    if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && scroller.scrollHeight <= scroller.clientHeight + 2) {
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  let drag = null;
  scroller.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.tl-card')) return;
    drag = { x: e.clientX, y: e.clientY, l: scroller.scrollLeft, t: scroller.scrollTop };
    scroller.setPointerCapture(e.pointerId);
    scroller.classList.add('dragging');
  });
  scroller.addEventListener('pointermove', (e) => {
    if (!drag) return;
    scroller.scrollLeft = drag.l - (e.clientX - drag.x);
    scroller.scrollTop = drag.t - (e.clientY - drag.y);
  });
  const endDrag = () => { drag = null; scroller.classList.remove('dragging'); };
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);

  $('tl-zoom-in').addEventListener('click', () => zoom(1.6));
  $('tl-zoom-out').addEventListener('click', () => zoom(1 / 1.6));
  $('tl-fit').addEventListener('click', () => { pxPerYear = 0; render(); scroller.scrollLeft = 0; });

  $('tl-search').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('tl-search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; query = ''; render(); } });
  const seg = (id, set) => $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    $(id).querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    set(b.dataset.v);
  }));
  seg('tl-scope', async (v) => { scope = v; pxPerYear = 0; await refresh(true); });
  seg('tl-mode', (v) => { viewMode = v; render(); });

  // ----- Onglet -----

  async function refresh(force) {
    if (!visible && !force) return;
    if (await collect()) {
      renderDocs();
      render();
    }
  }

  // keep : zoom et défilement à retrouver (retour après avoir écarté une date depuis la frise).
  async function show(on, keep) {
    if (on === visible) return;
    visible = on;
    box.hidden = !on;
    main.classList.toggle('view-timeline', on);
    tabTimeline.setAttribute('aria-selected', String(on));
    if (on) {
      if (window.FTMindmap && window.FTMindmap.isVisible()) window.FTMindmap.show(false);
      tabDocument.setAttribute('aria-selected', 'false');
      tabMindmap.setAttribute('aria-selected', 'false');
      pxPerYear = keep ? keep.ppy : 0;
      await refresh(true);
      scroller.scrollLeft = keep ? keep.left : 0;
      if (keep) { scroller.scrollTop = keep.top; listBox.scrollTop = keep.list; }
    } else if (!(window.FTMindmap && window.FTMindmap.isVisible())) {
      tabDocument.setAttribute('aria-selected', 'true');
    }
  }

  // ----- Réglages de la frise -----

  function setOpt(key, value) {
    opts = { ...opts, [key]: value };
    onSave(JSON.parse(JSON.stringify(opts)));
    if (key === 'docColors') renderDocs();
    syncSettings();
    if (visible) render();
  }
  const SETTINGS = [
    { key: 'size', label: 'Cartes', choices: [['compact', 'Compactes'], ['normal', 'Normales'], ['large', 'Grandes']] },
    { key: 'font', label: 'Taille du texte', choices: [[85, 'Petite'], [100, 'Normale'], [115, 'Grande'], [130, 'Très grande']] },
    { key: 'place', label: 'Position', choices: [['alterne', 'Alternée'], ['dessus', 'Au-dessus'], ['dessous', 'Au-dessous']] },
    { key: 'colors', label: 'Couleurs', choices: [['document', 'Par document'], ['siecle', 'Par siècle'], ['unique', 'Couleur unique']] },
    { key: 'palette', label: 'Palette', choices: [['vive', 'Vive'], ['douce', 'Douce'], ['sobre', 'Sobre'], ['contraste', 'Contrastée']] },
    { key: 'stem', label: 'Traits', choices: [['tirets', 'Tirets'], ['trait', 'Continus'], ['aucun', 'Aucun']] },
    { key: 'dot', label: 'Points', choices: [['rond', 'Ronds'], ['carre', 'Carrés'], ['losange', 'Losanges']] },
    { label: 'Contenu', checks: [['text', 'Phrase'], ['from', 'Nom du document']] },
    { label: 'Affichage', checks: [['grid', 'Quadrillage'], ['cut', 'Raccourcir les longues périodes sans date'], ['approx', 'Dates déduites (~)'], ['excluded', 'Dates exclues']] }
  ];
  // Choix enregistrés tels quels ; les nombres (taille du texte) restent des nombres.
  const settingsPanel = window.FTViewSettings.build({
    panel: $('tl-settings'),
    button: $('tl-settings-btn'),
    title: 'Réglages de la frise',
    rows: SETTINGS,
    get: () => opts,
    set: (k, v) => setOpt(k, typeof DEFAULTS[k] === 'number' ? +v : v),
    reset: () => {
      opts = { ...DEFAULTS, docColors: {} };
      onSave(JSON.parse(JSON.stringify(opts)));
      syncSettings();
      renderDocs();
      if (visible) render();
    }
  });
  function syncSettings() {
    settingsPanel.sync();
    listBox.style.setProperty('--tl-fs', opts.font / 100);
  }
  syncSettings();

  tabTimeline.addEventListener('click', () => show(true));
  tabDocument.addEventListener('click', () => show(false));
  tabMindmap.addEventListener('click', () => show(false));
  new ResizeObserver(() => { if (visible && viewMode === 'frise') render(); }).observe(scroller);

  window.FTTimeline = {
    init(saved, save) {
      if (saved && typeof saved === 'object') {
        opts = { ...DEFAULTS };
        for (const k of Object.keys(DEFAULTS)) if (saved[k] != null && typeof saved[k] === typeof DEFAULTS[k]) opts[k] = saved[k];
      }
      onSave = save || (() => {});
      syncSettings();
    },
    options: () => JSON.parse(JSON.stringify(opts)),
    menuItems,
    show, toggle: () => show(!visible), isVisible: () => visible, refresh, scan: (text) => eventsOf({ id: 'x', title: 'x' }, Object.assign(document.createElement('div'), { textContent: text })) };
})();
