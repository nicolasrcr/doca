import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useDoca } from "../hooks/DocaContext";
import { brDate, fmtN, fmtPct, todayISO } from "../lib/format";
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
}

type Status = "ok" | "warn" | "bad" | "none";
const STATUS_LABEL: Record<Status, string> = { ok: "Na meta", warn: "Atenção", bad: "Crítico", none: "Sem dados" };
const STATUS_ORDER: Record<Status, number> = { bad: 0, none: 1, warn: 2, ok: 3 };

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
      .select("base_id,data,total,entregues,problemas,pendentes,sla_ok,sla_total,coleta_total,coleta_feita")
      .gte("data", since)
      .order("data")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data as DayRow[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function Geral({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { bases, orgs, selectBase } = useDoca();
  const [period, setPeriod] = useState(7);
  const [orgFilter, setOrgFilter] = useState("all");
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const load = useCallback(async (n: number) => {
    setErr("");
    try {
      const [periodRows, recent] = await Promise.all([fetchDays(daysAgoISO(n - 1)), fetchDays(daysAgoISO(60))]);
      const seen: Record<string, string> = {};
      for (const r of recent) if (!seen[r.base_id] || r.data > seen[r.base_id]) seen[r.base_id] = r.data;
      setRows(periodRows);
      setLastSeen(seen);
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
    const scoped = new Set(scope.map((b) => b.id));
    const acc = new Map<string, { t: number; e: number; p: number; n: number; days: number }>();
    for (const r of rows || []) {
      if (!scoped.has(r.base_id)) continue;
      const a = acc.get(r.base_id) || { t: 0, e: 0, p: 0, n: 0, days: 0 };
      a.t += r.total; a.e += r.entregues; a.p += r.problemas; a.n += r.pendentes; a.days += 1;
      acc.set(r.base_id, a);
    }
    return scope
      .map((b) => {
        const a = acc.get(b.id);
        const pct = a && a.t > 0 ? a.e / a.t : null;
        const meta = (b.meta ?? 95) / 100;
        const alerta = (b.alerta ?? 70) / 100;
        const status: Status = pct == null ? "none" : pct >= meta ? "ok" : pct >= alerta ? "warn" : "bad";
        const last = lastSeen[b.id];
        const idle = last ? daysBetween(last) : null;
        const stale = idle == null || idle > (b.stale_days ?? 3);
        return { base: b, a, pct, status, last, idle, stale };
      })
      .sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || (x.pct ?? 2) - (y.pct ?? 2));
  }, [scope, rows, lastSeen]);

  const tot = useMemo(() => {
    const scoped = new Set(scope.map((b) => b.id));
    const t = { t: 0, e: 0, p: 0, n: 0, slaOk: 0, slaTot: 0, colT: 0, colF: 0 };
    for (const r of rows || []) {
      if (!scoped.has(r.base_id)) continue;
      t.t += r.total; t.e += r.entregues; t.p += r.problemas; t.n += r.pendentes;
      t.slaOk += r.sla_ok || 0; t.slaTot += r.sla_total || 0; t.colT += r.coleta_total || 0; t.colF += r.coleta_feita || 0;
    }
    return t;
  }, [rows, scope]);

  const trend = useMemo(() => {
    const scoped = new Set(scope.map((b) => b.id));
    const byDay = new Map<string, { t: number; e: number }>();
    for (const r of rows || []) {
      if (!scoped.has(r.base_id)) continue;
      const d = byDay.get(r.data) || { t: 0, e: 0 };
      d.t += r.total; d.e += r.entregues;
      byDay.set(r.data, d);
    }
    return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([data, v]) => ({ data, pct: v.t ? v.e / v.t : 0 }));
  }, [rows, scope]);

  const attention = perBase.filter((x) => x.status === "bad" || x.status === "warn" || x.stale);

  const open = async (id: string) => {
    await selectBase(id);
    openScreen("entregas");
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
          <h2 style={{ margin: 0 }}>Visão geral das bases</h2>
          <span className="spacer"></span>
          {(orgs.length > 0 || bases.some((b) => !b.org_id)) && orgs.length > 0 && (
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
          Soma os dias salvos de {scope.length} base{scope.length === 1 ? "" : "s"}. Os números aparecem depois que cada base
          salva o dia; base sem dia salvo aparece como “Sem dados”.
        </p>
        {err && <div className="warnbox">Não consegui carregar os dados: {err}</div>}
      </div>

      {rows == null ? (
        <div className="panel"><p className="muted">Carregando…</p></div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><b>{fmtN(tot.t)}</b><span>pacotes</span></div>
            <div className="kpi"><b>{tot.t ? fmtPct(tot.e / tot.t) : "—"}</b><span>entregues</span></div>
            <div className="kpi"><b>{fmtN(tot.p)}</b><span>com problema</span></div>
            <div className="kpi"><b>{fmtN(tot.n)}</b><span>pendentes</span></div>
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
              <div className="okbox">Todas as bases estão na meta e com dados em dia.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {attention.map(({ base, status, pct, stale, idle }) => (
                  <li key={base.id} className="row" style={{ padding: ".4rem 0", borderBottom: "1px solid var(--line)" }}>
                    <span><b>{base.name}</b>
                      <span className="muted small"> — {[
                        status === "bad" && pct != null ? `entrega em ${fmtPct(pct)}, abaixo do alerta` : "",
                        status === "warn" && pct != null ? `entrega em ${fmtPct(pct)}, abaixo da meta` : "",
                        stale ? (idle == null ? "nenhum dia salvo nos últimos 60 dias" : `sem dia salvo há ${idle} dia${idle === 1 ? "" : "s"}`) : "",
                      ].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="spacer"></span>
                    <button className="btn small" onClick={() => open(base.id)}>Abrir base</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <h3>Ranking das bases</h3>
            <div className="tablewrap">
              <table className="drv">
                <thead><tr><th>Base</th><th>Pacotes</th><th>Entregues</th><th>Problemas</th><th>Pendentes</th><th>Meta</th><th>Situação</th><th>Último dia salvo</th><th></th></tr></thead>
                <tbody>
                  {perBase.map(({ base, a, pct, status, last }) => (
                    <tr key={base.id}>
                      <td><b>{base.name}</b>{base.city ? <span className="muted small"> · {base.city}</span> : null}</td>
                      <td className="num">{a ? fmtN(a.t) : "—"}</td>
                      <td className="num">{pct != null ? fmtPct(pct) : "—"}</td>
                      <td className="num">{a ? fmtN(a.p) : "—"}</td>
                      <td className="num">{a ? fmtN(a.n) : "—"}</td>
                      <td className="num">{base.meta ?? 95}%</td>
                      <td><span className={"badge " + (status === "none" ? "" : status)}>{STATUS_LABEL[status]}</span></td>
                      <td>{last ? brDate(last) : "—"}</td>
                      <td><button className="btn small" onClick={() => open(base.id)}>Abrir</button></td>
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
