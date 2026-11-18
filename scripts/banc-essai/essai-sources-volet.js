// Sources en volet à droite du texte (2.3.6) : « Volet à droite » passe la fenêtre « Sources et citations »
// dans un volet ; le texte reste modifiable à côté, « Citer cette source » insère à l'endroit du curseur et le
// volet reste ouvert ; clic sur une citation du texte = la changer dans le volet ; « Sourcer » rouvre le volet
// (choix gardé), « Fenêtre » revient à la fenêtre.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-sources-volet.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const strip = (html) => html.replace(/data-src="[a-z0-9]+"/g, 'data-src="?"');
  const select = (pos) => v((a) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a)));
    w.focus();
  }, pos);
  await v(() => { window.FTLayout.setCapitalize(false); });
  await v(() => {
    window.FTEditor.load({ content: { html: '<p>Comme le dit l’auteur.</p><p>Suite.</p>' }, settings: { mode: 'note' } });
    document.getElementById('page').hidden = false;
  });
  await page.waitForTimeout(150);

  // Deux sources, dans la fenêtre.
  await page.click('#cite-btn');
  for (const [a, t, y] of [['Dupont, Jean', 'Le livre', '2020'], ['Martin, Paul', 'Un autre', '1999']]) {
    await page.click('#src-new');
    await page.fill('#src-authors', a);
    await page.fill('#src-title', t);
    await page.fill('#src-year', y);
  }
  assert.ok(await v(() => document.getElementById('sources-dialog').open));

  // Volet à droite.
  await page.click('#src-dock');
  assert.deepStrictEqual(await v(() => [document.getElementById('sources-dialog').open, document.getElementById('srcpane').classList.contains('open'),
    !!document.querySelector('#srcpane #src-form'), document.getElementById('src-dock').textContent]), [false, true, true, 'Fenêtre']);
  const box = await page.locator('#srcpane').boundingBox();
  const main = await page.locator('#main').boundingBox();
  assert.ok(box.width >= 300 && box.x >= main.x + main.width - 2, 'volet à droite du texte');
  if (process.env.FT_CAPTURE) await page.screenshot({ path: process.env.FT_CAPTURE });

  // Le texte reste modifiable : on écrit, puis on cite depuis le volet à l'endroit du curseur.
  await select(22);
  await page.keyboard.type(' bien');
  assert.strictEqual(await saved(), '<p>Comme le dit l’auteur bien.</p><p>Suite.</p>');
  await page.click('#srcpane .src-item >> text=Le livre');
  await page.fill('#src-page', '12');
  await page.click('#src-cite');
  assert.ok(await v(() => document.getElementById('srcpane').classList.contains('open')), 'le volet reste ouvert');
  await page.keyboard.type(' et');
  assert.strictEqual(strip(await saved()), '<p>Comme le dit l’auteur bien<span class="ft-cite" data-src="?" data-page="12" contenteditable="false">(Dupont, 2020, p. 12)</span> et.</p><p>Suite.</p>');
  assert.strictEqual(await page.inputValue('#src-page'), '');
  ok('volet à droite : texte modifiable à côté, citation insérée au curseur, volet gardé ouvert, la frappe continue après la citation');

  // Clic sur la citation : changée depuis le volet.
  await page.click('#editor span.ft-cite');
  assert.strictEqual(await page.textContent('#src-cite'), 'Changer la référence');
  await page.click('#srcpane .src-item >> text=Un autre');
  await page.click('#src-cite');
  assert.match(await saved(), />\(Martin, 1999, p\. 12\)<\/span> et\.<\/p>/);
  assert.strictEqual(await page.textContent('#src-cite'), 'Citer cette source');
  // Une source ajoutée dans le volet (formulaire sur une colonne).
  await page.click('#src-new');
  await page.fill('#src-authors', 'Durand, Anne');
  await page.fill('#src-title', 'Troisième');
  assert.strictEqual(await page.locator('#srcpane .src-item').count(), 3);
  ok('citation du texte changée dans le volet, nouvelle source saisie dans le volet');

  // Fermer, rouvrir (le choix du volet est gardé), revenir à la fenêtre.
  await page.click('#src-close');
  assert.ok(!(await v(() => document.getElementById('srcpane').classList.contains('open'))));
  await page.click('#cite-btn');
  assert.ok(await v(() => document.getElementById('srcpane').classList.contains('open') && !document.getElementById('sources-dialog').open));
  await page.click('#cite-btn');
  assert.ok(!(await v(() => document.getElementById('srcpane').classList.contains('open'))), '« Sourcer » referme le volet');
  await page.click('#cite-btn');
  await page.click('#src-dock');
  assert.deepStrictEqual(await v(() => [document.getElementById('sources-dialog').open, document.getElementById('srcpane').classList.contains('open'),
    !!document.querySelector('#sources-dialog #src-form')]), [true, false, true]);
  await page.click('#src-close');
  await page.click('#cite-btn');
  assert.ok(await v(() => document.getElementById('sources-dialog').open), 'choix de la fenêtre gardé');
  await page.click('#src-close');
  ok('« Sourcer » rouvre ou referme le volet, « Fenêtre » revient à la fenêtre, le choix est gardé');
};
