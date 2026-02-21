import type { SessionSource } from "@shared/schema";
import { SOURCE_COLORS, SOURCE_LABELS } from "../lib/constants";

interface AgentBadgeProps {
  source: SessionSource;
}

const AgentBadge = ({ source }: AgentBadgeProps) => {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SOURCE_COLORS[source] }} />
      {SOURCE_LABELS[source]}
    </span>
  );
};

export default AgentBadge;
