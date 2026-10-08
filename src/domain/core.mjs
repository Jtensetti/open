import { RESTAURANT } from "./restaurant.mjs";
export const registry = Object.freeze({ [RESTAURANT.id]: RESTAURANT });
export const clone = (value) => structuredClone(value);
export class DomainError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function scenarioFor(id, version) {
  const s = registry[id];
  if (!s || (version && s.version !== version))
    throw new DomainError(
      "SCENARIO_UNAVAILABLE",
      "Scenarioversionen kan inte hanteras.",
      409,
    );
  return s;
}
export function matches(condition, facts) {
  if (condition.always) return true;
  if (condition.all) return condition.all.every((c) => matches(c, facts));
  if (condition.any) return condition.any.some((c) => matches(c, facts));
  const f = facts[condition.field];
  if (!f || f.status === "uncertain") return false;
  return Object.hasOwn(condition, "eq")
    ? f.value === condition.eq
    : f.value !== condition.neq;
}
export function validDate(value) {
  if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function validateValue(field, value) {
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "number")
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= field.min &&
      value <= field.max
    );
  if (field.type === "enum") return field.options.includes(value);
  if (field.type === "date") return validDate(value);
  return (
    typeof value === "string" &&
    value.trim().length >= field.min &&
    value.length <= field.max
  );
}
export function sanitizeFacts(scenario, incoming, at) {
  if (
    !incoming ||
    typeof incoming !== "object" ||
    Array.isArray(incoming) ||
    Object.keys(incoming).length > 30
  )
    throw new DomainError("INVALID_FACTS", "Uppgifterna har fel format.");
  const out = {};
  for (const [key, f] of Object.entries(incoming)) {
    const def = scenario.fields[key];
    if (!def || !f || typeof f !== "object")
      throw new DomainError("UNKNOWN_FACT", `Okänd uppgift: ${key}`);
    if (!validateValue(def, f.value))
      throw new DomainError(
        "INVALID_VALUE",
        `Kontrollera uppgiften ”${def.label}”.`,
      );
    if (!["proposed", "confirmed", "uncertain"].includes(f.status))
      throw new DomainError(
        "INVALID_STATUS",
        "Uppgiften saknar giltig bekräftelsestatus.",
      );
    const source = typeof f.source === "string" ? f.source.slice(0, 240) : "";
    const method = [
      "deterministic",
      "dictionary",
      "fuzzy",
      "explicit",
    ].includes(f.method)
      ? f.method
      : "explicit";
    out[key] = {
      value: typeof f.value === "string" ? f.value.trim() : f.value,
      status: f.status,
      source,
      sourceType: method === "explicit" ? "user_answer" : "user_statement",
      sourceSpan:
        f.sourceSpan &&
        Number.isInteger(f.sourceSpan.start) &&
        Number.isInteger(f.sourceSpan.end) &&
        f.sourceSpan.start >= 0 &&
        f.sourceSpan.end >= f.sourceSpan.start &&
        f.sourceSpan.end <= 3000
          ? { start: f.sourceSpan.start, end: f.sourceSpan.end }
          : null,
      method,
      confidence:
        typeof f.confidence === "number" && Number.isFinite(f.confidence)
          ? Math.max(0, Math.min(1, f.confidence))
          : 1,
      verification: f.status === "confirmed" ? "user_confirmed" : "unverified",
      updatedAt: at,
    };
  }
  return out;
}
export function diagnose(scenario, facts) {
  const required = Object.entries(scenario.fields).filter(
    ([, d]) => d.required && (!d.when || matches(d.when, facts)),
  );
  const missing = required.filter(([k]) => !facts[k]).map(([k]) => k);
  const uncertain = Object.entries(facts)
    .filter(
      ([k, f]) =>
        f.status === "uncertain" &&
        (!scenario.fields[k].when || matches(scenario.fields[k].when, facts)),
    )
    .map(([k]) => k);
  const questions = [
    ...missing.map((key) => ({
      key,
      kind: "missing",
      ...scenario.fields[key],
    })),
    ...uncertain.map((key) => ({
      key,
      kind: "uncertain",
      ...scenario.fields[key],
      priority: scenario.fields[key].priority + 30,
    })),
  ].sort((a, b) => b.priority - a.priority);
  return {
    missing,
    uncertain,
    questions,
    ready: !missing.length && !uncertain.length,
    requiredCount: required.length,
    completeCount: required.filter(
      ([k]) => facts[k] && facts[k].status !== "uncertain",
    ).length,
  };
}
const signature = (f) => (f ? JSON.stringify([f.value, f.status]) : null);
export function inputsFor(rule, facts) {
  return Object.fromEntries(
    rule.fields
      .filter((k) => facts[k])
      .map((k) => [k, { value: facts[k].value, status: facts[k].status }]),
  );
}
export function diagnosisFor(state) {
  const d = diagnose(
    scenarioFor(state.scenarioId, state.scenarioVersion),
    state.facts,
  );
  return {
    ...d,
    ready: d.ready && state.inputStatus === "supported",
    inputStatus: state.inputStatus || "uncertain",
    inputReasons: state.inputReasons || [],
  };
}
export function deriveTasks(state, emit) {
  const scenario = scenarioFor(state.scenarioId, state.scenarioVersion);
  const previous = state.tasks || [];
  const rules =
    state.inputStatus === "unsupported"
      ? []
      : scenario.rules.filter((r) => matches(r.when, state.facts));
  const tasks = [];
  for (const rule of rules) {
    const fingerprint = JSON.stringify(inputsFor(rule, state.facts));
    const old = previous.find((t) => t.key === rule.id);
    let task;
    if (old && old.fingerprint === fingerprint) task = clone(old);
    else {
      task = {
        id: `${state.id}:${rule.id}`,
        key: rule.id,
        authority: rule.authority,
        status: state.submitted ? "active" : "prepared",
        revision: (old?.revision || 0) + 1,
        fingerprint,
        decision: null,
        request: null,
        response: null,
      };
      if (old)
        emit("task.invalidated", {
          taskId: task.id,
          taskKey: rule.id,
          authority: task.authority,
          oldRevision: old.revision,
          reason: "Underlaget för bedömningen har ändrats.",
        });
      else {
        emit("rule.triggered", {
          ruleId: rule.id,
          scenarioVersion: scenario.version,
          factKeys: rule.fields.filter((k) => state.facts[k]),
        });
        emit("task.created", {
          taskId: task.id,
          taskKey: rule.id,
          authority: task.authority,
        });
      }
    }
    tasks.push(task);
  }
  for (const old of previous)
    if (!tasks.some((t) => t.id === old.id))
      emit("task.withdrawn", {
        taskId: old.id,
        taskKey: old.key,
        authority: old.authority,
        reason: "Regelns villkor är inte längre uppfyllda.",
      });
  state.tasks = tasks;
  state.diagnosis = diagnosisFor(state);
  state.status = !state.submitted
    ? "draft"
    : !state.diagnosis.ready
      ? "needs_information"
      : tasks.some((t) => t.status === "waiting_info")
        ? "needs_information"
        : tasks.every((t) => ["accepted", "rejected"].includes(t.status))
          ? "completed"
          : "processing";
}
export function newCase(id, ownerId, at, mode = "pilot") {
  const s = {
    id,
    ownerId,
    mode,
    scenarioId: RESTAURANT.id,
    scenarioVersion: RESTAURANT.version,
    revision: 0,
    facts: {},
    tasks: [],
    submitted: false,
    status: "draft",
    inputStatus: "uncertain",
    inputReasons: [],
    createdAt: at,
    updatedAt: at,
  };
  s.diagnosis = diagnosisFor(s);
  return s;
}
export function applyCommand(previous, command, actor, at) {
  const state = clone(previous),
    events = [];
  const emit = (type, data) =>
    events.push({
      type,
      data,
      actor: {
        id: actor.id,
        role: actor.role,
        authority: actor.authority || null,
      },
      at,
    });
  const s = scenarioFor(state.scenarioId, state.scenarioVersion);
  if (!command || typeof command.type !== "string")
    throw new DomainError("INVALID_COMMAND", "Åtgärden saknas.");
  if (actor.role === "citizen" && state.ownerId !== actor.id)
    throw new DomainError("FORBIDDEN", "Du saknar åtkomst till ärendet.", 403);
  if (command.type === "replace_facts") {
    if (actor.role !== "citizen")
      throw new DomainError(
        "FORBIDDEN",
        "Endast ärendets ägare får ändra dessa uppgifter.",
        403,
      );
    if (
      !["supported", "uncertain", "unsupported"].includes(command.inputStatus)
    )
      throw new DomainError(
        "INPUT_STATUS",
        "Indatans tolkningsstatus måste anges.",
      );
    if (state.inputStatus !== command.inputStatus)
      emit("intent.status_changed", {
        from: state.inputStatus,
        to: command.inputStatus,
      });
    state.inputStatus = command.inputStatus;
    state.inputReasons = Array.isArray(command.inputReasons)
      ? command.inputReasons.slice(0, 5).map((x) => String(x).slice(0, 250))
      : [];
    const next = sanitizeFacts(s, command.facts, at);
    for (const [k, old] of Object.entries(state.facts))
      if (!next[k]) emit("fact.removed", { key: k, previous: old });
    for (const [k, f] of Object.entries(next)) {
      if (
        signature(f) !== signature(state.facts[k]) ||
        f.source !== state.facts[k]?.source
      ) {
        emit(f.status === "confirmed" ? "fact.confirmed" : "fact.updated", {
          key: k,
          fact: f,
          previous: state.facts[k] || null,
        });
      } else next[k] = state.facts[k];
    }
    state.facts = next;
    deriveTasks(state, emit);
  } else if (command.type === "submit") {
    if (actor.role !== "citizen")
      throw new DomainError(
        "FORBIDDEN",
        "Endast ärendets ägare får starta ärendet.",
        403,
      );
    if (state.submitted)
      throw new DomainError(
        "ALREADY_SUBMITTED",
        "Ärendet har redan startats.",
        409,
      );
    if (!diagnosisFor(state).ready || command.confirmScope !== true)
      throw new DomainError(
        "INCOMPLETE",
        "Besvara och bekräfta alla nödvändiga uppgifter.",
      );
    for (const [key, f] of Object.entries(state.facts)) {
      if (f.status !== "confirmed") {
        state.facts[key] = {
          ...f,
          status: "confirmed",
          verification: "user_confirmed",
          updatedAt: at,
        };
        emit("fact.confirmed", { key, fact: state.facts[key] });
      }
    }
    state.submitted = true;
    deriveTasks(state, emit);
    for (const task of state.tasks) {
      task.status = "active";
      emit("task.activated", {
        taskId: task.id,
        taskKey: task.key,
        authority: task.authority,
      });
    }
    emit("case.submitted", {
      scenarioVersion: state.scenarioVersion,
      mode: state.mode,
    });
    state.status = "processing";
  } else if (command.type === "assessment") {
    if (!["staff", "pilot_staff"].includes(actor.role))
      throw new DomainError("FORBIDDEN", "Handläggarbehörighet krävs.", 403);
    if (
      actor.role === "pilot_staff" &&
      (state.mode !== "pilot" || actor.caseId !== state.id)
    )
      throw new DomainError(
        "FORBIDDEN",
        "Pilotbehörigheten gäller ett annat ärende.",
        403,
      );
    const task = state.tasks.find((t) => t.id === command.taskId);
    if (!task || task.authority !== actor.authority)
      throw new DomainError(
        "FORBIDDEN",
        "Du saknar åtkomst till uppgiften.",
        403,
      );
    if (
      !state.submitted ||
      !diagnosisFor(state).ready ||
      task.status !== "active"
    )
      throw new DomainError(
        "TASK_NOT_ACTIVE",
        "Uppgiften kan inte bedömas just nu.",
        409,
      );
    if (task.revision !== command.taskRevision)
      throw new DomainError(
        "STALE_TASK",
        "Underlaget har ändrats. Läs det senaste underlaget.",
        409,
      );
    if (!["accepted", "rejected", "request"].includes(command.outcome))
      throw new DomainError("INVALID_OUTCOME", "Välj en giltig bedömning.");
    const note = String(command.note || "").trim();
    if (note.length < 5 || note.length > 1500)
      throw new DomainError(
        "NOTE_REQUIRED",
        "Skriv en motivering eller fråga på 5–1 500 tecken.",
      );
    if (command.outcome === "request") {
      task.status = "waiting_info";
      task.request = { question: note, at, by: actor.id };
      emit("information.requested", {
        taskId: task.id,
        authority: task.authority,
        question: note,
      });
    } else {
      task.status = command.outcome;
      task.decision = {
        outcome: command.outcome,
        note,
        at,
        by: actor.id,
        taskRevision: task.revision,
      };
      emit("human.assessment", {
        taskId: task.id,
        authority: task.authority,
        ...task.decision,
      });
    }
    deriveTasks(state, emit);
  } else if (command.type === "respond") {
    if (actor.role !== "citizen")
      throw new DomainError(
        "FORBIDDEN",
        "Endast ärendets ägare får svara.",
        403,
      );
    const task = state.tasks.find((t) => t.id === command.taskId);
    if (!task || task.status !== "waiting_info" || !task.request)
      throw new DomainError(
        "NO_REQUEST",
        "Kompletteringen är inte längre aktuell.",
        409,
      );
    if (task.revision !== command.taskRevision)
      throw new DomainError(
        "STALE_TASK",
        "Frågan har ändrats. Läs den senaste versionen.",
        409,
      );
    const answer = String(command.answer || "").trim();
    if (answer.length < 3 || answer.length > 1500)
      throw new DomainError(
        "INVALID_ANSWER",
        "Skriv ett svar på 3–1 500 tecken.",
      );
    task.response = { answer, question: task.request.question, at };
    task.request = null;
    task.status = "active";
    emit("information.provided", {
      taskId: task.id,
      authority: task.authority,
      ...task.response,
    });
    deriveTasks(state, emit);
  } else throw new DomainError("UNKNOWN_COMMAND", "Okänd åtgärd.");
  state.revision++;
  state.updatedAt = at;
  return { state, events };
}
export function packetFor(state, task) {
  const s = scenarioFor(state.scenarioId, state.scenarioVersion),
    rule = s.rules.find((r) => r.id === task.key);
  return {
    caseId: state.id,
    caseRevision: state.revision,
    scenarioId: s.id,
    scenarioVersion: s.version,
    mode: state.mode,
    taskId: task.id,
    taskKey: task.key,
    taskRevision: task.revision,
    authority: task.authority,
    title: rule.title,
    question: rule.question,
    reason: rule.reason,
    kind: rule.kind,
    limitations: rule.limits,
    status: task.status,
    facts: Object.fromEntries(
      rule.fields
        .filter((k) => state.facts[k])
        .map((k) => [k, { ...state.facts[k], sourceSpan: undefined }]),
    ),
    sources: rule.sources.map((k) => s.sources[k]),
    request: task.request,
    response: task.response,
    decision: task.decision,
    integration: {
      status: "not_connected",
      message:
        "Underlaget finns i ÖPPNA. Ingen extern myndighet har tagit emot det.",
    },
  };
}
export function citizenView(state) {
  const { ownerId, ...view } = clone(state);
  return view;
}
