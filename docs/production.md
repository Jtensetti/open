# Produktionskontrakt, 0.4.0

Den publicerade tjänsten kör `DEPLOYMENT_MODE=pilot` med testärenden. 0.4.0 innehåller tekniska produktionsförberedelser, inte godkända kommunala e-tjänster. `/api/readiness` skiljer mellan faktisk drift och konfigurationskontroller. Produktionsintag och externa myndighetsanslutningar är ännu stängda; inga miljöflaggor kringgår den gränsen.

## Nationell tolkning och lokalt ansvar

102 nationella mallar har `jurisdiction=SE` och ett separat kommunfaktum. SCB:s 290 kommunnamn och koder finns lokalt, kontrollerade 2026-10-08: https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/kommuner-i-bokstavsordning/

Parsern använder inga nätverksanrop. Postort, postnummer och adress avgör inte kommungränsen. `Storgatan 12, Malmö` ger en adress och en kommunfråga; `Storgatan 12 i Malmö` föreslår användarens uttryckliga kommunuppgift. Alternativ och fuzzy-matchning kräver bekräftelse. Tabelluppdatering är en granskad kodändring.

Funktionella aktörsroller binds till kommunkoden: `municipality.food` blir `municipality.1280.food` för Malmö. Det betyder inte att en faktisk mottagare är ansluten. `packet.jurisdiction.localRulesVerified` är falskt. Delegation, kommunalförbund och rättsliga regler behöver en separat verksamhetsgodkänd profil. Osäker/saknad kommun skapar inga aktörsuppgifter. Kommunbyte återkallar gamla uppgifter och bedömningar. Gamla `*.trelleborg`-ärenden behåller sina avtal; nya ärenden använder `*.se` på 1.0.0.

## Identitet och behörighet

OIDC Authorization Code med PKCE S256 är implementerat för medborgare och handläggare. Registrera callbacken `https://open.tensetti.io/api/auth/callback` hos vald identitetsleverantör. `PUBLIC_ORIGIN` ska vara den exakta HTTPS-originen utan sökväg. Runtime-konfigurationerna `OIDC_CITIZEN` och `OIDC_STAFF` har följande form; ersätt alla exempelvärden:

```json
{
  "issuer": "https://IDENTITETSLEVERANTORENS_HOST",
  "clientId": "REGISTRERAT_CLIENT_ID",
  "authorizationEndpoint": "https://IDENTITETSLEVERANTORENS_HOST/authorize",
  "tokenEndpoint": "https://IDENTITETSLEVERANTORENS_HOST/token",
  "jwksUri": "https://IDENTITETSLEVERANTORENS_HOST/jwks",
  "requiredAcr": "AVTALAD_TILLITSNIVA"
}
```

`requiredAcr` är valfritt och måste avtalas med leverantören. Endpoints ska vara fasta HTTPS-adresser på issuer-origin. Stöd finns för publik PKCE-klient eller `client_secret_post`, med `OIDC_CITIZEN_CLIENT_SECRET`/`OIDC_STAFF_CLIENT_SECRET` som runtime-hemlighet. Andra klientautentiseringsmetoder behöver en granskad adapter. BankID är inte direkt implementerat.

JOSE verifierar RS256/ES256-signatur, issuer, audience/azp, sub, exp, iat, nonce, högst tio minuter gammal token och eventuell acr. State binds till en HttpOnly/Secure/SameSite=Lax-cookie och förbrukas atomiskt. Tokenutbyte har tio sekunders timeout och begränsade svarsstorlekar. ID-/access-token lagras inte. Principal-id är en hash av issuer och sub; samma verifierade användare återfår sina ärenden efter ny inloggning.

`OIDC_STAFF_GRANTS` är en administrerad runtime-hemlighet, exakt en godkänd roll per issuer/subject:

```json
[{"issuer":"https://IDENTITETSLEVERANTORENS_HOST","subject":"PROVISIONERAT_OPAKT_SUB","authority":"municipality.1280.food"}]
```

Behörighet kommer från denna lista, inte användarens JSON. Listan kontrolleras vid varje handläggaranrop; borttagen/ändrad roll stoppar befintliga sessioner. Organisationen ansvarar för provisionering och företrädarskap. Produktionsläge nekar anonyma sessionsstarter, pilotrollbyte och gamla handläggarnycklar. Verifierad OIDC-identitet ger åtkomst till egna befintliga ärenden och tilldelade uppgifter. SSO öppnar inte automatiskt nyregistrering.

## Drift och datalivscykel

`/api/health` kontrollerar databas och autentiseringstabeller. `/api/readiness` är en separat aktiveringsgrind. `OPERATOR_NAME` och `PRIVACY_URL` anger operatör och HTTPS-integritetsinformation; dessa konfigurationskontroller bevisar inte verksamhetsgodkännande.

`LOG_REQUESTS=true` loggar request-id, metod, svarskod och svarstid. Appen loggar inga fritexter, källutdrag, URL-parametrar, tokens eller subject-id. Plattformens egna loggar behöver granskas separat. API är `no-store`; servern validerar JSON, schema och proveniens. Låg konfidens eller fuzzy-metod blir osäker oavsett inskickad status. Ärendegränsen 25 per ägare är atomisk. Handläggarinkorgen är paginerad, högst 100 per sida, med aktörsavgränsat index.

`GET /api/cases/:id/export` ger ägaren strukturerat tillstånd och verifierad händelsekedja. Hashkedjan ersätter inte extern förankring eller signerad myndighetskvittens. Dokument blir aldrig source of truth.

`POST /api/logout` återkallar browserns aktuella sessioner. Medborgarsessioner gäller sju dagar, handläggarsessioner åtta timmar och OIDC-transaktioner tio minuter. Utgångna uppgifter nekas även före fysisk städning.

`POST /api/maintenance` kräver egen Origin och `Authorization: Bearer <slumpnyckel på minst 32 tecken>`. `MAINTENANCE_KEY_HASH` innehåller SHA-256-hashen som runtime-hemlighet. Varje anrop raderar högst 500 utgångna sessioner, 500 utgångna OIDC-transaktioner och 500 begränsningsräknare; upprepa vid behov. Driftoperatören behöver konfigurera sitt schemalagda jobb; inget är aktiverat i Sites-deployen. Endpointet gallrar inte ärenden eller historik. Fastställ gallring, backup och provad återläsning per informationsägare.

## Aktiveringskrav

Skarp mottagning kräver en konfigurerad och provad verklig identitetsleverantör, godkänd behörighets-/företrädarmodell, verksamhetsgranskade lokala processprofiler, avtalade mottagare med idempotens och kvittens, fastställd datalivscykel samt provad återställning, tillgänglighet och kapacitet. Dessa externa förutsättningar finns inte i denna deploy.

Automatiska tester provar 290 kommunnamn, 102 nationella och 100 äldre avtal, kommunbyte och behörighetsisolering, negativa fall med signerade OIDC-tokens, samtidiga skrivningar, databas/API-loopar, byggd Worker/D1 och dator/mobil. Verkliga IdP- och mottagarkontrakt behöver dessutom provas i staging.
