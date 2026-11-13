// Parser de frames SSE. Separado para poder testearlo sin DOM.

export function parseFrame(raw) {
  let event = "message";
  const data = [];
  for (const line of String(raw).split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const i = line.indexOf(":");
    const field = i === -1 ? line : line.slice(0, i);
    const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return { event, data: data.join("\n") };
}
