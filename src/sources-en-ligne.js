// Remplissage d'une source à partir d'un identifiant ou d'un titre (fenêtre des sources, citations.js).
// Reconnaît : DOI, ISBN, arXiv, PMID, PMCID, HAL, ARK de la BnF et de Gallica, liens (doi.org, arXiv,
// PubMed, HAL, JSTOR, Persée, Cairn, Gallica, catalogue de la BnF, archive.org, Open Library, Google
// Livres, toute page qui donne ses métadonnées) ; sinon, le texte est cherché comme titre et auteur dans
// Crossref, le catalogue de la BnF et Open Library (vieux ouvrages et articles sans identifiant).
// Les bases interrogées sont publiques et sans clé. Les notices sont rendues au format CSL JSON
// (lu par FTBiblio.fromCsl), avec « base » : nom de la base qui a répondu.
// lookup(texte) → { ok, kind, items, search? } ou { ok: false, offline | notFound | bad }.

const UA = 'TomatoesText (logiciel de rédaction)';
let fetchFn = (...a) => fetch(...a);

class Offline extends Error {}

async function get(url, { accept, json, timeout = 12000, max = 3 * 1024 * 1024, browser, report } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { 'User-Agent': browser ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' + UA : UA, 'Accept-Language': 'fr,en;q=0.8' };
    if (accept) headers.Accept = accept;
    let res;
    try {
      res = await fetchFn(url, { signal: ctrl.signal, headers, redirect: 'follow' });
    } catch (e) {
      // Pas de réseau (ou délai dépassé) : distingué de « rien trouvé ».
      throw new Offline(String(e && e.message));
    }
    if (!res.ok) return report ? { status: res.status } : null;
    const text = await res.text();
    const body = text.length > max ? text.slice(0, max) : text;
    if (!json) return { text: body, url: res.url || url, type: res.headers.get('content-type') || '' };
    try { return JSON.parse(body); } catch { return null; }
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Petits outils ----------

// Ne garde que les champs CSL lus par la bibliographie (les notices de Crossref en ont des dizaines).
const KEEP = ['type', 'title', 'author', 'editor', 'container-title', 'event-title', 'publisher', 'publisher-place', 'event-place', 'volume', 'issue', 'number', 'page', 'edition', 'genre', 'issued', 'DOI', 'ISBN', 'URL', 'accessed', 'base'];
function slim(x) {
  const out = {};
  for (const k of KEEP) {
    let v = x[k];
    if (k === 'ISBN' || k === 'publisher-place') v = first(v);
    if (k === 'author' || k === 'editor') v = Array.isArray(v) ? v.map((a) => (a.literal ? { literal: a.literal } : { family: a.family, given: a.given })).filter((a) => a.family || a.literal) : undefined;
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = v;
  }
  return out;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', icirc: 'î', iuml: 'ï', euml: 'ë', ugrave: 'ù', oelig: 'œ', Eacute: 'É' };
const decode = (s) => String(s == null ? '' : s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => (n in ENT ? ENT[n] : m));
const text = (s) => decode(String(s == null ? '' : s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const first = (v) => (Array.isArray(v) ? v[0] : v);
const yearOf = (s) => { const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})\b/); return m ? +m[1] : null; };
const issued = (s) => {
  const m = String(s || '').match(/\b(1[0-9]{3}|20[0-9]{2})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);
  return m ? { 'date-parts': [[+m[1], ...(m[2] ? [+m[2]] : []), ...(m[2] && m[3] ? [+m[3]] : [])]] } : undefined;
};
const today = () => { const d = new Date(); return { 'date-parts': [[d.getFullYear(), d.getMonth() + 1, d.getDate()]] }; };

// « Victor Hugo » → { family: 'Hugo', given: 'Victor' } ; « Hugo, Victor » gardé ; organisme : literal.
const PARTICLES = /^(de|du|des|da|di|del|della|van|von|der|den|le|la|ten|ter|d’|d')$/i;
function person(raw) {
  let s = text(raw).replace(/\s*\((?:\d{3,4}\??|[^)]*\d{4}[^)]*)\)\s*/g, ' ').replace(/[.,;]?\s*(Auteur|Éditeur|Editeur|Traducteur|Illustrateur|Préfacier|Directeur)\b.*$/i, '').replace(/\s+/g, ' ').trim();
  s = s.replace(/,?\s*(?:\d{3,4}\??\s*-\s*(?:\d{3,4}\??)?|\d{4}|b\.\s*\d{4}|d\.\s*\d{4}|né en \d{4})\s*$/i, '').replace(/[.,;:]+$/, '').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    const given = rest.join(',').trim();
    return given ? { family: family.trim(), given } : { literal: family.trim() };
  }
  const words = s.split(' ');
  if (words.length === 1) return { literal: s };
  let i = words.length - 1;
  while (i > 1 && PARTICLES.test(words[i - 1])) i--;
  return { family: words.slice(i).join(' '), given: words.slice(0, i).join(' ') };
}
const people = (list) => (list || []).map(person).filter(Boolean);

