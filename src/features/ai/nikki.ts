// src/features/ai/nikki.ts — the chat orchestrator: detect → build context → generate →
// log safety event → persist → return. Screens call sendMessage and render the result.
import { createEmergencyEvent } from "../../services/emergencyService";
import { saveInteraction } from "../../services/chatService";
import type { ChatMessage } from "../../types/domain";
import { buildContext } from "./context";
import { detectIntent } from "./intent";
import { nikkiAI } from "./mockNikki";

export type SendResult = {
  messages: ChatMessage[];
  reply: string;
  safety: "normal" | "caution" | "emergency";
  followUps: string[];
};

export async function sendMessage(
  olderAdultId: string,
  preferredName: string | null,
  text: string,
  priorMessages: ChatMessage[],
): Promise<SendResult> {
  const trimmed = text.trim();
  const { intent, query } = detectIntent(trimmed);
  const context = await buildContext(intent, olderAdultId, preferredName, query);
  const response = await nikkiAI.generateResponse({ message: trimmed, context });

  // Escalate before anything else: a lost/distress message creates a durable, admin-flagged event.
  if (response.safetyLevel === "emergency") {
    await createEmergencyEvent(olderAdultId, { event_type: "distress", user_message: trimmed, detected_urgency: "high" });
  } else if (intent === "lost") {
    await createEmergencyEvent(olderAdultId, { event_type: "lost", user_message: trimmed, detected_urgency: "medium" });
  }

  const messages = await saveInteraction(olderAdultId, trimmed, response.text, intent, response.safetyLevel, priorMessages);
  return { messages, reply: response.text, safety: response.safetyLevel, followUps: response.followUps };
}
