// src/features/ai/mockNikki.ts — the MVP AI. Warm, calm, never clinical; answers ONLY from the
// structured context it is given. Swap this class for a real LLM by implementing NikkiAIProvider.
import { formatTime } from "../../utils/format";
import type { CalendarEvent } from "../../types/database";
import type { NikkiAIInput, NikkiAIProvider, NikkiAIResponse, NikkiContext } from "../../types/domain";

function pickEvent(events: CalendarEvent[]): CalendarEvent | null {
  if (events.length === 0) return null;
  const high = events.find((e) => e.priority_level === "high");
  return high ?? events[0];
}

function todayReply(ctx: NikkiContext): string {
  const events = ctx.today?.events ?? [];
  if (events.length === 0) {
    return "You have a calm, open day today. There is nothing you need to worry about. I am here if you would like some company.";
  }
  const event = pickEvent(events);
  if (event?.nikki_before_event_message) return event.nikki_before_event_message;
  if (!event) return "You have a calm day today.";
  const time = formatTime(event.start_at);
  const bring = event.what_to_bring ? ` Please remember to bring ${event.what_to_bring}.` : "";
  return `Today you have ${event.user_friendly_summary ?? event.title} at ${time}.${bring} There is nothing to worry about.`;
}

function personReply(ctx: NikkiContext): string {
  const match = ctx.person?.match;
  if (!match) {
    return "I am not sure who that is just yet. Your family can add them for me, and then I can tell you all about them.";
  }
  const name = match.preferred_name ?? match.full_name;
  const rel = match.relationship_label ? ` is your ${match.relationship_label.toLowerCase()}` : " is part of your family";
  const where = match.location_description ? `. ${name} lives ${match.location_description}` : "";
  const visit = match.visit_frequency ? `. ${match.visit_frequency}` : "";
  return `${name}${rel}${where}${visit}. I can show you a photo if you go to your People page.`;
}

function familyTreeReply(ctx: NikkiContext): string {
  const match = ctx.person?.match;
  if (!match) return personReply(ctx);
  const name = match.preferred_name ?? match.full_name;
  const relatedTo = ctx.person?.relationOf ? ` ${name} is close with ${ctx.person.relationOf}.` : "";
  const base = match.relationship_label ? `${name} is your ${match.relationship_label.toLowerCase()}.` : `${name} is part of your family.`;
  return `${base}${relatedTo}`;
}

function weatherReply(ctx: NikkiContext): string {
  const w = ctx.weather;
  if (!w) return "I do not have the weather just now, but I will let you know if anything changes.";
  const safety = w.safetySuggestion ? ` ${w.safetySuggestion}` : "";
  return `${w.summary}. ${w.clothingSuggestion}${safety}`;
}

function medicationReply(ctx: NikkiContext): string {
  const meds = (ctx.reminders ?? []).filter((r) => r.reminder_type === "medication");
  if (meds.length === 0) {
    return "I do not have any medication notes from your family right now. If you are unsure about your medicine, it is always best to ask your doctor or pharmacist.";
  }
  const first = meds[0];
  const detail = first.instructions ?? first.nikki_message ?? "";
  return `Here is what your family noted: ${detail} If anything feels unclear, please check with your doctor.`;
}

function lostReply(ctx: NikkiContext): string {
  const contact = ctx.emergency?.contacts[0]?.name ?? "your family";
  return `That is okay. I am right here with you, and we will sort this out together. I can share your location with ${contact} and help guide you home. Would you like me to do that now?`;
}

function emergencyReply(ctx: NikkiContext): string {
  const contact = ctx.emergency?.contacts[0]?.name ?? "your family";
  return `I am here with you. I am letting ${contact} know right now and sharing where you are. If this feels serious, please call your local emergency number. Stay as calm as you can — help is on the way.`;
}

function companionReply(ctx: NikkiContext): string {
  const name = ctx.preferredName ? `, ${ctx.preferredName}` : "";
  return `I am here for you${name}. You can ask me what you are doing today, about your family, or about the weather. I can also help right away if you ever feel lost.`;
}

export class MockNikkiAI implements NikkiAIProvider {
  async generateResponse(input: NikkiAIInput): Promise<NikkiAIResponse> {
    const ctx = input.context;
    switch (ctx.intent) {
      case "today_schedule":
        return { text: todayReply(ctx), safetyLevel: "normal", followUps: ["Who is coming today?", "What is the weather?"] };
      case "person_lookup":
        return { text: personReply(ctx), safetyLevel: "normal", followUps: ["Who is coming today?", "What am I doing today?"] };
      case "family_tree_question":
        return { text: familyTreeReply(ctx), safetyLevel: "normal", followUps: ["Show me my family", "What am I doing today?"] };
      case "weather_question":
        return { text: weatherReply(ctx), safetyLevel: "normal", followUps: ["What am I doing today?", "Who is coming today?"] };
      case "medication_reminder":
        return { text: medicationReply(ctx), safetyLevel: "caution", followUps: ["What am I doing today?"] };
      case "lost":
        return { text: lostReply(ctx), safetyLevel: "caution", followUps: ["Yes, share my location", "Call family"] };
      case "emergency":
        return { text: emergencyReply(ctx), safetyLevel: "emergency", followUps: ["Call family"] };
      default:
        return { text: companionReply(ctx), safetyLevel: "normal", followUps: ["What am I doing today?", "Who is coming today?", "What is the weather?"] };
    }
  }
}

export const nikkiAI: NikkiAIProvider = new MockNikkiAI();
