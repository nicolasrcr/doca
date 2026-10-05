import { useEffect, useRef, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useAuth } from "../hooks/useAuth";
import type { ActiveScreen } from "../hooks/useNav";
import { useImport } from "./ImportDialog";

export default function Header({
  onHamb,
  onNewBase,
}: {
  onHamb: () => void;
  onNewBase: (name: string) => void;
}) {
  const { bases, curBase, selectBase } = useDoca();
  const { signOut } = useAuth();
  const imp = useImport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  return (
    <header className="top">
      <div className="topin">
        <button className="hamb" type="button" aria-label="Abrir menu" onClick={onHamb}>
          ☰
        </button>
        <div className="baseSwitch" ref={ref}>
          <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span>{curBase ? curBase.name : bases.length ? "Escolha a base" : "Nenhuma base"}</span> ▾
          </button>
          {open && (
            <div className="baseMenu open">
              {bases.map((b) => (
                <button
                  key={b.id}
                  className={b.id === curBase?.id ? "cur" : ""}
                  onClick={() => {
                    selectBase(b.id);
                    setOpen(false);
                  }}
                >
                  {b.name}
                  {b.city ? <span className="muted"> · {b.city}</span> : null}
                </button>
              ))}
              <button
                style={{ fontWeight: 600 }}
                onClick={() => {
                  const name = prompt("Nome da nova base (ex.: F SBS-DF):");
                  if (name && name.trim()) onNewBase(name);
                  setOpen(false);
                }}
              >
                + Nova base
              </button>
            </div>
          )}
        </div>
        <span className="spacer"></span>
        <button className="btn small primary" type="button" onClick={() => imp.open()} title="Arraste ou escolha as planilhas do JMS">
          ⬆ Importar planilhas
        </button>
        <button className="btn small" type="button" onClick={() => signOut()}>
          Sair
        </button>
      </div>
    </header>
  );
}

export type { ActiveScreen };
