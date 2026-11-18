// Essai du nouveau moteur d'édition (préversion 2.0, étape 1 : le socle).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-moteur.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

module.exports = async ({ page, electron }) => {
  const { handlers } = electron._test;
  const ok = (m) => console.log('  OK  ' + m);
  // (Texte tapé tel quel : la majuscule automatique a son propre essai, essai-ecriture-moteur.js.)
  await page.evaluate(() => window.FTLayout.setCapitalize(false));
  const call = (ch, ...a) => handlers.get(ch)({ sender: { send() {} } }, ...a);
  const html = () => page.evaluate(() => window.FTEditor.getHtml());
  const load = (h, settings = {}) => page.evaluate(([h, s]) => {
    window.FTEditor.load({ content: { html: h }, settings: s });
    document.getElementById('page').hidden = false;
  }, [h, settings]);
  // Curseur à la fin du texte d'un bloc (n-ième bloc de premier niveau, à partir de 0).
  const caretEnd = (i) => page.evaluate((i) => {
    const v = window.FTMoteur.view;
    let pos = 0;
    for (let k = 0; k < i; k++) pos += v.state.doc.child(k).nodeSize;
    const end = pos + v.state.doc.child(i).nodeSize - 1;
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.near(v.state.doc.resolve(end), -1)));
  }, i);
  const selectText = (text) => page.evaluate((text) => {
    const v = window.FTMoteur.view;
    let found = null;
    v.state.doc.descendants((n, p) => {
      if (found || !n.isText) return !found;
      const i = n.text.indexOf(text);
      if (i >= 0) found = p + i;
      return false;
    });
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, found, found + text.length)));
  }, text);

  // 1. Le moteur a pris la place de l'ancienne zone d'écriture.
  const setup = await page.evaluate(() => ({
    editor: document.getElementById('editor').classList.contains('ProseMirror'),
    old: document.getElementById('editor-ancien').hidden,
    label: document.querySelector('.brand-codename').textContent.trim()
  }));
  assert(setup.editor && setup.old, JSON.stringify(setup));
  assert(/^Corbarino 2\.4/.test(setup.label), setup.label);
  ok('zone d’écriture du moteur en place (' + setup.label + ')');

  // 2. Documents du mode présentation : ouverts puis réenregistrés à l'identique.
  const dir = path.join(__dirname, '..', '..', 'src', 'presentation');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tmtx')).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const res = await page.evaluate((d) => {
      window.FTEditor.load(d);
      const out = window.FTEditor.getHtml();
      const a = window.FTSchema.canonical(d.content.html);
      const b = window.FTSchema.canonical(out);
      if (a === b) return { same: true };
      let i = 0;
      while (a[i] === b[i]) i++;
      return { same: false, a: a.slice(Math.max(0, i - 80), i + 120), b: b.slice(Math.max(0, i - 80), i + 120) };
    }, doc);
    assert(res.same, f + '\n  avant : ' + res.a + '\n  après : ' + res.b);
  }
  ok('9 documents du mode présentation : réenregistrés à l’identique');

  // 3. Lignes vides et retours à la ligne gardés tels quels.
  for (const h of ['<p><br></p>', '<p>a<br><br></p>', '<p>a<br>b</p>', '<ul><li><br></li></ul>', '<table class="ft-table"><tbody><tr><td><br></td><td>x</td></tr></tbody></table>',
    '<p>deux  espaces&nbsp; et <b>gras</b></p>', '<blockquote class="ft-callout"><p>a</p><p><br></p></blockquote>']) {
    await load(h);
    const out = await html();
    assert.strictEqual(await page.evaluate(([a, b]) => window.FTSchema.canonical(a) === window.FTSchema.canonical(b), [h, out]), true, h + ' -> ' + out);
  }
  ok('lignes vides, retours à la ligne et espaces doubles : identiques après enregistrement');

  // 4. Frappe, gras, italique, souligné, barré (boutons et raccourcis).
  await load('<p><br></p>');
  await caretEnd(0);
  await page.keyboard.type('Un ');
  await page.keyboard.press('Control+g');
  await page.keyboard.type('deux');
  await page.keyboard.press('Control+g');
  await page.keyboard.type(' trois');
  assert.strictEqual(await html(), '<p>Un <b>deux</b> trois</p>');
  await selectText('trois');
  await page.click('#toolbar [data-cmd="italic"]');
  await page.click('#toolbar [data-cmd="underline"]');
  await page.keyboard.press('Control+Shift+x');
  assert.strictEqual(await html(), '<p>Un <b>deux</b> <i><u><s>trois</s></u></i></p>');
  await selectText('trois');
  await page.click('#toolbar [data-cmd="italic"]');
  assert.strictEqual(await html(), '<p>Un <b>deux</b> <u><s>trois</s></u></p>');
  // Gras posé par un style (texte des versions 1.x) : reconnu et retiré.
  await load('<p>Un <span style="font-weight: bold; color: red;">rouge gras</span></p>');
  await selectText('rouge gras');
  await page.waitForTimeout(250);
  assert(await page.evaluate(() => document.querySelector('#toolbar [data-cmd="bold"]').classList.contains('on')), 'bouton Gras allumé');
  await page.keyboard.press('Control+b');
  assert.strictEqual(await html(), '<p>Un <span style="color: red;">rouge gras</span></p>');
  ok('frappe, gras, italique, souligné, barré (boutons, raccourcis, texte des versions 1.x)');

  // Taille choisie dans la liste (le champ chiffré des réglages cache la liste d'origine).
  const fontSize = (v) => page.evaluate((v) => {
    const s = document.getElementById('font-size');
    s.value = v;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);

  // 5. Police, taille, couleur, surlignage, petites capitales : un seul <span> par passage.
  await load('<p>Le texte à mettre en forme.</p>');
  await selectText('texte');
  await fontSize('16');
  await selectText('texte');
  await page.click('#color-more');
  await page.click('#color-pop [data-color]');
  let out = await html();
  assert(/<span style="font-size: 16pt; color: [^"]+;">texte<\/span>/.test(out), out);
  await selectText('texte');
  await fontSize('20');
  out = await html();
  assert(/<span style="font-size: 20pt; color: [^"]+;">texte<\/span>/.test(out), out);
  await selectText('mettre');
  await page.click('#hl-btn');
  await selectText('forme');
  await page.click('#smallcaps-btn');
  out = await html();
  assert(/<span style="background-color: rgba\(255, 221, 0, 0\.45\);">mettre<\/span>/.test(out), out);
  assert(/<span style="font-variant-caps: small-caps;">forme<\/span>/.test(out), out);
  await selectText('texte');
  await page.click('#color-more');
  await page.click('#color-auto');
  out = await html();
  assert(/<span style="font-size: 20pt;">texte<\/span>/.test(out), out);
  ok('taille, couleur, surlignage, petites capitales, couleur automatique');

  // 6. Alignement et alinéa automatique.
  await load('<p>Premier</p><p>Second</p>');
  await selectText('Second');
  await page.keyboard.press('Control+e');
  assert.strictEqual(await html(), '<p>Premier</p><p style="text-align: center;">Second</p>');
  await caretEnd(0);
  await page.click('#toolbar [data-align="right"]');
  assert.strictEqual(await html(), '<p style="text-align: right;">Premier</p><p style="text-align: right;">Second</p>');
  await page.click('#toolbar [data-align="left"]');
  assert.strictEqual(await html(), '<p>Premier</p><p>Second</p>');
  await page.click('#auto-indent');
  assert(await page.evaluate(() => window.FTEditor.getAutoIndent() && document.getElementById('editor').classList.contains('auto-indent')));
  await page.click('#auto-indent');
  ok('alignement (paragraphes sélectionnés, tout le texte sans sélection) et alinéa automatique');

  // 7. Raccourcis de saisie : titres, listes, liste à cocher, encadré, ligne de séparation.
  await load('<p><br></p>');
  await caretEnd(0);
  await page.keyboard.type('## Titre deux');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- un');
  await page.keyboard.press('Enter');
  await page.keyboard.type('deux');
  await page.keyboard.press('Enter');
  await page.keyboard.type('--trois');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. premier');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('i. romain');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[x] fait');
  await page.keyboard.press('Enter');
  await page.keyboard.type('à faire');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('> encadré');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('__');
  await page.keyboard.type('fin');
  out = await html();
  assert.strictEqual(out, '<h2 data-nonum="oui">Titre deux</h2><ul><li>un</li><li>deux<ul><li>trois</li></ul></li></ul>'
    + '<ol><li>premier</li></ol><ol data-num="romain-min"><li>romain</li></ol>'
    + '<ul class="ft-check"><li data-checked="oui">fait</li><li>à faire</li></ul>'
    + '<blockquote class="ft-callout"><p>encadré</p></blockquote><hr class="ft-rule"><p>fin</p>');
  ok('raccourcis de saisie : ## titre, - liste, -- pour décaler, 1. et i. numérotées, [x] à cocher, > encadré, __ ligne');

  // Ctrl+Z juste après un raccourci : la transformation est annulée, le texte tapé reste.
  await load('<p><br></p>');
  await caretEnd(0);
  await page.keyboard.type('# ');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await html(), '<p># </p>');
  ok('Ctrl+Z après un raccourci de saisie : « # » reste écrit, sans titre');

  // « # » seul : titre sans numéro (même si le thème numérote les titres) ; « # » puis « 1. » : titre numéroté.
  await load('<p><br></p>');
  await caretEnd(0);
  await page.keyboard.type('## 1. Numéroté');
  assert.strictEqual(await html(), '<ol><li><h2 data-nonum="oui">Numéroté</h2></li></ol>');
  ok('« ## » + espace : titre sans numéro ; puis « 1. » + espace : titre numéroté');

  // 8. Retour arrière au début d'un titre, d'une ligne de liste, d'un encadré.
  await load('<h2>Titre</h2><ul><li>un</li><li>deux</li></ul><blockquote class="ft-callout"><p>dans</p></blockquote>');
  await page.evaluate(() => {
    const v = window.FTMoteur.view;
    v.focus();
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.create(v.state.doc, 1)));
  });
  await page.keyboard.press('Backspace');
  assert(/^<p>Titre<\/p>/.test(await html()));
  await selectText('deux');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  assert(/<ul><li>un<\/li><\/ul><p>deux<\/p>/.test(await html()), await html());
  await selectText('dans');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  assert(/<p>deux<\/p><p>dans<\/p>$/.test(await html()), await html());
  ok('retour arrière : titre → texte, ligne de liste → paragraphe, sortie d’un encadré');

  // 9. Menu « Titres, listes et encadrés » et boutons de la barre d'insertion.
  await load('<p>Une ligne</p><p>Une autre</p>');
  await caretEnd(0);
  await page.click('#structure-btn');
  await page.click('#structure-pop button:has(.ft-preview-h0)');
  assert(/^<h1 class="ft-title">Une ligne<\/h1>/.test(await html()), await html());
  await caretEnd(1);
  await page.click('#bullets-btn');
  assert(/<ul><li>Une autre<\/li><\/ul>$/.test(await html()), await html());
  await page.click('#structure-btn');
  await page.click('#structure-pop .num-style:nth-child(3)');
  assert(/<ol data-num="romain-maj"><li>Une autre<\/li><\/ol>$/.test(await html()), await html());
  await page.click('#check-btn');
  assert(/<ul class="ft-check"><li>Une autre<\/li><\/ul>$/.test(await html()), await html());
  await page.click('#check-btn');
  assert(/<p>Une autre<\/p>$/.test(await html()), await html());
  await page.click('#callout-btn');
  assert(/<blockquote class="ft-callout"><p>Une autre<\/p><\/blockquote>$/.test(await html()), await html());
  await page.click('#quote-btn');
  out = await html();
  assert(/<blockquote class="ft-callout ft-quote"[^>]*><p>Une autre<\/p><\/blockquote>$/.test(out), out);
  await page.click('#quote-btn');
  assert(/<p>Une autre<\/p>$/.test(await html()), await html());
  ok('menu Titres (titre du document, numérotation I.), boutons liste, case à cocher, encadré, citation');

  // Case à cocher : un clic la coche.
  await load('<ul class="ft-check"><li>tâche</li></ul>');
  const box = await page.evaluate(() => { const r = document.querySelector('#editor li').getBoundingClientRect(); return { x: r.left - 10, y: r.top + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  assert.strictEqual(await html(), '<ul class="ft-check"><li data-checked="oui">tâche</li></ul>');
  ok('clic sur la case : cochée');

  // 10. Tableaux : insertion, tabulation, ligne ajoutée à la fin, menu du clic droit.
  await load('<p>Avant</p>');
  await caretEnd(0);
  await page.click('#table-quick');
  out = await html();
  assert(/^<p>Avant<\/p><table class="ft-table" data-style="quadrille"[^>]*data-header="oui"[^>]*data-t="2"><tbody>(<tr>(<td><br><\/td>){3}<\/tr>){3}<\/tbody><\/table><p><br><\/p>$/.test(out), out);
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.type('b');
  for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
  await page.keyboard.type('i');
  await page.keyboard.press('Tab');
  await page.keyboard.type('j');
  out = await html();
  assert(/<tr><td>a<\/td><td>b<\/td><td><br><\/td><\/tr>/.test(out) && /<tr><td><br><\/td><td><br><\/td><td>i<\/td><\/tr><tr><td>j<\/td><td><br><\/td><td><br><\/td><\/tr>/.test(out), out);
  const cell = await page.evaluate(() => { const r = document.querySelector('#editor td').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 8 }; });
  await page.mouse.click(cell.x, cell.y, { button: 'right' });
  await page.waitForTimeout(100);
  const menu = await page.evaluate(() => [...document.querySelectorAll('#context-menu button, .context-menu button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()));
  assert(menu.includes('Lignes et colonnes') && menu.includes('Supprimer le tableau'), menu.join(' | '));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const v = window.FTMoteur.view; window.FTMoteur.run(PM.tables.addColumnAfter); void v; });
  assert(/<tr><td>a<\/td><td><br><\/td><td>b<\/td><td><br><\/td><\/tr>/.test(await html()) || /<td>a<\/td><td>b<\/td>/.test(await html()));
  ok('tableau 3 × 3 (style du thème), tabulation, ligne ajoutée en fin de tableau, menu du clic droit');

  // 11. Annuler, rétablir (boutons, Ctrl+Z, Ctrl+Y), groupés par pause de frappe.
  await load('<p><br></p>');
  await caretEnd(0);
  await page.keyboard.type('Première phrase.');
  await page.waitForTimeout(700);
  await page.keyboard.type(' Seconde.');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await html(), '<p>Première phrase.</p>');
  await page.click('#undo-btn');
  assert.strictEqual(await html(), '<p><br></p>');
  assert(await page.evaluate(() => document.getElementById('undo-btn').classList.contains('inactive')));
  await page.keyboard.press('Control+y');
  await page.click('#redo-btn');
  assert.strictEqual(await html(), '<p>Première phrase. Seconde.</p>');
  ok('annuler / rétablir : par pause de frappe, boutons et raccourcis, bouton grisé au bout');

  // 12. Coller : texte venu d'ailleurs nettoyé ; passage copié dans le document collé tel quel.
  await load('<p>Début </p>');
  await caretEnd(0);
  const paste = (data) => page.evaluate((data) => {
    const dt = new DataTransfer();
    for (const [k, v] of Object.entries(data)) dt.setData(k, v);
    document.getElementById('editor').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
  await paste({ 'text/html': '<span style="color: rgb(200, 0, 0); background: yellow; font-family: Arial">venu <b>du web</b></span>', 'text/plain': 'venu du web' });
  out = await html();
  assert.strictEqual(out, '<p>Début venu <b>du web</b></p>');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  const copied = await page.evaluate(() => {
    const v = window.FTMoteur.view;
    const slice = v.state.selection.content();
    return PM.view.__serializeForClipboard ? null : window.FTSchema.serializeFragment(slice.content);
  });
  assert(copied.includes('<b>du web</b>'), copied);
  ok('collage : mise en forme d’une page web retirée (gras gardé)');

  // 13. Enregistrement sur le disque et réouverture.
  const lib = await call('library:load');
  const entry = lib.docs[0];
  await page.evaluate((f) => window.FTApp.openDocById ? null : f, entry.fileName);
  await page.click(`#sidebar .doc-item, #sidebar [data-file="${entry.fileName}"]`).catch(() => {});
  await page.evaluate(() => window.FTEditor.focus());
  await page.keyboard.type(' Texte enregistré.');
  await page.waitForTimeout(2500);
  const file = path.join(lib.folder, entry.fileName);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert(saved.content.html.includes('Texte enregistré.'), saved.content.html);
  assert.strictEqual(saved.content.html, await html());
  ok('enregistrement automatique : le fichier contient exactement le texte du moteur');

  // 14. Document en mode avancé : ouvert en pages (étape 2), son mode gardé dans le fichier.
  await page.evaluate(() => window.FTEditor.load({ content: { html: '<p>x</p>' }, settings: { mode: 'avance' } }));
  await page.waitForTimeout(100);
  const s = await page.evaluate(() => window.FTPages.getSettings().mode);
  assert.strictEqual(s, 'avance');
  assert(await page.evaluate(() => document.getElementById('page').classList.contains('paged') && document.querySelectorAll('.pg-sheet').length === 1));
  await page.evaluate(() => window.FTEditor.load({ content: { html: '<p>x</p>' }, settings: { mode: 'note' } }));
  ok('document en mode avancé : ouvert en pages, son mode gardé dans le fichier');

  // 15. Outils des versions 1.x : tous repris (le mode lecture, repris en dernier, s'ouvre).
  await page.click('#reading-btn');
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.getElementById('app').classList.contains('reading-mode')));
  await page.evaluate(() => window.FTReading.set(false));
  await page.waitForTimeout(100);
  ok('outils des versions 1.x : le bouton du mode lecture l’ouvre');

  // 16. Compteur de mots : même compte qu'avant sur les documents du mode présentation.
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.tmtx')).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const res = await page.evaluate((d) => {
      window.FTEditor.load(d);
      const mine = window.FTEditor.countWords();
      // Compte des versions 1.x : innerText de la zone d'écriture.
      const box = document.createElement('div');
      box.className = 'pv-count';
      box.style.cssText = 'position:absolute; left:-9999px; width:600px; white-space:normal';
      box.innerHTML = d.content.html;
      document.body.append(box);
      const text = box.innerText;
      box.remove();
      let words = 0;
      let inWord = false;
      for (const c of text) { const sp = /\s/.test(c); if (!sp && !inWord) words++; inWord = !sp; }
      return { mine: mine.words, old: words };
    }, doc);
    assert(Math.abs(res.mine - res.old) <= Math.max(3, res.old * 0.01), f + ' : ' + JSON.stringify(res));
  }
  ok('compteur de mots : comme les versions 1.x sur les 9 documents (à 1 % près)');
};
