// src/features/voice/factFilter.ts — deterministic opinion/complaint net (plan §3.6, FR-8 layer 2).
// The prompt is layer 1 and the human reviewer is layer 3; this layer catches LLM lapses BEFORE
// anything reaches an admin-visible row. Facts pass; judgments about people never do. When in
// doubt the rule is: a lost fact is recoverable, a stored insult is not — so we drop.
const MAX_QUOTE_CHARS = 200;

// Judgment/complaint vocabulary, English + Dutch. Word-boundary matched, case-insensitive.
// Deliberately broad: these words in a stored quote are near-certain opinion context.
const JUDGMENT_WORDS = [
  // EN — character judgments
  "cruel", "mean", "lazy", "stupid", "selfish", "awful", "horrible", "terrible",
  "annoying", "useless", "worthless", "liar", "thief", "evil", "nasty", "rude",
  "ungrateful", "cold-hearted", "heartless",
  // EN — hostility / blame
  "hate", "hates", "hated", "can't stand", "cannot stand", "fed up with",
  "never visits", "never calls", "never comes", "doesn't care", "does not care",
  "abandoned me", "stole", "stolen", "lied to me", "blames", "argument", "arguing",
  // NL — character judgments
  "gemeen", "lui", "stom", "dom", "egoïstisch", "egoistisch", "vreselijk",
  "verschrikkelijk", "irritant", "nutteloos", "waardeloos", "leugenaar", "dief",
  "gierig", "hardvochtig", "onbeschoft", "ondankbaar",
  // NL — hostility / blame
  "haat", "kan hem niet uitstaan", "kan haar niet uitstaan", "komt nooit",
  "belt nooit", "bezoekt me nooit", "nooit op bezoek", "geeft niet om",
  "in de steek gelaten", "gestolen", "gelogen", "ruzie", "verwijt",
];

const JUDGMENT_PATTERNS = JUDGMENT_WORDS.map(
  (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu"),
);

// Fold the variants LLMs/iOS keyboards emit so the net can't be dodged by typography:
// curly apostrophes → ', whitespace runs → single space (also fixes "can't  stand").
function normalizeForMatching(text: string): string {
  return text
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// True when the text reads as a judgment/complaint about a person rather than a fact.
export function looksLikeOpinion(text: string): boolean {
  const t = normalizeForMatching(text);
  if (t.length === 0) return false;
  return JUDGMENT_PATTERNS.some((re) => re.test(t));
}

// Prepare a quote for storage: null means DROP THE WHOLE WRITE (proposal/note/recap).
export function sanitizeQuote(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (t.length === 0) return null;
  if (looksLikeOpinion(t)) return null;
  return t.length > MAX_QUOTE_CHARS ? `${t.slice(0, MAX_QUOTE_CHARS - 1)}…` : t;
}

// Gate for structured payloads: every string value must pass the net, at ANY depth —
// the LLM controls the payload shape, so arrays of objects recurse too.
export function payloadPassesFilter(payload: Record<string, unknown>): boolean {
  const valuePasses = (v: unknown): boolean => {
    if (typeof v === "string") return !looksLikeOpinion(v);
    if (Array.isArray(v)) return v.every(valuePasses);
    if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).every(valuePasses);
    return true;
  };
  return Object.values(payload).every(valuePasses);
}
