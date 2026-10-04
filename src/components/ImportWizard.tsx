import { useMemo, useRef, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { fmtN, fmtPct, norm } from "../lib/format";
import { scanJmsFiles, type ImportScan } from "../lib/importer";

interface Row {
  id: string;
  include: boolean;
  name: string;
  date: string;
}

type Step = "idle" | "scanning" | "preview" | "importing" | "done";

export default function ImportWizard({ onDone }: { onDone: (firstBaseId: string | null) => void }) {
  const { bases, orgs, orgRoles, isSuperAdmin, importBases } = useDoca();
  const [step, setStep] = useState<Step>("idle");
  const [over, setOver] = useState(false);
  const [scan, setScan] = useState<ImportScan | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");
  const [makeCompany, setMakeCompany] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState<{ created: number; existing: number; days: number; firstBaseId: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasOwnOrg = Object.values(orgRoles).includes("admin");
  const creatableOrgs = orgs.filter((o) => isSuperAdmin || orgRoles[o.id] === "admin");

  const existingNames = useMemo(() => new Set(bases.map((b) => norm(b.name))), [bases]);
  const isNew = (name: string) => !!name.trim() && !existingNames.has(norm(name));
  const included = rows.filter((r) => r.include);
  const newNames = new Set(included.filter((r) => isNew(r.name)).map((r) => norm(r.name)));
  const offerCompany = newNames.size >= 2 && !hasOwnOrg && !isSuperAdmin;
  const missingName = included.some((r) => !r.name.trim());

  const handleFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    setError("");
    setStep("scanning");
    try {
      const res = await scanJmsFiles(files);
      if (!res.groups.length) {
        setError(
          "Não encontrei pacotes nessas planilhas. Use o relatório “Monitoramento de bipagem de entrega” do JMS (e, se tiver, a “Carta de porte”)."
        );
        setStep("idle");
        return;
      }
      setScan(res);
      setRows(res.groups.map((g) => ({ id: g.id, include: true, name: g.name, date: g.date })));
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui ler as planilhas");
      setStep("idle");
    }
  };

  const confirm = async () => {
    if (!scan) return;
    setStep("importing");
    const items = included.map((r) => {
      const g = scan.groups.find((x) => x.id === r.id)!;
      return { name: r.name.trim(), date: r.date, table: g.table };
    });
    const res = await importBases(items, scan.carta, {
      orgId: orgId || null,
      companyName: offerCompany && makeCompany ? companyName.trim() || "Minha empresa" : null,
    });
    if (!res) {
      setStep("preview");
      return;
    }
    setSummary(res);
    setStep("done");
  };

  if (step === "done" && summary) {
    return (
      <div className="panel">
        <h3>Pronto! Importação concluída</h3>
        <p>
          {summary.created > 0 && <>{summary.created} base{summary.created === 1 ? "" : "s"} criada{summary.created === 1 ? "" : "s"}. </>}
          {summary.existing > 0 && <>{summary.existing} base{summary.existing === 1 ? "" : "s"} que já existia{summary.existing === 1 ? "" : "m"} atualizada{summary.existing === 1 ? "" : "s"}. </>}
          {summary.days > 0
            ? <>{summary.days} dia{summary.days === 1 ? "" : "s"} salvo{summary.days === 1 ? "" : "s"} no histórico.</>
            : <>Nenhum dia foi gravado no histórico. Importe a Carta de porte junto com o Monitoramento de bipagem para trazer os números.</>}
        </p>
        <button className="btn primary" onClick={() => onDone(summary.firstBaseId)}>Ver a visão geral das bases</button>
      </div>
    );
  }

  if ((step === "preview" || step === "importing") && scan) {
    return (
      <div className="panel">
        <h3>Encontrei {scan.groups.length === 1 ? "1 base" : `${scan.groups.length} bases`} nas planilhas</h3>
        <p className="muted small">Confira, ajuste os nomes e as datas se precisar, e confirme. Nada é criado antes da sua confirmação.</p>
        {scan.ignored.length > 0 && (
          <div className="warnbox">Ignorei {scan.ignored.length} arquivo(s) que não parecem relatórios do JMS: {scan.ignored.join(", ")}</div>
        )}
        {!scan.carta && (
          <div className="warnbox">
            <b>Faltou a “Carta de porte”.</b> É ela que confirma quais pacotes foram entregues. Sem ela eu só crio as bases e
            não gravo o histórico (senão o percentual de entrega ficaria zerado). Para importar os números agora, volte e
            arraste também a Carta de porte junto com o Monitoramento de bipagem.
          </div>
        )}
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th></th><th>Base</th><th>Dia</th><th>Pacotes</th><th>Entregues</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const g = scan.groups.find((x) => x.id === r.id)!;
                return (
                  <tr key={r.id} style={{ opacity: r.include ? 1 : 0.5 }}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} /></td>
                    <td>
                      <input
                        value={r.name}
                        placeholder="Dê um nome para esta base"
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                        style={{ minWidth: 200 }}
                      />
                    </td>
                    <td>
                      <input type="date" value={r.date} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                    </td>
                    <td className="num">{fmtN(g.total)}</td>
                    <td className="num">{g.total ? fmtPct(g.entregues / g.total) : "—"}</td>
                    <td>
                      {!r.name.trim() ? <span className="badge warn">sem nome</span> : isNew(r.name) ? <span className="badge ok">nova base</span> : <span className="badge">já existe — será atualizada</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Se duas linhas tiverem o mesmo nome (por exemplo, “F SBS-DF” e “F SBS DF”), elas viram uma só base.</p>

        {offerCompany && (
          <div className="infobox">
            <label className="inline">
              <input type="checkbox" checked={makeCompany} onChange={(e) => setMakeCompany(e.target.checked)} /> Reunir estas bases numa empresa (você será o gestor e acompanha tudo na visão geral)
            </label>
            {makeCompany && (
              <div style={{ marginTop: ".5rem" }}>
                <input value={companyName} placeholder="Nome da empresa (ex.: Grupo Silva Logística)" onChange={(e) => setCompanyName(e.target.value)} style={{ minWidth: 300 }} />
              </div>
            )}
          </div>
        )}
        {!offerCompany && creatableOrgs.length > 0 && (
          <label className="inline small" style={{ margin: ".5rem 0" }}>
            Colocar as bases novas na empresa:{" "}
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">Sem empresa</option>
              {creatableOrgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
            </select>
          </label>
        )}
        {error && <div className="warnbox">{error}</div>}
        <div className="row" style={{ marginTop: "1rem" }}>
          <button className="btn primary" disabled={step === "importing" || !included.length || missingName} onClick={confirm}>
            {step === "importing" ? "Importando…" : scan.carta ? `Confirmar e importar ${included.length} base${included.length === 1 ? "" : "s"}` : `Criar ${included.length} base${included.length === 1 ? "" : "s"} sem histórico`}
          </button>
          <button className="btn" disabled={step === "importing"} onClick={() => { setStep("idle"); setScan(null); }}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={"drop " + (over ? "over" : "")}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); }}
      style={{ textAlign: "center", padding: "1.6rem" }}
    >
      <h3 style={{ justifyContent: "center" }}>
        {step === "scanning" ? "Lendo as planilhas…" : "Arraste aqui as planilhas do JMS"}
      </h3>
      <p className="muted small">
        Pode soltar vários arquivos de uma vez, de várias bases. Usamos o “Monitoramento de bipagem de entrega” e,
        se tiver, a “Carta de porte” (.xlsx ou .csv).
      </p>
      {step !== "scanning" && (
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
      )}
      {error && <div className="warnbox" style={{ position: "relative" }}>{error}</div>}
    </div>
  );
}
