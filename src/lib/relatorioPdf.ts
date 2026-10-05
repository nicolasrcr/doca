import { analisarBase } from "./insights";
import { agruparMotivos } from "./taxonomia";
import { preverFechamentoMes } from "./previsao";
import { fmtN, fmtPct, brDate } from "./format";
import { diaRef } from "./ref";
import { geradoEm } from "./share";
import type { Base, DayRecord } from "./types";

const FAROL: Record<string, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho", sem_dados: "Sem dados" };
const TEND: Record<string, string> = { subindo: "subindo", caindo: "caindo", estavel: "estável" };

// Relatório semanal em PDF para mandar ao dono, ao sócio ou à J&T: farol, números, o que atacar e quem precisa de apoio.
export async function gerarRelatorioSemanal(base: Base, history: DayRecord[]): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const hoje = diaRef(history);
  const s = analisarBase(history, base, 7, hoje);
  const doc = new jsPDF();
  const W = 210, M = 14;
  let y = 18;
  const nova = (h: number) => { if (y + h > 285) { doc.addPage(); y = 18; } };
  const titulo = (t: string) => { nova(14); y += 4; doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(t, M, y); y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(10); };
  const linha = (t: string, ind = 0) => {
    for (const l of doc.splitTextToSize(t, W - 2 * M - ind) as string[]) { nova(6); doc.text(l, M + ind, y); y += 5.2; }
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("Relatório semanal", M, y); y += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`${base.name}${base.city ? " · " + base.city : ""}`, M, y); y += 5.5;
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Últimos 7 dias até ${brDate(hoje)} · gerado em ${geradoEm()} · meta ${base.meta}%`, M, y); y += 4;
  doc.setTextColor(0); doc.setFontSize(10);

  titulo("Resumo");
  linha(`Situação: ${FAROL[s.farol]}${s.tendencia ? ` (${TEND[s.tendencia]})` : ""}. ${s.veredito}`);
  if (s.pct !== null) linha(`Entrega: ${fmtPct(s.pct)} (${fmtN(s.entregues)} de ${fmtN(s.total)} pacotes em ${s.dias} dia${s.dias === 1 ? "" : "s"}).${s.delta !== null ? ` Em relação à semana anterior: ${s.delta >= 0 ? "+" : ""}${(s.delta * 100).toFixed(1).replace(".", ",")} p.p.` : ""}`);
  if (s.diasSemCarta) linha(`Atenção: ${s.diasSemCarta} dia(s) sem Carta de porte ficaram fora dos cálculos.`);

  titulo("Indicadores");
  for (const i of s.indicadores) {
    const v = i.valor === null ? "sem dados" : fmtPct(i.valor);
    linha(`• ${i.rotulo}: ${v} (${i.alvo}) · ${FAROL[i.farol]}`);
  }

  if (s.prioridades.length) {
    titulo("O que atacar primeiro");
    s.prioridades.forEach((p, n) => {
      linha(`${n + 1}. ${p.titulo}`);
      linha(p.detalhe, 5);
      if (p.acao) linha(`O que fazer: ${p.acao}`, 5);
    });
  }

  const baixos = s.motoristas.filter((m) => m.farol !== "verde" && m.t >= 20).sort((a, b) => a.pct - b.pct).slice(0, 6);
  if (baixos.length) {
    titulo("Motoristas que precisam de apoio");
    for (const m of baixos) linha(`• ${m.nome}: ${fmtPct(m.pct)} (${fmtN(m.e)} de ${fmtN(m.t)}), ${m.diasAbaixo} dia(s) abaixo do alerta`);
  }

  const motivos: Record<string, number> = {};
  for (const d of history.filter((x) => x.data > new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) && x.carta_ok !== false)) {
    for (const [k, v] of Object.entries(d.motivos || {})) motivos[k] = (motivos[k] || 0) + v;
  }
  const cats = agruparMotivos(motivos).slice(0, 5);
  if (cats.length) {
    titulo("Problemas por tipo");
    const tot = cats.reduce((a, c) => a + c.total, 0);
    for (const c of cats) linha(`• ${c.categoria}: ${fmtN(c.total)} (${fmtPct(tot ? c.total / tot : 0)})`);
  }

  const prev = preverFechamentoMes(history, hoje, (base.meta ?? 95) / 100);
  if (prev) {
    titulo("Previsão do mês");
    linha(`Hoje o mês está em ${fmtPct(prev.pctAtual)}. Mantido o ritmo recente, deve fechar em ${fmtPct(prev.pctProjetado)} (meta ${base.meta}%). É uma estimativa.`);
  }

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Gerado pelo Doca a partir dos arquivos enviados. As sugestões não substituem a decisão do gerente.", M, 290);
  return doc.output("blob");
}
