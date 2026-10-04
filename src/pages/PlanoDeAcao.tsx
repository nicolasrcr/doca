import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { supabase } from "../lib/supabase";
import { brDate, fmtPct, todayISO } from "../lib/format";
import { pctDepois, pctUltimos7 } from "../lib/acoes";
import { criarAcao } from "../lib/acoesDb";
import type { ActionItem } from "../lib/types";

export default function PlanoDeAcao() {
  const { curBase, history, canEdit, audit } = useDoca();
  const { user } = useAuth();
  const toast = useToast();
  const [itens, setItens] = useState<ActionItem[]>([]);
  const [titulo, setTitulo] = useState("");
  const [resp, setResp] = useState("");
  const [prazo, setPrazo] = useState("");
  const [detalhe, setDetalhe] = useState("");

  const carregar = useCallback(async () => {
    if (!curBase) return;
    const { data } = await supabase.from("action_items").select("*").eq("base_id", curBase.id).order("created_at", { ascending: false });
    setItens((data as ActionItem[]) || []);
  }, [curBase]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!curBase) return <section className="pane active"><div className="panel">Escolha uma base.</div></section>;

  const nova = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const ult = history.length ? history[history.length - 1].data : todayISO();
    const erro = await criarAcao(curBase.id, user.id, { titulo, detalhe, responsavel: resp, prazo, baseline: pctUltimos7(history, ult), origem: "manual" });
    if (erro) { toast("Não consegui salvar: " + erro); return; }
    void audit("acao_criada", { titulo });
    setTitulo(""); setResp(""); setPrazo(""); setDetalhe("");
    await carregar();
  };

  const alternar = async (a: ActionItem) => {
    const feita = a.status === "aberta";
    const { error } = await supabase.from("action_items").update({ status: feita ? "feita" : "aberta", done_at: feita ? new Date().toISOString() : null }).eq("id", a.id);
    if (error) { toast(error.message); return; }
    void audit(feita ? "acao_concluida" : "acao_reaberta", { titulo: a.titulo });
    await carregar();
  };

  const excluir = async (a: ActionItem) => {
    if (!confirm(`Excluir "${a.titulo}"?`)) return;
    const { error } = await supabase.from("action_items").delete().eq("id", a.id);
    if (error) { toast(error.message); return; }
    await carregar();
  };

  const hoje = todayISO();
  const abertas = itens.filter((i) => i.status === "aberta");
  const feitas = itens.filter((i) => i.status === "feita");

  const efeito = (a: ActionItem) => {
    if (!a.done_at) return null;
    const dep = pctDepois(history, a.done_at);
    if (!dep) return <span className="small muted">Ainda sem dados suficientes depois da conclusão (precisa de 3 dias salvos).</span>;
    if (a.baseline === null) return <span className="small muted">Depois: {fmtPct(dep.pct)} (sem número de antes).</span>;
    const d = dep.pct - a.baseline;
    return <span className="small">Antes {fmtPct(a.baseline)} → depois {fmtPct(dep.pct)} ({d >= 0 ? "+" : ""}{(d * 100).toFixed(1).replace(".", ",")} p.p. em {dep.dias} dias). Pode ter outras causas além desta ação.</span>;
  };

  return (
    <section className="pane active">
      <div className="panel">
        <h2>Plano de ação</h2>
        <p className="muted">O que a base decidiu fazer para melhorar, quem cuida e se funcionou. Crie um item aqui ou a partir de uma sugestão em “Saúde e sugestões da base”.</p>
        {canEdit && (
          <form onSubmit={nova} style={{ display: "grid", gap: ".5rem", maxWidth: 560 }}>
            <input placeholder="O que vai ser feito? (ex.: conversar com o motorista X sobre ausências)" value={titulo} onChange={(e) => setTitulo(e.target.value)} minLength={3} maxLength={200} required />
            <div className="row">
              <input placeholder="Responsável" value={resp} onChange={(e) => setResp(e.target.value)} maxLength={120} />
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label="Prazo" />
            </div>
            <textarea placeholder="Detalhes (opcional)" value={detalhe} onChange={(e) => setDetalhe(e.target.value)} maxLength={1000} />
            <button className="btn primary" type="submit">Adicionar ao plano</button>
          </form>
        )}
      </div>

      <div className="panel">
        <h3>Em aberto ({abertas.length})</h3>
        {abertas.length === 0 ? <p className="muted">Nada em aberto.</p> : abertas.map((a) => (
          <div key={a.id} className="row" style={{ padding: ".6rem 0", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <b>{a.titulo}</b>
              {a.detalhe && <div className="small muted">{a.detalhe}</div>}
              <div className="small muted">
                {a.responsavel ? `Responsável: ${a.responsavel}` : "Sem responsável"}
                {a.prazo ? ` · prazo ${brDate(a.prazo)}${a.prazo < hoje ? " (atrasado)" : ""}` : ""}
                {a.baseline !== null ? ` · entrega nos 7 dias antes: ${fmtPct(a.baseline)}` : ""}
              </div>
            </div>
            {canEdit && (<>
              <button className="btn small primary" onClick={() => void alternar(a)}>Concluir</button>
              <button className="btn small" onClick={() => void excluir(a)}>Excluir</button>
            </>)}
          </div>
        ))}
      </div>

      <div className="panel">
        <h3>Concluídas ({feitas.length})</h3>
        {feitas.length === 0 ? <p className="muted">Quando você concluir uma ação, o resultado dos 7 dias seguintes aparece aqui.</p> : feitas.map((a) => (
          <div key={a.id} className="row" style={{ padding: ".6rem 0", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <b>✓ {a.titulo}</b>
              <div className="small muted">{a.responsavel || "Sem responsável"} · concluída em {a.done_at ? new Date(a.done_at).toLocaleDateString("pt-BR") : "—"}</div>
              <div>{efeito(a)}</div>
            </div>
            {canEdit && <button className="btn small" onClick={() => void alternar(a)}>Reabrir</button>}
          </div>
        ))}
      </div>
    </section>
  );
}
