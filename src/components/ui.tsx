import { useEffect, useRef, useState, type ReactNode } from "react";

// "?" que abre uma explicação curta. Tira parágrafos de texto da tela sem esconder a informação.
export function Dica({ children, rotulo = "O que é isto?" }: { children: ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  return (
    <span className="dica" ref={ref}>
      <button type="button" className="dicaBtn" aria-label={rotulo} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>?</button>
      {aberto && <span className="dicaBox" role="note">{children}</span>}
    </span>
  );
}

// Botão que abre uma lista de ações. Deixa uma ação principal visível e guarda o resto aqui.
export function Menu({ rotulo, children, alinhar = "right" }: { rotulo: ReactNode; children: ReactNode; alinhar?: "left" | "right" }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  return (
    <div className="menuAcoes" ref={ref}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>{rotulo} ▾</button>
      {aberto && (
        <div className={"menuLista " + alinhar} role="menu" onClick={() => setAberto(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

// Item de menu.
export function MenuItem({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return <button type="button" role="menuitem" className="menuItem" disabled={disabled} onClick={onClick}>{children}</button>;
}
