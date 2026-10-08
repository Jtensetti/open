# Från ett scenario till hundra

Endast `restaurant.trelleborg@1.0.0` är implementerat. Gör restaurangens verkliga mottagarflöde klart innan nästa scenario aktiveras. Lägg inte ut hundra namn som om de vore färdiga tjänster.

Varje nytt scenario behöver en ansvarig verksamhetsägare, kommun/jurisdiktion, kontrollerade primärkällor, tydlig avgränsning och versionsnummer. Definiera faktatyper, proveniens, villkor och prioriterade frågor. Varje myndighetsregel behöver en specifik bedömningsfråga, minsta datapaket, beroenden och en verklig mottagnings-/kvittensväg.

Godkänn för varje scenario tester för normalfall, saknade uppgifter, motsägelser, negationer, osäkerhet, unsupported kombinationer, parallella beslut, komplettering, återkallade fakta, behörighetsgränser och samtidiga skrivningar. Ett nytt scenario ska inte aktiveras förrän mottagaren har granskat fälten och ärendeåterkopplingen.

Nästa tekniska steg är en versionsadresserad scenariokatalog där även tidigare versioner kan laddas för befintliga ärenden. Nuvarande kod har en versionerad restaurangspecifikation och en gemensam motor, men ingen färdig migrering mellan olika scenarioversioner. Gör detta innan flera versioner är i drift samtidigt.
