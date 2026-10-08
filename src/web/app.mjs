import {
  NATIONAL_SCENARIOS as SCENARIOS,
  registry,
  AUTHORITIES,
  DEFAULT_SCENARIO_ID,
} from "../domain/catalog.mjs";
let scenario = registry[DEFAULT_SCENARIO_ID];
import {
  authoritiesFor,
  jurisdictionFor,
} from "../domain/authority-routing.mjs";
import { diagnose, matches, validDate, scenarioFor } from "../domain/core.mjs";
import { parseIntake } from "../domain/intake-parser.mjs";
const $ = (q) => document.querySelector(q),
  escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const standalone = location.pathname === "/handlaggning";
let config,
  caseState,
  staffCursor = null,
  localFacts = {},
  parsed = parseIntake("", scenario),
  previousParsed = parsed,
  selectedAuthority,
  packets = [],
  selectedTask,
  events = [],
  tab = "json",
  editKey = null,
  goalConfirmed = false,
  scenarioSelected = false,
  saveTimer,
  busy = false,
  pendingSave = false,
  error = "",
  auditVerified = false;
const drafts = new Map();
let saveChain = Promise.resolve();
const labels = {
  prepared: "Förberedd",
  active: "Inväntar bedömning",
  waiting_info: "Komplettering behövs",
  accepted: "Underlag granskat",
  rejected: "Avstyrkt i pilot",
};
const caseLabels = {
  draft: "Utkast",
  processing: "Handläggning pågår",
  needs_information: "Uppgifter behövs",
  completed: "Bedömningarna klara",
};
const value = (key, v, spec = scenario) =>
  typeof v === "boolean"
    ? v
      ? "Ja"
      : "Nej"
    : spec.fields[key]?.type === "date" && validDate(v)
      ? new Intl.DateTimeFormat("sv-SE", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(v))
      : String(v) +
        (spec.fields[key]?.unit ? " " + scenario.fields[key].unit : "");
const clock = (t) =>
  new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(t));
