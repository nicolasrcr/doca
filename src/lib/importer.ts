import { norm, todayISO } from "./format";
import { detectReportType, prepare, readRows } from "./parse";
import { parseDateTime, recompute } from "./compute";
import type { DayResult, Driver, SheetTable } from "./types";

export const BASE_KEYS = ["cod", "ent", "prob", "base", "distrito", "hr_saida", "hr_chegada", "retencao", "tipo_produto", "peso", "assinante", "origem", "bloqueado", "hr_problema"];
export const ENT_KEYS = ["cod", "responsavel", "pagamento", "centro_financeiro", "status_carta", "origem", "bloqueado", "hr_digitacao"];

// Um grupo = uma base em um dia, encontrado nas planilhas arrastadas.
export interface ImportGroup {
  id: string;
  name: string; // nome como veio da planilha ("" quando a planilha não traz a base)
  date: string; // AAAA-MM-DD mais frequente nas linhas da base
  table: SheetTable; // linhas da bipagem só desta base
  total: number;
  entregues: number;
}

export interface ImportScan {
  groups: ImportGroup[];
  carta: SheetTable | null;
  ignored: string[]; // arquivos que não parecem relatório do JMS
}

const noDrivers = new Map<string, Driver>();

const isoLocal = (d: Date) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};

function modalDate(t: SheetTable): string {
  const counts = new Map<string, number>();
  for (const r of t.data) {
    const raw = (t.map.hr_saida >= 0 && r[t.map.hr_saida]) || (t.map.hr_chegada >= 0 && r[t.map.hr_chegada]) || "";
    if (!raw) continue;
    // a data escrita na planilha manda (evita deslocar o dia pelo fuso do navegador)
    const lit = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
    let k = lit ? lit[1] : "";
    if (!k) {
      const d = parseDateTime(raw);
      if (!d) continue;
      k = isoLocal(d);
    }
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = "";
  let n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best || todayISO();
}

export function computeGroup(table: SheetTable, carta: SheetTable | null): DayResult | null {
  return recompute(table, carta, noDrivers, false);
}

const sig = (t: SheetTable) => JSON.stringify(t.map);

// Junta tabelas com o mesmo formato (mesmas colunas) em uma só; mantém separadas se o formato difere.
function mergeTables(list: SheetTable[]): SheetTable[] {
  const out: SheetTable[] = [];
  for (const t of list) {
    const hit = out.find((o) => sig(o) === sig(t));
    if (hit) hit.data = hit.data.concat(t.data);
    else out.push({ ...t, data: t.data.slice() });
  }
  return out;
}

export async function scanJmsFiles(files: File[]): Promise<ImportScan> {
  const bip: SheetTable[] = [];
  const cartas: SheetTable[] = [];
  const ignored: string[] = [];
  for (const f of files) {
    try {
      const rows = await readRows(f);
      const type = detectReportType(rows);
      if (type === "bipagem") bip.push(prepare(rows, BASE_KEYS, { cod: 0, ent: 4, prob: 8 }));
      else if (type === "carta_porte") cartas.push(prepare(rows, ENT_KEYS, { cod: 0 }));
      else ignored.push(f.name);
    } catch (e) {
      ignored.push(`${f.name} (${e instanceof Error ? e.message : "erro ao ler"})`);
    }
  }
  const carta = mergeTables(cartas).sort((a, b) => b.data.length - a.data.length)[0] || null;

  // separa cada arquivo de bipagem por base (coluna "Base de entrega") e junta a mesma base entre arquivos
  const byBase = new Map<string, { name: string; tables: SheetTable[] }>();
  for (const t of bip) {
    const col = t.map.base;
    const perName = new Map<string, string[][]>();
    for (const r of t.data) {
      const nm = col >= 0 ? (r[col] || "").trim() : "";
      const k = norm(nm);
      const arr = perName.get(k) || [];
      arr.push(r);
      perName.set(k, arr);
    }
    for (const [k, data] of perName) {
      const nm = col >= 0 ? (data[0][col] || "").trim() : "";
      const cur = byBase.get(k) || { name: nm, tables: [] };
      cur.tables.push({ ...t, data });
      byBase.set(k, cur);
    }
  }

  const groups: ImportGroup[] = [];
  for (const [k, { name, tables }] of byBase) {
    for (const t of mergeTables(tables)) {
      // uma tabela pode cobrir vários dias: separa pelas datas mais frequentes não é confiável,
      // então cada base entra com o dia predominante; o cliente confirma/edita a data na prévia.
      const res = computeGroup(t, carta);
      groups.push({
        id: `${k}|${groups.length}`,
        name,
        date: modalDate(t),
        table: t,
        total: res?.tot.t ?? 0,
        entregues: res?.tot.e ?? 0,
      });
    }
  }
  groups.sort((a, b) => b.total - a.total);
  return { groups, carta, ignored };
}

export interface ImportItem {
  name: string;
  date: string;
  meta?: number; // meta de entrega (%) escolhida pelo cliente para a base nova
  table: SheetTable;
}

// Itens da prévia que caíram na mesma base e no mesmo dia viram um só (as linhas se somam).
export function consolidate(items: ImportItem[]): ImportItem[] {
  const out = new Map<string, ImportItem>();
  for (const it of items) {
    const k = `${norm(it.name)}|${it.date}`;
    const cur = out.get(k);
    if (!cur) out.set(k, { ...it, name: it.name.trim(), table: { ...it.table, data: it.table.data.slice() } });
    else if (sig(cur.table) === sig(it.table)) cur.table.data = cur.table.data.concat(it.table.data);
    else throw new Error(`As planilhas de "${it.name}" têm formatos de colunas diferentes e não dá para juntar no mesmo dia.`);
  }
  return [...out.values()];
}
