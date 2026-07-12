# Working on HiNikki — the simple guide

*For Willem, Alex, and Cormick. Works the same on Windows and Mac.*

## The one big idea

The app on your iPhone (the **HiNikki dev build**) is just an empty shell. The actual app —
screens, logic, everything — is loaded live from a small server running on your laptop. Change
the code, save, and your phone updates **within seconds**. No rebuilding, no reinstalling.

## One-time setup (per person)

1. Install the HiNikki dev build on your iPhone — your phone must
   be registered first, which you've already done.
2. On your laptop: install [Node.js](https://nodejs.org) (LTS version) and clone this repo.
3. In the project folder, run: `npm install`

That's it. No secret keys needed — the app connects to the live Supabase and ElevenLabs setup
automatically (the sensitive keys live safely on the server, never on laptops).

## Daily workflow

```bash
git pull          # get the latest code
npm install       # only needed when someone added a package
npx expo start --dev-client --tunnel
```

A **QR code** appears in the terminal. Scan it with your iPhone camera → HiNikki opens and
loads the app. Now edit code; every save shows up on the phone in a second or two.

**About `--tunnel`:** it routes the connection through Expo's servers, so it works on any
network — and it is REQUIRED on WSL2 (Windows + Linux terminal), where the plain same-Wi-Fi
mode advertises an address the phone can't reach. Tunnel needs an Expo login
(`npx expo login`, or an `EXPO_TOKEN` in your shell). If phone and laptop are on the same
Wi-Fi on a plain Mac/Windows setup, you can drop `--tunnel` for a slightly faster connection.

**Quick checks before pushing code:**
```bash
npx tsc --noEmit   # type check — must be clean
npm test           # test suite — must be green
```

## Testing without a phone

`npx expo start` then press `w` opens the app in your **browser**. Good for all the admin
screens (dashboard, people, schedule). The one thing the browser can NOT do is talk to Nikki —
voice only works on a real iPhone/Android device.

## Maps (safe places & event location)

Adding a safe place or an event location uses an embedded map (drop/drag a pin, or "use my
current location"). Nothing to do day-to-day — but here's how it's wired:

- **iOS** uses **Apple Maps** — free, no API key, no setup. It just works after a rebuild.
- **Android** uses **Google Maps**, which needs a Google Maps API key. The key already lives in
  `app.json` → `expo.android.config.googleMaps.apiKey`, so a normal build picks it up automatically.

**Setting up / rotating the Android key (Willem — do this with your own Google account):**
1. Go to https://console.cloud.google.com and sign in.
2. Top bar → **create a project** (e.g. "HiNikki"), then select it.
3. Left menu → **APIs & Services → Library** → search **"Maps SDK for Android"** → open it → **Enable**.
4. Left menu → **APIs & Services → Credentials** → **+ Create credentials → API key** → copy the key.
5. (Recommended) Click the key → **Application restrictions → Android apps** → add package name
   `com.willemgrasso.hinikki` and the build's SHA‑1 fingerprint. **API restrictions →** restrict to
   "Maps SDK for Android". This stops anyone else reusing the key.
6. Paste the key into `app.json` at `expo.android.config.googleMaps.apiKey`, then rebuild (below).

Displaying the map on a phone is **free** (Google's per-call pricing is for the web/Places APIs,
not the native mobile map), though the project may need a billing account attached to activate the
key. A blank/grey Android map almost always means the key is missing, the SDK isn't enabled, or the
restrictions don't match the build.

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

…and everyone installs the new build once from the link it prints. Day-to-day code changes
never need this.

## New phone joining the team?

1. The new person opens the device-registration link on their iPhone and installs: https://expo.dev/register-device/f5bfc421-bf54-4a37-9abd-68c64d0e90e2
2. Install the profile via Settings.
3. Someone runs the build command above and, when asked, ticks all devices.
4. New person installs from the link. Done.
