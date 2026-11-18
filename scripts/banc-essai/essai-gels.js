// Essai 2.3.16 : gels de la fenêtre. Un long document avec des photos (273 pages, 8 photos d'environ
// 2 Mo) : l'enregistrement automatique ne fige plus la fenêtre (images envoyées une seule fois, en
// binaire ; avant : 1,5 à 2 s à chaque enregistrement), le fichier est identique au texte. Les gels
// sont relevés pour « Signaler un défaut ».
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function corpus() {
  const dir = path.join(process.env.FT_SRC || path.join(__dirname, '..', '..', 'src'), 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  await v(() => window.FTLayout.setCapitalize(false));
  const photo = () => v(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1200;
    const g = c.getContext('2d');
    const d = g.createImageData(1600, 1200);
    for (let i = 0; i < d.data.length; i++) d.data[i] = (Math.random() * 255) | 0;
    g.putImageData(d, 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  });
  const photos = [];
  for (let k = 0; k < 8; k++) photos.push(await photo());
  const parts = corpus().repeat(21).split('</p>');
  for (let k = 1; k <= 8; k++) parts[Math.floor((parts.length * k) / 9)] += `</p><span class="ft-image" contenteditable="false" style="width: 50%;"><img src="${photos[k - 1]}">`;
  await v((h) => {
    window.FTEditor.load({ content: { html: h }, settings: { mode: 'avance' } });
    document.getElementById('page').hidden = false;
  }, parts.join('</p>'));
  await page.waitForTimeout(3000);
  await v(() => window.FTMoteur.view.focus());

  // Plus longue interruption de la fenêtre pendant une frappe et l'enregistrement qui suit.
  // (Processus principal : il reçoit aussi le clavier de la fenêtre ; le banc le fait tourner ici même.)
  const round = async () => {
    let mainWorst = 0;
    let mainLast = performance.now();
    const mainIv = setInterval(() => { const n = performance.now(); mainWorst = Math.max(mainWorst, n - mainLast); mainLast = n; }, 10);
    await v(() => {
      window.__worst = 0;
      let last = performance.now();
      window.__iv = setInterval(() => { const n = performance.now(); window.__worst = Math.max(window.__worst, n - last); last = n; }, 10);
    });
    await page.keyboard.type('x');
    await page.waitForTimeout(4000);
    clearInterval(mainIv);
    return v((m) => { clearInterval(window.__iv); return { worst: Math.round(window.__worst), main: m, status: document.getElementById('status-save').textContent.trim() }; }, Math.round(mainWorst));
  };
  const r = [await round(), await round(), await round()];
  for (const x of r) assert(!/Échec/.test(x.status), x.status);
  assert(r.every((x) => x.worst < 500), JSON.stringify(r));
  // 2.4.7 : le texte du document est fait en arrière-plan (avant : 130 à 180 ms ici, bien plus sur un PC moins rapide).
  assert(r.every((x) => x.main < 100), JSON.stringify(r));
  const fileName = await v(() => window.FTApp.docs().find((d) => d.id === window.FTApp.currentId()).fileName);
  const back = await v(async (f) => {
    const d = await window.frameText.readDoc(f);
    return { same: d.content.html === window.FTEditor.getHtml(), photos: (d.content.html.match(/data:image\/jpeg;base64,/g) || []).length, refs: /ftimg-/.test(d.content.html), keys: 'images' in d || 'imageSession' in d };
  }, fileName);
  assert.deepStrictEqual(back, { same: true, photos: 8, refs: false, keys: false });
  ok(`enregistrement automatique (273 pages, 8 photos) : fenêtre interrompue ${r.map((x) => x.worst).join(', ')} ms au plus (avant : 1,5 à 2 s), processus principal ${r.map((x) => x.main).join(', ')} ms ; fichier identique au texte`);

  // Gel relevé pour le signalement.
  await v(() => new Promise((res) => requestAnimationFrame(() => { const t = performance.now(); while (performance.now() - t < 700); res(); })));
  await page.waitForTimeout(300);
  const g = await v(() => window.FTSignaler._gels());
  assert(g.length >= 1 && g[g.length - 1].ms >= 600, JSON.stringify(g));
  ok('gel de 0,7 s relevé (durée, heure, dernière action) pour « Signaler un défaut »');
};
