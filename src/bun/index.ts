import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import Electrobun, {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  PATHS,
  Tray,
  Utils,
} from "electrobun/bun";
import {
  EMPTY_TOKEN_USAGE,
  SESSION_SOURCES,
  type DailyAggregate,
  type DashboardSummary,
  type HourlyBreakdownEntry,
  type SessionSource,
  type TokenUsage,
  type TrayStats,
} from "../shared/schema";
import type { AppSettings, AIStatsRPC } from "../shared/types";
import { runScan } from "./scan";
import { resolveAggregationTimeZone } from "./aggregator";
import {
  createEmptyDayStats,
  dailyStoreMissingHourDimension,
  dailyStoreMissingRepoDimension,
  getSettings,
  readDailyStore,
  setSettings,
  type DayStats,
} from "./store";
import { buildTopRepos } from "./dashboardSummary";
import { getOpenExternalCommand, tryResolveAllowedExternalUrl } from "./external";

const isMac = process.platform === "darwin";
const CUSTOM_MENU_ENABLED = Bun.env.AI_WRAPPED_CUSTOM_MENU !== "0";

let isScanning = false;
let isQuitting = false;
let lastScanAt: string | null = null;
let scanIntervalId: ReturnType<typeof setInterval> | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isMainViewReady = false;
const pendingWebviewMessages: Array<() => void> = [];

Electrobun.events.on("before-quit", () => {
  isQuitting = true;
});

const addDayStats = (target: DayStats, source: DayStats): void => {
  target.sessions += source.sessions;
  target.messages += source.messages;
  target.toolCalls += source.toolCalls;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.costUsd += source.costUsd;
  target.durationMs += source.durationMs;
};

const toTokenUsage = (stats: DayStats): TokenUsage => ({
  inputTokens: stats.inputTokens,
  outputTokens: stats.outputTokens,
  cacheReadTokens: stats.cacheReadTokens,
  cacheWriteTokens: stats.cacheWriteTokens,
  reasoningTokens: stats.reasoningTokens,
});

const createEmptyByAgent = (): DashboardSummary["byAgent"] => ({
  claude: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
  codex: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
  gemini: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
  opencode: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
  droid: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
  copilot: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
});

const isInDateRange = (date: string, dateFrom?: string, dateTo?: string): boolean => {
  if (dateFrom && date < dateFrom) return false;
  if (dateTo && date > dateTo) return false;
  return true;
};

const getDailyTimelineFromStore = async (
  dateFrom: string,
  dateTo: string,
  source?: SessionSource,
  model?: string,
): Promise<DailyAggregate[]> => {
  const daily = await readDailyStore();
  const dates = Object.keys(daily).sort((a, b) => a.localeCompare(b));

  const rows = dates
    .filter((date) => isInDateRange(date, dateFrom, dateTo))
    .map((date) => {
      const entry = daily[date];
      if (!entry) return null;

      const stats =
        source
          ? entry.bySource[source]
          : model
            ? entry.byModel[model]
            : entry.totals;
      if (!stats) return null;

      return {
        date,
        source: source ?? "all",
        model: model ?? "all",
        sessionCount: stats.sessions,
        messageCount: stats.messages,
        toolCallCount: stats.toolCalls,
        tokens: toTokenUsage(stats),
        costUsd: stats.costUsd,
        totalDurationMs: stats.durationMs,
      } satisfies DailyAggregate;
    })
    .filter((row): row is DailyAggregate => row !== null);

  return rows;
};

