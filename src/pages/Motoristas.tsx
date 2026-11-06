import { useMemo, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { fmtR } from "../lib/format";
import type { Driver } from "../lib/types";
import { Dica } from "../components/ui";
import { analisarBase, LIMITES } from "../lib/insights";
import { diaRef } from "../lib/ref";
import { metaDoMotorista } from "../lib/metas";
import { fmtN, fmtPct } from "../lib/format";
import { ChartCard, DataTable, HBars, TipRow, TipTitle, VizRoot, type HBarDatum } from "../components/viz/Viz";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { copyText, useToast } from "../hooks/useToast";

function DriverRow({ d, canEdit, onSave, onDelete, rateHint, onLink, onRevoke }: {
  d: Driver;
  canEdit: boolean;
  onSave: (fields: Partial<Driver>) => void;
  onDelete: () => void;
  rateHint: string;
  onLink: (nome: string) => void;
  onRevoke: (nome: string) => void;
}) {
  const [name, setName] = useState(d.name);
  const [aliases, setAliases] = useState((d.aliases || []).join(", "));
  const [placa, setPlaca] = useState(d.placa || "");
  const [veiculo, setVeiculo] = useState(d.veiculo || "");
  const [rate, setRate] = useState(d.rate ?? "");
  const [active, setActive] = useState(d.active !== false);
  const [meta, setMeta] = useState<number | "">(d.meta ?? "");

  const save = () =>
    onSave({
      name: name.trim(),
      aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      placa: placa.trim(),
      veiculo: veiculo.trim(),
      rate: rate === "" ? null : parseFloat(String(rate)),
      meta: meta === "" ? null : Math.min(100, Math.max(50, Number(meta))),
      active,
    });

  return (
    <tr>
      <td><input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} onBlur={save} /></td>
      <td><input value={aliases} disabled={!canEdit} placeholder="ex.: JOAO S., joao silva" onChange={(e) => setAliases(e.target.value)} onBlur={save} /></td>
      <td><input value={placa} disabled={!canEdit} placeholder="ABC1D23" className="narrow" onChange={(e) => setPlaca(e.target.value)} onBlur={save} /></td>
      <td><input value={veiculo} disabled={!canEdit} placeholder="Moto, Van…" className="narrow" onChange={(e) => setVeiculo(e.target.value)} onBlur={save} /></td>
      <td><input className="rate num" type="number" min={0} step={0.01} value={rate} disabled={!canEdit} placeholder={rateHint} onChange={(e) => setRate(e.target.value === "" ? "" : parseFloat(e.target.value))} onBlur={save} /></td>
      <td><input className="num" type="number" min={50} max={100} step={0.5} value={meta} disabled={!canEdit} placeholder="da base" onChange={(e) => setMeta(e.target.value === "" ? "" : parseFloat(e.target.value))} onBlur={save} /></td>
      <td className="c"><input type="checkbox" checked={active} disabled={!canEdit} onChange={(e) => { setActive(e.target.checked); onSave({ active: e.target.checked }); }} /></td>
      <td>{canEdit && (
        <div className="rowActions">
          <button className="btn small" type="button" title="Copia um link só de leitura com o resultado deste motorista" onClick={() => onLink(d.name)}>Copiar link</button>
          <button className="btn small" type="button" title="Desativa todos os links já gerados para este motorista" onClick={() => onRevoke(d.name)}>Revogar</button>
          <button className="btn small danger" type="button" onClick={() => { if (confirm(`Excluir ${name}?`)) onDelete(); }}>Excluir</button>
        </div>
      )}</td>
    </tr>
  );
}

