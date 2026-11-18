// Bibliographie complète (2.2.2) : lecture de BibTeX (accents LaTeX, @string, particules, organismes), RIS et
// CSL JSON ; « Importer… » depuis un fichier, du texte collé et Zotero ouvert (API locale imitée ici) ;
// doublons écartés ; normes APA, Chicago (auteur-date et notes), ISO 690, MLA : références, citations dans le
// texte, lettres 2020a/2020b, titre et ordre de la bibliographie ; norme gardée dans le document.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-bibliographie.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const assert = require('assert');

const BIB = String.raw`@string{seuil = "Éditions du Seuil"}
@book{bourdieu1979,
  author = {Bourdieu, Pierre},
  title = {La {D}istinction : critique sociale du jugement},
  publisher = seuil # "",
  address = {Paris},
  year = 1979,
  isbn = {978-2-7073-0275-5}
}
@article{piketty2003,
  author = {Thomas Piketty and Emmanuel Saez},
  title = {Income Inequality in the {United States}, 1913--1998},
  journal = {The Quarterly Journal of Economics},
  volume = {118}, number = {1}, pages = {1--41}, year = {2003},
  doi = {10.1162/00335530360535135}
}
@incollection{lafontaine,
  author = {Jean de La Fontaine},
  editor = {Collinet, Jean-Pierre},
  title = {Le Corbeau et le Renard},
  booktitle = {Fables},
  publisher = {Gallimard}, address = {Paris}, year = {1991}, pages = {32--33}
}
@techreport{banque,
  author = {{Banque de France}},
  title = {Projections macro{\'e}conomiques},
  institution = {Banque de France}, number = {12}, year = {2024}
}
@comment{ignoré}`;

const RIS = `TY  - JOUR
AU  - Keynes, John Maynard
TI  - The General Theory of Employment
T2  - The Quarterly Journal of Economics
PY  - 1937
VL  - 51
IS  - 2
SP  - 209
EP  - 223
DO  - 10.2307/1882087
ER  -
TY  - ELEC
AU  - Insee
TI  - Note de conjoncture
T2  - insee.fr
PY  - 2024
UR  - https://www.insee.fr/fr/statistiques
Y2  - 2024-03-05
ER  - `;

const CSL = JSON.stringify([
  { type: 'thesis', title: 'Les marchés du travail', author: [{ family: 'Martin', given: 'Claire' }], issued: { 'date-parts': [[2018]] }, publisher: 'Université Paris 1', 'publisher-place': 'Paris' },
  { type: 'book', title: 'Le Capital au XXIᵉ siècle', author: [{ family: 'Piketty', given: 'Thomas' }], issued: { 'date-parts': [[2013]] }, publisher: 'Seuil', 'publisher-place': 'Paris' },
  { type: 'book', title: 'Capital et idéologie', author: [{ family: 'Piketty', given: 'Thomas' }], issued: { 'date-parts': [[2013]] }, publisher: 'Seuil', 'publisher-place': 'Paris' }
]);