const getDashboardSummaryFromStore = async (
  dateFrom?: string,
  dateTo?: string,
): Promise<DashboardSummary> => {
  const daily = await readDailyStore();
  const byAgent = createEmptyByAgent();
  const byModelMap = new Map<string, DayStats>();
  const byRepoMap = new Map<string, DayStats>();
  const byHourMap = new Map<number, DayStats>();
  const byHourSourceMap = new Map<number, Map<string, DayStats>>();
  const totals = createEmptyDayStats();

  for (const date of Object.keys(daily)) {
    if (!isInDateRange(date, dateFrom, dateTo)) continue;

    const entry = daily[date];
    if (!entry) continue;

    addDayStats(totals, entry.totals);

    for (const source of SESSION_SOURCES) {
      const stats = entry.bySource[source];
      if (!stats) continue;

      const target = byAgent[source];
      target.sessions += stats.sessions;
      target.events += stats.messages + stats.toolCalls;
      target.tokens.inputTokens += stats.inputTokens;
      target.tokens.outputTokens += stats.outputTokens;
      target.tokens.cacheReadTokens += stats.cacheReadTokens;
      target.tokens.cacheWriteTokens += stats.cacheWriteTokens;
      target.tokens.reasoningTokens += stats.reasoningTokens;
      target.costUsd += stats.costUsd;
    }

    for (const [model, modelStats] of Object.entries(entry.byModel)) {
      if (!byModelMap.has(model)) {
        byModelMap.set(model, createEmptyDayStats());
      }

      addDayStats(byModelMap.get(model) as DayStats, modelStats);
    }

    for (const [repo, repoStats] of Object.entries(entry.byRepo)) {
      if (!byRepoMap.has(repo)) {
        byRepoMap.set(repo, createEmptyDayStats());
      }

      addDayStats(byRepoMap.get(repo) as DayStats, repoStats);
    }

    for (const [hour, hourStats] of Object.entries(entry.byHour)) {
      const hourNum = Number(hour);
      if (!byHourMap.has(hourNum)) {
        byHourMap.set(hourNum, createEmptyDayStats());
      }

      addDayStats(byHourMap.get(hourNum) as DayStats, hourStats);
    }

    for (const [hour, sources] of Object.entries(entry.byHourSource)) {
      const hourNum = Number(hour);
      if (!byHourSourceMap.has(hourNum)) {
        byHourSourceMap.set(hourNum, new Map());
      }
      const sourceMap = byHourSourceMap.get(hourNum) as Map<string, DayStats>;
      for (const [source, sourceStats] of Object.entries(sources)) {
        if (!sourceMap.has(source)) {
          sourceMap.set(source, createEmptyDayStats());
        }
        addDayStats(sourceMap.get(source) as DayStats, sourceStats);
      }
    }
  }

  const byModel = [...byModelMap.entries()]
    .map(([model, stats]) => ({
      model,
      sessions: stats.sessions,
      tokens: toTokenUsage(stats),
      costUsd: stats.costUsd,
    }))
    .sort((left, right) => {
      if (right.sessions !== left.sessions) return right.sessions - left.sessions;
      return right.costUsd - left.costUsd;
    })
    .slice(0, 100);

  const dailyTimeline =
    dateFrom && dateTo ? await getDailyTimelineFromStore(dateFrom, dateTo) : [];
  const topRepos = buildTopRepos(byRepoMap);

  const hourlyBreakdown: HourlyBreakdownEntry[] = Array.from({ length: 24 }, (_, hour) => {
    const stats = byHourMap.get(hour) ?? createEmptyDayStats();
    const sourceMap = byHourSourceMap.get(hour);
    const byAgent = sourceMap
      ? SESSION_SOURCES
          .filter((source) => sourceMap.has(source))
          .map((source) => {
            const s = sourceMap.get(source) as DayStats;
            return {
              source,
              sessions: s.sessions,
              tokens: toTokenUsage(s),
              costUsd: s.costUsd,
            };
          })
          .sort((a, b) => {
            const aTot = a.tokens.inputTokens + a.tokens.outputTokens;
            const bTot = b.tokens.inputTokens + b.tokens.outputTokens;
            return bTot - aTot;
          })
      : [];
    return {
      hour,
      sessions: stats.sessions,
      tokens: toTokenUsage(stats),
      costUsd: stats.costUsd,
      durationMs: stats.durationMs,
      byAgent,
    };
  });

  return {
    totals: {
      sessions: totals.sessions,
      events: totals.messages + totals.toolCalls,
      messages: totals.messages,
      toolCalls: totals.toolCalls,
      tokens: toTokenUsage(totals),
      costUsd: totals.costUsd,
      durationMs: totals.durationMs,
    },
    byAgent,
    byModel,
    dailyTimeline,
    topRepos,
    topTools: [],
    hourlyBreakdown,
  };
};

const dailyStoreNeedsRepoBackfill = async (): Promise<boolean> => {
  const daily = await readDailyStore();
  let hasSessions = false;

  for (const entry of Object.values(daily)) {
    if (entry.totals.sessions > 0) {
      hasSessions = true;
    }

    if (hasSessions) break;
  }

  if (!hasSessions) {
    return false;
  }

  return dailyStoreMissingRepoDimension();
};

const getSessionCountFromStore = async (): Promise<number> => {
  const daily = await readDailyStore();
  let count = 0;

  for (const entry of Object.values(daily)) {
    count += entry.totals.sessions;
  }

  return count;
};

