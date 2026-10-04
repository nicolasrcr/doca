import type { DayRecord } from "./types";

export interface PrevisaoMes {
  mes: string; // AAAA-MM
  diasComDados: number;
  pctAtual: number; // % entregue no mês até agora
  pctProjetado: number; // % ao fim do mês se o ritmo recente continuar
  diasRestantes: number; // dias de operação esperados até o fim do mês
  volumeDia: number; // média de pacotes por dia de operação
  necessario: number | null; // % que precisa entregar daqui para frente para fechar o mês na meta (null = não há mais dias)
  alcancavel: boolean;
}

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

// Estimativa simples e transparente: ritmo dos últimos 14 dias com dados, aplicado aos dias de operação
// que ainda restam no mês (a frequência de operação vem dos últimos 28 dias). Não é promessa, é referência.
export function preverFechamentoMes(history: DayRecord[], hoje: string, meta: number): PrevisaoMes | null {
  const mes = hoje.slice(0, 7);
  const ok = history.filter((d) => d.carta_ok !== false && d.data <= hoje);
  const doMes = ok.filter((d) => d.data.startsWith(mes));
  if (doMes.length < 3) return null;
  const T = doMes.reduce((a, d) => a + d.total, 0);
  const E = doMes.reduce((a, d) => a + d.entregues, 0);
  if (!T) return null;

  const rec = ok.slice(-14);
  const Tr = rec.reduce((a, d) => a + d.total, 0);
  const Er = rec.reduce((a, d) => a + d.entregues, 0);
  const pctRecente = Tr ? Er / Tr : E / T;
  const volumeDia = Tr / Math.max(1, rec.length);

  const ini28 = new Date(hoje + "T12:00:00");
  ini28.setDate(ini28.getDate() - 27);
  const k28 = ini28.toISOString().slice(0, 10);
  const d28 = ok.filter((d) => d.data >= k28);
  const primeiro = ok[0] ? new Date(ok[0].data + "T12:00:00") : ini28;
  const janela = Math.max(7, Math.min(28, Math.round((new Date(hoje + "T12:00:00").getTime() - Math.max(primeiro.getTime(), ini28.getTime())) / 86400000) + 1));
  const freq = Math.min(1, d28.length / janela);

  const [y, m, dia] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), Number(hoje.slice(8, 10))];
  const restantesCal = daysInMonth(y, m) - dia;
  const N = Math.round(restantesCal * freq);
  const V = volumeDia * N;
  const pctProjetado = (E + pctRecente * V) / (T + V);
  const necessario = N > 0 && V > 0 ? (meta * (T + V) - E) / V : null;
  return {
    mes,
    diasComDados: doMes.length,
    pctAtual: E / T,
    pctProjetado,
    diasRestantes: N,
    volumeDia,
    necessario,
    alcancavel: necessario === null ? E / T >= meta : necessario <= 1,
  };
}
