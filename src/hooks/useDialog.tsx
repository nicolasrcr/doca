import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";

interface DialogButton {
  label: string;
  cls?: string;
  onClick: () => void;
}

interface DialogState {
  title: string;
  body: ReactNode;
  buttons: DialogButton[];
}

interface DialogApi {
  open: (title: string, body: ReactNode, buttons?: DialogButton[]) => void;
  close: () => void;
}

const DialogCtx = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const openCount = useRef(0);
  const wasOpen = useRef(false);

  const close = useCallback(() => {
    ref.current?.close();
  }, []);

  const open = useCallback((title: string, body: ReactNode, buttons: DialogButton[] = []) => {
    if (!wasOpen.current) openCount.current += 1;
    wasOpen.current = true;
    setState({ title, body, buttons });
  }, []);

  useEffect(() => {
    if (state && ref.current && !ref.current.open) ref.current.showModal();
    if (!state) wasOpen.current = false;
  }, [state]);

  return (
    <DialogCtx.Provider value={{ open, close }}>
      {children}
      <dialog
        ref={ref}
        onClose={() => setState(null)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        {state && (
          <motion.div
            key={openCount.current}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="dlg-h">
              <h3>{state.title}</h3>
              <button className="x" aria-label="Fechar" onClick={close}>
                ×
              </button>
            </div>
            <div className="dlg-b">{state.body}</div>
            <div className="dlg-f">
              {state.buttons.map((b, i) => (
                <button key={i} className={"btn " + (b.cls || "")} onClick={b.onClick}>
                  {b.label}
                </button>
              ))}
              <button className="btn" onClick={close}>
                Fechar
              </button>
            </div>
          </motion.div>
        )}
      </dialog>
    </DialogCtx.Provider>
  );
}

export const useDialog = () => {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error("useDialog must be used inside DialogProvider");
  return ctx;
};
