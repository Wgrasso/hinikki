# HiNikki — Architecture & Handoff

A guide for the next engineer taking over HiNikki. It explains **what the system is**, **why the
big pieces are the way they are**, and **how the moving parts fit together**, then goes deep enough
to change things safely. Read this top to bottom once; after that, use it as a map.

Companion docs (don't duplicate, cross-reference):
- `elevenlabs/README.md` — the exact agent config, dynamic-variable contract, and client-tool
  declarations that must match the ElevenLabs dashboard.
- `elevenlabs/agent.json` — the versioned snapshot of the agent's prompt + settings.
- `docs/plans/nikki-brain.md` — the original design plan (deeper rationale, decision log).
- `DEVELOPMENT.md` — how to run, build (EAS), and configure keys.

---

## 1. What HiNikki is

A warm voice companion for older adults living with dementia, plus a family-facing admin app to set
it up and keep an eye on things. One codebase, **two experiences**:

- **Elder app** (`app/user/*`): a single big "Talk to Nikki" button, a simple schedule/people view,
  and a help screen. Designed for someone who may be confused — minimal choices, large targets,
  warm copy, no jargon.
- **Family/admin app** (`app/admin/*`): manage the people in the elder's life, schedule, reminders,
  safe places and emergency contacts, review what Nikki has learned, and read conversation recaps.

**Stack:** Expo / React Native + TypeScript (file-based routing via `expo-router`), Supabase
(Postgres + Auth + Realtime + Edge Functions + Storage) as the backend, and **ElevenLabs
Conversational AI** for the actual voice conversation. State/UX is deliberately plain React with a
small design system in `src/primitives`.

---

## 2. The core idea: one AI, a "brain" around it

Nikki's intelligence is **not** in this codebase. The conversation (speech-to-text → LLM →
text-to-speech, turn-taking, interruption handling) all runs **inside ElevenLabs**. What we build is
the **brain around that agent**: everything that makes a generic voice model behave like *this*
person's trusted companion, and everything that turns a conversation into durable, safe data the
family can act on.

Two flows define the whole system:

- **Read path (context in):** the app assembles what Nikki should know about this person *right now*
  and injects it into the agent at the start of each call.
- **Write path (facts out):** during/after a call, the agent calls **client tools** that run on the
  device; those propose facts, save notes/recaps, or trigger safety actions. Nothing the agent
  "says" is trusted as data — only tool calls are, and even those are filtered and (mostly) reviewed.

```
                ┌─────────────────────── ElevenLabs (the AI) ───────────────────────┐
                │  STT → LLM (system prompt + dynamic vars) → TTS, turn-taking       │
                └───▲───────────────────────────────────────────────────┬───────────┘
   read path        │ dynamic variables at session start                 │ client-tool calls
                    │                                                     ▼   (run ON the device)
  Supabase DB ─► snapshot tiers ─► buildSessionVariables ─► {{vars}}   agentTools.ts
  (RLS-guarded)     (cache)          (single producer)                    │
        ▲                                                                 ▼
        └──────────── HITL: nikki_proposals ── approve/auto-apply ── writes back ──┘  write path
```

### ADR-1: Why ElevenLabs instead of our own STT/LLM/TTS loop
- **Decision:** Use ElevenLabs Conversational AI for the whole voice loop; keep our logic as
  context-in / tools-out around it.
- **Why:** Real-time, low-latency, natural turn-taking (barge-in, backchannel) is extremely hard to
  build well. For a dementia audience, *feel* (warmth, patience, no awkward pauses) is the product.
  ElevenLabs gives a production-grade spoken agent out of the box; we spend our effort on the part
  that's actually ours — the personalization and the safe write-back.
- **Consequences:** The **system prompt and tool definitions live on the ElevenLabs dashboard**, not
  only in git. That's the single biggest "gotcha" for a new dev (see §4). We depend on their SDK for
  audio, which has some native quirks we work around (see §7).

---

## 3. The ElevenLabs integration in detail

### The agent
A single private agent named "Nikki" lives in the ElevenLabs workspace. It holds the **system
prompt** (the persona + rules) and references **dynamic variables** like `{{preferred_name}}`,
`{{today_schedule}}`, `{{support_guidance}}`. The prompt is versioned in `elevenlabs/agent.json` and
mirrored to the dashboard — **change both sides in the same PR**.

