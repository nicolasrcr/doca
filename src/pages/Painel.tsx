import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { brDate, fmtN, fmtPct } from "../lib/format";
import { analisarBase, LIMITES } from "../lib/insights";
import type { Base, DayRecord, Driver } from "../lib/types";
import type { ActiveScreen } from "../hooks/useNav";
import {
  ChartCard, ColumnChart, DataTable, Donut, HBars, LineChart, StatTile, TipRow, TipTitle, VizRoot, topComOutros,
  type ColDatum, type FarolKey, type HBarDatum, type LinePoint,
} from "../components/viz/Viz";
import { useImport } from "../components/ImportDialog";
import { Dica, Menu, MenuItem } from "../components/ui";
import { agruparMotivos } from "../lib/taxonomia";
import { diaRef } from "../lib/ref";
import { compararMesmoDia, metaDoMotorista } from "../lib/metas";
import { gerarRelatorioSemanal } from "../lib/relatorioPdf";
import { downloadBlob, useToast } from "../hooks/useToast";
import { preverFechamentoMes } from "../lib/previsao";

const shiftDay = (iso: string, d: number) => {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};
const curtoDia = (iso: string) => iso.slice(8) + "/" + iso.slice(5, 7);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const pp = (d: number) => `${d > 0 ? "+" : ""}${(d * 100).toFixed(1).replace(".", ",")} p.p.`;

interface Agg { t: number; e: number; p: number; n: number; slaOk: number; slaTot: number; colF: number; colT: number }
const agg = (days: DayRecord[]): Agg => ({
  t: days.reduce((a, d) => a + d.total, 0),
  e: days.reduce((a, d) => a + d.entregues, 0),
  p: days.reduce((a, d) => a + d.problemas, 0),
  n: days.reduce((a, d) => a + d.pendentes, 0),
  slaOk: days.reduce((a, d) => a + (d.sla_ok || 0), 0),
  slaTot: days.reduce((a, d) => a + (d.sla_total || 0), 0),
  colF: days.reduce((a, d) => a + (d.coleta_feita || 0), 0),
  colT: days.reduce((a, d) => a + (d.coleta_total || 0), 0),
});

