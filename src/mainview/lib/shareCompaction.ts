import { encodeShareData, type SharePayload } from "@shared/shareData";

interface ShareCompactionStep {
  name: string;
  apply: (payload: SharePayload) => SharePayload;
}

const limitRows = <T,>(rows: T[], maxRows: number): T[] =>
  rows.length <= maxRows ? rows : rows.slice(0, maxRows);

const stripTimelineDetail = (timeline: SharePayload["timeline"]): SharePayload["timeline"] =>
  timeline.map((row) => ({
    date: row.date,
    sessions: row.sessions,
    tokens: row.tokens,
    costUsd: row.costUsd,
    durationMs: 0,
    messages: 0,
    toolCalls: 0,
  }));

const stripMostExpensiveDayDetail = (
  mostExpensiveDay: SharePayload["mostExpensiveDay"],
): SharePayload["mostExpensiveDay"] => {
  if (!mostExpensiveDay) return null;

  return {
    date: mostExpensiveDay.date,
    sessions: mostExpensiveDay.sessions,
    tokens: mostExpensiveDay.tokens,
    costUsd: mostExpensiveDay.costUsd,
    durationMs: 0,
    messages: 0,
    toolCalls: 0,
  };
};

export const compactSharePayloadForTargetLength = (
  payload: SharePayload,
  targetLength: number,
): { encoded: string; appliedSteps: string[] } => {
  let compacted = payload;
  let encoded = encodeShareData(compacted);
  const appliedSteps: string[] = [];

  if (encoded.length <= targetLength) {
    return { encoded, appliedSteps };
  }

  const steps: ShareCompactionStep[] = [
    {
      name: "strip-hourly-by-agent",
      apply: (current) => ({
        ...current,
        hourlyBreakdown: current.hourlyBreakdown.map((row) => ({ ...row, byAgent: [] })),
      }),
    },
    {
      name: "drop-daily-agent-tokens",
      apply: (current) => ({
        ...current,
        dailyAgentTokensByDate: {},
      }),
    },
    {
      name: "drop-daily-agent-costs",
      apply: (current) => ({
        ...current,
        dailyAgentCostsByDate: {},
      }),
    },
    {
      name: "drop-daily-model-costs",
      apply: (current) => ({
        ...current,
        dailyModelCostsByDate: {},
      }),
    },
    {
      name: "strip-timeline-detail",
      apply: (current) => ({
        ...current,
        timeline: stripTimelineDetail(current.timeline),
        mostExpensiveDay: stripMostExpensiveDayDetail(current.mostExpensiveDay),
      }),
    },
    {
      name: "limit-models-8",
      apply: (current) => ({
        ...current,
        modelBreakdown: limitRows(current.modelBreakdown, 8),
      }),
    },
    {
      name: "limit-repos-5",
      apply: (current) => ({
        ...current,
        topRepos: limitRows(current.topRepos, 5),
      }),
    },
    {
      name: "drop-hourly-breakdown",
      apply: (current) => ({
        ...current,
        hourlyBreakdown: [],
      }),
    },
    {
      name: "limit-models-6",
      apply: (current) => ({
        ...current,
        modelBreakdown: limitRows(current.modelBreakdown, 6),
      }),
    },
    {
      name: "limit-repos-3",
      apply: (current) => ({
        ...current,
        topRepos: limitRows(current.topRepos, 3),
      }),
    },
    {
      name: "drop-timeline",
      apply: (current) => ({
        ...current,
        timeline: [],
      }),
    },
    {
      name: "drop-top-repos",
      apply: (current) => ({
        ...current,
        topRepos: [],
      }),
    },
    {
      name: "drop-model-breakdown",
      apply: (current) => ({
        ...current,
        modelBreakdown: [],
      }),
    },
    {
      name: "drop-agent-breakdown",
      apply: (current) => ({
        ...current,
        agentBreakdown: [],
      }),
    },
  ];

  for (const step of steps) {
    const next = step.apply(compacted);
    const nextEncoded = encodeShareData(next);
    if (nextEncoded.length >= encoded.length) {
      continue;
    }

    compacted = next;
    encoded = nextEncoded;
    appliedSteps.push(step.name);

    if (encoded.length <= targetLength) {
      break;
    }
  }

  return { encoded, appliedSteps };
};
