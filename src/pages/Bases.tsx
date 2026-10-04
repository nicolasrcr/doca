import { useState } from "react";
import { useDoca } from "../hooks/DocaContext";

export default function Bases() {
  const { bases, curBase, selectBase, createBase, orgs, orgRoles, isSuperAdmin } = useDoca();
  const [orgId, setOrgId] = useState("");
  const creatableOrgs = orgs.filter((o) => isSuperAdmin || orgRoles[o.id] === "admin");
  const orgName = (id?: string | null) => orgs.find((o) => o.id === id)?.name || "—";

  return (
    <section className="pane active">
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Minhas bases</h2>
          <span className="spacer"></span>
          {creatableOrgs.length > 0 && (
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} title="Organização da nova base">
              <option value="">Sem organização</option>
              {creatableOrgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <button
            className="btn primary"
            onClick={async () => {
              const name = prompt("Nome da nova base (ex.: F SBS-DF):");
              if (!name || !name.trim()) return;
              const id = await createBase(name, orgId || null);
              selectBase(id);
            }}
          >
            + Nova base
          </button>
        </div>
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Base</th><th>Organização</th><th>Cidade</th><th>Meta</th><th></th></tr></thead>
            <tbody>
              {bases.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b>{b.id === curBase?.id && <span className="badge ok"> atual</span>}</td>
                  <td>{orgName(b.org_id)}</td>
                  <td>{b.city || "—"}</td>
                  <td className="num">{b.meta ?? 95}%</td>
                  <td>{b.id !== curBase?.id && <button className="btn small" onClick={() => selectBase(b.id)}>Selecionar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
