// Schémas : des formes (cases, losanges, cylindres…) reliées par des connecteurs, dessinés dans une
// grande fenêtre. Le schéma est rangé dans le document comme une image (dessin SVG) qui garde ses
// données dans l'attribut data-diagram : il se place, se redimensionne et s'exporte comme une image,
// et un double-clic le rouvre pour le modifier.
(function () {
  const editor = document.getElementById('editor');
  // Moteur 2.0 : les schémas sont posés dans la zone du nouveau moteur (objets.js).
  const S = () => window.FTObjets || window.FTStructure;
  const NS = 'http://www.w3.org/2000/svg';
  const GRID = 10;

  // ----- Formes -----

  const SHAPES = [
    ['rect', 'Rectangle'], ['arrondi', 'Rectangle arrondi'], ['ellipse', 'Ellipse'], ['losange', 'Losange (décision)'],
    ['parallelogramme', 'Parallélogramme (entrée / sortie)'], ['trapeze', 'Trapèze'], ['hexagone', 'Hexagone'], ['triangle', 'Triangle'],
    ['cylindre', 'Cylindre (base de données)'], ['document', 'Document'], ['note', 'Note (coin plié)'], ['fleche', 'Flèche'],
    ['etoile', 'Étoile'], ['nuage', 'Nuage'], ['acteur', 'Personnage'], ['texte', 'Texte seul'],
    ['cercle', 'Cercle'], ['pilule', 'Début / fin'], ['processus', 'Sous-processus'], ['retard', 'Délai'],
    ['pentagone', 'Pentagone'], ['octogone', 'Octogone'], ['chevron', 'Étape (chevron)'], ['fleche-double', 'Flèche double'],
    ['croix', 'Croix'], ['bulle', 'Bulle'], ['cadre', 'Cadre avec titre']
  ];
  // Graphes rapides, purement illustratifs : axes en L et courbes toutes faites, tracées dans leur boîte.
  const GRAPHS = [
    ['g-axes', 'Axes X et Y'], ['g-droite', 'Droite'], ['g-legere', 'Courbe légère'], ['g-moyenne', 'Courbe moyenne'],
    ['g-forte', 'Courbe forte'], ['g-exp', 'Exponentielle'], ['g-log', 'Logarithmique'], ['g-s', 'Courbe en S'],
    ['g-escalier', 'Escalier'], ['g-scie', 'Dent de scie'], ['g-cloche', 'Cloche'], ['g-vague', 'Vague'],
    ['g-onde', 'Onde'], ['g-onde-aigue', 'Onde aiguë'],
    ['g-plateau', 'Plateau'], ['g-decroissance', 'Décroissance'], ['g-parabole', 'Parabole'], ['g-pic', 'Pic puis déclin'],
    ['g-puissance', 'Puissance'], ['g-hyperbole', 'Hyperbole'], ['g-polynome', 'Polynôme de degré 3'], ['g-amortie', 'Oscillation amortie'],
    ['g-courbe-j', 'Courbe en J'],
    ['g-normale', 'Loi normale'], ['g-repartition', 'Fonction de répartition'], ['g-bimodale', 'Loi bimodale'],
    ['g-asymetrique', 'Loi asymétrique'], ['g-histogramme', 'Histogramme'], ['g-nuage', 'Nuage de points'],
    ['g-offre-demande', 'Offre et demande'], ['g-laffer', 'Courbe de Laffer'], ['g-lorenz', 'Courbe de Lorenz'], ['g-tendance', 'Tendance et cycle']
  ];
  const isGraph = (n) => !!n && /^g-/.test(n.shape);
  // Graphes répétitifs : nombre de motifs (n.count), avec leur nom et leur nombre par défaut.
  const REPEATS = {
    'g-scie': ['Nombre de dents', 4],
    'g-escalier': ['Nombre de marches', 5],
    'g-vague': ['Nombre de cycles', 2],
    'g-onde': ['Nombre de cycles', 2],
    'g-onde-aigue': ['Nombre de cycles', 2],
    'g-amortie': ['Nombre de cycles', 4],
    'g-tendance': ['Nombre de cycles', 3]
  };
  const repeats = (n) => (REPEATS[n.shape] ? Math.max(1, Math.min(40, Math.round(n.count || REPEATS[n.shape][1]))) : 0);
  // Réglages propres à chaque courbe : clé, nom, minimum, maximum, pas, valeur par défaut.
  const CENTER = ['center', 'Centre (%)', 5, 95, 1, 50];
  const PARAMS = {
    'g-droite': [['from', 'Hauteur au départ (%)', 0, 100, 1, 0], ['to', 'Hauteur à l’arrivée (%)', 0, 100, 1, 100]],
    'g-exp': [['rate', 'Croissance', 0.5, 10, 0.5, 4.5]],
    'g-log': [['bend', 'Courbure', 1, 200, 1, 40]],
    'g-s': [['steep', 'Raideur', 2, 40, 1, 11], CENTER],
    'g-cloche': [CENTER, ['spread', 'Largeur (%)', 3, 40, 1, 15]],
    'g-vague': [['amp', 'Amplitude (%)', 5, 100, 1, 100]],
    'g-onde': [['amp', 'Amplitude (%)', 5, 100, 1, 100]],
    'g-plateau': [['rate', 'Vitesse', 0.5, 15, 0.5, 5]],
    'g-decroissance': [['rate', 'Vitesse', 0.5, 15, 0.5, 4.5]],
    'g-parabole': [['top', 'Position du sommet (%)', 0, 100, 1, 50], ['low', 'Hauteur du sommet (%)', 0, 90, 1, 0]],
    'g-pic': [['peak', 'Position du pic (%)', 5, 80, 1, 25]],
    'g-puissance': [['power', 'Exposant', 0.1, 8, 0.1, 2]],
    'g-hyperbole': [['hyper', 'Courbure', 1, 50, 1, 10]],
    'g-polynome': [['wave', 'Ondulation (%)', 0, 100, 5, 60]],
    'g-amortie': [['damp', 'Amortissement', 0, 10, 0.5, 3]],
    'g-courbe-j': [['dip', 'Profondeur du creux (%)', 0, 60, 1, 25], ['low', 'Position du creux (%)', 5, 60, 1, 20]],
    'g-normale': [['center', 'Moyenne (%)', 5, 95, 1, 50], ['spread', 'Écart-type (%)', 3, 40, 1, 15]],
    'g-repartition': [['center', 'Moyenne (%)', 5, 95, 1, 50], ['spread', 'Écart-type (%)', 3, 40, 1, 15]],
    'g-bimodale': [['gap', 'Écart entre les pics (%)', 10, 80, 1, 40], ['second', 'Hauteur du second pic (%)', 10, 100, 1, 70],
      ['spread', 'Largeur des pics (%)', 3, 25, 1, 10]],
    'g-asymetrique': [['peak', 'Position du pic (%)', 5, 80, 1, 25], ['skew', 'Asymétrie (%)', 10, 120, 5, 60]],
    'g-histogramme': [['bars', 'Nombre de barres', 3, 40, 1, 9], ['spread', 'Écart-type (%)', 8, 40, 1, 18]],
    'g-nuage': [['points', 'Nombre de points', 5, 300, 1, 40], ['scatter', 'Dispersion (%)', 0, 50, 1, 15],
      ['slope', 'Pente (%)', -100, 100, 5, 60], ['seed', 'Tirage', 1, 99, 1, 1]],
    'g-offre-demande': [['curve', 'Courbure (%)', 0, 100, 5, 40]],
    'g-laffer': [['top', 'Position du sommet (%)', 10, 90, 1, 50]],
    'g-lorenz': [['gini', 'Indice de Gini (%)', 0, 95, 1, 40]],
    'g-tendance': [['amp', 'Amplitude (%)', 0, 50, 1, 15], ['trend', 'Pente de la tendance (%)', -100, 100, 5, 60]]
  };
  // Cases à cocher propres à une courbe : clé, nom, bulle, valeur par défaut.
  const OPTIONS = {
    'g-normale': [['meanLine', 'Trait de la moyenne', 'Trait vertical à la moyenne', false]],
    'g-lorenz': [['diagonal', 'Diagonale', 'Droite d’égalité parfaite', true]]
  };
  const param = (n, key) => {
    const def = (PARAMS[n.shape] || []).find((p) => p[0] === key);
    const v = Number(n[key]);
    return Number.isFinite(v) && n[key] !== '' && n[key] != null ? Math.max(def[2], Math.min(def[3], v)) : def[5];
  };
  const option = (n, key) => (n[key] == null ? (OPTIONS[n.shape] || []).find((o) => o[0] === key)[3] : !!n[key]);
  // Courbes sans remplissage possible : axes, points, deux courbes croisées.
  const NO_AREA = new Set(['g-axes', 'g-nuage', 'g-offre-demande']);
  const VALIGNS = [['top', 'Haut'], ['middle', 'Milieu'], ['bottom', 'Bas']];
  // Modèles : un schéma tout prêt ajouté d'un clic (templateData).
  const TEMPLATES = [
    ['organigramme', 'Organigramme'], ['processus', 'Processus'], ['cycle', 'Cycle'], ['pyramide', 'Pyramide'],
    ['venn', 'Venn'], ['chronologie', 'Chronologie'], ['decision', 'Logigramme'], ['carte', 'Carte mentale'],
    ['matrice', 'Matrice 2 × 2'], ['entonnoir', 'Entonnoir']
  ];
  const ARROWS = [['', 'Aucune'], ['fleche', 'Flèche'], ['pleine', 'Flèche pleine'], ['rond', 'Rond'], ['losange', 'Losange'], ['barre', 'Barre']];
  const ROUTES = [['droit', 'Droit'], ['coude', 'Coudé'], ['courbe', 'Courbe']];
  const DASHES = [['', 'Plein'], ['tirets', 'Tirets'], ['points', 'Pointillés'], ['mixte', 'Tiret-point']];
  const FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Verdana', 'Georgia', 'Times New Roman', 'Garamond', 'Trebuchet MS', 'Comic Sans MS', 'Consolas'];
  const PALETTE = ['#ffffff', '#f2f2f2', '#d9d9d9', '#7f7f7f', '#262626', '#fde2e1', '#f8b4ae', '#e74c3c', '#fdebd0', '#f5c28b', '#e67e22',
    '#fcf3cf', '#f7dc6f', '#d4ac0d', '#d5f5e3', '#82e0aa', '#27ae60', '#d6eaf8', '#85c1e9', '#2e86c1', '#e8daef', '#bb8fce', '#8e44ad', '#1f3a93'];
  // Styles rapides : remplissage, contour, texte.
  const QUICK = [
    ['#ffffff', '#404040', '#262626'], ['#d6eaf8', '#2e86c1', '#1b4f72'], ['#d5f5e3', '#27ae60', '#145a32'], ['#fdebd0', '#e67e22', '#784212'],
    ['#fde2e1', '#e74c3c', '#78281f'], ['#e8daef', '#8e44ad', '#4a235a'], ['#fcf3cf', '#d4ac0d', '#7d6608'], ['#2e86c1', '#1b4f72', '#ffffff'],
    ['#27ae60', '#145a32', '#ffffff'], ['#262626', '#000000', '#ffffff']
  ];

  const NODE = { shape: 'arrondi', w: 140, h: 60, text: '', fill: '#d6eaf8', stroke: '#2e86c1', strokeWidth: 1.5, dash: '', shadow: false, opacity: 1,
    font: 'Segoe UI', fontSize: 14, bold: false, italic: false, textColor: '#1b4f72', align: 'center' };
  const LINK = { route: 'coude', color: '#555555', width: 1.5, dash: '', start: '', end: 'pleine', label: '' };

  let uid = 0;
  const newId = (p) => p + Date.now().toString(36) + (uid++).toString(36);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const snap = (v) => (grid ? Math.round(v / GRID) * GRID : Math.round(v));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ----- Graphes -----

  // Points d'une courbe dans un carré unité (u de gauche à droite, v de bas en haut).
  const sampled = (f, k = 64) => Array.from({ length: k + 1 }, (_, i) => [i / k, f(i / k)]);
  const scaled = (f) => { const a = f(0); const b = f(1); return (u) => (f(u) - a) / (b - a); };
  // Loi normale centrée réduite : densité (pic à 1) et répartition (approximation d'Abramowitz et Stegun).
  const gauss = (u, m, s) => Math.exp(-(((u - m) / s) ** 2) / 2);
  function phi(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return 0.5 * (1 + (z < 0 ? -e : e));
  }
  // Tirage pseudo-aléatoire reproductible (même tirage, mêmes points).
  function random(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function curvePoints(n) {
    const k = repeats(n);
    const p = (key) => param(n, key);
    switch (n.shape) {
      case 'g-droite': return [[0, p('from') / 100], [1, p('to') / 100]];
      case 'g-legere': return sampled((u) => u ** 1.5);
      case 'g-moyenne': return sampled((u) => u ** 2.5);
      case 'g-forte': return sampled((u) => u ** 4.5);
      case 'g-exp': { const r = p('rate'); return sampled(scaled((u) => Math.exp(r * u))); }
      case 'g-log': { const b = p('bend'); return sampled(scaled((u) => Math.log(1 + b * u))); }
      case 'g-s': { const r = p('steep'); const c = p('center') / 100; return sampled(scaled((u) => 1 / (1 + Math.exp(-r * (u - c)))), 96); }
      case 'g-escalier': {
        if (k === 1) return [[0, 0], [1, 0]];
        const pts = [];
        for (let i = 0; i < k; i++) pts.push([i / k, i / (k - 1)], [(i + 1) / k, i / (k - 1)]);
        return pts;
      }
      case 'g-scie': {
        const pts = [[0, 0]];
        for (let i = 1; i <= k; i++) pts.push([i / k, 1], [i / k, 0]);
        return pts;
      }
      case 'g-cloche': {
        const m = p('center') / 100; const s = p('spread') / 100;
        const a = Math.max(gauss(0, m, s), gauss(1, m, s));
        return sampled((u) => (gauss(u, m, s) - a) / (1 - a), 96);
      }
      case 'g-vague': { const a = p('amp') / 100; return sampled((u) => 0.5 - 0.5 * a * Math.cos(2 * k * Math.PI * u), Math.max(96, 48 * k)); }
      // Onde : sinusoïde autour du milieu ; onde aiguë : triangles (sommets en pointe).
      case 'g-onde': { const a = p('amp') / 100; return sampled((u) => 0.5 + 0.5 * a * Math.sin(2 * k * Math.PI * u), Math.max(96, 48 * k)); }
      case 'g-onde-aigue': {
        const pts = [[0, 0.5]];
        for (let i = 0; i < k; i++) pts.push([(i + 0.25) / k, 1], [(i + 0.75) / k, 0]);
        pts.push([1, 0.5]);
        return pts;
      }
      case 'g-plateau': { const r = p('rate'); return sampled(scaled((u) => 1 - Math.exp(-r * u))); }
      case 'g-decroissance': { const r = p('rate'); const z = Math.exp(-r); return sampled((u) => (Math.exp(-r * u) - z) / (1 - z)); }
      case 'g-parabole': {
        const m = p('top') / 100; const low = p('low') / 100; const span = Math.max(m, 1 - m) || 1;
        return sampled((u) => low + (1 - low) * ((u - m) / span) ** 2);
      }
      case 'g-pic': { const m = p('peak') / 100; return sampled((u) => (u / m) * Math.exp(1 - u / m), 96); }
      case 'g-puissance': { const e = p('power'); return sampled((u) => u ** e, 96); }
      case 'g-hyperbole': {
        const c = 1 / p('hyper'); const lo = 1 / (1 + c);
        return sampled((u) => (1 / (u + c) - lo) / (1 / c - lo), 128);
      }
      case 'g-polynome': {
        const w = 3 * p('wave') / 100; const f = (u) => (2 * u - 1) ** 3 - w * (2 * u - 1);
        const pts = sampled(f, 96); const vs = pts.map((q) => q[1]); const lo = Math.min(...vs); const hi = Math.max(...vs);
        return pts.map(([u, v]) => [u, (v - lo) / (hi - lo || 1)]);
      }
      case 'g-amortie': { const d = p('damp'); return sampled((u) => 0.5 + 0.5 * Math.exp(-d * u) * Math.cos(2 * k * Math.PI * u), Math.max(128, 48 * k)); }
      case 'g-courbe-j': {
        // Baisse jusqu'au creux (arrondi), puis remontée au-dessus du départ.
        const depth = p('dip') / 100; const m = p('low') / 100;
        return sampled((u) => (u <= m ? 0.1 + depth * (1 - u / m) ** 2 : 0.1 + 0.9 * ((u - m) / (1 - m)) ** 1.8), 96);
      }
      case 'g-normale': { const m = p('center') / 100; const s = p('spread') / 100; return sampled((u) => gauss(u, m, s), 128); }
      case 'g-repartition': { const m = p('center') / 100; const s = p('spread') / 100; return sampled((u) => phi((u - m) / s), 128); }
      case 'g-bimodale': {
        const g = p('gap') / 100; const h = p('second') / 100; const s = p('spread') / 100;
        const f = (u) => gauss(u, 0.5 - g / 2, s) + h * gauss(u, 0.5 + g / 2, s);
        const pts = sampled(f, 128); const top = Math.max(...pts.map((q) => q[1])) || 1;
        return pts.map(([u, v]) => [u, v / top]);
      }
      case 'g-asymetrique': {
        // Log-normale dont le mode est à la position choisie.
        const m = p('peak') / 100; const s = p('skew') / 100; const mu = Math.log(m) + s * s;
        const f = (u) => (u <= 0 ? 0 : Math.exp(-((Math.log(u) - mu) ** 2) / (2 * s * s)) / u);
        const top = f(m);
        return sampled((u) => f(u) / top, 128);
      }
      case 'g-histogramme': {
        const b = Math.round(p('bars')); const s = p('spread') / 100;
        const hs = Array.from({ length: b }, (_, i) => gauss((i + 0.5) / b, 0.5, s));
        const top = Math.max(...hs);
        const pts = [[0, 0]];
        hs.forEach((h, i) => pts.push([i / b, h / top], [(i + 1) / b, h / top]));
        pts.push([1, 0]);
        return pts;
      }
      case 'g-laffer': {
        const m = p('top') / 100; const a = 2 * m / (1 - m || 1);
        const f = (u) => u ** a * (1 - u) ** 2; const top = f(a / (a + 2)) || 1;
        return sampled((u) => f(u) / top, 96);
      }
      case 'g-lorenz': { const g = p('gini') / 100; const e = (1 + g) / (1 - g); return sampled((u) => u ** e, 96); }
      case 'g-tendance': {
        const a = p('amp') / 100; const t = p('trend') / 100;
        return sampled((u) => 0.5 + t * 0.35 * (2 * u - 1) + a * Math.sin(2 * k * Math.PI * u), Math.max(128, 48 * k)).map(([u, v]) => [u, Math.max(0, Math.min(1, v))]);
      }
      case 'g-offre-demande': {
        const c = p('curve') / 100;
        return sampled((u) => 0.1 + 0.9 * u ** (1 + c * 1.5));
      }
      default: return [[0, 0], [1, 1]];
    }
  }
  // Tracés en plus de la courbe : seconde courbe, diagonale, trait de la moyenne, séparations des barres.
  function extraPaths(n) {
    const p = (key) => param(n, key);
    switch (n.shape) {
      case 'g-offre-demande': { const c = p('curve') / 100; return [sampled((u) => 0.1 + 0.9 * (1 - u) ** (1 + c * 1.5))]; }
      case 'g-lorenz': return option(n, 'diagonal') ? [[[0, 0], [1, 1]]] : [];
      case 'g-normale': return option(n, 'meanLine') ? [[[p('center') / 100, 0], [p('center') / 100, 1]]] : [];
      case 'g-histogramme': {
        const pts = curvePoints(n);
        const out = [];
        for (let i = 2; i < pts.length - 2; i += 2) out.push([[pts[i][0], 0], [pts[i][0], Math.min(pts[i - 1][1], pts[i + 1][1])]]);
        return out;
      }
      default: return [];
    }
  }
  // Nuage : un point par trait de longueur nulle (bouts ronds), autour d'une droite de pente choisie.
  function cloudPoints(n) {
    const rnd = random(Math.round(param(n, 'seed')));
    const k = Math.round(param(n, 'points'));
    const sc = param(n, 'scatter') / 100;
    const sl = param(n, 'slope') / 100;
    const pts = [];
    for (let i = 0; i < k; i++) {
      const u = 0.04 + 0.92 * rnd();
      // (Somme de trois tirages : écarts plus nombreux près de la droite.)
      const e = (rnd() + rnd() + rnd() - 1.5) / 1.5;
      pts.push([u, Math.max(0.02, Math.min(0.98, 0.5 + sl * 0.45 * (2 * u - 1) + sc * e))]);
    }
    return pts;
  }
  // Zone remplie sous la courbe, entre deux bornes (en % de la largeur) ; Lorenz : entre la courbe et la diagonale.
  function areaPoints(n) {
    const a = Math.max(0, Math.min(100, Number(n.areaFrom) || 0)) / 100;
    const b = Math.max(0, Math.min(100, n.areaTo == null || n.areaTo === '' ? 100 : Number(n.areaTo))) / 100;
    if (b <= a) return [];
    const pts = curvePoints(n);
    const at = (p, q, u) => [u, p[1] + (q[1] - p[1]) * ((u - p[0]) / (q[0] - p[0] || 1))];
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i];
      const p = pts[i - 1];
      if (p && p[0] < a && q[0] > a) out.push(at(p, q, a));
      if (p && p[0] < b && q[0] > b) out.push(at(p, q, b));
      if (q[0] >= a && q[0] <= b) out.push(q);
    }
    if (!out.length) return [];
    const base = n.shape === 'g-lorenz' ? (u) => u : () => 0;
    return [...out, [out[out.length - 1][0], base(out[out.length - 1][0])], [out[0][0], base(out[0][0])]];
  }
  // Point (u, v) du carré unité placé dans la boîte de la forme : retourné, puis tourné par quarts de tour.
  function graphPoint(n, u, v) {
    if (n.flipH) u = 1 - u;
    if (n.flipV) v = 1 - v;
    for (let i = 0; i < ((n.turn || 0) & 3); i++) [u, v] = [v, 1 - u];
    return [n.x + u * n.w, n.y + (1 - v) * n.h];
  }
  const fmt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  function areaPath(n) {
    if (!n.area || NO_AREA.has(n.shape)) return '';
    const pts = areaPoints(n);
    return pts.length ? 'M' + pts.map(([u, v]) => fmt(graphPoint(n, u, v))).join('L') + 'Z' : '';
  }
  // Axes : origine, bout de l'axe X, bout de l'axe Y, et sens de chaque axe (pour les flèches et graduations).
  function axesGeometry(n) {
    const o = graphPoint(n, 0, 0);
    const ex = graphPoint(n, 1, 0);
    const ey = graphPoint(n, 0, 1);
    const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    return { o, ex, ey, dx: dir(o, ex), dy: dir(o, ey) };
  }
  function graphPath(n) {
    if (n.shape === 'g-nuage') return cloudPoints(n).map(([u, v]) => 'M' + fmt(graphPoint(n, u, v)) + 'h0').join('');
    const line = (pts) => 'M' + pts.map(([u, v]) => fmt(graphPoint(n, u, v))).join('L');
    if (n.shape !== 'g-axes') return [curvePoints(n), ...extraPaths(n)].map(line).join('');
    const { o, ex, ey, dx, dy } = axesGeometry(n);
    const sw = Number(n.strokeWidth) || 1.5;
    let d = `M${fmt(ey)}L${fmt(o)}L${fmt(ex)}`;
    if (n.arrows !== false) {
      const a = Math.min(Math.max(5, sw * 3.5), Math.min(n.w, n.h) * 0.15);
      const wing = (tip, t) => `M${fmt([tip[0] - t[0] * a - t[1] * a * 0.6, tip[1] - t[1] * a + t[0] * a * 0.6])}L${fmt(tip)}L${fmt([tip[0] - t[0] * a + t[1] * a * 0.6, tip[1] - t[1] * a - t[0] * a * 0.6])}`;
      d += wing(ex, dx) + wing(ey, dy);
    }
    // Graduations : vers l'extérieur du graphe.
    const k = Math.max(0, Math.min(20, Math.round(n.ticks || 0)));
    const len = Math.max(4, sw * 3);
    for (let i = 1; i <= k; i++) {
      const t = i / (k + 1);
      const px = [o[0] + (ex[0] - o[0]) * t, o[1] + (ex[1] - o[1]) * t];
      const py = [o[0] + (ey[0] - o[0]) * t, o[1] + (ey[1] - o[1]) * t];
      d += `M${fmt(px)}L${fmt([px[0] - dy[0] * len, px[1] - dy[1] * len])}`;
      d += `M${fmt(py)}L${fmt([py[0] - dx[0] * len, py[1] - dx[1] * len])}`;
    }
    return d;
  }
  // Titres des axes, au-delà du bout de chaque flèche.
  function axisLabels(n) {
    if (n.shape !== 'g-axes' || (!n.labelX && !n.labelY)) return '';
    const { ex, ey, dx, dy } = axesGeometry(n);
    const fs = n.fontSize || 13;
    const one = (text, tip, t) => {
      if (!text) return '';
      const gap = fs * 0.6 + 4;
      const x = tip[0] + t[0] * gap;
      const y = tip[1] + t[1] * gap;
      const anchor = Math.abs(t[0]) > Math.abs(t[1]) ? (t[0] > 0 ? 'start' : 'end') : 'middle';
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-family="${esc(n.font)}, Segoe UI, Arial, sans-serif" font-size="${fs}" fill="${n.stroke || '#404040'}"${n.bold ? ' font-weight="700"' : ''}${n.italic ? ' font-style="italic"' : ''}>${esc(text)}</text>`;
    };
    return one(n.labelX, ex, dx) + one(n.labelY, ey, dy);
  }

  // Contour de chaque forme, dans sa boîte (x, y, w, h) : un chemin SVG.
  function shapePath(n) {
    if (isGraph(n)) return graphPath(n);
    const { x, y, w, h } = n;
    const r = x + w;
    const b = y + h;
    const cx = x + w / 2;
    const cy = y + h / 2;
    switch (n.shape) {
      case 'arrondi': { const k = Math.min(12, w / 4, h / 4); return `M${x + k},${y}H${r - k}Q${r},${y} ${r},${y + k}V${b - k}Q${r},${b} ${r - k},${b}H${x + k}Q${x},${b} ${x},${b - k}V${y + k}Q${x},${y} ${x + k},${y}Z`; }
      case 'ellipse': return `M${x},${cy}A${w / 2},${h / 2} 0 1 0 ${r},${cy}A${w / 2},${h / 2} 0 1 0 ${x},${cy}Z`;
      case 'losange': return `M${cx},${y}L${r},${cy}L${cx},${b}L${x},${cy}Z`;
      case 'parallelogramme': { const k = Math.min(w * 0.25, h * 0.6); return `M${x + k},${y}H${r}L${r - k},${b}H${x}Z`; }
      case 'trapeze': { const k = n.inset != null ? n.inset : Math.min(w * 0.2, h * 0.6); return n.flip ? `M${x},${y}H${r}L${r - k},${b}H${x + k}Z` : `M${x + k},${y}H${r - k}L${r},${b}H${x}Z`; }
      case 'hexagone': { const k = Math.min(w * 0.25, h * 0.5); return `M${x + k},${y}H${r - k}L${r},${cy}L${r - k},${b}H${x + k}L${x},${cy}Z`; }
      case 'triangle': return `M${cx},${y}L${r},${b}H${x}Z`;
      case 'cylindre': { const e = Math.min(h * 0.15, 14); return `M${x},${y + e}A${w / 2},${e} 0 0 1 ${r},${y + e}V${b - e}A${w / 2},${e} 0 0 1 ${x},${b - e}Z M${x},${y + e}A${w / 2},${e} 0 0 0 ${r},${y + e}`; }
      case 'document': { const e = Math.min(h * 0.12, 10); return `M${x},${y}H${r}V${b - e}C${r - w * 0.25},${b - 3 * e} ${x + w * 0.5},${b + e} ${x + w * 0.25},${b}S${x},${b - e} ${x},${b - e}Z`; }
      case 'note': { const k = Math.min(16, w / 4, h / 4); return `M${x},${y}H${r - k}L${r},${y + k}V${b}H${x}Z M${r - k},${y}V${y + k}H${r}`; }
      case 'fleche': { const k = Math.min(w * 0.35, h); const t = h * 0.25; return `M${x},${y + t}H${r - k}V${y}L${r},${cy}L${r - k},${b}V${b - t}H${x}Z`; }
      case 'etoile': {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const k = i % 2 ? 0.45 : 1;
          pts.push(`${cx + (Math.cos(a) * w * k) / 2},${cy + (Math.sin(a) * h * k) / 2 + h * 0.05}`);
        }
        return 'M' + pts.join('L') + 'Z';
      }
      case 'nuage': {
        const p = (u, v) => `${x + u * w},${y + v * h}`;
        return `M${p(0.25, 0.85)}C${p(0.02, 0.85)} ${p(0.0, 0.5)} ${p(0.18, 0.42)}C${p(0.12, 0.12)} ${p(0.42, 0.05)} ${p(0.5, 0.2)}C${p(0.6, 0.0)} ${p(0.85, 0.08)} ${p(0.82, 0.32)}C${p(1.02, 0.36)} ${p(1.02, 0.8)} ${p(0.78, 0.85)}Z`;
      }
      case 'acteur': {
        const hr = Math.min(w, h) * 0.13;
        const hy = y + hr + 1;
        return `M${cx + hr},${hy}A${hr},${hr} 0 1 0 ${cx - hr},${hy}A${hr},${hr} 0 1 0 ${cx + hr},${hy}Z M${cx},${hy + hr}V${y + h * 0.62} M${x + w * 0.22},${y + h * 0.38}H${r - w * 0.22} M${cx},${y + h * 0.62}L${x + w * 0.25},${b - h * 0.18} M${cx},${y + h * 0.62}L${r - w * 0.25},${b - h * 0.18}`;
      }
      case 'cercle': { const k = Math.min(w, h) / 2; return `M${cx - k},${cy}A${k},${k} 0 1 0 ${cx + k},${cy}A${k},${k} 0 1 0 ${cx - k},${cy}Z`; }
      case 'pilule': { const k = Math.min(w, h) / 2; return `M${x + k},${y}H${r - k}A${k},${k} 0 0 1 ${r - k},${b}H${x + k}A${k},${k} 0 0 1 ${x + k},${y}Z`; }
      case 'processus': { const k = Math.min(12, w / 6); return `M${x},${y}H${r}V${b}H${x}Z M${x + k},${y}V${b} M${r - k},${y}V${b}`; }
      case 'retard': { const k = Math.min(w / 2, h / 2); return `M${x},${y}H${r - k}A${k},${h / 2} 0 0 1 ${r - k},${b}H${x}Z`; }
      case 'pentagone': case 'octogone': {
        const m = n.shape === 'pentagone' ? 5 : 8;
        const turn = n.shape === 'pentagone' ? -Math.PI / 2 : Math.PI / 8;
        const pts = [];
        for (let i = 0; i < m; i++) {
          const a = turn + (i * 2 * Math.PI) / m;
          pts.push(`${(cx + (Math.cos(a) * w) / 2).toFixed(1)},${(cy + (Math.sin(a) * h) / 2).toFixed(1)}`);
        }
        return 'M' + pts.join('L') + 'Z';
      }
      case 'chevron': { const k = Math.min(w * 0.3, h * 0.5); return `M${x},${y}H${r - k}L${r},${cy}L${r - k},${b}H${x}L${x + k},${cy}Z`; }
      case 'fleche-double': { const k = Math.min(w * 0.3, h); const t = h * 0.25; return `M${x},${cy}L${x + k},${y}V${y + t}H${r - k}V${y}L${r},${cy}L${r - k},${b}V${b - t}H${x + k}V${b}Z`; }
      case 'croix': { const t = Math.min(w, h) / 3; const ax = cx - t / 2; const ay = cy - t / 2; return `M${ax},${y}H${ax + t}V${ay}H${r}V${ay + t}H${ax + t}V${b}H${ax}V${ay + t}H${x}V${ay}H${ax}Z`; }
      case 'bulle': { const k = Math.min(10, w / 5, h / 5); const bb = y + h * 0.78; return `M${x + k},${y}H${r - k}Q${r},${y} ${r},${y + k}V${bb - k}Q${r},${bb} ${r - k},${bb}H${x + w * 0.38}L${x + w * 0.2},${b}L${x + w * 0.24},${bb}H${x + k}Q${x},${bb} ${x},${bb - k}V${y + k}Q${x},${y} ${x + k},${y}Z`; }
      case 'cadre': { const t = titleH(n); return `M${x},${y}H${r}V${b}H${x}Z M${x},${y + t}H${r}`; }
      case 'texte':
      case 'rect':
      default: return `M${x},${y}H${r}V${b}H${x}Z`;
    }
  }

  const titleH = (n) => Math.min(30, n.h * 0.3, Math.max(20, (n.fontSize || 14) * 1.9));

  // Zone où s'écrit le texte (le personnage a son nom dessous, le cylindre sous son couvercle…).
  function textBox(n) {
    const { x, y, w, h } = n;
    switch (n.shape) {
      case 'losange': return { x: x + w * 0.2, y: y + h * 0.2, w: w * 0.6, h: h * 0.6 };
      case 'triangle': return { x: x + w * 0.22, y: y + h * 0.4, w: w * 0.56, h: h * 0.58 };
      case 'cylindre': { const e = Math.min(h * 0.15, 14); return { x, y: y + 2 * e, w, h: h - 3 * e }; }
      case 'acteur': return { x: x - 20, y: y + h - h * 0.16, w: w + 40, h: h * 0.2 };
      case 'parallelogramme': case 'trapeze': case 'hexagone': return { x: x + w * 0.15, y, w: w * 0.7, h };
      case 'fleche': return { x, y, w: w * 0.8, h };
      case 'etoile': return { x: x + w * 0.25, y: y + h * 0.3, w: w * 0.5, h: h * 0.45 };
      case 'cercle': { const k = Math.min(w, h) * 0.36; return { x: x + w / 2 - k, y: y + h / 2 - k, w: 2 * k, h: 2 * k }; }
      case 'ellipse': return { x: x + w * 0.12, y: y + h * 0.1, w: w * 0.76, h: h * 0.8 };
      case 'pilule': { const k = Math.min(w, h) / 2; return { x: x + k * 0.6, y, w: w - k * 1.2, h }; }
      case 'processus': { const k = Math.min(12, w / 6); return { x: x + k + 3, y: y + 2, w: w - 2 * k - 6, h: h - 4 }; }
      case 'retard': return { x: x + 4, y, w: w - Math.min(w / 2, h / 2) * 0.6 - 4, h };
      case 'pentagone': return { x: x + w * 0.2, y: y + h * 0.25, w: w * 0.6, h: h * 0.65 };
      case 'octogone': return { x: x + w * 0.12, y: y + h * 0.1, w: w * 0.76, h: h * 0.8 };
      case 'chevron': { const k = Math.min(w * 0.3, h * 0.5); return { x: x + k, y, w: w - 2 * k, h }; }
      case 'fleche-double': { const k = Math.min(w * 0.3, h); return { x: x + k * 0.6, y, w: w - k * 1.2, h }; }
      case 'croix': { const t = Math.min(w, h) / 3; return { x: x + w / 2 - t * 1.4, y: y + h / 2 - t / 2, w: t * 2.8, h: t }; }
      case 'bulle': return { x: x + 4, y: y + 2, w: w - 8, h: h * 0.78 - 4 };
      case 'cadre': return { x: x + 8, y, w: w - 16, h: titleH(n) };
      default: return { x: x + 4, y: y + 2, w: w - 8, h: h - 4 };
    }
  }

  // Points d'accroche des connecteurs : haut, droite, bas, gauche.
  function anchor(n, side) {
    const { x, y, w, h } = n;
    const cx = x + w / 2;
    const cy = y + h / 2;
    let k = 0;
    if (n.shape === 'parallelogramme') k = Math.min(w * 0.25, h * 0.6) / 2;
    if (n.shape === 'triangle') k = w / 4;
    if (n.shape === 'chevron') k = Math.min(w * 0.3, h * 0.5);
    if (n.shape === 'pentagone') return { n: [cx, y], s: [cx, y + h * 0.9], e: [x + w * 0.97, cy - h * 0.08], w: [x + w * 0.03, cy - h * 0.08] }[side];
    if (n.shape === 'cercle') { const r = Math.min(w, h) / 2; return { n: [cx, cy - r], s: [cx, cy + r], e: [cx + r, cy], w: [cx - r, cy] }[side]; }
    if (n.shape === 'bulle') return { n: [cx, y], s: [cx, y + h * 0.78], e: [x + w, y + h * 0.39], w: [x, y + h * 0.39] }[side];
    if (n.shape === 'acteur') return { n: [cx, y], s: [cx, y + h], e: [x + w * 0.8, cy - h * 0.12], w: [x + w * 0.2, cy - h * 0.12] }[side];
    return { n: [cx, y], s: [cx, y + h], e: [x + w - k, cy], w: [x + k, cy] }[side];
  }
  const NORMAL = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

  // Côté le plus naturel pour aller d'une forme vers un point.
  function sideToward(n, px, py) {
    const dx = px - (n.x + n.w / 2);
    const dy = py - (n.y + n.h / 2);
    if (Math.abs(dx) * n.h > Math.abs(dy) * n.w) return dx > 0 ? 'e' : 'w';
    return dy > 0 ? 's' : 'n';
  }

  // ----- Connecteurs : tracé, pointes, étiquette -----

  function linkGeometry(d, l) {
    const a = d.nodes.find((n) => n.id === l.from.node);
    const b = d.nodes.find((n) => n.id === l.to.node);
    if (!a || !b) return null;
    const bc = [b.x + b.w / 2, b.y + b.h / 2];
    const ac = [a.x + a.w / 2, a.y + a.h / 2];
    const s1 = l.from.side || sideToward(a, bc[0], bc[1]);
    const s2 = l.to.side || sideToward(b, ac[0], ac[1]);
    const p1 = anchor(a, s1);
    const p2 = anchor(b, s2);
    const n1 = NORMAL[s1];
    const n2 = NORMAL[s2];
    let pts;
    let path;
    let mid;
    if (l.route === 'courbe') {
      const dist = Math.max(40, Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2.5);
      const c1 = [p1[0] + n1[0] * dist, p1[1] + n1[1] * dist];
      const c2 = [p2[0] + n2[0] * dist, p2[1] + n2[1] * dist];
      path = `M${p1}C${c1} ${c2} ${p2}`;
      const t = 0.5;
      const bz = (i) => (1 - t) ** 3 * p1[i] + 3 * (1 - t) ** 2 * t * c1[i] + 3 * (1 - t) * t * t * c2[i] + t ** 3 * p2[i];
      mid = [bz(0), bz(1)];
      return { path, mid, startDir: c1, endDir: c2, p1, p2, pts: [p1, c1, c2, p2] };
    }
    if (l.route === 'coude') {
      const out = 18;
      const q1 = [p1[0] + n1[0] * out, p1[1] + n1[1] * out];
      const q2 = [p2[0] + n2[0] * out, p2[1] + n2[1] * out];
      const h1 = s1 === 'e' || s1 === 'w';
      const h2 = s2 === 'e' || s2 === 'w';
      if (h1 && h2) { const mx = (q1[0] + q2[0]) / 2; pts = [p1, q1, [mx, q1[1]], [mx, q2[1]], q2, p2]; }
      else if (!h1 && !h2) { const my = (q1[1] + q2[1]) / 2; pts = [p1, q1, [q1[0], my], [q2[0], my], q2, p2]; }
      else if (h1) pts = [p1, q1, [q2[0], q1[1]], q2, p2];
      else pts = [p1, q1, [q1[0], q2[1]], q2, p2];
      // Points alignés retirés.
      pts = pts.filter((p, i) => {
        if (i === 0 || i === pts.length - 1) return true;
        const [a0, b0] = [pts[i - 1], pts[i + 1]];
        return !((a0[0] === p[0] && p[0] === b0[0]) || (a0[1] === p[1] && p[1] === b0[1]));
      });
      path = roundedPolyline(pts, 6);
      // Étiquette au milieu du plus long segment.
      let best = 0;
      mid = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (len > best) { best = len; mid = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2]; }
      }
      return { path, mid, startDir: pts[1], endDir: pts[pts.length - 2], p1, p2, pts };
    }
    path = `M${p1}L${p2}`;
    return { path, mid: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], startDir: p2, endDir: p1, p1, p2, pts: [p1, p2] };
  }

  function roundedPolyline(pts, r) {
    let out = `M${pts[0]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [p, c, n] = [pts[i - 1], pts[i], pts[i + 1]];
      const d1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
      const d2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
      const k = Math.min(r, d1 / 2, d2 / 2);
      const a = [c[0] + ((p[0] - c[0]) / d1) * k, c[1] + ((p[1] - c[1]) / d1) * k];
      const b = [c[0] + ((n[0] - c[0]) / d2) * k, c[1] + ((n[1] - c[1]) / d2) * k];
      out += `L${a}Q${c} ${b}`;
    }
    return out + `L${pts[pts.length - 1]}`;
  }

  // Pointe d'un connecteur au point tip, venant de from.
  function head(kind, tip, from, color, width) {
    if (!kind) return '';
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const s = 7 + width * 2;
    const rot = (dx, dy) => [tip[0] + dx * Math.cos(ang) - dy * Math.sin(ang), tip[1] + dx * Math.sin(ang) + dy * Math.cos(ang)];
    const P = (...p) => p.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' ');
    switch (kind) {
      case 'fleche': return `<polyline points="${P(rot(-s, -s * 0.55), tip, rot(-s, s * 0.55))}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
      case 'pleine': return `<polygon points="${P(tip, rot(-s, -s * 0.5), rot(-s, s * 0.5))}" fill="${color}" stroke="${color}" stroke-width="${Math.min(width, 1.5)}" stroke-linejoin="round"/>`;
      case 'rond': { const c = rot(-s * 0.45, 0); return `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${(s * 0.42).toFixed(1)}" fill="${color}"/>`; }
      case 'losange': return `<polygon points="${P(tip, rot(-s * 0.7, -s * 0.42), rot(-s * 1.4, 0), rot(-s * 0.7, s * 0.42))}" fill="#ffffff" stroke="${color}" stroke-width="${width}"/>`;
      case 'barre': return `<polyline points="${P(rot(-s * 0.35, -s * 0.6), rot(-s * 0.35, s * 0.6))}" stroke="${color}" stroke-width="${width + 0.5}" stroke-linecap="round"/>`;
      default: return '';
    }
  }

  const dashArray = (dash, w) => ({ tirets: `${w * 4},${w * 3}`, points: `${w},${w * 2}`, mixte: `${w * 5},${w * 2.5},${w},${w * 2.5}` }[dash] || '');

  // ----- Texte des formes : coupé en lignes pour tenir dans la forme -----

  const measure = document.createElement('canvas').getContext('2d');
  function wrapText(text, n, box) {
    measure.font = `${n.italic ? 'italic ' : ''}${n.bold ? '700 ' : ''}${n.fontSize}px "${n.font}", sans-serif`;
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const test = line + word;
        if (line && measure.measureText(test.trimEnd()).width > box.w) { lines.push(line.trimEnd()); line = word.trimStart(); } else line = test;
      }
      lines.push(line.trimEnd());
    }
    return lines;
  }

  function nodeSvg(n, d) {
    const graph = isGraph(n);
    // (Zone de texte : fond et cadre facultatifs, cadre fin.)
    const txt = n.shape === 'texte';
    const stroke = txt ? n.frame || 'none' : n.stroke || 'none';
    const fill = n.shape === 'acteur' || graph ? 'none' : txt ? n.bg || 'none' : n.fill || 'none';
    const sw = txt ? (n.frame && n.frame !== 'none' ? 1 : 0) : Number(n.strokeWidth) || 0;
    const da = dashArray(n.dash, Math.max(1, sw));
    // Graphe incliné : tourné autour du centre de sa boîte.
    const turn = (graph || txt) && n.angle ? ` transform="rotate(${Number(n.angle)} ${n.x + n.w / 2} ${n.y + n.h / 2})"` : '';
    let out = `<g data-node="${n.id}" opacity="${n.opacity ?? 1}"${turn}>`;
    const area = graph ? areaPath(n) : '';
    if (area) out += `<path class="dg-area" d="${area}" fill="${n.areaColor || n.stroke || '#2e86c1'}" fill-opacity="${n.areaOpacity ?? 0.25}" stroke="none"/>`;
    out += `<path d="${shapePath(n)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${da ? ` stroke-dasharray="${da}"` : ''} stroke-linejoin="round"${graph ? ' stroke-linecap="round"' : ''}${n.shadow ? ' filter="url(#ft-dg-shadow)"' : ''}/>`;
    if (n.shape === 'acteur' || n.shape === 'texte' || graph) out += `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="transparent"/>`;
    if (graph) out += axisLabels(n);
    if (n.text) {
      const box = textBox(n);
      const lines = wrapText(n.text, n, box);
      const lh = n.fontSize * 1.25;
      const total = lines.length * lh;
      const start = n.valign === 'top' ? box.y + 4 : n.valign === 'bottom' ? box.y + box.h - total - 4 : box.y + box.h / 2 - total / 2;
      const top = start + n.fontSize * 0.9;
      const anchorX = n.align === 'left' ? box.x + 4 : n.align === 'right' ? box.x + box.w - 4 : box.x + box.w / 2;
      const ta = n.align === 'left' ? 'start' : n.align === 'right' ? 'end' : 'middle';
      out += `<text x="${anchorX}" y="${top}" text-anchor="${ta}" font-family="${esc(n.font)}, Segoe UI, Arial, sans-serif" font-size="${n.fontSize}" fill="${n.textColor}"${n.bold ? ' font-weight="700"' : ''}${n.italic ? ' font-style="italic"' : ''}>`;
      lines.forEach((t, i) => { out += `<tspan x="${anchorX}" y="${(top + i * lh).toFixed(1)}">${esc(t) || ' '}</tspan>`; });
      out += '</text>';
    }
    return out + '</g>';
  }

  function linkSvg(l, d, bg) {
    const g = linkGeometry(d, l);
    if (!g) return '';
    const w = Number(l.width) || 1.5;
    const da = dashArray(l.dash, w);
    let out = `<g data-link="${l.id}">`;
    out += `<path d="${g.path}" fill="none" stroke="transparent" stroke-width="${w + 12}" class="hit"/>`;
    out += `<path d="${g.path}" fill="none" stroke="${l.color}" stroke-width="${w}"${da ? ` stroke-dasharray="${da}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    out += head(l.end, g.p2, g.endDir, l.color, w) + head(l.start, g.p1, g.startDir, l.color, w);
    if (l.label) {
      const fs = l.fontSize || 12;
      measure.font = `${fs}px "Segoe UI", sans-serif`;
      const lines = String(l.label).split('\n');
      const tw = Math.max(...lines.map((t) => measure.measureText(t).width)) + 8;
      const th = lines.length * fs * 1.25 + 4;
      out += `<rect x="${g.mid[0] - tw / 2}" y="${g.mid[1] - th / 2}" width="${tw}" height="${th}" rx="3" fill="${bg || '#ffffff'}"/>`;
      lines.forEach((t, i) => {
        out += `<text x="${g.mid[0]}" y="${g.mid[1] - th / 2 + 2 + fs * 0.95 + i * fs * 1.25}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="${fs}" fill="${l.color}">${esc(t)}</text>`;
      });
    }
    return out + '</g>';
  }

  const DEFS = '<defs><filter id="ft-dg-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="2" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity="0.22"/></filter></defs>';

  function contentSvg(d) {
    const bg = d.background || '#ffffff';
    return DEFS + d.links.map((l) => linkSvg(l, d, bg)).join('') + d.nodes.map((n) => nodeSvg(n, d)).join('');
  }

  // Boîte qui contient tout le schéma (formes, connecteurs, étiquettes, ombres).
  function bounds(d) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const n of d.nodes) {
      add(n.x, n.y); add(n.x + n.w, n.y + n.h + (n.shadow ? 6 : 0));
      if (n.text && (n.shape === 'acteur')) { add(n.x - 20, n.y + n.h + 6); add(n.x + n.w + 20, n.y + n.h + 6); }
      // Zone de texte inclinée : le cercle autour de sa boîte.
      if (n.shape === 'texte' && n.angle) {
        const r = Math.hypot(n.w, n.h) / 2;
        add(n.x + n.w / 2 - r, n.y + n.h / 2 - r); add(n.x + n.w / 2 + r, n.y + n.h / 2 + r);
      }
      // Graphe : flèches, titres des axes, inclinaison.
      if (isGraph(n)) {
        const m = (Number(n.strokeWidth) || 2) * 4 + 4;
        const r = n.angle ? Math.hypot(n.w, n.h) / 2 : 0;
        const cx = n.x + n.w / 2;
        const cy = n.y + n.h / 2;
        add(Math.min(n.x, cx - r) - m, Math.min(n.y, cy - r) - m);
        add(Math.max(n.x + n.w, cx + r) + m, Math.max(n.y + n.h, cy + r) + m);
        // (Titres des axes : place estimée du texte au-delà de chaque flèche.)
        if (n.shape === 'g-axes') {
          const { ex, ey, dx, dy } = axesGeometry(n);
          const fs = n.fontSize || 13;
          for (const [text, tip, t] of [[n.labelX, ex, dx], [n.labelY, ey, dy]]) {
            if (!text) continue;
            const w = String(text).length * fs * 0.6;
            const x = tip[0] + t[0] * (fs * 0.6 + 4);
            const y = tip[1] + t[1] * (fs * 0.6 + 4);
            const side = Math.abs(t[0]) > Math.abs(t[1]) ? (t[0] > 0 ? [0, w] : [-w, 0]) : [-w / 2, w / 2];
            add(x + side[0], y - fs * 0.7);
            add(x + side[1], y + fs * 0.7);
          }
        }
      }
    }
    for (const l of d.links) {
      const g = linkGeometry(d, l);
      if (!g) continue;
      g.pts.forEach((p) => add(p[0], p[1]));
      if (l.label) { add(g.mid[0] - 60, g.mid[1] - 14); add(g.mid[0] + 60, g.mid[1] + 14); }
    }
    if (x0 === Infinity) return { x: 0, y: 0, w: 200, h: 100 };
    const m = 12;
    return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m };
  }

  // Le dessin final (pour le document) : un SVG autonome, à la taille du schéma.
  function exportSvg(d) {
    const b = bounds(d);
    const bg = d.transparent ? '' : `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${d.background || '#ffffff'}"/>`;
    return `<svg xmlns="${NS}" width="${Math.ceil(b.w)}" height="${Math.ceil(b.h)}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">${bg}${contentSvg(d)}</svg>`;
  }
  const svgDataUrl = (svg) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

  // ----- Fenêtre de dessin -----

  let data = null;          // schéma en cours
  let target = null;        // .ft-image modifiée (null : nouveau schéma)
  let selection = [];       // identifiants sélectionnés (formes et connecteurs)
  let grid = true;
  let view = { x: 0, y: 0, k: 1 };
  let undoStack = [];
  let redoStack = [];
  let clipboard = null;
  let lastStyle = clone(NODE);
  let lastLink = clone(LINK);
  let lastGraph = { stroke: '#2e86c1', strokeWidth: 2.5, dash: '' };
  let savedRange = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'diagram-dialog';
  const icon = (d, extra = '') => `<svg viewBox="0 0 16 16"${extra}><path d="${d}"/></svg>`;
  dialog.innerHTML = `
    <div class="dg-top">
      <h2>Schéma</h2>
      <div class="dg-tools">
        <button type="button" data-act="undo" title="Annuler (Ctrl+Z)">${icon('M5.5 3.5 2.5 6.5l3 3M3 6.5h6.5a4 4 0 0 1 0 8H7')}</button>
        <button type="button" data-act="redo" title="Rétablir (Ctrl+Y)">${icon('M10.5 3.5l3 3-3 3M13 6.5H6.5a4 4 0 0 0 0 8H9')}</button>
        <span class="dg-sep"></span>
        <button type="button" data-act="duplicate" title="Dupliquer (Ctrl+D)">${icon('M5 5h8v8H5zM3 11V3h8')}</button>
        <button type="button" data-act="delete" title="Supprimer (Suppr)">${icon('M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9')}</button>
        <span class="dg-sep"></span>
        <button type="button" data-act="front" title="Mettre au premier plan">${icon('M6 2h8v8H6z M2 6v8h8', ' class="front"')}</button>
        <button type="button" data-act="back" title="Mettre à l'arrière-plan">${icon('M2 6h8v8H2z M6 2h8v8h-4', ' class="back"')}</button>
        <span class="dg-sep"></span>
        <button type="button" data-act="align-left" title="Aligner à gauche">${icon('M2.5 1.5v13M5 4h8M5 7h5M5 10h8M5 13h5')}</button>
        <button type="button" data-act="align-center" title="Centrer horizontalement">${icon('M8 1.5v13M3.5 4h9M5 7h6M3.5 10h9M5 13h6')}</button>
        <button type="button" data-act="align-right" title="Aligner à droite">${icon('M13.5 1.5v13M3 4h8M6 7h5M3 10h8M6 13h5')}</button>
        <button type="button" data-act="align-top" title="Aligner en haut">${icon('M1.5 2.5h13M4 5v8M7 5v5M10 5v8M13 5v5')}</button>
        <button type="button" data-act="align-middle" title="Centrer verticalement">${icon('M1.5 8h13M4 3.5v9M7 5v6M10 3.5v9M13 5v6')}</button>
        <button type="button" data-act="align-bottom" title="Aligner en bas">${icon('M1.5 13.5h13M4 3v8M7 6v5M10 3v8M13 6v5')}</button>
        <button type="button" data-act="spread-h" title="Répartir à espaces égaux (horizontalement)">${icon('M1.5 2v12M14.5 2v12M5 5h2v6H5zM9 5h2v6H9z')}</button>
        <button type="button" data-act="spread-v" title="Répartir à espaces égaux (verticalement)">${icon('M2 1.5h12M2 14.5h12M5 5h6v2H5zM5 9h6v2H5z')}</button>
        <button type="button" data-act="same-size" title="Même taille que la première forme sélectionnée">${icon('M2 4h5v5H2zM9 4h5v5H9zM2 12h12')}</button>
        <span class="dg-sep"></span>
        <button type="button" data-act="group" title="Grouper : les formes sélectionnées se déplacent ensemble">${icon('M1.5 1.5h13v13h-13z M4 4h4v3H4z M8.5 9h3.5v3H8.5z', ' class="dg-ic-group"')}</button>
        <button type="button" data-act="ungroup" title="Dissocier le groupe">${icon('M4 4h4v3H4z M8.5 9h3.5v3H8.5z M1.5 4V1.5H4 M12 1.5h2.5V4 M14.5 12v2.5H12 M4 14.5H1.5V12')}</button>
        <button type="button" data-act="arrange-down" title="Disposer en arbre, de haut en bas (formes sélectionnées, ou tout le schéma)">${icon('M6 1.5h4v3H6z M1.5 11.5h4v3h-4z M10.5 11.5h4v3h-4z M8 4.5v3.5M3.5 11.5V8h9v3.5')}</button>
        <button type="button" data-act="arrange-right" title="Disposer en arbre, de gauche à droite (formes sélectionnées, ou tout le schéma)">${icon('M1.5 6v4h3V6z M11.5 1.5v4h3v-4z M11.5 10.5v4h3v-4z M4.5 8H8M11.5 3.5H8v9h3.5')}</button>
        <span class="dg-sep"></span>
        <button type="button" data-act="grid" title="Grille magnétique : les formes s'alignent sur la grille">${icon('M2 2h12v12H2zM6 2v12M10 2v12M2 6h12M2 10h12')}</button>
        <button type="button" data-act="zoom-out" title="Zoom arrière (Ctrl + molette)">${icon('M3 8h10')}</button>
        <span class="dg-zoom">100 %</span>
        <button type="button" data-act="zoom-in" title="Zoom avant (Ctrl + molette)">${icon('M3 8h10M8 3v10')}</button>
        <button type="button" data-act="fit" title="Voir tout le schéma">${icon('M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4')}</button>
      </div>
      <span class="dg-spacer"></span>
      <button type="button" data-act="maximize" class="dg-max-btn" title="Agrandir la fenêtre à tout l'écran (ou la remettre à sa taille). Le coin en bas à droite de la fenêtre permet aussi de la redimensionner.">${icon('M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4')}</button>
      <button type="button" data-act="cancel">Annuler</button>
      <button type="button" data-act="ok" class="primary">Insérer le schéma</button>
    </div>
    <div class="dg-body">
      <div class="dg-palette">
        <div class="dg-title">Formes</div>
        <div class="dg-shapes"></div>
        <div class="dg-title">Graphes</div>
        <div class="dg-graphs"></div>
        <div class="dg-title">Modèles</div>
        <div class="dg-templates"></div>
        <div class="dg-title">Styles rapides</div>
        <div class="dg-quick"></div>
        <p class="dg-help">Cliquez sur une forme pour l'ajouter, ou glissez-la sur la feuille.<br><br>
        Graphes : axes et courbes à glisser sur la feuille ; forme, réglages, remplissage et trait dans le panneau de droite. Zone de texte : du texte libre, placé où l'on veut.<br><br>
        Pour relier deux formes, glissez un des petits ronds qui apparaissent au survol d'une forme. Lâché dans le vide, il crée une nouvelle forme reliée.<br><br>
        Double-clic : écrire dans une forme ou sur un connecteur.</p>
      </div>
      <div class="dg-canvas-wrap"><svg class="dg-canvas" xmlns="${NS}"><g class="dg-grid-layer"></g><g class="dg-content"></g><g class="dg-overlay"></g></svg><textarea class="dg-edit" hidden spellcheck="true"></textarea></div>
      <div class="dg-props"></div>
    </div>`;
  document.body.append(dialog);

  const $ = (sel) => dialog.querySelector(sel);
  const canvas = $('.dg-canvas');
  const wrap = $('.dg-canvas-wrap');
  const content = $('.dg-content');
  const overlay = $('.dg-overlay');
  const gridLayer = $('.dg-grid-layer');
  const props = $('.dg-props');
  const textEdit = $('.dg-edit');
  const zoomLabel = $('.dg-zoom');

  const nodeById = (id) => data.nodes.find((n) => n.id === id);
  const linkById = (id) => data.links.find((l) => l.id === id);
  const selNodes = () => selection.map(nodeById).filter(Boolean);
  const selLinks = () => selection.map(linkById).filter(Boolean);

  // Icônes de la palette : chaque forme dessinée en petit.
  for (const [shape, name] of SHAPES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = name;
    b.draggable = false;
    const n = { shape, x: 3, y: shape === 'acteur' ? 2 : 7, w: 34, h: shape === 'acteur' ? 30 : 20 };
    b.innerHTML = `<svg viewBox="0 0 40 34"><path d="${shapePath(n)}"${shape === 'texte' ? ' stroke-dasharray="2,2"' : ''}/>${shape === 'texte' ? '<text x="20" y="21" text-anchor="middle" font-size="11" fill="currentColor" stroke="none">Abc</text>' : ''}</svg>`;
    b.addEventListener('pointerdown', (e) => startPaletteDrag(e, shape));
    $('.dg-shapes').append(b);
  }
  for (const [shape, name] of GRAPHS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = name;
    b.draggable = false;
    b.innerHTML = `<svg viewBox="0 0 40 34"><path d="${shapePath({ shape, x: 6, y: 5, w: 28, h: 24, strokeWidth: 1.2 })}"/></svg>`;
    b.addEventListener('pointerdown', (e) => startPaletteDrag(e, shape));
    $('.dg-graphs').append(b);
  }
  // Zone de texte : du texte libre à placer n'importe où (titres, valeurs, annotations d'un graphe).
  {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Zone de texte';
    b.draggable = false;
    b.innerHTML = '<svg viewBox="0 0 40 34"><path d="M5,9H35V25H5Z" stroke-dasharray="2,2"/><text x="20" y="21" text-anchor="middle" font-size="11" fill="currentColor" stroke="none">Abc</text></svg>';
    b.addEventListener('pointerdown', (e) => startPaletteDrag(e, 'texte'));
    $('.dg-graphs').append(b);
  }
  for (const [id, name] of TEMPLATES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.template = id;
    b.textContent = name;
    b.title = 'Ajouter le modèle « ' + name + ' »';
    b.addEventListener('click', () => addTemplate(id));
    $('.dg-templates').append(b);
  }
  for (const [fill, stroke, text] of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = 'Appliquer ce style aux formes sélectionnées';
    b.style.background = fill;
    b.style.borderColor = stroke;
    b.style.color = text;
    b.textContent = 'Abc';
    b.addEventListener('click', () => {
      if (!selNodes().length) return;
      record();
      selNodes().forEach((n) => Object.assign(n, { fill, stroke, textColor: text }));
      Object.assign(lastStyle, { fill, stroke, textColor: text });
      render();
    });
    $('.dg-quick').append(b);
  }

  // ----- Annuler / rétablir dans la fenêtre -----

  let pristine = false;     // nouveau schéma encore tel qu'à l'ouverture
  function record() {
    pristine = false;
    undoStack.push(JSON.stringify(data));
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(data));
    data = JSON.parse(undoStack.pop());
    selection = selection.filter((id) => nodeById(id) || linkById(id));
    render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(data));
    data = JSON.parse(redoStack.pop());
    render();
  }

  // ----- Affichage -----

  function point(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / view.k + view.x, (e.clientY - r.top) / view.k + view.y];
  }

  function applyView() {
    const r = canvas.getBoundingClientRect();
    canvas.setAttribute('viewBox', `${view.x} ${view.y} ${r.width / view.k} ${r.height / view.k}`);
    zoomLabel.textContent = Math.round(view.k * 100) + ' %';
    drawGrid();
  }

  function drawGrid() {
    const r = canvas.getBoundingClientRect();
    const step = GRID * (view.k < 0.6 ? 4 : 2);
    const x0 = Math.floor(view.x / step) * step;
    const y0 = Math.floor(view.y / step) * step;
    const x1 = view.x + r.width / view.k;
    const y1 = view.y + r.height / view.k;
    let d = '';
    for (let x = x0; x <= x1; x += step) d += `M${x},${y0}V${y1}`;
    for (let y = y0; y <= y1; y += step) d += `M${x0},${y}H${x1}`;
    gridLayer.innerHTML = grid ? `<path d="${d}" class="dg-gridline" stroke-width="${1 / view.k}"/>` : '';
  }

  // Sélection seule changée : le dessin reste (sinon un double-clic perdrait sa cible).
  function refreshSelection() {
    drawOverlay();
    renderProps();
  }

  function render() {
    content.innerHTML = contentSvg(data);
    drawOverlay();
    renderProps();
    $('[data-act="grid"]').classList.toggle('on', grid);
    $('[data-act="undo"]').disabled = !undoStack.length;
    $('[data-act="redo"]').disabled = !redoStack.length;
    canvas.style.background = data.background || '#ffffff';
  }

  // Cadres de sélection, poignées de taille, points d'accroche.
  let hoverNode = null;
  function drawOverlay() {
    const k = view.k;
    let out = '';
    for (const n of selNodes()) {
      out += `<rect class="dg-sel" x="${n.x - 3 / k}" y="${n.y - 3 / k}" width="${n.w + 6 / k}" height="${n.h + 6 / k}" stroke-width="${1.2 / k}" stroke-dasharray="${4 / k},${3 / k}"/>`;
    }
    // Groupes sélectionnés : un cadre autour de chacun.
    const groups = new Set(selNodes().filter((n) => n.group).map((n) => n.group));
    for (const g of groups) {
      const members = data.nodes.filter((n) => n.group === g);
      const x0 = Math.min(...members.map((n) => n.x)) - 8 / k;
      const y0 = Math.min(...members.map((n) => n.y)) - 8 / k;
      const x1 = Math.max(...members.map((n) => n.x + n.w)) + 8 / k;
      const y1 = Math.max(...members.map((n) => n.y + n.h)) + 8 / k;
      out += `<rect class="dg-group" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" stroke-width="${1.5 / k}"/>`;
    }
    if (selection.length === 1 && selNodes().length === 1) {
      const n = selNodes()[0];
      const hs = 7 / k;
      for (const [hx, hy, c] of [[0, 0, 'nw'], [0.5, 0, 'n'], [1, 0, 'ne'], [1, 0.5, 'e'], [1, 1, 'se'], [0.5, 1, 's'], [0, 1, 'sw'], [0, 0.5, 'w']]) {
        out += `<rect class="dg-handle" data-handle="${c}" x="${n.x + n.w * hx - hs / 2}" y="${n.y + n.h * hy - hs / 2}" width="${hs}" height="${hs}" stroke-width="${1 / k}"/>`;
      }
    }
    for (const l of selLinks()) {
      const g = linkGeometry(data, l);
      if (g) out += `<path class="dg-sel-link" d="${g.path}" stroke-width="${(Number(l.width) || 1.5) + 5 / k}"/>`;
    }
    if (hoverNode && nodeById(hoverNode) && !dragState) {
      const n = nodeById(hoverNode);
      for (const side of ['n', 'e', 's', 'w']) {
        const p = anchor(n, side);
        out += `<circle class="dg-anchor" data-anchor="${side}" data-node="${n.id}" cx="${p[0]}" cy="${p[1]}" r="${5 / k}" stroke-width="${1.2 / k}"/>`;
      }
    }
    if (dragState && dragState.kind === 'connect') {
      const { from, to, hover } = dragState;
      if (hover) { const hn = nodeById(hover); out += `<rect class="dg-target" x="${hn.x - 4 / k}" y="${hn.y - 4 / k}" width="${hn.w + 8 / k}" height="${hn.h + 8 / k}" stroke-width="${2 / k}"/>`; }
      out += `<path class="dg-temp" d="M${from}L${to}" stroke-width="${1.5 / k}" stroke-dasharray="${5 / k},${4 / k}"/>`;
    }
    if (dragState && dragState.kind === 'band') {
      const [a, b] = [dragState.start, dragState.now];
      out += `<rect class="dg-band" x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(a[0] - b[0])}" height="${Math.abs(a[1] - b[1])}" stroke-width="${1 / k}"/>`;
    }
    overlay.innerHTML = out;
  }

  // ----- Panneau de droite : réglages de la sélection -----

  function field(label, control) {
    const row = document.createElement('label');
    row.className = 'dg-field';
    const span = document.createElement('span');
    span.textContent = label;
    row.append(span, control);
    return row;
  }
  function select(options, value, onChange) {
    const s = document.createElement('select');
    options.forEach(([v, t]) => s.append(new Option(t, v)));
    s.value = value ?? '';
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  function number(value, min, max, step, onChange) {
    const i = document.createElement('input');
    Object.assign(i, { type: 'number', min, max, step, value });
    i.addEventListener('change', () => onChange(Math.max(min, Math.min(max, Number(i.value) || 0))));
    return i;
  }
  // Couleurs : la palette, « aucune » si permis, et une couleur au choix.
  function colors(value, onChange, allowNone) {
    const box = document.createElement('div');
    box.className = 'dg-colors';
    if (allowNone) {
      const none = document.createElement('button');
      none.type = 'button';
      none.className = 'dg-none' + (!value || value === 'none' ? ' on' : '');
      none.title = 'Aucune';
      none.addEventListener('click', () => onChange('none'));
      box.append(none);
    }
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c;
      b.title = c;
      if ((value || '').toLowerCase() === c) b.classList.add('on');
      b.addEventListener('click', () => { window.FTCouleurs.add(c); onChange(c); });
      box.append(b);
    }
    // (Les 6 dernières couleurs choisies, sur toute la largeur.)
    box.append(window.FTCouleurs.row(onChange, { title: '' }));
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.title = 'Autre couleur';
    custom.value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#888888';
    custom.addEventListener('change', () => onChange(custom.value));
    box.append(custom);
    return box;
  }
  function toggles(items) {
    const box = document.createElement('div');
    box.className = 'dg-toggles';
    for (const [html, title, on, action] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = html;
      b.title = title;
      if (on) b.classList.add('on');
      b.addEventListener('click', action);
      box.append(b);
    }
    return box;
  }
  const section = (title) => { const h = document.createElement('div'); h.className = 'dg-title'; h.textContent = title; return h; };

  // Modifie toutes les formes (ou tous les connecteurs) sélectionnés, et retient le réglage pour les suivants.
  const setNodes = (key) => (v) => {
    record();
    selNodes().forEach((n) => { n[key] = v; });
    // (Couleur, épaisseur et trait d'un graphe : retenus pour les graphes suivants.)
    if (selNodes().every(isGraph)) { if (['stroke', 'strokeWidth', 'dash'].includes(key)) lastGraph[key] = v; } else lastStyle[key] = v;
    render();
  };
  // Graphes : retourner, ou tourner d'un quart de tour (la boîte tourne autour de son centre).
  function flipGraphs(key) {
    record();
    selNodes().filter(isGraph).forEach((n) => { n[key] = !n[key]; });
    render();
  }
  function turnGraphs() {
    record();
    for (const n of selNodes().filter(isGraph)) {
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      [n.w, n.h] = [n.h, n.w];
      n.x = snap(cx - n.w / 2);
      n.y = snap(cy - n.h / 2);
      n.turn = ((n.turn || 0) + 1) & 3;
    }
    render();
  }
  function graphProps(ns) {
    const n = ns[0];
    props.append(section(ns.length > 1 ? `${ns.length} graphes` : 'Graphe'));
    props.append(field('Forme', select(GRAPHS, n.shape, setNodes('shape'))));
    props.append(section('Couleur'), colors(n.stroke, setNodes('stroke'), false));
    props.append(field('Épaisseur', number(n.strokeWidth, 0.5, 12, 0.5, setNodes('strokeWidth'))));
    props.append(field('Trait', select(DASHES, n.dash, setNodes('dash'))));
    props.append(field('Opacité', select([[1, '100 %'], [0.85, '85 %'], [0.7, '70 %'], [0.5, '50 %'], [0.3, '30 %']], n.opacity ?? 1, (v) => setNodes('opacity')(Number(v)))));
    props.append(section('Orientation'));
    props.append(toggles([
      [icon('M8 1.5v13M6 4 2 8l4 4zM10 4l4 4-4 4z'), 'Retourner horizontalement', !!n.flipH, () => flipGraphs('flipH')],
      [icon('M1.5 8h13M4 6 8 2l4 4zM4 10l4 4 4-4z'), 'Retourner verticalement', !!n.flipV, () => flipGraphs('flipV')],
      [icon('M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3'), "Tourner d'un quart de tour", false, turnGraphs]
    ]));
    props.append(field('Inclinaison (°)', number(n.angle || 0, -180, 180, 5, setNodes('angle'))));
    // Nombre de dents, de marches ou de cycles (graphes de la même sorte).
    const rep = REPEATS[n.shape];
    if (rep && ns.every((x) => REPEATS[x.shape] && REPEATS[x.shape][0] === rep[0])) {
      props.append(field(rep[0], number(repeats(n), 1, 40, 1, setNodes('count'))));
    }
    // Réglages propres à la courbe (graphes de la même forme).
    const same = ns.every((x) => x.shape === n.shape);
    if (same && PARAMS[n.shape]) for (const [key, label, min, max, step] of PARAMS[n.shape]) props.append(field(label, number(param(n, key), min, max, step, setNodes(key))));
    if (same && OPTIONS[n.shape]) props.append(toggles(OPTIONS[n.shape].map(([key, label, title]) => [label, title, option(n, key), () => setNodes(key)(!option(n, key))])));
    if (ns.every((x) => !NO_AREA.has(x.shape))) {
      props.append(section('Remplissage'));
      props.append(toggles([['Remplir sous la courbe', 'Colorer la zone entre la courbe et le bas du graphe', !!n.area, () => setNodes('area')(!n.area)]]));
      if (n.area) {
        props.append(colors(n.areaColor || n.stroke, setNodes('areaColor'), false));
        props.append(field('Opacité du remplissage', select([[0.1, '10 %'], [0.25, '25 %'], [0.4, '40 %'], [0.6, '60 %'], [1, '100 %']], n.areaOpacity ?? 0.25, (v) => setNodes('areaOpacity')(Number(v)))));
        props.append(field('Zone : début (%)', number(Number(n.areaFrom) || 0, 0, 100, 1, setNodes('areaFrom'))));
        props.append(field('Zone : fin (%)', number(n.areaTo == null ? 100 : Number(n.areaTo), 0, 100, 1, setNodes('areaTo'))));
      }
    }
    if (ns.every((x) => x.shape === 'g-axes')) {
      props.append(section('Axes'));
      props.append(toggles([['Flèches', 'Une flèche au bout de chaque axe', n.arrows !== false, () => setNodes('arrows')(n.arrows === false)]]));
      props.append(field('Graduations', number(n.ticks || 0, 0, 20, 1, setNodes('ticks'))));
      const label = (key, ph) => {
        const t = document.createElement('input');
        t.type = 'text';
        t.value = n[key] || '';
        t.placeholder = ph;
        t.addEventListener('change', () => setNodes(key)(t.value));
        return t;
      };
      props.append(field('Titre X', label('labelX', 'Par exemple : Temps')));
      props.append(field('Titre Y', label('labelY', 'Par exemple : Valeur')));
      props.append(field('Taille du texte', number(n.fontSize || 13, 6, 48, 1, setNodes('fontSize'))));
    }
    if (ns.length === 1) {
      props.append(section('Position et taille'));
      const grid2 = document.createElement('div');
      grid2.className = 'dg-pos';
      const pos = (key, min) => number(Math.round(n[key]), min, 5000, 1, (v) => { record(); n[key] = v; render(); });
      grid2.append(field('X', pos('x', -5000)), field('Y', pos('y', -5000)), field('Largeur', pos('w', 10)), field('Hauteur', pos('h', 10)));
      props.append(grid2);
    }
  }
  const setLinks = (key) => (v) => { record(); selLinks().forEach((l) => { l[key] = v; }); if (key !== 'label') lastLink[key] = v; render(); };

  function renderProps() {
    props.replaceChildren();
    const ns = selNodes();
    const ls = selLinks();
    if (ns.length && ns.every(isGraph)) graphProps(ns);
    else if (ns.length) {
      const n = ns[0];
      props.append(section(ns.length > 1 ? `${ns.length} formes` : 'Forme'));
      if (ns.length > 1 || ns.some((x) => x.group)) {
        const grouped = ns.length > 1 && ns.every((x) => x.group && x.group === ns[0].group);
        props.append(toggles([
          ['Grouper', 'Les formes sélectionnées se déplacent ensemble', grouped, groupSelection],
          ['Dissocier', 'Les formes du groupe redeviennent indépendantes', false, ungroupSelection]
        ]));
      }
      const texts = ns.every((x) => x.shape === 'texte');
      if (texts) props.firstChild.textContent = ns.length > 1 ? `${ns.length} zones de texte` : 'Zone de texte';
      props.append(field('Forme', select(SHAPES, n.shape, setNodes('shape'))));
      if (texts) {
        props.append(section('Fond'), colors(n.bg, setNodes('bg'), true));
        props.append(section('Cadre'), colors(n.frame, setNodes('frame'), true));
        props.append(field('Inclinaison (°)', number(n.angle || 0, -180, 180, 5, setNodes('angle'))));
      } else {
        props.append(section('Remplissage'), colors(n.fill, setNodes('fill'), true));
        props.append(section('Contour'), colors(n.stroke, setNodes('stroke'), true));
        props.append(field('Épaisseur', number(n.strokeWidth, 0, 12, 0.5, setNodes('strokeWidth'))));
        props.append(field('Trait', select(DASHES, n.dash, setNodes('dash'))));
      }
      props.append(field('Opacité', select([[1, '100 %'], [0.85, '85 %'], [0.7, '70 %'], [0.5, '50 %'], [0.3, '30 %']], n.opacity ?? 1, (v) => setNodes('opacity')(Number(v)))));
      if (!texts) props.append(toggles([['Ombre', 'Une ombre douce sous la forme', n.shadow, () => setNodes('shadow')(!n.shadow)]]));
      props.append(section('Texte'));
      props.append(field('Police', select(FONTS.map((f) => [f, f]), n.font, setNodes('font'))));
      props.append(field('Taille', number(n.fontSize, 6, 72, 1, setNodes('fontSize'))));
      props.append(toggles([
        ['<b>G</b>', 'Gras', n.bold, () => setNodes('bold')(!n.bold)],
        ['<i>I</i>', 'Italique', n.italic, () => setNodes('italic')(!n.italic)],
        [icon('M2 3h12M2 6.3h8M2 9.6h12M2 13h8'), 'Aligner à gauche', n.align === 'left', () => setNodes('align')('left')],
        [icon('M2 3h12M4 6.3h8M2 9.6h12M4 13h8'), 'Centrer', n.align === 'center', () => setNodes('align')('center')],
        [icon('M2 3h12M6 6.3h8M2 9.6h12M6 13h8'), 'Aligner à droite', n.align === 'right', () => setNodes('align')('right')]
      ]));
      props.append(field('Position du texte', select(VALIGNS, n.valign || 'middle', setNodes('valign'))));
      props.append(section('Couleur du texte'), colors(n.textColor, setNodes('textColor'), false));
      if (ns.length === 1) {
        props.append(section('Position et taille'));
        const grid2 = document.createElement('div');
        grid2.className = 'dg-pos';
        const pos = (key, min) => number(Math.round(n[key]), min, 5000, 1, (v) => { record(); n[key] = v; render(); });
        grid2.append(field('X', pos('x', -5000)), field('Y', pos('y', -5000)), field('Largeur', pos('w', 10)), field('Hauteur', pos('h', 10)));
        props.append(grid2);
      }
    }
    if (ls.length) {
      const l = ls[0];
      props.append(section(ls.length > 1 ? `${ls.length} connecteurs` : 'Connecteur'));
      props.append(field('Tracé', select(ROUTES, l.route, setLinks('route'))));
      props.append(section('Couleur'), colors(l.color, setLinks('color'), false));
      props.append(field('Épaisseur', number(l.width, 0.5, 10, 0.5, setLinks('width'))));
      props.append(field('Trait', select(DASHES, l.dash, setLinks('dash'))));
      props.append(field('Début', select(ARROWS, l.start, setLinks('start'))));
      props.append(field('Fin', select(ARROWS, l.end, setLinks('end'))));
      props.append(toggles([['⇄ Inverser', 'Échanger le début et la fin', false, () => {
        record();
        selLinks().forEach((x) => { [x.from, x.to] = [x.to, x.from]; });
        render();
      }]]));
      props.append(field('Taille du texte', number(l.fontSize || 12, 6, 48, 1, setLinks('fontSize'))));
      const t = document.createElement('input');
      t.type = 'text';
      t.value = l.label || '';
      t.placeholder = 'Texte sur le connecteur';
      t.addEventListener('change', () => setLinks('label')(t.value));
      props.append(field('Texte', t));
    }
    if (!ns.length && !ls.length) {
      props.append(section('Schéma'));
      props.append(field('Fond', select([['#ffffff', 'Blanc'], ['#fbf9f5', 'Crème'], ['#f2f4f7', 'Gris clair'], ['transparent', 'Transparent']], data.transparent ? 'transparent' : (data.background || '#ffffff'), (v) => {
        record();
        data.transparent = v === 'transparent';
        data.background = v === 'transparent' ? '#ffffff' : v;
        render();
      })));
      const p = document.createElement('p');
      p.className = 'dg-help';
      p.innerHTML = 'Sélectionnez une forme ou un connecteur pour changer son apparence.<br><br>Maj+clic ou un cadre tracé à la souris : plusieurs éléments à la fois.<br>Flèches du clavier : déplacer finement.<br>Molette : se déplacer ; Ctrl+molette : zoom.';
      props.append(p);
    }
  }

  // ----- Ajout, suppression, copie -----

  function addNode(shape, x, y) {
    record();
    const base = clone(lastStyle);
    const n = { ...base, id: newId('n'), shape, text: shape === 'texte' ? 'Texte' : '' };
    if (shape === 'ellipse' || shape === 'losange' || shape === 'etoile' || shape === 'hexagone') { n.w = 120; n.h = 80; }
    if (shape === 'triangle') { n.w = 100; n.h = 80; }
    if (shape === 'cylindre') { n.w = 100; n.h = 90; }
    if (shape === 'acteur') { n.w = 50; n.h = 80; }
    if (shape === 'note') { n.w = 140; n.h = 90; n.fill = '#fcf3cf'; n.stroke = '#d4ac0d'; n.textColor = '#7d6608'; }
    if (shape === 'texte') { n.w = 120; n.h = 30; n.textColor = '#262626'; }
    const size = { cercle: [90, 90], pilule: [140, 50], retard: [120, 60], pentagone: [110, 100], octogone: [100, 100], croix: [80, 80], bulle: [150, 80], cadre: [320, 200] }[shape];
    if (size) [n.w, n.h] = size;
    // Cadre : sous les autres formes, titre en gras en haut à gauche.
    if (shape === 'cadre') Object.assign(n, { fill: '#f7f8fa', bold: true, align: 'left', text: 'Titre', shadow: false });
    // Graphe : un trait seul (couleur, épaisseur et trait du dernier graphe) ; axes plus grands, en gris foncé.
    if (/^g-/.test(shape)) Object.assign(n, { fill: 'none', shadow: false, ...lastGraph, w: 200, h: 120 });
    if (shape === 'g-nuage') n.strokeWidth = Math.max(5, Number(n.strokeWidth) || 0);
    if (shape === 'g-histogramme') Object.assign(n, { area: true, areaOpacity: 0.25 });
    if (shape === 'g-axes') Object.assign(n, { stroke: '#404040', strokeWidth: 1.5, dash: '', w: 280, h: 200, arrows: true, ticks: 0, labelX: '', labelY: '', fontSize: 13 });
    n.x = snap(x - n.w / 2);
    n.y = snap(y - n.h / 2);
    // (Cadre et axes : sous les autres formes.)
    if (shape === 'cadre' || shape === 'g-axes') data.nodes.unshift(n); else data.nodes.push(n);
    selection = [n.id];
    render();
    return n;
  }

  function addAtCenter(shape) {
    const r = canvas.getBoundingClientRect();
    let x = view.x + r.width / view.k / 2;
    let y = view.y + r.height / view.k / 2;
    // Pas exactement par-dessus une forme déjà là.
    while (data.nodes.some((n) => Math.abs(n.x + n.w / 2 - x) < 20 && Math.abs(n.y + n.h / 2 - y) < 20)) { x += 30; y += 30; }
    return addNode(shape, x, y);
  }

  function removeSelection() {
    if (!selection.length) return;
    record();
    const gone = new Set(selection);
    data.nodes = data.nodes.filter((n) => !gone.has(n.id));
    data.links = data.links.filter((l) => !gone.has(l.id) && !gone.has(l.from.node) && !gone.has(l.to.node));
    selection = [];
    render();
  }

  function copy() {
    const ids = new Set(selection);
    const nodes = data.nodes.filter((n) => ids.has(n.id));
    const keep = new Set(nodes.map((n) => n.id));
    const links = data.links.filter((l) => keep.has(l.from.node) && keep.has(l.to.node));
    clipboard = nodes.length ? clone({ nodes, links }) : null;
  }

  function paste(offset = 20) {
    if (!clipboard) return;
    record();
    const map = new Map();
    const groups = new Map();
    const nodes = clipboard.nodes.map((n) => {
      const c = { ...clone(n), id: newId('n'), x: n.x + offset, y: n.y + offset };
      if (n.group) { if (!groups.has(n.group)) groups.set(n.group, newId('g')); c.group = groups.get(n.group); }
      map.set(n.id, c.id);
      return c;
    });
    const links = clipboard.links.map((l) => ({ ...clone(l), id: newId('l'), from: { ...l.from, node: map.get(l.from.node) }, to: { ...l.to, node: map.get(l.to.node) } }));
    data.nodes.push(...nodes);
    data.links.push(...links);
    selection = nodes.map((n) => n.id);
    clipboard = clone({ nodes, links });
    render();
  }

  function duplicate() { copy(); paste(20); }

  function reorder(front) {
    const ids = new Set(selection);
    if (!ids.size) return;
    record();
    const sel = data.nodes.filter((n) => ids.has(n.id));
    const rest = data.nodes.filter((n) => !ids.has(n.id));
    data.nodes = front ? [...rest, ...sel] : [...sel, ...rest];
    render();
  }

  function align(how) {
    const ns = selNodes();
    if (ns.length < 2 && !how.startsWith('spread')) return;
    record();
    const x0 = Math.min(...ns.map((n) => n.x));
    const x1 = Math.max(...ns.map((n) => n.x + n.w));
    const y0 = Math.min(...ns.map((n) => n.y));
    const y1 = Math.max(...ns.map((n) => n.y + n.h));
    for (const n of ns) {
      if (how === 'align-left') n.x = x0;
      if (how === 'align-right') n.x = x1 - n.w;
      if (how === 'align-center') n.x = Math.round((x0 + x1) / 2 - n.w / 2);
      if (how === 'align-top') n.y = y0;
      if (how === 'align-bottom') n.y = y1 - n.h;
      if (how === 'align-middle') n.y = Math.round((y0 + y1) / 2 - n.h / 2);
    }
    if (how === 'spread-h' && ns.length > 2) {
      const sorted = [...ns].sort((a, b) => a.x - b.x);
      const gap = (x1 - x0 - sorted.reduce((s, n) => s + n.w, 0)) / (sorted.length - 1);
      let x = x0;
      for (const n of sorted) { n.x = Math.round(x); x += n.w + gap; }
    }
    if (how === 'spread-v' && ns.length > 2) {
      const sorted = [...ns].sort((a, b) => a.y - b.y);
      const gap = (y1 - y0 - sorted.reduce((s, n) => s + n.h, 0)) / (sorted.length - 1);
      let y = y0;
      for (const n of sorted) { n.y = Math.round(y); y += n.h + gap; }
    }
    if (how === 'same-size') ns.slice(1).forEach((n) => { n.w = ns[0].w; n.h = ns[0].h; });
    render();
  }

  // ----- Groupes -----
  // Les formes d'un groupe se sélectionnent et se déplacent ensemble (n.group : identifiant du groupe).

  function withGroups(ids) {
    const groups = new Set(ids.map(nodeById).filter((n) => n && n.group).map((n) => n.group));
    if (!groups.size) return ids;
    return [...new Set([...ids, ...data.nodes.filter((n) => groups.has(n.group)).map((n) => n.id)])];
  }

  function groupSelection() {
    const ns = selNodes();
    if (ns.length < 2) return;
    record();
    const g = newId('g');
    ns.forEach((n) => { n.group = g; });
    render();
  }

  function ungroupSelection() {
    const ns = selNodes().filter((n) => n.group);
    if (!ns.length) return;
    record();
    ns.forEach((n) => { delete n.group; });
    render();
  }

  // ----- Disposition automatique -----
  // Les formes sélectionnées (ou toutes) sont rangées en arbre selon leurs connecteurs : chaque forme
  // sous (ou à droite de) celle qui la précède, les formes sœurs côte à côte, le parent centré.

  function arrange(dir) {
    let ns = selNodes();
    if (ns.length < 2) ns = data.nodes.filter((n) => n.shape !== 'cadre' && !isGraph(n));
    if (ns.length < 2) return;
    record();
    const ids = new Set(ns.map((n) => n.id));
    const links = data.links.filter((l) => ids.has(l.from.node) && ids.has(l.to.node) && l.from.node !== l.to.node);
    const down = dir !== 'right';
    // Taille d'une forme dans le sens des niveaux (main) et dans le sens des sœurs (cross).
    const main = (n) => (down ? n.h : n.w);
    const cross = (n) => (down ? n.w : n.h);
    const GAP_LEVEL = 60;
    const GAP_SIB = 30;
    const children = new Map(ns.map((n) => [n.id, []]));
    const hasParent = new Set();
    const seen = new Set();
    const order = [...ns].sort((a, b) => (down ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y));
    const roots = order.filter((n) => !links.some((l) => l.to.node === n.id));
    if (!roots.length) roots.push(order[0]);
    // Arbre couvrant, en largeur depuis les racines.
    const queue = [];
    for (const r of roots) { seen.add(r.id); queue.push(r.id); }
    while (queue.length) {
      const id = queue.shift();
      for (const l of links) {
        if (l.from.node !== id || seen.has(l.to.node)) continue;
        seen.add(l.to.node);
        hasParent.add(l.to.node);
        children.get(id).push(l.to.node);
        queue.push(l.to.node);
      }
      if (!queue.length) {
        const rest = order.find((n) => !seen.has(n.id));
        if (rest) { seen.add(rest.id); roots.push(rest); queue.push(rest.id); }
      }
    }
    // Hauteur de chaque niveau.
    const level = new Map();
    const levelSize = [];
    const setLevel = (id, d) => {
      level.set(id, d);
      levelSize[d] = Math.max(levelSize[d] || 0, main(nodeById(id)));
      children.get(id).forEach((c) => setLevel(c, d + 1));
    };
    roots.forEach((r) => setLevel(r.id, 0));
    // Largeur occupée par chaque sous-arbre.
    const span = new Map();
    const measureSpan = (id) => {
      const kids = children.get(id);
      const own = cross(nodeById(id));
      const sum = kids.reduce((t, c) => t + measureSpan(c), 0) + GAP_SIB * Math.max(0, kids.length - 1);
      span.set(id, Math.max(own, sum));
      return span.get(id);
    };
    roots.forEach((r) => measureSpan(r.id));
    const x0 = Math.min(...ns.map((n) => n.x));
    const y0 = Math.min(...ns.map((n) => n.y));
    const levelStart = [];
    levelSize.reduce((t, sz, i) => { levelStart[i] = t; return t + sz + GAP_LEVEL; }, down ? y0 : x0);
    const place = (id, from) => {
      const n = nodeById(id);
      const sp = span.get(id);
      const c = from + sp / 2 - cross(n) / 2;
      const m = levelStart[level.get(id)] + (levelSize[level.get(id)] - main(n)) / 2;
      if (down) { n.x = snap(c); n.y = snap(m); } else { n.x = snap(m); n.y = snap(c); }
      const kids = children.get(id);
      const sum = kids.reduce((t, k) => t + span.get(k), 0) + GAP_SIB * Math.max(0, kids.length - 1);
      let at = from + (sp - sum) / 2;
      for (const k of kids) { place(k, at); at += span.get(k) + GAP_SIB; }
    };
    let at = down ? x0 : y0;
    for (const r of roots) { place(r.id, at); at += span.get(r.id) + GAP_SIB * 2; }
    // Connecteurs de l'arbre : du bas du parent au haut de l'enfant (ou de droite à gauche).
    for (const l of links) {
      if (children.get(l.from.node).includes(l.to.node)) { l.from.side = down ? 's' : 'e'; l.to.side = down ? 'n' : 'w'; }
    }
    render();
  }

  // ----- Modèles de schémas -----

  // Formes et connecteurs d'un modèle, au style des prochaines formes ; coordonnées autour de (0, 0).
  function templateData(id) {
    const nodes = [];
    const links = [];
    const colorsAt = (i) => PALETTE_STYLES[i % PALETTE_STYLES.length];
    const N = (shape, x, y, w, h, text, extra = {}) => {
      const n = { ...clone(lastStyle), id: newId('n'), shape, x, y, w, h, text, ...extra };
      delete n.group;
      if (!('valign' in extra)) delete n.valign;
      if (!('inset' in extra)) delete n.inset;
      nodes.push(n);
      return n;
    };
    const L = (a, b, extra = {}) => { const l = { ...clone(lastLink), id: newId('l'), from: { node: a.id }, to: { node: b.id }, label: '', ...extra }; links.push(l); return l; };
    const tinted = (i) => { const [fill, stroke, textColor] = colorsAt(i); return { fill, stroke, textColor }; };
    switch (id) {
      case 'organigramme': {
        const top = N('arrondi', 0, 0, 160, 56, 'Direction', { bold: true });
        const heads = ['Service A', 'Service B', 'Service C'].map((t) => N('arrondi', 0, 0, 140, 50, t));
        heads.forEach((h) => L(top, h, { route: 'coude', end: '' }));
        ['Équipe 1', 'Équipe 2'].forEach((t) => L(heads[0], N('rect', 0, 0, 120, 44, t), { route: 'coude', end: '' }));
        L(heads[2], N('rect', 0, 0, 120, 44, 'Équipe 3'), { route: 'coude', end: '' });
        return { nodes, links, arrange: 'down' };
      }
      case 'processus': {
        ['Étape 1', 'Étape 2', 'Étape 3', 'Étape 4'].forEach((t, i) => N('chevron', i * 150, 0, 160, 64, t, tinted(i)));
        return { nodes, links };
      }
      case 'cycle': {
        const labels = ['Planifier', 'Réaliser', 'Vérifier', 'Améliorer'];
        const R = 140;
        const ns = labels.map((t, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
          return N('cercle', Math.round(Math.cos(a) * R - 50), Math.round(Math.sin(a) * R - 50), 100, 100, t, tinted(i));
        });
        // Chaque flèche part sur le côté et arrive par le haut ou le bas : la boucle tourne.
        const SIDES = [['e', 'n'], ['s', 'e'], ['w', 's'], ['n', 'w']];
        ns.forEach((n, i) => {
          const m = ns[(i + 1) % ns.length];
          L(n, m, { route: 'courbe', from: { node: n.id, side: SIDES[i][0] }, to: { node: m.id, side: SIDES[i][1] } });
        });
        return { nodes, links };
      }
      case 'pyramide': {
        // Pente régulière : chaque étage dépasse celui du dessus de K de chaque côté.
        const labels = ['Sommet', 'Niveau 2', 'Niveau 3', 'Base'];
        const H = 64;
        const K = 60;
        labels.forEach((t, i) => {
          const w = 2 * K * (i + 1);
          if (i === 0) N('triangle', -w / 2, 0, w, H, t, tinted(i));
          else N('trapeze', -w / 2, i * H, w, H, t, { ...tinted(i), inset: K });
        });
        return { nodes, links };
      }
      case 'venn': {
        const op = { opacity: 0.7, strokeWidth: 1.5 };
        N('cercle', -170, -110, 200, 200, 'A', { ...tinted(0), ...op, align: 'left', bold: true });
        N('cercle', -30, -110, 200, 200, 'B', { ...tinted(1), ...op, align: 'right', bold: true });
        N('cercle', -100, 10, 200, 200, 'C', { ...tinted(2), ...op, valign: 'bottom', bold: true });
        return { nodes, links };
      }
      case 'chronologie': {
        const dates = ['2020', '2021', '2022', '2023', '2024'];
        N('fleche', -40, -8, dates.length * 150 + 60, 16, '', { fill: lastStyle.stroke, stroke: lastStyle.stroke });
        dates.forEach((d, i) => {
          const x = i * 150;
          const dot = N('cercle', x, -12, 24, 24, '', { fill: '#ffffff' });
          const up = i % 2 === 0;
          const ev = N('arrondi', x - 48, up ? -110 : 50, 120, 56, `${d}\nÉvénement`, tinted(i));
          L(up ? ev : dot, up ? dot : ev, { route: 'droit', end: '', dash: 'points', from: { node: (up ? ev : dot).id, side: 's' }, to: { node: (up ? dot : ev).id, side: 'n' } });
        });
        return { nodes, links };
      }
      case 'decision': {
        const start = N('pilule', -70, 0, 140, 50, 'Début', tinted(1));
        const step = N('rect', -80, 100, 160, 60, 'Action');
        const test = N('losange', -80, 210, 160, 100, 'Condition ?');
        const yes = N('rect', -260, 360, 160, 60, 'Cas favorable');
        const no = N('rect', 100, 360, 160, 60, 'Cas contraire');
        const end = N('pilule', -70, 480, 140, 50, 'Fin', tinted(3));
        L(start, step, { from: { node: start.id, side: 's' }, to: { node: step.id, side: 'n' } });
        L(step, test, { from: { node: step.id, side: 's' }, to: { node: test.id, side: 'n' } });
        L(test, yes, { label: 'Oui', from: { node: test.id, side: 'w' }, to: { node: yes.id, side: 'n' } });
        L(test, no, { label: 'Non', from: { node: test.id, side: 'e' }, to: { node: no.id, side: 'n' } });
        L(yes, end, { from: { node: yes.id, side: 's' }, to: { node: end.id, side: 'w' } });
        L(no, end, { from: { node: no.id, side: 's' }, to: { node: end.id, side: 'e' } });
        return { nodes, links };
      }
      case 'carte': {
        const center = N('ellipse', -90, -45, 180, 90, 'Sujet', { bold: true, fontSize: 16 });
        const labels = ['Idée 1', 'Idée 2', 'Idée 3', 'Idée 4', 'Idée 5', 'Idée 6'];
        labels.forEach((t, i) => {
          const a = -Math.PI / 2 + Math.PI / 6 + (i * 2 * Math.PI) / labels.length;
          const b = N('arrondi', Math.round(Math.cos(a) * 250 - 60), Math.round(Math.sin(a) * 150 - 22), 120, 44, t, tinted(i));
          L(center, b, { route: 'courbe', end: '', color: b.stroke, width: 2 });
        });
        return { nodes, links };
      }
      case 'matrice': {
        const labels = ['Forces', 'Faiblesses', 'Opportunités', 'Menaces'];
        labels.forEach((t, i) => N('rect', (i % 2) * 200, Math.floor(i / 2) * 140, 200, 140, t, { ...tinted(i), bold: true, valign: 'top' }));
        N('texte', 0, -36, 200, 30, 'Interne', { textColor: '#262626', italic: true });
        N('texte', 200, -36, 200, 30, 'Externe', { textColor: '#262626', italic: true });
        return { nodes, links };
      }
      case 'entonnoir': {
        const labels = ['Visiteurs', 'Contacts', 'Prospects', 'Clients'];
        const H = 56;
        labels.forEach((t, i) => {
          const w = 420 - i * 80;
          N('trapeze', -w / 2, i * H, w, H, t, { ...tinted(i), inset: 40, flip: true });
        });
        return { nodes, links };
      }
      default: return { nodes, links };
    }
  }

  function addTemplate(id) {
    finishText();
    const t = templateData(id);
    if (!t.nodes.length) return;
    // Nouveau schéma pas encore modifié : le modèle remplace le départ ; sinon il s'ajoute à droite.
    const fresh = pristine;
    record();
    if (fresh) { data.nodes = []; data.links = []; }
    data.nodes.push(...t.nodes.filter((n) => n.shape === 'cadre'), ...t.nodes.filter((n) => n.shape !== 'cadre'));
    data.links.push(...t.links);
    selection = t.nodes.map((n) => n.id);
    if (t.arrange) arrangeQuiet(t.arrange);
    // Placé à droite de ce qui existe déjà.
    const others = data.nodes.filter((n) => !selection.includes(n.id));
    if (others.length) {
      const b = bounds({ nodes: others, links: [] });
      const mine = bounds({ nodes: t.nodes, links: [] });
      const dx = snap(b.x + b.w + 60 - mine.x);
      const dy = snap(b.y - mine.y);
      t.nodes.forEach((n) => { n.x += dx; n.y += dy; });
    }
    render();
    fit();
  }
  // Disposition sans nouvelle étape d'annulation (celle du modèle suffit).
  function arrangeQuiet(dir) {
    const keep = undoStack.length;
    arrange(dir);
    undoStack.length = keep;
  }

  function zoom(factor, cx, cy) {
    const r = canvas.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2;
    const py = cy ?? r.top + r.height / 2;
    const before = [(px - r.left) / view.k + view.x, (py - r.top) / view.k + view.y];
    view.k = Math.max(0.25, Math.min(4, view.k * factor));
    view.x = before[0] - (px - r.left) / view.k;
    view.y = before[1] - (py - r.top) / view.k;
    applyView();
    drawOverlay();
  }

  function fit() {
    const r = canvas.getBoundingClientRect();
    if (!data.nodes.length) { view = { x: -r.width / 2, y: -r.height / 2, k: 1 }; applyView(); return; }
    const b = bounds(data);
    view.k = Math.max(0.25, Math.min(1.5, Math.min(r.width / (b.w + 80), r.height / (b.h + 80))));
    view.x = b.x + b.w / 2 - r.width / view.k / 2;
    view.y = b.y + b.h / 2 - r.height / view.k / 2;
    applyView();
    drawOverlay();
  }

  // ----- Souris -----

  let dragState = null;

  const hitNode = (el) => { const g = el && el.closest && el.closest('[data-node]'); return g && content.contains(g) ? g.dataset.node : null; };
  const hitLink = (el) => { const g = el && el.closest && el.closest('[data-link]'); return g ? g.dataset.link : null; };
  const nodeAtPoint = (p, skip) => [...data.nodes].reverse().find((n) => n.id !== skip && p[0] >= n.x && p[0] <= n.x + n.w && p[1] >= n.y && p[1] <= n.y + n.h);

  function startPaletteDrag(e, shape) {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ghost = null;
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) {
        ghost = e.currentTarget.cloneNode(true);
        ghost.className = 'dg-ghost';
        document.body.append(ghost);
      }
      if (ghost) Object.assign(ghost.style, { left: ev.clientX - 20 + 'px', top: ev.clientY - 17 + 'px' });
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      // (Zone de texte : on écrit tout de suite.)
      const write = (n) => { if (n && shape === 'texte' && e.target.closest('.dg-graphs')) editText(n); };
      if (!ghost) { write(addAtCenter(shape)); return; }
      ghost.remove();
      const r = canvas.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) write(addNode(shape, ...point(ev)));
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!textEdit.hidden) finishText();
    if (e.button === 1) { startPan(e); return; }
    if (e.button !== 0) return;
    // (Sélection de texte du navigateur laissée par un double-clic ou un glissé : le texte d'autres
    // formes resterait surligné.)
    const ds = window.getSelection();
    if (ds.rangeCount && canvas.contains(ds.anchorNode)) ds.removeAllRanges();
    const p = point(e);
    const t = e.target;
    // Point d'accroche : on tire un connecteur.
    if (t.dataset && t.dataset.anchor) {
      const n = nodeById(t.dataset.node);
      dragState = { kind: 'connect', node: n.id, side: t.dataset.anchor, from: anchor(n, t.dataset.anchor), to: p, hover: null };
      canvas.setPointerCapture(e.pointerId);
      drawOverlay();
      return;
    }
    // Poignée de taille.
    if (t.dataset && t.dataset.handle) {
      const n = selNodes()[0];
      record();
      dragState = { kind: 'resize', handle: t.dataset.handle, node: n.id, start: p, orig: { x: n.x, y: n.y, w: n.w, h: n.h } };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const nid = hitNode(t);
    const lid = nid ? null : hitLink(t);
    const id = nid || lid;
    if (id) {
      const ids = withGroups([id]);
      if (e.shiftKey) selection = selection.includes(id) ? selection.filter((x) => !ids.includes(x)) : [...new Set([...selection, ...ids])];
      else if (!selection.includes(id)) selection = ids;
      refreshSelection();
      if (nid && selection.includes(nid)) {
        dragState = { kind: 'move', start: p, orig: new Map(selNodes().map((n) => [n.id, [n.x, n.y]])), recorded: false };
        canvas.setPointerCapture(e.pointerId);
      }
      return;
    }
    // Dans le vide : cadre de sélection.
    if (!e.shiftKey) selection = [];
    dragState = { kind: 'band', start: p, now: p, keep: [...selection] };
    canvas.setPointerCapture(e.pointerId);
    refreshSelection();
  });

  function startPan(e) {
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const v0 = { ...view };
    const move = (ev) => { view.x = v0.x - (ev.clientX - x0) / view.k; view.y = v0.y - (ev.clientY - y0) / view.k; applyView(); };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  }

  canvas.addEventListener('pointermove', (e) => {
    const p = point(e);
    if (!dragState) {
      const nid = hitNode(e.target) || (e.target.dataset && e.target.dataset.anchor ? e.target.dataset.node : null);
      const near = nid || (hoverNode && nodeById(hoverNode) && insideMargin(nodeById(hoverNode), p, 12 / view.k) ? hoverNode : null);
      if (near !== hoverNode) { hoverNode = near; drawOverlay(); }
      return;
    }
    if (dragState.kind === 'move') {
      let dx = p[0] - dragState.start[0];
      let dy = p[1] - dragState.start[1];
      if (!dragState.recorded && Math.hypot(dx, dy) > 2 / view.k) { record(); dragState.recorded = true; }
      if (!dragState.recorded) return;
      const first = selNodes()[0];
      const o = dragState.orig.get(first.id);
      dx = snap(o[0] + dx) - o[0];
      dy = snap(o[1] + dy) - o[1];
      for (const n of selNodes()) { const [ox, oy] = dragState.orig.get(n.id); n.x = ox + dx; n.y = oy + dy; }
      content.innerHTML = contentSvg(data);
      drawOverlay();
    } else if (dragState.kind === 'resize') {
      const n = nodeById(dragState.node);
      const o = dragState.orig;
      const h = dragState.handle;
      let { x, y, w, h: hh } = o;
      const dx = p[0] - dragState.start[0];
      const dy = p[1] - dragState.start[1];
      if (h.includes('e')) w = Math.max(20, snap(o.x + o.w + dx) - o.x);
      if (h.includes('s')) hh = Math.max(16, snap(o.y + o.h + dy) - o.y);
      if (h.includes('w')) { const nx = Math.min(snap(o.x + dx), o.x + o.w - 20); w = o.x + o.w - nx; x = nx; }
      if (h.includes('n')) { const ny = Math.min(snap(o.y + dy), o.y + o.h - 16); hh = o.y + o.h - ny; y = ny; }
      if (e.shiftKey && h.length === 2) { const k = Math.max(w / o.w, hh / o.h); w = o.w * k; hh = o.h * k; if (h.includes('w')) x = o.x + o.w - w; if (h.includes('n')) y = o.y + o.h - hh; }
      Object.assign(n, { x, y, w, h: hh });
      content.innerHTML = contentSvg(data);
      drawOverlay();
    } else if (dragState.kind === 'connect') {
      dragState.to = p;
      const over = nodeAtPoint(p, dragState.node);
      dragState.hover = over ? over.id : null;
      drawOverlay();
    } else if (dragState.kind === 'band') {
      dragState.now = p;
      const [a, b] = [dragState.start, p];
      const x0 = Math.min(a[0], b[0]); const x1 = Math.max(a[0], b[0]);
      const y0 = Math.min(a[1], b[1]); const y1 = Math.max(a[1], b[1]);
      const inside = data.nodes.filter((n) => n.x >= x0 && n.y >= y0 && n.x + n.w <= x1 && n.y + n.h <= y1).map((n) => n.id);
      selection = withGroups([...new Set([...dragState.keep, ...inside])]);
      drawOverlay();
    }
  });

  const insideMargin = (n, p, m) => p[0] >= n.x - m && p[0] <= n.x + n.w + m && p[1] >= n.y - m && p[1] <= n.y + n.h + m;

  canvas.addEventListener('pointerup', (e) => {
    if (!dragState) return;
    const st = dragState;
    dragState = null;
    if (st.kind === 'connect') {
      const p = point(e);
      const over = nodeAtPoint(p, st.node);
      if (over) {
        record();
        // Côté d'arrivée : le point d'accroche le plus proche du lâcher.
        const side = ['n', 'e', 's', 'w'].reduce((best, s) => { const a = anchor(over, s); const d = Math.hypot(a[0] - p[0], a[1] - p[1]); return !best || d < best.d ? { s, d } : best; }, null).s;
        const l = { ...clone(lastLink), id: newId('l'), from: { node: st.node, side: st.side }, to: { node: over.id, side } };
        data.links.push(l);
        selection = [l.id];
      } else if (Math.hypot(p[0] - st.from[0], p[1] - st.from[1]) > 30 / view.k) {
        // Lâché dans le vide : une nouvelle forme du même genre, déjà reliée.
        const src = nodeById(st.node);
        record();
        const n = { ...clone(src), id: newId('n'), text: '' };
        const back = { n: 's', s: 'n', e: 'w', w: 'e' }[st.side];
        const off = { n: [n.w / 2, n.h], s: [n.w / 2, 0], e: [0, n.h / 2], w: [n.w, n.h / 2] }[back];
        n.x = snap(p[0] - off[0]);
        n.y = snap(p[1] - off[1]);
        data.nodes.push(n);
        const l = { ...clone(lastLink), id: newId('l'), from: { node: st.node, side: st.side }, to: { node: n.id, side: back } };
        data.links.push(l);
        selection = [n.id];
      }
      render();
      return;
    }
    if (st.kind === 'move' && !st.recorded) return;
    if (st.kind === 'band') { refreshSelection(); return; }
    render();
  });

  canvas.addEventListener('pointerleave', () => { if (!dragState && hoverNode) { hoverNode = null; drawOverlay(); } });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) { zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); return; }
    view.x += (e.shiftKey ? e.deltaY : e.deltaX) / view.k;
    view.y += (e.shiftKey ? 0 : e.deltaY) / view.k;
    applyView();
    drawOverlay();
  }, { passive: false });

  // Double-clic : écrire dans la forme, sur le connecteur, ou ajouter une forme dans le vide.
  canvas.addEventListener('dblclick', (e) => {
    const at = nodeAtPoint(point(e));
    const nid = hitNode(e.target) || (at && at.id);
    const lid = nid ? null : hitLink(e.target);
    if (nid) return editText(nodeById(nid));
    if (lid) return editText(linkById(lid));
    const p = point(e);
    editText(addNode(lastStyle.shape || 'arrondi', p[0], p[1]));
  });

  let editing = null;
  function editText(item) {
    if (!item) return;
    editing = item;
    selection = [item.id];
    render();
    const r = canvas.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    let box;
    if (item.from) {
      const g = linkGeometry(data, item);
      box = { x: g.mid[0] - 70, y: g.mid[1] - 16, w: 140, h: 32 };
    } else {
      box = item.shape === 'acteur' ? textBox(item) : { x: item.x, y: item.y, w: item.w, h: item.h };
    }
    Object.assign(textEdit.style, {
      left: (box.x - view.x) * view.k + r.left - wr.left + 'px',
      top: (box.y - view.y) * view.k + r.top - wr.top + 'px',
      width: Math.max(80, box.w * view.k) + 'px',
      height: Math.max(30, box.h * view.k) + 'px',
      fontSize: ((item.fontSize || 12) * view.k) + 'px',
      fontFamily: item.font ? `"${item.font}", sans-serif` : '',
      textAlign: item.align || 'center'
    });
    textEdit.value = item.from ? item.label || '' : item.text || '';
    textEdit.hidden = false;
    textEdit.focus();
    textEdit.select();
  }
  function finishText(cancel) {
    if (textEdit.hidden) return;
    textEdit.hidden = true;
    const item = editing;
    editing = null;
    if (!item || cancel) return;
    const key = item.from ? 'label' : 'text';
    if ((item[key] || '') === textEdit.value) return;
    record();
    item[key] = textEdit.value;
    render();
  }
  textEdit.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); finishText(true); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishText(); }
  });
  textEdit.addEventListener('blur', () => finishText());

  // ----- Clavier -----

  dialog.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') { e.preventDefault(); if (selection.length) { selection = []; render(); } return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return; }
    if (ctrl && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (ctrl && k === 'y') { e.preventDefault(); redo(); return; }
    if (ctrl && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (ctrl && k === 'c') { e.preventDefault(); copy(); return; }
    if (ctrl && k === 'v') { e.preventDefault(); paste(); return; }
    if (ctrl && k === 'a') { e.preventDefault(); selection = [...data.nodes.map((n) => n.id), ...data.links.map((l) => l.id)]; render(); return; }
    if (e.key === 'F2' && selection.length === 1) { e.preventDefault(); editText(nodeById(selection[0]) || linkById(selection[0])); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && selNodes().length) {
      e.preventDefault();
      record();
      const step = e.shiftKey ? GRID : 1;
      selNodes().forEach((n) => { n.x += arrows[0] * step; n.y += arrows[1] * step; });
      render();
    }
  });

  const ACTIONS = {
    undo, redo, duplicate, delete: removeSelection,
    group: groupSelection, ungroup: ungroupSelection,
    'arrange-down': () => arrange('down'), 'arrange-right': () => arrange('right'),
    front: () => reorder(true), back: () => reorder(false),
    grid: () => { grid = !grid; drawGrid(); render(); },
    'zoom-in': () => zoom(1.2), 'zoom-out': () => zoom(1 / 1.2), fit,
    cancel: () => dialog.close(),
    maximize: () => {
      dialog.classList.toggle('dg-max');
      if (!dialog.classList.contains('dg-max')) { dialog.style.width = ''; dialog.style.height = ''; }
    },
    ok: finish
  };
  dialog.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (ACTIONS[act]) ACTIONS[act]();
    else align(act);
  }));
  dialog.addEventListener('cancel', (e) => { if (!textEdit.hidden || selection.length) e.preventDefault(); });
  // La fenêtre change de taille (coin en bas à droite, bouton agrandir) : la feuille suit.
  new ResizeObserver(() => { if (dialog.open) { applyView(); drawOverlay(); } }).observe(canvas);

  // ----- Ouvrir, valider -----

  function open(box) {
    target = box || null;
    const sel = window.getSelection();
    savedRange = sel.rangeCount && editor.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    let saved = null;
    if (box) try { saved = JSON.parse(box.dataset.diagram); } catch { saved = null; }
    data = saved && Array.isArray(saved.nodes) ? saved : { v: 1, nodes: [], links: [], background: '#ffffff' };
    data.links = data.links || [];
    selection = [];
    undoStack = [];
    redoStack = [];
    $('[data-act="ok"]').textContent = box ? 'Valider' : 'Insérer le schéma';
    dialog.showModal();
    render();
    fit();
    if (!box) {
      // Un petit départ : deux formes reliées.
      const a = addNode('arrondi', -110, 0);
      a.text = 'Début';
      const b = addNode('arrondi', 110, 0);
      b.text = 'Suite';
      data.links.push({ ...clone(lastLink), id: newId('l'), from: { node: a.id, side: 'e' }, to: { node: b.id, side: 'w' } });
      undoStack = [];
      selection = [];
      pristine = true;
      render();
      fit();
    }
  }

  function finish() {
    finishText();
    if (!data.nodes.length) { dialog.close(); return; }
    const svg = exportSvg(data);
    const url = window.FTLayout.imageUrl(svgDataUrl(svg));
    const json = JSON.stringify(data);
    const width = bounds(data).w;
    dialog.close();
    S().checkpoint();
    if (target && target.isConnected) {
      const img = target.querySelector('img');
      // Même échelle qu'avant : la largeur suit la taille du schéma.
      const before = img.naturalWidth || width;
      const pct = parseFloat(target.style.width) || 100;
      // Schéma étiré à la souris : il reste étiré de la même façon.
      const ar = parseFloat(target.style.getPropertyValue('--ar'));
      const b = bounds(data);
      if (ar && img.naturalHeight && b.h) target.style.setProperty('--ar', String(Math.round(ar / (img.naturalWidth / img.naturalHeight) * (Math.ceil(b.w) / Math.ceil(b.h)) * 10000) / 10000));
      img.src = url;
      target.dataset.diagram = json;
      target.style.width = Math.max(5, Math.min(100, Math.round(pct * (width / before)))) + '%';
      S().changed();
      return;
    }
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    const box = window.FTLayout.makeImage(url, width);
    box.dataset.diagram = json;
    box.classList.add('ft-diagram');
    S().insertBlockObject(box);
    S().changed();
  }

  const btn = document.getElementById('diagram-btn');
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => open(null));

  // Double-clic sur un schéma du document : on le modifie.
  editor.addEventListener('dblclick', (e) => {
    const box = e.target.closest && e.target.closest('.ft-image[data-diagram]');
    if (!box || e.target.closest('.ft-caption')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open(box);
  }, true);

  // ----- Styles des schémas (fenêtre « Styles du document », onglet Schémas : docstyles.js) -----
  // Un style : remplissage, contour et texte des formes, couleur des connecteurs, police, ombre ;
  // « palette » donne à chaque forme une couleur différente.
  const STYLE = { fill: NODE.fill, stroke: NODE.stroke, textColor: NODE.textColor, link: LINK.color, font: NODE.font, strokeWidth: NODE.strokeWidth, shadow: false, palette: false };
  const STYLE_PRESETS = [
    ['bleu', 'Bleu', {}],
    ['sobre', 'Sobre', { fill: '#ffffff', stroke: '#404040', textColor: '#262626', link: '#404040' }],
    ['noir', 'Noir et blanc', { fill: '#ffffff', stroke: '#000000', textColor: '#000000', link: '#000000', font: 'Arial' }],
    ['contour', 'Contour', { fill: '#ffffff', stroke: '#2e86c1', textColor: '#1b4f72', link: '#2e86c1', strokeWidth: 2 }],
    ['ombre', 'Ombré', { fill: '#ffffff', stroke: '#d9d9d9', textColor: '#262626', link: '#7f7f7f', shadow: true }],
    ['vert', 'Vert', { fill: '#d5f5e3', stroke: '#27ae60', textColor: '#145a32', link: '#27ae60' }],
    ['tomate', 'Tomate', { fill: '#fde2e1', stroke: '#e74c3c', textColor: '#78281f', link: '#c0392b' }],
    ['pastel', 'Pastel', { fill: '#fdebd0', stroke: '#f5c28b', textColor: '#784212', link: '#b9770e', font: 'Verdana' }],
    ['plein', 'Bleu plein', { fill: '#2e86c1', stroke: '#1b4f72', textColor: '#ffffff', link: '#1b4f72' }],
    ['sombre', 'Sombre', { fill: '#262626', stroke: '#000000', textColor: '#ffffff', link: '#262626' }],
    ['colore', 'Multicolore', { palette: true, link: '#555555' }],
    ['manuscrit', 'Manuscrit', { fill: '#fcf3cf', stroke: '#7d6608', textColor: '#262626', link: '#7d6608', font: 'Comic Sans MS' }],
    ['orange', 'Orange', { fill: '#fdebd0', stroke: '#e67e22', textColor: '#784212', link: '#e67e22' }],
    ['violet', 'Violet', { fill: '#e8daef', stroke: '#8e44ad', textColor: '#4a235a', link: '#8e44ad' }],
    ['ardoise', 'Ardoise', { fill: '#eef1f5', stroke: '#4a5560', textColor: '#1f2933', link: '#4a5560', font: 'Verdana', strokeWidth: 1 }],
    ['carmin', 'Carmin', { fill: '#f7e6e4', stroke: '#af1d26', textColor: '#7e1119', link: '#af1d26', font: 'Arial', strokeWidth: 1.5 }],
    ['contraste', 'Contraste', { fill: '#ffd23f', stroke: '#000000', textColor: '#000000', link: '#000000', strokeWidth: 2, font: 'Arial' }]
  ];
  const PALETTE_STYLES = QUICK.slice(1, 7);
  const cleanStyle = (st) => {
    const out = { ...STYLE };
    if (!st || typeof st !== 'object') return out;
    for (const k of ['fill', 'stroke', 'textColor', 'link']) if (/^#[0-9a-f]{6}$/i.test(st[k] || '')) out[k] = st[k];
    if (FONTS.includes(st.font)) out.font = st.font;
    if (Number(st.strokeWidth) > 0 && Number(st.strokeWidth) <= 6) out.strokeWidth = Number(st.strokeWidth);
    out.shadow = !!st.shadow;
    out.palette = !!st.palette;
    return out;
  };

  function paintData(d, st) {
    d.nodes.forEach((n, i) => {
      const [fill, stroke, textColor] = st.palette ? PALETTE_STYLES[i % PALETTE_STYLES.length] : [st.fill, st.stroke, st.textColor];
      if (isGraph(n)) n.stroke = stroke;
      else if (n.shape !== 'texte') Object.assign(n, { fill, stroke, strokeWidth: st.strokeWidth, shadow: st.shadow });
      Object.assign(n, { textColor, font: st.font });
    });
    d.links.forEach((l) => { l.color = st.link; });
  }

  function styleOf(box) {
    let d = null;
    try { d = JSON.parse(box.dataset.diagram); } catch { d = null; }
    const n = d && (d.nodes.find((x) => x.shape !== 'texte') || d.nodes[0]);
    if (!n) return { ...STYLE };
    const fills = new Set(d.nodes.filter((x) => x.shape !== 'texte').map((x) => x.fill));
    return cleanStyle({ fill: n.fill, stroke: n.stroke, textColor: n.textColor, font: n.font, strokeWidth: n.strokeWidth, shadow: n.shadow,
      link: d.links[0] ? d.links[0].color : LINK.color, palette: fills.size > 1 && d.nodes.length > 2 });
  }

  // Redessine un schéma du document avec un style.
  function restyle(box, st) {
    let d = null;
    try { d = JSON.parse(box.dataset.diagram); } catch { return; }
    if (!d || !Array.isArray(d.nodes)) return;
    d.links = d.links || [];
    paintData(d, cleanStyle(st));
    box.dataset.diagram = JSON.stringify(d);
    const img = box.querySelector('img');
    if (img) img.src = window.FTLayout.imageUrl(svgDataUrl(exportSvg(d)));
  }

  // Style des prochaines formes et des prochains connecteurs.
  function setDefault(st) {
    const c = cleanStyle(st);
    const [fill, stroke, textColor] = c.palette ? PALETTE_STYLES[0] : [c.fill, c.stroke, c.textColor];
    Object.assign(lastStyle, { fill, stroke, textColor, font: c.font, strokeWidth: c.strokeWidth, shadow: c.shadow });
    lastLink.color = c.link;
  }

  // Aperçu : trois formes reliées.
  function sample(st) {
    const d = { v: 1, background: '#ffffff', nodes: [
      { ...clone(NODE), id: 'a', x: 0, y: 0, w: 90, h: 40, text: 'Idée' },
      { ...clone(NODE), id: 'b', x: 130, y: -35, w: 90, h: 40, text: 'Suite' },
      { ...clone(NODE), id: 'c', x: 130, y: 35, w: 90, h: 40, text: 'Fin', shape: 'ellipse' }
    ], links: [
      { ...clone(LINK), id: 'l1', from: { node: 'a', side: 'e' }, to: { node: 'b', side: 'w' } },
      { ...clone(LINK), id: 'l2', from: { node: 'a', side: 'e' }, to: { node: 'c', side: 'w' } }
    ] };
    paintData(d, cleanStyle(st));
    const img = document.createElement('img');
    img.className = 'ds-diagram-sample';
    img.alt = '';
    img.src = svgDataUrl(exportSvg(d));
    return img;
  }

  window.FTDiagram = {
    open,
    current: () => (data ? clone(data) : null),
    exportSvg,
    presets: () => STYLE_PRESETS.map(([id, name, v]) => ({ id, name, value: cleanStyle({ ...STYLE, ...v }) })),
    fonts: () => FONTS.slice(),
    cleanStyle,
    styleOf,
    restyle,
    setDefault,
    sample
  };
})();
