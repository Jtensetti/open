import { RESTAURANT } from "./restaurant.mjs";
import { DEFINITIONS } from "./catalog-data.mjs";
export const AUTHORITIES = {
  ...RESTAURANT.authorities,
  "trelleborg.business": {
    name: "Företagsservice",
    organisation: "Trelleborgs kommun",
    short: "FÖ",
    service: "Etableringsfrågor",
  },
  "trelleborg.environment": {
    name: "Miljöenheten",
    organisation: "Trelleborgs kommun",
    short: "MI",
    service: "Miljö och hälsoskydd",
  },
  "trelleborg.water": {
    name: "Kretslopp och vatten",
    organisation: "Trelleborgs kommun",
    short: "VA",
    service: "Vatten och avlopp",
  },
  "trelleborg.waste": {
    name: "Kretslopp och vatten",
    organisation: "Trelleborgs kommun",
    short: "AV",
    service: "Avfall",
  },
  "trelleborg.traffic": {
    name: "Gata och trafik",
    organisation: "Trelleborgs kommun",
    short: "GA",
    service: "Gatumiljö och framkomlighet",
  },
  "trelleborg.education": {
    name: "Utbildning",
    organisation: "Trelleborgs kommun",
    short: "UT",
    service: "Vuxenstudier och vägledning",
  },
  "trelleborg.schooltransport": {
    name: "Skolskjuts",
    organisation: "Trelleborgs kommun",
    short: "SK",
    service: "Resväg och förutsättningar",
  },
  "trelleborg.associations": {
    name: "Förening och kultur",
    organisation: "Trelleborgs kommun",
    short: "KU",
    service: "Aktiviteter, lokaler och stöd",
  },
};
const source = (title, url) => ({ title, url, checkedAt: "2026-10-08" });
const SOURCES = {
  ...RESTAURANT.sources,
  business: source(
    "Verksamt · Checklistor för att starta företag",
    "https://verksamt.se/bransch/checklistor",
  ),
  building: source(
    "Trelleborg · Bygga nytt, ändra eller riva",
    "https://www.trelleborg.se/bygga-bo-miljo/bygga-nytt-andra-eller-riva/",
  ),
  events: source(
    "Polisen · Anordna arrangemang",
    "https://polisen.se/tjanster-tillstand/tillstand-ansok/anordna-arrangemang/",
  ),
  environment: source(
    "Trelleborg · Bo, bygga och miljö – självbetjäning",
    "https://eservice.trelleborg.se/MenuGroup2.aspx?groupId=2",
  ),
  water: source(
    "Trelleborg · Vatten och avlopp",
    "https://www.trelleborg.se/bygga-bo-miljo/vatten-och-avlopp/",
  ),
  waste: source(
    "Trelleborg · Självbetjäning",
    "https://eservice.trelleborg.se/",
  ),
  traffic: source(
    "Trelleborg · Trafik och gator",
    "https://www.trelleborg.se/trafik-infrastruktur/trafik-och-gator-2/",
  ),
  education: source(
    "Trelleborg · Barn och utbildning – självbetjäning",
    "https://eservice.trelleborg.se/MenuGroup2.aspx?groupId=4",
  ),
  associations: source(
    "Trelleborg · Föreningsbidrag, stöd och stipendier",
    "https://www.trelleborg.se/uppleva-gora/foreningar/foreningsbidrag-stod-och-stipendier/",
  ),
  facilities: source(
    "Trelleborg · Uppleva och göra – självbetjäning",
    "https://eservice.trelleborg.se/MenuGroup2.aspx?groupId=8",
  ),
};
const textField = (label, question, priority = 70, required = true) => ({
  label,
  question,
  type: "text",
  min: 3,
  max: 160,
  priority,
  required,
  help: "Beskriv sakförhållanden. Använd testuppgifter, utan namn, personnummer eller känsliga uppgifter.",
});
const boolField = (label, question, priority, words) => ({
  label,
  question,
  type: "boolean",
  priority,
  required: true,
  parse: { words },
  help: "Svaret förbereder en fråga. Osäkerhet kräver bekräftelse och inget tillstånd avgörs automatiskt.",
});
const municipality = {
  ...RESTAURANT.fields.municipality,
  question: "Gäller ärendet Trelleborgs kommun?",
  help: "Pilotens kommunala flöden är avgränsade till Trelleborg.",
};
const address = {
  ...RESTAURANT.fields.address,
  question: "Vilken adress eller plats gäller ärendet?",
  help: "Gatuadress med nummer. Flera möjliga adresser behöver bekräftas.",
};
const date = {
  ...RESTAURANT.fields.opening_date,
  label: "Önskat datum",
  question: "Vilket datum gäller planen?",
  help: "Datumet används för planering och innebär ingen bokning eller utlovad handläggningstid.",
};
const area = {
  ...RESTAURANT.fields.outdoor_area,
  when: undefined,
  label: "Berörd yta",
  question: "Hur stor yta berörs?",
  max: 100000,
  parse: { number: "area" },
};
const publicLand = boolField(
  "Offentlig plats",
  "Berör åtgärden offentlig plats?",
  99,
  "offentlig plats|offentlig mark|allmän plats|allmän mark",
);
const tax = {
  ...RESTAURANT.fields.tax_registration_needed,
  parse: {
    words:
      "företagsregistrering|f-skatt|momsregistrering|arbetsgivarregistrering",
  },
};
const alcohol = {
  ...RESTAURANT.fields.alcohol,
  parse: { words: "alkoholservering|alkohol|vin|öl|sprit" },
};
const familyNames = {
  food: "Mat och servering",
  business: "Företag och butik",
  building: "Bygga och ändra",
  events: "Evenemang",
  publicspace: "Offentlig plats",
  environment: "Miljö",
  waterwaste: "Vatten och avfall",
  traffic: "Gata och trafik",
  education: "Studier och skolresor",
  associations: "Förening och kultur",
};
const limits =
  "Förberedande pilotunderlag. Inte en fullständig ansökan, registerkontroll eller rättslig bedömning. Behörig handläggare behöver fastställa rätt process, ansvar och kompletterande underlag. Ingen extern aktör är ansluten.";
