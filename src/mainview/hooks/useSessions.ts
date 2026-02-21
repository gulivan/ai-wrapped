import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session, SessionFilters, SessionSource } from "@shared/schema";
import { DEFAULT_PAGE_SIZE } from "../lib/constants";
import { createDefaultFilters } from "../lib/filters";
import { rpcRequest, useRPC } from "./useRPC";

interface UseSessionsOptions {
  sources: SessionSource[];
}

export const useSessions = ({ sources }: UseSessionsOptions) => {
  const rpc = useRPC();
  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [repoName, setRepoName] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [sortBy, setSortBy] = useState<SessionFilters["sortBy"]>("date");
  const [sortDir, setSortDir] = useState<SessionFilters["sortDir"]>("desc");
  const [page, setPage] = useState<number>(1);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [repoOptions, setRepoOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, model, repoName, sortBy, sortDir, sources]);

  const filters = useMemo<SessionFilters>(() => {
    const base = createDefaultFilters(sources);
    return {
      ...base,
      query: debouncedQuery,
      models: model ? [model] : [],
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      repoName: repoName || null,
      sortBy,
      sortDir,
      offset: (page - 1) * DEFAULT_PAGE_SIZE,
      limit: DEFAULT_PAGE_SIZE,
    };
  }, [dateFrom, dateTo, debouncedQuery, model, page, repoName, sortBy, sortDir, sources]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await rpcRequest("getSessions", filters);
      setSessions(result.sessions);
      setTotal(result.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const refreshRepos = useCallback(async () => {
    try {
      const repos = await rpcRequest("getDistinctRepos", {});
      setRepoOptions(repos);
    } catch {
      setRepoOptions([]);
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const models = await rpcRequest("getDistinctModels", {});
      setModelOptions(models);
    } catch {
      setModelOptions([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshRepos();
  }, [refreshRepos]);

  useEffect(() => {
    void refreshModels();
  }, [refreshModels]);

  useEffect(() => {
    const listener = () => {
      void refresh();
      void refreshRepos();
      void refreshModels();
    };

    rpc.addMessageListener("sessionsUpdated", listener);
    return () => {
      rpc.removeMessageListener("sessionsUpdated", listener);
    };
  }, [refresh, refreshModels, refreshRepos, rpc]);

  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  return {
    sessions,
    total,
    loading,
    error,
    query,
    setQuery,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    model,
    setModel,
    repoName,
    setRepoName,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,
    page,
    setPage,
    pageCount,
    repoOptions,
    modelOptions,
    refresh,
  };
};
