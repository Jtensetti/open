# Lokal svensk språkförståelse

Tolkningen är deterministisk och sker i webbläsaren. Ingen språkmodell eller extern språktjänst får fritexten. Den gäller katalogens befintliga typer samt de två efterfrågade tilläggen: förskole- och skolplacering.

## Gemensamma regler

- Unicode-tokenisering med ursprungliga teckenpositioner; versaler, normaliserad eller dekomponerad Unicode och bindestreck hanteras.
- Kända ord har bestämd/obestämd form, singular/plural och genitiv. Verb har infinitiv, presens, preteritum, supinum och passiva former. Sammansättningar är avgränsade till kända begrepp och betydelsebärande led; `altanbygget` känns igen, `balkongdörren` blir inte ett balkongärende.
- Frasmatchning tillåter svenska artiklar, possessiva pronomen och vanliga adjektiv samt partikeln i ”byta ut”. Vardagliga synonymer och utvalda särskrivningar mappas till samma schema.
- Ett skrivfel, en omkastning eller uteblivna diakritiska tecken kan ge ett osäkert förslag. Korta ord behandlas restriktivt. Exakta och mer specifika överlappande fraser föredras. Två konkurrerande rättelser avgörs inte godtyckligt.
- Varje identifierat mål redovisar `polarity`, `tense`, `modality`, `uncertain` och källspann. ”Skulle gärna vilja” skiljs från ”om jag skulle”. Negation, bakgrund, tidigare åtgärd, ”inte … utan …”, ”inte bara … utan också …”, alternativ och explicita rättelser hanteras med avgränsade meningsregler.
- Tal skrivna med ord extraheras för antal personer, portioner och ytor. Intervall, alternativ och ungefärliga antal kräver bekräftelse. Ett bråktal som inte stöds får aldrig delas upp till ett annat heltal.
- Korta källutdrag hämtas alltid ur originaltexten. Normalisering ändrar inte citat eller teckenpositioner.

## Flera mål

`detectIntent` returnerar separata `goals` och deras `relation` (`multiple` eller `alternative`). `parseIntake` lämnar faktasamlingen tom när flera typer identifierats. Det hindrar att exempelvis garagets kommun och yta råkar bli uppgifter i en dagisansökan. Vyn visar de upptäckta målen, men automatisk uppdelning till flera beständiga ärenden återstår. Två separata objekt av samma typ identifieras ännu som en typ.

## Förskola och skola

De nya nationella schemana samlar önskad kommun/start, eventuell önskad skola och barnets ålder respektive årskurs/skolform. Naturliga tidsuttryck, exempelvis ”hösten 2027”, bevaras utan att ett exakt datum hittas på. Inga namn eller personnummer behövs för demonstrationen. Att öppna en förskola eller söka jobb på en skola ska inte tolkas som en placeringsansökan.

Flödena förbereder strukturerade önskemål. De skickar inte en ansökan, skapar inte en plats i en kö och avgör inte antagning eller rätt till plats. Processreferenser: [Skolverket om förskolan](https://utbildningsguiden.skolverket.se/forskolan/om-forskolan) och [ansökan till grundskolan](https://utbildningsguiden.skolverket.se/grundskolan/valja-grundskola/ansokan-och-antagning-till-grundskolan).

## Begränsningar och verifiering

Detta är inte en fullständig svensk språkmodell eller syntaktisk analysator. Ovanliga dialektord, långa bisatskedjor, ironi, pronomen över flera meningar och godtyckliga sammansättningar kan kräva förtydligande. Osäkerhet ersätter inte serverns värdevalidering, behörigheter eller verksamhetskontroller.

`swedish-language.test.mjs` innehåller ett oberoende språkcorpus över samtliga familjer samt negativa fall, rättelser, flermålstexter, källspann, ordtal och ett längdgränstest. Alla 102 katalogexempel provas dessutom med artighetsfraser, versaler och dekomponerad Unicode. Äldre parser-/API-tester bevaras. Webbläsartester provar sparning, omladdning och handläggarprojektion på dator och mobil.
