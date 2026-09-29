import { useCallback, useState } from "react";
import { SCREENS, type ScreenId } from "../lib/types";

export type ActiveScreen = "home" | ScreenId;

export function useNav() {
  const [openTabs, setOpenTabs] = useState<ScreenId[]>([]);
  const [activeId, setActiveId] = useState<ActiveScreen>("home");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openScreen = useCallback((id: ActiveScreen) => {
    if (id === "home") {
      setActiveId("home");
      setSidebarOpen(false);
      return;
    }
    setOpenTabs((tabs) => (tabs.includes(id) ? tabs : [...tabs, id]));
    setActiveId(id);
    setExpandedCat(SCREENS[id].cat);
    setSidebarOpen(false);
  }, []);

  const closeTab = useCallback(
    (id: ScreenId) => {
      setOpenTabs((tabs) => {
        const next = tabs.filter((t) => t !== id);
        if (activeId === id) {
          const last = next[next.length - 1];
          setActiveId(last || "home");
        }
        return next;
      });
    },
    [activeId]
  );

  const toggleCat = useCallback((catId: string) => {
    setExpandedCat((cur) => (cur === catId ? null : catId));
  }, []);

  const resetToHome = useCallback(() => {
    setOpenTabs([]);
    setActiveId("home");
    setExpandedCat(null);
  }, []);

  return { openTabs, activeId, expandedCat, sidebarOpen, setSidebarOpen, openScreen, closeTab, toggleCat, resetToHome };
}
