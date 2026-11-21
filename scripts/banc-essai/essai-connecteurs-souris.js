// Essai 2.4.32–2.4.33 : connecteurs déplacés à la souris dans les schémas (à la façon de Visio).
// - glisser le trait d'un connecteur décale son tracé (coudé, droit, courbe) ; « Rétablir le tracé » ;
// - glisser une extrémité vers une autre forme y rattache le connecteur (côté le plus proche) ;
// - lâchée dans le vide, l'extrémité reste où elle était ; Annuler revient en arrière ;
// - 2.4.33 : points de connexion affichés et aimantés pendant le glisser, extrémité attrapée près du bout
//   du trait, tracés (coudé, droit, courbe) qui contournent les formes au lieu de les traverser.
const assert = require('assert');

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const cur = () => v(() => window.FTDiagram.current());
  const dlg = page.locator('#diagram-dialog');

  // Départ : Début → Suite, plus une troisième forme « Autre » sous Suite.
  await v(() => window.FTDiagram.open(null));
  await page.waitForTimeout(200);
  let d = await cur();
  const debut = d.nodes.find((n) => n.text === 'Début');
  const suite = d.nodes.find((n) => n.text === 'Suite');
  const autre = { ...suite, id: 'n-autre', text: 'Autre', y: suite.y + 200 };
  d.nodes.push(autre);
  d.links[0].id = 'l1';
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
  const drag = async (from, to) => {
    const [x0, y0] = await at(...from);
    const [x1, y1] = await at(...to);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
    await page.mouse.move(x1, y1, { steps: 4 });
    await page.mouse.up();
  };
  const linkPath = () => v(() => document.querySelector('#diagram-dialog .dg-content [data-link="l1"] path:not(.hit)').getAttribute('d'));
  const panel = () => v(() => document.querySelector('#diagram-dialog .dg-props .dg-title').textContent);
  const cy = debut.y + debut.h / 2;
  const mx = (debut.x + debut.w + suite.x) / 2;

  // 1. Glisser le trait (coudé) vers le bas : détour par la hauteur choisie.
  const before = await linkPath();
  await drag([mx, cy], [mx, cy + 80]);
  d = await cur();
  assert.deepStrictEqual(d.links[0].bend, [0, 80], JSON.stringify(d.links[0].bend));
  assert.strictEqual(await panel(), 'Connecteur');
  const after = await linkPath();
  assert.notStrictEqual(after, before);
  const ys = [...after.matchAll(/[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...ys) >= cy + 79, after);
  ok('trait coudé tiré vers le bas : le tracé passe 80 px plus bas');

  // 2. Tirer encore : le décalage s'ajoute ; « Rétablir le tracé » remet le tracé d'origine.
  await drag([mx, cy + 80], [mx, cy + 40]);
  d = await cur();
  assert.deepStrictEqual(d.links[0].bend, [0, 40]);
  await dlg.locator('.dg-props button', { hasText: 'Rétablir le tracé' }).click();
  d = await cur();
  assert.strictEqual(d.links[0].bend, undefined);
  assert.strictEqual(await linkPath(), before);
  ok('décalage cumulé, puis « Rétablir le tracé »');

  // 3. Droit et courbe : le milieu du trait suit la souris.
  for (const route of ['droit', 'courbe']) {
    await v((r) => {
      const s = [...document.querySelectorAll('#diagram-dialog .dg-props .dg-field')].find((f) => f.firstChild.textContent === 'Tracé').querySelector('select');
      s.value = r;
      s.dispatchEvent(new Event('change'));
    }, route);
    await drag([mx, cy], [mx, cy - 60]);
    d = await cur();
    assert.deepStrictEqual(d.links[0].bend, [0, -60], route);
    const svg = await v(() => window.FTDiagram.exportSvg(window.FTDiagram.current()));
    assert.ok(!/NaN/.test(svg), route);
    const len = await v(() => {
      const p = document.querySelector('#diagram-dialog .dg-content [data-link="l1"] path:not(.hit)');
      const q = p.getPointAtLength(p.getTotalLength() / 2);
      return [q.x, q.y];
    });
    assert.ok(Math.abs(len[1] - (cy - 60)) < 8, route + ' ' + len);
    // (Changer de tracé efface le décalage.)
  }
  ok('droit et courbe : le milieu du trait suit la souris');

  // 4. Extrémité tirée vers une autre forme : rattachée au côté le plus proche.
  await v(() => {
    const s = [...document.querySelectorAll('#diagram-dialog .dg-props .dg-field')].find((f) => f.firstChild.textContent === 'Tracé').querySelector('select');
    s.value = 'coude';
    s.dispatchEvent(new Event('change'));
  });
  d = await cur();
  assert.strictEqual(d.links[0].bend, undefined, 'tracé changé : décalage effacé');
  const ends = await v(() => [...document.querySelectorAll('#diagram-dialog .dg-overlay .dg-lend')].map((c) => [c.dataset.lend, +c.getAttribute('cx'), +c.getAttribute('cy')]));
  assert.strictEqual(ends.length, 2);
  const to = ends.find((x) => x[0] === 'to');
  await drag([to[1], to[2]], [autre.x + autre.w / 2, autre.y + 4]);
  d = await cur();
  assert.deepStrictEqual(d.links[0].to, { node: 'n-autre', side: 'n' });
  assert.strictEqual(d.links[0].from.node, debut.id);
  ok('extrémité tirée sur « Autre » : rattachée par le haut');

  // 5. Lâchée dans le vide : rien ne change. Annuler : retour à « Suite ».
  const to2 = await v(() => { const c = document.querySelector('#diagram-dialog .dg-overlay .dg-lend[data-lend="to"]'); return [+c.getAttribute('cx'), +c.getAttribute('cy')]; });
  await drag(to2, [to2[0] + 300, to2[1] + 300]);
  d = await cur();
  assert.deepStrictEqual(d.links[0].to, { node: 'n-autre', side: 'n' });
  await dlg.locator('[data-act="undo"]').click();
  d = await cur();
  assert.strictEqual(d.links[0].to.node, suite.id);
  ok('lâchée dans le vide : inchangé ; Annuler : de nouveau relié à « Suite »');

  // 7. Points de connexion : affichés pendant le glisser ; lâché à 15 px du point gauche de « Autre »
  // (hors de la forme), l'aimant le retient. L'extrémité s'attrape à 10 px du bout, sans la sélectionner d'abord.
  { const [x, y] = await at(mx, cy + 100); await page.mouse.click(x, y); }
  assert.strictEqual(await panel(), 'Schéma');
  const g0 = await v(() => { const c = document.querySelector('#diagram-dialog .dg-content [data-link="l1"] path:not(.hit)'); const q = c.getPointAtLength(c.getTotalLength() - 10); return [q.x, q.y]; });
  const wpt = [autre.x, autre.y + autre.h / 2];
  {
    const [x0, y0] = await at(...g0);
    const [x1, y1] = await at(wpt[0] - 15, wpt[1] + 4);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 4 });
    await page.mouse.move(x1, y1, { steps: 4 });
    const shown = await v(() => [document.querySelectorAll('#diagram-dialog .dg-overlay .dg-cpoint').length, document.querySelectorAll('#diagram-dialog .dg-overlay .dg-cpoint.on').length]);
    assert.deepStrictEqual(shown, [8, 1], JSON.stringify(shown));
    await page.mouse.up();
  }
  d = await cur();
  assert.deepStrictEqual(d.links[0].to, { node: 'n-autre', side: 'w' });
  ok('points de connexion visibles (8, celui visé en couleur), aimant de 26 px, extrémité prise près du bout');

  // 8. Tracés qui contournent : Début (côté droit) → Suite (côté droit), comme dans le signalement.
  const inside = (q, n) => q[0] > n.x + 2 && q[0] < n.x + n.w - 2 && q[1] > n.y + 2 && q[1] < n.y + n.h - 2;
  const pathPoints = () => v(() => {
    const c = document.querySelector('#diagram-dialog .dg-content [data-link="l1"] path:not(.hit)');
    const L = c.getTotalLength();
    return Array.from({ length: 121 }, (_, i) => { const q = c.getPointAtLength((L * i) / 120); return [q.x, q.y]; });
  });
  for (const route of ['coude', 'droit', 'courbe']) {
    d = await cur();
    d.links[0] = { ...d.links[0], route, from: { node: debut.id, side: 'e' }, to: { node: suite.id, side: 'e' } };
    delete d.links[0].bend;
    await v((json) => {
      document.getElementById('diagram-dialog').close();
      const box = document.createElement('div');
      box.dataset.diagram = json;
      window.FTDiagram.open(box);
    }, JSON.stringify(d));
    await page.waitForTimeout(100);
    const pts = await pathPoints();
    const bad = pts.filter((q) => inside(q, suite) || inside(q, debut));
    assert.strictEqual(bad.length, 0, route + ' ' + JSON.stringify(bad.slice(0, 3)));
    const end = pts[pts.length - 1];
    assert.ok(Math.abs(end[0] - (suite.x + suite.w)) < 1 && Math.abs(end[1] - (suite.y + suite.h / 2)) < 1, route + ' ' + end);
    const svg = await v(() => window.FTDiagram.exportSvg(window.FTDiagram.current()));
    assert.ok(!/NaN/.test(svg), route);
  }
  // (Cas ordinaire, côtés face à face : tracé inchangé, une ligne droite.)
  d = await cur();
  d.links[0] = { ...d.links[0], route: 'coude', from: { node: debut.id, side: 'e' }, to: { node: suite.id, side: 'w' } };
  await v((json) => {
    document.getElementById('diagram-dialog').close();
    const box = document.createElement('div');
    box.dataset.diagram = json;
    window.FTDiagram.open(box);
  }, JSON.stringify(d));
  assert.strictEqual(await linkPath(), `M${debut.x + debut.w},${cy}L${suite.x},${cy}`);
  await page.screenshot({ path: require('path').join(process.env.FT_SHOTS || require('os').tmpdir(), 'connecteurs-contournent.png') });
  ok('coudé, droit et courbe de côté droit à côté droit : contournent les formes et arrivent sur le bord');

  // 6. Une forme se déplace toujours normalement (le glisser des connecteurs ne la gêne pas).
  await page.mouse.click(10, 10);
  await drag([autre.x + 10, autre.y + autre.h / 2], [autre.x + 70, autre.y + autre.h / 2]);
  d = await cur();
  assert.strictEqual(d.nodes.find((n) => n.id === 'n-autre').x, autre.x + 60);
  ok('les formes se déplacent comme avant');
  await v(() => document.getElementById('diagram-dialog').close());
};
