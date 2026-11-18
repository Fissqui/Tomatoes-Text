// Essai des sources côte à côte : « Ouvrir un PDF… » (copié dans le projet, source créée d'après les
// informations du PDF), pages dessinées avec leur texte sélectionnable, numéro imprimé de la 1re page,
// passage sélectionné → « Citer » (passage entre guillemets + citation avec la page, au curseur) et
// surlignage gardé, « Référence seule », réouverture du volet, PDF rattaché à une autre source, surlignage
// retiré (clic droit, ou clic simple).
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const SHOTS = process.env.FT_SHOTS || os.tmpdir();

// Petit PDF de trois pages (police Helvetica de base), avec auteur, titre et date.
function makePdf(file) {
  const pages = [
    ['Introduction', 'Les jardins familiaux ont longtemps nourri les villes ouvrieres.'],
    ['Chapitre premier', 'La tomate demande un sol riche et beaucoup de soleil.', 'Elle se plante apres les dernieres gelees du printemps.'],
    ['Conclusion', 'Le potager reste un lieu de transmission entre generations.']
  ];
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null);
  const pagesObj = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const lines of pages) {
    const text = lines.map((l, i) => `BT /F1 ${i ? 12 : 18} Tf 72 ${720 - i * 28} Td (${l}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add('<< /Title (Le potager ouvrier) /Author (Jean Dupont) /CreationDate (D:20190312120000) >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, out, 'latin1');
}

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-pdf-'));
  const file = path.join(dir, 'potager.pdf');
  makePdf(file);
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });

  // Texte du document, curseur à la fin.
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<p id="here">Comme le note l’auteur,</p>';
    ed.dispatchEvent(new Event('input'));
    ed.focus();
    const t = document.getElementById('here').firstChild;
    getSelection().setBaseAndExtent(t, t.length, t, t.length);
  });
  await page.click('#pdf-source-btn');
  await page.waitForTimeout(300);
  assert(await page.isVisible('#pdfpane .pdf-empty'), 'volet vide');
  await page.click('#pdf-open');
  await page.waitForFunction(() => document.querySelectorAll('#pdf-pages .pdf-page .textLayer span').length >= 4, null, { timeout: 15000 });
  const src = await page.evaluate(() => { const s = window.FTCite.findSource(window.FTSourcePdf.state().source); return { ...s, pages: window.FTSourcePdf.state().pages }; });
  assert.strictEqual(src.title, 'Le potager ouvrier');
  assert.deepStrictEqual(src.authors, ['Dupont, Jean']);
  assert.strictEqual(src.year, '2019');
  assert.strictEqual(src.pdf, 'potager.pdf');
  assert.strictEqual(src.pages, 3);
  const copied = await page.evaluate(() => window.frameText.readPdf('potager.pdf').then((b) => !!b));
  assert(copied, 'PDF copié dans le projet');
  ok('PDF ouvert à côté du texte : 3 pages, source « Dupont, 2019 — Le potager ouvrier » créée, fichier copié dans le projet');

  // Article commençant page 145 de sa revue.
  await page.fill('#pdf-first', '145');
  await page.dispatchEvent('#pdf-first', 'change');

  // Sélection d'une phrase de la page 2.
  await page.evaluate(() => {
    const p2 = document.querySelector('.pdf-page[data-page="2"]');
    document.getElementById('pdf-pages').scrollTop = p2.offsetTop - 10;
  });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="2"] .textLayer span').length >= 3);
  await page.waitForTimeout(200);
  const box = await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-page[data-page="2"] .textLayer span')].find((s) => s.textContent.startsWith('La tomate'));
    const r = span.getBoundingClientRect();
    return { x: r.left + 1, y: r.top + r.height / 2, x2: r.right - 1 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert(await page.isVisible('#pdf-selbar'), 'barre de citation');
  assert.strictEqual(await page.textContent('#pdf-sel-page'), 'p. 146');
  await page.screenshot({ path: path.join(SHOTS, 'source-pdf.png') });
  await page.click('#pdf-cite');
  await page.waitForTimeout(400);
  let html = await page.evaluate(() => document.getElementById('here').textContent);
  assert.strictEqual(html, 'Comme le note l’auteur, « La tomate demande un sol riche et beaucoup de soleil. » (Dupont, 2019, p. 146)');
  ok('« Citer » : passage entre guillemets puis (Dupont, 2019, p. 146), au curseur du texte');

  const hl = await page.evaluate(() => {
    const s = window.FTCite.findSource(window.FTSourcePdf.state().source);
    return { saved: (s.highlights || []).length, shown: document.querySelectorAll('.pdf-page[data-page="2"] .pdf-hl').length, page: s.highlights[0].page };
  });
  assert(hl.saved === 1 && hl.shown >= 1 && hl.page === 2, JSON.stringify(hl));
  await page.screenshot({ path: path.join(SHOTS, 'source-pdf-cite.png') });
  ok('passage cité surligné dans le PDF, surlignage gardé avec la source');

  // Référence seule : la citation après le texte, avec une espace.
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    const p = document.createElement('p');
    p.id = 'two';
    p.textContent = 'Voir aussi';
    ed.append(p);
    ed.focus();
    getSelection().setBaseAndExtent(p.firstChild, 10, p.firstChild, 10);
  });
  const b3 = await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-page[data-page="1"] .textLayer span')].find((s) => s.textContent.startsWith('Les jardins'));
    const box = document.getElementById('pdf-pages');
    box.scrollTop = span.closest('.pdf-page').offsetTop - 10;
    const r = span.getBoundingClientRect();
    return { x: r.left + 1, y: r.top + r.height / 2, x2: r.left + 60 };
  });
  await page.waitForTimeout(200);
  await page.mouse.move(b3.x, b3.y);
  await page.mouse.down();
  await page.mouse.move(b3.x2, b3.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.click('#pdf-cite-ref');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => document.getElementById('two').textContent), 'Voir aussi (Dupont, 2019, p. 145)');
  ok('« Référence seule » : (Dupont, 2019, p. 145)');

  // Fermer puis rouvrir le volet : le même PDF revient, avec son surlignage.
  await page.click('#pdf-close');
  await page.click('#pdf-source-btn');
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page .pdf-hl').length >= 1 || document.querySelectorAll('.pdf-page').length === 3, null, { timeout: 15000 });
  await page.evaluate(() => { document.getElementById('pdf-pages').scrollTop = document.querySelector('.pdf-page[data-page="2"]').offsetTop - 10; });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-page[data-page="2"] .pdf-hl').length >= 1, null, { timeout: 15000 });
  assert.strictEqual(await page.inputValue('#pdf-first'), '145');
  ok('volet rouvert : même PDF, surlignage et 1re page gardés');

  // Rattacher le PDF à une autre source du projet.
  const other = await page.evaluate(() => window.FTCite.addSource({ title: 'Jardins de France', authors: ['Martin, Léa'], year: '2021' }).id);
  await page.evaluate(() => { const s = document.getElementById('pdf-link'); s.dispatchEvent(new Event('focus')); });
  await page.evaluate(() => window.FTSourcePdf.state());
  await page.click('#pdf-close');
  await page.click('#pdf-source-btn');
  await page.waitForTimeout(500);
  await page.selectOption('#pdf-link', other);
  const moved = await page.evaluate((id) => { const s = window.FTCite.findSource(id); const old = window.FTCite.sources().find((x) => x.title === 'Le potager ouvrier'); return [s.pdf, (s.highlights || []).length, old.pdf]; }, other);
  assert.deepStrictEqual(moved, ['potager.pdf', 1, undefined]);
  ok('PDF rattaché à une autre source : fichier et surlignages suivent');

  // Zoom : agrandir puis revenir à la largeur du volet.
  const z0 = await page.textContent('#pdf-zoom-label');
  await page.click('#pdf-zoom-in');
  await page.waitForTimeout(300);
  const z1 = await page.textContent('#pdf-zoom-label');
  assert(parseInt(z1, 10) > parseInt(z0, 10), z0 + ' → ' + z1);
  await page.click('#pdf-zoom-fit');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.textContent('#pdf-zoom-label'), z0);
  ok(`zoom : ${z0} → ${z1}, puis « Largeur » : ${z0}`);

  // Retirer un surlignage : clic droit dessus, puis clic simple sur un nouveau surlignage.
  const hlCount = () => page.evaluate((id) => ({
    saved: (window.FTCite.findSource(id).highlights || []).length,
    shown: document.querySelectorAll('.pdf-page .pdf-hl').length
  }), other);
  const hlPoint = async () => {
    await page.evaluate(() => { document.getElementById('pdf-pages').scrollTop = document.querySelector('.pdf-page[data-page="2"]').offsetTop - 10; });
    await page.waitForFunction(() => document.querySelectorAll('.pdf-page .pdf-hl').length >= 1, null, { timeout: 15000 });
    return page.evaluate(() => { const r = document.querySelector('.pdf-page .pdf-hl').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  };
  const removeBy = async (button) => {
    const at = await hlPoint();
    await page.mouse.click(at.x, at.y, { button });
    await page.waitForTimeout(150);
    const item = page.locator('#context-menu button', { hasText: 'Retirer le surlignage' });
    assert.strictEqual(await item.count(), 1, 'menu « Retirer le surlignage »');
    await item.click();
    await page.waitForTimeout(200);
  };
  await removeBy('right');
  assert.deepStrictEqual(await hlCount(), { saved: 0, shown: 0 });
  const b4 = await page.evaluate(() => {
    const span = [...document.querySelectorAll('.pdf-page[data-page="2"] .textLayer span')].find((s) => s.textContent.startsWith('La tomate'));
    const r = span.getBoundingClientRect();
    return { x: r.left + 1, y: r.top + r.height / 2, x2: r.left + 80 };
  });
  await page.mouse.move(b4.x, b4.y);
  await page.mouse.down();
  await page.mouse.move(b4.x2, b4.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.click('#pdf-highlight');
  await page.waitForTimeout(200);
  assert.strictEqual((await hlCount()).saved, 1);
  await removeBy('left');
  assert.deepStrictEqual(await hlCount(), { saved: 0, shown: 0 });
  ok('surlignage retiré par clic droit, puis par clic simple : rien de gardé ni d\'affiché');
};
