// Équations (2.5) : écrites et modifiées directement dans le texte, numérotées (numéro à droite, équation à
// gauche), menu du clic droit, reconnues au collage (Word, pages web, code LaTeX), exportées en Word
// (équations natives) et en EPUB (MathML). Les équations des anciens documents s'ouvrent et se modifient.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-equations.js
const assert = require('assert');
const zlib = require('zlib');

// Fichiers d'une archive zip (répertoire central).
function unzip(buf) {
  const out = new Map();
  let e = buf.length - 22;
  while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'));
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const reset = async (html, mode = 'note') => {
    await page.keyboard.press('Escape');
    await v(([h, m]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m } });
      document.getElementById('page').hidden = false;
    }, [html, mode]);
    await page.waitForTimeout(250);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const latexes = () => v(() => [...document.querySelectorAll('#editor .ft-math')].map((m) => (m.tagName === 'DIV' ? 'B:' : 'I:') + m.dataset.latex));
  const field = () => v(() => { const f = document.querySelector('#editor math-field'); return f ? f.value : null; });
  const caret = (pos) => v((p) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, p)));
    w.focus();
  }, pos);
  const undo = () => v(() => window.FTMoteur.undo());
  const F = (o) => v((x) => window.FTFormules.html(x), o);

  // 1. Alt+= : équation écrite dans le texte ; « / » fait une fraction, Tab en sort ; une seule annulation.
  await reset('<p>Texte </p>');
  await caret(7);
  await page.keyboard.press('Alt+Equal');
  await page.waitForTimeout(250);
  assert.strictEqual(await field(), '', 'champ ouvert dans le texte');
  await page.keyboard.type('a/b');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x^2+1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await latexes(), ['I:\\frac{a}{b}x^2+1']);
  assert.ok(!(await v(() => !!document.querySelector('#editor math-field'))), 'sortie de l’équation');
  await page.keyboard.type('!');
  assert.match(await v(() => window.FTMoteur.view.state.doc.textContent), /!$/);
  await undo();
  await undo();
  assert.ok(!/ft-math/.test(await saved()), 'une annulation retire l’équation');
  ok('Alt+= : équation écrite dans le texte (fraction par « / », Tab, exposant), Échap pour en sortir, une annulation');

  // 2. Clic dans une équation : modifiée sur place ; Retour arrière sur une équation vide la retire.
  await reset('<p>Soit ' + await F({ latex: 'x+y' }) + ' fin.</p>');
  await page.click('#editor span.ft-math');
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  await page.keyboard.type('=z');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await latexes(), ['I:x+y=z']);
  await undo();
  assert.deepStrictEqual(await latexes(), ['I:x+y'], 'une annulation pour la modification');
  await page.click('#editor span.ft-math');
  await page.waitForTimeout(200);
  await v(() => { document.querySelector('#editor math-field').value = ''; });
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  assert.ok(!/ft-math/.test(await saved()), 'équation vide retirée');
  ok('équation modifiée sur place par un clic (une annulation), retirée quand on l’a vidée');

  // 3. Numérotation : numéros dans l'ordre du document, mis à jour ; équation à gauche, numéro à droite.
  const doc = '<p>Début.</p>' + await F({ latex: 'a=1', block: true, numbered: true, align: 'gauche' }) + '<p>Milieu.</p>'
    + await F({ latex: 'b=2', block: true }) + await F({ latex: '\\int_0^1 f(x)\\,dx', block: true, numbered: true }) + '<p>Fin.</p>';
  await reset(doc, 'avance');
  const eqs = () => v(() => [...document.querySelectorAll('#editor div.ft-math')].map((d) => d.dataset.eq || '-').join(' '));
  assert.strictEqual(await eqs(), '(1) - (2)', 'numéros posés à l’ouverture');
  const box = await page.locator('#editor div.ft-math').nth(1).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.includes('Numéroter')).click());
  await page.waitForTimeout(150);
  assert.strictEqual(await eqs(), '(1) (2) (3)');
  const geo = await v(() => {
    const d = document.querySelectorAll('#editor div.ft-math')[1];
    const r = d.getBoundingClientRect();
    const m = d.querySelector('.ML__latex').getBoundingClientRect();
    return { left: m.left - r.left, after: getComputedStyle(d, '::after').content, align: d.dataset.align || '' };
  });
  assert.strictEqual(geo.align, 'gauche', 'équation numérotée à gauche');
  assert.ok(geo.left < 20 && geo.after.includes('(2)'), JSON.stringify(geo));
  await undo();
  await page.waitForTimeout(150);
  assert.strictEqual(await eqs(), '(1) - (2)');
  ok(`numérotation : (1) - (2) puis (1) (2) (3) par le clic droit, rendue par Ctrl+Z ; équation à gauche (${Math.round(geo.left)} px), numéro à droite`);

  // 3 bis. Numéros par chapitre : (1) avant le premier chapitre, (1.1) (1.2) puis (2.1) ; réglage du
  // document (clic droit sur une équation, ou fenêtre), une annulation.
  const chap = '<p>Intro.</p>' + await F({ latex: 'a', block: true, numbered: true }) + '<h1>Un</h1>'
    + await F({ latex: 'b', block: true, numbered: true }) + await F({ latex: 'c', block: true }) + await F({ latex: 'd', block: true, numbered: true })
    + '<h1>Deux</h1><p>Texte.</p>' + await F({ latex: 'e', block: true, numbered: true });
  await reset(chap, 'avance');
  assert.strictEqual(await eqs(), '(1) (2) - (3) (4)');
  let cb = await page.locator('#editor div.ft-math').nth(1).boundingBox();
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2, { button: 'right' });
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent.includes('chapitre')).click());
  await page.waitForTimeout(150);
  assert.strictEqual(await eqs(), '(1) (1.1) - (1.2) (2.1)');
  // Nouvelle équation numérotée (fenêtre) : suit le réglage du document.
  await v(() => {
    const w = window.FTMoteur.view;
    let at = 0;
    w.state.doc.forEach((n, off) => { if (n.textContent === 'Texte.') at = off + 1; });
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, at)));
    w.focus();
  });
  await v(() => window.FTFormules.open(null, { block: true, numbered: true }));
  await page.waitForTimeout(200);
  assert.ok(await v(() => document.getElementById('math-chap').checked), 'case « chapitre » cochée');
  await v(() => { document.getElementById('math-input').value = 'x'; document.getElementById('math-ok').click(); });
  await page.waitForTimeout(150);
  assert.strictEqual(await eqs(), '(1) (1.1) - (1.2) (2.1) (2.2)');
  await undo();
  await page.waitForTimeout(150);
  await undo();
  await page.waitForTimeout(150);
  assert.strictEqual(await eqs(), '(1) (2) - (3) (4)');
  ok('numéros par chapitre : (1) avant le chapitre 1, (1.1) (1.2) puis (2.1), suivis par une nouvelle équation ; annulés');

  // 4. Fenêtre : catégories, recherche, code LaTeX synchronisé, erreur signalée.
  await reset('<p>Texte.</p>');
  await caret(7);
  await v(() => window.FTFormules.open(null, { block: false }));
  await page.waitForTimeout(300);
  const cats = await v(() => document.querySelectorAll('#math-cats button').length);
  assert.ok(cats >= 8, 'catégories : ' + cats);
  await v(() => { const s = document.getElementById('math-search'); s.value = 'integrale'; s.dispatchEvent(new Event('input')); });
  const found = await v(() => [...document.querySelectorAll('#math-palette .math-grid button')].map((b) => b.title));
  assert.ok(found.some((t) => /intégrale/i.test(t)), 'recherche sans accents : ' + found.slice(0, 5).join(', '));
  await v(() => { if (document.getElementById('math-code').closest('[hidden]')) document.getElementById('math-code-toggle').click(); });
  await v(() => { const c = document.getElementById('math-code'); c.value = '\\frac{1}{2'; c.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(100);
  assert.ok(await v(() => document.getElementById('math-errors').textContent.trim().length > 0), 'accolade non fermée signalée');
  await v(() => { const c = document.getElementById('math-code'); c.value = '\\sqrt{2}'; c.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(100);
  assert.strictEqual(await v(() => document.getElementById('math-input').value), '\\sqrt{2}');
  await v(() => document.getElementById('math-ok').click());
  assert.deepStrictEqual(await latexes(), ['I:\\sqrt{2}']);
  ok(`fenêtre : ${cats} catégories, recherche sans accents (${found.length} résultats), code LaTeX synchronisé, erreur signalée`);

  // 5. Collage : Word (OMML), KaTeX, Wikipédia (MathML), code LaTeX dans du texte (les montants restent).
  const paste = async (data) => {
    await reset('<p>X</p>');
    await v((d) => {
      const w = window.FTMoteur.view;
      w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, 2)));
      w.focus();
      const dt = new DataTransfer();
      for (const [k, val] of Object.entries(d)) dt.setData(k, val);
      w.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, data);
    await page.waitForTimeout(200);
    if (await v(() => document.getElementById('paste-dialog').open)) { await v(() => document.getElementById('ps-ok').click()); await page.waitForTimeout(200); }
    return latexes();
  };
  const word = '<html xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"><body><p class=MsoNormal>Soit <!--[if gte msEquation 12]><m:oMath><i><span style=\'font-family:"Cambria Math"\'><m:r>a</m:r></span></i><m:sSup><m:e><m:r>y</m:r></m:e><m:sup><m:r>2</m:r></m:sup></m:sSup></m:oMath><![endif]--><![if !msEquation]><img src="file:///C:/x/clip_image001.png"><![endif]> la suite.</p>'
    + '<p class=MsoNormal align=center><!--[if gte msEquation 12]><m:oMathPara><m:oMath><m:f><m:num><m:r>1</m:r></m:num><m:den><m:r>2</m:r></m:den></m:f></m:oMath></m:oMathPara><![endif]--></p><p>Fin.</p></body></html>';
  const w = await paste({ 'text/html': word, 'text/plain': 'Soit ay2 la suite.\n12\nFin.' });
  assert.ok(w.some((l) => /y\^\{?2\}?/.test(l)) && w.includes('B:\\frac{1}{2}') && !(await v(() => !!document.querySelector('#editor img'))), JSON.stringify(w));
  const katex = '<p>Soit <span class="katex"><span class="katex-mathml"><math><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x2</span></span> ici.</p>';
  assert.deepStrictEqual(await paste({ 'text/html': katex, 'text/plain': 'Soit x2 ici.' }), ['I:x^2']);
  const wiki = '<p>Le nombre <span class="mwe-math-element"><span class="mwe-math-mathml-inline" style="display: none;"><math alttext="e^{i\\pi}+1=0"><semantics><mrow><msup><mi>e</mi><mrow><mi>i</mi><mi>π</mi></mrow></msup><mo>+</mo><mn>1</mn><mo>=</mo><mn>0</mn></mrow></semantics></math></span><img class="mwe-math-fallback-image-inline" alt="e^{i\\pi}+1=0" src="https://example.org/x.svg"></span> est célèbre.</p>';
  const wk = await paste({ 'text/html': wiki, 'text/plain': 'Le nombre eiπ+1=0 est célèbre.' });
  assert.ok(wk.length === 1 && /e\^\{i\\pi\s*\}\+1=0/.test(wk[0]), JSON.stringify(wk));
  const txt = await paste({ 'text/plain': 'Soit $f(x)=x^2$ ; 5 $ ou 10 $ sont des prix.\n$$\\int_0^1 f(x)\\,dx$$\nFin \\(a+b\\).' });
  assert.deepStrictEqual(txt, ['I:f(x)=x^2', 'B:\\int_0^1 f(x)\\,dx', 'I:a+b']);
  assert.match(await v(() => window.FTMoteur.view.state.doc.textContent), /5 \$ ou 10 \$/);
  ok('collage : Word (image de remplacement retirée), KaTeX, Wikipédia, $…$ / $$…$$ / \\(…\\) dans du texte ; les montants « 5 $ » restent du texte');

  // 6. Ancien document : équation enregistrée sans son rendu, ouverte, affichée et modifiable.
  await reset('<p>Ancienne <span class="ft-math" contenteditable="false" data-latex="\\alpha^2"></span> formule.</p><div class="ft-math" contenteditable="false" data-display="block" data-box="cadre" data-latex="\\sum_{k=1}^n k"></div>');
  assert.ok(await v(() => document.querySelectorAll('#editor .ft-math .ML__latex').length === 2), 'rendu refait');
  await page.click('#editor span.ft-math');
  await page.waitForTimeout(200);
  await page.keyboard.press('End');
  await page.keyboard.type('+1');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await latexes(), ['I:\\alpha^2+1', 'B:\\sum_{k=1}^n k']);
  assert.match(await saved(), /data-box="cadre"/);
  ok('ancien document : équations affichées (rendu refait) et modifiables, cadre gardé');

  // 7. Exports : Word (équations natives, numéro dans un tableau sans bordure), EPUB (MathML, numéro).
  await reset(doc, 'avance');
  await page.waitForTimeout(300);
  const xml = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())))).get('word/document.xml');
  const omath = (xml.match(/<m:oMath>/g) || []).length;
  assert.strictEqual(omath, 3, 'trois équations natives');
  assert.match(xml, /<m:f>|<m:nary>/);
  assert.ok(/<w:tbl>[\s\S]*?<m:oMathPara>[\s\S]*?\(1\)[\s\S]*?<\/w:tbl>/.test(xml) && /\(2\)/.test(xml), 'numéros dans des tableaux');
  const files = await v(async () => (await window.FTEpub.build()).filter((f) => f.text && /\.xhtml$/.test(f.name)).map((f) => f.text).join('\n'));
  assert.ok((files.match(/<math\b/g) || []).length === 3 && /ft-eq-num[^>]*>\(1\)/.test(files), 'EPUB : MathML et numéros');
  ok(`exports : Word ${omath} équations natives (numéros (1), (2) à droite dans un tableau sans bordure), EPUB en MathML avec numéros`);
};
