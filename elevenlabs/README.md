# ElevenLabs agent config (Nikki)

`agent.json` is the **versioned snapshot** of the Nikki agent's configuration on the
ElevenLabs platform. The dashboard (or their API/CLI) is where the agent actually lives —
this file exists so the persona prompt, dynamic-variable contract, and auth settings are
reviewable in git. When you change the agent in the dashboard, mirror the change here in
the same PR (and vice versa).

## Dynamic-variable contract

The system prompt and first message reference variables supplied by the app at session
start — `buildSessionVariables()` in `src/features/voice/sessionVariables.ts` is the
single producer (backed by the tiered snapshot cache in `src/features/voice/snapshot.ts`,
so a warm session start makes no network calls). The names must match **exactly**
(case-sensitive):

| Variable | Contents |
|---|---|
| `preferred_name` | What Nikki calls the person ("friend" if unset) |
| `today_date` / `local_time` | Device-local date and time |
| `language_name` / `register` | From `older_adult_profiles.primary_language` (`en` / `nl` / `nl-informal`): "English"/"Dutch" + the bare form of address to use (`you` / `u` / `je`) |
| `home_hint` | AREA only, from the part after the last comma of the home address ("in Amsterdam"; fallback "their own familiar home") — the street address never leaves the device |
| `today_schedule` | Today's events: time, friendly summary, place, **companion**, transport, `[mention it from HH:MM]` announce lead, bring-notes, family note |
| `soon_schedule` | Scheduled events beyond today within 48 h, with weekday |
| `family_summary` | Mentionable people: name (+relationship, +disambiguator like "Marieke's son" when two share a label), pronunciation, birthday, where they live, visits, notes, hints, `[you MAY call this person]` marker |
| `family_connections` | The relationship graph as sentences ("Tom is Marieke's child") |
| `memories_summary` | Up to 5 memories, relevance-ranked (people in today's plans first) |
| `never_raise` | Names Nikki must never bring up herself (suppressed people) |
| `recent_summary` | Nikki's own private notes from the last conversations (continuity) |
| `recent_turns` | The last ~12 spoken turns, verbatim (short-term continuity) |
| `pending_family_items` | Topics already proposed/declined — never re-ask or re-propose |
| `weather_today` | Weather summary + clothing/safety + the family's custom weather note |
| `emergency_contact_names` | Contact names only — phone numbers never leave the device |

Renaming or adding a variable is a two-sided change: this prompt **and**
`sessionVariables.ts` (plus its tests).

## Client tools (declare these on the agent — Agent → Tools)

Implementations live on-device in `src/features/voice/agentTools.ts` and are passed to
`startSession({ clientTools })` by `useNikkiSession`. Declare each tool on the ElevenLabs
agent with these names and parameters (string fields unless noted). Tool RESULTS are
instructions for the agent to follow, not user-facing text.

| Tool | Parameters | What it does (on-device) |
|---|---|---|
| `lookup_person` | `name` | Searches the cached people (suppressed names → returns do-not-discuss guidance) |
| `propose_fact` | `proposal_type`, `payload` (object), `source_quote`, `agent_note` | Files a pending row in `nikki_proposals` for family approval; opinion-filtered; deduped; at most ONE push per conversation. People inside `payload` are referenced by `person_name` / `person_a_name` / `person_b_name` |
| `confirm_reminder` | `reminder_title` | Resolves the reminder by title (asks to clarify on ambiguity) and inserts a `reminder_confirmations` row (`voice`) |
| `save_session_note` | `note` | Nikki's PRIVATE continuity note (self-only row; admins can never read it) |
| `save_session_recap` | `summary`, `changes` (array of `{kind, label}`) | The shareable recap: elder closing card + the family's "Conversations" feed (filtered once, shown identically to both) |
| `guide_to_safe_place` | `reason` | **Live safety action.** Only when the elder is physically lost and has agreed to be shown the way: finds the nearest safe place, opens the maps app with directions, captures a fresh location pin, and logs an `emergency_events` row (`event_type: "lost"`) so the family is alerted |
| `call_family_member` | `reason` | **Live safety action.** Only when the elder clearly needs a person and has agreed: dials the priority emergency contact (`Linking.openURL("tel:...")`) and logs an `emergency_events` row (`event_type: "call_family"`) |
| `open_event_directions` | `event_title` | Opens the maps app with directions to a scheduled event's saved location (asks to clarify if more than one plan has a place and the title is ambiguous) |

## Setup (one-time, human steps)

1. Create the agent in the ElevenLabs dashboard (Agents → New agent) using the prompt,
   first message, and settings from `agent.json`.
2. **Enable authentication** on the agent (Security tab; done for the live agent on
   2026-07-09) — the app only connects through conversation tokens minted by the
   `elevenlabs-token` Edge Function; an unauthenticated agent would be callable by anyone
   with the agent id.
3. **Declare the eight client tools** (table above) on the agent so the model can call them.
4. Set the Supabase function secrets:
   ```bash
   supabase secrets set ELEVENLABS_API_KEY=xi-... ELEVENLABS_AGENT_ID=agent-...
   supabase functions deploy elevenlabs-token
   ```
5. Apply the brain migration (proposals/push-tokens/guard-trigger/realtime publication):
   ```bash
   supabase db push   # applies supabase/migrations/20260710120000_nikki_brain.sql
   ```
6. Dutch: the live agent is English (`language: "en"`, `eleven_turbo_v2`). For NL elders,
   create a second agent from the same prompt with a Dutch-capable voice/model and route by
   `older_adult_profiles.primary_language` when minting the token (the Edge Function can
   pick the agent id) — tracked as plan §7.8.
7. Safety tools: `guide_to_safe_place` and `call_family_member` (table above) are live —
   Nikki can open maps to the nearest safe place or dial the priority emergency contact
   mid-conversation, gated on the elder having agreed (not fired automatically), and both
   log an `emergency_events` row so the family is alerted. **Known gap:** the live prompt's
   "YOUR TOOLS" block in `agent.json` doesn't mention either tool by name — only
   `lookup_person`, `propose_fact`, `confirm_reminder`, and the save-note/recap pair are
   documented there, so the model has no prompt guidance on when to reach for them. The
   Dutch "In distress" line ("Ik ben bij u. U bent niet alleen...") also predates these tools
   and doesn't route to them. This needs a prompt update (mirrored to the dashboard, plus
   product sign-off on wording) before voice-triggered safety escalation can be relied on in
   practice — right now the tools work if called, but the persona isn't told to call them.
8. Medication removed (2026-07-10): reminders no longer support a "medication" type
   (admin-only, non-medical reminders now — watering plants, hydration, etc.), so the prompt
   no longer references `{{medication_notes}}` or a medication-specific instruction. **The
   live agent in the ElevenLabs dashboard still needs this same edit applied by hand** —
   remove the old `MEDICATION NOTES written by their family:` line and the `PLANS &
   MEDICATION` section's medication bullet so the dashboard prompt matches this file.

Prompt size note: the current prompt measures ≈7k chars (≈1.75k tokens by chars÷4). If
session start latency matters, the per-tool guidance in the YOUR TOOLS block can move into
each tool's platform-side description field.
