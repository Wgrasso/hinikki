// src/services/proposalService.ts — the human-in-the-loop write-back queue (plan §4).
// The elder's session INSERTs pending facts (via Nikki's tools); admins review here and,
// on approve, THIS module applies the change under the admin's own session. The apply
// step is the trust boundary: the payload was written by an LLM, so the target table is
// derived from a hardcoded map (never from the row), payload columns are whitelisted per
// type, and every referenced row is fetched and checked to belong to the same older adult.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { looksLikeOpinion, payloadPassesFilter, sanitizeQuote } from "../features/voice/factFilter";
import { createEvent } from "./calendarService";
import { createSafeLocation } from "./locationService";
import { createMemory } from "./memoryService";
import { createPerson, createRelationship, RELATIONSHIP_TYPES, updatePerson } from "./peopleService";
import { updateOlderAdultProfile } from "./profileService";
import { createReminder } from "./reminderService";
import type {
  DeclineReason,
  NikkiProposal,
  ProposalType,
  RecapChange,
} from "../types/database";

const PROPOSAL_COLUMNS =
  "id, older_adult_id, proposal_type, target_id, payload, source_quote, agent_note, status, decline_reason, review_note, reviewed_by_admin_id, reviewed_at, created_at";

const QUEUE_KEY = "hinikki.proposal_queue";
const REMINDER_TYPES = ["routine", "appointment", "hydration", "visit"];
const LANGUAGES = ["en", "nl", "nl-informal"];

// Client-generated ids (plan §4.2): the retry queue, the recap's ref_ids, and the server
// row must agree even while an insert is still queued. Math.random is fine here — these
// are identifiers, not secrets.
export function newProposalId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type NewProposal = {
  id?: string;
  olderAdultId: string;
  proposalType: Exclude<ProposalType, "session_recap">;
  targetId?: string | null;
  payload: Record<string, unknown>;
  sourceQuote?: string | null;
  agentNote?: string | null;
  conversationKey?: string;
};

export type CreateProposalResult =
  | { ok: true; id: string }
  | { ok: false; reason: "filtered" | "error" | "duplicate" };

// Per-type natural key for insert-time dedup (plan §4.2): an LLM slip must not flood
// the family's queue with a second "Add person: Marie" card.
function naturalKey(
  type: string,
  targetId: string | null | undefined,
  payload: Record<string, unknown>,
): string | null {
  const low = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : null);
  switch (type) {
    case "new_person":
      return low(payload.full_name);
    case "person_update":
    case "profile_update":
      return `${targetId ?? "self"}:${Object.keys(payload).sort().join(",")}`;
    case "relationship":
      return [low(payload.person_a_id), low(payload.person_b_id)].sort().join("|") + `|${low(payload.relationship_type)}`;
    case "memory":
    case "event":
    case "reminder":
    case "fact":
    case "support_note":
      return low(payload.content) ?? low(payload.title);
    case "safe_location":
      return low(payload.name);
    default:
      return null;
  }
}

// File a pending proposal. The opinion net runs HERE (FR-8 layer 2) so no admin-visible
// row can carry judgment content even if the prompt layer slipped. Returns 'filtered'
// when the net trips — the caller drops the write silently (the conversation goes on).
export async function createProposal(input: NewProposal): Promise<CreateProposalResult> {
  const quote = sanitizeQuote(input.sourceQuote);
  if (input.sourceQuote && quote === null && input.sourceQuote.trim().length > 0) {
    return { ok: false, reason: "filtered" };
  }
  if (!payloadPassesFilter(input.payload)) return { ok: false, reason: "filtered" };
  if (input.agentNote && looksLikeOpinion(input.agentNote)) return { ok: false, reason: "filtered" };

  const id = input.id ?? newProposalId();
  if (!supabase) return { ok: true, id }; // demo: proposals need the real backend; behave fail-soft

  // Insert-time dedup: an identical pending proposal of the same type means skip.
  const key = naturalKey(input.proposalType, input.targetId, input.payload);
  if (key) {
    try {
      const { data: pending } = await supabase
        .from("nikki_proposals")
        .select("id, target_id, payload")
        .eq("older_adult_id", input.olderAdultId)
        .eq("proposal_type", input.proposalType)
        .eq("status", "pending");
      const dupe = (pending ?? []).some(
        (row) => naturalKey(input.proposalType, row.target_id as string | null, (row.payload ?? {}) as Record<string, unknown>) === key,
      );
      if (dupe) return { ok: false, reason: "duplicate" };
    } catch {
      // dedup is best-effort; the T3 digest is the primary guard
    }
  }

  const { error } = await supabase.from("nikki_proposals").insert({
    id,
    older_adult_id: input.olderAdultId,
    proposal_type: input.proposalType,
    target_id: input.targetId ?? null,
    payload: input.payload,
    source_quote: quote,
    agent_note: input.agentNote ?? null,
    status: "pending",
  });
  if (error) {
    await enqueueOffline({ ...input, id });
    return { ok: false, reason: "error" };
  }
  return { ok: true, id };
}

