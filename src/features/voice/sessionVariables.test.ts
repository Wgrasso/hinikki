// Tests for the pure dynamic-variable formatters — the personalization payload the ElevenLabs
// agent receives. These run without the voice SDK (pure functions over row types).
import { formatFamily, formatMedicationNotes, formatSchedule, formatWeather } from "./sessionVariables";
import type { CalendarEvent, FamilyPerson, Reminder } from "../../types/database";
import type { WeatherSnapshot } from "../../types/domain";

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e1",
    older_adult_id: "oa1",
    title: "Doctor visit",
    event_type: null,
    start_at: "2026-07-09T10:30:00.000Z",
    end_at: null,
    location_name: null,
    location_address: null,
    what_to_bring: null,
    transport_notes: null,
    companion: null,
    announce_lead_minutes: null,
    nikki_before_event_message: null,
    calming_explanation: null,
    user_friendly_summary: null,
    priority_level: "normal",
    may_cause_stress: false,
    completion_status: "scheduled",
    ...overrides,
  };
}

function person(overrides: Partial<FamilyPerson>): FamilyPerson {
  return {
    id: "p1",
    older_adult_id: "oa1",
    full_name: "Emma de Vries",
    preferred_name: "Emma",
    relationship_label: "Daughter",
    phone: "0612345678",
    address: "Somewhere 1",
    location_description: null,
    visit_frequency: null,
    important_notes: null,
    conversation_hints: null,
    can_nikki_mention: true,
    can_contact_in_emergency: true,
    can_be_called_by_nikki: false,
    is_admin: false,
    preferred_contact_method: null,
    primary_photo_path: null,
    ...overrides,
  };
}

function reminder(overrides: Partial<Reminder>): Reminder {
  return {
    id: "r1",
    older_adult_id: "oa1",
    title: "Blood pressure pill",
    reminder_type: "medication",
    scheduled_at: null,
    nikki_message: null,
    instructions: null,
    requires_confirmation: false,
    priority_level: "normal",
    active: true,
    ...overrides,
  };
}

describe("formatSchedule", () => {
  it("describes an empty day calmly", () => {
    expect(formatSchedule([])).toMatch(/calm, open day/);
  });

  it("prefers the friendly summary and includes what to bring", () => {
    const line = formatSchedule([
      event({ user_friendly_summary: "a visit to Dr. Jansen", what_to_bring: "the blue folder", location_name: "the clinic" }),
    ]);
    expect(line).toContain("a visit to Dr. Jansen");
    expect(line).toContain("at the clinic");
    expect(line).toContain("bring: the blue folder");
    expect(line).not.toContain("Doctor visit");
  });

  it("skips cancelled and done events", () => {
    const line = formatSchedule([
      event({ completion_status: "cancelled" }),
      event({ id: "e2", completion_status: "done" }),
    ]);
    expect(line).toMatch(/calm, open day/);
  });
});

describe("formatFamily", () => {
  it("excludes people Nikki may not mention and never leaks phone/address", () => {
    const text = formatFamily([
      person({}),
      person({ id: "p2", full_name: "Hidden Person", preferred_name: null, can_nikki_mention: false }),
    ]);
    expect(text).toContain("Emma");
    expect(text).not.toContain("Hidden Person");
    expect(text).not.toContain("0612345678");
    expect(text).not.toContain("Somewhere 1");
  });

  it("carries admin-authored notes and hints", () => {
    const text = formatFamily([
      person({ important_notes: "Brings fresh flowers.", conversation_hints: "Loves to hear about the garden." }),
    ]);
    expect(text).toContain("Brings fresh flowers.");
    expect(text).toContain("conversation hint: Loves to hear about the garden.");
  });

  it("handles an empty list", () => {
    expect(formatFamily([])).toMatch(/No family members/);
  });
});

describe("formatMedicationNotes", () => {
  it("only includes active medication reminders", () => {
    const text = formatMedicationNotes([
      reminder({ instructions: "One tablet with breakfast." }),
      reminder({ id: "r2", title: "Water the plants", reminder_type: "task" }),
      reminder({ id: "r3", title: "Old pill", active: false }),
    ]);
    expect(text).toContain("Blood pressure pill: One tablet with breakfast.");
    expect(text).not.toContain("Water the plants");
    expect(text).not.toContain("Old pill");
  });

  it("says so when there are none", () => {
    expect(formatMedicationNotes([])).toMatch(/not added any medication notes/);
  });
});

describe("formatWeather", () => {
  it("combines summary, clothing and safety advice", () => {
    const weather: WeatherSnapshot = {
      temperatureC: 19,
      feelsLikeC: 18,
      rainProbability: 10,
      windKph: 12,
      summary: "Mild and sunny",
      clothingSuggestion: "A light jacket is perfect.",
      safetySuggestion: "The pavement may be slippery.",
    };
    const text = formatWeather(weather);
    expect(text).toContain("Mild and sunny, 19°C (feels like 18°C)");
    expect(text).toContain("A light jacket is perfect.");
    expect(text).toContain("The pavement may be slippery.");
  });
});
