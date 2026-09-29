import { useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useToast, copyText, downloadBlob } from "../hooks/useToast";

export default function Integracoes() {
  const { curBase, result, updateBase, dayDate, canEdit } = useDoca();
  const toast = useToast();
  const [webhook, setWebhook] = useState(curBase?.whatsapp_webhook || "");
  const [autoSend, setAutoSend] = useState(!!curBase?.auto_send_webhook);

  if (!curBase) return null;

  const payload = () => ({
    base: curBase.name,
    data: dayDate,
    total: result ? result.tot.t : 0,
    entregues: result ? result.tot.e : 0,
    problemas: result ? result.tot.p : 0,
    motoristas: result ? result.list.map((d) => ({ nome: d.nome, pacotes: d.t, entregues: d.e, percentual: +(d.pct * 100).toFixed(1) })) : [],
  });

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Serviços integrados</h2>
        <p className="muted">O Doca envia o resumo do dia automaticamente para um webhook seu (ex.: um fluxo n8n com a API oficial do WhatsApp Business), sem precisar copiar e colar toda vez.</p>
        <div className="form" style={{ margin: "1rem 0" }}>
          <label htmlFor="setWebhook">Endereço do webhook (WhatsApp)</label>
          <input id="setWebhook" value={webhook} disabled={!canEdit} placeholder="https://seu-n8n.com/webhook/..." onChange={(e) => setWebhook(e.target.value)} />
          <label className="inline small" style={{ marginTop: ".5rem" }}>
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={autoSend}
              onChange={(e) => setAutoSend(e.target.checked)}
            />{" "}
            Enviar o resumo automaticamente para esse webhook sempre que o dia for salvo no histórico
          </label>
        </div>
        <div className="row">
          {canEdit && (
            <button
              className="btn primary"
              onClick={() => updateBase({ whatsapp_webhook: webhook.trim(), auto_send_webhook: autoSend })}
            >
              Salvar configuração
            </button>
          )}
          <button className="btn" onClick={() => copyText(JSON.stringify(payload(), null, 2), toast)}>Copiar payload de exemplo (JSON)</button>
          <button
            className="btn"
            onClick={() => {
              if (!result) { toast("Carregue as planilhas do dia primeiro"); return; }
              downloadBlob(`doca-${curBase.id}-${dayDate}.json`, new Blob([JSON.stringify(payload(), null, 2)], { type: "application/json" }));
            }}
          >
            Exportar dados do dia em JSON
          </button>
        </div>
        <div className="infobox" style={{ marginTop: "1rem" }}>
          {curBase.auto_send_webhook && curBase.whatsapp_webhook
            ? "Envio automático ativado: toda vez que o dia for salvo em Entregas, o Doca faz um POST em JSON para o endereço acima."
            : "Envio automático desligado. Marque a caixa acima e salve para ativar — o Doca passa a chamar seu webhook sozinho a cada dia salvo."}
        </div>
      </div>
    </section>
  );
}
