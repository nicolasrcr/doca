import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useDoca } from "../hooks/DocaContext";
import { CATS, childrenOf } from "../lib/types";
import { brDate, fmtN, fmtPct, todayISO } from "../lib/format";
import { useSLAAlerts } from "../hooks/useSLAAlert";
import SLAAlertBanner from "../components/SLAAlertBanner";
import SLAAlertModal from "../components/SLAAlertModal";
import type { ActiveScreen } from "../hooks/useNav";
import { ImportStrip } from "../components/ImportDialog";
import { CatIcon } from "../components/Icons";
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
    { ok: curBase.meta !== 95 || !!curBase.city, txt: "Conferir a meta de entrega e a cidade da base", ir: "ajustes" },
    { ok: drivers.length > 0, txt: "Cadastrar os motoristas (para unir apelidos e definir valores)", ir: "motoristas" },
    { ok: members.length > 1, txt: "Convidar a equipe", ir: "membros" },
  ];
  if (passos.every((p) => p.ok)) return null;
  const feitos = passos.filter((p) => p.ok).length;
  return (
    <div className="infobox" style={{ margin: "0 16px 1rem" }}>
      <div className="row">
        <b>Primeiros passos ({feitos} de {passos.length})</b>
        <span className="spacer"></span>
        <button className="btn small" onClick={() => { try { localStorage.setItem(chave, "1"); } catch { /* ignore */ } setOculto(true); }}>Dispensar</button>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: ".4rem 0 0" }}>
        {passos.map((p) => (
          <li key={p.txt} style={{ padding: ".15rem 0" }}>
            {p.ok ? "✓ " : "○ "}{p.txt}
            {!p.ok && p.ir && <> · <button className="btn small" onClick={() => openScreen(p.ir!)}>Abrir</button></>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home({ openScreen }: { openScreen: (id: ActiveScreen) => void }) {
  const { curBase, result, history, occRows, payouts, drivers, bases, dayDate } = useDoca();
  const [animKey, setAnimKey] = useState(0);
  const [showSLAModal, setShowSLAModal] = useState(false);
  const [hasShownAlertOnce, setHasShownAlertOnce] = useState(false);

  // Detectar alertas de SLA
  const slaAlerts = useSLAAlerts(result?.list || null, 24);

  // Mostrar modal apenas na primeira vez que há alertas críticos
  useEffect(() => {
    const hasCritical = slaAlerts.some((a) => a.urgency === 'critical');
    if (hasCritical && !hasShownAlertOnce && !showSLAModal) {
      setShowSLAModal(true);
      setHasShownAlertOnce(true);
    }
  }, [slaAlerts, hasShownAlertOnce, showSLAModal]);

  useEffect(() => setAnimKey((k) => k + 1), [result, history.length]);

  if (!curBase) return null;

  let pct: number | null = null;
  let label = "";
  let meta = "";
  if (result && result.tot.t) {
    pct = result.tot.t ? result.tot.e / result.tot.t : 0;
    label = "no prazo hoje";
    meta = `${curBase.name} · ${brDate(dayDate || todayISO())} · ${fmtN(result.tot.e)} de ${fmtN(result.tot.t)} entregues`;
  } else if (history.length) {
    const h = history[history.length - 1];
    pct = h.total ? h.entregues / h.total : 0;
    label = "no prazo · " + brDate(h.data);
    meta = `${curBase.name} · último dia salvo · ${fmtN(h.entregues)} de ${fmtN(h.total)} entregues`;
  }

  const pendOcc = occRows().filter((r) => !r.resolvido).length;
  const rascunhos = payouts.filter((p) => p.status === "rascunho").length;
  const abaixo = result ? result.list.filter((d) => d.pct < curBase.alerta / 100).length : 0;

  const badgeFor = (catId: string): { text: string; hot: boolean } => {
    switch (catId) {
      case "clientes":
        return { text: pendOcc ? `${pendOcc} pendente${pendOcc > 1 ? "s" : ""}` : "em dia", hot: pendOcc > 0 };
      case "financeiro":
        return { text: rascunhos ? `${rascunhos} rascunho${rascunhos > 1 ? "s" : ""}` : "", hot: rascunhos > 0 };
      case "qualidade":
        return { text: abaixo ? `${abaixo} abaixo` : result ? "em dia" : "", hot: abaixo > 0 };
      case "transporte":
        return { text: drivers.length ? `${drivers.length} cadastrado${drivers.length > 1 ? "s" : ""}` : "", hot: false };
      case "indicadores":
        return { text: history.length ? `${history.length} dia${history.length > 1 ? "s" : ""} salvo${history.length > 1 ? "s" : ""}` : "", hot: false };
      case "gestaobases":
        return { text: `${bases.length} base${bases.length === 1 ? "" : "s"}`, hot: false };
      case "operacao":
        return { text: result ? "carregado hoje" : "importar planilhas", hot: false };
      default:
        return { text: "", hot: false };
    }
  };

  return (
    <section className="pane active">
      {/* SLA Alert Banner - aparece sempre que há alertas */}
      <div style={{ padding: '0 16px' }}>
        <SLAAlertBanner alerts={slaAlerts} onOpen={() => setShowSLAModal(true)} />
      </div>

      {/* SLA Alert Modal */}
      <SLAAlertModal
        alerts={slaAlerts}
        isOpen={showSLAModal}
        onClose={() => setShowSLAModal(false)}
        onViewDetail={(code) => {
          // Aqui você pode navegar para a tela de detalhes do pedido se tiver
          console.log('Navegar para detalhes do pedido:', code);
          setShowSLAModal(false);
          // openScreen('entregas'); // se quiser abrir a tela de entregas
        }}
      />

      <div style={{ padding: "0 16px" }}><PlanoBanner /></div>
      <PrimeirosPassos openScreen={openScreen} />
      <div style={{ padding: "0 16px" }}>
        <ImportStrip
          titulo={history.length ? "Atualizar com as planilhas de hoje" : "Comece aqui: arraste as planilhas do JMS"}
          texto="Solte os arquivos em qualquer lugar da tela ou escolha-os aqui. Eu confiro, mostro o que encontrei e você confirma."
        />
      </div>

      <div className="manifestHero">
        {pct === null ? (
          <div>
            <h2 style={{ marginBottom: ".3rem", color: "#fff" }}>Nenhum dia registrado ainda</h2>
            <p style={{ color: "rgba(255,255,255,.85)" }}>Importe as planilhas do JMS para ver o primeiro número aqui.</p>
          </div>
        ) : (
          <>
            <div className="stampWrap">
              <span className="stampNum" key={animKey}>
                {fmtPct(pct)}
                <small>{label}</small>
              </span>
            </div>
            <div className="heroMeta">{meta}</div>
          </>
        )}
      </div>
      <div className="moduleList">
        {CATS.map((cat, i) => {
          const b = badgeFor(cat.id);
          return (
            <motion.button
              key={cat.id}
              className="moduleRow"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1], delay: i * 0.025 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => {
                const first = childrenOf(cat.id)[0];
                if (first) openScreen(first);
              }}
            >
              <span className="ic"><CatIcon id={cat.id} size={20} /></span>
              <span>
                <span className="mtitle">{cat.label}</span>
                <br />
                <span className="mdesc">{cat.desc}</span>
              </span>
              {b.text ? <span className={"mbadge " + (b.hot ? "hot" : "")}>{b.text}</span> : null}
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
