// Essai de la Carte du temps : formats de dates (français, numériques, autres langues, siècles,
// décennies, saisons, trimestres), faux amis écartés, clic droit « Ne pas inclure dans la Carte
// du temps » dans le texte et sur la frise, réglages de la frise gardés ; réglages de la mindmap.
const path = require('path');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const labels = (t) => page.evaluate((x) => window.FTTimeline.scan(x).map((e) => e.label), t);

  const CASES = [
    ['Il est né le 18 septembre 1932 à Paris.', ['18 septembre 1932']],
    ['Réunion du 18/01/2026.', ['18 janvier 2026']],
    ['le 18-01-2026', ['18 janvier 2026']],
    ['le 18.01.2026', ['18 janvier 2026']],
    ['Le 18 sept. 1932.', ['18 septembre 1932']],
    ['mardi 1er mai 1950', ['1er mai 1950']],
    ['September 18, 1932', ['18 septembre 1932']],
    ['am 18. September 1932', ['18 septembre 1932']],
    ['el 18 de septiembre de 1932', ['18 septembre 1932']],
    ['09/1932', ['septembre 1932']],
    ['12/25/2026', ['25 décembre 2026']],
    ['au 20e siècle', ['XXe siècle']],
    ['fin du XIXe siècle', ['fin du XIXe siècle']],
    ['dans les années 1930', ['années 1930']],
    ['the 1960s', ['années 1960']],
    ['au printemps 1932, mi-1945', ['printemps 1932', 'mi-1945']],
    ['au premier trimestre 2026 puis 2026T3', ['T1 2026', 'T3 2026']],
    ['1914-18', ['1914', '1918']],
    ['Napoléon (1769-1821)', ['1769', '1821']],
    ['Le livre (1932) est paru', ['1932']],
    ['en 52 av. J.-C.', ['52 av. J.-C.']],
    ['le 29 février 2024', ['29 février 2024']],
    // Faux amis
    ['version 2.1.14 et 1.5.2', []],
    ['de 120 à 150 personnes', []],
    ['en 1 500 exemplaires', []],
    ['le 31 février 1932', []],
    ['Mars est rouge', []],
    ['il y a 1932 euros', []]
  ];
  for (const [text, want] of CASES) assert.deepStrictEqual(await labels(text), want, text);
  // « le 18 septembre » sans année reprend l'année citée plus haut.
  assert.deepStrictEqual(await page.evaluate(() => window.FTTimeline.scan('En 1932, il part. Le 18 septembre, il arrive.').map((e) => (e.approx ? '~' : '') + e.label)), ['1932', '~18 septembre 1932']);
  ok(`${CASES.length} formats lus ou écartés comme prévu`);

  // Document avec des dates
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p>Il est né le 18 septembre 1932 à Paris.</p><p>Réunion du 18/01/2026 avec Paul.</p><p>Le stock atteint 1500 en 1999.</p>';
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(300);

  // Clic droit sur « 18/01/2026 » : l'option écarte la date.
  const box = await page.evaluate(() => {
    const p = [...document.querySelectorAll('#editor p')][1];
    const t = p.firstChild;
    const r = document.createRange();
    r.setStart(t, t.data.indexOf('18/01') + 2);
    r.setEnd(t, t.data.indexOf('18/01') + 3);
    const b = r.getBoundingClientRect();
    return { x: b.x + 1, y: b.y + b.height / 2 };
  });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'carte-menu-texte.png') });
  await page.locator('.context-menu').getByText('Ne pas inclure dans la Carte du temps', { exact: true }).click();
  await page.waitForTimeout(200);
  const html = await page.evaluate(() => window.FTEditor.getHtml ? window.FTEditor.getHtml() : document.getElementById('editor').innerHTML);
  assert(/<span data-tl="non">18\/01\/2026<\/span>/.test(html), 'marque enregistrée : ' + html);
  ok('clic droit sur une date du texte : « Ne pas inclure dans la Carte du temps » pose la marque');

  await page.evaluate(() => window.FTTimeline.show(true));
  await page.waitForTimeout(400);
  const cards = () => page.evaluate(() => [...document.querySelectorAll('.tl-card .tl-date')].map((d) => d.textContent));
  assert.deepStrictEqual(await cards(), ['18 septembre 1932', '1999']);
  assert(/1 exclue/.test(await page.locator('#tl-count').textContent()), 'compte des exclues');
  ok('la date exclue ne figure plus sur la frise, le compte la signale');

  // Clic droit sur une carte : l'écarter depuis la frise (le texte reçoit la marque), puis la reprendre.
  await page.locator('.tl-card', { hasText: '1999' }).click({ button: 'right' });
  await page.locator('.context-menu').getByText('Ne pas inclure dans la Carte du temps', { exact: true }).click();
  await page.waitForTimeout(600);
  assert(await page.evaluate(() => window.FTTimeline.isVisible()), 'retour à la frise');
  assert.deepStrictEqual(await cards(), ['18 septembre 1932']);
  ok('clic droit sur une carte : la date est exclue et la frise reste affichée');

  // Réglages : dates exclues montrées (atténuées), puis reprise d'une date depuis la frise.
  await page.click('#tl-settings-btn');
  await page.locator('#tl-settings label', { hasText: 'Dates exclues' }).click();
  await page.waitForTimeout(200);
  assert.strictEqual(await page.locator('.tl-card.tl-off').count(), 2);
  await page.locator('#tl-settings button', { hasText: 'Grandes' }).click();
  await page.locator('#tl-settings button', { hasText: 'Au-dessus' }).click();
  await page.locator('#tl-settings button', { hasText: 'Par siècle' }).click();
  await page.locator('#tl-settings button', { hasText: 'Losanges' }).click();
  await page.locator('#tl-settings label', { hasText: 'Quadrillage' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'carte-reglages.png') });
  const geo = await page.evaluate(() => {
    const axis = document.querySelector('.tl-axis').getBoundingClientRect().top;
    return { w: document.querySelector('.tl-card').offsetWidth, above: [...document.querySelectorAll('.tl-card')].every((c) => c.getBoundingClientRect().bottom < axis), grid: document.querySelectorAll('.tl-grid').length };
  });
  assert.strictEqual(geo.w, 280);
  assert(geo.above, 'toutes les cartes au-dessus de l\'axe');
  assert(geo.grid > 0, 'quadrillage');
  const saved = await page.evaluate(() => window.FTTimeline.options());
  assert.strictEqual(saved.size, 'large');
  assert.strictEqual(saved.excluded, true);
  ok('réglages : grandes cartes, au-dessus de l\'axe, couleurs par siècle, losanges, quadrillage, dates exclues atténuées');

  await page.mouse.click(5, 300);
  await page.locator('.tl-card.tl-off', { hasText: '1999' }).click({ button: 'right' });
  await page.locator('.context-menu').getByText('Inclure dans la Carte du temps', { exact: true }).click();
  await page.waitForTimeout(600);
  assert.strictEqual(await page.locator('.tl-card.tl-off').count(), 1);
  const html2 = await page.evaluate(() => document.getElementById('editor').innerHTML);
  assert(!/data-tl="non">1999/.test(html2) && /data-tl="non">18\/01\/2026/.test(html2), html2);
  ok('« Inclure dans la Carte du temps » retire la marque');

  // Clic droit sur la date encore exclue, dans le texte : l'option inverse.
  await page.evaluate(() => window.FTTimeline.show(false));
  const span = await page.locator('#editor span[data-tl="non"]').boundingBox();
  await page.mouse.click(span.x + 4, span.y + span.height / 2, { button: 'right' });
  await page.waitForTimeout(150);
  await page.locator('.context-menu').getByText('Inclure dans la Carte du temps', { exact: true }).click();
  await page.waitForTimeout(200);
  assert.strictEqual(await page.locator('#editor span[data-tl="non"]').count(), 0);
  ok('clic droit sur une date exclue dans le texte : « Inclure dans la Carte du temps »');

  // Réglages par défaut
  await page.evaluate(() => window.FTTimeline.show(true));
  await page.waitForTimeout(300);
  await page.click('#tl-settings-btn');
  await page.locator('#tl-settings button', { hasText: 'Rétablir' }).click();
  assert.strictEqual((await page.evaluate(() => window.FTTimeline.options())).size, 'normal');
  await page.evaluate(() => window.FTTimeline.show(false));
  ok('réglages par défaut rétablis');

  // Mindmap : réglages de l'apparence
  await page.evaluate(() => window.FTMindmap.show(true));
  await page.waitForTimeout(300);
  await page.click('#mindmap-settings-btn');
  for (const t of ['Grands', 'Carrés', 'Accent', 'Épais', 'Grande', 'Toujours', 'Large', 'Quadrillage']) await page.locator('#mindmap-settings button', { hasText: t }).first().click();
  await page.locator('#mindmap-settings label', { hasText: 'Liens courbes' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'mindmap-reglages.png') });
  const look = await page.evaluate(() => window.FTMindmap.look());
  assert.deepStrictEqual(look, { size: 'grand', degree: true, color: 'accent', shape: 'carre', line: 'epaisse', curve: true, label: 'grand', names: 'toujours', spacing: 'large', background: 'quadrillage' });
  await page.locator('#mindmap-settings button', { hasText: 'Rétablir' }).click();
  assert.strictEqual((await page.evaluate(() => window.FTMindmap.look())).size, 'normal');
  await page.mouse.click(400, 500);
  assert(await page.locator('#mindmap-settings').isHidden(), 'fenêtre fermée par un clic ailleurs');
  await page.evaluate(() => window.FTMindmap.show(false));
  ok('mindmap : points, forme, couleur, liens, noms, espacement, fond, liens courbes ; réglages par défaut');
};
