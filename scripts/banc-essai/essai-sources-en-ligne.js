// Remplissage automatique d'une source (2.3.5) : reconnaissance de l'identifiant (DOI, ISBN, arXiv, PMID,
// HAL, ARK de la BnF et de Gallica, liens), notices des bases publiques (imitées ici : Crossref par doi.org,
// catalogue de la BnF en UNIMARC, Open Library, HAL en BibTeX, page web avec ses métadonnées), recherche par
// titre pour les ouvrages anciens (liste de notices au choix), liste collée de DOI, absence de connexion.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-sources-en-ligne.js
const path = require('path');
const assert = require('assert');
const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
const L = require(path.join(SRC, 'sources-en-ligne.js'));

const CSL_DOI = {
  source: 'Crossref', type: 'journal-article', title: 'The General Theory of Employment', DOI: '10.2307/1882087',
  author: [{ family: 'Keynes', given: 'J. M.', affiliation: [] }], 'container-title': 'The Quarterly Journal of Economics',
  volume: '51', issue: '2', page: '209-223', issued: { 'date-parts': [[1937, 2]] }, URL: 'http://dx.doi.org/10.2307/1882087', reference: [{}], 'is-referenced-by-count': 1899
};
const UNIMARC = `<srw:searchRetrieveResponse><srw:records><srw:record><srw:recordData><mxc:record>
<mxc:controlfield tag="003">http://catalogue.bnf.fr/ark:/12148/cb30330596d</mxc:controlfield>
<mxc:datafield tag="010" ind1=" " ind2=" "><mxc:subfield code="a">2-7073-0275-9</mxc:subfield></mxc:datafield>
<mxc:datafield tag="200" ind1="1" ind2=" "><mxc:subfield code="a">La distinction</mxc:subfield><mxc:subfield code="e">critique sociale du jugement</mxc:subfield><mxc:subfield code="f">Pierre Bourdieu</mxc:subfield></mxc:datafield>
<mxc:datafield tag="210" ind1=" " ind2=" "><mxc:subfield code="a">Paris</mxc:subfield><mxc:subfield code="c">Éd. de Minuit</mxc:subfield><mxc:subfield code="d">1979</mxc:subfield></mxc:datafield>
<mxc:datafield tag="700" ind1=" " ind2="|"><mxc:subfield code="a">Bourdieu</mxc:subfield><mxc:subfield code="b">Pierre</mxc:subfield><mxc:subfield code="f">1930-2002</mxc:subfield><mxc:subfield code="4">0070</mxc:subfield></mxc:datafield>
</mxc:record></srw:recordData></srw:record>
<srw:record><srw:recordData><mxc:record>
<mxc:datafield tag="200" ind1="1" ind2=" "><mxc:subfield code="a">Discours de la méthode pour bien conduire sa raison, et chercher la vérité dans les sciences</mxc:subfield></mxc:datafield>
<mxc:datafield tag="210" ind1=" " ind2=" "><mxc:subfield code="a">Leyde</mxc:subfield><mxc:subfield code="c">de l'impr. de I. Maire</mxc:subfield><mxc:subfield code="d">1637</mxc:subfield></mxc:datafield>
<mxc:datafield tag="700" ind1=" " ind2="|"><mxc:subfield code="a">Descartes</mxc:subfield><mxc:subfield code="b">René</mxc:subfield><mxc:subfield code="f">1596-1650</mxc:subfield><mxc:subfield code="4">0070</mxc:subfield></mxc:datafield>
</mxc:record></srw:recordData></srw:record></srw:records></srw:searchRetrieveResponse>`;
const HAL = `@article{x:hal-01022338,
  TITLE = {{Positive interactions lead to lasting positive memories in horses}},
  AUTHOR = {Sankey, Carol and Henry, S{\\'e}verine},
  JOURNAL = {{Animal Behaviour}}, VOLUME = {79}, NUMBER = {4}, PAGES = {869-875}, YEAR = {2010},
  DOI = {10.1016/j.anbehav.2009.12.037}, HAL_ID = {hal-01022338},
}`;
const PAGE = `<html><head><title>Les inégalités | Revue X</title>
<meta name="citation_title" content="Les in&eacute;galit&eacute;s de revenus">
<meta name="citation_author" content="Dupont, Marie"><meta name="citation_author" content="Jean de La Fontaine">
<meta name="citation_journal_title" content="Revue d&#39;économie"><meta name="citation_volume" content="12">
<meta name="citation_firstpage" content="45"><meta name="citation_lastpage" content="67">
<meta name="citation_publication_date" content="1962/05/01"></head><body></body></html>`;
const WEB = `<html><head><title>Note de conjoncture | Insee</title><meta property="og:site_name" content="Insee">
<script type="application/ld+json">{"@type":"WebPage","author":{"@type":"Organization","name":"Insee"},"datePublished":"2024-03-05"}</script></head></html>`;

