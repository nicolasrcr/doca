import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useToast, downloadBlob, copyText } from "../hooks/useToast";
import { readRows, prepare } from "../lib/parse";
import { fmtN, todayISO } from "../lib/format";
import { contextoWhats } from "../lib/share";
import type { SheetTable } from "../lib/types";
import { Dica } from "../components/ui";

interface AgingRow {
  cod: string;
  aging: string;
  dias: number; // extraído de "Exceed N day(s) with no track"
  unidade: string;
  regional: string;
  estacao: string;
  baseRemetente: string;
  regionalRecente: string;
}

function agingDays(label: string): number {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function rowsFromSheet(t: SheetTable): AgingRow[] {
  const out: AgingRow[] = [];
  const seen = new Set<string>();
  for (const r of t.data) {
    const cod = t.map.cod >= 0 ? (r[t.map.cod] || "").trim() : "";
    if (!cod || seen.has(cod)) continue;
    seen.add(cod);
    const aging = t.map.aging >= 0 ? (r[t.map.aging] || "").trim() : "";
    out.push({
      cod,
      aging: aging || "Sem classificação",
      dias: agingDays(aging),
      unidade: t.map.unidade_resp >= 0 ? (r[t.map.unidade_resp] || "").trim() : "",
      regional: t.map.regional_resp >= 0 ? (r[t.map.regional_resp] || "").trim() : (t.map.regional_remetente >= 0 ? (r[t.map.regional_remetente] || "").trim() : ""),
      estacao: t.map.nome_estacao >= 0 ? (r[t.map.nome_estacao] || "").trim() : "",
      baseRemetente: t.map.base_remetente >= 0 ? (r[t.map.base_remetente] || "").trim() : "",
      regionalRecente: t.map.regional_recente >= 0 ? (r[t.map.regional_recente] || "").trim() : "",
    });
  }
  return out;
}

export default function PacotesParados() {
  const { curBase, saveOccurrence, canEdit } = useDoca();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetTable | null>(null);
  const [filterUnidade, setFilterUnidade] = useState("");
  const [minDias, setMinDias] = useState(0);

  const staleDays = curBase?.stale_days ?? 3;

  const handleFile = async (f: File) => {
    try {
      const rows = await readRows(f);
      setSheet(
        prepare(rows, ["cod", "aging", "unidade_resp", "regional_resp", "regional_remetente", "nome_estacao", "base_remetente", "regional_recente"], { cod: 0 })
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui ler o arquivo");
    }
  };

  const rows = useMemo(() => (sheet ? rowsFromSheet(sheet) : []), [sheet]);

  const unidades = useMemo(() => [...new Set(rows.map((r) => r.unidade).filter(Boolean))].sort(), [rows]);
  const agingLabels = useMemo(
    () => [...new Set(rows.map((r) => r.aging))].sort((a, b) => agingDays(a) - agingDays(b)),
    [rows]
  );

  // crosstab unidade x aging (replica a tabela dinâmica do JMS)
  const crosstab = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = r.unidade || "(vazio)";
      if (!m.has(key)) m.set(key, {});
      const bucket = m.get(key)!;
      bucket[r.aging] = (bucket[r.aging] || 0) + 1;
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [rows]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const label of agingLabels) t[label] = rows.filter((r) => r.aging === label).length;
    return t;
  }, [rows, agingLabels]);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => !filterUnidade || r.unidade === filterUnidade)
        .filter((r) => r.dias >= minDias)
        .sort((a, b) => b.dias - a.dias),
    [rows, filterUnidade, minDias]
  );

  const exportCsv = () => {
    const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Remessa", "Aging", "Dias", "Unidade responsável", "Regional", "Estação", "Base remetente"].map(q).join(";")];
    filtered.forEach((r) => lines.push([r.cod, r.aging, r.dias, r.unidade, r.regional, r.estacao, r.baseRemetente].map(q).join(";")));
    downloadBlob(`pacotes-parados-${new Date().toISOString().slice(0, 10)}.csv`, new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  };

  const whatsText = () => {
    const critico = filtered.filter((r) => r.dias >= staleDays);
    let s = `*Pacotes parados*\n${contextoWhats(curBase?.name || "", todayISO())}\n`;
    s += `Total monitorado: ${fmtN(rows.length)}\n⚠️ Parados há ${staleDays}+ dias: ${fmtN(critico.length)}\n\n`;
    for (const label of agingLabels) s += `${label}: ${fmtN(totals[label])}\n`;
    return s;
  };

  return (
    <section className="pane active">
      {!sheet ? (
        <div className="panel">
          <div className="pageHead">
            <h2>Pacotes parados (aging)</h2>
            <Dica>Importe o relatório de rastreamento/aging do JMS (coluna "Aging" com valores como "Exceed 1 day with no
            track"). O Doca monta automaticamente o mesmo cruzamento que você faria numa tabela dinâmica no Excel —
            por unidade responsável e faixa de dias sem rastreio.</Dica>
          </div>
          <div className="drop" style={{ maxWidth: 420 }}>
            <h3>Relatório de aging <span className="tag">JMS · Monitoramento de movimentação</span></h3>
            <input type="file" accept=".csv,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>
        </div>
      ) : (
        <div>
          <div className="kpis" style={{ marginBottom: "1rem" }}>
            <div className="kpi"><b>{fmtN(rows.length)}</b><span>pacotes no relatório</span></div>
            <div className="kpi"><b style={{ color: "var(--bad)" }}>{fmtN(rows.filter((r) => r.dias >= staleDays).length)}</b><span>parados há {staleDays}+ dias (limite da base)</span></div>
            <div className="kpi"><b>{unidades.length}</b><span>unidades responsáveis</span></div>
            <div className="kpi goal"><b>{agingLabels.length ? agingLabels[agingLabels.length - 1] : "—"}</b><span>pior faixa encontrada</span></div>
          </div>

          <div className="panel" style={{ marginBottom: "1rem" }}>
            <h3>Cruzamento — unidade responsável × faixa de aging</h3>
            <div className="tablewrap">
              <table className="drv">
                <thead>
                  <tr>
                    <th>Unidade responsável</th>
                    {agingLabels.map((l) => <th key={l}>{l}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {crosstab.map(([unidade, bucket]) => (
                    <tr key={unidade}>
                      <td style={{ textAlign: "left" }}>{unidade}</td>
                      {agingLabels.map((l) => <td key={l}>{bucket[l] ? fmtN(bucket[l]) : "—"}</td>)}
                      <td><b>{fmtN(Object.values(bucket).reduce((a, v) => a + v, 0))}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ textAlign: "left" }}><b>Total geral</b></td>
                    {agingLabels.map((l) => <td key={l}><b>{fmtN(totals[l])}</b></td>)}
                    <td><b>{fmtN(rows.length)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="toolbar">
              <h3 style={{ margin: 0 }}>Detalhe</h3>
              <span className="spacer"></span>
              <select value={filterUnidade} onChange={(e) => setFilterUnidade(e.target.value)}>
                <option value="">Todas as unidades</option>
                {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <label className="small">Mín. dias parado <input type="number" min={0} value={minDias} onChange={(e) => setMinDias(Number(e.target.value) || 0)} style={{ width: 60 }} /></label>
              <button className="btn small" onClick={exportCsv}>Exportar CSV</button>
              <button className="btn small" onClick={() => copyText(whatsText(), toast)}>📋 Resumo WhatsApp</button>
              <button className="btn small" onClick={() => setSheet(null)}>Trocar arquivo</button>
            </div>
            <div className="tablewrap">
              <table className="drv">
                <thead><tr><th>Remessa</th><th>Aging</th><th>Unidade</th><th>Regional</th><th>Estação</th><th>Base remetente</th><th></th></tr></thead>
                <tbody>
                  {filtered.slice(0, 300).map((r) => (
                    <tr key={r.cod}>
                      <td className="mono">{r.cod}</td>
                      <td><span className={"stat " + (r.dias >= staleDays ? "" : "")} style={{ color: r.dias >= staleDays ? "var(--bad)" : r.dias >= 1 ? "var(--warn)" : "var(--ok)" }}>{r.aging}</span></td>
                      <td>{r.unidade}</td>
                      <td>{r.regional}</td>
                      <td>{r.estacao}</td>
                      <td>{r.baseRemetente}</td>
                      <td>
                        {canEdit && (
                          <button
                            className="btn small"
                            onClick={() => {
                              const nota = prompt(`Tratativa para o pacote ${r.cod} (${r.aging}):`);
                              if (nota == null) return;
                              saveOccurrence({
                                base_id: curBase?.id || "",
                                code: r.cod,
                                driver: r.unidade || "Sem unidade",
                                motivo: r.aging,
                                nota,
                                responsavel: "",
                                resolvido: false,
                              });
                            }}
                          >
                            Tratativa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 300 && <p className="muted small">Mostrando os 300 primeiros de {fmtN(filtered.length)} — refine o filtro para ver o resto.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
