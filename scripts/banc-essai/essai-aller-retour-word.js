// Aller-retour avec Word (2.2.2) : un document Word relu (modifications suivies, commentaires avec réponse
// et commentaire résolu, équations) est importé : le texte arrive avec les modifications, le suivi des
// modifications part du texte d'avant (ajout, suppression, paragraphes ajouté et retiré), les commentaires
// sont en marge, les équations sont des formules du logiciel. L'export Word rend des révisions Word
// (w:ins, w:del), les commentaires et les équations ; réimporté, il redonne le même document.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-aller-retour-word.js
const zlib = require('zlib');
const assert = require('assert');

// Archive zip sans compression (assez pour un .docx d'essai).
function zip(files) {
  const parts = [];
  const central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const n = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    parts.push(local, n, data);
    central.push(c, n);
    off += 30 + n.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function unzip(buf, name) {
  let e = buf.length - 22;
  while (e > 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < buf.readUInt16LE(e + 10); i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return null;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';
const R = (t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const REV = 'w:author="Relecteur" w:date="2026-10-28T09:00:00Z"';
const M = (t) => `<m:r><m:t>${t}</m:t></m:r>`;
const DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${R('Rapport de lecture')}</w:p>
<w:p>${R('Le ')}<w:commentRangeStart w:id="0"/>${R('chat')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>${R(' ')}<w:ins w:id="10" ${REV}>${R('noir ')}</w:ins>${R('dort')}<w:del w:id="11" ${REV}><w:r><w:delText xml:space="preserve"> profondément</w:delText></w:r></w:del>${R(' sur le ')}<w:commentRangeStart w:id="2"/>${R('canapé')}<w:commentRangeEnd w:id="2"/><w:r><w:commentReference w:id="2"/></w:r>${R('.')}</w:p>
<w:p><w:pPr><w:rPr><w:ins w:id="12" ${REV}/></w:rPr></w:pPr><w:ins w:id="13" ${REV}>${R('Une phrase nouvelle, écrite à la relecture.')}</w:ins></w:p>
<w:p><w:pPr><w:rPr><w:del w:id="14" ${REV}/></w:rPr></w:pPr><w:del w:id="15" ${REV}><w:r><w:delText>Ancien passage à enlever.</w:delText></w:r></w:del></w:p>
<w:p>${R('Soit ')}<m:oMath><m:sSup><m:e>${M('x')}</m:e><m:sup>${M('2')}</m:sup></m:sSup>${M('+')}<m:f><m:num>${M('α')}</m:num><m:den>${M('β')}</m:den></m:f></m:oMath>${R(' donc la suite.')}</w:p>
<w:p><m:oMathPara><m:oMath><m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${M('i=1')}</m:sub><m:sup>${M('n')}</m:sup><m:e><m:sSub><m:e>${M('x')}</m:e><m:sub>${M('i')}</m:sub></m:sSub></m:e></m:nary>${M('=')}<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e><m:d><m:e>${M('a+b')}</m:e></m:d></m:e></m:rad>${M('≤')}<m:func><m:fName><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t>sin</m:t></m:r></m:fName><m:e>${M('θ')}</m:e></m:func></m:oMath></m:oMathPara></w:p>
<w:p>${R('Fin du texte.')}</w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>
</w:body></w:document>`;
const COMMENTS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments ${NS}>
<w:comment w:id="0" w:author="Relecteur" w:date="2026-10-28T09:05:00Z" w:initials="R"><w:p w14:paraId="00000A01"><w:r><w:t>Préciser la couleur ?</w:t></w:r></w:p></w:comment>
<w:comment w:id="1" w:author="Camille" w:date="2026-10-28T10:00:00Z" w:initials="C"><w:p w14:paraId="00000A02"><w:r><w:t>Fait.</w:t></w:r></w:p></w:comment>
<w:comment w:id="2" w:author="Relecteur" w:date="2026-10-28T09:06:00Z" w:initials="R"><w:p w14:paraId="00000A03"><w:r><w:t>Mot juste.</w:t></w:r></w:p></w:comment>
</w:comments>`;
const EXT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w15:commentsEx ${NS}>
<w15:commentEx w15:paraId="00000A01" w15:done="0"/><w15:commentEx w15:paraId="00000A02" w15:paraIdParent="00000A01" w15:done="0"/><w15:commentEx w15:paraId="00000A03" w15:done="1"/>
</w15:commentsEx>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
const FIXTURE = zip({
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
  'word/document.xml': DOC,
  'word/comments.xml': COMMENTS,
  'word/commentsExtended.xml': EXT,
  'word/styles.xml': STYLES
});

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 3) => v((k) => new Promise((r) => {
    const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : setTimeout(r, 0));
    f(k);
  }), n);
  const convert = (buf) => v(async (b64) => {
    const bin = atob(b64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return window.FTWordImport.convert(a.buffer, 'relu.docx');
  }, buf.toString('base64'));
  // Ouvre le résultat d'un import comme le fait app.js (commentaires, suivi parti du texte d'avant).
  const open = async (r) => {
    await v((res) => {
      const settings = { mode: 'note' };
      if (res.comments.length) settings.comments = res.comments;
      if (res.before) settings.track = { since: '2026-10-28T09:00:00.000Z', base: window.FTTrack.baseOf(res.before) };
      window.FTEditor.load({ content: { html: res.html }, settings });
      window.FTTrack.load(settings);
      window.FTComments.load(settings);
      document.getElementById('page').hidden = false;
    }, r);
    await page.waitForTimeout(700);
    await frames(3);
  };
  const state = () => v(() => {
    window.FTTrack.refresh();
    const t = window.FTTrack.exportRows();
    return {
      rows: t ? t.rows.map((r) => r.kind + ':' + (r.unit ? r.unit.text : t.base[r.ai].text) + (r.ops ? ' ' + JSON.stringify(r.ops.map((o) => o.type === 'ins' ? '+' + r.unit.text.slice(o.start, o.end) : '-' + o.text)) : '')) : [],
      comments: window.FTComments.exportList().map((c) => ({ text: c.text, author: c.author, done: c.done, replies: c.replies.map((x) => x.author + ':' + x.text), passage: c.spans.map((s) => s.textContent).join('') })),
      maths: [...document.querySelectorAll('#editor .ft-math')].map((m) => (m.tagName === 'DIV' ? 'bloc:' : '') + m.dataset.latex),
      drawn: [...document.querySelectorAll('#editor .ft-math')].every((m) => m.querySelector('math, .ML__latex, svg, span')),
      text: window.FTMoteur.view.state.doc.textContent
    };
  });

  // 1. Import du document relu.
  const r1 = await convert(FIXTURE);
  assert.ok(r1.before, 'texte d’avant');
  assert.ok(!/profondément|Ancien/.test(r1.html) && /noir|nouvelle/.test(r1.html), r1.html);
  assert.ok(/profondément/.test(r1.before) && /Ancien/.test(r1.before) && !/noir |nouvelle/.test(r1.before), r1.before);
  assert.deepStrictEqual(r1.warnings, []);
  await open(r1);
  const s1 = await state();
  assert.deepStrictEqual(s1.rows.map((r) => r.split(':')[0]).sort(), ['added', 'change', 'removed'], JSON.stringify(s1.rows));
  const change = s1.rows.find((r) => r.startsWith('change'));
  assert.ok(change.includes('"+noir') && change.includes('"-profondément'), change);
  ok('import : modifications suivies à relire (mot ajouté, mot supprimé, paragraphe ajouté, paragraphe retiré)');
  assert.deepStrictEqual(s1.comments, [
    { text: 'Préciser la couleur ?', author: 'Relecteur', done: false, replies: ['Camille:Fait.'], passage: 'chat' },
    { text: 'Mot juste.', author: 'Relecteur', done: true, replies: [], passage: 'canapé' }
  ], JSON.stringify(s1.comments));
  ok('import : commentaires en marge sur leur passage, réponse rattachée, commentaire résolu');
  assert.deepStrictEqual(s1.maths, ['x^{2}+\\frac{\\alpha}{\\beta}', 'bloc:\\sum_{i=1}^{n} x_{i}=\\sqrt{\\left(a+b\\right)}\\le \\sin{\\theta}'], JSON.stringify(s1.maths));
  assert.ok(s1.drawn, 'formules dessinées');
  ok('import : équations Word en formules (' + s1.maths.join(' ; ') + ')');

  // 2. Export Word : révisions, commentaires, équations.
  const bytes = Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())));
  // FT_SORTIE=<dossier> : les deux fichiers Word gardés (pour les ouvrir dans Word ou LibreOffice).
  if (process.env.FT_SORTIE) {
    require('fs').writeFileSync(require('path').join(process.env.FT_SORTIE, 'relu.docx'), FIXTURE);
    require('fs').writeFileSync(require('path').join(process.env.FT_SORTIE, 'exporte.docx'), bytes);
  }
  const xml = unzip(bytes, 'word/document.xml');
  const cxml = unzip(bytes, 'word/comments.xml') || '';
  const ins = [...xml.matchAll(/<w:ins [^>]*>([\s\S]*?)<\/w:ins>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')).filter(Boolean);
  const del = [...xml.matchAll(/<w:delText[^>]*>([^<]*)<\/w:delText>/g)].map((m) => m[1]);
  assert.ok(ins.includes('noir') || ins.some((t) => /noir/.test(t)), JSON.stringify(ins));
  assert.ok(ins.some((t) => /phrase nouvelle/.test(t)), JSON.stringify(ins));
  assert.ok(del.some((t) => /profondément/.test(t)) && del.some((t) => /Ancien passage/.test(t)), JSON.stringify(del));
  assert.ok(/<w:rPr><w:ins /.test(xml) && /<w:rPr><w:del /.test(xml), 'marques de paragraphe');
  assert.ok(/<w:ins w:id="\d+" w:author="[^"]+" w:date="2026-10-28T09:00:00Z"/.test(xml), 'auteur et date des révisions');
  assert.ok((xml.match(/<m:oMath>/g) || []).length >= 2 && /<m:f>/.test(xml) && /<m:nary>/.test(xml), 'équations');
  assert.ok(/Préciser la couleur/.test(cxml) && /Fait\./.test(cxml) && /Mot juste/.test(cxml), cxml.slice(0, 300));
  assert.ok(/trackRevisions/.test(unzip(bytes, 'word/settings.xml') || ''), 'suivi actif dans Word');
  ok(`export : révisions Word (${ins.length} ajouts, ${del.length} suppressions, marques de paragraphe), 3 commentaires, équations`);

  // 3. Réimport du fichier exporté : même document.
  const r2 = await convert(bytes);
  await open(r2);
  const s2 = await state();
  assert.deepStrictEqual(s2.rows.map((r) => r.split(':')[0]).sort(), ['added', 'change', 'removed'], JSON.stringify(s2.rows));
  assert.deepStrictEqual(s2.comments.map((c) => [c.text, c.done, c.replies.length, c.passage]), s1.comments.map((c) => [c.text, c.done, c.replies.length, c.passage]));
  assert.strictEqual(s2.maths.length, 2);
  assert.strictEqual(s2.text.replace(/\s+/g, ' '), s1.text.replace(/\s+/g, ' '));
  ok('aller-retour : réimporté, même texte, mêmes modifications à relire, mêmes commentaires, mêmes formules');

  // 4. Relecture acceptée puis export : plus aucune révision.
  await v(() => document.getElementById('track-accept-all').click());
  await frames(2);
  const bytes2 = Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())));
  assert.ok(!/<w:ins |<w:del /.test(unzip(bytes2, 'word/document.xml')));
  ok('modifications acceptées : export sans révision');

  // 5. Import par le menu Fichier : nouveau document avec son suivi et ses commentaires, message d'import.
  // (Le banc relie les fenêtres en JSON : le fichier Word est donné directement à la fenêtre.)
  await v((b64) => {
    const bin = atob(b64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    window.__realImport = window.frameText.importDocs;
    window.frameText.importDocs = async () => [{ word: 'relu.docx', data: a.buffer }];
  }, FIXTURE.toString('base64'));
  try {
    await v(() => window.__ftEmit('menu', ['import-word']));
    let msg = '';
    for (let i = 0; i < 100 && !/importé|impossible/.test(msg); i++) {
      await page.waitForTimeout(150);
      msg = await v(() => document.getElementById('status-save').textContent);
    }
    assert.ok(/Document Word importé : 3 modifications à relire, 2 commentaires\./.test(msg), msg);
    await page.waitForTimeout(600);
    const s5 = await state();
    assert.strictEqual(s5.rows.length, 3, JSON.stringify(s5.rows));
    assert.strictEqual(s5.comments.length, 2);
    assert.strictEqual(s5.maths.length, 2);
    assert.ok(s5.drawn, 'formules dessinées');
    ok('import par le menu : « ' + msg.trim() + ' », suivi et commentaires gardés dans le document');
  } finally {
    await v(() => { window.frameText.importDocs = window.__realImport; });
  }
};
