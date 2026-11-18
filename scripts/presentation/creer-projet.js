// Fabrique le projet du mode présentation (Fichier > « Mode présentation ») dans src/presentation.
// Les documents sont écrits ici en HTML, puis ouverts dans le logiciel (banc d'essai) qui les complète
// avec ses propres outils (thèmes, plan, schémas, styles des tableaux) et les enregistre ; les fichiers
// obtenus sont recopiés dans src/presentation.
// Usage : node scripts/banc-essai/run.js scripts/presentation/creer-projet.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const IMG = require('./illustrations');

const NAME = 'Le Jardin des Quatre Saisons';
const OUT = path.join(__dirname, '..', '..', 'src', 'presentation');

// Identifiants fixes (les liens (( )) les utilisent).
const idOf = (key) => {
  const h = crypto.createHash('sha1').update('tomatoes-presentation:' + key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const KEYS = ['bienvenue', 'presentation', 'ag', 'bureau', 'catalogue', 'calendrier', 'arrosage', 'rapport', 'recettes'];
const ID = Object.fromEntries(KEYS.map((k) => [k, idOf(k)]));

// ----- Petits outils d'écriture -----

const L = (key, text) => `<a class="ft-doclink" contenteditable="false" data-doc="${ID[key]}">${text}</a>`;
const P = (t) => `<p>${t}</p>`;
const H = (n, t, xid) => `<h${n}${xid ? ` data-xid="${xid}"` : ''}>${t}</h${n}>`;
const UL = (items) => '<ul>' + items.map((t) => `<li>${t}</li>`).join('') + '</ul>';
const OL = (items) => '<ol>' + items.map((t) => `<li>${t}</li>`).join('') + '</ol>';
const CHECK = (items) => '<ul class="ft-check">' + items.map(([done, t]) => `<li${done ? ' data-checked="oui"' : ''}>${t}</li>`).join('') + '</ul>';
const BOX = (look, color, ...paras) => `<blockquote class="ft-callout"${look ? ` data-look="${look}"` : ''}${color ? ` data-color="${color}"` : ''}>${paras.map(P).join('')}</blockquote>`;
const QUOTE = (look, text, src) => `<blockquote class="ft-callout ft-quote"${look ? ` data-qlook="${look}"` : ''}><p>${text}</p><p class="ft-quote-src">${src}</p></blockquote>`;
const MARK = (t) => `<span style="background-color: rgb(255, 236, 140);">${t}</span>`;
const MATH = (latex, block) => (block
  ? `<div class="ft-math" contenteditable="false" data-display="block" data-latex="${latex}"></div>`
  : `<span class="ft-math" contenteditable="false" data-latex="${latex}"></span>`);
// Image seule sur sa ligne (comme une image insérée), avec légende numérotée ou non.
const IMAGE = (src, { width = 50, caption = '', num = '', xid = '', wrap = '' } = {}) =>
  `<span class="ft-image"${num ? ` data-num="${num}"` : ''}${xid ? ` data-xid="${xid}"` : ''}${wrap ? ` data-wrap="${wrap}"` : ''} contenteditable="false" style="width: ${width}%">` +
  `<img src="${src}" alt="">${caption ? `<span class="ft-caption" contenteditable="true">${caption}</span>` : ''}</span>`;
// Tableau : la première ligne sert d'en-tête ; le style est posé ensuite par le logiciel (look).
const TABLE = (rows, look, legend, xid) =>
  (legend ? `<p class="ft-legend" data-kind="tableau"${xid ? ` data-xid="${xid}"` : ''}>${legend}</p>` : '') +
  `<table class="ft-table" data-demo-look='${JSON.stringify(look)}'><tbody>` +
  rows.map((r) => '<tr>' + r.map((c) => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
const XREF = (xid, show = 'label') => `<span class="ft-xref" contenteditable="false" data-target="x:${xid}" data-show="${show}"></span>`;
const PLACE = (what) => `<p data-demo="${what}"><br></p>`;

// Notes de bas de page : appel dans le texte, notes rassemblées en fin de document.
function notes() {
  const list = [];
  return {
    ref(text) {
      list.push(text);
      return `<sup class="ft-fn-ref" data-fn="n${list.length}" contenteditable="false">${list.length}</sup>`;
    },
    html: () => (list.length ? '<div class="ft-footnotes"><ol>' + list.map((t, i) => `<li data-fn="n${i + 1}">${t}</li>`).join('') + '</ol></div>' : '')
  };
}

// ----- Documents -----

const DOCS = [];
// Espaces insécables : « 1 200 m² », « 300 g », « 10 h ».
const nbsp = (html) => html.replace(/(\d) (?=\d{3}\b)/g, '$1\u00a0').replace(/(\d) (?=(€|kg|g|m²|m³|mm|cm|°C|h|litres|adhérents|ateliers|participants|élèves)\b|€|m²|m³|°C)/g, '$1\u00a0');
const doc = (key, title, tags, html, settings = {}) => DOCS.push({ key, title, tags, html: nbsp(html), settings });
const T = (name, color) => ({ name, color });

// Accueil : guide de la présentation.
doc('bienvenue', 'Bienvenue', [T('Guide', 'gris')], [
  `<h1 class="ft-title">Bienvenue dans Tomatoes Text</h1>`,
  P('Ce projet de démonstration présente le logiciel à travers les documents d’une association imaginaire, <b>Le Jardin des Quatre Saisons</b>, qui cultive des tomates anciennes en ville. Tout peut être modifié : rien n’est conservé à la sortie du mode présentation.'),
  BOX('fond', 'vert', '<b>À retenir.</b> Les documents sont reliés entre eux par des liens (( )). Un double-clic sur un lien ouvre le document visé, et l’onglet <b>Mindmap</b> montre tous ces liens d’un seul coup d’œil.'),
  H(2, 'Les documents du projet'),
  UL([
    `${L('presentation', 'Présentation de l’association')} : texte, image habillée, citation, tableau.`,
    `${L('ag', 'Assemblée générale du 14 mars 2026')} et ${L('bureau', 'réunion de bureau')} : comptes rendus, votes, cases à cocher.`,
    `${L('catalogue', 'Catalogue des tomates')} : illustrations légendées et numérotées, tableau comparatif, notes de bas de page.`,
    `${L('calendrier', 'Calendrier des semis')} : grand tableau, schéma et dates reprises dans la Carte du temps.`,
    `${L('arrosage', 'Fiche technique sur l’arrosage')} : formules et encadrés.`,
    `${L('rapport', 'Rapport d’activité 2026')} : mode avancé, page de titre, plan, renvois, table des illustrations, index et commentaires.`,
    `${L('recettes', 'Recettes de saison')} : listes, étapes numérotées, astuces.`
  ]),
  H(2, 'Parcours de démonstration'),
  CHECK([
    [true, 'Ouvrir le projet de présentation'],
    [false, 'Afficher la <b>Mindmap</b> (Ctrl+M) et survoler les documents'],
    [false, 'Ouvrir la <b>Carte du temps</b> (Ctrl+Maj+T) : les dates des comptes rendus apparaissent sur la frise'],
    [false, 'Passer le rapport en <b>Mode lecture</b> (Ctrl+Maj+F)'],
    [false, 'Changer de <b>thème du document</b> et de <b>mode jour, crépuscule ou lune</b> (Ctrl+D)'],
    [false, 'Ouvrir l’<b>Aide au texte</b> (Ctrl+Maj+A) et générer un faux texte'],
    [false, 'Exporter un document en Word ou en PDF (Ctrl+Maj+E)']
  ]),
  H(2, 'Raccourcis utiles'),
  TABLE([
    ['Action', 'Raccourci'],
    ['Nouveau document', 'Ctrl+N'],
    ['Rechercher / remplacer', 'Ctrl+F / Ctrl+H'],
    ['Mindmap', 'Ctrl+M'],
    ['Volet de navigation', 'Ctrl+Maj+P'],
    ['Aide au texte', 'Ctrl+Maj+A'],
    ['Mode lecture', 'Ctrl+Maj+F']
  ], { style: 'liste', color: 'theme', header: true, first: true, sep: true, bands: true }),
  P(`Pour quitter, choisissez de nouveau Fichier &gt; ${MARK('Mode présentation')}, ou le bouton « Quitter » en haut de la gestion des projets.`)
].join(''));

// Présentation de l'association.
{
  const n = notes();
  doc('presentation', 'Présentation de l’association', [T('Association', 'vert')], [
    `<h1 class="ft-title">Le Jardin des Quatre Saisons</h1>`,
    IMAGE(IMG.jardin, { width: 46, wrap: 'droite', caption: 'Les carrés potagers de la rue des Tilleuls' }),
    P(`Créée en 2019 par une poignée de voisins, l’association cultive un ancien terrain vague de 1 200 m² au cœur du quartier des Tilleuls${n.ref('Convention d’occupation signée avec la ville le 3 septembre 2019, renouvelée en 2025 pour six ans.')}. Elle compte aujourd’hui 64 adhérents, dont une vingtaine de jardiniers réguliers.`),
    P(`Son projet tient en trois mots : <b>cultiver</b>, <b>transmettre</b> et <b>partager</b>. Les variétés de tomates anciennes y occupent une place particulière ; elles sont décrites dans le ${L('catalogue', 'catalogue des tomates')}, et leurs dates de semis figurent dans le ${L('calendrier', 'calendrier')}.`),
    H(2, 'Nos missions'),
    H(3, 'Cultiver autrement'),
    P('Pas d’engrais de synthèse ni de traitement chimique : le sol est nourri par le compost du quartier, et l’eau de pluie est récupérée sur le toit de la cabane. Chaque parcelle est suivie par un binôme de jardiniers.'),
    H(3, 'Transmettre les savoir-faire'),
    P('Des ateliers ouverts à tous ont lieu le premier samedi de chaque mois : semis, taille, récolte des graines, compostage. Les écoles du quartier y viennent au printemps.'),
    H(3, 'Partager les récoltes'),
    P(`Une partie des récoltes est distribuée à l’épicerie solidaire voisine ; le reste finit en conserves lors de la grande journée de cuisine d’octobre (voir les ${L('recettes', 'recettes de saison')}).`),
    QUOTE('guillemets', 'Un jardin partagé, c’est d’abord une conversation : on y parle du temps qu’il fait, puis on finit par parler de tout.', '— Claire Martin, présidente'),
    H(2, 'Le bureau'),
    TABLE([
      ['Fonction', 'Nom', 'Depuis'],
      ['Présidente', 'Claire Martin', '2019'],
      ['Trésorier', 'Julien Roche', '2021'],
      ['Secrétaire', 'Amina Benali', '2023'],
      ['Référent cultures', 'Paul Girard', '2019']
    ], { style: 'lignes', color: '', header: true, first: true, sep: true }),
    P(`Le bureau est élu chaque année par l’assemblée générale ; le dernier vote figure dans le ${L('ag', 'compte rendu de l’assemblée générale')}.`),
    n.html()
  ].join(''));
}

// Assemblée générale.
{
  const n = notes();
  doc('ag', 'Assemblée générale du 14 mars 2026', [T('Réunion', 'bleu'), T('2026', 'jaune')], [
    `<h1 class="ft-title">Assemblée générale ordinaire</h1>`,
    P('<i>Samedi 14 mars 2026, salle polyvalente des Tilleuls, de 10 h à 12 h 30.</i>'),
    P(`<b>Présents :</b> 41 adhérents sur 64 (dont 7 représentés). Le quorum étant atteint${n.ref('Article 12 des statuts : la moitié des adhérents présents ou représentés.')}, l’assemblée peut délibérer. Séance présidée par Claire Martin ; secrétaire de séance : Amina Benali.`),
    H(2, 'Ordre du jour'),
    OL(['Rapport moral de la présidente', 'Rapport financier et vote du budget', 'Élection du bureau', 'Projets de la saison 2026', 'Questions diverses']),
    H(2, 'Rapport moral'),
    P(`La présidente rappelle les temps forts de l’année écoulée : l’installation de deux nouveaux carrés surélevés en avril 2025, la fête des récoltes du 21 septembre 2025, et le succès des ateliers scolaires. Le détail figure dans le ${L('rapport', 'rapport d’activité')}.`),
    H(2, 'Budget 2026'),
    TABLE([
      ['Poste', 'Dépenses', 'Recettes'],
      ['Cotisations', '', '1 280 €'],
      ['Subvention de la ville', '', '1 500 €'],
      ['Semences et plants', '420 €', ''],
      ['Matériel et outillage', '610 €', ''],
      ['Récupérateurs d’eau', '780 €', ''],
      ['Assurance', '230 €', ''],
      ['Fête des récoltes', '340 €', '400 €'],
      ['Total', '2 380 €', '3 180 €']
    ], { style: 'liste', color: 'vert', header: true, total: true, first: true, sep: true }, 'Budget prévisionnel 2026'),
    P('Le budget est adopté à l’unanimité moins deux abstentions.'),
    H(2, 'Votes'),
    TABLE([
      ['Résolution', 'Pour', 'Contre', 'Abstention'],
      ['Rapport moral', '41', '0', '0'],
      ['Rapport financier', '39', '0', '2'],
      ['Budget 2026', '39', '0', '2'],
      ['Élection du bureau', '40', '0', '1']
    ], { style: 'colore', color: 'bleu', header: true, first: true, sep: true, bands: true }),
    BOX('bandeau', 'vert', '<b>Décision.</b> Le bureau sortant est réélu pour un an. Un récupérateur d’eau de 1 000 litres sera installé avant le 15 mai 2026.'),
    H(2, 'Projets de la saison'),
    UL([
      'Agrandir la serre de semis (devis à demander) ;',
      `Tester trois nouvelles variétés, dont la Green Zebra (voir le ${L('catalogue', 'catalogue')}) ;`,
      'Accueillir deux classes de l’école Jean-Macé au printemps.'
    ]),
    H(2, 'Actions à suivre'),
    CHECK([
      [true, 'Envoyer le compte rendu aux adhérents (Amina)'],
      [false, 'Demander trois devis pour la serre (Paul)'],
      [false, 'Commander les semences avant le 31 mars 2026 (Julien)'],
      [false, `Préparer la ${L('bureau', 'réunion de bureau de juin')} (Claire)`]
    ]),
    n.html()
  ].join(''));
}

doc('bureau', 'Réunion de bureau du 2 juin 2026', [T('Réunion', 'bleu'), T('2026', 'jaune')], [
  `<h1 class="ft-title">Réunion de bureau</h1>`,
  P('<i>Mardi 2 juin 2026, à la cabane du jardin. Présents : Claire Martin, Julien Roche, Amina Benali, Paul Girard.</i>'),
  H(2, 'Point sur les décisions de mars'),
  P(`Suivi des actions votées lors de l’${L('ag', 'assemblée générale du 14 mars')}. Le récupérateur d’eau a été installé le 12 mai 2026, avec trois jours d’avance.`),
  TABLE([
    ['Action', 'Responsable', 'Échéance', 'État'],
    ['Récupérateur d’eau', 'Paul', '15 mai', 'Fait'],
    ['Devis serre', 'Paul', '30 juin', 'En cours'],
    ['Commande semences', 'Julien', '31 mars', 'Fait'],
    ['Accueil des classes', 'Amina', '19 juin', 'Prévu']
  ], { style: 'clair', color: 'bleu', header: true, first: true, sep: true }),
  H(2, 'Arrosage pendant l’été'),
  P(`Un tour d’arrosage est organisé du 1er juillet au 31 août, selon la ${L('arrosage', 'fiche technique')}. Les tomates seront paillées avant le départ en congés, comme prévu au ${L('calendrier', 'calendrier')}.`),
  BOX('trait', 'bleu', 'Prochaine réunion : mardi 1er septembre 2026, 18 h 30.')
].join(''));

// Catalogue des tomates.
{
  const n = notes();
  const fiche = (rows) => TABLE([['Caractère', 'Valeur'], ...rows], { style: 'lignes', color: 'rouge', header: false, first: true, sep: true });
  doc('catalogue', 'Catalogue des tomates', [T('Tomates', 'rouge')], [
    `<h1 class="ft-title">Catalogue des tomates</h1>`,
    P(`Quatre variétés cultivées au jardin, choisies pour leur goût et leur robustesse. Les dates de semis et de plantation sont dans le ${L('calendrier', 'calendrier des semis')} ; l’arrosage est détaillé dans la ${L('arrosage', 'fiche technique')}.`),
    H(2, 'Cœur de bœuf'),
    IMAGE(IMG.coeur, { width: 34, num: 'figure', caption: 'Cœur de bœuf' }),
    P(`Grosse tomate charnue en forme de cœur, peu de graines et une chair fondante. Idéale en salade, avec un filet d’huile d’olive${n.ref('Le nom « cœur de bœuf » désigne plusieurs variétés ; celle du jardin est l’Oxheart, d’origine américaine.')}.`),
    fiche([['Poids moyen', '300 à 500 g'], ['Précocité', 'Tardive'], ['Usage', 'Salade, farcie']]),
    H(2, 'Noire de Crimée'),
    IMAGE(IMG.noire, { width: 34, num: 'figure', caption: 'Noire de Crimée' }),
    P('Variété ancienne à la peau brun-pourpre et au goût sucré, légèrement fumé. Elle supporte bien la chaleur mais craint les excès d’eau.'),
    fiche([['Poids moyen', '200 à 300 g'], ['Précocité', 'Mi-saison'], ['Usage', 'Salade, coulis']]),
    H(2, 'Green Zebra'),
    IMAGE(IMG.zebra, { width: 34, num: 'figure', caption: 'Green Zebra' }),
    P(`Tomate verte zébrée de jaune à maturité, acidulée et très parfumée. ${MARK('Nouveauté 2026')} : elle sera testée sur deux parcelles.`),
    fiche([['Poids moyen', '80 à 120 g'], ['Précocité', 'Mi-saison'], ['Usage', 'Salade, chutney']]),
    H(2, 'Cerise rouge'),
    IMAGE(IMG.cerise, { width: 34, num: 'figure', caption: 'Grappe de tomates cerises' }),
    P(`Petits fruits en grappes, très productifs du début de l’été jusqu’aux premières gelées. Les enfants les mangent directement sur le pied${n.ref('Observation faite lors de chaque atelier scolaire, sans exception.')}.`),
    fiche([['Poids moyen', '15 à 20 g'], ['Précocité', 'Précoce'], ['Usage', 'Apéritif, cuisson rapide']]),
    H(2, 'Comparatif'),
    TABLE([
      ['Variété', 'Goût', 'Rendement', 'Résistance', 'Note du jardin'],
      ['Cœur de bœuf', 'Doux', 'Moyen', 'Moyenne', '★★★★'],
      ['Noire de Crimée', 'Sucré, fumé', 'Bon', 'Bonne', '★★★★★'],
      ['Green Zebra', 'Acidulé', 'Bon', 'Moyenne', '★★★'],
      ['Cerise rouge', 'Sucré', 'Très bon', 'Très bonne', '★★★★']
    ], { style: 'colore', color: 'rouge', header: true, first: true, sep: true, bands: true }, 'Comparatif des variétés'),
    P(`Ces variétés se retrouvent dans les ${L('recettes', 'recettes de saison')}.`),
    n.html()
  ].join(''));
}

doc('calendrier', 'Calendrier des semis', [T('Calendrier', 'orange'), T('Tomates', 'rouge')], [
  `<h1 class="ft-title">Calendrier des semis</h1>`,
  P(`Repères pour la saison 2026 au jardin, sous un climat tempéré. Les variétés sont décrites dans le ${L('catalogue', 'catalogue')}.`),
  H(2, 'Du semis à la récolte'),
  PLACE('diagram:cycle'),
  H(2, 'Mois par mois'),
  TABLE([
    ['Étape', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Sept.'],
    ['Semis au chaud', '●', '●', '', '', '', '', ''],
    ['Repiquage', '', '●', '●', '', '', '', ''],
    ['Plantation', '', '', '●', '●', '', '', ''],
    ['Paillage', '', '', '', '●', '●', '', ''],
    ['Récolte', '', '', '', '', '●', '●', '●'],
    ['Graines', '', '', '', '', '', '●', '●']
  ], { style: 'raye', color: 'orange', header: true, first: true, sep: true, bands: true }, 'Calendrier de culture des tomates'),
  BOX('bandeau', 'ambre', '<b>Attention.</b> Ne pas planter en pleine terre avant les saints de glace (11, 12 et 13 mai) : une gelée tardive suffit à perdre les jeunes plants.'),
  H(2, 'Dates de la saison 2026'),
  UL([
    'Semis collectif : samedi 7 mars 2026, à la serre.',
    'Repiquage en godets : samedi 11 avril 2026.',
    'Plantation au jardin : samedi 16 mai 2026.',
    'Fête des récoltes : dimanche 20 septembre 2026.'
  ]),
  P(`Pendant l’été, l’arrosage suit la ${L('arrosage', 'fiche technique')}.`)
].join(''));

doc('arrosage', 'Fiche – Arrosage et paillage', [T('Technique', 'violet')], [
  `<h1 class="ft-title">Arrosage et paillage</h1>`,
  P('Arroser moins souvent mais plus profondément : les racines descendent chercher l’eau, et la plante résiste mieux à la sécheresse.'),
  H(2, 'Quelle quantité d’eau ?'),
  P(`Le volume à apporter dépend de la surface de la parcelle ${MATH('S')} et de la hauteur d’eau voulue ${MATH('h')} :`),
  MATH('V=S\\times h', true),
  P(`Pour une parcelle de 6 m² et 20 mm d’eau par semaine, il faut donc ${MATH('6\\times0{,}02=0{,}12')} m³, soit 120 litres par semaine.`),
  BOX('fond', 'vert', '<b>Astuce.</b> Un paillage de 5 à 10 cm réduit l’arrosage de moitié environ, et limite les mauvaises herbes.'),
  H(2, 'Bonnes pratiques'),
  OL([
    'Arroser le matin tôt, au pied, sans mouiller le feuillage.',
    'Utiliser l’eau de pluie, plus douce et à température ambiante.',
    'Pailler après une bonne pluie, sur un sol déjà humide.',
    'Supprimer les feuilles du bas qui touchent le sol.'
  ]),
  TABLE([
    ['Paillage', 'Épaisseur', 'Durée', 'Remarque'],
    ['Paille', '10 cm', 'Une saison', 'Économique'],
    ['Tontes séchées', '5 cm', 'Quelques semaines', 'À renouveler'],
    ['Feuilles mortes', '8 cm', 'Une saison', 'Gratuites à l’automne'],
    ['Copeaux de bois', '5 cm', 'Deux ans', 'Pour les allées']
  ], { style: 'grille', color: 'violet', header: true, first: true, sep: true }, 'Matériaux de paillage'),
  BOX('bandeau', 'rouge', '<b>Important.</b> Un arrosage irrégulier fait éclater les fruits et favorise la nécrose apicale (le « cul noir »).'),
  P(`Le calendrier de paillage est dans le ${L('calendrier', 'calendrier des semis')}.`)
].join(''));

// Rapport d'activité (mode avancé).
{
  const n = notes();
  const cover = '<div class="ft-cover" contenteditable="false" data-model="botanique">' +
    '<div class="ft-cover-head"><p class="ft-cover-field" data-field="surtitre" data-ph="Organisme ou établissement" contenteditable="true">Association Le Jardin des Quatre Saisons</p></div>' +
    '<div class="ft-cover-main"><p class="ft-cover-field" data-field="titre" data-ph="Titre" contenteditable="true">Rapport d’activité 2026</p><p class="ft-cover-field" data-field="soustitre" data-ph="Sous-titre" contenteditable="true">Une saison au jardin</p></div>' +
    '<div class="ft-cover-foot"><p class="ft-cover-field" data-field="auteur" data-ph="Auteur" contenteditable="true">Claire Martin et Amina Benali</p><p class="ft-cover-field" data-field="date" data-ph="Date" contenteditable="true">Octobre 2026</p><p class="ft-cover-field" data-field="mention" data-ph="Mention (type de document, version)" contenteditable="true">Document présenté à l’assemblée générale</p></div></div>';
  doc('rapport', 'Rapport d’activité 2026', [T('Rapport', 'jaune'), T('2026', 'jaune'), T('Association', 'vert')], [
    cover,
    PLACE('toc'),
    H(2, 'Introduction', 'intro'),
    P(`L’année 2026 a été celle de la consolidation. Le nombre d’adhérents est passé de 52 à 64, les récoltes ont atteint 641 kg, et les ateliers ont accueilli plus de 300 participants. Ce rapport présente le bilan de la saison, adopté en partie lors de l’${L('ag', 'assemblée générale du 14 mars 2026')}.`),
    H(2, 'Organisation', 'orga'),
    P(`L’association est administrée par un bureau de quatre membres, élu chaque année ; son fonctionnement est rappelé dans la ${L('presentation', 'présentation de l’association')} et résumé par le ${XREF('org')} ci-dessous.`),
    PLACE('diagram:org'),
    H(2, 'Les cultures', 'cultures'),
    H(3, 'Les récoltes'),
    P(`Les récoltes de tomates ont atteint leur maximum en août, avec 236 kg (voir la ${XREF('fig-recoltes')}). Les variétés anciennes du ${L('catalogue', 'catalogue')} ont toutes bien donné, malgré un mois de juin pluvieux${n.ref('Météo-France : 112 mm de pluie en juin 2026, contre 68 mm en moyenne.')}.`),
    IMAGE(IMG.recoltes, { width: 80, num: 'figure', xid: 'fig-recoltes', caption: 'Récoltes de tomates par mois (kg)' }),
    H(3, 'Les variétés'),
    P(`Le ${XREF('tab-varietes')} détaille les rendements par variété. La Noire de Crimée confirme sa première place ; la Green Zebra, testée cette année, sera reconduite.`),
    TABLE([
      ['Variété', 'Pieds', 'Récolte', 'Par pied'],
      ['Cœur de bœuf', '24', '168 kg', '7,0 kg'],
      ['Noire de Crimée', '20', '172 kg', '8,6 kg'],
      ['Green Zebra', '12', '71 kg', '5,9 kg'],
      ['Cerise rouge', '30', '230 kg', '7,7 kg'],
      ['Total', '86', '641 kg', '7,5 kg']
    ], { style: 'liste', color: 'theme', header: true, total: true, first: true, sep: true }, 'Rendements par variété', 'tab-varietes'),
    H(2, 'Les ateliers', 'ateliers'),
    P(`Douze ateliers ont eu lieu, dont quatre avec les écoles du quartier. Le compostage et la récolte des graines restent les plus demandés. La journée de cuisine du 10 octobre 2026 a produit 180 bocaux de coulis, selon les ${L('recettes', 'recettes de saison')}.`),
    UL(['Semis et repiquage : 3 ateliers, 74 participants ;', 'Compostage : 3 ateliers, 61 participants ;', 'Récolte des graines : 2 ateliers, 48 participants ;', 'Ateliers scolaires : 4 séances, 120 élèves.']),
    QUOTE('', 'Les enfants repartent avec un plant de tomate dans un pot de yaourt. En septembre, certains reviennent nous montrer leurs récoltes.', '— Paul Girard, référent cultures'),
    H(2, 'Perspectives', 'perspectives'),
    P(`Pour 2027, le bureau propose d’agrandir la serre, de créer une grainothèque ouverte au quartier, et de publier ce catalogue de variétés. <span class="ft-comment" data-c="c1">Le budget de ces projets reste à confirmer</span> lors de la prochaine assemblée générale.`),
    '<div class="ft-lof" contenteditable="false" data-kind="tout"></div>',
    '<div class="ft-index" contenteditable="false"></div>',
    n.html()
  ].join(''), {
    mode: 'avance',
    index: [
      { term: 'atelier', variants: ['ateliers'], parent: '' },
      { term: 'compostage', variants: [], parent: '' },
      { term: 'Green Zebra', variants: [], parent: '' },
      { term: 'Noire de Crimée', variants: [], parent: '' },
      { term: 'récolte', variants: ['récoltes'], parent: '' },
      { term: 'serre', variants: [], parent: '' }
    ],
    comments: [{
      id: 'c1', author: 'Julien Roche', date: '2026-10-18T09:20:00.000Z',
      text: 'Le devis de la serre est arrivé : 2 400 €. À présenter avec le budget 2027.', done: false,
      replies: [{ author: 'Claire Martin', date: '2026-10-18T17:05:00.000Z', text: 'Merci, je l’ajoute à l’ordre du jour.' }]
    }]
  });
}

doc('recettes', 'Recettes de saison', [T('Cuisine', 'rose'), T('Tomates', 'rouge')], [
  `<h1 class="ft-title">Recettes de saison</h1>`,
  IMAGE(IMG.panier, { width: 42, caption: 'La récolte du samedi' }),
  P(`Trois recettes de la journée de cuisine d’octobre, avec les variétés du ${L('catalogue', 'catalogue')}.`),
  H(2, 'Coulis de tomates'),
  H(3, 'Ingrédients (6 bocaux)'),
  UL(['3 kg de tomates bien mûres (Noire de Crimée ou Cœur de bœuf)', '2 oignons', '3 gousses d’ail', '1 bouquet de basilic', 'Huile d’olive, sel, poivre']),
  H(3, 'Préparation'),
  OL(['Faire revenir les oignons émincés dans l’huile d’olive.', 'Ajouter les tomates coupées en morceaux et l’ail écrasé.', 'Laisser mijoter 45 minutes à feu doux, à couvert.', 'Mixer, ajouter le basilic, puis mettre en bocaux bien chauds.']),
  BOX('fond', 'vert', '<b>Astuce.</b> Une cuillère de sucre corrige l’acidité des tomates encore un peu vertes.'),
  H(2, 'Salade tricolore'),
  P('Couper en tranches une Cœur de bœuf, une Noire de Crimée et une Green Zebra. Alterner les couleurs sur un grand plat, ajouter de la mozzarella, du basilic et un filet d’huile d’olive. Servir aussitôt.'),
  H(2, 'Tomates cerises rôties'),
  P('Disposer les grappes entières dans un plat, arroser d’huile, saler, ajouter du thym. Enfourner 20 minutes à 200 °C. Les servir tièdes, sur une tartine de fromage frais.'),
  QUOTE('', 'Une tomate cueillie le matin n’a pas le même goût le soir.', '— Proverbe du jardin')
].join(''));

// ----- Schémas (dessinés avec l'outil Schéma du logiciel) -----

const NODE = { shape: 'arrondi', w: 140, h: 56, text: '', fill: '#fde2e1', stroke: '#c8402c', strokeWidth: 1.5, dash: '', shadow: false, opacity: 1,
  font: 'Segoe UI', fontSize: 14, bold: false, italic: false, textColor: '#78281f', align: 'center' };
const LINK = { route: 'coude', color: '#8c7b70', width: 1.5, dash: '', start: '', end: 'pleine', label: '' };
const node = (id, x, y, text, more = {}) => ({ ...NODE, id, x, y, text, ...more });
const link = (id, a, sa, b, sb, more = {}) => ({ ...LINK, id, from: { node: a, side: sa }, to: { node: b, side: sb }, ...more });
const GREEN = { fill: '#d5f5e3', stroke: '#27ae60', textColor: '#145a32' };
const DIAGRAMS = {
  cycle: {
    caption: 'Le cycle des tomates au jardin', width: 96,
    data: { v: 1, background: '#ffffff', nodes: [
      node('a', 0, 0, 'Semis', { shape: 'ellipse', w: 110 }),
      node('b', 150, 0, 'Repiquage', { w: 120 }),
      node('c', 310, 0, 'Plantation', { w: 120 }),
      node('d', 470, 0, 'Récolte', { w: 110, ...GREEN, bold: true }),
      node('e', 470, 110, 'Graines', { shape: 'note', w: 110, fill: '#fcf3cf', stroke: '#d4ac0d', textColor: '#7d6608' })
    ], links: [
      link('l1', 'a', 'e', 'b', 'w'), link('l2', 'b', 'e', 'c', 'w'), link('l3', 'c', 'e', 'd', 'w'),
      link('l4', 'd', 's', 'e', 'n'), link('l5', 'e', 'w', 'a', 's', { dash: 'tirets', label: 'l’année suivante' })
    ] }
  },
  org: {
    caption: 'Organisation de l’association', width: 88, xid: 'org',
    data: { v: 1, background: '#ffffff', nodes: [
      node('ag', 170, 0, 'Assemblée générale', { w: 180, bold: true }),
      node('bu', 170, 100, 'Bureau (4 membres)', { w: 180, ...GREEN }),
      node('c1', 0, 210, 'Cultures', { w: 140, shape: 'rect', fill: '#ffffff' }),
      node('c2', 190, 210, 'Ateliers', { w: 140, shape: 'rect', fill: '#ffffff' }),
      node('c3', 380, 210, 'Cuisine et partage', { w: 140, shape: 'rect', fill: '#ffffff' })
    ], links: [
      link('l1', 'ag', 's', 'bu', 'n', { label: 'élit' }), link('l2', 'bu', 's', 'c1', 'n'), link('l3', 'bu', 's', 'c2', 'n'), link('l4', 'bu', 's', 'c3', 'n')
    ] }
  }
};

// ----- Rangement dans les sections -----

const SECTIONS = [
  { id: 'sacc', name: 'Accueil', collapsed: false, children: [] },
  { id: 'sass', name: 'L’association', collapsed: false, children: [{ id: 'sreu', name: 'Réunions', collapsed: false, children: [] }] },
  { id: 'sjar', name: 'Au jardin', collapsed: false, children: [{ id: 'sfic', name: 'Fiches techniques', collapsed: false, children: [] }] },
  { id: 'spub', name: 'Publications', collapsed: false, children: [] }
];
const PLACEMENT = {
  bienvenue: 'sacc', presentation: 'sass', ag: 'sreu', bureau: 'sreu', catalogue: 'sjar', calendrier: 'sjar', arrosage: 'sfic', rapport: 'spub', recettes: 'spub'
};

// ----- Fabrication -----

module.exports = async ({ page, electron }) => {
  const { handlers, paths } = electron._test;
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  await call('project:create', NAME);
  const lib = await call('library:load', NAME);
  const dir = lib.folder;
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  const date = '2026-10-20T08:00:00.000Z';
  for (const d of DOCS) {
    const json = {
      format: 'frame-text', version: 1, id: ID[d.key], title: d.title, created: date, modified: date,
      settings: { autoIndent: false, titleInText: true, ...d.settings }, content: { html: d.html }, tags: d.tags, links: [], meta: {}
    };
    fs.writeFileSync(path.join(dir, d.title.replace(/[<>:"/\\|?*]/g, '') + '.tmtx'), JSON.stringify(json, null, 2));
  }
  fs.writeFileSync(path.join(dir, 'bibliotheque.json'), JSON.stringify({
    sections: SECTIONS, placement: Object.fromEntries(Object.entries(PLACEMENT).map(([k, s]) => [ID[k], s])), unsortedCollapsed: false
  }, null, 2));
  await page.reload();
  await page.waitForTimeout(1500);

  for (const d of DOCS) {
    const theme = d.key === 'rapport' ? 'Carmin' : 'Carnet';
    await page.evaluate(async ({ id, theme, diagrams }) => {
      await window.FTApp.openDocById(id);
      const editor = document.getElementById('editor');
      // Thème du document ; les encadrés et citations gardent ensuite la forme et la couleur choisies ici.
      const boxes = [...editor.querySelectorAll('blockquote.ft-callout')].map((b) => [b, b.dataset.look, b.dataset.qlook, b.dataset.color]);
      window.FTTheme.open();
      const card = [...document.querySelectorAll('.th-card')].find((b) => b.querySelector('.theme-name').textContent.replace(' ★', '') === theme);
      card.click();
      document.getElementById('theme-close').click();
      for (const [b, look, qlook, color] of boxes) {
        for (const [k, v] of [['look', look], ['qlook', qlook], ['color', color]]) { if (v) b.dataset[k] = v; else delete b.dataset[k]; }
      }
      // Styles des tableaux.
      for (const t of editor.querySelectorAll('table[data-demo-look]')) {
        const look = JSON.parse(t.dataset.demoLook);
        t.removeAttribute('data-demo-look');
        window.FTStructure.setTableLook(t, look);
      }
      // Plan du document.
      const tocHere = editor.querySelector('[data-demo="toc"]');
      if (tocHere) {
        window.FTStructure.placeCaret(tocHere);
        window.FTToc.insert();
        tocHere.remove();
      }
      // Schémas.
      for (const p of editor.querySelectorAll('[data-demo^="diagram:"]')) {
        const spec = diagrams[p.dataset.demo.slice(8)];
        const svg = window.FTDiagram.exportSvg(spec.data);
        const url = window.FTLayout.imageUrl('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))));
        const box = window.FTLayout.makeImage(url, 600);
        box.dataset.diagram = JSON.stringify(spec.data);
        box.classList.add('ft-diagram');
        box.style.width = spec.width + '%';
        box.dataset.num = 'schema';
        if (spec.xid) box.dataset.xid = spec.xid;
        const cap = document.createElement('span');
        cap.className = 'ft-caption';
        cap.setAttribute('contenteditable', 'true');
        cap.textContent = spec.caption;
        box.append(cap);
        p.replaceWith(box);
      }
      window.FTCaptions.refresh();
      window.FTXref.refresh();
      window.FTToc.refresh();
      editor.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 300));
      await window.FTApp.menu('save');
    }, { id: ID[d.key], theme, diagrams: DIAGRAMS });
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(800);

  // Copie dans src/presentation : seulement les documents et le rangement.
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  // Noms de fichiers simples (sans accents) : le logiciel les renomme d'après le titre au premier enregistrement.
  for (const f of fs.readdirSync(dir)) {
    if (!/\.tmtx$/.test(f) && f !== 'bibliotheque.json') continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    let name = f;
    if (data.id) {
      data.created = date;
      data.modified = date;
      const key = KEYS.find((k) => ID[k] === data.id);
      name = String(KEYS.indexOf(key) + 1).padStart(2, '0') + '-' + key + '.tmtx';
    }
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
  }
  console.log('  Projet écrit dans ' + OUT + ' : ' + fs.readdirSync(OUT).join(', '));
};
module.exports.ID = ID;
module.exports.NAME = NAME;
