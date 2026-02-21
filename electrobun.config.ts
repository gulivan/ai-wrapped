import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "AI Stats",
    identifier: "com.aistats.app",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "public/tray-icon.png": "views/mainview/tray-icon.png",
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: true },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
