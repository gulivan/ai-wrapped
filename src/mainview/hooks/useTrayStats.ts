import { useCallback, useEffect, useState } from "react";
import type { TrayStats } from "@shared/schema";
import { rpcRequest, useRPC } from "./useRPC";

export const useTrayStats = () => {
  const rpc = useRPC();
  const [stats, setStats] = useState<TrayStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const next = await rpcRequest("getTrayStats", {});
      setStats(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load tray stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const listener = () => {
      void refresh();
    };

    rpc.addMessageListener("sessionsUpdated", listener);
    return () => {
      rpc.removeMessageListener("sessionsUpdated", listener);
    };
  }, [refresh, rpc]);

  return { stats, loading, error, refresh };
};
