const container = document.querySelector("#experiments");
const count = document.querySelector("#count");
const statuses = { planned: "Planeado", "in-progress": "En curso", validated: "Validado", limited: "Con limitaciones", archived: "Archivado" };
function safeLink(url) {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url, document.baseURI);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}
function element(name, className, content) {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}
function makeLink(label, href) {
  const safe = safeLink(href);
  if (!safe) return null;
  const a = element("a", "", label);
  a.href = safe;
  if (new URL(safe).origin !== location.origin) a.rel = "noopener noreferrer";
  return a;
}
function render(items) {
  container.replaceChildren();
  count.textContent = `${items.length} registrado(s)`;
  if (!items.length) { container.append(element("p", "", "Todavía no hay experimentos registrados.")); return; }
  for (const item of items) {
    const card = element("article", "card");
    card.append(element("span", "tag", statuses[item.status] || "Sin estado"));
    card.append(element("h3", "", item.title || "Experimento"));
    card.append(element("p", "", item.description || ""));
    const links = element("div", "links");
    for (const [label, href] of [["Documentación", item.source], ["Demo", item.demo]]) {
      const link = makeLink(label, href);
      if (link) links.append(link);
    }
    card.append(links);
    container.append(card);
  }
}
fetch("./experiments.json").then(r => { if (!r.ok) throw new Error("No se pudo cargar el catálogo"); return r.json(); }).then(data => {
  if (!Array.isArray(data)) throw new Error("Formato de catálogo inválido");
  render(data);
}).catch(() => { count.textContent = ""; container.replaceChildren(element("p", "", "No se pudo cargar el catálogo. Consultá el repositorio.")); });
