# ÖPPNA – genomgång och version 0.5.0

Granskad 8 oktober 2026. Underlag: appens källkod, lokala körningar, automatiserade tester samt öppna myndighets- och kommunsidor. Förvaltarens konkreta synpunkter har inte lämnats till oss; punkterna nedan är våra verifierade fynd och vår bedömning av vad som återstår. Ingen fullständig säkerhetsrevision eller tillgänglighetscertifiering har gjorts.

## Brister som åtgärdas i denna version

| Fynd i föregående version | Konsekvens | Ändring i 0.5.0 |
| --- | --- | --- |
| Grönt “Live” visades oberoende av sparresultat. | Användaren kunde tro att osparade uppgifter fanns på servern. | Synlig status för lokala ändringar, pågående sparande, bekräftat sparande och fel. Utkast skiljs från inskickat ärende. |
| Nätfel saknade återförsök och timeout. Nytt kommando skapades vid nästa försök. | Ett borttappat svar kunde ge versionskonflikt trots att servern redan sparat. | Samma kommandonyckel återanvänds efter osäkert svar. Begäranden tidsbegränsas. Text och uttryckliga svar hålls kvar och osparat utkast återställs efter omladdning i samma flik. |
| Samtidiga flikar gav ett fel utan användbar återhämtning. | Det var svårt att fortsätta utan att riskera den andra versionen. | Konflikten förklaras. Användaren kan spara sin inmatning som ett separat utkast. Den andra versionen skrivs inte över. |
| Ett fel vid hämtning av historik tolkades som misslyckat sparande. | Felaktig återkoppling efter en lyckad skrivning. | Sparbekräftelse och historikhämtning hanteras separat. Historiken kan hämtas igen. |
| Tolkade uppgifter såg bekräftade ut. | Handläggarperspektivet kunde inge större säkerhet än underlaget medgav. | Synlig skillnad mellan tolkat, osäkert och bekräftat i båda perspektiven. Källutdrag finns kvar. |
| Fältfel, återkoppling och fokus vid dynamiska frågor var otillräckliga. | Tangentbords- och hjälpmedelsanvändare kunde tappa sammanhanget. | Fel nära fältet, konkreta rättningsförslag, `aria-invalid`, statusmeddelanden, fokus på nästa fråga, unika kontrollnamn, hopplänk, bättre kontrast och alternativ när JavaScript saknas. |
| Källutdrag och manuella svar kunde innehålla personnummer. | Onödiga identifierande uppgifter kunde hamna i testdatabas och historik. | Ett avgränsat skydd stoppar vanliga personnummer- och samordningsnummerformat i testläget. Kontroller sker före webbläsarlagring/överföring och på servern före skrivning. Ingen automatisk radering av gamla uppgifter görs. |
| Begränsningar, uppgiftslagring och hjälp var inte tillgängliga i gränssnittet. | Oklart om detta var en verklig kommunal e-tjänst. | Kort testmarkering och utfällbar information om uppgifter, begränsningar, tillgänglighet och teknisk felrapportering. Användaren kan hämta sitt lokala utkast som JSON. |
| Samma tillgångsadresser cachelagrades mellan releaser. | Ny HTML kunde användas med en tidigare programversion under cachetiden. | Versionerade länkar och omvalidering av appens JavaScript och CSS. |

Det tidigare upplägget behålls: fritext, nästa relevanta fråga, förstådda uppgifter, synlig ärendegraf/JSON och en generell handläggarvy. Inga nya ärendetyper eller knappar för att skicka vidare, granska eller fatta beslut har lagts till.

## Mönster hämtade från offentlig vägledning

