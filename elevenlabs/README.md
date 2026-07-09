# ElevenLabs agent config (Nikki)

`agent.json` is the **versioned snapshot** of the Nikki agent's configuration on the
ElevenLabs platform. The dashboard (or their API/CLI) is where the agent actually lives —
this file exists so the persona prompt, dynamic-variable contract, and auth settings are
reviewable in git. When you change the agent in the dashboard, mirror the change here in
the same PR (and vice versa).

## Dynamic-variable contract

The system prompt and first message reference variables supplied by the app at session
start — `buildSessionVariables()` in `src/features/voice/sessionVariables.ts` is the
single producer. The names must match **exactly** (case-sensitive):

| Variable | Contents |
|---|---|
| `preferred_name` | What Nikki calls the person ("friend" if unset) |
| `today_date` / `local_time` | Device-local date and time |
| `today_schedule` | Today's scheduled events, friendly summaries + what to bring |
| `family_summary` | Mentionable people: name, relationship, notes, conversation hints |
| `weather_today` | Weather summary + clothing/safety suggestion |
| `medication_notes` | Family-authored medication reminders (Nikki never advises beyond these) |
| `emergency_contact_names` | Contact names only — phone numbers never leave the device |

Renaming or adding a variable is a two-sided change: this prompt **and**
`sessionVariables.ts` (plus its tests).

## Setup (one-time, human steps)

1. Create the agent in the ElevenLabs dashboard (Agents → New agent) using the prompt,
   first message, and settings from `agent.json`.
2. **Enable authentication** on the agent (Security tab; done for the live agent on
   2026-07-09) — the app only connects through conversation tokens minted by the
   `elevenlabs-token` Edge Function; an unauthenticated agent would be callable by anyone
   with the agent id.
3. Set the Supabase function secrets:
   ```bash
   supabase secrets set ELEVENLABS_API_KEY=xi-... ELEVENLABS_AGENT_ID=agent-...
   supabase functions deploy elevenlabs-token
   ```
4. Safety escalation (what the agent does on distress/"I am lost") is configured on the
   ElevenLabs side (owner: Willem) — e.g. via agent tools/workflows there. The app-side
   emergency trail (`emergency_events`) is still written by the Help screen's buttons;
   wiring the agent into it (webhook → Edge Function) is a known follow-up.

