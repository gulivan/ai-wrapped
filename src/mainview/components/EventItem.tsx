import { useMemo, useState } from "react";
import type { SessionEvent } from "@shared/schema";
import { formatTime, formatTokens } from "../lib/formatters";

interface EventItemProps {
  event: SessionEvent;
}

const EVENT_KIND_LABELS: Record<SessionEvent["kind"], string> = {
  user: "User",
  assistant: "Assistant",
  tool_call: "Tool Call",
  tool_result: "Tool Result",
  error: "Error",
  meta: "Meta",
};

const EVENT_KIND_ICONS: Record<SessionEvent["kind"], string> = {
  user: "U",
  assistant: "A",
  tool_call: "T",
  tool_result: "R",
  error: "!",
  meta: "M",
};

const EventItem = ({ event }: EventItemProps) => {
  const [expandedText, setExpandedText] = useState(false);
  const [expandedTool, setExpandedTool] = useState(false);

  const content = event.text?.trim() ?? "";
  const isLongText = content.length > 220;
  const previewText = isLongText && !expandedText ? `${content.slice(0, 220)}...` : content;

  const tokenTotal = useMemo(() => {
    if (!event.tokens) return 0;
    return (
      event.tokens.inputTokens +
      event.tokens.outputTokens +
      event.tokens.cacheReadTokens +
      event.tokens.cacheWriteTokens +
      event.tokens.reasoningTokens
    );
  }, [event.tokens]);

  const kindClass =
    event.kind === "error"
      ? "text-red-300 border-red-500/30 bg-red-500/10"
      : "text-[var(--text-secondary)] border-[var(--border-subtle)] bg-[var(--surface-2)]";

  return (
    <li className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-bold ${kindClass}`}
          >
            {EVENT_KIND_ICONS[event.kind]}
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{EVENT_KIND_LABELS[event.kind]}</p>
            <p className="text-xs text-[var(--text-muted)]">{formatTime(event.timestamp)}</p>
          </div>
        </div>

        {tokenTotal > 0 ? (
          <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-secondary)]">
            {formatTokens(tokenTotal)} tokens
          </span>
        ) : null}
      </div>

      {content.length > 0 ? (
        <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
          <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-secondary)]">
            {previewText}
          </pre>
          {isLongText ? (
            <button
              type="button"
              onClick={() => setExpandedText((value) => !value)}
              className="mt-2 text-xs font-medium text-[var(--accent-text)] hover:underline"
            >
              {expandedText ? "Show less" : "Show full event"}
            </button>
          ) : null}
        </div>
      ) : null}

      {event.kind === "tool_call" ? (
        <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Tool: {event.toolName ?? "unknown"}
            </p>
            <button
              type="button"
              onClick={() => setExpandedTool((value) => !value)}
              className="text-xs font-medium text-[var(--accent-text)] hover:underline"
            >
              {expandedTool ? "Hide details" : "Expand details"}
            </button>
          </div>

          {expandedTool ? (
            <div className="mt-2 space-y-2 text-xs text-[var(--text-secondary)]">
              <p>Model: {event.model ?? "unknown"}</p>
              <p>Preview: {content || "No payload preview available"}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

export default EventItem;
