// Essai des exports fidèles à l'écran (2.4.22) :
// - polices fixes (fonts/statiques) : une par graisse, sans axes variables, lisibles par Node (polices.js) ;
// - PDF : la page imprimée emploie ces polices fixes (pas de polices « Type 3 ») ;
// - Word : polices du document jointes (romain, gras, italique), texte des colonnes à la largeur de sa colonne,
//   espacement des lettres.
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const JSZip = require('jszip');

const SRC = path.join(__dirname, '..', '..', 'src');

// Tables d'une police TrueType (sfnt).
function tables(buf) {
  const n = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < n; i++) {
    const r = 12 + 16 * i;
    out[buf.toString('latin1', r, r + 4)] = { off: buf.readUInt32BE(r + 8), len: buf.readUInt32BE(r + 12) };
  }
  return out;
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const polices = require(path.join(SRC, 'polices.js'));

  // ----- 1. Polices fixes -----
  const list = polices.list();
  const names = Object.keys(list);
  assert.ok(names.length >= 15, 'familles : ' + names.length);
  const css = fs.readFileSync(path.join(SRC, 'renderer', 'fonts', 'fonts-impression.css'), 'utf8');
  let files = 0;
  for (const name of names) {
    const f = list[name];
    assert.ok((f.styles.normal || []).includes(400), name + ' 400');
    for (const [style, ws] of Object.entries(f.styles)) {
      for (const w of ws) {
        const file = `${f.slug}-${w}-${style}.woff2`;
        assert.ok(css.includes(`font-family: '${name}'; font-style: ${style}; font-weight: ${w}; src: url(./statiques/${file})`), 'css ' + file);
        const ttf = polices.woff2ToTtf(fs.readFileSync(path.join(SRC, 'renderer', 'fonts', 'statiques', file)));
        const t = tables(ttf);
        assert.ok(t.glyf && t.cmap && t.head && !t.fvar && !t.gvar, file + ' : ' + Object.keys(t).join(' '));
        assert.strictEqual(ttf.readUInt16BE(t['OS/2'].off + 4), w, file + ' graisse');
        files++;
      }
    }
  }
  ok(`${files} polices fixes (${names.length} familles) : sans axes variables, une graisse chacune, lisibles par Node`);
  const word = polices.forWord(['Inter', 'Caveat', 'Georgia']);
  assert.ok(word.every((x) => typeof x.data === 'string' && Buffer.from(x.data, 'base64').readUInt32BE(0) === 0x10000), 'TrueType en base 64');
  assert.deepStrictEqual(word.map((x) => x.name + ':' + (x.style || 'regular')), ['Inter:regular', 'Inter:bold', 'Inter:italic', 'Inter:boldItalic', 'Caveat:regular', 'Caveat:bold']);
  ok('Word : romain, gras, italique et gras italique des familles du logiciel ; rien pour les polices du système');

  // ----- 2. Document d'essai -----
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  await page.evaluate((L) => window.FTEditor.load({
    content: { html: `<h1>Titre</h1><p><span style="font-family: Lora">Texte <strong>gras</strong> et <em>italique</em>.</span></p>
      <div class="ft-cols" data-cols="2"><p id="c1">${L.repeat(3)}</p><p id="c2">${L.repeat(3)}</p></div><p>Fin.</p>` },
    settings: { mode: 'note' }
  }), LOREM);
  await page.waitForTimeout(600);

  const job = await page.evaluate(() => window.FTPdf.build());
  assert.ok(/fonts\/fonts-impression\.css/.test(job.html) && !/fonts\/fonts\.css/.test(job.html), 'feuille des polices fixes');
  ok('PDF : la page imprimée charge les polices fixes');

  const bytes = Buffer.from(await page.evaluate(async () => Array.from(await window.FTWord.exportWord())));
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml').async('string');
  const table = await zip.file('word/fontTable.xml').async('string');
  const settings = await zip.file('word/settings.xml').async('string');
  const fontFiles = Object.keys(zip.files).filter((f) => /^word\/fonts\/.*\.odttf$/.test(f));
  assert.ok(/<w:font w:name="Lora">/.test(table) && /w:embedRegular/.test(table), table.slice(-600));
  assert.ok(/w:embedBold /.test(table) && /w:embedItalic /.test(table), 'gras et italique joints');
  assert.ok(/<w:embedTrueTypeFonts\/>/.test(settings), 'réglage embedTrueTypeFonts');
  assert.ok(fontFiles.length >= 2, 'fichiers de polices : ' + fontFiles.length);
  const rels = await zip.file('word/_rels/fontTable.xml.rels').async('string');
  assert.strictEqual((rels.match(/<Relationship /g) || []).length, fontFiles.length);
  ok(`Word : ${fontFiles.length} fichiers de police joints, une entrée par famille avec gras et italique`);

  // Colonnes : aucun paragraphe n'a un retrait plus large que sa colonne (sinon une lettre par ligne).
  const sectCols = xml.indexOf('w:num="2"');
  assert.ok(sectCols > 0, 'section en deux colonnes');
  const rights = [...xml.matchAll(/<w:ind w:left="(\d+)" w:right="(\d+)"/g)].map((m) => [+m[1], +m[2]]);
  assert.ok(rights.every(([l, r]) => l < 2000 && r < 2000), JSON.stringify(rights));
  ok('Word : le texte en colonnes garde la largeur de sa colonne (retraits ' + JSON.stringify(rights.slice(0, 4)) + ')');

  // ----- 3. Espacement des lettres -----
  await page.evaluate(() => window.FTEditor.load({
    content: { html: '<p style="letter-spacing: 2px">ESPACÉ</p><p>Normal.</p>' }, settings: { mode: 'note' }
  }));
  await page.waitForTimeout(400);
  const x2 = await JSZip.loadAsync(Buffer.from(await page.evaluate(async () => Array.from(await window.FTWord.exportWord()))));
  const d2 = await x2.file('word/document.xml').async('string');
  assert.ok(/<w:spacing w:val="30"\/>/.test(d2), 'espacement 2 px = 30 vingtièmes de point');
  ok('Word : espacement des lettres gardé');
};
