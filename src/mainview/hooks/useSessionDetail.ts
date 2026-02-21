import { useCallback, useEffect, useState } from "react";
import type { Session, SessionEvent } from "@shared/schema";
import { rpcRequest, useRPC } from "./useRPC";

export const useSessionDetail = (sessionId: string | null) => {
  const rpc = useRPC();
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(sessionId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [sessionResult, eventsResult] = await Promise.all([
        rpcRequest("getSession", { id: sessionId }),
        rpcRequest("getSessionEvents", { sessionId }),
      ]);

      setSession(sessionResult);
      setEvents(eventsResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!sessionId) return;

    const listener = () => {
      void refresh();
    };

    rpc.addMessageListener("sessionsUpdated", listener);
    return () => {
      rpc.removeMessageListener("sessionsUpdated", listener);
    };
  }, [refresh, rpc, sessionId]);

  return {
    session,
    events,
    loading,
    error,
    refresh,
  };
};
