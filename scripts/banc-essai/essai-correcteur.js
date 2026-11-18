// Essai du correcteur de grammaire (2.4.13), avec un faux modèle : chaque passage n'est relu qu'une fois ;
// le passage où l'on écrit passe avant les autres ; les remarques restent affichées pendant la relecture
// d'un passage modifié ; une correction acceptée (ou une remarque ignorée) n'est plus jamais
// re-signalée au même endroit, même si le modèle propose une variante.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-correcteur.js
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  await page.evaluate(() => {
    window.__asked = [];
    // Faux modèle : « ils mange » -> « ils mangent », puis « mangent » -> « mangeaient » (variante qui
    // ferait tourner en boucle), « Les enfant » -> « Les enfants ».
    window.frameText.grammarCheck = async (text, lang) => {
      window.__asked.push(text);
      await new Promise((r) => setTimeout(r, 400));
      const errors = [];
      const find = (extrait, correction) => {
        const i = text.indexOf(extrait);
        if (i >= 0) errors.push({ start: i, end: i + extrait.length, correction, explication: 'Accord.' });
      };
      find('ils mange ', 'ils mangent ');
      find('mangent', 'mangeaient');
      find('Les enfant ', 'Les enfants ');
      return { errors };
    };
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p id="a">Le soir venu, ils mange des pommes dans le jardin.</p>' +
      '<p id="b">Les enfant jouent dehors avec le chien du voisin.</p>';
    window.FTSpell.setGrammar(true);
  });
  await page.waitForTimeout(2500);
  const grammar = () => page.evaluate(() => window.FTSpell.grammar());
  assert.deepStrictEqual(await grammar(), ['ils mange ', 'Les enfant ']);
  ok('remarques affichées : « ils mange », « Les enfant »');

  // Clic et défilement pendant la relecture : chaque passage n'est demandé qu'une fois.
  await page.evaluate(() => { document.getElementById('workspace').dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(1200);
  const asked = await page.evaluate(() => window.__asked);
  assert.strictEqual(asked.length, 2, JSON.stringify(asked));
  ok('chaque passage relu une seule fois');

  // Écrire à la fin du paragraphe b : la remarque reste pendant la frappe et la relecture.
  await page.evaluate(() => {
    const t = document.getElementById('b').firstChild;
    const r = document.createRange();
    r.setStart(t, t.data.length); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.keyboard.type(' Il fait beau', { delay: 40 });
  await page.waitForTimeout(500);
  assert.deepStrictEqual(await grammar(), ['ils mange ', 'Les enfant ']);
  ok('« Les enfant » reste souligné pendant la frappe');

  // Le passage modifié passe avant les autres demandes en attente.
  await page.waitForTimeout(2200);
  const asked2 = await page.evaluate(() => window.__asked);
  assert(asked2.some((t) => t.endsWith('Il fait beau')), JSON.stringify(asked2));
  ok('le passage modifié est relu après une courte pause');

  // Accepter « ils mangent » : le modèle propose ensuite « mangeaient » au même endroit, non affiché.
  const spot = await page.evaluate(() => {
    const t = document.getElementById('a').firstChild;
    const r = document.createRange();
    const i = t.data.indexOf('mange');
    r.setStart(t, i); r.setEnd(t, i + 2);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.locator('.context-menu').getByText('Remplacer par « ils mangent »').click();
  await page.waitForTimeout(3500);
  const text = await page.evaluate(() => document.getElementById('a').textContent);
  assert.strictEqual(text, 'Le soir venu, ils mangent des pommes dans le jardin.');
  const asked3 = await page.evaluate(() => window.__asked);
  assert(asked3.includes(text), 'le passage corrigé est relu');
  assert.deepStrictEqual(await grammar(), ['Les enfant ']);
  ok('correction acceptée : pas de nouvelle remarque « mangeaient » au même endroit');

  // Ignorer « Les enfant », puis modifier la fin du paragraphe : la remarque ne revient pas.
  const spot2 = await page.evaluate(() => {
    const t = document.getElementById('b').firstChild;
    const r = document.createRange();
    r.setStart(t, 1); r.setEnd(t, 3);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(spot2.x, spot2.y, { button: 'right' });
  await page.waitForTimeout(200);
  await page.locator('.context-menu').getByText('Ignorer cette remarque').click();
  await page.waitForTimeout(200);
  assert.deepStrictEqual(await grammar(), []);
  await page.evaluate(() => {
    const t = document.getElementById('b').lastChild;
    const r = document.createRange();
    r.setStart(t, t.data.length); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  });
  await page.keyboard.type('.', { delay: 40 });
  await page.waitForTimeout(3500);
  assert.deepStrictEqual(await grammar(), []);
  ok('remarque ignorée : ne revient pas après une modification du paragraphe');
};
