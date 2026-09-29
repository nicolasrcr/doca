import { colLetter, norm } from "./format";
import type { SheetTable } from "./types";

function cellVal(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.richText && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("result" in o) return cellVal(o.result);
    if ("text" in o) return String(o.text);
    if (o.error) return "";
    return "";
  }
  return String(v);
}

export function parseCSV(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] || "";
  const sep = first.split(";").length > first.split(",").length ? ";" : first.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

export async function readRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCSV(await file.text());
  if (name.endsWith(".xls"))
    throw new Error("Formato .xls antigo não é suportado. No JMS, exporte em .xlsx ou salve como .xlsx no Excel.");
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("A planilha está vazia.");
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[];
    const out: string[] = [];
    for (let i = 1; i < vals.length; i++) out.push(cellVal(vals[i]).trim());
    rows.push(out);
  });
  return rows;
}

export const ALIAS: Record<string, string[]> = {
  cod: [
    "numero de pedido jms",
    "n do pedido jms",
    "pedido jms",
    "numero do pedido",
    "numero de pedido",
    "waybill",
    "codigo do pedido",
    "codigo",
    "awb",
    "numero de rastreio",
    "remessa",
  ],
  // "Responsável pela entrega" NÃO entra aqui: é a coluna exclusiva da carta de porte
  // (chave `responsavel`, abaixo). Mantê-la fora daqui é o que permite detectar
  // automaticamente qual dos dois relatórios do JMS foi carregado.
  ent: ["entregador", "motorista", "courier", "nome do entregador"],
  prob: [
    "problema",
    "tipo de problema",
    "motivo do problema",
    "motivo",
    "ocorrencia",
    "pacote problematico",
    "motivos dos pacotes problematicos",
  ],
  // Razão de retenção é coluna própria no JMS (separada do motivo do pacote problemático)
  retencao: ["razao de retencao", "motivo de retencao"],
  // Carta de porte (relatório complementar): define o motorista responsável oficial,
  // o status e a forma de pagamento — dados que a bipagem sozinha não traz.
  responsavel: ["responsavel pela entrega", "responsavel"],
  centro_financeiro: ["centro financeiro de entrega", "centro financeiro"],
  pagamento: ["prazo de vencimento", "forma de pagamento", "pagamento"],
  status_carta: ["marca de assinatura", "status"],
  bloqueado: ["marca de revisao"],
  // Origem: na carta de porte é a coluna "Origem"; na bipagem o JMS troca o nome e ela
  // vem em "Tipos de Pgto" (o nome certo, "Prazo de Vencimento", é o que carrega o pagamento).
  origem: ["origem", "tipos de pgto"],
  hr_problema: ["horario registro pacote problematico"],
  hr_digitacao: ["tempo de digitacao"],
  // SLA e Datas
  hr_saida: [
    "tempo de entrega",
    "hora de entrega",
    "horario de entrega",
    "data e hora de criacao",
    "tempo de envio",
    "pickup",
    "saida",
  ],
  hr_chegada: [
    "horario da entrega",
    "hora da entrega",
    "horário da entrega",
    "data e hora da entrega",
    "horário entrega",
    "delivery",
    "chegada",
  ],
  tempo_retencao: [
    "tempo de retencao",
    "tempo de retenção",
    "atraso",
    "delay",
  ],
  // Operacional
  base: [
    "base de entrega",
    "base",
    "ponto de entrega",
    "centro de distribuicao",
    "cd",
  ],
  distrito: [
    "distrito destinatario",
    "distrito",
    "bairro destinatario",
    "bairro",
  ],
  tipo_produto: [
    "tipo de produto",
    "tipo",
    "categoria",
    "produto",
  ],
  peso: [
    "peso cobravel",
    "peso",
    "peso interno",
    "quilos",
  ],
  assinante: [
    "signatario",
    "assinante",
    "quem recebeu",
    "signature",
  ],
  // Coleta (pickup) — planilha própria, separada da entrega
  status_coleta: [
    "status da coleta",
    "situacao da coleta",
    "status coleta",
    "bipagem da coleta",
    "coleta",
  ],
  // Relatório de rastreamento / aging (pacotes parados — "Exceed N days with no track")
  aging: ["aging"],
  pedidos: ["pedidos"],
  unidade_resp: ["unidade responsavel"],
  regional_resp: ["regional responsavel"],
  regional_remetente: ["regional remetente"],
  nome_estacao: ["nome da estacao", "estacao"],
  base_remetente: ["nome da base remetente", "base remetente"],
  regional_recente: ["regional mais recente"],
};

function findHeader(rows: string[][]): number {
  const all = [...ALIAS.cod, ...ALIAS.ent, ...ALIAS.prob];
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const hits = rows[r].filter((c) => {
      const n = norm(c);
      return n && all.some((a) => n === a || n.includes(a));
    }).length;
    if (hits >= 1 && rows[r].filter((c) => c && isNaN(Number(c))).length >= 2) return r;
  }
  return -1;
}

function detectCol(headers: string[], key: string): number {
  const hs = headers.map(norm);
  for (const a of ALIAS[key]) {
    const i = hs.findIndex((h) => h === a);
    if (i >= 0) return i;
  }
  for (const a of ALIAS[key]) {
    const i = hs.findIndex((h) => h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

// O JMS às vezes cola texto em chinês nos valores de motivo/retenção/pagamento, com pontos
// grudados entre as palavras (ex.: "Ausência.do.destinatário客户不在", "留仓" = retido no
// armazém, "PgMensal月结" = mensal). Removemos pontuação/símbolos CJK e "fullwidth", e os
// pontos (em qualquer posição, não só nas pontas), sem mexer no texto em português/números.
export function cleanText(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/[　-鿿＀-￯]+/g, " ")
    .replace(/\./g, " ")
    .replace(/[·•]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type JmsReportType = "bipagem" | "carta_porte" | "desconhecido";

// Detecta qual dos dois relatórios do JMS foi carregado, pelas colunas presentes —
// não pelo nome do arquivo — para que o franqueado possa soltar os dois arquivos em
// qualquer ordem e o Doca identifique e mescle sozinho.
export function detectReportType(rows: string[][]): JmsReportType {
  const t = prepare(rows, ["cod", "ent", "prob", "responsavel", "status_carta"], {});
  if (t.map.cod < 0) return "desconhecido";
  if (t.map.ent >= 0 && t.map.prob >= 0) return "bipagem";
  if (t.map.responsavel >= 0 && t.map.status_carta >= 0) return "carta_porte";
  return "desconhecido";
}

export function prepare(rows: string[][], keys: string[], fallback: Record<string, number>): SheetTable {
  const hr = findHeader(rows);
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  let headers: string[];
  let data: string[][];
  let positional = false;
  if (hr >= 0) {
    headers = rows[hr].slice();
    data = rows.slice(hr + 1);
  } else {
    headers = [];
    data = rows;
    positional = true;
  }
  for (let i = 0; i < width; i++) if (!headers[i]) headers[i] = "";
  headers = headers.map((h, i) => `${colLetter(i)}${h ? " · " + h : ""}`);
  const map: Record<string, number> = {};
  for (const k of keys) {
    let idx = hr >= 0 ? detectCol(rows[hr], k) : -1;
    if (idx < 0) {
      idx = fallback[k] ?? -1;
      if (k !== "prob") positional = true;
    }
    map[k] = idx;
  }
  data = data.filter((r) => r.some((c) => c !== ""));
  return { headers, data, map, positional };
}
