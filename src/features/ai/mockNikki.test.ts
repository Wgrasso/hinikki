import { nikkiAI } from "./mockNikki";
import type { CalendarEvent } from "../../types/database";
import type { NikkiContext } from "../../types/domain";

const event: CalendarEvent = {
  id: "e1",
  older_adult_id: "oa",
  title: "Doctor appointment",
  event_type: "medical",
  start_at: "2026-06-29T11:30:00",
  end_at: null,
  location_name: null,
  location_address: null,
  what_to_bring: "your insurance card",
  transport_notes: null,
  nikki_before_event_message: "Today you have a doctor's appointment at 11:30. Mark will pick you up.",
  calming_explanation: null,
  user_friendly_summary: "Doctor appointment",
  priority_level: "high",
  may_cause_stress: true,
  completion_status: "scheduled",
};

describe("MockNikkiAI", () => {
  it("uses the family-written message for today's events", async () => {
    const ctx: NikkiContext = { intent: "today_schedule", preferredName: "Anna", today: { events: [event], people: [] } };
    const res = await nikkiAI.generateResponse({ message: "what am i doing today", context: ctx });
    expect(res.text).toContain("doctor's appointment");
    expect(res.safetyLevel).toBe("normal");
  });

  it("gives warm weather advice", async () => {
    const ctx: NikkiContext = {
      intent: "weather_question",
      preferredName: "Anna",
      weather: { temperatureC: 12, feelsLikeC: 10, rainProbability: 0.6, windKph: 14, summary: "Cloudy", clothingSuggestion: "Wear a warm coat.", safetySuggestion: "Take an umbrella." },
    };
    const res = await nikkiAI.generateResponse({ message: "weather", context: ctx });
    expect(res.text).toContain("umbrella");
  });

  it("escalates emergencies and names a contact", async () => {
    const ctx: NikkiContext = { intent: "emergency", preferredName: "Anna", emergency: { contacts: [{ name: "Mark", phone: "123" }] } };
    const res = await nikkiAI.generateResponse({ message: "I fell", context: ctx });
    expect(res.safetyLevel).toBe("emergency");
    expect(res.text).toContain("Mark");
  });

  it("identifies a person from context", async () => {
    const ctx: NikkiContext = {
      intent: "person_lookup",
      preferredName: "Anna",
      person: {
        match: {
          id: "p1",
          older_adult_id: "oa",
          full_name: "Sophie de Vries",
          preferred_name: "Sophie",
          relationship_label: "Daughter",
          phone: null,
          address: null,
          location_description: "in Amsterdam",
          visit_frequency: "Visits on Thursdays",
          important_notes: null,
          conversation_hints: null,
          can_nikki_mention: true,
          can_contact_in_emergency: true,
          is_admin: false,
          preferred_contact_method: null,
          primary_photo_path: null,
        },
      },
    };
    const res = await nikkiAI.generateResponse({ message: "who is sophie", context: ctx });
    expect(res.text.toLowerCase()).toContain("daughter");
  });
});
