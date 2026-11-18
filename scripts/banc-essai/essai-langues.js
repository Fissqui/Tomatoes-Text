// Essai des langues du document : reconnaissance de la langue, orthographe et synonymes de chaque
// langue, fenêtre « Langues du document », soulignements par passage, langue fixée à la main.
const assert = require('assert');
const JSZip = require('jszip');

module.exports = async ({ page, electron }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const { handlers } = electron._test;
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  const ALL = ['fr', 'en', 'de', 'es', 'it', 'pt', 'zh'];

  // 1. Reconnaissance, parmi les sept langues.
  const samples = {
    fr: 'Nous sommes allés au marché ce matin pour acheter des légumes frais.',
    en: 'We went to the market this morning to buy some fresh vegetables.',
    de: 'Wir sind heute Morgen auf den Markt gegangen, um frisches Gemüse zu kaufen.',
    es: 'Esta mañana fuimos al mercado para comprar verduras frescas.',
    it: 'Stamattina siamo andati al mercato per comprare delle verdure fresche.',
    pt: 'Esta manhã fomos ao mercado para comprar legumes frescos.',
    zh: '今天早上我们去市场买了一些新鲜的蔬菜。'
  };
  const res = await call('lang:detect', Object.values(samples), ALL);
  Object.keys(samples).forEach((code, i) => assert.strictEqual(res[i].lang, code, code + ' ' + JSON.stringify(res[i])));
  assert.ok(res.every((r) => r.sure), JSON.stringify(res));
  ok('langue reconnue pour une phrase dans chacune des 7 langues : ' + res.map((r) => r.lang).join(', '));
  const short = await call('lang:detect', ['Introduction', 'Merci', 'OK'], ['fr', 'en']);
  assert.ok(short.every((r) => !r.sure), JSON.stringify(short));
  ok('titres et mots isolés : langue incertaine (ils prendront celle du paragraphe précédent)');
  const one = await call('lang:detect', [samples.en], ['fr']);
  assert.strictEqual(one[0].lang, 'fr');
  ok('document en une seule langue : aucune reconnaissance, tout est dans cette langue');

  // 2. Orthographe de chaque langue.
  const spell = {
    en: [['house', 'colour', 'color', 'don’t', 'recieve'], [true, true, true, true, false]],
    de: [['Haus', 'Straße', 'Donaudampfschiff', 'Strase'], [true, true, true, false]],
    es: [['niño', 'corrió', 'cassa'], [true, true, false]],
    it: [['perché', 'l’uomo', 'dell’anno', 'perche'], [true, true, true, false]],
    pt: [['ação', 'facto', 'fato', 'receção', 'recepção', 'acão'], [true, true, true, true, true, false]],
    zh: [['蔬菜', '市场'], [true, true]],
    fr: [['l’homme', 'maison', 'maisson'], [true, true, false]]
  };
  for (const [lang, [words, want]] of Object.entries(spell)) assert.deepStrictEqual(await call('spell:check', words, lang), want, lang);
  ok('orthographe juste et fautes trouvées dans chaque langue (anglais US et GB, portugais du Portugal et du Brésil, élisions italiennes)');
  const sug = await call('spell:suggest', 'recieve', 'en');
  assert.ok(sug.includes('receive'), JSON.stringify(sug));
  ok('propositions de correction dans la langue du mot : recieve → ' + sug.slice(0, 3).join(', '));

  // 3. Synonymes du thésaurus de chaque langue (sans le modèle d'IA).
  const syn = {};
  for (const [lang, word] of [['en', 'happy'], ['de', 'schnell'], ['es', 'rápidas'], ['it', 'belle'], ['pt', 'bonitas'], ['fr', 'heureuse']]) {
    syn[lang] = await call('thesaurus:synonyms', word, null, lang);
    assert.ok(syn[lang].length >= 3, lang + ' ' + JSON.stringify(syn[lang]));
  }
  ok('synonymes du thésaurus de chaque langue, accordés : ' + Object.entries(syn).map(([l, s]) => `${l} ${s.slice(0, 2).join('/')}`).join(' ; '));

  // 4. Fenêtre « Langues du document ».
  await page.evaluate(() => window.__ftEmit('menu', ['languages']));
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.getElementById('lang-dialog').open));
  await page.check('#lg-list input[value="en"]');
  await page.check('#lg-list input[value="de"]');
  await page.check('#lg-list input[value="zh"]');
  const mains = await page.$$eval('#lg-main option', (o) => o.map((x) => x.value));
  assert.deepStrictEqual(mains, ['fr', 'en', 'de', 'zh']);
  await page.click('#lg-ok');
  const state = await page.evaluate(() => ({ langs: window.FTLang.list(), status: document.getElementById('status-lang').textContent }));
  assert.deepStrictEqual(state.langs, ['fr', 'en', 'de', 'zh']);
  ok('fenêtre : langues cochées ' + state.langs.join(', ') + ', langue principale ' + state.langs[0] + ', barre d’état « ' + state.status + ' »');

  // 5. Texte en plusieurs langues : chaque passage est vérifié dans sa langue.
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Carnet de voyage</h1>' +
      '<p>Nous sommes partis tôt ce matin vers la montagne avec nos amis. Il faisait très beau et le cheminn était agréable. The weather in the mountains was absolutely wonderful today.</p>' +
      '<h2>Notes</h2>' +
      '<p>I will recieve the tickets tomorrow and we should leave early in the morning.</p>' +
      '<p>Wir haben heute einen langen Spaziergang am Fluss gemacht und viele Vögel gesehen. Das Wetter war schoen.</p>' +
      '<p>今天我们去市场买了一些新鲜的蔬菜和水果。</p>';
    ed.dispatchEvent(new Event('input'));
  });
  let marks = [];
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    marks = await page.evaluate(() => [...CSS.highlights.get('ft-spell')].map((r) => r.toString()).sort());
    if (marks.length >= 3) break;
  }
  assert.deepStrictEqual(marks, ['cheminn', 'recieve', 'schoen'], JSON.stringify(marks));
  ok('soulignés : ' + marks.join(', ') + ' (la phrase anglaise du paragraphe français, l’allemand et le chinois ne le sont pas)');

  const langs = await page.evaluate(() => {
    const ps = [...document.querySelectorAll('#editor p, #editor h2')];
    const at = (el, word) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) { const i = n.data.indexOf(word); if (i >= 0) return window.FTSpell.langAt(n, i); }
      return null;
    };
    return [at(ps[0], 'montagne'), at(ps[0], 'weather'), at(ps[1], 'Notes'), at(ps[2], 'tickets'), at(ps[3], 'Spaziergang'), at(ps[4], '蔬菜')];
  });
  assert.deepStrictEqual(langs, ['fr', 'en', 'fr', 'en', 'de', 'zh']);
  ok('langue de chaque passage : ' + langs.join(', ') + ' (le titre court « Notes » prend celle du paragraphe précédent)');

  // Barre d'état : langue du passage où est le curseur.
  const shown = await page.evaluate(() => {
    const p = document.querySelectorAll('#editor p')[2];
    const r = document.createRange();
    r.setStart(p.firstChild, 5);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    return new Promise((ok) => setTimeout(() => ok(document.getElementById('status-lang').textContent), 100));
  });
  assert.strictEqual(shown, 'Allemand');
  ok('barre d’état : « ' + shown + ' » quand le curseur est dans le paragraphe allemand');

  // Lisibilité : indice de la langue la plus employée, mots rares dans les passages français seulement.
  const read = await page.evaluate(async () => { const r = await window.FTReadability.analyze(); return { name: r.scoreName, score: r.score, rare: r.rare.map((x) => x.word) }; });
  assert.ok(/Kandel/.test(read.name) && read.score !== null, JSON.stringify(read));
  ok('lisibilité : ' + read.name + ', ' + Math.round(read.score));

  // Export Word : langue principale du document et langue de chaque passage étranger.
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const xml = await zip.file('word/document.xml').async('string');
  const styles = await zip.file('word/styles.xml').async('string');
  assert.ok(/<w:lang w:val="fr-FR" w:eastAsia="zh-CN"\/>/.test(styles), styles.slice(0, 2000));
  assert.ok(/w:lang w:val="en-GB"/.test(xml) && /w:lang w:val="de-DE"/.test(xml), 'langues des passages');
  ok('export Word : langue du document fr-FR (chinois zh-CN), passages anglais en en-GB et allemands en de-DE');

  // 6. Langue fixée à la main pour un paragraphe (clic droit « Langue du paragraphe »).
  const fixed = await page.evaluate(async () => {
    const p = document.querySelectorAll('#editor p')[1];
    const r = document.createRange();
    r.setStart(p.firstChild, 3);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    const items = window.FTLang.menuItems();
    const sub = await items[0].submenu();
    sub.find((i) => i.text === 'Allemand').action();
    return { label: items[0].text, attr: document.querySelectorAll('#editor p')[1].getAttribute('lang'), choices: sub.filter((i) => i.text).map((i) => i.text) };
  });
  assert.strictEqual(fixed.attr, 'de-DE');
  ok(`« ${fixed.label} » : ${fixed.choices.join(', ')} ; paragraphe anglais passé en allemand (lang="${fixed.attr}")`);
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    marks = await page.evaluate(() => [...CSS.highlights.get('ft-spell')].map((r) => r.toString()));
    if (marks.length > 4) break;
  }
  assert.ok(marks.includes('tickets') || marks.includes('morning'), JSON.stringify(marks));
  ok('ce paragraphe est maintenant vérifié en allemand (mots anglais soulignés)');

  // 7. Enregistré avec le document.
  await page.evaluate(() => window.__ftEmit('menu', ['save']));
  await page.waitForTimeout(800);
  const lib = await call('library:load');
  const saved = await call('doc:read', lib.docs[0].fileName);
  assert.deepStrictEqual(saved.settings.languages, ['fr', 'en', 'de', 'zh']);
  assert.ok(/lang="de-DE"/.test(saved.content.html));
  ok('langues enregistrées avec le document : ' + saved.settings.languages.join(', '));
};