let offline = false;
const seen = [];
function fakeFetch(url, opts) {
  seen.push(url);
  if (offline) return Promise.reject(new TypeError('fetch failed'));
  const res = (body, status = 200, type = 'application/json') => Promise.resolve({
    ok: status < 400, status, url, headers: { get: (h) => (/content-type/i.test(h) ? type : null) },
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  });
  if (url === 'https://doi.org/10.2307/1882087') { assert.match(opts.headers.Accept, /citationstyles/); return res(CSL_DOI); }
  if (url === 'https://doi.org/10.1000/abc') return res({ source: 'Crossref', type: 'book', title: 'Livre B', author: [{ family: 'Martin', given: 'Paul' }], issued: { 'date-parts': [[1999]] } });
  if (url.startsWith('https://doi.org/')) return res('', 404);
  if (url.startsWith('https://catalogue.bnf.fr/api/SRU')) {
    const q = decodeURIComponent(url.split('query=')[1]);
    if (/2707302759/.test(q) || /discours/i.test(q)) return res(/discours/i.test(q) ? UNIMARC.replace(/<srw:record>[\s\S]*?<\/srw:record>/, '') : UNIMARC, 200, 'text/xml');
    return res('<srw:searchRetrieveResponse></srw:searchRetrieveResponse>', 200, 'text/xml');
  }
  if (url.startsWith('https://api.archives-ouvertes.fr/')) return res(HAL, 200, 'text/plain');
  if (url.startsWith('https://api.crossref.org/works')) return res({ message: { items: [{ DOI: '10.1/old', title: ['Discours de la méthode'], author: [{ family: 'Gilson', given: 'Étienne' }], issued: { 'date-parts': [[1925]] }, type: 'book', publisher: 'Vrin' }] } });
  if (url.startsWith('https://openlibrary.org/search.json')) return res({ docs: [{ key: '/works/OL1W', title: 'Discours de la méthode pour bien conduire sa raison, et chercher la vérité dans les sciences', author_name: ['René Descartes'], first_publish_year: 1637, publisher: ['Flammarion'] }] });
  if (url.startsWith('https://openlibrary.org/api/books')) return res({});
  if (url.startsWith('https://www.googleapis.com/')) return res({});
  if (url === 'https://revue.example/article') return res(PAGE, 200, 'text/html');
  if (url === 'https://www.insee.fr/note') return res(WEB, 200, 'text/html');
  if (url === 'https://bloque.example/') return res('', 403, 'text/html');
  return res('', 404);
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  L._setFetch(fakeFetch);

  // 1. Reconnaissance de l'identifiant.
  const d = (s) => { const r = L.detect(s); return r && [r.kind, r.value]; };
  assert.deepStrictEqual(d('10.2307/1882087'), ['doi', '10.2307/1882087']);
  assert.deepStrictEqual(d('doi: 10.1257/aer.20161923.'), ['doi', '10.1257/aer.20161923']);
  assert.deepStrictEqual(d('https://doi.org/10.1016/0167-2231(93)90009-L'), ['doi', '10.1016/0167-2231(93)90009-L']);
  assert.deepStrictEqual(d('https://www.jstor.org/stable/1882087'), ['doi', '10.2307/1882087']);
  assert.deepStrictEqual(d('978-2-7073-0275-5'), ['isbn', '9782707302755']);
  assert.deepStrictEqual(d('ISBN 2-07-036002-4'), ['isbn', '2070360024']);
  assert.deepStrictEqual(d('ISBN 2-07-036002-5'), ['bad', 'ISBN 2-07-036002-5']);
  assert.deepStrictEqual(d('arXiv:1706.03762v7'), ['arxiv', '1706.03762']);
  assert.deepStrictEqual(d('https://arxiv.org/abs/1706.03762v2'), ['arxiv', '1706.03762']);
  assert.deepStrictEqual(d('PMID: 30000000'), ['pmid', '30000000']);
  assert.deepStrictEqual(d('PMC1234567'), ['pmcid', 'PMC1234567']);
  assert.deepStrictEqual(d('halshs-00123456'), ['hal', 'halshs-00123456']);
  assert.deepStrictEqual(d('https://shs.hal.science/halshs-00123456v2/document'), ['hal', 'halshs-00123456v2']);
  assert.deepStrictEqual(d('https://gallica.bnf.fr/ark:/12148/bpt6k5545357d.texteImage'), ['gallica', 'bpt6k5545357d']);
  assert.deepStrictEqual(d('ark:/12148/cb30330596d'), ['bnf', 'cb30330596d']);
  assert.deepStrictEqual(d('https://archive.org/details/originofspecies00darwuoft'), ['archive', 'originofspecies00darwuoft']);
  assert.deepStrictEqual(d('https://www.persee.fr/doc/ahess_0395-2649_1958_num_13_4_2781'), ['url', 'https://www.persee.fr/doc/ahess_0395-2649_1958_num_13_4_2781']);
  assert.deepStrictEqual(d('Descartes, Discours de la méthode'), ['search', 'Descartes, Discours de la méthode']);
  ok('reconnaissance : DOI (seul, doi:, lien, JSTOR), ISBN 10/13 avec clé vérifiée, arXiv, PMID, PMCID, HAL, Gallica, ARK BnF, archive.org, lien, titre');

  // 2. Lecture des notices.
  const isbn = await L.lookup('978-2-7073-0275-5');
  assert.strictEqual(isbn.items[0].base, 'BnF');
  assert.deepStrictEqual([isbn.items[0].title, isbn.items[0].author, isbn.items[0].publisher, isbn.items[0]['publisher-place'], isbn.items[0].URL],
    ['La distinction : critique sociale du jugement', [{ family: 'Bourdieu', given: 'Pierre' }], 'Éd. de Minuit', 'Paris', 'https://catalogue.bnf.fr/ark:/12148/cb30330596d']);
  assert(seen.some((u) => /2707302759/.test(decodeURIComponent(u))), 'ISBN à 10 chiffres demandé à la BnF');
  const page1 = await L.lookup('https://revue.example/article');
  assert.deepStrictEqual(page1.items[0], { type: 'article-journal', title: 'Les inégalités de revenus', author: [{ family: 'Dupont', given: 'Marie' }, { family: 'de La Fontaine', given: 'Jean' }], 'container-title': "Revue d'économie", volume: '12', page: '45-67', issued: { 'date-parts': [[1962, 5, 1]] }, URL: 'https://revue.example/article', base: 'page web' });
  const web = await L.lookup('https://www.insee.fr/note');
  assert.deepStrictEqual([web.items[0].title, web.items[0].author, web.items[0]['container-title'], !!web.items[0].accessed], ['Note de conjoncture', [{ literal: 'Insee' }], 'Insee', true]);
  assert.deepStrictEqual(await L.lookup('https://bloque.example/'), { ok: false, kind: 'url', blocked: true });
  assert.deepStrictEqual(await L.lookup('10.9999/rien'), { ok: false, kind: 'doi', notFound: true });
  ok('notices : ISBN français par la BnF (UNIMARC, ISBN à 10 chiffres), article par ses métadonnées citation_*, page web (JSON-LD, nom du site retiré du titre), site bloqué, DOI inconnu');

  // 3. Dans la fenêtre des sources.
  const v = (fn, arg) => page.evaluate(fn, arg);
  await v(() => { window.FTEditor.load({ content: { html: '<p>Texte.</p>' }, settings: { mode: 'note' } }); });
  await page.click('#cite-btn');
  await page.fill('#src-lookup', 'https://doi.org/10.2307/1882087');
  await page.press('#src-lookup', 'Enter');
  await page.waitForFunction(() => /ajoutée/.test(document.getElementById('src-msg').textContent));
  assert.strictEqual(await page.textContent('#src-msg'), 'Source ajoutée (Crossref). Vérifiez les champs avant de citer.');
  const s1 = await v(() => { const s = window.FTCite.sources()[0]; return { ...s, id: undefined }; });
  assert.deepStrictEqual(s1, { type: 'article', authors: ['Keynes, J. M.'], title: 'The General Theory of Employment', year: '1937', container: 'The Quarterly Journal of Economics', volume: '51', issue: '2', pages: '209-223', doi: '10.2307/1882087', id: undefined });
  assert.strictEqual(await page.inputValue('#src-title'), 'The General Theory of Employment');
  assert.strictEqual(await page.inputValue('#src-lookup'), '');
  await page.fill('#src-lookup', '10.2307/1882087');
  await page.click('#src-lookup-go');
  await page.waitForFunction(() => /déjà/.test(document.getElementById('src-msg').textContent));
  ok('fenêtre : DOI collé puis Entrée → source créée et remplie (champs, aperçu), le même DOI une deuxième fois n’est pas doublé');

  // Ouvrage ancien sans identifiant : recherche par titre, liste de notices, choix.
  await page.fill('#src-lookup', 'Descartes discours de la méthode');
  await page.click('#src-lookup-go');
  await page.waitForSelector('#src-found-box:not([hidden])');
  if (process.env.FT_CAPTURE) await page.locator('#sources-dialog').screenshot({ path: process.env.FT_CAPTURE });
  const rows = await page.$$eval('#src-found .src-item', (r) => r.map((x) => x.querySelector('b').textContent + ' | ' + x.querySelector('i').textContent));
  assert.deepStrictEqual(rows, ['Gilson, 1925 | Vrin · Crossref', 'Descartes, 1637 | de l\'impr. de I. Maire · Leyde · BnF']);
  await page.click('#src-found .src-item >> nth=1');
  assert(await page.isHidden('#src-found-box'));
  const s2 = await v(() => window.FTCite.sources().find((s) => s.year === '1637'));
  assert.deepStrictEqual([s2.authors, s2.title, s2.place], [['Descartes, René'], 'Discours de la méthode pour bien conduire sa raison, et chercher la vérité dans les sciences', 'Leyde']);
  ok('ouvrage ancien : recherche par titre et auteur (Crossref, BnF, Open Library, doublons fusionnés), notice choisie dans la liste (édition de 1637)');

  // Liste collée de DOI et d'identifiants.
  await page.click('#src-import');
  await page.click('#src-import-paste');
  await page.fill('#src-paste', '10.1000/abc\nhal-01022338\n10.9999/rien');
  await page.click('#src-paste-ok');
  await page.waitForFunction(() => /introuvable/.test(document.getElementById('src-msg').textContent));
  assert.strictEqual(await page.textContent('#src-msg'), '2 sources importées, 1 introuvable.');
  const hal = await v(() => window.FTCite.sources().find((s) => /horses/.test(s.title)));
  assert.deepStrictEqual([hal.authors, hal.container, hal.doi], [['Sankey, Carol', 'Henry, Séverine'], 'Animal Behaviour', '10.1016/j.anbehav.2009.12.037']);
  ok('« Coller des références » : une liste de DOI et d’identifiants HAL est cherchée ligne par ligne, les introuvables comptés');

  // Sans connexion, et identifiant faux.
  offline = true;
  await page.fill('#src-lookup', '10.5555/hors-ligne');
  await page.click('#src-lookup-go');
  await page.waitForFunction(() => /connexion/.test(document.getElementById('src-msg').textContent));
  assert.strictEqual(await page.textContent('#src-msg'), 'Pas de connexion à Internet : remplissage automatique impossible.');
  assert(await page.evaluate(() => document.getElementById('src-msg').classList.contains('bad')));
  offline = false;
  await page.fill('#src-lookup', 'ISBN 2-07-036002-5');
  await page.click('#src-lookup-go');
  await page.waitForFunction(() => /non reconnu/.test(document.getElementById('src-msg').textContent));
  assert.strictEqual(await v(() => window.FTCite.sources().length), 4);
  await page.click('#src-close');
  ok('sans connexion : message clair, rien de créé ; ISBN à la clé fausse refusé');
};
