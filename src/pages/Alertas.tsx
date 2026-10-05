import { useMemo } from "react";
import { useDoca } from "../hooks/DocaContext";
import { computeAlerts } from "../lib/compute";
import { fmtN, fmtPct } from "../lib/format";
import type { ActiveScreen } from "../hooks/useNav";
import { Dica } from "../components/ui";

const NIVEL_LABEL: Record<string, string> = { critico: "Crítico", aviso: "Aviso", info: "Info" };
const NIVEL_CLASS: Record<string, string> = { critico: "bad", aviso: "warn", info: "ok" };

export default function Alertas({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, result } = useDoca();

  const alerts = useMemo(() => (result ? computeAlerts(result, curBase) : []), [result, curBase]);

  if (!result) {
    return (
      <section className="pane active">
        <div className="panel">
          <h2>Alertas operacionais</h2>
          <div className="empty"><h3>Nenhum dia carregado</h3><p>Importe as planilhas do JMS (botão no topo) ou abra Dia a dia → Entregas do dia.</p></div>
        </div>
      </section>
    );
  }

  const alertaF = (curBase?.alerta ?? 70) / 100;
  const abaixo = result.list.filter((d) => d.pct < alertaF).sort((a, b) => a.pct - b.pct);

  return (
    <section className="pane active">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="pageHead">
          <h2>Motoristas abaixo do alerta de meta</h2>
          <Dica>Abaixo do alerta configurado em Infos Básicas. Clique para ver o detalhe em Entregas do dia.</Dica>
        </div>
        {!abaixo.length ? (
          <div className="okbox">Nenhum motorista abaixo do alerta hoje.</div>
        ) : (
          <div className="board">
            {abaixo.map((d) => (
              <button key={d.nome} className="lane" style={{ gridTemplateColumns: "1fr 100px" }} onClick={() => openScreen("entregas")}>
                <span className="who2">{d.nome}<small>{fmtN(d.t)} pacotes · {fmtN(d.p)} problema{d.p === 1 ? "" : "s"}</small></span>
                <span className="pct bad">{fmtPct(d.pct)}<small>alerta {curBase?.alerta}%</small></span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="pageHead">
          <h2>Alertas operacionais do dia</h2>
          <Dica>Retenção, início tardio, ritmo atípico, taxa de falha, entrega noturna, carga desigual e divergência de motorista. Ajuste os limites em Infos Básicas.</Dica>
        </div>
        {!alerts.length ? (
          <div className="okbox">Nenhum alerta operacional hoje.</div>
        ) : (
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Nível</th><th>Motorista</th><th>O que aconteceu</th><th>Ação sugerida</th></tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td><span className={"badge " + NIVEL_CLASS[a.nivel]}>{NIVEL_LABEL[a.nivel]}</span></td>
                    <td>{a.motorista || "—"}</td>
                    <td>{a.mensagem}</td>
                    <td className="muted small">{a.acao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