// ---------- Reconnaissance de l'identifiant ----------

function isbnOk(d) {
  if (d.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (d[i] === 'X' ? 10 : +d[i]) * (10 - i);
    return sum % 11 === 0;
  }
  if (d.length === 13 && /^97[89]/.test(d)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += +d[i] * (i % 2 ? 3 : 1);
    return sum % 10 === 0;
  }
  return false;
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>]+)/;
const cleanDoi = (d) => decodeURIComponent(d).replace(/[.,;)\]]+$/, '').replace(/\/(abstract|full|pdf|epdf)$/i, '');

function detect(raw) {
  const s = String(raw || '').trim().replace(/^<|>$/g, '');
  if (!s) return null;
  let m;
  if (/^https?:\/\//i.test(s) || /^(www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(s)) {
    const url = /^https?:/i.test(s) ? s : 'https://' + s;
    let u;
    try { u = new URL(url); } catch { return { kind: 'search', value: s }; }
    const host = u.hostname.replace(/^www\./, '');
    const p = decodeURIComponent(u.pathname);
    if (/(^|\.)doi\.org$/.test(host) && (m = p.match(/^\/(10\..+)/))) return { kind: 'doi', value: cleanDoi(m[1]) };
    if (/arxiv\.org$/.test(host) && (m = p.match(/\/(?:abs|pdf|html)\/(.+?)(?:v\d+)?(?:\.pdf)?$/))) return { kind: 'arxiv', value: m[1] };
    if (/pubmed\.ncbi\.nlm\.nih\.gov$/.test(host) && (m = p.match(/^\/(\d+)/))) return { kind: 'pmid', value: m[1] };
    if (/ncbi\.nlm\.nih\.gov$/.test(host) && (m = p.match(/(PMC\d+)/i))) return { kind: 'pmcid', value: m[1].toUpperCase() };
    if (/(hal\.science|archives-ouvertes\.fr)$/.test(host) && (m = p.match(/^\/([a-z0-9]+-\d{6,}(?:v\d+)?)/i))) return { kind: 'hal', value: m[1] };
    if (/jstor\.org$/.test(host) && (m = p.match(/\/stable\/(?:pdf\/)?(\d+)/))) return { kind: 'doi', value: '10.2307/' + m[1], url };
    if (/gallica\.bnf\.fr$/.test(host) && (m = p.match(/ark:\/12148\/([a-z0-9]+)/i))) return { kind: 'gallica', value: m[1], url };
    if (/bnf\.fr$/.test(host) && (m = p.match(/ark:\/12148\/(cb[0-9a-z]+)/i))) return { kind: 'bnf', value: m[1] };
    if (/archive\.org$/.test(host) && (m = p.match(/^\/details\/([^/]+)/))) return { kind: 'archive', value: m[1] };
    if (/openlibrary\.org$/.test(host) && (m = p.match(/^\/(books|works)\/(OL\d+[MW])/))) return { kind: 'openlibrary', value: `${m[1]}/${m[2]}` };
    if (/^books\.google\./.test(host) && u.searchParams.get('id')) return { kind: 'gbooks', value: u.searchParams.get('id') };
    if (/google\.[a-z.]+$/.test(host) && (m = p.match(/^\/books\/edition\/[^/]*\/([A-Za-z0-9_-]{12})/))) return { kind: 'gbooks', value: m[1] };
    if ((m = (p + u.search).match(DOI_RE)) && !/persee|cairn/.test(host)) return { kind: 'doi', value: cleanDoi(m[1]), url };
    return { kind: 'url', value: url };
  }
  if ((m = s.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i))) return { kind: 'doi', value: cleanDoi(m[1]) };
  if ((m = s.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i))) return { kind: 'arxiv', value: m[1] };
  if ((m = s.match(/^pmid:?\s*(\d{1,9})$/i))) return { kind: 'pmid', value: m[1] };
  if ((m = s.match(/^(?:pmcid:?\s*)?(PMC\d+)$/i))) return { kind: 'pmcid', value: m[1].toUpperCase() };
  if ((m = s.match(/^ark:\/12148\/([a-z0-9]+)/i))) return { kind: /^cb/.test(m[1]) ? 'bnf' : 'gallica', value: m[1] };
  if ((m = s.match(/^((?:hal|halshs|tel|inria|cea|in2p3|ird|inserm|dumas|hceres|pasteur|ineris|meteo|mem|cel|medihal|sic|edutice|ijn|jpa|lirmm|insu|emse|pastel|ensl|obspm|ujm|cirad|anses|irsn|univ|hprints)-\d{6,}(?:v\d+)?)$/i))) return { kind: 'hal', value: m[1] };
  const digits = s.replace(/^isbn(?:-1[03])?:?\s*/i, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$|^\d{13}$/.test(digits) && isbnOk(digits)) return { kind: 'isbn', value: digits };
  if (/^isbn/i.test(s)) return { kind: 'bad', value: s };
  if (/^\d{1,8}$/.test(s)) return { kind: 'pmid', value: s };
  if (s.replace(/[^\p{L}\p{N}]/gu, '').length < 3) return { kind: 'bad', value: s };
  return { kind: 'search', value: s };
}

