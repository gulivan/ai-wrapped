import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  PATHS,
  Tray,
  Utils,
} from "electrobun/bun";
import type { TrayStats } from "@shared/schema";
import type { AppSettings, AIStatsRPC } from "@shared/types";
import { openDatabase } from "./db";
import { runScan } from "./scan";

const db = openDatabase();
const isMac = process.platform === "darwin";

let isScanning = false;
let isQuitting = false;
let lastScanAt: string | null = null;
let scanIntervalId: ReturnType<typeof setInterval> | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

const updateSettings = (patch: Partial<AppSettings>): AppSettings => {
  const current = db.getAllSettings();
  const next: AppSettings = {
    ...current,
    ...patch,
    customPaths: {
      ...current.customPaths,
      ...(patch.customPaths ?? {}),
    },
  };

  db.setSetting("scanOnLaunch", next.scanOnLaunch);
  db.setSetting("scanIntervalMinutes", next.scanIntervalMinutes);
  db.setSetting("theme", next.theme);
  db.setSetting("customPaths", next.customPaths);

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

const updateTrayMenu = () => {
  if (!tray) return;

  try {
    const stats = db.getTrayStats();
    tray.setMenu(buildTrayMenu(stats));
  } catch (error) {
    console.warn("[tray] Failed to update stats", error);
  }
};

const createMainWindow = () => {
  const devUrl = process.env.ELECTROBUN_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? null;
  const url = devUrl && devUrl.trim().length > 0 ? devUrl : "views://mainview/index.html";

  const window = new BrowserWindow({
    title: "AI Stats",
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

  window.on("close", () => {
    // On macOS, closing should behave like hide-to-tray when possible.
    if (!isQuitting && isMac) {
      try {
        window.minimize();
        queueMicrotask(() => {
          if (mainWindow === window && !canUseWindow(window)) {
            mainWindow = null;
          }
        });
        updateTrayMenu();
        return;
      } catch {
        // If the native window was already closed, recreate lazily.
      }
    }

    if (mainWindow === window) {
      mainWindow = null;
    }

    if (!isQuitting) {
      updateTrayMenu();
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

const ensureMainWindow = () => {
  if (canUseWindow(mainWindow)) {
    return { window: mainWindow, created: false };
  }

  mainWindow = createMainWindow();
  return { window: mainWindow, created: true };
};

const showMainWindow = (view: "dashboard" | "sessions" | "settings" = "dashboard") => {
  const { window } = ensureMainWindow();

  if (window.isMinimized()) {
    window.unminimize();
  }

  window.show();
  window.focus();
  rpc.send.navigate({ view });
};

const hideMainWindow = () => {
  if (!canUseWindow(mainWindow)) {
    mainWindow = null;
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
  updateTrayMenu();
  refreshApplicationMenu();
  rpc.send.scanStarted({});

  try {
    const result = await runScan(db, { fullScan });
    lastScanAt = new Date().toISOString();

    rpc.send.scanCompleted({ scanned: result.scanned, total: result.total });
    rpc.send.sessionsUpdated({
      scanResult: {
        scanned: result.scanned,
        total: result.total,
      },
    });

    return result;
  } catch (error) {
    console.error("[scan] Failed", error);
    return { scanned: 0, total: 0, errors: 1 };
  } finally {
    isScanning = false;
    updateTrayMenu();
    refreshApplicationMenu();
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

const refreshApplicationMenu = () => {
  const settings = db.getAllSettings();

  ApplicationMenu.setApplicationMenu([
    ...(isMac
      ? [
          {
            label: "AI Stats",
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Quit",
                action: "quit-app",
                data: { source: "application-menu" },
                accelerator: "CmdOrCtrl+Q",
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
          accelerator: "CmdOrCtrl+R",
          enabled: !isScanning,
        },
        { type: "separator" },
        {
          label: "Quit",
          action: "quit-app",
          data: { source: "application-menu" },
          accelerator: "CmdOrCtrl+Q",
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
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
          accelerator: "CmdOrCtrl+D",
          checked: settings.theme === "dark",
        },
      ],
    },
  ]);
};

const toggleDarkMode = () => {
  const current = db.getAllSettings();
  const nextTheme: AppSettings["theme"] = current.theme === "dark" ? "light" : "dark";
  const next = updateSettings({ theme: nextTheme });

  rpc.send.themeChanged({ theme: next.theme });
  refreshApplicationMenu();
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

  updateTrayMenu();
};

const rpc = BrowserView.defineRPC<AIStatsRPC>({
  handlers: {
    requests: {
      getDashboardSummary: ({ dateFrom, dateTo }) => db.getDashboardSummary(dateFrom, dateTo),
      getDailyTimeline: ({ dateFrom, dateTo, source }) => db.getDailyTimeline(dateFrom, dateTo, source),
      getSessions: (filters) => db.querySessions(filters),
      getSession: ({ id }) => db.getSession(id),
      getSessionEvents: ({ sessionId }) => db.getSessionEvents(sessionId),
      getDistinctModels: () => db.getDistinctModels(),
      getDistinctRepos: () => db.getDistinctRepos(),
      triggerScan: async ({ fullScan }) => {
        const result = await runScanWithNotifications(Boolean(fullScan));
        return { scanned: result.scanned, total: result.total };
      },
      getScanStatus: () => ({
        isScanning,
        lastScanAt,
        sessionCount: db.getStats().sessionCount,
      }),
      getTrayStats: () => db.getTrayStats(),
      getSettings: () => db.getAllSettings(),
      updateSettings: (patch) => {
        const next = updateSettings(patch);
        configureBackgroundScan(next.scanIntervalMinutes);
        refreshApplicationMenu();
        rpc.send.themeChanged({ theme: next.theme });
        return true;
      },
      getDbStats: () => db.getStats(),
      vacuumDatabase: () => {
        db.vacuum();
        return db.getStats();
      },
    },
    messages: {
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
  const action = getEventAction(event);

  switch (action) {
    case "rescan-sessions":
      void runScanWithNotifications(false);
      break;
    case "quit-app":
      quitApp();
      break;
    case "toggle-dark-mode":
      toggleDarkMode();
      break;
    default:
      break;
  }
});

refreshApplicationMenu();

const initialSettings = db.getAllSettings();
configureBackgroundScan(initialSettings.scanIntervalMinutes);

if (initialSettings.scanOnLaunch) {
  void runScanWithNotifications(false);
}

process.on("exit", () => {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }

  if (tray) {
    tray.remove();
    tray = null;
  }

  db.close();
});
