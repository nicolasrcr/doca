import { mae } from "./compute";
import type { SheetTable } from "./types";

export type TipoDivergencia = "carta_sem_bipagem" | "duplicado" | "sem_motorista" | "sem_codigo";

export interface Divergencia {
  tipo: TipoDivergencia;
  codigo: string;
  linha: number; // linha na planilha (1 = cabeçalho)
  detalhe: string;
}

export const ROTULO: Record<TipoDivergencia, string> = {
  carta_sem_bipagem: "Na Carta de porte, mas não está na bipagem",
  duplicado: "Pedido repetido na bipagem",
  sem_motorista: "Pedido sem entregador",
  sem_codigo: "Linha sem código de pedido",
};

// Linha na planilha: dado i (0-based) fica na linha i + 2 quando há cabeçalho (o caso dos relatórios do JMS).
const linhaDe = (t: SheetTable, i: number) => i + (t.positional ? 1 : 2);

export function acharDivergencias(bip: SheetTable[], carta: SheetTable | null): Divergencia[] {
  const out: Divergencia[] = [];
  const vistos = new Map<string, number>(); // código -> primeira linha
  const rep = new Map<string, number[]>();
  const nome = (t: SheetTable, i: number) => (bip.length > 1 ? ` (arquivo ${bip.indexOf(t) + 1})` : "") + ` linha ${linhaDe(t, i)}`;
  for (const t of bip) {
    t.data.forEach((r, i) => {
      const c = mae(r[t.map.cod] || "");
      if (!c) {
        out.push({ tipo: "sem_codigo", codigo: "", linha: linhaDe(t, i), detalhe: `Sem código —${nome(t, i)}` });
        return;
      }
      if (t.map.ent >= 0 && !(r[t.map.ent] || "").trim()) out.push({ tipo: "sem_motorista", codigo: c, linha: linhaDe(t, i), detalhe: `Entregador em branco —${nome(t, i)}` });
      if (vistos.has(c)) {
        const l = rep.get(c) || [vistos.get(c)!];
        l.push(linhaDe(t, i));
        rep.set(c, l);
      } else vistos.set(c, linhaDe(t, i));
    });
  }
  for (const [c, linhas] of rep) out.push({ tipo: "duplicado", codigo: c, linha: linhas[1], detalhe: `Aparece ${linhas.length} vezes (linhas ${linhas.slice(0, 5).join(", ")}${linhas.length > 5 ? "…" : ""})` });
  if (carta && carta.map.cod >= 0) {
    const cartaVista = new Set<string>();
    carta.data.forEach((r, i) => {
      const c = mae(r[carta.map.cod] || "");
      if (!c || cartaVista.has(c)) return;
      cartaVista.add(c);
      if (!vistos.has(c)) out.push({ tipo: "carta_sem_bipagem", codigo: c, linha: linhaDe(carta, i), detalhe: `Entregue na Carta de porte (linha ${linhaDe(carta, i)}), mas ausente na bipagem` });
    });
  }
  return out;
}

export function divergenciasCsv(list: Divergencia[]): string[] {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  return ["Tipo;Código;Linha;Detalhe", ...list.map((d) => [ROTULO[d.tipo], d.codigo, d.linha, d.detalhe].map(q).join(";"))];
}