// Zotero imité : collections et éléments (format natif de son API locale), avec pages de 100.
function fakeZotero() {
  const items = [
    { key: 'AAAA1111', data: { itemType: 'journalArticle', title: 'Monetary Policy Rules', creators: [{ creatorType: 'author', firstName: 'John B.', lastName: 'Taylor' }], date: '1993-12', publicationTitle: 'Carnegie-Rochester Conference Series on Public Policy', volume: '39', pages: '195-214', DOI: '10.1016/0167-2231(93)90009-L' } },
    { key: 'AAAA2222', data: { itemType: 'attachment', title: 'PDF' } },
    { key: 'AAAA3333', data: { itemType: 'bookSection', title: 'La crise', creators: [{ creatorType: 'author', firstName: 'Michel', lastName: 'Aglietta' }, { creatorType: 'editor', firstName: 'Robert', lastName: 'Boyer' }], date: '2002', bookTitle: 'Théorie de la régulation', publisher: 'La Découverte', place: 'Paris', pages: '10-20' } }
  ];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/users/0/collections') {
      res.setHeader('Total-Results', '2');
      return res.end(JSON.stringify([{ key: 'COLL0001', data: { name: 'Économie', parentCollection: false } }, { key: 'COLL0002', data: { name: 'Monnaie', parentCollection: 'COLL0001' } }]));
    }
    if (url.pathname === '/api/users/0/collections/COLL0002/items/top') { res.setHeader('Total-Results', '1'); return res.end(JSON.stringify([items[0]])); }
    if (url.pathname === '/api/users/0/items/top') { res.setHeader('Total-Results', '3'); return res.end(JSON.stringify(items)); }
    res.statusCode = 404;
    res.end('[]');
  });
  return new Promise((resolve) => server.listen(23119, '127.0.0.1', () => resolve(server)));
}

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);

  // 1. Lecture des formats.
  const parsed = await v(([bib, ris, csl]) => [window.FTBiblio.parse(bib), window.FTBiblio.parse(ris), window.FTBiblio.parse(csl)], [BIB, RIS, CSL]);
  const [bib, ris, csl] = parsed;
  assert.strictEqual(bib.format, 'BibTeX');
  assert.strictEqual(bib.list.length, 4);
  assert.deepStrictEqual(bib.list[0], { type: 'livre', authors: ['Bourdieu, Pierre'], title: 'La Distinction : critique sociale du jugement', year: '1979', publisher: 'Éditions du Seuil', place: 'Paris', isbn: '978-2-7073-0275-5' });
  assert.deepStrictEqual(bib.list[1].authors, ['Piketty, Thomas', 'Saez, Emmanuel']);
  assert.strictEqual(bib.list[1].title, 'Income Inequality in the United States, 1913–1998');
  assert.strictEqual(bib.list[1].pages, '1-41');
  assert.strictEqual(bib.list[1].container, 'The Quarterly Journal of Economics');
  assert.deepStrictEqual([bib.list[2].type, bib.list[2].authors, bib.list[2].editors, bib.list[2].container], ['chapitre', ['de La Fontaine, Jean'], ['Collinet, Jean-Pierre'], 'Fables']);
  assert.deepStrictEqual([bib.list[3].type, bib.list[3].authors, bib.list[3].title, bib.list[3].issue], ['rapport', ['Banque de France'], 'Projections macroéconomiques', '12']);
  assert.strictEqual(ris.format, 'RIS');
  assert.deepStrictEqual(ris.list[0], { type: 'article', authors: ['Keynes, John Maynard'], title: 'The General Theory of Employment', year: '1937', container: 'The Quarterly Journal of Economics', volume: '51', issue: '2', pages: '209-223', doi: '10.2307/1882087' });
  assert.deepStrictEqual([ris.list[1].type, ris.list[1].url, ris.list[1].accessed], ['web', 'https://www.insee.fr/fr/statistiques', '2024-03-05']);
  assert.strictEqual(csl.format, 'CSL JSON');
  assert.deepStrictEqual([csl.list[0].type, csl.list[0].authors, csl.list[0].publisher], ['these', ['Martin, Claire'], 'Université Paris 1']);
  ok('lecture : BibTeX (accents LaTeX, @string, « and », particules, organisme entre accolades), RIS (pages, DOI, consultation) et CSL JSON');

  // 2. Import dans « Sourcer » : fichiers, texte collé, doublons écartés.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-biblio-'));
  fs.writeFileSync(path.join(dir, 'refs.bib'), '﻿' + BIB);
  fs.writeFileSync(path.join(dir, 'refs.ris'), RIS);
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(dir, 'refs.bib'), path.join(dir, 'refs.ris')] });
  await v(() => { window.FTEditor.load({ content: { html: '<p>Texte.</p>' }, settings: { mode: 'note' } }); });
  await page.click('#cite-btn');
  await page.click('#src-import');
  await page.click('#src-import-file');
  await page.waitForFunction(() => !document.getElementById('src-msg').hidden && /import/.test(document.getElementById('src-msg').textContent));
  assert.strictEqual(await page.textContent('#src-msg'), '6 sources importées (BibTeX, RIS).');
  assert.strictEqual(await page.locator('#src-list .src-item').count(), 6);
  await page.click('#src-import');
  await page.click('#src-import-file');
  await page.waitForFunction(() => /déjà/.test(document.getElementById('src-msg').textContent));
  assert.strictEqual(await page.textContent('#src-msg'), 'Aucune nouvelle source, 6 déjà présentes (BibTeX, RIS).');
  await page.click('#src-import');
  await page.click('#src-import-paste');
  await page.fill('#src-paste', CSL);
  await page.click('#src-paste-ok');
  assert.strictEqual(await page.textContent('#src-msg'), '3 sources importées (CSL JSON).');
  assert(await page.isHidden('#src-paste-box'));
  await page.click('#src-import');
  await page.click('#src-import-paste');
  await page.fill('#src-paste', 'du texte quelconque');
  await page.click('#src-paste-ok');
  assert.match(await page.textContent('#src-msg'), /Format non reconnu/);
  await page.click('#src-paste-cancel');
  ok('« Importer… » : deux fichiers d’un coup (6 sources), le même import ne double rien, texte collé, format inconnu signalé');

  // 3. Zotero : éteint (message d'aide), puis ouvert : collections en arbre, une collection, toute la bibliothèque.
  await page.click('#src-import');
  await page.click('#src-import-zotero');
  await page.waitForFunction(() => /Zotero ne répond pas/.test(document.getElementById('src-msg').textContent));
  const server = await fakeZotero();
  try {
    await page.click('#src-import');
    await page.click('#src-import-zotero');
    await page.waitForSelector('#src-zotero-box:not([hidden])');
    assert.deepStrictEqual(await page.$$eval('#src-zotero-coll option', (o) => o.map((x) => x.textContent)), ['Toute la bibliothèque', 'Économie', '  Monnaie']);
    await page.selectOption('#src-zotero-coll', 'COLL0002');
    await page.click('#src-zotero-ok');
    await page.waitForFunction(() => /Zotero\)/.test(document.getElementById('src-msg').textContent));
    assert.strictEqual(await page.textContent('#src-msg'), '1 source importée (Zotero).');
    await page.click('#src-import');
    await page.click('#src-import-zotero');
    await page.waitForSelector('#src-zotero-box:not([hidden])');
    await page.click('#src-zotero-ok');
    await page.waitForFunction(() => /déjà/.test(document.getElementById('src-msg').textContent));
    assert.strictEqual(await page.textContent('#src-msg'), '1 source importée, 1 déjà présente (Zotero).');
  } finally {
    server.close();
  }
  const all = await v(() => window.FTCite.sources().map((s) => s.title));
  assert.strictEqual(all.length, 11);
  assert(!all.includes('PDF'), 'pièce jointe écartée');
  ok('Zotero : message d’aide s’il ne répond pas, collections en arbre, une collection puis toute la bibliothèque, pièces jointes écartées');

  // 4. Normes : références.
  const refs = await v(() => {
    const S = window.FTCite.sources();
    const by = (t) => S.find((s) => s.title.startsWith(t));
    const B = window.FTBiblio;
    const out = {};
    for (const norm of ['apa', 'chicago', 'iso690', 'mla']) {
      out[norm] = {};
      for (const [k, t] of [['livre', 'La Distinction'], ['article', 'Income'], ['chapitre', 'Le Corbeau'], ['web', 'Note de'], ['these', 'Les marchés'], ['rapport', 'Projections']]) out[norm][k] = B.reference(by(t), norm, 'fr');
    }
    out.apaEn = B.reference(by('Income'), 'apa', 'en');
    out.mlaEn = B.reference(by('Income'), 'mla', 'en');
    out.chicagoEn = B.reference(by('Le Corbeau'), 'chicago', 'en');
    out.note = B.note(by('La Distinction'), 'chicago', 'fr', '12');
    out.noteEn = B.note(by('Income'), 'chicago', 'en', '5');
    return out;
  });
  assert.strictEqual(refs.apa.livre, 'Bourdieu, P. (1979). <i>La Distinction : critique sociale du jugement</i>. Éditions du Seuil.');
  assert.strictEqual(refs.apa.article, 'Piketty, T., et Saez, E. (2003). Income Inequality in the United States, 1913–1998. <i>The Quarterly Journal of Economics</i>, <i>118</i>(1), 1–41. https://doi.org/10.1162/00335530360535135');
  assert.strictEqual(refs.apaEn, 'Piketty, T., &amp; Saez, E. (2003). Income Inequality in the United States, 1913–1998. <i>The Quarterly Journal of Economics</i>, <i>118</i>(1), 1–41. https://doi.org/10.1162/00335530360535135');
  assert.strictEqual(refs.apa.chapitre, 'de La Fontaine, J. (1991). Le Corbeau et le Renard. Dans J.-P. Collinet (dir.), <i>Fables</i> (p. 32–33). Gallimard.');
  assert.strictEqual(refs.apa.these, 'Martin, C. (2018). <i>Les marchés du travail</i> [Thèse de doctorat, Université Paris 1].');
  assert.strictEqual(refs.apa.rapport, 'Banque de France. (2024). <i>Projections macroéconomiques</i> (Rapport n° 12).');
  assert.strictEqual(refs.apa.web, 'Insee. (2024). <i>Note de conjoncture</i>. insee.fr. https://www.insee.fr/fr/statistiques');
  assert.strictEqual(refs.chicago.livre, 'Bourdieu, Pierre. 1979. <i>La Distinction : critique sociale du jugement</i>. Paris : Éditions du Seuil.');
  assert.strictEqual(refs.chicago.article, 'Piketty, Thomas et Emmanuel Saez. 2003. « Income Inequality in the United States, 1913–1998 ». <i>The Quarterly Journal of Economics</i> 118 (1): 1–41. https://doi.org/10.1162/00335530360535135');
  assert.strictEqual(refs.chicagoEn, 'de La Fontaine, Jean. 1991. “Le Corbeau et le Renard.” In <i>Fables</i>, edited by Jean-Pierre Collinet, 32–33. Paris: Gallimard.');
  assert.strictEqual(refs.chicago.web, 'Insee. 2024. « Note de conjoncture ». insee.fr. Consulté le 5 mars 2024. https://www.insee.fr/fr/statistiques');
  assert.strictEqual(refs.iso690.livre, 'BOURDIEU, Pierre. <i>La Distinction : critique sociale du jugement</i>. Paris : Éditions du Seuil, 1979. ISBN 978-2-7073-0275-5.');
  assert.strictEqual(refs.iso690.article, 'PIKETTY, Thomas et SAEZ, Emmanuel. Income Inequality in the United States, 1913–1998. <i>The Quarterly Journal of Economics</i>. 2003, vol. 118, n° 1, p. 1-41. DOI 10.1162/00335530360535135.');
  assert.strictEqual(refs.iso690.web, 'Insee. <i>Note de conjoncture</i> [en ligne]. insee.fr, 2024. [Consulté le 5 mars 2024]. Disponible à l’adresse : https://www.insee.fr/fr/statistiques');
  assert.strictEqual(refs.iso690.chapitre, 'DE LA FONTAINE, Jean. Le Corbeau et le Renard. In : COLLINET, Jean-Pierre (dir.). <i>Fables</i>. Paris : Gallimard, 1991, p. 32-33.');
  assert.strictEqual(refs.mla.livre, 'Bourdieu, Pierre. <i>La Distinction : critique sociale du jugement</i>. Éditions du Seuil, 1979.');
  assert.strictEqual(refs.mlaEn, 'Piketty, Thomas, and Emmanuel Saez. “Income Inequality in the United States, 1913–1998.” <i>The Quarterly Journal of Economics</i>, vol. 118, no. 1, 2003, pp. 1–41, https://doi.org/10.1162/00335530360535135.');
  assert.strictEqual(refs.mla.web, 'Insee. « Note de conjoncture ». <i>insee.fr</i>, 2024, https://www.insee.fr/fr/statistiques. Consulté le 5 mars 2024.');
  assert.strictEqual(refs.note, 'Pierre Bourdieu, <i>La Distinction : critique sociale du jugement</i> (Paris : Éditions du Seuil, 1979), 12.');
  assert.strictEqual(refs.noteEn, 'Thomas Piketty and Emmanuel Saez, “Income Inequality in the United States, 1913–1998,” <i>The Quarterly Journal of Economics</i> 118, no. 1 (2003): 5.');
  ok('références APA, Chicago, ISO 690 et MLA pour livre, article, chapitre, page web, thèse et rapport (termes français et anglais) ; note Chicago complète');

  // 5. Dans le document : citations, lettres a/b, bibliographie triée et titrée selon la norme.
  const ids = await v(() => {
    const S = window.FTCite.sources();
    const id = (t) => S.find((s) => s.title.startsWith(t)).id;
    return [id('La Distinction'), id('Income'), id('Le Capital'), id('Capital et'), id('Projections')];
  });
  await page.click('#src-close');
  const cite = (id, page) => `<span class="ft-cite" data-src="${id}"${page ? ` data-page="${page}"` : ''} contenteditable="false">(…)</span>`;
  await v((html) => {
    window.FTEditor.load({ content: { html }, settings: { mode: 'note', citeNorm: 'apa' } });
    window.FTCite.load({ citeNorm: 'apa' });
  }, `<p>Un${cite(ids[0], '12')} deux${cite(ids[1], '3-5')} trois${cite(ids[2])} quatre${cite(ids[3])} cinq${cite(ids[4])}.</p><div class="ft-biblio" contenteditable="false"></div><p><br></p>`);
  await page.waitForTimeout(400);
  const look = () => v(() => ({
    cites: [...document.querySelectorAll('#editor span.ft-cite')].map((c) => c.textContent),
    title: (document.querySelector('#editor .ft-bib-title') || {}).textContent,
    items: [...document.querySelectorAll('#editor p.ft-bib')].map((li) => li.textContent.slice(0, 26))
  }));
  let got = await look();
  assert.deepStrictEqual(got.cites, ['(Bourdieu, 1979, p. 12)', '(Piketty et Saez, 2003, p. 3–5)', '(Piketty, 2013b)', '(Piketty, 2013a)', '(Banque de France, 2024)']);
  assert.strictEqual(got.title, 'Références');
  assert.deepStrictEqual(got.items, ['Banque de France. (2024). ', 'Bourdieu, P. (1979). La Di', 'Piketty, T. (2013a). Capit', 'Piketty, T. (2013b). Le Ca', 'Piketty, T., et Saez, E. (']);
  const setNorm = (n) => v((x) => { const s = document.getElementById('src-norm'); s.value = x; s.dispatchEvent(new Event('change')); }, n);
  await page.click('#cite-btn');
  await setNorm('chicago');
  got = await look();
  assert.deepStrictEqual(got.cites, ['(Bourdieu 1979, 12)', '(Piketty et Saez 2003, 3–5)', '(Piketty 2013b)', '(Piketty 2013a)', '(Banque de France 2024)']);
  assert.strictEqual(got.title, 'Bibliographie');
  await setNorm('mla');
  got = await look();
  assert.deepStrictEqual(got.cites, ['(Bourdieu 12)', '(Piketty et Saez 3–5)', '(Piketty)', '(Piketty)', '(Banque de France)']);
  assert.strictEqual(got.title, 'Ouvrages cités');
  await setNorm('iso690');
  got = await look();
  assert.deepStrictEqual(got.cites, ['(BOURDIEU, 1979, p. 12)', '(PIKETTY et SAEZ, 2003, p. 3-5)', '(PIKETTY, 2013b)', '(PIKETTY, 2013a)', '(Banque de France, 2024)']);
  // Notes en Chicago : la note complète ; style numérique : [n].
  await setNorm('chicago');
  await v(() => { const s = document.getElementById('src-style'); s.value = 'note'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(100);
  assert.strictEqual(await v(() => document.querySelector('#editor .ft-endnotes li').textContent), 'Pierre Bourdieu, La Distinction : critique sociale du jugement (Paris : Éditions du Seuil, 1979), 12.');
  await v(() => { const s = document.getElementById('src-style'); s.value = 'numerique'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(100);
  got = await look();
  assert.deepStrictEqual(got.cites.slice(0, 2), ['[1, p. 12]', '[2, p. 3-5]']);
  assert.strictEqual(got.items[0], 'Bourdieu, Pierre. 1979. La');
  // La norme et l'appel sont gardés dans le document.
  assert.deepStrictEqual(await v(() => [window.FTCite.getNorm(), window.FTCite.getStyle()]), ['chicago', 'numerique']);
  await setNorm('classique');
  assert.strictEqual(await v(() => window.FTCite.getNorm()), undefined);
  await page.click('#src-close');
  ok('dans le document : citations selon la norme (APA, Chicago, MLA, ISO 690), 2013a/2013b, bibliographie triée et titrée (« Références », « Ouvrages cités »), notes Chicago, numéros ; norme gardée');
};
