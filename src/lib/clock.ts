// Demo clock. Collection cases live on a timescale of days, so the demo can move time
// forward ("advance 7 days") instead of waiting. Everything that compares dates goes through here.

const DAY = 86_400_000;

export function nowWith(offsetDays: number): Date {
  return new Date(Date.now() + offsetDays * DAY);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return isoDate(new Date(new Date(date + "T00:00:00Z").getTime() + days * DAY));
}

export function daysBetween(fromDate: string, toDate: string): number {
  const a = new Date(fromDate.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(toDate.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((b - a) / DAY);
}

export function realToday(): string {
  return isoDate(new Date());
}
