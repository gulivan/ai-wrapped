import { SESSION_SOURCES, type SessionFilters, type SessionSource } from "@shared/schema";
import { DEFAULT_PAGE_SIZE } from "./constants";

export const createDefaultFilters = (sources: SessionSource[] = SESSION_SOURCES): SessionFilters => ({
  query: "",
  sources,
  models: [],
  dateFrom: null,
  dateTo: null,
  repoName: null,
  minCost: null,
  sortBy: "date",
  sortDir: "desc",
  offset: 0,
  limit: DEFAULT_PAGE_SIZE,
});

export const toDateInputValue = (value: string | null): string => {
  if (!value) return "";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value.slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
};
