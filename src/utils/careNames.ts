/**
 * Care instructions on a tag: the 24 phrases the app stores, and the keyword rules that map a printed line to them
 * (English, French, Spanish and German, with a few Italian, Portuguese and Dutch lines). Care symbols are not read.
 *
 * All rules work on folded text (textFold): lowercase, accents removed.
 */

/** The phrases kept as the item's care instructions, in this order. */
export const CARE_PHRASES: readonly string[] = [
  'Machine wash cold',
  'Machine wash warm',
  'Gentle cycle',
  'Hand wash',
  'Do not wash',
  'Wash inside out',
  'Wash with like colors',
  'Wash separately',
  'Wash before wearing',
  'Do not wring',
  'Do not bleach',
  'Non-chlorine bleach only',
  'Tumble dry low',
  'Tumble dry medium',
  'Do not tumble dry',
  'Remove promptly from dryer',
  'Line dry',
  'Dry flat',
  'Iron low',
  'Iron medium',
  'Iron inside out',
  'Do not iron',
  'Dry clean only',
  'Do not dry clean',
];

/** Words used by the rules, for the letter repair ("wa5h" is "wash"). */
export const CARE_WORDS: ReadonlySet<string> = new Set([
  'wash', 'washing', 'machine', 'cold', 'cool', 'warm', 'hot', 'water', 'gentle', 'delicate', 'cycle', 'hand', 'bleach', 'chlorine',
  'tumble', 'dry', 'dryer', 'low', 'medium', 'heat', 'iron', 'ironing', 'steam', 'clean', 'cleaning', 'only', 'line', 'flat', 'lay',
  'hang', 'air', 'remove', 'promptly', 'inside', 'out', 'like', 'colors', 'colours', 'separately', 'before', 'wearing', 'wring', 'twist',
  'laver', 'lavage', 'secher', 'repasser', 'javel', 'lavar', 'secar', 'planchar', 'lejia', 'waschen', 'trockner', 'bugeln', 'bleichen',
  'froid', 'froide', 'frio', 'kalt', 'chaud', 'tiede', 'sec', 'seco', 'plat', 'plano', 'liegend', 'nicht', 'ne', 'pas', 'no',
]);

type Rule = { phrase: string; patterns: RegExp[] };

