import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useToast, copyText } from "../hooks/useToast";
import { readRows } from "../lib/parse";
import { norm } from "../lib/format";
import { supabase } from "../lib/supabase";

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

export default function QrConf() {
  const { curBase } = useDoca();
  const toast = useToast();
  const [items, setItems] = useState<QrItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [pasted, setPasted] = useState("");
  const [auto, setAuto] = useState(false);
  const [autoSecs, setAutoSecs] = useState(1);
  const [switchAlert, setSwitchAlert] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const lsKey = curBase ? `doca.qrconf.${curBase.id}` : "";

  // restaura progresso salvo localmente
  useEffect(() => {
    if (!lsKey) return;
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(parsed.items || []);
        setCursor(parsed.cursor || 0);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  // salva progresso a cada mudança (com debounce simples via effect)
  useEffect(() => {
    if (!lsKey || !items.length) return;
    const t = setTimeout(() => {
      localStorage.setItem(lsKey, JSON.stringify({ items, cursor }));
    }, 400);
    return () => clearTimeout(t);
  }, [lsKey, items, cursor]);

  const cur = items[cursor];
  const total = items.length;
  const marked = items.filter((i) => i.checked).length;

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

  const prevDriverRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!cur) return;
    if (prevDriverRef.current && prevDriverRef.current !== cur.driver) {
      setAuto(false);
      setSwitchAlert(true);
      const t = setTimeout(() => setSwitchAlert(false), 3000);
      return () => clearTimeout(t);
    }
    prevDriverRef.current = cur.driver;
  }, [cur]);

  const advance = useCallback(() => setCursor((c) => Math.min(items.length - 1, c + 1)), [items.length]);
  const back = useCallback(() => setCursor((c) => Math.max(0, c - 1)), []);
  const mark = useCallback(() => {
    setItems((prev) => prev.map((it, i) => (i === cursor ? { ...it, checked: true } : it)));
    advance();
  }, [cursor, advance]);

  useEffect(() => {
    if (!auto || !items.length) return;
    const t = setInterval(() => {
      setCursor((c) => {
        if (c >= items.length - 1) return c;
        return c + 1;
      });
    }, Math.max(300, autoSecs * 1000));
    return () => clearInterval(t);
  }, [auto, autoSecs, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance();
      else if (e.key === "ArrowLeft") back();
      else if (e.key === " ") { e.preventDefault(); mark(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, back, mark]);

  const byDriver = useMemo(() => {
    const m = new Map<string, QrItem[]>();
    for (const it of items) {
      if (!m.has(it.driver)) m.set(it.driver, []);
      m.get(it.driver)!.push(it);
    }
    return [...m.entries()];
  }, [items]);

  const saveToCloud = async () => {
    if (!curBase) return;
    const { error } = await supabase.from("qr_conference_sessions").insert({
      base_id: curBase.id,
      label: new Date().toLocaleString("pt-BR"),
      items,
      cursor,
    });
    if (error) toast("Não consegui salvar na nuvem: " + error.message);
    else toast("Sessão salva na nuvem — pode continuar em outro aparelho");
  };

  return (
    <section className="pane active">
      {!items.length ? (
        <div className="panel">
          <h2>Conferência QR</h2>
          <p className="muted">Gera o QR de cada pedido pendente, agrupado por motorista, para bipar com o leitor do JMS.</p>
          <div className="loads">
            <div className="drop">
              <h3>Planilha de pendentes <span className="tag">coluna F vazia = pendente</span></h3>
              <input type="file" accept=".csv,.xlsx" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const parsed = await parseSheet(f);
                  if (!parsed.length) { toast("Nenhum pedido pendente encontrado"); return; }
                  setItems(parsed); setCursor(0);
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
                setItems(parsed); setCursor(0);
              }}>Carregar lista</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="split">
          <div className="panel" style={{ textAlign: "center" }}>
            {switchAlert && (
              <div className="warnbox" style={{ fontSize: "1.1rem", fontWeight: 700 }}>⚠️ MUDOU DE MOTORISTA — {cur?.driver}</div>
            )}
            <p className="muted small" style={{ marginBottom: ".25rem" }}>{cur?.driver}</p>
            <h3 style={{ fontFamily: "var(--mono, monospace)" }}>{cur?.code}</h3>
            {qrUrl && <img src={qrUrl} alt={cur?.code} style={{ width: 260, height: 260 }} />}
            <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
              <button className="btn" onClick={back}>◀ Voltar</button>
              <button className="btn primary" onClick={mark}>✓ Marcar</button>
              <button className="btn" onClick={advance}>Avançar ▶</button>
            </div>
            <div className="row" style={{ justifyContent: "center", marginTop: ".75rem" }}>
              <label className="small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Modo automático</label>
              <input type="number" min={1} value={autoSecs} onChange={(e) => setAutoSecs(Number(e.target.value) || 1)} style={{ width: 60 }} disabled={!auto} />
              <span className="small muted">segundos</span>
            </div>
            <p className="small muted" style={{ marginTop: ".5rem" }}>{cursor + 1} / {total} — {marked} marcados</p>
            <div className="row" style={{ justifyContent: "center", marginTop: ".5rem" }}>
              <button className="btn small" onClick={() => copyText(items.map((i) => i.code).join("\n"), toast)}>Copiar todos</button>
              <button className="btn small" onClick={() => copyText(items.filter((i) => i.checked).map((i) => i.code).join("\n"), toast)}>Copiar marcados</button>
              <button className="btn small" onClick={saveToCloud}>☁ Salvar progresso na nuvem</button>
              <button className="btn small danger" onClick={() => { if (confirm("Encerrar esta conferência e limpar a lista?")) { setItems([]); if (lsKey) localStorage.removeItem(lsKey); } }}>Encerrar</button>
            </div>
          </div>
          <div className="panel">
            <h3>Motoristas</h3>
            {byDriver.map(([drv, its]) => {
              const done = its.filter((i) => i.checked).length;
              return (
                <div key={drv} className="row" style={{ padding: ".3rem 0", borderBottom: "1px solid var(--line)" }}>
                  <span>{drv}</span>
                  <span className="spacer"></span>
                  <span className="small muted">{done}/{its.length}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