// ---------- Bases ----------

// DOI : négociation de contenu de doi.org (Crossref, DataCite, mEDRA, JaLC), en CSL JSON.
async function byDoi(doi) {
  const csl = await get('https://doi.org/' + encodeURI(doi), { accept: 'application/vnd.citationstyles.csl+json', json: true });
  if (!csl || !csl.title) return null;
  const out = slim({ ...csl, title: text(first(csl.title)), 'container-title': text(first(csl['container-title'])), DOI: csl.DOI || doi });
  if (CR_TYPES[out.type]) out.type = CR_TYPES[out.type];
  if (/^10\.48550\//i.test(out.DOI) || out.publisher === 'arXiv') { out.type = 'article'; out['container-title'] = 'arXiv'; out.DOI = out.DOI.replace(/arxiv/i, 'arXiv'); }
  // L'adresse donnée n'est que celle du DOI : inutile à côté du DOI.
  if (/doi\.org\//i.test(out.URL || '')) delete out.URL;
  out.base = /crossref/i.test(String(csl.source)) ? 'Crossref' : 'DataCite';
  return out;
}

async function byPubmed(id, pmc) {
  const csl = await get(`https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/${pmc ? 'pmc' : 'pubmed'}/?format=csl&id=${encodeURIComponent(id)}`, { json: true });
  if (!csl || !csl.title) return null;
  delete csl.accessed;
  return { ...csl, base: 'PubMed' };
}

async function byHal(id) {
  const r = await get(`https://api.archives-ouvertes.fr/search/?q=halId_s:${encodeURIComponent(id.replace(/v\d+$/, ''))}&wt=bibtex`);
  return r && /@\w+\s*\{/.test(r.text) ? { bibtex: r.text, base: 'HAL' } : null;
}

// ----- ISBN : Open Library, Google Livres, catalogue de la BnF -----

function fromOpenLibrary(b, isbn) {
  if (!b || !b.title) return null;
  return {
    type: 'book',
    title: b.subtitle ? `${b.title} : ${b.subtitle}` : b.title,
    author: people((b.authors || []).map((a) => a.name)),
    publisher: (b.publishers || []).map((p) => p.name || p)[0],
    'publisher-place': (b.publish_places || []).map((p) => p.name || p)[0],
    issued: issued(b.publish_date),
    ISBN: isbn,
    edition: b.edition_name,
    base: 'Open Library'
  };
}
async function isbnOpenLibrary(isbn) {
  const r = await get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { json: true });
  return r && fromOpenLibrary(r['ISBN:' + isbn], isbn);
}
function fromGoogle(v, isbn) {
  const i = v && v.volumeInfo;
  if (!i || !i.title) return null;
  const ids = i.industryIdentifiers || [];
  return {
    type: 'book',
    title: i.subtitle ? `${i.title} : ${i.subtitle}` : i.title,
    author: people(i.authors),
    publisher: i.publisher,
    issued: issued(i.publishedDate),
    ISBN: isbn || (ids.find((x) => x.type === 'ISBN_13') || ids[0] || {}).identifier,
    base: 'Google Livres'
  };
}
async function isbnGoogle(isbn) {
  const r = await get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, { json: true });
  return r && r.items ? fromGoogle(r.items[0], isbn) : null;
}

// ----- Catalogue de la BnF (SRU, notices UNIMARC) : livres français, éditions anciennes -----

function marcFields(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(?:mxc:)?datafield tag="(\d{3})"[^>]*>([\s\S]*?)<\/(?:mxc:)?datafield>/g)) {
    const subs = [...m[2].matchAll(/<(?:mxc:)?subfield code="(.)">([\s\S]*?)<\/(?:mxc:)?subfield>/g)].map((s) => [s[1], decode(s[2]).trim()]);
    out.push({ tag: m[1], subs, get: (c) => (subs.find((s) => s[0] === c) || [])[1] || '' });
  }
  return out;
}
const ISBD = (s) => String(s || '').replace(/\s*[/:;,=.]\s*$/, '').replace(/^\[|\]$/g, '').trim();
function fromUnimarc(xml) {
  const f = marcFields(xml);
  const one = (tag) => f.find((x) => x.tag === tag);
  const t = one('200');
  if (!t || !t.get('a')) return null;
  const roles = (x) => x.subs.filter((s) => s[0] === '4').map((s) => s[1].replace(/^0+/, ''));
  const name = (x) => {
    const a = x.get('a').split(';')[0];
    const b = x.get('b');
    return b ? { family: ISBD(a), given: ISBD(b) } : person(a);
  };
  const author = [];
  const editor = [];
  for (const x of f) {
    if (['700', '701', '702'].includes(x.tag)) {
      const r = roles(x);
      const p = name(x);
      if (!p) continue;
      if (r.some((c) => ['340', '651', '650'].includes(c))) editor.push(p);
      else if (x.tag !== '702' && (!r.length || r.some((c) => ['70', '72', '440'].includes(c)))) author.push(p);
    } else if (['710', '711'].includes(x.tag) && x.get('a')) author.push({ literal: ISBD(x.get('a')) });
  }
  const pub = one('214') || one('210');
  const ctl = (xml.match(/<(?:mxc:)?controlfield tag="003">([^<]+)</) || [])[1] || '';
  const sub = t.get('e');
  const date = pub && (pub.get('d') || pub.get('c'));
  const coded = (one('100') && one('100').get('a').slice(9, 13)) || '';
  return {
    type: 'book',
    title: ISBD(t.get('a')) + (sub ? ' : ' + ISBD(sub) : ''),
    author,
    editor,
    publisher: pub ? ISBD(pub.get('c').replace(/,?\s*\[?\d{4}.*$/, '')) : '',
    'publisher-place': pub ? ISBD(pub.get('a')) : '',
    issued: issued(yearOf(date) || (/^\d{4}$/.test(coded) ? coded : '')),
    edition: one('205') ? ISBD(one('205').get('a')) : '',
    ISBN: one('010') ? one('010').get('a').replace(/[^\dX-]/gi, '') : '',
    URL: ctl ? 'https://catalogue.bnf.fr/' + ctl.replace(/^https?:\/\/catalogue\.bnf\.fr\//, '') : '',
    base: 'BnF'
  };
}
async function bnf(query, max = 1) {
  const r = await get(`https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=unimarcXchange&maximumRecords=${max}&query=${encodeURIComponent(query)}`, { timeout: 15000 });
  if (!r) return [];
  return [...r.text.matchAll(/<srw:recordData>([\s\S]*?)<\/srw:recordData>/g)].map((m) => fromUnimarc(m[1])).filter(Boolean);
}
function isbn10(d) {
  if (d.length !== 13 || !d.startsWith('978')) return '';
  const core = d.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += +core[i] * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}
// La BnF garde l'ISBN tel qu'imprimé (souvent à 10 chiffres pour les livres anciens) : les deux formes.
const isbnBnf = async (isbn) => (await bnf([isbn, isbn10(isbn)].filter(Boolean).map((x) => `bib.isbn all "${x}"`).join(' or ')))[0] || null;

async function byIsbn(isbn) {
  // Les livres français (978-2, 979-1) sont mieux décrits par la BnF.
  const french = (isbn.length === 10 && isbn[0] === '2') || /^9782|^9791/.test(isbn);
  const order = french ? [isbnBnf, isbnOpenLibrary, isbnGoogle] : [isbnOpenLibrary, isbnGoogle, isbnBnf];
  let offline = 0;
  for (const fn of order) {
    try {
      const r = await fn(isbn);
      if (r) return { ...r, ISBN: r.ISBN || isbn };
    } catch (e) {
      if (!(e instanceof Offline)) throw e;
      offline++;
    }
  }
  if (offline === order.length) throw new Offline('');
  return null;
}

// ----- Notices Dublin Core (Gallica) -----

function dcValues(xml, tag) {
  return [...xml.matchAll(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'g'))].map((m) => text(m[1])).filter(Boolean);
}
function fromDublinCore(xml, url, base) {
  const title = dcValues(xml, 'title')[0];
  if (!title) return null;
  const pub = dcValues(xml, 'publisher')[0] || '';
  const pm = pub.match(/^(.*?)\s*\(([^)]+)\)\s*$/); // BnF : « Éditeur (Lieu) »
  const types = dcValues(xml, 'type').join(' ');
  return {
    type: /fascicule|périodique|article/i.test(types) ? 'article-journal' : 'book',
    title: title.replace(/\s*\/\s*[^/]*$/, (m) => (m.length < title.length / 1.5 ? '' : m)).replace(/\s*\[Texte imprimé\]\s*/i, ' ').trim(),
    author: people(dcValues(xml, 'creator')),
    publisher: pm ? pm[1] : pub,
    'publisher-place': pm ? pm[2] : '',
    issued: issued(dcValues(xml, 'date')[0]),
    URL: url,
    base
  };
}
async function byGallica(ark, url) {
  const r = await get(`https://gallica.bnf.fr/services/OAIRecord?ark=${encodeURIComponent(ark)}`, { timeout: 15000 });
  return r ? fromDublinCore(r.text, url || `https://gallica.bnf.fr/ark:/12148/${ark}`, 'Gallica') : null;
}
const byBnfArk = async (ark) => (await bnf(`bib.persistentid any "ark:/12148/${ark}"`))[0] || null;

