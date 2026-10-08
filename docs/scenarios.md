# 102 kommunoberoende ärendetyper

Version 0.4.0 innehåller 102 nationella förberedelseflöden inom kommunal service. Alla delar en motor för lokal tolkning, frågor, lagring, parallella uppgifter, komplettering och mänsklig bedömning. Varje mall har eget versionsatt schema och specifik sakfråga.

Nya flöden använder `*.se` på 1.0.0, `jurisdiction=SE` och separat ansvarig kommun från SCB:s 290 namn/koder. Postort används aldrig för att gissa kommun. Lokala aktörsroller avgränsas med kommunkod; lokala regler och mottagare är ännu inte verifierade. Gamla Trelleborgavtal på 1.0.0/0.1.0 bevaras för tidigare ärenden.

**102 körbara förberedelseflöden är inte 102 godkända myndighetstjänster.** Källorna stödjer processområdet; ansvarig verksamhet behöver granska exakta regler och underlag. Inga externa myndighetssystem är anslutna. OIDC är implementerat men en verklig leverantör behöver konfigureras. Högriskfall som kärnkraft, vapen och akut vård stöds inte. Se [produktionskontrakt](production.md).

Alla 102 nationella flöden och alla 100 tidigare avtal provas genom databas/API med komplettering, bedömning och verifierad eventkedja. Webbläsartester provar katalog, nationell parsing, kommunbyte samt tio representativa typer på dator och mobil.

## Versionshantering

Gamla ärenden behåller scenarioId och scenarioVersion. Typbyte på utkast journalförs och återkallar tidigare fakta; startade ärenden är låsta till sin typ. Behåll tidigare versioner i scenarioVersions när nya versioner släpps.

## Katalog

