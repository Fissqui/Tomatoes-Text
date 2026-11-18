'use strict';

// Couleurs récentes : les 6 dernières couleurs choisies (texte, schéma, légende, cadre, réglages…), proposées
// de nouveau dans les sélecteurs. Gardées pour le logiciel (pas pour un document).
// - FTCouleurs.add(c) : couleur choisie.
// - FTCouleurs.row(onPick, { title }) : rangée « Récentes » (cachée tant qu'aucune couleur n'a été choisie),
//   refaite à chaque nouvelle couleur.
// - Tout sélecteur de couleur du système (input type=color) : sa couleur est retenue, et ses suggestions sont
//   les couleurs récentes.
(() => {
  const KEY = 'ft-couleurs-recentes';
  const MAX = 6;

  // #rgb, #rrggbb, rgb()/rgba() : forme unique (« #c0392b » et « #C0392B » sont la même couleur).
  function norm(c) {
    let s = String(c || '').trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + [...s.slice(1)].map((x) => x + x).join('');
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(s);
    if (!m) return '';
    if (m[4] !== undefined && Number(m[4]) < 1) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${Number(m[4])})`;
    return '#' + [m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, '0')).join('');
  }

  let list = [];
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) list = saved.map(norm).filter(Boolean).slice(0, MAX);
  } catch { list = []; }

  // Suggestions des sélecteurs du système (la fenêtre de couleur les montre en tête).
  const datalist = document.createElement('datalist');
  datalist.id = 'ft-couleurs-recentes';
  document.body.append(datalist);

  function hex(c) {
    if (c.startsWith('#')) return c;
    const m = /(\d+), (\d+), (\d+)/.exec(c);
    return m ? '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('') : '';
  }

  function refresh() {
    datalist.replaceChildren(...[...new Set(list.map(hex).filter(Boolean))].map((c) => new Option('', c)));
    for (const el of document.querySelectorAll('.ft-recents')) render(el);
  }

  function add(c) {
    const v = norm(c);
    if (!v) return;
    list = [v, ...list.filter((x) => x !== v)].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* rien */ }
    refresh();
  }

  function render(el) {
    const pick = el._pick;
    el.hidden = !list.length;
    const title = el.dataset.title ? [Object.assign(document.createElement('span'), { className: 'ft-recents-title', textContent: el.dataset.title })] : [];
    el.replaceChildren(...title, ...list.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ft-recent';
      b.title = c;
      b.dataset.color = c;
      b.style.background = c;
      // (Le texte sélectionné dans le document reste sélectionné.)
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { pick(c); add(c); });
      return b;
    }));
  }

  function row(onPick, opts = {}) {
    const el = document.createElement('div');
    el.className = 'ft-recents' + (opts.className ? ' ' + opts.className : '');
    if (opts.title !== '') el.dataset.title = opts.title || 'Récentes';
    el._pick = onPick;
    render(el);
    return el;
  }

  // Sélecteurs du système : couleur retenue une fois choisie ; suggestions = couleurs récentes.
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'color') add(t.value);
  }, true);
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.type === 'color' && !t.hasAttribute('list') && list.length) t.setAttribute('list', datalist.id);
  }, true);

  refresh();
  window.FTCouleurs = { add, row, list: () => list.slice(), norm };
})();
