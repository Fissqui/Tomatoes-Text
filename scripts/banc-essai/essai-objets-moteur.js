// Objets dans le nouveau moteur (préversion 2.0) : mêmes essais que essai-objets.js (versions 1.x) pour
// les tableaux, encadrés, images et schémas — insertion au curseur, position rigide par défaut, poignées
// de taille, barre de l'objet (texte mouvant, mouvement fixe, devant / derrière / au niveau du texte),
// barre affichée quand le curseur est dans un tableau, anciens documents — et, pour le moteur : chaque
// geste annulé d'un seul Ctrl+Z, texte enregistré, Suppr, Alt+flèches, frappe après une image, légende,
// schéma, objets d'un très long document.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function corpus() {
  const dir = path.join(process.env.FT_SRC || path.join(__dirname, '..', '..', 'src'), 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  // Outil de position : dans la barre de l'objet, ou (tableau, 2.4.18) dans son menu « Position et habillage ».
  const pickTool = async (title) => {
    if (await page.locator(`#object-tools button[title="${title}"]`).count()) return page.click(`#object-tools button[title="${title}"]`);
    await page.click('#object-tools button[title="Position et habillage"]');
    await page.click(`.context-menu:not([hidden]) .menu-icons button[title="${title}"]`);
  };
  const ok = (m) => console.log('  OK  ' + m);
  // (Texte tapé tel quel : la majuscule automatique a son propre essai, essai-ecriture-moteur.js.)
  await page.evaluate(() => window.FTLayout.setCapitalize(false));
  const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const reset = async (html, settings = {}) => {
    await page.evaluate(([h, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: s });
      document.getElementById('page').hidden = false;
    }, [html, settings]);
    await page.waitForTimeout(150);
  };
  const saved = () => page.evaluate(() => window.FTEditor.getHtml().replace(/src="[^"]*"/g, 'src=""'));
  const undoDepth = () => page.evaluate(() => window.FTMoteur.undoDepth());
  const rect = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
  }, sel);
  const attr = (sel, name) => page.evaluate(([s, n]) => document.querySelector(s).getAttribute(n), [sel, name]);
  const imgTools = () => page.evaluate(() => [...document.querySelectorAll('#image-tools button.on')].map((b) => b.dataset.act));
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
    const b = await page.locator('.ft-rz-' + dir + ':not([hidden])').boundingBox();
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
    window.FTObjets.insertBlockObject(box);
  }, png);
  await page.waitForTimeout(150);
  const html1 = await saved();
  assert(/MILIEU ?<\/p><span class="ft-image"[^>]*><img[^>]*><\/span><p> ?Lorem/.test(html1), html1.slice(0, 400));
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
    window.FTObjets.checkpoint();
    window.FTObjets.placeBlockAt(t, sel.getRangeAt(0));
    window.FTObjets.changed();
  });
  await page.waitForTimeout(50);
  order = await page.evaluate(() => [...document.getElementById('editor').children].map((e) => e.tagName + (e.textContent.startsWith('Deuxième') ? '.2' : '')));
  assert.deepStrictEqual(order.slice(0, 5), ['P', 'SPAN', 'P', 'TABLE', 'P.2'], order.join());
  ok('tableau au début d’une ligne : posé juste avant elle');

  // 2. Image (version 2.5) : sa propre barre et ses huit poignées. Déplacements, ancrage, centrage,
  // superposition, encadrage et taille : essai-images-2-5.js.
  await page.click('#editor .ft-image');
  await page.waitForTimeout(100);
  assert(await page.isVisible('#image-tools'), 'barre de l’image');
  assert(!(await page.isVisible('#object-tools')), 'pas la barre des objets');
  assert.strictEqual(await page.locator('.ft-img-rz:not([hidden])').count(), 8, 'huit poignées');
  assert.deepStrictEqual(await imgTools(), ['ligne', 'mouvant', 'centre'], 'image posée entre deux blocs : par ligne, mouvante, centrée');
  ok('clic sur l’image : barre de l’image (par ligne, ancrage mouvant, centrée) et huit poignées');
  let im, im2, g;

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
  // (Depuis la 2.5.22, comme une image : le tableau reste à sa place pendant le geste, son double suit la souris.)
  const seen = new Set();
  const still = new Set();
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(hx + 6 * i, hy + 9 * i);
    await page.waitForTimeout(25);
    seen.add(Math.round((await rect('.ft-box-ghost')).t));
    still.add(Math.round((await rect('#editor table')).t));
  }
  assert.strictEqual(still.size, 1, 'texte immobile pendant le geste : ' + [...still].join(','));
  await page.mouse.up();
  await page.waitForTimeout(150);
  const f1 = await page.evaluate(() => {
    const t = document.querySelector('#editor table');
    const a = t.previousElementSibling;
    const b = t.nextElementSibling;
    return { cut: a.hasAttribute('data-coupe'), suite: b.hasAttribute('data-suite'), text: a.textContent.length + b.textContent.length, gap: b.getBoundingClientRect().top - a.getBoundingClientRect().bottom };
  });
  assert(seen.size >= 4, 'le double suit la souris : ' + [...seen].join(','));
  assert(f1.cut && f1.suite && f1.text === LOREM.repeat(8).length && Math.abs(f1.gap) < 2, JSON.stringify(f1));
  await page.click('#editor table td');
  await pickTool('Position rigide');
  const f2 = await page.evaluate(() => ({ cuts: document.querySelectorAll('#editor [data-coupe], #editor [data-suite]').length, long: document.getElementById('long').textContent.length }));
  assert.deepStrictEqual(f2, { cuts: 0, long: LOREM.repeat(8).length });
  ok(`tableau en texte mouvant : double qui suit la souris (${seen.size} positions), posé dans le paragraphe coupé autour de lui, qui se recolle ensuite`);

  // 8 quater. Tableau en texte mouvant sur toute la largeur (2.1.11) : le texte ne passe pas à côté, mais le
  // tableau descend quand même ligne par ligne (pas de paragraphe en paragraphe).
  await reset(`<p>Avant.</p><table class="ft-table" data-t="2" data-wrap="gauche" style="width: 100%;"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p id="long">${LOREM.repeat(8)}</p><p>Fin.</p>`);
  const w0 = await rect('#editor table');
  await page.mouse.move(w0.l + 10, w0.t + 5);
  await page.waitForTimeout(50);
  h = await page.locator('#block-handle').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  const wseen = new Set();
  const wtops = [];
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 9 * i);
    await page.waitForTimeout(25);
    wtops.push(Math.round((await rect('.ft-box-ghost')).t));
    wseen.add(wtops[wtops.length - 1]);
  }
  // (Sans à-coups : jamais de retour en arrière, jamais plus de deux lignes d'un coup.)
  assert(wtops.every((t, i) => !i || (t >= wtops[i - 1] && t - wtops[i - 1] < 60)), 'saccades : ' + wtops.join(','));
  await page.mouse.up();
  await page.waitForTimeout(150);
  const w1 = await page.evaluate(() => {
    const t = document.querySelector('#editor table');
    return { width: t.style.width, cut: t.previousElementSibling.hasAttribute('data-coupe'), suite: t.nextElementSibling.hasAttribute('data-suite') };
  });
  assert(wseen.size >= 6 && w1.width === '100%' && w1.cut && w1.suite, [...wseen].join(',') + ' ' + JSON.stringify(w1));
  ok(`tableau mouvant sur toute la largeur : double sans à-coups (${wseen.size} positions), posé dans le paragraphe, largeur gardée`);

  // 8 ter. Menus du clic droit : « Position et habillage… » pour un tableau et pour un encadré.
  await reset(`<p>${LOREM}</p><table class="ft-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table><blockquote class="ft-callout"><p>Un encadré</p></blockquote><p>${LOREM}</p>`);
  await page.click('#editor table td', { button: 'right' });
  await page.click('.context-menu button:has-text("Position et habillage")');
  await page.click('.context-menu button[title="Derrière le texte"]');
  await page.waitForTimeout(100);
  assert(/<table class="ft-table"[^>]*data-wrap="derriere"/.test(await saved()), 'tableau derrière ' + await saved());
  await page.click('#editor .ft-callout p', { button: 'right', position: { x: 6, y: 8 } });
  await page.click('.context-menu button:has-text("Position et habillage")');
  await page.click('.context-menu button[title="Texte mouvant"]');
  await page.waitForTimeout(100);
  assert(/<blockquote class="ft-callout"[^>]*data-wrap="(gauche|droite)"/.test(await saved()), 'encadré mouvant ' + await saved());
  ok('clic droit sur un tableau ou un encadré : « Position et habillage… »');

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

  // 9 bis. Bloc de code (2.2.12) : un objet comme un encadré (barre, poignées, texte mouvant), son code reste du texte.
  await reset(`<p>${LOREM}</p><pre class="ft-code" data-lang="python"><code>def f(x):\n    return x * 2</code></pre><p>${LOREM}</p>`);
  await page.click('#editor pre.ft-code code');
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => !document.getElementById('object-tools').hidden), 'barre de l’objet sur un bloc de code');
  const k0 = await rect('#editor pre.ft-code');
  g = await grip('e');
  await drag(g.x, g.y, -150, 0);
  const k1 = await rect('#editor pre.ft-code');
  assert(Math.abs(k1.w - (k0.w - 150)) < 4, 'largeur bloc de code ' + JSON.stringify([k0, k1]));
  g = await grip('s');
  await drag(g.x, g.y, 0, 50);
  const k2 = await rect('#editor pre.ft-code');
  assert(Math.abs(k2.h - (k1.h + 50)) < 4, 'hauteur bloc de code ' + JSON.stringify([k1, k2]));
  await page.click('#editor pre.ft-code code');
  await pickTool('Texte mouvant');
  await page.waitForTimeout(150);
  let codeHtml = await saved();
  assert(/<pre class="ft-code"[^>]*data-wrap="(gauche|droite)"/.test(codeHtml) && /def f\(x\):\n {4}return x \* 2/.test(codeHtml), codeHtml);
  await page.click('#editor pre.ft-code code');
  await page.keyboard.press('End');
  await page.keyboard.type(' + 1');
  codeHtml = await saved();
  assert(/return x \* 2 \+ 1<\/code><\/pre>/.test(codeHtml) && /<pre class="ft-code"[^>]*data-wrap=/.test(codeHtml), codeHtml);
  ok('bloc de code : barre de l’objet, largeur et hauteur aux poignées, texte mouvant ; le code reste modifiable');

  // 10. Anciens documents : data-wrap / data-anchor lus comme avant.
  await reset(`<p>${LOREM}</p><span class="ft-image" contenteditable="false" data-wrap="devant" data-anchor="page" style="width: 30%; --x: 40px; --y: 20px;"><img src="${png}"></span>`
    + `<p><span class="ft-image" contenteditable="false" data-wrap="gauche" style="width: 30%;"><img src="${png}"></span>${LOREM}</p>`);
  await page.click('#editor .ft-image[data-wrap="devant"]');
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await imgTools(), ['libre', 'fixe', 'devant'], 'devant, fixé sur la page : ' + (await imgTools()).join());
  await page.evaluate(() => window.FTObjets.selectObject(document.querySelector('#editor .ft-image[data-wrap="gauche"]')));
  await page.waitForTimeout(100);
  assert.deepStrictEqual(await imgTools(), ['libre', 'mouvant', 'gauche', 'niveau'], 'carré : ' + (await imgTools()).join());
  ok('anciens documents : « devant, fixé sur la page » = libre, ancrage fixe, devant ; « carré » = libre au niveau du texte');

  // 11. Mode avancé : changer la position d'un objet en bas du document ne ramène pas la vue au début.
  let h12 = '';
  for (let i = 0; i < 12; i++) h12 += `<p>${i} ${LOREM}${LOREM}</p>`;
  await reset(h12 + '<table class="ft-table" data-style="quadrille" data-t="2"><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table><p>fin</p>', { mode: 'avance' });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#editor table').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(100);
  await page.click('#editor table td');
  await page.waitForTimeout(100);
  const s0 = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  await pickTool('Texte mouvant');
  await page.waitForTimeout(400);
  const s1 = await page.evaluate(() => document.getElementById('workspace').scrollTop);
  assert(s0 > 500 && Math.abs(s1 - s0) < 30, `vue ${s0} → ${s1}`);
  assert(/<table class="ft-table"[^>]*data-wrap="(gauche|droite)"/.test(await saved()), 'enregistré');
  ok('mode avancé : la vue reste sur l’objet quand il change de position, et le changement est enregistré');

  // 12. Clavier : Suppr, Alt+↓ / Alt+↑, frappe après l'image, Entrée.
  await reset(`<p>Un</p><span class="ft-image" contenteditable="false" style="width: 30%;"><img src="${png}"></span><p>Deux</p><p>Trois</p>`);
  await page.click('#editor .ft-image');
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(80);
  assert(/<p>Deux<\/p><span class="ft-image"/.test(await saved()), 'Alt+↓ ' + await saved());
  await page.keyboard.press('Alt+ArrowUp');
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForTimeout(80);
  assert(/^<span class="ft-image"[^>]*><img[^>]*><\/span><p>Un<\/p>/.test(await saved()), 'Alt+↑ ' + await saved());
  await page.keyboard.type('X');
  await page.waitForTimeout(80);
  assert(/^<span class="ft-image"[^>]*><img[^>]*><\/span><p>XUn<\/p>/.test(await saved()), 'frappe ' + await saved());
  await page.click('#editor .ft-image');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Nouveau');
  await page.waitForTimeout(80);
  assert(/<\/span><p>Nouveau<\/p><p>XUn<\/p>/.test(await saved()), 'Entrée ' + await saved());
  await page.click('#editor .ft-image');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(80);
  assert(!/ft-image/.test(await saved()), 'Suppr');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(80);
  assert(/ft-image/.test(await saved()), 'Ctrl+Z après Suppr');
  ok('clavier : Alt+↓ / Alt+↑ déplacent l’image, la frappe continue après elle, Entrée ajoute une ligne, Suppr l’efface (Ctrl+Z la rend)');

  // 13. Légende : écrite dans l'image, enregistrée, une seule étape d'annulation.
  await page.click('#editor .ft-image');
  await page.click('#image-tools button[data-act="encadrage"]');
  await page.click('#image-frame-pop button:has-text("Dessous")');
  await page.click('#image-frame-pop .pop-done');
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !!document.activeElement.closest('.ft-caption')), 'curseur dans la légende');
  await page.keyboard.type('Une légende');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert(/<span class="ft-caption"[^>]*>Une légende<\/span>/.test(await saved()), 'légende ' + await saved());
  await page.keyboard.type('après');
  await page.waitForTimeout(80);
  assert(/<\/span><\/span><p>aprèsNouveau<\/p>/.test(await saved()), 'Entrée sort de la légende ' + await saved());
  ok('légende : écrite dans l’image, Entrée en sort (curseur au début de la ligne suivante), le texte est enregistré');

  // 14. Image insérée par le bouton (fichier choisi) : placée au curseur et sélectionnée.
  await reset(`<p>Avant MILIEU après</p><p>Fin</p>`);
  await caretAt('#editor p', 'MILIEU');
  await page.evaluate(async (src) => {
    const bin = atob(src.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    window.FTLayout.insertImages([new File([blob], 'rouge.png', { type: 'image/png' })]);
  }, png);
  await page.waitForTimeout(400);
  assert(/^<p><span class="ft-image"[^>]*data-wrap="gauche"[^>]*><img[^>]*><\/span>Avant MILIEU après<\/p>/.test(await saved()), 'insertion ' + await saved());
  assert(await page.evaluate(() => window.FTMoteur.view.state.selection.toJSON().type === 'node'), 'sélectionnée');
  ok('image choisie dans un fichier : déplacement libre, au début de la ligne du curseur, sélectionnée');

  // 15. Schéma : inséré par la fenêtre des schémas, modifié par double-clic.
  await reset(`<p>Avant</p><p>Fin</p>`);
  await caretAt('#editor p', 'Avant');
  await page.click('#diagram-btn');
  await page.waitForTimeout(200);
  await page.click('#diagram-dialog [data-act="ok"]');
  await page.waitForTimeout(300);
  assert(/<span class="ft-image ft-diagram"[^>]*data-diagram=/.test(await saved()), 'schéma inséré ' + (await saved()).slice(0, 300));
  const d0 = await page.evaluate(() => JSON.parse(document.querySelector('#editor .ft-diagram').dataset.diagram).nodes.length);
  await page.dblclick('#editor .ft-diagram');
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.getElementById('diagram-dialog').open), 'fenêtre ouverte');
  assert.strictEqual(await page.evaluate(() => document.querySelector('#diagram-dialog [data-act="ok"]').textContent), 'Valider');
  await page.click('#diagram-dialog [data-act="ok"]');
  await page.waitForTimeout(300);
  assert.strictEqual((await saved()).match(/ft-diagram/g).length, 1, 'un seul schéma');
  ok(`schéma : inséré (${d0} formes) puis rouvert par double-clic`);

  // 16. Paragraphe coupé autour d'un tableau à côté du texte : recollé quand le tableau est supprimé.
  await reset(`<p data-coupe="">Début du paragraphe </p><table class="ft-table" data-wrap="gauche" style="width: 40%;"><tbody><tr><td>a</td></tr></tbody></table><p data-suite="">et sa fin.</p><p>Autre</p>`);
  await page.evaluate(() => window.FTObjets.selectObject(document.querySelector('#editor table')));
  await page.keyboard.press('Delete');
  await page.waitForTimeout(80);
  assert.strictEqual(await saved(), '<p>Début du paragraphe et sa fin.</p><p>Autre</p>');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(80);
  assert(/^<p data-coupe="">Début du paragraphe <\/p><table/.test(await saved()), 'Ctrl+Z ' + await saved());
  ok('tableau à côté du texte supprimé : les deux morceaux du paragraphe se recollent (Ctrl+Z les recoupe)');

  // 17. Un geste = une étape d'annulation ; le texte enregistré suit.
  await reset(`<p>Un</p><span class="ft-image" contenteditable="false" style="width: 30%;"><img src="${png}"></span><p>Deux</p>`);
  await page.click('#editor .ft-image');
  const u0 = await undoDepth();
  g = await grip('e');
  await drag(g.x, g.y, 50, 0);
  const u1 = await undoDepth();
  const wAfter = /width: ([\d.]+)%/.exec(await saved())[1];
  assert(u1 === u0 + 1 && Number(wAfter) > 30, `étapes ${u0} → ${u1}, largeur ${wAfter}`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(80);
  assert(/width: 30%/.test(await saved()), 'annulé');
  ok(`taille changée à la souris : une seule étape d’annulation (largeur 30 → ${wAfter} %)`);

  // 18. Très long document (environ 300 pages, mode avancé) : objet au milieu du texte.
  const half = corpus().repeat(11);
  await reset(half + `<span class="ft-image" id="loin" contenteditable="false" style="width: 30%;"><img src="${png}"></span>` + half, { mode: 'avance' });
  await page.waitForTimeout(1500);
  const sheets = await page.evaluate(() => document.querySelectorAll('.pg-sheet').length);
  await page.evaluate(() => {
    const v = window.FTMoteur.view;
    let at = null;
    v.state.doc.forEach((n, p) => { if (at === null && n.type.name === 'image' && n.attrs.a.id === 'loin') at = p + n.nodeSize; });
    v.dispatch(v.state.tr.setSelection(PM.state.TextSelection.near(v.state.doc.resolve(at))).scrollIntoView());
  });
  await page.waitForTimeout(400);
  const tSel = await page.evaluate(() => {
    const t = performance.now();
    window.FTObjets.selectObject(document.getElementById('loin'));
    document.body.offsetHeight;
    return performance.now() - t;
  });
  await page.waitForTimeout(100);
  const tMove = await page.evaluate(() => new Promise((resolve) => {
    const t = performance.now();
    document.querySelector('#image-tools button[data-act="libre"]').click();
    requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t), 0));
  }));
  await page.waitForTimeout(300);
  assert(/<span class="ft-image" id="loin"[^>]*data-wrap="(gauche|droite)"/.test(await page.evaluate(() => window.FTEditor.getHtml().replace(/src="[^"]*"/g, ''))), 'texte mouvant enregistré');
  const shown = await page.evaluate(() => window.FTVisibles.shown().length);
  const total = await page.evaluate(() => window.FTMoteur.view.state.doc.childCount);
  assert(shown < total / 10, `blocs affichés ${shown} / ${total}`);
  g = await grip('e');
  const tResize = await page.evaluate(([x, y]) => new Promise((resolve) => {
    // Geste complet simulé : appui, déplacement, relâchement, puis l'image suivante.
    const grip = document.elementFromPoint(x, y);
    const t = performance.now();
    grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + 40, clientY: y }));
    requestAnimationFrame(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + 40, clientY: y }));
      requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t), 0));
    });
  }), [g.x, g.y]);
  await page.waitForTimeout(200);
  ok(`très long document (${sheets} pages, ${shown} blocs affichés sur ${total}) : sélection ${Math.round(tSel)} ms, déplacement libre ${Math.round(tMove)} ms, taille à la souris ${Math.round(tResize)} ms`);
};
