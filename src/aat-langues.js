// Exemples de reformulation de l'AAT dans les autres langues du document : le même avis sur un film
// que l'exemple français (assistant.js), écrit dans chaque langue, puis réécrit pour chaque style et
// chaque intensité. Le modèle voit l'exemple de la langue du passage : un exemple français
// l'entraînerait à répondre en français.
module.exports = {
  en: {
    source: 'I didn’t really like the film we saw last night. It was really long, we were pretty bored in the middle, and honestly the actors were bad, except maybe the lead actress.',
    neutre: {
      legere: 'I didn’t really like the film we saw last night. It was very long, we were quite bored in the middle, and the actors were bad, except maybe the lead actress.',
      moyenne: 'The film we watched last night didn’t appeal to me much. It went on for a long time, the middle was rather dull, and the acting was poor, apart perhaps from the lead actress.',
      forte: 'Apart perhaps from the lead actress, the cast of last night’s film performed poorly. Add an endless running time and a truly dull middle section, and it simply didn’t work for me.'
    },
    professionnel: {
      legere: 'I did not particularly enjoy the film we saw last night. It was very long, with a dull stretch in the middle, and the acting was weak, except perhaps for the lead actress.',
      moyenne: 'Last night’s film did not convince me. It was too long, lost momentum in the middle, and the performances were weak, with the possible exception of the lead actress.',
      forte: 'My assessment of last night’s film is rather negative. Two issues stand out: an excessive running time, which causes a lull halfway through, and generally weak performances, from which only the lead actress may stand apart.'
    },
    academique: {
      legere: 'I did not really enjoy the film we saw last night. Indeed, it was very long, which made the middle tedious, and the actors performed poorly, with the possible exception of the lead actress.',
      moyenne: 'The film we saw last night disappointed me, for two reasons. First, its length: the pace slows in the middle, which creates boredom. Second, the acting, which is unconvincing, except perhaps for the lead actress.',
      forte: 'Two factors account for the disappointment caused by the film we saw last night. The first concerns its length: too long, the narrative loses momentum halfway through and the viewer’s attention wanders. The second concerns the acting, which is generally unconvincing; only the lead actress may be an exception.'
    },
    synthetique: {
      legere: 'I didn’t like last night’s film: too long, boring in the middle, and badly acted, except perhaps by the lead actress.',
      moyenne: 'Last night’s film was disappointing: too long and badly acted, except for the lead actress.',
      forte: 'A film that was too long and badly acted.'
    }
  },
  de: {
    source: 'Der Film, den wir gestern Abend gesehen haben, hat mir nicht so gefallen. Er war echt lang, in der Mitte war’s ziemlich langweilig, und ehrlich gesagt haben die Schauspieler schlecht gespielt, außer vielleicht die Hauptdarstellerin.',
    neutre: {
      legere: 'Der Film, den wir gestern Abend gesehen haben, hat mir nicht besonders gefallen. Er war sehr lang, in der Mitte ziemlich langweilig, und die Schauspieler haben schlecht gespielt, außer vielleicht die Hauptdarstellerin.',
      moyenne: 'Der gestrige Film hat mich nicht wirklich überzeugt. Er dauerte sehr lange, der Mittelteil war eher öde, und die schauspielerische Leistung war schwach, abgesehen vielleicht von der Hauptdarstellerin.',
      forte: 'Abgesehen vielleicht von der Hauptdarstellerin spielten die Darsteller im Film von gestern Abend schlecht. Dazu kamen eine endlose Laufzeit und ein ausgesprochen zäher Mittelteil: Mich hat er einfach nicht gepackt.'
    },
    professionnel: {
      legere: 'Der Film, den wir gestern Abend gesehen haben, hat mir nicht besonders gefallen. Er war sehr lang, hatte in der Mitte eine langweilige Passage, und die Schauspieler spielten schwach, außer vielleicht die Hauptdarstellerin.',
      moyenne: 'Der gestrige Film hat mich nicht überzeugt. Er war zu lang, verlor in der Mitte deutlich an Tempo, und die schauspielerische Leistung war schwach, mit Ausnahme vielleicht der Hauptdarstellerin.',
      forte: 'Mein Urteil über den Film von gestern Abend fällt eher negativ aus. Zwei Punkte sind problematisch: eine übermäßige Länge, die zu einem Durchhänger in der Mitte führt, und eine insgesamt schwache Besetzung, aus der allenfalls die Hauptdarstellerin herausragt.'
    },
    academique: {
      legere: 'Der Film, den wir gestern Abend gesehen haben, hat mir nicht wirklich gefallen. Er war nämlich sehr lang, wodurch der Mittelteil langweilig wurde, und die Schauspieler spielten schlecht, mit Ausnahme vielleicht der Hauptdarstellerin.',
      moyenne: 'Der gestrige Film hat mich aus zwei Gründen enttäuscht. Erstens seine Länge: In der Mitte lässt das Tempo nach, was Langeweile erzeugt. Zweitens das Schauspiel, das wenig überzeugt, mit Ausnahme vielleicht der Hauptdarstellerin.',
      forte: 'Zwei Faktoren erklären die Enttäuschung über den Film von gestern Abend. Der erste betrifft seine Dauer: Zu lang geraten, verliert die Handlung in der Mitte an Kraft, und die Aufmerksamkeit des Zuschauers lässt nach. Der zweite betrifft die schauspielerische Leistung, die insgesamt wenig überzeugt; einzig die Hauptdarstellerin bildet vielleicht eine Ausnahme.'
    },
    synthetique: {
      legere: 'Der Film von gestern Abend hat mir nicht gefallen: zu lang, in der Mitte langweilig und schlecht gespielt, außer vielleicht von der Hauptdarstellerin.',
      moyenne: 'Enttäuschender Film gestern Abend: zu lang und schlecht gespielt, außer von der Hauptdarstellerin.',
      forte: 'Ein zu langer, schlecht gespielter Film.'
    }
  },
  es: {
    source: 'No me gustó mucho la película que vimos anoche. Era larguísima, nos aburrimos bastante a la mitad y, la verdad, los actores actuaban fatal, salvo quizá la protagonista.',
    neutre: {
      legere: 'No me gustó mucho la película que vimos anoche. Era muy larga, nos aburrimos bastante a la mitad y los actores actuaban mal, salvo quizá la protagonista.',
      moyenne: 'La película que vimos anoche no me convenció demasiado. Duraba muchísimo, la parte central resultaba bastante aburrida y la interpretación era floja, excepto quizá la de la protagonista.',
      forte: 'Salvo quizá la protagonista, los actores de la película de anoche no estuvieron a la altura. Si a eso se suma una duración interminable y una parte central francamente aburrida, no logró engancharme.'
    },
    professionnel: {
      legere: 'No me gustó especialmente la película que vimos anoche. Era muy larga, con un tramo aburrido en la mitad, y los actores actuaban mal, salvo quizá la protagonista.',
      moyenne: 'La película de anoche no me convenció. Resultó demasiado larga, perdió ritmo en la parte central y las interpretaciones fueron flojas, con la posible excepción de la protagonista.',
      forte: 'Mi valoración de la película de anoche es más bien negativa. Destacan dos problemas: una duración excesiva, que provoca un bajón a mitad del relato, y unas interpretaciones en general flojas, de las que quizá solo se salva la protagonista.'
    },
    academique: {
      legere: 'No me gustó demasiado la película que vimos anoche. En efecto, era muy larga, lo que hacía aburrida la parte central, y los actores actuaban mal, con la posible excepción de la protagonista.',
      moyenne: 'La película que vimos anoche me decepcionó por dos motivos. En primer lugar, su duración: el ritmo decae a mitad de la historia, lo que genera aburrimiento. En segundo lugar, la interpretación, poco convincente, salvo quizá la de la protagonista.',
      forte: 'Dos factores explican la decepción que produjo la película vista anoche. El primero tiene que ver con su duración: demasiado extenso, el relato pierde fuerza a mitad de camino y la atención del espectador decae. El segundo atañe a la interpretación, en general poco convincente; solo la protagonista constituye quizá una excepción.'
    },
    synthetique: {
      legere: 'No me gustó la película de anoche: demasiado larga, aburrida a la mitad y mal interpretada, salvo quizá por la protagonista.',
      moyenne: 'Película de anoche decepcionante: demasiado larga y mal interpretada, salvo la protagonista.',
      forte: 'Una película demasiado larga y mal interpretada.'
    }
  },
  it: {
    source: 'Il film che abbiamo visto ieri sera non mi è piaciuto granché. Era lunghissimo, a metà ci siamo annoiati parecchio e, a dirla tutta, gli attori recitavano male, tranne forse la protagonista.',
    neutre: {
      legere: 'Il film che abbiamo visto ieri sera non mi è piaciuto molto. Era molto lungo, a metà ci siamo annoiati parecchio e gli attori recitavano male, tranne forse la protagonista.',
      moyenne: 'Il film visto ieri sera non mi ha convinto granché. Durava moltissimo, la parte centrale era piuttosto noiosa e la recitazione era scadente, a parte forse quella della protagonista.',
      forte: 'A parte forse la protagonista, gli attori del film di ieri sera non erano all’altezza. Aggiungete una durata interminabile e una parte centrale davvero noiosa: non mi ha proprio coinvolto.'
    },
    professionnel: {
      legere: 'Il film che abbiamo visto ieri sera non mi è piaciuto particolarmente. Era molto lungo, con un passaggio noioso a metà, e gli attori recitavano male, tranne forse la protagonista.',
      moyenne: 'Il film di ieri sera non mi ha convinto. Era troppo lungo, perdeva ritmo nella parte centrale e le interpretazioni erano deboli, con la possibile eccezione della protagonista.',
      forte: 'Il mio giudizio sul film di ieri sera è piuttosto negativo. Due aspetti risultano problematici: una durata eccessiva, che provoca un calo a metà del racconto, e interpretazioni nel complesso deboli, da cui si distingue forse solo la protagonista.'
    },
    academique: {
      legere: 'Il film che abbiamo visto ieri sera non mi è piaciuto molto. Infatti era molto lungo, il che rendeva noiosa la parte centrale, e gli attori recitavano male, ad eccezione forse della protagonista.',
      moyenne: 'Il film visto ieri sera mi ha deluso per due ragioni. Innanzitutto la durata: a metà il ritmo cala, generando noia. In secondo luogo la recitazione, poco convincente, ad eccezione forse della protagonista.',
      forte: 'Due fattori spiegano la delusione suscitata dal film visto ieri sera. Il primo riguarda la durata: troppo lungo, il racconto perde forza a metà e l’attenzione dello spettatore si allenta. Il secondo riguarda la recitazione, nel complesso poco convincente; solo la protagonista costituisce forse un’eccezione.'
    },
    synthetique: {
      legere: 'Il film di ieri sera non mi è piaciuto: troppo lungo, noioso a metà e recitato male, tranne forse dalla protagonista.',
      moyenne: 'Film di ieri sera deludente: troppo lungo e recitato male, tranne la protagonista.',
      forte: 'Un film troppo lungo e recitato male.'
    }
  },
  pt: {
    source: 'Não gostei muito do filme que vimos ontem à noite. Era mesmo comprido, aborrecemo-nos bastante a meio e, sinceramente, os atores representavam mal, exceto talvez a atriz principal.',
    neutre: {
      legere: 'Não gostei muito do filme que vimos ontem à noite. Era muito comprido, aborrecemo-nos bastante a meio e os atores representavam mal, exceto talvez a atriz principal.',
      moyenne: 'O filme que vimos ontem à noite não me agradou muito. Durava imenso tempo, a parte do meio era bastante aborrecida e a interpretação era fraca, à exceção talvez da atriz principal.',
      forte: 'À exceção talvez da atriz principal, os atores do filme de ontem à noite estiveram mal. Junte-se a isso uma duração interminável e uma parte central francamente aborrecida: não me conquistou de todo.'
    },
    professionnel: {
      legere: 'Não apreciei particularmente o filme que vimos ontem à noite. Era muito longo, com uma passagem aborrecida a meio, e os atores representavam mal, exceto talvez a atriz principal.',
      moyenne: 'O filme de ontem à noite não me convenceu. Era demasiado longo, perdia ritmo na parte central e as interpretações eram fracas, com a possível exceção da atriz principal.',
      forte: 'A minha avaliação do filme de ontem à noite é bastante negativa. Há dois problemas: uma duração excessiva, que provoca uma quebra a meio da narrativa, e interpretações globalmente fracas, das quais apenas a atriz principal talvez se destaque.'
    },
    academique: {
      legere: 'Não gostei muito do filme que vimos ontem à noite. Com efeito, era muito longo, o que tornava a parte central aborrecida, e os atores representavam mal, à exceção talvez da atriz principal.',
      moyenne: 'O filme que vimos ontem à noite desiludiu-me por duas razões. Em primeiro lugar, a duração: o ritmo abranda a meio, o que gera aborrecimento. Em segundo lugar, a interpretação, pouco convincente, à exceção talvez da atriz principal.',
      forte: 'Dois fatores explicam a desilusão provocada pelo filme visto ontem à noite. O primeiro prende-se com a duração: demasiado longa, a narrativa perde força a meio e a atenção do espectador dispersa-se. O segundo diz respeito à interpretação, globalmente pouco convincente; apenas a atriz principal constitui talvez uma exceção.'
    },
    synthetique: {
      legere: 'Não gostei do filme de ontem à noite: demasiado longo, aborrecido a meio e mal interpretado, exceto talvez pela atriz principal.',
      moyenne: 'Filme de ontem à noite dececionante: demasiado longo e mal interpretado, exceto a atriz principal.',
      forte: 'Um filme demasiado longo e mal interpretado.'
    }
  },
  zh: {
    source: '昨晚看的那部电影我不太喜欢。片子特别长，中间我们都挺无聊的，说实话演员演得很差，也许女主角除外。',
    neutre: {
      legere: '昨晚看的那部电影我不太喜欢。电影很长，中间相当无聊，演员演得也不好，也许女主角除外。',
      moyenne: '我们昨晚看的电影没怎么打动我。片长很长，中段比较沉闷，演员的表演也很一般，或许只有女主角例外。',
      forte: '除了女主角或许还行，昨晚那部电影的演员都演得不好。再加上冗长的片长和十分沉闷的中段，这部电影实在没能吸引我。'
    },
    professionnel: {
      legere: '我不太欣赏昨晚观看的那部电影。影片很长，中间有一段较为沉闷，演员表演欠佳，女主角或许除外。',
      moyenne: '昨晚的电影未能令我信服。影片过长，中段节奏明显放缓，整体表演较弱，女主角或许是个例外。',
      forte: '我对昨晚这部电影的评价总体偏负面。主要有两个问题：一是片长过长，导致中段节奏拖沓；二是整体表演较弱，只有女主角或许表现突出。'
    },
    academique: {
      legere: '我不太喜欢昨晚看的那部电影。事实上，影片很长，使得中段显得乏味，而且演员表演欠佳，女主角或许除外。',
      moyenne: '昨晚观看的电影令我失望，原因有二。首先是片长：影片中段节奏放缓，令人感到乏味。其次是表演：整体缺乏说服力，女主角或许除外。',
      forte: '昨晚观看的电影之所以令人失望，可归结为两个因素。其一在于片长：叙事过于冗长，在中段失去张力，观众的注意力随之涣散。其二在于表演：整体缺乏说服力，唯有女主角或许是个例外。'
    },
    synthetique: {
      legere: '我不喜欢昨晚的电影：太长，中间无聊，演技差，女主角或许除外。',
      moyenne: '昨晚的电影令人失望：太长，演技差，女主角除外。',
      forte: '一部又长又演得差的电影。'
    }
  }
};