### Authentication (why the token edge function exists)
The agent is **private/authenticated**, so it can't be dialed by anyone with the agent id. The app
obtains a short-lived WebRTC **conversation token** from the Supabase Edge Function
`supabase/functions/elevenlabs-token`, which is the **only place the ElevenLabs API key exists**.
The function checks the caller's Supabase JWT and that they may view the requested elder
(`can_view_older_adult` RPC) before minting a token. Client → `getConversationToken()`
(`src/services/voiceSessionService.ts`) → edge function → token → `startSession({ conversationToken,
connectionType: "webrtc" })`.

### Dynamic variables (read path)
At session start the app passes a flat map of strings. `buildSessionVariables()`
(`src/features/voice/sessionVariables.ts`) is the **single producer** of that map. Variable names
must match the `{{...}}` placeholders in the dashboard prompt **exactly** — renaming one is a
two-sided change (prompt + `sessionVariables.ts` + its test). The full contract is tabulated in
`elevenlabs/README.md`.

### Client tools (write path)
Tools are **declared** on the dashboard (name + parameters) but **implemented on the device** in
`src/features/voice/agentTools.ts`, and passed into `startSession({ clientTools })`. When the model
decides to call a tool, ElevenLabs invokes our on-device function and feeds the **return string**
back to the model as an instruction (not user-facing text). Current tool set:

| Tool | Purpose |
|---|---|
| `lookup_person(name)` | Look someone up in the cached people list; returns guidance (incl. "do not discuss" for suppressed names). |
| `propose_fact(proposal_type, payload, source_quote, agent_note)` | File a pending row in `nikki_proposals` for the family to confirm — new people, plans, preferences, and **support notes** (how to help). Opinion-filtered + deduped. |
| `confirm_reminder(reminder_title)` | Elder says they did a reminder → log a confirmation. |
| `save_session_note(note)` | Nikki's **private** continuity note (admins never see it). |
| `save_session_recap(summary, changes)` | The shareable end-of-call recap (elder card + family feed). |
| `guide_to_safe_place(reason)` | Open a map to the nearest safe place + quietly alert family (only when physically lost). |
| `call_family_member(reason)` | Place a call to the family's main contact (used sparingly, with confirmation). |
| `open_event_directions(event_title)` | Open map directions to an event's location on request. |

### ADR-2: Why prompt + tool *definitions* live on the dashboard
- **Decision:** The persona prompt and the tool schemas are configured in the ElevenLabs dashboard;
  the repo keeps a mirror (`elevenlabs/`) as documentation and the tool *implementations*.
- **Why:** That's how ElevenLabs' platform works — the model, prompt, voice, and tool schema are
  agent config. Keeping the implementations on-device lets tools touch the local DB session, GPS,
  the dialer, and maps with the elder's own permissions.
- **Consequences:** If a value doesn't reach the model, the cause is often that the **live prompt
  doesn't reference the variable**, or a tool isn't declared on the dashboard. Always check the
  dashboard when behavior doesn't match the code. Keep `elevenlabs/agent.json` in sync.

---

## 4. Read path deep dive: context tiers → session variables

`src/features/voice/snapshot.ts` builds a **tiered snapshot** of everything Nikki might need, cached
per elder so a warm session start makes few/no network calls. Tiers and their cache TTLs:

- **identity** (60 min): the elder's profile (name, language/register, DOB).
- **day** (15 min): today's events, soon events (48h), reminders, weather advice.
- **world** (60 min): people, relationships, memories, emergency-contact names, support notes.
- **continuity** (60 s): recent private session notes, recent verbatim turns, digest topics. Short
  TTL because tools call `getSnapshotTiers` mid-conversation and must not pay a network roundtrip per
  call; a fresh session (>60s later) still rebuilds.

Cache invalidation: `src/features/sync/liveChannel.ts` subscribes to Supabase Realtime per elder and
marks the matching tier **dirty** when a watched table changes (`TABLE_TO_TIER`). TTL is the backstop.

**Gotcha worth knowing:** `ai_memory_items` (support notes) has weak realtime coverage and a 60-min
world TTL, so a note the family *just* added could be stale for a session. Because "how to help"
guidance is the product's core, `buildSessionVariables()` **reads support notes fresh** at every
session start (small query, fail-soft to the cached tier) instead of trusting the world cache. This
is a deliberate exception; keep it if you touch that area.

