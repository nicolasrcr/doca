import { motion } from "framer-motion";
import { SCREENS } from "../lib/types";
import type { ActiveScreen } from "../hooks/useNav";
import type { ScreenId } from "../lib/types";

export default function TabStrip({
  openTabs,
  activeId,
  openScreen,
  closeTab,
}: {
  openTabs: ScreenId[];
  activeId: ActiveScreen;
  openScreen: (id: ActiveScreen) => void;
  closeTab: (id: ScreenId) => void;
}) {
  return (
    <div className="tabstrip">
      <button className="tabchip" style={{ position: "relative" }} onClick={() => openScreen("home")}>
        {activeId === "home" && <motion.span layoutId="tabActive" className="tabActiveBg" transition={{ type: "spring", stiffness: 500, damping: 42 }} />}
        <span style={{ position: "relative", fontWeight: activeId === "home" ? 590 : 400, color: activeId === "home" ? "var(--ink)" : "var(--muted)" }}>
          🏠 Página inicial
        </span>
      </button>
      {openTabs.map((id) => (
        <button key={id} className="tabchip" style={{ position: "relative" }} onClick={() => openScreen(id)}>
          {id === activeId && <motion.span layoutId="tabActive" className="tabActiveBg" transition={{ type: "spring", stiffness: 500, damping: 42 }} />}
          <span style={{ position: "relative", fontWeight: id === activeId ? 590 : 400, color: id === activeId ? "var(--ink)" : "var(--muted)" }}>
            {SCREENS[id].label}
          </span>
          <span
            className="tabx"
            style={{ position: "relative" }}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(id);
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
