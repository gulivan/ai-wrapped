import { useEffect, useMemo, useState } from "react";
import { SESSION_SOURCES, type SessionSource } from "@shared/schema";
import type { AppSettings } from "@shared/types";
import Dashboard from "./components/Dashboard";
import SessionDetail from "./components/SessionDetail";
import SessionList from "./components/SessionList";
import Settings from "./components/Settings";
import { rpcRequest, useRPC } from "./hooks/useRPC";
import Sidebar, { type SidebarView } from "./components/Sidebar";

const applyTheme = (theme: AppSettings["theme"]) => {
  document.documentElement.dataset.theme = theme;
};

const App = () => {
  const rpc = useRPC();
  const [view, setView] = useState<SidebarView>("dashboard");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sources, setSources] = useState<SessionSource[]>(SESSION_SOURCES);

  const activeSources = useMemo(
    () => (sources.length === 0 ? SESSION_SOURCES : sources),
    [sources],
  );

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const settings = await rpcRequest("getSettings", {});
        applyTheme(settings.theme);
      } catch {
        applyTheme("system");
      }
    };

    void loadTheme();
  }, []);

  useEffect(() => {
    const listener = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const theme = (payload as { theme?: AppSettings["theme"] }).theme;
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
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-primary)]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <Sidebar
          view={view}
          onNavigate={(nextView) => setView(nextView)}
          sources={activeSources}
          onSourcesChange={setSources}
        />

        <main className="p-4 sm:p-6 lg:p-8">
          {view === "dashboard" ? <Dashboard sources={activeSources} /> : null}

          {view === "sessions" ? (
            <SessionList
              sources={activeSources}
              onSourcesChange={setSources}
              onOpenSession={(sessionId) => {
                setSelectedSessionId(sessionId);
                setView("session-detail");
              }}
            />
          ) : null}

          {view === "session-detail" ? (
            <SessionDetail
              sessionId={selectedSessionId}
              onBack={() => {
                setView("sessions");
              }}
            />
          ) : null}

          {view === "settings" ? <Settings /> : null}
        </main>
      </div>
    </div>
  );
};

export default App;
