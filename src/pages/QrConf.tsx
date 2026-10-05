import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useToast, copyText } from "../hooks/useToast";
import { readRows } from "../lib/parse";
import { norm } from "../lib/format";
import { supabase } from "../lib/supabase";
import { Dica } from "../components/ui";

interface QrItem {
  code: string;
  driver: string;
  checked: boolean;
}

function parsePasted(text: string): QrItem[] {
  const items: QrItem[] = [];
  let curDriver = "Sem motorista";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\d/.test(line)) {
      items.push({ code: line, driver: curDriver, checked: false });
    } else {
      curDriver = line;
    }
  }
  return items;
}

async function parseSheet(file: File): Promise<QrItem[]> {
  const rows = await readRows(file);
  if (!rows.length) return [];
  // detecta cabeçalho: "Número de pedido JMS" e "Entregador"; senão usa A e E; coluna F (idx5) vazia = pendente
  let hIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    if (rows[r].some((c) => norm(c).includes("numero de pedido"))) { hIdx = r; break; }
  }
  let codCol = 0, drvCol = 4, pendCol = 5, dataStart = 0;
  if (hIdx >= 0) {
    const heads = rows[hIdx].map(norm);
    const fc = heads.findIndex((h) => h.includes("numero de pedido"));
    const fe = heads.findIndex((h) => h === "entregador" || h.includes("entregador"));
    if (fc >= 0) codCol = fc;
    if (fe >= 0) drvCol = fe;
    pendCol = 5;
    dataStart = hIdx + 1;
  }
  const items: QrItem[] = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    const code = (row[codCol] || "").trim();
    const driver = (row[drvCol] || "").trim();
    if (!code || !driver) continue;
    if (hIdx >= 0 && (row[pendCol] || "").trim() !== "") continue; // só pendentes
    items.push({ code, driver, checked: false });
  }
  const seen = new Set<string>();
  return items.filter((it) => {
    const k = it.driver + "|" + it.code;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.driver.localeCompare(b.driver, "pt-BR"));
}

function beep(freq = 880, ms = 160) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); void ctx.close(); }, ms);
  } catch { /* sem áudio: o aviso visual basta */ }
}

const hora = (d: Date) => d.toLocaleTimeString("pt-BR");

interface Saved { id: string; label: string; items: QrItem[]; cursor: number; updated_at: string }

