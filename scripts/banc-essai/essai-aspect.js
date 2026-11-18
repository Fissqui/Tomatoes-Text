// Essai 2.4.0 : thème du logiciel en profondeur. Chaque réglage de l'onglet « Aspect » (disposition, fond,
// feuille, icônes, animations, accueil, liste des documents, petits éléments, logo) se pose sur :root et
// change l'interface ; chaque thème a son aspect complet ; les réglages un à un restent possibles.
// FT_SHOTS=<dossier> : captures de quelques thèmes (document et accueil).
// Usage : node scripts/banc-essai/run.js scripts/banc-essai/essai-aspect.js
const assert = require('assert');
const path = require('path');
const SHOTS = process.env.FT_SHOTS || '';

module.exports = async ({ page }) => {
  const ok = (m) => console.log('  OK  ' + m);
  const v = (fn, arg) => page.evaluate(fn, arg);
  const setPrefs = (p) => v((x) => window.FTCustomize.init(x, (n) => { window.__prefs = n; }), p);
  await v(() => {
    window.FTEditor.load({ content: { html: '<h1>Rapport annuel</h1><p>Le chiffre d’affaires progresse de 4 % sur l’exercice, porté par les ventes à l’export.</p><p>Les charges de personnel restent stables.</p>' }, settings: {} });
    document.getElementById('page').hidden = false;
  });

  // 1. Onglet « Aspect » : huit sections, un menu par réglage, chaque choix posé sur :root.
  await setPrefs({ theme: 'classique' });
  await v(() => window.FTCustomize.open());
  await v(() => document.querySelector('#custom-dialog .styles-tabs [data-tab="aspect"]').click());
  const heads = await v(() => [...document.querySelectorAll('#custom-panel .custom-look h3')].map((h) => h.textContent));
  assert.deepStrictEqual(heads, ['Disposition', 'Fond de la fenêtre', 'Feuille', 'Icônes', 'Boutons et fenêtres', 'Accueil et projets', 'Petits éléments', 'Logo']);
  const keys = await v(() => [...document.querySelectorAll('#custom-panel select[name^="look-"]')].map((s) => [s.name.slice(5), [...s.options].map((o) => o.value)]));
  assert(keys.length >= 28, 'réglages : ' + keys.length);
  for (const [key, values] of keys) {
    for (const value of values) {
      const got = await v(([k, x]) => {
        const s = document.querySelector(`#custom-panel select[name="look-${k}"]`);
        s.value = x;
        s.dispatchEvent(new Event('change'));
        const ds = document.documentElement.dataset['ui' + k[0].toUpperCase() + k.slice(1)];
        return { ds, kept: document.querySelector(`#custom-panel select[name="look-${k}"]`).value, saved: (window.__prefs.look || {})[k] };
      }, [key, value]);
      assert.strictEqual(got.kept, value, key + ' = ' + value);
      assert.strictEqual(got.saved, value);
      if (!['weight', 'round', 'forme'].includes(key)) assert.strictEqual(got.ds, value, key);
    }
  }
  ok(`onglet Aspect : 8 sections, ${keys.length} réglages, chaque valeur posée et enregistrée`);
  await v(() => document.getElementById('custom-dialog').close());

  // 2. Effets visibles de quelques réglages.
  await setPrefs({ theme: 'classique', look: { cote: 'droite', largeur: 'large', fond: 'grain', ombre: 'aucune', papier: 'velin', selection: 'theme', onglets: 'pastilles', arbre: 'icones', logo: 'trait', controles: 'theme', forme: 'anguleuse' } });
  const fx = await v(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    const side = document.getElementById('sidebar').getBoundingClientRect();
    return {
      right: side.right >= innerWidth - 1, width: Math.round(side.width),
      fond: cs('#workspace').backgroundImage, ombre: cs('#page').boxShadow, papier: cs('#page').backgroundImage,
      onglet: cs('#view-tabs button[aria-selected="true"]').borderTopLeftRadius,
      logo: getComputedStyle(document.querySelector('#sidebar .brand-logo path[style*="logo-tomato"]')).fill === getComputedStyle(document.getElementById('sidebar')).backgroundColor,
      cap: cs('#view-tabs svg').strokeLinejoin,
      accent: getComputedStyle(document.createElement('input')).accentColor
    };
  });
  assert(fx.right, 'panneau à droite');
  assert.strictEqual(fx.width, 310);
  assert(fx.fond.includes('svg'), fx.fond);
  assert.strictEqual(fx.ombre, 'none');
  assert(fx.papier.includes('gradient'), fx.papier);
  assert(parseFloat(fx.onglet) > 100, fx.onglet);
  assert(fx.logo, 'logo au trait');
  assert.strictEqual(fx.cap, 'miter');
  ok('panneau à droite et large, fond grain, feuille sans ombre et vélin, onglets pastilles, logo au trait, trait anguleux');
  await v(() => document.getElementById('sidebar-toggle').click());
  await page.waitForTimeout(300);
  assert(await v(() => document.getElementById('sidebar').getBoundingClientRect().left >= innerWidth - 2), 'panneau à droite masqué');
  await v(() => document.getElementById('sidebar-toggle').click());
  await page.waitForTimeout(300);
  ok('panneau à droite : masquer / afficher');

  // 3. Info-bulles du thème : le title est affiché dans #ui-tip puis remis.
  await setPrefs({ theme: 'classique', look: { bulles: 'contraste' } });
  await page.hover('#sidebar-toggle');
  await page.waitForTimeout(700);
  const tip = await v(() => ({ shown: !document.getElementById('ui-tip').hidden, text: document.getElementById('ui-tip').textContent, title: document.getElementById('sidebar-toggle').getAttribute('title') }));
  assert(tip.shown && /Liste des documents/.test(tip.text) && tip.title === null, JSON.stringify(tip));
  await page.mouse.move(700, 600);
  await page.waitForTimeout(100);
  assert(await v(() => document.getElementById('ui-tip').hidden && /Liste des documents/.test(document.getElementById('sidebar-toggle').title)));
  await setPrefs({ theme: 'classique', look: { bulles: 'systeme' } });
  await page.hover('#sidebar-toggle');
  await page.waitForTimeout(700);
  assert(await v(() => document.getElementById('ui-tip').hidden && !!document.getElementById('sidebar-toggle').title));
  await page.mouse.move(700, 600);
  ok('info-bulles du thème (title remis en place), info-bulles système');

  // 4. Fond « Image » : image choisie réduite et gardée ; accueil en cartes et logo en filigrane.
  const img = await v(() => {
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 30;
    cv.getContext('2d').fillRect(0, 0, 40, 30);
    return cv.toDataURL('image/jpeg');
  });
  await setPrefs({ theme: 'classique', look: { fond: 'image', accueil: 'cartes', accueilFond: 'logo' }, image: img });
  assert(await v(() => getComputedStyle(document.getElementById('workspace')).backgroundImage.includes('data:image/jpeg')));
  assert(await v(() => !!document.querySelector('#welcome .wl-mark svg')));
  await setPrefs({ theme: 'classique', look: { accueilFond: 'uni' } });
  assert(await v(() => !document.querySelector('#welcome .wl-mark')));
  ok('fond image, logo en filigrane de l’accueil (ajouté puis retiré)');

  // 5. Les 16 thèmes : aspect complet posé, sans erreur ; un choix personnel passe avant le thème.
  const ids = await v(() => [...document.querySelectorAll('#custom-dialog .theme-card .theme-name')].length);
  assert(ids === 0 || ids === 16);
  for (const id of ['tomate', 'ardoise', 'foret', 'lavande', 'ocean', 'minimal', 'contraste', 'sable', 'encre', 'menthe', 'bureau', 'verre', 'retro', 'graphite', 'cerise', 'classique']) {
    await setPrefs({ theme: id });
    const d = await v(() => ({ ...document.documentElement.dataset }));
    assert(d.uiFond && d.uiOmbre && d.uiLogo && d.uiAccueil && d.uiDefil, id);
  }
  await setPrefs({ theme: 'minimal', look: { logo: 'couleurs' } });
  assert.strictEqual(await v(() => document.documentElement.dataset.uiLogo), 'couleurs');
  assert.strictEqual(await v(() => document.documentElement.dataset.uiOmbre), 'bord');
  ok('16 thèmes à l’aspect complet ; un réglage personnel remplace celui du thème');

  if (SHOTS) {
    await setPrefs({ theme: 'minimal', look: { largeur: 'etroit', logo: 'trait' } });
    await page.screenshot({ path: path.join(SHOTS, 'etroit-trait.png'), clip: { x: 0, y: 0, width: 300, height: 120 } });
    for (const [id, mode] of [['tomate', 'light'], ['encre', 'dark'], ['retro', 'light'], ['minimal', 'light'], ['graphite', 'dark'], ['lavande', 'light']]) {
      await v((m) => { document.documentElement.dataset.theme = m; }, mode);
      await setPrefs({ theme: id });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SHOTS, `theme-${id}.png`) });
    }
  }
};
