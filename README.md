# HiNikki

A warm AI voice companion older adults **talk to** for calm answers about their day, their people,
the weather, and help when they need it — with family keeping Nikki's world up to date.

One Expo (React Native + TypeScript) app, two routed experiences:
- **User mode** (the older adult): 3 calm destinations — **Nikki** (home + voice conversation + today + weather), **People**, **Help**.
- **Admin mode** (family/caregiver): 5 destinations — **Dashboard**, **People**, **Schedule**, **Safety**, **Settings**.

*For Willem, Alex, and Cormick: this file is the whole day-to-day guide — setup, the daily loop,
dev builds, maps, adding a new phone to the team, and shipping a production build to TestFlight. It
works the same on Windows and Mac.* For the deeper architecture/handoff doc (how the voice "brain"
is actually built, ADRs, war stories), see [`docs/HANDOFF.md`](docs/HANDOFF.md).

## The one big idea

The app on your phone (the **HiNikki dev build**) is just an empty shell. The actual app — screens,
logic, everything — is loaded live from a small server running on your laptop. Change the code,
save, and your phone updates **within seconds**. No rebuilding, no reinstalling.

## One-time setup (per person)

1. Install the HiNikki dev build on your phone — your device must be registered first (see "New
   phone joining the team" below).
2. On your laptop: install [Node.js](https://nodejs.org) (LTS version) and clone this repo.
3. In the project folder, run: `npm install` (`.npmrc` pins legacy-peer-deps — the ElevenLabs/LiveKit
   packages have peer-dep skew).

No secret keys needed — the app connects to the live Supabase and ElevenLabs setup automatically
(the sensitive keys live safely on the server, never on laptops).

## Daily workflow

```bash
git pull                                # get the latest code
npm install                             # only needed when someone added a package
npx expo start --dev-client --tunnel    # daily loop: JS hot-reloads into the installed dev build
```

A **QR code** appears in the terminal. Scan it with your phone camera → HiNikki opens and loads the
app. Now edit code; every save shows up on the phone in a second or two.

**About `--tunnel`:** it routes the connection through Expo's servers, so it works on any network —
and it is REQUIRED on WSL2 (Windows + Linux terminal), where the plain same-Wi-Fi mode advertises an
address the phone can't reach. Tunnel needs an Expo login (`npx expo login`, or an `EXPO_TOKEN` in
your shell). If phone and laptop are on the same Wi-Fi on a plain Mac/Windows setup, you can drop
`--tunnel` for a slightly faster connection.

```bash
npx expo start   # web preview still works for admin-mode UI (voice shows a fallback)
```

**Quick checks before pushing code:**
```bash
npx tsc --noEmit   # type check — must be clean (strict mode)
npm test           # Jest + jest-expo suite — must be green
npx jest src/utils/format.test.ts   # run a single test file
npx jest -t "test name"             # run tests matching a name
```
There is no lint script configured.

Without a configured Supabase project the app still runs with **realistic demo data** (Anna and her
family) — every surface except the voice conversation, which needs the real backend and shows a
calm "not set up yet" state instead.

## Testing without a phone

`npx expo start` then press `w` opens the app in your **browser**. Good for all the admin screens
(dashboard, people, schedule). The one thing the browser can NOT do is talk to Nikki — voice only
works on a real iPhone/Android device.

## Expo Go no longer runs this app

Nikki's voice rides on the ElevenLabs Conversational AI SDK, which needs LiveKit's native WebRTC
module. The team's dev app is an EAS **development build** (one-time install per device, same
QR-scan workflow as Expo Go):

```bash
eas build --profile development --platform android   # installable APK
eas build --profile development --platform ios       # register the device first: eas device:create
```

JS/TS changes hot-reload without rebuilding; rebuild only when native inputs change (new native
dependency, `app.json` plugins/permissions, Expo SDK upgrade).

## When is a real rebuild needed?

Almost never. Only when the app's *native ingredients* change:
- a new package with native code is added,
- `app.json` plugins/permissions change,
- the Expo SDK is upgraded.