export function PainelView({ base, history, openScreen, onImport, drivers = [] }: {
  base: Base; history: DayRecord[]; openScreen?: (id: ActiveScreen) => void; onImport?: () => void; drivers?: Driver[];
}) {
  const toast = useToast();
  const [periodo, setPeriodo] = useState(7);
  const hoje = diaRef(history);
  const meta = (base.meta ?? 95) / 100;
  const alerta = (base.alerta ?? 70) / 100;

  const v = useMemo(() => {
    const dias = Array.from({ length: periodo }, (_, i) => shiftDay(hoje, -(periodo - 1 - i)));
    const byDate = new Map(history.map((d) => [d.data, d]));
    const cur = dias.map((d) => byDate.get(d));
    const curDays = cur.filter((d): d is DayRecord => !!d);
    const ok = curDays.filter((d) => d.carta_ok !== false);
    const ini = shiftDay(hoje, -(periodo - 1)), iniAnt = shiftDay(hoje, -(2 * periodo - 1));
    const prevOk = history.filter((d) => d.data >= iniAnt && d.data < ini && d.carta_ok !== false);
    const prevAll = history.filter((d) => d.data >= iniAnt && d.data < ini);
    const saude = analisarBase(history, base, periodo, hoje);
    const spark = (f: (d: DayRecord) => number | null) => cur.slice(-12).map((d) => (d ? f(d) : null));
    return { dias, cur, curDays, ok, a: agg(ok), ap: agg(prevOk), tAll: agg(curDays).t, tAllPrev: agg(prevAll).t, saude, spark };
  }, [history, base, periodo, hoje]);

  const { a, ap, saude: s } = v;
  const ind = (k: string) => s.indicadores.find((i) => i.chave === k)!;
  const pct = ratio(a.e, a.t), pctAnt = ratio(ap.e, ap.t);
  const sla = ratio(a.slaOk, a.slaTot), slaAnt = ratio(ap.slaOk, ap.slaTot);
  const col = ratio(a.colF, a.colT), colAnt = ratio(ap.colF, ap.colT);
  const prob = ratio(a.p, a.t), probAnt = ratio(ap.p, ap.t);
  const delta = (cur: number | null, prev: number | null, boaSubir = true) =>
    cur != null && prev != null ? { text: pp(cur - prev), bom: Math.abs(cur - prev) < 0.0005 ? null : (cur > prev) === boaSubir } : null;
  const volDelta = v.tAllPrev > 0 ? { text: `${v.tAll >= v.tAllPrev ? "+" : ""}${(((v.tAll - v.tAllPrev) / v.tAllPrev) * 100).toFixed(1).replace(".", ",")}%`, bom: null as boolean | null } : null;

  // ── gráficos
  const linha: LinePoint[] = v.dias.map((d, i) => {
    const r = v.cur[i];
    const label = curtoDia(d);
    if (!r) return { label, value: null, tip: <><TipTitle>{brDate(d)}</TipTitle><div>Sem dia salvo</div></> };
    if (r.carta_ok === false) return { label, value: null, aviso: true, tip: <><TipTitle>{brDate(d)}</TipTitle><div>Faltou a Carta de porte: o número de entregas não pôde ser calculado.</div></> };
    const p = r.total ? r.entregues / r.total : 0;
    return { label, value: p, tip: <><TipTitle>{brDate(d)}</TipTitle><TipRow color="var(--v1)" label="Entregues" value={fmtPct(p)} /><TipRow label="Pacotes" value={`${fmtN(r.entregues)} de ${fmtN(r.total)}`} /><TipRow color="var(--v2)" label="Meta" value={fmtPct(meta)} /></> };
  });
  const colunas: ColDatum[] = v.dias.map((d, i) => {
    const r = v.cur[i];
    const label = curtoDia(d);
    if (!r) return { label, parts: [0, 0, 0, 0], tip: <><TipTitle>{brDate(d)}</TipTitle><div>Sem dia salvo</div></> };
    const incompleto = r.carta_ok === false;
    const parts = incompleto ? [0, 0, 0, r.total] : [r.entregues, r.problemas, r.pendentes, 0];
    return {
      label, parts,
      tip: (
        <>
          <TipTitle>{brDate(d)}</TipTitle>
          {incompleto ? <TipRow color="var(--v4)" label="Sem confirmação (falta Carta de porte)" value={fmtN(r.total)} /> : (
            <>
              <TipRow color="var(--v1)" label="Entregues" value={fmtN(r.entregues)} />
              <TipRow color="var(--v2)" label="Com problema" value={fmtN(r.problemas)} />
              <TipRow color="var(--v-other)" label="Não entregues" value={fmtN(r.pendentes)} />
            </>
          )}
        </>
      ),
    };
  });
  const motoristas: HBarDatum[] = s.motoristas
    .filter((m) => m.t >= LIMITES.minPacotesMotorista)
    .sort((x, y) => y.t - x.t).slice(0, 8)
    .sort((x, y) => x.pct - y.pct)
    .map((m) => ({
      label: m.nome, value: m.pct, text: fmtPct(m.pct), destaque: m.pct < alerta || (!!drivers.find((x) => x.name === m.nome)?.meta && m.pct < metaDoMotorista(drivers.find((x) => x.name === m.nome), base)),
      tip: <><TipTitle>{m.nome}</TipTitle><TipRow label="Entregues" value={fmtPct(m.pct)} /><TipRow label="Pacotes" value={`${fmtN(m.e)} de ${fmtN(m.t)}`} /><TipRow label="Dias abaixo do alerta" value={String(m.diasAbaixo)} />{drivers.find((x) => x.name === m.nome)?.meta ? <TipRow label="Meta própria" value={`${drivers.find((x) => x.name === m.nome)!.meta}%`} /> : null}</>,
    }));
  const soma = (campo: "motivos" | "tipos_produto" | "pagamentos") => {
    const acc: Record<string, number> = {};
    for (const d of v.ok) for (const [k, n] of Object.entries(d[campo] || {})) acc[k] = (acc[k] || 0) + n;
    return Object.entries(acc) as [string, number][];
  };
  const motivosBrutos = Object.fromEntries(soma("motivos"));
  const categorias = agruparMotivos(motivosBrutos);
  const motivos = topComOutros(categorias.map((c) => [c.categoria, c.total] as [string, number]));
  const motivosTabela = categorias.flatMap((c) => c.motivos.map(([m, n]) => [c.categoria, m, fmtN(n)]));
  const previsao = preverFechamentoMes(history, hoje, meta);
  const semana = compararMesmoDia(history, base);
  const perdidosTotal = s.bairros.reduce((a, b) => a + Math.round(b.total * (1 - b.pct)), 0);
  const topBairros: HBarDatum[] = s.bairros.slice(0, 8).map((b) => {
    const perd = Math.round(b.total * (1 - b.pct));
    return {
      label: b.nome, value: perdidosTotal ? perd / perdidosTotal : 0, text: `${fmtN(perd)} · ${fmtPct(perdidosTotal ? perd / perdidosTotal : 0)}`, destaque: b.farol === "vermelho",
      tip: <><TipTitle>{b.nome}</TipTitle><TipRow label="Pacotes" value={fmtN(b.total)} /><TipRow label="Entregue" value={fmtPct(b.pct)} /><TipRow label="Não entregues" value={fmtN(perd)} />{b.melhor && <TipRow label="Quem mais atende" value={b.melhor} />}</>,
    };
  });
  const concentra5 = perdidosTotal ? s.bairros.slice(0, 5).reduce((a, b) => a + Math.round(b.total * (1 - b.pct)), 0) / perdidosTotal : 0;
  const tipos = topComOutros(soma("tipos_produto"));
  const pagos = topComOutros(soma("pagamentos"));

  const semDados = v.curDays.length === 0;
  const ultimo = history.length ? history[history.length - 1].data : null;
  const farol = ind("entrega").farol as FarolKey;

  return (
    <VizRoot>
      <section className="pane active">
        <div className="pageHead">
          <h2>{base.name}</h2>
          <Dica>
            {ultimo ? <>Dados até {brDate(ultimo)}. </> : null}Meta de entrega: {fmtPct(meta)}. Alerta abaixo de {fmtPct(alerta)}. Você ajusta isso em “Dados e metas da base”.
          </Dica>
          <span className="spacer"></span>
          <select id="pv-periodo" aria-label="Período" value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
          </select>
          <Menu rotulo="Mais">
            <MenuItem onClick={async () => { try { downloadBlob(`relatorio-semanal-${base.name}-${hoje}.pdf`, await gerarRelatorioSemanal(base, history)); } catch { toast("Não consegui gerar o PDF agora."); } }}>Relatório semanal (PDF)</MenuItem>
            {openScreen && <MenuItem onClick={() => openScreen("saude")}>Ver sugestões da base</MenuItem>}
            {openScreen && <MenuItem onClick={() => openScreen("historico")}>Histórico e ranking</MenuItem>}
          </Menu>
        </div>

        {s.diasSemCarta > 0 && (
          <div className="warnbox" style={{ marginBottom: "1rem" }}>
            <b>Estamos calculando com dados incompletos.</b> Falta a Carta de porte em {s.diasSemCarta} de {s.dias} dia{s.dias === 1 ? "" : "s"}; esses dias ficam fora do cálculo de
            entregas. Sem ela não dá para fazer a análise quantitativa e qualitativa deles.
            {onImport && <> <button className="btn small" onClick={onImport}>Importar a Carta de porte</button></>}
          </div>
        )}

        {semDados ? (
          <div className="viz-card viz-empty">
            <h3 style={{ color: "var(--ink)" }}>Nenhum dia salvo neste período</h3>
            <p>Importe as planilhas do JMS para ver os indicadores.</p>
            {onImport && <button className="btn primary" onClick={onImport}>⬆ Importar planilhas</button>}
          </div>
        ) : (
          <>
            <div className="viz-grid">
              <div className="viz-span-4">
                <StatTile hero label="Entregas" value={pct != null ? fmtPct(pct) : "—"} farol={farol} progress={pct != null ? pct / meta : null}
                  meta={`meta ${fmtPct(meta)}`} delta={delta(pct, pctAnt)} note={pct != null ? `${fmtN(a.e)} de ${fmtN(a.t)} pacotes` : undefined}
                  spark={v.spark((d) => (d.carta_ok === false || !d.total ? null : d.entregues / d.total))} />
              </div>
              <div className="viz-span-8 viz-tiles4">
                <StatTile label="Pacotes" value={fmtN(v.tAll)} meta={`em ${v.curDays.length} dia${v.curDays.length === 1 ? "" : "s"}`} delta={volDelta}
                  spark={v.spark((d) => d.total)} />
                <StatTile label="No prazo (SLA)" value={sla != null ? fmtPct(sla) : "—"} farol={ind("prazo").farol as FarolKey} progress={sla != null ? sla / LIMITES.sla.verde : null}
                  meta={`meta ${fmtPct(LIMITES.sla.verde)}`} delta={delta(sla, slaAnt)} spark={v.spark((d) => ratio(d.sla_ok || 0, d.sla_total || 0))} />
                <StatTile label="Coletas feitas" value={col != null ? fmtPct(col) : "—"} farol={ind("coleta").farol as FarolKey} progress={col != null ? col / LIMITES.coleta.verde : null}
                  meta={col != null ? `meta ${fmtPct(LIMITES.coleta.verde)}` : "sem relatório de coleta"} delta={delta(col, colAnt)} spark={v.spark((d) => ratio(d.coleta_feita || 0, d.coleta_total || 0))} />
                <StatTile label="Com problema" value={prob != null ? fmtPct(prob) : "—"} farol={ind("problemas").farol as FarolKey}
                  meta={`até ${fmtPct(LIMITES.problemas.verde)}`} delta={delta(prob, probAnt, false)} spark={v.spark((d) => (d.carta_ok === false ? null : ratio(d.problemas, d.total)))} />
              </div>
            </div>

            <div className="viz-grid">
              <div className="viz-span-8">
                <ChartCard title="% entregue por dia" caption={`${s.veredito}`}
                  legend={<><span><i style={{ background: "var(--v1)" }} />Entregues</span><span><i className="ln" style={{ background: "var(--v2)" }} />Meta</span></>}
                  table={<DataTable cols={["Dia", "% entregue", "Entregues", "Pacotes"]} rows={v.dias.map((d, i) => { const r = v.cur[i]; return [brDate(d), !r ? "sem dia salvo" : r.carta_ok === false ? "falta Carta de porte" : fmtPct(r.total ? r.entregues / r.total : 0), r ? fmtN(r.entregues) : "—", r ? fmtN(r.total) : "—"]; })} />}>
                  <LineChart name="Percentual entregue por dia" points={linha} refLine={{ value: meta, label: `meta ${fmtPct(meta)}` }} format={(x) => `${Math.round(x * 100)}%`} />
                </ChartCard>
              </div>
              <div className="viz-span-4">
                <ChartCard title="O que atacar primeiro">
                  {s.prioridades.length === 0 ? (
                    <div className="okbox">Nada crítico no período.</div>
                  ) : (
                    <div className="viz-prio">
                      {s.prioridades.slice(0, 3).map((p) => (
                        <details key={p.id} className={"p " + p.nivel}>
                          <summary><b>{p.titulo}</b></summary>
                          <span>{p.acao || p.detalhe}</span>
                        </details>
                      ))}
                    </div>
                  )}
                  {openScreen && <button className="btn small" style={{ marginTop: ".6rem" }} onClick={() => openScreen("saude")}>Ver tudo</button>}
                </ChartCard>
              </div>
            </div>

            <div className="viz-grid">
              <div className="viz-span-6">
                <ChartCard title="Pacotes por dia" caption="Entregues, com problema e não entregues"
                  legend={<><span><i style={{ background: "var(--v1)" }} />Entregues</span><span><i style={{ background: "var(--v2)" }} />Com problema</span><span><i style={{ background: "var(--v-other)" }} />Não entregues</span>{v.curDays.some((d) => d.carta_ok === false) && <span><i style={{ background: "var(--v4)" }} />Sem confirmação (falta Carta de porte)</span>}</>}
                  table={<DataTable cols={["Dia", "Entregues", "Com problema", "Não entregues", "Sem confirmação"]} rows={v.dias.map((d, i) => [brDate(d), ...(v.cur[i] ? colunas[i].parts.map((x) => fmtN(x)) : ["—", "—", "—", "—"])])} />}>
                  <ColumnChart name="Pacotes por dia" data={colunas}
                    series={[{ name: "Entregues", color: "var(--v1)" }, { name: "Com problema", color: "var(--v2)" }, { name: "Não entregues", color: "var(--v-other)" }, { name: "Sem confirmação", color: "var(--v4)" }]} />
                </ChartCard>
              </div>
              <div className="viz-span-6">
                <ChartCard title="Motoristas · % entregue" caption="Os de maior volume; a linha marca a meta"
                  legend={<><span><i style={{ background: "var(--v1)" }} />Na meta ou acima do alerta</span><span><i style={{ background: "var(--v2)" }} />Abaixo do alerta ou da meta própria</span></>}
                  table={<DataTable cols={["Motorista", "% entregue", "Pacotes", "Dias abaixo do alerta"]} rows={s.motoristas.map((m) => [m.nome, fmtPct(m.pct), fmtN(m.t), m.diasAbaixo])} />}>
                  {motoristas.length ? <HBars name="Percentual entregue por motorista" data={motoristas} refValue={meta} refLabel={`meta ${Math.round(meta * 100)}%`} /> : <p className="muted">Sem motoristas com volume suficiente no período.</p>}
                </ChartCard>
              </div>
            </div>

            <div className="viz-grid">
              {motivos.length > 0 && (
                <div className="viz-span-4">
                  <ChartCard title="Problemas por tipo" caption="Motivos do JMS agrupados em categorias" table={<DataTable cols={["Categoria", "Motivo no JMS", "Casos"]} rows={motivosTabela} />}>
                    <Donut name="Problemas por tipo" data={motivos} centerLabel="problemas" />
                  </ChartCard>
                </div>
              )}
              {tipos.length > 0 && (
                <div className="viz-span-4">
                  <ChartCard title="Tipo de produto" caption="Top 5 do período" table={<DataTable cols={["Tipo", "Pacotes"]} rows={tipos.map((m) => [m.label, fmtN(m.value)])} />}>
                    <Donut name="Tipo de produto" data={tipos} centerLabel="pacotes" />
                  </ChartCard>
                </div>
              )}
              {pagos.length > 0 && (
                <div className="viz-span-4">
                  <ChartCard title="Forma de pagamento" caption="Top 5 do período" table={<DataTable cols={["Forma", "Pacotes"]} rows={pagos.map((m) => [m.label, fmtN(m.value)])} />}>
                    <Donut name="Forma de pagamento" data={pagos} centerLabel="pacotes" />
                  </ChartCard>
                </div>
              )}
            </div>

            {semana && (
              <div className="viz-grid">
                <div className="viz-span-12" style={{ gridColumn: "1 / -1" }}>
                  <ChartCard title={`${semana.nomeDia}: mesmo dia da semana`} caption={`Último dia salvo (${brDate(semana.data)}) contra a média das ${semana.n} ${semana.nomeDia.toLowerCase()}s anteriores`}>
                    <p style={{ margin: 0, fontSize: "1.1rem" }}>
                      <b>{fmtPct(semana.pct)}</b> contra <b>{fmtPct(semana.media)}</b> de média:{" "}
                      <span style={{ color: semana.delta >= 0 ? "var(--ok)" : "var(--bad)", fontWeight: 600 }}>{semana.delta >= 0 ? "▲ " : "▼ "}{pp(semana.delta)}</span>.
                      {" "}Meta desse dia: {fmtPct(semana.metaDia)} ({semana.pct >= semana.metaDia ? "batida" : "não batida"}).
                    </p>
                  </ChartCard>
                </div>
              </div>
            )}

            {(previsao || topBairros.length > 0) && (
              <div className="viz-grid">
                {previsao && (
                  <div className="viz-span-6">
                    <ChartCard title="Fechamento do mês (previsão)" caption={`Estimativa pelo ritmo dos últimos 14 dias · ${previsao.diasRestantes} dias de operação restantes`}>
                      <div className="previsao">
                        <div className="big">{fmtPct(previsao.pctProjetado)}</div>
                        <div className="small muted">
                          {previsao.pctProjetado >= meta ? "✓ Deve fechar o mês na meta" : "⚠ Deve fechar o mês abaixo da meta"} ({fmtPct(meta)}). Hoje o mês está em {fmtPct(previsao.pctAtual)}.
                        </div>
                        {previsao.necessario !== null && previsao.pctProjetado < meta && (
                          <p className="small" style={{ marginTop: ".6rem" }}>
                            {previsao.alcancavel
                              ? <>Para fechar na meta, a base precisa entregar <b>{fmtPct(Math.max(0, previsao.necessario))}</b> dos pacotes daqui para frente.</>
                              : <>Mesmo entregando tudo nos dias que restam, não dá para chegar à meta de {fmtPct(meta)} neste mês. Foque em ficar o mais perto possível.</>}
                          </p>
                        )}
                        <p className="small muted" style={{ marginTop: ".5rem" }}>É uma estimativa: assume o mesmo volume de {fmtN(Math.round(previsao.volumeDia))} pacotes por dia e o mesmo ritmo recente. Chuva, feriado e picos mudam o resultado.</p>
                      </div>
                    </ChartCard>
                  </div>
                )}
                {topBairros.length > 0 && (
                  <div className="viz-span-6">
                    <ChartCard title="Onde se concentram as entregas perdidas" caption={`Os 5 primeiros bairros têm ${fmtPct(concentra5)} dos pacotes não entregues`}
                      table={<DataTable cols={["Bairro", "Pacotes", "% entregue", "Não entregues"]} rows={s.bairros.slice(0, 15).map((b) => [b.nome, fmtN(b.total), fmtPct(b.pct), fmtN(Math.round(b.total * (1 - b.pct)))])} />}>
                      <HBars name="Pacotes não entregues por bairro" data={topBairros} />
                    </ChartCard>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </VizRoot>
  );
}

export default function Painel({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, history, drivers } = useDoca();
  const imp = useImport();
  if (!curBase) return null;
  return <PainelView base={curBase} history={history} openScreen={openScreen} onImport={() => imp.open()} drivers={drivers} />;
}

