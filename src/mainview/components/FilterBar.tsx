import { SESSION_SOURCES, type SessionFilters, type SessionSource } from "@shared/schema";
import { SOURCE_LABELS } from "../lib/constants";

interface FilterBarProps {
  sources: SessionSource[];
  onSourcesChange: (next: SessionSource[]) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  repoName: string;
  repoOptions: string[];
  onRepoChange: (value: string) => void;
  model: string;
  modelOptions: string[];
  onModelChange: (value: string) => void;
  sortBy: SessionFilters["sortBy"];
  sortDir: SessionFilters["sortDir"];
  onSortByChange: (value: SessionFilters["sortBy"]) => void;
  onSortDirChange: (value: SessionFilters["sortDir"]) => void;
}

const toggleSource = (selected: SessionSource[], source: SessionSource): SessionSource[] => {
  if (selected.includes(source)) {
    return selected.filter((item) => item !== source);
  }
  return [...selected, source];
};

const FilterBar = ({
  sources,
  onSourcesChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  repoName,
  repoOptions,
  onRepoChange,
  model,
  modelOptions,
  onModelChange,
  sortBy,
  sortDir,
  onSortByChange,
  onSortDirChange,
}: FilterBarProps) => {
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap gap-2">
        {SESSION_SOURCES.map((source) => {
          const active = sources.includes(source);
          return (
            <button
              key={source}
              type="button"
              onClick={() => onSourcesChange(toggleSource(sources, source))}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-0)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              }`}
            >
              {SOURCE_LABELS[source]}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <label className="text-xs text-[var(--text-muted)]">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          />
        </label>

        <label className="text-xs text-[var(--text-muted)]">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          />
        </label>

        <label className="text-xs text-[var(--text-muted)]">
          Repo
          <select
            value={repoName}
            onChange={(event) => onRepoChange(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          >
            <option value="">All repositories</option>
            {repoOptions.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[var(--text-muted)]">
          Model
          <select
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          >
            <option value="">All models</option>
            {modelOptions.map((modelOption) => (
              <option key={modelOption} value={modelOption}>
                {modelOption}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[var(--text-muted)]">
          Sort by
          <select
            value={sortBy}
            onChange={(event) => onSortByChange(event.target.value as SessionFilters["sortBy"])}
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          >
            <option value="date">Date</option>
            <option value="tokens">Tokens</option>
            <option value="cost">Cost</option>
            <option value="duration">Duration</option>
          </select>
        </label>

        <label className="text-xs text-[var(--text-muted)]">
          Direction
          <select
            value={sortDir}
            onChange={(event) => onSortDirChange(event.target.value as SessionFilters["sortDir"])}
            className="mt-1 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
      </div>
    </div>
  );
};

export default FilterBar;
