import type { ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "./hooks/useAuth";
import { DocaProvider, useDoca } from "./hooks/DocaContext";
import { ToastProvider } from "./hooks/useToast";
import { DialogProvider } from "./hooks/useDialog";
import { useNav } from "./hooks/useNav";
import Auth from "./components/Auth";
import ImportWizard from "./components/ImportWizard";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import TabStrip from "./components/TabStrip";
import Home from "./pages/Home";
import Entregas from "./pages/Entregas";
import Historico from "./pages/Historico";
import Motoristas from "./pages/Motoristas";
import Conferencia from "./pages/Conferencia";
import Fechamento from "./pages/Fechamento";
import Ajustes from "./pages/Ajustes";
import Bases from "./pages/Bases";
import Membros from "./pages/Membros";
import Orgs from "./pages/Orgs";
import Geral from "./pages/Geral";
import Saude from "./pages/Saude";
import Clientes from "./pages/Clientes";
import Integracoes from "./pages/Integracoes";
import Alertas from "./pages/Alertas";
import Cabine from "./pages/Cabine";
import QrConf from "./pages/QrConf";
import PacotesParados from "./pages/PacotesParados";
import Pendencias from "./pages/Pendencias";
import Precos from "./pages/Precos";
import Cep from "./pages/Cep";
import type { ScreenId } from "./lib/types";

function Shell() {
  const { ready, bases, curBase, createBase, selectBase } = useDoca();
  const nav = useNav();

  if (!ready) return null;

  if (!bases.length) {
    return (
      <>
        <Header onHamb={() => {}} onHome={() => {}} onNewBase={async (name) => { const id = await createBase(name); selectBase(id); }} />
        <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" }}>
          <h2>Vamos começar</h2>
          <p className="muted">Escolha como quer montar suas bases. Dá para fazer das duas formas depois.</p>
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <h3>Já uso o JMS</h3>
            <p className="muted small">Arraste as planilhas exportadas. Eu encontro as bases, mostro para você confirmar e já preencho o histórico.</p>
            <ImportWizard onDone={async (id) => { if (id) await selectBase(id); nav.openScreen("geral"); }} />
          </div>
          <div className="panel">
            <h3>Ainda não uso o JMS</h3>
            <p className="muted small">Crie a base agora e importe as planilhas quando tiver.</p>
            <button
              className="btn primary"
              onClick={async () => {
                const name = prompt("Nome da base (ex.: F SBS-DF):");
                if (!name || !name.trim()) return;
                const id = await createBase(name);
                selectBase(id);
              }}
            >
              Criar base
            </button>
          </div>
        </main>
      </>
    );
  }

  const screens: Record<ScreenId, () => ReactElement> = {
    entregas: () => <Entregas openScreen={nav.openScreen} />,
    historico: () => <Historico />,
    motoristas: () => <Motoristas />,
    conferencia: () => <Conferencia />,
    qrconf: () => <QrConf />,
    parados: () => <PacotesParados />,
    pendencias: () => <Pendencias openScreen={nav.openScreen} />,
    fechamento: () => <Fechamento />,
    precos: () => <Precos />,
    cep: () => <Cep />,
    ajustes: () => <Ajustes />,
    bases: () => <Bases />,
    membros: () => <Membros />,
    orgs: () => <Orgs />,
    geral: () => <Geral openScreen={nav.openScreen} />,
    saude: () => <Saude openScreen={nav.openScreen} />,
    clientes: () => <Clientes />,
    integracoes: () => <Integracoes />,
    alertas: () => <Alertas openScreen={nav.openScreen} />,
    cabine: () => <Cabine />,
  };

  return (
    <div className="appShell">
      <Sidebar
        activeId={nav.activeId}
        expandedCat={nav.expandedCat}
        sidebarOpen={nav.sidebarOpen}
        toggleCat={nav.toggleCat}
        openScreen={nav.openScreen}
        onHome={() => nav.openScreen("home")}
      />
      <div className="shell">
        <Header
          onHamb={() => nav.setSidebarOpen((o) => !o)}
          onHome={() => nav.openScreen("home")}
          onNewBase={async (name) => { const id = await createBase(name); selectBase(id); nav.resetToHome(); }}
        />
        <div className="content">
          <TabStrip openTabs={nav.openTabs} activeId={nav.activeId} openScreen={nav.openScreen} closeTab={nav.closeTab} />
          <main>
            <AnimatePresence mode="wait">
              {curBase && (
                <motion.div
                  key={nav.activeId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {nav.activeId === "home" ? <Home openScreen={nav.openScreen} /> : screens[nav.activeId]()}
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Auth />;

  return (
    <ToastProvider>
      <DialogProvider>
        <DocaProvider>
          <Shell />
        </DocaProvider>
      </DialogProvider>
    </ToastProvider>
  );
}
