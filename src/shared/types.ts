import type { RPCSchema } from "electrobun/bun";
import type {
  DailyAggregate,
  DashboardSummary,
  Session,
  SessionEvent,
  SessionFilters,
  SessionSource,
  TrayStats,
} from "./schema";

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
        params: { dateFrom: string; dateTo: string; source?: SessionSource };
        response: DailyAggregate[];
      };
      getSessions: {
        params: SessionFilters;
        response: { sessions: Session[]; total: number };
      };
      getSession: {
        params: { id: string };
        response: Session | null;
      };
      getSessionEvents: {
        params: { sessionId: string };
        response: SessionEvent[];
      };
      getDistinctModels: {
        params: {};
        response: string[];
      };
      getDistinctRepos: {
        params: {};
        response: string[];
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
      getDbStats: {
        params: {};
        response: { sessionCount: number; eventCount: number; dbSizeBytes: number };
      };
      vacuumDatabase: {
        params: {};
        response: { sessionCount: number; eventCount: number; dbSizeBytes: number };
      };
    };
    messages: {
      log: { msg: string; level?: "info" | "warn" | "error" };
    };
  }>;

  webview: RPCSchema<{
    requests: {};
    messages: {
      sessionsUpdated: { scanResult: { scanned: number; total: number } };
      scanProgress: { phase: string; current: number; total: number };
      scanStarted: {};
      scanCompleted: { scanned: number; total: number };
      navigate: { view: "dashboard" | "sessions" | "settings" };
      themeChanged: { theme: AppSettings["theme"] };
    };
  }>;
};