`buildSessionVariables()` turns tiers into the flat `{{variable}}` map: formats the schedule,
reminders, family summary, relationship graph, memories, `support_guidance`, recent turns, weather
(which follows the elder's real GPS location, falling back to the home safe-place town), etc. Each
formatter is a small pure function (unit-tested in `sessionVariables.test.ts`).

---

## 5. Write path deep dive: proposals & human-in-the-loop (HITL)

The elder can **never** write canonical family data directly. Everything Nikki "learns" goes through
`nikki_proposals` and is reviewed or auto-applied. `src/services/proposalService.ts` owns this.

1. **Create** — `createProposal()` runs the opinion/complaint filter
   (`src/features/voice/factFilter.ts`), dedupes against pending rows, and inserts a `pending` row
   (or queues offline). `propose_fact` in `agentTools.ts` resolves people **names → ids** on-device
   (the model never sees ids) before creating.
2. **Notify** — a single "Nikki has a question" push per conversation
   (`notifyAdminsOfProposal`), **except** for auto-applied types (see below).
3. **Apply** — an admin approves in the review UI (`approveAndApply()` writes the real record into
   `family_people`, `person_memories`, `calendar_events`, `reminders`, `ai_memory_items`, etc.), or
   the proposal is **auto-applied**.
4. **Auto-apply** — `AUTO_APPLY_TYPES` currently = `{ support_note }`. `autoApplyLowRiskProposals()`
   runs when an admin opens the dashboard and silently applies those. `isAutoAppliedProposal()` also
   suppresses the push for them, so support notes take effect quietly in the background.

### ADR-3: Elder can't write canonical data; support notes auto-apply, memories don't
- **Decision:** All AI-originated writes are proposals. Only low-risk "how to help" **support
  notes** apply without a tap; **memories and facts about people stay reviewed**.
- **Why:** Trust and safety. A dementia elder can be confused or misremember; a hallucinating model
  shouldn't be able to rewrite the family record or store an opinion about a relative. Support notes
  are care guidance (low blast radius) and are the feature that most needs to feel effortless, so
  they're the one exception — but the family can still see and edit/remove every one.
- **Consequences:** Two write lanes with different UX. The security boundary is enforced **at the
  tool layer**, not only by RLS (see §9).

### Recaps & continuity
- `save_session_recap` → `saveRecap()` stores a `session_recap` proposal row (informational, shown in
  the family "Conversations" feed and the elder's closing card; filtered once, shown identically).
- `save_session_note` → `saveSessionNote()` (`conversationService.ts`) stores a **private** note fed
  back next session as `{{recent_summary}}`.
- Every turn is persisted via `recordTurn()` for `{{recent_turns}}` continuity; old turns are pruned.

---

## 6. Voice session lifecycle (the trickiest client code)

`src/features/voice/useNikkiSession.ts` is the hook that owns a call. `VoiceExperience.native.tsx`
renders one `ConversationProvider` for the whole screen and the orb/captions. Phases:
`idle → preparing → connecting → live → closing → ended | error`.

Things that look odd but are load-bearing:

- **Audio settle + mic re-arm (`AUDIO_SETTLE_MS`, `restartPending`).** The native audio session is a
  process-global, un-refcounted singleton. Starting a new call while the previous one is still
  tearing down leaves the mic dead. We measure the teardown window from the actual end and wait out
  only the remaining slice, then toggle mute off→on on connect to re-arm capture on restarts.
- **`lastNativeEndAt` is module-global on purpose.** Switching Admin↔User (or leaving the tab)
  unmounts the screen; a per-instance timer would be lost and the next call would race the mic dead.
  Module scope survives the remount.
- **Graceful wrap-up on "Goodbye".** Tapping the goodbye button (or an idle timeout) doesn't hard-kill
  the call — it sends a silent contextual update ("save your note + recap, and any support note")
  plus a plain "Goodbye, Nikki.", shows a `closing` state, and lets the recap's auto-close finish
  (with a hard-timeout fallback; a second tap force-quits). This is why recaps/support notes actually
  get written even when the elder ends the call — the agent needs a turn to run its save tools.
- **Orb glow follows the elder's voice.** It polls `getInputVolume()` (real on RN over WebRTC) and
  lights the ring when *they* speak, not when Nikki does.
- **Idle auto-quit** ends a forgotten call after 2 min (billing + privacy).

### ADR-4: End the call from the client, not via a server "end call" tool
- **Decision:** Disable ElevenLabs' built-in "End conversation" tool; the client drives the close.
- **Why:** A server-initiated end skips the SDK's audio teardown (dead mic next call) **and** happens
  before our save tools run (no recap). Client-controlled close lets us guarantee the wrap-up and a
  clean teardown.
- **Consequences:** The "End conversation" system tool **must stay off** on the dashboard. See
  `hinikki-recap-writeback` note in the project memory.

---

## 7. Safety, reminders, notifications

- **Safety** (`app/admin/safety.tsx`, `src/features/safety/*`, `src/services/emergencyService.ts`,
  `locationService.ts`): safe places (map pin-picker) and emergency contacts (both hard-deletable,
  shared per family), the last-known location, and a recent-alerts feed. "Lost" and "Call family"
  can be triggered from the help screen or by Nikki via tools; "lost" opens a map to the nearest safe
  place and logs an `emergency_events` row; emergencies push the family (`notifyAdminsOfEmergency`).
  Alerts are marked handled (shared) or swiped to hide (per-admin, local). A "!" setup marker warns
  when a required safe place or contact is missing.
- **Reminders & events** (`src/features/notifications/scheduler.ts`): schedules on-device local
  notifications — reminders (lead offsets, once/daily/weekly/monthly) and events ("In 15 minutes:
  …"), localized to the elder's language. Push registration + fan-out live in
  `src/features/notifications/push.ts` and `src/services/pushService.ts`.

---

## 8. Data model & the security boundary

Postgres schema is in `supabase/migrations/*.sql` (start with `20260709120000_schema.sql`; the brain
tables are in `20260710120000_nikki_brain.sql`). Key tables: `older_adult_profiles`, `profiles`,
`admin_profiles`/`admin_older_adult_links`, `groups`/`group_members` (family pairing),
`family_people`, `family_relationships`, `person_memories`, `ai_memory_items` (incl. support notes),
`calendar_events`, `reminders`, `reminder_confirmations`, `safe_locations`, `emergency_contacts`,
`emergency_events`, `location_updates`, `weather_preferences`, `nikki_proposals`, `push_tokens`,
`pairing_codes`, and continuity tables for turns/notes.

### ADR-5: Two-layer trust — tool layer AND RLS
- **RLS** helper functions (`can_view_older_adult`, `can_manage_older_adult`, `is_self_older_adult`,
  …) gate every table. Admins with a link/group membership can manage; an elder (even an anonymous
  device session) can view and can insert only `nikki_proposals`.
- **But** some tables (`family_people`, `app_settings`, `older_adult_profiles`) are self-writable in
  RLS for setup flows, so the "elder can't rewrite the family record via Nikki" rule is **also**
  enforced at the tool layer: the only write tool an elder-side session exposes is `propose_fact`
  (proposals), never direct writes.
- **Consequences:** Don't "simplify" by letting a tool write a canonical row directly — that would
  bypass the HITL boundary. New AI-write features go through proposals.

Pairing is join-only via `pairing_codes` / `redeem_pairing_code`; families are `groups`.

---

## 9. Cross-cutting pieces

- **Realtime sync** (`src/features/sync/liveChannel.ts`): one shared channel per elder; payloads are
  **invalidation signals only** (row data discarded) so subscribed events can't smuggle hidden
  columns to the client. Screens refetch through explicit column lists. Adding a table to live sync =
  add it to `FILTERED_TABLES` **and** the Realtime publication (a migration).
- **i18n** (`src/i18n/*`): English + Dutch, split dictionaries per area. Dutch has a **register**
  distinction (formal "u" / informal "je"), locked per elder and reflected in Nikki's prompt.
  Any user-facing string is a key in both `en` and `nl`.
- **Design system** (`src/primitives`): `Screen`, `AppBar`, `Card`, `Stack`, `Button`, `Field`,
  `Text`, `Icon`, etc. Prefer these over raw RN views so spacing/typography/theme stay consistent.
- **Dev harness** (`src/features/dev/*`, `DevModeSwitch`): a developer-only switch to hop between
  families and the Admin/User roles on one device without losing work — a shared dev admin joins any
  family by code. Testing only; gated so it never ships to real users.
- **Platform files:** `VoiceExperience.native.tsx` vs `VoiceExperience.tsx` — Metro picks `.native`
  on device (real SDK) and the plain file on web (stub), so the ElevenLabs native SDK never reaches
  web builds.

---

## 10. Repository map

```
app/                       expo-router screens
  index.tsx, _layout.tsx   boot + root layout
  onboarding/              mode selection, admin auth, pairing (join-only)
  admin/                   dashboard, people, schedule, safety, settings (+ _layout tabs)
  user/                    nikki (the call), people, help (+ _layout tabs)
src/
  auth/appState.tsx        session/role/boot state (elder anon session, admin, group)
  features/
    voice/                 snapshot.ts, sessionVariables.ts, agentTools.ts, useNikkiSession.ts,
                           factFilter.ts, personPhotos.ts, micPermission.ts
    safety/                locationCapture, homeDestination (nearest safe place), hiddenAlerts
    notifications/         scheduler (local pings), push (registration/fan-out)
    sync/liveChannel.ts    realtime invalidation
    dev/                   dev-only family/role switch
  services/                DB access, one module per domain (see below)
  primitives/              design-system components
  i18n/                    en + nl dictionaries
  types/                   database + domain types
  lib/, utils/, storage/   supabase client, feature flags, formatting, local storage
supabase/
  functions/elevenlabs-token/   mints the WebRTC token (only place the EL key lives)
  migrations/                    schema + RLS + realtime publication
elevenlabs/                agent.json (prompt snapshot) + README (variable/tool contract)
docs/                      this file + plans/nikki-brain.md
```

**Services (`src/services`) as the write lanes:** `profileService`, `peopleService`,
`calendarService`, `reminderService`, `memoryService` (incl. support notes), `locationService`,
`emergencyService`, `conversationService` (turns/notes/recaps), `proposalService` (HITL),
`pushService`, `voiceSessionService` (token), `weatherService`, `groupService`, `pairingService`.
All DB access goes through a service — screens don't hit Supabase directly.

---

## 11. Running, building, and the sync rule

- Setup, running, and EAS build instructions: `DEVELOPMENT.md`.
- ElevenLabs one-time setup (create agent, enable auth, declare tools, set function secrets,
  push the brain migration): `elevenlabs/README.md` §Setup.
- **The two-sided rule:** any change to the persona prompt, dynamic-variable names, or tool schemas
  must be made in **both** the ElevenLabs dashboard **and** `elevenlabs/` in the same PR. The dashboard
  is the source of truth at runtime; the repo copy is for review and for `sessionVariables.ts` /
  `agentTools.ts` to line up against.
- Google Maps key: never committed — injected via `app.config.js` from env / EAS secret
  (`GOOGLE_MAPS_ANDROID_KEY`). iOS uses Apple Maps (free). react-native-maps changes require an EAS
  rebuild.

---

## 12. Where to be careful (the short list)

1. **Behavior not matching code?** Check the **ElevenLabs dashboard** first — prompt missing a
   `{{variable}}`, tool not declared, or the "End conversation" tool left on.
2. **Don't let a tool write a canonical row directly** — go through `nikki_proposals` (§5/§8).
3. **Opinions never persist** — the `factFilter` net is layer 2; the prompt is layer 1; the reviewer
   is layer 3. Keep all three.
4. **Voice audio quirks** are worked around deliberately in `useNikkiSession.ts` (settle delay,
   module-global end clock, client-side close). Read the comments before "cleaning up".
5. **i18n + register:** new strings need `en` + `nl`; respect the elder's u/je register.
6. **Adding a table to live sync** needs both the client list and a publication migration.
7. Elder-facing copy is warm and non-clinical by design — no "database/app/reminder system/dementia".

---

## 13. Suggested reading order for the new dev

1. This file, then `docs/plans/nikki-brain.md` §0 (decisions) and §0.6/§0.7 (integration reality).
2. `elevenlabs/README.md` + `elevenlabs/agent.json` — the persona and the contracts.
3. Trace one call: `app/user/nikki.tsx` → `VoiceExperience.native.tsx` → `useNikkiSession.ts` →
   `sessionVariables.ts` (+ `snapshot.ts`) for the read path, and `agentTools.ts` →
   `proposalService.ts` for the write path.
4. Trace one review: `app/admin/dashboard.tsx` (proposals + recaps + auto-apply) and
   `app/admin/safety.tsx`.
5. Skim `supabase/migrations/20260709120000_schema.sql` for the data model + RLS helpers.
