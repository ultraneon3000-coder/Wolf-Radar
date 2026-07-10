import {
  DATE_RANGE_OPTIONS,
  LANGUAGE_OPTIONS,
  PERIOD_OPTIONS,
  SORT_OPTIONS,
  SUBSCRIBER_BUCKETS,
  VIEW_BUCKETS,
  type DateRangeFilter,
  type FilterState,
  type LanguageFilter,
  type PeriodFilter,
  type SortOption,
} from "@/lib/filters";

const selectClasses =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent";

export function FilterBar({
  filters,
  onChange,
  channels,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  channels: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClasses}
        value={filters.dateRange}
        onChange={(e) => onChange({ ...filters, dateRange: e.target.value as DateRangeFilter })}
      >
        {DATE_RANGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={filters.period}
        onChange={(e) => onChange({ ...filters, period: e.target.value as PeriodFilter })}
      >
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={filters.channel}
        onChange={(e) => onChange({ ...filters, channel: e.target.value })}
      >
        <option value="alle">Kanal: alle</option>
        {channels.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={filters.language}
        onChange={(e) => onChange({ ...filters, language: e.target.value as LanguageFilter })}
      >
        {LANGUAGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={filters.minSubscribers}
        onChange={(e) => onChange({ ...filters, minSubscribers: Number(e.target.value) })}
      >
        {SUBSCRIBER_BUCKETS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={filters.minViews}
        onChange={(e) => onChange({ ...filters, minViews: Number(e.target.value) })}
      >
        {VIEW_BUCKETS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        className={`${selectClasses} ml-auto font-medium`}
        value={filters.sort}
        onChange={(e) => onChange({ ...filters, sort: e.target.value as SortOption })}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
