// src/features/voice/agentTools.ts — the seven ElevenLabs client tools (plan §2.6).
// These run ON THE ELDER'S DEVICE under their own Supabase session; the agent only ever
// sees the returned strings. Names, not ids, cross the LLM boundary — the compiled context
// contains no uuids, so every tool resolves people/reminders against the cached snapshot
// tiers deterministically (a hallucinated id can't happen; an unknown name gets a warm
// refusal string the agent can speak from).
// Tool RESULTS are instructions/acknowledgements for the agent, not user-facing copy.
// makeAgentTools returns { tools, reset }: reset() MUST be called at each session start —
// the recap-chip list and the one-push-per-conversation flag are per-conversation state.
import { Linking } from "react-native";
import { saveSessionNote } from "../../services/conversationService";
import { createEmergencyEvent } from "../../services/emergencyService";
import { confirmReminder } from "../../services/reminderService";
import {
  createProposal,
  newProposalId,
  saveRecap,
} from "../../services/proposalService";
import { notifyAdminsOfProposal } from "../../services/pushService";
import { captureAndStoreLocation } from "../safety/locationCapture";
import { looksLikeOpinion } from "./factFilter";
import { getSnapshotTiers, neverRaiseNames } from "./snapshot";
import type { FamilyPerson, ProposalType, RecapChange, Reminder } from "../../types/database";

export type SessionRecap = { summary: string; changes: RecapChange[] };
export type AgentTools = Record<string, (parameters: unknown) => Promise<string>>;
export type AgentToolSet = { tools: AgentTools; reset: () => void };

type Params = Record<string, unknown>;

function asParams(p: unknown): Params {
  return p && typeof p === "object" ? (p as Params) : {};
}
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// Resolve a spoken name against a people list. Exact preferred/full-name match first,
// then unambiguous prefix/substring. Ambiguity returns the candidates so the agent can
// ask which one — kindly, using their connections.
function resolvePerson(people: FamilyPerson[], name: string):
  | { kind: "one"; person: FamilyPerson }
  | { kind: "many"; names: string[] }
  | { kind: "none" } {
  const n = normalize(name);
  if (!n) return { kind: "none" };
  const display = (p: FamilyPerson) => p.preferred_name ?? p.full_name;
  const exact = people.filter(
    (p) => normalize(display(p)) === n || normalize(p.full_name) === n,
  );
  if (exact.length === 1) return { kind: "one", person: exact[0] };
  if (exact.length > 1) return { kind: "many", names: exact.map(display) };
  const loose = people.filter(
    (p) => normalize(display(p)).startsWith(n) || normalize(p.full_name).includes(n),
  );
  if (loose.length === 1) return { kind: "one", person: loose[0] };
  if (loose.length > 1) return { kind: "many", names: loose.map(display) };
  return { kind: "none" };
}

// Resolve a spoken reminder title. Exact match wins; substring matches need a minimum
// length (so "pill" can't grab an arbitrary row) and must be unique — otherwise the
// agent is asked to clarify. Ties prefer the reminder scheduled nearest to now.
function resolveReminder(reminders: Reminder[], title: string):
  | { kind: "one"; reminder: Reminder }
  | { kind: "many"; titles: string[] }
  | { kind: "none" } {
  const n = normalize(title);
  if (!n) return { kind: "none" };
  const active = reminders.filter((r) => r.active);
  const exact = active.filter((r) => normalize(r.title) === n);
  if (exact.length === 1) return { kind: "one", reminder: exact[0] };
  if (exact.length > 1) return { kind: "many", titles: exact.map((r) => r.title) };
  if (n.length < 4) return { kind: "none" };
  const loose = active.filter(
    (r) => normalize(r.title).includes(n) || n.includes(normalize(r.title)),
  );
  if (loose.length === 1) return { kind: "one", reminder: loose[0] };
  if (loose.length > 1) {
    // Distinct titles? Then it is genuinely ambiguous ("medication" → morning + evening).
    const titles = [...new Set(loose.map((r) => r.title))];
    if (titles.length > 1) return { kind: "many", titles };
    const now = Date.now();
    const nearest = [...loose].sort(
      (a, b) =>
        Math.abs(new Date(a.scheduled_at ?? 0).getTime() - now) -
        Math.abs(new Date(b.scheduled_at ?? 0).getTime() - now),
    )[0];
    return { kind: "one", reminder: nearest };
  }
  return { kind: "none" };
}

const PROPOSAL_TYPES: ProposalType[] = [
  "new_person", "person_update", "relationship", "memory", "fact",
  "event", "reminder", "profile_update", "safe_location",
];

