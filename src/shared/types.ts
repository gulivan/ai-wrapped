import type { RPCSchema } from "electrobun/bun";
import type { DailyAggregate, DashboardSummary, SessionSource, TrayStats } from "./schema";

export interface AppSettings {
  scanOnLaunch: boolean;
  scanIntervalMinutes: number;
  theme: "system" | "light" | "dark";
  customPaths: Partial<Record<SessionSource, string>>;
}

export type AIStatsRPC = {
  bun: RPCSchema<{
    requests: {
      getDashboardSummary: {
        params: { dateFrom?: string; dateTo?: string };
        response: DashboardSummary;
      };
      getDailyTimeline: {
        params: { dateFrom: string; dateTo: string; source?: SessionSource; model?: string };
        response: DailyAggregate[];
      };
      triggerScan: {
        params: { fullScan?: boolean };
        response: { scanned: number; total: number };
      };
      getScanStatus: {
        params: {};
        response: { isScanning: boolean; lastScanAt: string | null; sessionCount: number };
      };
      getTrayStats: {
        params: {};
        response: TrayStats;
      };
      getSettings: {
        params: {};
        response: AppSettings;
      };
      updateSettings: {
        params: Partial<AppSettings>;
        response: boolean;
      };
    };
    messages: {
      log: { msg: string; level?: "info" | "warn" | "error" };
      openExternal: { url: string };
    };
  }>;

  webview: RPCSchema<{
    requests: {};
    messages: {
      sessionsUpdated: { scanResult: { scanned: number; total: number } };
      scanProgress: { phase: string; current: number; total: number };
      scanStarted: {};
      scanCompleted: { scanned: number; total: number };
      navigate: { view: "dashboard" | "settings" };
      themeChanged: { theme: AppSettings["theme"] };
    };
  }>;
};
