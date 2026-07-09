export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(
    n
  );
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return (Date.now() - then) / (1000 * 60 * 60 * 24);
}