// Build the per-elder tool set. `reset()` starts a fresh conversation: new chip list,
// new push budget, new conversation key for the offline queue.
export function makeAgentTools(
  olderAdultId: string,
  hooks: { onRecap?: (recap: SessionRecap) => void } = {},
): AgentToolSet {
  let changes: RecapChange[] = [];
  let pushSent = false;
  let conversationKey = newProposalId();

  const reset = (): void => {
    changes = [];
    pushSent = false;
    conversationKey = newProposalId();
  };

  async function firePushOnce(): Promise<void> {
    if (pushSent) return;
    pushSent = true;
    void notifyAdminsOfProposal().catch(() => undefined);
  }

  const tools: AgentTools = {
    // propose_fact — file a canonical fact for the family to confirm (plan FR-6).
    propose_fact: async (parameters: unknown): Promise<string> => {
      const p = asParams(parameters);
      const typeRaw = asString(p.proposal_type) ?? "fact";
      const proposalType = (PROPOSAL_TYPES as string[]).includes(typeRaw)
        ? (typeRaw as Exclude<ProposalType, "session_recap">)
        : "fact";
      const payload = (p.payload && typeof p.payload === "object" ? { ...(p.payload as Params) } : {}) as Params;
      const tiers = await getSnapshotTiers(olderAdultId);

      // Names → ids, resolved here (the LLM never sees ids). Ambiguity means ASK, not guess;
      // an unmatched name STAYS in the payload so the family at least sees the spoken name.
      let targetId: string | null = null;
      if (proposalType === "person_update" || proposalType === "memory" || proposalType === "fact") {
        const personName = asString(payload.person_name);
        if (personName) {
          const hit = resolvePerson(tiers.people, personName);
          if (hit.kind === "many") {
            return `More than one person matches "${personName}": ${hit.names.join(", ")}. Ask kindly which one they mean, then try again.`;
          }
          if (hit.kind === "one") {
            if (proposalType === "person_update") targetId = hit.person.id;
            if (proposalType === "memory") payload.person_id = hit.person.id;
            if (proposalType === "fact") payload.related_person_id = hit.person.id;
            delete payload.person_name;
          }
          // 'none': keep person_name in the payload for the reviewing admin.
        }
      }
      if (proposalType === "relationship") {
        const aName = asString(payload.person_a_name);
        const bName = asString(payload.person_b_name);
        const a = aName ? resolvePerson(tiers.people, aName) : ({ kind: "none" } as const);
        const b = bName ? resolvePerson(tiers.people, bName) : ({ kind: "none" } as const);
        if (a.kind !== "one" || b.kind !== "one") {
          return "Could not match those names to people on file. Do not retry; mention it in your note instead.";
        }
        payload.person_a_id = a.person.id;
        payload.person_b_id = b.person.id;
        delete payload.person_a_name;
        delete payload.person_b_name;
      }

      const id = newProposalId();
      const result = await createProposal({
        id,
        olderAdultId,
        proposalType,
        targetId,
        payload,
        sourceQuote: asString(p.source_quote),
        agentNote: asString(p.agent_note),
        conversationKey,
      });
      if (!result.ok && result.reason === "filtered") {
        return "Not saved — that sounded like a complaint or judgment about someone. Store nothing about it; just be kind.";
      }
      if (!result.ok && result.reason === "duplicate") {
        return "This is already with the family — do not re-ask and do not mention it again.";
      }
      const label =
        asString(payload.full_name) ?? asString(payload.title) ?? asString(payload.content)?.slice(0, 40) ?? "a note for the family";
      changes.push({ kind: "proposed", label, ref_id: id });
      if (!result.ok) {
        // Insert failed but the fact is safely queued for retry — no push yet.
        return "Noted; it will reach the family when the connection returns. Say at most 'I'll make a note of that'.";
      }
      void firePushOnce();
      return "Noted for the family to confirm. Say at most 'I'll make a note of that' — no mechanics.";
    },

    // save_session_note — Nikki's PRIVATE continuity note (admins can never read it).
    save_session_note: async (parameters: unknown): Promise<string> => {
      const note = asString(asParams(parameters).note);
      if (!note) return "Nothing to save.";
      if (looksLikeOpinion(note)) return "Not saved — the note contained judgments about people. Rewrite it with facts and feelings about things only.";
      await saveSessionNote(olderAdultId, note).catch(() => undefined);
      return "Private note saved.";
    },

    // save_session_recap — the SHAREABLE goodbye recap (elder card + family feed).
    // Filtered ONCE, before BOTH consumers: what the family sees must be exactly what
    // the elder's card showed (plan §4.6).
    save_session_recap: async (parameters: unknown): Promise<string> => {
      const p = asParams(parameters);
      const rawSummary = asString(p.summary) ?? "We had a lovely chat.";
      const agentChanges: RecapChange[] = Array.isArray(p.changes)
        ? (p.changes as Params[])
            .map((c) => ({
              kind: (asString(c.kind) ?? "proposed") as RecapChange["kind"],
              label: asString(c.label) ?? "",
            }))
            .filter((c) => c.label.length > 0)
        : [];
      const seen = new Set(changes.map((c) => `${c.kind}:${normalize(c.label)}`));
      const merged = [
        ...changes,
        ...agentChanges.filter((c) => !seen.has(`${c.kind}:${normalize(c.label)}`)),
      ].filter((c) => !looksLikeOpinion(c.label));
      const summary = looksLikeOpinion(rawSummary) ? "We had a good talk together." : rawSummary;
      await saveRecap(olderAdultId, summary, merged).catch(() => undefined);
      hooks.onRecap?.({ summary, changes: merged });
      return "Recap saved. Close by saying it aloud in one or two warm sentences.";
    },

    // confirm_reminder — the elder says they did the thing (plan FR-10).
    confirm_reminder: async (parameters: unknown): Promise<string> => {
      const p = asParams(parameters);
      const title = asString(p.reminder_title) ?? asString(p.reminder);
      if (!title) return "Which reminder? Include reminder_title.";
      const tiers = await getSnapshotTiers(olderAdultId);
      const hit = resolveReminder(tiers.reminders, title);
      if (hit.kind === "many") {
        return `More than one reminder matches: ${hit.titles.join(", ")}. Ask kindly which one they mean before confirming.`;
      }
      if (hit.kind === "none") return "No reminder by that name. Acknowledge them kindly anyway; do not retry.";
      await confirmReminder(hit.reminder.id, olderAdultId, "voice").catch(() => undefined);
      changes.push({ kind: "confirmed", label: hit.reminder.title, ref_id: hit.reminder.id });
      return `Confirmed "${hit.reminder.title}". Acknowledge them warmly.`;
    },

    // request_help — safety ONLY (lost, hurt, frightened, unwell, wants someone to come).
    request_help: async (parameters: unknown): Promise<string> => {
      const p = asParams(parameters);
      const urgency = asString(p.urgency) === "high" ? "high" : "low";
      const message = asString(p.message) ?? "Nikki noticed they may need help.";
      try {
        await createEmergencyEvent(olderAdultId, {
          event_type: "distress",
          user_message: message,
          detected_urgency: urgency,
        });
        void captureAndStoreLocation(olderAdultId, true).catch(() => undefined);
        changes.push({ kind: "help", label: "asked the family for help" });
        return "The family is being told. Stay with them: calm, short sentences, no alarm words. Remind them family knows and you are staying right here.";
      } catch {
        return "Could not reach the family system just now. Stay calm with them and gently suggest the red help button on the Help screen.";
      }
    },

    // call_person — dial ONLY people the family flagged (plan FR-17/D14).
    call_person: async (parameters: unknown): Promise<string> => {
      const name = asString(asParams(parameters).name);
      if (!name) return "Whom to call? Include name.";
      const tiers = await getSnapshotTiers(olderAdultId);
      const hit = resolvePerson(tiers.people, name);
      if (hit.kind === "many") return `More than one person matches: ${hit.names.join(", ")}. Ask kindly which one they mean.`;
      if (hit.kind === "none") return "No one by that name is on file. Say kindly that you cannot call them, and offer to make a note for the family.";
      const person = hit.person;
      const display = person.preferred_name ?? person.full_name;
      if (!person.can_be_called_by_nikki || !person.phone) {
        return `You cannot call ${display} — the family has not set that up. Say so kindly and offer what you CAN do: keep them company, make a note, or let the family know if help is needed.`;
      }
      try {
        // "+31 (0)6 1234 5678" → "+31612345678": the (0) national prefix must go.
        const dialable = person.phone.replace(/\(0\)/g, "").replace(/[^+\d]/g, "");
        await Linking.openURL(`tel:${dialable}`);
        changes.push({ kind: "called", label: `called ${display}` });
        return `The phone is now calling ${display}. Tell them warmly that the call is starting.`;
      } catch {
        return `The call to ${display} could not be started. Apologise gently and suggest trying from the Help screen.`;
      }
    },

    // lookup_person — search beyond what fit in the context (never a network call).
    lookup_person: async (parameters: unknown): Promise<string> => {
      const name = asString(asParams(parameters).name);
      if (!name) return "Whom to look up? Include name.";
      const tiers = await getSnapshotTiers(olderAdultId);
      // Resolve against the FULL list first: a suppressed person must never fall through
      // to the "someone new" path just because their other name was used.
      const hit = resolvePerson(tiers.people, name);
      if (hit.kind === "many") return `Several people match: ${hit.names.join(", ")}. Ask which one, using their connections.`;
      if (hit.kind === "none") {
        const suppressed = neverRaiseNames(tiers.people).map(normalize);
        if (suppressed.includes(normalize(name))) {
          return "This person is known to the family but must not be discussed. Do not ask about them, do not store anything — just listen warmly and follow the person's lead.";
        }
        return "No one by that name is on file. Treat them as someone new: warm, one gentle question at most, then propose_fact.";
      }
      const p = hit.person;
      if (!p.can_nikki_mention) {
        return "This person is known to the family but must not be discussed. Do not ask about them, do not store anything — just listen warmly and follow the person's lead.";
      }
      const bits = [
        `${p.preferred_name ?? p.full_name}${p.relationship_label ? ` — ${p.relationship_label}` : ""}`,
        p.location_description ? `lives ${p.location_description}` : null,
        p.visit_frequency ?? null,
        p.conversation_hints ? `loves talking about: ${p.conversation_hints}` : null,
        p.pronunciation_help ? `say "${p.pronunciation_help}"` : null,
      ].filter(Boolean);
      return bits.join(". ");
    },
  };

  return { tools, reset };
}
