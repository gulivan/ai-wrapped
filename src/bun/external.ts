const ALLOWED_EXTERNAL_HOSTS = new Set(["x.com", "www.x.com", "github.com", "www.github.com"]);

export const tryResolveAllowedExternalUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const protocolAllowed = parsed.protocol === "https:" || parsed.protocol === "http:";
    const hostAllowed = ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
    const hasCredentials = parsed.username.length > 0 || parsed.password.length > 0;
    if (!protocolAllowed || !hostAllowed || hasCredentials) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
};

export const getOpenExternalCommand = (
  url: string,
  platform: NodeJS.Platform = process.platform,
): string[] => {
  if (platform === "darwin") {
    return ["open", url];
  }

  if (platform === "win32") {
    // Avoid shell-based invocations to reduce command-injection risk.
    return ["rundll32.exe", "url.dll,FileProtocolHandler", url];
  }

  return ["xdg-open", url];
};
