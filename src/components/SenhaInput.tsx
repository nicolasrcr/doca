import { useState, type InputHTMLAttributes } from "react";

// Campo de senha com um olho para mostrar/ocultar o que foi digitado.
export default function SenhaInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [ver, setVer] = useState(false);
  return (
    <span className="senhaWrap">
      <input {...props} type={ver ? "text" : "password"} />
      <button type="button" className="senhaEye" onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"} aria-pressed={ver} title={ver ? "Ocultar senha" : "Mostrar senha"}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ver
            ? (<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>)
            : (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>)}
        </svg>
      </button>
    </span>
  );
}
