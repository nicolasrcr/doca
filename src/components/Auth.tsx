import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import DocaLogo from "./DocaLogo";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (error) toast(error.message);
    else if (mode === "up") toast("Conta criada. Verifique seu e-mail se a confirmação estiver ativada.");
  };

  return (
    <div className="authWrap">
      <div className="authCard">
        <DocaLogo size={32} className="brand" />
        <p className="muted small" style={{ textAlign: "center", marginBottom: "1.2rem" }}>
          {mode === "in" ? "Entrar na sua conta" : "Criar uma conta"}
        </p>
        <form className="form" onSubmit={submit}>
          <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: "center" }}>
            {mode === "in" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <p className="small muted" style={{ textAlign: "center", marginTop: "1rem" }}>
          {mode === "in" ? "Ainda não tem conta? " : "Já tem conta? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>
            {mode === "in" ? "Criar conta" : "Entrar"}
          </a>
        </p>
      </div>
    </div>
  );
}
