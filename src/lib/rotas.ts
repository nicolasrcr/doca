import { LIMITES } from "./insights";
import type { DayRecord } from "./types";

export interface SugestaoRota {
  bairro: string;
  de: string;
  para: string;
  pacotes: number; // pacotes do bairro que o motorista atual atende no período
  ganho: number; // entregas a mais esperadas por período, estimativa
  motivo: string;
}

// Sugere passar um bairro que perde entregas do motorista com pior resultado geral para quem tem o melhor,
// priorizando quem já atende o mesmo bairro e tem carga abaixo da média. É uma estimativa para conversar,
// não uma ordem: o gerente conhece a rua, o trânsito e o veículo de cada um.
export function sugerirRedistribuicao(days: DayRecord[], meta: number): SugestaoRota[] {
  const ok = days.filter((d) => d.carta_ok !== false && d.bairros);
  const mot = new Map<string, { t: number; e: number; b: Map<string, number> }>();
  const bairro = new Map<string, { t: number; e: number }>();
  for (const d of ok) {
    for (const m of d.motoristas || []) {
      const x = mot.get(m.n) || { t: 0, e: 0, b: new Map() };
      x.t += m.t; x.e += m.e;
      for (const [b, q] of Object.entries(m.b || {})) x.b.set(b, (x.b.get(b) || 0) + q);
      mot.set(m.n, x);
    }
    for (const [b, v] of Object.entries(d.bairros || {})) {
      const x = bairro.get(b) || { t: 0, e: 0 };
      x.t += v.total; x.e += v.e;
      bairro.set(b, x);
    }
  }
  const motoristas = [...mot.entries()].filter(([, x]) => x.t >= LIMITES.minPacotesMotorista).map(([n, x]) => ({ n, ...x, pct: x.e / x.t }));
  if (motoristas.length < 2) return [];
  const cargaMedia = motoristas.reduce((a, m) => a + m.t, 0) / motoristas.length;
  const fortes = motoristas.filter((m) => m.pct >= meta).sort((a, b) => b.pct - a.pct);
  const out: SugestaoRota[] = [];
  const usados = new Set<string>();
  const criticos = [...bairro.entries()]
    .filter(([, v]) => v.t >= LIMITES.minPacotesBairro && v.e / v.t < meta)
    .sort((a, b) => (b[1].t - b[1].e) - (a[1].t - a[1].e))
    .slice(0, 6);
  for (const [nome, v] of criticos) {
    // quem mais atende o bairro e está abaixo da meta
    const atendem = motoristas.filter((m) => (m.b.get(nome) || 0) > 0).sort((a, b) => (b.b.get(nome)! - a.b.get(nome)!));
    const fraco = atendem.find((m) => m.pct < meta);
    if (!fraco) continue;
    const q = fraco.b.get(nome)!;
    if (q < 10) continue;
    // melhor candidato: forte, ainda não usado, com carga abaixo da média; prefere quem já conhece o bairro
    const cand = fortes.filter((f) => f.n !== fraco.n && !usados.has(f.n) && f.t <= cargaMedia * 1.15)
      .sort((a, b) => Number((b.b.get(nome) || 0) > 0) - Number((a.b.get(nome) || 0) > 0) || b.pct - a.pct)[0];
    if (!cand) continue;
    const ganho = Math.round(q * Math.max(0, cand.pct - fraco.pct));
    if (ganho < 1) continue;
    usados.add(cand.n);
    out.push({
      bairro: nome, de: fraco.n, para: cand.n, pacotes: q, ganho,
      motivo: `${nome} está em ${(100 * v.e / v.t).toFixed(1).replace(".", ",")}% de entrega. ${fraco.n} tem ${(100 * fraco.pct).toFixed(1).replace(".", ",")}% no geral e ${cand.n} tem ${(100 * cand.pct).toFixed(1).replace(".", ",")}%${(cand.b.get(nome) || 0) > 0 ? " e já atende esse bairro" : ""}.`,
    });
  }
  return out;
}
