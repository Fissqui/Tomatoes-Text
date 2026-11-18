// Bibliographie complète : import des références (BibTeX, RIS, CSL JSON de Zotero, Zotero ouvert sur
// l'ordinateur) et normes de présentation (APA 7ᵉ éd., Chicago auteur-date et notes, ISO 690, MLA 9ᵉ éd.).
// Tout se fait sans connexion. Les sources gardent la forme de citations.js ({ id, type, authors: [« Nom,
// Prénom »], editors, title, year, container, publisher, place, volume, issue, pages, edition, doi, isbn,
// url, accessed }).
// - FTBiblio.parse(text) : reconnaît le format et renvoie la liste des sources (sans id).
// - FTBiblio.fromZotero(items) : éléments renvoyés par l'API locale de Zotero.
// - FTBiblio.reference(s, norm, lang, suffix) / label(…) / note(…) : écriture selon la norme.
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const strip = (h) => String(h).replace(/<[^>]*>/g, '');

  const NORMS = ['classique', 'apa', 'chicago', 'iso690', 'mla'];

  // ===================== Lecture des formats =====================

  const TYPES = ['livre', 'article', 'chapitre', 'conference', 'these', 'rapport', 'web', 'autre'];

  function clean(s) {
    const out = { type: TYPES.includes(s.type) ? s.type : 'autre', authors: [], title: '', year: '' };
    for (const [k, v] of Object.entries(s)) {
      if (v == null || k === 'type') continue;
      if (k === 'authors' || k === 'editors') {
        const list = (Array.isArray(v) ? v : []).map((a) => String(a).replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (list.length || k === 'authors') out[k] = list;
      } else {
        const t = String(v).replace(/\s+/g, ' ').trim();
        if (t) out[k] = t;
      }
    }
    if (out.pages) out.pages = out.pages.replace(/\s*(--?|–|—)\s*/g, '-');
    if (out.doi) out.doi = out.doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
    if (out.accessed) out.accessed = isoDate(out.accessed) || '';
    if (!out.accessed) delete out.accessed;
    return out;
  }

  const yearOf = (d) => { const m = String(d || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? m[1] : ''; };
  function isoDate(d) {
    const m = String(d || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }

  // ----- BibTeX (et BibLaTeX) -----

  const ACCENTS = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇', c: '̧', k: '̨', u: '̆', v: '̌', H: '̋', r: '̊' };
  const LETTERS = { oe: 'œ', OE: 'Œ', ae: 'æ', AE: 'Æ', ss: 'ß', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', dh: 'ð', th: 'þ', textendash: '–', textemdash: '—', textquoteright: '’', guillemotleft: '«', guillemotright: '»', ldots: '…', dots: '…', textellipsis: '…' };

  function latex(s) {
    let t = String(s);
    t = t.replace(/\\([`'^"~=.])\s*\{?\\?([A-Za-z])\}?/g, (m, a, c) => (c + ACCENTS[a]).normalize('NFC'));
    t = t.replace(/\\([ckuvHr])\s*\{\\?([A-Za-z])\}/g, (m, a, c) => (c + ACCENTS[a]).normalize('NFC'));
    t = t.replace(/\\([ckuvHr]) ([A-Za-z])/g, (m, a, c) => (c + ACCENTS[a]).normalize('NFC'));
    t = t.replace(/\\(oe|OE|ae|AE|ss|aa|AA|dh|th|textendash|textemdash|textquoteright|guillemotleft|guillemotright|ldots|dots|textellipsis|[oOlLij])(?![A-Za-z])\s?(\{\})?/g, (m, a) => LETTERS[a]);
    t = t.replace(/\\(?:emph|textit|textbf|textsc|textrm|textsf|texttt|mkbibquote|enquote|url)\s*\{/g, '{');
    t = t.replace(/\\([&%$#_{}])/g, '$1').replace(/\\url/g, '');
    t = t.replace(/---/g, '—').replace(/--/g, '–').replace(/~/g, ' ').replace(/``|''/g, '"');
    return t.replace(/[{}]/g, '').replace(/\\[A-Za-z]+\s?/g, '').replace(/\s+/g, ' ').trim();
  }

  // Coupe au premier niveau d'accolades (« and » entre auteurs).
  function splitTop(s, re) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (!depth) {
        const m = s.slice(i).match(re);
        if (m && m.index === 0) { out.push(cur); cur = ''; i += m[0].length - 1; continue; }
      }
      cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }

  // « Nom, Prénom » d'après un nom BibTeX (« Prénom Nom », « Nom, Prénom », « {Organisme} », particules).
  function bibName(raw) {
    const r = raw.trim();
    if (/^\{.*\}$/.test(r) && !/\}.*\{/.test(r.slice(1, -1))) return latex(r);
    const parts = splitTop(r, /^,/);
    if (parts.length >= 2) return `${latex(parts[0])}, ${latex(parts[parts.length - 1])}`;
    const words = splitTop(r, /^\s+/).map(latex);
    if (words.length === 1) return words[0];
    let k = words.findIndex((w, i) => i > 0 && i < words.length - 1 && /^[a-zà-ÿ]/.test(w));
    if (k < 0) k = words.length - 1;
    return `${words.slice(k).join(' ')}, ${words.slice(0, k).join(' ')}`;
  }

  const BIB_TYPES = {
    article: 'article', book: 'livre', booklet: 'livre', mvbook: 'livre', collection: 'livre', proceedings: 'livre',
    inbook: 'chapitre', incollection: 'chapitre', inreference: 'chapitre', bookinbook: 'chapitre',
    inproceedings: 'conference', conference: 'conference',
    phdthesis: 'these', mastersthesis: 'these', thesis: 'these',
    techreport: 'rapport', report: 'rapport',
    online: 'web', www: 'web', electronic: 'web'
  };

  function parseBibtex(text) {
    const out = [];
    const macros = { jan: 'janvier', feb: 'février', mar: 'mars', apr: 'avril', may: 'mai', jun: 'juin', jul: 'juillet', aug: 'août', sep: 'septembre', oct: 'octobre', nov: 'novembre', dec: 'décembre' };
    let i = 0;
    const n = text.length;
    const skipWs = () => { while (i < n && /\s/.test(text[i])) i++; };
    function value() {
      skipWs();
      if (text[i] === '{') {
        let depth = 0;
        const start = i;
        for (; i < n; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
        i++;
        return text.slice(start + 1, i - 1);
      }
      if (text[i] === '"') {
        let depth = 0;
        const start = ++i;
        for (; i < n; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; else if (text[i] === '"' && !depth) break; }
        i++;
        return text.slice(start, i - 1);
      }
      const m = text.slice(i).match(/^[^,}#\s]+/);
      if (!m) return '';
      i += m[0].length;
      return /^\d+$/.test(m[0]) ? m[0] : macros[m[0].toLowerCase()] != null ? macros[m[0].toLowerCase()] : m[0];
    }
    function concat() {
      let v = value();
      skipWs();
      while (text[i] === '#') { i++; v += value(); skipWs(); }
      return v;
    }
    while (i < n) {
      const at = text.indexOf('@', i);
      if (at < 0) break;
      i = at + 1;
      const m = text.slice(i).match(/^([A-Za-z]+)\s*([{(])/);
      if (!m) continue;
      const kind = m[1].toLowerCase();
      i += m[0].length;
      const close = m[2] === '{' ? '}' : ')';
      if (kind === 'comment' || kind === 'preamble') {
        let depth = 1;
        for (; i < n && depth; i++) { if (text[i] === m[2]) depth++; else if (text[i] === close) depth--; }
        continue;
      }
      const f = {};
      if (kind !== 'string') {
        const key = text.slice(i).match(/^\s*([^,\s}]*)\s*,/);
        if (key) { i += key[0].length; f._key = key[1]; }
      }
      for (;;) {
        skipWs();
        if (i >= n || text[i] === close) { i++; break; }
        if (text[i] === ',') { i++; continue; }
        const name = text.slice(i).match(/^([A-Za-z0-9_\-:.+]+)\s*=/);
        if (!name) { const next = text.indexOf(close, i); i = next < 0 ? n : next + 1; break; }
        i += name[0].length;
        f[name[1].toLowerCase()] = concat();
      }
      if (kind === 'string') { for (const [k, v] of Object.entries(f)) if (k !== '_key') macros[k] = v; continue; }
      out.push(fromBibFields(kind, f));
    }
    return out;
  }

  function fromBibFields(kind, f) {
    const L = (k) => (f[k] != null ? latex(f[k]) : '');
    let type = BIB_TYPES[kind] || (f.url && kind === 'misc' ? 'web' : 'autre');
    const names = (k) => (f[k] ? splitTop(f[k], /^\s+and\s+/i).filter((x) => x.toLowerCase() !== 'others').map(bibName) : []);
    const s = {
      type,
      authors: names('author'),
      editors: names('editor'),
      title: L('title'),
      year: yearOf(f.year || f.date),
      container: L(type === 'article' ? (f.journaltitle != null ? 'journaltitle' : 'journal') : type === 'web' ? 'organization' : 'booktitle') || (type === 'web' ? L('howpublished').replace(/^\\?url/i, '') : ''),
      publisher: L(type === 'these' ? 'school' : type === 'rapport' ? 'institution' : 'publisher') || L('institution') || L('school') || L('organization'),
      place: L('address') || L('location'),
      volume: L('volume'),
      issue: L('number') || L('issue'),
      pages: L('pages'),
      edition: L('edition'),
      doi: L('doi'),
      isbn: L('isbn'),
      url: f.url ? f.url.replace(/[{}]/g, '').trim() : '',
      accessed: f.urldate || ''
    };
    if (!s.authors.length && s.editors.length && type === 'livre') { s.authors = s.editors; s.editors = []; s.byEditors = 'oui'; }
    if (kind === 'mastersthesis') s.thesis = 'master';
    return clean(s);
  }

  // ----- RIS (Zotero, EndNote, Mendeley, catalogues) -----

  const RIS_TYPES = {
    JOUR: 'article', EJOUR: 'article', MGZN: 'article', NEWS: 'article', JFULL: 'article', INPR: 'article',
    BOOK: 'livre', EBOOK: 'livre', EDBOOK: 'livre', CTLG: 'livre',
    CHAP: 'chapitre', ECHAP: 'chapitre', ENCYC: 'chapitre', DICT: 'chapitre',
    CONF: 'conference', CPAPER: 'conference',
    THES: 'these', RPRT: 'rapport', GOVDOC: 'rapport', STAND: 'rapport',
    ELEC: 'web', WEB: 'web', BLOG: 'web'
  };

  function parseRis(text) {
    const out = [];
    let r = null;
    let last = null;
    for (const raw of text.replace(/\r/g, '').split('\n')) {
      const m = raw.match(/^([A-Z][A-Z0-9])  -\s?(.*)$/);
      if (!m) { if (r && last && raw.trim()) r[last][r[last].length - 1] += ' ' + raw.trim(); continue; }
      const [, tag, val] = m;
      if (tag === 'TY') { r = { TY: [val.trim()] }; last = null; continue; }
      if (!r) continue;
      if (tag === 'ER') { out.push(fromRis(r)); r = null; continue; }
      (r[tag] = r[tag] || []).push(val.trim());
      last = tag;
    }
    if (r) out.push(fromRis(r));
    return out;
  }

  function fromRis(r) {
    const g = (...tags) => { for (const t of tags) if (r[t] && r[t][0]) return r[t][0]; return ''; };
    const all = (...tags) => tags.flatMap((t) => r[t] || []);
    const type = RIS_TYPES[(r.TY[0] || '').toUpperCase()] || 'autre';
    const sp = g('SP');
    const ep = g('EP');
    let editors = all('ED');
    if (!editors.length && (type === 'chapitre' || type === 'conference')) editors = all('A2');
    const container = type === 'article' ? g('T2', 'JO', 'JF', 'JA', 'J2') : type === 'livre' ? '' : g('T2', 'BT', 'J2');
    return clean({
      type,
      authors: all('AU', 'A1').map(risName),
      editors: editors.map(risName),
      title: g('TI', 'T1', 'CT') || (type === 'livre' ? g('BT') : ''),
      year: yearOf(g('PY', 'Y1', 'DA')),
      container: container || (type === 'web' ? g('T2', 'PB') : ''),
      publisher: g('PB') || (type === 'these' || type === 'rapport' ? g('A3') : ''),
      place: g('CY', 'PP'),
      volume: g('VL'),
      issue: g('IS', 'M1'),
      pages: sp && ep && sp !== ep ? `${sp}-${ep}` : sp,
      edition: g('ET'),
      doi: g('DO'),
      isbn: type === 'article' ? '' : g('SN'),
      url: g('UR', 'L2'),
      accessed: g('Y2')
    });
  }
  // RIS : « Nom, Prénom » (déjà), parfois « Nom, Prénom, Jr. ».
  const risName = (a) => a.split(',').slice(0, 2).map((x) => x.trim()).filter(Boolean).join(', ');

  // ----- CSL JSON (export Zotero, Mendeley, Citation.js) -----

  const CSL_TYPES = {
    'article-journal': 'article', 'article-magazine': 'article', 'article-newspaper': 'article', article: 'article', review: 'article', 'review-book': 'article',
    book: 'livre', classic: 'livre',
    chapter: 'chapitre', 'entry-encyclopedia': 'chapitre', 'entry-dictionary': 'chapitre', entry: 'chapitre',
    'paper-conference': 'conference', thesis: 'these', report: 'rapport',
    webpage: 'web', 'post-weblog': 'web', post: 'web'
  };
  const cslName = (p) => (p.literal ? p.literal : [[p['non-dropping-particle'], p.family].filter(Boolean).join(' '), [p.given, p['dropping-particle']].filter(Boolean).join(' ')].filter(Boolean).join(', '));
  const cslDate = (d) => {
    if (!d) return '';
    const parts = d['date-parts'] && d['date-parts'][0];
    if (parts && parts[0]) return parts.length >= 3 ? `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}` : String(parts[0]);
    return d.raw || d.literal || '';
  };

  function fromCsl(items) {
    return items.filter((x) => x && typeof x === 'object').map((x) => {
      const type = CSL_TYPES[x.type] || 'autre';
      const s = clean({
        type,
        authors: (x.author || []).map(cslName),
        editors: (x.editor || []).map(cslName),
        title: x.title,
        year: yearOf(cslDate(x.issued)),
        container: x['container-title'] || (type === 'conference' ? x['event-title'] : ''),
        publisher: x.publisher,
        place: x['publisher-place'] || x['event-place'],
        volume: x.volume,
        issue: x.issue || (type === 'rapport' ? x.number : ''),
        pages: x.page,
        edition: x.edition,
        doi: x.DOI,
        isbn: x.ISBN,
        url: x.URL,
        accessed: isoDate(cslDate(x.accessed))
      });
      if (x.genre && type === 'these' && /master|mémoire/i.test(x.genre)) s.thesis = 'master';
      return s;
    });
  }

  // ----- Zotero : API locale du logiciel ouvert (format natif de Zotero) -----

  const ZOT_TYPES = {
    book: 'livre', bookSection: 'chapitre', journalArticle: 'article', magazineArticle: 'article', newspaperArticle: 'article',
    conferencePaper: 'conference', thesis: 'these', report: 'rapport', webpage: 'web', blogPost: 'web', forumPost: 'web',
    encyclopediaArticle: 'chapitre', dictionaryEntry: 'chapitre'
  };
  const zName = (c) => (c.name ? c.name : [c.lastName, c.firstName].filter(Boolean).join(', '));

  function fromZotero(items) {
    return items.map((it) => (it && it.data ? it.data : it))
      .filter((d) => d && d.itemType && !['attachment', 'note', 'annotation'].includes(d.itemType))
      .map((d) => {
        const type = ZOT_TYPES[d.itemType] || 'autre';
        const by = (role) => (d.creators || []).filter((c) => c.creatorType === role).map(zName);
        let authors = by('author');
        if (!authors.length) authors = (d.creators || []).filter((c) => !['editor', 'seriesEditor', 'translator', 'reviewedAuthor'].includes(c.creatorType)).map(zName);
        const s = clean({
          type,
          authors,
          editors: by('editor'),
          title: d.title,
          year: yearOf(d.date),
          container: d.publicationTitle || d.bookTitle || d.proceedingsTitle || d.encyclopediaTitle || d.dictionaryTitle || d.websiteTitle || d.blogTitle || d.forumTitle || '',
          publisher: d.publisher || d.university || d.institution || '',
          place: d.place,
          volume: d.volume,
          issue: d.issue || d.reportNumber,
          pages: d.pages,
          edition: d.edition,
          doi: d.DOI || ((d.extra || '').match(/^DOI:\s*(\S+)/m) || [])[1],
          isbn: d.ISBN,
          url: d.url,
          accessed: isoDate(d.accessDate)
        });
        if (type === 'these' && /master|mémoire/i.test(d.thesisType || '')) s.thesis = 'master';
        if (d.key) s.zotero = d.key;
        return s;
      });
  }

  // Reconnaît le format : BibTeX, RIS, CSL JSON ou JSON de Zotero. Renvoie { format, list }.
  function parse(text) {
    const t = String(text || '').replace(/^﻿/, '').trim();
    if (!t) return { format: '', list: [] };
    if (/^[[{]/.test(t)) {
      try {
        let data = JSON.parse(t);
        if (data && !Array.isArray(data)) data = data.items || [data];
        if (data.some((x) => x && (x.itemType || (x.data && x.data.itemType)))) return { format: 'Zotero', list: fromZotero(data) };
        return { format: 'CSL JSON', list: fromCsl(data) };
      } catch { /* pas du JSON : autre format */ }
    }
    if (/^TY  -/m.test(t)) return { format: 'RIS', list: parseRis(t) };
    if (/@[A-Za-z]+\s*[{(]/.test(t)) return { format: 'BibTeX', list: parseBibtex(t) };
    return { format: '', list: [] };
  }

  // Même source déjà dans le projet : même DOI, ou même titre, même année et même premier auteur.
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function sameSource(a, b) {
    if (a.doi && b.doi) return a.doi.toLowerCase() === b.doi.toLowerCase();
    if (a.zotero && b.zotero && a.zotero === b.zotero) return true;
    const first = (s) => fold(((s.authors || [])[0] || '').split(',')[0]);
    return !!a.title && fold(a.title) === fold(b.title) && String(a.year || '') === String(b.year || '') && first(a) === first(b);
  }

  // ===================== Normes de présentation =====================

  const TERMS = {
    fr: {
      and: 'et', amp: 'et', etal: 'et al.', nd: 's. d.', p: 'p.', pp: 'p.', in: 'Dans', inIso: 'In :', ed: 'dir.', eds: 'dir.', editedBy: 'sous la direction de',
      vol: 'vol.', no: 'n°', edn: 'éd.', thesis: 'Thèse de doctorat', master: 'Mémoire de master', report: 'Rapport', online: 'en ligne',
      accessed: 'Consulté le', viewed: 'Consulté le', available: 'Disponible à l’adresse :', open: '« ', close: ' »', colon: ' :',
      locale: 'fr-FR', titles: { apa: 'Références', mla: 'Ouvrages cités' }, biblio: 'Bibliographie'
    },
    en: {
      and: 'and', amp: '&', etal: 'et al.', nd: 'n.d.', p: 'p.', pp: 'pp.', in: 'In', inIso: 'In:', ed: 'Ed.', eds: 'Eds.', editedBy: 'edited by',
      vol: 'vol.', no: 'no.', edn: 'ed.', thesis: 'Doctoral dissertation', master: 'Master’s thesis', report: 'Report', online: 'online',
      accessed: 'Accessed', viewed: 'viewed', available: 'Available from:', open: '“', close: '”', colon: ':',
      locale: 'en-GB', titles: { apa: 'References', mla: 'Works Cited' }, biblio: 'Bibliography'
    }
  };
  const terms = (lang) => TERMS[lang === 'fr' || !lang ? 'fr' : 'en'];

  const authorsOf = (s, k = 'authors') => (Array.isArray(s[k]) ? s[k] : []).map((a) => String(a).trim()).filter(Boolean);
  const split = (a) => { const [last, ...rest] = a.split(','); return { last: last.trim(), first: rest.join(',').trim() }; };
  // « Jean-Paul Marie » → « J.-P. M. »
  const initials = (first) => first.split(/\s+/).filter(Boolean).map((w) => w.split('-').map((p) => (/^[A-ZÀ-Þ]\.$/i.test(p) ? p : p[0].toUpperCase() + '.')).join('-')).join(' ');
  const firstLast = (a) => { const n = split(a); return n.first ? `${n.first} ${n.last}` : n.last; };

  function joinList(list, t, sep = ', ', last = null, serial = true) {
    if (list.length <= 1) return list.join('');
    const word = last || t.and;
    if (list.length === 2) return `${list[0]} ${word} ${list[1]}`;
    return list.slice(0, -1).join(sep) + (serial && t === TERMS.en ? ',' : '') + ` ${word} ` + list[list.length - 1];
  }

  // Fin de phrase : un point, sauf si la partie finit déjà par . ? ! ou par une adresse web.
  const dot = (x) => { if (!x) return ''; const v = String(x).trim(); return /[.?!…]$/.test(strip(v).replace(/[»”\s ]+$/, '')) || /https?:\/\/\S+$/.test(strip(v)) ? v : v + '.'; };
  const sentence = (...parts) => parts.filter(Boolean).map(dot).join(' ');
  const dash = (p) => esc(String(p || '').replace(/-/g, '–'));
  const doiUrl = (s) => (s.doi ? `https://doi.org/${esc(s.doi)}` : s.url ? esc(s.url) : '');
  const it = (x) => (x ? `<i>${esc(x)}</i>` : '');
  const q = (x, t, inner = '') => (x ? `${t.open}${esc(x)}${t === TERMS.en ? inner : ''}${t.close}${t === TERMS.en ? '' : inner}` : '');
  function dateText(iso, t, abbr) {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00');
    if (isNaN(d)) return esc(iso);
    if (abbr && t === TERMS.en) {
      const mon = d.toLocaleDateString('en-GB', { month: 'short' });
      return `${d.getDate()} ${mon}${mon.length > 3 || mon === 'May' ? '' : '.'} ${d.getFullYear()}`;
    }
    return d.toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const thesisWord = (s, t) => (s.thesis === 'master' ? t.master : t.thesis);
  const year = (s, t, suffix) => (s.year ? esc(String(s.year).trim()) + (suffix || '') : t.nd + (suffix ? '-' + suffix : ''));

  // ----- APA 7ᵉ édition -----

  function apaAuthors(list, t) {
    const names = list.map((a) => { const n = split(a); return n.first ? `${n.last}, ${initials(n.first)}` : n.last; });
    if (names.length > 20) return names.slice(0, 19).join(', ') + ', … ' + names[names.length - 1];
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + `, ${t.amp} ` + names[names.length - 1];
  }
  const apaEditors = (list, t) => { const names = list.map((a) => { const n = split(a); return n.first ? `${initials(n.first)} ${n.last}` : n.last; }); return `${joinList(names, t, ', ', t.amp)} (${names.length > 1 ? t.eds : t.ed})`; };

  function apa(s, t, suffix) {
    const A = authorsOf(s);
    const who = A.length ? esc(apaAuthors(A, t)) + (s.byEditors ? ` (${A.length > 1 ? t.eds : t.ed})` : '') : '';
    const date = `(${year(s, t, suffix)})`;
    const link = doiUrl(s);
    const edn = s.edition ? ` (${esc(s.edition)}${/\D$/.test(s.edition) ? '' : ' ' + t.edn})` : '';
    let title;
    let rest = [];
    if (s.type === 'article') {
      title = esc(s.title);
      const vol = s.volume ? `, <i>${esc(s.volume)}</i>` : '';
      rest = [`${it(s.container)}${vol}${s.issue ? `(${esc(s.issue)})` : ''}${s.pages ? ', ' + dash(s.pages) : ''}`];
    } else if (s.type === 'chapitre' || s.type === 'conference') {
      title = esc(s.title);
      const eds = authorsOf(s, 'editors');
      rest = [`${t.in} ${eds.length ? esc(apaEditors(eds, t)) + ', ' : ''}${it(s.container)}${s.pages ? ` (${t.pp} ${dash(s.pages)})` : ''}`, esc(s.publisher)];
    } else if (s.type === 'these') {
      title = `${it(s.title)} [${thesisWord(s, t)}${s.publisher ? ', ' + esc(s.publisher) : ''}]`;
    } else if (s.type === 'rapport') {
      title = `${it(s.title)}${s.issue ? ` (${t.report} ${t.no} ${esc(s.issue)})` : ''}`;
      rest = [A.length && s.publisher === A[0] ? '' : esc(s.publisher)];
    } else if (s.type === 'web') {
      title = it(s.title);
      rest = [A.length && s.container === A[0] ? '' : esc(s.container)];
    } else {
      title = `${it(s.title)}${edn}`;
      rest = [esc(s.publisher)];
    }
    // Sans auteur : le titre prend sa place.
    const head = who ? [who, date, title] : [title, date];
    return sentence(...head, ...rest) + (link ? ' ' + link : '');
  }

  // ----- Chicago (17ᵉ éd.) : auteur-date et notes -----

  function chicagoAuthors(list, t) {
    const names = list.map((a, i) => { const n = split(a); return !n.first ? n.last : i === 0 ? `${n.last}, ${n.first}` : `${n.first} ${n.last}`; });
    if (names.length > 10) return names.slice(0, 7).join(', ') + ', ' + t.etal;
    return joinList(names, t);
  }
  const pubPlace = (s, t) => [esc(s.place), esc(s.publisher)].filter(Boolean).join(t.colon + ' ');
  const tail = (s) => (s.doi ? `https://doi.org/${esc(s.doi)}` : esc(s.url || ''));

  function chicago(s, t, suffix) {
    const A = authorsOf(s);
    const who = A.length ? esc(chicagoAuthors(A, t)) + (s.byEditors ? `, ${A.length > 1 ? t.eds : t.ed}` : '') : '';
    const y = year(s, t, suffix);
    const eds = authorsOf(s, 'editors').map(firstLast);
    let body;
    if (s.type === 'article') {
      body = [q(s.title, t, '.'), `${it(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? ` (${esc(s.issue)})` : ''}${s.pages ? ': ' + dash(s.pages) : ''}`];
    } else if (s.type === 'chapitre' || s.type === 'conference') {
      body = [q(s.title, t, '.'), `${t.in} ${it(s.container)}${eds.length ? `, ${t.editedBy} ${esc(joinList(eds, t))}` : ''}${s.pages ? ', ' + dash(s.pages) : ''}`, pubPlace(s, t)];
    } else if (s.type === 'these') {
      body = [q(s.title, t, '.'), [thesisWord(s, t), esc(s.publisher)].filter(Boolean).join(', ')];
    } else if (s.type === 'web') {
      body = [q(s.title, t, '.'), esc(s.container), s.accessed ? `${t.accessed} ${dateText(s.accessed, t)}` : ''];
    } else {
      body = [it(s.title), s.edition ? `${esc(s.edition)}${/\D$/.test(s.edition) ? '' : ' ' + t.edn}` : '', s.type === 'rapport' && s.issue ? `${t.report} ${t.no} ${esc(s.issue)}` : '', pubPlace(s, t)];
    }
    const head = who ? [who, y] : [body.shift(), y];
    return sentence(...head, ...body, tail(s));
  }

  // Note complète (première citation) : « Prénom Nom, Titre (Lieu : Éditeur, 2020), 12. »
  function chicagoNote(s, t, page) {
    const A = authorsOf(s).map(firstLast);
    const who = A.length > 3 ? `${A[0]} ${t.etal}` : joinList(A, t);
    const y = s.year ? esc(s.year) : t.nd;
    const pg = page ? ', ' + dash(page) : '';
    const eds = authorsOf(s, 'editors').map(firstLast);
    let body;
    if (s.type === 'article') {
      body = `${q(s.title, t, ',')} ${it(s.container)}${s.volume ? ' ' + esc(s.volume) : ''}${s.issue ? `, ${t.no} ${esc(s.issue)}` : ''} (${y})${page ? ': ' + dash(page) : ''}`;
    } else if (s.type === 'chapitre' || s.type === 'conference') {
      body = `${q(s.title, t, ',')} ${t.in.toLowerCase()} ${it(s.container)}${eds.length ? `, ${t.editedBy} ${esc(joinList(eds, t))}` : ''} (${[pubPlace(s, t), y].filter(Boolean).join(', ')})${pg}`;
    } else if (s.type === 'web') {
      body = `${q(s.title, t, ',')} ${esc(s.container || '')}${s.accessed ? `, ${t.accessed.toLowerCase()} ${dateText(s.accessed, t)}` : ''}${s.url ? ', ' + esc(s.url) : ''}`;
    } else if (s.type === 'these') {
      body = `${q(s.title, t, '')} (${[thesisWord(s, t), esc(s.publisher), y].filter(Boolean).join(', ')})${pg}`;
    } else {
      body = `${it(s.title)} (${[pubPlace(s, t), y].filter(Boolean).join(', ')})${pg}`;
    }
    return dot((who ? esc(who) + ', ' : '') + body.replace(/\s+,/g, ','));
  }

  // ----- ISO 690 (2021) -----

  function isoAuthors(list, t) {
    const names = list.map((a) => { const n = split(a); return n.first ? `${n.last.toUpperCase()}, ${n.first}` : n.last; });
    if (names.length > 3) return `${names[0]} ${t.etal}`;
    return joinList(names, t, ', ', null, false);
  }

  function iso690(s, t, suffix) {
    const A = authorsOf(s);
    const who = A.length ? esc(isoAuthors(A, t)) + (s.byEditors ? ` (${t.ed})` : '') : '';
    const y = year(s, t, suffix);
    const pub = (withYear = true) => [pubPlace(s, t), withYear ? y : ''].filter(Boolean).join(', ');
    const doi = s.doi ? `DOI ${esc(s.doi)}` : '';
    const url = s.url && !s.doi ? `${t.available} ${esc(s.url)}` : '';
    const seen = s.accessed ? `[${t.viewed} ${dateText(s.accessed, t)}]` : '';
    const isbn = s.isbn ? `ISBN ${esc(s.isbn)}` : '';
    const pages = s.pages ? `${t.p} ${esc(s.pages)}` : '';
    let parts;
    if (s.type === 'article') {
      parts = [esc(s.title), it(s.container), [y, s.volume ? `${t.vol} ${esc(s.volume)}` : '', s.issue ? `${t.no} ${esc(s.issue)}` : '', pages].filter(Boolean).join(', '), doi, seen, url];
    } else if (s.type === 'chapitre' || s.type === 'conference') {
      const eds = authorsOf(s, 'editors');
      parts = [esc(s.title), `${t.inIso} ${eds.length ? esc(isoAuthors(eds, t)) + ` (${t.ed}). ` : ''}${it(s.container)}`, [pub(), pages].filter(Boolean).join(', '), isbn, doi, seen, url];
    } else if (s.type === 'web') {
      parts = [`${it(s.title)} [${t.online}]`, [esc(s.container), y].filter(Boolean).join(', '), seen, url];
    } else if (s.type === 'these') {
      parts = [it(s.title), thesisWord(s, t), pub(), url];
    } else {
      parts = [it(s.title), s.edition ? `${esc(s.edition)}${/\D$/.test(s.edition) ? '' : ' ' + t.edn}` : '', pub(), s.type === 'rapport' && s.issue ? `${t.report} ${t.no} ${esc(s.issue)}` : '', isbn, doi, url];
    }
    return who ? sentence(who, ...parts) : sentence(...parts);
  }

  // ----- MLA 9ᵉ édition -----

  function mlaAuthors(list, t) {
    const names = list.map((a, i) => { const n = split(a); return !n.first ? n.last : i === 0 ? `${n.last}, ${n.first}` : `${n.first} ${n.last}`; });
    if (names.length >= 3) return `${names[0]}, ${t.etal}`;
    return names.length === 2 ? `${names[0]}, ${t.and} ${names[1]}` : names[0];
  }

  function mla(s, t) {
    const A = authorsOf(s);
    const who = A.length ? esc(mlaAuthors(A, t)) + (s.byEditors ? `, ${A.length > 1 ? 'editors' : 'editor'}` : '') : '';
    const y = s.year ? esc(s.year) : '';
    const pp = s.pages ? `${/[-–]/.test(s.pages) ? t.pp : t.p} ${dash(s.pages)}` : '';
    const link = s.doi ? `https://doi.org/${esc(s.doi)}` : esc(s.url || '');
    const eds = authorsOf(s, 'editors').map(firstLast);
    let parts;
    if (s.type === 'article') {
      parts = [q(s.title, t, '.'), [it(s.container), s.volume ? `${t.vol} ${esc(s.volume)}` : '', s.issue ? `${t.no} ${esc(s.issue)}` : '', y, pp, link].filter(Boolean).join(', ')];
    } else if (s.type === 'chapitre' || s.type === 'conference') {
      parts = [q(s.title, t, '.'), [it(s.container), eds.length ? `${t.editedBy} ${esc(joinList(eds, t))}` : '', esc(s.publisher), y, pp, link].filter(Boolean).join(', ')];
    } else if (s.type === 'web') {
      parts = [q(s.title, t, '.'), [it(s.container), y, link].filter(Boolean).join(', '), s.accessed ? `${t.accessed} ${dateText(s.accessed, t, true)}` : ''];
    } else if (s.type === 'these') {
      parts = [it(s.title), y, [esc(s.publisher), thesisWord(s, t)].filter(Boolean).join(', ')];
    } else {
      parts = [it(s.title), [s.edition ? `${esc(s.edition)}${/\D$/.test(s.edition) ? '' : ' ' + t.edn}` : '', esc(s.publisher), y, link].filter(Boolean).join(', ')];
    }
    // (MLA : un point après l'adresse web aussi.)
    const end = (x) => (/[.?!…]$/.test(strip(x).replace(/[»”\s\u00a0]+$/, '')) ? x : x + '.');
    return [who, ...parts].filter(Boolean).map((x) => end(String(x).trim())).join(' ');
  }

  // ----- Citations dans le texte -----

  // (Texte simple, sans balises : il est écrit tel quel dans la citation.)
  const lastNames = (s) => authorsOf(s).map((a) => split(a).last);
  function shortWho(s, norm, t) {
    const n = lastNames(s);
    const corporate = !(authorsOf(s)[0] && split(authorsOf(s)[0]).first);
    const up = (x) => (norm === 'iso690' && !corporate ? x.toUpperCase() : x);
    if (!n.length) return s.title ? `${t.open}${s.title}${t.close}` : 'Anonyme';
    if (n.length === 1) return up(n[0]);
    if (n.length === 2) return `${up(n[0])} ${norm === 'apa' ? t.amp : t.and} ${up(n[1])}`;
    if (n.length === 3 && norm === 'chicago') return `${n[0]}, ${n[1]}${t === TERMS.en ? ',' : ''} ${t.and} ${n[2]}`;
    return `${up(n[0])} ${t.etal}`;
  }

  // Une source citée : « Dupont, 2020, p. 12 » (APA), « Dupont 2020, 12 » (Chicago), « Dupont 12 » (MLA)…
  function inText(s, norm, lang, page, suffix) {
    const t = terms(lang);
    const who = shortWho(s, norm, t);
    const y = s.year ? String(s.year).trim() + (suffix || '') : t.nd + (suffix ? '-' + suffix : '');
    const pg = String(page || '').trim();
    const nd = pg.replace(/-/g, '–');
    if (norm === 'mla') return who + (pg ? ' ' + nd : '');
    if (norm === 'chicago') return `${who} ${y}${pg ? ', ' + nd : ''}`;
    const label = /^\d/.test(pg) ? (/[-–]/.test(pg) ? t.pp : t.p) + ' ' : '';
    return `${who}, ${y}${pg ? `, ${label}${norm === 'apa' ? nd : pg}` : ''}`;
  }

  function reference(s, norm, lang, suffix) {
    const t = terms(lang);
    if (norm === 'apa') return apa(s, t, suffix);
    if (norm === 'chicago') return chicago(s, t, suffix);
    if (norm === 'iso690') return iso690(s, t, suffix);
    if (norm === 'mla') return mla(s, t);
    return '';
  }

  // Lettres a, b, c… pour un même auteur la même année (normes auteur-date) : Map id → lettre.
  let memo = { key: null, map: new Map() };
  function suffixes(sources, version, norm) {
    const key = version + '|' + norm;
    if (memo.key === key) return memo.map;
    const map = new Map();
    if (norm !== 'mla') {
      const groups = new Map();
      for (const s of sources) {
        const k = fold(lastNames(s).join(' ') || s.title) + '|' + (s.year || '');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(s);
      }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        list.sort((a, b) => fold(a.title).localeCompare(fold(b.title)));
        list.forEach((s, i) => map.set(s.id, String.fromCharCode(97 + (i % 26))));
      }
    }
    memo = { key, map };
    return map;
  }

  // Ordre alphabétique d'une bibliographie : nom du premier auteur (ou titre), année, lettre.
  function sortKey(s) {
    const n = lastNames(s);
    return fold(n.length ? n.join(' ') : String(s.title || '').replace(/^(the|a|an|le|la|les|l'|un|une)\s+/i, ''));
  }

  window.FTBiblio = {
    NORMS,
    TYPES,
    parse,
    parseBibtex,
    parseRis,
    fromCsl,
    fromZotero,
    sameSource,
    terms,
    reference,
    inText,
    note: (s, norm, lang, page) => (norm === 'chicago' ? chicagoNote(s, terms(lang), page) : null),
    suffixes,
    sortKey,
    title: (norm, lang) => { const t = terms(lang); return t.titles[norm] || t.biblio; }
  };
})();
