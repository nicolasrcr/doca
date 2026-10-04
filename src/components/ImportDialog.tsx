import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import ImportWizard from "./ImportWizard";

interface ImportApi { open: (files?: File[]) => void }
const Ctx = createContext<ImportApi>({ open: () => {} });
export const useImport = () => useContext(Ctx);

const temArquivos = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");

// Importação sempre à mão: botão no topo, área na página inicial e "solte o arquivo em qualquer lugar".
export function ImportProvider({ children, onFinished }: { children: ReactNode; onFinished: (firstBaseId: string | null, totalBases: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const [arquivos, setArquivos] = useState<File[] | undefined>();
  const [chave, setChave] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const contador = useRef(0);
  const abertoRef = useRef(false);
  abertoRef.current = aberto;

  const open = useCallback((files?: File[]) => {
    setArquivos(files && files.length ? files : undefined);
    setChave((k) => k + 1);
    setAberto(true);
  }, []);

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!temArquivos(e) || abertoRef.current) return;
      contador.current++;
      setArrastando(true);
    };
    const over = (e: DragEvent) => { if (temArquivos(e)) e.preventDefault(); };
    const leave = (e: DragEvent) => {
      if (!temArquivos(e)) return;
      contador.current = Math.max(0, contador.current - 1);
      if (contador.current === 0) setArrastando(false);
    };
    const drop = (e: DragEvent) => {
      if (!temArquivos(e)) return;
      e.preventDefault(); // sem isso o navegador abriria o arquivo
      contador.current = 0;
      setArrastando(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (!abertoRef.current && files.length) open(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [open]);

  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {arrastando && !aberto && (
        <div className="importDrop" aria-hidden="true">
          <div><b>Solte as planilhas do JMS aqui</b><span>Vou conferir os arquivos antes de importar</span></div>
        </div>
      )}
      {aberto && (
        <div className="importModal" role="dialog" aria-modal="true" aria-label="Importar planilhas do JMS" onMouseDown={(e) => { if (e.target === e.currentTarget) setAberto(false); }}>
          <div className="importBox">
            <div className="row" style={{ marginBottom: ".6rem" }}>
              <h2 style={{ margin: 0 }}>Importar planilhas do JMS</h2>
              <span className="spacer"></span>
              <button className="btn small" onClick={() => setAberto(false)} aria-label="Fechar">✕ Fechar</button>
            </div>
            <ImportWizard key={chave} initialFiles={arquivos} onDone={(id, n) => { setAberto(false); onFinished(id, n); }} />
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Área grande de "arraste aqui" para a página inicial. */
export function ImportStrip({ titulo, texto }: { titulo: string; texto?: string }) {
  const { open } = useImport();
  return (
    <div className="importStrip">
      <div>
        <b>{titulo}</b>
        {texto && <span>{texto}</span>}
      </div>
      <label className="btn primary" style={{ position: "relative", cursor: "pointer" }}>
        ⬆ Escolher arquivos
        <input type="file" multiple accept=".xlsx,.xls,.csv" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
          onChange={(e) => { if (e.target.files?.length) open(Array.from(e.target.files)); e.target.value = ""; }} />
      </label>
    </div>
  );
}
