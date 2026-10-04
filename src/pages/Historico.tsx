import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { brDate, fmtN, fmtPct, fmtR } from "../lib/format";
import { level } from "../lib/compute";

export default function Historico() {
  const { curBase, history, deleteDay, canEdit, payouts } = useDoca();
  const [period, setPeriod] = useState("30");

  const payoutsByDriver = useMemo(() => {
    const agg = new Map<string, { pago: number; entregas: number; fechamentos: number }>();
    for (const p of payouts) {
      if (p.status !== "fechado") continue;
      for (const it of p.items) {
        if (!agg.has(it.driver)) agg.set(it.driver, { pago: 0, entregas: 0, fechamentos: 0 });
        const a = agg.get(it.driver)!;
        a.pago += it.net; a.entregas += it.deliveries; a.fechamentos++;
      }
    }
    return [...agg.entries()].map(([n, v]) => ({ n, ...v })).sort((a, b) => b.pago - a.pago);
  }, [payouts]);

  const incompletos = useMemo(() => history.filter((h) => h.carta_ok === false), [history]);
  const H = useMemo(() => {
    const completos = history.filter((h) => h.carta_ok !== false);
    const per = parseInt(period, 10);
    return per ? completos.slice(-per) : completos.slice();
  }, [history, period]);

  const meta = curBase ? curBase.meta / 100 : 0.95;
  const alerta = curBase ? curBase.alerta / 100 : 0.7;

  const chart = useMemo(() => {
    if (!H.length) return null;
    const W = Math.max(560, H.length * 44), Ht = 240, pl = 44, pr = 16, pt = 16, pb = 36;
    const minY = Math.min(0.6, ...H.map((h) => (h.total ? h.entregues / h.total : 0))) - 0.02, maxY = 1;
    const x = (i: number) => pl + (H.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (H.length - 1));
    const y = (v: number) => pt + ((maxY - v) / (maxY - minY)) * (Ht - pt - pb);
    const pts = H.map((h, i) => [x(i), y(h.total ? h.entregues / h.total : 0), h] as const);
    const grid: { v: number; yy: number }[] = [];
    for (let v = Math.ceil((minY * 20)) / 20; v <= 1.0001; v += 0.05) grid.push({ v, yy: y(v) });
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return { W, Ht, pl, pr, minY, maxY, grid, path, pts, metaY: y(meta) };
  }, [H, meta]);

  const rank = useMemo(() => {
    const agg = new Map<string, { n: string; dias: number; t: number; e: number; p: number; abaixo: number }>();
    for (const h of H)
      for (const m of h.motoristas) {
        if (!agg.has(m.n)) agg.set(m.n, { n: m.n, dias: 0, t: 0, e: 0, p: 0, abaixo: 0 });
        const a = agg.get(m.n)!;
        a.dias++; a.t += m.t; a.e += m.e; a.p += m.p;
        if (m.t && m.e / m.t < (h.meta || curBase?.meta || 95) / 100) a.abaixo++;
      }
    return [...agg.values()].map((a) => ({ ...a, pct: a.t ? a.e / a.t : 0 })).sort((a, b) => b.pct - a.pct || b.t - a.t);
  }, [H, curBase]);

  // Volume por dia (empilhado): mostra se a queda de % é por operação ruim ou por pico de volume.
  const volumeChart = useMemo(() => {
    if (!H.length) return null;
    const W = Math.max(560, H.length * 44), Ht = 220, pl = 44, pr = 16, pt = 16, pb = 36;
    const maxT = Math.max(1, ...H.map((h) => h.total));
    const slot = (W - pl - pr) / H.length;
    const bw = Math.min(28, slot - 8);
    const scaleY = (v: number) => (v / maxT) * (Ht - pt - pb);
    const base = Ht - pb;
    const bars = H.map((h, i) => {
      const notEntregue = Math.max(0, h.total - h.entregues - h.problemas);
      return {
        h,
        xx: pl + i * slot + (slot - bw) / 2,
        eH: scaleY(h.entregues),
        pH: scaleY(h.problemas),
        nH: scaleY(notEntregue),
      };
    });
    const step = Math.max(1, Math.ceil(maxT / 4));
    const grid: { v: number; yy: number }[] = [];
    for (let v = 0; v <= maxT + 1e-9; v += step) grid.push({ v, yy: base - scaleY(v) });
    return { W, Ht, pl, pr, base, bars, grid };
  }, [H]);

  // Tendência de coleta e devolução — dados que só passaram a ser salvos nesta versão,
  // então dias antigos aparecem com 0 (não é bug, é histórico real anterior à funcionalidade).
  const coletaDevolChart = useMemo(() => {
    if (!H.length) return null;
    const W = Math.max(560, H.length * 44), Ht = 180, pl = 44, pr = 16, pt = 16, pb = 36;
    const x = (i: number) => pl + (H.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (H.length - 1));
    const y = (v: number) => pt + (1 - Math.max(0, Math.min(1, v))) * (Ht - pt - pb);
    const line = (vals: (number | null)[]) => {
      let d = "", started = false;
      vals.forEach((v, i) => {
        if (v == null) { started = false; return; }
        d += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
        started = true;
      });
      return d.trim();
    };
    const coletaVals = H.map((h) => (h.coleta_total ? (h.coleta_feita || 0) / h.coleta_total : null));
    const devolVals = H.map((h) => (h.total ? (h.devolucao || 0) / h.total : null));
    const anyColeta = coletaVals.some((v) => v != null);
    const anyDevol = devolVals.some((v) => v != null && v > 0);
    if (!anyColeta && !anyDevol) return null;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, yy: y(v) }));
    return { W, Ht, pl, pr, x, y, grid, coletaPath: anyColeta ? line(coletaVals) : "", devolPath: anyDevol ? line(devolVals) : "", H, coletaVals, devolVals };
  }, [H]);

  const driverBarChart = useMemo(() => rank.slice(0, 10), [rank]);

  // Tendência de SLA no prazo (24h) — só existe para dias salvos depois desta versão,
  // por isso segue o mesmo padrão de "sem ponto" da coleta/devolução, não zero.
  const slaChart = useMemo(() => {
    if (!H.length) return null;
    const W = Math.max(560, H.length * 44), Ht = 180, pl = 44, pr = 16, pt = 16, pb = 36;
    const x = (i: number) => pl + (H.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (H.length - 1));
    const y = (v: number) => pt + (1 - Math.max(0, Math.min(1, v))) * (Ht - pt - pb);
    const vals = H.map((h) => (h.sla_total ? (h.sla_ok || 0) / h.sla_total : null));
    if (!vals.some((v) => v != null)) return null;
    let path = "", started = false;
    vals.forEach((v, i) => {
      if (v == null) { started = false; return; }
      path += (started ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
      started = true;
    });
    const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, yy: y(v) }));
    return { W, Ht, pl, pr, x, y, grid, path: path.trim(), vals };
  }, [H]);

  // Mix de forma de pagamento e tipo de produto no período — soma os dias salvos.
  const mixCharts = useMemo(() => {
    const soma = (pick: (h: (typeof H)[number]) => Record<string, number> | undefined) => {
      const agg: Record<string, number> = {};
      for (const h of H) {
        const rec = pick(h);
        if (!rec) continue;
        for (const [k, v] of Object.entries(rec)) agg[k] = (agg[k] || 0) + v;
      }
      const total = Object.values(agg).reduce((a, v) => a + v, 0);
      return { total, top: Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8) };
    };
    const pagamentos = soma((h) => h.pagamentos);
    const tiposProduto = soma((h) => h.tipos_produto);
    const pesoTotal = H.reduce((a, h) => a + (h.peso_total || 0), 0);
    const bloqueados = H.reduce((a, h) => a + (h.bloqueados || 0), 0);
    const divergentes = H.reduce((a, h) => a + (h.divergentes || 0), 0);
    if (!pagamentos.total && !tiposProduto.total && !pesoTotal) return null;
    return { pagamentos, tiposProduto, pesoTotal, bloqueados, divergentes };
  }, [H]);

  return (
    <section className="pane active">
      {incompletos.length > 0 && (
        <div className="warnbox" style={{ marginBottom: "1rem" }}>
          <b>Faltam dados de entrega em {incompletos.length} dia{incompletos.length === 1 ? "" : "s"}</b> ({incompletos.slice(-6).map((h) => brDate(h.data)).join(", ")}
          {incompletos.length > 6 ? "…" : ""}): a Carta de porte não foi importada, então esses dias ficam fora dos gráficos de entrega. Importe a Carta de porte
          em Operação e salve o dia de novo para completar a análise.
        </div>
      )}
      <div className="row" style={{ marginBottom: ".75rem" }}>
        <h2>Histórico da base</h2>
        <span className="spacer"></span>
        <select className="btn" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">Últimos 7 dias salvos</option>
          <option value="30">Últimos 30 dias salvos</option>
          <option value="90">Últimos 90 dias salvos</option>
          <option value="0">Tudo</option>
        </select>
      </div>
      {!H.length ? (
        <div className="empty">
          <h3>Nenhum dia salvo ainda</h3>
          <p>Na aba Entregas do dia, carregue as planilhas e clique em "Salvar no histórico". A evolução e o ranking aparecem aqui, para todos que acessam esta base.</p>
        </div>
      ) : (
        <div>
          <div className="hgrid">
            <div className="panel">
              <h3>Entregas no prazo por dia</h3>
              <div className="chartwrap">
                {chart && (
                  <svg width={chart.W} height={chart.Ht} viewBox={`0 0 ${chart.W} ${chart.Ht}`} role="img" aria-label="Percentual entregue por dia">
                    {chart.grid.map((g, i) => (
                      <g key={i}>
                        <line x1={chart.pl} x2={chart.W - chart.pr} y1={g.yy} y2={g.yy} stroke="var(--line)" />
                        <text x={chart.pl - 6} y={g.yy + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(g.v * 100)}%</text>
                      </g>
                    ))}
                    <line x1={chart.pl} x2={chart.W - chart.pr} y1={chart.metaY} y2={chart.metaY} stroke="var(--signal)" strokeWidth={2} strokeDasharray="6 4" />
                    <text x={chart.W - chart.pr} y={chart.metaY - 6} textAnchor="end" fontSize="11" fill="var(--ink)">meta {curBase?.meta}%</text>
                    <path d={chart.path} fill="none" stroke="var(--focus)" strokeWidth={2} />
                    {chart.pts.map((p, i) => {
                      const v = p[2].total ? p[2].entregues / p[2].total : 0;
                      return <circle key={i} cx={p[0]} cy={p[1]} r={5} fill={`var(--${level(v, meta, alerta)})`}><title>{brDate(p[2].data)}: {fmtPct(v)}</title></circle>;
                    })}
                  </svg>
                )}
              </div>
            </div>
            <div className="panel">
              <h3>Dias salvos</h3>
              <ul className="days">
                {[...H].reverse().map((h) => {
                  const v = h.total ? h.entregues / h.total : 0;
                  return (
                    <li key={h.data}>
                      <span className="dot" style={{ background: `var(--${level(v, meta, alerta)})` }}></span>
                      <b>{brDate(h.data)}</b>
                      <span className="small muted">{fmtPct(v)} de {fmtN(h.total)}</span>
                      {canEdit && <button onClick={() => { if (confirm(`Apagar o registro de ${brDate(h.data)}?`)) deleteDay(h.data); }}>apagar</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          {volumeChart && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h3>Volume de pacotes por dia</h3>
              <p className="muted small" style={{ margin: "0 0 .5rem" }}>Entregues, com problema e não entregues, empilhados — mostra se a % caiu por volume alto ou por operação ruim.</p>
              <div className="chartwrap">
                <svg width={volumeChart.W} height={volumeChart.Ht} viewBox={`0 0 ${volumeChart.W} ${volumeChart.Ht}`} role="img" aria-label="Volume de pacotes por dia">
                  {volumeChart.grid.map((g, i) => (
                    <g key={i}>
                      <line x1={volumeChart.pl} x2={volumeChart.W - volumeChart.pr} y1={g.yy} y2={g.yy} stroke="var(--line)" />
                      <text x={volumeChart.pl - 6} y={g.yy + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmtN(Math.round(g.v))}</text>
                    </g>
                  ))}
                  {volumeChart.bars.map((b, i) => {
                    let y = volumeChart.base;
                    const segs: { h: number; color: string }[] = [
                      { h: b.eH, color: "var(--ok)" },
                      { h: b.pH, color: "var(--bad)" },
                      { h: b.nH, color: "var(--pend)" },
                    ];
                    return (
                      <g key={i}>
                        {segs.map((s, j) => {
                          y -= s.h;
                          return s.h > 0.3 ? <rect key={j} x={b.xx} y={y} width={14} height={s.h} fill={s.color} /> : null;
                        })}
                        <title>{brDate(b.h.data)}: {fmtN(b.h.entregues)} entregues, {fmtN(b.h.problemas)} problema(s), {fmtN(Math.max(0, b.h.total - b.h.entregues - b.h.problemas))} não entregue(s)</title>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="legend">
                <span><i style={{ background: "var(--ok)" }}></i>Entregue</span>
                <span><i style={{ background: "var(--bad)" }}></i>Problema</span>
                <span><i style={{ background: "var(--pend)" }}></i>Não entregue</span>
              </div>
            </div>
          )}
          {coletaDevolChart && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h3>Coleta e devolução no período</h3>
              <p className="muted small" style={{ margin: "0 0 .5rem" }}>Dias anteriores à ativação dessas métricas aparecem sem ponto na linha, não como zero.</p>
              <div className="chartwrap">
                <svg width={coletaDevolChart.W} height={coletaDevolChart.Ht} viewBox={`0 0 ${coletaDevolChart.W} ${coletaDevolChart.Ht}`} role="img" aria-label="Taxa de coleta e devolução por dia">
                  {coletaDevolChart.grid.map((g, i) => (
                    <g key={i}>
                      <line x1={coletaDevolChart.pl} x2={coletaDevolChart.W - coletaDevolChart.pr} y1={g.yy} y2={g.yy} stroke="var(--line)" />
                      <text x={coletaDevolChart.pl - 6} y={g.yy + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(g.v * 100)}%</text>
                    </g>
                  ))}
                  {coletaDevolChart.coletaPath && <path d={coletaDevolChart.coletaPath} fill="none" stroke="var(--focus)" strokeWidth={2} />}
                  {coletaDevolChart.devolPath && <path d={coletaDevolChart.devolPath} fill="none" stroke="var(--bad)" strokeWidth={2} strokeDasharray="5 4" />}
                  {coletaDevolChart.coletaVals.map((v, i) => v == null ? null : <circle key={"c" + i} cx={coletaDevolChart.x(i)} cy={coletaDevolChart.y(v)} r={4} fill="var(--focus)"><title>{brDate(coletaDevolChart.H[i].data)}: {fmtPct(v)} coletado</title></circle>)}
                  {coletaDevolChart.devolVals.map((v, i) => v == null ? null : <circle key={"d" + i} cx={coletaDevolChart.x(i)} cy={coletaDevolChart.y(v)} r={4} fill="var(--bad)"><title>{brDate(coletaDevolChart.H[i].data)}: {fmtPct(v)} devolução</title></circle>)}
                </svg>
              </div>
              <div className="legend">
                {coletaDevolChart.coletaPath && <span><i style={{ background: "var(--focus)" }}></i>% coletado</span>}
                {coletaDevolChart.devolPath && <span><i style={{ background: "var(--bad)" }}></i>% devolução</span>}
              </div>
            </div>
          )}
          {slaChart && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h3>SLA no prazo (24h) por dia</h3>
              <p className="muted small" style={{ margin: "0 0 .5rem" }}>Diferente de "% entregue": aqui só entram pacotes com saída e chegada legíveis, e mede se a entrega foi rápida, não só se aconteceu.</p>
              <div className="chartwrap">
                <svg width={slaChart.W} height={slaChart.Ht} viewBox={`0 0 ${slaChart.W} ${slaChart.Ht}`} role="img" aria-label="SLA no prazo por dia">
                  {slaChart.grid.map((g, i) => (
                    <g key={i}>
                      <line x1={slaChart.pl} x2={slaChart.W - slaChart.pr} y1={g.yy} y2={g.yy} stroke="var(--line)" />
                      <text x={slaChart.pl - 6} y={g.yy + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(g.v * 100)}%</text>
                    </g>
                  ))}
                  <path d={slaChart.path} fill="none" stroke="var(--focus)" strokeWidth={2} />
                  {slaChart.vals.map((v, i) => v == null ? null : <circle key={i} cx={slaChart.x(i)} cy={slaChart.y(v)} r={4} fill="var(--focus)"><title>{brDate(H[i].data)}: {fmtPct(v)} no prazo</title></circle>)}
                </svg>
              </div>
            </div>
          )}
          {mixCharts && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h3>Mix de pagamento e produto no período</h3>
              <div className="kpis" style={{ marginBottom: ".75rem" }}>
                {mixCharts.pesoTotal > 0 && <div className="kpi"><b>{mixCharts.pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</b><span>peso total no período</span></div>}
                {mixCharts.bloqueados > 0 && <div className="kpi"><b style={{ color: "var(--bad)" }}>{fmtN(mixCharts.bloqueados)}</b><span>pacotes marcados para revisão</span></div>}
                {mixCharts.divergentes > 0 && <div className="kpi"><b style={{ color: "var(--bad)" }}>{fmtN(mixCharts.divergentes)}</b><span>motorista divergente</span></div>}
              </div>
              <div className="row" style={{ gap: "2rem", flexWrap: "wrap" }}>
                {mixCharts.pagamentos.total > 0 && (
                  <div style={{ minWidth: 220 }}>
                    <b className="small">Forma de pagamento</b>
                    <div className="bars" style={{ marginTop: ".35rem" }}>
                      {mixCharts.pagamentos.top.map(([k, v]) => (
                        <div className="b" key={k}>
                          <div>{k}<em style={{ width: `${(v / mixCharts.pagamentos.total) * 100}%`, background: "var(--focus)" }}></em></div>
                          <strong>{fmtN(v)} <span className="muted small">({fmtPct(v / mixCharts.pagamentos.total)})</span></strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {mixCharts.tiposProduto.total > 0 && (
                  <div style={{ minWidth: 220 }}>
                    <b className="small">Tipo de produto</b>
                    <div className="bars" style={{ marginTop: ".35rem" }}>
                      {mixCharts.tiposProduto.top.map(([k, v]) => (
                        <div className="b" key={k}>
                          <div>{k}<em style={{ width: `${(v / mixCharts.tiposProduto.total) * 100}%`, background: "var(--focus)" }}></em></div>
                          <strong>{fmtN(v)} <span className="muted small">({fmtPct(v / mixCharts.tiposProduto.total)})</span></strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="panel" style={{ marginTop: "1rem" }}>
            <h3>Ranking de motoristas no período</h3>
            {driverBarChart.length > 0 && (
              <div className="bars" style={{ marginBottom: "1rem" }}>
                {driverBarChart.map((a) => (
                  <div className="b" key={a.n}>
                    <div>
                      {a.n}
                      <em style={{ width: `${a.pct * 100}%`, background: `var(--${level(a.pct, meta, alerta)})` }}></em>
                    </div>
                    <strong>{fmtPct(a.pct)} <span className="muted small">({fmtN(a.t)} pacotes)</span></strong>
                  </div>
                ))}
              </div>
            )}
            <div className="tablewrap">
              <table className="rank">
                <thead>
                  <tr><th>#</th><th>Motorista</th><th>Dias</th><th>Pacotes</th><th>Entregues</th><th>% no período</th><th>Dias abaixo da meta</th><th>Problemas</th></tr>
                </thead>
                <tbody>
                  {rank.map((a, i) => (
                    <tr key={a.n}>
                      <td>{i + 1}</td><td>{a.n}</td><td>{a.dias}</td><td>{fmtN(a.t)}</td><td>{fmtN(a.e)}</td>
                      <td style={{ color: `var(--${level(a.pct, meta, alerta)})`, fontWeight: 600 }}>{fmtPct(a.pct)}</td>
                      <td>{a.abaixo}</td><td>{fmtN(a.p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {payoutsByDriver.length > 0 && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <h3>Histórico de pagamentos por motorista (fechamentos fechados)</h3>
              <div className="tablewrap">
                <table className="rank">
                  <thead><tr><th>Motorista</th><th>Fechamentos</th><th>Entregas pagas</th><th>Total recebido</th></tr></thead>
                  <tbody>
                    {payoutsByDriver.map((a) => (
                      <tr key={a.n}>
                        <td>{a.n}</td><td>{a.fechamentos}</td><td>{fmtN(a.entregas)}</td><td><b>{fmtR(a.pago)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
