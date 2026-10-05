import { useEffect, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useAuth } from "../hooks/useAuth";
import type { OrgRole } from "../lib/types";
import { Dica } from "../components/ui";

const ROLE_LABEL: Record<OrgRole, string> = { admin: "Gestor", editor: "Operador", viewer: "Consulta" };
const ROLE_HELP = "Gestor: administra a empresa, cria bases e convida pessoas. Operador: importa planilhas e opera. Consulta: só visualiza.";

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (r: OrgRole) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as OrgRole)}>
      <option value="admin">Gestor</option>
      <option value="editor">Operador</option>
      <option value="viewer">Consulta</option>
    </select>
  );
}

export default function Orgs() {
  const {
    orgs, orgRoles, orgMembers, isSuperAdmin, bases, curBase, allowedEmails, accessRequests, loadAccessRequests, decideAccess,
    loadOrgMembers, loadAllowedEmails, createOrganization, createMyOrganization, inviteToOrg,
    updateOrgMemberRole, removeOrgMember, authorizeEmail, removeAllowedEmail,
  } = useDoca();
  const { user } = useAuth();
  const [orgId, setOrgId] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("editor");
  const [busy, setBusy] = useState(false);
  const [myName, setMyName] = useState("");
  const [withBase, setWithBase] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAdmin, setNewAdmin] = useState("");
  const [freeEmail, setFreeEmail] = useState("");

  const cur = orgs.find((o) => o.id === orgId) || orgs[0] || null;
  const canManage = !!cur && (isSuperAdmin || orgRoles[cur.id] === "admin");
  const hasOwnOrg = Object.values(orgRoles).includes("admin");

  useEffect(() => {
    if (cur) loadOrgMembers(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  useEffect(() => {
    if (isSuperAdmin) loadAccessRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin || hasOwnOrg) loadAllowedEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, hasOwnOrg]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const members = cur ? orgMembers.filter((m) => m.org_id === cur.id) : [];
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const pending = cur ? allowedEmails.filter((a) => a.org_id === cur.id && !memberEmails.has(a.email)) : [];
  const orgBases = cur ? bases.filter((b) => b.org_id === cur.id) : [];
  const loose = allowedEmails.filter((a) => !a.org_id);

  return (
    <section className="pane active">
      {!cur && !isSuperAdmin && (
        <div className="panel">
          <div className="pageHead">
            <h2>Monte sua empresa</h2>
            <Dica>Tem mais de uma base ou uma equipe que usa o sistema? Crie sua empresa: você passa a ser o gestor, cria quantas
            bases quiser e convida as pessoas uma única vez, valendo para todas as bases.</Dica>
          </div>
          <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">Nome da empresa</span>
              <input value={myName} placeholder="Ex.: Grupo Silva Logística" onChange={(e) => setMyName(e.target.value)} style={{ minWidth: 260 }} />
            </label>
            <button
              className="btn primary"
              disabled={busy || !myName.trim()}
              onClick={() => run(() => createMyOrganization(myName, withBase && curBase ? curBase.id : null))}
            >
              Criar empresa
            </button>
          </div>
          {curBase && (
            <label className="inline small">
              <input type="checkbox" checked={withBase} onChange={(e) => setWithBase(e.target.checked)} /> Incluir a base atual
              ({curBase.name}) na empresa
            </label>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="pageHead">
            <h2>Pedidos de acesso{accessRequests.some((r) => r.status === "pendente") ? ` (${accessRequests.filter((r) => r.status === "pendente").length} pendente${accessRequests.filter((r) => r.status === "pendente").length === 1 ? "" : "s"})` : ""}</h2>
            <Dica>Pedidos enviados pela página inicial. Aprovar libera o e-mail para criar a conta; a pessoa precisa ser avisada por você.</Dica>
          </div>
          {accessRequests.length === 0 ? (
            <div className="infobox">Nenhum pedido até agora.</div>
          ) : (
            <div className="tablewrap">
              <table className="drv">
                <thead><tr><th>Quem</th><th>Contato</th><th>Bases</th><th>Mensagem</th><th>Situação</th><th></th></tr></thead>
                <tbody>
                  {accessRequests.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.nome}</b><div className="small muted">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div></td>
                      <td>{r.email}{r.telefone ? <div className="small muted">{r.telefone}</div> : null}</td>
                      <td className="num">{r.bases ?? "—"}</td>
                      <td className="small">{r.mensagem || "—"}</td>
                      <td><span className={"badge " + (r.status === "aprovado" ? "ok" : r.status === "recusado" ? "bad" : "warn")}>{r.status}</span></td>
                      <td>
                        {r.status === "pendente" && (
                          <>
                            <button className="btn small primary" disabled={busy} onClick={() => run(() => decideAccess(r.id, true))}>Aprovar</button>{" "}
                            <button className="btn small" disabled={busy} onClick={() => run(() => decideAccess(r.id, false))}>Recusar</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="pageHead">
            <h2>Nova empresa de parceiro</h2>
            <Dica>Cria a empresa e define o gestor dela. A pessoa precisa já ter conta; se ainda não tem, autorize o e-mail dela
            mais abaixo e peça para ela se cadastrar primeiro.</Dica>
          </div>
          <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">Nome do parceiro</span>
              <input value={newName} placeholder="Ex.: Grupo Silva" onChange={(e) => setNewName(e.target.value)} style={{ minWidth: 200 }} />
            </label>
            <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
              <span className="small muted">E-mail do gestor</span>
              <input type="email" value={newAdmin} placeholder="parceiro@empresa.com" onChange={(e) => setNewAdmin(e.target.value)} style={{ minWidth: 240 }} />
            </label>
            <button
              className="btn primary"
              disabled={busy || !newName.trim() || !newAdmin.trim()}
              onClick={() => run(async () => { if (await createOrganization(newName, newAdmin)) { setNewName(""); setNewAdmin(""); } })}
            >
              Criar empresa
            </button>
          </div>
        </div>
      )}

      {cur && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="row">
            <h2 style={{ margin: 0 }}>{isSuperAdmin ? "Empresas" : "Minha empresa"}</h2>
            <span className="spacer"></span>
            {orgs.length > 1 && (
              <select value={cur.id} onChange={(e) => setOrgId(e.target.value)}>
                {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
              </select>
            )}
          </div>
          {orgs.length === 1 && <p style={{ margin: ".2rem 0 0" }}><b>{cur.name}</b></p>}
          <p className="muted small">{ROLE_HELP} O papel vale para todas as bases da empresa.</p>

          {canManage && (
            <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
              <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
                <span className="small muted">E-mail da pessoa</span>
                <input
                  type="email"
                  value={email}
                  placeholder="nome@empresa.com"
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && email.trim() && run(async () => { if (await inviteToOrg(cur.id, email, inviteRole)) setEmail(""); })}
                  style={{ minWidth: 240 }}
                />
              </label>
              <label className="inline" style={{ flexDirection: "column", alignItems: "flex-start", gap: ".25rem" }}>
                <span className="small muted">Papel</span>
                <RoleSelect value={inviteRole} onChange={setInviteRole} />
              </label>
              <button
                className="btn primary"
                disabled={busy || !email.trim()}
                onClick={() => run(async () => { if (await inviteToOrg(cur.id, email, inviteRole)) setEmail(""); })}
              >
                Convidar
              </button>
            </div>
          )}
          {canManage && <p className="muted small">Quem ainda não tem conta recebe um convite pendente e entra na empresa assim que se cadastrar com esse e-mail.</p>}

          <div className="tablewrap" style={{ marginTop: "1rem" }}>
            <table className="drv">
              <thead><tr><th>Pessoa</th><th>Papel</th><th></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.email}{m.user_id === user?.id ? <span className="muted small"> (você)</span> : null}</td>
                    <td>
                      {canManage ? (
                        <RoleSelect value={m.role} onChange={(r) => updateOrgMemberRole(cur.id, m.user_id, r)} />
                      ) : (
                        <span className="badge ok">{ROLE_LABEL[m.role]}</span>
                      )}
                    </td>
                    <td>
                      {canManage && (
                        <button className="btn small" onClick={() => { if (confirm(`Remover ${m.email} da empresa ${cur.name}?`)) removeOrgMember(cur.id, m.user_id); }}>
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {pending.map((a) => (
                  <tr key={a.email}>
                    <td>{a.email} <span className="badge warn">convite pendente</span></td>
                    <td>{a.role ? ROLE_LABEL[a.role] : "—"}</td>
                    <td>{canManage && <button className="btn small" onClick={() => removeAllowedEmail(a.email)}>Cancelar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ marginTop: "1.5rem" }}>Bases da empresa</h3>
          {orgBases.length === 0 ? (
            <div className="infobox">Nenhuma base ainda.{canManage ? " Crie uma em “Minhas bases” escolhendo esta empresa." : ""}</div>
          ) : (
            <ul>{orgBases.map((b) => (<li key={b.id}>{b.name}{b.city ? ` — ${b.city}` : ""}</li>))}</ul>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="panel">
          <div className="pageHead">
            <h2>E-mails autorizados a se cadastrar</h2>
            <Dica>O cadastro é restrito: só entra quem tem o e-mail liberado aqui ou convidado por um gestor de empresa.</Dica>
          </div>
          <div className="row" style={{ margin: "1rem 0", alignItems: "flex-end" }}>
            <input type="email" value={freeEmail} placeholder="cliente@empresa.com" onChange={(e) => setFreeEmail(e.target.value)} style={{ minWidth: 260 }} />
            <button
              className="btn primary"
              disabled={busy || !freeEmail.trim()}
              onClick={() => run(async () => { if (await authorizeEmail(freeEmail)) setFreeEmail(""); })}
            >
              Autorizar
            </button>
          </div>
          <div className="tablewrap">
            <table className="drv">
              <thead><tr><th>E-mail</th><th></th></tr></thead>
              <tbody>
                {loose.map((a) => (
                  <tr key={a.email}>
                    <td>{a.email}</td>
                    <td><button className="btn small" onClick={() => { if (confirm(`Tirar a autorização de ${a.email}? Quem já tem conta continua entrando.`)) removeAllowedEmail(a.email); }}>Remover</button></td>
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
