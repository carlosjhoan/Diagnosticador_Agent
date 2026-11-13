/**
 * Ejecuta las acciones que el agente propone sobre la interfaz.
 * Son navegación, no escritura: se aplican directo y se avisa en la traza.
 */

export function runUiAction(tool, args, ctx) {
  const projects = ctx.projects || [];

  if (tool === "abrir_proyecto") {
    const p = projects.find((x) => x.id === args.proyecto);
    if (!p) return { ok: false, detalle: "no encontré ese proyecto" };
    return { ok: true, detalle: `Abriendo ${p.nombre}`, vista: { tipo: "proyecto", proyectoId: p.id } };
  }

  if (tool === "abrir_detalle") {
    const found = locate(projects, args, ctx.currentProject());
    if (!found) return { ok: false, detalle: `no encontré "${args.nodo || args.nombre}"` };
    // El detalle es un modal: no compite con el hilo.
    return {
      ok: true,
      detalle: `Detalle de ${found.node.id} en ${found.project.nombre}`,
      modal: { proyectoId: found.project.id, nodoId: found.node.id },
    };
  }

  if (tool === "enfocar_nodo") {
    const found = locate(projects, args, ctx.currentProject());
    if (!found) return { ok: false, detalle: `no encontré "${args.nodo || args.nombre}"` };
    if (ctx.currentProject()?.id === found.project.id) {
      ctx.focusNode(found.node.id);
      return { ok: true, detalle: `Señalando ${found.node.id}` };
    }
    return {
      ok: true,
      detalle: `Señalando ${found.node.id}`,
      vista: { tipo: "nodo", proyectoId: found.project.id, nodoId: found.node.id },
    };
  }

  return { ok: false, detalle: "acción desconocida" };
}

const plano = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Busca por id o por nombre. Gana el nombre que contenga todas las palabras. */
function findByNombre(project, nombre) {
  const buscado = plano(nombre);
  if (!buscado) return null;
  const palabras = buscado.split(" ").filter((w) => w.length > 2);

  let mejor = null;
  let mejorPuntaje = 0;
  for (const n of project.nodos) {
    const titulo = plano(n.nombre);
    if (titulo === buscado) return n;
    const aciertos = palabras.filter((w) => titulo.includes(w)).length;
    if (aciertos > mejorPuntaje) {
      mejorPuntaje = aciertos;
      mejor = n;
    }
  }
  // con varias palabras exigimos mayoría: evita matcheos flojos
  const minimo = palabras.length >= 2 ? Math.max(2, Math.ceil(palabras.length * 0.6)) : 1;
  return mejorPuntaje >= minimo ? mejor : null;
}

/** Busca el nodo en el proyecto abierto y, si no está, en los tres. */
function locate(projects, args, current) {
  const id = typeof args.nodo === "string" ? args.nodo : null;
  const nombre = typeof args.nombre === "string" ? args.nombre : null;

  const buscar = (p) => (id ? p.nodos.find((x) => x.id === id) : findByNombre(p, nombre));

  const enActual = current ? buscar(current) : null;
  if (enActual) return { project: current, node: enActual };

  for (const p of projects) {
    const n = buscar(p);
    if (n) return { project: p, node: n };
  }
  return null;
}
