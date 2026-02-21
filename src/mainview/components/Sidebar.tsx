import type { ChangeEvent, MouseEvent } from "react";
import { useRPC } from "../hooks/useRPC";

interface SidebarProps {
  selectedRange: string;
  rangeOptions: Array<{ value: string; label: string }>;
  onRangeChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  showCostControls: boolean;
  costAgentFilter: string;
  costAgentOptions: Array<{ value: string; label: string }>;
  onCostAgentChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  costGroupBy: string;
  costGroupOptions: Array<{ value: string; label: string }>;
  onCostGroupByChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  costAgentDisabled: boolean;
}

const openExternal = (rpc: ReturnType<typeof useRPC>, url: string) => (e: MouseEvent) => {
  e.preventDefault();
  rpc.send.openExternal({ url });
};

const Sidebar = ({
  selectedRange,
  rangeOptions,
  onRangeChange,
  showCostControls,
  costAgentFilter,
  costAgentOptions,
  onCostAgentChange,
  costGroupBy,
  costGroupOptions,
  onCostGroupByChange,
  costAgentDisabled,
}: SidebarProps) => {
  const rpc = useRPC();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-4 py-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full border border-white/15 bg-slate-950/45 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/90">AI Wrapped</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <label htmlFor="wrapped-range-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-slate-300 sm:block">
            Range
          </label>
          <select
            id="wrapped-range-select"
            value={selectedRange}
            onChange={onRangeChange}
            aria-label="Dashboard range"
            className="h-9 min-w-24 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition focus:border-sky-300 sm:min-w-36 sm:text-sm"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                {option.label}
            </option>
          ))}
          </select>

          {showCostControls ? (
            <>
              <label htmlFor="wrapped-cost-agent-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-slate-300 sm:block">
                Agent
              </label>
              <select
                id="wrapped-cost-agent-select"
                value={costAgentFilter}
                onChange={onCostAgentChange}
                disabled={costAgentDisabled}
                aria-label="Cost agent filter"
                className="h-9 min-w-20 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition enabled:focus:border-sky-300 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-28 sm:text-sm"
              >
                {costAgentOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                    {option.label}
                  </option>
                ))}
              </select>

              <label htmlFor="wrapped-cost-group-select" className="hidden text-[0.62rem] uppercase tracking-[0.16em] text-slate-300 sm:block">
                Group by
              </label>
              <select
                id="wrapped-cost-group-select"
                value={costGroupBy}
                onChange={onCostGroupByChange}
                aria-label="Cost chart grouping"
                className="h-9 min-w-20 rounded-lg border border-white/20 bg-slate-950/65 px-3 text-xs font-medium text-slate-100 outline-none transition focus:border-sky-300 sm:min-w-28 sm:text-sm"
              >
                {costGroupOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          <button
            type="button"
            onClick={openExternal(rpc, "https://x.com/gulivan_dev")}
            className="rounded-full border border-white/20 bg-white/10 p-2.5 text-slate-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20"
            aria-label="Follow on X"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="currentColor" d="m17.687 3.063l-4.996 5.711l-4.32-5.711H2.112l7.477 9.776l-7.086 8.099h3.034l5.469-6.25l4.78 6.25h6.102l-7.794-10.304l6.625-7.571zm-1.064 16.06L5.654 4.782h1.803l10.846 14.34z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={openExternal(rpc, "https://github.com/gulivan/ai-wrapped")}
            className="rounded-full border border-white/20 bg-white/10 p-2.5 text-slate-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20"
            aria-label="View on GitHub"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Sidebar;
