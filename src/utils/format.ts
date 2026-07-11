// src/utils/format.ts — small, pure formatting helpers (tested).

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const period = h < 12 ? "am" : "pm";
  return m === 0 ? `${hh} ${period}` : `${hh}:${m.toString().padStart(2, "0")} ${period}`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// The i18n key for the time-of-day greeting; callers localize with t(greetingKey()).
// Keys live in the shared common dict (greeting.morning/afternoon/evening).
export function greetingKey(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "greeting.morning";
  if (h < 18) return "greeting.afternoon";
  return "greeting.evening";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isSameDay(iso: string, ref: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

// Always relative ("3 minutes ago", "2 days ago", "5 weeks ago") — never a bare date.
// Pass t (from useT) to localize; without it, plain English (keeps the pure unit tests green).
type Translate = (key: string, params?: Record<string, string | number>) => string;
export function relativeTimeLabel(iso: string | null, now: Date = new Date(), t?: Translate): string {
  const say = (singKey: string, plurKey: string, n: number, engS: string, engP: string): string => {
    if (t) return t(n === 1 ? singKey : plurKey, { n });
    return (n === 1 ? engS : engP).replace("{n}", String(n));
  };
  if (!iso) return t ? t("time.notShared") : "not yet shared";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t ? t("time.notShared") : "not yet shared";
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60000));
  if (mins < 1) return t ? t("time.justNow") : "just now";
  if (mins < 60) return say("time.minuteAgo", "time.minutesAgo", mins, "{n} minute ago", "{n} minutes ago");
  const hours = Math.round(mins / 60);
  if (hours < 24) return say("time.hourAgo", "time.hoursAgo", hours, "{n} hour ago", "{n} hours ago");
  const days = Math.round(mins / 1440);
  if (days < 7) return say("time.dayAgo", "time.daysAgo", days, "{n} day ago", "{n} days ago");
  const weeks = Math.round(days / 7);
  if (weeks < 5) return say("time.weekAgo", "time.weeksAgo", weeks, "{n} week ago", "{n} weeks ago");
  const months = Math.round(days / 30);
  return say("time.monthAgo", "time.monthsAgo", months, "{n} month ago", "{n} months ago");
}
