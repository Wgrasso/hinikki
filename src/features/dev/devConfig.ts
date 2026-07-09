// src/features/dev/devConfig.ts — DEV ONLY fixed target for the dev harness (devHarness.ts).
// The whole point: one family, one admin account, one elder — so "be admin" and "be user"
// always land in the SAME group no matter what stale session is lying in device storage.
// These are throwaway credentials for a dedicated diagnostic admin account that exists only
// to test with; they are never used in release (every caller checks __DEV__) and grant
// nothing beyond this one test family.
export const DEV_HARNESS = __DEV__
  ? {
      familyCode: "XZVX2D2T",
      adminEmail: "dev-harness@hinikki.test",
      adminPassword: "devharness-XZVX2D2T-2026",
      elderName: "Alexu", // the older adult to become on the user side
    }
  : null;
