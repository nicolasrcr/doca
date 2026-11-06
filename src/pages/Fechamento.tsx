import { useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useDialog } from "../hooks/useDialog";
import { downloadBlob, copyText, useToast } from "../hooks/useToast";
import { brDate, fmtN, fmtR, todayISO } from "../lib/format";
import type { Payout, PayoutDiscount, PayoutItem } from "../lib/types";
import { Dica } from "../components/ui";

function exportPayoutCsv(p: Payout) {
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Motorista", "Entregas", "R$/entrega", "Bruto", "Ajuste", "Nota", "Líquido"].map(q).join(";")];
  p.items.forEach((it) => lines.push([it.driver, it.deliveries, it.rate, it.gross, it.adjustments, it.note || "", it.net].map(q).join(";")));
  downloadBlob(`fechamento-${p.period_start}-${p.period_end}.csv`, new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
}

async function exportPayoutPdf(p: Payout, baseName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const L = 14, R = 196, W = R - L;
  const net = p.items.reduce((a, i) => a + i.net, 0);
  const gross = p.items.reduce((a, i) => a + i.gross, 0);
  const deliveries = p.items.reduce((a, i) => a + i.deliveries, 0);
  const cols = { nome: L + 2, ent: 98, unit: 120, bruto: 146, ajuste: 163, liq: R - 2 };
  const money = (n: number) => fmtR(n);

  // cabeçalho
  doc.setFillColor(20, 21, 26); doc.rect(0, 0, 210, 30, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Fechamento de pagamento", L, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(baseName || "", L, 22);
  doc.text(`Emitido em ${brDate(todayISO())}`, R, 22, { align: "right" });
  doc.setTextColor(20);

  // resumo
  let y = 42;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(`Período: ${brDate(p.period_start)} a ${brDate(p.period_end)}`, L, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100);
  doc.text(`Status: ${p.status}`, R, y, { align: "right" });
  doc.setTextColor(20);
  y += 8;
  const boxes: [string, string][] = [["Motoristas", String(p.items.length)], ["Entregas", fmtN(deliveries)], ["Bruto", money(gross)], ["Líquido", money(net)]];
  const bw = (W - 3 * 4) / 4;
  boxes.forEach(([label, val], i) => {
    const x = L + i * (bw + 4);
    doc.setFillColor(243, 244, 247); doc.roundedRect(x, y, bw, 15, 2, 2, "F");
    doc.setFontSize(8); doc.setTextColor(110); doc.text(label, x + 3, y + 5.5);
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(20); doc.text(val, x + 3, y + 12);
    doc.setFont("helvetica", "normal");
  });
  y += 27;
  if (p.items.some((i) => i.pendente)) {
    doc.setFontSize(9); doc.setTextColor(190, 30, 45);
    doc.text("Atenção: fechamento parcial; há entregas sem valor definido.", L, y - 4);
    doc.setTextColor(20); y += 4;
  }

  const head = (yy: number) => {
    doc.setFillColor(238, 239, 242); doc.rect(L, yy - 5, W, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Motorista", cols.nome, yy);
    doc.text("Entregas", cols.ent, yy, { align: "right" }); doc.text("R$/entrega", cols.unit + 10, yy, { align: "right" });
    doc.text("Bruto", cols.bruto + 8, yy, { align: "right" }); doc.text("Desc./ajuste", cols.ajuste + 8, yy, { align: "right" });
    doc.text("Líquido", cols.liq, yy, { align: "right" });
    doc.setFont("helvetica", "normal");
  };

  head(y); y += 8;
  p.items.forEach((it, i) => {
    if (y > 270) { doc.addPage(); y = 20; head(y); y += 8; }
    if (i % 2) { doc.setFillColor(248, 248, 250); doc.rect(L, y - 4.5, W, 6.5, "F"); }
    const disc = (it.discounts || []).reduce((a, d) => a + d.valor, 0) + (it.adjustments || 0);
    doc.setFontSize(9);
    doc.text(String(it.driver).slice(0, 36) + (it.pendente ? " *" : ""), cols.nome, y);
    doc.text(fmtN(it.deliveries), cols.ent, y, { align: "right" });
    doc.text(fmtR(it.rate), cols.unit + 10, y, { align: "right" });
    doc.text(money(it.gross), cols.bruto + 8, y, { align: "right" });
    if (disc < 0) doc.setTextColor(190, 30, 45); else if (disc > 0) doc.setTextColor(20, 120, 60); else doc.setTextColor(150);
    doc.text(disc ? money(disc) : "—", cols.ajuste + 8, y, { align: "right" });
    doc.setTextColor(20); doc.setFont("helvetica", "bold");
    doc.text(money(it.net), cols.liq, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 6.5;
  });
  doc.setDrawColor(200); doc.line(L, y - 3, R, y - 3);

  // total
  if (y > 262) { doc.addPage(); y = 24; }
  y += 3;
  doc.setFillColor(20, 21, 26); doc.rect(110, y - 5, R - 110, 10, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Total líquido", 114, y + 1.5); doc.text(money(net), R - 2, y + 1.5, { align: "right" });
  doc.setTextColor(20); doc.setFont("helvetica", "normal");
  if (p.items.some((i) => i.pendente)) { doc.setFontSize(8); doc.setTextColor(120); doc.text("* motorista com entregas sem valor definido", L, y + 1.5); doc.setTextColor(20); }

  // rodapé com paginação
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130);
    doc.text(`${brDate(p.period_start)} a ${brDate(p.period_end)}`, L, 290);
    doc.text(`Página ${i} de ${pages}`, R, 290, { align: "right" });
  }
  doc.save(`fechamento-${p.period_start}-${p.period_end}.pdf`);
}

async function exportReceiptPdf(p: Payout, it: PayoutItem, baseName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  const L = 14, R = 196, W = R - L;
  const rows = it.breakdown || [];
  const cols = { bairro: L + 2, data: 96, ent: 130, unit: 158, sub: R - 2 };

  // cabeçalho
  doc.setFillColor(20, 21, 26); doc.rect(0, 0, 210, 30, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Recibo de entregas", L, 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(baseName || "", L, 22);
  doc.text(`Emitido em ${brDate(todayISO())}`, R, 22, { align: "right" });
  doc.setTextColor(20);

  // identificação
  let y = 42;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(String(it.driver), L, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100);
  y += 6; doc.text(`Período: ${brDate(p.period_start)} a ${brDate(p.period_end)}`, L, y);
  doc.text(`${fmtN(it.deliveries)} entregas`, R, y, { align: "right" });
  doc.setTextColor(20);

  const head = (yy: number) => {
    doc.setFillColor(238, 239, 242); doc.rect(L, yy - 5, W, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Bairro", cols.bairro, yy); doc.text("Data", cols.data, yy);
    doc.text("Entregas", cols.ent, yy, { align: "right" }); doc.text("R$/ent.", cols.unit, yy, { align: "right" }); doc.text("Subtotal", cols.sub, yy, { align: "right" });
    doc.setFont("helvetica", "normal");
  };

  y += 12; head(y); y += 8;
  rows.forEach((r, i) => {
    if (y > 270) { doc.addPage(); y = 20; head(y); y += 8; }
    if (i % 2) { doc.setFillColor(248, 248, 250); doc.rect(L, y - 4.5, W, 6.5, "F"); }
    doc.setFontSize(9);
    doc.text(r.bairro.slice(0, 38), cols.bairro, y); doc.text(brDate(r.data), cols.data, y);
    doc.text(fmtN(r.entregas), cols.ent, y, { align: "right" });
    doc.text(r.origem === "sem_valor" ? "sem valor" : fmtR(r.valorUnit), cols.unit, y, { align: "right" });
    doc.text(fmtR(r.subtotal), cols.sub, y, { align: "right" });
    y += 6.5;
  });
  if (!rows.length) { doc.setTextColor(120); doc.text("Sem detalhamento por bairro neste fechamento.", L + 2, y); doc.setTextColor(20); y += 6.5; }
  doc.setDrawColor(200); doc.line(L, y - 3, R, y - 3);

  // totais
  const lines: [string, number, boolean][] = [["Bruto", it.gross, false]];
  (it.discounts || []).forEach((d) => lines.push([`${d.valor < 0 ? "Desconto" : "Bônus"}: ${d.motivo}`.slice(0, 60), d.valor, false]));
  if (it.adjustments) lines.push([`Ajuste${it.note ? ` (${it.note})` : ""}`.slice(0, 60), it.adjustments, false]);
  if (y + lines.length * 6 + 20 > 280) { doc.addPage(); y = 20; }
  y += 5; doc.setFontSize(10);
  lines.forEach(([label, val]) => {
    doc.text(label, 120, y);
    if (val < 0) doc.setTextColor(190, 30, 45); else if (label !== "Bruto") doc.setTextColor(20, 120, 60);
    doc.text(fmtR(val), R - 2, y, { align: "right" });
    doc.setTextColor(20); y += 6;
  });
  y += 1; doc.setFillColor(20, 21, 26); doc.rect(116, y - 5, R - 116, 10, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Líquido a receber", 120, y + 1.5); doc.text(fmtR(it.net), R - 2, y + 1.5, { align: "right" });
  doc.setTextColor(20); doc.setFont("helvetica", "normal");
  if (it.pendente) { y += 14; doc.setFontSize(9); doc.setTextColor(190, 30, 45); doc.text("Atenção: há entregas sem valor definido; o total pode mudar após conferência.", L, y); doc.setTextColor(20); }

  // rodapé com paginação
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130);
    doc.text(`Página ${i} de ${pages}`, R, 290, { align: "right" });
    doc.text(String(it.driver), L, 290);
  }
  doc.save(`recibo-${it.driver.replace(/\s+/g, "_")}-${p.period_start}-${p.period_end}.pdf`);
}

function whatsappText(p: Payout, it: PayoutItem): string {
  const byBairro = new Map<string, { entregas: number; subtotal: number }>();
  for (const r of it.breakdown || []) {
    const cur = byBairro.get(r.bairro) || { entregas: 0, subtotal: 0 };
    cur.entregas += r.entregas; cur.subtotal += r.subtotal;
    byBairro.set(r.bairro, cur);
  }
  const lines = [
    `*Fechamento — ${it.driver}*`,
    `Período: ${brDate(p.period_start)} a ${brDate(p.period_end)}`,
    "",
    ...[...byBairro.entries()].map(([b, v]) => `📍 ${b}: ${fmtN(v.entregas)} entregas — ${fmtR(v.subtotal)}`),
    "",
    `Total de entregas: ${fmtN(it.deliveries)}`,
    `Bruto: ${fmtR(it.gross)}`,
  ];
  for (const d of it.discounts || []) lines.push(`${d.valor < 0 ? "➖" : "➕"} ${d.motivo}: ${fmtR(d.valor)}`);
  if (it.adjustments) lines.push(`Ajuste: ${fmtR(it.adjustments)}${it.note ? " (" + it.note + ")" : ""}`);
  if (it.pendente) lines.push("⚠️ há entregas sem valor definido — confira com o financeiro.");
  lines.push("", `*Líquido: ${fmtR(it.net)}*`);
  return lines.join("\n");
}

function DiscountForm({ initial, onChange }: { initial: PayoutDiscount[]; onChange: (list: PayoutDiscount[]) => void }) {
  const [list, setList] = useState<PayoutDiscount[]>(initial);
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");
  const [tipo, setTipo] = useState<"desconto" | "bonus">("desconto");
  const commit = (next: PayoutDiscount[]) => { setList(next); onChange(next); };
  const add = () => {
    const v = Math.abs(parseFloat(valor.replace(",", ".")));
    if (!motivo.trim() || !v) return;
    commit([...list, { motivo: motivo.trim(), valor: tipo === "desconto" ? -v : v }]);
    setMotivo(""); setValor("");
  };
  const total = list.reduce((a, d) => a + d.valor, 0);
  return (
    <div>
      <div className="tablewrap">
        <table className="drv adjTable">
          <thead><tr><th>Motivo</th><th className="r">Valor</th><th></th></tr></thead>
          <tbody>
            {list.map((d, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "normal" }}>{d.motivo}</td>
                <td className="r" style={{ color: d.valor < 0 ? "var(--bad)" : "var(--ok)", fontWeight: 600 }}>{fmtR(d.valor)}</td>
                <td><button className="btn small" onClick={() => commit(list.filter((_, j) => j !== i))}>Remover</button></td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={3} className="muted small">Nenhum item lançado.</td></tr>}
          </tbody>
          {!!list.length && <tfoot><tr><td><b>Total</b></td><td className="r"><b>{fmtR(total)}</b></td><td></td></tr></tfoot>}
        </table>
      </div>
      <form className="discForm" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as "desconto" | "bonus")} aria-label="Tipo">
          <option value="desconto">Desconto (−)</option>
          <option value="bonus">Bônus (+)</option>
        </select>
        <input placeholder="Motivo (ex.: avaria, bônus meta)" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo" />
        <input type="number" step={0.01} min={0} placeholder="Valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)} aria-label="Valor" />
        <button type="submit" className="btn primary">Adicionar</button>
      </form>
    </div>
  );
}

export default function Fechamento() {
  const { curBase, payouts, history, generatePayout, updatePayoutItem, updatePayoutDiscounts, setPayoutStatus, deletePayout, canEdit } = useDoca();
  const dialog = useDialog();
  const toast = useToast();
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());

  const openBreakdown = (p: Payout, it: PayoutItem) => {
    const rows = it.breakdown || [];
    const discTotal = (it.discounts || []).reduce((a, d) => a + d.valor, 0);
    const origemLabel = { dia_especial: "dia especial", bairro: "bairro", motorista: "motorista", sem_valor: "pendência" };
    dialog.open(
      `Detalhamento — ${it.driver}`,
      <div>
        <div className="bdSummary">
          <div><span>Entregas</span><b>{fmtN(it.deliveries)}</b></div>
          <div><span>Bruto</span><b>{fmtR(it.gross)}</b></div>
          <div><span>Descontos/bônus</span><b style={{ color: discTotal < 0 ? "var(--bad)" : discTotal > 0 ? "var(--ok)" : undefined }}>{fmtR(discTotal)}</b></div>
          <div><span>Ajuste</span><b>{fmtR(it.adjustments)}</b></div>
          <div><span>Líquido</span><b>{fmtR(it.net)}</b></div>
        </div>
        <div className="tablewrap">
          <table className="drv bdTable">
            <thead><tr><th>Bairro</th><th>Data</th><th className="r">Entregas</th><th className="r">R$/ent.</th><th>Origem</th><th className="r">Subtotal</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "normal" }}>{r.bairro}</td>
                  <td>{brDate(r.data)}</td>
                  <td className="r">{fmtN(r.entregas)}</td>
                  <td className="r">{r.origem === "sem_valor" ? <span className="muted">sem valor</span> : fmtR(r.valorUnit)}</td>
                  <td><span className={"stat " + (r.origem === "sem_valor" ? "rascunho" : "")}>{origemLabel[r.origem]}</span></td>
                  <td className="r"><b>{fmtR(r.subtotal)}</b></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="muted small">Sem detalhamento (fechamento anterior à tabela de preços por bairro).</td></tr>}
            </tbody>
            {!!rows.length && (
              <tfoot><tr>
                <td colSpan={2}><b>Total</b></td>
                <td className="r"><b>{fmtN(rows.reduce((a, r) => a + r.entregas, 0))}</b></td>
                <td></td><td></td>
                <td className="r"><b>{fmtR(rows.reduce((a, r) => a + r.subtotal, 0))}</b></td>
              </tr></tfoot>
            )}
          </table>
        </div>
        {!!(it.discounts || []).length && (
          <div className="bdDisc">
            {(it.discounts || []).map((d, i) => (
              <div key={i}><span>{d.valor < 0 ? "Desconto" : "Bônus"}: {d.motivo}</span><b style={{ color: d.valor < 0 ? "var(--bad)" : "var(--ok)" }}>{fmtR(d.valor)}</b></div>
            ))}
          </div>
        )}
      </div>,
      [
        { label: "Copiar resumo WhatsApp", onClick: () => copyText(whatsappText(p, it), toast) },
        { label: "Recibo em PDF", onClick: () => exportReceiptPdf(p, it, curBase?.name || "") },
        { label: "Voltar ao fechamento", cls: "primary", onClick: () => openPayout(p) },
      ]
    );
  };

  const openPayout = (p: Payout) => {
    const net = p.items.reduce((a, i) => a + i.net, 0);
    const gross = p.items.reduce((a, i) => a + i.gross, 0);
    const editable = canEdit && p.status !== "fechado";
    const foot = [];
    if (canEdit && p.status === "rascunho") foot.push({ label: "Marcar conferido", cls: "primary", onClick: () => { setPayoutStatus(p.id, "conferido"); dialog.close(); } });
    if (canEdit && p.status === "conferido") foot.push({ label: "Fechar (fica travado)", cls: "primary", onClick: () => { if (!confirm("Depois de fechado não é mais possível editar os valores. Confirmar?")) return; setPayoutStatus(p.id, "fechado"); dialog.close(); } });
    foot.push({ label: "Exportar CSV", onClick: () => exportPayoutCsv(p) });
    foot.push({ label: "Exportar PDF", onClick: () => exportPayoutPdf(p, curBase?.name || "") });
    if (canEdit && p.status !== "fechado") foot.push({ label: "Excluir", cls: "danger", onClick: () => { if (!confirm("Excluir este fechamento?")) return; deletePayout(p.id); dialog.close(); } });

    dialog.open(
      `Fechamento ${brDate(p.period_start)} – ${brDate(p.period_end)}`,
      <div>
        <div className="row" style={{ marginBottom: ".5rem" }}>
          <span className={"stat " + p.status}>{p.status}</span>
          {p.items.some((i) => i.pendente) && <span className="stat" style={{ color: "var(--bad)" }}>parcial — faltam valores</span>}
          <span className="spacer"></span>
          <b>{fmtR(net)}</b>
        </div>
        <div className="tablewrap">
          <table className="payout">
            <thead><tr><th>Motorista</th><th>Entregas</th><th>R$/entrega</th><th>Bruto</th><th>Descontos</th><th>Ajuste</th><th>Nota</th><th>Líquido</th><th></th></tr></thead>
            <tbody>
              {p.items.map((it, i) => {
                const discTotal = (it.discounts || []).reduce((a, d) => a + d.valor, 0);
                return (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}>
                    {it.driver}{it.pendente && <span title="Há entregas sem valor definido" style={{ color: "var(--bad)" }}> ⚠️</span>}
                  </td>
                  <td>{fmtN(it.deliveries)}</td>
                  <td>{fmtR(it.rate)}</td>
                  <td>{fmtR(it.gross)}</td>
                  <td>
                    <button
                      className="btn small"
                      disabled={!editable}
                      title="Ver/editar descontos e bônus itemizados"
                      onClick={() => {
                        let cur = p;
                        dialog.open(
                          `Descontos e bônus — ${it.driver}`,
                          <DiscountForm
                            initial={it.discounts || []}
                            onChange={(list) => {
                              updatePayoutDiscounts(p.id, i, list);
                              const t = list.reduce((a, d) => a + d.valor, 0);
                              cur = { ...cur, items: cur.items.map((x, j) => (j === i ? { ...x, discounts: list, net: +(x.gross + x.adjustments + t).toFixed(2) } : x)) };
                            }}
                          />,
                          [{ label: "Voltar ao fechamento", cls: "primary", onClick: () => openPayout(cur) }]
                        );
                      }}
                    >
                      {discTotal ? fmtR(discTotal) : "+ item"}
                    </button>
                  </td>
                  <td>
                    <input
                      type="number"
                      step={0.01}
                      defaultValue={it.adjustments}
                      disabled={!editable}
                      onBlur={(e) => updatePayoutItem(p.id, i, parseFloat(e.target.value) || 0, it.note)}
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={it.note || ""}
                      disabled={!editable}
                      style={{ textAlign: "left" }}
                      onBlur={(e) => updatePayoutItem(p.id, i, it.adjustments, e.target.value)}
                    />
                  </td>
                  <td><b>{fmtR(it.net)}</b></td>
                  <td><button className="btn small" onClick={() => openBreakdown(p, it)}>Detalhes</button></td>
                </tr>
              );})}
            </tbody>
            <tfoot><tr><td style={{ textAlign: "left" }}><b>Total</b></td><td></td><td></td><td>{fmtR(gross)}</td><td></td><td></td><td></td><td><b>{fmtR(net)}</b></td><td></td></tr></tfoot>
          </table>
        </div>
      </div>,
      foot
    );
  };

  return (
    <section className="pane active">
      <div className="panel">
        <div className="pageHead">
          <h2>Fechamento de pagamento</h2>
          <Dica>Calcula o repasse de cada motorista pelas entregas confirmadas no histórico, no período escolhido, usando a tabela de preços por motorista/bairro e os dias especiais cadastrados.</Dica>
        </div>
        <div className="form" style={{ margin: "1rem 0" }}>
          <label htmlFor="poStart">Início do período</label><input id="poStart" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <label htmlFor="poEnd">Fim do período</label><input id="poEnd" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button className="btn primary" disabled={!canEdit || !history.length} onClick={() => generatePayout(start, end)}>Gerar rascunho</button>
        <p className="small muted" style={{ marginTop: ".5rem" }}>Ajuste os valores em "Tabela de preços" (categoria Financeiro) antes de gerar.</p>
      </div>
      <div className="panel" style={{ marginTop: "1rem" }}>
        <h3>Fechamentos</h3>
        {payouts.length ? (
          payouts.map((p) => {
            const net = p.items.reduce((a, i) => a + i.net, 0);
            return (
              <div className="row" key={p.id} style={{ borderBottom: "1px solid var(--line)", padding: ".5rem 0" }}>
                <span><b>{brDate(p.period_start)} – {brDate(p.period_end)}</b></span>
                <span className={"stat " + p.status}>{p.status}</span>
                {p.items.some((i) => i.pendente) && <span className="stat" style={{ color: "var(--bad)" }}>parcial</span>}
                <span className="muted">{fmtR(net)}</span>
                <span className="spacer"></span>
                <button className="btn small" onClick={() => openPayout(p)}>Abrir</button>
              </div>
            );
          })
        ) : (
          <p className="muted">Nenhum fechamento gerado ainda.</p>
        )}
      </div>
    </section>
  );
}
