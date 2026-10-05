import { useEffect, useRef, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useToast, copyText } from "../hooks/useToast";
import { mae } from "../lib/compute";
import { Dica } from "../components/ui";

interface ConfItem { code: string; driver: string; scanned: boolean }
interface Divergence { code: string; type: string }

export default function Conferencia() {
  const { result } = useDoca();
  const toast = useToast();
  const [drvSel, setDrvSel] = useState("");
  const [inclProb, setInclProb] = useState(true);
  const [running, setRunning] = useState(false);
  const [map, setMap] = useState<Map<string, ConfItem>>(new Map());
  const [scanned, setScanned] = useState(0);
  const [divergences, setDivergences] = useState<Divergence[]>([]);
  const [lastCode, setLastCode] = useState("Aguardando leitura…");
  const [manual, setManual] = useState("");
  const [camStatus, setCamStatus] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [camAvailable, setCamAvailable] = useState(true);
  const qrRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const lastScanRef = useRef({ c: "", t: 0 });

  const names = result ? [...new Set(result.list.map((d) => d.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")) : [];

  const mark = (raw: string) => {
    const c = mae(raw);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    setMap((prev) => {
      const it = prev.get(c);
      if (!it) {
        setDivergences((d) => [{ code: c, type: "Não esperado" }, ...d].slice(0, 30));
        toast(`Não esperado: ${c}`);
        return prev;
      }
      if (it.scanned) {
        toast(`Já conferido: ${c}`);
        return prev;
      }
      const next = new Map(prev);
      next.set(c, { ...it, scanned: true });
      setScanned((s) => s + 1);
      toast(`OK — ${it.driver}`);
      return next;
    });
    setLastCode(c);
  };

  const startCamera = async () => {
    setCamStatus("Iniciando câmera…");
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      const inst = new Html5Qrcode("camReader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.ITF,
        ],
        verbose: false,
      });
      qrRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 260, height: 150 } },
        (text) => {
          const now = Date.now();
          if (text === lastScanRef.current.c && now - lastScanRef.current.t < 1200) return;
          lastScanRef.current = { c: text, t: now };
          mark(text);
        },
        () => {}
      );
      setCamOn(true);
      setCamStatus("Câmera ativa");
    } catch {
      setCamStatus("Câmera indisponível neste navegador. Use a leitura manual abaixo.");
      setCamAvailable(false);
    }
  };

  const stopCamera = async () => {
    if (qrRef.current && camOn) {
      try {
        await qrRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setCamOn(false);
  };

  useEffect(() => () => { stopCamera(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (!result) { toast("Carregue as planilhas na aba Entregas do dia primeiro"); return; }
    const m = new Map<string, ConfItem>();
    for (const d of result.list) {
      if (drvSel && d.nome !== drvSel) continue;
      for (const x of d.itens) if (x.st === "n" || (inclProb && x.st === "p")) m.set(x.c, { code: x.c, driver: d.nome, scanned: false });
    }
    if (!m.size) { toast("Não há pendentes para esse filtro"); return; }
    setMap(m);
    setScanned(0);
    setDivergences([]);
    setRunning(true);
    startCamera();
  };

  const end = async () => {
    await stopCamera();
    const total = map.size;
    const faltando = total - scanned;
    toast(`Conferência encerrada: ${scanned}/${total} conferidos${faltando ? `, ${faltando} faltando` : ""}`);
    setRunning(false);
  };

  if (!running) {
    return (
      <section className="pane active">
        <div className="panel">
          <div className="pageHead">
            <h2>Conferência de carga</h2>
            <Dica>Aponte a câmera do celular para o código de barras ou QR já impresso na etiqueta do pacote. O sistema confere contra a lista importada — não gera nada em tela para o coletor ler, então não interfere na bipagem oficial do JMS.</Dica>
          </div>
          <div className="row" style={{ margin: ".75rem 0" }}>
            <label className="inline">
              Motorista{" "}
              <select value={drvSel} onChange={(e) => setDrvSel(e.target.value)}>
                <option value="">Todos os motoristas</option>
                {names.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="inline small"><input type="checkbox" checked={inclProb} onChange={(e) => setInclProb(e.target.checked)} /> incluir pacotes com problema</label>
            <button className="btn primary" onClick={start}>Iniciar conferência</button>
          </div>
          {!result && <div className="warnbox">Carregue as planilhas na aba Entregas do dia antes de iniciar a conferência.</div>}
        </div>
      </section>
    );
  }

  const total = map.size;

  return (
    <section className="pane active">
      <div className="conf">
        <div className="panel">
          {camAvailable && (
            <div id="camWrap">
              <div id="camReader"></div>
              <div className={"scanFlash " + (flash ? "on" : "")}></div>
            </div>
          )}
          <div className="row" style={{ marginTop: ".6rem" }}>
            <button
              className="btn"
              onClick={async () => {
                if (!qrRef.current) return;
                if (camOn) { await qrRef.current.pause(true); setCamOn(false); setCamStatus("Pausada"); }
                else { await qrRef.current.resume(); setCamOn(true); setCamStatus("Câmera ativa"); }
              }}
            >
              {camOn ? "Pausar câmera" : "Retomar câmera"}
            </button>
            <span className="muted small">{camStatus}</span>
          </div>
          <div className="lastCode">{lastCode}</div>
          <div className="manualScan">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ou digite o código e Enter"
              inputMode="numeric"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (manual.trim()) { mark(manual.trim()); setManual(""); } } }}
            />
            <button className="btn" onClick={() => { if (manual.trim()) { mark(manual.trim()); setManual(""); } }}>Marcar</button>
          </div>
        </div>
        <div className="panel">
          <h3>Progresso</h3>
          <div>{scanned} de {total} conferidos</div>
          <div className="progress"><div style={{ width: `${total ? (scanned / total) * 100 : 0}%` }}></div></div>
          <h3 style={{ marginTop: "1rem" }}>Divergências</h3>
          <ul className="divlist">
            {divergences.length ? divergences.slice(0, 30).map((d, i) => <li className="bad2" key={i}><span>{d.code}</span><span>{d.type}</span></li>) : <li className="muted">Nenhuma ainda.</li>}
          </ul>
          <div className="row" style={{ marginTop: "1rem" }}>
            <button className="btn" onClick={() => { const codes = [...map.values()].filter((x) => x.scanned).map((x) => x.code); if (!codes.length) { toast("Nada conferido ainda"); return; } copyText(codes.join("\n"), toast); }}>Copiar conferidos</button>
            <button className="btn danger" onClick={end}>Encerrar</button>
          </div>
        </div>
      </div>
    </section>
  );
}
