// Essai du mode raccourcis (toolbar.js) : l'interrupteur de la barre principale met les outils courants
// sur deux barres verticales (insertion à gauche, mise en forme à droite), la barre d'insertion se vide
// dans la barre principale ; chaque outil revient à sa place à l'arrêt. Outils déplacés à la souris,
// réglages gardés après un redémarrage, ancien rangement (sans « side ») accepté.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const state = () => page.evaluate(() => {
    const ids = (sel) => [...document.querySelectorAll(sel)].map((c) => c.dataset.tb);
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.offsetWidth > 0; };
    const groupOf = (id) => { const el = document.querySelector(`.tb-group > [data-tb="${id}"]`); return el ? (el.parentElement.dataset.group || 'cote-' + el.parentElement.dataset.side) : null; };
    const barOf = (id) => { const el = document.querySelector(`.tb-group > [data-tb="${id}"]`); return el ? el.closest('.ft-toolbar').id : null; };
    return {
      left: ids('#tb-side-l .tb-group > [data-tb]'),
      right: ids('#tb-side-r .tb-group > [data-tb]'),
      leftShown: vis('tb-side-l'),
      rightShown: vis('tb-side-r'),
      bar2Shown: vis('toolbar2'),
      foldShown: document.querySelector('#toolbar .tb-fold').offsetWidth > 0,
      pressed: document.querySelector('#sidemode-switch [aria-pressed="true"]').dataset.side,
      layout: window.FTToolbar.layout(),
      groupOf: Object.fromEntries(['bold', 'table', 'find', 'pdf-source', 'tags', 'font', 'lettrine'].map((id) => [id, groupOf(id)])),
      barOf: Object.fromEntries(['bold', 'table', 'pdf-source', 'tags', 'cover'].map((id) => [id, barOf(id)]))
    };
  });

  await page.evaluate(() => {
    document.getElementById('editor').innerHTML = '<p>Le marché des tomates anciennes en Italie.</p>';
  });
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.waitForTimeout(300);

  const s0 = await state();
  assert(!s0.leftShown && !s0.rightShown && s0.bar2Shown && s0.pressed === 'off', 'départ : ' + JSON.stringify(s0));
  const homeGroups = JSON.stringify(s0.layout.groups);
  ok('Départ : barres horizontales, barres latérales cachées');

  // ----- Mode raccourcis -----
  await page.click('#sidemode-switch [data-side="on"]');
  await page.waitForTimeout(450);
  const s1 = await state();
  assert(s1.leftShown && s1.rightShown && !s1.bar2Shown && !s1.foldShown && s1.pressed === 'on', 'mode : ' + JSON.stringify(s1));
  for (const id of ['table', 'image', 'diagram', 'math', 'quote', 'callout', 'code', 'chars', 'note', 'cite', 'weblink']) assert(s1.left.includes(id), 'gauche : ' + id);
  for (const id of ['font', 'size', 'bold', 'italic', 'underline', 'color', 'highlight', 'align-center', 'bullets', 'lettrine']) assert(s1.right.includes(id), 'droite : ' + id);
  assert.strictEqual(s1.barOf['pdf-source'], 'toolbar');
  assert.strictEqual(s1.barOf.tags, 'toolbar');
  assert.strictEqual(s1.barOf.cover, 'toolbar');
  assert.strictEqual(JSON.stringify(s1.layout.groups), homeGroups, 'places d\'origine gardées dans les réglages');
  assert(s1.layout.side.on === true, 'side.on');
  ok(`Mode raccourcis : ${s1.left.length} outils à gauche, ${s1.right.length} à droite, une seule barre horizontale`);

  // Les deux barres collent aux bords de la page, une seule colonne, icônes alignées.
  const geo = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const icons = (id) => [...document.querySelectorAll(`#${id} .tb-group > [data-tb]`)].filter((el) => el.offsetWidth && !el.matches('select, .ft-num'))
      .map((el) => Math.round((el.matches('button') ? el : el.querySelector('button')).getBoundingClientRect().left));
    return { l: r('tb-side-l'), r: r('tb-side-r'), p: r('page'), li: icons('tb-side-l'), ri: icons('tb-side-r') };
  });
  assert(geo.l.right <= geo.p.left && geo.p.left - geo.l.right <= 10, 'gauche collée : ' + JSON.stringify(geo));
  assert(geo.r.left >= geo.p.right && geo.r.left - geo.p.right <= 10, 'droite collée : ' + JSON.stringify(geo));
  assert(geo.l.width <= 50 && geo.r.width <= 50, 'barres fines : ' + geo.l.width + ' / ' + geo.r.width);
  assert(new Set(geo.li).size === 1 && new Set(geo.ri).size === 1, 'icônes alignées : ' + geo.li + ' | ' + geo.ri);
  // Au défilement, les barres restent visibles en haut de la zone de texte.
  await page.evaluate(() => { document.getElementById('editor').innerHTML += '<p>Suite.</p>'.repeat(120); });
  await page.evaluate(() => { document.getElementById('workspace').scrollTop = 1500; });
  await page.waitForTimeout(200);
  const top = await page.evaluate(() => [document.getElementById('tb-side-l').getBoundingClientRect().top, document.getElementById('workspace').getBoundingClientRect().top]);
  assert(top[0] >= top[1] && top[0] - top[1] < 20, 'fixes au défilement : ' + top);
  await page.evaluate(() => { document.getElementById('workspace').scrollTop = 0; document.getElementById('editor').innerHTML = '<p>Le marché des tomates anciennes en Italie.</p>'; });
  await page.waitForTimeout(200);
  // Noms des groupes de la barre horizontale : aucun chevauchement.
  const overlap = await page.evaluate(() => {
    const gs = [...document.querySelectorAll('#toolbar > .tb-group:not([hidden])')].filter((g) => g.offsetWidth);
    for (let i = 1; i < gs.length; i++) if (gs[i].getBoundingClientRect().left < gs[i - 1].getBoundingClientRect().right - 1) return gs[i].dataset.group;
    return null;
  });
  assert(!overlap, 'groupes qui se chevauchent : ' + overlap);
  await page.screenshot({ path: path.join(SHOTS, 'mode-raccourcis.png') });
  ok('Barres contre le document, groupes de la barre horizontale côte à côte');

  // Gras depuis la barre de droite.
  await page.evaluate(() => {
    const t = document.querySelector('#editor p').firstChild;
    const r = document.createRange();
    r.setStart(t, 3); r.setEnd(t, 9);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  });
  await page.click('#tb-side-r [data-tb="bold"]');
  await page.waitForTimeout(250);
  assert(/<(strong|b)\b[^>]*>marché<\/(strong|b)>/.test(await page.evaluate(() => document.querySelector('#editor p').innerHTML)), 'gras appliqué');
  ok('Gras depuis la barre de droite');

  // Fenêtre de couleur : à gauche du bouton (barre de droite).
  await page.click('#tb-side-r [data-tb="color"] .caret-btn');
  await page.waitForTimeout(250);
  const pop = await page.evaluate(() => {
    const p = document.getElementById('color-pop');
    return { shown: !p.hidden, right: p.getBoundingClientRect().right, bar: document.getElementById('tb-side-r').getBoundingClientRect().left };
  });
  assert(pop.shown && pop.right <= pop.bar + 2, 'palette à gauche : ' + JSON.stringify(pop));
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 500);
  ok('Palette des couleurs ouverte à côté de la barre de droite');

  // ----- Déplacer un outil à la souris -----
  const box = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const drag = async (from, to) => {
    const a = await box(from);
    const b = await box(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y + 12, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  // « Rechercher » de la barre horizontale vers la barre de gauche.
  await drag('#toolbar [data-tb="find"]', '#tb-side-l [data-tb="xref"]');
  let s = await state();
  assert(s.left.includes('find'), 'find à gauche : ' + s.left);
  assert.strictEqual(JSON.stringify(s.layout.groups), homeGroups, 'place d\'origine de find gardée');
  assert(s.layout.side.groups.liens.includes('find') || Object.values(s.layout.side.groups).flat().includes('find'));
  ok('« Rechercher » posé sur la barre de gauche');
  // « Lettrine » de la barre de droite vers la barre horizontale (groupe Relecture).
  await drag('#tb-side-r [data-tb="lettrine"]', '#toolbar [data-tb="assist"]');
  s = await state();
  assert(!s.right.includes('lettrine') && s.groupOf.lettrine === 'relecture', 'lettrine : ' + JSON.stringify(s.groupOf));
  ok('« Lettrine » ramenée sur la barre horizontale');

  // ----- Redémarrage : le mode et le contenu des barres sont gardés -----
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(1800);
  if (await page.evaluate(() => !document.getElementById('welcome').hidden)) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('editor').innerHTML = '<p>Texte.</p>'; });
  s = await state();
  assert(s.leftShown && s.rightShown && s.left.includes('find') && !s.right.includes('lettrine') && s.groupOf.lettrine === 'relecture', 'après redémarrage : ' + JSON.stringify(s));
  ok('Après redémarrage : mode raccourcis et outils déplacés retrouvés');

  // ----- Arrêt : chaque outil à sa place -----
  await page.click('#sidemode-switch [data-side="off"]');
  await page.waitForTimeout(450);
  s = await state();
  assert(!s.leftShown && !s.rightShown && s.bar2Shown && s.foldShown && s.pressed === 'off', 'arrêt : ' + JSON.stringify(s));
  assert.strictEqual(s.groupOf.find, 'document');
  assert.strictEqual(s.groupOf.bold, 'caracteres');
  assert.strictEqual(s.groupOf.table, 'objets');
  assert.strictEqual(s.barOf['pdf-source'], 'toolbar2');
  assert.strictEqual(s.groupOf.lettrine, 'relecture', 'lettrine reste où elle a été posée');
  const order = await page.evaluate(() => [...document.querySelectorAll('#toolbar > .tb-group[data-group="document"] > [data-tb]')].map((c) => c.dataset.tb));
  assert.strictEqual(order.indexOf('find'), 2, 'find à sa place : ' + order);
  assert(!(await page.$('.tb-home')), 'plus aucune marque');
  ok('Arrêt : outils revenus à leur place, barre d\'insertion de retour');

  // Remettre les boutons : tout revient d'origine, le contenu des barres latérales aussi.
  await page.evaluate(() => window.FTToolbar.apply({ v: 7, pos: 'haut', pos2: 'haut', linked: true, folded: false }));
  s = await state();
  assert.strictEqual(JSON.stringify(s.layout.groups), homeGroups);
  assert(!s.layout.side.on && s.layout.side.groups.liens.join() === 'weblink,xref', 'contenu d\'origine : ' + JSON.stringify(s.layout.side));
  ok('Ancien rangement (sans mode raccourcis) accepté, contenu d\'origine');

  // Barre principale verticale à droite + mode raccourcis : la barre de droite reste contre la page.
  await page.evaluate(() => window.FTToolbar.apply({ v: 7, pos: 'droite', pos2: 'droite', linked: true, side: { on: true } }));
  await page.waitForTimeout(300);
  const g2 = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    return { side: r('tb-side-r'), bar: r('toolbar'), p: r('page') };
  });
  assert(g2.side.left >= g2.p.right && g2.bar.left >= g2.side.right - 1, 'ordre page | latérale | principale : ' + JSON.stringify(g2));
  await page.evaluate(() => window.FTToolbar.apply({ v: 7, pos: 'haut', pos2: 'haut', linked: true }));
  ok('Barre principale verticale : la barre latérale reste contre le document');

  // Raccourci clavier personnalisable (commande « Mode raccourcis »).
  await page.evaluate(() => window.FTToolbar.toggleSide());
  assert((await state()).rightShown);
  await page.evaluate(() => window.FTToolbar.toggleSide());
  assert(!(await state()).rightShown);
  ok('Commande « Mode raccourcis » : marche / arrêt');
};
