# ÖPPNA

En sammanhängande restaurangpilot för Trelleborg: **lokal fritexttolkning → adaptiva frågor → beständigt ärende → avgränsade myndighetsuppgifter → mänsklig bedömning → återkoppling**.

Alla tre vyerna utgår från samma versionshanterade ärendetillstånd. Databasen är beständig; fritexten stannar i webbläsaren. Strukturerade uppgifter och korta källutdrag sparas på servern.

**Status: körbar pilot med testuppgifter.** Inga externa myndighetssystem är anslutna, och pilotbedömningar är inte myndighetsbeslut. Sätt inte in riktiga personuppgifter. Nyregistrering och rollbyte i demonstrationen fungerar bara med `DEPLOYMENT_MODE=pilot`.

## Kör lokalt

Node.js 24 eller senare:

```sh
npm ci
npm run dev
```

Öppna http://localhost:8787. SQLite lagras i `.data/oppna.sqlite`. Starta om servern efter kodändringar. Databasmigrationerna tillämpas automatiskt **bara av utvecklingsservern**.

1. Skriv ditt restaurangmål, eller välj restaurangexemplet.
2. Svara på frågorna. Knappen ”Fyll med testuppgifter” fyller ett komplett testfall.
3. Bekräfta och starta pilotärendet.
4. Välj en aktör, begär komplettering och svara i företagarvyn.
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

Domän- och API-tester använder riktig SQLite. Runtime-testet kör den byggda Worker-filen med workerd och D1. Playwright provar desktop och mobil, kompletteringsloop, omladdning, lokal fritext och stoppad automatisering. GitHub Actions kör samma kontroller.

## Kodens delar

| Del | Ansvar |
| --- | --- |
| `src/domain/restaurant.mjs` | Versionsatt scenario, fält, villkor, myndigheter och kontrollerade källor |
| `src/domain/parser.mjs` | Lokal deterministisk parser: synonymer, felstavning, negation och osäkerhet |
| `src/domain/core.mjs` | Validering, frågeprioritering, regelmotor och tillståndsövergångar |
| `src/server/repository.mjs` | Atomiska uppdateringar, händelsekedja, uppgiftsprojektion och outbox |
| `src/server/app.mjs` | Behörighetskontrollerat API |
| `src/web/` | Företagarvy, systemvy och handläggarvy |
| `db/schema.ts`, `drizzle/` | Databasschema och migrationshistorik |

Se [arkitektur](docs/architecture.md), [drift](docs/deployment.md) och [vägen till fler scenarier](docs/scenarios.md).
