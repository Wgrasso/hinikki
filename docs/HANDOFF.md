# HiNikki — Handoff & Architecture

A guide for the next engineer taking over HiNikki. It explains **what the system is**, **why the
big pieces are the way they are**, and **how they're actually built** — deep enough to change things
safely. Read it top to bottom once; after that use it as a map. File paths are given so you can jump
straight to the code.

Companion docs (don't duplicate, cross-reference):
- `elevenlabs/README.md` — the exact agent config, dynamic-variable contract, and client-tool
  declarations that must match the ElevenLabs dashboard.
- `elevenlabs/agent.json` — the versioned snapshot of the agent's prompt + settings.
- `docs/plans/nikki-brain.md` — the original design plan (deeper rationale, decision log).
- `DEVELOPMENT.md` — how to run, build (EAS), and configure keys.

---

## 1. What HiNikki is

A warm voice companion for older adults living with dementia, plus a family-facing admin app. One
codebase, **two experiences**:

- **Elder app** (`app/user/*`): a single big "Talk to Nikki" button, a simple schedule/people view,
  a help screen. Minimal choices, large targets, warm copy, no jargon.
- **Family/admin app** (`app/admin/*`): manage people, schedule, reminders, safe places, emergency
  contacts, review what Nikki learned, read conversation recaps.

**Stack:** Expo / React Native + TypeScript (`expo-router` file-based routing), Supabase (Postgres +
Auth + Realtime + Edge Functions + Storage), and **ElevenLabs Conversational AI** for the voice
loop. UI is plain React with a small design system in `src/primitives`.

---

## 2. The core idea: one AI, a "brain" around it

Nikki's intelligence is **not** in this codebase. The conversation (STT → LLM → TTS, turn-taking,
interruption) runs **inside ElevenLabs**. We build the **brain around it**: what makes a generic
voice model behave like *this* person's companion, and what turns a conversation into safe, durable
data the family can act on.

- **Read path (context in):** assemble what Nikki should know *right now* and inject it at session
  start as dynamic variables.
- **Write path (facts out):** during/after a call the agent calls **client tools** that run on the
  device; those propose facts, save notes/recaps, or trigger safety actions. Nothing the agent
  *says* is trusted as data — only tool calls, and even those are filtered and mostly reviewed.

```
                ┌─────────────────────── ElevenLabs (the AI) ───────────────────────┐
                │  STT → LLM (system prompt + dynamic vars) → TTS, turn-taking       │
                └───▲───────────────────────────────────────────────────┬───────────┘
   read path        │ dynamic variables at session start                 │ client-tool calls
                    │                                                     ▼   (run ON the device)
  Supabase DB ─► snapshot tiers ─► buildSessionVariables ─► {{vars}}   agentTools.ts
  (RLS-guarded)     (RAM+disk)       (single producer)                    │
        ▲                                                                 ▼
        └──────────── HITL: nikki_proposals ── approve/auto-apply ── writes back ──┘  write path
```

### ADR-1: Why ElevenLabs instead of our own STT/LLM/TTS loop
- **Decision:** Use ElevenLabs Conversational AI for the whole voice loop; our code is context-in /
  tools-out around it.
- **Why:** Low-latency, natural turn-taking (barge-in, backchannel) is very hard to build well, and
  for a dementia audience the *feel* is the product. We spend effort on the part that's ours — the
  personalization and safe write-back.
- **Consequences:** The **system prompt and tool definitions live on the ElevenLabs dashboard**, not
  only in git (see §4). We depend on their SDK for audio, which has native quirks we work around
  (§7).

---

## 3. The ElevenLabs integration, and where context lives

### The agent
One private agent ("Nikki") in the ElevenLabs workspace holds the **system prompt** (persona + rules)
which references **dynamic variables** like `{{preferred_name}}`, `{{today_schedule}}`,
`{{support_guidance}}`. The prompt is versioned in `elevenlabs/agent.json` and mirrored to the
dashboard — **change both sides in the same PR**.

### Authentication (why the token edge function exists)
The agent is private/authenticated. The app gets a short-lived WebRTC **conversation token** from
the Supabase Edge Function `supabase/functions/elevenlabs-token` — the **only place the ElevenLabs
API key exists**. It verifies the caller's Supabase JWT and that they may view the elder
(`can_view_older_adult` RPC) before minting a token. Client path:
`getConversationToken()` (`src/services/voiceSessionService.ts`) → edge function → token →
`conversation.startSession({ conversationToken, connectionType: "webrtc" })` in
`useNikkiSession.ts`.

