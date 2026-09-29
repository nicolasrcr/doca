import { useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useDialog } from "../hooks/useDialog";
import type { Occurrence, OccurrenceStatus } from "../lib/types";

const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  aberto: "Aberto",
  tratando: "Em tratativa",
  barrado: "Barrado",
  devolvido: "Devolvido",
  resolvido: "Resolvido",
};
const STATUS_CLASS: Record<OccurrenceStatus, string> = {
  aberto: "bad",
  tratando: "warn",
  barrado: "warn",
  devolvido: "warn",
  resolvido: "ok",
};

export default function Clientes() {
  const { occRows, saveOccurrence, canEdit } = useDoca();
  const dialog = useDialog();
  const [showResolved, setShowResolved] = useState(false);

  const statusOf = (r: Occurrence): OccurrenceStatus => r.status || (r.resolvido ? "resolvido" : "aberto");
  const rows = occRows().filter((r) => showResolved || statusOf(r) !== "resolvido");

  const openTreat = (row: Occurrence) => {
    let nota = row.nota || "";
    let responsavel = row.responsavel || "";
    let status = statusOf(row);
    dialog.open(
      `Tratativa — ${row.code}`,
      <div>
        <p className="muted small">{row.driver} · {row.motivo || "sem motivo informado"}</p>
        <div className="form">
          <label htmlFor="occNota">Nota</label>
          <textarea id="occNota" rows={3} defaultValue={nota} onChange={(e) => (nota = e.target.value)} />
          <label htmlFor="occResp">Responsável</label>
          <input id="occResp" defaultValue={responsavel} onChange={(e) => (responsavel = e.target.value)} />
          <label htmlFor="occStatus">Status</label>
          <select id="occStatus" defaultValue={status} onChange={(e) => (status = e.target.value as OccurrenceStatus)}>
            {(Object.keys(STATUS_LABEL) as OccurrenceStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>,
      [
        {
          label: "Salvar",
          cls: "primary",
          onClick: () => {
            saveOccurrence({ ...row, nota: nota.trim(), responsavel: responsavel.trim(), status, resolvido: status === "resolvido" });
            dialog.close();
          },
        },
      ]
    );
  };

  return (
    <section className="pane active">
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Ocorrências</h2>
          <span className="spacer"></span>
          <label className="inline small"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> mostrar resolvidas</label>
        </div>
        <p className="muted small">Pacotes com problema no dia carregado, mais qualquer ocorrência já registrada. Cada uma pode receber uma tratativa (nota, responsável) e um status — aberto, em tratativa, barrado, devolvido ou resolvido.</p>
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Código</th><th>Motorista</th><th>Motivo</th><th>Tratativa</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.length ? rows.map((r) => {
                const st = statusOf(r);
                return (
                <tr key={r.code}>
                  <td style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}>{r.code}</td>
                  <td>{r.driver}</td>
                  <td>{r.motivo || "—"}</td>
                  <td>{r.nota || "—"}{r.responsavel ? <span className="muted small"> ({r.responsavel})</span> : null}</td>
                  <td><span className={"badge " + STATUS_CLASS[st]}>{STATUS_LABEL[st]}</span></td>
                  <td>{canEdit && <button className="btn small" onClick={() => openTreat(r)}>Registrar tratativa</button>}</td>
                </tr>
              );}) : (
                <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: "1rem" }}>Nenhuma ocorrência {showResolved ? "" : "pendente"}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
