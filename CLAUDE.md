# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

HiNikki: one Expo (React Native + TypeScript) app, two routed experiences sharing a single codebase:
- **User mode** (the older adult): 3 destinations — Nikki (home + voice conversation + today + weather), People, Help.
- **Admin mode** (family/caregiver): 5 destinations — Dashboard, People, Schedule, Safety, Settings.

Mode is chosen at onboarding and persisted; `src/auth/appState.tsx` resolves which router tree (`app/user/` or `app/admin/`) to boot into.

## Overall goal

HiNikki's target product is a single iOS + Android app, one codebase, built around a **voice** agent
(Nikki) for people living with dementia. Nikki should be spoken to, not just texted — she orients the
person in their day (schedule, routine) and helps them remember family members, by voice. There are two
user personas:
- **The person with dementia** — talks to Nikki by voice to get reminders about their day and help
  recognizing/recalling family.
- **The family member / caregiver** — the one who supplies the underlying information: creating
  calendar events, adding/describing family members, etc.

Voice **is** the primary interaction now: the older adult talks to Nikki through ElevenLabs
Conversational AI (see the Nikki voice section below). The earlier text-chat MVP (keyword intent
detection, mock reply engine, typed chat UI, `chat_interactions` persistence) was removed in July
2026 — the agent's language understanding, persona, transcripts, and safety behavior live on the
ElevenLabs platform; the app supplies identity, per-user context, and the voice UI.

`docs/HANDOFF.md` is the deep architecture/handoff doc (read path, write path, RLS trust boundary,
ADRs, and a "problems we hit" war-stories section) — this file stays intentionally higher-level;
read HANDOFF before making a non-trivial change to the voice/data layers.

## Commands

```bash
npm install                  # .npmrc sets legacy-peer-deps (ElevenLabs/LiveKit peer-dep skew)
npx expo start --dev-client  # daily loop: JS hot-reloads into the installed dev build
npx expo start               # web still works for ADMIN-mode UI only (voice + the map location picker show a fallback)
npx tsc --noEmit             # type-check (strict mode, must be clean)
npm test                     # Jest + jest-expo
npx jest src/utils/format.test.ts   # run a single test file
npx jest -t "test name"      # run tests matching a name
```

There is no lint script configured.

**Expo Go no longer runs this app.** The ElevenLabs RN SDK depends on LiveKit's native WebRTC
module, so the team uses an EAS **development build** as its dev app (same QR-scan workflow):

```bash
eas build --profile development --platform android   # installable APK, low friction
eas build --profile development --platform ios       # needs the device UDID registered first (eas device:create)
```

JS/TS changes hot-reload without rebuilding. Rebuild the dev client only when native inputs
change: adding/upgrading a native dependency, editing `app.json` plugins/permissions, or an Expo
SDK upgrade. (`README.md`'s "Run it" / "Maps" / "New phone joining the team" / "Ship it: production
build → TestFlight" sections are the plain-language version of this workflow for the team — keep
them in sync when the workflow changes. `DEVELOPMENT.md` no longer exists; it was merged into
`README.md`.)

## Architecture

### Demo-first, dual-backend pattern (the most important thing to understand)

Every service in `src/services/*.ts` follows the same shape:

```ts
if (!supabase) {
  // read/write the in-memory + AsyncStorage-backed demo store (src/data/demoDb.ts)
} else {
  // real Supabase query/RPC
}
```

`supabase` (`src/lib/supabase.ts`) is `null` whenever `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` aren't set (`HAS_SUPABASE` in `src/lib/constants.ts`). This lets the
whole app run with zero backend using realistic seeded data (`src/data/demo.ts` → seeded into
`src/data/demoDb.ts`, mutated via `mutateDemo()`, persisted to `AsyncStorage`). **When adding or
changing a service function, implement both branches** — the demo branch isn't a stub, it's a fully
walkable parallel implementation.

**The one deliberate exception is voice.** A live conversational agent can't be faked client-side,
so the voice surface additionally requires the real backend + ElevenLabs (`HAS_VOICE` in
`src/lib/constants.ts`: Supabase configured **and** a native platform). In demo mode and on web the
Nikki screen shows a calm "voice isn't set up" state instead of the talk button — do not build a
fake voice simulator, and do not remove existing demo branches elsewhere.

### Auth & identity

