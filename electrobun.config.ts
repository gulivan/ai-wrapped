import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "AI Wrapped",
    identifier: "com.aiwrapped.app",
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
      "public/tray-icon@2x.png": "views/mainview/tray-icon@2x.png",
    },
    mac: { bundleCEF: false, icons: "icon.iconset" },
    linux: { bundleCEF: true, icon: "icon.png" },
    win: { bundleCEF: false, icon: "icon.ico" },
  },
} satisfies ElectrobunConfig;