### Where the context actually lives (four places, one direction)
1. **Source of truth: the Supabase DB** (RLS-guarded tables). Nothing Nikki knows exists only in
   memory — it all originates here.
2. **Assembled: the snapshot cache** (`src/features/voice/snapshot.ts`). A **module-global**
   `const cache = new Map<olderAdultId, CacheEntry>()` holds the tiered snapshot in RAM, and it's
   also **persisted to AsyncStorage per elder** (`persist()` / `loadPersisted()`, keyed by
   `storageKey(olderAdultId)`). So a cold app start has last-known context instantly (fail-soft to
   empty tiers), and a warm voice start makes few/no network calls.
3. **Shaped: `buildSessionVariables()`** (`src/features/voice/sessionVariables.ts`) turns the tiers
   into a **flat `Record<string,string>`** of `{{variable}}` values.
4. **Delivered: the model, per session only.** `startSession({ dynamicVariables })` hands that map
   to ElevenLabs, which substitutes it into the dashboard prompt for **that call**. The model holds
   no persistent memory between calls — continuity comes from us re-injecting `{{recent_turns}}` /
   `{{recent_summary}}` each session (persisted via `conversationService.ts`).

So the flow is strictly **DB → snapshot (RAM+disk) → flat vars → session prompt**. If a value is
wrong in a call, it's one of those four layers (usually a stale tier or a dashboard prompt missing
the placeholder).

### How to build a client tool (concrete recipe)
Tools are **declared** on the dashboard (schema) but **implemented on the device** (behavior). To add
one, e.g. `note_mood(mood)`:

1. **Declare on the dashboard:** Agent → Tools → add a *client* tool named `note_mood` with a string
   parameter `mood`. The **name and parameter names must match** what your code reads. (Parameters
   are effectively untyped JSON at the boundary — validate on-device.)
2. **Implement on-device** in `src/features/voice/agentTools.ts`, inside `makeAgentTools()`'s `tools`
   object:
   ```ts
   note_mood: async (parameters: unknown): Promise<string> => {
     const p = asParams(parameters);              // safe object cast
     const mood = asString(p.mood);               // trimmed non-empty string or null
     if (!mood) return "No mood given.";          // return = instruction to the model
     // ...do the work (usually via a service or a proposal)...
     return "Noted for the family. Say at most 'I'll make a note of that'.";
   },
   ```
3. **The return string is fed back to the model as an instruction**, not spoken to the user. Keep it
   short and directive (what to say / not say). This is how we keep Nikki from narrating mechanics.
4. **Wiring is automatic:** `useNikkiSession.begin()` passes `clientTools: toolSet.tools` to
   `startSession`. Any key you add to the `tools` object is callable once it's declared on the
   dashboard — no other registration.
5. **Follow the conventions:**
   - Resolve spoken **names → ids on-device** (`resolvePerson` / `resolveReminder`); the model never
     sees ids, and ambiguity returns a "ask which one" string instead of guessing.
   - **Writes go through proposals** (`createProposal`), not direct table writes (see §5/§8).
   - Run text through the **opinion filter** where relevant (`factFilter.ts`).
   - **Per-conversation state** (the recap `changes` list, the one-push budget `pushSent`, the
     offline `conversationKey`) lives in the `makeAgentTools` closure and is cleared by `reset()`,
     which `begin()` calls at the start of every call.
6. **Mirror it** in `elevenlabs/README.md` + `elevenlabs/agent.json` (two-sided rule).

### ADR-2: Why prompt + tool *definitions* live on the dashboard
- **Decision:** Persona prompt and tool schemas are configured in the dashboard; the repo keeps a
  mirror (`elevenlabs/`) plus the tool *implementations*.
- **Why:** That's the platform model (model/prompt/voice/tool schema are agent config). Keeping
  implementations on-device lets tools use the local DB session, GPS, the dialer, and maps with the
  elder's own permissions.
- **Consequences:** When behavior doesn't match code, suspect the dashboard first (missing
  `{{variable}}`, undeclared tool, or the "End conversation" tool left on). Keep `agent.json` synced.

---

