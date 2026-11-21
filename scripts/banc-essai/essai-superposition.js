// Essai 2.4.31 : superposition dans les schémas.
// - les connecteurs passent au-dessus des formes et des graphes par défaut ;
// - la boîte vide d'un graphe laisse passer le clic vers le connecteur qu'elle recouvre ;
// - réglage « Superposition » par élément : Premier plan, Arrière-plan, Avancer, Reculer, Niveau ;
// - l'ordre est le même dans le dessin inséré dans le document.
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const cur = () => v(() => window.FTDiagram.current());
  const dlg = page.locator('#diagram-dialog');

  // Départ : Début → Suite, puis un graphe « Escalier ».
  await v(() => window.FTDiagram.open(null));
  await page.waitForTimeout(200);
  await dlg.locator('.dg-graphs button[title="Escalier"]').click();
  let d = await cur();
  const g = d.nodes.find((n) => n.shape === 'g-escalier');
  const debut = d.nodes.find((n) => n.text === 'Début');
  // Mise en place : le graphe en (0, 0, 200 × 120), une forme au-dessus, Début en dessous, reliées par un
  // connecteur vertical qui traverse la boîte du graphe (comme dans le signalement).
  Object.assign(g, { x: 0, y: 0, w: 200, h: 120 });
  Object.assign(debut, { x: 100 - debut.w / 2, y: 260 });
  const haut = { ...debut, id: 'n-haut', text: 'Haut', x: 100 - debut.w / 2, y: -160 };
  d.nodes.push(haut);
  d.links = [{ ...d.links[0], id: 'l-vert', from: { node: haut.id, side: 's' }, to: { node: debut.id, side: 'n' } }];
  await v((json) => {
    document.getElementById('diagram-dialog').close();
    const box = document.createElement('div');
    box.dataset.diagram = json;
    window.FTDiagram.open(box);
  }, JSON.stringify(d));
  await page.waitForTimeout(200);

  const at = (x, y) => v(([x, y]) => {
    const m = document.querySelector('#diagram-dialog .dg-content').getScreenCTM();
    return [m.a * x + m.e, m.d * y + m.f];
  }, [x, y]);
  const clickAt = async (x, y) => { const [cx, cy] = await at(x, y); await page.mouse.click(cx, cy); };
  const panel = () => v(() => document.querySelector('#diagram-dialog .dg-props .dg-title').textContent);
  const order = () => v(() => [...document.querySelectorAll('#diagram-dialog .dg-content > [data-node], #diagram-dialog .dg-content > [data-link]')].map((e) => e.dataset.node || e.dataset.link));

  // 1. Par défaut, le connecteur est dessiné après (au-dessus) du graphe.
  let o = await order();
  assert.ok(o.indexOf('l-vert') > o.indexOf(g.id), o.join(','));
  ok('connecteur au-dessus du graphe par défaut');

  // 2. Clic sur le connecteur, dans la boîte du graphe : le connecteur est sélectionné.
  for (const y of [12, 108]) {
    await clickAt(-200, -200);
    await clickAt(100, y);
    assert.strictEqual(await panel(), 'Connecteur', 'y=' + y);
  }
  ok('le connecteur se sélectionne à l’intérieur de la boîte du graphe');

  // 3. Envoyé à l'arrière-plan, il reste cliquable : la boîte vide du graphe laisse passer le clic.
  await dlg.locator('.dg-toggles button', { hasText: 'Arrière-plan' }).click();
  d = await cur();
  assert.ok(d.links[0].z < 0, JSON.stringify(d.links[0].z));
  o = await order();
  assert.ok(o.indexOf('l-vert') < o.indexOf(g.id), o.join(','));
  await clickAt(-200, -200);
  await clickAt(100, 108);
  assert.strictEqual(await panel(), 'Connecteur');
  ok('connecteur à l’arrière-plan, toujours sélectionnable à travers la boîte vide du graphe');

  // 4. Le graphe se prend toujours par sa boîte vide, là où rien d'autre n'est dessous.
  await clickAt(-200, -200);
  await clickAt(170, 100);
  assert.strictEqual(await panel(), 'Graphe');
  ok('graphe sélectionné par un clic dans sa boîte vide');

  // 5. Avancer / Reculer / Premier plan / Niveau, et Annuler.
  const level = () => v(() => {
    const f = [...document.querySelectorAll('#diagram-dialog .dg-props .dg-field')].find((x) => x.firstChild.textContent === 'Niveau');
    return f ? f.querySelector('input').value : [...document.querySelectorAll('#diagram-dialog .dg-props .dg-title')].map((x) => x.textContent).join('|');
  });
  await dlg.locator('.dg-toggles button', { hasText: 'Avancer' }).click();
  d = await cur();
  assert.strictEqual(d.nodes.find((n) => n.id === g.id).z, 1);
  assert.strictEqual(await level(), '1');
  await dlg.locator('.dg-toggles button', { hasText: 'Reculer' }).click();
  d = await cur();
  assert.strictEqual(d.nodes.find((n) => n.id === g.id).z, undefined, 'niveau 0 : propriété retirée');
  await dlg.locator('.dg-toggles button', { hasText: 'Premier plan' }).click();
  d = await cur();
  const z = d.nodes.find((n) => n.id === g.id).z;
  assert.ok(z > 0, String(z));
  o = await order();
  assert.strictEqual(o[o.length - 1], g.id, o.join(','));
  await dlg.locator('[data-act="undo"]').click();
  d = await cur();
  assert.strictEqual(d.nodes.find((n) => n.id === g.id).z, undefined);
  ok('Avancer, Reculer, Premier plan et Annuler');

  // 6. Le dessin exporté suit le même ordre.
  await clickAt(-200, -200);
  await clickAt(170, 100);
  await dlg.locator('.dg-toggles button', { hasText: 'Premier plan' }).click();
  const svg = await v(() => window.FTDiagram.exportSvg(window.FTDiagram.current()));
  assert.ok(svg.indexOf('data-link="l-vert"') < svg.indexOf(`data-node="${g.id}"`), 'ordre exporté');
  assert.ok(svg.indexOf(`data-node="${haut.id}"`) < svg.indexOf(`data-node="${g.id}"`), 'ordre exporté');
  ok('le dessin exporté suit l’ordre de superposition');
  await v(() => document.getElementById('diagram-dialog').close());
};