- Admins: email/password. Older adults: anonymous Supabase auth (no login wall).
- Pairing is bidirectional via a 6-digit code, hashed server-side, redeemed through `SECURITY
  DEFINER` RPCs (`generate_pairing_code` / `redeem_pairing_code` in `src/services/pairingService.ts`)
  — raw codes are never stored or queryable server-side.
- `src/auth/appState.tsx` owns boot resolution: restore session → selected mode → linked profile →
  route. `resolveBootState()` is a pure function over an injected `BootDeps` (exported for unit
  testing without mocking modules) — if the session is active but the local link is missing, it
  re-derives identity from the server via `getMyGroup()` and re-persists locally.
- Session tokens live in `expo-secure-store`, chunked at 1800 bytes (`secureChunkStorage` in
  `src/lib/supabase.ts`) because SecureStore has a ~2KB per-value limit — never store session data in
  plain `AsyncStorage`.
- `src/storage/localStore.ts` holds only small, non-secret local state (selected mode, linked id,
  onboarding flag, device id), always with validated reads and safe defaults.

### Nikki voice (ElevenLabs Conversational AI)

The agent (persona, language understanding, TTS/ASR, transcripts) lives on the ElevenLabs platform;
`elevenlabs/agent.json` is the versioned snapshot of its config (see `elevenlabs/README.md` for the
dynamic-variable contract, the full 8-tool client-tool table, and one-time setup). **Known gap**
(tracked in `elevenlabs/README.md` Setup §7): the live prompt's "YOUR TOOLS" block in `agent.json`
never mentions `guide_to_safe_place` / `call_family_member` by name, so the persona isn't actually
told to call them even though the tools themselves work — a prompt update + dashboard mirror is
needed before voice-triggered safety escalation can be relied on. App-side pieces:

- `supabase/functions/elevenlabs-token/` — the ONLY place the ElevenLabs API key is used. Verifies
  the caller's Supabase JWT, authorizes via `can_view_older_adult`, mints a short-lived WebRTC
  conversation token for the **private** agent. The key is a function secret, never in the bundle.
- **Read path** — `src/features/voice/snapshot.ts` holds a tiered, per-elder context cache
  (`identity`/`day`/`world`/`continuity`, each its own TTL, in RAM + persisted to AsyncStorage so a
  cold start still has last-known context). `src/features/voice/sessionVariables.ts`'s
  `buildSessionVariables()` is the single place tiers get flattened into the ElevenLabs
  `{{variable}}` map (schedule, mentionable family, relationships, memories, weather,
  `support_guidance`, recent turns, emergency-contact **names**). Data minimization: phone numbers
  and street addresses never leave the device. Renaming/adding a variable is a two-sided change:
  `elevenlabs/agent.json` (or the dashboard) **and** `sessionVariables.ts` (+ its tests).
- **Write path** — the elder can never write canonical data directly. Client tools in
  `src/features/voice/agentTools.ts` (`propose_fact`, `lookup_person`, `confirm_reminder`,
  `save_session_note`, `save_session_recap`, `guide_to_safe_place`, `call_family_member`,
  `open_event_directions`, …) are declared on the ElevenLabs dashboard but run on-device. Anything
  Nikki "learns" is inserted as a `nikki_proposals` row (`src/services/proposalService.ts`) for an
  admin to approve, except a small `AUTO_APPLY_TYPES` allowlist (currently just `support_note`).
  This human-in-the-loop boundary is enforced at **both** the tool layer and RLS — never add a tool
  that writes a canonical table (`family_people`, `calendar_events`, `reminders`, …) directly.
- `src/features/voice/useNikkiSession.ts` — the one seam to the SDK: mic permission → token +
  variables → `startSession`, exposing a small phase machine plus live captions. Supports an
  opening message so Help's "I am lost" / People's "Who is …?" links auto-start a session and
  speak on the user's behalf (`ask` route param on `/user/nikki`). Owns some load-bearing audio
  workarounds (module-global teardown timer, graceful "Goodbye" wrap-up so recaps still save) —
  see `docs/HANDOFF.md` §6 and §13 before touching it.
- `src/components/user/VoiceExperience.native.tsx` + `VoiceExperience.tsx` — the platform split.
  The `.native` file is the only component importing the SDK (whose import registers native WebRTC
  globals); the base file is the web fallback. **Never import `@elevenlabs/react-native` or the
  voice hook from shared/web code or tests** — Metro resolves `.native` on devices, and Jest/web
  must never load it.
