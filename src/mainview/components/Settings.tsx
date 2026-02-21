import { useEffect, useMemo, useState } from "react";
import { SESSION_SOURCES, type SessionSource } from "@shared/schema";
import type { AppSettings } from "@shared/types";
import { SOURCE_LABELS } from "../lib/constants";
import { rpcRequest } from "../hooks/useRPC";
import { formatNumber } from "../lib/formatters";
import EmptyState from "./EmptyState";

interface DBStats {
  sessionCount: number;
  eventCount: number;
  dbSizeBytes: number;
}

const formatDbSize = (bytes: number): string => {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(2)} KB`;
  return `${bytes} B`;
};

const applyTheme = (theme: AppSettings["theme"]) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
};

const Settings = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dbStats, setDbStats] = useState<DBStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [vacuuming, setVacuuming] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [nextSettings, nextStats] = await Promise.all([
          rpcRequest("getSettings", {}),
          rpcRequest("getDbStats", {}),
        ]);
        applyTheme(nextSettings.theme);
        setSettings(nextSettings);
        setDbStats(nextStats);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const hasSettings = useMemo(() => settings !== null, [settings]);

  const updateCustomPath = (source: SessionSource, value: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      customPaths: {
        ...settings.customPaths,
        [source]: value,
      },
    });
  };

  const save = async () => {
    if (!settings) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      await rpcRequest("updateSettings", settings);
      applyTheme(settings.theme);
      setSaveMessage("Settings saved.");
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const triggerScan = async () => {
    setSaveMessage(null);
    try {
      const result = await rpcRequest("triggerScan", {});
      setSaveMessage(`Scan finished: ${result.scanned}/${result.total} files.`);
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Scan failed.");
    }
  };

  const runVacuum = async () => {
    setVacuuming(true);
    setSaveMessage(null);

    try {
      const nextStats = await rpcRequest("vacuumDatabase", {});
      setDbStats(nextStats);
      setSaveMessage("Database vacuum complete.");
    } catch (caught) {
      setSaveMessage(caught instanceof Error ? caught.message : "Failed to vacuum database.");
    } finally {
      setVacuuming(false);
    }
  };

  if (loading) {
    return <EmptyState title="Loading settings" description="Fetching app configuration." />;
  }

  if (error || !hasSettings || !settings) {
    return <EmptyState title="Unable to load settings" description={error ?? "No settings found."} />;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">Configure watched directories and automatic rescan behavior.</p>
      </header>

      <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Rescan</h2>

        <label className="flex items-center justify-between gap-2 text-sm text-[var(--text-secondary)]">
          Auto-scan on launch
          <input
            type="checkbox"
            checked={settings.scanOnLaunch}
            onChange={(event) => setSettings({ ...settings, scanOnLaunch: event.target.checked })}
            className="h-4 w-4 accent-[var(--accent-text)]"
          />
        </label>

        <label className="block text-sm text-[var(--text-secondary)]">
          Rescan interval (minutes)
          <input
            type="number"
            min={1}
            value={settings.scanIntervalMinutes}
            onChange={(event) =>
              setSettings({
                ...settings,
                scanIntervalMinutes: Math.max(1, Number.parseInt(event.target.value || "1", 10)),
              })
            }
            className="mt-2 h-10 w-40 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Appearance</h2>
        <label className="block text-sm text-[var(--text-secondary)]">
          Theme
          <select
            value={settings.theme}
            onChange={(event) => {
              const nextTheme = event.target.value as AppSettings["theme"];
              setSettings({
                ...settings,
                theme: nextTheme,
              });
              applyTheme(nextTheme);
            }}
            className="mt-2 h-10 w-48 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Watched Directories</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Override per-agent discovery directories. Leave blank to use defaults.
        </p>

        <div className="grid gap-3">
          {SESSION_SOURCES.map((source) => (
            <label key={source} className="text-xs text-[var(--text-muted)]">
              {SOURCE_LABELS[source]}
              <input
                type="text"
                value={settings.customPaths[source] ?? ""}
                onChange={(event) => updateCustomPath(source, event.target.value)}
                placeholder="Default path"
                className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Database</h2>
        <div className="grid gap-1 text-sm text-[var(--text-secondary)]">
          <span>Sessions: {formatNumber(dbStats?.sessionCount ?? 0)}</span>
          <span>Events: {formatNumber(dbStats?.eventCount ?? 0)}</span>
          <span>DB size: {formatDbSize(dbStats?.dbSizeBytes ?? 0)}</span>
        </div>
        <button
          type="button"
          onClick={() => void runVacuum()}
          disabled={vacuuming}
          className="h-10 w-fit rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-4 text-sm font-medium text-[var(--text-secondary)] transition enabled:hover:border-[var(--border-strong)] enabled:hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {vacuuming ? "Vacuuming..." : "Run VACUUM"}
        </button>
      </section>

      <footer className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="h-10 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-bg)] px-4 text-sm font-semibold text-[var(--accent-text)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        <button
          type="button"
          onClick={() => void triggerScan()}
          className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          Run scan now
        </button>
        {saveMessage ? <span className="text-xs text-[var(--text-muted)]">{saveMessage}</span> : null}
      </footer>
    </div>
  );
};

export default Settings;
