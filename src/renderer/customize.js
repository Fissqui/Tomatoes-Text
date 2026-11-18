// Fenêtre « Thème du logiciel… » (menu Affichage) : thème global, aspect (icônes, boutons, fenêtres,
// barres, densité), police de l'interface, couleurs.
// Tout s'applique aussitôt, au logiciel entier, en tenant compte du mode jour / nuit. Le texte des
// documents garde sa propre police.
(function () {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const dialog = $('custom-dialog');

  // ----- Thèmes -----
  // Chaque thème donne quelques couleurs de base par mode ; les nuances (survol, bouton actif…) en
  // sont tirées. Il fixe aussi la police, l'arrondi des fenêtres et le trait des icônes.
  const SYSTEM_FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
  const THEMES = [
    {
      id: 'classique', name: 'Classique', note: 'Papier chaud et brun, le thème d’origine.',
      font: SYSTEM_FONT, round: 1, icons: 1, cap: 'round',
      light: { bg: '#f4f1ea', sidebar: '#ebe6db', panel: '#fbf9f5', page: '#ffffff', text: '#2b2823', muted: '#7a7266', border: '#d9d1c2', accent: '#8a5a2b', link: '#1f63c6', tomato: '#c8402c' },
      dark: { bg: '#1b1c1f', sidebar: '#222327', panel: '#26272b', page: '#2a2b30', text: '#e4e1da', muted: '#9a958c', border: '#3a3b41', accent: '#d6a666', link: '#82b1ff', tomato: '#f06a4f' }
    },
    {
      id: 'tomate', name: 'Tomate', note: 'Rouge tomate et vert tige, aux couleurs de Tomatoes Text.',
      font: '"Nunito", ' + SYSTEM_FONT, round: 1.3, icons: 1.1, cap: 'round',
      light: { bg: '#fbf3ee', sidebar: '#f5e4da', panel: '#fffaf6', page: '#ffffff', text: '#2e2421', muted: '#86716a', border: '#ecd4c7', accent: '#d2412b', link: '#2f7d32', tomato: '#d2412b' },
      dark: { bg: '#1d1918', sidebar: '#251f1d', panel: '#2a2321', page: '#2e2725', text: '#f0e6e2', muted: '#a8968f', border: '#433632', accent: '#ff7a5c', link: '#8fd18f', tomato: '#ff7a5c' }
    },
    {
      id: 'ardoise', name: 'Ardoise', note: 'Gris bleuté, net et reposant.',
      font: '"Inter", ' + SYSTEM_FONT, round: 0.8, icons: 1, cap: 'round',
      light: { bg: '#eef1f5', sidebar: '#e2e7ee', panel: '#f8fafc', page: '#ffffff', text: '#1f2933', muted: '#66727f', border: '#cfd7e1', accent: '#3b6ea8', link: '#2563c9', tomato: '#cf4a3a' },
      dark: { bg: '#171b21', sidebar: '#1d222a', panel: '#222831', page: '#262d37', text: '#e3e8ef', muted: '#93a0ae', border: '#343d4a', accent: '#7fb0ec', link: '#8ab8ff', tomato: '#f47a63' }
    },
    {
      id: 'foret', name: 'Forêt', note: 'Verts doux et bois clair.',
      font: '"Open Sans", ' + SYSTEM_FONT, round: 1, icons: 1, cap: 'round',
      light: { bg: '#eef2ea', sidebar: '#e1e8da', panel: '#f8faf5', page: '#ffffff', text: '#22291f', muted: '#6b7764', border: '#cdd8c4', accent: '#3f7a4a', link: '#2b6cb0', tomato: '#c8452f' },
      dark: { bg: '#171c17', sidebar: '#1d241d', panel: '#222a22', page: '#263026', text: '#e2eadf', muted: '#97a690', border: '#344033', accent: '#8cc79a', link: '#8ab8ff', tomato: '#f07a5e' }
    },
    {
      id: 'lavande', name: 'Lavande', note: 'Violet tendre, fenêtres très arrondies.',
      font: '"Nunito", ' + SYSTEM_FONT, round: 1.8, icons: 1.15, cap: 'round',
      light: { bg: '#f3f0f8', sidebar: '#e9e3f3', panel: '#fbf9fe', page: '#ffffff', text: '#2a2433', muted: '#786f86', border: '#dcd3ea', accent: '#7a5cc4', link: '#3d63c9', tomato: '#d04a55' },
      dark: { bg: '#1b1920', sidebar: '#221f29', panel: '#27232f', page: '#2b2734', text: '#ebe5f4', muted: '#a299b0', border: '#3c3648', accent: '#b9a2f0', link: '#9bb8ff', tomato: '#f5808a' }
    },
    {
      id: 'ocean', name: 'Océan', note: 'Bleu profond et sable.',
      font: '"Roboto", ' + SYSTEM_FONT, round: 1, icons: 1, cap: 'round',
      light: { bg: '#edf4f6', sidebar: '#dcebef', panel: '#f7fbfc', page: '#ffffff', text: '#1c2a30', muted: '#5f7680', border: '#c6dbe1', accent: '#1f7f95', link: '#1f63c6', tomato: '#d1503a' },
      dark: { bg: '#141b1f', sidebar: '#182329', panel: '#1d2a31', page: '#212f37', text: '#dfeef3', muted: '#8ea8b2', border: '#2f434d', accent: '#5cc3d6', link: '#8ab8ff', tomato: '#f7866a' }
    },
    {
      id: 'minimal', name: 'Minimal', note: 'Noir et blanc, angles droits, icônes fines.',
      font: SYSTEM_FONT, round: 0.25, icons: 0.8, cap: 'square',
      light: { bg: '#f5f5f5', sidebar: '#ececec', panel: '#ffffff', page: '#ffffff', text: '#161616', muted: '#6e6e6e', border: '#d6d6d6', accent: '#1d1d1d', link: '#1f5fbf', tomato: '#c63a2c' },
      dark: { bg: '#121212', sidebar: '#181818', panel: '#1c1c1c', page: '#1f1f1f', text: '#ededed', muted: '#9a9a9a', border: '#333333', accent: '#f0f0f0', link: '#8ab8ff', tomato: '#f26a55' }
    },
    {
      id: 'contraste', name: 'Lisible', note: 'Grands contrastes et police très lisible.',
      font: '"Atkinson Hyperlegible", ' + SYSTEM_FONT, size: 15, round: 1, icons: 1.3, cap: 'round',
      light: { bg: '#ffffff', sidebar: '#f0f0f0', panel: '#ffffff', page: '#ffffff', text: '#000000', muted: '#4a4a4a', border: '#9a9a9a', accent: '#0047b3', link: '#0047b3', tomato: '#b3261e' },
      dark: { bg: '#000000', sidebar: '#111111', panel: '#141414', page: '#161616', text: '#ffffff', muted: '#c8c8c8', border: '#6a6a6a', accent: '#ffd23f', link: '#7fb2ff', tomato: '#ff6b5b' }
    },
    {
      id: 'sable', name: 'Sable', note: 'Beige et ocre, boutons en pastilles.',
      font: '"Nunito", ' + SYSTEM_FONT, round: 1.4, icons: 1.05, cap: 'round', look: { icons: 'duo', buttons: 'pastilles' },
      light: { bg: '#f6f0e4', sidebar: '#efe5d2', panel: '#fcf8f0', page: '#fffdf8', text: '#3a2f22', muted: '#8a7a64', border: '#e3d6bf', accent: '#b5762a', link: '#2f6aa8', tomato: '#c94a30' },
      dark: { bg: '#1d1a15', sidebar: '#24201a', panel: '#2a251e', page: '#2e2922', text: '#efe6d6', muted: '#a8998a', border: '#433a2e', accent: '#e3a95a', link: '#8ab8ff', tomato: '#f2785a' }
    },
    {
      id: 'encre', name: 'Encre', note: 'Bleu nuit et or, icônes dorées.',
      font: '"Lora", Georgia, serif', round: 0.7, icons: 1, cap: 'round', look: { icons: 'couleur', windows: 'bordees' },
      light: { bg: '#eef0f5', sidebar: '#e1e5ee', panel: '#f8f9fc', page: '#ffffff', text: '#1b2235', muted: '#667089', border: '#d3d8e4', accent: '#a67c1f', link: '#2a55b0', tomato: '#c8402c' },
      dark: { bg: '#11151f', sidebar: '#0c101a', panel: '#181e2b', page: '#1c2331', text: '#e6e3da', muted: '#9097a8', border: '#2c3446', accent: '#e0b552', link: '#8ab8ff', tomato: '#f07a5e' }
    },
    {
      id: 'menthe', name: 'Menthe', note: 'Vert d’eau frais, icônes bicolores.',
      font: '"Inter", ' + SYSTEM_FONT, round: 1.2, icons: 1, cap: 'round', look: { icons: 'duo-couleur' },
      light: { bg: '#eef7f4', sidebar: '#dff0ea', panel: '#f8fcfa', page: '#ffffff', text: '#1d2b27', muted: '#61786f', border: '#c9e2d8', accent: '#1f9a76', link: '#1f63c6', tomato: '#d1503a' },
      dark: { bg: '#131b19', sidebar: '#17221f', panel: '#1c2825', page: '#202d2a', text: '#dff0ea', muted: '#8aa79d', border: '#2e403b', accent: '#5fd3ae', link: '#8ab8ff', tomato: '#f7866a' }
    },
    {
      id: 'bureau', name: 'Bureau', note: 'Sobre et carré, boutons encadrés, comme un traitement de texte classique.',
      font: SYSTEM_FONT, round: 0.35, icons: 1, cap: 'square', look: { buttons: 'encadres', windows: 'plates', density: 'compacte' },
      light: { bg: '#f0f0f0', sidebar: '#e6e9ee', panel: '#fafafa', page: '#ffffff', text: '#1e1e1e', muted: '#666666', border: '#c8c8c8', accent: '#2b579a', link: '#1f5fbf', tomato: '#c63a2c' },
      dark: { bg: '#1e1e1e', sidebar: '#252526', panel: '#2b2b2b', page: '#2d2d2d', text: '#e8e8e8', muted: '#a0a0a0', border: '#424242', accent: '#5c9ded', link: '#8ab8ff', tomato: '#f26a55' }
    },
    {
      id: 'verre', name: 'Verre', note: 'Fenêtres et menus translucides, barres flottantes.',
      font: '"Inter", ' + SYSTEM_FONT, round: 1.6, icons: 0.95, cap: 'round', look: { windows: 'translucides', bars: 'flottantes', buttons: 'pastilles' },
      light: { bg: '#e9eef6', sidebar: '#dfe6f1', panel: '#f7f9fd', page: '#ffffff', text: '#1d2433', muted: '#69738a', border: '#ccd5e4', accent: '#4a6cf7', link: '#3355d6', tomato: '#d24a3a' },
      dark: { bg: '#12151d', sidebar: '#171b25', panel: '#1d2230', page: '#212736', text: '#e5e9f2', muted: '#97a0b4', border: '#323a4d', accent: '#8ea2ff', link: '#9bb8ff', tomato: '#f5806a' }
    },
    {
      id: 'retro', name: 'Rétro', note: 'Crème, brun et police à empattements, fenêtres en relief.',
      font: '"Merriweather", Georgia, serif', round: 0.5, icons: 1.3, cap: 'square', look: { windows: 'relief', buttons: 'encadres' },
      light: { bg: '#efe6d2', sidebar: '#e4d7bb', panel: '#f8f1e2', page: '#fffaf0', text: '#3b2a1a', muted: '#86705a', border: '#cdb994', accent: '#8c3b1f', link: '#1d5c8f', tomato: '#b8381f' },
      dark: { bg: '#1c1712', sidebar: '#231d16', panel: '#29221a', page: '#2d261d', text: '#eee2cc', muted: '#a8977f', border: '#46392a', accent: '#e08a5c', link: '#8ab8ff', tomato: '#f0785a' }
    },
    {
      id: 'graphite', name: 'Graphite', note: 'Gris anthracite et cyan, interface compacte.',
      font: '"Roboto", ' + SYSTEM_FONT, round: 0.6, icons: 0.9, cap: 'round', look: { density: 'compacte', windows: 'plates', icons: 'couleur' },
      light: { bg: '#e9eaec', sidebar: '#dcdee2', panel: '#f5f6f7', page: '#ffffff', text: '#202327', muted: '#646a73', border: '#c4c8cf', accent: '#0e8aa8', link: '#1f63c6', tomato: '#cf4a3a' },
      dark: { bg: '#16181b', sidebar: '#1b1e22', panel: '#202328', page: '#24282d', text: '#e2e5e9', muted: '#8f969f', border: '#33383f', accent: '#36c3e0', link: '#8ab8ff', tomato: '#f47a63' }
    },
    {
      id: 'cerise', name: 'Cerise', note: 'Rose poudré et cerise, interface aérée.',
      font: '"Nunito", ' + SYSTEM_FONT, round: 1.7, icons: 1.1, cap: 'round', look: { density: 'aeree', icons: 'duo', buttons: 'pastilles' },
      light: { bg: '#fbf1f3', sidebar: '#f5e2e7', panel: '#fffafb', page: '#ffffff', text: '#33232a', muted: '#8a6f79', border: '#ecd2da', accent: '#c2185b', link: '#3d5bc9', tomato: '#d2412b' },
      dark: { bg: '#1e171a', sidebar: '#261d21', panel: '#2b2126', page: '#30252a', text: '#f3e5ea', muted: '#ad949d', border: '#45343b', accent: '#ff79a8', link: '#9bb8ff', tomato: '#ff7a5c' }
    }
  ];

  // Aspect complet de chaque thème (disposition, fond, feuille, accueil, petits éléments, logo).
  const DEEP = {
    classique: { defil: 'fines', controles: 'theme' },
    tomate: { onglets: 'pastilles', fond: 'degrade', ombre: 'flottante', selection: 'theme', curseur: 'principale', anim: 'douces', accueil: 'cartes', accueilFond: 'logo', arbre: 'icones', defil: 'theme', bulles: 'theme', menus: 'plein', controles: 'theme' },
    ardoise: { onglets: 'soulignes', fond: 'points', selection: 'theme', accueil: 'liste', arbre: 'filets', defil: 'fines', bulles: 'contraste', menus: 'barre', controles: 'theme', logo: 'plat' },
    foret: { fond: 'grain', papier: 'grain', selection: 'theme', anim: 'douces', accueil: 'cartes', accueilFond: 'fenetre', arbre: 'icones', defil: 'theme', bulles: 'theme', controles: 'theme' },
    lavande: { largeur: 'large', onglets: 'pastilles', fond: 'degrade', ombre: 'flottante', selection: 'theme', anim: 'douces', accueil: 'cartes', accueilFond: 'fenetre', defil: 'discretes', bulles: 'theme', menus: 'plein', controles: 'theme', logo: 'plat' },
    ocean: { onglets: 'soulignes', fond: 'degrade', ombre: 'flottante', selection: 'theme', anim: 'douces', arbre: 'icones', defil: 'theme', bulles: 'contraste', menus: 'barre', controles: 'theme' },
    minimal: { onglets: 'soulignes', ombre: 'bord', selection: 'theme', forme: 'anguleuse', anim: 'aucune', accueil: 'compacte', defil: 'discretes', bulles: 'contraste', menus: 'plein', controles: 'theme', logo: 'trait' },
    contraste: { ombre: 'bord', selection: 'surligneur', curseur: 'principale', anim: 'aucune', arbre: 'filets', defil: 'theme', bulles: 'contraste', menus: 'plein', controles: 'theme' },
    sable: { onglets: 'pastilles', fond: 'grain', papier: 'velin', anim: 'douces', accueil: 'cartes', accueilFond: 'fenetre', arbre: 'icones', defil: 'theme', bulles: 'theme', controles: 'theme' },
    encre: { onglets: 'soulignes', fond: 'grain', papier: 'velin', ombre: 'marquee', selection: 'theme', curseur: 'principale', anim: 'douces', accueilFond: 'logo', arbre: 'filets', defil: 'theme', bulles: 'contraste', menus: 'barre', controles: 'theme', logo: 'monochrome' },
    menthe: { onglets: 'pastilles', fond: 'points', ombre: 'flottante', selection: 'theme', anim: 'vives', accueil: 'cartes', arbre: 'icones', defil: 'fines', bulles: 'theme', menus: 'plein', controles: 'theme' },
    bureau: { ombre: 'marquee', forme: 'anguleuse', anim: 'aucune', accueil: 'compacte', arbre: 'icones', menus: 'plein', logo: 'plat' },
    verre: { onglets: 'pastilles', fond: 'degrade', ombre: 'flottante', selection: 'theme', anim: 'douces', accueil: 'cartes', accueilFond: 'fenetre', defil: 'discretes', bulles: 'theme', controles: 'theme' },
    retro: { fond: 'toile', papier: 'lin', ombre: 'marquee', selection: 'surligneur', accueilFond: 'logo', arbre: 'filets', defil: 'theme', bulles: 'theme', menus: 'barre', controles: 'theme', logo: 'ancien' },
    graphite: { onglets: 'soulignes', fond: 'quadrillage', ombre: 'bord', selection: 'theme', curseur: 'principale', anim: 'vives', accueil: 'compacte', arbre: 'filets', defil: 'fines', bulles: 'contraste', menus: 'plein', controles: 'theme' },
    cerise: { onglets: 'pastilles', fond: 'degrade', ombre: 'flottante', selection: 'theme', anim: 'douces', accueil: 'cartes', accueilFond: 'logo', arbre: 'icones', defil: 'theme', bulles: 'theme', menus: 'plein', controles: 'theme' }
  };
  for (const t of THEMES) t.look = { ...(DEEP[t.id] || {}), ...(t.look || {}) };

  // Aspect du logiciel : chaque thème a le sien ; chaque réglage peut être changé (onglet « Aspect »).
  const CARET_SHAPE = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('caret-shape', 'block');
  const LOOK = {
    // Disposition
    cote: ['Panneau des projets', [['gauche', 'À gauche'], ['droite', 'À droite']]],
    largeur: ['Largeur du panneau', [['etroit', 'Étroit'], ['normal', 'Normal'], ['large', 'Large']]],
    onglets: ["Onglets d'affichage", [['onglets', 'Onglets'], ['soulignes', 'Soulignés'], ['pastilles', 'Pastilles']]],
    bars: ["Barres d'outils", [['pleines', 'Pleine largeur'], ['flottantes', 'Flottantes']]],
    groupes: ['Noms des groupes', [['affiches', 'Affichés'], ['masques', 'Masqués']]],
    density: ['Densité', [['compacte', 'Compacte'], ['normale', 'Normale'], ['aeree', 'Aérée']]],
    // Fond de la fenêtre
    fond: ['Motif', [['uni', 'Uni'], ['degrade', 'Dégradé'], ['grain', 'Grain'], ['toile', 'Toile'], ['points', 'Points'], ['quadrillage', 'Quadrillage'], ['image', 'Image']]],
    // Feuille
    ombre: ['Ombre de la feuille', [['douce', 'Douce'], ['marquee', 'Marquée'], ['flottante', 'Flottante'], ['bord', 'Bord fin'], ['aucune', 'Aucune']]],
    papier: ['Texture de la feuille', [['lisse', 'Lisse'], ['grain', 'Grain'], ['velin', 'Vélin'], ['lin', 'Toile de lin']]],
    selection: ['Sélection du texte', [['systeme', 'Système'], ['theme', 'Couleur principale'], ['surligneur', 'Surligneur']]],
    curseur: ["Curseur d'écriture", [['texte', 'Couleur du texte'], ['principale', 'Couleur principale'], ...(CARET_SHAPE ? [['bloc', 'Bloc'], ['souligne', 'Souligné']] : [])]],
    // Icônes
    icons: ['Icônes', [['trait', 'Trait'], ['duo', 'Bicolores'], ['pleines', 'Pleines'], ['couleur', 'Couleur principale'], ['duo-couleur', 'Bicolores, couleur principale']]],
    famille: ['Couleur des icônes', [['familles', 'Une couleur par famille'], ['grises', 'Grises']]],
    forme: ['Forme du trait', [['', 'Celle du thème'], ['arrondie', 'Arrondie'], ['anguleuse', 'Anguleuse']]],
    weight: ['Épaisseur des icônes', [['', 'Celle du thème'], ['0.8', 'Fine'], ['1', 'Normale'], ['1.35', 'Épaisse']]],
    taille: ['Taille des icônes', [['petites', 'Petites'], ['normales', 'Normales'], ['grandes', 'Grandes']]],
    // Boutons et fenêtres
    buttons: ['Boutons des barres', [['plats', 'Plats'], ['encadres', 'Encadrés'], ['pastilles', 'Pastilles arrondies'], ['soulignes', 'Soulignés (bouton actif)']]],
    windows: ['Fenêtres et menus', [['ombre', 'Ombrées'], ['plates', 'Plates'], ['bordees', 'Bordées'], ['relief', 'En relief'], ['translucides', 'Translucides']]],
    round: ['Coins', [['', 'Ceux du thème'], ['0.2', 'Droits'], ['0.6', 'Légèrement arrondis'], ['1', 'Arrondis'], ['1.6', 'Très arrondis'], ['2.2', 'Ronds']]],
    anim: ['Animations', [['aucune', 'Aucune'], ['discretes', 'Discrètes'], ['douces', 'Douces'], ['vives', 'Vives']]],
    // Accueil et projets
    accueil: ['Documents récents', [['liste', 'Liste'], ['cartes', 'Cartes'], ['compacte', 'Liste compacte']]],
    accueilFond: ["Fond de l'accueil", [['uni', 'Uni'], ['fenetre', 'Celui de la fenêtre'], ['logo', 'Logo en filigrane']]],
    arbre: ['Liste des documents', [['sobre', 'Sobre'], ['icones', 'Avec icônes'], ['filets', 'Avec filets']]],
    // Petits éléments
    defil: ['Barres de défilement', [['systeme', 'Système'], ['fines', 'Fines'], ['theme', 'Couleurs du thème'], ['discretes', 'Visibles au survol']]],
    bulles: ['Info-bulles', [['systeme', 'Système'], ['theme', 'Couleurs du thème'], ['contraste', 'Sombres']]],
    menus: ['Survol dans les menus', [['doux', 'Fond léger'], ['plein', 'Couleur principale'], ['barre', 'Barre latérale']]],
    controles: ['Cases et curseurs', [['systeme', 'Système'], ['theme', 'Couleur principale']]],
    // Logo
    logo: ['Logo', [['couleurs', 'En couleurs'], ['plat', 'Aplats'], ['monochrome', 'Couleur principale'], ['trait', 'Au trait'], ['ancien', 'Gravure ancienne']]]
  };
  const LOOK_GROUPS = [
    ['Disposition', ['cote', 'largeur', 'onglets', 'bars', 'groupes', 'density']],
    ['Fond de la fenêtre', ['fond']],
    ['Feuille', ['ombre', 'papier', 'selection', 'curseur']],
    ['Icônes', ['icons', 'famille', 'forme', 'weight', 'taille']],
    ['Boutons et fenêtres', ['buttons', 'windows', 'round', 'anim']],
    ['Accueil et projets', ['accueil', 'accueilFond', 'arbre']],
    ['Petits éléments', ['defil', 'bulles', 'menus', 'controles']],
    ['Logo', ['logo']]
  ];
  // Valeurs de départ : l'aspect d'origine. Chaque thème remplace celles qu'il veut (look).
  const LOOK_DEFAULT = {
    cote: 'gauche', largeur: 'normal', onglets: 'onglets', bars: 'pleines', groupes: 'affiches', density: 'normale',
    fond: 'uni', ombre: 'douce', papier: 'lisse', selection: 'systeme', curseur: 'texte',
    icons: 'trait', famille: 'familles', forme: '', weight: '', taille: 'normales',
    buttons: 'plats', windows: 'ombre', round: '', anim: 'discretes',
    accueil: 'liste', accueilFond: 'uni', arbre: 'sobre',
    defil: 'systeme', bulles: 'systeme', menus: 'doux', controles: 'systeme', logo: 'couleurs'
  };
  const VAR_KEYS = ['weight', 'round', 'forme'];
  const lookOf = () => ({ ...LOOK_DEFAULT, ...(themeOf(prefs.theme).look || {}), ...(prefs.look || {}) });

  // Parties dont on peut choisir la couleur (section « Couleurs »).
  const PARTS = [
    ['accent', 'Couleur principale', 'boutons, sélection, éléments actifs'],
    ['bg', 'Fond de la fenêtre', 'autour de la page'],
    ['sidebar', 'Panneau des projets', 'colonne de gauche'],
    ['panel', 'Barres et fenêtres', 'barre d’outils, menus, fenêtres'],
    ['page', 'Page', 'fond de la feuille'],
    ['text', 'Texte', 'texte de l’interface et des documents'],
    ['link', 'Liens', 'liens vers des sites et des documents']
  ];

  const FONTS = [
    ['', 'Celle du thème'],
    [SYSTEM_FONT, 'Segoe UI (Windows)'],
    ...['Inter', 'Roboto', 'Open Sans', 'Nunito', 'Montserrat', 'Archivo', 'Atkinson Hyperlegible', 'Lora', 'Merriweather', 'Literata', 'Source Serif 4', 'JetBrains Mono']
      .map((f) => [`"${f}", ${SYSTEM_FONT}`, f]),
    ...['Calibri', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Cambria']
      .map((f) => [`"${f}", ${SYSTEM_FONT}`, f])
  ];
  const SIZES = [12, 13, 14, 15, 16, 17, 18];

  let prefs = { theme: 'classique', font: '', size: 0, colors: { light: {}, dark: {} }, look: {}, image: '' };
  let onChange = () => {};

  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  const isDark = () => root.dataset.theme === 'dark';
  const PAGE_KEYS = ['--page', '--panel', '--text', '--text-muted', '--border', '--accent', '--accent-text', '--btn-hover', '--btn-active', '--drop', '--link', '--link-bg', '--page-shadow', 'color-scheme'];
  const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

  // Texte lisible sur une couleur : blanc ou presque noir selon sa clarté.
  function textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1b1c1f' : '#ffffff';
  }

  // Couleurs de base (thème + choix personnels) pour un mode.
  function baseColors(mode) {
    return { ...themeOf(prefs.theme)[mode], ...(prefs.colors[mode] || {}) };
  }

  function apply() {
    const mode = isDark() ? 'dark' : 'light';
    const theme = themeOf(prefs.theme);
    const c = baseColors(mode);
    const look = lookOf();
    for (const k of Object.keys(LOOK)) if (!VAR_KEYS.includes(k)) root.dataset['ui' + k[0].toUpperCase() + k.slice(1)] = look[k];
    const cap = look.forme === 'anguleuse' ? 'square' : look.forme === 'arrondie' ? 'round' : theme.cap;
    const vars = {
      '--bg': c.bg,
      '--sidebar-bg': c.sidebar,
      '--sidebar-hover': mix(c.sidebar, c.text, 92),
      '--sidebar-active': mix(c.sidebar, c.text, 84),
      '--panel': c.panel,
      '--page': c.page,
      '--text': c.text,
      '--text-muted': c.muted,
      '--border': c.border,
      '--accent': c.accent,
      '--accent-text': textOn(c.accent),
      '--btn-hover': mix(c.panel, c.text, 92),
      '--btn-active': mix(c.panel, c.text, 84),
      '--drop': mix(c.accent, c.page, 60),
      '--link': c.link,
      '--link-bg': mix(c.link, 'transparent', 13),
      '--ui-font': prefs.font || theme.font,
      '--ui-scale': String((prefs.size || theme.size || 14) / 14),
      '--round': String(look.round ? Number(look.round) : theme.round),
      '--icon-weight': String(look.weight ? Number(look.weight) : theme.icons),
      '--icon-cap': cap,
      '--icon-join': cap === 'square' ? 'miter' : 'round',
      // Logo et « Tomatoes » : un rouge tomate accordé au thème et au mode jour / nuit.
      '--brand-tomato': c.tomato,
      '--logo-tomato': c.tomato,
      '--logo-tomato-shade': mix(c.tomato, '#000', 82),
      '--logo-tomato-deep': mix(c.tomato, '#000', 72),
      '--logo-line': mode === 'dark' ? mix(c.tomato, '#000', 22) : mix(c.tomato, c.text, 30),
      '--logo-paper': mode === 'dark' ? mix(c.text, c.page, 88) : mix(c.page, c.bg, 60),
      '--logo-paper-lines': mix(c.muted, c.page, 55)
    };
    // Logo à la couleur principale : tomate, feuilles et tige en nuances de cette couleur.
    const mono = look.logo === 'monochrome';
    Object.assign(vars, {
      '--logo-leaf': mono ? mix(c.accent, c.text, 55) : null,
      '--logo-leaf-line': mono ? mix(c.accent, '#000', 45) : null,
      '--logo-leaf-vein': mono ? mix(c.accent, '#000', 70) : null,
      '--logo-stem': mono ? mix(c.accent, c.text, 70) : null
    });
    if (mono) Object.assign(vars, { '--brand-tomato': c.accent, '--logo-tomato': c.accent, '--logo-tomato-shade': mix(c.accent, '#000', 82), '--logo-tomato-deep': mix(c.accent, '#000', 72) });
    // Image de fond choisie (fond « Image »).
    vars['--ui-image'] = look.fond === 'image' && prefs.image ? `url("${prefs.image}")` : null;
    for (const [k, v] of Object.entries(vars)) {
      if (v === null) root.style.removeProperty(k);
      else root.style.setProperty(k, v);
    }
    markWelcome(look.accueilFond === 'logo');
    // Crépuscule : la page et son texte gardent les couleurs du jour, tout le reste est sombre.
    const page = document.getElementById('page');
    if (page) {
      const day = root.dataset.paper === 'light' ? baseColors('light') : null;
      const pageVars = day ? {
        '--page': day.page,
        // Outils posés sur la page (disposition d'un objet…) : aux couleurs de la page claire.
        '--panel': day.panel,
        '--text': day.text,
        '--text-muted': day.muted,
        '--border': day.border,
        '--accent': day.accent,
        '--accent-text': textOn(day.accent),
        '--btn-hover': mix(day.page, day.text, 92),
        '--btn-active': mix(day.page, day.text, 84),
        '--drop': mix(day.accent, day.page, 60),
        '--link': day.link,
        '--link-bg': mix(day.link, 'transparent', 13),
        '--page-shadow': '0 1px 3px rgba(0, 0, 0, 0.45), 0 8px 28px rgba(0, 0, 0, 0.35)',
        'color-scheme': 'light'
      } : {};
      for (const k of PAGE_KEYS) page.style.removeProperty(k);
      for (const [k, v] of Object.entries(pageVars)) page.style.setProperty(k, v);
    }
    if (dialog.open) render();
  }

  function save() {
    onChange(JSON.parse(JSON.stringify(prefs)));
  }

  function set(change) {
    prefs = { ...prefs, ...change };
    apply();
    save();
  }

  // ----- Fenêtre -----

  const el = (tag, props = {}, children = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...children);
    return n;
  };

  // Aperçu miniature d'un thème : panneau de gauche, barre d'outils et page.
  function preview(theme) {
    const c = theme[isDark() ? 'dark' : 'light'];
    const box = el('div', { className: 'theme-preview' });
    box.style.cssText = `--p-bg:${c.bg};--p-side:${c.sidebar};--p-panel:${c.panel};--p-page:${c.page};--p-text:${c.text};--p-muted:${c.muted};--p-border:${c.border};--p-accent:${c.accent};--p-round:${theme.round};font-family:${theme.font}`;
    const look = { ...LOOK_DEFAULT, ...(theme.look || {}) };
    box.dataset.windows = look.windows;
    box.dataset.icons = look.icons;
    box.innerHTML = '<div class="tp-side"><i></i><b></b><b></b><b></b></div><div class="tp-main"><div class="tp-bar"><s></s><s></s><s></s><u></u></div><div class="tp-page"><em>Aa</em><b></b><b></b><b></b></div></div>';
    return box;
  }

  function renderThemes() {
    const grid = el('div', { className: 'theme-grid' });
    for (const t of THEMES) {
      const b = el('button', { type: 'button', className: 'theme-card' + (prefs.theme === t.id ? ' on' : '') }, [
        preview(t),
        el('span', { className: 'theme-name', textContent: t.name }),
        el('span', { className: 'theme-note', textContent: t.note })
      ]);
      b.addEventListener('click', () => set({ theme: t.id, font: '', size: 0, colors: { light: {}, dark: {} }, look: {}, image: prefs.image }));
      grid.append(b);
    }
    return [el('p', { className: 'custom-help', textContent: 'Un thème définit les couleurs, la police, la disposition, le fond, la feuille, les icônes, les fenêtres, l’accueil et le logo. Choisir un thème annule les réglages des autres onglets.' }), grid];
  }

  function renderLook() {
    const look = lookOf();
    const field = (key) => {
      const [label, options] = LOOK[key];
      const s = el('select', { name: 'look-' + key });
      for (const [v, name] of options) s.append(new Option(name, v));
      s.value = look[key];
      s.addEventListener('change', () => set({ look: { ...(prefs.look || {}), [key]: s.value } }));
      return el('label', { className: 'custom-field' }, [label, s]);
    };
    const rows = [];
    for (const [title, keys] of LOOK_GROUPS) {
      rows.push(el('h3', { textContent: title }), ...keys.map(field));
      if (keys.includes('fond') && look.fond === 'image') rows.push(imageRow());
    }
    const reset = el('button', { type: 'button', textContent: 'Revenir à l’aspect du thème' });
    reset.addEventListener('click', () => set({ look: {} }));
    return [
      el('p', { className: 'custom-help', textContent: 'Chaque réglage remplace celui du thème. Les documents et leurs exports ne changent pas.' }),
      el('div', { className: 'custom-look' }, rows),
      el('div', { className: 'custom-actions' }, [reset])
    ];
  }

  // Image de fond : réduite (1920 px au plus) et gardée dans les réglages.
  function imageRow() {
    const input = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const pick = el('button', { type: 'button', textContent: prefs.image ? 'Changer l’image…' : 'Choisir une image…' });
    pick.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * k);
        cv.height = Math.round(img.naturalHeight * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        set({ image: cv.toDataURL('image/jpeg', 0.82) });
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
    const kids = [pick, input];
    if (prefs.image) kids.unshift(el('img', { src: prefs.image, alt: '' }));
    return el('div', { className: 'custom-image' }, kids);
  }

  // Logo en filigrane sur l'accueil : copie du logo de la barre latérale.
  function markWelcome(on) {
    const box = document.querySelector('#welcome .wl-box');
    if (!box) return;
    let mark = box.querySelector('.wl-mark');
    if (!on) { if (mark) mark.remove(); return; }
    if (mark) return;
    const logo = document.querySelector('#sidebar .brand-logo');
    if (!logo) return;
    mark = el('div', { className: 'wl-mark' });
    mark.setAttribute('aria-hidden', 'true');
    mark.append(logo.cloneNode(true));
    box.prepend(mark);
  }

  function renderFont() {
    const font = el('select', { id: 'custom-font' });
    for (const [value, name] of FONTS) {
      const o = new Option(name, value);
      if (value) o.style.fontFamily = value;
      font.append(o);
    }
    font.value = prefs.font || '';
    font.addEventListener('change', () => set({ font: font.value }));
    const size = el('select', { id: 'custom-size' });
    const themeSize = themeOf(prefs.theme).size || 14;
    size.append(new Option(`Celle du thème (${themeSize})`, '0'), ...SIZES.map((n) => new Option(String(n), String(n))));
    if (prefs.size && !SIZES.includes(prefs.size)) size.append(new Option(String(prefs.size).replace('.', ','), String(prefs.size)));
    Object.assign(size.dataset, { min: 10, max: 24 });
    size.value = String(prefs.size || 0);
    size.addEventListener('change', () => set({ size: Number(size.value) }));
    const sample = el('p', { className: 'custom-sample', textContent: 'Projets, sections, menus et boutons s’affichent avec cette police.' });
    return [
      el('p', { className: 'custom-help', textContent: 'Police et taille de l’interface (menus, boutons, panneaux). Le texte de vos documents garde la police choisie dans la barre d’outils.' }),
      el('label', { className: 'custom-field' }, ['Police', font]),
      el('label', { className: 'custom-field' }, ['Taille', size]),
      sample
    ];
  }

  function colorCell(mode, key) {
    const custom = (prefs.colors[mode] || {})[key];
    const input = el('input', { type: 'color', value: baseColors(mode)[key], title: mode === 'dark' ? 'Mode nuit' : 'Mode jour' });
    input.addEventListener('input', () => {
      prefs.colors = { ...prefs.colors, [mode]: { ...(prefs.colors[mode] || {}), [key]: input.value } };
      apply();
    });
    input.addEventListener('change', save);
    const reset = el('button', { type: 'button', className: 'custom-reset', textContent: '↺', title: 'Revenir à la couleur du thème', disabled: !custom });
    reset.addEventListener('click', () => {
      const next = { ...(prefs.colors[mode] || {}) };
      delete next[key];
      set({ colors: { ...prefs.colors, [mode]: next } });
    });
    return el('span', { className: 'custom-color' + (custom ? ' changed' : '') }, [input, reset]);
  }

  function renderColors() {
    const table = el('div', { className: 'custom-colors' }, [
      el('span'), el('span', { className: 'custom-col-head', textContent: '☀ Jour' }), el('span', { className: 'custom-col-head', textContent: '☾ Nuit' })
    ]);
    for (const [key, name, hint] of PARTS) {
      table.append(
        el('span', { className: 'custom-part' }, [el('b', { textContent: name }), el('small', { textContent: hint })]),
        colorCell('light', key),
        colorCell('dark', key)
      );
    }
    const all = el('button', { type: 'button', textContent: 'Revenir aux couleurs du thème' });
    all.addEventListener('click', () => set({ colors: { light: {}, dark: {} } }));
    return [
      el('p', { className: 'custom-help', textContent: 'Chaque partie a une couleur pour le mode jour et une pour le mode nuit (lune). En mode crépuscule, la page et son texte gardent les couleurs du jour, le reste prend celles de la nuit (Ctrl+D pour changer de mode).' }),
      table,
      el('div', { className: 'custom-actions' }, [all])
    ];
  }

  let tab = 'theme';
  function render() {
    dialog.querySelectorAll('.styles-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const panel = $('custom-panel');
    const scroll = panel.scrollTop;
    panel.replaceChildren(...(tab === 'theme' ? renderThemes() : tab === 'aspect' ? renderLook() : tab === 'police' ? renderFont() : renderColors()));
    panel.scrollTop = scroll;
  }

  dialog.querySelectorAll('.styles-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  $('custom-close').addEventListener('click', () => dialog.close());

  function open() {
    render();
    dialog.showModal();
  }

  window.FTCustomize = {
    // prefs enregistrés dans les réglages ; fn reçoit les nouveaux réglages à enregistrer.
    init(saved, fn) {
      if (saved && typeof saved === 'object') {
        prefs = {
          theme: THEMES.some((t) => t.id === saved.theme) ? saved.theme : 'classique',
          font: typeof saved.font === 'string' ? saved.font : '',
          size: Number(saved.size) >= 10 && Number(saved.size) <= 24 ? Number(saved.size) : 0,
          colors: { light: { ...((saved.colors || {}).light || {}) }, dark: { ...((saved.colors || {}).dark || {}) } },
          look: Object.fromEntries(Object.entries(saved.look || {}).filter(([k, v]) => LOOK[k] && LOOK[k][1].some(([x]) => x === v))),
          image: typeof saved.image === 'string' && saved.image.startsWith('data:image/') ? saved.image : ''
        };
      }
      onChange = fn;
      apply();
    },
    apply,
    open
  };
})();
