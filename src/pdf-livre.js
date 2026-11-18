// Export livre (main.js) : travail sur les PDF de Chromium, lus par pdf-merge.js (objets simples, table
// xref classique, longueurs des flux en clair).
// - destPages : page où se trouve chaque cible de lien du document (/Dests) ; sert à numéroter le
//   sommaire, les renvois, l'index et à placer les chapitres en page de droite.
// - assemble : un PDF fait des pages de plusieurs impressions du même texte (mêmes pages), page par page.
// - impose : pages posées sur des feuilles, comme un objet dessiné (Form XObject) : livret à plier (deux
//   pages par face, dans l'ordre d'un cahier piqué) ou page seule avec traits de coupe.
const zlib = require('zlib');
const { parse } = require('./pdf-merge');

const MM = 72 / 25.4;

// Valeur d'une clé dans un dictionnaire PDF : texte brut (dictionnaire, tableau ou jeton).
function valueOf(head, key) {
  const re = new RegExp('/' + key + '(?=[\\s/<\\[(])');
  const m = re.exec(head);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (/\s/.test(head[i])) i++;
  const open = head.startsWith('<<', i) ? '<<' : head[i] === '[' ? '[' : null;
  if (!open) {
    const ref = /^(\d+) (\d+) R/.exec(head.slice(i));
    if (ref) return ref[0];
    const tok = /^[^\s/<>[\]()]*(\/[^\s/<>[\]()]*)?/.exec(head.slice(i));
    return tok[0] || null;
  }
  let depth = 0;
  for (let k = i; k < head.length; k++) {
    const c = head[k];
    if (c === '(') {
      // Chaîne : parenthèses équilibrées, échappements.
      let d = 0;
      for (; k < head.length; k++) {
        if (head[k] === '\\') { k++; continue; }
        if (head[k] === '(') d++;
        else if (head[k] === ')' && !--d) break;
      }
      continue;
    }
    if (head.startsWith('<<', k)) { depth++; k++; continue; }
    if (head.startsWith('>>', k)) { depth--; k++; if (!depth && open === '<<') return head.slice(i, k + 1); continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth && open === '[') return head.slice(i, k + 1); }
  }
  return null;
}
const refOf = (text) => { const m = /^(\d+) \d+ R$/.exec(String(text || '').trim()); return m ? Number(m[1]) : null; };
const numbers = (text) => (String(text || '').match(/-?\d+(\.\d+)?/g) || []).map(Number);

// Les pages d'un PDF lu, dans l'ordre : { num, head, box: [x0, y0, x1, y1] }.
function pagesOf(doc) {
  const out = [];
  const walk = (num, inherited) => {
    const o = doc.objs.get(num);
    if (!o) return;
    const box = valueOf(o.head, 'MediaBox') || inherited;
    if (/\/Type\s*\/Pages\b/.test(o.head)) {
      for (const k of (valueOf(o.head, 'Kids') || '').matchAll(/(\d+) \d+ R/g)) walk(Number(k[1]), box);
    } else out.push({ num, head: o.head, box: numbers(box) });
  };
  walk(doc.pages, null);
  return out;
}