async function byArchive(id) {
  const r = await get(`https://archive.org/metadata/${encodeURIComponent(id)}/metadata`, { json: true });
  const m = r && r.result;
  if (!m || !m.title) return null;
  const pub = String(first(m.publisher) || '');
  const pm = pub.match(/^([^:]+?)\s*:\s*(.+)$/); // « Paris : Hachette »
  return {
    type: m.mediatype === 'texts' ? 'book' : 'webpage',
    title: first(m.title),
    author: people([].concat(m.creator || [])),
    publisher: pm ? pm[2] : pub,
    'publisher-place': pm ? pm[1] : '',
    issued: issued(first(m.date) || first(m.year)),
    URL: 'https://archive.org/details/' + id,
    base: 'Internet Archive'
  };
}

async function byOpenLibraryKey(key) {
  const r = await get(`https://openlibrary.org/${key}.json`, { json: true });
  if (!r || !r.title) return null;
  const names = [];
  for (const a of (r.authors || []).slice(0, 10)) {
    const k = (a.author && a.author.key) || a.key;
    if (!k) continue;
    const who = await get(`https://openlibrary.org${k}.json`, { json: true }).catch(() => null);
    if (who && who.name) names.push(who.name);
  }
  return {
    type: 'book',
    title: r.subtitle ? `${r.title} : ${r.subtitle}` : r.title,
    author: people(names),
    publisher: first(r.publishers),
    'publisher-place': first(r.publish_places),
    issued: issued(r.publish_date || r.first_publish_date),
    ISBN: first(r.isbn_13) || first(r.isbn_10),
    URL: `https://openlibrary.org/${key}`,
    base: 'Open Library'
  };
}

