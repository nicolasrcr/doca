import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { supabase } from "../lib/supabase";
import { brDate } from "../lib/format";
import type { Subscription } from "../lib/types";

const STATUS: Record<Subscription["status"], string> = { teste: "Em teste", ativo: "Ativo", suspenso: "Suspenso" };

export function diasDeTeste(s: Subscription | null): number | null {
  if (!s || s.status !== "teste" || !s.trial_ate) return null;
  return Math.ceil((new Date(s.trial_ate + "T23:59:59").getTime() - Date.now()) / 86400000);
}

// Aviso discreto na Home: teste acabando, conta suspensa ou link de pagamento.
export function PlanoBanner() {
  const { user } = useAuth();
  const [s, setS] = useState<Subscription | null>(null);
  useEffect(() => {
    if (!user) return;
    supabase.from("subscriptions").select("*").eq("owner_id", user.id).maybeSingle().then(({ data }) => setS((data as Subscription) || null), () => {});
  }, [user]);
  if (!s) return null;
  const dias = diasDeTeste(s);
  if (s.status === "ativo" && !s.link_pagamento) return null;
  const texto = s.status === "suspenso" ? "Seu acesso está suspenso. Regularize para criar novas bases."
    : dias !== null ? (dias >= 0 ? `Seu período de teste termina em ${dias} dia${dias === 1 ? "" : "s"}.` : "Seu período de teste terminou.")
    : "";
  if (!texto) return null;
  return (
    <div className={s.status === "suspenso" || (dias !== null && dias < 0) ? "warnbox" : "infobox"} style={{ marginBottom: ".8rem" }}>
      {texto} {s.link_pagamento && <a href={s.link_pagamento} target="_blank" rel="noreferrer noopener"><b>Pagar agora</b></a>}
    </div>
  );
}

export default function Planos() {
  const { isSuperAdmin } = useDoca();
  const { user } = useAuth();
  const toast = useToast();
  const [lista, setLista] = useState<(Subscription & { email: string; bases: number })[]>([]);
  const [minha, setMinha] = useState<Subscription | null>(null);
  const [f, setF] = useState({ email: "", plano: "teste", status: "teste", trial: "", limite: "", link: "", obs: "" });

  const carregar = useCallback(async () => {
    if (!user) return;
    if (!isSuperAdmin) {
      const { data } = await supabase.from("subscriptions").select("*").eq("owner_id", user.id).maybeSingle();
      setMinha((data as Subscription) || null);
      return;
    }
    const [{ data: subs }, { data: bases }] = await Promise.all([
      supabase.from("subscriptions").select("*"),
      supabase.from("bases").select("owner_id"),
    ]);
    const ids = ((subs as Subscription[]) || []).map((x) => x.owner_id);
    const { data: perfis } = ids.length ? await supabase.from("profiles").select("id,email").in("id", ids) : { data: [] };
    const em = new Map(((perfis as { id: string; email: string }[]) || []).map((p) => [p.id, p.email]));
    const cont = new Map<string, number>();
    for (const b of (bases as { owner_id: string }[]) || []) cont.set(b.owner_id, (cont.get(b.owner_id) || 0) + 1);
    setLista(((subs as Subscription[]) || []).map((x) => ({ ...x, email: em.get(x.owner_id) || x.owner_id, bases: cont.get(x.owner_id) || 0 })));
  }, [user, isSuperAdmin]);
  useEffect(() => { void carregar(); }, [carregar]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const { data: perfil } = await supabase.from("profiles").select("id").eq("email", f.email.trim().toLowerCase()).maybeSingle();
    if (!perfil) { toast("Não achei uma conta com esse e-mail. A pessoa precisa já ter entrado no Doca."); return; }
    const { error } = await supabase.from("subscriptions").upsert({
      owner_id: (perfil as { id: string }).id, plano: f.plano.trim() || "teste", status: f.status,
      trial_ate: f.trial || null, limite_bases: f.limite === "" ? null : Number(f.limite),
      link_pagamento: f.link.trim() || null, obs: f.obs.trim() || null, updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id" });
    if (error) { toast(error.message); return; }
    toast("Plano salvo");
    await carregar();
  };

  if (!isSuperAdmin) {
    return (
      <section className="pane active">
        <div className="panel">
          <h2>Meu plano</h2>
          {!minha ? <p className="muted">Você está no acesso de testes, sem limite de bases e sem cobrança por enquanto.</p> : (
            <>
              <p><b>{minha.plano}</b> · {STATUS[minha.status]}{minha.trial_ate ? ` · teste até ${brDate(minha.trial_ate)}` : ""}</p>
              <p className="muted small">{minha.limite_bases === null ? "Bases ilimitadas." : `Até ${minha.limite_bases} base(s).`}</p>
              {minha.link_pagamento && <a className="btn primary" href={minha.link_pagamento} target="_blank" rel="noreferrer noopener">Pagar</a>}
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Planos e cobrança</h2>
        <p className="muted">Defina plano, período de teste, limite de bases e o link de pagamento (Pix, cartão ou boleto gerado no seu banco ou gateway) de cada cliente. O Doca não processa o pagamento: ele mostra o link e bloqueia novas bases se o acesso for suspenso ou passar do limite. Cliente sem plano cadastrado continua sem limite.</p>
        <form onSubmit={salvar} style={{ display: "grid", gap: ".5rem", maxWidth: 560 }}>
          <input type="email" placeholder="E-mail do cliente (dono das bases)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          <div className="row">
            <input placeholder="Plano (ex.: Básico)" value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })} maxLength={40} />
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Situação">
              <option value="teste">Em teste</option><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option>
            </select>
          </div>
          <div className="row">
            <label className="small">Teste até <input type="date" value={f.trial} onChange={(e) => setF({ ...f, trial: e.target.value })} /></label>
            <label className="small">Limite de bases <input type="number" min={0} value={f.limite} placeholder="sem limite" onChange={(e) => setF({ ...f, limite: e.target.value })} style={{ width: 110 }} /></label>
          </div>
          <input type="url" placeholder="Link de pagamento (https://…)" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} pattern="https://.*" />
          <input placeholder="Observação (opcional)" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} maxLength={500} />
          <button className="btn primary" type="submit">Salvar plano</button>
        </form>
      </div>
      <div className="panel">
        <h3>Clientes com plano ({lista.length})</h3>
        {lista.length === 0 ? <p className="muted">Nenhum plano cadastrado.</p> : (
          <div className="tablewrap"><table className="drv">
            <thead><tr><th>Cliente</th><th>Plano</th><th>Situação</th><th>Teste até</th><th>Bases</th><th>Pagamento</th></tr></thead>
            <tbody>{lista.map((x) => (
              <tr key={x.owner_id}>
                <td>{x.email}</td><td>{x.plano}</td><td>{STATUS[x.status]}</td>
                <td>{x.trial_ate ? brDate(x.trial_ate) : "—"}</td>
                <td>{x.bases}{x.limite_bases !== null ? ` / ${x.limite_bases}` : ""}</td>
                <td>{x.link_pagamento ? <a href={x.link_pagamento} target="_blank" rel="noreferrer noopener">link</a> : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </section>
  );
}
