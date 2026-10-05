import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { brDate, fmtN, fmtPct, fmtR } from "../lib/format";
import { Dica } from "../components/ui";
import {
  ChartCard, ColumnChart, DataTable, HBars, LineChart, TipRow, TipTitle, VizRoot,
  type ColDatum, type HBarDatum, type LinePoint,
} from "../components/viz/Viz";

const curto = (iso: string) => iso.slice(8) + "/" + iso.slice(5, 7);

export default function Historico() {
  const { curBase, history, deleteDay, canEdit, payouts } = useDoca();
  const [period, setPeriod] = useState("30");

  const incompletos = useMemo(() => history.filter((h) => h.carta_ok === false), [history]);
  const H = useMemo(() => {
    const completos = history.filter((h) => h.carta_ok !== false);
    const per = parseInt(period, 10);
    return per ? completos.slice(-per) : completos.slice();
  }, [history, period]);
  const meta = curBase ? curBase.meta / 100 : 0.95;

  const pagoPorMotorista = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payouts) if (p.status === "fechado") for (const it of p.items) m.set(it.driver, (m.get(it.driver) || 0) + it.net);
    return m;
  }, [payouts]);

  const rank = useMemo(() => {
    const agg = new Map<string, { n: string; dias: number; t: number; e: number; p: number; abaixo: number }>();
    for (const h of H)
      for (const m of h.motoristas) {
        const a = agg.get(m.n) || { n: m.n, dias: 0, t: 0, e: 0, p: 0, abaixo: 0 };
        a.dias++; a.t += m.t; a.e += m.e; a.p += m.p;
        if (m.t && m.e / m.t < (h.meta || curBase?.meta || 95) / 100) a.abaixo++;
        agg.set(m.n, a);
      }
    return [...agg.values()].map((a) => ({ ...a, pct: a.t ? a.e / a.t : 0 })).sort((a, b) => b.pct - a.pct || b.t - a.t);
  }, [H, curBase]);

  if (!curBase) return null;

  const linha: LinePoint[] = H.map((h) => ({
    label: curto(h.data), value: h.total ? h.entregues / h.total : null,
    tip: <><TipTitle>{brDate(h.data)}</TipTitle><TipRow label="Entregues" value={`${fmtN(h.entregues)} de ${fmtN(h.total)}`} /></>,
  }));
  const sla: LinePoint[] = H.map((h) => ({
    label: curto(h.data), value: h.sla_total ? (h.sla_ok || 0) / h.sla_total : null,
    tip: <><TipTitle>{brDate(h.data)}</TipTitle><TipRow label="No prazo" value={h.sla_total ? fmtPct((h.sla_ok || 0) / h.sla_total) : "sem dado"} /></>,
  }));
  const coleta: LinePoint[] = H.map((h) => ({
    label: curto(h.data), value: h.coleta_total ? (h.coleta_feita || 0) / h.coleta_total : null,
    tip: <><TipTitle>{brDate(h.data)}</TipTitle><TipRow label="Coletas feitas" value={h.coleta_total ? fmtPct((h.coleta_feita || 0) / h.coleta_total) : "sem dado"} /></>,
  }));
  const devol: LinePoint[] = H.map((h) => ({
    label: curto(h.data), value: h.total ? (h.devolucao || 0) / h.total : null,
    tip: <><TipTitle>{brDate(h.data)}</TipTitle><TipRow label="Devolução" value={h.total ? fmtPct((h.devolucao || 0) / h.total) : "—"} /></>,
  }));
  const temSla = sla.some((p) => p.value != null);
  const temColeta = coleta.some((p) => p.value != null);
  const temDevol = devol.some((p) => p.value != null && p.value > 0);
  const colunas: ColDatum[] = H.map((h) => ({
    label: curto(h.data), parts: [h.entregues, h.problemas, Math.max(0, h.total - h.entregues - h.problemas), 0],
    tip: <><TipTitle>{brDate(h.data)}</TipTitle><TipRow color="var(--v1)" label="Entregues" value={fmtN(h.entregues)} /><TipRow color="var(--v2)" label="Com problema" value={fmtN(h.problemas)} /><TipRow color="var(--v-other)" label="Não entregues" value={fmtN(Math.max(0, h.total - h.entregues - h.problemas))} /></>,
  }));
  const ranking: HBarDatum[] = rank.slice(0, 12).map((r) => ({
    label: r.n, value: r.pct, text: fmtPct(r.pct), destaque: r.pct < (curBase.alerta ?? 70) / 100,
    tip: <><TipTitle>{r.n}</TipTitle><TipRow label="Entregues" value={`${fmtN(r.e)} de ${fmtN(r.t)}`} /><TipRow label="Dias abaixo da meta" value={`${r.abaixo} de ${r.dias}`} /></>,
  }));

  return (
    <section className="pane active">
      <div className="pageHead">
        <h2>Histórico e ranking</h2>
        <Dica>Só entram os dias com Carta de porte. Os gráficos usam os dias salvos da base {curBase.name}.</Dica>
        <span className="spacer"></span>
        <select aria-label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">7 dias</option>
          <option value="14">14 dias</option>
          <option value="30">30 dias</option>
          <option value="90">90 dias</option>
          <option value="0">Tudo</option>
        </select>
      </div>

      {incompletos.length > 0 && (
        <div className="warnbox" style={{ marginBottom: ".8rem" }}>{incompletos.length} dia{incompletos.length > 1 ? "s" : ""} sem Carta de porte ficaram de fora dos gráficos.</div>
      )}

      {H.length === 0 ? (
        <div className="empty"><h3>Nenhum dia salvo ainda</h3><p>Importe as planilhas do JMS para ver o histórico.</p></div>
      ) : (
        <VizRoot>
          <div className="viz-grid">
            <div className="viz-span-12" style={{ gridColumn: "1 / -1" }}>
              <ChartCard title="% entregue por dia" legend={<><span><i style={{ background: "var(--v1)" }} />Entregues</span><span><i className="ln" style={{ background: "var(--v2)" }} />Meta</span></>}
                table={<DataTable cols={["Dia", "% entregue", "Entregues", "Pacotes"]} rows={H.map((h) => [brDate(h.data), fmtPct(h.total ? h.entregues / h.total : 0), fmtN(h.entregues), fmtN(h.total)])} />}>
                <LineChart name="Percentual entregue por dia" points={linha} refLine={{ value: meta, label: `meta ${fmtPct(meta)}` }} format={(x) => `${Math.round(x * 100)}%`} />
              </ChartCard>
            </div>
          </div>
          <div className="viz-grid">
            <div className="viz-span-6">
              <ChartCard title="Pacotes por dia" caption="Mostra se a queda foi por volume alto ou por operação ruim"
                legend={<><span><i style={{ background: "var(--v1)" }} />Entregues</span><span><i style={{ background: "var(--v2)" }} />Com problema</span><span><i style={{ background: "var(--v-other)" }} />Não entregues</span></>}
                table={<DataTable cols={["Dia", "Entregues", "Com problema", "Não entregues"]} rows={H.map((h) => [brDate(h.data), fmtN(h.entregues), fmtN(h.problemas), fmtN(Math.max(0, h.total - h.entregues - h.problemas))])} />}>
                <ColumnChart name="Pacotes por dia" data={colunas} series={[{ name: "Entregues", color: "var(--v1)" }, { name: "Com problema", color: "var(--v2)" }, { name: "Não entregues", color: "var(--v-other)" }, { name: "", color: "var(--v4)" }]} />
              </ChartCard>
            </div>
            <div className="viz-span-6">
              <ChartCard title="Ranking de motoristas" caption="% entregue no período"
                table={<DataTable cols={["#", "Motorista", "Pacotes", "% entregue", "Dias abaixo da meta", "Problemas", "Pago (fechado)"]} rows={rank.map((r, i) => [i + 1, r.n, fmtN(r.t), fmtPct(r.pct), r.abaixo, fmtN(r.p), pagoPorMotorista.has(r.n) ? fmtR(pagoPorMotorista.get(r.n)) : "—"])} />}>
                <HBars name="Percentual entregue por motorista no período" data={ranking} refValue={meta} refLabel={`meta ${Math.round(meta * 100)}%`} />
              </ChartCard>
            </div>
          </div>
          {(temSla || temColeta || temDevol) && (
            <div className="viz-grid">
              {temSla && (
                <div className="viz-span-4">
                  <ChartCard title="No prazo (24h)" table={<DataTable cols={["Dia", "No prazo"]} rows={H.map((h) => [brDate(h.data), h.sla_total ? fmtPct((h.sla_ok || 0) / h.sla_total) : "—"])} />}>
                    <LineChart name="Entregas no prazo por dia" points={sla} format={(x) => `${Math.round(x * 100)}%`} height={170} />
                  </ChartCard>
                </div>
              )}
              {temColeta && (
                <div className="viz-span-4">
                  <ChartCard title="Coletas feitas" table={<DataTable cols={["Dia", "Coletas"]} rows={H.map((h) => [brDate(h.data), h.coleta_total ? fmtPct((h.coleta_feita || 0) / h.coleta_total) : "—"])} />}>
                    <LineChart name="Coletas feitas por dia" points={coleta} format={(x) => `${Math.round(x * 100)}%`} height={170} />
                  </ChartCard>
                </div>
              )}
              {temDevol && (
                <div className="viz-span-4">
                  <ChartCard title="Devolução" table={<DataTable cols={["Dia", "Devolução"]} rows={H.map((h) => [brDate(h.data), h.total ? fmtPct((h.devolucao || 0) / h.total) : "—"])} />}>
                    <LineChart name="Devolução por dia" points={devol} format={(x) => `${(x * 100).toFixed(1).replace(".", ",")}%`} height={170} color="var(--v2)" />
                  </ChartCard>
                </div>
              )}
            </div>
          )}
        </VizRoot>
      )}

      {history.length > 0 && (
        <details className="cargas" style={{ marginTop: "1rem" }}>
          <summary>Dias salvos ({history.length})</summary>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Dia</th><th>% entregue</th><th>Pacotes</th><th></th></tr></thead>
              <tbody>
                {history.slice().reverse().map((h) => (
                  <tr key={h.data}>
                    <td>{brDate(h.data)}</td>
                    <td>{h.carta_ok === false ? <span className="badge warn">sem Carta de porte</span> : fmtPct(h.total ? h.entregues / h.total : 0)}</td>
                    <td>{fmtN(h.total)}</td>
                    <td>{canEdit && <button className="btn small" onClick={() => { if (confirm(`Apagar o dia ${brDate(h.data)}?`)) void deleteDay(h.data); }}>Apagar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
