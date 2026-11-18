// Essai 2.3.17 : la touche Suppr retire tout objet sélectionné (image, tableau, encadré, repère biographique,
// bloc de code), qu'il soit sélectionné par sa poignée ⠿ ou par Échap depuis son texte ; toutes les cases
// d'un tableau sélectionnées : Suppr retire le tableau.
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const png = await v(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 100; c.getContext('2d').fillRect(0, 0, 200, 100); return c.toDataURL(); });
  const objs = {
    image: `<span class="ft-image" contenteditable="false" style="width: 30%;"><img src="${png}"></span>`,
    tableau: '<table class="ft-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table>',
    encadré: '<blockquote class="ft-callout"><p>Un encadré</p></blockquote>',
    repère: '<blockquote class="ft-callout ft-bio" data-bio="libre" data-bio-modele="medaillon" data-wrap="droite" style="width: 36%;"><p class="ft-bio-name">Nom</p><p class="ft-bio-text">Texte</p></blockquote>',
    code: '<pre class="ft-code" data-lang="python"><code>print(1)</code></pre>'
  };
  const SEL = '#editor > :is(.ft-image, table, blockquote, pre)';
  const load = (h) => v((x) => { window.FTEditor.load({ content: { html: `<p>Avant.</p>${x}<p>Après.</p>` }, settings: {} }); document.getElementById('page').hidden = false; }, h);
  const isNode = () => v(() => window.FTMoteur.view.state.selection instanceof PM.state.NodeSelection);
  const html = () => v(() => window.FTEditor.getHtml());
  for (const [k, h] of Object.entries(objs)) {
    for (const how of ['poignée', 'Échap']) {
      if (k === 'image' && how === 'Échap') continue;
      await load(h);
      await page.waitForTimeout(200);
      const r = await v((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, SEL);
      // (Au quart de la largeur : le milieu d'un tableau à deux colonnes est le trait entre elles.)
      await page.mouse.move(5, 5);
      await page.mouse.move(r.x + r.w / 4, r.y + r.h / 2, { steps: 3 });
      await page.waitForTimeout(120);
      if (how === 'poignée') {
        const hb = await v(() => { const e = document.getElementById('block-handle'); if (e.hidden) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        assert(hb, k + ' : poignée affichée');
        await page.mouse.click(hb.x, hb.y);
      } else {
        await page.mouse.click(r.x + r.w / 4, r.y + r.h / 2);
        await page.waitForTimeout(100);
        assert(!(await isNode()), k + ' : clic dans le texte de l’objet');
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(120);
      assert(await isNode(), k + ' (' + how + ') : objet sélectionné');
      await page.keyboard.press('Delete');
      await page.waitForTimeout(120);
      assert.strictEqual(await html(), '<p>Avant.</p><p>Après.</p>', k + ' (' + how + ')');
    }
  }
  ok('Suppr retire l’objet sélectionné par sa poignée (image, tableau, encadré, repère, code) ou par Échap depuis son texte');

  await v(() => window.FTEditor.load({ content: { html: '<p>Avant.</p><table class="ft-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>Après.</p>' }, settings: {} }));
  await page.waitForTimeout(150);
  const a = await v(() => { const c = document.querySelectorAll('#editor td'); const r = c[0].getBoundingClientRect(); const b = c[3].getBoundingClientRect(); return [r.left + 5, r.top + 5, b.left + 5, b.top + 5]; });
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move(a[2], a[3], { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(120);
  assert.strictEqual(await html(), '<p>Avant.</p><p>Après.</p>');
  // Quelques cases seulement : leur texte est effacé, le tableau reste.
  await v(() => window.FTEditor.load({ content: { html: '<p>Avant.</p><table class="ft-table"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>Après.</p>' }, settings: {} }));
  await page.waitForTimeout(150);
  const b = await v(() => { const c = document.querySelectorAll('#editor td'); const r = c[0].getBoundingClientRect(); const q = c[1].getBoundingClientRect(); return [r.left + 5, r.top + 5, q.left + 5, q.top + 5]; });
  await page.mouse.move(b[0], b[1]);
  await page.mouse.down();
  await page.mouse.move(b[2], b[3], { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(120);
  assert(/<table/.test(await html()) && />c</.test(await html()), await html());
  ok('toutes les cases d’un tableau sélectionnées : Suppr retire le tableau ; quelques cases : leur texte seulement');

  // Échap qui ferme un menu ne sélectionne pas l’objet.
  const c = await v(() => { const r = document.querySelector('#editor td').getBoundingClientRect(); return [r.left + 5, r.top + 5]; });
  await page.mouse.click(c[0], c[1], { button: 'right' });
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert(!(await isNode()), 'Échap ferme le menu, le curseur reste dans la case');
  ok('Échap qui ferme un menu laisse le curseur dans le texte');
};
