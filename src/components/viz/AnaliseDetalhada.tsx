import { useMemo } from "react";
import { brDate, fmtN, fmtPct } from "../../lib/format";
import { LIMITES } from "../../lib/insights";
import type { Base, DayRecord } from "../../lib/types";
import { ChartCard, ColumnChart, DataTable, Dispersao, Heatmap, TipRow, TipTitle, type ColDatum, type DispDatum, type HeatRow } from "./Viz";

const curto = (iso: string) => iso.slice(8) + "/" + iso.slice(5, 7);

// Três gráficos para quem quer ir além do painel: quando as entregas acontecem (distribuição), se o volume
// explica o resultado de cada motorista (relação) e em que dia cada um cai (mapa de calor).
export default function AnaliseDetalhada({ days, base }: { days: DayRecord[]; base: Base }) {
  const meta = (base.meta ?? 95) / 100;
  const alerta = (base.alerta ?? 70) / 100;
  const noturno = base.entrega_noturna_limite ?? 20;

  // 1) horários
  const horas = useMemo(() => {
    const acc = new Map<number, number>();
    let diasComHoras = 0;
    for (const d of days) {
      if (!d.horas) continue;
      diasComHoras++;
      for (const [h, n] of Object.entries(d.horas)) acc.set(Number(h), (acc.get(Number(h)) || 0) + n);
    }
    return { acc, diasComHoras };
  }, [days]);
  const hs = [...horas.acc.keys()];
  const hMin = hs.length ? Math.min(...hs, 7) : 7, hMax = hs.length ? Math.max(...hs, 20) : 20;
  const totalHoras = [...horas.acc.values()].reduce((a, b) => a + b, 0);
  const apos = [...horas.acc.entries()].filter(([h]) => h >= noturno).reduce((a, [, n]) => a + n, 0);
  const pico = [...horas.acc.entries()].sort((a, b) => b[1] - a[1])[0];
  const colunas: ColDatum[] = Array.from({ length: hMax - hMin + 1 }, (_, i) => {
    const h = hMin + i, n = horas.acc.get(h) || 0, tarde = h >= noturno;
    return {
      label: `${h}h`, parts: [tarde ? 0 : n, tarde ? n : 0],
      tip: <><TipTitle>{`${h}h às ${h + 1}h`}</TipTitle><TipRow color={tarde ? "var(--v2)" : "var(--v1)"} label="Entregas" value={fmtN(n)} />{totalHoras > 0 && <TipRow label="Do total" value={fmtPct(n / totalHoras)} />}</>,
    };
  });

  // 2) dispersão volume × % por motorista (período)
  const motoristas = useMemo(() => {
    const m = new Map<string, { t: number; e: number; dias: number }>();
    for (const d of days) for (const x of d.motoristas || []) {
      const a = m.get(x.n) || { t: 0, e: 0, dias: 0 };
      a.t += x.t; a.e += x.e; a.dias++;
      m.set(x.n, a);
    }
    return [...m.entries()].map(([n, a]) => ({ n, ...a, pct: a.t ? a.e / a.t : 0 })).filter((a) => a.t >= LIMITES.minPacotesMotorista);
  }, [days]);
  const disp: DispDatum[] = motoristas.map((a) => ({
    label: a.n, x: a.t, y: a.pct, destaque: a.pct < meta,
    tip: <><TipTitle>{a.n}</TipTitle><TipRow label="Pacotes" value={fmtN(a.t)} /><TipRow label="Entregues" value={`${fmtPct(a.pct)} (${fmtN(a.e)})`} /><TipRow label="Dias" value={String(a.dias)} /></>,
  }));

  // 3) mapa de calor motorista × dia (últimos 14 dias)
  const calor = useMemo(() => {
    const ultimos = days.slice(-14);
    const tot = new Map<string, { t: number; e: number }>();
    for (const d of ultimos) for (const x of d.motoristas || []) {
      const a = tot.get(x.n) || { t: 0, e: 0 };
      a.t += x.t; a.e += x.e; tot.set(x.n, a);
    }
    const nomes = [...tot.entries()].filter(([, a]) => a.t >= LIMITES.minPacotesMotorista).sort((a, b) => a[1].e / a[1].t - b[1].e / b[1].t).slice(0, 14).map(([n]) => n);
    const rows: HeatRow[] = nomes.map((n) => ({
      label: n,
      cells: ultimos.map((d) => {
        const x = (d.motoristas || []).find((m) => m.n === n);
        const v = x && x.t > 0 ? x.e / x.t : null;
        return { value: v, tip: <><TipTitle>{n}</TipTitle><TipRow label={brDate(d.data)} value={x && x.t ? `${fmtPct(v!)} (${fmtN(x.e)} de ${fmtN(x.t)})` : "sem pacotes"} /></> };
      }),
    }));
    return { cols: ultimos.map((d) => curto(d.data)), rows };
  }, [days]);

  return (
    <div className="viz-grid">
      <div className="viz-span-12" style={{ gridColumn: "1 / -1" }}>
        <ChartCard title="A que horas as entregas acontecem" caption={horas.diasComHoras && pico ? `Pico às ${pico[0]}h · ${fmtPct(totalHoras ? apos / totalHoras : 0)} depois das ${noturno}h` : undefined}
          legend={<><span><i style={{ background: "var(--v1)" }} />Dentro do horário</span><span><i style={{ background: "var(--v2)" }} />Depois das {noturno}h</span></>}
          table={<DataTable cols={["Hora", "Entregas"]} rows={colunas.map((c) => [c.label, fmtN(c.parts[0] + c.parts[1])])} />}>
          {horas.diasComHoras === 0 ? (
            <p className="muted">Os dias salvos ainda não têm o horário das entregas. Importe de novo os arquivos de um dia para gerar este gráfico.</p>
          ) : (
            <ColumnChart name="Entregas por hora do dia" unidade="faixas de horário" data={colunas} series={[{ name: "Dentro do horário", color: "var(--v1)" }, { name: `Depois das ${noturno}h`, color: "var(--v2)" }]} />
          )}
        </ChartCard>
      </div>
      <div className="viz-span-6">
        <ChartCard title="Volume × resultado por motorista" caption="Cada ponto é um motorista. Laranja: abaixo da meta."
          table={<DataTable cols={["Motorista", "Pacotes", "% entregue"]} rows={motoristas.map((a) => [a.n, fmtN(a.t), fmtPct(a.pct)])} />}>
          {disp.length >= 3 ? (
            <Dispersao name="Pacotes e percentual entregue por motorista" data={disp} refY={meta} refLabel={`meta ${Math.round(meta * 100)}%`}
              xRotulo="Pacotes no período" yRotulo="% entregue" fmtX={(v) => fmtN(Math.round(v))} fmtY={(v) => `${Math.round(v * 100)}%`} />
          ) : <p className="muted">Precisa de pelo menos 3 motoristas com volume.</p>}
        </ChartCard>
      </div>
      <div className="viz-span-6">
        <ChartCard title="Motorista por dia" caption="% entregue em cada dia, do pior para o melhor"
          table={<DataTable cols={["Motorista", ...calor.cols]} rows={calor.rows.map((r) => [r.label, ...r.cells.map((c) => (c.value === null ? "—" : fmtPct(c.value)))])} />}>
          {calor.rows.length >= 2 && calor.cols.length >= 2 ? (
            <>
              <Heatmap name="Percentual entregue por motorista em cada dia" cols={calor.cols} rows={calor.rows} meta={meta} alerta={alerta} />
              <div className="viz-legend-heat">
                <span><i style={{ background: "color-mix(in srgb, var(--ink) 9%, transparent)" }} />na meta</span>
                <span><i style={{ background: "color-mix(in srgb, var(--warn) 30%, transparent)" }} />abaixo da meta</span>
                <span><i style={{ background: "color-mix(in srgb, var(--bad) 38%, transparent)" }} />abaixo do alerta</span>
              </div>
            </>
          ) : <p className="muted">Precisa de pelo menos 2 dias e 2 motoristas.</p>}
        </ChartCard>
      </div>
    </div>
  );
}
