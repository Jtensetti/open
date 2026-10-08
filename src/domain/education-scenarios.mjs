import { MUNICIPALITIES } from "./municipality-data.mjs";
import { NATIONAL_AUTHORITIES } from "./national-scenarios.mjs";
const field = (label, question, priority, required = true) => ({
  label,
  question,
  priority,
  required,
  type: "text",
  min: 2,
  max: 160,
});
export const EDUCATION_SCENARIOS = [
  [
    "preschool",
    "Ansöka om förskoleplats",
    "förskoleplats",
    "Vilken förskola önskar du?",
    "Önskad förskola",
    "forskolan/om-forskolan",
    "Jag vill söka dagisplats i Uppsala till hösten 2027. Barnet är 3 år.",
  ],
  [
    "school",
    "Ansöka om skolplats",
    "skolplats",
    "Vilken skola önskar du?",
    "Önskad skola",
    "grundskolan/valja-grundskola/ansokan-och-antagning-till-grundskolan",
    "Jag vill ansöka om skolplats i Uppsala till hösten 2027. Det gäller årskurs 1.",
  ],
].map(([slug, title, alias, question, label, path, example]) => {
  const fields = {
    municipality: {
      label: "Ansvarig kommun",
      question: "Vilken kommun gäller ansökan?",
      type: "enum",
      options: MUNICIPALITIES.map((m) => m.name),
      priority: 110,
      required: true,
    },
    start_period: field(
      "Önskad start",
      "När önskar du att barnet börjar?",
      100,
    ),
    preferred_school: field(label, question, 90, false),
    ...(slug === "preschool"
      ? {
          child_age: {
            label: "Barnets ålder",
            question: "Hur gammalt är barnet?",
            type: "number",
            min: 0,
            max: 18,
            unit: "år",
            priority: 95,
            required: false,
          },
        }
      : {
          school_year: field(
            "Årskurs eller skolform",
            "Vilken årskurs eller skolform gäller det?",
            95,
          ),
        }),
    citizen_note: {
      ...field("Egen anteckning", "", 1, false),
      help: "Ingår inte i handläggarens underlag.",
    },
  };
  const scope =
    "Förberedelse av önskemål om placering. Ingen ansökan skickas till kommunen och ingen rätt till plats eller antagning avgörs här.";
  return {
    id: `education.${slug}.se`,
    version: "1.0.0",
    jurisdiction: "SE",
    lifecycle: "pilot",
    reviewLevel: "preparatory",
    reviewedAt: "2026-10-08",
    family: "Barn och utbildning",
    title,
    aliases: [alias],
    scope,
    example,
    fields,
    demo: {
      municipality: "Uppsala",
      start_period: "hösten 2027",
      ...(slug === "school" ? { school_year: "Årskurs 1" } : { child_age: 3 }),
    },
    authorities: {
      "municipality.education": NATIONAL_AUTHORITIES["municipality.education"],
    },
    sources: {
      education: {
        title: "Skolverket · " + title,
        url: "https://utbildningsguiden.skolverket.se/" + path,
        checkedAt: "2026-10-08",
      },
    },
    rules: [
      {
        id: "placement_preparation",
        authority: "municipality.education",
        title,
        question:
          "Vilken lokal ansökningsprocess och vilka ytterligare uppgifter behövs för önskemålet?",
        fields: Object.keys(fields).filter((k) => k !== "citizen_note"),
        sources: ["education"],
        when: { always: true },
        kind: "preparatory_review",
        reason: "Önskemålet förbereder kontakt om placering.",
        limits: scope,
      },
    ],
  };
});
