import { municipalityByName, municipalityByCode } from "./municipalities.mjs";
import { NATIONAL_AUTHORITIES } from "./national-scenarios.mjs";
export function jurisdictionFor(scenario, facts) {
  if (scenario.jurisdiction !== "SE")
    return {
      code: scenario.jurisdiction,
      name: scenario.fields.municipality.options[0],
      resolved: true,
      localRulesVerified: false,
    };
  const f = facts.municipality,
    m = f && f.status !== "uncertain" ? municipalityByName(f.value) : null;
  return m
    ? {
        code: "SE-" + m.code,
        municipalityCode: m.code,
        name: m.name,
        resolved: true,
        localRulesVerified: false,
      }
    : { code: null, name: null, resolved: false, localRulesVerified: false };
}
export function authorityFor(role, scenario, facts) {
  if (!role.startsWith("municipality.") || scenario.jurisdiction !== "SE")
    return role;
  const j = jurisdictionFor(scenario, facts);
  return j.resolved
    ? `municipality.${j.municipalityCode}.${role.split(".")[1]}`
    : null;
}
export function authoritiesFor(scenario, facts) {
  return Object.fromEntries(
    Object.entries(scenario.authorities).flatMap(([role, info]) => {
      const id = authorityFor(role, scenario, facts);
      if (!id) return [];
      const j = jurisdictionFor(scenario, facts);
      return [
        [
          id,
          {
            ...info,
            id,
            role,
            organisation: info.localRole
              ? `${j.name} · ansvarig lokal aktör`
              : info.organisation,
            municipalityCode: info.localRole ? j.municipalityCode : null,
          },
        ],
      ];
    }),
  );
}
export function knownAuthority(id, legacy) {
  if (typeof id !== "string") return false;
  if (Object.hasOwn(legacy, id)) return true;
  const m = id.match(/^municipality\.(\d{4})\.([a-z_]+)$/);
  return !!(
    m &&
    municipalityByCode(m[1]) &&
    Object.hasOwn(NATIONAL_AUTHORITIES, "municipality." + m[2])
  );
}