function announce(text) {
  $("#toast").textContent = text;
  $("#toast").hidden = false;
  setTimeout(() => ($("#toast").hidden = true), 3800);
}
function setError(text) {
  error = text;
  $("#error-banner").hidden = !text;
  $("#error-banner").innerHTML = text
    ? `${escape(text)} <button class="text-button" id="retry-save">Läs in senaste version</button>`
    : "";
}
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data.error?.message || "Åtgärden misslyckades.");
    e.status = r.status;
    e.code = data.error?.code;
    throw e;
  }
  return data;
}
async function run(fn) {
  try {
    await fn();
    setError("");
  } catch (e) {
    setError(e.message);
    $("#save-status").textContent = "Kunde inte spara";
  }
}
function rawKey() {
  return "oppna.raw." + caseState.id;
}
function readRaw() {
  try {
    return sessionStorage.getItem(rawKey()) || "";
  } catch {
    return "";
  }
}
function storeRaw(text) {
  try {
    sessionStorage.setItem(rawKey(), text);
  } catch {}
}
function inputStatus() {
  return parsed.unsupported.length
    ? "unsupported"
    : !parsed.goal ||
        (parsed.uncertain.some((x) => x.key === "goal") && !goalConfirmed)
      ? "uncertain"
      : "supported";
}
function factSnapshot() {
  return structuredClone(localFacts);
}
async function loadCase(id, resetDraft = true) {
  const data = await api("/api/cases/" + id);
  caseState = data.case;
  scenario = scenarioFor(caseState.scenarioId, caseState.scenarioVersion);
  scenarioSelected =
    caseState.inputStatus === "supported" ||
    scenario.id !== DEFAULT_SCENARIO_ID;
  renderScenarioHeader();
  if (resetDraft) {
    localFacts = structuredClone(caseState.facts);
    let text = readRaw();
    if (
      !text &&
      Object.keys(localFacts).length &&
      caseState.inputStatus === "supported"
    )
      text = scenario.example;
    $("#intent").value = text;
    parsed = parseIntake(text, scenario, { goalSelected: scenarioSelected });
    previousParsed = parsed;
    goalConfirmed = caseState.inputStatus === "supported";
  }
  await loadCaseOptions();
  await loadEvents();
  await loadPackets();
  render();
}
async function loadCaseOptions() {
  const data = await api("/api/cases");
  $("#case-select").innerHTML = data.cases
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === caseState?.id ? "selected" : ""}>${escape(s.address || s.title || "Nytt ärende")} · ${escape(caseLabels[s.status])}</option>`,
    )
    .join("");
}
async function loadEvents() {
  if (!caseState) return;
  const data = await api(`/api/cases/${caseState.id}/events`);
  events = data.events;
  auditVerified = data.verified;
}
async function loadPackets() {
  if (!caseState?.tasks.length) {
    packets = [];
    return;
  }
  const authorities = [...new Set(caseState.tasks.map((t) => t.authority))];
  let remembered;
  try {
    remembered = sessionStorage.getItem("oppna.authority." + caseState.id);
  } catch {}
  if (!authorities.includes(selectedAuthority))
    selectedAuthority = authorities.includes(remembered)
      ? remembered
      : authorities[0];
  try {
    sessionStorage.setItem(
      "oppna.authority." + caseState.id,
      selectedAuthority,
    );
  } catch {}
  if (config.pilotEnabled)
    await api(`/api/cases/${caseState.id}/pilot-session`, {
      method: "POST",
      body: { authority: selectedAuthority },
    });
  try {
    const data = await api("/api/staff/tasks");
    packets = data.tasks.filter((p) => p.caseId === caseState.id);
    if (!packets.some((p) => p.taskId === selectedTask))
      selectedTask = packets[0]?.taskId;
  } catch (e) {
    if (e.status === 401) packets = [];
    else throw e;
  }
}
async function command(command) {
  const id = crypto.randomUUID();
  const payload = {
    commandId: id,
    expectedRevision: caseState.revision,
    command,
  };
  const response = await api(`/api/cases/${caseState.id}/commands`, {
    method: "POST",
    body: payload,
  });
  caseState = response.case;
  if (
    scenario.id !== caseState.scenarioId ||
    scenario.version !== caseState.scenarioVersion
  ) {
    scenario = scenarioFor(caseState.scenarioId, caseState.scenarioVersion);
    localFacts = structuredClone(caseState.facts);
    parsed = parseIntake($("#intent").value, scenario, { goalSelected: true });
    previousParsed = parsed;
    renderScenarioHeader();
  }
  await Promise.all([loadEvents(), loadPackets()]);
  render();
  return response;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  pendingSave = true;
  $("#save-status").textContent = "Osparade ändringar";
  saveTimer = setTimeout(() => run(saveFacts), 500);
}
async function saveFacts() {
  clearTimeout(saveTimer);
  if (!caseState) return;
  const snapshot = factSnapshot(),
    status = inputStatus(),
    reasons = [
      ...parsed.unsupported,
      ...parsed.uncertain.filter((x) => x.key === "goal").map((x) => x.message),
    ];
  pendingSave = false;
  const task = async () => {
    busy = true;
    $("#save-status").textContent = "Sparar…";
    try {
      await command({
        type: "replace_facts",
        facts: snapshot,
        inputStatus: status,
        inputReasons: reasons,
      });
      $("#save-status").textContent = "Sparat";
      await loadCaseOptions();
    } catch (e) {
      pendingSave = true;
      throw e;
    } finally {
      busy = false;
    }
  };
  saveChain = saveChain.catch(() => {}).then(task);
  await saveChain;
}
function parseInput() {
  const text = $("#intent").value;
  const next = parseIntake(text, scenario, { goalSelected: scenarioSelected });
  for (const k of new Set([
    ...Object.keys(previousParsed.facts),
    ...Object.keys(next.facts),
  ])) {
    const before = JSON.stringify(previousParsed.facts[k]),
      after = JSON.stringify(next.facts[k]);
    if (before !== after) {
      if (next.facts[k]) localFacts[k] = next.facts[k];
      else delete localFacts[k];
    }
  }
  if (
    previousParsed.goal !== next.goal ||
    previousParsed.uncertain.some((x) => x.key === "goal") !==
      next.uncertain.some((x) => x.key === "goal")
  )
    goalConfirmed = false;
  parsed = next;
  previousParsed = next;
  editKey = null;
  storeRaw(text);
  renderCitizen();
  scheduleSave();
}
function questionMarkup() {
  const diagnosis = diagnose(scenario, localFacts),
    scope = inputStatus();
  if (parsed.suggestedScenario)
    return `<div class="question-box uncertain"><div class="question-label">En annan ärendetyp passar bättre</div><h3>${escape(registry[parsed.suggestedScenario].title)}</h3><p>Välj ärendetypen för att få rätt följdfrågor. ${caseState?.submitted ? "Ett separat ärende skapas; ditt startade ärende finns kvar." : "Utkastets tidigare uppgifter ersätts av fakta för det nya målet."}</p><button class="primary" data-select-scenario="${parsed.suggestedScenario}">Välj denna ärendetyp</button></div>`;
  if (scope === "unsupported")
    return `<div class="question-box stopped"><div class="question-label">Automatiseringen stoppas</div><h3>Det här behöver bedömas separat.</h3><p>${escape(parsed.unsupported[0])}</p><p>Välj ett avgränsat mål i katalogen. Inga uppgifter skickas till en extern myndighet.</p></div>`;
  if (scope === "uncertain" && parsed.goal && !goalConfirmed)
    return `<div class="question-box uncertain"><div class="question-label">Bekräfta målet</div><h3>Är ditt mål: ${escape(scenario.title.toLowerCase())}?</h3><p>Texten är inte entydig. Vi går inte vidare utan ditt besked.</p><button class="primary" data-confirm-goal>Ja, det är mitt mål</button></div>`;
  if (!parsed.goal)
    return `<div class="question-box"><div class="question-label">Ditt första steg</div><h3>Beskriv ditt mål eller välj en ärendetyp.</h3><p>Berätta vad du vill göra och var. Katalogen innehåller 100 pilotflöden. Skriv inte personnummer eller andra känsliga uppgifter.</p></div>`;
  const q = editKey
    ? { key: editKey, ...scenario.fields[editKey], kind: "edit" }
    : diagnosis.questions[0];
  if (q) {
    const current = drafts.has("field." + q.key)
      ? drafts.get("field." + q.key)
      : q.kind === "edit"
        ? (localFacts[q.key]?.value ?? "")
        : "";
    let control;
    if (q.type === "boolean")
      control = `<div class="choice-row"><button class="choice" data-bool-key="${q.key}" data-bool="true">Ja</button><button class="choice" data-bool-key="${q.key}" data-bool="false">Nej</button><button class="text-button" data-unsure="${q.key}">Vet inte</button></div>`;
    else {
      let field =
        q.type === "enum"
          ? `<select id="answer" name="answer" class="field" data-draft="field.${q.key}" required aria-label="${escape(q.question)}"><option value="">Välj…</option>${q.options.map((v) => `<option ${v === current ? "selected" : ""}>${escape(v)}</option>`).join("")}</select>`
          : `<input id="answer" name="answer" class="field" data-draft="field.${q.key}" type="${q.type === "number" ? "number" : q.type === "date" ? "date" : "text"}" value="${escape(current)}" ${q.type === "number" ? `min="${q.min}" max="${q.max}" step="1"` : `maxlength="${q.max || 160}"`} placeholder="${escape(q.placeholder || "")}" required aria-label="${escape(q.question)}">`;
      control = `<form data-answer-form="${q.key}" class="answer-form">${field}<button class="primary" type="submit">Bekräfta</button></form>`;
    }
    return `<div class="question-box ${q.kind === "uncertain" ? "uncertain" : ""}"><div class="question-label">${q.kind === "uncertain" ? "Bekräfta tolkningen" : q.kind === "edit" ? "Ändra uppgift" : "Nästa fråga"}<span>${diagnosis.questions.length} kvar</span></div><h3>${escape(q.question)}</h3>${q.kind === "uncertain" ? `<blockquote>”${escape(localFacts[q.key]?.source)}”</blockquote>` : ""}<p>${escape(q.help)}</p>${control}${editKey ? '<button class="text-button cancel-edit" data-cancel-edit>Avbryt ändring</button>' : ""}</div>`;
  }
  if (!caseState?.submitted)
    return `<div class="question-box ready"><div class="question-label">Redo att starta piloten</div><h3>Kontrollera uppgifterna nedan.</h3><p>${escape(scenario.scope)} Underlagen sparas i ÖPPNA.</p><label class="confirm-scope"><input type="checkbox" id="confirm-scope"> Uppgifterna stämmer och jag använder testuppgifter.</label><button class="primary" data-submit-case>Starta pilotärende</button></div>`;
  const requests = caseState.tasks.filter((t) => t.status === "waiting_info");
  if (requests.length)
    return requests
      .map(
        (t) =>
          `<div class="question-box uncertain"><div class="question-label">${escape(authoritiesFor(scenario, caseState.facts)[t.authority].name)}</div><h3>En komplettering behövs.</h3><p>${escape(t.request.question)}</p><form data-response-form="${t.id}" data-task-revision="${t.revision}"><label class="sr-only" for="response-${t.key}">Ditt svar</label><textarea id="response-${t.key}" data-draft="response.${t.id}" class="field" name="answer" required minlength="3" maxlength="1500" placeholder="Skriv ditt svar…">${escape(drafts.get("response." + t.id) || "")}</textarea><button class="primary" type="submit">Lämna komplettering</button></form></div>`,
      )
      .join("");
  return `<div class="question-box ready"><div class="question-label">${escape(caseLabels[caseState.status])}</div><h3>${caseState.status === "completed" ? "Alla uppgifter har fått en bedömning." : "Ärendet är igång."}</h3><p>${caseState.status === "completed" ? "Bedömningarna finns i historiken. De är pilotbedömningar och inga verkliga tillstånd." : "Prova handläggarvyn till höger. Kompletteringar från handläggarna visas här."}</p></div>`;
}
function renderCitizen() {
  if (!caseState || standalone) return;
  renderScenarioHeader();
  $("#count").textContent = `${$("#intent").value.length} / 3 000`;
  $("#question").innerHTML = questionMarkup();
  const d = diagnose(scenario, localFacts);
  const active = Object.entries(scenario.fields).filter(
    ([k, def]) =>
      localFacts[k] ||
      k === "citizen_note" ||
      (def.required && (!def.when || matches(def.when, localFacts))),
  );
  $("#facts").innerHTML =
    `<div class="facts-heading"><h3>Det här har vi förstått</h3><span>${d.completeCount} / ${d.requiredCount} klara</span></div><div class="progress"><i style="width:${(d.completeCount / Math.max(1, d.requiredCount)) * 100}%"></i></div>${parsed.corrections.length ? `<p class="correction">${parsed.corrections.map((c) => `”${escape(c.from)}” tolkades som ”${escape(c.to)}”`).join(" · ")}</p>` : ""}${active
      .map(([key, def]) => {
        const f = localFacts[key];
        return `<details class="fact-row"><summary><span class="fact-icon ${!f ? "missing" : f.status === "uncertain" ? "uncertain" : ""}">${!f ? "?" : f.status === "uncertain" ? "!" : "✓"}</span><span>${def.label}</span><strong class="${!f ? "missing-value" : ""}">${f ? escape(value(key, f.value)) : def.required ? "Saknas" : "Valfri"}</strong><small>${f ? Math.round(f.confidence * 100) + "%" : "–"}</small></summary><div class="provenance">${f ? `<p><b>Källa:</b> ”${escape(f.source)}”</p><p><b>Metod:</b> ${escape(f.method)} · ${f.status === "confirmed" ? "Bekräftat av dig" : f.status === "uncertain" ? "Osäkert" : "Tolkat, inte verifierat"}</p>${f.updatedAt ? `<p>${clock(f.updatedAt)}</p>` : ""}` : `<p>${escape(def.required ? "Uppgiften behövs innan handläggningen kan starta." : def.help)}</p>`}<button class="text-button" data-edit="${key}">${f ? "Ändra eller bekräfta" : "Ange uppgift"}</button></div></details>`;
      })
      .join(
        "",
      )}<p class="small-caption">Öppna en rad för spårbarhet. Procenten är ett heuristiskt regelvärde.</p>`;
}
function renderTracking() {
  const s = caseState,
    done = s.tasks.filter((t) =>
      ["accepted", "rejected"].includes(t.status),
    ).length;
  $("#tracking").innerHTML =
    `<div class="tracking-head"><h2>Följ ärende</h2><span class="badge ${s.status === "completed" ? "accepted" : ""}">${caseLabels[s.status]}</span></div><ol class="timeline"><li class="done"><i>✓</i><div><b>Ditt mål är registrerat</b><p>${escape(scenario.title)} · scenario v${s.scenarioVersion}</p></div></li><li class="${s.diagnosis.ready ? "done" : "current"}"><i>${s.diagnosis.ready ? "✓" : ""}</i><div><b>Uppgifter och förutsättningar</b><p>${s.diagnosis.ready ? "Nödvändiga uppgifter är angivna." : `${s.diagnosis.missing.length + s.diagnosis.uncertain.length} uppgifter behöver anges eller bekräftas.`}</p></div></li><li class="${s.status === "completed" ? "done" : s.submitted ? "current" : ""}"><i>${s.status === "completed" ? "✓" : ""}</i><div><b>Parallell handläggning i piloten</b><p>${s.submitted ? `${done} av ${s.tasks.length} uppgifter har fått en bedömning.` : "Rätt fråga förbereds för varje berörd aktör."}</p><div class="task-chips">${s.tasks.map((t) => `<span class="badge ${t.status}">${escape(authoritiesFor(scenario, caseState.facts)[t.authority].name)} ${t.status === "accepted" ? "✓" : t.status === "rejected" ? "×" : ""}</span>`).join("")}</div></div></li><li class="${s.status === "completed" ? "done" : ""}"><i>${s.status === "completed" ? "✓" : ""}</i><div><b>Samlat besked</b><p>${s.status === "completed" ? "Bedömningarna är avslutade. Se respektive aktörs utfall." : "Du ser varje bedömning och komplettering här."}</p></div></li></ol><div class="integration-notice"><b>Myndighetsanslutningar väntar</b><span>Strukturerade underlag finns i ÖPPNA. Inget har skickats till externa myndigheter.</span></div>`;
}
function highlight(o) {
  return escape(JSON.stringify(o, null, 2)).replace(
    /(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null|\d+(?:\.\d+)?)\b/g,
    (m, s, k, n) =>
      s
        ? `<span class="${k ? "json-key" : "json-string"}">${s}</span>${k || ""}`
        : `<span class="json-number">${n}</span>`,
  );
}
function renderSystem() {
  if (!caseState) return;
  $("#case-ref").textContent = "case / " + caseState.id.slice(0, 8);
  $("#system-revision").textContent =
    `revision ${caseState.revision} · ${events.length} events`;
  document.querySelectorAll("[data-system-tab]").forEach((b) => {
    const active = b.dataset.systemTab === tab;
    b.setAttribute("aria-selected", String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $("#system-content").setAttribute(
    "aria-labelledby",
    tab === "json" ? "json-tab" : "events-tab",
  );
  if (tab === "events") {
    $("#system-content").innerHTML =
      `<div class="events"><div class="audit-status">${auditVerified ? "✓ Händelsekedjan är verifierad" : "Kontrollerar händelsekedjan…"}</div>${[
        ...events,
      ]
        .reverse()
        .map(
          (e) =>
            `<details class="event"><summary><time>${clock(e.at)}</time><span>${escape(e.type)}<small>#${e.sequence} · ${escape(e.actor.authority || e.actor.role)}</small></span></summary><pre>${escape(JSON.stringify(e.data, null, 2))}</pre><small class="event-hash">SHA-256 ${e.hash.slice(0, 18)}…</small></details>`,
        )
        .join("")}</div>`;
    return;
  }
  const s = caseState;
  $("#system-content").innerHTML =
    `<div class="graph-code"><div class="tree"><b>◉ case</b><div><strong>goal</strong><span>${escape(s.scenarioId)}</span></div><div><strong>facts <em>${Object.keys(s.facts).length}</em></strong>${Object.entries(
      s.facts,
    )
      .map(
        ([k, f]) =>
          `<span>${escape(k)} <i>${escape(JSON.stringify(f.value))}</i></span>`,
      )
      .join(
        "",
      )}</div><div><strong>missing</strong>${s.diagnosis.missing.map((k) => `<span class="amber">${k}</span>`).join("") || '<span class="dim">[ ]</span>'}</div><div><strong>uncertain</strong>${s.diagnosis.uncertain.map((k) => `<span class="amber">${k}</span>`).join("") || '<span class="dim">[ ]</span>'}</div><div><strong>parallel_tasks</strong>${s.tasks.map((t) => `<span>${escape(t.key)} <i>${escape(t.status)}</i></span>`).join("")}</div></div><pre class="code" tabindex="0" aria-label="Ärendets JSON">${highlight({ case_id: s.id, scenario: s.scenarioId, scenario_version: s.scenarioVersion, revision: s.revision, input_status: s.inputStatus, facts: s.facts, missing: s.diagnosis.missing, uncertain: s.diagnosis.uncertain, derived: s.tasks.map((t) => ({ task: t.key, authority: t.authority, status: t.status, revision: t.revision })), integration: "not_connected" })}</pre></div>`;
}
function workCard(packet) {
  if (!packet)
    return '<div class="empty-state">Ingen handläggaruppgift är vald.</div>';
  const spec = scenarioFor(packet.scenarioId, packet.scenarioVersion);
  const enabled =
    packet.status === "active" && caseState?.diagnosis?.ready !== false;
  return `<article class="work-card"><div class="work-top"><span>${escape((packet.authorityInfo || spec.authorities[packet.authority]).organisation)}</span><span class="badge ${packet.status}">${labels[packet.status]}</span></div><div class="work-inner"><h3>${escape(packet.title)}</h3><p class="judgement">${escape(packet.question)}</p><p class="packet-size">Endast relevant underlag · ${Object.keys(packet.facts).length} uppgifter · v${packet.taskRevision}</p><table><caption class="sr-only">Underlag för handläggarens fråga</caption><tbody>${Object.entries(
    packet.facts,
  )
    .map(
      ([k, f]) =>
        `<tr><th scope="row">${spec.fields[k].label}</th><td>${escape(value(k, f.value, spec))}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table>${packet.response ? `<div class="response"><b>Komplettering från medborgaren</b><p>${escape(packet.response.answer)}</p></div>` : ""}${packet.decision ? `<div class="decision ${packet.status}"><b>${labels[packet.status]}</b><p>${escape(packet.decision.note)}</p><small>${clock(packet.decision.at)}</small></div>` : packet.request ? `<div class="response waiting"><b>Inväntar komplettering</b><p>${escape(packet.request.question)}</p></div>` : `${!enabled ? '<p class="waiting-note">Ärendet behöver startas och uppgifterna vara kompletta innan en bedömning kan registreras.</p>' : ""}<label class="note-label" for="assessment-note">Motivering eller kompletteringsfråga</label><textarea class="field" id="assessment-note" data-draft="note.${packet.taskId}" minlength="5" maxlength="1500" ${!enabled ? "disabled" : ""} placeholder="Beskriv din bedömning eller ställ en konkret fråga…">${escape(drafts.get("note." + packet.taskId) || "")}</textarea><div class="decision-actions"><button class="secondary" data-outcome="request" ${!enabled ? "disabled" : ""}>Begär komplettering</button><button class="primary" data-outcome="accepted" ${!enabled ? "disabled" : ""}>Underlag klart</button><button class="danger" data-outcome="rejected" ${!enabled ? "disabled" : ""}>Avstyrk</button></div>`}<details class="work-details"><summary>Regel, källa och avgränsning</summary><p>${escape(packet.reason)}</p><p>${escape(packet.limitations)}</p>${packet.sources.map((x) => `<a href="${escape(x.url)}" target="_blank" rel="noreferrer">${escape(x.title)}</a>`).join("")}</details><details class="work-details"><summary>Visa aktörens exakta datapaket</summary><pre>${escape(JSON.stringify(packet, null, 2))}</pre></details></div></article>`;
}
function renderAuthority() {
  if (standalone) {
    renderStandalone();
    return;
  }
  if (!caseState?.tasks.length) {
    $("#authority").innerHTML =
      '<div class="empty-state"><b>Handläggarfrågorna förbereds här.</b><p>Välj ett mål så visar regelmotorn vilka frågor och aktörer som kan behövas.</p></div>';
    return;
  }
  const authorities = [...new Set(caseState.tasks.map((t) => t.authority))];
  const packet = packets.find((p) => p.taskId === selectedTask) || packets[0];
  $("#authority").innerHTML =
    `<nav class="authority-tabs" aria-label="Välj aktör">${authorities.map((a) => `<button data-authority="${a}" aria-pressed="${selectedAuthority === a}" class="${selectedAuthority === a ? "selected" : ""}"><span>${authoritiesFor(scenario, caseState.facts)[a].short}</span>${authoritiesFor(scenario, caseState.facts)[a].name}</button>`).join("")}</nav><div class="pilot-context">Pilotbehörighet: endast ditt eget ärende och den valda aktören.</div>${packets.length > 1 ? `<select id="task-select" class="field" aria-label="Välj handläggaruppgift">${packets.map((p) => `<option value="${p.taskId}" ${p.taskId === selectedTask ? "selected" : ""}>${escape(p.title)}</option>`).join("")}</select>` : ""}${workCard(packet)}`;
}
function renderStandalone() {
  const target = $("#staff-standalone");
  if (!packets.length) {
    if (!config.pilotEnabled) {
      target.innerHTML = config.identityProviders.staff
        ? '<p class="intro">Logga in med organisationens identitetsleverantör för att se dina tilldelade uppgifter.</p><button class="primary" data-identity-provider="staff">Logga in till handläggning</button>'
        : '<p class="intro">Handläggningen är stängd tills organisationens inloggning har konfigurerats.</p>';
      return;
    }
    target.innerHTML = `<p class="intro">Logga in med din personliga handläggarnyckel. I pilotläget kan du också öppna ditt eget testärende från företagarvyn först.</p><form id="staff-login"><label for="staff-key">Handläggarnyckel</label><input id="staff-key" name="key" class="field" type="password" autocomplete="off" required minlength="32"><button class="primary">Logga in</button></form>`;
    return;
  }
  target.innerHTML = `<p class="intro">${escape((packets[0]?.authorityInfo || AUTHORITIES[selectedAuthority])?.name)} · ${packets.length} inlästa uppgifter</p><label for="task-select" class="note-label">Välj uppgift</label><select id="task-select" class="field">${packets.map((p) => `<option value="${p.taskId}" ${p.taskId === selectedTask ? "selected" : ""}>${escape(p.title)} · ${p.caseId.slice(0, 8)}</option>`).join("")}</select>${staffCursor ? '<button class="secondary" id="staff-more">Visa fler uppgifter</button>' : ""}${workCard(packets.find((p) => p.taskId === selectedTask) || packets[0])}`;
}
function render() {
  const focused = document.activeElement?.id;
  const scopeChecked = $("#confirm-scope")?.checked;
  const el = focused ? document.getElementById(focused) : null;
  const selection = el && "selectionStart" in el ? el.selectionStart : null;
  renderCitizen();
  if (scopeChecked && $("#confirm-scope")) $("#confirm-scope").checked = true;
  if (!standalone) {
    renderTracking();
    renderSystem();
  }
  renderAuthority();
  if (focused && focused !== "intent") {
    const replacement = document.getElementById(focused);
    if (replacement) {
      replacement.focus({ preventScroll: true });
      try {
        if (selection !== null)
          replacement.setSelectionRange(selection, selection);
      } catch {}
    }
  }
}
function explicitAnswer(key, v, uncertain = false) {
  if (scenario.fields[key].type === "number") v = Number(v);
  localFacts[key] = {
    value: v,
    status: uncertain ? "uncertain" : "confirmed",
    source: uncertain
      ? "Användaren är osäker"
      : `${scenario.fields[key].label}: ${value(key, v)}`,
    sourceSpan: null,
    method: "explicit",
    confidence: uncertain ? 0.5 : 1,
  };
  drafts.delete("field." + key);
  editKey = null;
  renderCitizen();
  scheduleSave();
}
async function refreshStaff(extend = false) {
  const data = await api(
    "/api/staff/tasks" +
      (extend && staffCursor
        ? "?cursor=" + encodeURIComponent(staffCursor)
        : ""),
  );
  packets = extend
    ? [
        ...new Map(
          [...packets, ...data.tasks].map((p) => [p.taskId, p]),
        ).values(),
      ]
    : data.tasks;
  staffCursor = data.nextCursor;
  selectedAuthority = data.authority;
  if (!packets.some((p) => p.taskId === selectedTask))
    selectedTask = packets[0]?.taskId;
  renderAuthority();
}
async function assess(outcome) {
  await saveChain;
  const p = packets.find((p) => p.taskId === selectedTask) || packets[0];
  if (!p) return;
  const note = $("#assessment-note")?.value || "";
  const result = await api("/api/staff/assessment", {
    method: "POST",
    body: {
      caseId: p.caseId,
      expectedRevision: p.caseRevision,
      commandId: crypto.randomUUID(),
      command: {
        type: "assessment",
        taskId: p.taskId,
        taskRevision: p.taskRevision,
        outcome,
        note,
      },
    },
  });
  drafts.delete("note." + p.taskId);
  if (standalone) {
    await refreshStaff();
    if (!packets.some((x) => x.taskId === p.taskId))
      packets.unshift(result.packet);
    selectedTask = p.taskId;
    renderAuthority();
  } else await loadCase(caseState.id, false);
  announce(
    outcome === "request"
      ? "Kompletteringen visas nu i företagarvyn."
      : "Bedömningen har sparats.",
  );
}
document.addEventListener("input", (e) => {
  if (e.target.dataset.draft)
    drafts.set(e.target.dataset.draft, e.target.value);
});
$("#intent").addEventListener("input", parseInput);
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "staff-more") run(() => refreshStaff(true));
  if (b.dataset.selectScenario)
    run(() => selectScenario(b.dataset.selectScenario));
  if (b.dataset.boolKey)
    explicitAnswer(b.dataset.boolKey, b.dataset.bool === "true");
  if (b.dataset.unsure) {
    explicitAnswer(b.dataset.unsure, false, true);
    announce(
      "Uppgiften är markerad som osäker. Automatiken väntar på bekräftelse.",
    );
  }
  if (b.dataset.edit) {
    editKey = b.dataset.edit;
    renderCitizen();
    $("#answer")?.focus();
    $("#question").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  if (b.hasAttribute("data-cancel-edit")) {
    editKey = null;
    renderCitizen();
  }
  if (b.hasAttribute("data-confirm-goal")) {
    goalConfirmed = true;
    renderCitizen();
    scheduleSave();
  }
  if (b.dataset.authority)
    run(async () => {
      selectedAuthority = b.dataset.authority;
      await loadPackets();
      renderAuthority();
    });
  if (b.dataset.outcome) run(() => assess(b.dataset.outcome));
  if (b.dataset.systemTab) {
    tab = b.dataset.systemTab;
    renderSystem();
  }
  if (b.hasAttribute("data-submit-case"))
    run(async () => {
      if (!$("#confirm-scope")?.checked)
        throw new Error("Bekräfta uppgifterna innan du startar pilotärendet.");
      if (pendingSave) await saveFacts();
      await saveChain;
      await command({ type: "submit", confirmScope: true });
      localFacts = structuredClone(caseState.facts);
      render();
      announce(
        "Pilotärendet har startats. Uppgifterna kan handläggas parallellt.",
      );
    });
  if (b.id === "retry-save")
    run(async () => {
      if (caseState) await loadCase(caseState.id, false);
      if (pendingSave) await saveFacts();
    });
});
document.addEventListener("submit", (e) => {
  const f = e.target;
  if (f.dataset.answerForm) {
    e.preventDefault();
    explicitAnswer(f.dataset.answerForm, new FormData(f).get("answer"));
  }
  if (f.dataset.responseForm) {
    e.preventDefault();
    run(async () => {
      await saveChain;
      await command({
        type: "respond",
        taskId: f.dataset.responseForm,
        taskRevision: Number(f.dataset.taskRevision),
        answer: new FormData(f).get("answer"),
      });
      drafts.delete("response." + f.dataset.responseForm);
      announce("Kompletteringen är sparad hos rätt aktör.");
    });
  }
  if (f.id === "staff-login") {
    e.preventDefault();
    run(async () => {
      await api("/api/staff/login", {
        method: "POST",
        body: { key: new FormData(f).get("key") },
      });
      await refreshStaff();
    });
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "task-select") {
    selectedTask = e.target.value;
    renderAuthority();
  }
  if (e.target.id === "case-select") {
    const id = e.target.value;
    run(async () => {
      if (pendingSave) await saveFacts();
      await saveChain;
      await loadCase(id);
    });
  }
});
document.addEventListener("click", (e) => {
  const provider = e.target.closest("[data-identity-provider]")?.dataset
    .identityProvider;
  if (provider)
    run(async () => {
      const r = await api("/api/auth/start", {
        method: "POST",
        body: { provider },
      });
      location.assign(r.authorizationUrl);
    });
});
$("#logout").addEventListener("click", () =>
  run(async () => {
    await api("/api/logout", { method: "POST", body: {} });
    // Clear local raw text and selected actors when leaving this browser session.
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("oppna.")) sessionStorage.removeItem(key);
    location.reload();
  }),
);
$("#example").addEventListener("click", () => {
  $("#intent").value = scenario.example;
  parseInput();
});
$("#complete-example").addEventListener("click", () => {
  if (!config.pilotEnabled) return;
  if (!parsed.goal) {
    $("#intent").value = scenario.example;
    parseInput();
  }
  const sample = scenario.demo;
  for (const [k, v] of Object.entries(sample))
    if (!localFacts[k] || localFacts[k].status === "uncertain")
      localFacts[k] = {
        value: v,
        status: "confirmed",
        source: "Testuppgift vald av användaren",
        sourceSpan: null,
        method: "explicit",
        confidence: 1,
      };
  goalConfirmed = true;
  renderCitizen();
  scheduleSave();
  announce("Testuppgifter ifyllda. Kontrollera innan du startar.");
});
$("#new-case").addEventListener("click", () =>
  run(async () => {
    if (pendingSave) await saveFacts();
    await saveChain;
    const r = await api("/api/cases", {
      method: "POST",
      body: { scenarioId: scenario.id },
    });
    drafts.clear();
    editKey = null;
    await loadCase(r.case.id);
    $("#intent").focus();
  }),
);
$("#about").addEventListener("click", () => $("#about-dialog").showModal());
$("#close-about").addEventListener("click", () => $("#about-dialog").close());
document.querySelector('[role="tablist"]').addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
    e.preventDefault();
    tab =
      e.key === "Home"
        ? "json"
        : e.key === "End"
          ? "events"
          : tab === "json"
            ? "events"
            : "json";
    renderSystem();
    $("#" + (tab === "json" ? "json-tab" : "events-tab")).focus();
  }
});