export default function QrConf() {
  const { curBase, audit, role } = useDoca();
  const toast = useToast();
  const [items, setItems] = useState<QrItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pasted, setPasted] = useState("");
  const [auto, setAuto] = useState(false);
  const [autoSecs, setAutoSecs] = useState(1);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [trocas, setTrocas] = useState(0);
  const [concluida, setConcluida] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [bipado, setBipado] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; txt: string } | null>(null);
  const [nuvem, setNuvem] = useState<{ quando: Date | null; erro: boolean }>({ quando: null, erro: false });
  const [salvas, setSalvas] = useState<Saved[]>([]);
  const sessionId = useRef<string | null>(null);
  const dirty = useRef(false);
  const itemsRef = useRef<QrItem[]>([]);
  itemsRef.current = items;
  const scanRef = useRef<HTMLInputElement>(null);
  const prevDriverRef = useRef<string | undefined>(undefined);
  const canEdit = role === "owner" || role === "editor";
  const lsKey = curBase ? `doca.qrconf.${curBase.id}` : "";

  // restaura o progresso salvo neste aparelho (funciona sem internet)
  useEffect(() => {
    if (!lsKey) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(parsed.items || []);
        setCursor(parsed.cursor || 0);
        sessionId.current = parsed.sessionId || null;
        prevDriverRef.current = (parsed.items || [])[parsed.cursor || 0]?.driver;
      }
    } catch { /* ignore */ }
  }, [lsKey]);

  // sem lista local: oferece retomar a última sessão ativa salva na nuvem (outro aparelho)
  useEffect(() => {
    if (!curBase || items.length) return;
    let vivo = true;
    supabase.from("qr_conference_sessions").select("id,label,items,cursor,updated_at").eq("base_id", curBase.id).eq("status", "ativa")
      .order("updated_at", { ascending: false }).limit(3)
      .then(({ data }) => { if (vivo) setSalvas((data as Saved[]) || []); }, () => { /* offline */ });
    return () => { vivo = false; };
  }, [curBase, items.length]);

  // salva neste aparelho a cada mudança
  useEffect(() => {
    if (!lsKey || !items.length) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(lsKey, JSON.stringify({ items, cursor, sessionId: sessionId.current })); } catch { /* cheio */ }
    }, 300);
    return () => clearTimeout(t);
  }, [lsKey, items, cursor]);

  const syncNuvem = useCallback(async () => {
    if (!curBase || !canEdit || !items.length) return;
    const payload = { items, cursor, status: concluida ? "concluida" : "ativa", updated_at: new Date().toISOString() };
    try {
      if (sessionId.current) {
        const { error } = await supabase.from("qr_conference_sessions").update(payload).eq("id", sessionId.current);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("qr_conference_sessions")
          .insert({ base_id: curBase.id, label: new Date().toLocaleString("pt-BR"), ...payload }).select("id").single();
        if (error) throw error;
        sessionId.current = (data as { id: string }).id;
      }
      dirty.current = false;
      setNuvem({ quando: new Date(), erro: false });
    } catch {
      setNuvem((n) => ({ ...n, erro: true }));
    }
  }, [curBase, canEdit, items, cursor, concluida]);

  // salva na nuvem sozinho (a cada pausa de 4s) e quando a internet volta
  useEffect(() => {
    if (!items.length) return;
    dirty.current = true;
    const t = setTimeout(() => { void syncNuvem(); }, 4000);
    return () => clearTimeout(t);
  }, [items, cursor, syncNuvem]);
  useEffect(() => {
    const on = () => { if (dirty.current) void syncNuvem(); };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [syncNuvem]);

  const cur = items[cursor];
  const total = items.length;
  const marked = items.filter((i) => i.checked).length;
  const pendentes = total - marked;

  useEffect(() => {
    if (!cur) { setQrUrl(""); return; }
    let cancelled = false;
    import("qrcode").then((QR) =>
      QR.toDataURL(cur.code, { width: 320, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
        if (!cancelled) setQrUrl(url);
      })
    );
    return () => { cancelled = true; };
  }, [cur]);

  // Troca de motorista: pausa o modo automático e só segue quando o operador confirmar.
  useEffect(() => {
    if (!cur) return;
    if (prevDriverRef.current === undefined) { prevDriverRef.current = cur.driver; return; }
    if (prevDriverRef.current !== cur.driver && !pendingSwitch) {
      setAuto(false);
      setPendingSwitch(cur.driver);
      beep(520, 350);
    }
  }, [cur, pendingSwitch]);

  const confirmarTroca = useCallback(() => {
    if (!pendingSwitch) return;
    prevDriverRef.current = pendingSwitch;
    setTrocas((n) => n + 1);
    setPendingSwitch(null);
    scanRef.current?.focus();
  }, [pendingSwitch]);

  const terminou = useCallback(() => {
    setAuto(false);
    setConcluida(true);
    beep(988, 300);
    toast("Conferência concluída: chegou ao último item da lista");
    // espera a marcação do último item entrar no estado antes de contar
    setTimeout(() => {
      const its = itemsRef.current;
      const m = its.filter((i) => i.checked).length;
      void audit("qr_concluida", { total: its.length, marcados: m, pendentes: its.length - m, trocas_de_motorista: trocas });
    }, 60);
  }, [audit, toast, trocas]);

  const advance = useCallback(() => {
    if (pendingSwitch) return;
    if (cursor >= items.length - 1) { if (items.length && !concluida) terminou(); return; }
    setCursor(cursor + 1);
  }, [cursor, items.length, pendingSwitch, concluida, terminou]);
  const back = useCallback(() => { if (!pendingSwitch) setCursor((c) => Math.max(0, c - 1)); }, [pendingSwitch]);
  const mark = useCallback(() => {
    if (pendingSwitch || !items.length) return;
    setItems((prev) => prev.map((it, i) => (i === cursor ? { ...it, checked: true } : it)));
    advance();
  }, [cursor, advance, pendingSwitch, items.length]);

  useEffect(() => {
    if (!auto || !items.length || pendingSwitch) return;
    const t = setInterval(() => advance(), Math.max(300, autoSecs * 1000));
    return () => clearInterval(t);
  }, [auto, autoSecs, items.length, pendingSwitch, advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const digitando = tag === "TEXTAREA" || (tag === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox" && e.target !== scanRef.current);
      if (digitando) return;
      if (pendingSwitch) {
        if (e.key === "Enter") { e.preventDefault(); confirmarTroca(); }
        return;
      }
      if (e.target === scanRef.current && e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Escape") return;
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === " ") { e.preventDefault(); mark(); }
      else if (e.key === "a" || e.key === "A") setAuto((v) => !v);
      else if (e.key === "p" || e.key === "P") setAuto(false);
      else if (e.key === "Escape") setAuto(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, mark, pendingSwitch, confirmarTroca]);

  // leitor de QR/código de barras (funciona como teclado): bipou o código, marca e avança
  const bipar = () => {
    const code = bipado.trim();
    setBipado("");
    if (!code || pendingSwitch) return;
    const idx = items.findIndex((i, n) => i.code === code && (n === cursor || !i.checked));
    const alvo = items[cursor]?.code === code ? cursor : idx;
    if (alvo < 0) {
      beep(220, 400);
      setFeedback({ ok: false, txt: `Código ${code} não está nesta lista` });
      return;
    }
    const it = items[alvo];
    if (alvo !== cursor && it.driver !== cur?.driver) {
      beep(220, 400);
      setFeedback({ ok: false, txt: `Código ${code} é do motorista ${it.driver}, não de ${cur?.driver}` });
      return;
    }
    setItems((prev) => prev.map((x, i) => (i === alvo ? { ...x, checked: true } : x)));
    setFeedback({ ok: true, txt: `${code} conferido (${it.driver})` });
    beep(1200, 80);
    if (alvo === cursor) {
      if (cursor >= items.length - 1) { if (!concluida) terminou(); } else setCursor(cursor + 1);
    }
  };

  const byDriver = useMemo(() => {
    const m = new Map<string, QrItem[]>();
    for (const it of items) {
      if (!m.has(it.driver)) m.set(it.driver, []);
      m.get(it.driver)!.push(it);
    }
    return [...m.entries()];
  }, [items]);

  const irParaMotorista = (drv: string) => {
    const i = items.findIndex((x) => x.driver === drv && !x.checked);
    const alvo = i >= 0 ? i : items.findIndex((x) => x.driver === drv);
    if (alvo < 0) return;
    prevDriverRef.current = drv;
    setPendingSwitch(null);
    setCursor(alvo);
  };

  const iniciar = (lista: QrItem[]) => {
    setItems(lista);
    setCursor(0);
    setConcluida(false);
    setTrocas(0);
    sessionId.current = null;
    prevDriverRef.current = lista[0]?.driver;
    void audit("qr_iniciada", { itens: lista.length, motoristas: new Set(lista.map((i) => i.driver)).size });
  };

  const retomar = (s: Saved) => {
    setItems(s.items);
    setCursor(s.cursor);
    sessionId.current = s.id;
    prevDriverRef.current = s.items[s.cursor]?.driver;
    toast("Conferência retomada de onde parou");
  };

  const encerrar = async () => {
    if (!confirm("Encerrar esta conferência e limpar a lista?")) return;
    void audit("qr_encerrada", { total, marcados: marked, pendentes });
    if (sessionId.current) await supabase.from("qr_conference_sessions").update({ status: "encerrada", items, cursor, updated_at: new Date().toISOString() }).eq("id", sessionId.current);
    setItems([]);
    setConcluida(false);
    sessionId.current = null;
    prevDriverRef.current = undefined;
    if (lsKey) localStorage.removeItem(lsKey);
  };

  const statusSalvo = nuvem.erro
    ? "Sem conexão: salvo só neste aparelho. Sincroniza sozinho quando a internet voltar."
    : nuvem.quando
      ? `✓ Salvo na nuvem às ${hora(nuvem.quando)}`
      : "Salvo neste aparelho";

  return (
    <section className="pane active">
      {!items.length ? (
        <div className="panel">
          <div className="pageHead">
            <h2>Conferência QR</h2>
            <Dica>Gera o QR de cada pedido pendente, agrupado por motorista, para bipar com o leitor do JMS. O progresso é salvo sozinho e funciona sem internet.</Dica>
          </div>
          {salvas.length > 0 && (
            <div className="infobox" style={{ marginBottom: ".8rem" }}>
              <b>Conferência em andamento</b>
              {salvas.map((s) => (
                <div key={s.id} className="row" style={{ marginTop: ".3rem" }}>
                  <span className="small">{new Date(s.updated_at).toLocaleString("pt-BR")} · {s.items.filter((i) => i.checked).length}/{s.items.length} conferidos</span>
                  <span className="spacer"></span>
                  <button className="btn small primary" onClick={() => retomar(s)}>Retomar</button>
                </div>
              ))}
            </div>
          )}
          <div className="loads">
            <div className="drop">
              <h3>Planilha de pendentes <span className="tag">coluna F vazia = pendente</span></h3>
              <input type="file" accept=".csv,.xlsx" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const parsed = await parseSheet(f);
                  if (!parsed.length) { toast("Nenhum pedido pendente encontrado"); return; }
                  iniciar(parsed);
                } catch (err) { toast(err instanceof Error ? err.message : "Não consegui ler o arquivo"); }
              }} />
            </div>
            <div className="drop">
              <h3>Colar lista de texto</h3>
              <p className="small muted">Nome do motorista numa linha, códigos numéricos nas linhas seguintes.</p>
              <textarea className="out" style={{ minHeight: 120 }} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              <button className="btn primary" style={{ marginTop: ".5rem" }} onClick={() => {
                const parsed = parsePasted(pasted);
                if (!parsed.length) { toast("Nada reconhecido no texto colado"); return; }
                iniciar(parsed);
              }}>Carregar lista</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="split">
          <div className="panel" style={{ textAlign: "center" }}>
            {pendingSwitch && (
              <div className="qrSwitch" role="alertdialog" aria-live="assertive" aria-label="Mudou de motorista">
                <div className="qrSwitchBox">
                  <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>⚠️ MUDOU DE MOTORISTA</div>
                  <div style={{ fontSize: "2rem", fontWeight: 800, margin: ".4rem 0" }}>{pendingSwitch}</div>
                  <p className="muted small">A conferência está pausada. Separe os pacotes deste motorista e confirme para continuar.</p>
                  <button className="btn primary" autoFocus onClick={confirmarTroca}>Continuar com {pendingSwitch} (Enter)</button>
                </div>
              </div>
            )}
            {concluida && (
              <div className="okbox"><b>✓ Conferência concluída.</b> {marked} de {total} conferidos{pendentes ? `, ${pendentes} pendente${pendentes === 1 ? "" : "s"}` : ""}.</div>
            )}
            <p className="muted small" style={{ marginBottom: ".25rem" }}>{cur?.driver}</p>
            <h3 style={{ fontFamily: "var(--mono, monospace)" }}>{cur?.code} {cur?.checked && <span className="badge ok">conferido</span>}</h3>
            {qrUrl && <img src={qrUrl} alt={cur?.code} style={{ width: 260, height: 260 }} />}
            <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
              <button className="btn" onClick={back}>◀ Voltar</button>
              <button className="btn primary" onClick={mark}>✓ Marcar (espaço)</button>
              <button className="btn" onClick={advance}>Avançar ▶</button>
            </div>
            <div className="row" style={{ justifyContent: "center", marginTop: ".75rem" }}>
              <button className="btn small" onClick={() => setAuto((v) => !v)} disabled={!!pendingSwitch}>{auto ? "⏸ Pausar (P)" : "▶ Automático (A)"}</button>
              <button className="btn small" onClick={() => setAuto(false)} disabled={!auto}>⏹ Parar (Esc)</button>
              <input type="number" min={1} value={autoSecs} onChange={(e) => setAutoSecs(Number(e.target.value) || 1)} style={{ width: 60 }} aria-label="Segundos por código" />
              <span className="small muted">segundos</span>
            </div>
            <div style={{ marginTop: ".8rem" }}>
              <input ref={scanRef} value={bipado} onChange={(e) => setBipado(e.target.value)} placeholder="Bipe o código aqui com o leitor e aperte Enter"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bipar(); } }} style={{ width: "100%", maxWidth: 380 }} aria-label="Campo do leitor de código" />
              {feedback && <div className={"small " + (feedback.ok ? "" : "bad")} role="status" style={{ marginTop: ".3rem", color: feedback.ok ? "var(--ok)" : "var(--bad)" }}>{feedback.ok ? "✓" : "✕"} {feedback.txt}</div>}
            </div>
            <p className="small muted" style={{ marginTop: ".5rem" }}>{cursor + 1} / {total} · {marked} conferidos · {pendentes} pendentes</p>
            <p className="small muted">{statusSalvo}</p>
            <div className="row" style={{ justifyContent: "center", marginTop: ".5rem", flexWrap: "wrap" }}>
              <button className="btn small" onClick={() => copyText(cur?.code || "", toast)}>Copiar atual</button>
              <button className="btn small" onClick={() => copyText(items.map((i) => i.code).join("\n"), toast)}>Copiar todos</button>
              <button className="btn small" onClick={() => copyText(items.filter((i) => i.checked).map((i) => i.code).join("\n"), toast)}>Copiar marcados</button>
              <button className="btn small" onClick={() => copyText(items.filter((i) => !i.checked).map((i) => i.code).join("\n"), toast)}>Copiar pendentes</button>
              <button className="btn small" onClick={() => void syncNuvem()} disabled={!canEdit}>☁ Sincronizar agora</button>
              <button className="btn small danger" onClick={() => void encerrar()}>Encerrar</button>
            </div>
          </div>
          <div className="panel">
            <h3>Motoristas</h3>
            <p className="small muted">Toque no nome para ir ao primeiro pendente dele.</p>
            {byDriver.map(([drv, its]) => {
              const done = its.filter((i) => i.checked).length;
              const atual = drv === cur?.driver;
              return (
                <button key={drv} type="button" className="row" onClick={() => irParaMotorista(drv)}
                  style={{ padding: ".4rem 0", borderBottom: "1px solid var(--line)", width: "100%", background: "none", border: 0, textAlign: "left", cursor: "pointer", fontWeight: atual ? 700 : 400 }}>
                  <span>{atual ? "▶ " : ""}{drv}</span>
                  <span className="spacer"></span>
                  <span className="small muted">{done === its.length ? "✓ " : ""}{done}/{its.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