| # | Ärendetyp | Område | Specifik sakfråga |
| --- | --- | --- | --- |
| 1 | Öppna restaurang | Mat och servering | Vad används lokalen till i dag? |
| 2 | Öppna café | Mat och servering | Vilken mat och vilka drycker ska caféet servera? |
| 3 | Starta foodtruck | Mat och servering | Var ska matvagnen stå och hur ordnas vatten och rengöring? |
| 4 | Starta bageri | Mat och servering | Vad ska bakas och hur ska produkterna säljas? |
| 5 | Starta catering | Mat och servering | Var tillagas maten och hur ska den transporteras? |
| 6 | Öppna matkiosk | Mat och servering | Vilka livsmedel ska hanteras i kiosken? |
| 7 | Öppna glassförsäljning | Mat och servering | Ska glassen tillverkas på plats eller köpas in färdig? |
| 8 | Öppna livsmedelsbutik | Mat och servering | Vilka typer av livsmedel och eventuell beredning planeras? |
| 9 | Starta livsmedelstillverkning | Mat och servering | Vad ska tillverkas och hur ska det levereras? |
| 10 | Ändra livsmedelsverksamhet | Mat och servering | Vad ändras jämfört med den befintliga verksamheten? |
| 11 | Avsluta livsmedelsverksamhet | Mat och servering | Vilken del av livsmedelsverksamheten upphör? |
| 12 | Öppna butik | Företag och butik | Vilka varor ska butiken sälja? |
| 13 | Öppna secondhandbutik | Företag och butik | Vilka begagnade varor ska säljas och hur tas de emot? |
| 14 | Starta e-handel | Företag och butik | Vilka produkter säljs och var lagras varorna? |
| 15 | Öppna hotell | Företag och butik | Vilken typ av boende och hur många rum planeras? |
| 16 | Öppna frisörsalong | Företag och butik | Vilka behandlingar och installationer planeras? |
| 17 | Öppna tatueringsstudio | Företag och butik | Vilka behandlingar och hygienrutiner planeras? |
| 18 | Öppna skönhetssalong | Företag och butik | Vilka behandlingar planeras och används stickande verktyg? |
| 19 | Öppna gym | Företag och butik | Vilken träning och hur många besökare samtidigt planeras? |
| 20 | Förbereda företagsregistrering | Företag och butik | Gäller frågan F-skatt, moms, arbetsgivare eller en ändring? |
| 21 | Bygga enbostadshus | Bygga och ändra | Beskriv bostaden, antal våningar och ungefärlig höjd. |
| 22 | Bygga till huset | Bygga och ändra | Vad ska tillbyggnaden användas till och hur ansluter den till huset? |
| 23 | Bygga garage | Bygga och ändra | Ska garaget vara fristående och hur nära gränsen placeras det? |
| 24 | Bygga carport | Bygga och ändra | Beskriv tak, antal platser och avstånd till tomtgräns. |
| 25 | Bygga komplementbyggnad | Bygga och ändra | Vad ska byggnaden användas till och var placeras den? |
| 26 | Bygga komplementbostad | Bygga och ändra | Ska byggnaden innehålla en självständig bostad med kök och badrum? |
| 27 | Bygga uterum | Bygga och ändra | Ska uterummet vara inglasat, uppvärmt och anslutet till huset? |
| 28 | Bygga altan | Bygga och ändra | Beskriv altanens höjd, placering och eventuella tak. |
| 29 | Bygga balkong | Bygga och ändra | På vilken fasad och våning ska balkongen byggas? |
| 30 | Bygga takkupa | Bygga och ändra | Beskriv takkupan och hur den påverkar takets konstruktion. |
| 31 | Ändra tak | Bygga och ändra | Vilket material eller vilken form ska taket få? |
| 32 | Ändra fasad | Bygga och ändra | Vilken del av fasaden och vilket material eller färg ändras? |
| 33 | Ändra fönster | Bygga och ändra | Beskriv förändringen av fönstrens storlek, placering eller utseende. |
| 34 | Installera solceller | Bygga och ändra | Var placeras panelerna och följer de takets lutning? |
| 35 | Installera eldstad | Bygga och ändra | Vilken eldstad och rökkanal ska installeras? |
| 36 | Ändra ventilation | Bygga och ändra | Vilket ventilationssystem ändras och hur påverkas byggnaden? |
| 37 | Ändra bärande konstruktion | Bygga och ändra | Vilken bärande del ändras och vad ersätter den? |
| 38 | Ändra användning av lokal | Bygga och ändra | Vad används lokalen till i dag och vad ska den bli? |
| 39 | Inreda ytterligare bostad | Bygga och ändra | Hur ska den nya bostaden avskiljas och få entré, kök och hygienutrymme? |
| 40 | Riva byggnad | Bygga och ändra | Vilken byggnad eller byggnadsdel ska rivas? |
| 41 | Ändra marknivå | Bygga och ändra | Hur mycket ändras marknivån och hur hanteras vattenavrinning? |
| 42 | Bygga mur eller plank | Bygga och ändra | Beskriv höjd, genomsiktlighet och placering vid gräns eller gata. |
| 43 | Sätta upp fast skylt | Bygga och ändra | Beskriv skyltens storlek, belysning och placering. |
| 44 | Bygga växthus | Bygga och ändra | Hur stort och högt är växthuset och var placeras det? |
| 45 | Beställa nybyggnadskarta | Bygga och ändra | Vilken åtgärd ska kartan användas till? |
| 46 | Arrangera festival | Evenemang | Beskriv scener, aktiviteter, öppettider och publikflöden. |
| 47 | Arrangera konsert | Evenemang | Beskriv scen, ljudanläggning och publikens placering. |
| 48 | Arrangera marknad | Evenemang | Vad ska säljas och hur placeras försäljningsplatserna? |
| 49 | Arrangera loppis | Evenemang | Beskriv antal försäljare och hur besökarna rör sig. |
| 50 | Arrangera motionslopp | Evenemang | Beskriv sträckningen och hur vägar eller gångbanor berörs. |
| 51 | Arrangera demonstration | Evenemang | Beskriv samlingsplats, färdväg och planerade tider. |
| 52 | Arrangera parad | Evenemang | Beskriv färdväg, fordon och hur trafiken påverkas. |
| 53 | Arrangera idrottsevenemang | Evenemang | Vilken idrott och vilka publik- och deltagarytor planeras? |
| 54 | Arrangera utställning | Evenemang | Vad visas och hur ordnas tillträde och säkerhet? |
| 55 | Arrangera evenemang | Evenemang | Vilken aktivitet ska genomföras och för vilka besökare? |
| 56 | Anordna uteservering | Offentlig plats | Beskriv möblering, fria gångytor och serveringens avgränsning. |
| 57 | Placera container | Offentlig plats | Vad används containern till och hur påverkas gång- och körbanor? |
| 58 | Placera byggställning | Offentlig plats | Beskriv ställningens utbredning och skydd för förbipasserande. |
| 59 | Placera gatupratare | Offentlig plats | Beskriv placering och hur mycket fri gångyta som återstår. |
| 60 | Ordna försäljningsstånd | Offentlig plats | Vad ska säljas och vilken utrustning ska stå på platsen? |
| 61 | Spela in film på offentlig plats | Offentlig plats | Beskriv inspelning, utrustning och behov av avspärrningar. |
| 62 | Placera tillfällig installation | Offentlig plats | Beskriv installationens material, förankring och publikåtkomst. |
| 63 | Ordna informationskampanj på plats | Offentlig plats | Beskriv bord, material och hur förbipasserande påverkas. |
| 64 | Förvara byggmaterial på gata | Offentlig plats | Vilket material lagras och hur säkras framkomligheten? |
| 65 | Ordna mobil försäljning | Offentlig plats | Vilka varor säljs, med vilken utrustning och på vilka platser? |
| 66 | Installera värmepump | Miljö | Vilken värmepump och eventuell borrning eller markledning planeras? |
| 67 | Anlägga enskilt avlopp | Miljö | Beskriv avloppslösning, belastning och möjlig utsläppspunkt. |
| 68 | Ändra avloppsanläggning | Miljö | Vad ändras i den befintliga avloppsanläggningen? |
| 69 | Installera eller avveckla cistern | Miljö | Gäller åtgärden installation, ändring eller avveckling och vilket innehåll? |
| 70 | Anmäla bullerstörning | Miljö | Beskriv bullerkällan, tiderna och var störningen märks. |
| 71 | Anmäla luktstörning | Miljö | Beskriv luktens källa, karaktär och när den förekommer. |
| 72 | Anmäla nedskräpning | Miljö | Beskriv avfallet, mängden och platsens åtkomlighet. |
| 73 | Fråga om farligt avfall | Miljö | Vilket avfall gäller frågan och kommer det från hushåll eller verksamhet? |
| 74 | Fråga om verksamhetsavfall | Miljö | Vilka avfallsslag och ungefärliga mängder uppstår? |
| 75 | Förbereda miljöfråga för verksamhet | Miljö | Beskriv verksamheten, processer och möjliga utsläpp eller störningar. |
| 76 | Ansluta fastighet till VA | Vatten och avfall | Vilka anslutningar behövs och finns en befintlig förbindelsepunkt? |
| 77 | Ändra VA-anslutning | Vatten och avfall | Vad ska ändras i den befintliga anslutningen? |
| 78 | Fråga om vattenmätare | Vatten och avfall | Gäller frågan placering, byte eller avläsning av mätaren? |
| 79 | Rapportera misstänkt vattenläcka | Vatten och avfall | Var märks läckan och gäller den gatan eller den egna fastigheten? |
| 80 | Fråga om dricksvattenkvalitet | Vatten och avfall | Beskriv vad som förändrats och om fler tappställen är berörda. |
| 81 | Fråga om dagvatten | Vatten och avfall | Beskriv hur regnvatten avleds och vilket problem som uppstår. |
| 82 | Ändra avfallsabonnemang | Vatten och avfall | Vilken ändring av kärl eller hämtning önskas? |
| 83 | Rapportera utebliven sophämtning | Vatten och avfall | Vilket kärl lämnades och vilken hämtningsdag gäller det? |
| 84 | Byta avfallskärl | Vatten och avfall | Är kärlet skadat eller önskas annan storlek? |
| 85 | Fråga om hemkompostering | Vatten och avfall | Vad ska komposteras och vilken behållare och placering planeras? |
| 86 | Gräva i kommunal mark | Gata och trafik | Beskriv schaktets sträckning, syfte och återställning. |
| 87 | Förbereda trafikanordningsplan | Gata och trafik | Beskriv arbete, avstängning och hur gående och cyklister passerar. |
| 88 | Fråga om transportdispens | Gata och trafik | Beskriv transportens mått, vikt och önskad färdväg. |
| 89 | Felanmäl gatubelysning | Gata och trafik | Beskriv felet och ange stolpnummer om det finns. |
| 90 | Felanmäl skadad gata | Gata och trafik | Beskriv skadan och hur trafikanter påverkas. |
| 91 | Felanmäl gång- eller cykelbana | Gata och trafik | Beskriv hindret eller skadan och den exakta platsen. |
| 92 | Fråga om bidrag till enskild väg | Gata och trafik | Beskriv vägen, användningen och det stöd som efterfrågas. |
| 93 | Planera grundläggande vuxenstudier | Studier och skolresor | Vilka ämnen och vilken studieomfattning är aktuella? |
| 94 | Planera yrkesutbildning för vuxna | Studier och skolresor | Vilken yrkesinriktning och önskad studieform gäller frågan? |
| 95 | Boka studie- och yrkesvägledning | Studier och skolresor | Vilken utbildnings- eller yrkesfråga vill du få vägledning om? |
| 96 | Förbereda fråga om skolskjuts | Studier och skolresor | Vilken sträcka och praktisk förutsättning behöver bedömas? |
| 97 | Registrera föreningsintresse | Förening och kultur | Beskriv föreningens ändamål och vilken kommunal kontakt som behövs. |
| 98 | Boka idrottsanläggning | Förening och kultur | Vilken aktivitet, lokaltyp och tider behövs? |
| 99 | Förbereda fråga om föreningsbidrag | Förening och kultur | Vilken verksamhet eller aktivitet ska stödet avse? |
| 100 | Förbereda fråga om kulturstöd | Förening och kultur | Beskriv kulturaktiviteten, målgruppen och användningen av stödet. |
| 101 | Ansöka om förskoleplats | Barn och utbildning | Önskad start, förskola och barnets ålder. |
| 102 | Ansöka om skolplats | Barn och utbildning | Önskad start, skola och årskurs/skolform. |
