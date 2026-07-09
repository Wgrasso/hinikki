# HiNikki

A warm AI companion older adults text for calm answers about their day, their people, the weather, and help when they need it — with family keeping Nikki's world up to date.

One Expo (React Native + TypeScript) app, two routed experiences:
- **User mode** (the older adult): 3 calm destinations — **Nikki** (home + chat + today + weather), **People**, **Help**.
- **Admin mode** (family/caregiver): 5 destinations — **Dashboard**, **People**, **Schedule**, **Safety**, **Settings**.

## Run it

```bash
npm install
npx expo start          # press w for web, or scan the QR with Expo Go
```

The app runs immediately with **realistic demo data** (Anna and her family) when no Supabase
project is configured — so you can walk the whole flow in Expo Go or web preview. Connect a
Supabase project (below) to make it real and multi-device.

- `npx tsc --noEmit` — type-checks clean (strict).
- `npm test` — Jest + jest-expo suite (28 tests).

## Connect Supabase (makes it real)

1. Create a free Supabase project.
2. Apply the schema: from the repo root, `node scripts/apply-schema.mjs blueprints/hinikki.schema.sql`
   (25 tables, RLS on every table, helper functions, and the hashed-code pairing RPCs).
3. In Supabase: **enable Anonymous sign-ins** (Auth → Providers), and create a **private Storage
   bucket `family-photos`** with policies scoping objects to linked principals.
4. Copy `.env.example` to `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the **public anon** key — never the service-role key)

Identity: admins use **email/password**; older adults use **anonymous auth** (no login wall).
Pairing is bidirectional via a 6-digit code that is **hashed server-side** and redeemed through
`SECURITY DEFINER` RPCs — raw codes are never stored or queryable.

## What's mocked (and how it becomes real later)

- **Nikki AI** — `MockNikkiAI` (keyword intents + 7 context builders) behind the `NikkiAIProvider`
  interface (`src/features/ai/`). Swap in a real LLM via a Supabase Edge Function (keep the key
  server-side) without touching the UI.
- **Weather** — `MockWeatherProvider` behind `WeatherProvider` (`src/services/weatherService.ts`).
  Drop in Open-Meteo (keyless) later.
- **Voice** — `STTProvider` / `TTSProvider` interfaces exist (`src/types/domain.ts`) but are unused;
  HiNikki is texting-first for the MVP.
- **Location** — real `expo-location` (foreground / on-demand only for MVP; background is deferred).

## Design

Metaphor: *"a warm, sunlit morning note left on the kitchen table by someone who loves you."*
Warm cream canvas, deep-teal trust, amber warmth, Fraunces + Inter, 18pt+ body and 56pt+ tap
targets for older eyes. The signature element is the **Nikki card**; the signature interaction is
Nikki's reply **rising in line-by-line** (reduce-motion safe). All visuals come from `src/theme.ts`.

## Apple review & privacy notes

- Collects personal data (names, addresses, photos) and precise location ⇒ a **hosted
  privacy-policy URL** and accurate **App Privacy nutrition labels** are required (`privacy-policy.md`
  is generated; hosting it is a human step).
- Usage strings (already in `app.json`): `NSLocationWhenInUseUsageDescription`,
  `NSPhotoLibraryUsageDescription`.
- Health-adjacent companion: Nikki never diagnoses, never makes medication decisions, and
  recommends professional help for serious symptoms.
- `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only).
- Bundle id: `com.willemgrasso.hinikki` (from `BUNDLE_ID_PREFIX`).
- Backend: hosted in the existing `app_maker` Supabase project (a dedicated project was blocked by the free-tier 2-active-project limit); migrate to its own project later by pausing a project or upgrading. Email auto-confirm is on for the MVP — add real email verification before public release.