const getTrayStatsFromStore = async (): Promise<TrayStats> => {
  const today = new Date().toISOString().slice(0, 10);
  const daily = await readDailyStore();
  const todayStats = daily[today]?.totals ?? createEmptyDayStats();

  return {
    todayTokens:
      todayStats.inputTokens +
      todayStats.outputTokens +
      todayStats.cacheReadTokens +
      todayStats.cacheWriteTokens +
      todayStats.reasoningTokens,
    todayCost: todayStats.costUsd,
    todaySessions: todayStats.sessions,
    todayEvents: todayStats.messages + todayStats.toolCalls,
    activeSessions: 0,
  };
};

const resolveTrayIconPath = (): string => {
  const bundledPath = join(PATHS.VIEWS_FOLDER, "mainview", "tray-icon.png");
  if (existsSync(bundledPath)) {
    return bundledPath;
  }

  // In dev builds the launcher cwd is inside the .app bundle; walk parents so we
  // can still find the project-level public/tray-icon.png.
  let current = process.cwd();
  while (true) {
    const candidate = join(current, "public", "tray-icon.png");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return "";
};

const updateSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  const current = await getSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    customPaths: {
      ...current.customPaths,
      ...(patch.customPaths ?? {}),
    },
  };

  await setSettings(next);
  return next;
};

const getEventAction = (event: unknown): string => {
  if (!event || typeof event !== "object") return "";
  const data = (event as { data?: unknown }).data;
  if (!data || typeof data !== "object") return "";
  const action = (data as { action?: unknown }).action;
  return typeof action === "string" ? action : "";
};

const buildTrayMenu = (stats: TrayStats) => [
  {
    label: `${stats.todaySessions} sessions today`,
    type: "normal" as const,
    action: "tray-stats-sessions",
    data: { source: "tray" },
    enabled: false,
  },
  {
    label: `${stats.todayEvents} events today`,
    type: "normal" as const,
    action: "tray-stats-events",
    data: { source: "tray" },
    enabled: false,
  },
  {
    label: "Show Dashboard",
    type: "normal" as const,
    action: "show-dashboard",
    data: { source: "tray" },
  },
  {
    label: isScanning ? "Rescanning Sessions..." : "Rescan Sessions",
    type: "normal" as const,
    action: "rescan-sessions",
    data: { source: "tray" },
    enabled: !isScanning,
  },
  {
    label: "Quit",
    type: "normal" as const,
    action: "quit-app",
    data: { source: "tray" },
  },
];

const updateTrayMenu = async () => {
  if (!tray) return;

  try {
    const stats = await getTrayStatsFromStore();
    tray.setMenu(buildTrayMenu(stats));
  } catch (error) {
    console.warn("[tray] Failed to update stats", error);
  }
};

const createMainWindow = () => {
  const devUrl = process.env.ELECTROBUN_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? null;
  const url = devUrl && devUrl.trim().length > 0 ? devUrl : "views://mainview/index.html";
  isMainViewReady = false;

  const window = new BrowserWindow({
    title: "AI Wrapped",
    frame: {
      x: 64,
      y: 64,
      width: 1320,
      height: 860,
    },
    url,
    renderer: "native",
    titleBarStyle: "default",
    rpc,
  });

  const webviewWithEvents = window.webview as unknown as {
    on?: (event: string, handler: () => void) => void;
  };

  if (typeof webviewWithEvents.on === "function") {
    webviewWithEvents.on("dom-ready", () => {
      if (mainWindow !== window) {
        return;
      }

      isMainViewReady = true;
      flushPendingWebviewMessages();
    });
  } else {
    queueMicrotask(() => {
      if (mainWindow !== window) {
        return;
      }

      isMainViewReady = true;
      flushPendingWebviewMessages();
    });
  }

  window.on("close", () => {
    if (mainWindow === window) {
      mainWindow = null;
      isMainViewReady = false;
      pendingWebviewMessages.length = 0;
    }

    if (!isQuitting) {
      void updateTrayMenu();
    }
  });

  return window;
};

const canUseWindow = (window: BrowserWindow | null): window is BrowserWindow => {
  if (!window) {
    return false;
  }

  const candidate = window as unknown as { id?: unknown };
  const browserWindowClass = BrowserWindow as unknown as {
    getById?: (id: number) => unknown;
  };

  if (typeof candidate.id === "number" && typeof browserWindowClass.getById === "function") {
    return Boolean(browserWindowClass.getById(candidate.id));
  }

  try {
    window.isMinimized();
    return true;
  } catch {
    return false;
  }
};

