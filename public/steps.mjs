// Máquina de estados del recorrido. Pura: recibe eventos, devuelve pasos.
// La usan el rail, la línea de estado del turno y el modal de detalle.

export const STEP_DEFS = [
  { id: "interpretar", label: "interpretar", run: "Leyendo la consulta", done: ["interpret.done"] },
  { id: "alcance", label: "verificar alcance", run: "Verificando si está en el diagnóstico", done: ["scope.resolved"] },
  { id: "buscar", label: "buscar en el grafo", run: "Buscando en el grafo", done: ["decompose.done", "compose.done"] },
  { id: "auditar", label: "auditar", run: "Auditando con Jev", done: ["audit.done"] },
  { id: "presentar", label: "presentar", run: "Componiendo la vista", done: ["render.ready"] },
];

const STAGE_TO_STEP = { interpret: "interpretar", scope: "alcance", compose: "buscar", verify: "auditar" };

export function buildSteps() {
  return STEP_DEFS.map((d) => ({ id: d.id, label: d.label, run: d.run, state: "pending", ms: null, detail: "" }));
}

export function detailFor(ev) {
  const d = ev.data || {};
  if (ev.type === "interpret.done") {
    const n = (d.intenciones || []).length;
    return n ? `${n} ${n === 1 ? "intención" : "intenciones"}` : "sin intenciones";
  }
  if (ev.type === "scope.resolved") {
    return d.original != null ? `en alcance · ${Number(d.original).toFixed(2)}` : "alcance léxico";
  }
  if (ev.type === "decompose.done") return `${d.visible ?? "?"} de ${d.total ?? "?"}`;
  if (ev.type === "compose.done") return d.view ? `${d.view}${d.blocks ? " · " + d.blocks + " bloques" : ""}` : "";
  if (ev.type === "audit.done") return d.status === "ok" ? "aprobada" : d.status === "rejected" ? "con observaciones" : "sin auditar";
  return "";
}

function setNext(steps, from) {
  for (let i = from + 1; i < steps.length; i++) {
    if (steps[i].state === "pending") {
      steps[i].state = "running";
      return;
    }
  }
}

/** @returns {boolean} si cambió algo */
export function applyEvent(steps, ev) {
  if (!steps || !ev) return false;

  if (ev.type === "guard.noise") {
    steps[0].state = "done";
    steps[0].ms = ev.t ?? null;
    steps[0].detail = "ruido descartado";
    steps.slice(1).forEach((s) => (s.state = "skip"));
    return true;
  }

  if (ev.type === "stage.retry") {
    const id = STAGE_TO_STEP[ev.data?.stage];
    const step = steps.find((s) => s.id === id);
    if (!step) return false;
    step.state = "warn";
    step.detail = "reintentando " + (ev.data?.attempt ?? 1);
    return true;
  }

  if (ev.type === "stage.failed") {
    const id = STAGE_TO_STEP[ev.data?.stage];
    const step = steps.find((s) => s.id === id);
    if (!step) return false;
    const reason = String(ev.data?.reason || "");
    step.state = reason.includes("timeout") ? "warn" : "fail";
    step.detail = reason.includes("timeout") ? "demoró · usó respaldo" : "falló · usó respaldo";
    step.ms = ev.t ?? null;
    return true;
  }

  if (ev.type === "budget.exceeded") {
    const step = steps.find((s) => s.id === "auditar");
    if (step && step.state === "pending") {
      step.state = "skip";
      step.detail = "omitida por presupuesto";
    }
    return true;
  }

  if (ev.type === "run.finished") {
    for (const s of steps) {
      if (s.state === "pending" || s.state === "running") s.state = "skip";
    }
    return true;
  }

  const idx = STEP_DEFS.findIndex((d) => d.done.includes(ev.type));
  if (idx < 0) return false;

  const step = steps[idx];
  step.state = step.state === "warn" ? "warn" : "done";
  step.ms = ev.t ?? null;
  const detail = detailFor(ev);
  if (detail) step.detail = detail;

  setNext(steps, idx);
  return true;
}

export function replay(events) {
  const steps = buildSteps();
  for (const ev of events || []) applyEvent(steps, ev);
  return steps;
}

export function summary(steps, { finished = false, ms = null } = {}) {
  if (!steps) return { text: "", state: "pending", ms: null };

  if (finished) {
    const bad = steps.some((s) => s.state === "warn" || s.state === "fail");
    return {
      text: bad ? "Listo, con una etapa que usó el respaldo" : "Listo! Ya tengo la información necesaria",
      state: bad ? "warn" : "done",
      ms,
    };
  }

  const current = steps.find((s) => s.state === "running");
  if (current) return { text: current.run + "…", state: "running", ms: null };

  const last = [...steps].reverse().find((s) => s.state === "done");
  return last ? { text: last.detail || last.label, state: "running", ms: null } : { text: "", state: "pending", ms: null };
}
