// src/utils/parseBirthday.ts — free-text birthday → ISO date when readable, null otherwise.
// Accepts "1942-05-03", "3-5-1942" (day first, the Dutch way), "3 May 1942" / "3 mei 1942",
// and "May 3, 1942". Month words are matched on the first three letters, English and Dutch
// ("may"/"mei", "oct"/"okt", "mar"/"mrt"/"maart"); ordinals ("3rd", Dutch "3e") are fine too.

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, mrt: 3, maa: 3, apr: 4, may: 5, mei: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12,
};

// Only real calendar dates in 1900..this year pass: the Date round-trip rejects e.g. 31 February,
// which would otherwise silently roll over to 2/3 March.
function toIsoDate(year: number, month: number | undefined, day: number): string | null {
  if (!month || year < 1900 || year > new Date().getFullYear()) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseBirthday(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/,/g, "").replace(/\s+/g, " ");
  if (!text) return null;
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (m) return toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = text.match(/^(\d{1,2})(?:st|nd|rd|th|e)? (?:of )?([a-z]+)\.? (\d{4})$/);
  if (m) return toIsoDate(Number(m[3]), MONTHS[m[2].slice(0, 3)], Number(m[1]));
  m = text.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/);
  if (m) return toIsoDate(Number(m[3]), MONTHS[m[1].slice(0, 3)], Number(m[2]));
  return null;
}
