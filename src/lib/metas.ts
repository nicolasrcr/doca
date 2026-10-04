import type { Base, DayRecord, Driver } from "./types";

const diaDaSemana = (iso: string) => new Date(iso + "T12:00:00").getDay();
export const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Meta (0 a 1) válida para um dia: a do dia da semana, se a base definiu, senão a meta geral da base.
export function metaDoDia(base: Pick<Base, "meta" | "metas_semana">, iso: string): number {
  const v = base.metas_semana?.[String(diaDaSemana(iso))];
  return (typeof v === "number" && v >= 50 && v <= 100 ? v : base.meta ?? 95) / 100;
}

// Meta do motorista: a própria, se tiver, senão a meta geral da base.
export function metaDoMotorista(d: Pick<Driver, "meta"> | undefined, base: Pick<Base, "meta">): number {
  return (d?.meta && d.meta >= 50 && d.meta <= 100 ? d.meta : base.meta ?? 95) / 100;
}

export interface ComparacaoSemana {
  data: string;
  nomeDia: string;
  pct: number;
  media: number; // média do mesmo dia da semana nas 4 semanas anteriores
  delta: number;
  n: number; // quantas semanas entraram na média
  metaDia: number;
}

// Compara o último dia salvo com a média do mesmo dia da semana (segunda com segunda, etc.).
export function compararMesmoDia(history: DayRecord[], base: Pick<Base, "meta" | "metas_semana">): ComparacaoSemana | null {
  const ok = history.filter((d) => d.carta_ok !== false && d.total > 0);
  const ult = ok[ok.length - 1];
  if (!ult) return null;
  const dow = diaDaSemana(ult.data);
  const limite = new Date(ult.data + "T12:00:00");
  limite.setDate(limite.getDate() - 28);
  const antes = ok.filter((d) => d.data < ult.data && d.data >= limite.toISOString().slice(0, 10) && diaDaSemana(d.data) === dow);
  if (antes.length < 2) return null;
  const T = antes.reduce((a, d) => a + d.total, 0);
  const E = antes.reduce((a, d) => a + d.entregues, 0);
  const pct = ult.entregues / ult.total;
  const media = E / T;
  return { data: ult.data, nomeDia: NOMES_DIA[dow], pct, media, delta: pct - media, n: antes.length, metaDia: metaDoDia(base, ult.data) };
}
