import type { DayRecord } from "./types";

const soma = (days: DayRecord[]) => {
  const ok = days.filter((d) => d.carta_ok !== false);
  const t = ok.reduce((a, d) => a + d.total, 0);
  return { t, e: ok.reduce((a, d) => a + d.entregues, 0), dias: ok.length };
};

// % de entrega dos 7 dias que terminam em `ate` (inclusive). Serve de "antes" para um plano de ação.
export function pctUltimos7(history: DayRecord[], ate: string): number | null {
  const ini = new Date(ate + "T12:00:00");
  ini.setDate(ini.getDate() - 6);
  const k = ini.toISOString().slice(0, 10);
  const s = soma(history.filter((d) => d.data >= k && d.data <= ate));
  return s.t ? s.e / s.t : null;
}

// % de entrega dos 7 dias seguintes ao fim da ação. Só vale com pelo menos 3 dias de dados depois.
export function pctDepois(history: DayRecord[], feitoEm: string): { pct: number; dias: number } | null {
  const ini = new Date(feitoEm.slice(0, 10) + "T12:00:00");
  ini.setDate(ini.getDate() + 1);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 6);
  const s = soma(history.filter((d) => d.data >= ini.toISOString().slice(0, 10) && d.data <= fim.toISOString().slice(0, 10)));
  return s.dias >= 3 && s.t ? { pct: s.e / s.t, dias: s.dias } : null;
}
