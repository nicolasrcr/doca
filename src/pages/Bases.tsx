import { useDoca } from "../hooks/DocaContext";

export default function Bases() {
  const { bases, curBase, selectBase, createBase } = useDoca();

  return (
    <section className="pane active">
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Minhas bases</h2>
          <span className="spacer"></span>
          <button
            className="btn primary"
            onClick={async () => {
              const name = prompt("Nome da nova base (ex.: F SBS-DF):");
              if (!name || !name.trim()) return;
              const id = await createBase(name);
              selectBase(id);
            }}
          >
            + Nova base
          </button>
        </div>
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th>Base</th><th>Cidade</th><th>Meta</th><th></th></tr></thead>
            <tbody>
              {bases.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b>{b.id === curBase?.id && <span className="badge ok"> atual</span>}</td>
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