function rule(
  id,
  authority,
  title,
  question,
  fields,
  sources,
  when = { always: true },
) {
  return {
    id,
    authority,
    title,
    question,
    fields,
    sources,
    when,
    kind: "preparatory_review",
    reason:
      "Medborgarens val och uppgifter motiverar en avgränsad mänsklig bedömning. Regeln avgör inte om tillstånd krävs.",
    limits,
  };
}
function createScenario(family, row) {
  const [slug, title, aliases, question, detailExample] = row,
    id = `${family}.${slug}.trelleborg`;
  const location =
    !["education", "associations"].includes(family) ||
    slug === "schooltransport";
  const fields = {
    municipality,
    ...(location ? { address } : {}),
    activity_details: {
      ...textField("Åtgärdens innehåll", question),
      parse: { label: "detaljer|åtgärd|beskrivning" },
    },
    citizen_note: {
      ...textField("Egen planeringsanteckning", "", 1, false),
      help: "Stannar i medborgarens ärende. Ingår aldrig i en aktörs datapaket.",
    },
  };
  const common = [
    "municipality",
    ...(location ? ["address"] : []),
    "activity_details",
  ];
  const rules = [];
  let src = [],
    demo = {
      municipality: "Trelleborg",
      ...(location ? { address: "Storgatan 12, Trelleborg" } : {}),
      activity_details: detailExample,
    };
  if (family === "food") {
    Object.assign(fields, {
      food_preparation: RESTAURANT.fields.food_preparation,
      portions: RESTAURANT.fields.portions,
      opening_date: date,
    });
    Object.assign(demo, {
      food_preparation: "Tillagning på plats",
      portions: 120,
      opening_date: "2027-05-01",
    });
    if (slug === "foodclose") {
      delete fields.food_preparation;
      delete fields.portions;
      delete demo.food_preparation;
      delete demo.portions;
      fields.opening_date = {
        ...date,
        label: "Planerat slutdatum",
        question: "När upphör verksamheten?",
      };
    }
    rules.push(
      rule(
        "food_review",
        "trelleborg.food",
        title,
        `Bedöm vilken livsmedelsprocess som är relevant för ”${title.toLowerCase()}” och om beskrivningen räcker för nästa steg.`,
        [
          ...common,
          ...(fields.food_preparation ? ["food_preparation", "portions"] : []),
          "opening_date",
        ],
        ["food"],
      ),
    );
    src = ["food"];
    if (!["foodchange", "foodclose"].includes(slug)) {
      fields.tax_registration_needed = tax;
      demo.tax_registration_needed = true;
      rules.push(
        rule(
          "tax_review",
          "skatteverket.registration",
          "Företagsregistrering",
          "Bedöm vilka registreringsuppgifter som behöver förberedas för verksamheten.",
          ["municipality", "activity_details", "tax_registration_needed"],
          ["tax"],
          { field: "tax_registration_needed", eq: true },
        ),
      );
      src.push("tax");
    }
    if (slug === "cafe") {
      fields.alcohol = alcohol;
      demo.alcohol = false;
      rules.push(
        rule(
          "alcohol_review",
          "trelleborg.alcohol",
          "Alkoholservering",
          "Bedöm vilken serveringsprocess som är relevant för det föreslagna caféet.",
          [
            "municipality",
            "address",
            "activity_details",
            "alcohol",
            "opening_date",
          ],
          ["alcohol"],
          { field: "alcohol", eq: true },
        ),
      );
      src.push("alcohol");
    }
    if (slug === "foodtruck") {
      fields.public_land = publicLand;
      demo.public_land = false;
      rules.push(
        rule(
          "site_review",
          "trelleborg.land",
          "Matvagnens plats",
          "Bedöm platsens framkomlighet och lämplighet för den mobila matverksamheten.",
          common,
          ["public_space"],
          { field: "public_land", eq: true },
        ),
      );
      src.push("public_space");
    }
  } else if (family === "business") {
    Object.assign(fields, { opening_date: date, tax_registration_needed: tax });
    Object.assign(demo, {
      opening_date: "2027-05-01",
      tax_registration_needed: true,
    });
    src = ["business", "tax"];
    const authority =
      slug === "companyregistration"
        ? "skatteverket.registration"
        : ["tattoo", "beauty"].includes(slug)
          ? "trelleborg.environment"
          : "trelleborg.business";
    rules.push(
      rule(
        "business_review",
        authority,
        title,
        `Bedöm vad som behöver klargöras för ”${title.toLowerCase()}” och vilken fortsatt process som är relevant.`,
        [...common, "opening_date"],
        ["business"],
      ),
    );
    if (slug !== "companyregistration")
      rules.push(
        rule(
          "tax_review",
          "skatteverket.registration",
          "Företagsregistrering",
          "Bedöm vilken registreringsfråga verksamheten behöver hjälp med.",
          ["municipality", "activity_details", "tax_registration_needed"],
          ["tax"],
          { field: "tax_registration_needed", eq: true },
        ),
      );
    if (!["companyregistration", "ecommerce"].includes(slug)) {
      Object.assign(fields, {
        current_use: RESTAURANT.fields.current_use,
        building_changes: {
          ...RESTAURANT.fields.building_changes,
          parse: {
            words:
              "ändra ventilation|ändra brandskydd|ändra bärande delar|bygga om lokalen",
          },
        },
        food_handling: boolField(
          "Livsmedelshantering",
          "Ska verksamheten hantera eller sälja livsmedel?",
          98,
          "livsmedel|sälja mat|hantera mat",
        ),
      });
      Object.assign(demo, {
        current_use: "Butik",
        building_changes: false,
        food_handling: false,
      });
      rules.push(
        rule(
          "building_review",
          "trelleborg.building",
          "Lokalens förändring",
          "Bedöm om den beskrivna ändringen av lokalen behöver hanteras i en byggprocess.",
          [
            "municipality",
            "address",
            "activity_details",
            "current_use",
            "building_changes",
          ],
          ["building"],
          { field: "building_changes", eq: true },
        ),
      );
      rules.push(
        rule(
          "food_review",
          "trelleborg.food",
          "Livsmedelshantering",
          "Bedöm vilken livsmedelsprocess den beskrivna hanteringen kräver.",
          common,
          ["food"],
          { field: "food_handling", eq: true },
        ),
      );
      src.push("building", "food");
    }
  } else if (family === "building") {
    fields.property_id = textField(
      "Fastighetsbeteckning",
      "Vilken fastighetsbeteckning gäller åtgärden?",
      98,
    );
    fields.heritage_protection = boolField(
      "Kända skyddsbestämmelser",
      "Känner du till om byggnaden eller platsen har skyddsbestämmelser?",
      95,
      "skyddsbestämmelser|kulturmiljöskydd",
    );
    Object.assign(demo, {
      property_id: "Exempelfastigheten 1:1",
      heritage_protection: false,
    });
    src = ["building"];
    if (
      [
        "newhouse",
        "extension",
        "garage",
        "carport",
        "outbuilding",
        "guesthouse",
        "conservatory",
        "deck",
        "balcony",
        "greenhouse",
        "changeuse",
      ].includes(slug)
    ) {
      fields.area = area;
      demo.area = 30;
    }
    rules.push(
      rule(
        "building_review",
        "trelleborg.building",
        title,
        `Bedöm förutsättningarna för ”${title.toLowerCase()}”: behöver åtgärden lov, anmälan, kartunderlag eller annan handläggning?`,
        [
          ...common,
          "property_id",
          "heritage_protection",
          ...(fields.area ? ["area"] : []),
        ],
        ["building"],
      ),
    );
  } else if (family === "events") {
    Object.assign(fields, {
      opening_date: date,
      capacity: {
        ...RESTAURANT.fields.capacity,
        max: 100000,
        label: "Deltagare samtidigt",
        question: "Hur många deltagare eller besökare samtidigt planeras?",
        unit: "personer",
      },
      public_land: publicLand,
      alcohol,
      safety_plan: textField(
        "Säkerhetsupplägg",
        "Hur ordnas säkerhet, utrymning och framkomlighet?",
        90,
      ),
    });
    Object.assign(demo, {
      opening_date: "2027-05-01",
      capacity: 100,
      public_land: true,
      alcohol: false,
      safety_plan: "Värdar, markerade utgångar och fria gångvägar",
    });
    src = ["events", "public_space", "alcohol"];
    rules.push(
      rule(
        "event_review",
        "police.public_space",
        title,
        `Bedöm om ”${title.toLowerCase()}” behöver tillstånd, anmälan eller ytterligare säkerhetsunderlag.`,
        [...common, "opening_date", "capacity", "safety_plan", "public_land"],
        ["events"],
      ),
    );
    rules.push(
      rule(
        "site_review",
        "trelleborg.land",
        "Platsens förutsättningar",
        "Bedöm om evenemangets användning av platsen fungerar med framkomlighet och övrig användning.",
        [...common, "opening_date", "capacity", "public_land"],
        ["public_space"],
        { field: "public_land", eq: true },
      ),
    );
    rules.push(
      rule(
        "alcohol_review",
        "trelleborg.alcohol",
        "Tillfällig alkoholservering",
        "Bedöm vilken serveringsprocess som är relevant för evenemanget.",
        [...common, "opening_date", "alcohol"],
        ["alcohol"],
        { field: "alcohol", eq: true },
      ),
    );
  } else if (family === "publicspace") {
    Object.assign(fields, {
      public_land: publicLand,
      area,
      opening_date: date,
      end_date: {
        ...date,
        label: "Slutdatum",
        question: "Till vilket datum behöver platsen användas?",
        parse: { label: "slutdatum" },
      },
    });
    Object.assign(demo, {
      public_land: true,
      area: 20,
      opening_date: "2027-05-01",
      end_date: "2027-05-07",
    });
    src = ["public_space"];
    rules.push(
      rule(
        "site_review",
        "trelleborg.land",
        title,
        `Bedöm platsens förutsättningar för ”${title.toLowerCase()}”, inklusive åtkomst och framkomlighet.`,
        [...common, "area", "opening_date", "end_date"],
        ["public_space"],
      ),
    );
    rules.push(
      rule(
        "public_space_review",
        "police.public_space",
        "Användning av offentlig plats",
        "Bedöm om den beskrivna platsanvändningen behöver tillstånd och vilket ytterligare underlag som behövs.",
        [...common, "public_land", "area", "opening_date", "end_date"],
        ["public_space"],
        { field: "public_land", eq: true },
      ),
    );
  } else if (family === "environment") {
    fields.origin = {
      label: "Gäller hushåll eller verksamhet",
      type: "enum",
      options: ["Hushåll", "Verksamhet"],
      priority: 90,
      required: true,
      question: "Gäller frågan ett hushåll eller en verksamhet?",
      help: "Uppgiften hjälper handläggaren att välja rätt fortsättning.",
    };
    demo.origin = "Hushåll";
    src = ["environment"];
    if (
      [
        "heatpump",
        "smallsewage",
        "sewagechange",
        "oiltank",
        "environmentalbusiness",
      ].includes(slug)
    ) {
      fields.property_id = textField(
        "Fastighetsbeteckning",
        "Vilken fastighetsbeteckning gäller åtgärden?",
        98,
      );
      demo.property_id = "Exempelfastigheten 1:1";
    }
    rules.push(
      rule(
        "environment_review",
        "trelleborg.environment",
        title,
        `Bedöm ansvar, risker och relevant nästa steg för ”${title.toLowerCase()}”.`,
        [...common, "origin", ...(fields.property_id ? ["property_id"] : [])],
        ["environment"],
      ),
    );
  } else if (family === "waterwaste") {
    const waste = [
        "wastesubscription",
        "missedcollection",
        "wastecontainer",
        "compost",
      ].includes(slug),
      actor = waste ? "trelleborg.waste" : "trelleborg.water";
    src = [waste ? "waste" : "water"];
    fields.property_id = textField(
      "Fastighetsbeteckning",
      "Vilken fastighet gäller frågan?",
      98,
    );
    demo.property_id = "Exempelfastigheten 1:1";
    if (
      [
        "waterconnection",
        "waterchange",
        "wastesubscription",
        "compost",
      ].includes(slug)
    ) {
      fields.opening_date = date;
      demo.opening_date = "2027-05-01";
    }
    rules.push(
      rule(
        "service_review",
        actor,
        title,
        `Bedöm ansvar och nästa steg för ”${title.toLowerCase()}” utifrån platsen och den beskrivna frågan.`,
        [
          ...common,
          "property_id",
          ...(fields.opening_date ? ["opening_date"] : []),
        ],
        src,
      ),
    );
  } else if (family === "traffic") {
    src = ["traffic"];
    if (["excavation", "trafficplan", "transport"].includes(slug)) {
      fields.opening_date = date;
      demo.opening_date = "2027-05-01";
      fields.traffic_impact = textField(
        "Påverkan på trafiken",
        "Hur påverkas gående, cyklister och fordon?",
        95,
      );
      demo.traffic_impact = "Gående leds på en markerad, tillgänglig passage";
    }
    rules.push(
      rule(
        "traffic_review",
        "trelleborg.traffic",
        title,
        `Bedöm väghållaransvar, framkomlighet och nästa steg för ”${title.toLowerCase()}”.`,
        [
          ...common,
          ...(fields.traffic_impact ? ["traffic_impact", "opening_date"] : []),
        ],
        ["traffic"],
      ),
    );
  } else if (family === "education") {
    src = ["education"];
    fields.opening_date = {
      ...date,
      question:
        "När vill du att studierna, vägledningen eller resan ska börja?",
    };
    demo.opening_date = "2027-08-16";
    rules.push(
      rule(
        "education_review",
        slug === "schooltransport"
          ? "trelleborg.schooltransport"
          : "trelleborg.education",
        title,
        `Bedöm vilken vägledning eller vilka ytterligare uppgifter som behövs för ”${title.toLowerCase()}”.`,
        [...common, "opening_date"],
        ["education"],
      ),
    );
  } else if (family === "associations") {
    src = [slug === "facility" ? "facilities" : "associations"];
    fields.opening_date = {
      ...date,
      question: "Vilket startdatum gäller aktiviteten eller önskemålet?",
    };
    demo.opening_date = "2027-05-01";
    rules.push(
      rule(
        "association_review",
        "trelleborg.associations",
        title,
        `Bedöm rätt kontakt, tillgänglighet eller stödprocess för ”${title.toLowerCase()}”.`,
        [...common, "opening_date"],
        src,
      ),
    );
  }
  return {
    id,
    version: "0.1.0",
    title,
    jurisdiction: "SE-1287",
    lifecycle: "pilot",
    reviewLevel: "preparatory",
    reviewedAt: "2026-10-08",
    family: familyNames[family],
    aliases,
    scope: `${title} i Trelleborg. Ett förberedande flöde för sakuppgifter och mänsklig bedömning; inga riktiga ansökningar eller personuppgifter.`,
    example: `Jag vill ${aliases[0]} i Trelleborg.${location ? " Storgatan 12." : ""} Detaljer: ${detailExample}.`,
    demo,
    sources: Object.fromEntries([...new Set(src)].map((k) => [k, SOURCES[k]])),
    authorities: Object.fromEntries(
      [...new Set(rules.map((r) => r.authority))].map((k) => [
        k,
        AUTHORITIES[k],
      ]),
    ),
    fields,
    rules,
  };
}
const restaurant = {
  ...RESTAURANT,
  family: "Mat och servering",
  reviewLevel: "detailed",
  aliases: [
    "öppna restaurang",
    "öppna en restaurang",
    "restaurang",
    "resturang",
    "pizzeria",
    "bistro",
  ],
  example:
    "Jag vill öppna en italiensk restaurang i Trelleborg för 40 gäster. Vi vill servera vin och ha uteservering.",
  demo: {
    tax_registration_needed: true,
    address: "Storgatan 12, Trelleborg",
    municipality: "Trelleborg",
    capacity: 40,
    alcohol: true,
    current_use: "Restaurang",
    building_changes: false,
    outdoor: true,
    public_land: true,
    outdoor_area: 30,
    food_preparation: "Tillagning på plats",
    portions: 120,
    opening_date: "2027-05-01",
  },
};
export const SCENARIOS = Object.freeze([
  restaurant,
  ...Object.entries(DEFINITIONS).flatMap(([family, rows]) =>
    rows.map((row) => createScenario(family, row)),
  ),
]);
export const registry = Object.freeze(
  Object.fromEntries(SCENARIOS.map((s) => [s.id, s])),
);
// Versions are explicit even before the first upgrade. Keep old entries when publishing new versions.
export const scenarioVersions = Object.freeze(
  Object.fromEntries(
    SCENARIOS.map((s) => [s.id, Object.freeze({ [s.version]: s })]),
  ),
);
export const catalogSummary = () =>
  SCENARIOS.map(({ id, version, title, family, reviewLevel, example }) => ({
    id,
    version,
    title,
    family,
    reviewLevel,
    example,
  }));