const dispatchToWebview = (send: () => void) => {
  if (!isMainViewReady || !canUseWindow(mainWindow)) {
    pendingWebviewMessages.push(send);
    return;
  }

  try {
    send();
  } catch (error) {
    console.warn("[rpc] Failed to send message to webview", error);
  }
};

const flushPendingWebviewMessages = () => {
  if (!isMainViewReady || !canUseWindow(mainWindow)) {
    return;
  }

  const queued = pendingWebviewMessages.splice(0);
  for (const send of queued) {
    try {
      send();
    } catch (error) {
      console.warn("[rpc] Failed to send queued message to webview", error);
    }
  }
};

const ensureMainWindow = () => {
  if (canUseWindow(mainWindow)) {
    return { window: mainWindow, created: false };
  }

  mainWindow = createMainWindow();
  return { window: mainWindow, created: true };
};

const showMainWindow = (view: "dashboard" | "settings" = "dashboard") => {
  const { window } = ensureMainWindow();

  if (window.isMinimized()) {
    window.unminimize();
  }

  window.show();
  window.focus();
  dispatchToWebview(() => {
    rpc.send.navigate({ view });
  });
};

const hideMainWindow = () => {
  if (!canUseWindow(mainWindow)) {
    mainWindow = null;
    isMainViewReady = false;
    pendingWebviewMessages.length = 0;
    return;
  }

  if (!mainWindow.isMinimized()) {
    mainWindow.minimize();
  }
};

const toggleMainWindowVisibility = () => {
  const { window, created } = ensureMainWindow();

  if (created || window.isMinimized()) {
    showMainWindow("dashboard");
    return;
  }

  hideMainWindow();
};

const quitApp = () => {
  isQuitting = true;
  Utils.quit();
};

const runScanWithNotifications = async (fullScan = false) => {
  if (isScanning) {
    return { scanned: 0, total: 0, errors: 0 };
  }

  isScanning = true;
  void updateTrayMenu();
  void refreshApplicationMenu();
  dispatchToWebview(() => {
    rpc.send.scanStarted({});
  });

  try {
    const aggregationTimeZone = resolveAggregationTimeZone();
    const effectiveFullScan =
      fullScan ||
      (await dailyStoreNeedsRepoBackfill()) ||
      (await dailyStoreMissingHourDimension());
    const result = await runScan({ fullScan: effectiveFullScan, timeZone: aggregationTimeZone });
    lastScanAt = new Date().toISOString();

    dispatchToWebview(() => {
      rpc.send.scanCompleted({ scanned: result.scanned, total: result.total });
    });
    dispatchToWebview(() => {
      rpc.send.sessionsUpdated({
        scanResult: {
          scanned: result.scanned,
          total: result.total,
        },
      });
    });

    return result;
  } catch (error) {
    console.error("[scan] Failed", error);
    return { scanned: 0, total: 0, errors: 1 };
  } finally {
    isScanning = false;
    void updateTrayMenu();
    void refreshApplicationMenu();
  }
};

const configureBackgroundScan = (intervalMinutes: number) => {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  const safeMinutes = Number.isFinite(intervalMinutes) ? Math.max(1, Math.floor(intervalMinutes)) : 5;
  scanIntervalId = setInterval(() => {
    void runScanWithNotifications(false);
  }, safeMinutes * 60_000);
};

