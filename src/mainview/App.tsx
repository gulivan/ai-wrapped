import { useEffect } from "react";
import Dashboard from "./components/Dashboard";
import Sidebar from "./components/Sidebar";
import { useRPC } from "./hooks/useRPC";

type ThemeMode = "system" | "light" | "dark";

const applyTheme = (theme: ThemeMode) => {
  document.documentElement.dataset.theme = theme;
};

const App = () => {
  const rpc = useRPC();

  useEffect(() => {
    applyTheme("system");
  }, []);

  useEffect(() => {
    const listener = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const theme = (payload as { theme?: ThemeMode }).theme;
      if (theme === "system" || theme === "light" || theme === "dark") {
        applyTheme(theme);
      }
    };

    rpc.addMessageListener("themeChanged", listener);
    return () => {
      rpc.removeMessageListener("themeChanged", listener);
    };
  }, [rpc]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-primary)]">
      <Sidebar />
      <Dashboard />
    </div>
  );
};

export default App;
