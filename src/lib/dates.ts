import {
  differenceInDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";

export const fmtDay = (iso: string) => format(parseISO(iso), "d MMM yyyy");
export const fmtDayTime = (iso: string) => format(parseISO(iso), "d MMM yyyy, h:mm a");
export const fmtMonthKey = (key: string) => format(parseISO(`${key}-01`), "MMM yyyy");
export const monthKeyOf = (iso: string) => format(parseISO(iso), "yyyy-MM");
export const nowISO = () => new Date().toISOString();
export const todayDateInput = () => format(new Date(), "yyyy-MM-dd");

export type DatePreset =
  | "today"
  | "week"
  | "month"
  | "last_month"
  | "3m"
  | "6m"
  | "year"
  | "all"
  | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

export function rangeForPreset(preset: DatePreset, custom?: DateRange): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: now };
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const prev = subMonths(now, 1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "3m":
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case "6m":
      return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
    case "all":
      return { start: new Date(2000, 0, 1), end: endOfYear(now) };
    case "custom":
      return custom ?? { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

export function inRange(iso: string, range: DateRange): boolean {
  const d = parseISO(iso);
  return isWithinInterval(d, { start: range.start, end: range.end });
}

export function filterByRange<T extends { date: string }>(items: T[], range: DateRange): T[] {
  return items.filter((t) => inRange(t.date, range));
}

/** Last N month keys including current, oldest first. */
export function lastNMonthKeys(n: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(format(subMonths(now, i), "yyyy-MM"));
  return keys;
}

/** Range of the month `offset` months ago (0 = current month, up to today). */
export function monthRange(offset = 0): DateRange {
  const start = startOfMonth(subMonths(new Date(), offset));
  return { start, end: offset === 0 ? new Date() : endOfMonth(start) };
}

export function daysLeftInMonth(): number {
  const now = new Date();
  return Math.max(differenceInDays(endOfMonth(now), now), 0);
}
