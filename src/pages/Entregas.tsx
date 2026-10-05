import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDoca } from "../hooks/DocaContext";
import AnimatedNumber from "../components/AnimatedNumber";
import { useToast, downloadBlob, copyText } from "../hooks/useToast";
import { useDialog } from "../hooks/useDialog";
import { readRows, prepare, detectReportType } from "../lib/parse";
import { faltam, level } from "../lib/compute";
import { fmtN, fmtPct, brDate } from "../lib/format";
import { contextoWhats, geradoEm } from "../lib/share";
import type { DayRecord, SheetTable } from "../lib/types";
import { buildDayRow } from "../lib/dayRow";
import DiaCharts from "../components/viz/DiaCharts";
import { Dica, Menu, MenuItem } from "../components/ui";
import type { ActiveScreen } from "../hooks/useNav";

function DropZone({
  label,
  tag,
  hint,
  table,
  onFile,
  onReset,
  labels,
  onMapChange,
}: {
  label: string;
  tag: string;
  hint: string;
  table: SheetTable | null;
  onFile: (f: File) => void;
  onReset: () => void;
  labels: Record<string, string>;
  onMapChange: (key: string, idx: number) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = !!table;
  return (
    <div
      className={"drop " + (over ? "over " : "") + (done ? "done" : "")}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <h3>
        {label} <span className="tag">{tag}</span>
      </h3>
      {!done && <p className="muted small">{hint}</p>}
      {!done && (
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          aria-label={label}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      )}
      {done && (
        <p className="muted small">
          <b>{table!.data.length} linhas</b>{" "}
          <button className="btn small" type="button" onClick={onReset}>
            Trocar arquivo
          </button>
        </p>
      )}
      {table && (
        <>
          {table.positional && (
            <div className="warnbox">Não encontrei todos os cabeçalhos esperados. Confira as colunas abaixo antes de usar os números.</div>
          )}
          <div className="map">
            {Object.entries(labels).map(([k, l]) => (
              <label key={k}>
                {l}
                <select value={table.map[k]} onChange={(e) => onMapChange(k, parseInt(e.target.value, 10))}>
                  <option value={-1}>(nenhuma)</option>
                  {table.headers.map((h, j) => (
                    <option key={j} value={j}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Entregas({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const {
    curBase,
    result,
    sheetBase,
    sheetEnt,
    sheetColeta,
    coletaResult,
    setSheetBase,
    setSheetEnt,
    setSheetColeta,
    dayDate,
    setDayDate,
    saveDay,
    canEdit,
    audit,
    history,
    drivers,
  } = useDoca();
  const toast = useToast();
  const dialog = useDialog();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"pior" | "melhor" | "volume" | "nome">("pior");

  const meta = curBase ? curBase.meta / 100 : 0.95;
  const alerta = curBase ? curBase.alerta / 100 : 0.7;

  const BASE_KEYS = ["cod", "ent", "prob", "base", "distrito", "hr_saida", "hr_chegada", "retencao", "tipo_produto", "peso", "assinante", "origem", "bloqueado", "hr_problema"];
  const ENT_KEYS = ["cod", "responsavel", "pagamento", "centro_financeiro", "status_carta", "origem", "bloqueado", "hr_digitacao"];

  // O franqueado pode soltar os dois arquivos do JMS em qualquer uma das duas caixas — o Doca
  // detecta pelo cabeçalho qual relatório é qual (bipagem x carta de porte) e encaixa sozinho.
  const handleJmsFile = async (f: File, expected: "bipagem" | "carta_porte") => {
    try {
      const rows = await readRows(f);
      const type = detectReportType(rows);
      if (type === "bipagem") {
        setSheetBase(prepare(rows, BASE_KEYS, { cod: 0, ent: 4, prob: 8 }));
        if (expected !== "bipagem") toast("Esse arquivo é o Monitoramento de bipagem — encaixei na caixa certa automaticamente.");
      } else if (type === "carta_porte") {
        setSheetEnt(prepare(rows, ENT_KEYS, { cod: 0 }));
        if (expected !== "carta_porte") toast("Esse arquivo é a Carta de porte — encaixei na caixa certa automaticamente.");
      } else if (expected === "bipagem") {
        setSheetBase(prepare(rows, BASE_KEYS, { cod: 0, ent: 4, prob: 8 }));
      } else {
        setSheetEnt(prepare(rows, ENT_KEYS, { cod: 0 }));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui ler o arquivo");
    }
  };
  const handleBaseFile = (f: File) => handleJmsFile(f, "bipagem");
  const handleEntFile = (f: File) => handleJmsFile(f, "carta_porte");
  const handleColetaFile = async (f: File) => {
    try {
      const rows = await readRows(f);
      setSheetColeta(prepare(rows, ["cod", "status_coleta"], { cod: 0 }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui ler o arquivo");
    }
  };

  // Indicadores do dia que hoje só existem no ParcelItem (pagamento, tipo de produto, peso,
  // SLA, bloqueados, divergência) — nenhuma tela mostrava isso, apesar de já vir do JMS.
  const indicadores = useMemo(() => {
    if (!result) return null;
    const itens = result.list.flatMap((d) => d.itens);
    const comHorarios = itens.filter((it) => it.hr_saida && it.hr_chegada);
    const slaOk = comHorarios.filter((it) => it.sla_ok).length;
    const pesoTotal = itens.reduce((a, it) => a + (it.peso || 0), 0);
    const top = (rec: Record<string, number>, n: number) =>
      Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n);
    const pagamentos: Record<string, number> = {};
    const tiposProduto: Record<string, number> = {};
    for (const it of itens) {
      if (it.pagamento) pagamentos[it.pagamento] = (pagamentos[it.pagamento] || 0) + 1;
      if (it.tipo_produto) tiposProduto[it.tipo_produto] = (tiposProduto[it.tipo_produto] || 0) + 1;
    }
    return {
      slaOk,
      slaTotal: comHorarios.length,
      pesoTotal,
      pagamentos: top(pagamentos, 5),
      tiposProduto: top(tiposProduto, 5),
      bloqueados: result.bloqueados.length,
      divergentes: result.divergentes.length,
    };
  }, [result]);

  const filteredSorted = useMemo(() => {
    if (!result) return [];
    const nq = q.toLowerCase();
    let L = result.list.filter((d) => !nq || d.nome.toLowerCase().includes(nq));
    const cmp = {
      pior: (a: typeof L[0], b: typeof L[0]) => a.pct - b.pct || b.t - a.t,
      melhor: (a: typeof L[0], b: typeof L[0]) => b.pct - a.pct || b.t - a.t,
      volume: (a: typeof L[0], b: typeof L[0]) => b.t - a.t,
      nome: (a: typeof L[0], b: typeof L[0]) => a.nome.localeCompare(b.nome, "pt-BR"),
    }[sort];
    L = [...L].sort(cmp);
    return L;
  }, [result, q, sort]);

  // dia que acabou de ser carregado, no mesmo formato do histórico, para os gráficos
  const diaAtual = useMemo(
    () => (result && curBase ? ({ id: "atual", ...buildDayRow({ baseId: curBase.id, data: dayDate, meta: curBase.meta, salvoPor: "", result, coleta: coletaResult }) } as unknown as DayRecord) : null),
    [result, curBase, dayDate, coletaResult]
  );
  const ultimoSalvo = history.length ? history[history.length - 1] : null;

  const openDriverDialog = (nome: string) => {
    if (!result) return;
    const d = result.list.find((x) => x.nome === nome);
    if (!d) return;
    let cur: "n" | "p" | "e" | "all" = d.n ? "n" : d.p ? "p" : "all";
    const groups: Record<string, string> = { n: "Não entregues", p: "Problemas", e: "Entregues", all: "Todos" };
    const st = result.driverStats[d.nome];
    const divergDoMotorista = result.divergentes.filter((v) => v.motoristaBipagem === d.nome || v.motoristaResponsavel === d.nome);
    const retidosDoMotorista = result.retidos.filter((v) => v.motorista === d.nome);
    const draw = () => {
      const it = cur === "all" ? d.itens : d.itens.filter((x) => x.st === cur);
      dialog.open(
        d.nome,
        <div>
          <p className="muted">
            {fmtN(d.t)} pacotes, {fmtPct(d.pct)} entregues. {faltam(d.t, d.e, meta) ? `Faltam ${faltam(d.t, d.e, meta)} para a meta.` : "Meta batida."}
          </p>
          {st && (st.saida || st.entregasPorHora > 0) && (
            <div className="kpis" style={{ marginBottom: ".75rem" }}>
              <div className="kpi"><b>{st.saida || "—"}</b><span>saída (mediana)</span></div>
              <div className="kpi"><b>{st.primeiraEntrega || "—"}</b><span>1ª entrega</span></div>
              <div className="kpi"><b>{st.ultimaEntrega || "—"}</b><span>última entrega</span></div>
              <div className="kpi"><b>{st.entregasPorHora.toFixed(1)}</b><span>entregas/h</span></div>
              {st.noturnas > 0 && <div className="kpi"><b>{st.noturnas}</b><span>entregas após as 20h</span></div>}
            </div>
          )}
          {(divergDoMotorista.length > 0 || retidosDoMotorista.length > 0) && (
            <div className="warnbox" style={{ marginBottom: ".75rem" }}>
              {divergDoMotorista.length > 0 && <div>{divergDoMotorista.length} pacote{divergDoMotorista.length > 1 ? "s" : ""} com motorista divergente entre bipagem e carta de porte.</div>}
              {retidosDoMotorista.length > 0 && <div>{retidosDoMotorista.length} pacote{retidosDoMotorista.length > 1 ? "s" : ""} retido{retidosDoMotorista.length > 1 ? "s" : ""} na base.</div>}
            </div>
          )}
          <div className="subtabs" role="tablist">
            {Object.entries(groups).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={k === cur}
                onClick={() => {
                  cur = k as typeof cur;
                  draw();
                }}
              >
                {l} ({k === "all" ? d.t : (d as unknown as Record<string, number>)[k]})
              </button>
            ))}
          </div>
          {it.length ? (
            <ul className="codes">
              {it.map((x, i) => (
                <li key={i}>
                  {x.c}
                  {x.bloqueado ? <span className="muted small" style={{ marginRight: ".35rem" }}>⚠ revisão</span> : null}
                  {x.prob && x.st !== "e" ? <span>{x.prob}{x.hrProblema ? ` · ${x.hrProblema}` : ""}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nada nesta lista.</p>
          )}
        </div>,
        [
          { label: "Copiar lista", onClick: () => copyText(it.map((x) => x.c).join("\n"), toast) },
          {
            label: "Conferir na câmera",
            cls: "primary",
            onClick: () => {
              dialog.close();
              openScreen("conferencia");
            },
          },
        ]
      );
    };
    draw();
  };

  const whatsText = (sel: Set<string>) => {
    if (!result || !curBase) return "";
    const L = result.list.filter((d) => sel.has(d.nome)).sort((a, b) => b.pct - a.pct);
    const t = L.reduce((a, d) => ({ t: a.t + d.t, e: a.e + d.e, p: a.p + d.p }), { t: 0, e: 0, p: 0 });
    const f = faltam(t.t, t.e, meta);
    let s = `*Relatório de entregas*\n${contextoWhats(curBase.name, dayDate)}\n`;
    s += `👥 ${L.length} motorista${L.length === 1 ? "" : "s"} neste resumo\n📦 Pacotes: ${fmtN(t.t)}\n✅ Entregues: ${fmtN(t.e)} (${fmtPct(t.t ? t.e / t.t : 0)})\n⚠️ Com problema: ${fmtN(t.p)}\n🎯 Meta ${curBase.meta}%: ${f ? `faltaram ${fmtN(f)} entregas` : "batida"}\n\n*Por motorista*\n`;
    for (const d of L) {
      const ic = { ok: "🟢", warn: "🟡", bad: "🔴" }[level(d.pct, meta, alerta)];
      s += `${ic} *${d.nome}*\n    ${fmtPct(d.pct)} | ${d.e}/${d.t} entregues${d.p ? ` | ${d.p} problema${d.p > 1 ? "s" : ""}` : ""}\n`;
    }
    return s;
  };

  const openWhatsDialog = () => {
    if (!result) return;
    const names = result.list.map((d) => d.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const sel = new Set(names);
    const draw = () => {
      dialog.open(
        "Resumo para WhatsApp",
        <div>
          <p className="muted">Escolha quem entra no resumo.</p>
          <div className="row small" style={{ margin: ".4rem 0" }}>
            <button className="btn" type="button" onClick={() => { names.forEach((n) => sel.add(n)); draw(); }}>Todos</button>
            <button className="btn" type="button" onClick={() => { sel.clear(); draw(); }}>Nenhum</button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                sel.clear();
                result.list.filter((d) => d.pct < meta).forEach((d) => sel.add(d.nome));
                draw();
              }}
            >
              Só abaixo da meta
            </button>
          </div>
          <div className="checks">
            {names.map((n) => (
              <label key={n}>
                <input
                  type="checkbox"
                  defaultChecked={sel.has(n)}
                  onChange={(e) => {
                    if (e.target.checked) sel.add(n);
                    else sel.delete(n);
                  }}
                />{" "}
                {n}
              </label>
            ))}
          </div>
        </div>,
        [
          {
            label: "Gerar texto",
            cls: "primary",
            onClick: () => {
              if (!sel.size) { toast("Escolha ao menos um motorista"); return; }
              const txt = whatsText(sel);
              void audit("resumo_whatsapp", { dia: dayDate, motoristas: sel.size });
              dialog.open(
                "Resumo para WhatsApp",
                <div>
                  <textarea className="out" readOnly value={txt} />
                  <p className="small muted">Cole no grupo da base. Para envio automático todo dia, é preciso um webhook externo (ex.: n8n com a API oficial do WhatsApp Business) — este painel não envia mensagens sozinho.</p>
                </div>,
                [{ label: "Copiar texto", cls: "primary", onClick: () => copyText(txt, toast) }]
              );
            },
          },
        ]
      );
    };
    draw();
  };

  const drawImage = () => {
    if (!result || !curBase) return null;
    const L = [...result.list].sort((a, b) => b.pct - a.pct);
    const W = 1000, rowH = 46, top = 170, H = top + L.length * rowH + 60;
    const c = document.createElement("canvas");
    const k = 2;
    c.width = W * k; c.height = H * k;
    const g = c.getContext("2d")!;
    g.scale(k, k);
    const COL: Record<string, string> = { ok: "#1E8757", warn: "#E0A100", bad: "#C43D2B", ink: "#161616", muted: "#757575", pend: "#e2e2e2", bg: "#FFFFFF", sig: "#e2e2e2" };
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = COL.ink; g.fillRect(0, 0, W, 96);
    g.fillStyle = COL.sig; g.fillRect(0, 96, W, 6);
    g.fillStyle = "#fff"; g.font = "700 38px 'Helvetica Neue', Arial, sans-serif"; g.fillText("Relatório de entregas", 32, 56);
    g.font = "500 18px Arial, sans-serif"; g.fillText(`${curBase.name}  |  ${brDate(dayDate)}  |  meta ${curBase.meta}%`, 32, 84);
    const pct = result.tot.t ? result.tot.e / result.tot.t : 0, f = faltam(result.tot.t, result.tot.e, meta);
    g.fillStyle = COL.ink; g.font = "700 26px Arial, sans-serif";
    g.fillText(`${fmtN(result.tot.e)} de ${fmtN(result.tot.t)} entregues (${fmtPct(pct)})   ${fmtN(result.tot.p)} com problema   ${f ? `faltaram ${fmtN(f)} para a meta` : "meta batida"}`, 32, 142);
    const nameW = 300, barX = 32 + nameW, barW = W - barX - 120;
    L.forEach((d, i) => {
      const y = top + i * rowH;
      g.fillStyle = COL.ink; g.font = "500 16px Arial, sans-serif";
      let nm = d.nome;
      while (g.measureText(nm).width > nameW - 12 && nm.length > 4) nm = nm.slice(0, -2);
      if (nm !== d.nome) nm = nm.slice(0, -1) + "…";
      g.fillText(nm, 32, y + 20);
      g.fillStyle = COL.pend; g.fillRect(barX, y + 6, barW, 20);
      g.fillStyle = COL[level(d.pct, meta, alerta)]; g.fillRect(barX, y + 6, barW * d.pct, 20);
      const mx = barX + barW * meta;
      g.strokeStyle = COL.ink; g.setLineDash([4, 3]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx, y + 2); g.lineTo(mx, y + 30); g.stroke(); g.setLineDash([]);
      g.fillStyle = COL[level(d.pct, meta, alerta)]; g.font = "700 22px Arial, sans-serif"; g.fillText(fmtPct(d.pct), barX + barW + 14, y + 23);
      // o estado também em texto (a cor sozinha não basta para quem não distingue cores ou imprime em preto e branco)
      const lv = level(d.pct, meta, alerta);
      g.font = "600 12px Arial, sans-serif"; g.fillStyle = COL.muted;
      g.fillText(lv === "ok" ? "✓ Meta atingida" : lv === "warn" ? "▲ Abaixo da meta" : "✕ Crítico", barX + barW + 14, y + 38);
    });
    g.fillStyle = COL.muted; g.font = "400 13px Arial, sans-serif"; g.fillText(`Gerado por Doca em ${geradoEm()}. Ordenado do melhor para o pior resultado.`, 32, H - 24);
    return c;
  };

  const openImageDialog = () => {
    const c = drawImage();
    if (!c) return;
    const url = c.toDataURL("image/png");
    void audit("imagem_ranking", { dia: dayDate });
    dialog.open(
      "Imagem do ranking",
      <img className="preview" src={url} alt="Ranking de entregas por motorista" />,
      [{ label: "Baixar PNG", cls: "primary", onClick: () => c.toBlob((b) => b && downloadBlob(`relatorio-entregas-${dayDate}.png`, b), "image/png") }]
    );
  };

  // Romaneio impresso: uma lista para o motorista conferir/assinar na saída (entrega) e
  // outra com os pacotes que precisam voltar para a base (devolução).
  const exportRomaneio = async (kind: "entrega" | "devolucao") => {
    if (!result || !curBase) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const title = kind === "entrega" ? "Romaneio de entrega" : "Romaneio de devolução";
    const drivers = result.list
      // Usa `entregue` (chegou de fato), não `st` — senão um pacote entregue fora do SLA
      // ("p") cai errado no romaneio de devolução mesmo tendo chegado ao destinatário.
      .map((d) => ({ nome: d.nome, itens: d.itens.filter((it) => (kind === "entrega" ? it.entregue : !it.entregue)) }))
      .filter((d) => d.itens.length);
    let first = true;
    for (const d of drivers) {
      if (!first) doc.addPage();
      first = false;
      doc.setFontSize(14); doc.text(`${title} — ${curBase.name}`, 14, 16);
      doc.setFontSize(10); doc.text(`${d.nome}  |  ${brDate(dayDate)}  |  ${d.itens.length} pacote${d.itens.length > 1 ? "s" : ""}`, 14, 23);
      let y = 34; doc.setFontSize(9);
      doc.text("Código", 14, y); doc.text(kind === "entrega" ? "Bairro" : "Motivo", 90, y); doc.text("Confere", 190, y, { align: "right" });
      y += 4; doc.line(14, y, 196, y); y += 5;
      d.itens.forEach((it) => {
        if (y > 280) { doc.addPage(); y = 16; }
        doc.text(it.c.slice(0, 30), 14, y);
        doc.text((kind === "entrega" ? it.distrito || "—" : it.prob || "—").slice(0, 40), 90, y);
        doc.rect(188, y - 3.5, 4, 4);
        y += 6;
      });
      y += 6;
      if (y > 270) { doc.addPage(); y = 16; }
      doc.setFontSize(9);
      doc.text("Assinatura do motorista: ______________________________", 14, y + 14);
      doc.text("Assinatura da base: ______________________________", 14, y + 24);
    }
    if (!drivers.length) { toast(kind === "entrega" ? "Nenhum pacote a entregar no romaneio." : "Nenhum pacote para devolução."); return; }
    doc.save(`romaneio-${kind}-${dayDate}.pdf`);
  };

  const exportCsv = () => {
    if (!result) return;
    const qq = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Motorista", "Pacotes", "Entregues", "Problemas", "Não entregues", "% entregue", "Faltam para a meta"].map(qq).join(";")];
    result.list.forEach((d) => lines.push([d.nome, d.t, d.e, d.p, d.n, (d.pct * 100).toFixed(1).replace(".", ","), faltam(d.t, d.e, meta)].map(qq).join(";")));
    downloadBlob(`entregas-${dayDate}.csv`, new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  };

  // Exportação bruta por pacote — inclui colunas que hoje não aparecem em nenhuma tela
  // (origem, marca de revisão, horário do problema, tempo de digitação) para quem quiser
  // cruzar os dados em outra ferramenta.
  const exportCsvPacotes = () => {
    if (!result) return;
    const qq = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["Código", "Motorista", "Status", "Entregue", "Problema", "Horário do problema", "Retenção", "Bairro", "Saída", "Chegada", "Tipo de produto", "Peso", "Origem", "Marca de revisão", "Motorista responsável", "Divergente", "Forma de pagamento", "Centro financeiro", "Tempo de digitação"];
    const lines = [cols.map(qq).join(";")];
    for (const d of result.list)
      for (const it of d.itens)
        lines.push([
          it.c, d.nome, it.st, it.entregue ? "sim" : "não", it.prob || "", it.hrProblema || "", it.retencao || "",
          it.distrito || "", it.hr_saida || "", it.hr_chegada || "", it.tipo_produto || "", it.peso ?? "",
          it.origem || "", it.bloqueado ? "sim" : "não", it.responsavelOficial || "", it.divergenteMotorista ? "sim" : "não",
          it.pagamento || "", it.centroFinanceiro || "", it.hrDigitacao || "",
        ].map(qq).join(";"));
    downloadBlob(`pacotes-${dayDate}.csv`, new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  };

  return (
    <section className="pane active">
      <div className="pageHead">
        <h2>Entregas do dia</h2>
        <Dica>Solte aqui as exportações do JMS: o Monitoramento de bipagem e a Carta de porte (e a Coleta, se a base faz). As colunas são reconhecidas pelo nome. Nada sai do navegador até você salvar o dia.</Dica>
        <span className="spacer"></span>
        {result && (
          <>
            <input type="date" aria-label="Dia dos dados" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
            <Menu rotulo="Compartilhar">
              <MenuItem onClick={openWhatsDialog}>Resumo para WhatsApp</MenuItem>
              <MenuItem onClick={openImageDialog}>Imagem do ranking</MenuItem>
            </Menu>
            <Menu rotulo="Exportar">
              <MenuItem onClick={exportCsv}>Resultado por motorista (CSV)</MenuItem>
              <MenuItem onClick={exportCsvPacotes}>Todos os pacotes (CSV)</MenuItem>
              <MenuItem onClick={() => exportRomaneio("entrega")}>Romaneio de entrega (PDF)</MenuItem>
              <MenuItem onClick={() => exportRomaneio("devolucao")}>Romaneio de devolução (PDF)</MenuItem>
            </Menu>
            <button className="btn primary" disabled={!canEdit} onClick={() => saveDay()}>Salvar no histórico</button>
          </>
        )}
      </div>

      <details className="cargas" open={!result && !ultimoSalvo}>
        <summary>Arquivos do dia {sheetBase || sheetEnt || sheetColeta ? `(${[sheetBase, sheetEnt, sheetColeta].filter(Boolean).length} carregado${[sheetBase, sheetEnt, sheetColeta].filter(Boolean).length > 1 ? "s" : ""})` : ""}</summary>
      <div className="loads">
        <DropZone
          label="Saídas por motorista"
          tag="Monitoramento de bipagem de entrega"
          hint="Arraste o Excel exportado do JMS ou clique para escolher (.xlsx ou .csv)."
          table={sheetBase}
          onFile={handleBaseFile}
          onReset={() => setSheetBase(null)}
          labels={{ cod: "Código do pedido", ent: "Motorista", prob: "Problema" }}
          onMapChange={(k, idx) => sheetBase && setSheetBase({ ...sheetBase, map: { ...sheetBase.map, [k]: idx } })}
        />
        <DropZone
          label="Entregues / Carta de porte"
          tag="Confirma quem entregou, o status e o pagamento"
          hint="Arraste o Excel de entregues ou a exportação de Carta de porte do JMS."
          table={sheetEnt}
          onFile={handleEntFile}
          onReset={() => setSheetEnt(null)}
          labels={{ cod: "Código do pedido", responsavel: "Motorista responsável", pagamento: "Forma de pagamento" }}
          onMapChange={(k, idx) => sheetEnt && setSheetEnt({ ...sheetEnt, map: { ...sheetEnt.map, [k]: idx } })}
        />
        <DropZone
          label="Coleta"
          tag="Bipagem de coleta (opcional)"
          hint="Arraste a planilha de coleta no cliente, se a base também faz coleta. Dimensão separada da entrega."
          table={sheetColeta}
          onFile={handleColetaFile}
          onReset={() => setSheetColeta(null)}
          labels={{ cod: "Código do pedido", status_coleta: "Status da coleta" }}
          onMapChange={(k, idx) => sheetColeta && setSheetColeta({ ...sheetColeta, map: { ...sheetColeta.map, [k]: idx } })}
        />
      </div>
      </details>

      {!result && !ultimoSalvo && (
        <div className="empty">
          <h3>Carregue as exportações do JMS</h3>
          <p>Os gráficos do dia aparecem assim que os arquivos entrarem.</p>
        </div>
      )}

      {!result && ultimoSalvo && curBase && (
        <>
          <p className="small muted" style={{ margin: "0 0 .6rem" }}>Último dia salvo · {brDate(ultimoSalvo.data)}. Carregue novos arquivos acima para atualizar.</p>
          <DiaCharts day={ultimoSalvo} base={curBase} drivers={drivers} />
        </>
      )}

      {result && curBase && (
        <div>
          {result.linhasDescartadas > 0 && (
            <div className="warnbox" style={{ marginBottom: ".75rem" }}>
              {result.linhasDescartadas} linha{result.linhasDescartadas > 1 ? "s" : ""} com horário de saída/chegada em formato ilegível — essas datas não entraram no cálculo de SLA (mas o pacote continua contado normalmente).
            </div>
          )}
          {diaAtual && <DiaCharts day={diaAtual} base={curBase} drivers={drivers} />}
          <details className="cargas" style={{ margin: "1rem 0" }}>
            <summary>Mais números do dia</summary>
          {coletaResult && (
            <div className="panel" style={{ margin: "0 0 1rem" }}>
              <h3 style={{ margin: "0 0 .5rem" }}>Coleta</h3>
              <div className="kpis">
                <div className="kpi"><b><AnimatedNumber value={coletaResult.total} format={(v) => fmtN(Math.round(v))} /></b><span>pedidos para coletar</span></div>
                <div className="kpi"><b style={{ color: "var(--ok)" }}><AnimatedNumber value={coletaResult.feita} format={(v) => fmtN(Math.round(v))} /></b><span>coletados, {fmtPct(coletaResult.pct)}</span></div>
                <div className="kpi"><b style={{ color: "var(--bad)" }}><AnimatedNumber value={coletaResult.falhaBipagem} format={(v) => fmtN(Math.round(v))} /></b><span>falha de bipagem na coleta</span></div>
              </div>
            </div>
          )}
          {indicadores && (indicadores.slaTotal > 0 || indicadores.pesoTotal > 0 || indicadores.pagamentos.length > 0 || indicadores.tiposProduto.length > 0 || indicadores.bloqueados > 0) && (
            <div className="panel" style={{ margin: "0 0 1rem" }}>
              <h3 style={{ margin: "0 0 .5rem" }}>Indicadores do dia</h3>
              <p className="muted small" style={{ margin: "0 0 .75rem" }}>Dados que já vêm do JMS mas não apareciam em lugar nenhum — pagamento, tipo de produto, peso e SLA.</p>
              <div className="kpis" style={{ marginBottom: indicadores.pagamentos.length || indicadores.tiposProduto.length ? ".75rem" : 0 }}>
                {indicadores.slaTotal > 0 && (
                  <div className="kpi"><b>{fmtPct(indicadores.slaOk / indicadores.slaTotal)}</b><span>no prazo (SLA 24h), de {fmtN(indicadores.slaTotal)} com horário legível</span></div>
                )}
                {indicadores.pesoTotal > 0 && (
                  <div className="kpi"><b>{indicadores.pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg</b><span>peso total do dia</span></div>
                )}
                {indicadores.bloqueados > 0 && (
                  <div className="kpi"><b style={{ color: "var(--bad)" }}>{fmtN(indicadores.bloqueados)}</b><span>marcados para revisão</span></div>
                )}
                {indicadores.divergentes > 0 && (
                  <div className="kpi"><b style={{ color: "var(--bad)" }}>{fmtN(indicadores.divergentes)}</b><span>motorista divergente</span></div>
                )}
              </div>
              <div className="row" style={{ gap: "1.5rem", flexWrap: "wrap" }}>
                {indicadores.pagamentos.length > 0 && (
                  <div>
                    <b className="small">Forma de pagamento</b>
                    <ul className="codes" style={{ marginTop: ".35rem" }}>
                      {indicadores.pagamentos.map(([k, v]) => <li key={k}>{k}<span>{fmtN(v)}</span></li>)}
                    </ul>
                  </div>
                )}
                {indicadores.tiposProduto.length > 0 && (
                  <div>
                    <b className="small">Tipo de produto</b>
                    <ul className="codes" style={{ marginTop: ".35rem" }}>
                      {indicadores.tiposProduto.map(([k, v]) => <li key={k}>{k}<span>{fmtN(v)}</span></li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          </details>
          <div>
            <div>
              <div className="toolbar">
                <input type="search" placeholder="Buscar motorista" value={q} onChange={(e) => setQ(e.target.value)} />
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="pior">Pior desempenho primeiro</option>
                  <option value="melhor">Melhor desempenho primeiro</option>
                  <option value="volume">Maior volume</option>
                  <option value="nome">Nome</option>
                </select>
                <div className="legend">
                  <span><i style={{ background: "var(--ok)" }}></i>Entregue</span>
                  <span><i style={{ background: "var(--bad)" }}></i>Problema</span>
                  <span><i style={{ background: "var(--pend)" }}></i>Não entregue</span>
                  <span><i style={{ background: "var(--signal)" }}></i>Meta</span>
                </div>
              </div>
              <div className="board">
                {!result.hasEnt && (
                  <div className="warnbox" style={{ margin: ".5rem" }}>
                    Falta a planilha de entregues. Por enquanto tudo que não tem problema aparece como não entregue.
                  </div>
                )}
                <div className="lanehead"><span>Motorista</span><span>Entregues, problemas e pendentes</span><span style={{ textAlign: "right" }}>No prazo</span></div>
                <AnimatePresence initial={false}>
                  {filteredSorted.length ? (
                    filteredSorted.map((d, i) => {
                      const lv = level(d.pct, meta, alerta);
                      const fa = faltam(d.t, d.e, meta);
                      return (
                        <motion.button
                          key={d.nome}
                          className="lane"
                          onClick={() => openDriverDialog(d.nome)}
                          layout
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1], delay: Math.min(i, 12) * 0.015 }}
                        >
                          <span className="who2">
                            {d.nome}
                            <small>{fmtN(d.t)} pacotes · {fmtN(d.p)} problema{d.p === 1 ? "" : "s"} · {fmtN(d.n)} pendente{d.n === 1 ? "" : "s"}</small>
                          </span>
                          <span className="track" aria-hidden="true">
                            <motion.span className="e" animate={{ width: `${d.t ? (d.e / d.t) * 100 : 0}%` }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}></motion.span>
                            <motion.span className="p" animate={{ width: `${d.t ? (d.p / d.t) * 100 : 0}%` }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}></motion.span>
                            <span className="goal" style={{ left: `${curBase.meta}%` }}></span>
                          </span>
                          <span className={"pct " + lv}>
                            {fmtPct(d.pct)}
                            <small>{fa ? `faltam ${fa}` : "meta batida"}</small>
                          </span>
                        </motion.button>
                      );
                    })
                  ) : (
                    <div className="empty">Nenhum motorista com esse nome.</div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
