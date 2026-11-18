// Essai de l'index : marquer un mot au clic droit, panneau « Mots de l'index » (ajout, autres formes,
// sous-entrée, compte, surlignage), bloc « Index » (lettres, ordre, pages en mode avancé, plages),
// clic sur une entrée, enregistrement dans le document, export Word.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const menu = (re) => page.evaluate((s) => {
    const b = [...document.querySelectorAll('#context-menu button')].find((x) => new RegExp(s).test(x.textContent));
    if (!b) throw new Error('menu sans « ' + s + ' » : ' + [...document.querySelectorAll('#context-menu button')].map((x) => x.textContent).join(' | '));
    b.click();
  }, re);
  await page.evaluate(() => {
    const fill = (t) => `<p>${t} ` + 'Le terrain garde la trace des saisons passées et des usages anciens. '.repeat(9) + '</p>';
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Paysages</h1>' +
      '<p id="p1">L’érosion façonne les versants ; le climat règle son rythme.</p>' + fill('Introduction.') + fill('Cadre.') + fill('Terrain.') + fill('Sources.') + fill('Méthode.') +
      '<p id="p2">Les érosions successives creusent le ravinement des pentes.</p>' + fill('Suite.') + fill('Encore.') +
      fill('Milieu.') + fill('Développement.') + fill('Exemples.') +
      '<p id="p3">Érosion et ravinement, encore : le Climat change, l’érosion suit.</p>' + fill('Fin.') +
      '<p id="end">Conclusion.</p>';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(400);

  // 1. Clic droit sur un mot : « Marquer pour l'index », puis « Retirer de l'index ».
  const wordPos = (id, word) => page.evaluate(([i, w]) => {
    const t = document.getElementById(i).firstChild;
    const k = t.data.indexOf(w);
    const r = document.createRange(); r.setStart(t, k + 1); r.setEnd(t, k + 2);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, [id, word]);
  let pos = await wordPos('p1', 'érosion');
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(150);
  await menu('^Marquer pour l’index$');
  await page.waitForTimeout(100);
  let st = await page.evaluate(() => window.FTIndex.get());
  assert.deepStrictEqual(st, [{ term: 'érosion', variants: [], parent: '' }]);
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(150);
  st = await page.evaluate(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent));
  assert(st.includes('Retirer de l’index') && !st.includes('Marquer pour l’index'), st.join(' | '));
  await page.keyboard.press('Escape');
  ok('clic droit sur « érosion » : marqué ; le menu propose ensuite « Retirer de l’index »');

  // 2. Panneau « Mots de l'index » : ajout, autres formes, sous-entrée, comptes, surlignage.
  await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('end')); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.click('#index-btn');
  await page.waitForTimeout(100);
  await menu('^Mots de l’index…$');
  await page.waitForTimeout(150);
  await page.fill('#ix-add', 'climat');
  await page.press('#ix-add', 'Enter');
  await page.fill('#ix-add', 'ravinement');
  await page.click('#ix-add-btn');
  await page.fill('#ix-add', 'glacier');
  await page.click('#ix-add-btn');
  await page.waitForTimeout(500);
  const row = (term) => page.evaluate((t) => [...document.querySelectorAll('#ix-list .ix-row')].findIndex((r) => r.querySelector('.ix-term').value === t), term);
  let i = await row('érosion');
  await page.fill(`#ix-list .ix-row:nth-child(${i + 1}) .ix-variants`, 'érosions');
  await page.press(`#ix-list .ix-row:nth-child(${i + 1}) .ix-variants`, 'Tab');
  i = await row('ravinement');
  await page.selectOption(`#ix-list .ix-row:nth-child(${i + 1}) .ix-parent`, 'érosion');
  await page.waitForTimeout(600);
  st = await page.evaluate(() => ({
    rows: [...document.querySelectorAll('#ix-list .ix-row')].map((r) => r.querySelector('.ix-term').value + (r.classList.contains('sub') ? '>' : '') + ' ' + r.querySelector('.ix-count').textContent),
    marks: CSS.highlights.get('ft-index') ? CSS.highlights.get('ft-index').size : 0
  }));
  assert.deepStrictEqual(st.rows, ['climat 2 occurrences', 'érosion 4 occurrences', 'ravinement> 2 occurrences', 'glacier absent du texte']);
  assert.strictEqual(st.marks, 8);
  await page.screenshot({ path: path.join(SHOTS, 'index-panneau.png') });
  ok('panneau : climat (2), érosion + « érosions » (4, majuscules comprises), ravinement sous érosion (2), glacier absent ; 8 surlignages');

  // 3. Insérer l'index (mode note) : lettres, ordre alphabétique, sous-entrée, pas de pages.
  await page.click('#ix-insert');
  await page.waitForTimeout(600);
  st = await page.evaluate(() => ({
    open: document.getElementById('index-dialog').open,
    marks: CSS.highlights.has('ft-index'),
    lines: [...document.querySelectorAll('#editor .ft-index > *')].map((e) => (e.classList.contains('sub') ? '  ' : '') + e.textContent),
    after: document.querySelector('#editor .ft-index').previousElementSibling.id
  }));
  assert(!st.open && !st.marks && st.after === 'end', JSON.stringify(st));
  assert.deepStrictEqual(st.lines, ['Index', 'C', 'climat', 'E', 'érosion', '  ravinement', 'G', 'glacier']);
  ok('index inséré après « Conclusion » : C climat, E érosion > ravinement, G glacier (sans pages en mode note)');

  // 4. Mode avancé : pages, plages, une entrée suit le texte.
  await page.click('#mode-switch button[data-mode="avance"]');
  await page.waitForTimeout(1500);
  const expect = await page.evaluate(() => {
    const at = (id, w, n = 0) => {
      const t = document.getElementById(id).firstChild;
      const re = new RegExp(w, 'gi');
      const m = [...t.data.matchAll(re)][n];
      const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
      return window.FTPages.pageNumberAtY(r.getBoundingClientRect().top + 1);
    };
    return { p1: at('p1', 'érosion'), p2: at('p2', 'érosions'), p3: at('p3', 'érosion') };
  });
  st = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#editor .ft-index-entry')].map((e) => [e.dataset.term, (e.querySelector('.ft-index-pages') || {}).textContent || ''])));
  assert(expect.p1 && expect.p3 > expect.p2 && expect.p2 >= expect.p1, JSON.stringify(expect));
  assert(expect.p1 === 1 && expect.p2 === 2 && expect.p3 === 3, JSON.stringify(expect));
  assert.strictEqual(st['érosion'], ', 1\u20133', JSON.stringify({ st, expect }));
  assert(st.glacier === '' && /^, \d+, \d+$|^, \d+$/.test(st.climat), JSON.stringify(st));
  await page.evaluate(() => document.querySelector('#editor .ft-index').scrollIntoView());
  await page.screenshot({ path: path.join(SHOTS, 'index-avance.png') });
  ok(`mode avancé : « érosion, 1–3 » (occurrences en pages 1, 2 et 3), glacier sans page`);
  // Nouvelle occurrence au début : la page 1 s'ajoute.
  await page.evaluate(() => {
    const h = document.querySelector('#editor h1');
    h.insertAdjacentHTML('afterend', '<p id="p0">Le glacier domine la vallée.</p>');
    document.getElementById('editor').dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(1500);
  st = await page.evaluate(() => {
    const e = document.querySelector('#editor .ft-index-entry[data-term="glacier"]');
    return { pages: (e.querySelector('.ft-index-pages') || {}).textContent, absent: e.classList.contains('absent') };
  });
  assert(st.pages === ', 1' && !st.absent, JSON.stringify(st));
  st = await page.evaluate(() => {
    const at = (id, w) => {
      const t = document.getElementById(id).firstChild;
      const m = new RegExp(w, 'i').exec(t.data);
      const r = document.createRange(); r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
      return window.FTPages.pageNumberAtY(r.getBoundingClientRect().top + 1);
    };
    return { pages: [at('p1', 'érosion'), at('p2', 'érosions'), at('p3', 'érosion')], shown: document.querySelector('#editor .ft-index-entry[data-term="érosion"] .ft-index-pages').textContent };
  });
  const runs = [...new Set(st.pages)];
  assert.strictEqual(st.shown, ', ' + (runs.length === 3 && runs[2] - runs[0] === 2 ? `${runs[0]}\u2013${runs[2]}` : runs.join(', ')), JSON.stringify(st));
  ok('glacier ajouté au texte en page 1 : « glacier, 1 »');

  // 5. Clic sur une entrée : occurrence suivante, sélectionnée.
  const clickEntry = async (term) => {
    await page.evaluate((t) => document.querySelector(`#editor .ft-index-entry[data-term="${t}"]`).scrollIntoView({ block: 'center' }), term);
    const b = await page.evaluate((t) => { const r = document.querySelector(`#editor .ft-index-entry[data-term="${t}"] .ft-index-term`).getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; }, term);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(150);
    return page.evaluate(() => { const s = getSelection(); return { text: s.toString(), id: s.anchorNode.parentElement.id }; });
  };
  st = [await clickEntry('érosion'), await clickEntry('érosion'), await clickEntry('érosion')];
  assert.deepStrictEqual(st.map((s) => s.text + '@' + s.id), ['érosion@p1', 'érosions@p2', 'Érosion@p3']);
  ok('clic sur « érosion » : érosion (p1), puis érosions (p2), puis Érosion (p3)');

  // 6. Les mots sont gardés dans le document ; un document rouvert les retrouve.
  st = await page.evaluate(async () => (await window.FTApp.versionDoc()).settings.index);
  assert.deepStrictEqual(st, [
    { term: 'érosion', variants: ['érosions'], parent: '' }, { term: 'climat', variants: [], parent: '' },
    { term: 'ravinement', variants: [], parent: 'érosion' }, { term: 'glacier', variants: [], parent: '' }
  ]);
  st = await page.evaluate(() => {
    window.FTIndex.load({ index: [{ term: 'x', parent: 'nope' }, { term: 'X' }, 'mauvais', { term: '  climat  ', variants: ['Climat', 'climats'] }] });
    const a = window.FTIndex.get();
    window.FTIndex.load({});
    const b = window.FTIndex.get();
    return { a, b };
  });
  assert.deepStrictEqual(st.a, [{ term: 'x', variants: [], parent: '' }, { term: 'climat', variants: ['climats'], parent: '' }]);
  assert.deepStrictEqual(st.b, []);
  ok('enregistré dans le document (settings.index) ; données abîmées nettoyées au chargement');
  await page.evaluate(async () => window.FTIndex.load((await window.FTApp.versionDoc()).settings));

  // 7. Export Word : titre, lettres, entrées avec pages.
  await page.evaluate(() => window.FTIndex.set([
    { term: 'érosion', variants: ['érosions'], parent: '' }, { term: 'climat', variants: [], parent: '' },
    { term: 'ravinement', variants: [], parent: 'érosion' }, { term: 'glacier', variants: [], parent: '' }
  ]));
  await page.waitForTimeout(800);
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const xml = await (await JSZip.loadAsync(Buffer.from(bytes))).file('word/document.xml').async('string');
  const paras = xml.split('</w:p>').map((p) => p.replace(/<[^>]+>/g, ''));
  const k = paras.lastIndexOf('Index');
  assert(k > 0, 'pas de titre « Index » dans le Word');
  const got = paras.slice(k, k + 8);
  const want = await page.evaluate(() => [...document.querySelectorAll('#editor .ft-index > *')].map((e) => e.textContent));
  assert.deepStrictEqual(got, want);
  assert(got[1] === 'C' && got[3] === 'E' && /^érosion, 1/.test(got[4]) && /^ravinement, \d/.test(got[5]) && got[7] === 'glacier, 1', JSON.stringify(got));
  ok('Word : ' + got.join(' / '));

  // 8. Clic droit sur le bloc : « Supprimer l'index » ; Annuler le remet.
  await page.evaluate(() => document.querySelector('#editor .ft-index-label').scrollIntoView({ block: 'center' }));
  pos = await page.evaluate(() => { const r = document.querySelector('#editor .ft-index-label').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 5 }; });
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(150);
  await menu('^Supprimer l’index$');
  await page.waitForTimeout(300);
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-index').length);
  assert.strictEqual(st, 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  st = await page.evaluate(() => document.querySelectorAll('#editor .ft-index').length);
  assert.strictEqual(st, 1);
  ok('clic droit > « Supprimer l’index » ; Ctrl+Z le rétablit');
  await page.click('#mode-switch button[data-mode="note"]');
  await page.waitForTimeout(500);
};
