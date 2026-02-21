import type { ChangeEvent } from "react";

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
            disabled
            className="rounded-full border border-white/20 bg-white/10 p-2.5 text-slate-100 transition hover:border-cyan-200/70 hover:bg-cyan-300/20"
            aria-label="Settings are unavailable in wrapped view"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.983 3.24a1.25 1.25 0 0 1 1.233.95l.328 1.311a1.25 1.25 0 0 0 .688.825l1.246.585a1.25 1.25 0 0 0 1.07.02l1.234-.555a1.25 1.25 0 0 1 1.55.488l.76 1.314a1.25 1.25 0 0 1-.203 1.614l-.96.96a1.25 1.25 0 0 0-.338 1.09l.207 1.364a1.25 1.25 0 0 0 .533.861l1.12.765a1.25 1.25 0 0 1 .42 1.645l-.76 1.314a1.25 1.25 0 0 1-1.504.573l-1.308-.393a1.25 1.25 0 0 0-1.067.17l-1.12.765a1.25 1.25 0 0 0-.533.862l-.207 1.363a1.25 1.25 0 0 1-1.49 1.035l-1.5-.304a1.25 1.25 0 0 1-.95-1.233v-1.345a1.25 1.25 0 0 0-.488-.989l-1.05-.807a1.25 1.25 0 0 0-1.041-.214l-1.308.393a1.25 1.25 0 0 1-1.504-.573l-.76-1.314a1.25 1.25 0 0 1 .42-1.645l1.12-.765a1.25 1.25 0 0 0 .533-.861l.207-1.364a1.25 1.25 0 0 0-.338-1.09l-.96-.96a1.25 1.25 0 0 1-.203-1.614l.76-1.314a1.25 1.25 0 0 1 1.55-.488l1.234.555a1.25 1.25 0 0 0 1.07-.02l1.246-.585a1.25 1.25 0 0 0 .688-.825l.328-1.311a1.25 1.25 0 0 1 1.232-.95Z"
              />
              <circle cx="12" cy="12" r="2.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Sidebar;
