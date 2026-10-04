import { useEffect, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { supabase } from "../lib/supabase";
import { fmtN } from "../lib/format";

interface Batch { id: string; created_at: string; user_email: string | null; data: string | null; arquivos: { nome: string }[]; total: number; entregues: number; divergencias: number }
interface Log { id: string; created_at: string; user_email: string | null; action: string; detail: Record<string, unknown> }

const ACOES: Record<string, string> = {
  importacao: "Importou planilhas",
  dia_salvo: "Salvou um dia",
  dia_apagado: "Apagou um dia",
  fechamento_fechado: "Fechou um pagamento",
  fechamento_aberto: "Reabriu um pagamento",
  fechamento_excluido: "Excluiu um pagamento",
  membro_convidado: "Convidou um membro",
  papel_alterado: "Alterou o papel de um membro",
  membro_removido: "Removeu um membro",
  qr_iniciada: "Iniciou uma conferência QR",
  qr_concluida: "Concluiu uma conferência QR",
  qr_encerrada: "Encerrou uma conferência QR",
  qr_troca_motorista: "Confirmou troca de motorista na conferência QR",
  resumo_whatsapp: "Gerou resumo para WhatsApp",
  imagem_ranking: "Gerou a imagem do ranking",
  acao_criada: "Criou uma ação no plano",
  acao_concluida: "Concluiu uma ação do plano",
  acao_reaberta: "Reabriu uma ação do plano",
  link_motorista_criado: "Criou um link de motorista",
  link_motorista_revogado: "Desativou links de motorista",
};

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR");
const resumo = (d: Record<string, unknown>) =>
  Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");

export default function Auditoria() {
  const { curBase, role, isSuperAdmin } = useDoca();
  const podeVerLog = role === "owner" || isSuperAdmin;
  const [aba, setAba] = useState<"imp" | "log">("imp");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!curBase) return;
    let vivo = true;
    (async () => {
      const [b, l] = await Promise.all([
        supabase.from("import_batches").select("*").eq("base_id", curBase.id).order("created_at", { ascending: false }).limit(200),
        podeVerLog ? supabase.from("audit_logs").select("*").eq("base_id", curBase.id).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
      ]);
      if (!vivo) return;
      setBatches((b.data as Batch[]) || []);
      setLogs((l.data as Log[]) || []);
    })();
    return () => { vivo = false; };
  }, [curBase, podeVerLog]);

  if (!curBase) return <section className="pane active"><div className="panel">Escolha uma base.</div></section>;
  const termo = busca.trim().toLowerCase();
  const logsF = logs.filter((x) => !termo || `${ACOES[x.action] || x.action} ${x.user_email} ${resumo(x.detail)}`.toLowerCase().includes(termo));

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Auditoria e importações</h2>
        <p className="muted">Quem importou o quê e quando, e o registro das ações que mudam dados da base {curBase.name}.</p>
        <div className="row" style={{ marginBottom: ".6rem" }}>
          <button className={"btn small" + (aba === "imp" ? " primary" : "")} onClick={() => setAba("imp")}>Histórico de importações</button>
          {podeVerLog && <button className={"btn small" + (aba === "log" ? " primary" : "")} onClick={() => setAba("log")}>Registro de ações</button>}
        </div>

        {aba === "imp" && (
          batches.length === 0 ? <p className="muted">Nenhuma importação registrada ainda.</p> : (
            <div className="tablewrap">
              <table className="drv">
                <thead><tr><th>Quando</th><th>Quem</th><th>Dia dos dados</th><th>Arquivos</th><th>Pacotes</th><th>Entregues</th><th>Divergências</th></tr></thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td>{quando(b.created_at)}</td>
                      <td>{b.user_email || "—"}</td>
                      <td>{b.data ? b.data.split("-").reverse().join("/") : "—"}</td>
                      <td className="small">{(b.arquivos || []).map((a) => a.nome).join(", ") || "—"}</td>
                      <td>{fmtN(b.total)}</td>
                      <td>{fmtN(b.entregues)}</td>
                      <td>{b.divergencias ? <span className="badge warn">{fmtN(b.divergencias)}</span> : "0"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {aba === "log" && podeVerLog && (
          <>
            <input placeholder="Buscar por pessoa ou ação" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ maxWidth: 320, marginBottom: ".6rem" }} />
            {logsF.length === 0 ? <p className="muted">Nada registrado ainda.</p> : (
              <div className="tablewrap">
                <table className="drv">
                  <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
                  <tbody>
                    {logsF.map((x) => (
                      <tr key={x.id}>
                        <td>{quando(x.created_at)}</td>
                        <td>{x.user_email || "—"}</td>
                        <td>{ACOES[x.action] || x.action}</td>
                        <td className="small muted">{resumo(x.detail)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
