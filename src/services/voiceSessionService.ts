// src/services/voiceSessionService.ts — fetches a scoped ElevenLabs conversation token from the
// elevenlabs-token Edge Function. No demo branch: voice inherently needs the real backend (the
// token embeds the private agent; the API key lives only in the function) — see HAS_VOICE.
import { requireSupabase } from "../lib/supabase";

export async function getConversationToken(olderAdultId: string): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("elevenlabs-token", {
    body: { older_adult_id: olderAdultId },
  });
  if (error) throw new Error(`voice session token request failed: ${error.message}`);
  const token = (data as { conversation_token?: string } | null)?.conversation_token;
  if (!token) throw new Error("voice session token missing from response");
  return token;
}
