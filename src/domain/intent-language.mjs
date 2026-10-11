/** Bounded Swedish word forms for the scenario vocabulary.
 * Match original text, never a stemmed copy: provenance offsets must stay exact.
 * Unknown words retain exact matching; arbitrary suffixes/compounds are not goals.
 */
const forms = new Map();
function group(words) {
  const initial = words.split(" ");
  const list = [...new Set(initial.flatMap((w) => forms.get(w) || [w]))];
  for (const word of list) forms.set(word, list);
}
function nouns(words, inflect) {
  for (const word of words.split(" "))
    group([word, ...inflect(word)].join(" "));
}
nouns(
  "altan restaurang butik klädbutik secondhandbutik webbutik livsmedelsbutik matbutik balkong frisörsalong skönhetssalong festival konsert parad demonstration installation konstruktion cistern transportdispens",
  (w) => [w + "en", w + "er", w + "erna"],
);
nouns(
  "matvagn matkiosk glasskiosk carport friggebod vägg mur fasad skylt fasadskylt marknad byggställning uteservering informationskampanj bullerstörning luktstörning avloppsanläggning va-anslutning sophämtning förening sporthall idrottsanläggning trafikanordningsplan ta-plan",
  (w) => [w + "en", w + "ar", w + "arna"],
);
nouns(
  "byggnad tillbyggnad komplementbyggnad komplementbostad bostad fastighet verksamhet livsmedelsverksamhet",
  (w) => [w + "en", w + "er", w + "erna"],
);
nouns(
  "takkupa pizzeria nybyggnadskarta vattenläcka cykelbana gångbana gata miljöfråga",
  (w) => [w + "n", w.slice(0, -1) + "or", w.slice(0, -1) + "orna"],
);
nouns("bageri", (w) => [w + "et", w + "er", w + "erna"]);
nouns("café kafé", (w) => [w + "et", w + "er", w + "erna"]);
nouns(
  "enbostadshus gästhus växthus hus hotell tak plank motionslopp löplopp idrottsevenemang evenemang arrangemang försäljningsstånd avfallsabonnemang avfallskärl grävtillstånd potthål föreningsbidrag kulturstöd",
  (w) => [w + "et", w + "en"],
);
nouns("gatupratare vattenmätare", (w) => [w + "n", w.slice(0, -1) + "na"]);
nouns(
  "glassförsäljning livsmedelstillverkning företagsregistrering användning rivning utställning filminspelning försäljning hemkompostering nedskräpning gatubelysning yrkesutbildning studievägledning yrkesvägledning",
  (w) => [w + "en", w + "ar", w + "arna"],
);
for (const words of [
  "garage garaget garagen garagena",
  "uterum uterummet uterummen",
  "gym gymmet gymmen",
  "vandrarhem vandrarhemmet vandrarhemmen",
  "fönster fönstret fönstren",
  "eldstad eldstaden eldstäder eldstäderna",
  "braskamin braskaminen braskaminer braskaminerna",
  "avlopp avloppet avloppen",
  "avfall avfallet",
  "verksamhetsavfall verksamhetsavfallet",
  "solcell solcellen solceller solcellerna",
  "värmepump värmepumpen värmepumpar värmepumparna",
  "bergvärme bergvärmen",
  "ventilation ventilationen",
  "buller bullret",
  "marknivå marknivån marknivåer marknivåerna",
  "väg vägen vägar vägarna",
  "enskild enskilt enskilda",
  "tillfällig tillfälligt tillfälliga",
  "farlig farligt farliga",
  "fast fasta",
  "skadad skadat skadade",
  "mobil mobilt mobila",
  "liten litet lilla små",
  "kommunal kommunalt kommunala",
  "lokalens lokalers lokalernas",
  "vuxenstudier vuxenstudierna",
  "foodtruck foodtrucken foodtruckar foodtruckarna foodtrucks",
  "container containern containrar containrarna",
  "bistro bistron bistroer bistroerna",
  "tatueringsstudio tatueringsstudion tatueringsstudior tatueringsstudiorna",
  "loppis loppisen loppisar loppisarna",
  "catering cateringen",
  "e-handel e-handeln",
  "skolskjuts skolskjutsen skolskjutsar skolskjutsarna",
  "dagvatten dagvattnet",
  "dricksvattenkvalitet dricksvattenkvaliteten",
  "föreningsintresse föreningsintresset",
])
  group(words);

