import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { fmtN, fmtPct, todayISO } from "../lib/format";
import { analisarBase, type Area, type Farol, type Insight } from "../lib/insights";
import type { ActiveScreen } from "../hooks/useNav";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { pctUltimos7 } from "../lib/acoes";
import { criarAcao } from "../lib/acoesDb";
import { sugerirRedistribuicao } from "../lib/rotas";

const shiftISO = (iso: string, d: number) => {
  const x = new Date(iso + "T12:00:00");
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

const FAROL_LABEL: Record<Farol, string> = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho", sem_dados: "Sem dados" };
const FAROL_COR: Record<Farol, string> = { verde: "var(--ok)", amarelo: "var(--warn)", vermelho: "var(--bad)", sem_dados: "var(--muted)" };
const NIVEL_CLASS: Record<string, string> = { critico: "bad", aviso: "warn", info: "ok" };
const NIVEL_LABEL: Record<string, string> = { critico: "Crítico", aviso: "Atenção", info: "Informação" };
const AREA_LABEL: Record<Area, string> = {
  dados: "Dados faltando",
  entrega: "Entrega",
  motoristas: "Motoristas",
  rotas: "Rotas e bairros",
  coleta: "Coleta",
  qualidade: "Qualidade do serviço",
};
const AREAS: Area[] = ["dados", "entrega", "motoristas", "rotas", "coleta", "qualidade"];

export function FarolDot({ farol, size = 12 }: { farol: Farol; size?: number }) {
  return <span aria-label={FAROL_LABEL[farol]} style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: FAROL_COR[farol], marginRight: ".4rem", verticalAlign: "middle" }} />;
}

function InsightCard({ i, onPlan }: { i: Insight; onPlan?: (i: Insight) => void }) {
  return (
    <div className="panel" style={{ marginBottom: ".6rem", borderLeft: `4px solid ${i.nivel === "critico" ? "var(--bad)" : i.nivel === "aviso" ? "var(--warn)" : "var(--ok)"}` }}>
      <div className="row">
        <b>{i.titulo}</b>
        <span className="spacer"></span>
        <span className={"badge " + NIVEL_CLASS[i.nivel]}>{NIVEL_LABEL[i.nivel]}</span>
      </div>
      <p className="muted small" style={{ margin: ".25rem 0" }}>{i.detalhe}</p>
      {i.acao && <p style={{ margin: ".25rem 0 0" }}><b>O que fazer:</b> {i.acao}</p>}
      {onPlan && <button className="btn small" style={{ marginTop: ".4rem" }} onClick={() => onPlan(i)}>＋ Colocar no plano de ação</button>}
    </div>
  );
}

