// Ouvre une à une les fenêtres et vues du logiciel, puis les referme : aucune erreur attendue.
module.exports = async ({ page }) => {
  await page.click('#editor');
  await page.keyboard.type('Premier paragraphe avec une fote.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Deuxième paragraphe, le 12 mars 1998, Paris.');
  await page.waitForTimeout(800);
  const menu = (a) => page.evaluate((x) => window.__ftEmit('menu', [x]), a);
  const close = async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  };
  const actions = ['theme', 'theme', 'theme', 'sidebar', 'sidebar', 'navpane', 'navpane', 'mindmap', 'mindmap', 'timeline', 'timeline',
    'find', 'replace', 'customize', 'doc-theme', 'versions', 'goals', 'shortcuts', 'track', 'track', 'bookmarks', 'tags-off', 'tags-on',
    'focus', 'focus', 'export-choose', 'undo', 'redo', 'select-all', 'save', 'new'];
  for (const a of actions) {
    await menu(a);
    await page.waitForTimeout(350);
    if (!['theme', 'undo', 'redo', 'select-all', 'save', 'sidebar', 'tags-on', 'tags-off', 'track', 'mindmap', 'timeline', 'navpane', 'focus'].includes(a)) await close();
  }
  // Boutons de la barre d'outils : on clique ceux qui sont visibles (sauf ceux qui ouvrent des fichiers).
  const ids = await page.$$eval('.ft-toolbar button[id]', (b) => b.filter((x) => x.offsetParent).map((x) => x.id));
  let n = 0;
  for (const id of ids) {
    if (/import|export|open|folder|pdf|word/i.test(id)) continue;
    await page.click('#editor');
    try { await page.click('#' + id, { timeout: 1500 }); n++; } catch { /* masqué */ }
    await page.waitForTimeout(120);
    await close();
  }
  console.log('  fenêtres ouvertes :', actions.length, '· boutons cliqués :', n);
};