const verbs = [
  "öppna öppnar öppnade öppnat",
  "starta startar startade startat",
  "arrangera arrangerar arrangerade arrangerat",
  "anordna anordnar anordnade anordnat",
  "bygga bygger byggde byggt bygg",
  "ändra ändrar ändrade ändrat",
  "byta byter bytte bytt byt",
  "installera installerar installerade installerat",
  "riva river rev rivit riv",
  "beställa beställer beställde beställt beställ",
  "placera placerar placerade placerat",
  "ordna ordnar ordnade ordnat",
  "spela spelar spelade spelat",
  "förvara förvarar förvarade förvarat",
  "anlägga anlägger anlade anlagt anlägg",
  "avsluta avslutar avslutade avslutat",
  "stänga stänger stängde stängt stäng",
  "anmäla anmäler anmälde anmält anmäl",
  "fråga frågar frågade frågat",
  "förbereda förbereder förberedde förberett förbered",
  "ansluta ansluter anslöt anslutit anslut",
  "rapportera rapporterar rapporterade rapporterat",
  "gräva gräver grävde grävt gräv",
  "felanmäla felanmäler felanmälde felanmält felanmäl",
  "planera planerar planerade planerat",
  "boka bokar bokade bokat",
  "registrera registrerar registrerade registrerat",
  "utöka utökar utökade utökat",
  "förlänga förlänger förlängde förlängt förläng",
  "söka söker sökte sökt sök",
  "ansöka ansöker ansökte ansökt ansök",
  "behöva behöver behövde behövt",
  "önska önskar önskade önskat",
  "börja börjar började börjat",
  "välja väljer valde valt välj",
  "göra gör gjorde gjort",
  "lägga lägger lade lagt lägg",
  "sätta sätter satte satt sätt",
  "ta tar tog tagit",
  "sälja säljer sålde sålt sälj",
  "tillverka tillverkar tillverkade tillverkat",
  "producera producerar producerade producerat",
  "avveckla avvecklar avvecklade avvecklat",
  "bilda bildar bildade bildat",
  "filma filmar filmade filmat",
  "borra borrar borrade borrat",
  "höja höjer höjde höjt",
  "sänka sänker sänkte sänkt",
  "schakta schaktar schaktade schaktat",
  "inreda inreder inredde inrett",
  "kompostera komposterar komposterade komposterat",
  "renovera renoverar renoverade renoverat",
  "utvidga utvidgar utvidgade utvidgat",
  "förstora förstorar förstorade förstorat",
  "flytta flyttar flyttade flyttat",
  "ändra ändrar ändrade ändrat",
];
for (const words of verbs) {
  group(words);
  const [base, present, past, perfect] = words.split(" ");
  group(
    [
      base,
      base + "s",
      present.endsWith("r") ? present.slice(0, -1) + "s" : present + "s",
      past + "s",
      perfect + "s",
    ].join(" "),
  );
}
for (const words of [
  "sätta ställa ställer ställde ställt",
  "förskola förskolan förskolor förskolorna",
  "grundskola grundskolan grundskolor grundskolorna",
  "skola skolan skolor skolorna",
  "dagis dagiset dagisen",
  "plats platsen platser platserna",
  "förskoleplats förskoleplatsen förskoleplatser förskoleplatserna",
  "dagisplats dagisplatsen dagisplatser dagisplatserna",
  "skolplats skolplatsen skolplatser skolplatserna",
  "förskoleklass förskoleklassen förskoleklasser förskoleklasserna",
  "pensionat pensionatet pensionaten",
  "system systemet systemen",
  "kö kön köer köerna",
  "mätare mätaren mätare mätarna",
  "företag företaget företagen",
  "förråd förrådet förråden",
  "bostadshus bostadshuset bostadshusen",
  "villa villan villor villorna",
  "krog krogen krogar krogarna",
  "matställe matstället matställen matställena",
  "fik fiket fiken",
  "affär affären affärer affärerna",
  "konditori konditoriet konditorier konditorierna",
  "solpanel solpanelen solpaneler solpanelerna",
  "kamin kaminen kaminer kaminerna",
  "vedspis vedspisen vedspisar vedspisarna",
  "terrass terrassen terrasser terrasserna",
  "trädäck trädäcket trädäcken",
  "komvux komvuxet",
  "stöd stödet stödens",
  "barn barnen barnet",
  "yrkesvux yrkesvuxen",
  "vuxna vuxen vuxne",
  "bärande bärande",
  "grundläggande grundläggande",
  "utebliven uteblivet uteblivna",
  "offentlig offentligt offentliga",
  "trasig trasigt trasiga",
  "bred brett breda",
  "tung tungt tunga",
  "enskild enskilt enskilda",
  "gammal gammalt gamla",
])
  group(words);

