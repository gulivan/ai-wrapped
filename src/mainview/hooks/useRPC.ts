import { Electroview } from "electrobun/view";
import type { AIStatsRPC } from "@shared/types";

type BunRequests = AIStatsRPC["bun"]["requests"];
type WrappedRPCRequests = Pick<BunRequests, "getDashboardSummary" | "getDailyTimeline">;
export type RPCRequestName = keyof WrappedRPCRequests;
export type RPCRequestParams<K extends RPCRequestName> = WrappedRPCRequests[K]["params"];
export type RPCRequestResponse<K extends RPCRequestName> = WrappedRPCRequests[K]["response"];

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
