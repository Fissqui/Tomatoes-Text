// Assemblage de deux PDF produits par Chromium (export PDF, main.js) : les pages du premier, puis
// celles du second. Sert à la première page sans en-tête ni numéro (page de titre, « Première page
// différente ») : Chromium imprime les mêmes en-têtes sur toutes les pages, la première page est donc
// imprimée à part. Les PDF de Chromium (Skia) ont des objets simples, une table xref classique et
// des longueurs de flux écrites en clair : c'est tout ce que ce module sait lire.

function parse(buf) {
  const s = buf.toString('latin1');
  const objs = new Map();
  const start = /(\d+) 0 obj\s*/g;
  let pos = 0;
  for (;;) {
    start.lastIndex = pos;
    const m = start.exec(s);
    if (!m) break;
    const num = Number(m[1]);
    const i = start.lastIndex;
    const end = s.indexOf('endobj', i);
    if (end < 0) throw new Error('PDF illisible');
    const st = s.indexOf('stream', i);
    if (st >= 0 && st < end && />>\s*$/.test(s.slice(i, st))) {
      const head = s.slice(i, st);
      const len = /\/Length (\d+)/.exec(head);
      if (!len) throw new Error('PDF illisible');
      let d = st + 6;
      if (s[d] === '\r') d++;
      if (s[d] === '\n') d++;
      objs.set(num, { head, data: s.slice(d, d + Number(len[1])) });
      pos = s.indexOf('endobj', d + Number(len[1])) + 6;
    } else {
      objs.set(num, { head: s.slice(i, end).trimEnd(), data: null });
      pos = end + 6;
    }
  }
  const trailers = [...s.matchAll(/trailer\s*<<([\s\S]*?)>>\s*startxref/g)];
  const trailer = trailers.length ? trailers[trailers.length - 1][1] : '';
  const ref = (key, text) => { const r = new RegExp('/' + key + ' (\\d+) 0 R').exec(text); return r ? Number(r[1]) : null; };
  const root = ref('Root', trailer);
  if (root === null || !objs.has(root)) throw new Error('PDF illisible');
  const pages = ref('Pages', objs.get(root).head);
  if (pages === null || !objs.has(pages)) throw new Error('PDF illisible');
  return { objs, root, info: ref('Info', trailer), pages };
}

const countOf = (head) => { const m = /\/Count (\d+)/.exec(head); return m ? Number(m[1]) : 0; };
const withParent = (head, n) => head.replace(/<<\s*/, `<</Parent ${n} 0 R\n`);

function mergePdfs(first, second) {
  const a = parse(first);
  const b = parse(second);
  const shift = Math.max(...a.objs.keys());
  const out = new Map(a.objs);
  for (const [num, o] of b.objs) {
    if (num === b.root || num === b.info) continue;
    out.set(num + shift, { head: o.head.replace(/(\d+) 0 R/g, (_m, n) => `${Number(n) + shift} 0 R`), data: o.data });
  }
  // Nouvelle racine de l'arbre des pages : celle du premier PDF, puis celle du second.
  const top = Math.max(...out.keys()) + 1;
  const pa = a.pages;
  const pb = b.pages + shift;
  const total = countOf(out.get(pa).head) + countOf(out.get(pb).head);
  out.set(pa, { ...out.get(pa), head: withParent(out.get(pa).head, top) });
  out.set(pb, { ...out.get(pb), head: withParent(out.get(pb).head, top) });
  out.set(top, { head: `<</Type /Pages\n/Kids [${pa} 0 R ${pb} 0 R]\n/Count ${total}>>`, data: null });
  const cat = out.get(a.root);
  out.set(a.root, { ...cat, head: cat.head.replace(/\/Pages \d+ 0 R/, `/Pages ${top} 0 R`) });

  const parts = ['%PDF-1.4\n%âãÏÓ\n'];
  let offset = parts[0].length;
  const offsets = new Map();
  for (const num of [...out.keys()].sort((x, y) => x - y)) {
    const o = out.get(num);
    const text = o.data === null
      ? `${num} 0 obj\n${o.head}\nendobj\n`
      : `${num} 0 obj\n${o.head}stream\n${o.data}\nendstream\nendobj\n`;
    offsets.set(num, offset);
    parts.push(text);
    offset += text.length;
  }
  const size = top + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let n = 1; n < size; n++) {
    xref += offsets.has(n) ? `${String(offsets.get(n)).padStart(10, '0')} 00000 n \n` : '0000000000 65535 f \n';
  }
  parts.push(xref, `trailer\n<</Size ${size}\n/Root ${a.root} 0 R${a.info !== null ? `\n/Info ${a.info} 0 R` : ''}>>\nstartxref\n${offset}\n%%EOF\n`);
  return Buffer.from(parts.join(''), 'latin1');
}

module.exports = { mergePdfs, parse };
