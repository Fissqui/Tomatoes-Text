// Essai des listes (2.1.6) : tirets et listes numérotées tapés en début de ligne (« - », « 1. », « i. »,
// « a. »), « -- » pour décaler d'un niveau (même la première ligne : 1. devient 1.1.), retour arrière
// pour reculer d'un niveau puis sortir de la liste ; numérotation de chaque niveau (clic droit, Styles du
// document), tirets propres à une liste suivis par les sous-listes créées ensuite ; listes dans un
// tableau, un encadré, un titre ; export Word (numéros 1.1. avec la numérotation de chaque niveau).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-listes.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const SHOTS = process.env.FT_SHOTS || os.tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await page.context().newCDPSession(page);
  const reset = async (html) => {
    await page.keyboard.press('Escape');
    await v((h) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: 'note' } });
      document.getElementById('page').hidden = false;
    }, html);
    await page.waitForTimeout(200);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const posAfter = (text) => v((t) => {
    let p = null;
    window.FTMoteur.view.state.doc.descendants((n, q) => {
      if (p === null && n.isText && n.text.includes(t)) p = q + n.text.indexOf(t) + t.length;
    });
    return p;
  }, text);
  const select = (from) => v((a) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a)));
    w.focus();
  }, from);
  const caretAfter = async (text) => select(await posAfter(text));
  const caretBefore = async (text) => select(await posAfter(text) - text.length);
  const caretEnd = async () => v(() => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.Selection.atEnd(w.state.doc)));
    w.focus();
  });
  // Numéros et tirets affichés, dans l'ordre : le contenu des ::marker (compteurs ft-n1… et numérotation
  // résolus par la feuille de style), les compteurs comptés comme le fait le navigateur.
  const markers = () => v(() => {
    const roman = (n) => [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']].reduce((o, [k, r]) => { while (n >= k) { o += r; n -= k; } return o; }, '');
    const alpha = (n) => { let o = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) o = String.fromCharCode(97 + ((n - 1) % 26)) + o; return o; };
    const fmt = (n, st) => ({ 'lower-roman': roman(n), 'upper-roman': roman(n).toUpperCase(), 'lower-alpha': alpha(n), 'upper-alpha': alpha(n).toUpperCase() }[st] || String(n));
    const value = (li, name) => {
      for (let el = li; el && el.id !== 'editor'; el = el.parentElement) {
        const list = el.parentElement;
        if (el.tagName !== 'LI' || !list) continue;
        const reset = new RegExp(name + ' (-?\\d+)').exec(getComputedStyle(list).counterReset);
        if (!reset) continue;
        return Number(reset[1]) + [...list.children].filter((c) => c.tagName === 'LI').indexOf(el) + 1;
      }
      return 0;
    };
    return [...document.querySelectorAll('#editor li')].filter((li) => !li.closest('.ft-footnotes, .ft-endnotes') && getComputedStyle(li).display === 'list-item').map((li) => {
      const m = getComputedStyle(li, '::marker').content;
      if (m === 'none') return null;
      if (m === 'normal') { const t = getComputedStyle(li).listStyleType; return t === 'none' ? null : (/^"(.*)"$/.exec(t) || [, t])[1].trim(); }
      return m.replace(/counter\((ft-n\d+)(?:, ?([a-z-]+))?\)|"([^"]*)"|\s+/g, (all, name, style, str) => (str !== undefined ? str : name ? fmt(value(li, name), style || 'decimal') : '')).trim();
    }).filter((x) => x !== null);
  });
  const menuAt = async (sel) => {
    await page.click(sel, { button: 'right' });
    return v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  };
  // Choix d'un sous-menu par son texte exact (sans la coche).
  const pick = (text) => page.locator('button', { hasText: new RegExp('^[✓\\u2003 ]*' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
  await v(() => window.FTLayout.setCapitalize(false));

  // 1. Tirets : « - » + espace, « -- » décale (la première ligne aussi), retour arrière recule.
  await reset('<p><br></p>');
  await caretEnd();
  await page.keyboard.type('- un');
  assert.strictEqual(await saved(), '<ul><li>un</li></ul>');
  assert.deepStrictEqual(await markers(), ['–']);
  await caretBefore('un');
  await page.keyboard.type('--');
  assert.strictEqual(await saved(), '<ul><li data-porteur=""><ul><li>un</li></ul></li></ul>');
  assert.deepStrictEqual(await markers(), ['•']);
  await page.keyboard.type('--');
  assert.deepStrictEqual(await markers(), ['◦']);
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ul><li data-porteur=""><ul><li>un</li></ul></li></ul>');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ul><li>un</li></ul>');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<p>un</p>');
  ok('tirets : « - » crée la liste, « -- » décale la première ligne (• puis ◦), retour arrière recule puis la retire');

  await reset('<p><br></p>');
  await caretEnd();
  await page.keyboard.type('- un');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--deux');
  await page.keyboard.press('Enter');
  await page.keyboard.type('trois');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await saved(), '<ul><li>un<ul><li>deux</li><li>trois</li><li>--</li></ul></li></ul>');
  await page.keyboard.press('Control+y');
  await page.keyboard.type('quatre');
  assert.strictEqual(await saved(), '<ul><li>un<ul><li>deux</li><li>trois<ul><li>quatre</li></ul></li></ul></li></ul>');
  assert.deepStrictEqual(await markers(), ['–', '•', '•', '◦']);
  await caretBefore('trois');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ul><li>un<ul><li>deux</li></ul></li><li>trois<ul><li>quatre</li></ul></li></ul>');
  ok('tirets : « -- » sous la ligne du dessus, Ctrl+Z garde « -- » écrit, retour arrière remonte la ligne et ses sous-lignes');

  // 2. Listes numérotées : 1. → 1.1. → 1.1.1., retour arrière remet le numéro d'avant.
  await reset('<p><br></p>');
  await caretEnd();
  await page.keyboard.type('1. un');
  assert.deepStrictEqual(await markers(), ['1.']);
  await caretBefore('un');
  await page.keyboard.type('--');
  assert.deepStrictEqual(await markers(), ['1.1.']);
  await page.keyboard.type('--');
  assert.deepStrictEqual(await markers(), ['1.1.1.']);
  await page.keyboard.press('Backspace');
  assert.deepStrictEqual(await markers(), ['1.1.']);
  await page.keyboard.press('Backspace');
  assert.deepStrictEqual(await markers(), ['1.']);
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<p>un</p>');
  ok('numéros : « 1. » crée la liste, « -- » : 1. → 1.1. → 1.1.1., retour arrière : 1.1. → 1., puis texte');

  // Retour arrière répété sur la ligne 2. : le numéro part, puis la ligne rejoint la fin de la ligne 1.
  await reset('<p><br></p>');
  await caretEnd();
  await page.keyboard.type('1. un');
  await page.keyboard.press('Enter');
  await page.keyboard.type('deux');
  await caretBefore('deux');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ol><li>un</li></ol><p>deux</p>');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ol><li>undeux</li></ol>');
  await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ol><li>udeux</li></ol>');
  await reset('<p><br></p>');
  await caretEnd();
  await page.keyboard.type('1. un');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--sous');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  assert.strictEqual(await saved(), '<ol><li>un<ol><li>sou</li></ol></li></ol>');
  ok('retour arrière répété : le numéro 2. part, puis on remonte à la fin de la ligne du dessus et on continue d\'effacer');

  await reset('<p><br></p>');
  await caretEnd();
  for (const line of ['1. Intro', '--Contexte', 'Enjeux', '--Détail', 'Suite']) {
    await page.keyboard.type(line);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('Plan');
  assert.deepStrictEqual(await markers(), ['1.', '1.1.', '1.2.', '1.2.1.', '1.2.2.', '1.2.3.']);
  await caretBefore('Plan');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  assert.deepStrictEqual(await markers(), ['1.', '1.1.', '1.2.', '1.2.1.', '1.2.2.', '2.']);
  ok('numéros : 1. 1.1. 1.2. 1.2.1. …, une ligne remontée de deux niveaux devient 2.');

  for (const [typed, first, second] of [['i. ', 'i.', 'i.1.'], ['a. ', 'a.', 'a.1.'], ['A. ', 'A.', 'A.1.'], ['I. ', 'I.', 'I.1.']]) {
    await reset('<p><br></p>');
    await caretEnd();
    await page.keyboard.type(typed + 'un');
    await page.keyboard.press('Enter');
    await page.keyboard.type('--deux');
    assert.deepStrictEqual(await markers(), [first, second], typed);
  }
  ok('numéros : « i. », « a. », « A. », « I. » + espace, puis i.1., a.1. …');

  // 3. Numérotation de chaque niveau : clic droit (toute la liste), Styles du document.
  await reset('<ol><li>un<ol><li>deux<ol><li>trois</li></ol></li></ol></li><li>quatre<ol><li>cinq</li></ol></li></ol>');
  assert.deepStrictEqual(await markers(), ['1.', '1.1.', '1.1.1.', '2.', '2.1.']);
  let items = await menuAt('#editor li li > :first-child, #editor li li');
  assert(items.includes('Numérotation du niveau 2'), items.join(' | '));
  await page.hover('#context-menu button:has-text("Numérotation du niveau 2")');
  await pick('1.a.  1.b.  1.c.');
  assert.deepStrictEqual(await markers(), ['1.', '1.a.', '1.a.1.', '2.', '2.a.']);
  assert(/^<ol data-n2="a">/.test(await saved()), await saved());
  await page.click('#editor li li li', { button: 'right' });
  await page.hover('#context-menu button:has-text("Numérotation du niveau 3")');
  await pick('1.a.i.  1.a.ii.  1.a.iii.');
  assert.deepStrictEqual(await markers(), ['1.', '1.a.', '1.a.i.', '2.', '2.a.']);
  await page.click('#editor > ol > li', { button: 'right', position: { x: 40, y: 5 } });
  await page.hover('#context-menu button:has-text("Numérotation")');
  await pick('I.  II.  III.');
  assert.deepStrictEqual(await markers(), ['I.', 'I.a.', 'I.a.i.', 'II.', 'II.a.']);
  ok('clic droit « Numérotation du niveau 2 » : 1.a. pour toute la liste ; niveau 3 : 1.a.i. ; niveau 1 : I.');

  // Styles du document, onglet Numéros : style prêt pour cette liste, puis pour tout le document.
  await reset('<ol><li>un<ol><li>deux<ol><li>trois</li></ol></li></ol></li></ol><p>entre</p><ol><li>autre<ol><li>sous</li></ol></li></ol>');
  await caretAfter('deux');
  await page.click('#docstyles-btn');
  await page.click('#ds-tabs button[data-kind="numeros"]');
  assert(await v(() => document.querySelector('#ds-scope button.on').textContent === 'Cette liste'));
  await page.click('#ds-panel .ds-gallery button[title="Plan classique"]');
  assert.deepStrictEqual(await markers(), ['I.', 'I.A.', 'I.A.1.', '1.', '1.1.']);
  await page.screenshot({ path: path.join(SHOTS, 'listes-numeros.png') });
  await page.click('#ds-scope button:has-text("Tout le document")');
  await page.click('#ds-panel .ds-gallery button[title="Chiffres et lettres"]');
  assert.deepStrictEqual(await markers(), ['1.', '1.a.', '1.a.i.', '1.', '1.a.']);
  await page.selectOption('#ds-panel .styles-panel select >> nth=1', 'A');
  assert.deepStrictEqual(await markers(), ['1.', '1.A.', '1.A.i.', '1.', '1.A.']);
  await page.click('#ds-panel .ds-gallery button[title="Chiffres"]');
  assert.deepStrictEqual(await markers(), ['1.', '1.1.', '1.1.1.', '1.', '1.1.']);
  await page.click('#ds-close');
  ok('Styles du document, onglet « Numéros » : style prêt pour une liste (I. I.A. I.A.1.), pour le document, réglage d\'un niveau');

  // Tirets propres à une liste : une sous-liste créée ensuite prend le tiret de son niveau.
  await reset('<ul><li>un</li></ul>');
  await caretAfter('un');
  await page.click('#docstyles-btn');
  await page.click('#ds-tabs button[data-kind="tirets"]');
  await page.click('#ds-panel .ds-gallery button[title="Flèches"]');
  await page.click('#ds-close');
  await caretAfter('un');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--deux');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--trois');
  assert.deepStrictEqual(await markers(), ['→', '▸', '–']);
  ok('tirets propres à une liste (Flèches) : les niveaux créés ensuite par « -- » suivent → ▸ –');

  // Menu rapide des tirets : tirets et numéros.
  await reset('<ol><li>un</li></ol>');
  await caretAfter('un');
  await page.click('#bullets-more');
  const titles = await v(() => [...document.querySelectorAll('#bullets-pop .pop-title')].map((t) => t.textContent));
  assert.deepStrictEqual(titles, ['Styles des tirets', 'Styles des numéros']);
  await page.click('#bullets-pop .ds-quick-more .ds-gallery button[title="Lettres"]');
  assert.deepStrictEqual(await markers(), ['a.']);
  await page.keyboard.press('Escape');
  ok('menu rapide des tirets (flèche) : styles des tirets et des numéros');

  // 4. Tableaux, encadrés, titres.
  await reset('<table class="ft-table"><tbody><tr><td><br></td><td><br></td></tr></tbody></table><blockquote class="ft-callout"><p><br></p></blockquote><h2>Titre</h2><p>fin</p>');
  await select(4);
  await page.keyboard.type('- case');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--sous');
  await page.keyboard.press('Tab');
  await page.keyboard.type('1. numéro');
  let out = await saved();
  assert(out.startsWith('<table class="ft-table"><tbody><tr><td><ul><li>case<ul><li>sous</li></ul></li></ul></td><td><ol><li>numéro</li></ol></td></tr></tbody></table>'), out);
  await caretEnd();
  await v(() => {
    const w = window.FTMoteur.view;
    let pos = null;
    w.state.doc.descendants((n, p) => { if (pos === null && n.type.name === 'blockquote') pos = p + 2; });
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, pos)));
    w.focus();
  });
  await page.keyboard.type('a. encadré');
  await caretBefore('Titre');
  await page.keyboard.type('1. ');
  out = await saved();
  assert(out.includes('<blockquote class="ft-callout"><ol data-num="lettre-min"><li>encadré</li></ol></blockquote><ol><li><h2>Titre</h2></li></ol><p>fin</p>'), out);
  await page.keyboard.type('--');
  assert(out = await saved(), out.includes('<ol><li data-porteur=""><ol><li><h2>Titre</h2></li></ol></li></ol>'));
  assert.deepStrictEqual((await markers()).slice(-1), ['1.1.']);
  await page.screenshot({ path: path.join(SHOTS, 'listes-tableau-titre.png') });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  assert((await saved()).includes('</blockquote><h2>Titre</h2><p>fin</p>'), await saved());
  ok('tableau (tirets, -- , numéros), encadré (a.), titre : « 1. » numérote le titre, -- : 1.1., retour arrière le rend');

  // Menu Titres : un titre dans une liste reste dans la liste ; « Texte normal » le remet en texte.
  await reset('<ul><li>ligne</li></ul>');
  await caretAfter('ligne');
  await v(() => window.FTBlocs.setBlock('h3'));
  assert.strictEqual(await saved(), '<ul><li><h3>ligne</h3></li></ul>');
  await v(() => window.FTBlocs.setBlock('p'));
  assert.strictEqual(await saved(), '<ul><li>ligne</li></ul>');
  ok('menu Titres dans une liste : Titre 3 garde le tiret, Texte normal revient');

  // 5. Export Word : niveaux 1., 1.a., 1.a.i. (numérotation de chaque niveau, numéros au-dessus).
  await reset('<ol data-n2="a" data-n3="i"><li>un<ol><li>deux<ol><li>trois</li></ol></li></ol></li><li data-porteur=""><ol><li>porté</li></ol></li></ol>');
  const bytes = await v(async () => Array.from(await window.FTWord.exportWord()));
  const file = path.join(os.tmpdir(), 'essai-listes.docx');
  fs.writeFileSync(file, Buffer.from(bytes));
  const numbering = execFileSync('unzip', ['-p', file, 'word/numbering.xml']).toString();
  const doc = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString();
  const abs = numbering.match(/<w:abstractNum [\s\S]*?<\/w:abstractNum>/g).find((a) => a.includes('w:val="%1.%2."'));
  const lvl = (i) => new RegExp(`<w:lvl w:ilvl="${i}"[^>]*>[\\s\\S]*?</w:lvl>`).exec(abs)[0];
  assert(/w:numFmt w:val="decimal"/.test(lvl(0)) && /w:lvlText w:val="%1\."/.test(lvl(0)), lvl(0));
  assert(/w:numFmt w:val="lowerLetter"/.test(lvl(1)) && /w:lvlText w:val="%1\.%2\."/.test(lvl(1)), lvl(1));
  assert(/w:numFmt w:val="lowerRoman"/.test(lvl(2)) && /w:lvlText w:val="%1\.%2\.%3\."/.test(lvl(2)), lvl(2));
  const paras = doc.match(/<w:p>[\s\S]*?<\/w:p>|<w:p [\s\S]*?<\/w:p>/g).filter((p) => /<w:t[ >]/.test(p) || /numPr/.test(p));
  const numbered = paras.filter((p) => /numPr/.test(p));
  assert.strictEqual(numbered.length, 5);
  assert.strictEqual(numbered.filter((p) => /<w:vanish\/>/.test(p) && !/<w:t[ >]/.test(p)).length, 1, 'ligne porteuse : paragraphe masqué');
  ok('export Word : 1. 1.a. 1.a.i. (%1.%2.%3.), ligne porteuse masquée (elle compte : 2. ensuite, comme dans le logiciel)');

  // EPUB : les numéros écrits devant chaque ligne (les liseuses ne composent pas 1.a.i.).
  const book = await v(async () => JSON.parse(JSON.stringify(await window.FTEpub.build())));
  const files = Array.isArray(book) ? book : book.files;
  const text = files.filter((f) => /\.xhtml$/.test(f.name)).map((f) => f.text).join('');
  const nums = [...text.matchAll(/<span class="ft-num">([^<]*)<\/span>/g)].map((m) => m[1].trim());
  assert.deepStrictEqual(nums, ['1.', '1.a.', '1.a.i.', '2.a.'], text);
  assert.deepStrictEqual(await markers(), nums);
  ok('export EPUB : numéros écrits devant les lignes (1. 1.a. 1.a.i., ligne portée 2.a.), comme dans le logiciel');
  // Notes après une liste numérotée : elles gardent leur numérotation (i., 1.), elles ne continuent pas
  // celle de la liste.
  await reset('<ol><li>a</li><li>b</li><li>c</li></ol><p>Texte.</p><div class="ft-endnotes"><ol><li>Note de fin.</li></ol></div><div class="ft-footnotes"><ol><li>Note.</li><li>Autre.</li></ol></div>');
  const notes = await v(() => [...document.querySelectorAll('#editor :is(.ft-footnotes, .ft-endnotes) li')].map((li) => getComputedStyle(li, '::marker').content + ' / ' + getComputedStyle(li).counterIncrement));
  assert.ok(notes.length === 3 && notes.every((m) => !/ft-n\d/.test(m)), JSON.stringify(notes));
  assert.deepStrictEqual(await markers(), ['1.', '2.', '3.']);
  ok('notes de fin et de bas de page après une liste numérotée : leur propre numérotation, pas celle de la liste');

  // 2.2.7 : liste commencée à un autre numéro (« 2. », « II. », « iv. ») ; « M. Dupont » reste du texte ;
  // tiret ou numéro au format du texte qu'il précède (titre, texte gras rouge en 18 pt).
  await reset('<p><br></p>');
  await page.click('#editor > p');
  for (const t of ['## II. Second titre', '', '2. Deux', '', 'iv. petit', '', 'M. Dupont']) {
    if (t) await page.keyboard.type(t);
    await page.keyboard.press('Enter');
  }
  const typed = await saved();
  assert(typed.includes('<ol data-num="romain-maj" start="2"><li><h2 data-nonum="oui">Second titre</h2></li></ol>') && typed.includes('<ol start="2"><li>Deux</li></ol>')
    && typed.includes('<ol data-num="romain-min" start="4"><li>petit</li></ol>') && typed.includes('<p>M. Dupont</p>'), typed);
  await reset('<ol><li><h2>Titre</h2></li></ol><ul><li><p><strong><span style="color: rgb(200, 0, 0); font-size: 18pt">Gros rouge</span></strong></p></li><li><p>normal</p></li></ul>');
  await page.waitForTimeout(400);
  const looks = await v(() => [...document.querySelectorAll('#editor li')].map((li) => {
    const m = getComputedStyle(li, '::marker');
    const t = getComputedStyle(li.querySelector('span') || li.querySelector('h2, p'));
    return { same: m.fontSize === t.fontSize && m.fontWeight === t.fontWeight && m.color === t.color, size: m.fontSize, color: m.color };
  }));
  assert(looks[0].same && looks[1].same && looks[1].size === '24px' && looks[1].color === 'rgb(200, 0, 0)' && looks[2].size === '16px', JSON.stringify(looks));
  ok('« II. », « 2. », « iv. » commencent une liste à ce numéro (« M. Dupont » reste du texte) ; tiret ou numéro au format du texte qui suit');
  // 2.2.9 : filet d'un titre dans une liste (style du document ou style propre au titre) jusque sous
  // le numéro ; titre vidé puis effacé : une ligne de texte simple ; « ## » + espace dans un titre.
  await reset('<ol data-num="romain-maj"><li><h2 data-nonum="oui" data-hs="{}" style="border-bottom: 1px solid; padding-bottom: 0.15em;">Test</h2></li></ol><p>x</p>');
  await page.waitForTimeout(300);
  const rule = await v(() => { const h = document.querySelector('#editor h2'); const a = getComputedStyle(h, '::after'); return { bb: getComputedStyle(h).borderBottomWidth, ab: a.borderBottomWidth, left: parseFloat(a.left) }; });
  assert(rule.bb === '0px' && rule.ab === '1px' && rule.left < -20, JSON.stringify(rule));
  await page.click('#editor h2');
  await page.keyboard.press('End');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  let cleared = await saved();
  assert(cleared.startsWith('<p></p>') || cleared.startsWith('<p><br></p>'), cleared);
  await page.keyboard.type('# Un');
  await page.keyboard.press('Home');
  await page.keyboard.type('### ');
  cleared = await saved();
  assert(cleared.startsWith('<h3 data-nonum="oui">Un</h3>'), cleared);
  ok('filet sous le numéro d’un titre de liste ; titre effacé = ligne de texte simple ; « ### » + espace change l’étage d’un titre');
  // 2.2.13 (signalement) : « # Test » sous une ligne vide, effacé au Retour arrière : la ligne redevient du
  // texte à sa place, le titre ne remonte pas sur la ligne vide.
  await reset('<p>Avant</p><p><br></p><p><br></p>');
  await page.click('#editor > p:last-child');
  await page.keyboard.type('# Test');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  const back = await saved();
  assert(!/<h\d/.test(back) && (back.match(/<p>/g) || []).length >= 2, back);
  ok('titre tapé sous une ligne vide puis effacé : ligne de texte à sa place');
};
