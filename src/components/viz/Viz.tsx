import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as RPE } from "react";
import "../../styles/viz.css";

/* ───────── tooltip único, compartilhado ───────── */
interface TipState { x: number; y: number; node: ReactNode }
interface TipApi { show: (x: number, y: number, node: ReactNode) => void; hide: () => void }
const TipCtx = createContext<TipApi>({ show: () => {}, hide: () => {} });

export function VizRoot({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const api: TipApi = {
    show: useCallback((x, y, node) => setTip({ x, y, node }), []),
    hide: useCallback(() => setTip(null), []),
  };
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!tip || !ref.current) { setPos(null); return; }
    const w = ref.current.offsetWidth, h = ref.current.offsetHeight;
    let left = tip.x + 14, top = tip.y + 14;
    if (left + w > window.innerWidth - 8) left = tip.x - w - 14;
    if (top + h > window.innerHeight - 8) top = tip.y - h - 14;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [tip]);
  return (
    <TipCtx.Provider value={api}>
      <div className="viz-root">
        {children}
        {tip && (
          <div ref={ref} className="viz-tip" role="tooltip" style={{ left: pos?.left ?? tip.x, top: pos?.top ?? tip.y, visibility: pos ? "visible" : "hidden" }}>
            {tip.node}
          </div>
        )}
      </div>
    </TipCtx.Provider>
  );
}
const useTip = () => useContext(TipCtx);

export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="r">
      <span>{color && <i className="k" style={{ background: color }} />}{label}</span>
      <b>{value}</b>
    </div>
  );
}
export const TipTitle = ({ children }: { children: ReactNode }) => <div className="t">{children}</div>;

/* ───────── medição de largura ───────── */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ───────── cartão com visão em tabela ───────── */
export function ChartCard({ title, caption, children, table, legend }: { title: string; caption?: string; children: ReactNode; table?: ReactNode; legend?: ReactNode }) {
  const [verTabela, setVerTabela] = useState(false);
  return (
    <section className="viz-card">
      <header>
        <div>
          <h3>{title}</h3>
          {caption && <div className="cap">{caption}</div>}
        </div>
        {table && <button type="button" className="viz-toggle" aria-pressed={verTabela} onClick={() => setVerTabela((v) => !v)}>{verTabela ? "Ver gráfico" : "Ver tabela"}</button>}
      </header>
      {verTabela && table ? table : children}
      {!verTabela && legend && <div className="viz-legend">{legend}</div>}
    </section>
  );
}

export function DataTable({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="viz-table">
        <thead><tr>{cols.map((c) => (<th key={c}>{c}</th>))}</tr></thead>
        <tbody>{rows.map((r, i) => (<tr key={i}>{r.map((v, j) => (<td key={j}>{v}</td>))}</tr>))}</tbody>
      </table>
    </div>
  );
}

/* ───────── cartão de indicador ───────── */
export type FarolKey = "verde" | "amarelo" | "vermelho" | "sem_dados";
const FAROL_TXT: Record<FarolKey, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho", sem_dados: "Sem dados" };
const FAROL_ICON: Record<FarolKey, string> = { verde: "●", amarelo: "●", vermelho: "●", sem_dados: "○" };

