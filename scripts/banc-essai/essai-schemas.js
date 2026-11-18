// Essai des schémas : nouvelles formes (cercle, début / fin, sous-processus, délai, pentagone, octogone,
// chevron, flèche double, croix, bulle, cadre avec titre), modèles tout prêts (organigramme, processus,
// cycle, pyramide, Venn, chronologie, logigramme, carte mentale, matrice, entonnoir), groupes (sélection et
// déplacement ensemble, dissocier), disposition automatique en arbre, position du texte, Ctrl+Z, insertion
// dans le document et nouvelle ouverture.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const cur = () => page.evaluate(() => window.FTDiagram.current());
  const dlg = page.locator('#diagram-dialog');
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p id="p">Texte avant le schéma.</p>';
    ed.dispatchEvent(new Event('input'));
    window.FTHistory.reset();
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(document.getElementById('p'));
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  });
  await page.evaluate(() => window.FTDiagram.open(null));
  await page.waitForTimeout(200);

  // 1. Palette : 27 formes ; chaque nouvelle forme s'ajoute d'un clic.
  const titles = await page.evaluate(() => [...document.querySelectorAll('#diagram-dialog .dg-shapes button')].map((b) => b.title));
  assert.strictEqual(titles.length, 27, titles.join(' | '));
  const NEW = ['Cercle', 'Début / fin', 'Sous-processus', 'Délai', 'Pentagone', 'Octogone', 'Étape (chevron)', 'Flèche double', 'Croix', 'Bulle', 'Cadre avec titre'];
  for (const t of NEW) await dlg.locator(`.dg-shapes button[title="${t}"]`).click();
  let d = await cur();
  const shapes = d.nodes.map((n) => n.shape);
  for (const s of ['cercle', 'pilule', 'processus', 'retard', 'pentagone', 'octogone', 'chevron', 'fleche-double', 'croix', 'bulle', 'cadre']) assert(shapes.includes(s), s);
  assert.strictEqual(shapes[0], 'cadre', 'le cadre passe sous les autres formes');
  const paths = await page.evaluate(() => [...document.querySelectorAll('#diagram-dialog .dg-content [data-node] path')].map((p) => p.getAttribute('d')));
  assert(paths.every((p) => p && !/NaN|undefined/.test(p)), 'contours dessinés');
  ok('27 formes dans la palette ; les 11 nouvelles s’ajoutent (le cadre sous les autres)');

  // 2. Modèles : sur un schéma neuf, le modèle remplace le départ.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.getElementById('diagram-dialog').close(); window.FTDiagram.open(null); });
  await page.waitForTimeout(150);
  const tpl = await page.evaluate(() => [...document.querySelectorAll('#diagram-dialog .dg-templates button')].map((b) => b.textContent));
  assert.deepStrictEqual(tpl, ['Organigramme', 'Processus', 'Cycle', 'Pyramide', 'Venn', 'Chronologie', 'Logigramme', 'Carte mentale', 'Matrice 2 × 2', 'Entonnoir']);
  await dlg.locator('.dg-templates button', { hasText: 'Organigramme' }).click();
  d = await cur();
  assert.strictEqual(d.nodes.length, 7);
  assert(!d.nodes.some((n) => n.text === 'Début'), 'départ remplacé');
  const by = (t) => d.nodes.find((n) => n.text === t);
  const top = by('Direction');
  for (const t of ['Service A', 'Service B', 'Service C']) assert(by(t).y >= top.y + top.h + 40, t);
  for (const t of ['Équipe 1', 'Équipe 2']) assert(by(t).y >= by('Service A').y + by('Service A').h + 40, t);
  assert(Math.abs(top.x + top.w / 2 - (by('Service A').x + by('Service C').x + by('Service C').w) / 2) < 40, 'direction centrée au-dessus');
  const overlap = (list) => list.some((a, i) => list.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  assert(!overlap(d.nodes), 'aucune forme ne se chevauche');
  await page.screenshot({ path: path.join(SHOTS, 'schema-organigramme.png') });
  ok('modèle « Organigramme » : 7 formes en arbre, sans chevauchement, à la place du départ');

  // Ctrl+Z : retour au départ.
  await page.click('#diagram-dialog .dg-canvas', { position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  d = await cur();
  assert.deepStrictEqual(d.nodes.map((n) => n.text), ['Début', 'Suite']);
  ok('Ctrl+Z : retour au schéma de départ');

  // Les autres modèles s'ajoutent à droite de l'existant.
  const counts = {};
  for (const name of tpl.slice(1)) {
    const before = (await cur()).nodes.length;
    await dlg.locator('.dg-templates button', { hasText: name }).click();
    const after = await cur();
    counts[name] = after.nodes.length - before;
    const mine = after.nodes.slice(-counts[name]);
    const rest = after.nodes.slice(0, before);
    const restRight = Math.max(...rest.map((n) => n.x + n.w));
    assert(Math.min(...mine.map((n) => n.x)) > restRight, name + ' à droite');
  }
  assert.deepStrictEqual(counts, { Processus: 4, Cycle: 4, Pyramide: 4, 'Venn': 3, Chronologie: 11, Logigramme: 6, 'Carte mentale': 7, 'Matrice 2 × 2': 6, Entonnoir: 4 });
  d = await cur();
  const svg = await page.evaluate(() => document.querySelector('#diagram-dialog .dg-content').innerHTML);
  assert(!/NaN|undefined/.test(svg), 'dessin sans valeur manquante');
  const decisionLinks = d.links.filter((l) => l.label === 'Oui' || l.label === 'Non').length;
  assert.strictEqual(decisionLinks, 2, 'logigramme : Oui / Non sur les connecteurs');
  await page.click('#diagram-dialog [data-act="fit"]');
  await page.screenshot({ path: path.join(SHOTS, 'schema-modeles.png') });
  ok('9 autres modèles ajoutés côte à côte : processus, cycle, pyramide, Venn, chronologie, logigramme, carte, matrice, entonnoir');

  // 3. Groupes.
  await page.evaluate(() => { document.getElementById('diagram-dialog').close(); window.FTDiagram.open(null); });
  await page.waitForTimeout(150);
  const center = async (text) => page.evaluate((t) => {
    const d = window.FTDiagram.current();
    const n = d.nodes.find((x) => x.text === t);
    const g = document.querySelector(`#diagram-dialog .dg-content [data-node="${n.id}"] path`).getBoundingClientRect();
    return { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  }, text);
  let a = await center('Début');
  let b = await center('Suite');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  await page.click('#diagram-dialog [data-act="group"]');
  d = await cur();
  assert(d.nodes[0].group && d.nodes[0].group === d.nodes[1].group, 'groupe');
  await page.mouse.click(a.x + 300, a.y + 200);
  await page.mouse.click(a.x, a.y);
  let sel = await page.evaluate(() => document.querySelectorAll('#diagram-dialog .dg-sel').length);
  assert.strictEqual(sel, 2, 'un clic sélectionne tout le groupe');
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#diagram-dialog .dg-group').length), 1);
  const x0 = d.nodes.map((n) => n.x);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 40, a.y + 30, { steps: 6 });
  await page.mouse.move(a.x + 80, a.y + 60, { steps: 6 });
  await page.mouse.up();
  d = await cur();
  const moved = d.nodes.map((n, i) => n.x - x0[i]);
  assert(moved[0] > 40 && moved[0] === moved[1], JSON.stringify(moved));
  ok('Grouper : un clic sélectionne les deux formes, elles se déplacent ensemble');
  await page.click('#diagram-dialog [data-act="ungroup"]');
  d = await cur();
  assert(!d.nodes.some((n) => n.group));
  a = await center('Début');
  await page.mouse.click(a.x + 300, a.y + 200);
  await page.mouse.click(a.x, a.y);
  sel = await page.evaluate(() => document.querySelectorAll('#diagram-dialog .dg-sel').length);
  assert.strictEqual(sel, 1);
  ok('Dissocier : chaque forme se sélectionne seule');

  // Copier-coller d'un groupe : la copie forme un groupe à part.
  await page.keyboard.press('Control+a');
  await page.click('#diagram-dialog [data-act="group"]');
  await page.click('#diagram-dialog [data-act="duplicate"]');
  d = await cur();
  const gs = new Set(d.nodes.map((n) => n.group));
  assert.strictEqual(d.nodes.length, 4);
  assert.strictEqual(gs.size, 2, 'deux groupes');
  ok('Dupliquer un groupe : la copie est un groupe distinct');

  // 4. Disposition automatique en arbre, de gauche à droite.
  await page.evaluate(() => { document.getElementById('diagram-dialog').close(); window.FTDiagram.open(null); });
  await page.waitForTimeout(150);
  // Une chaîne et une branche, placées en désordre par glisser depuis les points d'accroche.
  for (let i = 0; i < 2; i++) {
    const n = await page.evaluate((k) => window.FTDiagram.current().nodes[k].text, i);
    const c = await center(n);
    await page.mouse.move(c.x, c.y);
    await page.waitForTimeout(60);
    const an = await page.locator('#diagram-dialog .dg-anchor[data-anchor="s"]').boundingBox();
    await page.mouse.move(an.x + an.width / 2, an.y + an.height / 2);
    await page.mouse.down();
    await page.mouse.move(an.x + 30 + i * 90, an.y + 120, { steps: 8 });
    await page.mouse.up();
  }
  d = await cur();
  assert.strictEqual(d.nodes.length, 4);
  assert.strictEqual(d.links.length, 3);
  await page.mouse.click(10, 10);
  await page.click('#diagram-dialog .dg-canvas', { position: { x: 15, y: 15 } });
  await page.click('#diagram-dialog [data-act="arrange-right"]');
  d = await cur();
  const nd = (id) => d.nodes.find((n) => n.id === id);
  for (const l of d.links) {
    const p = nd(l.from.node);
    const c = nd(l.to.node);
    assert(c.x >= p.x + p.w + 40, 'enfant à droite');
    assert.deepStrictEqual([l.from.side, l.to.side], ['e', 'w']);
  }
  assert(!overlap(d.nodes), 'sans chevauchement');
  ok('« Disposer en arbre, de gauche à droite » : chaque forme à droite de celle qui la précède, connecteurs de côté');
  await page.click('#diagram-dialog [data-act="arrange-down"]');
  d = await cur();
  for (const l of d.links) assert(nd(l.to.node).y >= nd(l.from.node).y + nd(l.from.node).h + 40, 'enfant dessous');
  ok('« Disposer en arbre, de haut en bas »');

  // 5. Position du texte dans la forme.
  const first = await center(d.nodes[0].text);
  await page.mouse.click(first.x, first.y);
  const posSel = dlg.locator('.dg-field', { hasText: 'Position du texte' }).locator('select');
  await posSel.selectOption('top');
  d = await cur();
  assert.strictEqual(d.nodes[0].valign, 'top');
  const ty = await page.evaluate((id) => {
    const g = document.querySelector(`#diagram-dialog .dg-content [data-node="${id}"]`);
    return [g.querySelector('text').getBoundingClientRect().top - g.querySelector('path').getBoundingClientRect().top];
  }, d.nodes[0].id);
  assert(ty[0] < 12, 'texte en haut : ' + ty[0]);
  ok('Position du texte : en haut de la forme');

  // 6. Insérer dans le document, puis rouvrir par double-clic.
  await page.evaluate(() => { document.getElementById('diagram-dialog').close(); window.FTDiagram.open(null); });
  await page.waitForTimeout(150);
  await dlg.locator('.dg-templates button', { hasText: 'Cycle' }).click();
  await page.click('#diagram-dialog [data-act="ok"]');
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const b = document.querySelector('#editor .ft-diagram');
    const d = JSON.parse(b.dataset.diagram);
    const img = b.querySelector('img');
    return { shapes: d.nodes.map((n) => n.shape), w: img.naturalWidth, h: img.naturalHeight };
  });
  assert.deepStrictEqual(box.shapes, ['cercle', 'cercle', 'cercle', 'cercle']);
  assert(box.w > 200 && box.h > 200, JSON.stringify(box));
  await page.screenshot({ path: path.join(SHOTS, 'schema-document.png') });
  ok('modèle « Cycle » inséré dans le document comme image');
  const im = await page.locator('#editor .ft-diagram img').boundingBox();
  await page.mouse.dblclick(im.x + im.width / 2, im.y + im.height / 2);
  await page.waitForTimeout(200);
  d = await cur();
  assert.strictEqual(d.nodes.length, 4);
  assert.strictEqual(await page.evaluate(() => document.querySelector('#diagram-dialog [data-act="ok"]').textContent), 'Valider');
  // Un modèle ajouté à un schéma déjà inséré ne le remplace pas.
  await dlg.locator('.dg-templates button', { hasText: 'Processus' }).click();
  assert.strictEqual((await cur()).nodes.length, 8);
  await page.click('#diagram-dialog [data-act="cancel"]');
  ok('double-clic : le schéma se rouvre ; un modèle s’y ajoute sans rien remplacer');

  // 7. Graphes rapides : axes en L et 17 courbes ; orientation, taille, couleur, épaisseur, trait.
  await page.evaluate(() => { document.getElementById('diagram-dialog').close(); window.FTDiagram.open(null); });
  await page.waitForTimeout(150);
  const graphs = await page.evaluate(() => [...document.querySelectorAll('#diagram-dialog .dg-graphs button')].map((b) => b.title));
  assert.deepStrictEqual(graphs, ['Axes X et Y', 'Droite', 'Courbe légère', 'Courbe moyenne', 'Courbe forte', 'Exponentielle', 'Logarithmique',
    'Courbe en S', 'Escalier', 'Dent de scie', 'Cloche', 'Vague', 'Onde', 'Onde aiguë', 'Plateau', 'Décroissance', 'Parabole', 'Pic puis déclin',
    'Puissance', 'Hyperbole', 'Polynôme de degré 3', 'Oscillation amortie', 'Courbe en J', 'Loi normale', 'Fonction de répartition', 'Loi bimodale',
    'Loi asymétrique', 'Histogramme', 'Nuage de points', 'Offre et demande', 'Courbe de Laffer', 'Courbe de Lorenz', 'Tendance et cycle', 'Zone de texte']);
  for (const t of graphs) {
    await dlg.locator(`.dg-graphs button[title="${t}"]`).click();
    if (t === 'Zone de texte') await page.keyboard.press('Escape');
  }
  d = await cur();
  const axes = d.nodes.find((n) => n.shape === 'g-axes');
  assert.strictEqual(d.nodes[0].shape, 'g-axes', 'les axes passent sous les autres formes');
  assert(axes.w === 280 && axes.h === 200 && axes.arrows && axes.fill === 'none', JSON.stringify(axes));
  const curves = d.nodes.filter((n) => /^g-/.test(n.shape) && n.shape !== 'g-axes');
  assert.strictEqual(curves.length, 32);
  const gpaths = await page.evaluate(() => [...document.querySelectorAll('#diagram-dialog .dg-content [data-node] > path')].map((p) => [p.getAttribute('d'), p.getAttribute('fill')]));
  assert(gpaths.every(([p]) => p && !/NaN|undefined|Infinity/.test(p)), 'tracés');
  // Axes en L (pas en croix) : l'origine est le coin bas gauche de la boîte.
  const ax = await page.evaluate((id) => document.querySelector(`#diagram-dialog [data-node="${id}"] path`).getAttribute('d'), axes.id);
  const [p0, p1, p2] = ax.split(/[ML]/).filter(Boolean).slice(0, 3).map((q) => q.split(',').map(Number));
  assert.deepStrictEqual([p0, p1, p2], [[axes.x, axes.y], [axes.x, axes.y + axes.h], [axes.x + axes.w, axes.y + axes.h]]);
  ok('graphes : 34 boutons (axes en L, 32 courbes, zone de texte), ajoutés d’un clic, tracés sans remplissage');
  // Réglages d'une courbe : retourner, quart de tour (la boîte tourne), inclinaison, couleur, épaisseur, trait.
  const sCurve = curves.find((n) => n.shape === 'g-s');
  const sBox = await page.locator(`#diagram-dialog .dg-content [data-node="${sCurve.id}"] rect`).boundingBox();
  // (Coin haut gauche : les courbes ajoutées ensuite sont décalées vers le bas à droite.)
  await page.mouse.click(sBox.x + 6, sBox.y + 6);
  assert.strictEqual(await dlg.locator('.dg-props .dg-title').first().textContent(), 'Graphe');
  const firstPoint = async () => page.evaluate((id) => document.querySelector(`#diagram-dialog [data-node="${id}"] path`).getAttribute('d').split('L')[0], sCurve.id);
  const before = await firstPoint();
  await dlg.locator('.dg-props button[title="Retourner horizontalement"]').click();
  assert.notStrictEqual(await firstPoint(), before);
  await dlg.locator('.dg-props button[title="Tourner d\'un quart de tour"]').click();
  await dlg.locator('.dg-field', { hasText: 'Inclinaison' }).locator('input').fill('15');
  await dlg.locator('.dg-field', { hasText: 'Inclinaison' }).locator('input').press('Tab');
  await dlg.locator('.dg-field', { hasText: 'Épaisseur' }).locator('input').fill('4');
  await dlg.locator('.dg-field', { hasText: 'Épaisseur' }).locator('input').press('Tab');
  await dlg.locator('.dg-field', { hasText: 'Trait' }).locator('select').selectOption('tirets');
  await dlg.locator('.dg-props .dg-colors button[title="#e74c3c"]').click();
  d = await cur();
  const sNow = d.nodes.find((n) => n.id === sCurve.id);
  assert(sNow.flipH && sNow.turn === 1 && sNow.w === sCurve.h && sNow.h === sCurve.w && sNow.angle === 15, JSON.stringify(sNow));
  assert(sNow.strokeWidth === 4 && sNow.dash === 'tirets' && sNow.stroke === '#e74c3c', JSON.stringify(sNow));
  assert.match(await page.evaluate((id) => document.querySelector(`#diagram-dialog [data-node="${id}"]`).getAttribute('transform'), sCurve.id), /^rotate\(15 /);
  // La courbe suivante reprend couleur, épaisseur et trait.
  await dlg.locator('.dg-graphs button[title="Cloche"]').click();
  d = await cur();
  const next = d.nodes[d.nodes.length - 1];
  assert(next.stroke === '#e74c3c' && next.strokeWidth === 4 && next.dash === 'tirets', JSON.stringify(next));
  ok('courbe : retournée, tournée d’un quart (largeur et hauteur échangées), inclinée de 15°, rouge, épaisseur 4, tirets ; la suivante garde le style');
  // Axes : titres, graduations, sans flèches.
  const aBox = await page.locator(`#diagram-dialog .dg-content [data-node="${axes.id}"] rect`).boundingBox();
  await page.mouse.click(aBox.x + 3, aBox.y + aBox.height - 3);
  await dlg.locator('.dg-field', { hasText: 'Titre X' }).locator('input').fill('Temps');
  await dlg.locator('.dg-field', { hasText: 'Titre X' }).locator('input').press('Tab');
  await dlg.locator('.dg-field', { hasText: 'Titre Y' }).locator('input').fill('Valeur');
  await dlg.locator('.dg-field', { hasText: 'Titre Y' }).locator('input').press('Tab');
  await dlg.locator('.dg-field', { hasText: 'Graduations' }).locator('input').fill('4');
  await dlg.locator('.dg-field', { hasText: 'Graduations' }).locator('input').press('Tab');
  await dlg.locator('.dg-props button', { hasText: 'Flèches' }).click();
  d = await cur();
  const axNow = d.nodes.find((n) => n.id === axes.id);
  assert(axNow.labelX === 'Temps' && axNow.labelY === 'Valeur' && axNow.ticks === 4 && axNow.arrows === false, JSON.stringify(axNow));
  const texts = await page.evaluate((id) => [...document.querySelectorAll(`#diagram-dialog [data-node="${id}"] text`)].map((t) => t.textContent), axes.id);
  assert.deepStrictEqual(texts, ['Temps', 'Valeur']);
  // Taille choisie dans le panneau.
  await dlg.locator('.dg-field', { hasText: 'Largeur' }).locator('input').fill('400');
  await dlg.locator('.dg-field', { hasText: 'Largeur' }).locator('input').press('Tab');
  assert.strictEqual((await cur()).nodes.find((n) => n.id === axes.id).w, 400);
  // Inséré dans le document : l'image contient les titres des axes.
  await page.click('#diagram-dialog [data-act="ok"]');
  await page.waitForTimeout(300);
  const svgText = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#editor .ft-diagram')];
    const b = imgs.find((x) => /g-axes/.test(x.dataset.diagram));
    return window.FTDiagram.exportSvg(JSON.parse(b.dataset.diagram));
  });
  assert(/>Temps</.test(svgText) && />Valeur</.test(svgText) && !/NaN/.test(svgText), 'image du schéma');
  ok('axes : titres « Temps » et « Valeur », 4 graduations, sans flèches, largeur 400 ; schéma inséré dans le document');

  // 8. Nombre de dents, de marches et de cycles.
  await page.evaluate(() => window.FTDiagram.open(null));
  await page.waitForTimeout(150);
  const corners = (id) => page.evaluate((x) => document.querySelector(`#diagram-dialog [data-node="${x}"] path`).getAttribute('d').split(/[ML]/).filter(Boolean).length, id);
  const peaks = (id) => page.evaluate((x) => {
    const pts = document.querySelector(`#diagram-dialog [data-node="${x}"] path`).getAttribute('d').split(/[ML]/).filter(Boolean).map((q) => Number(q.split(',')[1]));
    const top = Math.min(...pts);
    // Sommets : points au plus haut, séparés par un passage plus bas.
    let k = 0;
    let up = false;
    for (const y of pts) { const at = Math.abs(y - top) < 0.6; if (at && !up) k++; up = at; }
    return k;
  }, id);
  const setCount = async (t, label, k) => {
    await dlg.locator(`.dg-graphs button[title="${t}"]`).click();
    const field = dlg.locator('.dg-field', { hasText: label }).locator('input');
    assert.strictEqual(await field.count(), 1, label + ' pour ' + t);
    const def = Number(await field.inputValue());
    await field.fill(String(k));
    await field.press('Tab');
    const all = (await cur()).nodes;
    return { node: all[all.length - 1], def };
  };
  let r = await setCount('Dent de scie', 'Nombre de dents', 7);
  assert(r.def === 4 && r.node.count === 7 && (await corners(r.node.id)) === 1 + 2 * 7, JSON.stringify(r));
  const scie = r;
  r = await setCount('Escalier', 'Nombre de marches', 9);
  assert(r.def === 5 && r.node.count === 9 && (await corners(r.node.id)) === 2 * 9, JSON.stringify(r));
  r = await setCount('Onde', 'Nombre de cycles', 5);
  assert(r.def === 2 && (await peaks(r.node.id)) === 5, JSON.stringify(r));
  r = await setCount('Onde aiguë', 'Nombre de cycles', 3);
  assert(r.def === 2 && (await peaks(r.node.id)) === 3 && (await corners(r.node.id)) === 2 + 2 * 3, JSON.stringify(r));
  r = await setCount('Vague', 'Nombre de cycles', 4);
  assert((await peaks(r.node.id)) === 4, JSON.stringify(r));
  // Pas de réglage pour une courbe simple.
  await dlg.locator('.dg-graphs button[title="Cloche"]').click();
  assert.strictEqual(await dlg.locator('.dg-field', { hasText: 'Nombre de' }).count(), 0);
  // Gardé à l'insertion.
  await page.click('#diagram-dialog [data-act="ok"]');
  await page.waitForTimeout(300);
  const kept = await page.evaluate((id) => {
    const b = [...document.querySelectorAll('#editor .ft-diagram')].find((x) => x.dataset.diagram.includes(id));
    return JSON.parse(b.dataset.diagram).nodes.find((n) => n.id === id).count;
  }, scie.node.id);
  assert.strictEqual(kept, 7);
  ok('dent de scie : 7 dents (4 par défaut), escalier : 9 marches, onde : 5 cycles, onde aiguë : 3 cycles en pointe, vague : 4 cycles ; gardés dans le document');

  // 9. Réglages propres à chaque courbe : loi normale, remplissage d'une zone, nuage, Lorenz.
  await page.evaluate(() => window.FTDiagram.open(null));
  await page.waitForTimeout(150);
  const setField = async (label, v) => {
    const f = dlg.locator('.dg-field', { hasText: label }).locator('input');
    assert.strictEqual(await f.count(), 1, label);
    await f.fill(String(v));
    await f.press('Tab');
  };
  const lastNode = async () => { const all = (await cur()).nodes; return all[all.length - 1]; };
  const pathOf = (id, sel = 'path:not(.dg-area)') => page.evaluate(([x, q]) => document.querySelector(`#diagram-dialog [data-node="${x}"] ${q}`)?.getAttribute('d') || '', [id, sel]);
  const pts = (d) => d.split('M')[1].split('L').map((q) => q.split(',').map(Number));
  await dlg.locator('.dg-graphs button[title="Loi normale"]').click();
  let nn = await lastNode();
  assert.strictEqual(Number(await dlg.locator('.dg-field', { hasText: 'Moyenne' }).locator('input').inputValue()), 50);
  assert.strictEqual(Number(await dlg.locator('.dg-field', { hasText: 'Écart-type' }).locator('input').inputValue()), 15);
  await setField('Moyenne', 30);
  await setField('Écart-type', 10);
  nn = await lastNode();
  let P = pts(await pathOf(nn.id));
  const topPt = P.reduce((a, q) => (q[1] < a[1] ? q : a));
  assert(Math.abs(topPt[0] - (nn.x + 0.3 * nn.w)) < 2 && Math.abs(topPt[1] - nn.y) < 0.6, JSON.stringify([topPt, nn]));
  // Symétrique autour de la moyenne.
  const yAt = (x) => P.reduce((a, q) => (Math.abs(q[0] - x) < Math.abs(a[0] - x) ? q : a))[1];
  assert(Math.abs(yAt(nn.x + 0.2 * nn.w) - yAt(nn.x + 0.4 * nn.w)) < 1.5, 'symétrie');
  await dlg.locator('.dg-props button', { hasText: 'Moyenne' }).click();
  assert.strictEqual((await pathOf(nn.id)).split('M').length - 1, 2, 'trait de la moyenne');
  // Zone remplie entre 30 % et 50 %.
  await dlg.locator('.dg-props button', { hasText: 'Remplir sous la courbe' }).click();
  await setField('Zone : début', 30);
  await setField('Zone : fin', 50);
  await dlg.locator('.dg-field', { hasText: 'Opacité du remplissage' }).locator('select').selectOption('0.4');
  nn = await lastNode();
  assert(nn.area && nn.areaFrom === 30 && nn.areaTo === 50 && nn.areaOpacity === 0.4 && nn.center === 30 && nn.spread === 10 && nn.meanLine, JSON.stringify(nn));
  const A = pts((await pathOf(nn.id, 'path.dg-area')).replace('Z', ''));
  const xs = A.map((q) => q[0]);
  assert(Math.abs(Math.min(...xs) - (nn.x + 0.3 * nn.w)) < 0.2 && Math.abs(Math.max(...xs) - (nn.x + 0.5 * nn.w)) < 0.2, JSON.stringify(xs));
  assert.strictEqual(A[A.length - 1][1], nn.y + nn.h, 'zone fermée sur le bas');
  ok('loi normale : moyenne 30 %, écart-type 10 % (pic à 30 %, symétrique), trait de la moyenne, zone remplie de 30 à 50 % à 40 %');
  // Chaque nouvelle courbe a ses réglages, et les changer change le tracé.
  const each = [['Puissance', 'Exposant', 0.5], ['Hyperbole', 'Courbure', 30], ['Polynôme de degré 3', 'Ondulation', 100], ['Oscillation amortie', 'Amortissement', 6],
    ['Courbe en J', 'Profondeur du creux', 50], ['Fonction de répartition', 'Écart-type', 30], ['Loi bimodale', 'Écart entre les pics', 60],
    ['Loi asymétrique', 'Asymétrie', 100], ['Histogramme', 'Nombre de barres', 15], ['Offre et demande', 'Courbure', 0], ['Courbe de Laffer', 'Position du sommet', 70],
    ['Tendance et cycle', 'Amplitude', 30], ['Courbe en S', 'Raideur', 25], ['Parabole', 'Position du sommet', 20], ['Droite', 'Hauteur au départ', 40]];
  for (const [t, label, v] of each) {
    await dlg.locator(`.dg-graphs button[title="${t}"]`).click();
    const id = (await lastNode()).id;
    const before = await pathOf(id);
    await setField(label, v);
    const after = await pathOf(id);
    assert(after !== before && !/NaN|Infinity|undefined/.test(after), t);
  }
  ok('15 courbes : réglage propre changé (exposant, courbure, ondulation, amortissement, creux, barres, sommet…), tracé refait sans erreur');
  // Histogramme : barres remplies par défaut, une séparation par barre.
  await dlg.locator('.dg-graphs button[title="Histogramme"]').click();
  nn = await lastNode();
  assert(nn.area && (await pathOf(nn.id, 'path.dg-area')), 'histogramme rempli');
  assert.strictEqual((await pathOf(nn.id)).split('M').length - 1, 1 + 8);
  // Nuage : un point par tirage, même tirage = mêmes points.
  await dlg.locator('.dg-graphs button[title="Nuage de points"]').click();
  nn = await lastNode();
  assert.strictEqual(await dlg.locator('.dg-props button', { hasText: 'Remplir sous la courbe' }).count(), 0);
  await setField('Nombre de points', 60);
  const c1 = await pathOf(nn.id);
  assert.strictEqual(c1.split('M').length - 1, 60);
  await setField('Tirage', 2);
  assert.notStrictEqual(await pathOf(nn.id), c1);
  await setField('Tirage', 1);
  assert.strictEqual(await pathOf(nn.id), c1);
  // Lorenz : diagonale par défaut, remplissage entre la courbe et la diagonale.
  await dlg.locator('.dg-graphs button[title="Courbe de Lorenz"]').click();
  nn = await lastNode();
  assert.strictEqual((await pathOf(nn.id)).split('M').length - 1, 2);
  await setField('Indice de Gini', 60);
  await dlg.locator('.dg-props button', { hasText: 'Remplir sous la courbe' }).click();
  const L = pts((await pathOf(nn.id, 'path.dg-area')).replace('Z', ''));
  assert(Math.abs(L[L.length - 2][1] - nn.y) < 0.2, 'zone fermée par la diagonale');
  await dlg.locator('.dg-props button', { hasText: 'Diagonale' }).click();
  assert.strictEqual((await pathOf(nn.id)).split('M').length - 1, 1);
  // Gardé à l'insertion et dans l'image.
  const lorenzId = nn.id;
  await page.click('#diagram-dialog [data-act="ok"]');
  await page.waitForTimeout(300);
  const saved = await page.evaluate((id) => {
    const b = [...document.querySelectorAll('#editor .ft-diagram')].find((x) => x.dataset.diagram.includes(id));
    const d = JSON.parse(b.dataset.diagram);
    return { n: d.nodes.find((x) => x.id === id), svg: window.FTDiagram.exportSvg(d) };
  }, lorenzId);
  assert(saved.n.gini === 60 && saved.n.area && saved.n.diagonal === false && /dg-area/.test(saved.svg) && !/NaN/.test(saved.svg), JSON.stringify(saved.n));
  ok('histogramme rempli (9 barres), nuage : 60 points, même tirage = mêmes points ; Lorenz : Gini 60 %, zone jusqu’à la diagonale, sans diagonale ; gardés dans le document');

  // 10. Zone de texte libre : posée depuis les graphes, écrite tout de suite, fond, cadre, inclinaison, police.
  await page.evaluate(() => window.FTDiagram.open(null));
  await page.waitForTimeout(150);
  await dlg.locator('.dg-graphs button[title="Zone de texte"]').click();
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName) || document.activeElement?.isContentEditable), 'saisie ouverte');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Point d’équilibre');
  await page.click('#diagram-dialog .dg-canvas', { position: { x: 15, y: 15 } });
  let tz = await lastNode();
  assert(tz.shape === 'texte' && tz.text === 'Point d’équilibre', JSON.stringify(tz));
  const tb = await page.locator(`#diagram-dialog .dg-content [data-node="${tz.id}"] rect`).boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  assert.strictEqual(await dlg.locator('.dg-props .dg-title').first().textContent(), 'Zone de texte');
  assert.strictEqual(await dlg.locator('.dg-props .dg-title', { hasText: 'Contour' }).count(), 0);
  await dlg.locator('.dg-props .dg-colors').first().locator('button[title="#fcf3cf"]').click();
  await dlg.locator('.dg-props .dg-colors').nth(1).locator('button[title="#d4ac0d"]').click();
  await setField('Inclinaison', -90);
  await setField('Taille', 18);
  await dlg.locator('.dg-props button[title="Gras"]').click();
  await dlg.locator('.dg-field', { hasText: 'Police' }).locator('select').selectOption('Georgia');
  tz = (await cur()).nodes.find((n) => n.id === tz.id);
  assert(tz.bg === '#fcf3cf' && tz.frame === '#d4ac0d' && tz.angle === -90 && tz.fontSize === 18 && tz.bold && tz.font === 'Georgia', JSON.stringify(tz));
  const tg = await page.evaluate((id) => { const g = document.querySelector(`#diagram-dialog [data-node="${id}"]`); const p = g.querySelector('path'); return [g.getAttribute('transform'), p.getAttribute('fill'), p.getAttribute('stroke')]; }, tz.id);
  assert(/^rotate\(-90 /.test(tg[0]) && tg[1] === '#fcf3cf' && tg[2] === '#d4ac0d', JSON.stringify(tg));
  ok('zone de texte : posée depuis les graphes et écrite tout de suite, fond, cadre, inclinée de −90°, Georgia 18 gras');
};
