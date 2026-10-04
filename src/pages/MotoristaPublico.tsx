import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { brDate, fmtN, fmtPct, fmtR } from "../lib/format";
import DocaLogo from "../components/DocaLogo";

interface Dado {
  base: string; motorista: string; meta: number;
  dias: { data: string; t: number; e: number; p: number }[];
  pagamento: { inicio: string; fim: string; entregas: number; liquido: number } | null;
}

// Página pública de leitura: o motorista abre o link que recebeu e vê só o próprio resultado.
export default function MotoristaPublico({ token }: { token: string }) {
  const [d, setD] = useState<Dado | null | undefined>(undefined);
  useEffect(() => {
    supabase.rpc("driver_view", { p_token: token }).then(({ data, error }) => setD(error ? null : (data as Dado | null)));
  }, [token]);

  const caixa = { maxWidth: 520, margin: "0 auto", padding: "1.2rem" } as const;
  if (d === undefined) return <main style={caixa}><p className="muted">Carregando…</p></main>;
  if (!d) return <main style={caixa}><DocaLogo size={24} /><h2>Link inválido ou desativado</h2><p className="muted">Peça um novo link ao gerente da sua base.</p></main>;

  const meta = d.meta / 100;
  const ult = d.dias[d.dias.length - 1];
  const sem = d.dias.slice(-7);
  const T = sem.reduce((a, x) => a + x.t, 0), E = sem.reduce((a, x) => a + x.e, 0);
  const pct7 = T ? E / T : null;
  return (
    <main style={caixa}>
      <DocaLogo size={24} />
      <h2 style={{ marginBottom: 0 }}>{d.motorista}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{d.base} · meta {d.meta}%</p>
      {!ult ? <div className="infobox">Ainda não há resultados dos últimos 30 dias.</div> : (
        <>
          <div className="panel" style={{ marginBottom: ".8rem" }}>
            <div className="small muted">Último dia · {brDate(ult.data)}</div>
            <div style={{ fontSize: "3.2rem", fontWeight: 700, letterSpacing: "-.03em" }}>{fmtPct(ult.t ? ult.e / ult.t : 0)}</div>
            <div>{fmtN(ult.e)} de {fmtN(ult.t)} entregues · {ult.t && ult.e / ult.t >= meta ? "✓ meta batida" : "abaixo da meta"}</div>
            {ult.p > 0 && <div className="small muted">{ult.p} com problema</div>}
          </div>
          {pct7 !== null && <div className="panel" style={{ marginBottom: ".8rem" }}><b>Últimos 7 dias:</b> {fmtPct(pct7)} ({fmtN(E)} de {fmtN(T)})</div>}
          <div className="panel" style={{ marginBottom: ".8rem" }}>
            <h3 style={{ marginTop: 0 }}>Dia a dia</h3>
            {d.dias.slice(-14).reverse().map((x) => {
              const p = x.t ? x.e / x.t : 0;
              return (
                <div key={x.data} className="row" style={{ padding: ".3rem 0", borderTop: "1px solid var(--line)" }}>
                  <span style={{ width: 80 }}>{brDate(x.data).slice(0, 5)}</span>
                  <span style={{ flex: 1, height: 8, background: "var(--line)", borderRadius: 4, position: "relative" }}>
                    <span style={{ position: "absolute", inset: 0, width: `${Math.min(100, p * 100)}%`, background: p >= meta ? "var(--ok)" : "var(--warn)", borderRadius: 4 }} />
                  </span>
                  <b style={{ width: 64, textAlign: "right" }}>{fmtPct(p)}</b>
                  <span className="small muted" style={{ width: 56, textAlign: "right" }}>{x.e}/{x.t}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {d.pagamento && (
        <div className="panel" style={{ marginBottom: ".8rem" }}>
          <h3 style={{ marginTop: 0 }}>Último fechamento</h3>
          <p style={{ margin: 0 }}>{brDate(d.pagamento.inicio)} a {brDate(d.pagamento.fim)}: {fmtN(d.pagamento.entregas)} entregas · <b>{fmtR(d.pagamento.liquido)}</b></p>
        </div>
      )}
      <p className="small muted">Este link mostra só o seu resultado. Não compartilhe com outras pessoas.</p>
    </main>
  );
}
