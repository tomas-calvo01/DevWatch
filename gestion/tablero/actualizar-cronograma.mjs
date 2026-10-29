// actualizar-cronograma.mjs
// Baja el "Cronograma DevWatch" de GitHub Projects y lo guarda como cronograma.json,
// con el formato que usa el tablero. Requiere gh con el permiso read:project
// (gh auth refresh -s read:project).
// Uso: node actualizar-cronograma.mjs [archivo-salida]   (por defecto cronograma.json)
//      node actualizar-cronograma.mjs --campos            (lista los campos del Project)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const DUENO = "tomas-calvo01";
const NUMERO = 2;

const QUERY = `
query($login: String!, $numero: Int!, $cursor: String) {
  user(login: $login) {
    projectV2(number: $numero) {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content {
            ... on Issue { number title state }
            ... on DraftIssue { title }
            ... on PullRequest { number title state }
          }
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { name } } }
            }
          }
        }
      }
    }
  }
}`;

function consultar(cursor) {
  const args = ["api", "graphql", "-f", `query=${QUERY}`, "-f", `login=${DUENO}`, "-F", `numero=${NUMERO}`];
  if (cursor) args.push("-f", `cursor=${cursor}`);
  const res = JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
  if (res.errors) throw new Error(res.errors.map((e) => e.message).join("; "));
  return res.data.user.projectV2.items;
}

// Nombre de campo normalizado: minúsculas, sin tildes ni espacios ("Costo (USD)" -> "costousd").
const clave = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const items = [];
let cursor = null;
do {
  const pagina = consultar(cursor);
  for (const nodo of pagina.nodes) {
    const campos = {};
    for (const v of nodo.fieldValues.nodes) {
      if (!v.field) continue;
      campos[clave(v.field.name)] = { nombre: v.field.name, valor: v.text ?? v.number ?? v.date ?? v.name ?? v.title };
    }
    items.push({ content: nodo.content ?? {}, campos });
  }
  cursor = pagina.pageInfo.hasNextPage ? pagina.pageInfo.endCursor : null;
} while (cursor);

if (process.argv.includes("--campos")) {
  const nombres = new Map();
  for (const it of items) for (const c of Object.values(it.campos)) nombres.set(c.nombre, c.valor);
  for (const [n, ejemplo] of nombres) console.log(`${n}: ${JSON.stringify(ejemplo)}`);
  process.exit(0);
}

// Primer campo presente entre varios nombres posibles.
const campo = (it, ...nombres) => {
  for (const n of nombres) if (it.campos[clave(n)]?.valor != null) return it.campos[clave(n)].valor;
  return null;
};
const numero = (v) => (v == null || v === "" ? 0 : Number(String(v).replace(",", ".")));
const siNo = (v) => (/^(si|sí|yes|true|x)$/i.test(String(v ?? "").trim()) ? "si" : "no");

const filas = items
  .map((it) => {
    const titulo = it.content.title ?? campo(it, "Title") ?? "";
    // El id de la tarea (1.1, 3.3...) es el comienzo del título: "5.2 Despliegue del MVP".
    const id = titulo.match(/^\s*(\d+(?:\.\d+)+)/)?.[1] ?? "";
    return {
      id,
      tarea: titulo.replace(/^\s*\d+(?:\.\d+)+\s*[-–:.]?\s*/, ""),
      issue: it.content.number ?? null,
      estado: campo(it, "Status") ?? "Todo",
      hito: campo(it, "Hito") ?? "",
      // En el Project horas y costo van juntos en un campo de texto: "18h / $90".
      horas: numero(String(campo(it, "Horas/Costo") ?? "").match(/([\d.,]+)\s*h/i)?.[1]),
      costo_usd: numero(String(campo(it, "Horas/Costo") ?? "").match(/\$\s*([\d.,]+)/)?.[1]),
      predecesoras: String(campo(it, "Predecesoras") ?? "").replace(/^[\s-]+$/, "").trim(), // "---" = sin predecesoras
      inicio: campo(it, "Fecha inicio"),
      fin: campo(it, "Fecha fin"),
      ruta_critica: siNo(campo(it, "Ruta critica")),
    };
  })
  .filter((f) => f.id);

// Mismo orden que el Project: por número de issue.
filas.sort((a, b) => (a.issue ?? Infinity) - (b.issue ?? Infinity));

const salida = process.argv[2] ?? "cronograma.json";
writeFileSync(salida, "[\n" + filas.map((f) => JSON.stringify(f)).join(",\n") + "\n]\n");
console.log(`${filas.length} tareas guardadas en ${salida}`);
