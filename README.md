# HiNikki

A warm AI voice companion older adults **talk to** for calm answers about their day, their people,
the weather, and help when they need it — with family keeping Nikki's world up to date.

One Expo (React Native + TypeScript) app, two routed experiences:
- **User mode** (the older adult): 3 calm destinations — **Nikki** (home + voice conversation + today + weather), **People**, **Help**.
- **Admin mode** (family/caregiver): 5 destinations — **Dashboard**, **People**, **Schedule**, **Safety**, **Settings**.

## Run it

> New to the team? **[DEVELOPMENT.md](DEVELOPMENT.md)** is the plain-language guide: one-time
> setup, the daily loop, and when (re)builds are actually needed.

```bash
npm install                  # .npmrc pins legacy-peer-deps (ElevenLabs/LiveKit peer skew)
npx expo start --dev-client  # daily loop: JS hot-reloads into the installed dev build
npx expo start               # web preview still works for admin-mode UI (voice shows a fallback)
```

**Expo Go no longer runs this app** — Nikki's voice rides on the ElevenLabs Conversational AI SDK,
which needs LiveKit's native WebRTC module. The team's dev app is an EAS **development build**
(one-time install per device, same QR-scan workflow as Expo Go):

```bash
eas build --profile development --platform android   # installable APK
eas build --profile development --platform ios       # register the device first: eas device:create
```

JS/TS changes hot-reload without rebuilding; rebuild only when native inputs change (new native
dependency, `app.json` plugins/permissions, Expo SDK upgrade).

- `npx tsc --noEmit` — type-checks clean (strict).
- `npm test` — Jest + jest-expo suite.

Without a configured Supabase project the app still runs with **realistic demo data** (Anna and
her family) — every surface except the voice conversation, which needs the real backend and shows
a calm "not set up yet" state instead.

## Connect Supabase (makes it real)

1. Create a Supabase project (the linked one is `ealeydrwcowpypvkjbfs`, see `.supabase-project.json`).
2. Apply the schema: `supabase link --project-ref <ref>` then `supabase db push`
   (see `supabase/migrations/README.md`).
3. In Supabase: **enable Anonymous sign-ins** (Auth → Providers). The private `family-photos`
   bucket + policies are part of the migrations.
4. Copy `.env.example` to `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the **public anon** key — never the service-role key)

Identity: admins use **email/password**; older adults use **anonymous auth** (no login wall).
Pairing is bidirectional via a 6-digit code that is **hashed server-side** and redeemed through
`SECURITY DEFINER` RPCs — raw codes are never stored or queryable.

## Connect ElevenLabs (gives Nikki her voice)

The agent (persona, understanding, speech, transcripts, safety behavior) lives on the ElevenLabs
platform; `elevenlabs/agent.json` is its versioned config snapshot. One-time setup — creating the
private agent, enabling agent auth, and setting the `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID`
function secrets — is documented in `elevenlabs/README.md`. The API key only ever lives in the
`elevenlabs-token` Supabase Edge Function; the app fetches short-lived conversation tokens from it.

## What's mocked (and how it becomes real later)

- **Weather** — `MockWeatherProvider` behind `WeatherProvider` (`src/services/weatherService.ts`).
  Drop in Open-Meteo (keyless) later.
- **Location** — real `expo-location` (foreground / on-demand only for MVP; background is deferred).
- **Push notifications** — real (`expo-notifications` + Expo's push service,
  `src/features/notifications/push.ts`); like voice, they need the dev build on a physical
  device — web and simulators get a friendly no-op.

## Design

Metaphor: *"a warm, sunlit morning note left on the kitchen table by someone who loves you."*
Warm cream canvas, deep-teal trust, amber warmth, Fraunces + Inter, 18pt+ body and 56pt+ tap
targets for older eyes. The signature element is the **Nikki card**; the signature interaction —
Nikki's words **rising in line-by-line** (reduce-motion safe) — lives on as the live captions of
what she says. All visuals come from `src/theme.ts`.

## Apple review & privacy notes

- Collects personal data (names, addresses, photos), precise location, and **microphone audio
  streamed to ElevenLabs** (conversations are processed and stored on their platform) ⇒ a **hosted
  privacy-policy URL** covering voice processing and accurate **App Privacy nutrition labels** are
  required (`privacy-policy.md` predates voice — update it before release).
- Usage strings (already configured): location + photo library in `app.json`, microphone/camera
  via the WebRTC config plugin.
- Health-adjacent companion: Nikki never diagnoses, never makes medication decisions, and
  recommends professional help for serious symptoms (enforced in the agent prompt).
- `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only).
- Bundle id: `com.willemgrasso.hinikki`.
- Backend: dedicated Supabase project `ealeydrwcowpypvkjbfs`. Email auto-confirm is on for the
  MVP — add real email verification before public release.