// Inflect only known vocabulary words. Never strip an arbitrary user's word
// until it resembles a service (e.g. balkongdörr is not a balcony application).
export function registerNoun(word) {
  if (forms.has(word) || word.length < 4) return;
  // Compound nouns inherit inflections of a known head (företagsavfall,
  // ventilationssystem, förskolekö), including irregular Swedish paradigms.
  const head = [...forms.keys()]
    .filter((w) => w.length >= 2 && word.length > w.length && word.endsWith(w))
    .sort((a, b) => b.length - a.length)[0];
  if (head) {
    group(
      forms
        .get(head)
        .map((w) => word.slice(0, -head.length) + w)
        .join(" "),
    );
    return;
  }
  let endings = [];
  if (word.endsWith("a"))
    endings = [
      word + "n",
      word.slice(0, -1) + "or",
      word.slice(0, -1) + "orna",
    ];
  else if (/(?:ning|pump|mur|vagn|väg|skylt|kiosk|spis|kö)$/.test(word))
    endings = [word + "en", word + "ar", word + "arna"];
  else if (
    /(?:hus|däck|stånd|stöd|verk|val|kärl|byte|bygge|ärende)$/.test(word)
  )
    endings = [
      word + (word.endsWith("e") ? "t" : "et"),
      word + "n",
      word + "en",
    ];
  else endings = [word + "en", word + "er", word + "erna"];
  group([word, ...endings].join(" "));
}
export const pastActions = new Set(
  verbs.flatMap((v) => v.split(" ").slice(2, 4)).flatMap((w) => [w, w + "s"]),
);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const wordForms = (word) => {
  const list = forms.get(word) || [word];
  return [
    ...new Set(
      list.flatMap((w) => [
        w,
        ...(w.length > 3 && !w.endsWith("s") ? [w + "s"] : []),
      ]),
    ),
  ];
};
const wordPattern = (word) =>
  "(?:" +
  wordForms(word)
    .map(escapeRe)
    .sort((a, b) => b.length - a.length)
    .join("|") +
  ")";
export const action = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:" +
    verbs
      .flatMap((v) => v.split(" "))
      .map(escapeRe)
      .join("|") +
    ")(?![\\p{L}\\p{N}])",
  "iu",
);
const determiner =
  "(?:en|ett|den|det|de|min|mitt|mina|vår|vårt|våra|sin|sitt|sina)";
const modifier =
  "(?:befintlig|befintligt|befintliga|ny|nytt|nya|gammal|gammalt|gamla|liten|litet|lilla|stor|stort|stora)";
export function aliasPattern(alias) {
  // Phrase aliases can contain a determiner and a simple modifier, without
  // skipping arbitrary words (especially negation or another action).
  const words = alias.split(/\s+/);
  let pattern = wordPattern(words[0]);
  for (let i = 1; i < words.length; i++) {
    const particle = words[i - 1] === "byta" ? "(?:ut\\s+)?" : "";
    pattern +=
      `\\s+${particle}(?:${determiner}\\s+)?(?:${modifier}\\s+)?` +
      wordPattern(words[i]);
  }
  return new RegExp(
    "(?<![\\p{L}\\p{N}])" + pattern + "(?![\\p{L}\\p{N}])",
    "giu",
  );
}
