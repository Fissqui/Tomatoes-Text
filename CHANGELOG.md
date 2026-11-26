# Historique des versions

Chaque version majeure porte le nom d'une variété de tomate ; ses versions correctives (2.4.1, 2.4.2…) gardent ce
nom. Le détail de chaque version publiée figure sur la
[page des versions](https://github.com/Fissqui/Tomatoes-Text/releases).

## 2.5 « Canestrino » — novembre 2026

- Images entièrement refaites. Chaque image a cinq réglages, dans sa barre et son menu du clic droit :
  - déplacement par ligne (entre deux paragraphes ou deux lignes) ou libre (le texte passe à côté) ;
  - ancrage mouvant ou fixe (l'image reste à sa place sur la page) ;
  - centrage ;
  - superposition (devant, derrière ou au niveau du texte) ;
  - encadrage (légende placée dessus, dessous ou sur un côté, numérotation « Figure 1 », « Fig. 1 », « 1. »
    ou par chapitre, police et couleur ; cadre, épaisseur, couleur, légende comprise ou non).
- Déplacement à la souris d'une page à l'autre, le texte immobile pendant le geste et un trait à la place
  visée ; une image glissée en bas d'une page où elle ne tient pas remonte et reste sur cette page ; lignes
  créées sous le texte jusqu'à l'endroit visé (aussi par ligne), retirées si l'image remonte.
- Images gardées dans les textes collés depuis Word ou une page web ; fichier déposé à l'endroit visé.
- Anciens documents ouverts sans changement visible ; exports Word, PDF et EPUB fidèles aux nouveaux réglages.
- Mode maths (interrupteur à côté du mode raccourcis ; l'un ou l'autre) : barre d'équation au clic dans
  le texte, volet des derniers morceaux d'équations réutilisables et liste des équations du document.
  Barre en groupes nommés (Nouvelle, Structures, Opérateurs, Tableaux, Symboles, Fenêtre) ; symboles
  rangés en trois menus (lettres grecques, relations et flèches, ensembles et logique).
- Notes de bas de page gardées au collage : un texte copié depuis Word, LibreOffice, une page web (Wikipédia,
  blogs) ou un PDF garde ses notes, qui deviennent des notes du document ; une note absente du passage copié
  sur une page web est relue sur la page. Un passage copié dans le logiciel garde aussi le texte de ses notes.
- Équations gardées au collage depuis les sites qui utilisent MathJax 2 et depuis Wikipédia copié dans Chrome.
- Aide au texte en deux onglets : Rédaction (reformulation, synonymes, résumé, cohérence, faux texte) et
  Lisibilité (statistiques de lisibilité, auparavant dans une fenêtre à part).
- Menus Édition et Affichage allégés : « Rechercher et remplacer… » en une seule entrée ; modes jour /
  crépuscule / lune, Mindmap, Carte du temps, modèle de mise en page, lisibilité et cohérence retirés des
  menus, toujours accessibles par leurs boutons et leurs raccourcis.
- Documents en plusieurs langues : un mot juste dans l'une des langues du document n'est plus signalé, même
  au milieu d'une phrase dans une autre langue ; propositions de correction tirées de toutes ces langues.
  Un paragraphe dont la langue est choisie à la main reste vérifié dans cette seule langue.
- Image libre lâchée là où il n'y a pas de texte (bas laissé blanc d'une page, après un tableau, grand espace
  entre deux paragraphes) : elle reste à cet endroit, dans une ligne vide créée pour elle, retirée si l'image
  repart.
- Image glissée sous une autre image dans un bas de page vide : elle y va, à sa taille (sa ligne passe sous
  l'image d'avant au lieu de se rétrécir à côté d'elle). Poignées de taille à leur place à tout zoom.
- Texte à côté d'une image écarté d'elle (1,6 em), aussi après « Gauche » ou « Droite » ; de même en PDF, Word
  et EPUB.
- Mode avancé, Retour arrière au début d'un texte resté en haut de sa page après un blanc (texte d'avant
  raccourci, lignes vides, image) : le texte remonte dès le premier appui, puis chaque appui efface une ligne
  vide d'au-dessus et le fait remonter d'autant (auparavant, rien ne bougeait avant un saut d'un coup).
- Texte copié dans Word : ses images sont collées en pleine qualité (Word n'y joint souvent qu'une copie
  réduite), y compris celles qu'il ne décrit qu'en dessin vectoriel (VML) sans image de secours.
- Texte copié dans Word : images gardées aussi quand elles sont dans une zone de texte (qui ne devient plus un
  tableau) et quand le document est réglé pour « utiliser VML pour afficher les graphismes » (Word n'y joint
  alors aucune image ordinaire) ; image marquée EMF qui est en fait un PNG ou un JPEG gardée.
- Texte copié dans Word : une image descendue sous le début de son paragraphe est collée après lui, dans l'ordre
  de Word ; centrée si elle l'est, à côté du texte si elle est habillée sur un côté et en laisse la place.
  Photos visibles dans l'onglet « Original » de la fenêtre de collage.
- Tableaux qui débordent sur les marges, comme dans Word : un tableau copié dans Word qui avance dans les marges
  y avance aussi, et ses colonnes gardent leur largeur. Bouton « Déborder sur les marges » dans la barre du
  tableau et dans son menu du clic droit ; le bord d'un tableau se tire aussi dans la marge, jusqu'à 0,5 cm du
  bord de la feuille. Débord gardé dans les exports PDF et Word.
- Tableau collé depuis Word ou une page web : ses colonnes se calculent sur la largeur réelle du texte (le
  texte du tableau était souvent réduit à 5 pt).
- Taille des équations : la taille choisie dans la barre d'outils s'applique aux équations du passage choisi,
  d'une colonne ou d'un groupe de cases, de tout le document (Ctrl+A), à l'équation en cours de modification,
  ou à une équation choisie par le clic droit (« Sélectionner l'équation »). Taille gardée dans l'export Word.
- Sélection à la souris : les équations traversées sont colorées comme le texte choisi, et une sélection lâchée
  sur une équation dans la ligne la prend en entier.
- Équations : gras, italique, souligné, barré, couleur et surlignage de la barre d'outils s'appliquent aux
  équations choisies (avec du texte, dans des cases ou seules) et à l'équation en cours de modification
  (Ctrl+G, Ctrl+I, Ctrl+U compris) ; gardés dans l'export Word. Un glissé commencé sur une équation choisit
  le texte ou les cases parcourues (une colonne de tableau, par exemple) ; un simple clic l'ouvre toujours.
- Notes de bas de page sur les équations : une note ajoutée à une équation choisie ou en cours de modification
  se place juste après elle ; une équation sur sa propre ligne porte son appel de note après la formule
  (numéro de l'équation gardé au bord), au pied de sa page et dans l'export Word. Une équation copiée avec sa
  note la garde au collage, y compris une équation sur sa ligne collée depuis Word.
- Tableaux, encadrés et blocs de code déplacés comme les images : le texte reste immobile pendant le geste
  (double qui suit la souris, trait à la place visée) ; par ligne, place possible entre deux lignes d'un
  paragraphe ; glissés en bas d'une page où ils ne tiennent pas, ils remontent au lieu d'être coupés ou
  reportés (un tableau plus long qu'une page se coupe toujours) ; lâchés dans le bas blanc d'une page, ils y
  restent ; sous la fin du texte, lignes créées jusqu'à l'endroit visé. Un déplacement s'annule en une fois.
- Tableau à côté du texte : il peut déborder sur la marge de son côté (bouton « Déborder sur les marges » ou
  poignée tirée dans la marge).
- Pages en paysage : les tableaux en prennent toute la largeur (largeur choisie et débord sur les marges
  compris), aussi un long tableau qui continue sur d'autres pages en paysage.
- Page en paysage : un tableau à peine plus haut que la page en garde la largeur et avance un peu sur la marge
  du bas, au lieu de reprendre la largeur d'une page en portrait.
- Pages qui restent en place : quand le texte d'au-dessus grandit et déborde sur la page d'un bloc gardé en
  haut de page, ce bloc reste à sa suite s'il y tient, au lieu de passer seul à la page suivante.
- Équations : plus larges que leur place (case de tableau, ligne de texte), elles passent à la ligne après un
  signe de relation ou d'opération (=, +, −, ×, ≤…), comme dans Word et LaTeX.

## 2.4 « Corbarino » — novembre 2026

- Thèmes du logiciel approfondis : seize thèmes et vingt-huit réglages d'aspect (icônes, boutons, fenêtres,
  barres d'outils, densité).
- Mini-barre de mise en forme sur la sélection.
- Équations refaites : écrites et modifiées directement dans le texte, numérotées, reconnues au collage
  (Word, pages web, code LaTeX) et exportées en équations Word natives.
- Bibliographie composée de paragraphes modifiables, paginés comme le reste du document.
- Grammaire vérifiée localement par LanguageTool.
- Programme d'installation Windows, association des fichiers `.tmtx` et commande « Nouveau > Document
  Tomatoes Text » dans l'Explorateur.
- Traitements lourds déplacés hors de la fenêtre principale : plus de blocage au lancement ni à la saisie.
- Revue complète : corrections en mode lecture, double page et pages tournées, journal des erreurs,
  sauvegarde des réglages, reprise après un arrêt inattendu de l'affichage.

## 2.3 « Principe Borghese » — octobre 2026

- Repères biographiques : encarts consacrés aux auteurs cités (portrait, dates, apports), à partir d'une
  base de 86 économistes.
- Sources en ligne : référence bibliographique complète à partir d'un DOI, d'un ISBN, d'une adresse web ou
  d'une recherche libre (Crossref, BnF, Open Library, HAL, arXiv…).
- Volet des sources à côté du document.

## 2.2 « Ciliegino » — octobre 2026

- Notes de bas de page placées au pied de chaque page en mode avancé, y compris dans les exports PDF et livre.
- Palette de commandes (Ctrl+K).
- Nouvelles icônes et barres d'outils réorganisées.
- Pages de garde et couvertures, graphiques.

## 2.1 « Pantano Romanesco » — octobre 2026

- Export livre et PDF de qualité imprimeur : césure selon les règles de chaque langue, justification
  équilibrée, marges de reliure.
- Export EPUB.
- Blocs de code avec coloration syntaxique ; listes revues.

## 2.0 « Green Zebra » — octobre 2026

- Nouveau moteur d'édition fondé sur ProseMirror : saisie fluide et ouverture rapide sur des documents de
  plusieurs centaines de pages.
- Modèles de mise en page.

## 1.7 « Black Krim »

- Zoom de la page et double page, ordinaux en exposant, mots répétés signalés, colonnes sur un passage,
  schémas enrichis, bordures et cases fusionnées dans les tableaux.

## 1.6 « Brandywine »

- Changement de casse, tri des listes et des lignes, collage avec aperçu (web, PDF, Word), tableaux ajustés à
  la page avec ligne d'en-tête répétée, sources PDF affichées côte à côte.

## 1.5 « Costoluto »

- Plusieurs langues par document, reconnues automatiquement par paragraphe ; orthographe et synonymes dans
  chaque langue.

## 1.4 « Piennolo »

- Mise à jour intégrée, mode lecture, statistiques de lisibilité, page de titre, légendes numérotées et table
  des illustrations, renvois, index, commentaires en marge.

## 1.3 « Datterino »

- Revue complète du code : dix défauts corrigés et logiciel plus rapide.

## 1.2 « Cuore di Bue »

- Liens entre documents revus, tags.

## 1.1 « San Marzano »

- Historique des versions, mode concentration, objectifs et statistiques, raccourcis personnalisables, import
  Word, suivi des modifications, notes de fin, citations et bibliographie, carte du temps, résumé et
  vérification de la cohérence par l'aide au texte.

## 1.0 « Romana »

- Première version complète.
