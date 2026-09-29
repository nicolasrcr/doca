import { AnimatePresence, motion } from "framer-motion";
import { CATS, SCREENS, childrenOf } from "../lib/types";
import type { ActiveScreen } from "../hooks/useNav";
import { useAuth } from "../hooks/useAuth";
import DocaLogo from "./DocaLogo";

const ease = [0.2, 0.8, 0.2, 1] as const;

export default function Sidebar({
  activeId,
  expandedCat,
  sidebarOpen,
  toggleCat,
  openScreen,
  onHome,
}: {
  activeId: ActiveScreen;
  expandedCat: string | null;
  sidebarOpen: boolean;
  toggleCat: (id: string) => void;
  openScreen: (id: ActiveScreen) => void;
  onHome?: () => void;
}) {
  const { user } = useAuth();
  const initial = (user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <div className={"backdrop " + (sidebarOpen ? "on" : "")} />
      <aside className={"sidebar " + (sidebarOpen ? "open" : "")}>
        <button
          type="button"
          className="sidebarTop"
          onClick={onHome}
          style={{ background: "none", border: 0, cursor: onHome ? "pointer" : "default" }}
        >
          <DocaLogo size={22} />
        </button>
        {CATS.map((cat) => {
          const open = expandedCat === cat.id;
          return (
            <div className="navcat" key={cat.id}>
              <motion.button
                className={"navcat-btn " + (open ? "open" : "")}
                onClick={() => toggleCat(cat.id)}
                whileTap={{ scale: 0.98 }}
              >
                <span className="ic">{cat.icon}</span>
                {cat.label}
              </motion.button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    className="navchildren"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease }}
                    style={{ overflow: "hidden" }}
                  >
                    {childrenOf(cat.id).map((id) => (
                      <button
                        key={id}
                        className={"navchild " + (activeId === id ? "on" : "")}
                        onClick={() => openScreen(id)}
                      >
                        {SCREENS[id].label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        <div className="sidebarBottom">
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "var(--r-sm)",
              background: "var(--focus)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: ".78rem",
              fontWeight: 600,
              flex: "0 0 auto",
            }}
          >
            {initial}
          </span>
          <span
            className="mono"
            style={{ fontSize: ".76rem", color: "#9AA0AC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {user?.email}
          </span>
        </div>
      </aside>
    </>
  );
}
