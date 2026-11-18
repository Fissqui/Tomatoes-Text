// Relecture dans le nouveau moteur (préversion 2.0 n° 8) : suivi des modifications (mots ajoutés et
// retirés, paragraphes ajoutés et supprimés, Accepter, Refuser en une étape d'annulation) et commentaires
// en marge (passage commenté, bulles, réponses, résolu, supprimé puis rétabli, écrire après un passage
// sans l'allonger). Mesures sur un très long document (300 pages, mode avancé) : début du suivi,
// comparaison après la frappe, frappe avec le suivi et 40 commentaires, place des bulles loin de l'écran.
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-relecture-moteur.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = process.env.FT_SRC || path.join(__dirname, '..', '..', 'src');
function corpus() {
  const dir = path.join(SRC, 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 2) => v((k) => new Promise((r) => {
    const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : setTimeout(r, 0));
    f(k);
  }), n);
  const reset = async (html, mode = 'note', settings = {}) => {
    await page.keyboard.press('Escape');
    await v(([h, m, s]) => {
      window.FTEditor.load({ content: { html: h }, settings: { mode: m, ...s } });
      window.FTTrack.load(s);
      window.FTComments.load(s);
      document.getElementById('page').hidden = false;
      window.__changes = 0;
    }, [html, mode, settings]);
    await frames(3);
  };
  const saved = () => v(() => window.FTSchema.serialize(window.FTMoteur.view.state.doc));
  const text = () => v(() => window.FTMoteur.view.state.doc.textContent);
  const depth = () => v(() => window.FTMoteur.undoDepth());
  const undo = () => v(() => window.FTMoteur.undo());
  const posOf = (t, after = 0) => v(([s, k]) => {
    let p = null;
    window.FTMoteur.view.state.doc.descendants((n, q) => {
      if (p === null && n.isText && n.text.includes(s)) p = q + n.text.indexOf(s) + k;
    });
    return p;
  }, [t, after]);
  const select = (from, to = from) => v(([a, b]) => {
    const w = window.FTMoteur.view;
    w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.create(w.state.doc, a, b)));
    w.focus();
  }, [from, to]);
  const selectText = async (t) => { const a = await posOf(t); await select(a, a + t.length); };
  const pointIn = async (t, k = 1) => {
    const p = await posOf(t, k);
    return v((q) => {
      const c = window.FTMoteur.view.coordsAtPos(q);
      return { x: c.left, y: (c.top + c.bottom) / 2 };
    }, p);
  };
  const menuAt = async (pt) => {
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(150);
    return v(() => [...document.querySelectorAll('#context-menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  };
  const choose = (t) => page.click(`#context-menu button:has-text("${t}")`);
  const marks = (name) => v((n) => (CSS.highlights.get(n) ? [...CSS.highlights.get(n)].map((r) => r.toString()) : []), name);
  const rows = () => v(() => [...document.querySelectorAll('#track-list .tk-item')].map((r) => r.textContent.replace(/✓ Accepter✗ Refuser$/, '')));
  await v(() => { window.FTEditor.onChange(() => { window.__changes++; }); window.FTLayout.setCapitalize(false); window.FTEcriture && window.FTEcriture.setQuotes && window.FTEcriture.setQuotes(false); });

  // 1. Suivi des modifications.
  await reset('<p>Le chat dort sur le canapé du salon.</p><p>Il fait beau ce matin.</p><p>Paragraphe à supprimer bientôt.</p><p>Fin du texte.</p>');
  assert.ok(!(await v(() => document.getElementById('track-btn').classList.contains('pv-off'))), 'bouton grisé');
  await page.click('#track-btn');
  assert.ok(await v(() => !!window.FTTrack.get() && !document.getElementById('track-panel').hidden));
  assert.strictEqual(await v(() => document.getElementById('track-count').textContent), 'Aucune modification');
  await select(await posOf('dort', 4));
  await page.keyboard.type(' profondément');
  const p3 = await posOf('Paragraphe à');
  const p4 = await posOf('Fin du texte');
  // De la fin du paragraphe d’avant à la fin de celui-ci : le paragraphe entier part.
  await select(p3 - 2, p4 - 2);
  await page.keyboard.press('Backspace');
  await select(await posOf('Fin du texte.', 13));
  await page.keyboard.press('Enter');
  await page.keyboard.type('Une ligne ajoutée.');
  await page.waitForTimeout(600);
  let r = await rows();
  assert.strictEqual(r.length, 3, JSON.stringify(r));
  assert.ok(/Modifié.*profondément/.test(r[0]) && /Supprimé.*Paragraphe à supprimer/.test(r[1]) && /Ajouté.*Une ligne ajoutée/.test(r[2]), JSON.stringify(r));
  const ins = await marks('ft-track-ins');
  assert.ok(ins.some((x) => x.trim() === 'profondément') && ins.includes('Une ligne ajoutée.'), JSON.stringify(ins));
  assert.ok(await v(() => document.querySelectorAll('#track-layer .track-del-mark').length) >= 1);
  assert.strictEqual(await v(() => document.getElementById('status-track').textContent), 'Suivi : 3 modifications');
  ok('suivi : mot ajouté souligné, paragraphe supprimé marqué à sa place, paragraphe ajouté ; panneau « ' + r.map((x) => x.slice(0, 7)).join(' / ') + ' »');
  // Refuser le mot ajouté : une étape d'annulation.
  let d0 = await depth();
  await page.click('#track-list .tk-item:nth-child(1) button:has-text("Refuser")');
  await page.waitForTimeout(50);
  assert.ok((await text()).startsWith('Le chat dort sur le canapé'), await text());
  assert.strictEqual(await depth(), d0 + 1);
  r = await rows();
  assert.strictEqual(r.length, 2);
  // Refuser la suppression : le paragraphe revient.
  await page.click('#track-list .tk-item:nth-child(1) button:has-text("Refuser")');
  await page.waitForTimeout(50);
  assert.ok(/<p>Il fait beau ce matin\.<\/p><p>Paragraphe à supprimer bientôt\.<\/p><p>Fin du texte\.<\/p>/.test(await saved()), await saved());
  // Accepter l'ajout : la référence le prend.
  await page.click('#track-list .tk-item:nth-child(1) button:has-text("Accepter")');
  await page.waitForTimeout(50);
  assert.strictEqual(await v(() => document.getElementById('track-count').textContent), 'Aucune modification');
  assert.ok(await v(() => window.FTTrack.get().base.some((b) => b.text === 'Une ligne ajoutée.')));
  ok('« Refuser » (mot retiré, paragraphe rétabli, une étape d’annulation chacun) et « Accepter » (la référence prend le texte)');
  await undo();
  await undo();
  await page.waitForTimeout(600);
  assert.strictEqual((await rows()).length, 2);
  ok('Ctrl+Z après deux refus : les deux modifications reviennent dans le panneau');
  await page.click('#track-stop');
  await page.waitForTimeout(200);
  await page.click('.ft-ask-ok, #ask-ok, dialog[open] button.primary').catch(() => {});
  await page.waitForTimeout(200);
  assert.ok(!(await v(() => window.FTTrack.get())));
  ok('suivi arrêté (modifications en cours acceptées)');

  // 2. Commentaires en marge.
  await reset('<p>Le jardin est très joli au printemps quand les fleurs sortent.</p><p>Deuxième paragraphe du texte.</p>');
  assert.ok(!(await v(() => document.getElementById('comment-btn').classList.contains('pv-off'))));
  await selectText('très joli');
  d0 = await depth();
  await page.click('#comment-btn');
  await page.waitForTimeout(200);
  assert.ok(/<span class="ft-comment" data-c="c[\w]+">très joli<\/span>/.test(await saved()), await saved());
  assert.strictEqual(await depth(), d0 + 1);
  await page.keyboard.type('Préciser la saison.');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(200);
  let threads = await v(() => window.FTComments.get());
  assert.strictEqual(threads.length, 1);
  assert.strictEqual(threads[0].text, 'Préciser la saison.');
  const bubble = await v(() => {
    const c = document.querySelector('#cm-layer .cm-card');
    const span = document.querySelector('#editor span.ft-comment');
    return { card: c.getBoundingClientRect().top, span: span.getBoundingClientRect().top, mark: CSS.highlights.get('ft-comment-active').size + CSS.highlights.get('ft-comment').size };
  });
  assert.ok(Math.abs(bubble.card - bubble.span) < 20 && bubble.mark === 1, JSON.stringify(bubble));
  ok('passage sélectionné → commentaire : passage marqué dans le texte (une étape d’annulation), bulle publiée à sa hauteur');
  // Écrire juste après le passage ne l'allonge pas.
  await select(await posOf('très joli', 9));
  await page.keyboard.type(' et');
  assert.ok(/<span class="ft-comment" data-c="c\w+">très joli<\/span> et au printemps/.test(await saved()), await saved());
  ok('texte tapé juste après le passage : hors du passage commenté');
  // Réponse, résolu, rouvert.
  await page.click('#cm-layer .cm-bar button:has-text("Répondre")');
  await page.waitForTimeout(100);
  await page.keyboard.type('D’accord.');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(100);
  threads = await v(() => window.FTComments.get());
  assert.strictEqual(threads[0].replies[0].text, 'D’accord.');
  await page.click('#cm-layer .cm-bar button:has-text("Résoudre")');
  assert.strictEqual(await v(() => document.querySelectorAll('#cm-layer .cm-card').length), 0);
  const items = await menuAt(await pointIn('joli', 2));
  assert.ok(items.includes('Rouvrir le commentaire'), JSON.stringify(items));
  await choose('Rouvrir le commentaire');
  assert.strictEqual(await v(() => document.querySelectorAll('#cm-layer .cm-card').length), 1);
  ok('réponse, « Résoudre » (bulle masquée), clic droit « Rouvrir le commentaire »');
  // Clic droit sur un mot : nouveau commentaire sur ce mot.
  const it2 = await menuAt(await pointIn('Deuxième', 3));
  assert.ok(it2.includes('Nouveau commentaire'), JSON.stringify(it2));
  await choose('Nouveau commentaire');
  await page.waitForTimeout(100);
  await page.keyboard.type('Mot à revoir.');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(100);
  assert.ok(/<span class="ft-comment" data-c="c\w+">Deuxième<\/span>/.test(await saved()));
  assert.strictEqual((await v(() => window.FTComments.get())).length, 2);
  ok('clic droit sur un mot → « Nouveau commentaire » : le mot est commenté');
  // Supprimer, puis Ctrl+Z : passage et bulle reviennent.
  await v(() => window.FTComments.remove(window.FTComments.get()[0].id));
  await page.waitForTimeout(200);
  assert.strictEqual((await v(() => window.FTComments.get())).length, 1);
  assert.ok(!/très joli<\/span>/.test(await saved()));
  await undo();
  await page.waitForTimeout(300);
  threads = await v(() => window.FTComments.get());
  assert.strictEqual(threads.length, 2);
  assert.ok(threads.some((t) => t.text === 'Préciser la saison.' && t.replies.length === 1));
  assert.ok(/très joli<\/span>/.test(await saved()));
  ok('commentaire supprimé, puis rétabli avec sa bulle par Ctrl+Z');

  // 3. Très long document (300 pages, mode avancé) : suivi et 40 commentaires.
  await v(() => {
    window.__lat = [];
    let t0 = 0;
    document.addEventListener('keydown', () => { t0 = performance.now(); }, true);
    const done = () => {
      if (!t0) return;
      const t = t0;
      t0 = 0;
      requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t), 0));
    };
    window.addEventListener('keypress', done);
    document.addEventListener('keyup', done, true);
  });
  const median = (a) => { const x = [...a].sort((p, q) => p - q); return Math.round(x[Math.floor(x.length / 2)] || 0); };
  const box = await v((h) => {
    const b = new DOMParser().parseFromString('<body>' + h + '</body>', 'text/html').body;
    const ps = [...b.querySelectorAll(':scope > p')].filter((p) => p.firstChild && p.firstChild.nodeType === 3 && p.firstChild.data.length > 30);
    const comments = [];
    for (let i = 0; i < 40; i++) {
      const p = ps[Math.floor((i * ps.length) / 40)];
      const t = p.firstChild;
      const span = document.createElement('span');
      span.className = 'ft-comment';
      span.dataset.c = 'c' + i;
      const rest = t.splitText(10);
      span.textContent = t.data;
      t.replaceWith(span);
      span.after(rest);
      comments.push({ id: 'c' + i, author: 'Essai', date: '2026-10-27T10:00:00Z', text: 'Remarque ' + i, done: false, replies: [] });
    }
    return { html: b.innerHTML, comments };
  }, corpus().repeat(21));
  await reset(box.html, 'avance', { comments: box.comments });
  // Le corpus répété porte 21 fois les mêmes numéros de note : ils sont remis d'accord avant le suivi
  // (sinon une remise à jour pendant l'essai compterait chaque numéro comme une modification).
  await v(() => window.FTNotes.sync());
  await page.waitForTimeout(3000);
  const far = await v(() => {
    const cards = [...document.querySelectorAll('#cm-layer .cm-card')];
    const tops = cards.map((c) => parseFloat(c.style.top));
    const last = document.querySelector('#editor span.ft-comment[data-c="c39"]');
    return { cards: cards.length, ordered: tops.every((t, i) => !i || t > tops[i - 1]), lastTop: tops[tops.length - 1], lastFar: !!last.closest('[data-pm-far]'), pages: document.querySelectorAll('.pg-sheet').length };
  });
  assert.ok(far.cards === 40 && far.ordered && far.lastTop > 100000 && far.lastFar, JSON.stringify(far));
  ok(`${far.pages} pages, 40 commentaires : 40 bulles dans l’ordre du texte, la dernière à ${Math.round(far.lastTop / 1000)} 000 px (son passage, loin de l’écran, n’est pas affiché)`);
  // Suivi : début, comparaison après la frappe.
  const tStart = await v(() => { const s = performance.now(); window.FTTrack.toggle(); return Math.round(performance.now() - s); });
  const typeMid = async (n) => {
    await v(() => {
      const w = window.FTMoteur.view;
      const doc = w.state.doc;
      let pos = 0;
      for (let i = 0; i < Math.floor(doc.childCount / 2); i++) pos += doc.child(i).nodeSize;
      w.dispatch(w.state.tr.setSelection(PM.state.TextSelection.near(doc.resolve(pos + 1))).scrollIntoView());
      w.focus();
    });
    await page.waitForTimeout(800);
    await v(() => { window.__lat = []; });
    for (let i = 0; i < n; i++) { await page.keyboard.type(i % 6 === 5 ? ' ' : 'a'); await page.waitForTimeout(40); }
    await page.waitForTimeout(200);
    return v(() => window.__lat.slice());
  };
  const lat = await typeMid(30);
  await page.waitForTimeout(600);
  const tCompare = await v(() => {
    const s = performance.now();
    window.FTTrack.refresh();
    return Math.round(performance.now() - s);
  });
  r = await rows();
  assert.strictEqual(r.length, 1, JSON.stringify(r.slice(0, 3)));
  ok(`suivi sur 300 pages : début ${tStart} ms ; frappe ${median(lat)} ms par touche (médiane, max ${Math.round(Math.max(...lat))}) avec suivi et commentaires ; comparaison du texte après une pause ${tCompare} ms`);
  assert.ok(median(lat) < 80, 'frappe ' + median(lat));
};