export default function Saude({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, history, canEdit, audit } = useDoca();
  const { user } = useAuth();
  const toast = useToast();
  const [periodo, setPeriodo] = useState(7);

  const s = useMemo(() => (curBase ? analisarBase(history, curBase, periodo, todayISO()) : null), [curBase, history, periodo]);
  if (!curBase || !s) return null;

  const sugestoes = sugerirRedistribuicao(history.filter((d) => d.data >= shiftISO(todayISO(), -(periodo - 1))), (curBase.meta ?? 95) / 100);
  const noPlano = async (i: Insight) => {
    if (!user) return;
    const ult = history.length ? history[history.length - 1].data : todayISO();
    const erro = await criarAcao(curBase.id, user.id, { titulo: i.titulo, detalhe: `${i.detalhe}${i.acao ? " | O que fazer: " + i.acao : ""}`.slice(0, 1000), origem: i.id, baseline: pctUltimos7(history, ult) });
    if (erro) { toast("Não consegui salvar: " + erro); return; }
    void audit("acao_criada", { titulo: i.titulo, origem: i.id });
    toast("Adicionado ao Plano de ação");
  };

  const meta = curBase.meta ?? 95;
  const seta = s.tendencia === "subindo" ? "▲" : s.tendencia === "caindo" ? "▼" : s.tendencia === "estavel" ? "▬" : "";

  return (
    <section className="pane active">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row">
          <h2 style={{ margin: 0 }}>Saúde da base {curBase.name}</h2>
          <span className="spacer"></span>
          <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={14}>Últimos 14 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
        </div>
        <p className="muted small">
          Sugestões automáticas baseadas nos números dos seus relatórios do JMS: cada uma mostra os dados que a originaram. A
          meta é a que você definiu para esta base ({meta}%); você pode mudá-la em <a href="#" onClick={(e) => { e.preventDefault(); openScreen("ajustes"); }}>Dados da base</a>.
        </p>
      </div>

      {s.diasSemCarta > 0 && (
        <div className="warnbox" style={{ marginBottom: "1rem" }}>
          <b>Estamos calculando com dados incompletos.</b> Falta o número de entregas em {s.diasSemCarta} de {s.dias} dia{s.dias === 1 ? "" : "s"}{" "}
          (faltou a Carta de porte). Sem ela não dá para fazer a análise quantitativa e qualitativa desses dias. Importe a Carta de porte em Operação e salve o dia.
        </div>
      )}

      <div className="panel" style={{ marginBottom: "1rem", borderLeft: `6px solid ${FAROL_COR[s.farol]}` }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <div className="small muted">Farol da base</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 600 }}><FarolDot farol={s.farol} size={18} />{FAROL_LABEL[s.farol]}</div>
            <div>{s.veredito}</div>
          </div>
          <span className="spacer"></span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "2rem", fontWeight: 600 }}>{s.pct != null ? fmtPct(s.pct) : "—"}</div>
            <div className="small muted">
              entregues · meta {meta}%
              {s.delta != null && <> · {seta} {(s.delta * 100).toFixed(1).replace(".", ",")} p.p. vs período anterior</>}
            </div>
            <div className="small muted">{fmtN(s.entregues)} de {fmtN(s.total)} pacotes</div>
          </div>
        </div>
      </div>

      <div className="kpis">
        {s.indicadores.map((ind) => (
          <div className="kpi" key={ind.chave}>
            <b style={{ color: FAROL_COR[ind.farol] }}>{ind.valor != null ? fmtPct(ind.valor) : "—"}</b>
            <span><FarolDot farol={ind.farol} size={9} />{ind.rotulo} · {ind.alvo}</span>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3>O que atacar primeiro</h3>
        {s.prioridades.length === 0 ? (
          <div className="okbox">Nenhuma prioridade crítica no período. Continue acompanhando o farol.</div>
        ) : (
          s.prioridades.map((i, n) => (<div key={i.id}><div className="small muted">Prioridade {n + 1}</div><InsightCard i={i} onPlan={canEdit ? noPlano : undefined} /></div>))
        )}
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h3>Análise completa</h3>
        {AREAS.map((a) => {
          const list = s.insights.filter((i) => i.area === a);
          if (!list.length) return null;
          return (
            <div key={a} style={{ marginBottom: "1rem" }}>
              <h4 style={{ margin: ".4rem 0" }}>{AREA_LABEL[a]}</h4>
              {list.map((i) => (<InsightCard key={i.id} i={i} onPlan={canEdit ? noPlano : undefined} />))}
            </div>
          );
        })}
        {s.insights.length === 0 && <p className="muted">Sem observações para o período.</p>}
      </div>

      {sugestoes.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Sugestão de redistribuição de rotas</h3>
          <p className="muted small">Bairros abaixo da meta em que um motorista com resultado melhor poderia assumir parte da entrega. É uma estimativa feita só com os números do período: o gerente decide, conhecendo a rua, o veículo e a carga de cada um.</p>
          {sugestoes.map((r) => (
            <div key={r.bairro} className="panel" style={{ marginBottom: ".5rem" }}>
              <b>{r.bairro}</b>: passar de {r.de} para {r.para}
              <div className="small muted">{r.motivo} Pode render cerca de {r.ganho} entregas a mais no período ({r.pacotes} pacotes do bairro hoje com {r.de}).</div>
            </div>
          ))}
        </div>
      )}

      {s.motoristas.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Motoristas no período</h3>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Motorista</th><th>Pacotes</th><th>Por dia</th><th>Entregues</th><th>Dias abaixo do alerta</th><th>Farol</th></tr></thead>
              <tbody>
                {s.motoristas.map((m) => (
                  <tr key={m.nome}>
                    <td>{m.nome}</td>
                    <td className="num">{fmtN(m.t)}</td>
                    <td className="num">{fmtN(Math.round(m.porDia))}</td>
                    <td className="num">{fmtPct(m.pct)}</td>
                    <td className="num">{m.diasAbaixo}</td>
                    <td><FarolDot farol={m.farol} />{FAROL_LABEL[m.farol]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {s.bairros.length > 0 && (
        <div className="panel">
          <h3>Bairros que mais perdem entregas</h3>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Bairro</th><th>Pacotes</th><th>Entregues</th><th>Quem mais entrega lá</th><th>Farol</th></tr></thead>
              <tbody>
                {s.bairros.slice(0, 15).map((b) => (
                  <tr key={b.nome}>
                    <td>{b.nome}</td>
                    <td className="num">{fmtN(b.total)}</td>
                    <td className="num">{fmtPct(b.pct)}</td>
                    <td>{b.melhor || "—"}</td>
                    <td><FarolDot farol={b.farol} />{FAROL_LABEL[b.farol]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
