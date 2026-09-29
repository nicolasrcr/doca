import { useDoca } from "../hooks/DocaContext";
import { useToast, csvBlob, downloadBlob } from "../hooks/useToast";

export default function Cabine() {
  const { curBase, history, drivers, occRows } = useDoca();
  const toast = useToast();

  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const exportHist = () => {
    if (!history.length) { toast("Nenhum dia salvo no histórico"); return; }
    const lines = [["Data", "Motorista", "Pacotes", "Entregues", "Problemas", "Não entregues", "% entregue"].map(q).join(";")];
    for (const h of history)
      for (const m of h.motoristas)
        lines.push([h.data, m.n, m.t, m.e, m.p, m.q, m.t ? (m.e / m.t * 100).toFixed(1).replace(".", ",") : "0"].map(q).join(";"));
    downloadBlob(`doca-${curBase?.id}-historico-completo.csv`, csvBlob(lines));
  };

  const exportDrv = () => {
    if (!drivers.length) { toast("Nenhum motorista cadastrado"); return; }
    const lines = [["Nome", "Apelidos", "Placa", "Veículo", "Valor/entrega", "Ativo"].map(q).join(";")];
    for (const d of drivers) lines.push([d.name, (d.aliases || []).join(", "), d.placa, d.veiculo, d.rate ?? "", d.active !== false ? "sim" : "não"].map(q).join(";"));
    downloadBlob(`doca-${curBase?.id}-motoristas.csv`, csvBlob(lines));
  };

  const exportOcc = () => {
    const rows = occRows();
    if (!rows.length) { toast("Nenhuma ocorrência"); return; }
    const lines = [["Código", "Motorista", "Motivo", "Nota", "Responsável", "Status"].map(q).join(";")];
    for (const r of rows) lines.push([r.code, r.driver, r.motivo, r.nota, r.responsavel, r.resolvido ? "resolvida" : "pendente"].map(q).join(";"));
    downloadBlob(`doca-${curBase?.id}-ocorrencias.csv`, csvBlob(lines));
  };

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Cabine de dados</h2>
        <p className="muted small">Exportação bruta para quem quiser cruzar os números em outra ferramenta (Excel, Power BI etc.).</p>
        <div className="row" style={{ marginTop: ".75rem" }}>
          <button className="btn primary" onClick={exportHist}>Exportar histórico completo (CSV)</button>
          <button className="btn" onClick={exportDrv}>Exportar motoristas cadastrados (CSV)</button>
          <button className="btn" onClick={exportOcc}>Exportar ocorrências (CSV)</button>
        </div>
      </div>
    </section>
  );
}