export function Sparkline({ values, color = "var(--v1)" }: { values: (number | null)[]; color?: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null);
  if (pts.length < 2) return null;
  const W = 120, H = 26, P = 3;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, values.length - 1);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const last = pts[pts.length - 1];
  return (
    <svg className="viz-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Tendência recente">
      <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="4" fill={color} stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

export function StatTile(p: {
  label: string; value: string; farol?: FarolKey; hero?: boolean;
  meta?: string; progress?: number | null; delta?: { text: string; bom: boolean | null } | null; spark?: (number | null)[]; note?: string;
}) {
  const f = p.farol ?? "sem_dados";
  return (
    <div className={"viz-tile " + (p.farol ? f : "") + (p.hero ? " hero" : "")}>
      <div className="lab">
        <span>{p.label}</span>
        {p.farol && <span className={"viz-chip " + f}>{FAROL_ICON[f]} {FAROL_TXT[f]}</span>}
      </div>
      <div className="val">{p.value}</div>
      {p.progress != null && (
        <div className={"viz-meter " + (p.farol ?? "")} role="progressbar" aria-valuenow={Math.round(Math.min(1, p.progress) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.label}: progresso`}>
          <i style={{ width: `${Math.max(0, Math.min(1, p.progress)) * 100}%` }} />
        </div>
      )}
      <div className="sub">
        {p.meta}
        {p.delta && <> · <span className={"viz-delta " + (p.delta.bom == null ? "neutro" : p.delta.bom ? "bom" : "ruim")}>{p.delta.text}</span></>}
        {p.note && <> · {p.note}</>}
      </div>
      {p.spark && <Sparkline values={p.spark} />}
    </div>
  );
}

/* ───────── escalas ───────── */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/* ───────── linha (tendência no tempo) ───────── */
export interface LinePoint { label: string; value: number | null; tip: ReactNode; aviso?: boolean }

export function LineChart({ points, refLine, format, height = 210, color = "var(--v1)", name }: {
  points: LinePoint[]; refLine?: { value: number; label: string }; format: (v: number) => string; height?: number; color?: string; name: string;
}) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const [idx, setIdx] = useState<number | null>(null);
  const L = 42, R = 14, T = 12, B = 26;
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const lo0 = Math.min(...vals, refLine?.value ?? Infinity), hi0 = Math.max(...vals, refLine?.value ?? -Infinity, 0);
  const pad = Math.max(0.02, (hi0 - lo0) * 0.25);
  const lo = vals.length ? Math.max(0, Math.floor((lo0 - pad) * 20) / 20) : 0;
  const hi = Math.min(1, Math.ceil((hi0 + 0.01) * 20) / 20);
  const iw = Math.max(10, w - L - R), ih = height - T - B;
  const n = points.length;
  const x = (i: number) => L + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
  const segs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  points.forEach((p, i) => { if (p.value == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push({ i, v: p.value }); });
  if (cur.length) segs.push(cur);
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 60))));

  const place = (i: number, e?: { clientX: number; clientY: number } | null) => {
    setIdx(i);
    const p = points[i];
    const r = (ref.current as HTMLDivElement).getBoundingClientRect();
    tip.show(e ? e.clientX : r.left + x(i), e ? e.clientY : r.top + (p.value != null ? y(p.value) : T), p.tip);
  };
  const near = (e: RPE) => {
    const r = (ref.current as HTMLDivElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0, bd = Infinity;
    points.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bd) { bd = d; best = i; } });
    place(best, e);
  };
  const leave = () => { setIdx(null); tip.hide(); };

  return (
    <div ref={ref}>
      {w > 0 && (
        <svg className="viz-svg" width={w} height={height} role="img" aria-label={`${name}: ${points.length} dias`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={L} x2={L + iw} y1={y(t)} y2={y(t)} />
              <text x={L - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {points.map((p, i) => (i % step === 0 ? <text key={i} x={x(i)} y={height - 8} textAnchor="middle">{p.label}</text> : null))}
          {refLine && (
            <g>
              <line x1={L} x2={L + iw} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--v2)" strokeWidth="2" />
              <text x={L + 6} y={y(refLine.value) + 14} textAnchor="start" style={{ fill: "var(--ink)", fontWeight: 600 }}>{refLine.label}</text>
            </g>
          )}
          {segs.length > 0 && segs.map((s, k) => s.length > 1 && (
            <g key={k}>
              <polygon points={`${s.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} ${x(s[s.length - 1].i)},${T + ih} ${x(s[0].i)},${T + ih}`} fill={color} opacity="0.1" />
              <polyline points={s.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {points.map((p, i) => p.value != null && (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={idx === i || i === n - 1 ? 5 : 4} fill={color} stroke="var(--surface)" strokeWidth="2" />
          ))}
          {points.map((p, i) => p.value == null && p.aviso && (
            <text key={i} x={x(i)} y={T + ih - 4} textAnchor="middle" style={{ fill: "var(--warn)", fontWeight: 700 }}>!</text>
          ))}
          {idx != null && <line x1={x(idx)} x2={x(idx)} y1={T} y2={T + ih} stroke="var(--v-axis)" strokeWidth="1" />}
          <rect className="hit" x={L} y={T} width={iw} height={ih} tabIndex={0} aria-label={`${name}. Use as setas para percorrer os dias.`}
            onPointerMove={near} onPointerLeave={leave} onBlur={leave}
            onFocus={() => place(n - 1)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") { e.preventDefault(); place(Math.max(0, (idx ?? n) - 1)); }
              else if (e.key === "ArrowRight") { e.preventDefault(); place(Math.min(n - 1, (idx ?? -1) + 1)); }
            }} />
        </svg>
      )}
    </div>
  );
}

/* ───────── colunas empilhadas ───────── */
export interface ColSeries { name: string; color: string }
export interface ColDatum { label: string; parts: number[]; tip: ReactNode }

export function ColumnChart({ data, series, format = (v) => v.toLocaleString("pt-BR"), height = 210, name, unidade = "dias" }: {
  data: ColDatum[]; series: ColSeries[]; format?: (v: number) => string; height?: number; name: string; unidade?: string;
}) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const [hi, setHi] = useState<number | null>(null);
  const L = 44, R = 8, T = 10, B = 26;
  const iw = Math.max(10, w - L - R), ih = height - T - B;
  const n = data.length;
  const totals = data.map((d) => d.parts.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, 1));
  const y = (v: number) => T + ih - (v / max) * ih;
  const band = iw / Math.max(1, n);
  const bw = Math.min(24, Math.max(6, band * 0.6));
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);

  const place = (i: number, e?: { clientX: number; clientY: number }) => {
    setHi(i);
    const r = (ref.current as HTMLDivElement).getBoundingClientRect();
    tip.show(e ? e.clientX : r.left + L + band * (i + 0.5), e ? e.clientY : r.top + y(totals[i]), data[i].tip);
  };
  const leave = () => { setHi(null); tip.hide(); };
  const GAP = 2, R4 = 4;

  return (
    <div ref={ref}>
      {w > 0 && (
        <svg className="viz-svg" width={w} height={height} role="img" aria-label={`${name}: ${n} ${unidade}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={L} x2={L + iw} y1={y(t)} y2={y(t)} />
              <text x={L - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = L + band * (i + 0.5);
            let acc = 0;
            const parts = d.parts.map((v, k) => ({ v, k })).filter((p) => p.v > 0);
            return (
              <g key={i} className={"mk" + (hi != null && hi !== i ? " dim" : "")}>
                {parts.map((p, pi) => {
                  const y0 = y(acc), y1 = y(acc + p.v);
                  acc += p.v;
                  const top = pi === parts.length - 1;
                  const h = Math.max(1, y0 - y1 - (pi > 0 ? GAP : 0));
                  const yy = y1;
                  const r = top ? Math.min(R4, h) : 0;
                  const x0 = cx - bw / 2, x1 = cx + bw / 2;
                  const path = `M${x0},${yy + h} L${x0},${yy + r} Q${x0},${yy} ${x0 + r},${yy} L${x1 - r},${yy} Q${x1},${yy} ${x1},${yy + r} L${x1},${yy + h} Z`;
                  return <path key={p.k} d={path} fill={series[p.k].color} />;
                })}
                {i % step === 0 && <text x={cx} y={height - 8} textAnchor="middle">{d.label}</text>}
              </g>
            );
          })}
          {data.map((d, i) => (
            <rect key={i} className="hit" x={L + band * i} y={T} width={band} height={ih} tabIndex={0}
              aria-label={`${d.label}: ${series.map((s, k) => `${s.name} ${format(d.parts[k] || 0)}`).join(", ")}`}
              onPointerMove={(e) => place(i, e)} onPointerLeave={leave} onFocus={() => place(i)} onBlur={leave} />
          ))}
          <line className="axis" x1={L} x2={L + iw} y1={T + ih} y2={T + ih} />
        </svg>
      )}
    </div>
  );
}