/** "Do not ..." rules. They are matched first and their text is cut out, so the positive rules never read "do not tumble dry low" as "tumble dry low". */
const NEGATIVE_RULES: Rule[] = [
  {
    phrase: 'Do not wash',
    patterns: [
      /\b(?:do not|don't|dont|donot|never) wash\b/,
      /\bne pas laver\b/, /\bno lavar\b/, /\bnicht waschen\b/, /\bnon lavare\b/, /\bniet wassen\b/, /\bnao lavar\b/,
    ],
  },
  {
    phrase: 'Do not wring',
    patterns: [
      /\b(?:do not|don't|dont|donot|never|no) (?:wring|twist)(?:ing)?(?: or (?:wring|twist))?\b/,
      /\bne pas tordre\b/, /\bno (?:retorcer|escurrir)\b/, /\bnicht (?:aus)?wringen\b/, /\bnicht auswringen\b/,
    ],
  },
  {
    phrase: 'Do not bleach',
    patterns: [
      /\b(?:do not|don't|dont|donot|never) (?:use )?(?:any )?bleach(?:ing)?\b/,
      /\bno bleach(?:ing)?\b/,
      /\bne pas (?:utiliser (?:d'|de |du )?)?(?:eau de )?javel(?:le|liser)?\b/, /\bne pas blanchir\b/,
      /\bno (?:usar )?(?:lejia|blanqueador|cloro)\b/, /\bno blanquear\b/,
      /\bnicht (?:bleichen|chloren)\b/, /\bkein bleichmittel\b/, /\bnon candeggiare\b/, /\bniet bleken\b/, /\bnao (?:usar )?(?:lixivia|branqueador)\b/,
    ],
  },
  {
    phrase: 'Do not tumble dry',
    patterns: [
      /\b(?:do not|don't|dont|donot|never) (?:machine )?tumble ?dr(?:y|yer|ying)\b/,
      /\bno tumble dr(?:y|ying)\b/,
      /\bne pas secher en machine\b/, /\bsechage en machine interdit\b/, /\bne pas utiliser (?:de )?seche[- ]?linge\b/,
      /\bno (?:usar|secar en) secadora\b/, /\bno secar a maquina\b/,
      /\bnicht (?:im )?(?:wasche)?trockner\b/, /\bnicht maschinell trocknen\b/, /\bnicht im tumbler\b/, /\bnicht trocknergeeignet\b/,
      /\bnon asciugare in asciugatrice\b/, /\bnon utilizzare l'asciugatrice\b/, /\bniet in de droger\b/,
    ],
  },
  {
    phrase: 'Do not iron',
    patterns: [
      /\b(?:do not|don't|dont|donot|never) iron(?:ing)?\b/,
      /\bne pas repasser\b/, /\brepassage interdit\b/, /\bno planchar\b/, /\bnicht bugeln\b/, /\bnon stirare\b/, /\bniet strijken\b/, /\bnao passar a ferro\b/,
    ],
  },
  {
    phrase: 'Do not dry clean',
    patterns: [
      /\b(?:do not|don't|dont|donot|never|no) dry[- ]?clean(?:ing)?\b/,
      /\bne pas nettoyer a sec\b/, /\bnettoyage a sec interdit\b/, /\bno (?:limpiar|lavar) en seco\b/, /\bnicht chemisch reinigen\b/,
      /\bnon lavare a secco\b/, /\bnao limpar a seco\b/,
    ],
  },
];

/** Positive rules, run on the line with the negative text removed. */
const POSITIVE_RULES: Rule[] = [
  {
    phrase: 'Machine wash cold',
    patterns: [
      /\bmachine wash(?:able)?(?: in)? (?:cold|cool)\b/, /\bwash(?: in)? (?:cold|cool)\b/, /\b(?:cold|cool) (?:machine )?wash\b/,
      /\bwash(?:ing)? (?:at )?(?:max\.? )?(?:30|20)\b(?!\d)/, /\bmachine wash(?:able)? (?:at )?(?:30|20)\b(?!\d)/,
      /\blaver (?:en machine )?(?:a )?(?:30|20)\b/, /\blavage (?:en machine )?(?:a )?(?:30|20)\b/, /\bleau froide\b/, /\beau froide\b/,
      /\blavar (?:a maquina )?(?:en|con) (?:agua )?fri[ao]\b/, /\blavar en frio\b/, /\blavar a maquina en agua fria\b/,
      /\bkalt waschen\b/, /\bkaltwaschen\b/, /\bkaltwasche\b/, /\bmaschinenwasche kalt\b/, /\bwaschen (?:bei )?(?:30|20)\b/,
    ],
  },
  {
    phrase: 'Machine wash warm',
    patterns: [
      /\bmachine wash(?:able)?(?: in)? warm\b/, /\bwash(?: in)? warm\b/, /\bwarm (?:machine )?wash\b/,
      /\bwash(?:ing)? (?:at )?(?:max\.? )?40\b(?!\d)/, /\bmachine wash(?:able)? (?:at )?40\b(?!\d)/,
      /\blaver (?:en machine )?(?:a )?40\b/, /\blavage (?:en machine )?(?:a )?40\b/, /\blavar (?:a maquina )?(?:en|con) agua tibia\b/, /\bwaschen (?:bei )?40\b/,
    ],
  },
  {
    phrase: 'Gentle cycle',
    patterns: [
      /\b(?:gentle|delicate|wool) (?:cycle|wash|machine)\b/, /\bmachine wash(?:able)? (?:on )?(?:gentle|delicate)\b/, /\bwash (?:on )?(?:gentle|delicate)\b/,
      /\bcycle (?:gentle|delicate)\b/, /\bdelicates?\b(?= *(?:cycle|wash|setting))/,
      /\bcycle delicat\b/, /\bprogramme delicat\b/, /\blavage delicat\b/, /\bciclo delicad[oa]\b/, /\bciclo delicato\b/,
      /\bschonwaschgang\b/, /\bschonwasche\b/, /\bfeinwasche\b/, /\bschongang\b/,
    ],
  },
  {
    phrase: 'Hand wash',
    patterns: [
      /\bhand[- ]?wash(?:able)?\b/, /\bwash(?:ing)? by hand\b/,
      /\blaver a la main\b/, /\blavage a la main\b/, /\blavable a la main\b/, /\blavar a mano\b/, /\blavado a mano\b/,
      /\bhandwasche\b/, /\bhandwaschen\b/, /\bvon hand waschen\b/, /\blavare a mano\b/, /\blavar a mao\b/, /\bhandwas\b/, /\bmet de hand wassen\b/,
    ],
  },
  {
    phrase: 'Wash with like colors',
    patterns: [
      /\b(?:like|similar|same) colou?rs?\b/, /\bwash with like\b/,
      /\bcouleurs? similaires?\b/, /\bcolores similares\b/, /\bgleichen? farben\b/, /\bahnlichen farben\b/,
    ],
  },
  {
    phrase: 'Wash separately',
    patterns: [
      /\bwash(?:ed)? (?:it |them |dark |light |colou?rs )*(?:separately|alone)\b/, /\bwash\b.*\bseparately\b/,
      /\blaver separement\b/, /\blavar por separado\b/, /\blavar separadamente\b/, /\bgetrennt waschen\b/, /\blavare separatamente\b/,
    ],
  },
  {
    phrase: 'Wash before wearing',
    patterns: [
      /\b(?:wash|launder) (?:it )?(?:before|prior to) (?:the )?(?:first )?(?:wearing|wear|use)\b/, /\bwash before first (?:wear|use)\b/,
      /\blaver avant (?:la premiere )?(?:utilisation|le port|de porter|usage)\b/, /\blavar antes de (?:usar|su uso|llevar)\b/,
      /\bvor (?:dem )?(?:ersten )?(?:tragen|gebrauch) waschen\b/, /\bvor dem ersten tragen\b/,
    ],
  },
  {
    phrase: 'Non-chlorine bleach only',
    patterns: [
      /\bnon[- ]?chlorine bleach\b/, /\bnon[- ]chlorine\b/, /\boxygen bleach\b/, /\bcolou?r[- ]?safe bleach\b/,
      /\bsans chlore\b/, /\bchlorfrei\b/, /\bsin cloro\b/,
    ],
  },
  {
    phrase: 'Tumble dry low',
    patterns: [
      /\btumble ?dr(?:y|yer)(?: on| at)? (?:low|gentle|delicate|cool)\b/, /\btumble dry(?:ing)? low\b/, /\blow (?:heat )?tumble dry\b/, /\bdryer on low\b/, /\btumble low\b/,
      /\bdry on low\b/,
      /\bsechage en machine (?:a )?(?:basse|faible|doux)/, /\bsecadora (?:a )?(?:baja|temperatura baja)\b/, /\btrockner (?:niedrig|schonend)\b/, /\basciugatrice (?:a )?bassa\b/,
    ],
  },
  {
    phrase: 'Tumble dry medium',
    patterns: [
      /\btumble ?dr(?:y|yer)(?: on| at)? (?:medium|moderate|normal|regular|warm)\b/, /\bmedium (?:heat )?tumble dry\b/, /\btumble dry medium\b/,
      /\bsechage en machine (?:a )?(?:moyen|normal)/, /\bsecadora (?:a )?(?:media|temperatura media)\b/, /\btrockner mittel\b/,
    ],
  },
  {
    phrase: 'Remove promptly from dryer',
    patterns: [
      /\bremove (?:promptly|immediately|quickly)\b/, /\bremove from (?:the )?dryer (?:promptly|immediately|when dry|at once)\b/,
    ],
  },
  {
    phrase: 'Line dry',
    patterns: [
      /\bline[- ]?dry\b/, /\bhang (?:to )?dry\b/, /\bhang[- ]dry\b/, /\bair[- ]?dry\b/, /\bdry on (?:a )?(?:line|hanger|clothesline)\b/,
      /\bsecher (?:a l'air|sur (?:un )?(?:fil|corde))\b/, /\bsechage (?:a l'air|sur (?:fil|corde))\b/, /\bsecar (?:al aire|colgado|en tendedero)\b/,
      /\b(?:an der )?luft trocknen\b/, /\blufttrocknen\b/, /\baufhangen\b/, /\bstendere\b/, /\bophangen\b/,
    ],
  },
  {
    phrase: 'Dry flat',
    patterns: [
      /\bdry flat\b/, /\blay flat(?: to dry)?\b/, /\blie flat(?: to dry)?\b/, /\bflat dry\b/, /\bdry (?:it )?lying flat\b/, /\bdry on (?:a )?flat\b/, /\bdry horizontally\b/, /\bflat to dry\b/,
      /\bsecher (?:a plat|horizontalement)\b/, /\bsechage a plat\b/, /\bsecar (?:en )?(?:plano|horizontal)\b/, /\bsecar extendido\b/,
      /\bliegend trocknen\b/, /\bflach trocknen\b/, /\bwaagerecht trocknen\b/, /\b(?:stendere|asciugare) in piano\b/, /\bplat drogen\b/,
    ],
  },
  {
    phrase: 'Iron low',
    patterns: [
      /\biron(?:ing)?(?: on| at)? (?:a )?low\b/, /\blow (?:temperature |heat |setting )?iron\b/, /\bcool iron\b/, /\biron (?:on )?(?:a )?(?:cool|cold)\b/,
      /\biron\b.*\b(?:max|maximum|do not exceed|not exceeding) ?(?:110|100|120)\b/, /\b(?:max|maximum) ?110 ?(?:c|°|deg)?\b.*\biron\b/,
      /\brepass(?:er|age) (?:a )?(?:basse|faible|douce?)/, /\bfer doux\b/, /\bplanch(?:a|ar) (?:a )?(?:baja|temperatura baja)\b/,
      /\bbugeln (?:bei )?(?:niedrig|niedriger|stufe 1)/, /\bniedrige bugeltemperatur\b/, /\bstirare (?:a )?bassa\b/,
    ],
  },
  {
    phrase: 'Iron medium',
    patterns: [
      /\bwarm iron\b/, /\bmedium iron\b/, /\biron(?:ing)?(?: on| at)? (?:a )?(?:medium|moderate|warm)\b/, /\bmoderate (?:temperature )?iron\b/,
      /\biron\b.*\b(?:max|maximum|do not exceed|not exceeding) ?150\b/,
      /\brepass(?:er|age) (?:a )?(?:temperature )?moyenne?\b/, /\bplanch(?:a|ar) (?:a )?(?:media|temperatura media)\b/, /\bbugeln (?:bei )?(?:mittel|mittlerer|stufe 2)/,
    ],
  },
  {
    phrase: 'Dry clean only',
    patterns: [
      /\bdry[- ]?clean(?:ing)?\b/, /\bprofessional(?:ly)? clean/, /\bnettoyage a sec\b/, /\bnettoyage professionnel\b/, /\blimpieza en seco\b/, /\blavado en seco\b/,
      /\bchemisch reinigen\b/, /\bchemischreinigung\b/, /\btrockenreinigung\b/, /\blavaggio a secco\b/, /\blimpeza a seco\b/,
    ],
  },
];

/** True when a folded line talks about care: washing, drying, ironing, bleaching or cleaning, in English, French, Spanish, German, Italian, Portuguese or Dutch. */
export const looksLikeCare = (foldedLine: string): boolean =>
  /\b(?:wash|launder|dry|iron|bleach|clean|tumble|wring|laver|lavage|secher|sechage|repass|javel|nettoy|lavar|lavado|secar|secado|plancha|lejia|blanque|limpi|waschen|wasche|trockn|bugel|bleich|reinig|lavare|lavagg|asciug|stirar|candegg|wassen|drogen|strijk|bleken)/.test(
    foldedLine,
  );

const globalOf = (re: RegExp): RegExp => new RegExp(re.source, 'g');

const TEMPERATURE = '(?:cold|cool|warm|lukewarm|tepid|30|20|40)';

/**
 * A hand-wash instruction with its temperature ("hand wash cold", "wash by hand at 30", "lavar a mano en agua fria"). It is
 * replaced by a plain "hand wash" before the positive rules run, so "wash cold" or "cold water" inside it cannot also read as
 * a machine-wash instruction.
 */
const HAND_WASH_CLAUSE = new RegExp(
  [
    `\\bhand[- ]?wash(?:able)?(?:(?: (?:in|at|with|using))? ${TEMPERATURE}(?: water)?)?\\b`,
    `\\bwash(?:ing)? by hand(?:(?: (?:in|at|with))? ${TEMPERATURE}(?: water)?)?\\b`,
    `\\b${TEMPERATURE} hand[- ]?wash\\b`,
    `\\blav(?:er|age|able) a la main(?: a (?:30|20|40))?(?: a l'eau froide)?\\b`,
    `\\blav(?:ar|ado) a mano(?: en agua (?:fria|tibia))?\\b`,
    `\\bhandwasch(?:e|en)(?: (?:kalt|30|20|40))?\\b`,
    `\\bvon hand waschen(?: (?:bei )?(?:kalt|30|20|40))?\\b`,
  ].join('|'),
  'g',
);

/**
 * "Do not hand wash" and "do not machine wash" forbid one way of washing, which no phrase says: the line is left over for the
 * person to read. (The phrase "Do not wash" covers only a plain "do not wash".)
 */
const UNMAPPED_NEGATIVES: RegExp[] = [
  /\b(?:do not|don't|dont|donot|never|not) (?:hand|machine)[- ]?wash(?:able|ing)?\b/,
  /\bnot (?:hand|machine)[- ]?washable\b/,
];

/** Marks the place a "do not" instruction was cut out of `rest`, so the words around it can be checked. */
const CUT = '\u0001';
/** Words that may sit next to a cut "do not" instruction without qualifying it ("do not iron, ever"). */
const NEUTRAL_WORDS: ReadonlySet<string> = new Set(['or', 'and', 'only', 'please', 'directly', 'ever', 'at', 'all', 'ou', 'et', 'oder', 'und', 'y', 'o', 'e']);

/**
 * What a folded line says about care: the phrases it maps to (in CARE_PHRASES order), and whether some of its care words were
 * left over once those were accounted for ("Machine wash cold. Tumble dry." maps to one phrase and leaves "tumble dry").
 */
export const analyzeCareLine = (foldedLine: string): { phrases: string[]; leftover: boolean } => {
  if (typeof foldedLine !== 'string' || foldedLine === '') return { phrases: [], leftover: false };
  const s = foldedLine.toLowerCase();
  const found = new Set<string>();

  // `work` is the line with the "do not" instructions cut out; `rest` is what no phrase has accounted for yet.
  let work = s;
  let rest = s;
  let unmapped = false;
  for (const re of UNMAPPED_NEGATIVES) {
    const next = work.replace(globalOf(re), ' ');
    if (next !== work) {
      unmapped = true;
      work = next;
      rest = rest.replace(globalOf(re), ' ');
    }
  }
  for (const rule of NEGATIVE_RULES) {
    for (const re of rule.patterns) {
      const next = work.replace(globalOf(re), ' ');
      if (next !== work) {
        found.add(rule.phrase);
        work = next;
        rest = rest.replace(globalOf(re), CUT);
      }
    }
  }

  // A hand wash with a temperature is one instruction: "wash cold" in "hand wash cold" is not a machine wash.
  work = work.replace(HAND_WASH_CLAUSE, ' hand wash ');

  const hasOr = /\b(?:or|ou|oder|o)\b/.test(s);
  const hasOnly = /\b(?:only|uniquement|solo|nur|solamente|seulement)\b/.test(s);
  const hasWash = /\b(?:wash|launder|laver|lavage|lavar|lavado|waschen|wasche|lavare|wassen)/.test(s);

  for (const rule of POSITIVE_RULES) {
    if (!rule.patterns.some(re => re.test(work))) continue;
    if (rule.phrase === 'Dry clean only' && hasOr && !hasOnly) continue; // "dry clean or hand wash" is not "dry clean only"
    found.add(rule.phrase);
    for (const re of rule.patterns) rest = rest.replace(globalOf(re), ' ');
  }

  // "cold water" and "warm water" only count on a line that is about washing.
  for (const [pattern, phrase] of [[/\bcold water\b/, 'Machine wash cold'], [/\bwarm water\b/, 'Machine wash warm']] as const) {
    if (hasWash && pattern.test(work)) {
      found.add(phrase);
      rest = rest.replace(globalOf(pattern), ' ');
    }
  }

  // Inside out belongs to washing or to ironing, depending on the verb on the line.
  const insideOut = /\binside[- ]?out\b|\ba l'envers\b|\bdel reves\b|\bauf links\b|\bal rovescio\b/;
  if (insideOut.test(work)) {
    if (/\b(?:iron|repass|planch|bugel|stirar)/.test(work)) found.add('Iron inside out');
    if (/\b(?:wash|launder|turn|laver|lavar|waschen|lavare)/.test(work)) found.add('Wash inside out');
    rest = rest.replace(globalOf(insideOut), ' ');
  } else if (/\biron(?:ing)?\b.*\b(?:reverse|wrong) side\b|\b(?:reverse|wrong) side\b.*\biron/.test(work)) {
    found.add('Iron inside out');
    rest = rest.replace(/\b(?:reverse|wrong) side\b/g, ' ').replace(/\biron(?:ing)?\b/g, ' ');
  }

  // A "do not" instruction with words of its own in the same clause ("do not iron on print", "do not wash with other colors")
  // is narrower than the phrase, so the line is left for the person to read.
  const qualified = rest
    .split(/[.,;:/|\u2022!]|\s[-\u2013\u2014]\s/)
    .some(clause => clause.includes(CUT) && (clause.match(/[a-z']+/g) ?? []).some(word => !NEUTRAL_WORDS.has(word)));

  return { phrases: CARE_PHRASES.filter(phrase => found.has(phrase)), leftover: unmapped || qualified || looksLikeCare(rest) };
};

/** The phrases a folded line maps to, in CARE_PHRASES order; usually none or one. */
export const matchCareLine = (foldedLine: string): string[] => analyzeCareLine(foldedLine).phrases;
