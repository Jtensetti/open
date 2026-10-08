# ÖPPNA

100 kommunoberoende ärendetyper: **fritext → strukturerade uppgifter → generell handläggarvy**.

Fritext, ärendegraf och handläggarens uppgiftstabell visas samtidigt och uppdateras från samma tolkning. Databasen är beständig; fritexten stannar i webbläsaren. Strukturerade uppgifter och korta källutdrag sparas på servern.

**Status: körbar pilot med testuppgifter.** Inga externa myndighetssystem är anslutna, och pilotbedömningar är inte myndighetsbeslut. Sätt inte in riktiga personuppgifter. Nyregistrering och API:ts pilotrollbyte fungerar bara med `DEPLOYMENT_MODE=pilot`.

Version `0.4.0` använder SCB:s 290 kommunnamn och koder lokalt. Adress och ansvarig kommun är separata fakta. Nationella mallar på `1.0.0` förbereder avgränsade mänskliga frågor; lokala regler och mottagare behöver verifieras. Gamla Trelleborgärenden behåller sina tidigare avtal. Se [katalog](docs/scenarios.md) och [produktionskontrakt](docs/production.md).

Publicerad pilot: https://open.tensetti.io

## Kör lokalt

Node.js 24 eller senare:

```sh
npm ci
npm run dev
```

Öppna http://localhost:8787. SQLite lagras i `.data/oppna.sqlite`. Starta om servern efter kodändringar. Databasmigrationerna tillämpas automatiskt **bara av utvecklingsservern**.

1. Beskriv vad du vill göra. Ett tydligt mål väljer rätt ärendetyp medan du skriver; osäkra formuleringar behöver bekräftas.
2. Se uppgifterna i ärendegrafen och den generella handläggartabellen. Komplettera eller korrigera vid behov.
3. Uppgifter sparas automatiskt. Fliken ”Händelser” visar den sparade händelsekedjan. Omladdning återställer ärendet och webbläsarens lokala fritext.

Handläggarvyn på startsidan är en skrivskyddad projektion av det egna ärendet; den skapar ingen handläggarbehörighet och skickar inget till myndigheter. Privat anteckning ingår inte i tabellen. Inga gransknings-, överlämnings- eller beslutsknappar visas.

`/handlaggning` visar skrivskyddade uppgifter som servern ger den inloggade handläggaren behörighet till. Utkast exponeras inte för vanliga handläggare. Domänens stöd för aktörsavgränsning, komplettering och bedömning finns kvar i API:t och dess tester.

## Verifiera

```sh
npm run check
npm test
npm run build
npm run test:worker
npx playwright install chromium
npm run test:browser
```

Domän- och API-tester använder riktig SQLite med komplettering, bedömning och återöppning för 100 nationella och 100 äldre scenarier. Alla 290 kommunnamn, behörighetsisolering och signerade OIDC-tokens provas. Runtime-testet kör byggd Worker med workerd/D1. Playwright provar dator och mobil, kommunbyte, automatiskt ärendetypbyte, långsamma sparningar, omladdning, lokal fritext och osäkra tolkningar. GitHub Actions kör samma kontroller.

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
