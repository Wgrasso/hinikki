// src/services/pairingService.ts — the only path to create/redeem pairing codes.
// Live mode calls the SECURITY DEFINER RPCs (codes hashed server-side); demo mode shows a
// throwaway code and accepts any code so the flow is fully walkable without a backend.
import { supabase } from "../lib/supabase";
import { DEMO_OLDER_ADULT_ID } from "../data/demo";
import type { IntendedRole } from "../types/database";

function randomSixDigits(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) out += Math.floor(Math.random() * 10).toString();
  return out;
}

export async function generatePairingCode(
  olderAdultId: string,
  intendedRole: IntendedRole,
): Promise<string> {
  if (!supabase) return randomSixDigits();
  const { data, error } = await supabase.rpc("generate_pairing_code", {
    p_older_adult: olderAdultId,
    p_intended_role: intendedRole,
    p_ttl_hours: 72,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export type RedeemResult =
  | { ok: true; olderAdultId: string }
  | { ok: false; message: string };

export async function redeemPairingCode(code: string, relationship?: string): Promise<RedeemResult> {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== 6) {
    return { ok: false, message: "Please enter the full 6-digit code." };
  }
  if (!supabase) return { ok: true, olderAdultId: DEMO_OLDER_ADULT_ID };
  const { data, error } = await supabase.rpc("redeem_pairing_code", {
    p_code: cleaned,
    p_relationship: relationship ?? null,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("not authenticated")) return { ok: false, message: "Something interrupted the connection. Please try again." };
    if (m.includes("only an admin")) return { ok: false, message: "Please sign in as family first, then enter the code." };
    if (m.includes("too many")) return { ok: false, message: "Too many tries. Please wait a minute and try again." };
    return { ok: false, message: "That code is not valid or has expired. Please ask for a new one." };
  }
  return { ok: true, olderAdultId: String(data) };
}