function renderScenarioHeader() {
  $("#scenario-title").textContent = scenario.title;
  $("#municipality-label").textContent =
    jurisdictionFor(scenario, caseState?.facts || {}).name || "HELA SVERIGE";
  $("#scenario-version").textContent =
    scenario.reviewLevel === "detailed"
      ? `Detaljerad pilot · v${scenario.version}`
      : `Förberedande pilot · v${scenario.version}`;
  $("#intent").placeholder = scenario.example;
  $("#example").textContent =
    scenario.id === DEFAULT_SCENARIO_ID
      ? "Prova restaurangexemplet"
      : "Prova ett exempel";
  $("#scenario-scope").textContent = scenario.scope;
  $("#source-version").textContent =
    `${scenario.title} · v${scenario.version} · källkontroll 8 oktober 2026. Automatiken föreslår frågor; rättsliga bedömningar kräver ansvarig handläggare.`;
  $("#source-links").innerHTML = Object.values(scenario.sources)
    .map(
      (s) =>
        `<a href="${escape(s.url)}" target="_blank" rel="noreferrer">${escape(s.title)}</a>`,
    )
    .join("");
}
function renderCatalog() {
  const query = $("#scenario-search")
    .value.toLocaleLowerCase("sv-SE")
    .normalize("NFC")
    .trim();
  const family = $("#scenario-family").value;
  const found = SCENARIOS.filter(
    (s) =>
      (!family || s.family === family) &&
      (!query ||
        [s.title, s.family, ...s.aliases]
          .join(" ")
          .toLocaleLowerCase("sv-SE")
          .includes(query)),
  );
  $("#catalog-count").textContent =
    `${found.length} av ${SCENARIOS.length} ärendetyper`;
  $("#scenario-results").innerHTML = found.length
    ? found
        .map(
          (s) =>
            `<button class="scenario-card ${s.id === scenario.id ? "current-scenario" : ""}" data-select-scenario="${s.id}"><span>${escape(s.family)}</span><strong>${escape(s.title)}</strong><small>${s.reviewLevel === "detailed" ? "Detaljerat pilotflöde" : "Förberedande frågor och mänsklig bedömning"}</small></button>`,
        )
        .join("")
    : '<p class="empty-state">Ingen ärendetyp matchar. Prova ett annat ord. Okända mål automatiseras inte.</p>';
}
async function selectScenario(id) {
  if (!registry[id]) return;
  const text = $("#intent").value;
  if (pendingSave) await saveFacts();
  await saveChain;
  if (caseState.submitted) {
    const r = await api("/api/cases", {
      method: "POST",
      body: { scenarioId: id },
    });
    await loadCase(r.case.id);
  } else {
    await command({ type: "select_scenario", scenarioId: id });
    await loadCase(caseState.id);
  }
  drafts.clear();
  editKey = null;
  scenarioSelected = true;
  goalConfirmed = true;
  $("#intent").value = text;
  storeRaw(text);
  // If the old text clearly describes another goal, start from the new example.
  const check = parseIntake(text, scenario, { goalSelected: true });
  if (check.suggestedScenario || check.unsupported.length)
    $("#intent").value = scenario.example;
  previousParsed = { facts: {}, goal: null, uncertain: [] };
  parseInput();
  $("#catalog-dialog").close();
  await saveFacts();
  $("#intent").focus();
  announce(`${scenario.title} är valt.`);
}
$("#open-catalog").addEventListener("click", () => {
  renderCatalog();
  $("#catalog-dialog").showModal();
  $("#scenario-search").focus();
});
$("#close-catalog").addEventListener("click", () =>
  $("#catalog-dialog").close(),
);
$("#scenario-search").addEventListener("input", renderCatalog);
$("#scenario-family").innerHTML =
  '<option value="">Alla områden</option>' +
  [...new Set(SCENARIOS.map((s) => s.family))]
    .map((x) => `<option>${escape(x)}</option>`)
    .join("");
