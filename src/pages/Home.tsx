import { useEffect, useState } from "react";
import { useDoca } from "../hooks/DocaContext";
import { useSLAAlerts } from "../hooks/useSLAAlert";
import SLAAlertBanner from "../components/SLAAlertBanner";
import SLAAlertModal from "../components/SLAAlertModal";
import type { ActiveScreen } from "../hooks/useNav";
import { ImportStrip } from "../components/ImportDialog";
import Painel from "./Painel";
import { PlanoBanner } from "./Planos";

// Passos para quem acabou de entrar. Some sozinho quando tudo está feito, ou se a pessoa dispensar.
function PrimeirosPassos({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, history, members, drivers } = useDoca();
  const chave = curBase ? `doca.passos.${curBase.id}` : "";
  const [oculto, setOculto] = useState(() => { try { return !!chave && localStorage.getItem(chave) === "1"; } catch { return false; } });
  if (!curBase || oculto) return null;
  const passos: { ok: boolean; txt: string; ir?: ActiveScreen }[] = [
    { ok: true, txt: "Criar a base" },
    { ok: history.length > 0, txt: "Importar a primeira planilha do JMS" },
    { ok: curBase.meta !== 95 || !!curBase.city, txt: "Conferir a meta e a cidade da base", ir: "ajustes" },
    { ok: drivers.length > 0, txt: "Cadastrar os motoristas", ir: "motoristas" },
    { ok: members.length > 1, txt: "Convidar a equipe", ir: "membros" },
  ];
  if (passos.every((p) => p.ok)) return null;
  const feitos = passos.filter((p) => p.ok).length;
  return (
    <details className="infobox passos" style={{ marginBottom: "1rem" }}>
      <summary>
        <b>Primeiros passos</b> <span className="muted small">{feitos} de {passos.length}</span>
        <span className="passosBarra" aria-hidden="true"><i style={{ width: `${(feitos / passos.length) * 100}%` }} /></span>
      </summary>
      <ul style={{ listStyle: "none", padding: 0, margin: ".6rem 0 0" }}>
        {passos.map((p) => (
          <li key={p.txt} style={{ padding: ".15rem 0" }}>
            {p.ok ? "✓ " : "○ "}{p.txt}
            {!p.ok && p.ir && <> · <button className="btn small" onClick={() => openScreen(p.ir!)}>Abrir</button></>}
          </li>
        ))}
      </ul>
      <button className="btn small" style={{ marginTop: ".5rem" }} onClick={() => { try { localStorage.setItem(chave, "1"); } catch { /* ignore */ } setOculto(true); }}>Dispensar</button>
    </details>
  );
}

export default function Home({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, result, history } = useDoca();
  const [showSLAModal, setShowSLAModal] = useState(false);
  const [hasShownAlertOnce, setHasShownAlertOnce] = useState(false);

  // Alertas de prazo (SLA) do dia carregado
  const slaAlerts = useSLAAlerts(result?.list || null, 24);
  useEffect(() => {
    const hasCritical = slaAlerts.some((a) => a.urgency === "critical");
    if (hasCritical && !hasShownAlertOnce && !showSLAModal) {
      setShowSLAModal(true);
      setHasShownAlertOnce(true);
    }
  }, [slaAlerts, hasShownAlertOnce, showSLAModal]);

  if (!curBase) return null;

  return (
    <section className="pane active">
      <SLAAlertBanner alerts={slaAlerts} onOpen={() => setShowSLAModal(true)} />
      <SLAAlertModal alerts={slaAlerts} isOpen={showSLAModal} onClose={() => setShowSLAModal(false)} onViewDetail={() => setShowSLAModal(false)} />
      <PlanoBanner />
      {history.length === 0 && (
        <ImportStrip titulo="Arraste as planilhas do JMS" texto="Solte os arquivos aqui ou em qualquer lugar da tela. Os gráficos aparecem em seguida." />
      )}
      <PrimeirosPassos openScreen={openScreen} />
      {history.length > 0 && <Painel openScreen={openScreen} />}
    </section>
  );
}
