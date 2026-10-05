import { useEffect, useMemo, useRef, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { supabase } from "../lib/supabase";
import { fmtN, fmtPct, norm } from "../lib/format";
import { scanJmsFiles, type ImportScan } from "../lib/importer";
import type { Check } from "../lib/validate";
import { ROTULO, divergenciasCsv, type Divergencia, type TipoDivergencia } from "../lib/divergencias";
import { csvBlob, downloadBlob } from "../hooks/useToast";

interface Row {
  id: string;
  key: string; // identifica o grupo achado na planilha, para preservar edições ao reler
  include: boolean;
  name: string;
  date: string;
  meta: number;
}

async function hashDe(f: File): Promise<string> {
  try {
    const buf = await f.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${f.name}|${f.size}`;
  }
}

const fileId = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
const groupKey = (name: string, date: string) => `${norm(name)}|${date}`;

type Step = "idle" | "scanning" | "preview" | "importing" | "done";

const ICONE: Record<Check["nivel"], string> = { ok: "✓", aviso: "⚠", erro: "✕" };

function ChecksPanel({ checks, onFix, busy }: { checks: Check[]; onFix: (horas: number) => void; busy: boolean }) {
  const problemas = checks.filter((c) => c.nivel !== "ok");
  const oks = checks.filter((c) => c.nivel === "ok");
  return (
    <div className={problemas.length ? "warnbox" : "okbox"} style={{ margin: ".6rem 0" }}>
      <b>Verificação dos arquivos</b>
      {problemas.length === 0 && <span> — tudo certo ({oks.length} conferências passaram)</span>}
      {problemas.map((c) => (
        <div key={c.id} style={{ marginTop: ".4rem" }}>
          <div><b>{ICONE[c.nivel]} {c.titulo}</b></div>
          {c.detalhe && <div className="small">{c.detalhe}</div>}
          {c.fix && (
            <button className="btn small primary" style={{ marginTop: ".3rem" }} disabled={busy} onClick={() => onFix(c.fix!.horas)}>
              {c.fix.rotulo}
            </button>
          )}
        </div>
      ))}
      {oks.length > 0 && problemas.length > 0 && (
        <details style={{ marginTop: ".5rem" }}>
          <summary className="small">{oks.length} conferência{oks.length === 1 ? "" : "s"} sem problema</summary>
          <ul className="small" style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>
            {oks.map((c) => (<li key={c.id}>{c.titulo}{c.detalhe ? ` — ${c.detalhe}` : ""}</li>))}
          </ul>
        </details>
      )}
      {oks.length > 0 && problemas.length === 0 && (
        <ul className="small" style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>
          {oks.map((c) => (<li key={c.id}>{c.titulo}{c.detalhe ? ` — ${c.detalhe}` : ""}</li>))}
        </ul>
      )}
    </div>
  );
}

function DivergenciasPanel({ lista }: { lista: Divergencia[] }) {
  if (!lista.length) return null;
  const tipos = (Object.keys(ROTULO) as TipoDivergencia[]).map((t) => ({ t, itens: lista.filter((d) => d.tipo === t) })).filter((x) => x.itens.length);
  return (
    <div className="warnbox" style={{ margin: ".6rem 0" }}>
      <div className="row">
        <b>Divergências encontradas ({fmtN(lista.length)})</b>
        <span className="spacer"></span>
        <button type="button" className="btn small" onClick={() => downloadBlob("divergencias-importacao.csv", csvBlob(divergenciasCsv(lista)))}>Baixar lista (CSV)</button>
      </div>
      <p className="small" style={{ margin: ".3rem 0" }}>Nenhum desses casos é descartado em silêncio: pedidos repetidos contam uma vez, e os demais ficam listados com a linha da planilha para você corrigir na origem.</p>
      {tipos.map(({ t, itens }) => (
        <details key={t} style={{ marginTop: ".3rem" }}>
          <summary className="small"><b>{ROTULO[t]}</b>: {fmtN(itens.length)}</summary>
          <ul className="small" style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem", maxHeight: 180, overflow: "auto" }}>
            {itens.slice(0, 50).map((d, i) => (<li key={i}><span className="mono">{d.codigo || "—"}</span> · {d.detalhe}</li>))}
            {itens.length > 50 && <li>… e mais {fmtN(itens.length - 50)} no CSV</li>}
          </ul>
        </details>
      ))}
    </div>
  );
}

export default function ImportWizard({ onDone, initialFiles }: { onDone: (firstBaseId: string | null, totalBases: number) => void; initialFiles?: File[] }) {
  const { bases, orgs, orgRoles, isSuperAdmin, importBases } = useDoca();
  const [step, setStep] = useState<Step>("idle");
  const [over, setOver] = useState(false);
  const [scan, setScan] = useState<ImportScan | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [shiftHoras, setShiftHoras] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [orgId, setOrgId] = useState("");
  const [makeCompany, setMakeCompany] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [summary, setSummary] = useState<{ created: number; existing: number; days: number; firstBaseId: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hashes = useRef(new Map<string, string>());
  const [jaImportado, setJaImportado] = useState<string[]>([]);

  const hasOwnOrg = Object.values(orgRoles).includes("admin");
  const creatableOrgs = orgs.filter((o) => isSuperAdmin || orgRoles[o.id] === "admin");

  const existingNames = useMemo(() => new Set(bases.map((b) => norm(b.name))), [bases]);
  const isNew = (name: string) => !!name.trim() && !existingNames.has(norm(name));
  const included = rows.filter((r) => r.include);
  const newNames = new Set(included.filter((r) => isNew(r.name)).map((r) => norm(r.name)));
  const offerCompany = newNames.size >= 2 && !hasOwnOrg && !isSuperAdmin;
  const missingName = included.some((r) => !r.name.trim());

  // Lê (ou relê) todos os arquivos já enviados. As edições que o cliente fez na prévia
  // (nome, dia, desmarcar) são preservadas para os grupos que continuam existindo.
  const readAll = async (list: File[], shift: number = shiftHoras) => {
    setError("");
    if (!list.length) {
      setScan(null);
      setRows([]);
      setStep("idle");
      return;
    }
    const wasPreview = step === "preview";
    if (!wasPreview) setStep("scanning");
    try {
      const res = await scanJmsFiles(list, { shiftHoras: shift });
      if (!res.groups.length) {
        setError(
          "Não encontrei pacotes nessas planilhas. Use o relatório “Monitoramento de bipagem de entrega” do JMS (e, se tiver, a “Carta de porte”)." +
            (res.ignored.length ? ` Ignorei: ${res.ignored.join("; ")}` : "")
        );
        setScan(null);
        setRows([]);
        setStep("idle");
        return;
      }
      const prev = new Map(rows.map((r) => [r.key, r]));
      setScan(res);
      setRows(
        res.groups.map((g) => {
          const key = groupKey(g.name, g.date);
          const old = prev.get(key);
          return { id: g.id, key, include: old ? old.include : true, name: old ? old.name : g.name, date: old ? old.date : g.date, meta: old ? old.meta : 95 };
        })
      );
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui ler as planilhas");
      setStep(wasPreview ? "preview" : "idle");
    }
  };

  const handleFiles = async (incoming: FileList | File[]) => {
    const add = Array.from(incoming);
    if (!add.length) return;
    const have = new Set(files.map(fileId));
    const next = [...files, ...add.filter((f) => !have.has(fileId(f)))];
    setFiles(next);
    await readAll(next);
  };

  // Avisa quando o mesmo arquivo (mesmo conteúdo) já foi importado antes. Reimportar não duplica nada:
  // o dia da base é substituído, mas é bom o cliente saber.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const achados: string[] = [];
      for (const f of files) {
        let h = hashes.current.get(fileId(f));
        if (!h) { h = await hashDe(f); hashes.current.set(fileId(f), h); }
        const { data } = await supabase.from("import_batches").select("created_at,user_email").contains("arquivos", [{ hash: h }]).order("created_at", { ascending: false }).limit(1);
        const b = (data as { created_at: string; user_email: string }[] | null)?.[0];
        if (b) achados.push(`${f.name}: importado em ${new Date(b.created_at).toLocaleString("pt-BR")}${b.user_email ? " por " + b.user_email : ""}`);
      }
      if (vivo) setJaImportado(achados);
    })();
    return () => { vivo = false; };
  }, [files]);

  const startedRef = useRef(false);
  useEffect(() => {
    if (initialFiles?.length && !startedRef.current) {
      startedRef.current = true;
      void handleFiles(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeFile = async (f: File) => {
    const next = files.filter((x) => fileId(x) !== fileId(f));
    setFiles(next);
    await readAll(next);
  };

  const confirm = async () => {
    if (!scan) return;
    setStep("importing");
    const items = included.map((r) => {
      const g = scan.groups.find((x) => x.id === r.id)!;
      return { name: r.name.trim(), date: r.date, meta: r.meta, table: g.table };
    });
    const arquivos = files.map((f) => ({ nome: f.name, tamanho: f.size, hash: hashes.current.get(fileId(f)) || `${f.name}|${f.size}` }));
    const res = await importBases(items, scan.carta, {
      arquivos,
      divergencias: scan.divergencias.length,
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
            : <>Nenhum dia foi gravado.</>}
        </p>
        {!scan?.carta && (
          <div className="warnbox">Os dias foram salvos como <b>incompletos</b>: falta a Carta de porte para calcular as entregas. Importe-a para completar a análise.</div>
        )}
        <button className="btn primary" autoFocus onClick={() => onDone(summary.firstBaseId, summary.created + summary.existing)}>{summary.created + summary.existing > 1 ? "Ver a visão geral das bases" : "Ver o painel da base"}</button>
      </div>
    );
  }

  if ((step === "preview" || step === "importing") && scan) {
    return (
      <div className="panel" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (step === "preview") handleFiles(e.dataTransfer.files); }}>
        <h3>Encontrei {scan.groups.length === 1 ? "1 base" : `${scan.groups.length} bases`} nas planilhas</h3>
        <p className="muted small">Confira os nomes e as datas e confirme. Nada é criado antes disso.</p>
        <div className="row" style={{ flexWrap: "wrap", gap: ".4rem", margin: ".4rem 0" }}>
          {files.map((f) => (
            <span key={fileId(f)} className="badge" style={{ display: "inline-flex", alignItems: "center", gap: ".4rem" }}>
              {f.name}
              <button type="button" aria-label={`Remover ${f.name}`} disabled={step === "importing"} onClick={() => removeFile(f)} style={{ background: "none", border: 0, cursor: "pointer", color: "inherit" }}>✕</button>
            </span>
          ))}
          <label className="btn small" style={{ position: "relative", cursor: "pointer" }}>
            + Adicionar mais arquivos
            <input type="file" multiple accept=".xlsx,.xls,.csv" disabled={step === "importing"} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        <ChecksPanel
          checks={scan.checks}
          onFix={async (h) => { setShiftHoras(h); await readAll(files, h); }}
          busy={step === "importing"}
        />
        {jaImportado.length > 0 && (
          <div className="infobox">
            <b>Estes arquivos já foram importados antes:</b>
            <ul className="small" style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>{jaImportado.map((t) => (<li key={t}>{t}</li>))}</ul>
            Pode importar de novo sem medo: o dia da base é atualizado, nada é duplicado.
          </div>
        )}
        <DivergenciasPanel lista={scan.divergencias} />
        {scan.enderecos > 0 ? (
          <div className="okbox">Achei o bairro/CEP do destinatário de {fmtN(scan.enderecos)} pedidos: a análise de rotas por bairro fica disponível.</div>
        ) : (
          <div className="infobox">
            Quer ver <b>bairros críticos</b>? Adicione também um relatório com o bairro ou CEP do destinatário (“+ Adicionar mais arquivos”).
          </div>
        )}
        {scan.ignored.length > 0 && (
          <div className="warnbox">Ignorei {scan.ignored.length} arquivo(s) que não parecem relatórios do JMS: {scan.ignored.join(", ")}</div>
        )}
        {!scan.carta && (
          <div className="warnbox">
            <b>Falta a Carta de porte.</b> Sem ela não dá para confirmar as entregas: os dias entram como incompletos. Adicione o arquivo acima para completar.
          </div>
        )}
        <div className="tablewrap">
          <table className="drv">
            <thead><tr><th></th><th>Base</th><th>Dia</th><th>Meta de entrega</th><th>Pacotes</th><th>Entregues</th><th></th></tr></thead>
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
                    <td>
                      <input
                        type="number"
                        min={50}
                        max={100}
                        step={0.5}
                        value={r.meta}
                        disabled={!isNew(r.name)}
                        title={isNew(r.name) ? "Meta de entrega desta base (%)" : "A base já existe: ajuste a meta em Dados da base"}
                        onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, meta: parseFloat(e.target.value) || 95 } : x)))}
                        style={{ width: 70 }}
                      /> %
                    </td>
                    <td className="num">{fmtN(g.total)}</td>
                    <td className="num">{scan.carta ? (g.total ? fmtPct(g.entregues / g.total) : "—") : <span className="muted" title="Falta a Carta de porte">faltando</span>}</td>
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
          <button className="btn primary" autoFocus disabled={step === "importing" || !included.length || missingName} onClick={confirm}>
            {step === "importing" ? "Importando…" : scan.carta ? `Confirmar e importar ${included.length} base${included.length === 1 ? "" : "s"}` : `Criar ${included.length} base${included.length === 1 ? "" : "s"} com dados incompletos`}
          </button>
          <button className="btn" disabled={step === "importing"} onClick={() => { setStep("idle"); setScan(null); setRows([]); setFiles([]); setShiftHoras(0); }}>Cancelar</button>
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
        Pode soltar vários arquivos de uma vez, de várias bases. Usamos o “Monitoramento de bipagem de entrega”, a
        “Carta de porte” e, se tiver, um relatório com o distrito ou CEP do destinatário (.xlsx ou .csv).
      </p>
      {step !== "scanning" && (
        <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
      )}
      {error && <div className="warnbox" style={{ position: "relative" }}>{error}</div>}
    </div>
  );
}
