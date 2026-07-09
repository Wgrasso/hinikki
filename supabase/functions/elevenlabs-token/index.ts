// supabase/functions/elevenlabs-token/index.ts — the ONLY place the ElevenLabs API key is used.
// Mints a short-lived WebRTC conversation token for the private Nikki agent so the app never
// holds the key. Caller must present a valid Supabase JWT (anonymous older-adult sessions
// included) and be allowed to view the requested older adult (can_view_older_adult RPC).
//
// Secrets (set with `supabase secrets set`):
//   ELEVENLABS_API_KEY  — xi-api-key of the workspace that owns the Nikki agent
//   ELEVENLABS_AGENT_ID — the private agent's id
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  const agentId = Deno.env.get("ELEVENLABS_AGENT_ID");
  if (!apiKey || !agentId) {
    return json(500, { error: "voice is not configured (missing ElevenLabs secrets)" });
  }

  // Identify the caller from their own JWT; RLS/permission RPCs then run as them.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: "not authenticated" });

  let olderAdultId: unknown;
  try {
    ({ older_adult_id: olderAdultId } = await req.json());
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  if (typeof olderAdultId !== "string" || !UUID_RE.test(olderAdultId)) {
    return json(400, { error: "older_adult_id (uuid) is required" });
  }

  const { data: allowed, error: permError } = await supabase.rpc("can_view_older_adult", {
    p_older_adult: olderAdultId,
  });
  if (permError) return json(500, { error: "permission check failed" });
  if (allowed !== true) return json(403, { error: "not authorized for this profile" });

  const elRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey } },
  );
  if (!elRes.ok) {
    // Never forward ElevenLabs error bodies — they can describe the workspace/agent.
    console.error("elevenlabs token request failed", elRes.status, await elRes.text());
    return json(502, { error: "voice service unavailable" });
  }
  const { token } = (await elRes.json()) as { token?: string };
  if (!token) return json(502, { error: "voice service returned no token" });

  return json(200, { conversation_token: token });
});
