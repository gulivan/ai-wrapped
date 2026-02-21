interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SearchInput = ({ value, onChange, placeholder }: SearchInputProps) => {
  return (
    <label className="relative block w-full">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.65" y1="16.65" x2="21" y2="21" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? "Search sessions"}
        className="h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] pl-9 pr-10 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
          aria-label="Clear search"
        >
          x
        </button>
      ) : null}
    </label>
  );
};

export default SearchInput;
