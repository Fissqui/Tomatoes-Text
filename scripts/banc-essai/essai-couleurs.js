// Essai 2.3.13 (coins de la légende : 2.3.18) : schéma sans sélection de texte fantôme, couleurs de la légende (texte, contour, fond),
// 6 dernières couleurs proposées dans les sélecteurs, bouton « Colonnes » avec « Réglages des pages » à côté.
const assert = require('assert');
const path = require('path');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  await v(() => { try { localStorage.removeItem('ft-couleurs-recentes'); } catch { /* rien */ } });

  // 1. Schéma : le texte d'une forme ne se sélectionne pas ; une sélection restée est retirée au clic.
  await v(() => {
    window.FTEditor.load({ content: { html: '<p>Texte.</p>' }, settings: {} });
    document.getElementById('page').hidden = false;
    window.FTDiagram.open(null);
  });
  await page.waitForTimeout(200);
  const us = await v(() => getComputedStyle(document.querySelector('#diagram-dialog .dg-canvas')).userSelect);
  assert.strictEqual(us, 'none');
  await v(() => {
    const t = [...document.querySelectorAll('#diagram-dialog .dg-content text')].find((x) => x.textContent === 'Début');
    const r = document.createRange();
    r.selectNodeContents(t);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  const suite = await v(() => {
    const t = [...document.querySelectorAll('#diagram-dialog .dg-content text')].find((x) => x.textContent === 'Suite');
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(suite.x, suite.y);
  await page.waitForTimeout(80);
  const left = await v(() => getSelection().toString());
  assert.strictEqual(left, '', 'sélection restée : ' + left);
  await v(() => document.getElementById('diagram-dialog').close());
  ok('schéma : texte des formes non sélectionnable, sélection restée retirée au clic sur une autre forme');

  // 2. Légende : couleur du texte, du contour et du fond ; enregistrées ; Ctrl+Z.
  const png = await v(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 100;
    c.getContext('2d').fillRect(0, 0, 200, 100);
    return c.toDataURL();
  });
  await v((src) => {
    window.FTEditor.load({ content: { html: `<p>Un</p><span class="ft-image" contenteditable="false" data-caption="bas" style="width: 30%;"><img src="${src}"><span class="ft-caption">Légende</span></span><p>Deux</p>` }, settings: {} });
    document.getElementById('page').hidden = false;
  }, png);
  await page.waitForTimeout(150);
  const openPop = async () => {
    await page.click('#editor .ft-image');
    await page.click('#image-tools button[data-act="encadrage"]');
    await page.waitForTimeout(80);
  };
  await openPop();
  const titles = await v(() => [...document.querySelectorAll('#image-frame-pop .pop-title')].map((t) => t.textContent));
  assert(titles.includes('Couleur du texte') && !titles.includes('Couleur du contour'), titles.join(' | '));
  const swatch = (n, title) => page.locator('#image-frame-pop .frame-colors').nth(n).locator(`button[title="${title}"]`);
  await swatch(0, 'Rouge').click();
  await page.waitForTimeout(80);
  assert.strictEqual(await v(() => getComputedStyle(document.querySelector('#editor .ft-caption')).color), 'rgb(192, 57, 43)');
  await page.click('#image-frame-pop label:has-text("Fond et contour de la légende")');
  await page.waitForTimeout(80);
  const titles2 = await v(() => [...document.querySelectorAll('#image-frame-pop .pop-title')].map((t) => t.textContent));
  assert(titles2.includes('Couleur du contour') && titles2.includes('Fond de la légende'), titles2.join(' | '));
  await swatch(1, 'Bleu').click();
  await page.waitForTimeout(60);
  await swatch(2, 'Vert').click();
  await page.waitForTimeout(80);
  const cs = await v(() => { const c = getComputedStyle(document.querySelector('#editor .ft-caption')); return [c.borderTopColor, c.backgroundColor]; });
  assert.deepStrictEqual(cs, ['rgb(46, 134, 193)', 'rgb(39, 174, 96)']);
  const html = await v(() => window.FTEditor.getHtml());
  assert(/--cap-c: #c0392b/.test(html) && /--cap-bc: #2e86c1/.test(html) && /--cap-bg: #27ae60/.test(html), html.replace(/src="[^"]*"/, ''));
  // Coins de la légende : légèrement arrondis d'office, réglables (droits… très arrondis).
  const radius = () => v(() => getComputedStyle(document.querySelector('#editor .ft-caption')).borderTopLeftRadius);
  assert.strictEqual(await radius(), '3px');
  await page.click('#image-frame-pop .seg button:has-text("Droits")');
  await page.waitForTimeout(80);
  assert.strictEqual(await radius(), '0px');
  assert(/--cap-r: 0px/.test(await v(() => window.FTEditor.getHtml())), 'coins enregistrés');
  assert(await v(() => [...document.querySelectorAll('#image-frame-pop .seg button.on')].some((b) => b.textContent === 'Droits')), 'choix affiché');
  await page.click('#image-frame-pop .seg button:has-text("Très arrondis")');
  await page.waitForTimeout(80);
  assert.notStrictEqual(await radius(), '0px');
  await page.click('#image-frame-pop .seg button:has-text("Légers")');
  await page.waitForTimeout(80);
  assert.strictEqual(await radius(), '3px');
  // La couleur choisie est proposée parmi les récentes de la fenêtre.
  await page.screenshot({ path: path.join(SHOTS, 'legende-couleurs.png') });
  const rec = await v(() => [...document.querySelectorAll('#image-frame-pop .ft-recents')[0].querySelectorAll('.ft-recent')].map((b) => b.dataset.color));
  assert.deepStrictEqual(rec, ['#27ae60', '#2e86c1', '#c0392b']);
  await page.keyboard.press('Escape');
  await page.click('#editor p >> nth=1');
  // (Trois réglages des coins, puis le fond.)
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(80);
  }
  assert(!/--cap-bg/.test(await v(() => window.FTEditor.getHtml())), 'Ctrl+Z retire le fond');
  ok('légende : couleur du texte, du contour et du fond, coins réglables, enregistrés ; Ctrl+Z annule');

  // 3. Couleurs récentes : 6 au plus, la dernière en tête ; reprises dans la palette du texte.
  await v(() => ['#111111', '#222222', '#333333', '#444444', '#2e86c1'].forEach((c) => window.FTCouleurs.add(c)));
  assert.deepStrictEqual(await v(() => window.FTCouleurs.list()), ['#2e86c1', '#444444', '#333333', '#222222', '#111111', '#27ae60']);
  await v(() => {
    const p = document.querySelector('#editor p');
    const r = document.createRange();
    r.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.waitForTimeout(80);
  await page.click('#color-more');
  await page.screenshot({ path: path.join(SHOTS, 'couleurs-recentes.png') });
  const shown = await v(() => [...document.querySelectorAll('#color-pop .ft-recents .ft-recent')].map((b) => b.dataset.color));
  assert.strictEqual(shown.length, 6);
  await page.click('#color-pop .ft-recents .ft-recent[data-color="#333333"]');
  await page.waitForTimeout(80);
  assert(/color: #333333|color: rgb\(51, 51, 51\)/.test(await v(() => window.FTEditor.getHtml())), 'couleur récente appliquée');
  assert.strictEqual(await v(() => window.FTCouleurs.list()[0]), '#333333');
  // Un clic sur le bouton applique la couleur retenue (la dernière choisie) à une autre sélection.
  await v(() => {
    const p = document.querySelectorAll('#editor p')[1];
    const r = document.createRange();
    r.selectNodeContents(p);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.waitForTimeout(80);
  await page.click('#color-btn');
  await page.waitForTimeout(80);
  assert(await v(() => document.getElementById('color-pop').hidden), 'palette fermée');
  assert(/color: (#333333|rgb\(51, 51, 51\));?">Deux/.test(await v(() => window.FTEditor.getHtml())), 'clic sur le bouton : ' + await v(() => window.FTEditor.getHtml().replace(/src="[^"]*"/, '')));
  // Sélecteurs du système : couleur retenue, suggestions = récentes.
  await v(() => {
    const i = document.createElement('input');
    i.type = 'color';
    i.id = 'essai-couleur';
    document.body.append(i);
  });
  await v(() => {
    const i = document.getElementById('essai-couleur');
    i.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    i.value = '#abcdef';
    i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const sys = await v(() => [document.getElementById('essai-couleur').getAttribute('list'), window.FTCouleurs.list()[0], document.querySelectorAll('#ft-couleurs-recentes option').length]);
  assert.deepStrictEqual(sys, ['ft-couleurs-recentes', '#abcdef', 6]);
  await v(() => document.getElementById('essai-couleur').remove());
  ok('couleur du texte : un clic applique la couleur retenue ; couleurs récentes : les 6 dernières, reprises d’un clic dans la palette du texte et suggérées par les sélecteurs');

  // 4. Bouton « Colonnes » ; un ancien rangement est oublié : « Réglages des pages » reste dans « Mise en page »
  // (rangement 7 de la 2.4.19).
  assert.strictEqual(await v(() => document.querySelector('#layout-btn .tb-label').textContent), 'Colonnes');
  const after = await v(() => {
    const groups = {};
    for (const g of document.querySelectorAll('.tb-group')) groups[g.dataset.group] = [...g.children].map((c) => c.dataset.tb).filter((x) => x && x !== 'pages');
    groups.saisie.push('pages');
    window.FTToolbar.apply({ v: 4, pos: 'haut', groups });
    const it = document.querySelector('.tb-group > [data-tb="pages"]');
    return [it.parentElement.dataset.group, it.previousElementSibling && it.previousElementSibling.dataset.tb];
  });
  assert.deepStrictEqual(after, ['presentation', 'docstyles']);
  await v(() => window.FTToolbar.apply(null));
  ok('« Colonnes » (nouvelle icône) ; « Réglages des pages » rangé dans « Mise en page », même avec un ancien rangement');
};