/* ───────── barras horizontais (comparativo) ───────── */
export interface HBarDatum { label: string; value: number; text: string; destaque?: boolean; tip: ReactNode }

export function HBars({ data, refValue, refLabel, name }: { data: HBarDatum[]; refValue?: number; refLabel?: string; name: string }) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const [hi, setHi] = useState<number | null>(null);
  const rowH = 30, T = refValue != null ? 18 : 4, LBL = Math.min(170, Math.max(100, w * 0.34)), VAL = 54;
  const iw = Math.max(10, w - LBL - VAL - 8);
  const height = T + data.length * rowH + 4;
  return (
    <div ref={ref}>
      {w > 0 && (
        <svg className="viz-svg" width={w} height={height} role="img" aria-label={name}>
          {refValue != null && (
            <g>
              <line x1={LBL + iw * refValue} x2={LBL + iw * refValue} y1={T - 4} y2={height - 2} stroke="var(--ink)" strokeWidth="1.5" />
              <text x={LBL + iw * refValue} y={10} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>{refLabel}</text>
            </g>
          )}
          {data.map((d, i) => {
            const yy = T + i * rowH;
            const bw = Math.max(2, iw * Math.min(1, d.value));
            const col = d.destaque ? "var(--v2)" : "var(--v1)";
            const lab = d.label.length > 24 ? d.label.slice(0, 23) + "…" : d.label;
            return (
              <g key={i} className={"mk" + (hi != null && hi !== i ? " dim" : "")}>
                <text x={0} y={yy + rowH / 2 + 4} style={{ fill: "var(--ink)" }}>{lab}</text>
                <path d={`M${LBL},${yy + 7} L${LBL + bw - 4},${yy + 7} Q${LBL + bw},${yy + 7} ${LBL + bw},${yy + 11} L${LBL + bw},${yy + rowH - 15} Q${LBL + bw},${yy + rowH - 11} ${LBL + bw - 4},${yy + rowH - 11} L${LBL},${yy + rowH - 11} Z`} fill={col} />
                <text x={LBL + iw + 8} y={yy + rowH / 2 + 4} style={{ fill: "var(--ink)", fontWeight: 600 }}>{d.text}</text>
                <rect className="hit" x={0} y={yy} width={w} height={rowH} tabIndex={0} aria-label={`${d.label}: ${d.text}`}
                  onPointerMove={(e) => { setHi(i); tip.show(e.clientX, e.clientY, d.tip); }}
                  onPointerLeave={() => { setHi(null); tip.hide(); }}
                  onFocus={(e) => { setHi(i); const r = (e.target as SVGRectElement).getBoundingClientRect(); tip.show(r.left + LBL, r.top, d.tip); }}
                  onBlur={() => { setHi(null); tip.hide(); }} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ───────── rosquinha (parte do total, até 6 fatias) ───────── */
export interface DonutDatum { label: string; value: number }
const DONUT_COLORS = ["var(--v1)", "var(--v2)", "var(--v3)", "var(--v4)", "var(--v5)", "var(--v-other)"];

export function Donut({ data, centerLabel, name }: { data: DonutDatum[]; centerLabel: string; name: string }) {
  const tip = useTip();
  const [hi, setHi] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const S = 150, c = S / 2, ro = 70, ri = 44;
  let ang = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const a0 = ang, a1 = ang + (d.value / (total || 1)) * Math.PI * 2;
    ang = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    const full = d.value >= total;
    const path = full
      ? `M${c},${c - ro} A${ro},${ro} 0 1 1 ${c - 0.01},${c - ro} L${c - 0.01},${c - ri} A${ri},${ri} 0 1 0 ${c},${c - ri} Z`
      : `M${pt(ro, a0)} A${ro},${ro} 0 ${large} 1 ${pt(ro, a1)} L${pt(ri, a1)} A${ri},${ri} 0 ${large} 0 ${pt(ri, a0)} Z`;
    return { path, i, d };
  });
  const pct = (v: number) => ((v / (total || 1)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  return (
    <div className="viz-donut">
      <svg className="viz-svg" viewBox={`0 0 ${S} ${S}`} width={S} height={S} role="img" aria-label={name}>
        {arcs.map(({ path, i, d }) => (
          <path key={i} d={path} fill={DONUT_COLORS[Math.min(i, 5)]} stroke="var(--surface)" strokeWidth="2" className={"mk" + (hi != null && hi !== i ? " dim" : "")}
            tabIndex={0} aria-label={`${d.label}: ${d.value.toLocaleString("pt-BR")} (${pct(d.value)})`}
            onPointerMove={(e) => { setHi(i); tip.show(e.clientX, e.clientY, <TipRow color={DONUT_COLORS[Math.min(i, 5)]} label={d.label} value={`${d.value.toLocaleString("pt-BR")} · ${pct(d.value)}`} />); }}
            onPointerLeave={() => { setHi(null); tip.hide(); }}
            onFocus={(e) => { setHi(i); const r = (e.target as SVGPathElement).getBoundingClientRect(); tip.show(r.left + r.width / 2, r.top, <TipRow color={DONUT_COLORS[Math.min(i, 5)]} label={d.label} value={`${d.value.toLocaleString("pt-BR")} · ${pct(d.value)}`} />); }}
            onBlur={() => { setHi(null); tip.hide(); }} />
        ))}
        <text x={c} y={c - 2} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 20, fontWeight: 700 }}>{total.toLocaleString("pt-BR")}</text>
        <text x={c} y={c + 14} textAnchor="middle">{centerLabel}</text>
      </svg>
      <div className="viz-dleg">
        {data.map((d, i) => (
          <div key={i}><i style={{ background: DONUT_COLORS[Math.min(i, 5)] }} /><span className="n">{d.label}</span><b>{d.value.toLocaleString("pt-BR")} <span className="muted small">({pct(d.value)})</span></b></div>
        ))}
      </div>
    </div>
  );
}

/** Top N + "Outros" (no máximo 6 fatias). */
export function topComOutros(entries: [string, number][], n = 5): DonutDatum[] {
  const sorted = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([label, value]) => ({ label, value }));
  const rest = sorted.slice(n).reduce((a, [, v]) => a + v, 0);
  return rest > 0 ? [...top, { label: "Outros", value: rest }] : top;
}

/* ───────── dispersão (relação entre duas medidas) ───────── */
export interface DispDatum { label: string; x: number; y: number; destaque?: boolean; tip: ReactNode }

export function Dispersao({ data, refY, refLabel, xRotulo, yRotulo, fmtX, fmtY, height = 300, name }: {
  data: DispDatum[]; refY?: number; refLabel?: string; xRotulo: string; yRotulo: string;
  fmtX: (v: number) => string; fmtY: (v: number) => string; height?: number; name: string;
}) {
  const [ref, w] = useWidth();
  const tip = useTip();
  const [hi, setHi] = useState<number | null>(null);
  const L = 48, R = 16, T = 12, B = 40;
  const iw = Math.max(10, w - L - R), ih = height - T - B;
  const xs = data.map((d) => d.x), ys = data.map((d) => d.y);
  const x0 = Math.min(...xs, 0), x1 = niceMax(Math.max(...xs, 1));
  const lo0 = Math.min(...ys, refY ?? Infinity), hi0 = Math.max(...ys, refY ?? -Infinity);
  const pad = Math.max(0.02, (hi0 - lo0) * 0.25);
  const y0 = Math.max(0, Math.floor((lo0 - pad) * 20) / 20), y1 = Math.min(1, Math.ceil((hi0 + 0.01) * 20) / 20);
  const px = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * iw;
  const py = (v: number) => T + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const ticksY = [0, 1, 2, 3, 4].map((k) => y0 + ((y1 - y0) * k) / 4);
  const ticksX = [0, 1, 2, 3, 4].map((k) => x0 + ((x1 - x0) * k) / 4);
  return (
    <div ref={ref}>
      {w > 0 && (
        <svg className="viz-svg" width={w} height={height} role="img" aria-label={name}>
          {ticksY.map((t, i) => (
            <g key={i}><line x1={L} x2={L + iw} y1={py(t)} y2={py(t)} className="grid" /><text x={L - 6} y={py(t) + 4} textAnchor="end">{fmtY(t)}</text></g>
          ))}
          {ticksX.map((t, i) => (<text key={i} x={px(t)} y={T + ih + 16} textAnchor="middle">{fmtX(t)}</text>))}
          <text x={L + iw / 2} y={height - 4} textAnchor="middle" style={{ fill: "var(--muted)" }}>{xRotulo}</text>
          <text x={10} y={T + 4} style={{ fill: "var(--muted)" }}>{yRotulo}</text>
          {refY != null && (
            <g>
              <line x1={L} x2={L + iw} y1={py(refY)} y2={py(refY)} stroke="var(--v2)" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x={L + iw} y={py(refY) - 5} textAnchor="end" style={{ fill: "var(--ink)", fontWeight: 600 }}>{refLabel}</text>
            </g>
          )}
          {data.map((d, i) => {
            const cx = px(d.x), cy = py(d.y);
            return (
              <g key={i} className={hi != null && hi !== i ? "dim" : ""}>
                <circle cx={cx} cy={cy} r={hi === i ? 9 : 7} fill={d.destaque ? "var(--v2)" : "var(--v1)"} fillOpacity={0.85} stroke="var(--surface)" strokeWidth="2" />
                {d.destaque && <text x={cx + 11} y={cy + 4} style={{ fill: "var(--ink)", fontWeight: 600 }}>{d.label.length > 18 ? d.label.slice(0, 17) + "…" : d.label}</text>}
                <circle cx={cx} cy={cy} r={14} fill="transparent" tabIndex={0} aria-label={`${d.label}: ${fmtX(d.x)} pacotes, ${fmtY(d.y)}`}
                  onPointerMove={(e) => { setHi(i); tip.show(e.clientX, e.clientY, d.tip); }}
                  onPointerLeave={() => { setHi(null); tip.hide(); }}
                  onFocus={(e) => { setHi(i); const r = (e.target as SVGCircleElement).getBoundingClientRect(); tip.show(r.left + 16, r.top, d.tip); }}
                  onBlur={() => { setHi(null); tip.hide(); }} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ───────── mapa de calor (linhas × colunas) ───────── */
export interface HeatCell { value: number | null; tip: ReactNode }
export interface HeatRow { label: string; cells: HeatCell[] }

export function Heatmap({ cols, rows, meta, alerta, name }: { cols: string[]; rows: HeatRow[]; meta: number; alerta: number; name: string }) {
  const tip = useTip();
  const nivel = (v: number | null) => (v === null ? "vazio" : v >= meta ? "ok" : v >= alerta ? "warn" : "bad");
  return (
    <div className="viz-heat" role="region" aria-label={name} tabIndex={0}>
      <table>
        <thead>
          <tr><th></th>{cols.map((c) => (<th key={c}>{c}</th>))}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" title={r.label}>{r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label}</th>
              {r.cells.map((c, i) => (
                <td key={i} className={"h-" + nivel(c.value)} tabIndex={c.value === null ? -1 : 0}
                  onPointerMove={(e) => c.value !== null && tip.show(e.clientX, e.clientY, c.tip)} onPointerLeave={() => tip.hide()}
                  onFocus={(e) => { const rc = (e.target as HTMLElement).getBoundingClientRect(); tip.show(rc.left + 10, rc.top, c.tip); }} onBlur={() => tip.hide()}>
                  {c.value === null ? "·" : Math.round(c.value * 100)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── funil ───────── */
export interface FunilEtapa { label: string; value: number; tip: ReactNode; perda?: string }

export function Funil({ etapas, name }: { etapas: FunilEtapa[]; name: string }) {
  const tip = useTip();
  const topo = Math.max(1, etapas[0]?.value || 1);
  return (
    <div className="viz-funil" role="list" aria-label={name}>
      {etapas.map((e, i) => (
        <div className="viz-funil-linha" role="listitem" key={e.label} tabIndex={0}
          onPointerMove={(ev) => tip.show(ev.clientX, ev.clientY, e.tip)} onPointerLeave={() => tip.hide()}
          onFocus={(ev) => { const rc = (ev.currentTarget as HTMLElement).getBoundingClientRect(); tip.show(rc.left + 10, rc.top, e.tip); }} onBlur={() => tip.hide()}>
          <div className="viz-funil-nome">{e.label}</div>
          <div className="viz-funil-trilho"><div className={"viz-funil-barra" + (i === etapas.length - 1 ? " fim" : "")} style={{ width: Math.max(3, (e.value / topo) * 100) + "%" }} /></div>
          <div className="viz-funil-num"><b>{e.value.toLocaleString("pt-BR")}</b><span>{Math.round((e.value / topo) * 100)}%{e.perda ? ` · ${e.perda}` : ""}</span></div>
        </div>
      ))}
    </div>
  );
}
