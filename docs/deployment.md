# Drift

Appen bygger till en fristående Cloudflare Worker i `dist/server/index.js`. Frontend och API ligger på samma origin; inga tredjepartsskript eller externa fonter används. D1-bindingen heter `DB`. Miljövariabeln `DEPLOYMENT_MODE=pilot` öppnar testintaget.

## Eget Cloudflare-konto

`wrangler.jsonc` innehåller inga hemligheter eller påhittade databas-ID:n. Autentisera med ditt avsedda konto och kontrollera det före resursändringar:

```sh
npm ci
npx wrangler login
npx wrangler whoami
npx wrangler d1 create oppna-pilot
```

För in det returnerade `database_id` i D1-konfigurationen. Kontrollera migrations-SQL, bygg och publicera:

```sh
npm run check
npm test
npm run build
npm run test:worker
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Skapa först ett separat stagingkonto/databas om du behöver prova ändrade migrationer. Redigera aldrig en tillämpad migration. Drizzle genererar nya migrationer från `db/schema.ts` med `npx drizzle-kit generate`.

`open.tensetti.io` kan anslutas som Worker Custom Domain i det Cloudflare-konto som äger zonen. Vid drift genom Sites används dess tilldelade CNAME och verifieringsposter i stället; uppfinn inte DNS-värden.

## Kontrollerad handläggarpilot

`STAFF_KEY_HASHES` är en runtime-hemlighet med JSON-format:

```json
[{"subject":"individuell-handlaggare","authority":"municipality.1280.food","sha256":"SHA256_AV_PERSONLIG_SLUMPNYCKEL"}]
```

Generera minst 32 slumpbyte per person och förmedla nyckeln separat genom en säker kanal. Lägg bara SHA-256-hashen i hemligheten. Skicka aldrig nycklar i Git eller ärendefakta. `npx wrangler secret put STAFF_KEY_HASHES` läser hemligheten interaktivt. Föredra myndighets-SSO innan skarp användning.

## Driftansvar

Hälsokontrollen är `/api/health`. API-svar är `no-store`; klientfel visar ett request-id. Servern loggar felklass och request-id, inte ärendeinnehåll. Kontrollera ändå plattformens egna logg- och datalagringsinställningar.

Dokumentera ägarskap för Cloudflare-konto, DNS, databaser, backup och larm. Återläsning måste provas på separat databas. Aktivera ett fastställt gallringsjobb för testsessioner, begränsningsräknare, testärenden och gamla outbox-versioner; inget generellt gallringsbeslut tas av appen. Sessionerna upphör att ge åtkomst vid sin expiry även innan raderingen körts.

Piloten är inte lasttestad för stor volym. Aktörsinkorgen är paginerad med högst 100 uppgifter per sida och ett ägarkonto kan ha högst 25 testärenden. Versionering, behörighet och atomiska uppdateringar är implementerade; OIDC/PKCE-stödet är implementerat med stabil principal och rollåterkallelse. Verklig IdP, företrädarskap, lokala profiler, myndighetsadaptrar och driftprocess återstår. Se [produktionskontrakt](production.md).
