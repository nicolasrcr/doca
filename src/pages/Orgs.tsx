import { useEffect, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useAuth } from "../hooks/useAuth";
import type { OrgRole } from "../lib/types";

const ROLE_LABEL: Record<OrgRole, string> = { admin: "Administrador", editor: "Editor", viewer: "Leitor" };

export default function Orgs() {
  const {
    orgs, orgRoles, orgMembers, isSuperAdmin, bases,
    loadOrgMembers, createOrganization, inviteOrgMember, updateOrgMemberRole, removeOrgMember,
  } = useDoca();
  const { user } = useAuth();
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("editor");
  const [newName, setNewName] = useState("");
  const [newAdmin, setNewAdmin] = useState("");
  const [busy, setBusy] = useState(false);

  const cur = orgs.find((o) => o.id === orgId) || orgs[0] || null;
  const canManage = !!cur && (isSuperAdmin || orgRoles[cur.id] === "admin");

  useEffect(() => {
    if (cur) loadOrgMembers(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  const invite = async () => {
    if (!cur || !email.trim()) return;
    setBusy(true);
    const ok = await inviteOrgMember(cur.id, email, inviteRole);
    setBusy(false);
    if (ok) setEmail("");
  };

  const create = async () => {
    if (!newName.trim() || !newAdmin.trim()) return;
    setBusy(true);
    const ok = await createOrganization(newName, newAdmin);
    setBusy(false);
    if (ok) {
      setNewName("");
      setNewAdmin("");
    }
  };

  const orgBases = cur ? bases.filter((b) => b.org_id === cur.id) : [];

  return (
    <section className="pane active">
      {isSuperAdmin && (
        <div className="panel">
          <h2>Nova organização</h2>
          <p className="muted small">
            Uma organização agrupa as bases de um parceiro. Quem for <b>administrador</b> dela cria bases e convida os
            funcionários. A pessoa precisa já ter uma conta no Doca.
          </p>
          <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">Nome do parceiro</span>
              <input value={newName} placeholder="Ex.: Grupo Silva" onChange={(e) => setNewName(e.target.value)} style={{ minWidth: 200 }} />
            </label>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">E-mail do administrador</span>
              <input type="email" value={newAdmin} placeholder="parceiro@empresa.com" onChange={(e) => setNewAdmin(e.target.value)} style={{ minWidth: 240 }} />
            </label>
            <button className="btn primary" disabled={busy || !newName.trim() || !newAdmin.trim()} onClick={create}>
              Criar organização
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Organizações</h2>
          <span className="spacer"></span>
          {orgs.length > 0 && (
            <select value={cur?.id || ""} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>

        {!cur ? (
          <div className="infobox" style={{ marginTop: "1rem" }}>
            Você ainda não faz parte de nenhuma organização.
            {isSuperAdmin ? " Crie a primeira acima." : " Bases criadas por você continuam funcionando normalmente."}
          </div>
        ) : (
          <>
            <p className="muted small">
              O papel na organização vale para <b>todas as bases dela</b>. <b>Administrador</b> cria bases, convida
              pessoas e gerencia as bases; <b>editor</b> opera o sistema; <b>leitor</b> só visualiza.
            </p>

            {canManage && (
              <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
                <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
                  <span className="small muted">E-mail da pessoa</span>
                  <input
                    type="email"
                    value={email}
                    placeholder="nome@empresa.com"
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && invite()}
                    style={{ minWidth: 240 }}
                  />
                </label>
                <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
                  <span className="small muted">Papel</span>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRole)}>
                    <option value="admin">Administrador</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Leitor</option>
                  </select>
                </label>
                <button className="btn primary" disabled={busy || !email.trim()} onClick={invite}>
                  Adicionar
                </button>
              </div>
            )}

            <div className="tablewrap" style={{ marginTop: "1rem" }}>
              <table className="drv">
                <thead><tr><th>Pessoa</th><th>Papel</th><th></th></tr></thead>
                <tbody>
                  {orgMembers.filter((m) => m.org_id === cur.id).map((m) => (
                    <tr key={m.user_id}>
                      <td>{m.email}{m.user_id === user?.id ? <span className="muted small"> (você)</span> : null}</td>
                      <td>
                        {canManage ? (
                          <select value={m.role} onChange={(e) => updateOrgMemberRole(cur.id, m.user_id, e.target.value as OrgRole)}>
                            <option value="admin">Administrador</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Leitor</option>
                          </select>
                        ) : (
                          <span className="badge ok">{ROLE_LABEL[m.role]}</span>
                        )}
                      </td>
                      <td>
                        {canManage && (
                          <button className="btn small" onClick={() => { if (confirm(`Remover ${m.email} da organização ${cur.name}?`)) removeOrgMember(cur.id, m.user_id); }}>
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: "1.5rem" }}>Bases desta organização</h3>
            {orgBases.length === 0 ? (
              <div className="infobox">
                Nenhuma base ainda.{canManage ? " Crie uma em “Minhas bases” escolhendo esta organização." : ""}
              </div>
            ) : (
              <ul>
                {orgBases.map((b) => (
                  <li key={b.id}>{b.name}{b.city ? ` — ${b.city}` : ""}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
