// Mesures sur un très gros document (exigence : rapide et fluide sur plusieurs centaines de pages).
// Le texte des documents du mode présentation (sans page de titre, plan ni index) est répété jusqu'à
// environ FT_PAGES pages (300 par défaut). Mesures : ouverture, frappe (de la touche à l'image
// suivante à l'écran), Entrée, Ctrl+Z, en mode note puis en mode avancé (pages).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-gros-document.js
const fs = require('fs');
const path = require('path');

const PAGES = Number(process.env.FT_PAGES || 300);
// Pages d'une copie du corpus en mode avancé (A4, marges normales), mesuré avec la version 1.7 (la
// préversion 2.0 ouvre le document avant de passer en mode avancé).
const PER_COPY = 14;

function corpus() {
  const dir = path.join(process.env.FT_SRC || path.join(__dirname, '..', '..', 'src'), 'presentation');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tmtx')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).content.html)
    .join('')
    .replace(/<div class="ft-(cover|toc|lof|index)"[\s\S]*?<\/div><\/div>(?=<)/g, '');
}

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { med: Math.round(s[Math.floor(s.length / 2)]), p90: Math.round(s[Math.floor(s.length * 0.9)]), max: Math.round(s[s.length - 1]) };
};
const fmt = (o) => `médiane ${o.med} ms, 90 % sous ${o.p90} ms, pire ${o.max} ms`;

module.exports = async ({ page }) => {
  const say = (m) => console.log('  ' + m);
  // Installe la mesure : temps entre une touche et l'image suivante affichée.
  await page.evaluate(() => {
    window.__lat = [];
    let t0 = 0;
    document.addEventListener('keydown', () => { t0 = performance.now(); }, true);
    const done = () => {
      if (!t0) return;
      const t = t0;
      t0 = 0;
      requestAnimationFrame(() => setTimeout(() => window.__lat.push(performance.now() - t), 0));
    };
    // Après la touche : la lettre est écrite pendant « keypress » (préversion 2.0) ou juste après (1.7).
    window.addEventListener('keypress', done);
    document.addEventListener('input', done, true);
    document.addEventListener('keyup', done, true);
  });
  const html = corpus();
  // Un bloc = le corpus une fois ; on en met assez pour atteindre PAGES en mode avancé.
  const open = async (copies) => page.evaluate(([h, n]) => {
    const t = performance.now();
    window.FTEditor.load({ content: { html: h.repeat(n) }, settings: { mode: 'note' } });
    document.getElementById('page').hidden = false;
    document.body.offsetHeight;
    return performance.now() - t;
  }, [html, copies]);
  const preview = await page.evaluate(() => !!window.FTMoteur);
  let perCopy = PER_COPY;
  if (!preview) {
    await open(1);
    await page.click('#mode-switch button[data-mode="avance"]');
    await page.waitForTimeout(1500);
    perCopy = await page.evaluate(() => document.querySelectorAll('.pg-sheet').length);
    await page.click('#mode-switch button[data-mode="note"]');
    await page.waitForTimeout(300);
  }
  const copies = Math.max(1, Math.round(PAGES / perCopy));
  const tOpen = await open(copies);
  const size = await page.evaluate(() => ({ chars: document.getElementById('editor').textContent.length, blocks: document.getElementById('editor').childElementCount }));
  say(`Document : ${copies} × le corpus (${perCopy} pages chacun), ${size.blocks} blocs, ${Math.round(size.chars / 1000)} 000 caractères`);
  say(`Ouverture (mode note) : ${Math.round(tOpen)} ms`);

  // Frappe au milieu du document.
  async function typing(label) {
    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      const ps = [...ed.querySelectorAll(':scope > p')].filter((p) => p.textContent.length > 80);
      const p = ps[Math.floor(ps.length / 2)];
      p.scrollIntoView({ block: 'center' });
      ed.focus();
      const r = document.createRange();
      r.setStart(p.firstChild.nodeType === 3 ? p.firstChild : p, 0);
      r.collapse(true);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      window.__lat = [];
    });
    await page.waitForTimeout(300);
    await page.keyboard.type('Quelques mots tapés au milieu du gros document ', { delay: 60 });
    await page.waitForTimeout(300);
    const keys = await page.evaluate(() => window.__lat.splice(0));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const enter = await page.evaluate(() => window.__lat.splice(0));
    const t = Date.now();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(50);
    const undo = await page.evaluate(() => window.__lat.splice(0));
    say(`${label} — frappe : ${fmt(stats(keys))} ; Entrée : ${Math.round(enter[0] || 0)} ms ; Ctrl+Z : ${Math.round(undo[0] || Date.now() - t)} ms`);
  }
  await typing('Mode note');

  // Mode avancé : découpage complet, puis frappe.
  const tPag = await page.evaluate(async () => {
    const t = performance.now();
    document.querySelector('#mode-switch button[data-mode="avance"]').click();
    await new Promise((r) => setTimeout(r, 0));
    let last = -1;
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const n = document.querySelectorAll('.pg-sheet').length;
      if (n === last && n > 1) break;
      last = n;
    }
    return performance.now() - t;
  });
  const pages = await page.evaluate(() => document.querySelectorAll('.pg-sheet').length);
  say(`Mode avancé : ${pages} pages, découpage complet ${Math.round(tPag)} ms`);
  await typing('Mode avancé');
};