- Safety: Nikki's own voice tools can trigger real-world actions mid-call — `guide_to_safe_place`
  (opens maps to the nearest safe place, logs an `emergency_events` row) and `call_family_member`
  (dials the priority emergency contact, logs an event) — both only after the elder has agreed, not
  fired automatically. The Help screen's buttons write the same durable `emergency_events` via
  `createEmergencyEvent`. Nikki never diagnoses; reminders have no medication type as of
  2026-07-10 (removed — admin-only, non-medical reminders now).
- `src/components/shared/DevModeSwitch.tsx` (backed by `src/features/dev/devConfig.ts` and
  `devHarness.ts`) — a developer-only overlay to hop between families and Admin/User mode on one
  device without losing work. Gated purely by `__DEV__` (no custom flag): the component renders
  `null` and the harness functions no-op whenever `__DEV__` is false, which is the case in any
  release-mode JS bundle (e.g. an EAS `production` build) — so it never reaches real users.

`WeatherProvider` (`src/services/weatherService.ts`) is real — `OpenMeteoWeatherProvider` (keyless,
free), following the elder's live GPS with a fallback to their home safe-place town — not a mock.

### Push notifications

`src/features/notifications/push.ts` registers the device and sends via Expo's push service
(surfaced as the admin dashboard's test-push button). Native-only like voice: web and simulators
return a friendly no-op instead of throwing. `expo-notifications` is an `app.json` plugin, i.e.
part of the dev build's native surface — and the iOS provisioning profile must carry the Push
Notifications capability (regenerated via an interactive `eas build` when capabilities change;
a non-interactive build fails with an aps-environment entitlement error).

### Routing & UI

- `expo-router` file-based routing under `app/`. Every screen renders headerless (`headerShown:
  false` globally in `app/_layout.tsx`) and draws its own branded `AppBar`.
- `src/theme.ts` is the single source of truth for color, type, spacing, radius, shadow tokens —
  every screen/primitive consumes only these tokens, no raw values downstream. Base text sizes are
  larger than typical (18pt+ body) and tap targets 56pt+, since the audience is older adults.
- `src/primitives/` is the design-system barrel (`Screen`, `AppBar`, `Text`, `Stack`, `Card`,
  `Button`, `Field`, `Icon`, `Reveal`) — import from `src/primitives/index.ts`, not individual files.
- `src/components/{admin,user,shared}/` holds feature-level composed components split by which mode
  they belong to.
- Nikki's spoken replies render as live captions through `Reveal` (reduce-motion safe) — the
  signature line-by-line reveal, kept for accessibility (hard-of-hearing users must be able to read
  what Nikki says). Preserve it when touching the voice UI (`VoiceCaptions.tsx`).

### Data layer

- `src/types/database.ts` — row types mirroring the Supabase schema (26 tables, RLS on every table).
- `src/types/domain.ts` — app-level domain types (weather provider, setup checklist) distinct from
  raw DB rows. (`chat_interactions` remains in the schema and `database.ts` but the app no longer
  writes it — voice transcripts are stored on the ElevenLabs platform.)
- Services select explicit column lists (not `select("*")`) and map snake_case DB rows onto typed
  objects — follow this pattern for new queries.

### Supabase project & migrations

- Schema is CLI-managed under `supabase/migrations/` (applied in filename order — see that
  directory's own README for what each migration contains and why `db push` against the live
  project is a no-op). `.supabase-project.json` records the linked project ref
  (`ealeydrwcowpypvkjbfs`, a dedicated project).
- `supabase/optional/migrate-existing.sql` is a one-shot data backfill, intentionally kept out of
  `migrations/` — not part of the reproducible schema, don't treat it as one.
- Standing up a fresh project: `supabase link --project-ref <ref>` then `supabase db push` (see the
  top-level `README.md`'s "Connect Supabase" section, which is current).

## Conventions worth preserving

- Every source file opens with a one-line comment stating its role in the architecture (e.g. "the
  ONLY place that constructs the Supabase client") — keep this up when adding new modules that own a
  singleton or a boundary.
- Storage/network failures are swallowed with a comment explaining why (e.g. a failed local write
  just means onboarding re-runs) rather than thrown, since this is best-effort local caching, not the
  source of truth.
- Never use the Supabase **service-role** key client-side — only the public anon key
  (`EXPO_PUBLIC_SUPABASE_ANON_KEY`), enforced by RLS.