// Cibles des liens : nom -> numéro de page (à partir de 0).
function destPages(buf) {
  const doc = parse(buf);
  const pages = pagesOf(doc);
  const index = new Map(pages.map((p, i) => [p.num, i]));
  const cat = doc.objs.get(doc.root).head;
  let dests = valueOf(cat, 'Dests');
  if (!dests) return {};
  const r = refOf(dests);
  if (r !== null) dests = doc.objs.get(r).head;
  const out = {};
  for (const m of dests.matchAll(/\/([^\s/<>[\]()]+)\s*\[\s*(\d+) \d+ R/g)) {
    const name = m[1].replace(/#([0-9a-fA-F]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16)));
    if (index.has(Number(m[2]))) out[name] = index.get(Number(m[2]));
  }
  return out;
}

// Nouveau PDF : les objets sont recopiés depuis les PDF lus (renumérotés à la demande).
class Writer {
  constructor() {
    this.objs = new Map();
    this.next = 1;
    this.maps = new Map(); // doc -> Map(ancien numéro -> nouveau)
  }
  reserve() { return this.next++; }
  set(num, head, data = null) { this.objs.set(num, { head, data }); return num; }
  add(head, data = null) { return this.set(this.reserve(), head, data); }
  // Texte (dictionnaire, tableau) d'un PDF lu : ses références recopiées.
  refs(doc, text) {
    return text.replace(/(\d+) (\d+) R/g, (_m, n) => `${this.copy(doc, Number(n))} 0 R`);
  }
  copy(doc, num) {
    let map = this.maps.get(doc);
    if (!map) this.maps.set(doc, (map = new Map()));
    if (map.has(num)) return map.get(num);
    const fresh = this.reserve();
    map.set(num, fresh);
    const o = doc.objs.get(num);
    if (!o) { this.set(fresh, 'null'); return fresh; }
    // (Jamais le parent d'une page : l'arbre des pages est refait.)
    const head = o.head.replace(/\/Parent \d+ \d+ R/g, '');
    this.set(fresh, this.refs(doc, head), o.data);
    return fresh;
  }
  // Page d'un PDF lu, dessinée comme un objet : contenu et ressources de la page.
  form(doc, page) {
    const key = 'form:' + page.num;
    let map = this.maps.get(doc);
    if (!map) this.maps.set(doc, (map = new Map()));
    if (map.has(key)) return map.get(key);
    const contents = valueOf(page.head, 'Contents');
    const parts = contents ? [...contents.matchAll(/(\d+) \d+ R/g)].map((m) => doc.objs.get(Number(m[1]))).filter(Boolean) : [];
    let data = '';
    let filter = '';
    if (parts.length === 1 && parts[0].data !== null && !/\/DecodeParms/.test(parts[0].head)) {
      data = parts[0].data;
      filter = valueOf(parts[0].head, 'Filter') ? ' /Filter ' + valueOf(parts[0].head, 'Filter') : '';
    } else {
      const plain = parts.map((p) => {
        const raw = Buffer.from(p.data || '', 'latin1');
        return /FlateDecode/.test(p.head) ? zlib.inflateSync(raw).toString('latin1') : raw.toString('latin1');
      }).join('\n');
      data = zlib.deflateSync(Buffer.from(plain, 'latin1')).toString('latin1');
      filter = ' /Filter /FlateDecode';
    }
    const res = valueOf(page.head, 'Resources');
    const num = this.add(`<</Type /XObject /Subtype /Form /BBox [${page.box.join(' ')}]${res ? ' /Resources ' + this.refs(doc, res) : ''}${filter} /Length ${data.length}>>`, data);
    map.set(key, num);
    return num;
  }
  // Fichier : catalogue, arbre des pages (kids : numéros des pages), table xref.
  output(kids, { pagesNum, dests, info } = {}) {
    const pages = pagesNum || this.reserve();
    this.set(pages, `<</Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length}>>`);
    const root = this.add(`<</Type /Catalog /Pages ${pages} 0 R${dests ? ' /Dests ' + dests + ' 0 R' : ''}>>`);
    const parts = ['%PDF-1.4\n%âãÏÓ\n'];
    let offset = parts[0].length;
    const offsets = new Map();
    for (const num of [...this.objs.keys()].sort((x, y) => x - y)) {
      const o = this.objs.get(num);
      const text = o.data === null
        ? `${num} 0 obj\n${o.head}\nendobj\n`
        : `${num} 0 obj\n${o.head}\nstream\n${o.data}\nendstream\nendobj\n`;
      offsets.set(num, offset);
      parts.push(text);
      offset += text.length;
    }
    const size = this.next;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let n = 1; n < size; n++) xref += offsets.has(n) ? `${String(offsets.get(n)).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n';
    parts.push(xref, `trailer\n<</Size ${size}\n/Root ${root} 0 R${info ? `\n/Info ${info} 0 R` : ''}>>\nstartxref\n${offset}\n%%EOF\n`);
    return Buffer.from(parts.join(''), 'latin1');
  }
}

// Pages de plusieurs impressions du même texte : pick(i) donne pour la page i du premier PDF celle à
// prendre, [n° du PDF, n° de page] (rien : la page du premier). Les liens du premier PDF sont gardés.
function assemble(bufs, pick) {
  const docs = bufs.map(parse);
  const lists = docs.map(pagesOf);
  const w = new Writer();
  const pagesNum = w.reserve();
  const kids = [];
  lists[0].forEach((_p, i) => {
    const [k, j] = pick(i) || [0, i];
    const ok = lists[k] && lists[k][j];
    const page = ok ? lists[k][j] : lists[0][i];
    const doc = ok ? docs[k] : docs[0];
    const num = w.copy(doc, page.num);
    const o = w.objs.get(num);
    o.head = o.head.replace(/^<</, `<</Parent ${pagesNum} 0 R `);
    kids.push(num);
  });
  // Cibles des liens : vers les pages du nouveau fichier.
  let dests = null;
  const cat = docs[0].objs.get(docs[0].root).head;
  let d = valueOf(cat, 'Dests');
  if (d) {
    if (refOf(d) !== null) d = docs[0].objs.get(refOf(d)).head;
    const index = new Map(lists[0].map((p, i) => [p.num, i]));
    const body = d.replace(/\[\s*(\d+) \d+ R([^\]]*)\]/g, (m, n, rest) => (index.has(Number(n)) ? `[${kids[index.get(Number(n))]} 0 R${rest}]` : 'null'));
    dests = w.add(body);
  }
  const info = docs[0].info !== null ? w.copy(docs[0], docs[0].info) : null;
  return w.output(kids, { pagesNum, dests, info });
}

// Traits de coupe autour d'un rectangle (x, y, w, h), en couleur de repérage ; pli : trait au milieu.
function marks(x, y, w, h, { fold = false } = {}) {
  const gap = 3 * MM;
  const len = 6 * MM;
  const ops = ['q', '0.3 w', '1 1 1 1 K'];
  const line = (x1, y1, x2, y2) => ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  for (const [cx, sx] of [[x, -1], [x + w, 1]]) {
    for (const [cy, sy] of [[y, -1], [y + h, 1]]) {
      line(cx + sx * gap, cy, cx + sx * (gap + len), cy);
      line(cx, cy + sy * gap, cx, cy + sy * (gap + len));
    }
  }
  if (fold) {
    ops.push('[2 2] 0 d');
    line(x + w / 2, y - gap, x + w / 2, y - gap - len);
    line(x + w / 2, y + h + gap, x + w / 2, y + h + gap + len);
  }
  ops.push('Q');
  return ops.join('\n');
}

// Feuilles A4 puis A3 à l'italienne (en points) : la plus petite qui contient le format demandé.
const SHEETS = [[297, 210], [420, 297]].map(([a, b]) => [a * MM, b * MM]);

// mode : 'livret' (cahier piqué : deux pages par face, recto verso bord court) ou 'coupe' (page seule
// sur une feuille plus grande, traits de coupe). Les pages gardent leur taille.
function impose(buf, mode) {
  const doc = parse(buf);
  const pages = pagesOf(doc);
  if (!pages.length) return buf;
  const w = new Writer();
  const pagesNum = w.reserve();
  const kids = [];
  const [px0, py0, px1, py1] = pages[0].box;
  const pw = px1 - px0;
  const ph = py1 - py0;
  const sheet = (width, height, draws, extra = '') => {
    const xo = draws.filter((d) => d.page).map((d, i) => ({ ...d, name: 'P' + i, num: w.form(doc, d.page) }));
    const ops = xo.map((d) => `q 1 0 0 1 ${(d.x - d.page.box[0]).toFixed(3)} ${(d.y - d.page.box[1]).toFixed(3)} cm /${d.name} Do Q`);
    if (extra) ops.push(extra);
    const content = zlib.deflateSync(Buffer.from(ops.join('\n'), 'latin1')).toString('latin1');
    const c = w.add(`<</Filter /FlateDecode /Length ${content.length}>>`, content);
    const res = `<</ProcSet [/PDF /Text /ImageB /ImageC /ImageI] /XObject <<${xo.map((d) => `/${d.name} ${d.num} 0 R`).join(' ')}>>>>`;
    return { c, res, width, height };
  };
  if (mode === 'livret') {
    const n = Math.ceil(pages.length / 4) * 4;
    const at = (k) => (k >= 1 && k <= pages.length ? pages[k - 1] : null);
    // (Chromium arrondit les pages au pixel : un A4 fait 595,92 points au lieu de 595,28.)
    const fit = SHEETS.find(([sw, sh]) => sw >= 2 * pw - 3 && sh >= ph - 3);
    const [sw, sh] = fit || [2 * pw, ph];
    const x = (sw - 2 * pw) / 2;
    const y = (sh - ph) / 2;
    const room = Math.min(x, y) >= 10 * MM;
    for (let s = 0; s < n / 4; s++) {
      for (const [l, r] of [[n - 2 * s, 2 * s + 1], [2 * s + 2, n - 2 * s - 1]]) {
        const sh1 = sheet(sw, sh, [{ page: at(l), x, y }, { page: at(r), x: x + pw, y }], room ? marks(x, y, 2 * pw, ph, { fold: true }) : '');
        kids.push(w.add(`<</Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${sw.toFixed(2)} ${sh.toFixed(2)}] /Resources ${sh1.res} /Contents ${sh1.c} 0 R>>`));
      }
    }
  } else {
    const m = 13 * MM;
    for (const p of pages) {
      const bw = p.box[2] - p.box[0];
      const bh = p.box[3] - p.box[1];
      const s = sheet(bw + 2 * m, bh + 2 * m, [{ page: p, x: m, y: m }], marks(m, m, bw, bh));
      const trim = `[${m.toFixed(2)} ${m.toFixed(2)} ${(m + bw).toFixed(2)} ${(m + bh).toFixed(2)}]`;
      kids.push(w.add(`<</Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${(bw + 2 * m).toFixed(2)} ${(bh + 2 * m).toFixed(2)}] /TrimBox ${trim} /BleedBox ${trim} /Resources ${s.res} /Contents ${s.c} 0 R>>`));
    }
  }
  const info = doc.info !== null ? w.copy(doc, doc.info) : null;
  return w.output(kids, { pagesNum, info });
}

const pageCount = (buf) => pagesOf(parse(buf)).length;

module.exports = { destPages, assemble, impose, pageCount, valueOf };
