import { useCallback, useEffect, useState } from "react";
import { SESSION_SOURCES, type SessionSource } from "@shared/schema";
import { SOURCE_LABELS } from "../lib/constants";
import { formatRelativeTime } from "../lib/formatters";
import { rpcRequest, useRPC } from "../hooks/useRPC";

export type SidebarView = "dashboard" | "sessions" | "session-detail" | "settings";

interface SidebarProps {
  view: SidebarView;
  onNavigate: (view: Exclude<SidebarView, "session-detail">) => void;
  sources: SessionSource[];
  onSourcesChange: (next: SessionSource[]) => void;
}

interface ScanStatus {
  isScanning: boolean;
  lastScanAt: string | null;
  sessionCount: number;
}

const navItems: Array<{ id: Exclude<SidebarView, "session-detail">; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sessions", label: "Sessions" },
  { id: "settings", label: "Settings" },
];

const Sidebar = ({ view, onNavigate, sources, onSourcesChange }: SidebarProps) => {
  const rpc = useRPC();
  const [status, setStatus] = useState<ScanStatus>({
    isScanning: false,
    lastScanAt: null,
    sessionCount: 0,
  });

  const refreshStatus = useCallback(async () => {
    try {
      const next = await rpcRequest("getScanStatus", {});
      setStatus(next);
    } catch {
      setStatus((current) => current);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const startedListener = () => {
      setStatus((current) => ({ ...current, isScanning: true }));
    };
    const completedListener = () => {
      setStatus((current) => ({ ...current, isScanning: false, lastScanAt: new Date().toISOString() }));
      void refreshStatus();
    };

    rpc.addMessageListener("scanStarted", startedListener);
    rpc.addMessageListener("scanCompleted", completedListener);

    return () => {
      rpc.removeMessageListener("scanStarted", startedListener);
      rpc.removeMessageListener("scanCompleted", completedListener);
    };
  }, [refreshStatus, rpc]);

  useEffect(() => {
    const navListener = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const nextView = (payload as { view?: SidebarView }).view;
      if (nextView === "dashboard" || nextView === "sessions" || nextView === "settings") {
        onNavigate(nextView);
      }
    };

    rpc.addMessageListener("navigate", navListener);
    return () => {
      rpc.removeMessageListener("navigate", navListener);
    };
  }, [onNavigate, rpc]);

  const toggleSource = (source: SessionSource) => {
    const next = sources.includes(source)
      ? sources.filter((item) => item !== source)
      : [...sources, source];

    onSourcesChange(next);
  };

  return (
    <aside className="flex h-full w-full flex-col gap-5 border-r border-[var(--border-subtle)] bg-[var(--surface-0)] p-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">AI Stats</h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Operational dashboard</p>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const active =
            item.id === view ||
            (item.id === "sessions" && view === "session-detail");

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                active
                  ? "border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]"
                  : "border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Agents</h2>
        <div className="flex flex-wrap gap-2">
          {SESSION_SOURCES.map((source) => {
            const active = sources.includes(source);
            return (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  active
                    ? "border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-secondary)]"
                }`}
              >
                {SOURCE_LABELS[source]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 text-xs">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span
            className={`h-2.5 w-2.5 rounded-full ${status.isScanning ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`}
          />
          <span>{status.isScanning ? "Scanning..." : "Idle"}</span>
        </div>
        <p className="mt-2 text-[var(--text-muted)]">{status.sessionCount} sessions indexed</p>
        <p className="mt-1 text-[var(--text-muted)]">
          Last scan: {status.lastScanAt ? formatRelativeTime(status.lastScanAt) : "never"}
        </p>
      </section>
    </aside>
  );
};

export default Sidebar;
