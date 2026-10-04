import type { ColetaResult } from "./compute";
import type { DayResult } from "./types";

// Linha da tabela `days` a partir do resultado calculado do dia. Usada ao salvar o dia
// em Entregas e na importação automática de planilhas (uma linha por base).
export function buildDayRow(opts: {
  baseId: string;
  data: string;
  meta: number;
  salvoPor: string;
  result: DayResult;
  coleta?: ColetaResult | null;
}) {
  const { result, coleta } = opts;
  const itens = result.list.flatMap((d) => d.itens);
  const comHorarios = itens.filter((it) => it.hr_saida && it.hr_chegada);
  const slaOk = comHorarios.filter((it) => it.sla_ok).length;
  const pesoTotal = itens.reduce((a, it) => a + (it.peso || 0), 0);
  const pagamentos: Record<string, number> = {};
  const tiposProduto: Record<string, number> = {};
  for (const it of itens) {
    if (it.pagamento) pagamentos[it.pagamento] = (pagamentos[it.pagamento] || 0) + 1;
    if (it.tipo_produto) tiposProduto[it.tipo_produto] = (tiposProduto[it.tipo_produto] || 0) + 1;
  }
  return {
    base_id: opts.baseId,
    data: opts.data,
    meta: opts.meta,
    total: result.tot.t,
    entregues: result.tot.e,
    problemas: result.tot.p,
    pendentes: result.tot.n,
    motoristas: result.list.map((d) => ({
      n: d.nome,
      t: d.t,
      e: d.e,
      p: d.p,
      q: d.n,
      b: result.porBairro[d.nome] || {},
    })),
    motivos: result.motivos,
    salvo_por: opts.salvoPor,
    linhas_descartadas: result.linhasDescartadas,
    coleta_total: coleta?.total || 0,
    coleta_feita: coleta?.feita || 0,
    coleta_falha_bipagem: coleta?.falhaBipagem || 0,
    retido_base: result.tot.retidoBase,
    devolucao: result.tot.devolucao,
    com_assinatura: result.tot.comAssinatura,
    sla_ok: slaOk,
    sla_total: comHorarios.length,
    peso_total: pesoTotal,
    bloqueados: result.bloqueados.length,
    divergentes: result.divergentes.length,
    pagamentos,
    tipos_produto: tiposProduto,
  };
}
