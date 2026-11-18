// Blocs de code (versions 2.1.6 et 2.1.12) : création (bouton « Code », ``` puis espace, ```sql puis Entrée,
// Insérer), couleurs selon le langage, menu du langage sur le côté du cadre, écriture (retrait gardé,
// tabulation, pas de guillemets français ni de majuscule automatique, collage tel quel), sortie du bloc,
// retrait du cadre, enregistrement identique, coupure entre deux pages en mode avancé, exports PDF et Word ;
// SQL de SAS (PROC SQL, macros) ; styles des blocs (fenêtre « Styles du document », numéros de ligne,
// thème du document) ; réglages de saisie (retrait par langage, paires, accolades, retour arrière).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-code.js
// (FT_SHOT=<dossier> : captures d'écran du bloc en mode note et en mode avancé.)
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

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

const PY = 'import numpy as np\n\n@dataclass\nclass Point:\n    """Un point du plan."""\n    x: float = 0.5\n\ndef distance(a, b):\n    # Distance euclidienne\n    return np.sqrt((a.x - b.x) ** 2)  # fin\n\nprint(f"d = {distance(p, q)}", None, True)';

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => v((k) => new Promise((r) => {
    const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : setTimeout(r, 0));
    f(k);
  }), n);
  const settle = async () => { await page.waitForTimeout(300); await frames(2); };
  const reset = async (html, mode = 'note') => {
    await page.keyboard.press('Escape');
    await v(([h, m]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m } });
      document.getElementById('page').hidden = false;
    }, [html, mode]);
    await settle();
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const endOf = (text) => v((t) => {
    let p = null;
    window.FTMoteur.view.state.doc.descendants((n, q) => {
      if (p === null && n.isText && n.text.includes(t)) p = q + n.text.indexOf(t) + t.length;
    });
    return p;
  }, text);
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const caretAfter = async (text) => select(await endOf(text));
  const codeText = (i = 0) => v((k) => {
    const list = [];
    window.FTMoteur.view.state.doc.descendants((n) => { if (n.type.name === 'code_block') list.push(n.textContent); });
    return list[k];
  }, i);
  const tokens = (sel) => v((s) => [...document.querySelectorAll(s)].map((e) => e.textContent), sel);
  const shot = async (name) => {
    if (!process.env.FT_SHOT) return;
    const el = await page.$('#editor pre.ft-code');
    if (el) await el.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(process.env.FT_SHOT, name) });
  };

  // ----- Lecture, couleurs, enregistrement identique -----

  const html = '<p>Avant le code.</p><pre class="ft-code" data-lang="python"><code>' + PY.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code></pre><p>Après le code.</p>';
  await reset(html);
  assert.strictEqual(await codeText(), PY);
  assert.strictEqual(await saved(), html);
  const kw = await tokens('#editor pre.ft-code .tk-kw');
  for (const w of ['import', 'as', 'class', 'def', 'return']) assert.ok(kw.includes(w), 'mot-clé ' + w + ' : ' + kw);
  assert.ok((await tokens('#editor pre.ft-code .tk-com')).includes('# Distance euclidienne'));
  assert.ok((await tokens('#editor pre.ft-code .tk-str')).includes('"""Un point du plan."""'));
  assert.ok((await tokens('#editor pre.ft-code .tk-str')).includes('f"d = {distance(p, q)}"'));
  assert.ok((await tokens('#editor pre.ft-code .tk-dec')).includes('@dataclass'));
  assert.ok((await tokens('#editor pre.ft-code .tk-fn')).includes('distance'));
  assert.ok((await tokens('#editor pre.ft-code .tk-ty')).includes('Point'));
  assert.deepStrictEqual((await tokens('#editor pre.ft-code .tk-num')), ['0.5', '2']);
  assert.ok((await tokens('#editor pre.ft-code .tk-lit')).includes('None'));
  const look = await v(() => {
    const pre = document.querySelector('#editor pre.ft-code');
    const kwEl = pre.querySelector('.tk-kw');
    return { font: getComputedStyle(pre).fontFamily, ws: getComputedStyle(pre).whiteSpace, kw: getComputedStyle(kwEl).color, text: getComputedStyle(pre).color, bar: pre.querySelector('.ft-code-bar').textContent };
  });
  assert.ok(/JetBrains Mono/.test(look.font), look.font);
  assert.strictEqual(look.ws, 'pre-wrap');
  assert.notStrictEqual(look.kw, look.text);
  assert.strictEqual(look.bar, 'Python');
  await shot('code-note.png');
  ok('bloc Python relu et réenregistré à l’identique ; mots-clés, chaînes, commentaires, décorateur, fonctions, nombres colorés ; menu « Python » sur le côté');

  // Chaque langage colore ses propres mots.
  const samples = {
    r: ['df <- read.csv("data.csv")  # lecture\nmoyenne <- mean(df$x, na.rm = TRUE)\nif (moyenne > 2) print(NA)', { kw: ['<-', 'if'], fn: [], ty: ['read.csv', 'mean', 'print'], str: ['"data.csv"'], com: ['# lecture'], lit: ['TRUE', 'NA'] }],
    cpp: ['#include <iostream>\n// Somme\nint main() {\n    std::vector<int> v{1, 2};\n    return v.size() > 0 ? 0 : 1; /* fin */\n}', { pp: ['#include'], str: ['<iostream>'], com: ['// Somme', '/* fin */'], ty: ['int', 'std', 'vector'], kw: ['return'], fn: ['main', 'size'] }],
    sql: ["SELECT nom, COUNT(*) AS total\nFROM clients c -- commentaire\nWHERE ville = 'Lyon' AND age > 30\nORDER BY total DESC;", { kw: ['SELECT', 'AS', 'FROM', 'WHERE', 'AND', 'ORDER', 'BY', 'DESC'], ty: ['COUNT'], str: ["'Lyon'"], com: ['-- commentaire'], num: ['30'] }],
    javascript: ['const re = /a+b/g; // motif\nfunction somme(a, b) {\n  return `${a + b}` + "!";\n}\nconsole.log(somme(1, 2) / 2, null);', { kw: ['const', 'function', 'return'], str: ['/a+b/g', '`${a + b}`', '"!"'], com: ['// motif'], fn: ['somme', 'log'], ty: ['console'], lit: ['null'] }],
    html: ['<!DOCTYPE html>\n<!-- page -->\n<a href="https://exemple.fr" class=lien>Lien &amp; texte</a>\n<script>let x = 1;</script>\n<style>p { color: red; }</style>', { pp: ['<!DOCTYPE html>'], com: ['<!-- page -->'], tag: ['<a', '>', '</a', '>', '<script', '>', '</script', '>', '<style', '>', 'p', '</style', '>'], at: ['href', 'class', 'color'], str: ['"https://exemple.fr"', 'lien'], lit: ['&amp;'], kw: ['let'], num: ['1'] }]
  };
  for (const [lang, [code, expect]] of Object.entries(samples)) {
    const got = await v(([c, l]) => {
      const out = {};
      for (const [a, b, k] of window.FTCode.tokens(c, l)) (out[k] = out[k] || []).push(c.slice(a, b));
      return out;
    }, [code, lang]);
    for (const [k, list] of Object.entries(expect)) for (const w of list) assert.ok((got[k] || []).includes(w), `${lang} ${k} « ${w} » : ${JSON.stringify(got)}`);
    assert.ok(!(got.kw || []).some((w) => /^(nom|clients|ville)$/.test(w)), lang);
  }
  assert.deepStrictEqual(await v(() => window.FTCode.tokens('du texte avec def et "guillemets"', 'texte')), []);
  ok('R, C++, SQL, JavaScript (expressions régulières, gabarits), HTML (attributs, script et style intégrés) : couleurs propres à chaque langage ; texte brut sans couleur');

  // ----- Menu du langage -----

  await v(() => document.querySelector('#editor pre.ft-code .ft-code-bar').click());
  await page.waitForTimeout(100);
  const items = await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent));
  assert.deepStrictEqual(items, ['Python', 'R', 'C++', 'SQL', 'JavaScript', 'HTML', 'Texte brut', 'Style du bloc…']);
  await v(() => [...document.querySelectorAll('#context-menu button')].find((b) => b.textContent === 'C++').click());
  await settle();
  assert.strictEqual(await v(() => document.querySelector('#editor pre.ft-code').dataset.lang), 'cpp');
  assert.strictEqual(await v(() => document.querySelector('#editor pre.ft-code .ft-code-bar').textContent), 'C++');
  assert.ok((await saved()).includes('data-lang="cpp"'));
  await v(() => window.FTMoteur.undo());
  await settle();
  assert.strictEqual(await v(() => document.querySelector('#editor pre.ft-code').dataset.lang), 'python');
  ok('menu du langage : 7 choix, le langage change (couleurs refaites, enregistré) et s’annule par Ctrl+Z');

  // ----- Écriture -----

  await reset('<p>Ligne</p>');
  await caretAfter('Ligne');
  await page.keyboard.press('Enter');
  await page.keyboard.type('``` ');
  await settle();
  assert.strictEqual(await v(() => window.FTMoteur.view.state.selection.$from.parent.type.name), 'code_block');
  await page.keyboard.type('def f(x):');
  await page.keyboard.press('Enter');
  await page.keyboard.type('return "texte" + \'a\'');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x ; y ! z');
  assert.strictEqual(await codeText(), 'def f(x):\n    return "texte" + \'a\'\n        x ; y ! z');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.strictEqual(await codeText(), 'def f(x):\n    return "texte" + \'a\'\n    x ; y ! z');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('suite');
  await settle();
  const after = await v(() => {
    const d = window.FTMoteur.view.state.doc;
    return d.content.content.map((n) => n.type.name + ':' + n.textContent);
  });
  assert.deepStrictEqual(after.slice(0, 2), ['paragraph:Ligne', 'code_block:def f(x):\n    return "texte" + \'a\'\n    x ; y ! z']);
  // (Hors du bloc, la majuscule automatique reprend.)
  assert.ok(/^paragraph:[sS]uite$/.test(after[2]), after[2]);
  // (Le dernier langage choisi dans le menu : C++.)
  assert.strictEqual(await v(() => window.FTMoteur.view.state.doc.child(1).attrs.a['data-lang']), 'cpp');
  ok('``` puis espace : bloc de code ; retrait gardé (et augmenté après « : »), Tab/Maj+Tab, guillemets et espaces tapés tels quels ; deux Entrée sur une ligne vide en fin de bloc : on en sort');

  // ```sql puis Entrée ; collage tel quel ; Ctrl+Entrée.
  await page.keyboard.press('Enter');
  await page.keyboard.type('```sql');
  await page.keyboard.press('Enter');
  await settle();
  assert.strictEqual(await v(() => window.FTMoteur.view.state.selection.$from.parent.attrs.a['data-lang']), 'sql');
  await v(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'SELECT *\r\nFROM t\r\n  WHERE a = "x";');
    dt.setData('text/html', '<p><b>SELECT</b> *</p><p>FROM t</p>');
    window.FTMoteur.view.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  assert.strictEqual(await codeText(1), 'SELECT *\nFROM t\n  WHERE a = "x";');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('fin');
  assert.strictEqual(await v(() => window.FTMoteur.view.state.selection.$from.parent.type.name), 'paragraph');
  ok('```sql puis Entrée : bloc SQL ; collage gardé tel quel (lignes, espaces, sans mise en forme) ; Ctrl+Entrée : ligne après le bloc');

  // Bouton « Code » sur deux lignes sélectionnées, puis retrait du cadre.
  await reset('<p>x = 1</p><p>y = x * 2</p><p>Texte</p>');
  await select(1, await endOf('y = x * 2'));
  await v(() => document.getElementById('code-btn').click());
  await settle();
  assert.strictEqual(await codeText(), 'x = 1\ny = x * 2');
  assert.strictEqual(await saved(), '<pre class="ft-code" data-lang="sql"><code>x = 1\ny = x * 2</code></pre><p>Texte</p>');
  await v(() => window.FTCode.toggle());
  await settle();
  assert.strictEqual(await saved(), '<p>x = 1</p><p>y = x * 2</p><p>Texte</p>');
  ok('bouton « Code » : les lignes sélectionnées deviennent un bloc (dernier langage choisi) ; à nouveau : elles redeviennent du texte');

  // Pas d'orthographe dans le code ; Insérer > Bloc de code.
  await reset('<p>Un texxte.</p><pre class="ft-code" data-lang="javascript"><code>const fautte = documant.getElementById("x");</code></pre>');
  await caretAfter('Un texxte.');
  await v(() => window.FTCode.insert('r'));
  await settle();
  assert.deepStrictEqual(await v(() => window.FTMoteur.view.state.doc.content.content.map((n) => n.type.name + (n.attrs.a && n.attrs.a['data-lang'] ? ':' + n.attrs.a['data-lang'] : ''))), ['paragraph', 'code_block:r', 'paragraph', 'code_block:javascript']);
  await page.waitForTimeout(2500);
  const spelled = await v(() => (CSS.highlights.get('ft-spell') ? [...CSS.highlights.get('ft-spell')].map((r) => r.toString()) : []));
  assert.ok(spelled.includes('texxte'), 'orthographe vérifiée dans le texte : ' + spelled.join(','));
  assert.ok(!spelled.some((w) => /fautte|documant/.test(w)), spelled.join(','));
  ok('Insérer > Bloc de code : un bloc vide après la ligne ; aucun mot du code souligné par l’orthographe');

  // ----- Mode avancé : un long bloc se coupe entre deux pages -----

  const long = Array.from({ length: 90 }, (_, i) => `ligne_${i} = calcul(${i}, "valeur")  # commentaire ${i}`).join('\n');
  await reset('<p>Début.</p><pre class="ft-code" data-lang="python"><code>' + long + '</code></pre><p>Fin.</p>', 'avance');
  await page.waitForTimeout(600);
  await frames(4);
  const paged = await v(() => ({ pages: window.FTPages.pageCount(), gaps: document.querySelectorAll('#editor pre.ft-code .ft-pg-gap').length }));
  assert.ok(paged.pages >= 2, JSON.stringify(paged));
  assert.ok(paged.gaps >= 1, JSON.stringify(paged));
  assert.strictEqual(await codeText(), long);
  if (process.env.FT_SHOT) {
    await v(() => { const g = document.querySelector('#editor pre.ft-code .ft-pg-gap'); g.scrollIntoView({ block: 'center' }); });
    await frames(3);
    await page.screenshot({ path: path.join(process.env.FT_SHOT, 'code-avance.png') });
  }
  ok(`mode avancé : bloc de 90 lignes coupé entre ses lignes (${paged.pages} pages, ${paged.gaps} coupure(s)), texte inchangé`);

  // ----- Exports -----

  await reset(html, 'avance');
  const job = await v(() => window.FTPdf.build());
  assert.ok(/<pre class="ft-code" data-lang="python"><code><span class="tk-kw">import<\/span>/.test(job.html), job.html.slice(job.html.indexOf('<pre'), job.html.indexOf('<pre') + 200));
  assert.ok(!/ft-code-bar/.test(job.html));
  ok('export PDF (et livre, EPUB) : le code garde ses couleurs, sans le menu du langage');

  const bytes = Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord())));
  const xml = unzip(bytes, 'word/document.xml');
  assert.ok(xml, 'document.xml');
  const paras = [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g)].map((m) => m[0]).filter((p) => /Consolas/.test(p));
  assert.strictEqual(paras.length, PY.split('\n').length, 'une ligne Word par ligne de code : ' + paras.length);
  assert.ok(paras.every((p) => /<w:shd /.test(p) && /<w:pBdr>/.test(p)), 'cadre et fond');
  assert.ok(/<w:t xml:space="preserve">    <\/w:t>|<w:t xml:space="preserve">    x: float/.test(xml) || /    /.test(xml), 'retraits gardés');
  assert.ok(/w:color w:val="CF222E"/.test(xml), 'mots-clés en couleur');
  assert.ok(!/Python/.test(xml.replace(/Un point du plan/, '')), 'pas de menu du langage');
  ok(`export Word : ${paras.length} lignes en Consolas, colorées, dans un cadre avec fond`);

  // ----- SQL de SAS (PROC SQL) et autres mots -----

  const sas = await v(() => {
    const c = 'PROC SQL NOPRINT;\n  CREATE TABLE work.t AS\n  SELECT nom, CALCULATED total FROM lib.x WHERE d > &seuil. AND n IS NOT NULL;\nQUIT;\n%let seuil = 3;\nMERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET a = 1;';
    const out = {};
    for (const [a, b, k] of window.FTCode.tokens(c, 'sql')) (out[k] = out[k] || []).push(c.slice(a, b));
    return out;
  });
  for (const w of ['PROC', 'SQL', 'NOPRINT', 'CREATE', 'TABLE', 'AS', 'SELECT', 'CALCULATED', 'FROM', 'WHERE', 'AND', 'IS', 'NOT', 'QUIT', 'MERGE', 'INTO', 'USING', 'ON', 'WHEN', 'MATCHED', 'THEN', 'UPDATE', 'SET']) assert.ok((sas.kw || []).includes(w), 'SQL ' + w + ' : ' + JSON.stringify(sas));
  assert.ok((sas.pp || []).includes('%let'), JSON.stringify(sas));
  assert.ok((sas.lit || []).includes('&seuil.') && (sas.lit || []).includes('NULL'), JSON.stringify(sas));
  assert.ok(!(sas.kw || []).includes('nom'));
  await reset('<pre class="ft-code" data-lang="sql"><code>PROC SQL;\nQUIT;</code></pre>');
  assert.deepStrictEqual(await tokens('#editor pre.ft-code .tk-kw'), ['PROC', 'SQL', 'QUIT']);
  ok('SQL : « PROC SQL; … QUIT; » de SAS coloré, avec CALCULATED, NOPRINT, MERGE, macros %let et &variable.');

  // ----- Styles des blocs -----

  const PRE = '<pre class="ft-code" data-lang="python"><code>def f(x):\n    return x  # fin\n\nprint(f(2))</code></pre>';
  await reset('<p>Avant.</p>' + PRE + '<p>Après.</p>');
  await caretAfter('return x');
  await v(() => window.FTStyles.open('code'));
  await settle();
  const dlg = await v(() => ({
    open: document.getElementById('docstyles-dialog').open,
    tab: document.querySelector('#ds-tabs button.on').textContent,
    scope: document.querySelector('#ds-scope button.on').textContent,
    presets: [...document.querySelectorAll('#ds-panel > div:nth-child(2) .ds-gallery > button')].map((b) => b.title),
    sections: [...document.querySelectorAll('#ds-panel .ds-label')].map((e) => e.textContent),
    widths: document.querySelectorAll('#ds-panel .ds-code-widths select').length
  }));
  assert.ok(dlg.open);
  assert.strictEqual(dlg.tab, 'Blocs de code');
  assert.strictEqual(dlg.scope, 'Ce bloc de code');
  assert.deepStrictEqual(dlg.presets, ['Clair', 'Clair numéroté', 'Sombre', 'Monokai', 'Nord', 'Solarisé', 'Sépia', 'Contrasté', 'Impression noir et blanc']);
  assert.deepStrictEqual(dlg.sections, ['Styles prêts', 'Couleurs', 'Cadre', 'Texte', 'Saisie du code (tous les documents)']);
  assert.strictEqual(dlg.widths, 7);
  if (process.env.FT_SHOT) await page.screenshot({ path: path.join(process.env.FT_SHOT, 'code-styles.png') });
  // Style prêt « Nord » (fond seul, numéros), puis police et taille.
  await v(() => document.querySelector('#ds-panel .ds-gallery > button[title="Nord"]').click());
  await settle();
  await v(() => {
    const sel = [...document.querySelectorAll('#ds-panel .ds-field')];
    const pick = (label, value) => { const s = sel.find((f) => f.firstChild.textContent === label).querySelector('select'); s.value = value; s.dispatchEvent(new Event('change')); };
    pick('Police', 'Courier New');
    pick('Taille', '10');
  });
  await settle();
  const styled = await v(() => {
    const pre = document.querySelector('#editor pre.ft-code');
    const cs = getComputedStyle(pre);
    return { bg: cs.backgroundColor, font: cs.fontFamily, size: cs.fontSize, ln: [...pre.querySelectorAll('.ft-code-ln')].map((e) => e.textContent), lnPos: getComputedStyle(pre.querySelector('.ft-code-ln')).position };
  });
  assert.strictEqual(styled.bg, 'rgb(46, 52, 64)');
  assert.ok(/^"?Courier New/.test(styled.font), styled.font);
  assert.strictEqual(styled.size, (10 * 96 / 72).toFixed(4).replace(/\.?0+$/, '') + 'px');
  assert.deepStrictEqual(styled.ln, ['1', '2', '3', '4']);
  assert.strictEqual(styled.lnPos, 'absolute');
  const styledHtml = await saved();
  assert.strictEqual(styledHtml, '<p>Avant.</p><pre class="ft-code" data-lang="python" data-palette="nord" data-frame="fond" data-num="" style="--code-font: &quot;Courier New&quot;; --code-size: 10pt;"><code>def f(x):\n    return x  # fin\n\nprint(f(2))</code></pre><p>Après.</p>');
  assert.strictEqual(await codeText(), 'def f(x):\n    return x  # fin\n\nprint(f(2))');
  if (process.env.FT_SHOT) {
    await v(() => document.getElementById('docstyles-dialog').close());
    await shot('code-nord.png');
  }
  await v(() => document.getElementById('docstyles-dialog').close());
  // Relu tel quel ; Ctrl+Z rend le style d'avant.
  await reset(styledHtml);
  assert.strictEqual(await saved(), styledHtml);
  assert.strictEqual(await v(() => document.querySelectorAll('#editor pre.ft-code .ft-code-ln').length), 4);
  ok('fenêtre « Styles du document », onglet « Blocs de code » : 9 styles prêts, couleurs, cadre, police, taille ; numéros de ligne en marge ; style enregistré sur le bloc et relu à l’identique');

  // Portée « Tout le document » : les blocs existants et les prochains (thème du document).
  await reset('<p>A</p>' + PRE + '<p>B</p>' + PRE.replace('python', 'r'));
  await caretAfter('A');
  await v(() => window.FTStyles.open('code', null, 'doc'));
  await settle();
  await v(() => document.querySelector('#ds-panel .ds-gallery > button[title="Monokai"]').click());
  await settle();
  await v(() => document.getElementById('docstyles-dialog').close());
  assert.deepStrictEqual(await v(() => [...document.querySelectorAll('#editor pre.ft-code')].map((p) => p.dataset.palette)), ['monokai', 'monokai']);
  assert.strictEqual((await v(() => window.FTTheme.part('code'))).palette, 'monokai');
  await caretAfter('B');
  await v(() => window.FTCode.insert('cpp'));
  await settle();
  assert.deepStrictEqual(await v(() => [...document.querySelectorAll('#editor pre.ft-code')].map((p) => p.dataset.lang + ':' + p.dataset.palette)), ['python:monokai', 'cpp:monokai', 'r:monokai']);
  assert.ok(!/clip-path/.test(await saved()));
  // Menu du langage : « Style du bloc… ».
  await v(() => document.querySelector('#editor pre.ft-code .ft-code-bar').click());
  await page.waitForTimeout(100);
  assert.ok((await v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent))).includes('Style du bloc…'));
  await page.keyboard.press('Escape');
  ok('portée « Tout le document » : tous les blocs changent, et les nouveaux blocs prennent ce style (thème du document) ; « Style du bloc… » dans le menu du langage');

  // Exports avec numéros de ligne.
  await reset(styledHtml, 'avance');
  const job2 = await v(() => window.FTPdf.build());
  assert.ok(/<pre class="ft-code" data-lang="python" data-palette="nord"[^>]*><code><span class="ft-code-ln">1<\/span><span class="tk-kw">def<\/span>/.test(job2.html), job2.html.slice(job2.html.indexOf('<pre'), job2.html.indexOf('<pre') + 300));
  assert.ok(!/clip-path/.test(job2.html));
  const xml2 = unzip(Buffer.from(await v(async () => Array.from(await window.FTWord.exportWord()))), 'word/document.xml');
  const paras2 = [...xml2.matchAll(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g)].map((m) => m[0]).filter((p) => /Courier New/.test(p));
  assert.strictEqual(paras2.length, 4, 'lignes Word : ' + paras2.length);
  assert.ok(paras2.every((p, k) => new RegExp('<w:t xml:space="preserve">' + (k + 1) + '</w:t>').test(p) && /<w:tab\/>/.test(p) && /w:hanging=/.test(p)), paras2[0]);
  assert.ok(/w:fill="2E3440"/.test(paras2[0]), 'fond Nord');
  ok('exports : PDF avec les numéros de ligne et la palette ; Word dans la police choisie, numéro et tabulation en retrait suspendu, fond de la palette');

  // ----- Réglages de saisie -----

  const before = await v(() => window.FTCode.saisie());
  assert.deepStrictEqual(before.widths, { python: 4, r: 2, cpp: 4, sql: 4, javascript: 2, html: 2, texte: 4 });
  await v(() => window.FTCode.setSaisie((o) => { o.widths.python = 2; o.pairs = true; }));
  await reset('<pre class="ft-code" data-lang="python"><code>x = 1</code></pre><pre class="ft-code" data-lang="javascript"><code>let a</code></pre><pre class="ft-code" data-lang="cpp"><code>int b;</code></pre><pre class="ft-code" data-lang="html"><code>&lt;ul&gt;</code></pre>');
  // Python : retrait de 2 espaces après « : », paires.
  await caretAfter('x = 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('if ok:');
  await page.keyboard.press('Enter');
  await page.keyboard.type('print(');
  assert.strictEqual(await codeText(0), 'x = 1\nif ok:\n  print()');
  await page.keyboard.type('"a');
  assert.strictEqual(await codeText(0), 'x = 1\nif ok:\n  print("a")');
  await page.keyboard.type('")');
  await page.keyboard.type('!');
  assert.strictEqual(await codeText(0), 'x = 1\nif ok:\n  print("a")!');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await codeText(0), 'x = 1\nif ok:\n  print("a")\n');
  await page.keyboard.type('[');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await codeText(0), 'x = 1\nif ok:\n  print("a")\n');
  // JavaScript : « { » puis Entrée : l'accolade fermante sur sa propre ligne.
  await caretAfter('let a');
  await page.keyboard.type(' = () => {');
  await page.keyboard.press('Enter');
  await page.keyboard.type('return 1;');
  assert.strictEqual(await codeText(1), 'let a = () => {\n  return 1;\n}');
  // C++ : « } » tapé en début de ligne retire un cran.
  await caretAfter('int b;');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x++;');
  await page.keyboard.press('Enter');
  await page.keyboard.type('}');
  assert.strictEqual(await codeText(2), 'int b;\n    x++;\n}');
  // HTML : balise ouvrante puis Entrée.
  await caretAfter('<ul>');
  await page.keyboard.press('Enter');
  await page.keyboard.type('<li>un</li>');
  assert.strictEqual(await codeText(3), '<ul>\n  <li>un</li>');
  // Réglages désactivés : retour à la ligne sans retrait.
  await v(() => window.FTCode.setSaisie((o) => { o.keep = false; o.open = false; o.pairs = false; o.widths.python = 4; }));
  await caretAfter('print("a")');
  await page.keyboard.press('End');
  await page.keyboard.type(' (');
  await page.keyboard.press('Enter');
  await page.keyboard.type('z');
  assert.ok((await codeText(0)).startsWith('x = 1\nif ok:\n  print("a") (\nz'), await codeText(0));
  await v(() => window.FTCode.setSaisie((o) => Object.assign(o, { keep: true, open: true, close: true, pairs: false, back: true, exit: true, widths: { python: 4, r: 2, cpp: 4, sql: 4, javascript: 2, html: 2, texte: 4 } })));
  ok('saisie : retrait par langage (Python 2 espaces choisi, C++ 4, JavaScript et HTML 2), fermeture automatique des paires et saut de la fermante, « { » + Entrée, « } » en début de ligne, retour arrière d’un cran entier ; réglages désactivables');
};