## 4. Read path deep dive: context tiers → session variables

`snapshot.ts` builds a **tiered snapshot** cached per elder. Each tier has its own TTL and refreshes
independently:

- **identity** (60 min): profile (name, language/register, DOB).
- **day** (15 min): today's events, soon events (48h), reminders, weather advice.
- **world** (60 min): people, relationships, memories, emergency-contact names, support notes.
- **continuity** (60 s): recent private session notes, recent verbatim turns, digest topics. Short
  because tools call `getSnapshotTiers` mid-call and must not pay a network roundtrip per call; a
  fresh session (>60s later) still rebuilds.

`getSnapshotTiers()` returns cached tiers immediately and refreshes any tier that is **dirty** (a
realtime event via `liveChannel`, mapped by `TABLE_TO_TIER`) or **past its TTL**. Results are
persisted so the next cold start is warm.

**Deliberate exception:** `ai_memory_items` (support notes) has weak realtime coverage + a 60-min
world TTL, so a just-added note could be stale for a session. Because "how to help" guidance is the
product's core, `buildSessionVariables()` **reads support notes fresh** every session start (small
query, fail-soft to the cached tier). Keep that if you touch the area.

`buildSessionVariables()` is the single place tiers become the flat `{{...}}` map — schedule,
reminders, family summary, relationship graph, memories, `support_guidance`, recent turns, weather
(follows the elder's real GPS, falling back to the home safe-place town). Each formatter is a small
pure function, unit-tested in `sessionVariables.test.ts`. The full variable list is in
`elevenlabs/README.md`; **renaming one is a two-sided change** (prompt + `sessionVariables.ts` +
test).

---

## 5. Write path deep dive: proposals & human-in-the-loop (HITL)

The elder can **never** write canonical family data directly. Everything Nikki "learns" goes through
`nikki_proposals`. `src/services/proposalService.ts` owns this.

1. **Create** — `createProposal()` runs the opinion/complaint filter (`factFilter.ts`), dedupes
   against pending rows, inserts a `pending` row (or queues to AsyncStorage offline). `propose_fact`
   resolves names→ids first.
2. **Notify** — one "Nikki has a question" push per conversation (`notifyAdminsOfProposal`), **except
   auto-applied types**.
3. **Apply** — an admin approves (`approveAndApply()` writes the real record into `family_people`,
   `person_memories`, `calendar_events`, `reminders`, `ai_memory_items`, …), or it's auto-applied.
4. **Auto-apply** — `AUTO_APPLY_TYPES = { support_note }`. `autoApplyLowRiskProposals()` runs when an
   admin opens the dashboard; `isAutoAppliedProposal()` also suppresses the push for those.

### ADR-3: Elder can't write canonical data; support notes auto-apply, memories don't
- **Decision:** All AI-originated writes are proposals; only low-risk **support notes** apply without
  a tap; memories and facts about people stay reviewed.
- **Why:** Trust/safety — a confused elder or a hallucinating model must not rewrite the family
  record or store an opinion. Support notes are low-blast-radius care guidance and the feature that
  most needs to feel effortless, so they're the one exception (still visible/editable by family).
- **Consequences:** Two write lanes; the boundary is enforced at the **tool layer** *and* RLS (§8).

**Recaps/continuity:** `save_session_recap` → `saveRecap()` stores a `session_recap` proposal (the
family feed + elder card); `save_session_note` → private note fed back as `{{recent_summary}}`; every
turn is persisted via `recordTurn()` for `{{recent_turns}}`.

---

## 6. Voice session lifecycle (the trickiest client code)

`src/features/voice/useNikkiSession.ts` owns a call; `VoiceExperience.native.tsx` renders one
`ConversationProvider` for the whole screen. Phases:
`idle → preparing → connecting → live → closing → ended | error`.

Load-bearing oddities (read the comments before "cleaning up"):
- **Audio settle + mic re-arm.** The native audio session is a process-global, un-refcounted
  singleton; starting a call mid-teardown kills the mic. We wait out the remaining teardown window
  and toggle mute off→on on restart connects.
- **`lastNativeEndAt` is module-global** so it survives the screen unmount that Admin↔User switching
  causes (a per-instance timer would be lost → mic dead).
- **Graceful wrap-up on "Goodbye"** sends a silent contextual update ("save note + recap + any
  support note") plus "Goodbye, Nikki.", shows a `closing` state, and lets the recap auto-close
  finish (hard-timeout fallback; second tap force-quits). This is why recaps/support notes get
  written even when the elder ends the call.
- **Orb glow follows the elder's voice** via `getInputVolume()` polling.
- **Idle auto-quit** ends a forgotten call after 2 min.

### ADR-4: End the call from the client, not a server "end call" tool
- **Decision:** Disable ElevenLabs' "End conversation" tool; the client drives the close.
- **Why:** A server end skips audio teardown (dead mic next call) and runs before our save tools (no
  recap). Client close guarantees the wrap-up and clean teardown.
- **Consequences:** That system tool **must stay off** on the dashboard.

---

## 7. Safety, reminders, notifications

- **Safety** (`app/admin/safety.tsx`, `src/features/safety/*`, `emergencyService.ts`,
  `locationService.ts`): safe places + emergency contacts (both hard-deletable, shared per family),
  last-known location, recent-alerts feed. "Lost"/"Call family" fire from the help screen or Nikki's
  tools; "lost" opens a map to the nearest safe place and logs `emergency_events`; emergencies push
  family. Alerts are marked handled (shared) or swiped-hidden (per-admin, local). A "!" marks missing
  required setup.
- **Reminders & events** (`src/features/notifications/scheduler.ts`): on-device local notifications —
  reminders (lead offsets, once/daily/weekly/monthly) and events ("In 15 minutes: …"), localized.
  Push registration/fan-out in `notifications/push.ts` + `services/pushService.ts`.

---

## 8. Data model & security (how the trust boundary is built)

### Identities and how a request is authorized
- **Admin** = Supabase **email/password** (`profileService.signUp`/`signInWithPassword`).
- **Elder** = Supabase **anonymous auth** (`supabase.auth.signInAnonymously()` in
  `ensureAnonSession`) plus a `profiles` row; `create_older_adult_for_self` RPC creates the
  `older_adult_profiles` row **owned by that anon profile** (`owner_profile_id`).
- Every RLS check funnels through **`get_current_profile_id()`** — `select id from profiles where
  auth_user_id = auth.uid()` — a `SECURITY DEFINER` function with `set search_path = public` (so it
  can't be subverted by a hijacked search_path and doesn't recurse through RLS).

### The permission helpers (all `SECURITY DEFINER`, build on the above)
- `is_self_older_adult(oa)` — the current profile owns that older adult (`owner_profile_id` match).
- `is_admin_linked_to_older_adult(oa)` — there's an **active** `admin_older_adult_links` row joining
  this admin profile to the elder.
- `can_manage_older_adult(oa)` — as above **and** `permission_level in (owner, family_admin,
  caregiver)`.
- `can_view_older_adult(oa)` — `is_self_older_adult OR is_admin_linked_to_older_adult`.

### The policy pattern
Almost every table has two policies:
```sql
create policy "view X"   on X for select using (can_view_older_adult(older_adult_id));
create policy "manage X" on X for all
  using (can_manage_older_adult(older_adult_id))
  with check (can_manage_older_adult(older_adult_id));
```
So **admins manage, linked viewers read**. `for all` includes DELETE — which is why the shared hard
deletes for safe places / contacts (§7) work for admins.

### The elder write boundary (the important one)
`nikki_proposals` is the escape hatch. Its insert policy is the crux:
```sql
create policy "self insert proposals" on nikki_proposals for insert with check (
  is_self_older_adult(older_adult_id)
  and status in ('pending','fyi')
  and ((status = 'fyi') = (proposal_type = 'session_recap'))   -- status↔type coupling
  and decline_reason is null and review_note is null
  and reviewed_by_admin_id is null and reviewed_at is null      -- no forged audit trail
);
```
An elder session may insert **only** clean `pending` facts or `fyi` recaps, never pre-filled review
fields and never a self-approved fact. Updates require `can_manage`; deletes (`erase proposals`)
require `can_manage` too (so a stored insult can be removed). The elder can't approve anything.

### ADR-5: Two-layer trust — tool layer AND RLS
- **Decision:** Enforce "Nikki can't rewrite the family record" at **both** the tool layer and RLS.
- **Why:** Some tables (`family_people`, `app_settings`, `older_adult_profiles`) are **self-writable
  in RLS** for the elder's own setup flows. So RLS alone wouldn't stop a voice-driven direct write —
  the guarantee also comes from the **elder-side session only exposing `propose_fact`** (proposals),
  never direct-write tools, in `agentTools.ts`.
- **Consequences:** Don't add a tool that writes a canonical row directly — route new AI writes
  through proposals, or you punch a hole in the boundary.

### Pairing
Families are `groups`; joining is code-based via the pairing RPCs (`generate_pairing_code` /
`redeem_pairing_code`). The **raw code is never stored** (only created/redeemed through the RPCs),
and pairing is join-only. Continuity tables store turns/notes; `push_tokens` holds one row per device
and is readable by the elder device scoped to **active** admin links (so revoked caregivers stop
receiving pushes).

---

## 9. Cross-cutting systems (how they're built)

### Realtime sync — `src/features/sync/liveChannel.ts`
- **One channel per elder**, `oa-<id>`, **ref-counted**: `subscribeLive(id, listener)` returns an
  unsubscribe; an `entries` Map tracks listeners + refs; when refs hit 0 the channel is
  `removeChannel`d. Many screens share one websocket.
- `openChannel` registers `postgres_changes` listeners for each `FILTERED_TABLES` × `{INSERT,UPDATE}`
  with `filter: older_adult_id=eq.<id>`, plus `older_adult_profiles` by `id=eq.<id>`, plus **coarse
  DELETE** listeners on every table (DELETE payloads carry only the PK and aren't RLS-scoped, so any
  delete → `notify("*")` = mark everything stale).
- **Payloads are invalidation signals only** — the row data is discarded. Screens and the snapshot
  refetch through their **explicit column lists**, so a subscribed event can never smuggle a hidden
  column (e.g. an admin-only note) to a client that shouldn't see it. RLS still filters which events
  each session receives.
- **To add a table to live sync:** add it to `FILTERED_TABLES` (client), add it to the
  `supabase_realtime` **publication** (a migration), and map it in `TABLE_TO_TIER` if it should
  invalidate a snapshot tier. (Miss the publication and no events fire; miss the mapping and the
  snapshot won't rebuild.)

### i18n — `src/i18n/index.tsx` + `dict/*`
- Each dict module exports `{ en, nl }`; at module load they're **merged into one flat map per
  language**. `useT()` resolves the current language from context: **user mode** → the elder's
  `profile.primary_language` (`nl*` → `nl`), **admin mode** → the admin's device preference
  (`localStore`). `t(key, params)` does `merged[lang][key] ?? merged.en[key] ?? key`, then `{param}`
  interpolation. Every user-facing string is a key in **both** `en` and `nl`.
- The Dutch **register** (formal "u" / informal "je") is **not** an app-UI concern — it's a **dynamic
  variable in Nikki's prompt** derived from `primary_language` (`nl` vs `nl-informal`). The app dict
  is just `en`/`nl`.

### Design system — `src/primitives` + `src/theme`
Themed components (`Screen`, `AppBar`, `Card`, `Stack`, `Button`, `Field`, `Text`, `Icon`, …). Prefer
these over raw RN views so spacing/typography/theme stay consistent.

### Data loading — `src/utils/useAsync`
Screens load through `useAsync(fn, deps)` (stale-while-refresh) and call `reload()` on focus
(`useFocusEffect`) and on live changes (`subscribeLive`). Services never get called from render
bodies directly.

### Platform-specific files
Metro resolves `*.native.tsx` on device and the plain `*.tsx` on web. `VoiceExperience.native.tsx`
uses the real ElevenLabs SDK; `VoiceExperience.tsx` is a web stub — so the native SDK never bundles
for web.

### Dev harness — `src/features/dev/*`, `DevModeSwitch`
A developer-only overlay to hop between families and the Admin/User roles on one device without
losing work (a shared dev admin joins any family by code). Gated so it never ships to real users.

---

## 10. How the app is wired (routing, boot, layering)

### Routing (expo-router, file = route)
```
app/_layout.tsx            root providers (AppState, Language) wrap everything
app/index.tsx              boot gate → redirects by resolved state
app/onboarding/*           mode selection, admin auth, join-only pairing
app/admin/_layout.tsx      admin tab bar (dashboard/people/schedule/safety/settings) + badges
app/admin/*                the admin screens
app/user/_layout.tsx       elder tab bar (nikki/people/help)
app/user/*                 the elder screens
```
Navigation is `router.push` / `router.replace`. Tab badges (e.g. the safety "!", pending-proposal
count) are computed in the `_layout` files from small hooks.

### Boot flow
`AppStateProvider` (`src/auth/appState.tsx`) computes boot state via **`resolveBootState(deps)`** — a
**pure async function** with injected `BootDeps` (so it's unit-tested in
`appState.rehydrate.test.tsx` with no real Supabase). It reads the persisted mode + the current
Supabase session and yields `{ status, mode, olderAdultId, groupId, joinCode }`. `app/index.tsx`
routes off that: no mode → onboarding; user mode → `app/user`; admin mode → `app/admin`.
`completeSetup` / `completeSetupWithGroup` persist the chosen mode + ids after pairing.

### Layering (the dependency direction)
```
app/ (screens)  →  src/features/* (domain logic)  →  src/services/* (all DB access)  →  src/lib (supabase client)
                                                       ↑ src/types (DB + domain types)
```
- **Screens never touch Supabase directly** — they call a service. That keeps RLS-shaped queries and
  explicit column lists in one place per domain.
- **Services** are the write lanes: `profileService`, `peopleService`, `calendarService`,
  `reminderService`, `memoryService` (incl. support notes), `locationService`, `emergencyService`,
  `conversationService` (turns/notes/recaps), `proposalService` (HITL), `pushService`,
  `voiceSessionService` (token), `weatherService`, `groupService`, `pairingService`.
- **`src/features/*`** hold cross-service domain logic: `voice` (snapshot, session variables, tools,
  session hook), `safety`, `notifications`, `sync`, `dev`.
- **State** is plain React context — `AppStateProvider` (session/role) and `LanguageProvider`
  (i18n) — plus `useAsync` for per-screen data. No Redux/MobX.

---

## 11. Running, building, and the sync rule

- Running + EAS builds: `DEVELOPMENT.md`.
- ElevenLabs one-time setup (create agent, enable auth, declare tools, set function secrets, push the
  brain migration): `elevenlabs/README.md` §Setup.
- **Two-sided rule:** any change to the persona prompt, dynamic-variable names, or tool schemas must
  land in **both** the dashboard **and** `elevenlabs/` in the same PR. The dashboard is the runtime
  source of truth; the repo copy is for review and for `sessionVariables.ts` / `agentTools.ts` to
  line up against.
- Google Maps key: never committed — injected via `app.config.js` from env / EAS secret
  (`GOOGLE_MAPS_ANDROID_KEY`). iOS uses Apple Maps (free). `react-native-maps` changes need an EAS
  rebuild.

---

## 12. Where to be careful

1. **Behavior not matching code?** Check the **ElevenLabs dashboard** first — missing `{{variable}}`,
   undeclared tool, or the "End conversation" tool left on.
2. **Never let a tool write a canonical row directly** — go through `nikki_proposals` (§5/§8).
3. **Opinions never persist** — the `factFilter` net is layer 2; the prompt is layer 1; the reviewer
   is layer 3. Keep all three.
4. **Voice audio quirks** are worked around deliberately in `useNikkiSession.ts` — read the comments.
5. **i18n + register:** new strings need `en` + `nl`; respect the elder's u/je register.
6. **Adding a live-sync table** needs the client list, the publication migration, and the tier map.
7. **Elder-facing copy** is warm and non-clinical by design — no "database/app/reminder
   system/dementia".

---

## 13. Suggested reading order

1. This file, then `docs/plans/nikki-brain.md` §0 (decisions) and §0.6/§0.7 (integration reality).
2. `elevenlabs/README.md` + `elevenlabs/agent.json` — the persona and the contracts.
3. Trace one call: `app/user/nikki.tsx` → `VoiceExperience.native.tsx` → `useNikkiSession.ts` →
   `sessionVariables.ts` (+ `snapshot.ts`) for read, and `agentTools.ts` → `proposalService.ts` for
   write.
4. Trace one review: `app/admin/dashboard.tsx` (proposals + recaps + auto-apply) and
   `app/admin/safety.tsx`.
5. Skim `supabase/migrations/20260709120000_schema.sql` for the data model + RLS helpers, then
   `20260710120000_nikki_brain.sql` for the proposal/push layer.
