// Repères biographiques : figures de la pensée économique, de l'histoire économique et de l'économie politique.
// Dates, lieux et identifiants vérifiés sur Wikidata (identifiant « id ») et la notice d'autorité de la BnF
// (« bnf » : https://catalogue.bnf.fr/ark:/12148/cb<bnf>) ; textes rédigés pour le logiciel.
// Dates : « AAAA-MM-JJ », ou l'année seule quand le jour n'est pas établi (« ~AAAA » : date approximative).
// Lieux : ville (pays de l'époque, si utile). Les personnes en vie n'ont pas de date de mort.
// Champs : role (une phrase), parcours et pensee (deux ou trois phrases chacun), idees (notions clés),
// oeuvres ([titre, année]).
(function () {
  const G = {
    precurseurs: 'Mercantilisme et physiocratie',
    classiques: 'École classique',
    socialismes: "Socialismes et critique de l'économie politique",
    neoclassiques: 'Marginalisme et école néoclassique',
    institutions: 'Institutions, histoire et sociologie économiques',
    xxe: 'Keynes et les débats du XXᵉ siècle',
    contemporains: 'Économie contemporaine'
  };

  const L = [
    // ----- Mercantilisme et physiocratie -----
    {
      id: 'Q505697', bnf: '122989211', nom: 'Thomas Mun', g: 'precurseurs', courant: 'Mercantilisme',
      n: '1571', ln: 'Londres', d: '1641-07-21', ld: 'Londres', nat: 'anglais',
      role: 'Marchand et économiste anglais, figure majeure du mercantilisme.',
      parcours: "Négociant en Méditerranée, il devient en 1615 l'un des directeurs de la Compagnie anglaise des Indes orientales. Il défend publiquement la compagnie, accusée de vider le royaume de son or.",
      pensee: "La richesse d'une nation se mesure à l'excédent de son commerce extérieur : il faut vendre chaque année aux étrangers plus qu'on ne leur achète. Les sorties d'argent sont acceptables si elles rapportent davantage par la réexportation.",
      idees: ['Balance du commerce', 'Excédent commercial', 'Réexportation'],
      oeuvres: [["England's Treasure by Forraign Trade", '1664, posthume']]
    },
    {
      id: 'Q587273', bnf: '11916622g', nom: 'Antoine de Montchrestien', g: 'precurseurs', courant: 'Mercantilisme',
      n: '1575', ln: 'Falaise', d: '1621-10-07', ld: 'Les Tourailles', nat: 'français',
      role: "Dramaturge et économiste français, auteur du premier traité intitulé « économie politique ».",
      parcours: "Poète tragique, puis exilé en Angleterre et aux Pays-Bas, il fonde à son retour une manufacture de quincaillerie. Engagé dans le soulèvement protestant, il est tué en 1621.",
      pensee: "Il dédie à Louis XIII un traité qui étend la gestion de la maison (« œconomie ») à l'État tout entier. Il plaide pour le développement des manufactures nationales et la protection du marché intérieur.",
      idees: ['Économie politique', 'Manufactures nationales', 'Protection du travail national'],
      oeuvres: [["Traicté de l'œconomie politique", '1615']]
    },
    {
      id: 'Q188971', bnf: '12428884j', photo: "Colbert1666.jpg", nom: 'Jean-Baptiste Colbert', g: 'precurseurs', courant: 'Mercantilisme (colbertisme)',
      n: '1619-08-29', ln: 'Reims', d: '1683-09-06', ld: 'Paris', nat: 'français',
      role: 'Homme d’État français, contrôleur général des finances de Louis XIV.',
      parcours: "Fils de marchands rémois, il entre au service de Mazarin puis devient contrôleur général des finances en 1665. Il cumule ensuite le secrétariat d'État de la Maison du roi et celui de la Marine.",
      pensee: "Sans être un théoricien, il donne son nom à une politique : l'État crée et réglemente des manufactures, protège le marché par des tarifs douaniers et développe la marine et les compagnies de commerce pour accroître le stock de métaux précieux du royaume.",
      idees: ['Colbertisme', 'Manufactures royales', 'Tarifs douaniers de 1664 et 1667', 'Compagnie des Indes orientales'],
      oeuvres: []
    },
    {
      id: 'Q278699', bnf: '15330273r', photo: "Sir William Petty. Mezzotint by J. Smith, 1696, after J. Clo Wellcome V0004638.jpg", nom: 'William Petty', g: 'precurseurs', courant: 'Arithmétique politique',
      n: '1623-05-26', ln: 'Romsey', d: '1687-12-16', ld: 'Londres', nat: 'anglais',
      role: "Médecin, statisticien et économiste anglais, fondateur de l'arithmétique politique.",
      parcours: "Professeur d'anatomie à Oxford, il dirige le grand relevé cadastral de l'Irlande (Down Survey) dans les années 1650. Il est l'un des membres fondateurs de la Royal Society.",
      pensee: "Il veut raisonner « en nombre, poids et mesure » sur la population, le revenu et l'impôt. Il esquisse une théorie de la valeur fondée sur le travail et la terre, et une première estimation du revenu national.",
      idees: ['Arithmétique politique', 'Revenu national', 'Le travail, père de la richesse ; la terre, sa mère'],
      oeuvres: [['A Treatise of Taxes and Contributions', '1662'], ['Political Arithmetick', '1690, posthume']]
    },
    {
      id: 'Q676456', bnf: '12182460q', photo: "Pierre Le Pesant de Boisguilbert by Santerre.jpg", nom: 'Pierre de Boisguilbert', complet: 'Pierre Le Pesant de Boisguilbert', g: 'precurseurs', courant: 'Précurseur du libéralisme',
      n: '1646-02-17', ln: 'Rouen', d: '1714-10-10', ld: 'Rouen', nat: 'français',
      role: 'Magistrat et économiste français, critique de la politique fiscale de Louis XIV.',
      parcours: "Lieutenant général au bailliage de Rouen, il observe la misère des campagnes normandes à la fin du règne de Louis XIV. Ses écrits, qui mettent en cause la fiscalité royale, lui valent un bref exil.",
      pensee: "La richesse réside dans la consommation et la circulation des biens, non dans la monnaie. Il réclame la liberté du commerce des grains et une fiscalité plus équitable, et annonce l'idée d'un équilibre spontané des marchés.",
      idees: ['Circulation des richesses', 'Liberté du commerce des grains', 'Réforme fiscale'],
      oeuvres: [['Le Détail de la France', '1695'], ['Factum de la France', '1707']]
    },
    {
      id: 'Q364975', bnf: '12396752f', nom: 'Richard Cantillon', g: 'precurseurs', courant: 'Précurseur de la physiocratie',
      n: '~1680', ln: 'Ballyheigue (Irlande)', d: '1734-05-14', ld: 'Londres', nat: 'irlandais',
      role: "Banquier et économiste irlandais établi à Paris, auteur d'un des premiers traités d'économie systématiques.",
      parcours: "Banquier à Paris, il s'enrichit en spéculant sur le système de Law, dont il anticipe l'effondrement. Il meurt à Londres en 1734 ; son essai circule en manuscrit avant d'être publié en 1755.",
      pensee: "Il analyse le circuit des revenus entre propriétaires, fermiers et entrepreneurs, et le rôle de l'entrepreneur qui achète à prix certain pour revendre à prix incertain. Il montre que l'effet d'un afflux de monnaie dépend de qui la reçoit en premier.",
      idees: ["L'entrepreneur et l'incertitude", 'Effet Cantillon', 'Circuit des revenus'],
      oeuvres: [['Essai sur la nature du commerce en général', '1755, posthume']]
    },
    {
      id: 'Q13575', bnf: '121577604', photo: "Quesnay Portrait.jpg", nom: 'François Quesnay', g: 'precurseurs', courant: 'Physiocratie',
      n: '1694-06-04', ln: 'Méré', d: '1774-12-16', ld: 'Versailles', nat: 'français',
      role: 'Médecin et économiste français, chef de file des physiocrates.',
      parcours: "Chirurgien puis médecin de Madame de Pompadour et de Louis XV, il loge à Versailles. Il se tourne vers l'économie vers soixante ans et réunit autour de lui l'école des « économistes ».",
      pensee: "Seule la terre produit un surplus, le « produit net ». Son Tableau économique représente pour la première fois la circulation des richesses entre classes sociales, et il défend la liberté du commerce des grains.",
      idees: ['Produit net', 'Tableau économique', 'Classe productive, classe stérile, propriétaires', 'Laissez faire, laissez passer'],
      oeuvres: [['Tableau économique', '1758'], ['Maximes générales du gouvernement économique d’un royaume agricole', '1767']]
    },
    {
      id: 'Q221303', bnf: '119272595', photo: "Graincourt, attributed to - Turgot - Versailles MV 3923.jpg", nom: 'Anne Robert Jacques Turgot', court: 'Turgot', g: 'precurseurs', courant: 'Physiocratie',
      n: '1727-05-10', ln: 'Paris', d: '1781-03-18', ld: 'Paris', nat: 'français',
      role: 'Administrateur et économiste français, contrôleur général des finances de Louis XVI.',
      parcours: "Intendant du Limousin de 1761 à 1774, il y expérimente des réformes. Contrôleur général des finances en 1774, il établit la libre circulation des grains et supprime les corporations, avant d'être renvoyé en 1776.",
      pensee: "Proche des physiocrates, il analyse la formation du capital, l'intérêt et la division de la société en classes. Il formule l'idée des rendements décroissants de la terre.",
      idees: ['Liberté du travail', 'Rendements décroissants', "Formation du capital"],
      oeuvres: [['Réflexions sur la formation et la distribution des richesses', '1766']]
    },

    // ----- École classique -----
    {
      id: 'Q37160', bnf: '11908035f', photo: "David Hume Ramsay.jpg", nom: 'David Hume', g: 'classiques', courant: 'Lumières écossaises',
      n: '1711-05-07', ln: 'Édimbourg', d: '1776-08-25', ld: 'Édimbourg', nat: 'écossais',
      role: 'Philosophe, historien et économiste écossais des Lumières.',
      parcours: "Auteur du Traité de la nature humaine, il est écarté des chaires universitaires pour scepticisme religieux. Bibliothécaire à Édimbourg puis secrétaire d'ambassade à Paris, il est l'ami et l'interlocuteur d'Adam Smith.",
      pensee: "Ses Discours politiques réfutent le mercantilisme : un afflux d'or fait monter les prix, ce qui réduit les exportations et rétablit l'équilibre des échanges. Il insiste sur le commerce comme source de civilisation.",
      idees: ['Mécanisme prix-espèces', 'Neutralité de la monnaie à long terme', 'Critique du mercantilisme'],
      oeuvres: [['Traité de la nature humaine', '1739-1740'], ['Discours politiques', '1752']]
    },
    {
      id: 'Q9381', bnf: '119250114', photo: "AdamSmith.jpg", nom: 'Adam Smith', g: 'classiques', courant: 'École classique',
      n: '1723-06', ln: 'Kirkcaldy (Écosse)', d: '1790-07-17', ld: 'Édimbourg', nat: 'écossais',
      role: "Philosophe et économiste écossais, considéré comme le fondateur de l'économie politique classique.",
      parcours: "Professeur de philosophie morale à Glasgow, il voyage en France comme précepteur et y rencontre Quesnay et Turgot. Il termine sa vie commissaire des douanes à Édimbourg.",
      pensee: "La division du travail est la source de la richesse des nations. Guidés par leur intérêt, les individus servent sans le vouloir l'intérêt général, comme conduits par une « main invisible » ; l'État garde des fonctions de défense, de justice et d'ouvrages publics.",
      idees: ['Division du travail', 'Main invisible', 'Valeur d’usage et valeur d’échange', 'Fonctions régaliennes'],
      oeuvres: [['Théorie des sentiments moraux', '1759'], ['Recherches sur la nature et les causes de la richesse des nations', '1776']]
    },
    {
      id: 'Q13526', bnf: '122778124', photo: "Thomas Robert Malthus Wellcome L0069037 -crop.jpg", nom: 'Thomas Robert Malthus', court: 'Malthus', g: 'classiques', courant: 'École classique',
      n: '1766-02', ln: 'Westcott (Angleterre)', d: '1834-12', ld: 'Bath', nat: 'anglais',
      role: 'Pasteur et économiste anglais, théoricien de la population.',
      parcours: "Pasteur anglican, il devient en 1805 professeur d'histoire et d'économie politique au collège de la Compagnie des Indes orientales, à Haileybury. Il entretient une longue controverse amicale avec Ricardo.",
      pensee: "La population tend à croître plus vite que les subsistances, ce qui maintient la majorité près du minimum vital. Contre la loi de Say, il soutient qu'une insuffisance de la demande effective peut provoquer une surproduction générale.",
      idees: ['Principe de population', 'Contrainte morale', 'Demande effective'],
      oeuvres: [['Essai sur le principe de population', '1798'], ["Principes d'économie politique", '1820']]
    },
    {
      id: 'Q160270', bnf: '11921814d', photo: "Portrait of David Ricardo by Thomas Phillips.jpg", nom: 'David Ricardo', g: 'classiques', courant: 'École classique',
      n: '1772-04-18', ln: 'Londres', d: '1823-09-11', ld: 'Gatcombe Park (Angleterre)', nat: 'britannique',
      role: "Agent de change et économiste britannique, principal théoricien de l'école classique.",
      parcours: "Issu d'une famille juive séfarade venue des Pays-Bas, il fait fortune à la Bourse de Londres. Il se consacre ensuite à l'économie et siège à la Chambre des communes à partir de 1819.",
      pensee: "Il fonde la valeur sur la quantité de travail nécessaire et analyse le partage du produit entre rente, profit et salaire. Sa théorie des avantages comparatifs montre que deux pays gagnent à l'échange même si l'un est plus efficace en tout.",
      idees: ['Avantages comparatifs', 'Rente différentielle', 'Valeur-travail', 'État stationnaire'],
      oeuvres: [["Essai sur l'influence d'un bas prix du blé sur les profits", '1815'], ["Des principes de l'économie politique et de l'impôt", '1817']]
    },
    {
      id: 'Q13513', bnf: '119238753', photo: "Jean-Baptiste Say.jpg", nom: 'Jean-Baptiste Say', g: 'classiques', courant: 'École classique (libéralisme français)',
      n: '1767-01-05', ln: 'Lyon', d: '1832-11-14', ld: 'Paris', nat: 'français',
      role: 'Économiste et industriel français, diffuseur de la pensée de Smith en France.',
      parcours: "Membre du Tribunat sous le Consulat, il en est écarté pour avoir refusé de soutenir la politique de Bonaparte. Il dirige une filature de coton, puis enseigne au Conservatoire des arts et métiers et au Collège de France.",
      pensee: "Les produits s'échangent contre des produits : l'offre crée ses propres débouchés, et une surproduction générale durable est impossible. Il donne à l'entrepreneur un rôle central dans la combinaison des facteurs de production.",
      idees: ['Loi des débouchés', "L'entrepreneur", 'Utilité, fondement de la valeur'],
      oeuvres: [["Traité d'économie politique", '1803'], ["Cours complet d'économie politique pratique", '1828-1829']]
    },
    {
      id: 'Q124073', bnf: '11924947c', photo: "Jean Charles Simonde de Sismondi (1773-1842).png", nom: 'Jean de Sismondi', complet: 'Jean Charles Léonard Simonde de Sismondi', g: 'classiques', courant: 'Critique de l’école classique',
      n: '1773-05-09', ln: 'Genève', d: '1842-06-25', ld: 'Chêne-Bougeries (Suisse)', nat: 'genevois',
      role: "Historien et économiste genevois, premier critique de l'industrialisation libérale.",
      parcours: "Auteur d'une monumentale Histoire des républiques italiennes du Moyen Âge, il commence par vulgariser les idées de Smith. Un séjour en Angleterre après les crises de 1815-1818 le fait changer d'avis.",
      pensee: "La concurrence et le machinisme abaissent les salaires et la consommation ouvrière, d'où des crises de surproduction. Il demande que l'État protège les travailleurs, et place le bien-être des hommes au-dessus de l'accumulation des richesses.",
      idees: ['Crises de sous-consommation', 'Protection des travailleurs', 'Critique de la loi de Say'],
      oeuvres: [["Nouveaux principes d'économie politique", '1819']]
    },
    {
      id: 'Q687552', bnf: '122251580', photo: "Nassau William Senior (portrait).jpg", nom: 'Nassau William Senior', g: 'classiques', courant: 'École classique',
      n: '1790-09-26', ln: 'Compton (Angleterre)', d: '1864-06-04', ld: 'Kensington (Londres)', nat: 'anglais',
      role: "Juriste et économiste anglais, premier titulaire de la chaire d'économie politique d'Oxford.",
      parcours: "Avocat, il occupe à partir de 1825 la nouvelle chaire Drummond d'économie politique à Oxford. Il participe à la réforme de la loi sur les pauvres de 1834.",
      pensee: "Il veut faire de l'économie une science déductive fondée sur quelques propositions générales. Il explique l'intérêt comme la rémunération de l'« abstinence », c'est-à-dire du renoncement à consommer.",
      idees: ["Théorie de l'abstinence", "Économie comme science déductive"],
      oeuvres: [['An Outline of the Science of Political Economy', '1836']]
    },
    {
      id: 'Q76787', bnf: '123936784', photo: "Johann Heinrich von Thünen 1840 portrait.png", nom: 'Johann Heinrich von Thünen', g: 'classiques', courant: 'Économie spatiale',
      n: '1783-06-24', ln: 'Waddewarden (Frise orientale)', d: '1850-09-22', ld: 'Warnkenhagen (Mecklembourg)', nat: 'allemand',
      role: "Agronome et économiste allemand, fondateur de l'économie spatiale.",
      parcours: "Propriétaire du domaine de Tellow, dans le Mecklembourg, il y tient pendant des décennies une comptabilité minutieuse. Il en tire ses analyses théoriques.",
      pensee: "Dans un « État isolé » autour d'une ville-marché, les cultures se disposent en cercles concentriques selon le coût du transport. Il formule aussi un raisonnement à la marge sur la productivité des facteurs.",
      idees: ['Cercles de Thünen', 'Rente de situation', 'Raisonnement à la marge'],
      oeuvres: [["L'État isolé", '1826']]
    },
    {
      id: 'Q323245', bnf: '11897951m', photo: "Antoine Augustin Cournot.jpg", nom: 'Antoine Augustin Cournot', g: 'classiques', courant: 'Économie mathématique',
      n: '1801-08-28', ln: 'Gray', d: '1877-03-31', ld: 'Paris', nat: 'français',
      role: "Mathématicien, philosophe et économiste français, pionnier de l'économie mathématique.",
      parcours: "Normalien, professeur d'analyse à Lyon, il fait carrière dans l'administration de l'Instruction publique comme recteur. Son ouvrage économique de 1838 passe presque inaperçu de son vivant.",
      pensee: "Il introduit la fonction de demande et analyse le monopole et la concurrence entre deux producteurs, le duopole, par des équations. Les marginalistes le reconnaîtront comme un précurseur.",
      idees: ['Fonction de demande', 'Duopole de Cournot', 'Équilibre de marché'],
      oeuvres: [['Recherches sur les principes mathématiques de la théorie des richesses', '1838']]
    },
    {
      id: 'Q159917', bnf: '12298931b', photo: "Friedrich List 1845 crop.jpg", nom: 'Friedrich List', g: 'classiques', courant: 'Protectionnisme éducateur',
      n: '1789-08-06', ln: 'Reutlingen', d: '1846-11-30', ld: 'Kufstein', nat: 'allemand',
      role: "Économiste allemand, théoricien du protectionnisme éducateur et de l'union douanière.",
      parcours: "Professeur à Tübingen, emprisonné puis exilé pour ses idées libérales, il vit aux États-Unis de 1825 à 1832. De retour en Europe, il milite pour le Zollverein et le chemin de fer en Allemagne.",
      pensee: "Le libre-échange profite aux nations déjà industrialisées. Une nation en retard doit protéger temporairement ses industries naissantes pour développer ses forces productives, avant de s'ouvrir.",
      idees: ['Protectionnisme éducateur', 'Industries naissantes', 'Forces productives nationales'],
      oeuvres: [["Système national d'économie politique", '1841']]
    },
    {
      id: 'Q13515', bnf: '118905060', photo: "Bastiat.jpg", nom: 'Frédéric Bastiat', g: 'classiques', courant: 'Libéralisme',
      n: '1801-06-30', ln: 'Bayonne', d: '1850-12-24', ld: 'Rome', nat: 'français',
      role: 'Économiste et pamphlétaire français, défenseur du libre-échange.',
      parcours: "Propriétaire terrien dans les Landes, il se fait connaître en 1844 par un article contre le protectionnisme. Il anime l'Association pour la liberté des échanges et est élu député en 1848.",
      pensee: "Par l'ironie, il dénonce les privilèges accordés par l'État et la protection douanière. Il distingue « ce qu'on voit » de « ce qu'on ne voit pas » : les effets cachés d'une mesure comptent autant que ses effets visibles.",
      idees: ["Ce qu'on voit et ce qu'on ne voit pas", 'Sophisme de la vitre cassée', 'Pétition des fabricants de chandelles'],
      oeuvres: [['Sophismes économiques', '1845-1848'], ['La Loi', '1850'], ['Harmonies économiques', '1850']]
    },
    {
      id: 'Q50020', bnf: '11916111f', photo: "John Stuart Mill by London Stereoscopic Company, c1870.jpg", nom: 'John Stuart Mill', g: 'classiques', courant: 'École classique, utilitarisme',
      n: '1806-05-20', ln: 'Londres', d: '1873-05-08', ld: 'Avignon', nat: 'britannique',
      role: 'Philosophe et économiste britannique, dernier grand représentant de l’école classique.',
      parcours: "Fils de l'économiste James Mill, il reçoit une éducation précoce et intensive. Employé de la Compagnie des Indes orientales pendant trente-cinq ans, il siège ensuite aux Communes, où il défend le vote des femmes.",
      pensee: "Il distingue les lois de la production, qui s'imposent comme des lois naturelles, et celles de la répartition, qui relèvent des choix de la société. Il envisage sereinement un « état stationnaire » où la croissance cesse.",
      idees: ['Production et répartition', 'État stationnaire', 'Utilitarisme', 'Liberté individuelle'],
      oeuvres: [["Principes d'économie politique", '1848'], ['De la liberté', '1859'], ["L'Asservissement des femmes", '1869']]
    },

    // ----- Socialismes et critique de l'économie politique -----
    {
      id: 'Q82934', bnf: '11923405t', photo: "Claude Henri de Rouvroy.jpg", nom: 'Henri de Saint-Simon', complet: 'Claude-Henri de Rouvroy, comte de Saint-Simon', g: 'socialismes', courant: 'Socialisme utopique, saint-simonisme',
      n: '1760-10-17', ln: 'Paris', d: '1825-05-19', ld: 'Paris', nat: 'français',
      role: "Philosophe et économiste français, penseur de la société industrielle.",
      parcours: "Aristocrate, il combat pendant la guerre d'indépendance américaine, puis spécule sur les biens nationaux sous la Révolution. Ruiné, il consacre ses dernières années à l'écriture, entouré de disciples dont Auguste Comte.",
      pensee: "La société doit être gouvernée par les « industriels » (producteurs, savants, banquiers) plutôt que par les oisifs. Ses disciples, les saint-simoniens, joueront un grand rôle dans les banques et les chemins de fer du Second Empire.",
      idees: ['Société industrielle', 'Gouvernement des producteurs', 'Saint-simonisme'],
      oeuvres: [["L'Industrie", '1816-1818'], ['Nouveau Christianisme', '1825']]
    },
    {
      id: 'Q181707', bnf: '11903258f', photo: "Françoise Foliot - Jean Gigoux - Portrait de Charles Fourrier (cropped) (1).jpg", nom: 'Charles Fourier', g: 'socialismes', courant: 'Socialisme utopique',
      n: '1772-04-07', ln: 'Besançon', d: '1837-10-10', ld: 'Paris', nat: 'français',
      role: "Philosophe français, théoricien de l'association et du phalanstère.",
      parcours: "Fils de marchand, il exerce comme commis et courtier à Lyon et à Paris. Il publie une œuvre abondante qui rencontre peu d'écho de son vivant, malgré quelques disciples comme Victor Considerant.",
      pensee: "Il critique le commerce et la « civilisation » qui gaspillent les passions humaines. Il imagine des communautés, les phalanstères, où le travail serait varié et attrayant, et le produit partagé entre travail, capital et talent.",
      idees: ['Phalanstère', 'Travail attrayant', 'Association'],
      oeuvres: [['Théorie des quatre mouvements', '1808'], ['Le Nouveau Monde industriel et sociétaire', '1829']]
    },
    {
      id: 'Q179374', bnf: '123743811', photo: "Robert Owen by William Henry Brooke.jpg", nom: 'Robert Owen', g: 'socialismes', courant: 'Socialisme utopique, coopératisme',
      n: '1771-05-14', ln: 'Newtown (pays de Galles)', d: '1858-11-17', ld: 'Newtown', nat: 'gallois',
      role: 'Industriel et réformateur gallois, pionnier du mouvement coopératif.',
      parcours: "Directeur puis copropriétaire des filatures de New Lanark, en Écosse, il y réduit le temps de travail, interdit le travail des jeunes enfants et ouvre une école. Il fonde ensuite la communauté de New Harmony aux États-Unis, qui échoue.",
      pensee: "Le caractère des hommes est formé par leur milieu : améliorer les conditions de travail et l'éducation améliore la société. Il inspire les coopératives et les premiers syndicats britanniques.",
      idees: ['Coopération', 'Réforme des conditions de travail', 'Communautés'],
      oeuvres: [['A New View of Society', '1813-1816']]
    },
    {
      id: 'Q5749', bnf: '11920705x', photo: "Portrait Pierre-Joseph Proudhon (cropped).jpg", nom: 'Pierre-Joseph Proudhon', g: 'socialismes', courant: 'Socialisme libertaire, mutuellisme',
      n: '1809-01-15', ln: 'Besançon', d: '1865-01-19', ld: 'Passy (Paris)', nat: 'français',
      role: 'Penseur socialiste français, théoricien du mutuellisme et du fédéralisme.',
      parcours: "Ouvrier typographe autodidacte, il devient célèbre en 1840 par sa formule « la propriété, c'est le vol ». Député en 1848, il est emprisonné pour ses articles contre Louis-Napoléon Bonaparte, puis s'exile en Belgique.",
      pensee: "Il condamne la propriété qui permet de percevoir un revenu sans travailler, mais défend la possession. Il propose le crédit gratuit, l'échange mutuel entre producteurs et le fédéralisme contre l'État centralisé.",
      idees: ['Mutuellisme', 'Fédéralisme', 'Crédit gratuit', 'Anarchie'],
      oeuvres: [["Qu'est-ce que la propriété ?", '1840'], ['Système des contradictions économiques ou Philosophie de la misère', '1846']]
    },
    {
      id: 'Q9061', bnf: '11914934t', photo: "Karl Marx 001 restored.jpg", nom: 'Karl Marx', g: 'socialismes', courant: 'Marxisme',
      n: '1818-05-05', ln: 'Trèves (Prusse)', d: '1883-03-14', ld: 'Londres', nat: 'allemand',
      role: 'Philosophe et économiste allemand, exilé à Londres après 1849.',
      parcours: "Docteur en philosophie, journaliste à Cologne, il est expulsé successivement de Prusse, de France et de Belgique. Il s'installe à Londres en 1849, où il vit en partie de l'aide de Friedrich Engels et étudie au British Museum.",
      pensee: "Le Capital, dont le livre I paraît en 1867, part de la marchandise pour reconstruire la logique d'ensemble du mode de production capitaliste. La plus-value naît de la différence entre la valeur produite par la force de travail et son prix ; les livres II et III, laissés inachevés, sont édités par Engels en 1885 et 1894.",
      idees: ['Plus-value', 'Force de travail', 'Lutte des classes', 'Mode de production'],
      oeuvres: [['Manifeste du Parti communiste (avec Engels)', '1848'], ["Contribution à la critique de l'économie politique", '1859'], ['Le Capital, livre I', '1867']]
    },
    {
      id: 'Q34787', bnf: '119017679', photo: "Friedrich Engels portrait (cropped).jpg", nom: 'Friedrich Engels', g: 'socialismes', courant: 'Marxisme',
      n: '1820-11-28', ln: 'Barmen (Prusse)', d: '1895-08-05', ld: 'Londres', nat: 'allemand',
      role: 'Philosophe et industriel allemand, collaborateur de Karl Marx.',
      parcours: "Fils d'un industriel du textile, il travaille dans la filature familiale de Manchester, dont il observe les conditions ouvrières. Il cosigne le Manifeste avec Marx, le soutient financièrement et publie après sa mort les livres II et III du Capital.",
      pensee: "Il décrit la condition ouvrière de la première révolution industrielle et contribue à la conception matérialiste de l'histoire. Il popularise la distinction entre socialisme « utopique » et socialisme « scientifique ».",
      idees: ['Condition ouvrière', 'Matérialisme historique', 'Socialisme scientifique'],
      oeuvres: [['La Situation de la classe laborieuse en Angleterre', '1845'], ["L'Origine de la famille, de la propriété privée et de l'État", '1884']]
    },
    {
      id: 'Q7231', bnf: '12275704r', photo: "Rosa Luxemburg.jpg", nom: 'Rosa Luxemburg', sexe: 'f', g: 'socialismes', courant: 'Marxisme',
      n: '1871-03-05', ln: 'Zamość (Empire russe)', d: '1919-01-15', ld: 'Berlin', nat: 'allemande d’origine polonaise',
      role: "Théoricienne marxiste et militante révolutionnaire allemande d'origine polonaise.",
      parcours: "Docteure en économie de l'université de Zurich, elle milite au Parti social-démocrate allemand et enseigne à son école. Opposée à la guerre de 1914, emprisonnée, elle fonde la Ligue spartakiste ; elle est assassinée en janvier 1919.",
      pensee: "Contre le réformisme, elle défend la révolution. Dans L'Accumulation du capital, elle soutient que le capitalisme a besoin de débouchés extérieurs non capitalistes, ce qui explique l'impérialisme.",
      idees: ['Accumulation du capital', 'Impérialisme', 'Critique du réformisme'],
      oeuvres: [['Réforme sociale ou révolution ?', '1899'], ["L'Accumulation du capital", '1913']]
    },
    {
      id: 'Q57848', bnf: '12278127g', photo: "Rudolf Hilferding.jpg", nom: 'Rudolf Hilferding', g: 'socialismes', courant: 'Austro-marxisme',
      n: '1877-08-10', ln: 'Vienne', d: '1941-02-11', ld: 'Paris', nat: 'autrichien puis allemand',
      role: 'Médecin, économiste et homme politique social-démocrate, théoricien du capital financier.',
      parcours: "Médecin de formation, il devient l'un des principaux théoriciens du Parti social-démocrate allemand. Ministre des Finances en 1923 puis de 1928 à 1929, il s'exile après 1933 et meurt aux mains de la Gestapo à Paris.",
      pensee: "Les banques et l'industrie fusionnent en un « capital financier » qui favorise les cartels, les monopoles et l'expansion impérialiste. L'ouvrage influence durablement les analyses de l'impérialisme.",
      idees: ['Capital financier', 'Cartels et monopoles', 'Impérialisme'],
      oeuvres: [['Le Capital financier', '1910']]
    },
    {
      id: 'Q312799', bnf: '12296118f', photo: "Николай Кондратьев.JPG", nom: 'Nikolaï Kondratiev', g: 'socialismes', courant: 'Théorie des cycles',
      n: '1892-03-16', ln: 'Galouïevskaïa (Russie)', d: '1938-09-17', ld: 'Kommounarka (près de Moscou)', nat: 'russe',
      role: 'Économiste russe, théoricien des cycles longs.',
      parcours: "Il fonde en 1920 l'Institut de la conjoncture de Moscou et participe à l'élaboration de la Nouvelle politique économique. Arrêté en 1930, condamné, il est fusillé en 1938 lors des purges staliniennes.",
      pensee: "L'étude des prix et des productions sur plus d'un siècle fait apparaître des cycles longs d'environ cinquante ans, alternant phases d'expansion et de dépression. Schumpeter leur donnera son nom.",
      idees: ['Cycles longs (cycles Kondratiev)', 'Conjoncture'],
      oeuvres: [['Les grands cycles de la conjoncture', '1925']]
    },

    // ----- Marginalisme et école néoclassique -----
    {
      id: 'Q13509', bnf: '11928836d', photo: "Léon Walras.jpg", nom: 'Léon Walras', g: 'neoclassiques', courant: 'Marginalisme, école de Lausanne',
      n: '1834-12-16', ln: 'Évreux', d: '1910-01-05', ld: 'Clarens (Suisse)', nat: 'français',
      role: "Économiste français, fondateur de la théorie de l'équilibre général.",
      parcours: "Fils de l'économiste Auguste Walras, il échoue à Polytechnique et tente le journalisme et la banque coopérative. Écarté de l'université française, il obtient en 1870 la chaire d'économie politique de Lausanne.",
      pensee: "Il représente l'économie comme un système de marchés interdépendants dont les prix s'ajustent ensemble jusqu'à l'équilibre général. Avec Jevons et Menger, il fonde la valeur sur l'utilité marginale (la « rareté »).",
      idees: ['Équilibre général', 'Utilité marginale (rareté)', 'Tâtonnement', 'Commissaire-priseur'],
      oeuvres: [["Éléments d'économie politique pure", '1874-1877']]
    },
    {
      id: 'Q312546', bnf: '12028417m', photo: "Picture of jevons.jpg", nom: 'William Stanley Jevons', g: 'neoclassiques', courant: 'Marginalisme',
      n: '1835-09-01', ln: 'Liverpool', d: '1882-08-13', ld: 'Bulverhythe (Angleterre)', nat: 'britannique',
      role: "Économiste et logicien britannique, l'un des fondateurs du marginalisme.",
      parcours: "Essayeur à la Monnaie de Sydney dans sa jeunesse, il devient professeur à Manchester puis à University College à Londres. Il meurt noyé à quarante-six ans.",
      pensee: "La valeur dépend entièrement de l'utilité, et plus précisément de l'utilité du dernier élément consommé. Il montre aussi que les gains d'efficacité dans l'usage du charbon en augmentent la consommation totale.",
      idees: ['Utilité marginale', 'Paradoxe de Jevons', 'Taches solaires et cycles'],
      oeuvres: [['The Coal Question', '1865'], ['The Theory of Political Economy', '1871']]
    },
    {
      id: 'Q84177', bnf: '12279135b', photo: "Carl Menger Portrait ONB cropped.png", nom: 'Carl Menger', g: 'neoclassiques', courant: 'Marginalisme, école autrichienne',
      n: '1840-02-23', ln: 'Neu Sandez (Galicie)', d: '1921-02-26', ld: 'Vienne', nat: 'autrichien',
      role: "Économiste autrichien, fondateur de l'école autrichienne d'économie.",
      parcours: "Journaliste économique puis fonctionnaire, il devient professeur à l'université de Vienne et précepteur du prince héritier Rodolphe. Il s'oppose à l'école historique allemande dans la « querelle des méthodes ».",
      pensee: "La valeur des biens est subjective : elle dépend de leur capacité à satisfaire des besoins classés par ordre d'importance. Les institutions comme la monnaie naissent spontanément des actions individuelles.",
      idees: ['Valeur subjective', 'Querelle des méthodes', 'Origine spontanée de la monnaie'],
      oeuvres: [["Principes d'économie politique", '1871']]
    },
    {
      id: 'Q13529', bnf: '12278419p', photo: "Alfred Marshall.jpg", nom: 'Alfred Marshall', g: 'neoclassiques', courant: 'École néoclassique (Cambridge)',
      n: '1842-07-26', ln: 'Londres', d: '1924-07-13', ld: 'Cambridge', nat: 'britannique',
      role: "Économiste britannique, fondateur de l'école néoclassique de Cambridge.",
      parcours: "Mathématicien de formation, il enseigne à Bristol puis à Cambridge, où il obtient la création d'un cursus d'économie séparé en 1903. Il forme Keynes et Pigou.",
      pensee: "Il réconcilie l'utilité et le coût de production : comme les deux lames d'une paire de ciseaux, l'offre et la demande déterminent ensemble le prix. Il développe l'équilibre partiel, l'élasticité et le surplus du consommateur.",
      idees: ['Équilibre partiel', "Élasticité-prix", 'Surplus du consommateur', 'Courte et longue période'],
      oeuvres: [["Principes d'économie politique", '1890'], ['Industry and Trade', '1919']]
    },
    {
      id: 'Q355607', bnf: '123517276', photo: "Edgeworth.jpeg", nom: 'Francis Ysidro Edgeworth', g: 'neoclassiques', courant: 'École néoclassique',
      n: '1845-02-08', ln: 'Edgeworthstown (Irlande)', d: '1926-02-13', ld: 'Oxford', nat: 'irlandais',
      role: "Économiste et statisticien irlandais, pionnier de l'économie mathématique.",
      parcours: "Formé aux lettres classiques, puis au droit, il devient professeur d'économie politique à Oxford en 1891. Il est pendant plus de trente ans rédacteur de l'Economic Journal.",
      pensee: "Il introduit les courbes d'indifférence et la « boîte » qui porte son nom pour représenter l'échange entre deux agents. Il montre que la négociation converge vers l'équilibre concurrentiel quand le nombre d'échangistes augmente.",
      idees: ['Courbes d’indifférence', "Boîte d'Edgeworth", 'Courbe des contrats'],
      oeuvres: [['Mathematical Psychics', '1881']]
    },
    {
      id: 'Q11031', bnf: '11918602b', photo: "Vilfredo Pareto 1870s2.jpg", nom: 'Vilfredo Pareto', g: 'neoclassiques', courant: 'École de Lausanne',
      n: '1848-07-15', ln: 'Paris', d: '1923-08-19', ld: 'Céligny (Suisse)', nat: 'italien',
      role: 'Ingénieur, économiste et sociologue italien, successeur de Walras à Lausanne.',
      parcours: "Né à Paris d'un père exilé, ingénieur des chemins de fer en Italie, il succède à Walras à l'université de Lausanne en 1893. Il se tourne ensuite vers la sociologie.",
      pensee: "Un état est optimal quand on ne peut améliorer la situation d'un individu sans dégrader celle d'un autre. Il observe aussi une distribution régulière des revenus, et étudie la circulation des élites.",
      idees: ['Optimum de Pareto', 'Loi de Pareto', 'Circulation des élites'],
      oeuvres: [["Cours d'économie politique", '1896-1897'], ["Manuel d'économie politique", '1906'], ['Traité de sociologie générale', '1916']]
    },
    {
      id: 'Q311535', bnf: '11929876w', photo: "Eugen von Böhm-Bawerk 1896 Portrait cropped.png", nom: 'Eugen von Böhm-Bawerk', g: 'neoclassiques', courant: 'École autrichienne',
      n: '1851-02-12', ln: 'Brünn (Moravie)', d: '1914-08-27', ld: 'Kramsach (Tyrol)', nat: 'autrichien',
      role: 'Économiste autrichien, théoricien du capital et de l’intérêt.',
      parcours: "Élève de Menger, professeur à Innsbruck puis à Vienne, il est trois fois ministre des Finances de l'Autriche. Il forme Mises et Schumpeter.",
      pensee: "Produire par des détours, avec du capital, est plus productif mais demande du temps. L'intérêt rémunère la préférence pour le présent. Il publie une critique influente de la théorie de la valeur de Marx.",
      idees: ['Détour de production', "Préférence pour le présent", 'Critique de Marx'],
      oeuvres: [['Capital et intérêt', '1884-1889'], ['Karl Marx et la fin de son système', '1896']]
    },
    {
      id: 'Q365858', bnf: '122778097', photo: "Knut Wicksell av Albert Rahmn.tif", nom: 'Knut Wicksell', g: 'neoclassiques', courant: 'École de Stockholm',
      n: '1851-12-20', ln: 'Stockholm', d: '1926-05-03', ld: 'Danderyd (Suède)', nat: 'suédois',
      role: "Économiste suédois, précurseur de la macroéconomie monétaire.",
      parcours: "Conférencier néomalthusien et libre penseur, il obtient tardivement un poste de professeur à Lund. Il est emprisonné deux mois en 1908 pour blasphème.",
      pensee: "Il distingue le taux d'intérêt monétaire du taux « naturel » : quand le premier est inférieur au second, l'investissement s'emballe et les prix montent de manière cumulative. Il inspire l'école de Stockholm et Keynes.",
      idees: ['Taux d’intérêt naturel', 'Processus cumulatif', 'Règle de l’unanimité'],
      oeuvres: [['Intérêt et prix', '1898'], ["Leçons d'économie politique", '1901-1906']]
    },
    {
      id: 'Q704893', bnf: '12278491d', photo: "John Bates Clark.jpg", nom: 'John Bates Clark', g: 'neoclassiques', courant: 'Marginalisme',
      n: '1847-01-26', ln: 'Providence (États-Unis)', d: '1938-03-21', ld: 'New York', nat: 'américain',
      role: "Économiste américain, auteur de la théorie de la répartition par la productivité marginale.",
      parcours: "Formé en Allemagne, il enseigne à Smith College, à Amherst puis à Columbia. Il est l'un des fondateurs de l'American Economic Association.",
      pensee: "En concurrence, chaque facteur de production reçoit l'équivalent de sa productivité marginale : la répartition des revenus est ainsi expliquée par la contribution de chacun.",
      idees: ['Productivité marginale', 'Répartition des revenus'],
      oeuvres: [['The Distribution of Wealth', '1899']]
    },
    {
      id: 'Q312739', bnf: '122777585', photo: "Irvingfisher.jpg", nom: 'Irving Fisher', g: 'neoclassiques', courant: 'École néoclassique, monétarisme (précurseur)',
      n: '1867-02-27', ln: 'Saugerties (États-Unis)', d: '1947-04-29', ld: 'New York', nat: 'américain',
      role: 'Économiste américain, théoricien de la monnaie et de l’intérêt.',
      parcours: "Premier docteur en économie de Yale, il y enseigne toute sa carrière. Inventeur et homme d'affaires, il perd sa fortune dans le krach de 1929, après avoir affirmé que les cours avaient atteint un plateau durablement élevé.",
      pensee: "Il formalise la théorie quantitative de la monnaie (MV = PT) et distingue taux d'intérêt nominal et réel. Après 1929, il explique les grandes dépressions par la spirale du surendettement et de la baisse des prix.",
      idees: ['Équation des échanges', "Effet Fisher", 'Déflation par la dette'],
      oeuvres: [['The Purchasing Power of Money', '1911'], ['The Theory of Interest', '1930'], ['The Debt-Deflation Theory of Great Depressions', '1933']]
    },
    {
      id: 'Q313034', bnf: '12278002v', photo: "Portrait of Arthur Cecil Pigou, c. 1918-1921.jpg", nom: 'Arthur Cecil Pigou', g: 'neoclassiques', courant: 'École de Cambridge, économie du bien-être',
      n: '1877-11-18', ln: 'Ryde (île de Wight)', d: '1959-03-07', ld: 'Cambridge', nat: 'britannique',
      role: "Économiste britannique, fondateur de l'économie du bien-être.",
      parcours: "Élève de Marshall, il lui succède en 1908 à la chaire d'économie politique de Cambridge. Il est l'une des cibles de la Théorie générale de Keynes.",
      pensee: "Quand le coût privé d'une activité diffère de son coût social, le marché n'aboutit pas au meilleur résultat. Une taxe peut corriger ces effets externes, comme la pollution.",
      idees: ['Externalités', 'Taxe pigouvienne', 'Effet Pigou'],
      oeuvres: [['Wealth and Welfare', '1912'], ['The Economics of Welfare', '1920']]
    },

    // ----- Institutions, histoire et sociologie économiques -----
    {
      id: 'Q73646', bnf: '12278453v', photo: "Veblen3a.jpg", nom: 'Thorstein Veblen', g: 'institutions', courant: 'Institutionnalisme',
      n: '1857-07-30', ln: 'Cato (Wisconsin)', d: '1929-08-03', ld: 'Menlo Park (Californie)', nat: 'américain',
      role: "Économiste et sociologue américain, fondateur de l'institutionnalisme.",
      parcours: "Fils d'immigrants norvégiens, il enseigne à Chicago, Stanford et Missouri, avec une carrière universitaire chaotique. Il participe à la fondation de la New School for Social Research à New York.",
      pensee: "Les comportements économiques sont façonnés par les institutions et les habitudes. Les classes aisées consomment pour afficher leur rang, et la logique financière des affaires s'oppose à la logique productive de l'industrie.",
      idees: ['Consommation ostentatoire', 'Classe de loisir', 'Effet Veblen', 'Institutions'],
      oeuvres: [['Théorie de la classe de loisir', '1899'], ['The Theory of Business Enterprise', '1904']]
    },
    {
      id: 'Q1701606', bnf: '12292008w', photo: "JohnCommons.jpg", nom: 'John R. Commons', complet: 'John Rogers Commons', g: 'institutions', courant: 'Institutionnalisme',
      n: '1862-10-13', ln: 'Comté de Darke (Ohio)', d: '1945-05-11', ld: 'Fort Lauderdale (Floride)', nat: 'américain',
      role: "Économiste américain, figure de l'institutionnalisme et historien du travail.",
      parcours: "Professeur à l'université du Wisconsin, il inspire de nombreuses lois sociales de cet État, sur les accidents du travail et l'assurance chômage. Ses élèves participent au New Deal.",
      pensee: "L'unité de base de l'économie est la transaction, encadrée par le droit et les règles collectives. Le capitalisme est façonné par les tribunaux et les organisations, non par le seul marché.",
      idees: ['Transaction', 'Action collective', 'Fondements juridiques du capitalisme'],
      oeuvres: [['Legal Foundations of Capitalism', '1924'], ['Institutional Economics', '1934']]
    },
    {
      id: 'Q9387', bnf: '11928969n', photo: "Max Weber in 1918.png", nom: 'Max Weber', g: 'institutions', courant: 'Sociologie économique',
      n: '1864-04-21', ln: 'Erfurt', d: '1920-06-14', ld: 'Munich', nat: 'allemand',
      role: 'Sociologue et économiste allemand, fondateur de la sociologie compréhensive.',
      parcours: "Juriste et historien de l'économie, professeur à Fribourg puis à Heidelberg, il interrompt son enseignement après une grave dépression. Il participe à la rédaction de la Constitution de Weimar.",
      pensee: "Il montre l'affinité entre l'éthique protestante et l'esprit du capitalisme, et décrit la rationalisation croissante des sociétés modernes. Il analyse les formes de domination et la bureaucratie.",
      idees: ['Esprit du capitalisme', 'Rationalisation', 'Idéal-type', 'Bureaucratie'],
      oeuvres: [["L'Éthique protestante et l'esprit du capitalisme", '1904-1905'], ['Économie et société', '1922, posthume']]
    },
    {
      id: 'Q58031', bnf: '12033721p', photo: "Nicola Perscheid - Werner Sombart vor 1930.jpg", nom: 'Werner Sombart', g: 'institutions', courant: 'École historique allemande',
      n: '1863-01-19', ln: 'Ermsleben (Prusse)', d: '1941-05-18', ld: 'Berlin', nat: 'allemand',
      role: 'Économiste et sociologue allemand, historien du capitalisme.',
      parcours: "Professeur à Breslau puis à Berlin, d'abord proche du marxisme, il s'en éloigne progressivement. Il se rallie au nationalisme dans l'entre-deux-guerres et compromet sa réputation sous le nazisme.",
      pensee: "Il popularise le terme « capitalisme » et en propose une histoire par époques (précoce, plein, tardif), fondée sur l'esprit d'entreprise et le calcul rationnel. Il emploie l'expression « destruction créatrice ».",
      idees: ['Capitalisme moderne', "Esprit d'entreprise", 'Périodisation du capitalisme'],
      oeuvres: [['Le Capitalisme moderne', '1902'], ['Le Bourgeois', '1913']]
    },
    {
      id: 'Q318029', bnf: '11920166g', photo: "Polányi Károly.jpg", nom: 'Karl Polanyi', g: 'institutions', courant: 'Anthropologie économique',
      n: '1886-10-25', ln: 'Vienne', d: '1964-04-23', ld: 'Pickering (Canada)', nat: 'hongrois',
      role: 'Économiste et anthropologue hongrois, critique du libéralisme de marché.',
      parcours: "Juriste à Budapest, journaliste économique à Vienne, il émigre en Angleterre en 1933 puis aux États-Unis, où il enseigne à Columbia. Il étudie les économies anciennes et non occidentales.",
      pensee: "Dans la plupart des sociétés, l'économie est « encastrée » dans les relations sociales. Le XIXᵉ siècle a tenté de créer un marché autorégulateur de la terre, du travail et de la monnaie, ce qui a provoqué un contre-mouvement de protection sociale.",
      idees: ['Encastrement', 'Marchandises fictives', 'Double mouvement'],
      oeuvres: [['La Grande Transformation', '1944']]
    },
    {
      id: 'Q975777', bnf: '11910426v', photo: "Ernest Labrousse 1986.jpg", nom: 'Ernest Labrousse', g: 'institutions', courant: 'Histoire économique et sociale',
      n: '1895-03-16', ln: 'Barbezieux', d: '1988-05-23', ld: 'Paris', nat: 'français',
      role: "Historien français, fondateur de l'histoire économique quantitative en France.",
      parcours: "Docteur en droit, il enseigne à la Sorbonne à partir de 1945, où il occupe la chaire d'histoire économique et sociale. Il forme une génération d'historiens.",
      pensee: "À partir des séries de prix et de revenus, il montre comment les crises agricoles de l'Ancien Régime se propagent à toute l'économie et contribuent à la Révolution de 1789.",
      idees: ['Histoire sérielle des prix', "Crise d'Ancien Régime", 'Conjoncture'],
      oeuvres: [['Esquisse du mouvement des prix et des revenus en France au XVIIIᵉ siècle', '1933'], ["La Crise de l'économie française à la fin de l'Ancien Régime et au début de la Révolution", '1944']]
    },
    {
      id: 'Q185105', bnf: '11893813t', photo: "Photo of Fernand Braudel on The Identity of France dustjacket.jpg", nom: 'Fernand Braudel', g: 'institutions', courant: 'École des Annales',
      n: '1902-08-24', ln: 'Luméville-en-Ornois', d: '1985-11-27', ld: 'Cluses', nat: 'français',
      role: 'Historien français, chef de file de la deuxième génération des Annales.',
      parcours: "Professeur en Algérie et au Brésil, il rédige sa thèse sur la Méditerranée en captivité pendant la Seconde Guerre mondiale. Professeur au Collège de France, il préside la VIᵉ section de l'École pratique des hautes études et fonde la Maison des sciences de l'homme.",
      pensee: "Il distingue plusieurs temporalités : le temps long des structures, celui de la conjoncture et celui de l'événement. Il décrit le capitalisme comme l'étage supérieur, marchand et financier, d'économies-mondes successives.",
      idees: ['Longue durée', 'Économie-monde', 'Civilisation matérielle'],
      oeuvres: [["La Méditerranée et le monde méditerranéen à l'époque de Philippe II", '1949'], ['Civilisation matérielle, économie et capitalisme', '1979']]
    },
    {
      id: 'Q709886', bnf: '12436874z', nom: 'Alexander Gerschenkron', g: 'institutions', courant: 'Histoire économique',
      n: '1904-10-01', ln: 'Odessa (Empire russe)', d: '1978-10-26', ld: 'Cambridge (Massachusetts)', nat: 'américain d’origine russe',
      role: "Historien de l'économie américain d'origine russe, théoricien du retard économique.",
      parcours: "Il fuit la Russie révolutionnaire pour l'Autriche, puis émigre aux États-Unis en 1938. Économiste à la Réserve fédérale, il devient professeur à Harvard.",
      pensee: "Les pays industrialisés tardivement ne reproduisent pas le chemin anglais : plus le retard est grand, plus les banques et l'État jouent un rôle moteur et plus l'industrialisation est brutale.",
      idees: ['Avantages du retard', 'Rôle des banques et de l’État', 'Industrialisation tardive'],
      oeuvres: [['Economic Backwardness in Historical Perspective', '1962']]
    },
    {
      id: 'Q1065713', bnf: '11909760t', nom: 'Charles P. Kindleberger', court: 'Charles Kindleberger', g: 'institutions', courant: 'Histoire économique',
      n: '1910-10-12', ln: 'New York', d: '2003-07-07', ld: 'Cambridge (Massachusetts)', nat: 'américain',
      role: "Économiste et historien américain des crises financières.",
      parcours: "Économiste à la Réserve fédérale puis au département d'État, il participe à la conception du plan Marshall. Il enseigne ensuite au MIT de 1948 à 1976.",
      pensee: "La crise des années 1930 a été si profonde parce qu'aucune puissance n'a voulu ni pu stabiliser l'économie mondiale. Il décrit les crises financières comme une succession de manie, de panique et de krach.",
      idees: ['Stabilité hégémonique', 'Prêteur en dernier ressort international', 'Manies, paniques et krachs'],
      oeuvres: [['La Grande Crise mondiale 1929-1939', '1973'], ['Manias, Panics, and Crashes', '1978']]
    },
    {
      id: 'Q243193', bnf: '122782988', photo: "Douglass North.jpg", nom: 'Douglass North', g: 'institutions', courant: 'Nouvelle économie institutionnelle, cliométrie',
      n: '1920-11-05', ln: 'Cambridge (Massachusetts)', d: '2015-11-23', ld: 'Benzonia (Michigan)', nat: 'américain',
      role: "Économiste et historien américain, prix Nobel d'économie en 1993.",
      parcours: "Professeur à l'université de Washington puis à l'université Washington de Saint-Louis, il est l'un des pionniers de la cliométrie, l'histoire économique quantitative. Il partage le prix Nobel 1993 avec Robert Fogel.",
      pensee: "Les institutions, règles formelles et normes informelles, déterminent les coûts de transaction et donc les performances économiques des sociétés sur le long terme. Le changement institutionnel dépend des choix passés.",
      idees: ['Institutions', 'Coûts de transaction', 'Dépendance au sentier'],
      oeuvres: [['Institutions, Institutional Change and Economic Performance', '1990']]
    },

    // ----- Keynes et les débats du XXe siècle -----
    {
      id: 'Q9317', bnf: '12041754c', photo: "Keynes 1933.jpg", nom: 'John Maynard Keynes', g: 'xxe', courant: 'Keynésianisme',
      n: '1883-06-05', ln: 'Cambridge', d: '1946-04-21', ld: 'Firle (Angleterre)', nat: 'britannique',
      role: 'Économiste britannique, fondateur de la macroéconomie moderne.',
      parcours: "Élève de Marshall, haut fonctionnaire au Trésor, il démissionne de la délégation britannique à la conférence de la paix en 1919. Il conduit la délégation britannique à Bretton Woods en 1944.",
      pensee: "Le niveau de l'emploi dépend de la demande effective. Une économie peut rester durablement en sous-emploi ; l'État doit alors soutenir l'investissement et la demande. La préférence pour la liquidité explique le taux d'intérêt.",
      idees: ['Demande effective', 'Multiplicateur', 'Préférence pour la liquidité', 'Équilibre de sous-emploi'],
      oeuvres: [['Les Conséquences économiques de la paix', '1919'], ['Traité sur la monnaie', '1930'], ["Théorie générale de l'emploi, de l'intérêt et de la monnaie", '1936']]
    },
    {
      id: 'Q78477', bnf: '11924160c', photo: "Joseph Schumpeter ekonomialaria.jpg", nom: 'Joseph Schumpeter', g: 'xxe', courant: 'Économie de l’innovation',
      n: '1883-02-08', ln: 'Triesch (Moravie)', d: '1950-01-08', ld: 'Salisbury (Connecticut)', nat: 'autrichien puis américain',
      role: "Économiste autrichien naturalisé américain, théoricien de l'innovation.",
      parcours: "Élève de Böhm-Bawerk, ministre des Finances de l'Autriche en 1919, puis banquier ruiné, il enseigne à Bonn et rejoint Harvard en 1932.",
      pensee: "L'entrepreneur innovateur est le moteur du capitalisme : ses innovations détruisent les anciennes structures pour en créer de nouvelles. Ce processus de « destruction créatrice » explique les cycles économiques.",
      idees: ['Destruction créatrice', "L'entrepreneur innovateur", 'Grappes d’innovations', 'Cycles économiques'],
      oeuvres: [["Théorie de l'évolution économique", '1911'], ['Capitalisme, socialisme et démocratie', '1942'], ["Histoire de l'analyse économique", '1954, posthume']]
    },
    {
      id: 'Q84233', bnf: '11928674d', photo: "Ludwig von Mises.jpg", nom: 'Ludwig von Mises', g: 'xxe', courant: 'École autrichienne',
      n: '1881-09-29', ln: 'Lemberg (Galicie)', d: '1973-10-10', ld: 'New York', nat: 'autrichien puis américain',
      role: "Économiste autrichien naturalisé américain, figure de l'école autrichienne.",
      parcours: "Conseiller de la Chambre de commerce de Vienne, il anime un séminaire privé réputé. Il quitte l'Autriche pour Genève en 1934, puis émigre aux États-Unis en 1940 et enseigne à l'université de New York.",
      pensee: "Sans prix de marché pour les moyens de production, le calcul économique est impossible en régime socialiste. L'expansion artificielle du crédit fausse les décisions d'investissement et provoque les crises.",
      idees: ['Calcul économique socialiste', 'Praxéologie', 'Théorie autrichienne du cycle'],
      oeuvres: [['Théorie de la monnaie et du crédit', '1912'], ["L'Action humaine", '1949']]
    },
    {
      id: 'Q1325', bnf: '119070534', photo: "Friedrich Hayek portrait.jpg", nom: 'Friedrich Hayek', complet: 'Friedrich August von Hayek', g: 'xxe', courant: 'École autrichienne, libéralisme',
      n: '1899-05-08', ln: 'Vienne', d: '1992-03-23', ld: 'Fribourg-en-Brisgau', nat: 'autrichien puis britannique',
      role: "Économiste et philosophe autrichien naturalisé britannique, prix Nobel d'économie en 1974.",
      parcours: "Élève de Mises, il est appelé à la London School of Economics en 1931, où il s'oppose à Keynes. Il enseigne ensuite à Chicago puis à Fribourg-en-Brisgau, et fonde en 1947 la Société du Mont-Pèlerin.",
      pensee: "Les prix transmettent une information dispersée qu'aucun planificateur ne peut rassembler. L'ordre social est un « ordre spontané » ; la planification mène à la perte des libertés.",
      idees: ['Ordre spontané', 'Les prix comme information', 'Critique de la planification'],
      oeuvres: [['Prix et production', '1931'], ['La Route de la servitude', '1944'], ['Droit, législation et liberté', '1973-1979']]
    },
    {
      id: 'Q370468', bnf: '11925385h', photo: "Piero Sraffa (cropped).jpg", nom: 'Piero Sraffa', g: 'xxe', courant: 'Néo-ricardien',
      n: '1898-08-05', ln: 'Turin', d: '1983-09-03', ld: 'Cambridge', nat: 'italien',
      role: "Économiste italien de Cambridge, fondateur du courant néo-ricardien.",
      parcours: "Ami d'Antonio Gramsci, il quitte l'Italie fasciste pour Cambridge en 1927 à l'invitation de Keynes. Il y dirige l'édition des œuvres complètes de Ricardo.",
      pensee: "Il critique la théorie marshallienne de la concurrence, puis reconstruit les prix à partir des conditions de production, sans recourir à l'utilité. Son livre de 1960 alimente la controverse des deux Cambridge sur le capital.",
      idees: ['Marchandise-étalon', 'Controverse sur le capital', 'Retour à Ricardo'],
      oeuvres: [['The Laws of Returns under Competitive Conditions', '1926'], ['Production de marchandises par des marchandises', '1960']]
    },
    {
      id: 'Q436745', bnf: '120313693', photo: "Michal Kalecki.jpg", nom: 'Michał Kalecki', g: 'xxe', courant: 'Post-keynésianisme',
      n: '1899-06-22', ln: 'Łódź', d: '1970-04-17', ld: 'Varsovie', nat: 'polonais',
      role: 'Économiste polonais, découvreur indépendant du principe de la demande effective.',
      parcours: "Autodidacte en économie, il travaille à l'Institut de recherche sur la conjoncture de Varsovie, puis à Oxford et aux Nations unies. Il rentre en Pologne en 1955.",
      pensee: "Avant Keynes, il montre que l'investissement détermine le profit et l'emploi. Il intègre la répartition et le degré de monopole dans l'analyse des cycles, et souligne les obstacles politiques au plein-emploi.",
      idees: ['Demande effective', 'Les capitalistes gagnent ce qu’ils dépensent', 'Cycle politique'],
      oeuvres: [["Essai sur la théorie du cycle des affaires", '1933'], ['Political Aspects of Full Employment', '1943']]
    },
    {
      id: 'Q234793', bnf: '122790201', photo: "Joan Robinson (1973).jpg", nom: 'Joan Robinson', sexe: 'f', g: 'xxe', courant: 'Post-keynésianisme',
      n: '1903-10-31', ln: 'Camberley (Angleterre)', d: '1983-08-05', ld: 'Cambridge', nat: 'britannique',
      role: "Économiste britannique, figure de l'école de Cambridge et du post-keynésianisme.",
      parcours: "Membre du « Circus » de jeunes économistes qui discutent les travaux de Keynes, elle enseigne à Cambridge toute sa carrière. Elle mène la controverse des deux Cambridge contre Samuelson et Solow.",
      pensee: "Elle analyse la concurrence imparfaite et le monopsone sur le marché du travail. Elle prolonge Keynes dans une théorie de la croissance et de l'accumulation, et critique la notion néoclassique de capital.",
      idees: ['Concurrence imparfaite', 'Monopsone', 'Controverse sur le capital'],
      oeuvres: [['The Economics of Imperfect Competition', '1933'], ["L'Accumulation du capital", '1956']]
    },
    {
      id: 'Q184862', bnf: '119074897', photo: "John Hicks 1972b.jpg", nom: 'John Hicks', g: 'xxe', courant: 'Synthèse néoclassique',
      n: '1904-04-08', ln: 'Warwick', d: '1989-05-20', ld: 'Blockley (Angleterre)', nat: 'britannique',
      role: "Économiste britannique, prix Nobel d'économie en 1972.",
      parcours: "Il enseigne à la London School of Economics, à Cambridge, à Manchester puis à Oxford. Il partage le prix Nobel 1972 avec Kenneth Arrow.",
      pensee: "Son modèle IS-LM traduit la Théorie générale de Keynes en deux courbes, et devient la base de l'enseignement de la macroéconomie. Il renouvelle aussi la théorie de la valeur et de l'équilibre général.",
      idees: ['Modèle IS-LM', 'Effet de substitution et effet de revenu', 'Équilibre général'],
      oeuvres: [['Mr. Keynes and the « Classics »', '1937'], ['Valeur et capital', '1939']]
    },
    {
      id: 'Q152452', bnf: '119173206', photo: "Gunnar Myrdal 1964 002 (cropped).jpg", nom: 'Gunnar Myrdal', g: 'xxe', courant: 'École de Stockholm, économie du développement',
      n: '1898-12-06', ln: 'Skattunge (Suède)', d: '1987-05-17', ld: 'Danderyd (Suède)', nat: 'suédois',
      role: "Économiste et homme politique suédois, prix Nobel d'économie en 1974.",
      parcours: "Professeur à Stockholm, député et ministre du Commerce, il dirige une grande enquête sur la condition des Noirs aux États-Unis. Il partage le prix Nobel 1974 avec Hayek.",
      pensee: "Les inégalités se renforcent d'elles-mêmes par un processus de causalité circulaire et cumulative. Il étudie la pauvreté de l'Asie du Sud et les conditions du développement.",
      idees: ['Causalité circulaire et cumulative', 'Économie du développement', 'État-providence'],
      oeuvres: [['An American Dilemma', '1944'], ['Asian Drama', '1968']]
    },
    {
      id: 'Q192577', bnf: '127745384', photo: "Simon Kuznets 1971b.jpg", nom: 'Simon Kuznets', g: 'xxe', courant: 'Comptabilité nationale',
      n: '1901-04-30', ln: 'Pinsk (Empire russe)', d: '1985-07-08', ld: 'Cambridge (Massachusetts)', nat: 'américain d’origine russe',
      role: "Économiste et statisticien américain, prix Nobel d'économie en 1971.",
      parcours: "Émigré aux États-Unis en 1922, il travaille au National Bureau of Economic Research et établit les premières estimations officielles du revenu national américain. Il enseigne à Pennsylvanie, Johns Hopkins et Harvard.",
      pensee: "Il construit la comptabilité nationale moderne et met en garde contre l'usage du revenu national comme mesure du bien-être. Il propose une courbe en cloche des inégalités au cours du développement.",
      idees: ['Revenu national', 'Courbe de Kuznets', 'Croissance économique moderne'],
      oeuvres: [['National Income and Its Composition', '1941'], ['Economic Growth and Income Inequality', '1955']]
    },
    {
      id: 'Q982374', bnf: '12401452q', photo: "Raul Prebisch (cropped).tif", nom: 'Raúl Prebisch', g: 'xxe', courant: 'Structuralisme latino-américain',
      n: '1901-04-17', ln: 'San Miguel de Tucumán (Argentine)', d: '1986-04-29', ld: 'Santiago du Chili', nat: 'argentin',
      role: "Économiste argentin, théoricien du structuralisme latino-américain.",
      parcours: "Premier directeur de la Banque centrale d'Argentine, il dirige ensuite la Commission économique des Nations unies pour l'Amérique latine (CEPAL) à Santiago, puis devient le premier secrétaire général de la CNUCED en 1964.",
      pensee: "Les termes de l'échange se détériorent pour les pays de la « périphérie », exportateurs de produits primaires, face au « centre » industrialisé. Il prône l'industrialisation par substitution aux importations.",
      idees: ['Centre et périphérie', 'Détérioration des termes de l’échange', 'Substitution aux importations'],
      oeuvres: [["Le Développement économique de l'Amérique latine et ses principaux problèmes", '1949']]
    },
    {
      id: 'Q2415107', bnf: '11919308t', photo: "François Perroux à l'ISMÉA.jpg", nom: 'François Perroux', g: 'xxe', courant: 'Économie du développement',
      n: '1903-12-19', ln: 'Lyon', d: '1987-06-02', ld: 'Stains', nat: 'français',
      role: "Économiste français, théoricien des pôles de croissance et de la domination économique.",
      parcours: "Professeur à Lyon puis à Paris, il fonde en 1944 l'Institut de science économique appliquée. Il est professeur au Collège de France de 1955 à 1974.",
      pensee: "La croissance n'apparaît pas partout à la fois : elle se manifeste en des pôles qui entraînent le reste de l'économie. Les relations économiques sont marquées par des effets de domination entre unités inégales.",
      idees: ['Pôles de croissance', 'Effet de domination', 'Développement et croissance'],
      oeuvres: [["L'Économie du XXᵉ siècle", '1961']]
    },
    {
      id: 'Q1398687', bnf: '11923096v', photo: "Jacques Rueff 1938.png", nom: 'Jacques Rueff', g: 'xxe', courant: 'Libéralisme',
      n: '1896-08-23', ln: 'Paris', d: '1978-04-24', ld: 'Paris', nat: 'français',
      role: 'Économiste et haut fonctionnaire français, conseiller monétaire du général de Gaulle.',
      parcours: "Polytechnicien, inspecteur des finances, il est sous-gouverneur de la Banque de France. En 1958, il conçoit avec Antoine Pinay le plan d'assainissement qui crée le nouveau franc. Il est élu à l'Académie française en 1964.",
      pensee: "Défenseur de l'étalon-or, il critique le système monétaire international fondé sur le dollar, qui permet aux États-Unis de financer leurs déficits sans contrainte.",
      idees: ['Étalon-or', 'Plan Pinay-Rueff', 'Critique de l’étalon de change-or'],
      oeuvres: [["L'Ordre social", '1945'], ["Le Péché monétaire de l'Occident", '1971']]
    },
    {
      id: 'Q186042', bnf: '11903914r', photo: "John Kenneth Galbraith from the back cover of \"The Affluent Society\".jpeg", nom: 'John Kenneth Galbraith', g: 'xxe', courant: 'Institutionnalisme, keynésianisme',
      n: '1908-10-15', ln: 'Iona Station (Canada)', d: '2006-04-29', ld: 'Cambridge (Massachusetts)', nat: 'américain d’origine canadienne',
      role: "Économiste américain d'origine canadienne, critique de la société d'abondance.",
      parcours: "Responsable du contrôle des prix pendant la Seconde Guerre mondiale, il enseigne à Harvard et conseille les présidents démocrates. Il est ambassadeur des États-Unis en Inde de 1961 à 1963.",
      pensee: "La société d'abondance produit des biens privés en excès et des services publics en quantité insuffisante. Les grandes firmes, dirigées par la « technostructure », façonnent la demande au lieu de la suivre.",
      idees: ['Technostructure', 'Filière inversée', "Société d'abondance"],
      oeuvres: [['La Crise économique de 1929', '1955'], ["L'Ère de l'opulence", '1958'], ['Le Nouvel État industriel', '1967']]
    },
    {
      id: 'Q704076', bnf: '12292100d', photo: "HymanMinsky-1.jpg", nom: 'Hyman Minsky', g: 'xxe', courant: 'Post-keynésianisme',
      n: '1919-09-23', ln: 'Chicago', d: '1996-10-24', ld: 'Rhinebeck (New York)', nat: 'américain',
      role: "Économiste américain, théoricien de l'instabilité financière.",
      parcours: "Élève de Schumpeter à Harvard, il enseigne à Brown, à Berkeley puis à l'université Washington de Saint-Louis. Ses travaux connaissent un regain d'intérêt après la crise de 2008.",
      pensee: "La stabilité est déstabilisante : en période de prospérité, les agents s'endettent de plus en plus, passant d'un financement prudent à un financement spéculatif, jusqu'à la crise. Il plaide pour une banque centrale prêteuse en dernier ressort.",
      idees: ["Hypothèse d'instabilité financière", 'Moment Minsky', 'Financement couvert, spéculatif, Ponzi'],
      oeuvres: [['John Maynard Keynes', '1975'], ['Stabilizing an Unstable Economy', '1986']]
    },

    // ----- Économie contemporaine -----
    {
      id: 'Q102454', bnf: '11923583w', photo: "Paul Samuelson.gif", nom: 'Paul Samuelson', g: 'contemporains', courant: 'Synthèse néoclassique',
      n: '1915-05-15', ln: 'Gary (Indiana)', d: '2009-12-13', ld: 'Belmont (Massachusetts)', nat: 'américain',
      role: "Économiste américain, premier Américain lauréat du prix Nobel d'économie, en 1970.",
      parcours: "Professeur au MIT de 1940 à sa mort, il y bâtit l'un des principaux départements d'économie du monde. Son manuel Economics est le plus vendu de l'histoire de la discipline.",
      pensee: "Il donne à l'économie une formulation mathématique unifiée et réunit l'analyse néoclassique des marchés et la macroéconomie keynésienne dans une « synthèse néoclassique ».",
      idees: ['Synthèse néoclassique', 'Préférences révélées', 'Théorème Stolper-Samuelson'],
      oeuvres: [['Foundations of Economic Analysis', '1947'], ['Economics', '1948']]
    },
    {
      id: 'Q47426', bnf: '11903625k', photo: "Portrait Of Milton Friedman (cropped).jpg", nom: 'Milton Friedman', g: 'contemporains', courant: 'Monétarisme, école de Chicago',
      n: '1912-07-31', ln: 'Brooklyn (New York)', d: '2006-11-16', ld: 'San Francisco', nat: 'américain',
      role: "Économiste américain, chef de file du monétarisme, prix Nobel d'économie en 1976.",
      parcours: "Professeur à l'université de Chicago de 1946 à 1977, il est ensuite chercheur à la Hoover Institution. Il conseille les présidents Nixon et Reagan et diffuse ses idées auprès du grand public.",
      pensee: "L'inflation est toujours et partout un phénomène monétaire : la banque centrale doit faire croître la masse monétaire à un rythme constant. Il n'existe pas d'arbitrage durable entre inflation et chômage.",
      idees: ['Monétarisme', 'Revenu permanent', 'Taux de chômage naturel'],
      oeuvres: [['Essays in Positive Economics', '1953'], ['Capitalisme et liberté', '1962'], ['A Monetary History of the United States (avec Anna Schwartz)', '1963']]
    },
    {
      id: 'Q192592', bnf: '12277447p', photo: "Kenneth Arrow, Stanford University.jpg", nom: 'Kenneth Arrow', g: 'contemporains', courant: 'Économie néoclassique, choix social',
      n: '1921-08-23', ln: 'New York', d: '2017-02-21', ld: 'Palo Alto (Californie)', nat: 'américain',
      role: "Économiste américain, prix Nobel d'économie en 1972, le plus jeune lauréat à l'époque.",
      parcours: "Professeur à Stanford et à Harvard, il partage le prix Nobel 1972 avec John Hicks. Il contribue aussi à l'économie de la santé et de l'information.",
      pensee: "Aucune règle de vote ne peut agréger des préférences individuelles en un choix collectif cohérent tout en respectant quelques conditions démocratiques simples. Avec Debreu, il démontre l'existence d'un équilibre général.",
      idees: ["Théorème d'impossibilité", 'Équilibre général Arrow-Debreu', 'Information et incertitude'],
      oeuvres: [['Social Choice and Individual Values', '1951']]
    },
    {
      id: 'Q210960', bnf: '122801806', photo: "Debreu, Gérard (1921-2004).jpeg", nom: 'Gérard Debreu', g: 'contemporains', courant: 'Économie mathématique',
      n: '1921-07-04', ln: 'Calais', d: '2004-12-31', ld: 'Paris', nat: 'français puis américain',
      role: "Économiste et mathématicien français naturalisé américain, prix Nobel d'économie en 1983.",
      parcours: "Normalien, il découvre l'économie avec l'œuvre de Walras, puis rejoint la Cowles Commission à Chicago. Il enseigne à Yale puis à Berkeley.",
      pensee: "Il donne à la théorie de l'équilibre général une forme axiomatique rigoureuse et démontre, avec Arrow, les conditions d'existence d'un équilibre concurrentiel.",
      idees: ['Équilibre général Arrow-Debreu', 'Méthode axiomatique'],
      oeuvres: [['Théorie de la valeur', '1959']]
    },
    {
      id: 'Q105962', bnf: '11888473k', photo: "ALLAIS PN Maurice-24x30-2001b.jpg", nom: 'Maurice Allais', g: 'contemporains', courant: 'Économie mathématique',
      n: '1911-05-31', ln: 'Paris', d: '2010-10-09', ld: 'Saint-Cloud', nat: 'français',
      role: "Économiste et physicien français, prix Nobel d'économie en 1988.",
      parcours: "Polytechnicien, ingénieur des mines, il enseigne à l'École des mines de Paris. Il est le premier Français à recevoir le prix Nobel d'économie.",
      pensee: "Il contribue à la théorie de l'équilibre et de l'efficacité des marchés. Son « paradoxe » montre que les choix réels face au risque contredisent la théorie de l'utilité espérée.",
      idees: ["Paradoxe d'Allais", 'Rendement social', 'Théorie des marchés'],
      oeuvres: [["À la recherche d'une discipline économique", '1943']]
    },
    {
      id: 'Q157268', bnf: '12173977v', photo: "Robert Solow by Olaf Storbeck.jpg", nom: 'Robert Solow', g: 'contemporains', courant: 'Théorie de la croissance',
      n: '1924-08-23', ln: 'Brooklyn (New York)', d: '2023-12-21', ld: 'Lexington (Massachusetts)', nat: 'américain',
      role: "Économiste américain, prix Nobel d'économie en 1987 pour sa théorie de la croissance.",
      parcours: "Professeur au MIT pendant toute sa carrière, il est membre du Conseil des conseillers économiques du président Kennedy. Il forme plusieurs futurs lauréats du prix Nobel.",
      pensee: "À long terme, l'accumulation du capital ne suffit pas à soutenir la croissance : l'essentiel vient du progrès technique, mesuré comme un « résidu ». Il remarque qu'on voit les ordinateurs partout, sauf dans les statistiques de productivité.",
      idees: ['Modèle de Solow', 'Résidu de Solow', 'Paradoxe de la productivité'],
      oeuvres: [['A Contribution to the Theory of Economic Growth', '1956']]
    },
    {
      id: 'Q181529', bnf: '11924825s', photo: "Herbert Simon, RIT NandE Vol13Num11 1981 Mar19 Complete.jpg", nom: 'Herbert Simon', complet: 'Herbert A. Simon', g: 'contemporains', courant: 'Économie comportementale',
      n: '1916-06-15', ln: 'Milwaukee', d: '2001-02-09', ld: 'Pittsburgh', nat: 'américain',
      role: "Économiste, psychologue et informaticien américain, prix Nobel d'économie en 1978.",
      parcours: "Professeur à l'université Carnegie-Mellon de 1949 à sa mort, il est aussi l'un des pionniers de l'intelligence artificielle. Il reçoit le prix Turing en 1975.",
      pensee: "Les décideurs ne maximisent pas : faute d'information et de capacité de calcul, ils retiennent la première solution satisfaisante. Cette rationalité limitée éclaire le fonctionnement des organisations.",
      idees: ['Rationalité limitée', 'Satisficing', 'Théorie des organisations'],
      oeuvres: [['Administrative Behavior', '1947']]
    },
    {
      id: 'Q188113', bnf: '12278813q', photo: "Coase profile 2003.jpg", nom: 'Ronald Coase', g: 'contemporains', courant: 'Nouvelle économie institutionnelle',
      n: '1910-12-29', ln: 'Willesden (Londres)', d: '2013-09-02', ld: 'Chicago', nat: 'britannique',
      role: "Économiste britannique, prix Nobel d'économie en 1991.",
      parcours: "Il enseigne à la London School of Economics, puis aux États-Unis, à Buffalo, à Virginie et à l'université de Chicago à partir de 1964.",
      pensee: "La firme existe parce que recourir au marché a un coût : les coûts de transaction. Quand ces coûts sont faibles, les parties peuvent négocier elles-mêmes la correction d'une nuisance, quelle que soit la répartition initiale des droits.",
      idees: ['Coûts de transaction', 'Théorème de Coase', 'Nature de la firme'],
      oeuvres: [['The Nature of the Firm', '1937'], ['The Problem of Social Cost', '1960']]
    },
    {
      id: 'Q215949', bnf: '120140269', photo: "Albert O. Hirschman, 1945 (cropped).jpg", nom: 'Albert O. Hirschman', court: 'Albert Hirschman', g: 'contemporains', courant: 'Économie du développement',
      n: '1915-04-07', ln: 'Berlin', d: '2012-12-10', ld: 'Ewing (New Jersey)', nat: 'allemand puis américain',
      role: 'Économiste américain d’origine allemande, penseur du développement et de l’action collective.',
      parcours: "Il fuit l'Allemagne nazie en 1933 et aide, à Marseille en 1940-1941, de nombreux réfugiés à gagner les États-Unis. Conseiller en Colombie, il enseigne à Yale, Columbia, Harvard et à l'Institute for Advanced Study de Princeton.",
      pensee: "Face au déclin d'une organisation, ses membres peuvent partir ou protester. Il défend un développement fondé sur des déséquilibres qui stimulent l'initiative, et étudie les arguments récurrents contre les réformes.",
      idees: ['Défection, prise de parole et loyauté', 'Croissance déséquilibrée', 'Rhétorique réactionnaire'],
      oeuvres: [['Exit, Voice, and Loyalty', '1970'], ['Les Passions et les Intérêts', '1977']]
    },
    {
      id: 'Q191020', bnf: '121939011', photo: "GaryBecker-May24-2008.jpg", nom: 'Gary Becker', g: 'contemporains', courant: 'École de Chicago',
      n: '1930-12-02', ln: 'Pottsville (Pennsylvanie)', d: '2014-05-03', ld: 'Chicago', nat: 'américain',
      role: "Économiste américain, prix Nobel d'économie en 1992.",
      parcours: "Élève de Milton Friedman, il enseigne à Columbia puis à l'université de Chicago à partir de 1970.",
      pensee: "Il étend le raisonnement économique à des domaines jusque-là réservés à la sociologie : discrimination, famille, éducation, criminalité. L'éducation est un investissement en « capital humain ».",
      idees: ['Capital humain', 'Économie de la discrimination', 'Économie de la famille'],
      oeuvres: [['The Economics of Discrimination', '1957'], ['Human Capital', '1964']]
    },
    {
      id: 'Q205353', bnf: '120003724', photo: "James Buchanan by Atlas network.jpg", nom: 'James M. Buchanan', court: 'James Buchanan', g: 'contemporains', courant: 'École du choix public',
      n: '1919-10-03', ln: 'Murfreesboro (Tennessee)', d: '2013-01-09', ld: 'Blacksburg (Virginie)', nat: 'américain',
      role: "Économiste américain, fondateur de l'école du choix public, prix Nobel d'économie en 1986.",
      parcours: "Il enseigne à l'université de Virginie puis à George Mason, où il fonde le Center for Study of Public Choice.",
      pensee: "Élus et fonctionnaires poursuivent leurs propres intérêts comme les autres agents. Les défaillances de l'État doivent être analysées comme celles du marché, et les règles constitutionnelles doivent les limiter.",
      idees: ['Choix public', 'Économie constitutionnelle', "Défaillances de l'État"],
      oeuvres: [['The Calculus of Consent (avec Gordon Tullock)', '1962']]
    },
    {
      id: 'Q473926', bnf: '11914118c', nom: 'Edmond Malinvaud', g: 'contemporains', courant: 'Économie du déséquilibre',
      n: '1923-04-25', ln: 'Limoges', d: '2015-03-07', ld: 'Paris', nat: 'français',
      role: "Économiste et statisticien français, directeur général de l'INSEE de 1974 à 1987.",
      parcours: "Polytechnicien, administrateur de l'INSEE, il y fait carrière et dirige l'École nationale de la statistique et de l'administration économique. Il est professeur au Collège de France de 1988 à 1993.",
      pensee: "Il distingue le chômage keynésien, dû à l'insuffisance de la demande, et le chômage classique, dû à l'insuffisance de la rentabilité. Il contribue aussi à l'économétrie et à la théorie microéconomique.",
      idees: ['Chômage keynésien et chômage classique', 'Économétrie', 'Équilibres à prix fixes'],
      oeuvres: [['Leçons de théorie microéconomique', '1969'], ['Réexamen de la théorie du chômage', '1977']]
    },
    {
      id: 'Q107264', bnf: '12279448h', photo: "La Revolución Industrial Pasado y Futuro, Robert E. Lucas Jr. screenshot (cropped).jpg", nom: 'Robert Lucas', complet: 'Robert E. Lucas Jr.', g: 'contemporains', courant: 'Nouvelle économie classique',
      n: '1937-09-15', ln: 'Yakima (Washington)', d: '2023-05-15', ld: 'Chicago', nat: 'américain',
      role: "Économiste américain, chef de file de la nouvelle économie classique, prix Nobel d'économie en 1995.",
      parcours: "Il enseigne à Carnegie-Mellon puis à l'université de Chicago à partir de 1974.",
      pensee: "Les agents forment des anticipations rationnelles : une politique monétaire systématique est anticipée et n'a pas d'effet durable sur la production. Les modèles fondés sur des comportements passés ne permettent pas d'évaluer une nouvelle politique.",
      idees: ['Anticipations rationnelles', 'Critique de Lucas', 'Microfondements de la macroéconomie'],
      oeuvres: [['Expectations and the Neutrality of Money', '1972'], ['Econometric Policy Evaluation: A Critique', '1976']]
    },
    {
      id: 'Q153761', bnf: '12895732f', photo: "Nobel Prize 2009-Press Conference KVA-30.jpg", nom: 'Elinor Ostrom', sexe: 'f', g: 'contemporains', courant: 'Nouvelle économie institutionnelle',
      n: '1933-08-07', ln: 'Los Angeles', d: '2012-06-12', ld: 'Bloomington (Indiana)', nat: 'américaine',
      role: "Politiste et économiste américaine, première femme lauréate du prix Nobel d'économie, en 2009.",
      parcours: "Docteure en science politique, elle enseigne à l'université de l'Indiana, où elle fonde avec Vincent Ostrom un atelier de recherche sur les institutions. Elle partage le prix Nobel 2009 avec Oliver Williamson.",
      pensee: "Les ressources communes (pêcheries, forêts, irrigation) ne sont pas condamnées à la surexploitation : des communautés savent les gérer durablement par des règles qu'elles élaborent elles-mêmes, sans État ni privatisation.",
      idees: ['Communs', 'Gouvernance polycentrique', "Principes de conception des institutions"],
      oeuvres: [['La Gouvernance des biens communs', '1990']]
    },
    {
      id: 'Q132489', bnf: '12041027j', photo: "Amartya Sen 2012.jpg", nom: 'Amartya Sen', g: 'contemporains', courant: 'Économie du bien-être, choix social',
      n: '1933-11-03', ln: 'Santiniketan (Inde)', vivant: true, nat: 'indien',
      role: "Économiste et philosophe indien, prix Nobel d'économie en 1998.",
      parcours: "Témoin enfant de la famine du Bengale de 1943, il enseigne à Delhi, à la London School of Economics, à Oxford, à Harvard et dirige le Trinity College de Cambridge.",
      pensee: "Les famines s'expliquent moins par le manque de nourriture que par la perte des droits d'accès à celle-ci. Le développement se mesure aux « capabilités », c'est-à-dire aux libertés réelles des personnes.",
      idees: ['Capabilités', 'Droits d’accès (entitlements)', 'Indice de développement humain'],
      oeuvres: [['Collective Choice and Social Welfare', '1970'], ['Poverty and Famines', '1981'], ['Un nouveau modèle économique', '1999']]
    },
    {
      id: 'Q233950', bnf: '12848609b', photo: "Daniel Kahneman (3283955327) (cropped).jpg", nom: 'Daniel Kahneman', g: 'contemporains', courant: 'Économie comportementale',
      n: '1934-03-05', ln: 'Tel-Aviv', d: '2024-03-27', ld: 'Nunningen (Suisse)', nat: 'israélien et américain',
      role: "Psychologue israélo-américain, prix Nobel d'économie en 2002.",
      parcours: "Il mène avec Amos Tversky, à l'Université hébraïque de Jérusalem puis aux États-Unis, une collaboration sur le jugement et la décision. Il enseigne à Princeton à partir de 1993.",
      pensee: "Les choix face au risque dévient systématiquement de la rationalité : les pertes pèsent plus que les gains équivalents, et la présentation d'un problème modifie la décision. Ces travaux fondent l'économie comportementale.",
      idees: ['Théorie des perspectives', 'Aversion à la perte', 'Biais cognitifs', 'Système 1 et système 2'],
      oeuvres: [['Prospect Theory (avec Amos Tversky)', '1979'], ['Système 1, système 2', '2011']]
    },
    {
      id: 'Q18430', bnf: '12278641d', photo: "Joseph E. Stiglitz, 2019 (cropped).jpg", nom: 'Joseph Stiglitz', complet: 'Joseph E. Stiglitz', g: 'contemporains', courant: 'Nouveau keynésianisme, économie de l’information',
      n: '1943-02-09', ln: 'Gary (Indiana)', vivant: true, nat: 'américain',
      role: "Économiste américain, prix Nobel d'économie en 2001.",
      parcours: "Professeur à Yale, Princeton, Stanford puis Columbia, il préside le Conseil des conseillers économiques du président Clinton puis devient économiste en chef de la Banque mondiale de 1997 à 2000.",
      pensee: "Quand l'information est imparfaite et inégalement partagée, les marchés ne sont pas efficaces : rationnement du crédit, chômage, sélection adverse. Il critique les politiques du FMI et la montée des inégalités.",
      idees: ['Asymétries d’information', 'Rationnement du crédit', 'Salaire d’efficience'],
      oeuvres: [['La Grande Désillusion', '2002'], ['Le Prix de l’inégalité', '2012']]
    },
    {
      id: 'Q131112', bnf: '12277570g', photo: "Paul Krugman-press conference Dec 07th, 2008-4.jpg", nom: 'Paul Krugman', g: 'contemporains', courant: 'Nouvelle théorie du commerce international',
      n: '1953-02-28', ln: 'Albany (New York)', vivant: true, nat: 'américain',
      role: "Économiste américain, prix Nobel d'économie en 2008.",
      parcours: "Il enseigne au MIT, à Stanford, à Princeton puis à la City University of New York. Il tient de 2000 à 2024 une chronique dans le New York Times.",
      pensee: "Les rendements croissants et le goût des consommateurs pour la variété expliquent les échanges entre pays semblables et la concentration géographique des activités.",
      idees: ['Nouvelle théorie du commerce international', 'Nouvelle économie géographique', 'Rendements croissants'],
      oeuvres: [['Scale Economies, Product Differentiation, and the Pattern of Trade', '1980'], ['Increasing Returns and Economic Geography', '1991']]
    },
    {
      id: 'Q173994', bnf: '12051073x', photo: "Jean Tirole 2019.jpg", nom: 'Jean Tirole', g: 'contemporains', courant: 'Économie industrielle',
      n: '1953-08-09', ln: 'Troyes', vivant: true, nat: 'français',
      role: "Économiste français, prix Nobel d'économie en 2014.",
      parcours: "Polytechnicien, docteur du MIT, il fonde à Toulouse l'Institut d'économie industrielle puis la Toulouse School of Economics. Il est récompensé pour son analyse du pouvoir de marché et de la régulation.",
      pensee: "Il montre comment réguler les secteurs dominés par quelques grandes entreprises (télécommunications, énergie, banques) en tenant compte de l'information dont dispose le régulateur.",
      idees: ['Régulation des monopoles', 'Pouvoir de marché', 'Marchés bifaces'],
      oeuvres: [['The Theory of Industrial Organization', '1988'], ['Économie du bien commun', '2016']]
    },
    {
      id: 'Q434509', bnf: '16080743v', photo: "Esther Duflo - Pop!Tech 2009 - 001 (cropped).jpg", nom: 'Esther Duflo', sexe: 'f', g: 'contemporains', courant: 'Économie du développement',
      n: '1972-10-25', ln: 'Paris', vivant: true, nat: 'française',
      role: "Économiste française, prix Nobel d'économie en 2019.",
      parcours: "Normalienne, docteure du MIT, où elle enseigne, elle cofonde en 2003 le laboratoire J-PAL de lutte contre la pauvreté. Elle partage le prix Nobel 2019 avec Abhijit Banerjee et Michael Kremer.",
      pensee: "Elle applique les expérimentations aléatoires contrôlées aux politiques de lutte contre la pauvreté, pour mesurer précisément l'effet de chaque mesure (éducation, santé, microcrédit).",
      idees: ['Expérimentations aléatoires', 'Lutte contre la pauvreté'],
      oeuvres: [['Repenser la pauvreté (avec Abhijit Banerjee)', '2011']]
    },
    {
      id: 'Q984448', bnf: '12408843j', photo: "Thomas Piketty2.jpg", nom: 'Thomas Piketty', g: 'contemporains', courant: 'Économie des inégalités',
      n: '1971-05-07', ln: 'Clichy', vivant: true, nat: 'français',
      role: 'Économiste français, spécialiste des inégalités de revenus et de patrimoine.',
      parcours: "Directeur d'études à l'École des hautes études en sciences sociales et professeur à l'École d'économie de Paris, il codirige le World Inequality Lab.",
      pensee: "À partir de longues séries fiscales, il montre que lorsque le rendement du capital dépasse la croissance (r > g), les patrimoines se concentrent. Il propose une fiscalité progressive sur le capital.",
      idees: ['r > g', 'Concentration des patrimoines', 'Impôt progressif sur le capital'],
      oeuvres: [['Le Capital au XXIᵉ siècle', '2013'], ['Capital et idéologie', '2019']]
    }
  ];

  window.FTBioData = { groupes: G, personnes: L };
})();