Digg betonar att fel ska beskrivas begripligt och knytas till rätt fält, gärna med hjälp att korrigera dem. Det ligger bakom fältvalideringen och rättningsförslagen. [Beskriv fel](https://www.digg.se/webbriktlinjer/alla-webbriktlinjer/visa-var-ett-fel-uppstatt-och-beskriv-det-tydligt), [föreslå rättning](https://www.digg.se/webbriktlinjer/alla-webbriktlinjer/ge-forslag-pa-hur-fel-kan-rattas-till).

Status som ändras utan att få fokus behöver kunna presenteras av hjälpmedel. Meningsfull fokusordning behövs även när innehåll ändras dynamiskt. Det ligger bakom sparstatus, återkoppling efter tolkning och fokus på nästa fråga. [Statusmeddelanden](https://www.digg.se/webbriktlinjer/alla-webbriktlinjer/se-till-att-hjalpmedel-kan-presentera-meddelanden-som-inte-ar-i-fokus), [fokusordning](https://www.digg.se/webbriktlinjer/alla-webbriktlinjer/ha-en-meningsfull-fokusordning).

IMY beskriver uppgiftsminimering, dataskydd i utformningen och begränsande standardinställningar. Vår tillämpning är att göra testlägets begränsningar tydliga och stoppa vissa identifierande nummer. Det är inte ett fullständigt skydd mot personuppgifter. [Inbyggt dataskydd och dataskydd som standard](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/inbyggt-dataskydd-och-dataskydd-som-standard/).

## Öppna kommunala exempel

Vi har granskat publika startsidor och beskrivningar, inte skickat in ansökningar eller granskat kommunernas interna system. Vi har återanvänt produktmönster med egen kod och egen text.

| Kommun och öppen tjänst | Synligt mönster | Tillämpning här |
| --- | --- | --- |
| [Sundsvall – förhandsbesked](https://e-tjanster.sundsvall.se/oversikt/overview/428) | Förutsättningar, inloggningskrav, kontakt, personuppgiftshantering och steg fram till inskickning. | Tydlig skillnad mellan att förbereda uppgifter och att göra en verklig ansökan; fördjupning på begäran. |
| [Sundsvall – förskola](https://e-tjanster.sundsvall.se/oversikt/flowoverview/242) | Beskriver olika användningsfall, identitetskrav och alternativa kontaktvägar. | Informera om vad tjänsten faktiskt kan göra och hänvisa verkliga ärenden till ansvarig kommun. |
| [Malå – förhandsbesked](https://minasidor.mala.se/oversikt/overview/231) | Separat förklaring av sparat ärende, återupptagning och uppföljning efter inskickning. | Egen sparstatus för utkast och återhämtning. ÖPPNA utger sig inte för att ha kommunens Mina sidor. |
| [Hallstahammar – lämna synpunkt](https://eservice.hallstahammar.se/EServiceStart.aspx?id=bbbfc9dd-bec0-4ade-b80e-7d65722dbcc7) | Förklarar mottagande, offentlighet, anonymitet och personuppgifter före start. | Klargör vart uppgifterna går. Ingen text som påstår att utkast i ÖPPNA automatiskt registreras hos en kommun. |

## Kvar före skarp kommunal användning

Dessa är produktionshinder eller områden att verifiera tillsammans med en faktisk kommun. Att de listas betyder inte att varje kommun har identiska krav eller att allt behöver finnas i en demonstrationsapp.

1. **Ansvar och informationshantering.** Fastställ tjänsteägare, personuppgiftsansvar, ändamål, rättslig grund, biträdesrelationer, lagring/gallring och riskbedömning. Publicera riktig information och kontaktväg. Appens miljökontroller ersätter inte de besluten. Det finns ännu ingen implementerad automatisk gallring av testärenden; teknisk rensning av utgångna sessioner är något annat. [IMY:s vägledning](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/inbyggt-dataskydd-och-dataskydd-som-standard/).
2. **Verifierad identitet och behörighet.** OIDC-stöd finns i koden, men den publika piloten använder tillfälliga sessioner. Återupptagning över enheter, företrädare, vårdnadshavare, skyddade uppgifter och kommunernas personalbehörigheter kräver avtalad utformning och verifiering. Skyddade uppgifter ska inte testas i piloten. Inget nytt identitetssystem har aktiverats i denna release.
3. **Verkligt mottagande och lokala regler.** Produktionsintag och myndighetsintegrationer är fortfarande stängda. Det behövs verifierade lokala ärendescheman, mottagare, kvittenser, återförsök, felhantering och uppföljning i verksamhetssystem. 102 förberedande mallar och 290 kommunnamn är inte 290 godkända kommunala e-tjänsteutbud.
4. **Arkivering och interoperabilitet.** Den befintliga JSON-exporten med historik är användbar, men är inte en verifierad leverans till diariet eller e-arkivet. Riksarkivets FGS beskriver gemensamma utbytesformat för överföring mellan system och organisationer. Välj och testa ett överenskommet kontrakt med mottagaren. [Förvaltningsgemensamma specifikationer](https://riksarkivet.se/arkivera-och-forvalta/medium-och-format/forvaltningsgemensamma-specifikationer).
5. **Tillgänglighet och alternativa vägar.** Gör en fullständig manuell granskning med hjälpmedel och berörda användare. En offentlig aktör behöver bedöma kraven som gäller för tjänsten och ta fram en korrekt tillgänglighetsredogörelse med fungerande kontaktväg. Vår utfällbara testinformation är ingen sådan redogörelse. [Digg om tillgänglighetsredogörelse](https://www.digg.se/kunskap-och-stod/digital-tillganglighet/skapa-en-tillganglighetsredogorelse).
6. **Drift och förvaltning.** Verifiera ansvar, incidentrutiner, säkerhetsuppdateringar, övervakning, återställning från backup och kontinuitet under faktisk last. Tester av applikationen bevisar inte att detta fungerar i en kommunal driftsorganisation. [NCSC:s guide till en cybersäker kommun](https://www.ncsc.se/sv/radgivning-och-stod/arbeta-systematiskt-med-informationssakerhet-och-cybersakerhet/cybersakerhet-i-kommuner/guide-till-en-cybersaker-kommun/).
7. **Språk och ärendekvalitet.** Parsern är regelstyrd och har kända gränser. Flera ärendemål upptäcks men blir ännu inte separata handläggningsbara ärenden automatiskt. Fortsatt utvärdering behöver realistiska, avidentifierade språkexempel och sakkunnig granskning av schema och regler. Ett tolkat fält är varken en verifierad registeruppgift eller ett myndighetsbeslut.

## Verifiering av releasen

439 automatiserade domän- och API-tester passerar. 64 webbläsartester passerar på dator- och mobilstorlek, inklusive nätfel, borttappade sparbekräftelser, omladdning, samtidiga flikar, fältvalidering, personnummerstopp, nedladdning, 320 px bredd och avstängt JavaScript. Byggd Worker har verifierats med verklig lokal workerd/D1-körning för lagring, behörighetsgränser, historik/export och signerad OIDC-inloggning. Scenario- och syntaxkontroller passerar.

Inga nya databasfält eller migreringar behövs. Befintliga ärenden och tidigare scenarioversioner behålls. Skyddet för personnummer är heuristiskt, kan ge felaktiga träffar och upptäcker inte alla identifierare eller andra känsliga uppgifter. Lagring i fliken kan nekas av webbläsaren och är inte en varaktig backup; därför finns sparstatus, varning vid osparad navigering och lokal nedladdning.