$("#scenario-family").addEventListener("change", renderCatalog);

async function boot() {
  config = await api("/api/config");
  $("#mode-label").textContent = config.pilotEnabled
    ? "PILOT · TESTÄRENDEN"
    : "HANDLÄGGNING";
  $("#complete-example").hidden = !config.pilotEnabled;
  const session = await api(
    "/api/session" + (standalone ? "?provider=staff" : ""),
  );
  $("#logout").hidden = !session.authenticated;
  if (standalone) {
    $("#citizen-workspace").hidden = true;
    $(".servicebar").hidden = true;
    $("#staff-workspace").hidden = false;
    try {
      await refreshStaff();
    } catch {
      renderStandalone();
    }
    return;
  }
  if (!config.pilotEnabled && !session.authenticated) {
    $("#citizen-workspace").hidden = true;
    $(".servicebar").hidden = true;
    $("#identity-panel").hidden = false;
    $("#identity-panel").innerHTML = config.identityProviders.citizen
      ? '<h1>Logga in till ÖPPNA</h1><p class="intro">Din verifierade identitet ger åtkomst till dina egna ärenden. Nyregistrering öppnas när ansvarig operatör har godkänt lokala processer och mottagare.</p><button class="primary" data-identity-provider="citizen">Logga in</button>'
      : '<h1>Tjänsten förbereds</h1><p class="intro">Nyregistrering är stängd tills ansvarig operatör har konfigurerat inloggning, lokala processer och mottagare.</p>';
    return;
  }
  await api("/api/session", { method: "POST", body: {} });
  const data = await api("/api/cases");
  let id = data.cases[0]?.id;
  if (!id && !config.pilotEnabled) {
    $("#citizen-workspace").hidden = true;
    $(".servicebar").hidden = true;
    $("#identity-panel").hidden = false;
    $("#identity-panel").innerHTML =
      '<h1>Dina ärenden</h1><p class="intro">Du har inga ärenden. Nyregistrering är ännu stängd.</p>';
    return;
  }
  if (!id) id = (await api("/api/cases", { method: "POST", body: {} })).case.id;
  await loadCase(id);
  $("#save-status").textContent = "Sparat";
  setInterval(() => {
    if (
      document.hidden ||
      busy ||
      pendingSave ||
      document.activeElement?.matches("input,textarea,select")
    )
      return;
    run(async () => {
      const response = await api("/api/cases/" + caseState.id);
      if (response.case.revision !== caseState.revision)
        await loadCase(caseState.id, true);
    });
  }, 3500);
}
run(boot);
