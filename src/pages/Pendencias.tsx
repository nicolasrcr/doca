import { useMemo } from "react";
import { useDoca } from "../hooks/DocaContext";
import { computeAlerts } from "../lib/compute";
import { fmtN } from "../lib/format";
import type { ActiveScreen } from "../hooks/useNav";

const NIVEL_LABEL: Record<string, string> = { critico: "Crítico", aviso: "Aviso", info: "Info" };
const NIVEL_CLASS: Record<string, string> = { critico: "bad", aviso: "warn", info: "ok" };

export default function Pendencias({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, result } = useDoca();

  const alerts = useMemo(() => (result ? computeAlerts(result, curBase) : []), [result, curBase]);

  // Pendências para reprogramar: pacotes não entregues (p/n), agrupados por motivo, com motorista.
  const porMotivo = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, { motivo: string; itens: { c: string; drv: string }[] }>();
    for (const d of result.list)
      for (const it of d.itens) {
        if (it.entregue) continue;
        const m = it.prob || "Sem motivo informado";
        if (!map.has(m)) map.set(m, { motivo: m, itens: [] });
        map.get(m)!.itens.push({ c: it.c, drv: d.nome });
      }
    return [...map.values()].sort((a, b) => b.itens.length - a.itens.length);
  }, [result]);

  const totalPendentes = porMotivo.reduce((a, m) => a + m.itens.length, 0);

  if (!result) {
    return (
      <section className="pane active">
        <div className="panel">
          <h2>Pendências de hoje</h2>
          <div className="empty"><h3>Nenhum dia carregado</h3><p>Vá em Operação → Monitoramento de bipagem de entrega e importe as planilhas.</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="pane active">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 .25rem" }}>Pendências de hoje</h2>
        <p className="muted small" style={{ margin: 0 }}>
          O que precisa de ação antes de fechar o dia: pacotes para reprogramar amanhã, retenções na base e alertas operacionais.
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Alertas do dia</h3>
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
        </div>
      )}

      {result.retidos.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Retidos na base ({result.retidos.length})</h3>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Código</th><th>Motorista</th><th>Motivo</th></tr></thead>
              <tbody>
                {result.retidos.map((r) => (
                  <tr key={r.codigo}><td style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}>{r.codigo}</td><td>{r.motorista}</td><td>{r.motivo}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.bloqueados.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Marcados para revisão ({result.bloqueados.length})</h3>
          <p className="muted small" style={{ margin: "0 0 .5rem" }}>Pacotes com marca de revisão no JMS. Confira o motivo antes de liberar.</p>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Código</th><th>Motorista</th></tr></thead>
              <tbody>
                {result.bloqueados.map((r) => (
                  <tr key={r.codigo}><td style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}>{r.codigo}</td><td>{r.motorista}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.divergentes.length > 0 && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <h3>Motorista divergente ({result.divergentes.length})</h3>
          <p className="muted small" style={{ margin: "0 0 .5rem" }}>A carta de porte aponta um responsável e a bipagem, outro. Confirme quem entregou antes de fechar o pagamento.</p>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>Código</th><th>Responsável (carta de porte)</th><th>Entregador (bipagem)</th></tr></thead>
              <tbody>
                {result.divergentes.map((r) => (
                  <tr key={r.codigo}><td style={{ fontFamily: "ui-monospace,Menlo,Consolas,monospace" }}>{r.codigo}</td><td>{r.motoristaResponsavel}</td><td>{r.motoristaBipagem}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="row">
          <h3 style={{ margin: 0 }}>Reprogramar amanhã ({fmtN(totalPendentes)})</h3>
          <span className="spacer"></span>
          <button className="btn small" onClick={() => openScreen("conferencia")}>Conferir na câmera</button>
        </div>
        {!porMotivo.length ? (
          <div className="okbox" style={{ marginTop: ".5rem" }}>Nenhum pacote pendente — dia limpo.</div>
        ) : (
          porMotivo.map((m) => (
            <div key={m.motivo} style={{ marginTop: "1rem" }}>
              <div className="row" style={{ marginBottom: ".35rem" }}>
                <b>{m.motivo}</b>
                <span className="spacer"></span>
                <span className="muted small">{m.itens.length} pacote{m.itens.length > 1 ? "s" : ""}</span>
              </div>
              <ul className="codes">
                {m.itens.map((it) => (
                  <li key={it.c}>{it.c}<span>{it.drv}</span></li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
