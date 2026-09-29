import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { fmtR } from "../lib/format";
import type { Driver } from "../lib/types";

function DriverRow({ d, canEdit, onSave, onDelete, rateHint }: {
  d: Driver;
  canEdit: boolean;
  onSave: (fields: Partial<Driver>) => void;
  onDelete: () => void;
  rateHint: string;
}) {
  const [name, setName] = useState(d.name);
  const [aliases, setAliases] = useState((d.aliases || []).join(", "));
  const [placa, setPlaca] = useState(d.placa || "");
  const [veiculo, setVeiculo] = useState(d.veiculo || "");
  const [rate, setRate] = useState(d.rate ?? "");
  const [active, setActive] = useState(d.active !== false);

  const save = () =>
    onSave({
      name: name.trim(),
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      placa: placa.trim(),
      veiculo: veiculo.trim(),
      rate: rate === "" ? null : parseFloat(String(rate)),
      active,
    });

  return (
    <tr>
      <td><input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} onBlur={save} /></td>
      <td><input value={aliases} disabled={!canEdit} placeholder="ex.: JOAO S., joao silva" onChange={(e) => setAliases(e.target.value)} onBlur={save} /></td>
      <td><input value={placa} disabled={!canEdit} placeholder="ABC1D23" style={{ width: 90 }} onChange={(e) => setPlaca(e.target.value)} onBlur={save} /></td>
      <td><input value={veiculo} disabled={!canEdit} placeholder="Moto, Van…" style={{ width: 100 }} onChange={(e) => setVeiculo(e.target.value)} onBlur={save} /></td>
      <td><input className="rate" type="number" min={0} step={0.01} value={rate} disabled={!canEdit} placeholder={rateHint} onChange={(e) => setRate(e.target.value === "" ? "" : parseFloat(e.target.value))} onBlur={save} /></td>
      <td><input type="checkbox" checked={active} disabled={!canEdit} onChange={(e) => { setActive(e.target.checked); onSave({ active: e.target.checked }); }} /></td>
      <td>{canEdit && <button className="btn small" type="button" onClick={() => { if (confirm(`Excluir ${name}?`)) onDelete(); }}>Excluir</button>}</td>
    </tr>
  );
}

export default function Motoristas() {
  const { curBase, drivers, updateDriver, deleteDriver, addDriver, result, canEdit } = useDoca();

  const seenInData = useMemo(() => {
    if (!result) return [];
    const known = new Set(drivers.map((d) => d.name));
    return result.list.map((d) => d.nome).filter((n) => !known.has(n));
  }, [result, drivers]);

  return (
    <section className="pane active">
      <div className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Motoristas da base</h2>
          <span className="spacer"></span>
          {canEdit && (
            <button
              className="btn primary"
              onClick={() => {
                const n = prompt("Nome do motorista:");
                if (n && n.trim()) addDriver(n);
              }}
            >
              Novo motorista
            </button>
          )}
        </div>
        <p className="muted small">Nomes que aparecem diferentes no JMS podem ser apelidos do mesmo motorista. Cadastre-os em "Apelidos" para unificar.</p>
        <div className="tablewrap">
          <table className="drv">
            <thead>
              <tr><th>Nome</th><th>Apelidos vindos do JMS</th><th>Placa</th><th>Veículo</th><th>Valor/entrega</th><th>Ativo</th><th></th></tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <DriverRow
                  key={d.id}
                  d={d}
                  canEdit={canEdit}
                  onSave={(fields) => updateDriver(d.id, fields)}
                  onDelete={() => deleteDriver(d.id)}
                  rateHint={fmtR(curBase?.rate)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {seenInData.length > 0 && canEdit && (
          <div className="infobox" style={{ marginTop: ".75rem" }}>
            Motoristas nas planilhas de hoje que ainda não têm cadastro: {seenInData.join(", ")}.{" "}
            <button className="btn small" onClick={async () => { for (const n of seenInData) await addDriver(n); }}>
              Cadastrar todos
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