// The shareable end-of-conversation recap (plan §4.6): stored in the same table as an
// 'fyi' row so it reuses RLS/realtime, but it is never reviewable and never applied.
export async function saveRecap(
  olderAdultId: string,
  summary: string,
  changes: RecapChange[],
): Promise<void> {
  if (looksLikeOpinion(summary)) return;
  const safeChanges = changes.filter((c) => !looksLikeOpinion(c.label));
  if (!supabase) return;
  const { error } = await supabase.from("nikki_proposals").insert({
    id: newProposalId(),
    older_adult_id: olderAdultId,
    proposal_type: "session_recap",
    payload: { summary, changes: safeChanges },
    status: "fyi",
  });
  if (error) throw new Error(error.message);
}

export async function listPendingProposals(olderAdultId: string): Promise<NikkiProposal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("nikki_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as NikkiProposal[];
}

export async function listRecaps(olderAdultId: string, limit = 10): Promise<NikkiProposal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("nikki_proposals")
    .select(PROPOSAL_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .eq("proposal_type", "session_recap")
    .eq("status", "fyi")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as NikkiProposal[];
}

// "Already with the family" digest for the context (plan T3): rendered by fixed app
// templates from type+payload ONLY — admin free text (review_note) never enters here.
export async function listDigestTopics(olderAdultId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("nikki_proposals")
    .select("proposal_type, payload, status")
    .eq("older_adult_id", olderAdultId)
    .in("status", ["pending", "declined"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => {
      const p = (row.payload ?? {}) as Record<string, unknown>;
      const name = typeof p.full_name === "string" ? p.full_name : undefined;
      const title = typeof p.title === "string" ? p.title : undefined;
      switch (row.proposal_type) {
        case "new_person":
          return name ? `who ${name} is` : "a new person";
        case "person_update":
          return name ? `details about ${name}` : "details about someone";
        case "relationship":
          return "how two people are connected";
        case "memory":
          return title ? `the memory "${title}"` : "a memory";
        case "fact":
          return title ?? "a small note";
        case "event":
          return title ? `the plan "${title}"` : "a plan";
        case "reminder":
          return title ? `the reminder "${title}"` : "a reminder";
        case "profile_update":
          return "a detail about them";
        case "safe_location":
          return "a familiar place";
        case "support_note":
          return "a note on how to help them";
        default:
          return null;
      }
    })
    .filter((t): t is string => typeof t === "string");
}

export async function declineProposal(id: string, reason: DeclineReason, note?: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("nikki_proposals")
    .update({
      status: "declined",
      decline_reason: reason,
      review_note: note ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_admin_id: await myAdminProfileId(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Decline-and-erase: for content that should never have been stored. The row (and its
// quote) disappears entirely; tradeoff: the topic also leaves the don't-re-ask digest.
export async function eraseProposal(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("nikki_proposals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── apply-on-approve ─────────────────────────────────────────────────────────

// Hardcoded type→apply map: the LLM never chooses the table (plan §4.2).
const APPLIABLE: Record<Exclude<ProposalType, "session_recap">, true> = {
  new_person: true,
  person_update: true,
  relationship: true,
  memory: true,
  fact: true,
  event: true,
  reminder: true,
  profile_update: true,
  safe_location: true,
  support_note: true,
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
function isoDate(v: unknown): string | null {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function isoDateTime(v: unknown): string | null {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
}

async function assertPersonsBelong(olderAdultId: string, personIds: (string | null)[]): Promise<void> {
  const ids = personIds.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (ids.length === 0 || !supabase) return;
  const { data, error } = await supabase
    .from("family_people")
    .select("id, older_adult_id")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length !== ids.length || rows.some((r) => r.older_adult_id !== olderAdultId)) {
    throw new Error("a referenced person does not belong to this profile");
  }
}

// Apply the (possibly admin-edited) payload under the ADMIN's session, then mark the row.
// editedPayload lets edit-then-approve reuse this path with the corrected values.
// Claim the row with a conditional transition BEFORE any side effect: two admins tapping
// Approve at once (the push goes to everyone, plan §4.5) must apply exactly once, and a
// retry after a failed apply must not duplicate rows either.
async function claimProposal(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("nikki_proposals")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by_admin_id: await myAdminProfileId(),
    })
    .eq("id", id)
    .in("status", ["pending", "failed"])
    .select("id");
  if (error) return false;
  return (data ?? []).length === 1;
}

// Only "how to help" support notes apply WITHOUT a family tap — the quiet, care-oriented guidance
// that shapes how Nikki helps. Everything else, memories included, stays reviewed as "Nikki asks".
const AUTO_APPLY_TYPES = new Set<ProposalType>(["support_note"]);

// Auto-applied types need no family review, so they must not fire the "Nikki has a question" push —
// they just take effect quietly in the background.
export function isAutoAppliedProposal(type: ProposalType): boolean {
  return AUTO_APPLY_TYPES.has(type);
}

// Called when a family admin opens the app: silently apply any pending low-risk proposals, so
// memories and support notes accumulate automatically. Best-effort — a memory that references a
// person who isn't approved yet simply throws and stays pending for review. Admin-only (RLS).
export async function autoApplyLowRiskProposals(olderAdultId: string): Promise<void> {
  try {
    const pending = await listPendingProposals(olderAdultId);
    for (const p of pending) {
      if (!AUTO_APPLY_TYPES.has(p.proposal_type)) continue;
      await approveAndApply(p).catch(() => undefined);
    }
  } catch {
    // best-effort — never block the dashboard
  }
}

export async function approveAndApply(
  proposal: NikkiProposal,
  editedPayload?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const payload = editedPayload ?? proposal.payload;
  const oa = proposal.older_adult_id;
  const claimed = await claimProposal(proposal.id);
  if (!claimed) {
    return { ok: false, error: "already handled — another family member got there first" };
  }
  try {
    if (proposal.proposal_type === "session_recap" || !(proposal.proposal_type in APPLIABLE)) {
      throw new Error("this entry is informational and cannot be applied");
    }
    switch (proposal.proposal_type) {
      case "new_person": {
        const full_name = str(payload.full_name);
        if (!full_name) throw new Error("a name is required");
        await createPerson(oa, {
          full_name,
          preferred_name: str(payload.preferred_name),
          relationship_label: str(payload.relationship_label),
          date_of_birth: isoDate(payload.date_of_birth),
          pronunciation_help: str(payload.pronunciation_help),
          location_description: str(payload.location_description),
          visit_frequency: str(payload.visit_frequency),
          important_notes: str(payload.important_notes),
          conversation_hints: str(payload.conversation_hints),
          phone: null, // phone arrives via the family, never via a voice proposal
        });
        break;
      }
      case "person_update": {
        if (!proposal.target_id) throw new Error("no person to update");
        await assertPersonsBelong(oa, [proposal.target_id]);
        const patch: Record<string, unknown> = {};
        const allowed = [
          "preferred_name", "relationship_label", "location_description", "visit_frequency",
          "important_notes", "conversation_hints", "pronunciation_help",
        ] as const;
        for (const k of allowed) if (str(payload[k])) patch[k] = str(payload[k]);
        const dob = isoDate(payload.date_of_birth);
        if (dob) patch.date_of_birth = dob;
        if (Object.keys(patch).length === 0) throw new Error("nothing to change");
        await updatePerson(proposal.target_id, patch);
        break;
      }
      case "relationship": {
        const a = str(payload.person_a_id);
        const b = str(payload.person_b_id);
        const type = str(payload.relationship_type);
        const vocab: string[] = [...RELATIONSHIP_TYPES.directional, ...RELATIONSHIP_TYPES.symmetric];
        if (!a || !b || !type || !vocab.includes(type)) throw new Error("incomplete connection");
        await assertPersonsBelong(oa, [a, b]);
        await createRelationship(oa, a, b, type as (typeof RELATIONSHIP_TYPES.directional | typeof RELATIONSHIP_TYPES.symmetric)[number]);
        break;
      }
      case "memory": {
        const title = str(payload.title);
        if (!title) throw new Error("a title is required");
        const personId = str(payload.person_id);
        await assertPersonsBelong(oa, [personId]);
        await createMemory(oa, {
          title,
          description: str(payload.description),
          approximate_date: str(payload.approximate_date),
          person_id: personId,
          can_nikki_mention: payload.can_nikki_mention !== false,
        });
        break;
      }
      case "fact": {
        if (!supabase) throw new Error("not available in demo mode");
        const title = str(payload.title) ?? str(payload.content)?.slice(0, 60);
        const content = str(payload.content) ?? str(payload.title);
        if (!content) throw new Error("nothing to save");
        const relatedId = str(payload.related_person_id);
        await assertPersonsBelong(oa, [relatedId]);
        const MEMORY_TYPES = ["preference", "habit", "story", "health", "context"];
        const memoryType = str(payload.memory_type);
        const { error } = await supabase.from("ai_memory_items").insert({
          older_adult_id: oa,
          memory_type: memoryType && MEMORY_TYPES.includes(memoryType) ? memoryType : "preference",
          title,
          content,
          related_person_id: relatedId,
        });
        if (error) throw new Error(error.message);
        break;
      }
      case "event": {
        const title = str(payload.title);
        const start = isoDateTime(payload.start_at);
        if (!title || !start) throw new Error("a title and time are required");
        await createEvent(oa, {
          title,
          start_at: start,
          end_at: isoDateTime(payload.end_at),
          location_name: str(payload.location_name),
          companion: str(payload.companion),
          transport_notes: str(payload.transport_notes),
          what_to_bring: str(payload.what_to_bring),
          user_friendly_summary: title,
        });
        break;
      }
      case "reminder": {
        const title = str(payload.title);
        if (!title) throw new Error("a title is required");
        const type = str(payload.reminder_type);
        await createReminder(oa, {
          title,
          scheduled_at: isoDateTime(payload.scheduled_at),
          reminder_type: type && REMINDER_TYPES.includes(type) ? type : "routine",
          recurrence_rule: str(payload.recurrence_rule),
          nikki_message: str(payload.nikki_message),
          instructions: str(payload.instructions),
          requires_confirmation: payload.requires_confirmation === true,
        });
        break;
      }
      case "profile_update": {
        // Always applies to the proposal's own older adult — target_id is ignored by design.
        const patch: Record<string, unknown> = {};
        if (str(payload.preferred_name)) patch.preferred_name = str(payload.preferred_name);
        if (isoDate(payload.date_of_birth)) patch.date_of_birth = isoDate(payload.date_of_birth);
        if (str(payload.home_address)) patch.home_address = str(payload.home_address);
        const lang = str(payload.primary_language);
        if (lang && LANGUAGES.includes(lang)) patch.primary_language = lang;
        if (Object.keys(patch).length === 0) throw new Error("nothing to change");
        await updateOlderAdultProfile(oa, patch);
        break;
      }
      case "safe_location": {
        const name = str(payload.name);
        if (!name) throw new Error("a name is required");
        await createSafeLocation(oa, { name, address: str(payload.address) });
        break;
      }
      case "support_note": {
        // A learned observation about HOW to help this person (how much to explain,
        // what reassures them, who to reintroduce). Lands in ai_memory_items so it can
        // be read back into {{support_guidance}} next session.
        if (!supabase) throw new Error("not available in demo mode");
        const content = str(payload.content) ?? str(payload.title);
        if (!content) throw new Error("nothing to save");
        const { error } = await supabase.from("ai_memory_items").insert({
          older_adult_id: oa,
          memory_type: "support_note",
          title: str(payload.title) ?? "How to help",
          content,
        });
        if (error) throw new Error(error.message);
        break;
      }
    }

    await markProposal(proposal.id, "applied", editedPayload);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "could not apply";
    await markProposal(proposal.id, "failed", undefined, message).catch(() => undefined);
    return { ok: false, error: message };
  }
}

async function markProposal(
  id: string,
  status: "applied" | "failed",
  editedPayload?: Record<string, unknown>,
  errorNote?: string,
): Promise<void> {
  if (!supabase) return;
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by_admin_id: await myAdminProfileId(),
  };
  if (editedPayload) patch.payload = editedPayload;
  if (errorNote) patch.review_note = errorNote; // admin-only prose; never rendered elder-side
  const { error } = await supabase.from("nikki_proposals").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

async function myAdminProfileId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from("admin_profiles")
      .select("id")
      .eq("auth_user_id", uid)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

// ─── offline retry queue (NFR-3) ─────────────────────────────────────────────

type QueuedProposal = NewProposal & { id: string; conversationKey?: string };

// All queue access is serialized through one promise chain: enqueueOffline and
// flushProposalQueue are both read-modify-write sequences, and a flush racing an
// enqueue must never overwrite the other's write (a silently lost fact is exactly
// what this queue exists to prevent).
let queueLock: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueLock.then(fn, fn);
  queueLock = run.catch(() => undefined);
  return run;
}

async function enqueueOffline(item: QueuedProposal): Promise<void> {
  await withQueueLock(async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? (JSON.parse(raw) as QueuedProposal[]) : [];
      if (!queue.some((q) => q.id === item.id)) queue.push(item);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
    } catch {
      // a lost queued fact is acceptable; a broken conversation is not
    }
  });
}

// Flush queued proposals (call on app foreground / session start). Returns the
// distinct conversationKeys that had a successful catch-up insert, so the caller
// can send at most one catch-up push per conversation (plan §4.5).
export async function flushProposalQueue(): Promise<string[]> {
  if (!supabase) return [];
  return withQueueLock(async () => {
    let queue: QueuedProposal[] = [];
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      queue = raw ? (JSON.parse(raw) as QueuedProposal[]) : [];
    } catch {
      return [];
    }
    if (queue.length === 0) return [];
    const succeeded = new Set<string>();
    const flushedConversations = new Set<string>();
    for (const item of queue) {
      const { error } = await supabase!.from("nikki_proposals").insert({
        id: item.id,
        older_adult_id: item.olderAdultId,
        proposal_type: item.proposalType,
        target_id: item.targetId ?? null,
        payload: item.payload,
        source_quote: sanitizeQuote(item.sourceQuote),
        agent_note: item.agentNote ?? null,
        status: "pending",
      });
      if (!error || /duplicate key/i.test(error.message)) {
        succeeded.add(item.id);
        // Only review-needed proposals warrant the "Nikki has a question" push; auto-applied
        // types (support notes) flush silently, just like they do online.
        if (!isAutoAppliedProposal(item.proposalType)) flushedConversations.add(item.conversationKey ?? "unknown");
      }
    }
    try {
      // Rewrite as stored-minus-succeeded (under the lock nothing else interleaves).
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const current = raw ? (JSON.parse(raw) as QueuedProposal[]) : [];
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(current.filter((q) => !succeeded.has(q.id))));
    } catch {
      // ignore
    }
    return [...flushedConversations];
  });
}