export default function Motoristas() {
  const { curBase, drivers, updateDriver, deleteDriver, addDriver, result, canEdit, audit, history } = useDoca();
  const { user } = useAuth();
  const toast = useToast();
  const [novoNome, setNovoNome] = useState("");

  const gerarLink = async (nome: string) => {
    if (!curBase || !user) return;
    const { data, error } = await supabase.from("driver_links").insert({ base_id: curBase.id, driver_name: nome, created_by: user.id }).select("token").single();
    if (error || !data) { toast("Não consegui criar o link: " + (error?.message || "")); return; }
    void audit("link_motorista_criado", { motorista: nome });
    copyText(`${window.location.origin}/?m=${(data as { token: string }).token}`, toast);
  };
  const revogar = async (nome: string) => {
    if (!curBase || !confirm(`Desativar todos os links de ${nome}?`)) return;
    const { error } = await supabase.from("driver_links").update({ revoked: true }).eq("base_id", curBase.id).eq("driver_name", nome);
    if (error) { toast(error.message); return; }
    void audit("link_motorista_revogado", { motorista: nome });
    toast("Links desativados");
  };

  const seenInData = useMemo(() => {
    const known = new Set(drivers.map((d) => d.name));
    const nomes = new Set<string>();
    if (result) result.list.forEach((d) => nomes.add(d.nome));
    history.slice(-30).forEach((h) => (h.motoristas || []).forEach((m) => nomes.add(m.n)));
    return [...nomes].filter((n) => !known.has(n)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [result, drivers, history]);

  // resultado dos últimos 14 dias salvos, por motorista
  const saude = useMemo(() => (curBase && history.length ? analisarBase(history, curBase, 14, diaRef(history)) : null), [curBase, history]);
  const metaBase = (curBase?.meta ?? 95) / 100;
  const alerta = (curBase?.alerta ?? 70) / 100;
  const rows = (saude?.motoristas || []).filter((m) => m.t >= LIMITES.minPacotesMotorista);
  const pctData: HBarDatum[] = rows.slice().sort((a, b) => a.pct - b.pct).slice(0, 12).map((m) => {
    const dm = drivers.find((x) => x.name === m.nome);
    return {
      label: m.nome, value: m.pct, text: fmtPct(m.pct), destaque: m.pct < Math.max(alerta, dm?.meta ? metaDoMotorista(dm, curBase!) : 0),
      tip: <><TipTitle>{m.nome}</TipTitle><TipRow label="Entregues" value={`${fmtN(m.e)} de ${fmtN(m.t)}`} /><TipRow label="Dias abaixo do alerta" value={String(m.diasAbaixo)} /></>,
    };
  });
  const maxT = Math.max(1, ...rows.map((m) => m.t));
  const volData: HBarDatum[] = rows.slice().sort((a, b) => b.t - a.t).slice(0, 12).map((m) => ({
    label: m.nome, value: m.t / maxT, text: m.dias > 1 ? `${fmtN(m.t)} · ${fmtN(Math.round(m.porDia))}/dia` : fmtN(m.t),
    tip: <><TipTitle>{m.nome}</TipTitle><TipRow label="Pacotes" value={fmtN(m.t)} /><TipRow label="Média por dia" value={fmtN(Math.round(m.porDia))} /></>,
  }));

  return (
    <section className="pane active">
      {rows.length > 0 && (
        <VizRoot>
          <div className="viz-grid">
            <div className="viz-span-6">
              <ChartCard title="% entregue por motorista" caption="Últimos 14 dias salvos · a linha é a meta"
                table={<DataTable cols={["Motorista", "% entregue", "Pacotes"]} rows={rows.map((m) => [m.nome, fmtPct(m.pct), fmtN(m.t)])} />}>
                <HBars name="Percentual entregue por motorista" data={pctData} refValue={metaBase} refLabel={`meta ${Math.round(metaBase * 100)}%`} />
              </ChartCard>
            </div>
            <div className="viz-span-6">
              <ChartCard title="Pacotes por motorista" caption="Quem carrega mais volume"
                table={<DataTable cols={["Motorista", "Pacotes", "Média por dia"]} rows={rows.map((m) => [m.nome, fmtN(m.t), fmtN(Math.round(m.porDia))])} />}>
                <HBars name="Pacotes por motorista" data={volData} />
              </ChartCard>
            </div>
          </div>
        </VizRoot>
      )}
      <div className="panel">
        <div className="pageHead">
          <h2>Motoristas</h2>
          <Dica>Nomes que aparecem diferentes no JMS podem ser o mesmo motorista: cadastre os apelidos para unir. A meta própria, se preenchida, vale no lugar da meta da base.</Dica>
          <span className="spacer"></span>
          {seenInData.length > 0 && canEdit && (
            <button className="btn" onClick={async () => { for (const n of seenInData) await addDriver(n); }}>Cadastrar {seenInData.length} dos arquivos</button>
          )}
        </div>
        {canEdit && (
          <form className="toolbar newDriver" onSubmit={(e) => { e.preventDefault(); const n = novoNome.trim(); if (!n) return; addDriver(n); setNovoNome(""); }}>
            <input placeholder="Nome do novo motorista" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} aria-label="Nome do novo motorista" />
            <button className="btn primary" type="submit" disabled={!novoNome.trim()}>Adicionar motorista</button>
          </form>
        )}
        <div className="tablewrap">
          <table className="drv motTable">
            <thead>
              <tr><th>Nome</th><th>Apelidos vindos do JMS</th><th>Placa</th><th>Veículo</th><th className="r">Valor/entrega</th><th className="r">Meta (%)</th><th className="c">Ativo</th><th></th></tr>
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
                  onLink={gerarLink}
                  onRevoke={revogar}
                />
              ))}
              {!drivers.length && <tr><td colSpan={8} className="muted small">Nenhum motorista cadastrado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
