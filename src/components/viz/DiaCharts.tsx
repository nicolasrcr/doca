import { brDate, fmtN, fmtPct } from "../../lib/format";
import { agruparMotivos } from "../../lib/taxonomia";
import { metaDoMotorista } from "../../lib/metas";
import type { Base, DayRecord, Driver } from "../../lib/types";
import { ChartCard, DataTable, Donut, HBars, StatTile, TipRow, TipTitle, VizRoot, topComOutros, type FarolKey, type HBarDatum } from "./Viz";

// Gráficos de UM dia (o que acabou de ser carregado ou o último dia salvo). É o que aparece em qualquer tela
// que recebe dados do JMS, para o gerente ver o número antes de ler qualquer texto.
export default function DiaCharts({ day, base, drivers = [] }: { day: DayRecord; base: Base; drivers?: Driver[] }) {
  const meta = (base.meta ?? 95) / 100;
  const alerta = (base.alerta ?? 70) / 100;
  const incompleto = day.carta_ok === false;
  const pct = !incompleto && day.total ? day.entregues / day.total : null;
  const farol: FarolKey = pct === null ? "sem_dados" : pct >= meta ? "verde" : pct >= alerta ? "amarelo" : "vermelho";
  const pctProb = day.total ? day.problemas / day.total : null;

  const motoristas: HBarDatum[] = (day.motoristas || [])
    .filter((m) => m.t > 0)
    .map((m) => ({ ...m, pct: m.e / m.t }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 12)
    .map((m) => {
      const dm = drivers.find((x) => x.name === m.n);
      const alvo = metaDoMotorista(dm, base);
      return {
        label: m.n, value: m.pct, text: fmtPct(m.pct), destaque: m.pct < Math.max(alerta, dm?.meta ? alvo : 0),
        tip: <><TipTitle>{m.n}</TipTitle><TipRow label="Entregues" value={`${fmtN(m.e)} de ${fmtN(m.t)}`} /><TipRow label="Com problema" value={fmtN(m.p)} /><TipRow label="Meta" value={fmtPct(alvo)} /></>,
      };
    });

  const cats = agruparMotivos(day.motivos || {});
  const motivos = topComOutros(cats.map((c) => [c.categoria, c.total] as [string, number]));
  const motivosTabela = cats.flatMap((c) => c.motivos.map(([m, n]) => [c.categoria, m, fmtN(n)]));

  const bairrosRows = Object.entries(day.bairros || {})
    .map(([nome, b]) => ({ nome, total: b.total, e: b.e, perd: b.total - b.e }))
    .filter((b) => b.total >= 3 && b.perd > 0)
    .sort((a, b) => b.perd - a.perd);
  const maxPerd = bairrosRows[0]?.perd || 1;
  const bairros: HBarDatum[] = bairrosRows.slice(0, 8).map((b) => ({
    label: b.nome, value: b.perd / maxPerd, text: `${fmtN(b.perd)} de ${fmtN(b.total)}`, destaque: b.e / b.total < alerta,
    tip: <><TipTitle>{b.nome}</TipTitle><TipRow label="Pacotes" value={fmtN(b.total)} /><TipRow label="Entregues" value={fmtPct(b.e / b.total)} /><TipRow label="Não entregues" value={fmtN(b.perd)} /></>,
  }));

  return (
    <VizRoot>
      {incompleto && <div className="warnbox" style={{ marginBottom: ".8rem" }}>Falta a Carta de porte deste dia: as entregas ainda não podem ser calculadas.</div>}
      <div className="viz-grid">
        <div className="viz-span-4">
          <StatTile hero label={`Entregas · ${brDate(day.data)}`} value={pct !== null ? fmtPct(pct) : "—"} farol={farol} progress={pct !== null ? pct / meta : null}
            meta={`meta ${fmtPct(meta)}`} note={pct !== null ? `${fmtN(day.entregues)} de ${fmtN(day.total)} pacotes` : `${fmtN(day.total)} pacotes`} />
        </div>
        <div className="viz-span-8 viz-tiles4">
          <StatTile label="Pacotes" value={fmtN(day.total)} meta={`${(day.motoristas || []).length} motoristas`} />
          <StatTile label="Com problema" value={pctProb !== null ? fmtPct(pctProb) : "—"} meta={`${fmtN(day.problemas)} pacotes`} />
          <StatTile label="Não entregues" value={fmtN(day.pendentes)} meta="sem confirmação" />
          {day.sla_total ? <StatTile label="No prazo (SLA)" value={fmtPct((day.sla_ok || 0) / day.sla_total)} meta="entregue em até 24h" /> : null}
        </div>
      </div>
      <div className="viz-grid">
        <div className="viz-span-8">
          <ChartCard title="% entregue por motorista" caption="Do pior para o melhor. A linha é a meta."
            legend={<><span><i style={{ background: "var(--v1)" }} />Dentro do esperado</span><span><i style={{ background: "var(--v2)" }} />Abaixo do alerta</span></>}
            table={<DataTable cols={["Motorista", "% entregue", "Entregues", "Pacotes"]} rows={(day.motoristas || []).slice().sort((a, b) => a.e / (a.t || 1) - b.e / (b.t || 1)).map((m) => [m.n, fmtPct(m.t ? m.e / m.t : 0), fmtN(m.e), fmtN(m.t)])} />}>
            {motoristas.length ? <HBars name="Percentual entregue por motorista" data={motoristas} refValue={meta} refLabel={`meta ${Math.round(meta * 100)}%`} /> : <p className="muted">Sem motoristas neste dia.</p>}
          </ChartCard>
        </div>
        <div className="viz-span-4">
          {motivos.length > 0 ? (
            <ChartCard title="Problemas por tipo" table={<DataTable cols={["Categoria", "Motivo no JMS", "Casos"]} rows={motivosTabela} />}>
              <Donut name="Problemas por tipo" data={motivos} centerLabel="problemas" />
            </ChartCard>
          ) : (
            <ChartCard title="Problemas por tipo"><p className="muted">Nenhum pacote com problema.</p></ChartCard>
          )}
        </div>
      </div>
      {bairros.length > 0 && (
        <div className="viz-grid">
          <div className="viz-span-12" style={{ gridColumn: "1 / -1" }}>
            <ChartCard title="Onde mais se perde entrega" caption="Pacotes não entregues por bairro"
              table={<DataTable cols={["Bairro", "Pacotes", "Entregues", "Não entregues"]} rows={bairrosRows.slice(0, 20).map((b) => [b.nome, fmtN(b.total), fmtN(b.e), fmtN(b.perd)])} />}>
              <HBars name="Pacotes não entregues por bairro" data={bairros} />
            </ChartCard>
          </div>
        </div>
      )}
    </VizRoot>
  );
}
