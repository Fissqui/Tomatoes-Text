// (Images : depuis la 2.5, leurs réglages ont leur propre essai, essai-images-2-5.js.)
// Essai du comportement commun des tableaux, encadrés, images et schémas : insertion au curseur,
// position rigide par défaut (déplacement seulement vers le haut ou le bas), poignées de taille
// (un côté, ou un coin avec les proportions gardées), barre de l'objet (texte mouvant, mouvement fixe,
// devant / derrière / au niveau du texte), barre affichée quand le curseur est dans un tableau,
// anciens documents, Ctrl+Z, export Word.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  // Outil de position : dans la barre de l'objet, ou (tableau, 2.4.18) dans son menu « Position et habillage ».
  const pickTool = async (title) => {
    if (await page.locator(`#object-tools button[title="${title}"]`).count()) return page.click(`#object-tools button[title="${title}"]`);
    await page.click('#object-tools button[title="Position et habillage"]');
    await page.click(`.context-menu:not([hidden]) .menu-icons button[title="${title}"]`);
  };
  const ok = (m) => console.log('  OK  ' + m);
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const reset = (html) => page.evaluate((h) => {
    const ed = document.getElementById('editor');
    ed.innerHTML = h;
    window.FTLayout.load({});
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
    window.FTStructure.deselect();
  }, html);
  const rect = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
  }, sel);
  const attr = (sel, name) => page.evaluate(([s, n]) => document.querySelector(s).getAttribute(n), [sel, name]);
  const tools = () => page.evaluate(() => [...document.querySelectorAll('#object-tools button')].filter((b) => b.classList.contains('on')).map((b) => b.title));
  const drag = async (x, y, dx, dy) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
    await page.mouse.move(x + dx, y + dy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  };
  const grip = async (dir) => {
    const b = await page.locator('.ft-rz-' + dir + ':not(.ft-img-rz)').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const caretAt = (sel, word, after = true) => page.evaluate(([s, w, a]) => {
    const p = document.querySelector(s);
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const i = t.data.indexOf(w);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(t, a ? i + w.length : i);
      r.collapse(true);
      document.getElementById('editor').focus();
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    }
    return false;
  }, [sel, word, after]);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#c0392b';
    g.fillRect(0, 0, 400, 200);
    return c.toDataURL();
  });

  // 1. Insertion au curseur : au milieu d'une ligne, elle est coupée en deux autour de l'objet.
  await reset(`<p>${LOREM}MILIEU ${LOREM}</p><p>Deuxième ${LOREM}</p><p>Troisième ${LOREM}</p>`);
  await caretAt('#editor p', 'MILIEU');
  await page.evaluate((src) => {
    const box = window.FTLayout.makeImage(window.FTLayout.imageUrl(src), 400);
    window.FTStructure.insertBlockObject(box);
    window.FTStructure.changed();
  }, png);
  await page.waitForTimeout(150);
  let order = await page.evaluate(() => [...document.getElementById('editor').children].map((e) => e.tagName + (e.classList.contains('ft-image') ? '.img' : '')));
  assert.deepStrictEqual(order.slice(0, 3), ['P', 'SPAN.img', 'P'], order.join());
  assert(await page.evaluate(() => /MILIEU$/.test(document.querySelector('#editor p').textContent.trim()) && /^Lorem/.test(document.querySelectorAll('#editor > p')[1].textContent.trim())));
  assert.strictEqual(await attr('#editor .ft-image', 'data-wrap'), null);
  ok('image insérée au curseur : la ligne est coupée en deux, l’image entre les deux moitiés, position rigide');

  // Tableau : même règle (curseur au début de la 3e ligne → avant elle).
  await caretAt('#editor > p:nth-of-type(3)', 'Deuxième', false);
  await page.evaluate(() => {
    const sel = getSelection();
    const t = document.createElement('table');
    t.className = 'ft-table';
    t.innerHTML = '<tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody>';
    window.FTStructure.placeBlockAt(t, sel.getRangeAt(0));
    window.FTStructure.changed();
  });
  order = await page.evaluate(() => [...document.getElementById('editor').children].map((e) => e.tagName + (e.textContent.startsWith('Deuxième') ? '.2' : '')));
  assert.deepStrictEqual(order.slice(0, 5), ['P', 'SPAN', 'P', 'TABLE', 'P.2'], order.join());
  ok('tableau au début d’une ligne : posé juste avant elle');

  // 2 à 7. Images : réglages refaits en 2.5 (déplacement, ancrage, centrage, superposition), voir essai-images-2-5.js.
  let g;

  // 8. Tableau : la barre apparaît quand le curseur est dedans ; hauteur des lignes par le côté bas.
  await page.click('#editor table td');
  await page.waitForTimeout(100);
  assert(await page.isVisible('#object-tools'), 'barre du tableau');
  assert(await page.isVisible('#object-tools button[title="Supprimer le tableau"]'));
  const t0 = await rect('#editor table');
  g = await grip('s');
  await drag(g.x, g.y, 0, 50);
  let t1 = await rect('#editor table');
  assert(Math.abs(t1.h - (t0.h + 50)) < 4 && Math.abs(t1.w - t0.w) < 2, 'hauteur tableau ' + JSON.stringify([t0, t1]));
  ok('curseur dans un tableau : barre et poignées ; côté bas : lignes plus hautes');
  g = await grip('w');
  await drag(g.x, g.y, 120, 0);
  t1 = await rect('#editor table');
  assert(Math.abs(t1.r - t0.r) < 2 && Math.abs(t1.w - (t0.w - 120)) < 4, 'côté gauche du tableau ' + JSON.stringify([t0, t1]));
  assert.strictEqual(await attr('#editor table', 'data-align'), 'droite');
  ok('côté gauche du tableau : seul ce côté bouge (calé à droite)');
  await page.click('#editor table td');
  await pickTool('Texte mouvant');
  assert(/^(gauche|droite)$/.test(await attr('#editor table', 'data-wrap')));
  const t2 = await rect('#editor table');
  const handle = async () => {
    await page.mouse.move(t2.l + 10, t2.t + 5);
    await page.waitForTimeout(50);
    const h = await page.locator('#block-handle').boundingBox();
    return { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  };
  let h = await handle();
  await drag(h.x, h.y, 300, 0);
  assert.strictEqual(await attr('#editor table', 'data-wrap'), 'droite');
  ok('tableau en texte mouvant : glissé par sa poignée vers la droite, le texte passe à gauche');
  await page.click('#editor table td');
  await pickTool('Mouvement fixe');
  const t3 = await rect('#editor table');
  await page.mouse.move(t3.l + 10, t3.t + 5);
  await page.waitForTimeout(50);
  assert(await page.evaluate(() => document.getElementById('block-handle').classList.contains('locked')));
  h = await page.locator('#block-handle').boundingBox();
  await drag(h.x + 8, h.y + 8, -300, 100);
  const t4 = await rect('#editor table');
  assert(Math.abs(t4.l - t3.l) < 1 && Math.abs(t4.t - t3.t) < 1, 'tableau immobile');
  ok('tableau en mouvement fixe : la poignée ne le déplace pas');

  // 8 bis. Tableau en texte mouvant glissé vers le bas : il descend ligne par ligne dans un long
  // paragraphe (coupé autour de lui), le texte coule autour ; il se recolle quand le tableau repart.
  await reset(`<p>${LOREM}</p><table class="ft-table" data-t="2"><tbody><tr><td>A1 case</td><td>B1 case</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table><p id="long">${LOREM.repeat(8)}</p><p>Fin.</p>`);
  await page.click('#editor table td');
  await pickTool('Texte mouvant');
  const f0 = await rect('#editor table');
  await page.mouse.move(f0.l + 10, f0.t + 5);
  await page.waitForTimeout(50);
  h = await page.locator('#block-handle').boundingBox();
  const hx = h.x + h.width / 2;
  const hy = h.y + h.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  const seen = new Set();
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(hx + 6 * i, hy + 9 * i);
    await page.waitForTimeout(25);
    seen.add(Math.round((await rect('#editor table')).t));
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
  const f1 = await page.evaluate(() => {
    const t = document.querySelector('#editor table');
    const a = t.previousElementSibling;
    const b = t.nextElementSibling;
    return { cut: a.hasAttribute('data-coupe'), suite: b.hasAttribute('data-suite'), text: a.textContent.length + b.textContent.length, gap: b.getBoundingClientRect().top - a.getBoundingClientRect().bottom };
  });
  assert(seen.size >= 4, 'le tableau descend ligne par ligne : ' + [...seen].join(','));
  assert(f1.cut && f1.suite && f1.text === LOREM.repeat(8).length && Math.abs(f1.gap) < 2, JSON.stringify(f1));
  await page.click('#editor table td');
  await pickTool('Position rigide');
  const f2 = await page.evaluate(() => ({ cuts: document.querySelectorAll('#editor [data-coupe], #editor [data-suite]').length, long: document.getElementById('long').textContent.length }));
  assert.deepStrictEqual(f2, { cuts: 0, long: LOREM.repeat(8).length });
  ok(`tableau en texte mouvant : descend au fil des lignes (${seen.size} positions), le paragraphe coupé autour de lui se recolle ensuite`);

  // 9. Encadré : coin = largeur et hauteur ensemble.
  await reset(`<p>${LOREM}</p><blockquote class="ft-callout"><p>Un encadré</p></blockquote><p>${LOREM}</p>`);
  await page.click('#editor .ft-callout p');
  await page.waitForTimeout(100);
  const c0 = await rect('#editor .ft-callout');
  g = await grip('se');
  await drag(g.x, g.y, -100, 0);
  const c1 = await rect('#editor .ft-callout');
  assert(Math.abs(c1.w - (c0.w - 100)) < 4, 'largeur encadré');
  g = await grip('s');
  await drag(g.x, g.y, 0, 60);
  const c2 = await rect('#editor .ft-callout');
  assert(Math.abs(c2.h - (c1.h + 60)) < 4, 'hauteur encadré ' + JSON.stringify([c1, c2]));
  g = await grip('s');
  await drag(g.x, g.y, 0, -200);
  assert.strictEqual(await page.evaluate(() => document.querySelector('#editor .ft-callout').style.minHeight), '', 'hauteur naturelle');
  ok('encadré : coin (plus étroit), côté bas (plus haut), puis retour à sa hauteur naturelle');

  // 10. Anciens documents d'images : voir essai-images-2-5.js.

  // 11. Export Word : image centrée à sa place, tableau à côté du texte = tableau flottant.
  await reset(`<p>Avant</p><span class="ft-image" contenteditable="false" style="width: 40%;"><img src="${png}"></span>`
    + `<table class="ft-table" data-wrap="droite" style="width: 40%;"><tbody><tr><td>a</td></tr></tbody></table><p>${LOREM}</p>`);
  await page.waitForTimeout(200);
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const doc = await zip.file('word/document.xml').async('string');
  const ind = /<w:ind w:left="(\d+)"\/><w:jc w:val="left"\/><\/w:pPr><w:r><w:drawing>/.exec(doc);
  assert(ind && +ind[1] > 2000, 'retrait de l’image ' + (ind && ind[1]));
  assert(/<w:tblpPr[^>]*w:leftFromText="\d+"[^>]*w:tblpX="\d+"/.test(doc) && /<w:tblOverlap w:val="never"\/>/.test(doc), 'tableau flottant');
  ok('Word : image centrée gardée au centre ; tableau à côté du texte = tableau flottant (le texte en fait le tour)');

  // 12. Mode avancé : changer la position d'un objet en bas du document ne ramène pas la vue au début.
  await page.evaluate((lorem) => {
    const ed = document.getElementById('editor');
    let h = '';
    for (let i = 0; i < 12; i++) h += `<p>${i} ${lorem}${lorem}</p>`;
    ed.innerHTML = h + '<table class="ft-table" data-style="quadrille" data-t="2"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>fin</p>';
    window.FTLayout.load({});
    window.FTPages.load({ mode: 'avance' });
    ed.dispatchEvent(new Event('input'));
  }, LOREM);
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('#editor table').scrollIntoView({ block: 'center' }));
  await page.click('#editor table td');
  await page.waitForTimeout(100);
  const s0 = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  await pickTool('Texte mouvant');
  await page.waitForTimeout(400);
  const s1 = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  assert(s0 > 500 && Math.abs(s1 - s0) < 30, `vue ${s0} → ${s1}`);
  ok('mode avancé : la vue reste sur l’objet quand il change de position');
  await page.evaluate(() => window.FTPages.load({ mode: 'note' }));
};
