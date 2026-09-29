import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDoca } from "../hooks/DocaContext";
import { useAuth } from "../hooks/useAuth";

export default function Membros() {
  const { curBase, members, role, inviteMember, updateMemberRole, removeMember } = useDoca();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [busy, setBusy] = useState(false);
  const isOwner = role === "owner";

  const submit = async () => {
    if (!email.trim()) return;
    setBusy(true);
    const ok = await inviteMember(email, inviteRole);
    setBusy(false);
    if (ok) setEmail("");
  };

  if (!curBase) return null;

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Membros e permissões</h2>
        <p className="muted small">
          Quem tem acesso à base <b>{curBase.name}</b>. <b>Editor</b> pode importar planilhas, salvar o histórico e
          alterar cadastros; <b>leitor</b> só visualiza. A pessoa convidada precisa já ter uma conta no Doca com esse
          e-mail.
        </p>

        {isOwner && (
          <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">E-mail da pessoa</span>
              <input
                type="email"
                value={email}
                placeholder="nome@empresa.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{ minWidth: 240 }}
              />
            </label>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">Papel</span>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}>
                <option value="editor">Editor</option>
                <option value="viewer">Leitor</option>
              </select>
            </label>
            <button className="btn primary" disabled={busy || !email.trim()} onClick={submit}>
              Adicionar
            </button>
          </div>
        )}

        <div className="tablewrap" style={{ marginTop: "1rem" }}>
          <table className="drv">
            <thead>
              <tr><th>Pessoa</th><th>Papel</th><th></th></tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {members.map((m) => (
                  <motion.tr
                    key={m.user_id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <td>{m.email}{m.user_id === user?.id ? <span className="muted small"> (você)</span> : null}</td>
                    <td>
                      {isOwner && m.role !== "owner" ? (
                        <select value={m.role} onChange={(e) => updateMemberRole(m.user_id, e.target.value as "editor" | "viewer")}>
                          <option value="editor">Editor</option>
                          <option value="viewer">Leitor</option>
                        </select>
                      ) : (
                        <span className="badge ok">{m.role === "owner" ? "Dono" : m.role === "editor" ? "Editor" : "Leitor"}</span>
                      )}
                    </td>
                    <td>
                      {isOwner && m.role !== "owner" && (
                        <button className="btn small" onClick={() => { if (confirm(`Remover ${m.email} desta base?`)) removeMember(m.user_id); }}>
                          Remover
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {!isOwner && (
          <div className="infobox" style={{ marginTop: "1rem" }}>Só o dono da base pode convidar, alterar papéis ou remover membros.</div>
        )}
      </div>
    </section>
  );
}
