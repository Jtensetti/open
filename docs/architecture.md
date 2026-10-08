# Arkitektur och faktiska gränser

Ett ärende innehåller versionsatt scenario, fakta med proveniens, diagnos, parallella uppgifter och bedömningar. Dokument ingår inte som källa. En mänsklig bedömning är ett strukturerat resultat med aktör, tid, motivering och uppgiftsversion.

Parsern körs lokalt och är en avgränsad svensk grammatik. Den är inte generell språkförståelse. Låg säkerhet kräver bekräftelse. `missing`, `uncertain` och `unsupported` har skilda konsekvenser. Första scenariots kommun, stadigvarande verksamhet och mål måste bekräftas före start. Okända formuleringar kan fortfarande kräva manuell kontroll; detta motiverar pilotens uttryckliga avgränsning. Konfidensvärden är heuristiska, inte kalibrerade sannolikheter.

En framtida lokal modell kan implementeras bakom parsergränsen, men får bara föreslå faktakandidater med källa och osäkerhet. Serverns schema, frågegrind och mänskliga bekräftelse gäller även då. Ingen modell eller extern analystjänst används nu.

## Beständigt tillstånd

Varje kommando har `commandId` och `expectedRevision`. D1-batchen skriver tillstånd, händelser, aktörernas projektioner och outbox atomiskt. Samtidiga skrivningar får versionskonflikt; en idempotent omkörning får inte skapa dubbla händelser. UI visar konflikten och låter användaren läsa in senaste versionen innan nytt försök.

Händelserna har en SHA-256-kedja som verifieras vid läsning. Detta upptäcker ändrade poster men är **inte** extern tidsstämpling, digital signatur eller skydd mot en administratör som skriver om hela kedjan. Nuvarande pilot verifierar hela kedjan; paginering och extern förankring krävs inför hög volym.

## Behörighet och minimering

Slumpmässiga sessioner ligger i HttpOnly/Secure/SameSite-cookies; servern lagrar endast tokenhashar. Medborgaren får sina egna ärenden. Anonyma pilotsessioner varar sju dagar och kan inte återställas efter cookie-förlust. Riktig återkommande användning behöver verifierad identitet och företrädarskap.

Pilotrollbytet skapar serverkontrollerad behörighet för **ett eget ärende och en vald aktör**. Vanlig handläggaråtkomst kräver en individuellt provisionerad högentropinyckel och avgränsas till en aktör. Nycklar ersätter inte myndighets-SSO och används bara i kontrollerad pilot. Gemensamma organisationsnycklar ska inte användas. Avregistrering kräver att både nyckelhash och befintliga sessioner för subjektet tas bort.

Aktörer får fälten i sin regel, sin fråga, sin komplettering och sin bedömning. De får inte hela fritexten, andra aktörers uppgifter eller hela ärendet. Källutdrag begränsas till 240 tecken. De kan ändå innehålla uppgifter som användaren skrivit; använd därför testuppgifter i piloten.

## Integrationsgräns

Outbox-poster markeras `awaiting_integration`, aldrig som skickade. Äldre versioner ersätts med `superseded`. Det finns ännu ingen transport till myndigheter och ingen automatisk beslutanderätt.

En riktig adapter behöver en avtalad mottagare, autentisering, schema, idempotensnyckel, kvittens, återförsök och kontrollerad hantering av gamla versioner. Kvittens och återkommande myndighetsevents ska valideras och bli nya kommandon. Piloten visar de relevanta handläggarfrågorna i ÖPPNA:s egen arbetsyta.

## Före mottagning av riktiga ärenden

Fastställ ansvarig tjänsteoperatör och informationsägare; godkänn identitets-/företrädarskapsflöde, myndighetsbehörighet, personuppgiftsbehandling och gallring. Verifiera scenariot med verksamhetsansvariga och anslut minst en verklig mottagare med kvittens. Genomför säkerhets- och tillgänglighetsgranskning, återläsningsprov och driftsättning med övervakning. `DEPLOYMENT_MODE=production` öppnar inte intaget: det är medvetet stängt tills detta är implementerat.
