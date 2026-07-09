// src/lib/supabase.ts — the ONLY place that constructs the Supabase client.
// Session tokens persist per platform:
//   • native (iOS/Android) → expo-secure-store, chunked to respect its ~2KB per-value limit
//   • web (Expo running in a laptop browser) → localStorage, because SecureStore is NOT available
//     on web and silently drops every write there (which logged users out / lost data on the laptop).
// If env is absent the client is null and services fall back to demo data.
import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { HAS_SUPABASE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./constants";

const CHUNK_SIZE = 1800;

type AuthStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// A SecureStore adapter that transparently splits large values across multiple secure entries.
const secureChunkStorage: AuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await SecureStore.getItemAsync(`${key}__count`);
      if (countRaw === null) {
        return await SecureStore.getItemAsync(key);
      }
      const count = Number(countRaw);
      if (!Number.isFinite(count) || count <= 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(`${key}__${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.deleteItemAsync(`${key}__count`);
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      await SecureStore.setItemAsync(`${key}__count`, String(chunks.length));
      await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${key}__${i}`, c)));
    } catch {
      // Storage failures must not crash auth; a lost session just means re-pairing.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const countRaw = await SecureStore.getItemAsync(`${key}__count`);
      await SecureStore.deleteItemAsync(key);
      if (countRaw !== null) {
        const count = Number(countRaw);
        await SecureStore.deleteItemAsync(`${key}__count`);
        for (let i = 0; i < count; i += 1) {
          await SecureStore.deleteItemAsync(`${key}__${i}`);
        }
      }
    } catch {
      // ignore
    }
  },
};

// Web adapter: SecureStore is unsupported in the browser, so persist the session to localStorage.
// Typed narrowly so we don't need the DOM lib in tsconfig.
type WebStore = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
function localStore(): WebStore | null {
  try {
    return (globalThis as { localStorage?: WebStore }).localStorage ?? null;
  } catch {
    return null;
  }
}
const webStorage: AuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStore()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStore()?.setItem(key, value);
    } catch {
      // ignore — a lost session just means signing in again
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStore()?.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const authStorage: AuthStorage = Platform.OS === "web" ? webStorage : secureChunkStorage;

export const supabase: SupabaseClient | null = HAS_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
