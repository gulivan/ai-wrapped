#!/usr/bin/env bun

import { dirname, join } from "node:path";

const PKG_ROOT = join(dirname(Bun.main), "..");
const HOME = Bun.env.HOME || Bun.env.USERPROFILE || "";
const CACHE_DIR = `${HOME}/.ai-wrapped/app`;
const VERSION_FILE = `${CACHE_DIR}/version.json`;

interface CachedBuild {
  version: string;
  platform: string;
  arch: string;
  builtAt: string;
}

async function readCachedBuild(): Promise<CachedBuild | null> {
  const file = Bun.file(VERSION_FILE);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as CachedBuild;
  } catch {
    return null;
  }
}

async function getPackageVersion(): Promise<string> {
  const pkg = await Bun.file(join(PKG_ROOT, "package.json")).json();
  return pkg.version;
}

async function ensureRuntimeBuildDependencies(): Promise<void> {
  const electrobunPkg = Bun.file(
    join(PKG_ROOT, "node_modules", "electrobun", "package.json"),
  );
  if (await electrobunPkg.exists()) return;

  // bunx extracts ai-wrapped without node_modules, but electrobun expects
  // ./node_modules/electrobun relative to the app root when building.
  console.log("  Installing build dependencies...\n");
  const proc = Bun.spawn([process.execPath, "install", "--production"], {
    cwd: PKG_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Dependency install failed with exit code ${exitCode}`);
  }
}

async function buildApp(): Promise<string> {
  const platform = process.platform;
  const arch = process.arch;

  // Electrobun build needs to run from the package root
  console.log("  Building app (first run only)...\n");
  await ensureRuntimeBuildDependencies();

  // Run electrobun build from the package directory
  const proc = Bun.spawn(["bunx", "electrobun", "build"], {
    cwd: PKG_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env },
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Build failed with exit code ${exitCode}`);
  }

  // Find the built .app
  // Electrobun outputs to build/dev-{platform}-{arch}/ by default
  const platformLabel =
    platform === "darwin" ? "macos" : platform === "win32" ? "win" : "linux";
  const buildDir = join(PKG_ROOT, "build", `dev-${platformLabel}-${arch}`);

  if (platform === "darwin") {
    const appPath = join(buildDir, "AI Wrapped-dev.app");
    const exists = await Bun.file(join(appPath, "Contents", "Info.plist")).exists();
    if (!exists) {
      throw new Error(
        `Build completed but app not found at ${appPath}. Check build output.`,
      );
    }
    return appPath;
  }

  // Linux/Windows: return the build directory
  return buildDir;
}

async function installToCache(builtPath: string): Promise<void> {
  const platform = process.platform;

  await Bun.$`mkdir -p ${CACHE_DIR}`.quiet();

  if (platform === "darwin") {
    // Copy .app bundle to cache
    await Bun.$`rm -rf ${CACHE_DIR}/"AI Wrapped.app"`.quiet();
    await Bun.$`cp -R ${builtPath} ${CACHE_DIR}/"AI Wrapped.app"`.quiet();
  } else {
    // Copy all files for linux/windows
    await Bun.$`rm -rf ${CACHE_DIR}/app-files`.quiet();
    await Bun.$`cp -R ${builtPath} ${CACHE_DIR}/app-files`.quiet();
  }
}

async function launch(): Promise<void> {
  const platform = process.platform;

  if (platform === "darwin") {
    const appPath = `${CACHE_DIR}/AI Wrapped.app`;
    const plist = Bun.file(`${appPath}/Contents/Info.plist`);
    if (!(await plist.exists())) {
      throw new Error(
        `App not found at ${appPath}. Try running with --rebuild.`,
      );
    }
    console.log("  Launching AI Wrapped...");
    await Bun.$`open ${appPath}`.quiet();
  } else if (platform === "linux") {
    console.log("  Launching AI Wrapped...");
    Bun.spawn(["sh", "-c", `"${CACHE_DIR}/app-files/launcher" &`], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } else if (platform === "win32") {
    console.log("  Launching AI Wrapped...");
    Bun.spawn(
      ["cmd", "/c", "start", "", `${CACHE_DIR}\\app-files\\AI Wrapped.exe`],
      { stdout: "ignore", stderr: "ignore" },
    );
  }
}

async function main() {
  const platform = process.platform;
  const arch = process.arch;

  console.log("");
  console.log("  \x1b[1mAI Wrapped\x1b[0m");
  console.log("  Your year in AI\n");

  // --help
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("  Usage: ai-wrapped [options]\n");
    console.log("  Options:");
    console.log("    --version, -v   Show installed version");
    console.log("    --rebuild       Force rebuild the app");
    console.log("    --uninstall     Remove cached app");
    console.log("    --help, -h      Show this help");
    return;
  }

  // --version
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    const cached = await readCachedBuild();
    const pkgVersion = await getPackageVersion();
    console.log(`  Package: v${pkgVersion}`);
    console.log(
      cached
        ? `  Installed: v${cached.version} (${cached.platform}/${cached.arch})`
        : "  Not built yet",
    );
    return;
  }

  // --uninstall
  if (process.argv.includes("--uninstall")) {
    console.log("  Removing ~/.ai-wrapped...");
    if (platform === "win32") {
      await Bun.$`powershell -Command "Remove-Item -Recurse -Force '${HOME}/.ai-wrapped' -ErrorAction SilentlyContinue"`.quiet();
    } else {
      await Bun.$`rm -rf ${HOME}/.ai-wrapped`.quiet();
    }
    console.log("  Done.");
    return;
  }

  const forceRebuild = process.argv.includes("--rebuild");

  // Check if we need to build
  const pkgVersion = await getPackageVersion();
  const cached = await readCachedBuild();
  const platformLabel =
    platform === "darwin" ? "macos" : platform === "win32" ? "win" : "linux";
  const needsBuild =
    forceRebuild ||
    !cached ||
    cached.version !== pkgVersion ||
    cached.platform !== platformLabel ||
    cached.arch !== arch;

  if (needsBuild) {
    if (cached && !forceRebuild) {
      console.log(
        `  Upgrading v${cached.version} \u2192 v${pkgVersion}`,
      );
    } else if (!forceRebuild) {
      console.log(`  First run — building v${pkgVersion}...`);
    } else {
      console.log(`  Rebuilding v${pkgVersion}...`);
    }

    const builtPath = await buildApp();
    await installToCache(builtPath);

    // Write version cache
    await Bun.write(
      VERSION_FILE,
      JSON.stringify(
        {
          version: pkgVersion,
          platform: platformLabel,
          arch,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    console.log(`\n  Built and cached v${pkgVersion}\n`);
  } else {
    console.log(`  v${pkgVersion} ready\n`);
  }

  await launch();
}

main().catch((err) => {
  console.error(`\n  Error: ${(err as Error).message}`);
  process.exit(1);
});
