// Esqueletos por vista. Puro: devuelve HTML, no toca el DOM.

const line = (w = 100) => `<div class="sk-line" style="width:${w}%"></div>`;
const block = (h = 96) => `<div class="sk-block" style="height:${h}px"></div>`;

export const SKELETON_VIEWS = ["map", "flow", "scope", "gaps", "risks", "compare", "evidence", "out_of_scope"];

export function skeletonFor(view) {
  switch (view) {
    case "flow":
      return `<div class="sk-head">${line(34)}</div>
        <div class="sk-row">${block(92)}${block(92)}${block(92)}</div>
        <div class="sk-stack">${line(80)}${line(64)}${line(72)}</div>`;

    case "scope":
      return `<div class="sk-head">${line(30)}</div>
        <div class="sk-cols">${block(180)}${block(180)}</div>`;

    case "compare":
      return `<div class="sk-head">${line(42)}</div>
        <div class="sk-table">
          <div class="sk-tr">${block(28)}${block(28)}${block(28)}${block(28)}</div>
          <div class="sk-tr">${block(28)}${block(28)}${block(28)}${block(28)}</div>
          <div class="sk-tr">${block(28)}${block(28)}${block(28)}${block(28)}</div>
          <div class="sk-tr">${block(28)}${block(28)}${block(28)}${block(28)}</div>
        </div>`;

    case "gaps":
    case "risks":
      return `<div class="sk-head">${line(38)}</div>
        <div class="sk-stack">${line(96)}${line(82)}${line(90)}${line(74)}${line(86)}</div>`;

    case "evidence":
      return `<div class="sk-head">${line(28)}</div>
        <div class="sk-stack">${line(64)}${line(58)}${line(70)}${line(55)}${line(62)}${line(48)}</div>`;

    case "out_of_scope":
      return `<div class="sk-card">${line(46)}${line(28)}${line(88)}${line(80)}</div>`;

    default:
      return `<div class="sk-head">${line(40)}</div>
        <div class="sk-row">${block(120)}${block(120)}${block(120)}</div>
        <div class="sk-stack">${line(92)}${line(70)}${line(58)}</div>`;
  }
}
