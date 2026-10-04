import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useDoca } from "../hooks/DocaContext";
import { brDate, fmtN, fmtPct, todayISO } from "../lib/format";
import { classificar, tendenciaDe, vereditoDe, type Farol, type Tendencia } from "../lib/insights";
import { FarolDot } from "./Saude";
import type { ActiveScreen } from "../hooks/useNav";

interface DayRow {
  base_id: string;
  data: string;
  total: number;
  entregues: number;
  problemas: number;
  pendentes: number;
  sla_ok: number | null;
  sla_total: number | null;
  coleta_total: number | null;
  coleta_feita: number | null;
  carta_ok: boolean | null;
}

const FAROL_LABEL: Record<Farol, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho", sem_dados: "Sem dados" };
const FAROL_ORDER: Record<Farol, number> = { vermelho: 0, sem_dados: 1, amarelo: 2, verde: 3 };
const SETA: Record<Tendencia, string> = { subindo: "▲", estavel: "▬", caindo: "▼" };

const daysAgoISO = (n: number) => {
  const d = new Date(todayISO() + "T12:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (iso: string) => Math.round((new Date(todayISO() + "T12:00:00").getTime() - new Date(iso + "T12:00:00").getTime()) / 86400000);

async function fetchDays(since: string): Promise<DayRow[]> {
  const out: DayRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("days")
      .select("base_id,data,total,entregues,problemas,pendentes,sla_ok,sla_total,coleta_total,coleta_feita,carta_ok")
      .gte("data", since)
      .order("data")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data as DayRow[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const sumBy = (rows: DayRow[], f: (r: DayRow) => number) => rows.reduce((a, r) => a + f(r), 0);

export default function Geral({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { bases, orgs, selectBase } = useDoca();
  const [period, setPeriod] = useState(7);
  const [orgFilter, setOrgFilter] = useState("all");
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async (n: number) => {
    setErr("");
    try {
      setRows(await fetchDays(daysAgoISO(Math.max(60, 2 * n - 1))));
    } catch (e) {
      setErr((e as Error).message);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const scope = useMemo(
    () => bases.filter((b) => (orgFilter === "all" ? true : orgFilter === "none" ? !b.org_id : b.org_id === orgFilter)),
    [bases, orgFilter]
  );

  const perBase = useMemo(() => {
    const ini = daysAgoISO(period - 1);
    const iniAnt = daysAgoISO(2 * period - 1);
    return scope
      .map((b) => {
        const all = (rows || []).filter((r) => r.base_id === b.id);
        const cur = all.filter((r) => r.data >= ini);
        const prev = all.filter((r) => r.data >= iniAnt && r.data < ini);
        const ok = cur.filter((r) => r.carta_ok !== false);
        const okPrev = prev.filter((r) => r.carta_ok !== false);
        const t = sumBy(ok, (r) => r.total), e = sumBy(ok, (r) => r.entregues);
        const tp = sumBy(okPrev, (r) => r.total), ep = sumBy(okPrev, (r) => r.entregues);
        const pct = t > 0 ? e / t : null;
        const delta = pct != null && tp > 0 ? pct - ep / tp : null;
        const meta = (b.meta ?? 95) / 100;
        const alerta = (b.alerta ?? 70) / 100;
        const farol = classificar(pct, meta, alerta);
        const tend = tendenciaDe(delta);
        const last = all.length ? all[all.length - 1].data : undefined;
        const idle = last ? daysBetween(last) : null;
        const stale = idle == null || idle > (b.stale_days ?? 3);
        return {
          base: b,
          pct, delta, farol, tend,
          t, e,
          p: sumBy(ok, (r) => r.problemas),
          pend: sumBy(ok, (r) => r.pendentes),
          dias: cur.length,
          semCarta: cur.length - ok.length,
          slaOk: sumBy(ok, (r) => r.sla_ok || 0), slaTot: sumBy(ok, (r) => r.sla_total || 0),
          colF: sumBy(cur, (r) => r.coleta_feita || 0), colT: sumBy(cur, (r) => r.coleta_total || 0),
          last, idle, stale,
          serie: ok,
        };
      })
      .sort((x, y) => FAROL_ORDER[x.farol] - FAROL_ORDER[y.farol] || (x.pct ?? 2) - (y.pct ?? 2));
  }, [scope, rows, period]);

  const tot = useMemo(() => {
    const t = { t: 0, e: 0, p: 0, n: 0, slaOk: 0, slaTot: 0, colT: 0, colF: 0, metaW: 0 };
    for (const x of perBase) {
      t.t += x.t; t.e += x.e; t.p += x.p; t.n += x.pend;
      t.slaOk += x.slaOk; t.slaTot += x.slaTot; t.colT += x.colT; t.colF += x.colF;
      t.metaW += ((x.base.meta ?? 95) / 100) * x.t;
    }
    return t;
  }, [perBase]);

  const trend = useMemo(() => {
    const byDay = new Map<string, { t: number; e: number }>();
    for (const x of perBase) for (const r of x.serie) {
      const d = byDay.get(r.data) || { t: 0, e: 0 };
      d.t += r.total; d.e += r.entregues;
      byDay.set(r.data, d);
    }
    const ini = daysAgoISO(period - 1);
    return [...byDay.entries()].filter(([d]) => d >= ini).sort(([a], [b]) => (a < b ? -1 : 1)).map(([data, v]) => ({ data, pct: v.t ? v.e / v.t : 0 }));
  }, [perBase, period]);

  const contagem = useMemo(() => {
    const c: Record<Farol, number> = { verde: 0, amarelo: 0, vermelho: 0, sem_dados: 0 };
    for (const x of perBase) c[x.farol]++;
    return c;
  }, [perBase]);

  const pctEmpresa = tot.t > 0 ? tot.e / tot.t : null;
  const metaEmpresa = tot.t > 0 ? tot.metaW / tot.t : null;
  const faroEmpresa: Farol = pctEmpresa == null || metaEmpresa == null ? "sem_dados" : contagem.vermelho > 0 && contagem.vermelho >= perBase.length / 2 ? "vermelho" : pctEmpresa >= metaEmpresa ? "verde" : pctEmpresa >= metaEmpresa - 0.1 ? "amarelo" : "vermelho";
  const comIncompletos = perBase.filter((x) => x.semCarta > 0);
  const attention = perBase.filter((x) => x.farol === "vermelho" || x.farol === "amarelo" || x.stale || x.semCarta > 0 || x.tend === "caindo");

  const open = async (id: string, screen: "entregas" | "saude" = "entregas") => {
    await selectBase(id);
    openScreen(screen);
  };

  const W = 560, H = 120, P = 8;
  const pts = trend.map((p, i) => {
    const x = trend.length > 1 ? P + (i * (W - 2 * P)) / (trend.length - 1) : W / 2;
    const y = H - P - p.pct * (H - 2 * P);
    return `${x},${y}`;
  });

  return (
    <section className="pane active">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row">
          <h2 style={{ margin: 0 }}>Saúde da operação</h2>
          <span className="spacer"></span>
          {orgs.length > 0 && (
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
              <option value="all">Todas as empresas</option>
              {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
              <option value="none">Bases sem empresa</option>
            </select>
          )}
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            <option value={1}>Hoje</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
        </div>
        <p className="muted small">
          Cada base é comparada com a meta que o gestor definiu para ela. A tendência compara com o período anterior do mesmo tamanho.
          Os números aparecem depois que a base salva o dia; base sem dia salvo aparece como “Sem dados”.
        </p>
        {err && <div className="warnbox">Não consegui carregar os dados: {err}</div>}
      </div>

      {rows == null ? (
        <div className="panel"><p className="muted">Carregando…</p></div>
      ) : (
        <>
          {comIncompletos.length > 0 && (
            <div className="warnbox" style={{ marginBottom: "1rem" }}>
              <b>Estamos calculando com dados incompletos.</b> Falta a Carta de porte (número de entregas) em {comIncompletos.length} base
              {comIncompletos.length === 1 ? "" : "s"}: {comIncompletos.map((x) => x.base.name).join(", ")}. Sem ela não dá para fazer a análise quantitativa e
              qualitativa desses dias. Abra a base e importe a Carta de porte.
            </div>
          )}

          <div className="panel" style={{ marginBottom: "1rem" }}>
            <div className="row" style={{ alignItems: "center" }}>
              <div>
                <div className="small muted">Saúde da empresa</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 600 }}><FarolDot farol={faroEmpresa} size={18} />{FAROL_LABEL[faroEmpresa]}</div>
                <div className="small muted">
                  {contagem.verde} verde · {contagem.amarelo} amarela{contagem.amarelo === 1 ? "" : "s"} · {contagem.vermelho} vermelha{contagem.vermelho === 1 ? "" : "s"}
                  {contagem.sem_dados > 0 ? ` · ${contagem.sem_dados} sem dados` : ""}
                </div>
              </div>
              <span className="spacer"></span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "2rem", fontWeight: 600 }}>{pctEmpresa != null ? fmtPct(pctEmpresa) : "—"}</div>
                <div className="small muted">entregues{metaEmpresa != null ? ` · meta média ${fmtPct(metaEmpresa)}` : ""}</div>
              </div>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi"><b>{fmtN(tot.t)}</b><span>pacotes</span></div>
            <div className="kpi"><b>{fmtN(tot.p)}</b><span>com problema</span></div>
            <div className="kpi"><b>{fmtN(tot.n)}</b><span>não entregues</span></div>
            <div className="kpi"><b>{tot.slaTot ? fmtPct(tot.slaOk / tot.slaTot) : "—"}</b><span>no prazo (SLA)</span></div>
            <div className="kpi"><b>{tot.colT ? fmtPct(tot.colF / tot.colT) : "—"}</b><span>coletas feitas</span></div>
          </div>

          {trend.length > 1 && (
            <div className="panel" style={{ marginBottom: "1rem" }}>
              <h3>% entregue por dia</h3>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Tendência do percentual entregue por dia">
                <polyline points={pts.join(" ")} fill="none" stroke="var(--focus)" strokeWidth="2" />
                {trend.map((p, i) => {
                  const [x, y] = pts[i].split(",").map(Number);
                  return <circle key={p.data} cx={x} cy={y} r="3" fill="var(--focus)"><title>{brDate(p.data)}: {fmtPct(p.pct)}</title></circle>;
                })}
              </svg>
              <div className="row small muted"><span>{brDate(trend[0].data)}</span><span className="spacer"></span><span>{brDate(trend[trend.length - 1].data)}</span></div>
            </div>
          )}

          <div className="panel" style={{ marginBottom: "1rem" }}>
            <h3>Precisam de atenção</h3>
            {attention.length === 0 ? (
              <div className="okbox">Todas as bases estão na meta, com dados completos e em dia.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {attention.map((x) => (
                  <li key={x.base.id} className="row" style={{ padding: ".4rem 0", borderBottom: "1px solid var(--line)" }}>
                    <span><FarolDot farol={x.farol} /><b>{x.base.name}</b>
                      <span className="muted small"> — {[
                        x.farol === "vermelho" && x.pct != null ? `entrega em ${fmtPct(x.pct)}, abaixo do alerta` : "",
                        x.farol === "amarelo" && x.pct != null ? `entrega em ${fmtPct(x.pct)}, abaixo da meta` : "",
                        x.tend === "caindo" && x.delta != null ? `em queda (${(x.delta * 100).toFixed(1).replace(".", ",")} p.p.)` : "",
                        x.semCarta > 0 ? `falta Carta de porte em ${x.semCarta} dia${x.semCarta === 1 ? "" : "s"}` : "",
                        x.stale ? (x.idle == null ? "nenhum dia salvo" : `sem dia salvo há ${x.idle} dia${x.idle === 1 ? "" : "s"}`) : "",
                      ].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="spacer"></span>
                    <button className="btn small" onClick={() => open(x.base.id, "saude")}>Ver análise</button>
                    <button className="btn small" onClick={() => open(x.base.id)}>Abrir base</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3>Ranking das bases</h3>
            <div className="tablewrap">
              <table className="drv">
                <thead><tr><th>Farol</th><th>Base</th><th>Pacotes</th><th>Entregues</th><th>Meta</th><th>Tendência</th><th>Problemas</th><th>Último dia salvo</th><th></th></tr></thead>
                <tbody>
                  {perBase.map((x) => (
                    <tr key={x.base.id}>
                      <td><FarolDot farol={x.farol} />{FAROL_LABEL[x.farol]}</td>
                      <td><b>{x.base.name}</b>{x.base.city ? <span className="muted small"> · {x.base.city}</span> : null}
                        {x.semCarta > 0 && <span className="badge warn" style={{ marginLeft: ".4rem" }} title="Faltou a Carta de porte">dados incompletos</span>}</td>
                      <td className="num">{x.dias ? fmtN(x.t) : "—"}</td>
                      <td className="num">{x.pct != null ? fmtPct(x.pct) : x.semCarta > 0 ? <span className="muted">faltando</span> : "—"}</td>
                      <td className="num">{x.base.meta ?? 95}%</td>
                      <td title={vereditoDe(x.farol, x.tend)}>{x.tend && x.delta != null ? `${SETA[x.tend]} ${(x.delta * 100).toFixed(1).replace(".", ",")} p.p.` : "—"}</td>
                      <td className="num">{x.t ? fmtPct(x.p / x.t) : "—"}</td>
                      <td>{x.last ? brDate(x.last) : "—"}</td>
                      <td><button className="btn small" onClick={() => open(x.base.id, "saude")}>Análise</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
