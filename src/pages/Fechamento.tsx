import { useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useDialog } from "../hooks/useDialog";
import { downloadBlob, copyText, useToast } from "../hooks/useToast";
import { brDate, fmtN, fmtR, todayISO } from "../lib/format";
import type { Payout, PayoutItem } from "../lib/types";

function exportPayoutCsv(p: Payout) {
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["Motorista", "Entregas", "R$/entrega", "Bruto", "Ajuste", "Nota", "Líquido"].map(q).join(";")];
  p.items.forEach((it) => lines.push([it.driver, it.deliveries, it.rate, it.gross, it.adjustments, it.note || "", it.net].map(q).join(";")));
  downloadBlob(`fechamento-${p.period_start}-${p.period_end}.csv`, new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
}

async function exportPayoutPdf(p: Payout, baseName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text(`Fechamento — ${baseName}`, 14, 16);
  doc.setFontSize(10); doc.text(`Período: ${brDate(p.period_start)} a ${brDate(p.period_end)}  |  status: ${p.status}`, 14, 23);
  let y = 34; doc.setFontSize(9);
  doc.text("Motorista", 14, y); doc.text("Entregas", 100, y, { align: "right" }); doc.text("R$/entrega", 130, y, { align: "right" }); doc.text("Líquido", 190, y, { align: "right" });
  y += 4; doc.line(14, y, 196, y); y += 5;
  let total = 0;
  p.items.forEach((it) => {
    if (y > 280) { doc.addPage(); y = 16; }
    doc.text(String(it.driver).slice(0, 40), 14, y); doc.text(fmtN(it.deliveries), 100, y, { align: "right" });
    doc.text(fmtR(it.rate), 130, y, { align: "right" }); doc.text(fmtR(it.net), 190, y, { align: "right" });
    total += it.net; y += 6;
  });
  y += 2; doc.line(14, y, 196, y); y += 6; doc.setFontSize(11); doc.text(`Total: ${fmtR(total)}`, 190, y, { align: "right" });
  doc.save(`fechamento-${p.period_start}-${p.period_end}.pdf`);
}

async function exportReceiptPdf(p: Payout, it: PayoutItem, baseName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text(`Recibo de entregas — ${baseName}`, 14, 16);
  doc.setFontSize(10); doc.text(`${it.driver}  |  ${brDate(p.period_start)} a ${brDate(p.period_end)}`, 14, 23);
  let y = 34; doc.setFontSize(9);
  doc.text("Bairro", 14, y); doc.text("Data", 90, y); doc.text("Entregas", 130, y, { align: "right" }); doc.text("R$/ent.", 155, y, { align: "right" }); doc.text("Subtotal", 190, y, { align: "right" });
  y += 4; doc.line(14, y, 196, y); y += 5;
  (it.breakdown || []).forEach((r) => {
    if (y > 280) { doc.addPage(); y = 16; }
    doc.text(r.bairro.slice(0, 34), 14, y); doc.text(brDate(r.data), 90, y);
    doc.text(fmtN(r.entregas), 130, y, { align: "right" }); doc.text(fmtR(r.valorUnit), 155, y, { align: "right" });
    doc.text(fmtR(r.subtotal), 190, y, { align: "right" }); y += 6;
  });
  y += 2; doc.line(14, y, 196, y); y += 6;
  doc.text(`Bruto: ${fmtR(it.gross)}`, 190, y, { align: "right" }); y += 6;
  (it.discounts || []).forEach((d) => { doc.text(`${d.motivo}: ${fmtR(d.valor)}`, 190, y, { align: "right" }); y += 6; });
  if (it.adjustments) { doc.text(`Ajuste (${it.note || "manual"}): ${fmtR(it.adjustments)}`, 190, y, { align: "right" }); y += 6; }
  doc.setFontSize(11); doc.text(`Líquido: ${fmtR(it.net)}`, 190, y, { align: "right" });
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

export default function Fechamento() {
  const { curBase, payouts, history, generatePayout, updatePayoutItem, updatePayoutDiscounts, setPayoutStatus, deletePayout, canEdit } = useDoca();
  const dialog = useDialog();
  const toast = useToast();
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());

  const openBreakdown = (p: Payout, it: PayoutItem) => {
    dialog.open(
      `Detalhamento — ${it.driver}`,
      <div>
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Bairro</th><th>Data</th><th>Entregas</th><th>R$/ent.</th><th>Origem</th><th>Subtotal</th></tr></thead>
            <tbody>
              {(it.breakdown || []).map((r, i) => (
                <tr key={i}>
                  <td>{r.bairro}</td>
                  <td>{brDate(r.data)}</td>
                  <td>{fmtN(r.entregas)}</td>
                  <td>{r.origem === "sem_valor" ? <span className="muted">sem valor</span> : fmtR(r.valorUnit)}</td>
                  <td className="muted small">{{ dia_especial: "dia especial", bairro: "bairro", motorista: "motorista", sem_valor: "pendência" }[r.origem]}</td>
                  <td>{fmtR(r.subtotal)}</td>
                </tr>
              ))}
              {!(it.breakdown || []).length && <tr><td colSpan={6} className="muted small">Sem detalhamento (fechamento anterior à tabela de preços por bairro).</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: ".75rem" }}>
          <button className="btn small" onClick={() => copyText(whatsappText(p, it), toast)}>📋 Copiar resumo WhatsApp</button>
          <button className="btn small" onClick={() => exportReceiptPdf(p, it, curBase?.name || "")}>Recibo em PDF</button>
        </div>
      </div>,
      []
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
                        const motivo = prompt("Motivo do desconto/bônus (deixe em branco para cancelar):");
                        if (!motivo) return;
                        const valorStr = prompt("Valor (negativo = desconto, positivo = bônus):", "0");
                        const valor = parseFloat(valorStr || "0");
                        if (!valor) return;
                        updatePayoutDiscounts(p.id, i, [...(it.discounts || []), { motivo, valor }]);
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
        <h2>Fechamento de pagamento</h2>
        <p className="muted">Calcula o repasse de cada motorista pelas entregas confirmadas no histórico, no período escolhido, usando a tabela de preços por motorista/bairro e os dias especiais cadastrados.</p>
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
