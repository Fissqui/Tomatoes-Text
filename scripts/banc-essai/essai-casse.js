// Essai de la casse : les cinq choix du menu « Aa », un passage coupé par du gras, deux paragraphes,
// le mot sous le curseur sans sélection, Maj+F3 qui passe d'une casse à l'autre, Ctrl+Z.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const load = (html) => page.evaluate((h) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = h;
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
    ed.focus();
  }, html);
  const select = (from, a, to, b) => page.evaluate(([f, a, t, b]) => {
    const text = (id) => { const w = document.createTreeWalker(document.getElementById(id), NodeFilter.SHOW_TEXT); return w.nextNode(); };
    getSelection().setBaseAndExtent(text(f), a, text(t), b);
  }, [from, a, to, b]);
  const text = () => page.evaluate(() => [...document.querySelectorAll('#editor p')].map((p) => p.textContent));
  const choose = async (mode) => {
    await page.click('#case-btn');
    assert(await page.isVisible('#case-pop'), 'menu ouvert');
    await page.click(`#case-pop [data-case="${mode}"]`);
  };

  await load('<p id="a">le chat dort. il <b id="b">rêve d’une</b> souris</p><p id="c">puis il part</p>');
  await select('a', 0, 'c', 12);
  await choose('upper');
  assert.deepStrictEqual(await text(), ['LE CHAT DORT. IL RÊVE D’UNE SOURIS', 'PUIS IL PART']);
  assert(await page.evaluate(() => !!document.querySelector('#editor b')), 'gras gardé');
  ok('MAJUSCULES sur deux paragraphes, gras gardé');
  await page.screenshot({ path: path.join(SHOTS, 'casse.png') });

  await choose('sentence');
  assert.deepStrictEqual(await text(), ['Le chat dort. Il rêve d’une souris', 'Puis il part']);
  ok('Majuscule en début de phrase');

  await choose('title');
  assert.deepStrictEqual(await text(), ['Le Chat Dort. Il Rêve D’une Souris', 'Puis Il Part']);
  ok('Majuscule à chaque mot');

  await choose('toggle');
  assert.deepStrictEqual(await text(), ['lE cHAT dORT. iL rÊVE d’UNE sOURIS', 'pUIS iL pART']);
  ok('Casse inversée');

  await choose('lower');
  assert.deepStrictEqual(await text(), ['le chat dort. il rêve d’une souris', 'puis il part']);
  const sel = await page.evaluate(() => getSelection().toString());
  assert(sel.startsWith('le chat') && sel.endsWith('puis il part'), 'sélection gardée : ' + sel);
  ok('minuscules, sélection gardée');

  await page.keyboard.press('Control+z');
  assert.deepStrictEqual(await text(), ['lE cHAT dORT. iL rÊVE d’UNE sOURIS', 'pUIS iL pART']);
  ok('Ctrl+Z revient à la casse précédente');

  // Milieu de phrase : pas de majuscule au début de la sélection.
  await load('<p id="a">Il dit BONJOUR À TOUS. ENSUITE IL PART.</p>');
  await select('a', 7, 'a', 38);
  await choose('sentence');
  assert.deepStrictEqual(await text(), ['Il dit bonjour à tous. Ensuite il part.']);
  ok('début de phrase : la sélection en milieu de phrase reste en minuscule');

  // Sans sélection : le mot sous le curseur ; Maj+F3 passe de minuscules à MAJUSCULES puis Majuscule à chaque mot.
  await load('<p id="a">un mot ici</p>');
  await select('a', 4, 'a', 4);
  await page.keyboard.press('Shift+F3');
  assert.deepStrictEqual(await text(), ['un MOT ici']);
  await page.keyboard.press('Shift+F3');
  assert.deepStrictEqual(await text(), ['un Mot ici']);
  await page.keyboard.press('Shift+F3');
  assert.deepStrictEqual(await text(), ['un mot ici']);
  ok('Maj+F3 sur le mot du curseur : MOT, Mot, mot');

  // « ß » devient « SS » : la sélection suit.
  await load('<p id="a">straße</p>');
  await select('a', 0, 'a', 6);
  await choose('upper');
  assert.deepStrictEqual(await text(), ['STRASSE']);
  assert.strictEqual(await page.evaluate(() => getSelection().toString()), 'STRASSE');
  ok('« straße » → « STRASSE », sélection ajustée');
};
