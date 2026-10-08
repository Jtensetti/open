# ÖPPNA

100 kommunoberoende flöden: **lokal fritexttolkning → adaptiva frågor → beständigt ärende → avgränsade myndighetsuppgifter → mänsklig bedömning → återkoppling**.

Alla tre vyerna utgår från samma versionshanterade ärendetillstånd. Databasen är beständig; fritexten stannar i webbläsaren. Strukturerade uppgifter och korta källutdrag sparas på servern.

**Status: körbar pilot med testuppgifter.** Inga externa myndighetssystem är anslutna, och pilotbedömningar är inte myndighetsbeslut. Sätt inte in riktiga personuppgifter. Nyregistrering och rollbyte i demonstrationen fungerar bara med `DEPLOYMENT_MODE=pilot`.

Version `0.4.0` använder SCB:s 290 kommunnamn och koder lokalt. Adress och ansvarig kommun är separata fakta. Nationella mallar på `1.0.0` förbereder avgränsade mänskliga frågor; lokala regler och mottagare behöver verifieras. Gamla Trelleborgärenden behåller sina tidigare avtal. Se [katalog](docs/scenarios.md) och [produktionskontrakt](docs/production.md).

Publicerad pilot: https://open.tensetti.io

## Kör lokalt

Node.js 24 eller senare:

```sh
npm ci
npm run dev
```

Öppna http://localhost:8787. SQLite lagras i `.data/oppna.sqlite`. Starta om servern efter kodändringar. Databasmigrationerna tillämpas automatiskt **bara av utvecklingsservern**.

1. Beskriv vad du vill göra och tryck på ”Fortsätt”. Ett tydligt mål väljer rätt ärendetyp automatiskt; osäkra formuleringar behöver bekräftas. ”Bläddra bland ärenden” är ett frivilligt alternativ.
2. Svara på en fråga i taget. Under ”Prova med testuppgifter” fyller knappen ”Fyll med testuppgifter” ett komplett testfall.
3. Bekräfta och starta pilotärendet.
4. Öppna ”Prova som handläggare”, välj en aktör och begär komplettering. Svara i ditt ärende.
5. Registrera en bedömning och se hur händelser, status och samma ärende uppdateras.
6. Ändra ett relevant faktum: berörda bedömningar återställs; oberoende grenar behåller sina bedömningar.

`/handlaggning` är en separat arbetsyta. En pilotbehörighet gäller endast det egna testärendet och en aktör. En konfigurerad individuell handläggarnyckel ger endast den aktörens inskickade uppgifter. Utkast exponeras inte för vanliga handläggare.

## Verifiera

```sh
npm run check
npm test
npm run build
npm run test:worker
npx playwright install chromium
npm run test:browser
```

Domän- och API-tester använder riktig SQLite med komplettering, bedömning och återöppning för 100 nationella och 100 äldre scenarier. Alla 290 kommunnamn, behörighetsisolering och signerade OIDC-tokens provas. Runtime-testet kör byggd Worker med workerd/D1. Playwright provar dator och mobil, kommunbyte, kompletteringsloop, omladdning, lokal fritext och stoppad automatisering. GitHub Actions kör samma kontroller.

## Kodens delar

| Del | Ansvar |
| --- | --- |
| `src/domain/restaurant.mjs` | Versionsatt scenario, fält, villkor, myndigheter och kontrollerade källor |
| `src/domain/catalog-data.mjs`, `catalog.mjs` | 100 versionerade scenarier i tio områden med egna frågor och minimala datapaket |
| `src/domain/intake-parser.mjs`, `extractors.mjs`, `parser.mjs` | Lokal deterministisk parser: adresser, datum, synonymer, felstavning, negation och osäkerhet |
| `src/domain/core.mjs` | Validering, frågeprioritering, regelmotor och tillståndsövergångar |
| `src/domain/municipalities.mjs`, `national-scenarios.mjs`, `authority-routing.mjs` | Nationell tolkning och kommunavgränsade aktörsroller |
| `src/server/repository.mjs` | Atomiska uppdateringar, händelsekedja, uppgiftsprojektion och outbox |
| `src/server/app.mjs` | Behörighetskontrollerat API |
| `src/server/identity.mjs`, `operations.mjs` | OIDC-identitet, återkallad behörighet och driftgrind |
| `src/web/` | Företagarvy, systemvy och handläggarvy |
| `db/schema.ts`, `drizzle/` | Databasschema och migrationshistorik |

Se [arkitektur](docs/architecture.md), [drift](docs/deployment.md) och [produktionskontrakt](docs/production.md). OIDC-stödet behöver konfigureras med en verklig identitetsleverantör. Produktionsintag är stängt tills lokala profiler och anslutna mottagare är godkända.