async function byGoogleId(id) {
  const r = await get(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`, { json: true });
  return r ? fromGoogle(r) : null;
}

// ----- Page web : métadonnées de la page (citation_*, Dublin Core, JSON-LD, Open Graph) -----

function metas(html) {
  const out = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/\b(?:name|property|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (!key || val == null) continue;
    const k = key.toLowerCase();
    const scheme = (tag.match(/\bscheme\s*=\s*["']([^"']+)["']/i) || [])[1];
    (out[k] = out[k] || []).push({ v: text(val), scheme });
  }
  return out;
}
function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (x) => {
        if (Array.isArray(x)) return x.forEach(walk);
        if (!x || typeof x !== 'object') return;
        if (x['@graph']) walk(x['@graph']);
        if (x['@type']) out.push(x);
      };
      walk(JSON.parse(m[1].trim()));
    } catch { /* JSON-LD illisible : ignoré */ }
  }
  return out;
}
const ldName = (x) => (typeof x === 'string' ? x : x && (x.name || [x.givenName, x.familyName].filter(Boolean).join(' ')));
// Auteur JSON-LD : un organisme reste entier (« Insee »), une personne est découpée.
const ldPerson = (x) => (x && typeof x === 'object' && /Organization/.test([].concat(x['@type']).join(' ')) && x.name ? { literal: text(x.name) } : person(ldName(x)));

function fromPage(html, url) {
  const M = metas(html);
  const one = (...keys) => { for (const k of keys) if (M[k] && M[k][0].v) return M[k][0].v; return ''; };
  const all = (...keys) => { for (const k of keys) if (M[k]) return M[k].map((x) => x.v).filter(Boolean); return []; };
  const doi = one('citation_doi', 'prism.doi', 'bepress_citation_doi', 'dc.identifier.doi') || ((M['dc.identifier'] || []).find((x) => /doi/i.test(x.scheme || '') || /^10\.\d{4,}\//.test(x.v)) || {}).v || '';
  const ld = jsonLd(html);
  const TYPES = /^(ScholarlyArticle|Article|NewsArticle|BlogPosting|Report|Book|Chapter|Thesis|WebPage|AnalysisNewsArticle|ReportageNewsArticle|TechArticle)$/;
  const main = ld.find((x) => [].concat(x['@type']).some((t) => TYPES.test(t) && t !== 'WebPage')) || ld.find((x) => [].concat(x['@type']).includes('WebPage')) || {};
  const ldType = [].concat(main['@type'] || [])[0] || '';
  const title = one('citation_title', 'dc.title', 'eprints.title') || text(main.name || main.headline || '') || one('og:title', 'twitter:title') || text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  if (!title) return null;
  let author = people(all('citation_author', 'dc.creator', 'eprints.creators_name', 'author', 'article:author').filter((a) => !/^https?:/.test(a)));
  if (!author.length && main.author) author = [].concat(main.author).map(ldPerson).filter(Boolean);
  const journal = one('citation_journal_title', 'prism.publicationname');
  const book = one('citation_book_title', 'citation_inbook_title');
  const conf = one('citation_conference_title');
  const thesis = one('citation_dissertation_institution');
  const report = one('citation_technical_report_institution');
  const isbn = one('citation_isbn');
  const host = new URL(url).hostname.replace(/^www\./, '');
  const site = one('og:site_name') || text(ldName(main.publisher) || '') || host;
  let type = 'webpage';
  if (journal) type = 'article-journal';
  else if (book) type = 'chapter';
  else if (conf) type = 'paper-conference';
  else if (thesis) type = 'thesis';
  else if (report) type = 'report';
  else if (isbn || /^Book$/.test(ldType)) type = 'book';
  else if (/NewsArticle/.test(ldType) || one('og:type') === 'article') type = 'article-newspaper';
  const fp = one('citation_firstpage');
  const lp = one('citation_lastpage');
  const date = one('citation_publication_date', 'citation_date', 'citation_online_date', 'citation_year', 'dc.date', 'prism.publicationdate', 'article:published_time', 'date') || main.datePublished || '';
  // « Titre | Insee », « Titre - Le Monde » : le nom du site est retiré du titre.
  const tail = title.match(/\s+[|–—-]\s+([^|–—-]{2,60})$/);
  const siteKey = fold(site + ' ' + host);
  const shortTitle = tail && (siteKey.includes(fold(tail[1])) || fold(tail[1]).includes(fold(site))) ? title.slice(0, tail.index) : title;
  const out = {
    type,
    title: shortTitle,
    author,
    issued: issued(date),
    URL: url,
    base: 'page web'
  };
  if (type === 'webpage' || type === 'article-newspaper') { out['container-title'] = site; out.accessed = today(); }
  if (journal || book || conf) out['container-title'] = journal || book || conf;
  if (type === 'thesis' || type === 'report') out.publisher = thesis || report;
  else if (type !== 'webpage' && type !== 'article-newspaper') out.publisher = one('citation_publisher', 'dc.publisher') || '';
  out.volume = one('citation_volume', 'prism.volume');
  out.issue = one('citation_issue', 'prism.number');
  if (fp) out.page = lp && lp !== fp ? `${fp}-${lp}` : fp;
  if (isbn) out.ISBN = isbn;
  if (doi) out.DOI = cleanDoi(doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, ''));
  return out;
}
async function byUrl(url) {
  const r = await get(url, { browser: true, accept: 'text/html,application/xhtml+xml', timeout: 15000, report: true });
  if (r.status) return [401, 402, 403, 429, 451].includes(r.status) ? { blocked: true } : null;
  if (/pdf/i.test(r.type) || r.text.startsWith('%PDF')) return { type: 'webpage', title: decodeURIComponent(url.split('/').pop().replace(/\.pdf$/i, '')), URL: url, accessed: today(), base: 'page web' };
  const page = fromPage(r.text, r.url || url);
  if (page && page.DOI) {
    // La page donne son DOI : la notice du DOI est plus complète, l'adresse de la page est gardée.
    const d = await byDoi(page.DOI).catch(() => null);
    if (d) return { ...d, URL: d.URL && !/doi\.org/.test(d.URL) ? d.URL : url };
  }
  return page;
}

// ---------- Recherche par titre et auteur (ouvrages et articles sans identifiant) ----------

const CR_TYPES = { 'journal-article': 'article-journal', 'book-chapter': 'chapter', 'book-section': 'chapter', 'book-part': 'chapter', 'proceedings-article': 'paper-conference', dissertation: 'thesis', report: 'report', monograph: 'book', 'edited-book': 'book', book: 'book', 'reference-entry': 'entry-encyclopedia', 'posted-content': 'article' };
function fromCrossref(x) {
  const title = text(first(x.title));
  if (!title) return null;
  const date = (x.issued && x.issued['date-parts'] && x.issued['date-parts'][0]) || [];
  return {
    type: CR_TYPES[x.type] || 'article',
    title: x.subtitle && x.subtitle[0] ? `${title} : ${text(x.subtitle[0])}` : title,
    author: (x.author || []).map((a) => (a.family ? { family: a.family, given: a.given } : { literal: a.name })).filter((a) => a.family || a.literal),
    editor: (x.editor || []).map((a) => ({ family: a.family, given: a.given })).filter((a) => a.family),
    'container-title': text(first(x['container-title'])),
    publisher: x.publisher,
    volume: x.volume,
    issue: x.issue,
    page: x.page,
    issued: date[0] ? { 'date-parts': [date] } : undefined,
    ISBN: first(x.ISBN),
    DOI: x.DOI,
    base: 'Crossref'
  };
}
async function searchCrossref(q) {
  const r = await get(`https://api.crossref.org/works?rows=6&query.bibliographic=${encodeURIComponent(q)}&select=DOI,title,subtitle,author,editor,issued,type,container-title,publisher,volume,issue,page,ISBN`, { json: true, timeout: 15000 });
  return r && r.message ? r.message.items.map(fromCrossref).filter(Boolean) : [];
}
async function searchOpenLibrary(q) {
  const r = await get(`https://openlibrary.org/search.json?limit=6&q=${encodeURIComponent(q)}&fields=key,title,subtitle,author_name,first_publish_year,publisher,publish_place,isbn`, { json: true, timeout: 15000 });
  return r && r.docs ? r.docs.filter((d) => d.title).map((d) => ({
    type: 'book',
    title: d.subtitle ? `${d.title} : ${d.subtitle}` : d.title,
    author: people(d.author_name),
    publisher: first(d.publisher),
    'publisher-place': first(d.publish_place),
    issued: d.first_publish_year ? { 'date-parts': [[d.first_publish_year]] } : undefined,
    URL: 'https://openlibrary.org' + d.key,
    base: 'Open Library'
  })) : [];
}
async function searchBnf(q) {
  const words = q.replace(/["\\]/g, ' ').trim();
  return bnf(`bib.anywhere all "${words}"`, 6);
}

// Un résultat par base à tour de rôle, sans doublon (même titre, même année).
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function search(q) {
  const runs = await Promise.allSettled([searchCrossref(q), searchBnf(q), searchOpenLibrary(q)]);
  if (runs.every((r) => r.status === 'rejected')) throw new Offline('');
  const lists = runs.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const seen = new Set();
  const out = [];
  for (let i = 0; i < 6; i++) {
    for (const list of lists) {
      const x = list[i];
      if (!x) continue;
      const key = fold(x.title) + '|' + (x.issued ? x.issued['date-parts'][0][0] : '');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
    }
  }
  return out.slice(0, 15);
}

// ---------- Entrée ----------

async function lookup(input) {
  const id = detect(input);
  if (!id || id.kind === 'bad') return { ok: false, bad: true };
  try {
    if (id.kind === 'search') {
      const items = await search(id.value);
      return items.length ? { ok: true, kind: 'search', search: true, items: items.map(slim) } : { ok: false, kind: 'search', notFound: true };
    }
    let item = null;
    switch (id.kind) {
      case 'doi': item = await byDoi(id.value); if (item && id.url && !item.URL) item.URL = id.url; break;
      case 'arxiv': item = await byDoi('10.48550/arXiv.' + id.value); if (item && !item.URL) item.URL = 'https://arxiv.org/abs/' + id.value; break;
      case 'pmid': item = await byPubmed(id.value); break;
      case 'pmcid': item = await byPubmed(id.value, true); break;
      case 'hal': item = await byHal(id.value); break;
      case 'isbn': item = await byIsbn(id.value); break;
      case 'gallica': item = await byGallica(id.value, id.url); break;
      case 'bnf': item = await byBnfArk(id.value); break;
      case 'archive': item = await byArchive(id.value); break;
      case 'openlibrary': item = await byOpenLibraryKey(id.value); break;
      case 'gbooks': item = await byGoogleId(id.value); break;
      case 'url': item = await byUrl(id.value); break;
    }
    if (!item) return { ok: false, kind: id.kind, notFound: true };
    if (item.blocked) return { ok: false, kind: id.kind, blocked: true };
    return { ok: true, kind: id.kind, items: [item.bibtex ? item : slim(item)] };
  } catch (e) {
    if (e instanceof Offline) return { ok: false, kind: id.kind, offline: true };
    return { ok: false, kind: id.kind, notFound: true };
  }
}

function registerSourcesEnLigne(ipcMain) {
  ipcMain.handle('sources:lookup', (_e, input) => lookup(String(input || '').slice(0, 2000)));
}

module.exports = { registerSourcesEnLigne, lookup, detect, fromUnimarc, fromPage, _setFetch: (fn) => { fetchFn = fn; } };
