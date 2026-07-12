// app.config.js — dynamic Expo config. Keeps everything in app.json, then injects the Android
// Google Maps API key from an environment variable at build time so the key is NEVER committed.
// Local dev: put GOOGLE_MAPS_ANDROID_KEY in .env (gitignored). Cloud builds: set it as an EAS
// secret (`eas secret:create --name GOOGLE_MAPS_ANDROID_KEY --value <key>`). iOS uses Apple Maps
// and needs no key. A blank key just yields a grey map on Android; the build still succeeds.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY || "" },
    },
  },
});
