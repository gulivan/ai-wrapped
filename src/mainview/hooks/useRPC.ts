import { useCallback, useEffect, useState } from "react";
import { Electroview } from "electrobun/view";
import type { AIStatsRPC } from "@shared/types";

type BunRequests = AIStatsRPC["bun"]["requests"];
export type RPCRequestName = keyof BunRequests;
export type RPCRequestParams<K extends RPCRequestName> = BunRequests[K]["params"];
export type RPCRequestResponse<K extends RPCRequestName> = BunRequests[K]["response"];

export const electroview = Electroview.defineRPC<AIStatsRPC>({
  handlers: {},
});

export const rpcRequest = <K extends RPCRequestName>(
  method: K,
  params: RPCRequestParams<K>,
): Promise<RPCRequestResponse<K>> => {
  const requestFn = electroview.request[method] as (
    input: RPCRequestParams<K>,
  ) => Promise<RPCRequestResponse<K>>;

  return requestFn(params);
};

export const useRPC = () => electroview;

interface UseRPCRequestOptions {
  auto?: boolean;
  deps?: ReadonlyArray<unknown>;
}

export const useRPCRequest = <K extends RPCRequestName>(
  method: K,
  params: RPCRequestParams<K> | null,
  options?: UseRPCRequestOptions,
) => {
  const [data, setData] = useState<RPCRequestResponse<K> | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(options?.auto ?? true));
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (nextParams?: RPCRequestParams<K>) => {
      const resolvedParams = nextParams ?? params;
      if (resolvedParams === null) {
        throw new Error(`Missing params for RPC method: ${String(method)}`);
      }

      setLoading(true);
      setError(null);

      try {
        const response = await rpcRequest(method, resolvedParams);
        setData(response);
        return response;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "RPC request failed";
        setError(message);
        throw caught;
      } finally {
        setLoading(false);
      }
    },
    [method, params],
  );

  useEffect(() => {
    if (options?.auto === false || params === null) {
      setLoading(false);
      return;
    }

    void execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execute, options?.auto, ...(options?.deps ?? [])]);

  return {
    data,
    loading,
    error,
    execute,
  };
};
