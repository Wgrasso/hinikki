// jest-setup.js — mock AsyncStorage so storage-backed code runs in tests without native modules.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