Then anyone on the team runs (needs the Expo login, ~20 min on Expo's servers):

```bash
eas build --profile development --platform ios
eas build --profile development --platform android   # for Android testers (and the Google Maps key)
```

…and everyone installs the new build once from the link it prints. Day-to-day code changes never
need this.

## New phone joining the team?

1. The new person opens the device-registration link on their iPhone and installs:
   https://expo.dev/register-device/f5bfc421-bf54-4a37-9abd-68c64d0e90e2
2. Install the profile via Settings.
3. Someone runs the build command above and, when asked, ticks all devices.
4. New person installs from the link. Done.

## Ship it: production build → TestFlight

This is the profile that produces the real, store-signed app for outside testers — different from
the `development` profile above, which only ever installs on registered team devices. Both profiles
live in `eas.json`.

**What's different about `production`:**
- No dev client — this is the actual compiled app; it doesn't need the Metro server running on
  anyone's laptop.
- `ios.autoIncrement: true` — because `eas.json`'s `cli.appVersionSource` is `"remote"`, EAS (not
  `app.json`) owns the build number and bumps it automatically every production build. The
  user-facing **marketing version** (`"version": "1.0.0"` in `app.json`) does *not* auto-bump — edit
  it by hand before a release that should show a new version number.
- Its `env` block already has `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` baked in
  (the anon key is safe to commit — it's meaningless without RLS, which is on), so a production
  build doesn't depend on anyone's local `.env`. Android still needs the `GOOGLE_MAPS_ANDROID_KEY`
  EAS secret (see "Maps" above); iOS needs no map key (Apple Maps).

**Build it:**
```bash
eas build --profile production --platform ios
```
This produces a signed `.ipa`. First time only, EAS will ask to generate/reuse the distribution
certificate + provisioning profile for `com.willemgrasso.hinikki` — let it manage these
(`eas credentials` if you ever need to inspect/rotate them by hand).

**Submit it to TestFlight:**
```bash
eas submit --platform ios --profile production
```
This reads `submit.production.ios` in `eas.json` (Apple team id, App Store Connect API key, and the
existing app record's `ascAppId`) and uploads the most recent production build to App Store
Connect. Or do both in one shot:
```bash
eas build --profile production --platform ios --auto-submit
```

**One-time step someone needs to do before the first `eas submit` works from anyone's machine:**
`submit.production.ios` used to hardcode `ascApiKeyPath` to a Windows path on Willem's laptop
(`C:\Users\wpggr\...\asc-api-key.p8`), so submitting only ever worked from that one machine. That
field has been **removed from `eas.json`** — `ascApiKeyId` + `ascApiKeyIssuerId` (which just
identify the key, not secret material) are enough once the key itself is registered with your EAS
account instead of living on one disk. Whoever currently has the `asc-api-key.p8` file (Willem)
needs to run this once, from their own machine:

```bash
eas credentials --platform ios
```
- Select the `production` build profile when asked.
- Choose **"App Store Connect: Manage your API Key"** (wording may vary slightly by CLI version).
- Choose **"Add a new API Key"** and point it at the local `asc-api-key.p8` file — this uploads the
  key to your EAS account (Expo's servers), scoped to this project.

After that one-time step, `eas submit --platform ios --profile production` works unmodified from
**any** team member's machine — EAS resolves the key by `ascApiKeyId` server-side, no local `.p8`
file needed ever again. Until that step happens, `eas submit` will prompt interactively for the key
(or fail non-interactively) on every machine, including Willem's, since the old shortcut path is
gone. If a rebuild of the same fix is ever needed: `eas credentials -p ios` also lets you remove or
rotate the key from the same menu.

**After it uploads:** Apple processes the build (usually a few minutes; `ITSAppUsesNonExemptEncryption:
false` in `app.json` is already set, so the export-compliance question shouldn't block it). Once it
shows "Ready to Test" in App Store Connect → TestFlight:
- **Internal testing group** (App Store Connect team members only, up to 100 people) — no Apple
  review, testers get it within minutes. This is the fastest path to get the first group testing
  Nikki.
- **External testing group** (anyone by email/public link) — needs Apple's **Beta App Review**
  (first submission ~24–48h, later builds are usually much faster) *and* a working, publicly hosted
  privacy-policy URL in the App Store Connect listing. `privacy-policy.md` in this repo still
  predates the voice feature (see "Apple review & privacy notes" below) — get that hosted and
  updated before adding external testers, even though it's not a blocker for internal testing.

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

The agent (persona, understanding, speech, transcripts) lives on the ElevenLabs platform;
`elevenlabs/agent.json` is its versioned config snapshot. One-time setup — creating the private
agent, enabling agent auth, declaring client tools, and setting the `ELEVENLABS_API_KEY` /
`ELEVENLABS_AGENT_ID` function secrets — is documented in `elevenlabs/README.md`. The API key only
ever lives in the `elevenlabs-token` Supabase Edge Function; the app fetches short-lived
conversation tokens from it. What Nikki knows per session, what she can do mid-call (safe-place
guidance, calling family, filing notes for review), and the human-in-the-loop approval flow behind
that are covered in `docs/HANDOFF.md`.

## Maps (safe places & event location)

Adding a safe place or an event location uses an embedded map (drop/drag a pin, or "use my current
location"). Nothing to do day-to-day — but here's how it's wired:

- **iOS** uses **Apple Maps** — free, no API key, no setup. It just works after a rebuild.
- **Android** uses **Google Maps**, which needs a Google Maps API key. The key is **never committed**:
  `app.config.js` injects it from the `GOOGLE_MAPS_ANDROID_KEY` environment variable at build time.

**Setting up the Android key (Willem — do this with your own Google account):**
1. Go to https://console.cloud.google.com and sign in.
2. Top bar → **create a project** (e.g. "HiNikki"), then select it.
3. Left menu → **APIs & Services → Library** → search **"Maps SDK for Android"** → open it → **Enable**.
4. Left menu → **APIs & Services → Credentials** → **+ Create credentials → API key** → copy the key.
5. (Recommended) Click the key → **Application restrictions → Android apps** → add package name
   `com.willemgrasso.hinikki` and the build's SHA‑1 fingerprint. **API restrictions →** restrict to
   "Maps SDK for Android". This stops anyone else reusing the key.
6. Put the key where builds read it — NOT in any committed file:
   - **Local builds** (`expo run:android`): add `GOOGLE_MAPS_ANDROID_KEY=<key>` to your `.env` (gitignored).
   - **Cloud builds** (`eas build`): `eas secret:create --name GOOGLE_MAPS_ANDROID_KEY --value <key>`
     (once per project). EAS injects it into the build automatically.
7. Rebuild (above).

Displaying the map on a phone is **free** (Google's per-call pricing is for the web/Places APIs,
not the native mobile map), though the project may need a billing account attached to activate the
key. A blank/grey Android map almost always means the key is missing, the SDK isn't enabled, or the
restrictions don't match the build.

**If a key ever leaks (e.g. committed by mistake):** revoke it in Google Cloud → Credentials, then
create a fresh one. A leaked key is compromised permanently — rotating is the fix, not deleting the file.

## External integrations (what's real, what's swappable)

- **Weather** — real: `OpenMeteoWeatherProvider` (`src/services/weatherService.ts`), keyless and
  free, follows the elder's live GPS with a fallback to their home safe-place town. Kept behind a
  `WeatherProvider` interface so a future provider swap only touches this one file.
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
- Health-adjacent companion: Nikki never diagnoses, never makes medication decisions (reminders have
  no medication type as of 2026-07-10), and recommends professional help for serious symptoms
  (enforced in the agent prompt).
- `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only).
- Bundle id: `com.willemgrasso.hinikki`.
- Backend: dedicated Supabase project `ealeydrwcowpypvkjbfs`. Email auto-confirm is on for the
  MVP — add real email verification before public release.
