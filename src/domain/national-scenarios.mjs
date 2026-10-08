import { MUNICIPALITIES } from "./municipality-data.mjs";
const roles = {
  food: ["Livsmedel", "LI"],
  alcohol: ["Alkoholservering", "AL"],
  building: ["Byggfrågor", "BY"],
  land: ["Offentlig plats", "MA"],
  fire: ["Brandskydd", "RÄ"],
  business: ["Företagsservice", "FÖ"],
  environment: ["Miljö och hälsoskydd", "MI"],
  water: ["Vatten och avlopp", "VA"],
  waste: ["Avfall", "AV"],
  traffic: ["Gata och trafik", "GA"],
  education: ["Utbildning och vägledning", "UT"],
  schooltransport: ["Skolresor", "SK"],
  associations: ["Förening och kultur", "KU"],
};
export const NATIONAL_AUTHORITIES = Object.fromEntries(
  Object.entries(roles).map(([key, [name, short]]) => [
    "municipality." + key,
    {
      name,
      short,
      organisation: "Ansvarig lokal aktör",
      service: name,
      localRole: true,
    },
  ]),
);
const source = (title, url) => ({ title, url, checkedAt: "2026-10-08" });
const sources = {
  tax: source(
    "Skatteverket · Starta och registrera företag",
    "https://www.skatteverket.se/foretag/drivaforetag/startaochregistrera.4.58d555751259e4d661680006123.html",
  ),
  food: source(
    "Verksamt · Restaurang, café, food truck och matservering",
    "https://verksamt.se/bransch/checklistor/restaurang-cafe-food-truck-matservering",
  ),
  business: source(
    "Verksamt · Branschchecklistor",
    "https://verksamt.se/bransch/checklistor",
  ),
  events: source(
    "Polisen · Anordna arrangemang",
    "https://polisen.se/tjanster-tillstand/tillstand-ansok/anordna-arrangemang/",
  ),
  public_space: source(
    "Polisen · Använda offentlig plats",
    "https://polisen.se/tjanster-tillstand/tillstand-ansok/offentlig-plats/",
  ),
  local: source(
    "Lokala villkor och mottagare behöver kontrolleras hos ansvarig kommun",
    "https://verksamt.se/bransch/hitta-tillstand/tillstand-anmalning-registrering",
  ),
};
export function nationalScenarios(legacy) {
  return legacy.map((old) => {
    const s = structuredClone(old);
    s.id = old.id.replace(/\.trelleborg$/, ".se");
    s.templateId = old.id;
    s.version = "1.0.0";
    s.jurisdiction = "SE";
    s.reviewLevel = "preparatory";
    s.title = s.title.replace(/ i Trelleborg$/, "");
    s.scope = `${s.title}. Kommunoberoende förberedelse av sakuppgifter. Lokala regler, mottagare och eventuella tillstånd behöver verifieras separat. Ingen automatisk rättslig prövning.`;
    s.fields.municipality = {
      label: "Ansvarig kommun",
      type: "enum",
      options: MUNICIPALITIES.map((m) => m.name),
      priority: 110,
      required: true,
      question: "Vilken kommun gäller ärendet?",
      help: "Ange ansvarig kommun. Postort och kommungräns är inte samma sak. Kommunen är ett eget faktum som du bekräftar.",
    };
    if (s.fields.address)
      s.fields.address = {
        ...s.fields.address,
        question: "Vilken adress eller plats gäller ärendet?",
        help: "Skriv gatuadress och gärna postnummer. Adressen tolkas lokalt, men kontrolleras inte mot ett adressregister.",
      };
    s.aliases = s.aliases.map((a) => a.replace(/ i Trelleborg$/, ""));
    s.example = s.example
      .replaceAll("i Trelleborg", "i Uppsala")
      .replaceAll("Storgatan 12.", "Storgatan 12, 753 20 Uppsala.");
    s.demo.municipality = "Uppsala";
    if (s.demo.address) s.demo.address = "Storgatan 12, 753 20 Uppsala";
    const actors = {};
    s.rules = s.rules.map((r) => {
      const role = r.authority.startsWith("trelleborg.")
        ? "municipality." + r.authority.split(".")[1]
        : r.authority;
      actors[role] = NATIONAL_AUTHORITIES[role] || old.authorities[r.authority];
      return {
        ...r,
        authority: role,
        kind: "preparatory_review",
        fields: [...new Set(["municipality", ...r.fields])],
        sources: [...new Set(r.sources.map((k) => (sources[k] ? k : "local")))],
        question: r.question.replaceAll("Trelleborg", "ansvarig kommun"),
        limits:
          "Förberedande sakunderlag. Ingen lokal regelprofil eller myndighetsanslutning är verifierad. Ansvarig handläggare fastställer nästa steg och vilka ytterligare uppgifter som krävs.",
      };
    });
    s.authorities = actors;
    s.sources = Object.fromEntries(
      [...new Set(s.rules.flatMap((r) => r.sources))].map((k) => [
        k,
        sources[k],
      ]),
    );
    if (s.fields.capacity)
      s.fields.capacity = {
        ...s.fields.capacity,
        max: 100000,
        help: "Ange högsta planerade antal samtidigt. Antalet avgör inte tillstånd eller godkänt personantal.",
      };
    if (!s.fields.citizen_note)
      s.fields.citizen_note = {
        label: "Egen planeringsanteckning",
        type: "text",
        min: 3,
        max: 160,
        required: false,
        priority: 1,
        help: "Ingår inte i någon aktörs datapaket.",
      };
    return s;
  });
}
