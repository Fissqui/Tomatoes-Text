// Essai des commentaires en marge : nouveau commentaire (Ctrl+Maj+M) sur un passage de deux paragraphes,
// bulle en face du passage, texte tapé après le passage (non commenté), réponse, résoudre / rouvrir,
// commentaire abandonné (Échap), clic droit sur un mot, bulles sans chevauchement, enregistrement,
// export Word (commentaires, réponse, résolu), suppression et Annuler, mode lecture.
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const SHOTS = process.env.FT_SHOTS || require('os').tmpdir();

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const menu = (re) => page.evaluate((s) => {
    const b = [...document.querySelectorAll('#context-menu button')].find((x) => new RegExp(s).test(x.textContent));
    if (!b) throw new Error('menu sans « ' + s + ' » : ' + [...document.querySelectorAll('#context-menu button')].map((x) => x.textContent).join(' | '));
    b.click();
  }, re);
  await page.evaluate(() => {
    const fill = (t) => `<p>${t} ` + 'La lumière du soir baigne les collines et les toits de la ville. '.repeat(6) + '</p>';
    const ed = document.getElementById('editor');
    ed.innerHTML = '<h1 class="ft-title">Carnet</h1>' + fill('Début.') +
      '<p id="a">Le premier jet reste fragile.</p><p id="b">Il faudra revoir la fin du chapitre.</p>' + fill('Milieu.') +
      '<p id="c">Une phrase à discuter ici, et une autre là.</p>' + fill('Fin.');
    ed.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(400);
  const author = await page.evaluate(() => window.FTComments.author());

  // 1. Passage sur deux paragraphes, Ctrl+Maj+M, texte, Ctrl+Entrée.
  await page.evaluate(() => {
    const a = document.getElementById('a').firstChild;
    const b = document.getElementById('b').firstChild;
    const r = document.createRange();
    r.setStart(a, a.data.indexOf('reste'));
    r.setEnd(b, b.data.indexOf(' la fin'));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.getElementById('editor').focus();
  });
  await page.keyboard.press('Control+Shift+M');
  await page.waitForTimeout(250);
  let st = await page.evaluate(() => ({
    spans: [...document.querySelectorAll('#editor span.ft-comment')].map((s) => s.textContent),
    focus: document.activeElement.className,
    wide: document.getElementById('workspace').classList.contains('with-comments')
  }));
  assert.deepStrictEqual(st.spans, ['reste fragile.', 'Il faudra revoir']);
  assert(st.focus === 'cm-input' && st.wide, JSON.stringify(st));
  await page.keyboard.type('Trop vague : préciser.');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(250);
  st = await page.evaluate(() => {
    const card = document.querySelector('#cm-layer .cm-card');
    const span = document.querySelector('#editor span.ft-comment');
    const page = document.getElementById('page').getBoundingClientRect();
    return {
      text: card.querySelector('.cm-text').textContent, who: card.querySelector('.cm-who').textContent,
      dy: Math.abs(card.getBoundingClientRect().top - span.getBoundingClientRect().top),
      right: card.getBoundingClientRect().left > page.right,
      marks: CSS.highlights.get('ft-comment').size + CSS.highlights.get('ft-comment-active').size
    };
  });
  assert(st.text === 'Trop vague : préciser.' && st.who === author && st.dy < 14 && st.right && st.marks === 2, JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOTS, 'commentaire-bulle.png') });
  ok(`Ctrl+Maj+M sur deux paragraphes : 2 passages surlignés, bulle de « ${author} » à droite de la page, en face du passage`);

  // 2. Écrire juste après le passage ne l'allonge pas.
  await page.evaluate(() => {
    const s = document.querySelectorAll('#editor span.ft-comment')[1].firstChild;
    const r = document.createRange(); r.setStart(s, s.data.length); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.getElementById('editor').focus();
  });
  await page.keyboard.type(' vraiment');
  st = await page.evaluate(() => ({ span: document.querySelectorAll('#editor span.ft-comment')[1].textContent, p: document.getElementById('b').textContent, codes: [...document.getElementById('b').textContent].map((c) => c.charCodeAt(0)).filter((c) => c < 48 || c === 160).join() }));
  assert(st.span === 'Il faudra revoir' && st.p === 'Il faudra revoir vraiment la fin du chapitre.', JSON.stringify(st));
  ok('texte tapé juste après le passage : hors du commentaire');

  // 3. Réponse, résoudre, commentaires résolus, rouvrir.
  const cardBtn = (text) => page.evaluate((t) => [...document.querySelectorAll('#cm-layer .cm-card button')].find((b) => b.textContent === t).click(), text);
  await cardBtn('Répondre');
  await page.waitForTimeout(150);
  await page.keyboard.type('D’accord, je reprends.');
  await page.click('#cm-layer .cm-ok');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => [...document.querySelectorAll('#cm-layer .cm-reply .cm-text')].map((e) => e.textContent));
  assert.deepStrictEqual(st, ['D’accord, je reprends.']);
  await cardBtn('Résoudre');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => ({ cards: document.querySelectorAll('#cm-layer .cm-card').length, wide: document.getElementById('workspace').classList.contains('with-comments'), marks: CSS.highlights.get('ft-comment').size }));
  assert(st.cards === 0 && !st.wide && st.marks === 0, JSON.stringify(st));
  await page.click('#comment-btn');
  await page.waitForTimeout(100);
  await menu('Commentaires résolus \\(1\\)');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => [...document.querySelectorAll('#cm-layer .cm-card')].map((c) => c.className));
  assert.deepStrictEqual(st, ['cm-card done']);
  await cardBtn('Rouvrir');
  await page.click('#comment-btn');
  await menu('Commentaires résolus');
  await page.waitForTimeout(150);
  st = await page.evaluate(() => document.querySelectorAll('#cm-layer .cm-card:not(.done)').length);
  assert.strictEqual(st, 1);
  ok('réponse publiée ; Résoudre masque la bulle ; « Commentaires résolus (1) » la remontre ; Rouvrir');

  // 4. Clic droit sur un mot > « Nouveau commentaire », puis Échap : rien ne reste.
  const wordPos = (word) => page.evaluate((w) => {
    const walk = document.createTreeWalker(document.getElementById('c'), NodeFilter.SHOW_TEXT);
    let t = walk.nextNode();
    while (t && !t.data.includes(w)) t = walk.nextNode();
    const k = t.data.indexOf(w);
    const r = document.createRange(); r.setStart(t, k + 1); r.setEnd(t, k + 2);
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, word);
  let pos = await wordPos('discuter');
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await page.waitForTimeout(150);
  await menu('^Nouveau commentaire$');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ spans: [...document.querySelectorAll('#c span.ft-comment')].map((s) => s.textContent), cards: document.querySelectorAll('#cm-layer .cm-card').length }));
  assert(st.spans.join() === 'discuter' && st.cards === 2, JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ spans: document.querySelectorAll('#c span.ft-comment').length, html: document.getElementById('c').innerHTML, cards: document.querySelectorAll('#cm-layer .cm-card').length }));
  assert(st.spans === 0 && st.cards === 1 && st.html === 'Une phrase à discuter ici, et une autre là.', JSON.stringify(st));
  ok('clic droit sur « discuter » > « Nouveau commentaire » ; Échap sans texte : passage et bulle retirés');

  // 5. Deux commentaires sur la même ligne : bulles l'une sous l'autre.
  for (const w of ['discuter', 'autre']) {
    pos = await wordPos(w);
    await page.mouse.click(pos.x, pos.y, { button: 'right' });
    await page.waitForTimeout(150);
    await menu('^Nouveau commentaire$');
    await page.waitForTimeout(150);
    await page.keyboard.type('Remarque sur « ' + w + ' ».');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(150);
  }
  st = await page.evaluate(() => [...document.querySelectorAll('#cm-layer .cm-card')].map((c) => { const r = c.getBoundingClientRect(); return [r.top, r.bottom]; }));
  assert(st.length === 3 && st[1][0] >= st[0][1] && st[2][0] >= st[1][1] + 4, JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOTS, 'commentaires-pile.png') });
  ok('trois bulles, dont deux pour la même ligne : sans chevauchement');

  // 6. Enregistré dans le document.
  st = await page.evaluate(async () => (await window.FTApp.versionDoc()).settings.comments);
  assert(st.length === 3 && st[0].text === 'Trop vague : préciser.' && st[0].replies.length === 1 && !st[0].done && st[1].text === 'Remarque sur « discuter ».', JSON.stringify(st));
  const html = await page.evaluate(() => window.FTEditor.getHtml());
  assert((html.match(/class="ft-comment"/g) || []).length === 4, html);
  ok('enregistré : 3 fils dans settings.comments, 4 passages dans le texte');

  // 7. Export Word : commentaires, réponse rattachée, résolu.
  await page.evaluate(() => window.FTComments.resolve(document.querySelectorAll('#c span.ft-comment')[1].dataset.c));
  await page.waitForTimeout(150);
  const bytes = await page.evaluate(async () => Array.from(await window.FTWord.exportWord()));
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const doc = await zip.file('word/document.xml').async('string');
  const com = await zip.file('word/comments.xml').async('string');
  const ext = zip.file('word/commentsExtended.xml') ? await zip.file('word/commentsExtended.xml').async('string') : '';
  const texts = [...com.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  assert.deepStrictEqual(texts, ['Trop vague : préciser.', 'D’accord, je reprends.', 'Remarque sur « discuter ».', 'Remarque sur « autre ».']);
  assert((doc.match(/<w:commentRangeStart/g) || []).length === 4 && (doc.match(/<w:commentReference/g) || []).length === 4, 'repères');
  const plain = doc.replace(/<w:commentRangeStart w:id="0"\/>/, '[').replace(/<w:commentRangeEnd w:id="0"\/>/, ']').replace(/<[^>]+>/g, '');
  assert(/Le premier jet \[reste fragile\.Il faudra revoir\] vraiment/.test(plain), plain.slice(0, 400));
  assert((ext.match(/w15:done="1"/g) || []).length === 1 && /w15:paraIdParent/.test(ext), ext.slice(0, 600));
  assert(new RegExp(`w:author="${author}"`).test(com), 'auteur');
  ok('Word : 4 commentaires (dont 1 réponse rattachée), passage exact, 1 résolu, auteur');

  // 8. Supprimer (menu ⋯) puis Annuler.
  await page.evaluate(() => document.querySelector('#cm-layer .cm-card').click());
  await page.evaluate(() => [...document.querySelectorAll('#cm-layer .cm-card')[0].querySelectorAll('button')].find((b) => b.textContent === '⋯').click());
  await page.waitForTimeout(100);
  await menu('^Supprimer le commentaire$');
  await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ spans: document.querySelectorAll('#a span.ft-comment, #b span.ft-comment').length, cards: document.querySelectorAll('#cm-layer .cm-card').length, a: document.getElementById('a').innerHTML }));
  assert(st.spans === 0 && st.cards === 1 && st.a === 'Le premier jet reste fragile.', JSON.stringify(st));
  await page.evaluate(() => document.getElementById('editor').focus());
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  st = await page.evaluate(() => ({ spans: document.querySelectorAll('#a span.ft-comment, #b span.ft-comment').length, cards: document.querySelectorAll('#cm-layer .cm-card').length }));
  assert(st.spans === 2 && st.cards === 2, JSON.stringify(st));
  ok('« Supprimer le commentaire » : passage remis en texte normal ; Annuler rétablit le passage et sa bulle');

  // 9. Mode lecture : pas de bulles ni de surlignage.
  await page.click('#reading-btn');
  await page.waitForTimeout(700);
  st = await page.evaluate(() => ({ layer: getComputedStyle(document.getElementById('cm-layer')).display, cards: document.querySelectorAll('#cm-layer .cm-card').length, marks: CSS.highlights.get('ft-comment').size }));
  assert(st.layer === 'none' && st.cards === 0 && st.marks === 0, JSON.stringify(st));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  st = await page.evaluate(() => document.querySelectorAll('#cm-layer .cm-card').length);
  assert.strictEqual(st, 2);
  ok('mode lecture : bulles et surlignage masqués, de retour en sortant');
};
