import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import DocaLogo from "./DocaLogo";

// Formulário de senha nova (usado ao entrar por convite/recuperação e em "Trocar senha").
export function SenhaForm({ onDone, rotulo = "Salvar senha" }: { onDone: () => void; rotulo?: string }) {
  const { definirSenha } = useAuth();
  const toast = useToast();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (a.length < 8) { setErro("Use pelo menos 8 caracteres."); return; }
    if (a !== b) { setErro("As duas senhas precisam ser iguais."); return; }
    setBusy(true);
    const { error } = await definirSenha(a);
    setBusy(false);
    if (error) { setErro(/same|different/i.test(error.message) ? "Escolha uma senha diferente da atual." : error.message); return; }
    toast("Senha atualizada");
    onDone();
  };

  return (
    <form onSubmit={enviar} style={{ display: "grid", gap: ".6rem" }}>
      <label>Nova senha
        <input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} minLength={8} required />
      </label>
      <label>Repita a nova senha
        <input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} minLength={8} required />
      </label>
      {erro && <div className="warnbox" role="alert">{erro}</div>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? "Salvando…" : rotulo}</button>
    </form>
  );
}

// Tela cheia para quem chegou por convite ou link de recuperação e ainda precisa definir a senha.
export function DefinirSenhaPage({ onDone }: { onDone: () => void }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1rem" }}>
      <div className="authCard" style={{ maxWidth: 400, width: "100%" }}>
        <DocaLogo size={26} />
        <h2 style={{ marginTop: "1rem" }}>Defina a sua senha</h2>
        <p className="muted">Escolha uma senha para entrar no Doca.</p>
        <SenhaForm onDone={onDone} rotulo="Salvar e entrar" />
      </div>
    </main>
  );
}
