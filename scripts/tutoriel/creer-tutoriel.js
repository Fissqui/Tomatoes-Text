// Fabrique le projet « Tutoriel » (src/tutoriel), proposé au premier lancement et rouvert par Aide > Tutoriel.
// Les documents sont écrits ici en HTML, puis ouverts dans le logiciel (banc d'essai) qui les met en forme
// avec ses propres outils (thème du document, styles des tableaux, plan, schémas) et les enregistre ; les
// fichiers obtenus sont recopiés dans src/tutoriel.
// Usage : node scripts/banc-essai/run.js scripts/tutoriel/creer-tutoriel.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const IMG = require('../presentation/illustrations');

const NAME = 'Tutoriel';
const OUT = path.join(__dirname, '..', '..', 'src', 'tutoriel');
const THEME = 'Moderne';
const THEME_AVANCE = 'Rapport';

// Identifiants fixes (les liens entre documents les utilisent).
const idOf = (key) => {
  const h = crypto.createHash('sha1').update('tomatoes-tutoriel:' + key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const KEYS = ['bienvenue', 'projets', 'modes', 'barres', 'texte', 'tableaux', 'objets', 'liens', 'miseenpage', 'relecture', 'exports', 'personnaliser'];
const ID = Object.fromEntries(KEYS.map((k) => [k, idOf(k)]));

// ----- Petits outils d'écriture -----

const L = (key, text) => `<a class="ft-doclink" contenteditable="false" data-doc="${ID[key]}">${text}</a>`;
const P = (t) => `<p>${t}</p>`;
const H = (n, t, xid) => `<h${n}${xid ? ` data-xid="${xid}"` : ''}>${t}</h${n}>`;
const UL = (items) => '<ul>' + items.map((t) => `<li>${t}</li>`).join('') + '</ul>';
const OL = (items) => '<ol>' + items.map((t) => `<li>${t}</li>`).join('') + '</ol>';
const CHECK = (items) => '<ul class="ft-check">' + items.map((t) => `<li>${t}</li>`).join('') + '</ul>';
const BOX = (look, color, ...paras) => `<blockquote class="ft-callout"${look ? ` data-look="${look}"` : ''}${color ? ` data-color="${color}"` : ''}>${paras.map(P).join('')}</blockquote>`;
const QUOTE = (look, text, src) => `<blockquote class="ft-callout ft-quote"${look ? ` data-qlook="${look}"` : ''}><p>${text}</p><p class="ft-quote-src">${src}</p></blockquote>`;
const MARK = (t) => `<span style="background-color: rgb(255, 236, 140);">${t}</span>`;
const K = (t) => `<b>${t}</b>`; // touche ou combinaison de touches
// Formule : dessinée par MathLive dans le logiciel au moment de la fabrication (repère @@MATHn@@ d'ici là).
const FORMULAS = [];
const MATH = (latex, block) => {
  FORMULAS.push({ latex, block });
  const mark = `@@MATH${FORMULAS.length - 1}@@`;
  return block
    ? `<div class="ft-math" contenteditable="false" data-display="block" data-latex="${latex}">${mark}</div>`
    : `<span class="ft-math" contenteditable="false" data-latex="${latex}">${mark}</span>`;
};
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
// Style commun des tableaux de référence (outil, rôle).
const REF = { style: 'liste', color: 'theme', header: true, first: true, sep: true, bands: true };
const TRY = (...items) => H(2, 'À essayer') + CHECK(items);

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

const DOCS = [];
const nbsp = (html) => html.replace(/(\d) (?=(Mo|mm|cm|%|pages?|documents?)\b)/g, '$1 ');
// Noms numérotés : la liste des documents les range dans l'ordre de lecture (le titre dans la page reste sans numéro).
const doc = (key, title, tags, html, settings = {}) => DOCS.push({ key, title: `${KEYS.indexOf(key) + 1}. ${title}`, tags, html: nbsp(html), settings });
const T = (name, color) => ({ name, color });
const SUITE = (key, text) => P(`<b>Suite :</b> ${L(key, text)}.`);

// ----- 1. Accueil -----

doc('bienvenue', 'Bienvenue dans Tomatoes Text', [T('Tutoriel', 'rouge')], [
  `<h1 class="ft-title">Bienvenue dans Tomatoes Text</h1>`,
  P('Tomatoes Text est un logiciel d’écriture pour les notes, les cours, les rapports et les livres. Ce tutoriel présente ses outils en douze documents courts, à lire dans l’ordre ou selon les besoins.'),
  BOX('fond', 'vert', `<b>Lire le tutoriel.</b> Les mots en couleur sont des liens vers les autres documents du tutoriel : ${K('double-clic')} ou ${K('Ctrl+clic')} pour les ouvrir. La liste de gauche affiche tous les documents du projet « Tutoriel ».`),
  P('Les documents du tutoriel sont modifiables : chaque exercice se fait directement dans la page. Pour retrouver le tutoriel d’origine, supprimez le projet « Tutoriel », puis choisissez Aide &gt; Tutoriel : il est réinstallé.'),
  H(2, 'Sommaire'),
  H(3, 'Débuter'),
  UL([
    `${L('projets', 'Projets et documents')} : ranger, retrouver et enregistrer.`,
    `${L('modes', 'Interface note et interface avancée')} : écrire sans pages, ou en pages comme dans Word.`,
    `${L('barres', 'Les barres d’outils')} : où trouver chaque outil.`
  ]),
  H(3, 'Écrire'),
  UL([
    `${L('texte', 'Mettre en forme le texte')} : caractères, titres, listes, saisie automatique.`,
    `${L('tableaux', 'Les tableaux')} : insérer, modifier, mettre en forme.`,
    `${L('objets', 'Images, schémas et formules')} : illustrer un document.`,
    `${L('liens', 'Liens, notes et sources')} : relier les documents, citer, annoter.`
  ]),
  H(3, 'Finaliser'),
  UL([
    `${L('miseenpage', 'Mise en page')} : modèles, thèmes, page de titre, plan, numéros de page.`,
    `${L('relecture', 'Relire et améliorer')} : commentaires, suivi des modifications, correcteur, Aide au texte.`,
    `${L('exports', 'Exporter et partager')} : Word, PDF, livre et EPUB.`,
    `${L('personnaliser', 'Personnaliser le logiciel')} : thème, raccourcis, barres d’outils.`
  ]),
  H(2, 'Premiers gestes'),
  CHECK([
    'Cocher cette case d’un clic : les listes à cocher servent de liste de tâches.',
    `Écrire une phrase sous cette liste : le document est enregistré automatiquement.`,
    `Ouvrir le document ${L('projets', 'Projets et documents')} par un double-clic sur son nom.`,
    `Appuyer sur ${K('Ctrl+K')} et taper « tableau » : la recherche d’outils trouve toute commande du logiciel.`
  ]),
  H(2, 'Raccourcis essentiels'),
  TABLE([
    ['Action', 'Raccourci'],
    ['Nouveau document', 'Ctrl+N'],
    ['Rechercher un outil', 'Ctrl+K'],
    ['Rechercher / remplacer', 'Ctrl+F / Ctrl+H'],
    ['Annuler / rétablir', 'Ctrl+Z / Ctrl+Y'],
    ['Liste des documents', 'Ctrl+Maj+B'],
    ['Volet de navigation (titres)', 'Ctrl+Maj+P'],
    ['Exporter', 'Ctrl+Maj+E']
  ], REF),
  P('La liste complète des raccourcis, modifiable, est dans Affichage &gt; Raccourcis clavier.')
].join(''));

// ----- 2. Projets et documents -----

doc('projets', 'Projets et documents', [T('Tutoriel', 'rouge'), T('Débuter', 'vert')], [
  `<h1 class="ft-title">Projets et documents</h1>`,
  P('Les documents sont rangés par <b>projets</b>. Chaque projet est un dossier du disque, dans le dossier de stockage (par défaut Documents\\Tomatoes Text\\Projets). Un document est un fichier .tmtx.'),
  H(2, 'La liste des documents'),
  P(`La colonne de gauche affiche le projet ouvert et ses documents. Elle se masque et se réaffiche par ${K('Ctrl+Maj+B')}.`),
  TABLE([
    ['Élément', 'Rôle'],
    ['Projet sélectionné', 'Passer d’un projet à l’autre ; le bouton ⋯ crée, renomme ou supprime un projet et change le dossier de stockage.'],
    ['+ Section', 'Créer une section, pour classer les documents par thème ; une section peut contenir des sous-sections.'],
    ['+ Document', 'Créer un document vide dans le projet.'],
    ['Rechercher', 'Filtrer la liste par nom, ou par tag en commençant par #.'],
    ['Clic droit sur un document', 'Ouvrir, renommer, déplacer, résumer, consulter l’historique des versions, supprimer.'],
    ['Ouvrir un fichier…', 'Ouvrir un document .tmtx ou importer un document Word (.docx).']
  ], REF),
  P('Les documents se déplacent d’une section à l’autre par glisser-déposer. Les sections n’existent que dans le logiciel : les fichiers restent dans le dossier du projet.'),
  H(2, 'Enregistrement'),
  UL([
    `Le document est <b>enregistré automatiquement</b> pendant la frappe ; ${K('Ctrl+S')} enregistre immédiatement.`,
    `<b>Fichier &gt; Historique des versions</b> (${K('Ctrl+Maj+H')}) retrouve les états précédents du document et permet d’en restaurer un.`,
    `<b>Fichier &gt; Enregistrer une copie sous</b> (${K('Ctrl+Maj+S')}) crée un double du document à un autre endroit.`,
    'Le nom du document, en haut de la page, se modifie d’un clic.'
  ]),
  H(2, 'L’accueil'),
  P('Au démarrage, l’accueil propose de reprendre le dernier document, d’ouvrir un document récent de n’importe quel projet, de créer un document (vide ou depuis un modèle), d’importer un document Word ou d’ouvrir ce tutoriel. Il se rouvre par Fichier &gt; Accueil ou d’un clic sur le logo.'),
  H(2, 'Les tags'),
  P('Les tags sont des étiquettes de couleur placées au-dessus du document (bouton <b>Tags</b>, à droite de la barre d’insertion). Ils servent à filtrer la liste des documents (#nom du tag) et la Mindmap. Ce document porte les tags « Tutoriel » et « Débuter ».'),
  TRY(
    'Créer une section « Essais » avec le bouton + Section.',
    'Créer un document dans cette section, puis le renommer.',
    'Ajouter un tag à ce document.',
    'Taper # dans la recherche de la liste des documents, puis choisir un tag.'
  ),
  SUITE('modes', 'Interface note et interface avancée')
].join(''));

// ----- 3. Interface note et interface avancée -----

doc('modes', 'Interface note et interface avancée', [T('Tutoriel', 'rouge'), T('Débuter', 'vert')], [
  `<h1 class="ft-title">Interface note et interface avancée</h1>`,
  P('Chaque document s’écrit dans l’une de deux interfaces, choisie par l’interrupteur en haut à droite de la page. L’interface se change à tout moment, sans perte.'),
  TABLE([
    ['', 'Interface note', 'Interface avancée'],
    ['Affichage', 'Texte continu, sans pages', 'Pages au format choisi, comme dans Word'],
    ['Usage', 'Notes, brouillons, cours, listes', 'Rapports, mémoires, lettres, livres'],
    ['Pages', 'Format et marges seulement', 'Format, orientation, marges, en-tête, pied de page'],
    ['Numéros de page', '—', 'Position, style, première page, pages exclues'],
    ['Page de titre', '—', 'Page de couverture en tête du document'],
    ['Colonnes', 'Tout le document', 'Une partie du document']
  ], { style: 'colore', color: 'theme', header: true, first: true, sep: true }, 'Différences entre les deux interfaces', 'tab-modes'),
  P(`Les outils propres à l’interface avancée sont grisés dans l’interface note (${XREF('tab-modes')}). Ils s’activent dès le passage à l’interface avancée.`),
  H(2, 'L’interface note'),
  P('L’interface note convient à l’écriture courante : le texte défile sans coupure de page. Tous les outils d’écriture restent disponibles : titres, tableaux, images, schémas, notes, liens.'),
  H(2, 'L’interface avancée'),
  P(`L’interface avancée découpe le texte en pages. Le bouton <b>Réglages des pages</b> (groupe <b>Mise en page</b>) règle le format, l’orientation, les marges, l’en-tête et le pied de page ; le bouton <b>Numéros de page</b> règle la numérotation. Le document ${L('miseenpage', 'Mise en page')} est écrit dans l’interface avancée.`),
  BOX('trait', 'bleu', '<b>Bon à savoir.</b> Un modèle de mise en page (mémoire, rapport, lettre…) fait passer le document à l’interface avancée et règle pages, thème et page de titre en une fois.'),
  H(2, 'Le mode lecture'),
  P(`Le mode lecture (${K('Ctrl+Maj+F')}, ou bouton <b>Lecture</b>) affiche le document en plein écran, page par page, comme un livre. Les flèches du clavier tournent les pages ; Échap revient à l’écriture.`),
  TRY(
    'Passer ce document à l’interface avancée avec l’interrupteur, puis revenir à l’interface note.',
    `Ouvrir le mode lecture avec ${K('Ctrl+Maj+F')}, puis le quitter avec Échap.`
  ),
  SUITE('barres', 'Les barres d’outils')
].join(''));

// ----- 4. Barres d'outils -----

doc('barres', 'Les barres d’outils', [T('Tutoriel', 'rouge'), T('Débuter', 'vert')], [
  `<h1 class="ft-title">Les barres d’outils</h1>`,
  P('Les outils sont répartis sur deux barres, dans l’ordre du travail : la première pour écrire et mettre en forme, la seconde pour insérer et mettre en page. Chaque groupe porte son nom sous ses boutons ; le survol d’un bouton affiche son rôle et son raccourci.'),
  H(2, 'Barre principale : écrire'),
  TABLE([
    ['Groupe', 'Outils'],
    ['Document', 'Liste des documents, volet de navigation, rechercher et remplacer, annuler, rétablir.'],
    ['Police', 'Police et taille du texte.'],
    ['Caractères', 'Gras, italique, souligné, barré, petites capitales, casse, couleur du texte, surlignage.'],
    ['Paragraphe', 'Alignements, alinéa automatique, listes à tirets et à cocher, menu <b>Éléments</b> (titres, listes, encadré, séparation, plan, note).'],
    ['Saisie automatique', 'Guillemets, majuscule en début de phrase, typographie automatique, point médian.'],
    ['Relecture', 'Commentaire, suivi des modifications, Aide au texte.']
  ], REF, 'Groupes de la barre principale'),
  H(2, 'Barre d’insertion : insérer et mettre en page'),
  TABLE([
    ['Groupe', 'Outils'],
    ['Objets', 'Tableau, image, schéma, formule, repère biographique.'],
    ['Blocs', 'Citation, encadré, bloc de code, lettrine.'],
    ['Symboles', 'Caractères spéciaux, date du jour.'],
    ['Notes et sources', 'Note de bas de page, note de fin, sources et bibliographie, source PDF côte à côte.'],
    ['Liens', 'Lien vers un site, renvoi, signets.'],
    ['Parties du document', 'Page de titre, plan, table des illustrations, index.'],
    ['Mise en page', 'Modèle, thème du document, styles du document, réglages des pages, numéros de page, colonnes.'],
    ['Tags', 'Étiquettes du document.']
  ], REF, 'Groupes de la barre d’insertion'),
  BOX('fond', 'bleu', '<b>Petites flèches.</b> Une flèche à côté d’un bouton ouvre ses réglages : styles des tableaux, des encadrés, des citations, couleur du surlignage, format de la date…'),
  H(2, 'Autres accès aux outils'),
  UL([
    `<b>Rechercher un outil</b> (${K('Ctrl+K')}) : taper quelques lettres pour trouver un outil, un style, un réglage ou un document, puis Entrée.`,
    '<b>Mini-barre</b> : à la sélection d’un texte à la souris, une petite barre propose les mises en forme courantes (Affichage &gt; Mini-barre de mise en forme).',
    '<b>Clic droit</b> : sur un tableau, une image, un lien ou un mot, le menu propose les actions propres à cet élément.',
    '<b>Barre de l’objet</b> : un tableau, une image ou un schéma sélectionné affiche ses propres outils au-dessus de la page.'
  ]),
  P('Les deux barres se déplacent (poignée à gauche de chaque barre) : en haut, à gauche, à droite ou flottantes. Le clic droit sur la poignée ouvre leurs options.'),
  TRY(
    `Appuyer sur ${K('Ctrl+K')}, taper « lettrine », puis Entrée.`,
    'Sélectionner un mot de cette phrase à la souris pour afficher la mini-barre.',
    'Survoler les boutons du groupe Notes et sources pour lire leur rôle.'
  ),
  SUITE('texte', 'Mettre en forme le texte')
].join(''));

// ----- 5. Mettre en forme le texte -----

doc('texte', 'Mettre en forme le texte', [T('Tutoriel', 'rouge'), T('Écrire', 'bleu')], [
  `<h1 class="ft-title">Mettre en forme le texte</h1>`,
  H(2, 'Caractères'),
  P(`Le texte peut être mis en <b>gras</b> (${K('Ctrl+G')}), en <i>italique</i> (${K('Ctrl+I')}), <u>souligné</u> (${K('Ctrl+U')}), <s>barré</s> (${K('Ctrl+Maj+X')}), en <span style="font-variant-caps: small-caps;">petites capitales</span> (${K('Ctrl+Maj+K')}), en <span style="color: rgb(41, 128, 185);">couleur</span> ou ${MARK('surligné')}. ${K('Maj+F3')} change la casse d’un mot : minuscules, Majuscule initiale, MAJUSCULES.`),
  H(2, 'Titres'),
  P(`Les titres structurent le document : ils forment le plan, le volet de navigation (${K('Ctrl+Maj+P')}) et les signets des exports PDF. Le menu <b>Éléments</b> du groupe Paragraphe propose le titre du document et les titres 1 à 4.`),
  H(2, 'Listes'),
  UL([
    'Liste à tirets : bouton du groupe Paragraphe.',
    'Liste numérotée : menu Éléments.',
    '<b>Tab</b> décale une ligne de liste d’un niveau, <b>Maj+Tab</b> la remonte.'
  ]),
  H(2, 'Écrire plus vite'),
  P('Certaines suites de caractères, tapées en début de ligne et suivies d’une espace, créent directement l’élément voulu :'),
  TABLE([
    ['Taper', 'Résultat'],
    ['# puis espace', 'Titre 1 (## : titre 2, ### : titre 3)'],
    ['- puis espace', 'Liste à tirets'],
    ['1. puis espace', 'Liste numérotée (a. pour des lettres, I. pour des chiffres romains)'],
    ['[] puis espace', 'Liste à cocher'],
    ['> puis espace', 'Encadré'],
    ['``` puis espace', 'Bloc de code'],
    ['___ (trois tirets bas)', 'Ligne de séparation'],
    ['^ dans le texte', 'Note de bas de page'],
    ['((texte))', 'Lien vers un autre document']
  ], REF, 'Raccourcis de saisie'),
  H(2, 'Saisie automatique'),
  P('Le groupe <b>Saisie automatique</b> règle les corrections faites pendant la frappe :'),
  UL([
    '<b>Guillemets</b> : la touche " écrit « » (avec espaces insécables), “ ” ou des guillemets droits.',
    '<b>Majuscule automatique</b> en début de phrase.',
    '<b>Typographie automatique</b> : \' devient ’, -- devient –, ... devient ….',
    '<b>Point médian</b> : la touche * du pavé numérique écrit · pour l’écriture inclusive.'
  ]),
  P(`Une correction non voulue s’annule par ${K('Ctrl+Z')} : le texte tapé revient tel quel.`),
  H(2, 'Paragraphes'),
  P(`Alignements à gauche (${K('Ctrl+L')}), centré (${K('Ctrl+E')}), à droite (${K('Ctrl+R')}) et justifié (${K('Ctrl+J')}) s’appliquent à la sélection, ou à tout le document si rien n’est sélectionné.`),
  BOX('bandeau', 'vert', '<b>Encadré.</b> Un encadré met un passage en valeur. Sa forme et sa couleur se choisissent par la flèche du bouton Encadré, ou par clic droit &gt; Style.'),
  QUOTE('guillemets', 'Une citation se place dans un bloc à part, avec sa source en dessous.', 'Bouton Citation, groupe Blocs'),
  TRY(
    'Sur une ligne vide ci-dessous, taper ## puis espace, puis un titre.',
    'Taper 1. puis espace pour commencer une liste numérotée ; Tab pour décaler la deuxième ligne.',
    'Taper " puis un mot puis " : les guillemets français s’écrivent seuls.',
    `Sélectionner un mot et appuyer plusieurs fois sur ${K('Maj+F3')}.`
  ),
  P(''),
  SUITE('tableaux', 'Les tableaux')
].join(''));

// ----- 6. Tableaux -----

doc('tableaux', 'Les tableaux', [T('Tutoriel', 'rouge'), T('Écrire', 'bleu')], [
  `<h1 class="ft-title">Les tableaux</h1>`,
  H(2, 'Insérer un tableau'),
  P('Le bouton <b>Tableau</b> (groupe Objets) insère un tableau de 3 × 3 ; sa petite flèche choisit le nombre de lignes et de colonnes et le style. Un tableau copié depuis Word, Excel ou une page web se colle directement, avec ses cellules fusionnées et ses largeurs de colonnes.'),
  H(2, 'La barre Tableau'),
  P('Dès que le curseur est dans un tableau, la barre <b>Tableau</b> apparaît au-dessus de la page :'),
  TABLE([
    ['Outil', 'Rôle'],
    ['Lignes et colonnes', 'Insérer au-dessus, en dessous, à gauche, à droite ; supprimer une ligne, une colonne ou le tableau.'],
    ['Fusionner / fractionner', 'Réunir les cellules sélectionnées à la souris, ou séparer une cellule fusionnée.'],
    ['Couleur de fond', 'Colorer les cellules sélectionnées.'],
    ['Bordures', 'Choisir les bordures des cellules.'],
    ['Alignement vertical', 'Placer le texte en haut, au milieu ou en bas des cellules.'],
    ['Répartir', 'Colonnes de même largeur ou lignes de même hauteur.'],
    ['Position et habillage', 'Pleine largeur, ou ajusté au contenu.'],
    ['Style du tableau', 'Dessin, couleur, en-tête, première colonne, ligne de total, bandes.']
  ], REF, 'Outils de la barre Tableau', 'tab-outils'),
  P('Le clic droit sur une cellule propose les mêmes actions. Les bords des colonnes se tirent à la souris pour régler leur largeur.'),
  H(2, 'Styles de tableaux'),
  P('Dix dessins et dix couleurs se combinent avec des options : ligne d’en-tête, première colonne, ligne de total, bandes alternées. Exemple avec le style « En-tête coloré » et une ligne de total :'),
  TABLE([
    ['Trimestre', 'Ventes', 'Évolution'],
    ['Janvier – mars', '1 240', '+4 %'],
    ['Avril – juin', '1 385', '+12 %'],
    ['Juillet – septembre', '1 120', '−19 %'],
    ['Total', '3 745', '']
  ], { style: 'colore', color: 'vert', header: true, total: true, first: true, sep: true }, 'Exemple de tableau mis en forme', 'tab-exemple'),
  P(`Une légende placée au-dessus d’un tableau le numérote (${XREF('tab-exemple')}) ; les tableaux légendés figurent dans la table des illustrations et peuvent être cités par un renvoi.`),
  BOX('fond', 'bleu', '<b>Styles du document.</b> Le bouton Styles du document (groupe Mise en page) change le style de tous les tableaux à la fois, ou seulement des prochains.'),
  TRY(
    'Placer le curseur dans le tableau ci-dessus et ajouter une ligne en dessous avec la barre Tableau.',
    'Sélectionner deux cellules à la souris et les fusionner.',
    'Changer le style du tableau par clic droit &gt; Style du tableau.',
    'Insérer un nouveau tableau sur la ligne ci-dessous.'
  ),
  P(''),
  SUITE('objets', 'Images, schémas et formules')
].join(''));

// ----- 7. Images, schémas, formules -----

doc('objets', 'Images, schémas et formules', [T('Tutoriel', 'rouge'), T('Écrire', 'bleu')], [
  `<h1 class="ft-title">Images, schémas et formules</h1>`,
  H(2, 'Images'),
  IMAGE(IMG.cerise, { width: 34, wrap: 'droite', num: 'figure', xid: 'fig-image', caption: 'Image habillée à droite, avec légende numérotée' }),
  P('Une image s’insère par le bouton <b>Image</b>, par glisser-déposer depuis l’Explorateur ou par collage. Sélectionnée, elle se redimensionne par ses poignées ; sa barre propose la position et l’habillage (texte autour, à gauche, à droite), un cadre et une légende.'),
  P(`Une légende numérotée (« Figure 1 ») permet de citer l’image ailleurs par un renvoi : ${XREF('fig-image')}.`),
  H(2, 'Schémas'),
  P('Le bouton <b>Schéma</b> ouvre un éditeur de formes reliées par des connecteurs : organigrammes, cycles, cartes mentales, graphes de fonctions. Un double-clic sur un schéma le rouvre pour le modifier.'),
  PLACE('diagram:etapes'),
  H(2, 'Formules'),
  P(`Le bouton <b>Formule</b> insère une formule mathématique, dans la ligne (${MATH('E=mc^2')}) ou centrée sur sa propre ligne :`),
  MATH('\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i', true),
  P('L’éditeur de formules propose les symboles courants (fractions, racines, sommes, lettres grecques) ; la syntaxe LaTeX est aussi acceptée. Un double-clic sur une formule la modifie.'),
  H(2, 'Autres objets'),
  TABLE([
    ['Outil', 'Usage'],
    ['Repère biographique', 'Courte notice sur une personne (portrait, dates, présentation), à côté du texte.'],
    ['Lettrine', 'Grande initiale en début de paragraphe, pour un chapitre ou un article.'],
    ['Bloc de code', 'Code informatique coloré selon le langage.'],
    ['Caractères spéciaux', 'Symboles, lettres accentuées, flèches ; les favoris s’affichent au survol.']
  ], REF),
  TRY(
    'Cliquer sur l’image ci-dessus et changer son habillage.',
    'Double-cliquer sur le schéma, ajouter une forme, puis fermer l’éditeur.',
    'Insérer une formule sur la ligne ci-dessous.'
  ),
  P(''),
  SUITE('liens', 'Liens, notes et sources')
].join(''));

// ----- 8. Liens, notes et sources -----
{
  const n = notes();
  doc('liens', 'Liens, notes et sources', [T('Tutoriel', 'rouge'), T('Écrire', 'bleu')], [
    `<h1 class="ft-title">Liens, notes et sources</h1>`,
    H(2, 'Liens entre documents'),
    P(`Un texte écrit entre doubles parenthèses, comme ((Nom du document)), devient un lien vers le document de ce nom. ${K('Double-clic')} ou ${K('Ctrl+clic')} sur le lien ouvre le document ; si aucun document ne porte ce nom, une fenêtre propose de le choisir ou de le créer. Exemple : ${L('bienvenue', 'retour à l’accueil du tutoriel')}.`),
    H(2, 'Mindmap et Carte du temps'),
    UL([
      `<b>Mindmap</b> (${K('Ctrl+M')}, onglet au-dessus de la page) : les documents du projet et leurs liens, sous forme de carte. Un clic sur un point ouvre le document.`,
      `<b>Carte du temps</b> (${K('Ctrl+Maj+T')}) : les dates trouvées dans les textes, placées sur une frise. Un clic sur une date l’ouvre dans le texte.`
    ]),
    BOX('trait', 'vert', 'La Mindmap de ce projet montre comment les documents du tutoriel sont reliés entre eux.'),
    H(2, 'Liens vers un site'),
    P(`Une adresse tapée ou collée (https://…) devient un lien. Pour placer un lien sur un mot : sélectionner le mot, puis ${K('Ctrl+Maj+L')} ou le bouton <b>Lien</b> (groupe Liens). Le clic droit sur un lien permet de le modifier ou de le retirer.`),
    H(2, 'Notes'),
    P(`Une note de bas de page s’insère par le bouton <b>Note</b> ou en tapant ^ dans le texte${n.ref('Exemple de note de bas de page. Dans l’interface avancée, elle s’affiche en bas de sa page ; dans l’interface note, à la fin du document.')}. Les notes de fin, numérotées i, ii, iii, sont rangées dans une partie « Notes » à la fin du document.`),
    H(2, 'Renvois et signets'),
    UL([
      '<b>Renvoi</b> : cite un titre, une figure ou un tableau par son numéro ou sa page (« voir figure 2, page 5 ») ; il se met à jour seul.',
      `<b>Signets</b> (${K('Ctrl+Maj+G')}) : marquent des endroits du document pour y revenir d’un clic.`
    ]),
    H(2, 'Sources et bibliographie'),
    P('Le bouton <b>Sourcer</b> (groupe Notes et sources) gère les sources du projet : livres, articles, sites, avec recherche en ligne par ISBN, DOI ou titre. Une source citée dans le texte s’affiche selon le style choisi (APA, Chicago…) ; la bibliographie, insérée en fin de document, se met à jour seule.'),
    P('La <b>Source PDF côte à côte</b> affiche un PDF à droite du texte : un passage sélectionné dans le PDF s’insère entre guillemets, avec sa page.'),
    TRY(
      'Écrire ((6. Les tableaux)) sur la ligne ci-dessous, puis double-cliquer dessus.',
      'Ouvrir la Mindmap avec Ctrl+M, puis revenir au document avec l’onglet Document.',
      'Taper ^ à la fin d’une phrase pour ajouter une note.'
    ),
    P(''),
    SUITE('miseenpage', 'Mise en page'),
    n.html()
  ].join(''));
}

// ----- 9. Mise en page (interface avancée) -----

const cover = '<div class="ft-cover" contenteditable="false" data-model="moderne">' +
  '<div class="ft-cover-head"><p class="ft-cover-field" data-field="surtitre" data-ph="Organisme ou établissement" contenteditable="true">Tutoriel Tomatoes Text</p></div>' +
  '<div class="ft-cover-main"><p class="ft-cover-field" data-field="titre" data-ph="Titre" contenteditable="true">Mise en page</p><p class="ft-cover-field" data-field="soustitre" data-ph="Sous-titre" contenteditable="true">Modèles, thèmes, pages et parties du document</p></div>' +
  '<div class="ft-cover-foot"><p class="ft-cover-field" data-field="auteur" data-ph="Auteur" contenteditable="true">Exemple de document en interface avancée</p><p class="ft-cover-field" data-field="date" data-ph="Date" contenteditable="true">Version 2.4</p><p class="ft-cover-field" data-field="mention" data-ph="Mention (type de document, version)" contenteditable="true">Document modifiable</p></div></div>';
doc('miseenpage', 'Mise en page', [T('Tutoriel', 'rouge'), T('Finaliser', 'violet')], [
  cover,
  PLACE('toc'),
  H(1, 'Présentation', 'mp-intro'),
  P('Ce document est écrit dans l’<b>interface avancée</b> : il commence par une page de titre, suivie d’un plan, et ses pages sont numérotées. Tous les outils décrits ici se trouvent dans les groupes <b>Parties du document</b> et <b>Mise en page</b> de la barre d’insertion.'),
  H(1, 'Mettre en forme tout le document', 'mp-forme'),
  H(2, 'Modèle de mise en page'),
  P('Un modèle (mémoire, rapport, roman, lettre, compte rendu…) règle en une fois le thème, le format des pages, les numéros, l’en-tête, la page de titre et une structure type. Il s’applique à un document existant, ou à un nouveau document par Fichier &gt; Nouveau document depuis un modèle.'),
  H(2, 'Thème du document'),
  P('Le thème accorde entre eux la police du texte, les titres, les tableaux, les encadrés, le plan et les marges. Ce document utilise le thème « Rapport » ; les autres documents du tutoriel utilisent le thème « Moderne ».'),
  H(2, 'Styles du document'),
  P('La fenêtre <b>Styles du document</b> règle chaque type d’élément (titres, tirets, tableaux, encadrés, citations, plan, schémas), pour tout le document, pour l’élément sélectionné ou pour les prochains seulement.'),
  H(1, 'Régler les pages', 'mp-pages'),
  TABLE([
    ['Bouton', 'Réglages'],
    ['Réglages des pages', 'Format (A4, A5, Lettre…), orientation, marges, en-tête et pied de page.'],
    ['Numéros de page', 'Affichage, position, style (1, i, I), première page numérotée, pages exclues.'],
    ['Colonnes', 'Deux ou trois colonnes, pour tout le document (interface note) ou une partie (interface avancée).']
  ], REF, 'Réglages des pages', 'tab-pages'),
  P(`Le ${XREF('tab-pages')} résume les trois boutons. Réglages des pages permet aussi de commencer chaque titre 1 sur une nouvelle page.`),
  H(1, 'Les parties du document', 'mp-parties'),
  UL([
    '<b>Page de titre</b> : vingt-quatre modèles de couverture ; les champs (titre, auteur, date) se remplissent directement sur la page.',
    '<b>Plan</b> : la liste des titres avec leurs pages, mise à jour automatiquement ; un clic sur une ligne mène au titre.',
    '<b>Table des illustrations</b> : la liste des figures, schémas et tableaux légendés.',
    '<b>Index</b> : les mots marqués, rangés par ordre alphabétique avec leurs pages.'
  ]),
  BOX('fond', 'bleu', '<b>Volet de navigation.</b> Ctrl+Maj+P affiche les titres de ce document dans un volet à gauche : un clic sur un titre y conduit.'),
  TRY(
    'Modifier le titre de la page de titre en cliquant dessus.',
    'Ajouter un titre 1 à la fin du document, puis vérifier qu’il apparaît dans le plan.',
    'Ouvrir Numéros de page et placer les numéros en haut de page.',
    'Appliquer un autre thème du document, puis revenir au thème « Rapport ».'
  ),
  SUITE('relecture', 'Relire et améliorer')
].join(''), { mode: 'avance', pages: { chapters: 1 } });

// ----- 10. Relire et améliorer -----

doc('relecture', 'Relire et améliorer', [T('Tutoriel', 'rouge'), T('Finaliser', 'violet')], [
  `<h1 class="ft-title">Relire et améliorer</h1>`,
  H(2, 'Orthographe et grammaire'),
  P('Les fautes d’orthographe sont soulignées en rouge ; le clic droit propose des corrections ou ajoute le mot au dictionnaire personnel. La grammaire est vérifiée par LanguageTool, exécuté sur l’ordinateur sans rien envoyer en ligne : il s’installe une fois par Édition &gt; Installer LanguageTool.'),
  P('Plusieurs langues peuvent coexister dans un même document (Édition &gt; Langues du document).'),
  H(2, 'Commentaires et suivi des modifications'),
  UL([
    `<b>Commentaire</b> (${K('Ctrl+Maj+M')}) : une remarque placée dans la marge, sur le texte sélectionné ; les boutons Répondre et Résoudre permettent d’y répondre et de la classer.`,
    `<b>Suivi des modifications</b> (${K('Ctrl+Maj+R')}) : les ajouts et suppressions restent visibles, puis sont acceptés ou refusés un par un ou en une fois.`
  ]),
  P('<span class="ft-comment" data-c="c1">Ce passage porte un commentaire.</span> Un clic sur le texte surligné l’affiche dans la marge.'),
  H(2, 'Aide au texte'),
  P(`L’<b>Aide au texte</b> (${K('Ctrl+Maj+A')}) s’ouvre dans un volet à droite, en deux onglets. L’onglet <b>Rédaction</b> fonctionne avec un modèle d’intelligence artificielle installé sur l’ordinateur (téléchargement unique, depuis les réglages du volet) :`),
  UL([
    'reformulation du passage sélectionné, selon un style et une intensité ;',
    'synonymes d’un à trois mots sélectionnés ;',
    'résumé du document ;',
    'vérification de la cohérence : noms écrits de plusieurs façons, dates impossibles ;',
    'faux texte (lorem ipsum) en français, sans modèle.'
  ]),
  P('L’onglet <b>Lisibilité</b> donne, sans modèle, l’indice de lisibilité, la longueur des phrases, les phrases les plus longues, les mots rares et le temps de lecture. Les phrases longues et les mots rares peuvent être surlignés dans le texte.'),
  H(2, 'Autres outils'),
  TABLE([
    ['Outil', 'Emplacement'],
    ['Rechercher et remplacer', 'Ctrl+F, Ctrl+H'],
    ['Vérifier la cohérence', 'Aide au texte &gt; Vérifier la cohérence'],
    ['Objectifs et statistiques (mots par jour)', 'Affichage &gt; Objectifs et statistiques'],
    ['Historique des versions', 'Fichier &gt; Historique des versions']
  ], REF),
  TRY(
    'Sélectionner une phrase et ajouter un commentaire avec Ctrl+Maj+M.',
    'Activer le suivi des modifications, supprimer un mot, puis refuser la suppression.',
    'Ouvrir l’Aide au texte et générer un faux texte d’un paragraphe.'
  ),
  P(''),
  SUITE('exports', 'Exporter et partager')
].join(''), {
  comments: [{
    id: 'c1', author: 'Tutoriel', date: '2026-11-18T09:00:00.000Z',
    text: 'Exemple de commentaire. Le bouton Répondre ajoute une réponse ; Résoudre le classe.', done: false, replies: []
  }]
});

// ----- 11. Exporter -----

doc('exports', 'Exporter et partager', [T('Tutoriel', 'rouge'), T('Finaliser', 'violet')], [
  `<h1 class="ft-title">Exporter et partager</h1>`,
  P(`<b>Fichier &gt; Exporter</b> (${K('Ctrl+Maj+E')}) enregistre le document dans un autre format. L’export reproduit l’affichage : polices, thème, tableaux, images, schémas, notes et numéros de page.`),
  TABLE([
    ['Format', 'Usage'],
    ['Word (.docx)', 'Continuer le travail dans Word ou LibreOffice.'],
    ['PDF', 'Lire, imprimer ou envoyer le document tel quel ; les titres deviennent des signets.'],
    ['Livre (PDF)', 'Format de livre (A5, 15 × 23 cm…), avec marges de reliure, prêt pour l’imprimeur ou en livret à plier.'],
    ['EPUB', 'Livre numérique pour liseuses et tablettes.']
  ], REF, 'Formats d’export'),
  BOX('fond', 'vert', '<b>Typographie soignée.</b> L’option de la fenêtre d’export coupe les mots en fin de ligne et équilibre la justification du PDF.'),
  H(2, 'Importer'),
  P('Un document Word (.docx) s’importe par Fichier &gt; Importer un document Word, ou par glisser-déposer sur la fenêtre : titres, listes, tableaux, images et notes sont repris.'),
  H(2, 'Partager un document Tomatoes Text'),
  P('Un fichier .tmtx contient tout le document (texte, images, réglages). Il peut être envoyé tel quel : un double-clic dans l’Explorateur l’ouvre dans Tomatoes Text. Fichier &gt; Ouvrir le dossier du projet montre l’emplacement des fichiers.'),
  TRY(
    'Exporter ce document en PDF, puis l’ouvrir.',
    'Exporter le document Mise en page en Word : la page de titre et le plan sont conservés.'
  ),
  SUITE('personnaliser', 'Personnaliser le logiciel')
].join(''));

// ----- 12. Personnaliser -----

doc('personnaliser', 'Personnaliser le logiciel', [T('Tutoriel', 'rouge'), T('Finaliser', 'violet')], [
  `<h1 class="ft-title">Personnaliser le logiciel</h1>`,
  H(2, 'Apparence'),
  UL([
    `<b>Mode jour, crépuscule ou lune</b> (${K('Ctrl+D')}) : interface claire, sombre avec page claire, ou entièrement sombre.`,
    '<b>Thème du logiciel</b> (Affichage &gt; Thème du logiciel) : des thèmes prêts, et l’onglet Aspect pour régler les couleurs, la police de l’interface, les icônes (en couleur ou en gris), les noms des groupes et la densité.',
    `<b>Zoom</b> : ${K('Ctrl++')} et ${K('Ctrl+-')}, ${K('Ctrl+0')} pour la taille réelle ; dans l’interface avancée, l’affichage en double page est disponible en bas de la fenêtre.`
  ]),
  H(2, 'Raccourcis clavier'),
  P('Affichage &gt; Raccourcis clavier liste toutes les commandes. Un clic sur une combinaison permet de la remplacer par une autre.'),
  H(2, 'Barres d’outils'),
  P('Les barres se déplacent par leur poignée ; le clic droit sur la poignée propose leurs options. Les noms des groupes s’affichent ou se masquent dans Thème du logiciel &gt; Aspect.'),
  H(2, 'Démarrage'),
  P('La case « Afficher l’accueil au démarrage », sur l’accueil, choisit entre l’accueil et la réouverture directe du dernier document.'),
  H(2, 'Mises à jour et aide'),
  UL([
    '<b>Aide &gt; Rechercher une mise à jour</b> : installe la dernière version publiée.',
    '<b>Aide &gt; Tutoriel</b> : rouvre ce tutoriel.',
    `<b>Aide &gt; Signaler un défaut</b> (${K('Ctrl+Maj+F1')}) : décrit un problème rencontré.`,
    '<b>Fichier &gt; Mode présentation</b> : ouvre un projet de démonstration complet, sans toucher aux projets personnels.'
  ]),
  BOX('bandeau', 'vert', `<b>Fin du tutoriel.</b> Pour commencer, créer un projet avec le bouton ⋯ en haut de la liste des documents, ou revenir à l’${L('bienvenue', 'accueil du tutoriel')}.`),
  TRY(
    'Passer en mode lune avec Ctrl+D, puis revenir au mode jour.',
    'Ouvrir Affichage &gt; Thème du logiciel et parcourir les thèmes.',
    'Ouvrir Fichier &gt; Mode présentation, puis le quitter.'
  )
].join(''));

// ----- Schéma -----

const NODE = { shape: 'arrondi', w: 130, h: 52, text: '', fill: '#fde2e1', stroke: '#c8402c', strokeWidth: 1.5, dash: '', shadow: false, opacity: 1,
  font: 'Segoe UI', fontSize: 14, bold: false, italic: false, textColor: '#78281f', align: 'center' };
const LINK = { route: 'coude', color: '#8c7b70', width: 1.5, dash: '', start: '', end: 'pleine', label: '' };
const node = (id, x, y, text, more = {}) => ({ ...NODE, id, x, y, text, ...more });
const link = (id, a, sa, b, sb, more = {}) => ({ ...LINK, id, from: { node: a, side: sa }, to: { node: b, side: sb }, ...more });
const GREEN = { fill: '#d5f5e3', stroke: '#27ae60', textColor: '#145a32' };
const DIAGRAMS = {
  etapes: {
    caption: 'Les étapes d’un document', width: 92, xid: 'sch-etapes',
    data: { v: 1, background: '#ffffff', nodes: [
      node('a', 0, 0, 'Écrire', { shape: 'ellipse', w: 110 }),
      node('b', 150, 0, 'Illustrer'),
      node('c', 320, 0, 'Relire'),
      node('d', 490, 0, 'Exporter', { ...GREEN, bold: true }),
      node('e', 320, 100, 'Commentaires', { shape: 'note', w: 130, fill: '#fcf3cf', stroke: '#d4ac0d', textColor: '#7d6608' })
    ], links: [
      link('l1', 'a', 'e', 'b', 'w'), link('l2', 'b', 'e', 'c', 'w'), link('l3', 'c', 'e', 'd', 'w'),
      link('l4', 'c', 's', 'e', 'n', { dash: 'tirets' })
    ] }
  }
};

// ----- Rangement dans les sections -----

const SECTIONS = [
  { id: 'tdeb', name: 'Débuter', collapsed: false, children: [] },
  { id: 'tecr', name: 'Écrire', collapsed: false, children: [] },
  { id: 'tfin', name: 'Finaliser', collapsed: false, children: [] }
];
const PLACEMENT = {
  bienvenue: 'tdeb', projets: 'tdeb', modes: 'tdeb', barres: 'tdeb',
  texte: 'tecr', tableaux: 'tecr', objets: 'tecr', liens: 'tecr',
  miseenpage: 'tfin', relecture: 'tfin', exports: 'tfin', personnaliser: 'tfin'
};

// ----- Fabrication -----

module.exports = async ({ page, electron }) => {
  const { handlers } = electron._test;
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  await call('project:create', NAME);
  const lib = await call('library:load', NAME);
  const dir = lib.folder;
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  const date = '2026-11-18T08:00:00.000Z';
  const drawn = await page.evaluate((list) => list.map(({ latex, block }) =>
    window.MathLive.convertLatexToMarkup(latex, { defaultMode: block ? 'math' : 'inline-math' })), FORMULAS);
  for (const d of DOCS) d.html = d.html.replace(/@@MATH(\d+)@@/g, (_m, i) => drawn[Number(i)]);
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
    const theme = d.settings.mode === 'avance' ? THEME_AVANCE : THEME;
    await page.evaluate(async ({ id, theme, diagrams }) => {
      await window.FTApp.openDocById(id);
      const editor = document.getElementById('editor');
      const boxes = [...editor.querySelectorAll('blockquote.ft-callout')].map((b) => [b, b.dataset.look, b.dataset.qlook, b.dataset.color]);
      window.FTTheme.open();
      const card = [...document.querySelectorAll('.th-card')].find((b) => b.querySelector('.theme-name').textContent.replace(' ★', '') === theme);
      card.click();
      document.getElementById('theme-close').click();
      for (const [b, look, qlook, color] of boxes) {
        for (const [k, v] of [['look', look], ['qlook', qlook], ['color', color]]) { if (v) b.dataset[k] = v; else delete b.dataset[k]; }
      }
      for (const t of editor.querySelectorAll('table[data-demo-look]')) {
        const look = JSON.parse(t.dataset.demoLook);
        t.removeAttribute('data-demo-look');
        window.FTStructure.setTableLook(t, look);
      }
      const tocHere = editor.querySelector('[data-demo="toc"]');
      if (tocHere) {
        window.FTStructure.placeCaret(tocHere);
        window.FTToc.insert();
        tocHere.remove();
      }
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

  // Copie dans src/tutoriel : seulement les documents et le rangement. Les fichiers portent le titre du
  // document (le logiciel ne les renomme donc pas).
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (!/\.tmtx$/.test(f) && f !== 'bibliotheque.json') continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (data.id) {
      data.created = date;
      data.modified = date;
    }
    fs.writeFileSync(path.join(OUT, f), JSON.stringify(data));
  }
  console.log('  Tutoriel écrit dans ' + OUT + ' : ' + fs.readdirSync(OUT).join(', '));
};
module.exports.ID = ID;
module.exports.NAME = NAME;