const refreshApplicationMenu = async () => {
  if (!CUSTOM_MENU_ENABLED) {
    return;
  }

  const settings = await getSettings();

  ApplicationMenu.setApplicationMenu([
    ...(isMac
      ? [
          {
            label: "AI Wrapped",
            submenu: [
              {
                label: "Show Dashboard",
                action: "show-dashboard",
                data: { source: "application-menu" },
              },
              {
                label: "Rescan Sessions",
                action: "rescan-sessions",
                data: { source: "application-menu" },
                enabled: !isScanning,
              },
              { type: "separator" },
              {
                role: "quit",
              },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Rescan Sessions",
          action: "rescan-sessions",
          data: { source: "application-menu" },
          enabled: !isScanning,
        },
        { type: "separator" },
        {
          role: "quit",
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Dark Mode",
          type: "checkbox",
          action: "toggle-dark-mode",
          data: { source: "application-menu" },
          checked: settings.theme === "dark",
        },
      ],
    },
  ]);
};

const toggleDarkMode = async () => {
  const current = await getSettings();
  const nextTheme: AppSettings["theme"] = current.theme === "dark" ? "light" : "dark";
  const next = await updateSettings({ theme: nextTheme });

  dispatchToWebview(() => {
    rpc.send.themeChanged({ theme: next.theme });
  });
  void refreshApplicationMenu();
};

const createTray = () => {
  const trayIconPath = resolveTrayIconPath();
  if (!trayIconPath) {
    console.warn("[tray] Icon not found at bundled or project paths; creating tray without an image");
  }

  tray = new Tray({
    ...(trayIconPath ? { image: trayIconPath } : {}),
    template: false,
    width: 18,
    height: 18,
  });

  tray.on("tray-clicked", (event: unknown) => {
    const action = getEventAction(event);

    switch (action) {
      case "tray-stats-sessions":
      case "tray-stats-events":
        break;
      case "show-dashboard":
        showMainWindow("dashboard");
        break;
      case "rescan-sessions":
        void runScanWithNotifications(false);
        break;
      case "quit-app":
        quitApp();
        break;
      default:
        toggleMainWindowVisibility();
        break;
    }
  });

  void updateTrayMenu();
};

const openExternalUrl = (url: string): void => {
  try {
    const command = getOpenExternalCommand(url);
    const process = Bun.spawn(command, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });

    void process.exited.then((exitCode) => {
      if (exitCode !== 0) {
        console.warn(`[rpc] Failed to open URL: ${url} (exit code ${exitCode})`);
      }
    });
  } catch (error) {
    console.warn(`[rpc] Failed to open URL: ${url}`, error);
  }
};

const rpc = BrowserView.defineRPC<AIStatsRPC>({
  handlers: {
    requests: {
      getDashboardSummary: ({ dateFrom, dateTo }) => getDashboardSummaryFromStore(dateFrom, dateTo),
      getDailyTimeline: ({ dateFrom, dateTo, source, model }) =>
        getDailyTimelineFromStore(dateFrom, dateTo, source, model),
      triggerScan: async ({ fullScan }) => {
        const result = await runScanWithNotifications(Boolean(fullScan));
        return { scanned: result.scanned, total: result.total };
      },
      getScanStatus: async () => ({
        isScanning,
        lastScanAt,
        sessionCount: await getSessionCountFromStore(),
      }),
      getTrayStats: () => getTrayStatsFromStore(),
      getSettings: () => getSettings(),
      updateSettings: async (patch) => {
        const next = await updateSettings(patch);
        configureBackgroundScan(next.scanIntervalMinutes);
        void refreshApplicationMenu();
        dispatchToWebview(() => {
          rpc.send.themeChanged({ theme: next.theme });
        });
        return true;
      },
    },
    messages: {
      openExternal: ({ url }) => {
        const resolved = tryResolveAllowedExternalUrl(url);
        if (!resolved) {
          console.warn(`[rpc] Rejected openExternal for invalid URL: ${url}`);
          return;
        }
        openExternalUrl(resolved);
      },
      log: ({ msg, level }) => {
        if (level === "warn") {
          console.warn(`[webview] ${msg}`);
          return;
        }

        if (level === "error") {
          console.error(`[webview] ${msg}`);
          return;
        }

        console.info(`[webview] ${msg}`);
      },
    },
  },
});

mainWindow = createMainWindow();
createTray();

ApplicationMenu.on("application-menu-clicked", (event: unknown) => {
  if (!CUSTOM_MENU_ENABLED) {
    return;
  }

  const action = getEventAction(event);

  switch (action) {
    case "show-dashboard":
      showMainWindow("dashboard");
      break;
    case "rescan-sessions":
      void runScanWithNotifications(false);
      break;
    case "quit-app":
      quitApp();
      break;
    case "toggle-dark-mode":
      void toggleDarkMode();
      break;
    default:
      break;
  }
});

const bootstrap = async () => {
  await refreshApplicationMenu();

  const initialSettings = await getSettings();
  configureBackgroundScan(initialSettings.scanIntervalMinutes);

  if (initialSettings.scanOnLaunch) {
    await runScanWithNotifications(false);
  }
};

void bootstrap();

process.on("exit", () => {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  if (tray) {
    tray.remove();
    tray = null;
  }
});
