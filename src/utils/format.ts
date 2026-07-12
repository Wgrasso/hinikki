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

// Time-of-day buckets. The small hours read as "evening", not "morning": at 1:40 am
// "Good morning" is disorienting — especially for someone with dementia — so morning only
// begins at 5 am. Evening therefore covers 6 pm through 4:59 am.
export type TimeOfDay = "morning" | "afternoon" | "evening";
export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

export function greeting(now: Date = new Date()): string {
  const tod = timeOfDay(now);
  if (tod === "morning") return "Good morning";
  if (tod === "afternoon") return "Good afternoon";
  return "Good evening";
}

// The i18n key for the time-of-day greeting; callers localize with t(greetingKey()).
// Keys live in the shared common dict (greeting.morning/afternoon/evening).
export function greetingKey(now: Date = new Date()): string {
  return `greeting.${timeOfDay(now)}`;
}

// The voice model sometimes emits bracketed delivery cues — "[gentle]", "[warm]", "[pause]" —
// that are meant for the speech engine, not to be read. Strip them (and tidy the leftover
// spacing) before a line is shown to the elder or stored for continuity.
export function stripStageDirections(text: string): string {
  return text
    .replace(/\[[^\]\n]*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
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
// `withClockTime` appends the actual time of day ("2 days ago at 3:45 pm") for anything an hour
// or older, so a caretaker can be sure exactly when something happened — used for the last-known
// location and the conversation recaps (where several may land on the same day).
export function relativeTimeLabel(
  iso: string | null,
  now: Date = new Date(),
  t?: Translate,
  opts?: { withClockTime?: boolean },
): string {
  const say = (singKey: string, plurKey: string, n: number, engS: string, engP: string): string => {
    if (t) return t(n === 1 ? singKey : plurKey, { n });
    return (n === 1 ? engS : engP).replace("{n}", String(n));
  };
  if (!iso) return t ? t("time.notShared") : "not yet shared";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t ? t("time.notShared") : "not yet shared";
  const mins = Math.max(0, Math.round((now.getTime() - then) / 60000));
  const withClock = (label: string): string =>
    opts?.withClockTime && mins >= 60 ? `${label} ${t ? t("time.at") : "at"} ${formatTime(iso)}` : label;
  if (mins < 1) return t ? t("time.justNow") : "just now";
  if (mins < 60) return say("time.minuteAgo", "time.minutesAgo", mins, "{n} minute ago", "{n} minutes ago");
  const hours = Math.round(mins / 60);
  if (hours < 24) return withClock(say("time.hourAgo", "time.hoursAgo", hours, "{n} hour ago", "{n} hours ago"));
  const days = Math.round(mins / 1440);
  if (days < 7) return withClock(say("time.dayAgo", "time.daysAgo", days, "{n} day ago", "{n} days ago"));
  const weeks = Math.round(days / 7);
  if (weeks < 5) return withClock(say("time.weekAgo", "time.weeksAgo", weeks, "{n} week ago", "{n} weeks ago"));
  const months = Math.round(days / 30);
  return withClock(say("time.monthAgo", "time.monthsAgo", months, "{n} month ago", "{n} months ago"));
}
