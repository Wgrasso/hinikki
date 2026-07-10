// src/data/demo.ts — realistic seed data for Anna and her family.
// Used as the render fallback when Supabase env is absent (Expo Go demo / web preview).
// When a real Supabase project is configured, services read live data instead.
import type {
  CalendarEvent,
  EmergencyContact,
  FamilyPerson,
  FamilyRelationship,
  OlderAdultProfile,
  Reminder,
  SafeLocation,
} from "../types/database";

export const DEMO_OLDER_ADULT_ID = "demo-anna";

function isoToday(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const demoOlderAdult: OlderAdultProfile = {
  id: DEMO_OLDER_ADULT_ID,
  owner_profile_id: "demo-anna-profile",
  display_name: "Anna de Vries",
  preferred_name: "Anna",
  date_of_birth: "1946-03-12",
  primary_language: "en",
  home_address: "Lindenlaan 14, Utrecht",
  setup_status: "ready",
  created_by_admin_id: "demo-sophie-admin",
};

export const demoPeople: FamilyPerson[] = [
  {
    id: "p-sophie",
    older_adult_id: DEMO_OLDER_ADULT_ID,
    full_name: "Sophie de Vries",
    preferred_name: "Sophie",
    relationship_label: "Daughter",
    date_of_birth: null,
    pronunciation_help: null,
    phone: "+31 6 1234 5678",
    address: "Amsterdam",
    location_description: "Amsterdam, about an hour away",
    visit_frequency: "Usually visits on Thursdays",
    important_notes: "Brings fresh flowers and stays for lunch.",
    conversation_hints: "Loves to hear about the garden.",
    can_nikki_mention: true,
    can_contact_in_emergency: true,
    can_be_called_by_nikki: false,
    is_admin: true,
    preferred_contact_method: "phone",
    primary_photo_path: null,
  },
  {
    id: "p-mark",
    older_adult_id: DEMO_OLDER_ADULT_ID,
    full_name: "Mark de Vries",
    preferred_name: "Mark",
    relationship_label: "Son",
    date_of_birth: null,
    pronunciation_help: null,
    phone: "+31 6 8765 4321",
    address: "Utrecht",
    location_description: "Nearby in Utrecht",
    visit_frequency: "Drives Anna to appointments",
    important_notes: "Married to Emma. Knows the way to every doctor.",
    conversation_hints: "Ask about his children, Tom and Lisa.",
    can_nikki_mention: true,
    can_contact_in_emergency: true,
    can_be_called_by_nikki: false,
    is_admin: false,
    preferred_contact_method: "phone",
    primary_photo_path: null,
  },
  {
    id: "p-emma",
    older_adult_id: DEMO_OLDER_ADULT_ID,
    full_name: "Emma de Vries",
    preferred_name: "Emma",
    relationship_label: "Daughter-in-law",
    date_of_birth: null,
    pronunciation_help: null,
    phone: null,
    address: "Utrecht",
    location_description: "Utrecht, with Mark",
    visit_frequency: "Comes along on weekend visits",
    important_notes: "Mark's wife. A wonderful cook.",
    conversation_hints: null,
    can_nikki_mention: true,
    can_contact_in_emergency: false,
    can_be_called_by_nikki: false,
    is_admin: false,
    preferred_contact_method: null,
    primary_photo_path: null,
  },
  {
    id: "p-tom",
    older_adult_id: DEMO_OLDER_ADULT_ID,
    full_name: "Tom de Vries",
    preferred_name: "Tom",
    relationship_label: "Grandson",
    date_of_birth: null,
    pronunciation_help: null,
    phone: null,
    address: "Utrecht",
    location_description: "Utrecht",
    visit_frequency: "Visits during school holidays",
    important_notes: "Mark and Emma's son. Plays football.",
    conversation_hints: "He is 12 and loves football.",
    can_nikki_mention: true,
    can_contact_in_emergency: false,
    can_be_called_by_nikki: false,
    is_admin: false,
    preferred_contact_method: null,
    primary_photo_path: null,
  },
  {
    id: "p-greet",
    older_adult_id: DEMO_OLDER_ADULT_ID,
    full_name: "Greet Bakker",
    preferred_name: "Greet",
    relationship_label: "Neighbour",
    date_of_birth: null,
    pronunciation_help: null,
    phone: "+31 6 5555 1212",
    address: "Lindenlaan 16, Utrecht",
    location_description: "Next door",
    visit_frequency: "Pops in for coffee",
    important_notes: "Lives next door and has a spare key.",
    conversation_hints: null,
    can_nikki_mention: true,
    can_contact_in_emergency: true,
    can_be_called_by_nikki: false,
    is_admin: false,
    preferred_contact_method: "phone",
    primary_photo_path: null,
  },
];

export const demoRelationships: FamilyRelationship[] = [
  { id: "r-1", older_adult_id: DEMO_OLDER_ADULT_ID, person_a_id: "p-mark", person_b_id: "p-emma", relationship_type: "spouse_of", notes: null },
  { id: "r-2", older_adult_id: DEMO_OLDER_ADULT_ID, person_a_id: "p-tom", person_b_id: "p-mark", relationship_type: "child_of", notes: null },
];

export function buildDemoEvents(): CalendarEvent[] {
  return [
    {
      id: "e-doctor",
      older_adult_id: DEMO_OLDER_ADULT_ID,
      title: "Doctor appointment",
      event_type: "medical",
      start_at: isoToday(11, 30),
      end_at: isoToday(12, 15),
      location_name: "Dr. Jansen's practice",
      location_address: "Gezondheidscentrum, Utrecht",
      what_to_bring: "your insurance card and your blue medication list",
      transport_notes: "Mark will pick you up at 11:00.",
      companion: "Mark",
      announce_lead_minutes: 30,
      nikki_before_event_message:
        "Today you have a doctor's appointment at 11:30. Mark will pick you up at 11:00. You do not need to worry, he knows where to go. Please bring your insurance card and your blue medication list.",
      calming_explanation: "It is just a routine check. Mark will be with you the whole time.",
      user_friendly_summary: "Doctor appointment with Mark",
      priority_level: "high",
      may_cause_stress: true,
      completion_status: "scheduled",
    },
    {
      id: "e-tea",
      older_adult_id: DEMO_OLDER_ADULT_ID,
      title: "Afternoon tea with Greet",
      event_type: "social",
      start_at: isoToday(15, 30),
      end_at: isoToday(16, 30),
      location_name: "Home",
      location_address: "Lindenlaan 14",
      what_to_bring: null,
      transport_notes: null,
      companion: "Greet",
      announce_lead_minutes: null,
      nikki_before_event_message: "This afternoon Greet from next door is coming over for a cup of tea at half past three.",
      calming_explanation: "A nice, relaxed visit at home.",
      user_friendly_summary: "Tea with Greet at home",
      priority_level: "normal",
      may_cause_stress: false,
      completion_status: "scheduled",
    },
  ];
}

export function buildDemoReminders(): Reminder[] {
  return [
    {
      id: "rm-morning",
      older_adult_id: DEMO_OLDER_ADULT_ID,
      title: "Water the plants",
      reminder_type: "routine",
      recurrence_rule: "Every day",
      scheduled_at: isoToday(8, 0),
      nikki_message: "It is a good morning to water the plants on the windowsill.",
      instructions: null,
      requires_confirmation: true,
      priority_level: "high",
      active: true,
    },
    {
      id: "rm-water",
      older_adult_id: DEMO_OLDER_ADULT_ID,
      title: "Have a glass of water",
      reminder_type: "hydration",
      recurrence_rule: null,
      scheduled_at: isoToday(13, 0),
      nikki_message: "A gentle reminder to have a glass of water. It helps you feel your best.",
      instructions: null,
      requires_confirmation: false,
      priority_level: "normal",
      active: true,
    },
  ];
}

export const demoSafeLocations: SafeLocation[] = [
  { id: "s-home", older_adult_id: DEMO_OLDER_ADULT_ID, name: "Home", address: "Lindenlaan 14, Utrecht", latitude: 52.0907, longitude: 5.1214, radius_meters: 120, location_type: "home" },
  { id: "s-sophie", older_adult_id: DEMO_OLDER_ADULT_ID, name: "Sophie's house", address: "Amsterdam", latitude: 52.3676, longitude: 4.9041, radius_meters: 150, location_type: "family" },
];

export const demoEmergencyContacts: EmergencyContact[] = [
  { id: "ec-mark", older_adult_id: DEMO_OLDER_ADULT_ID, person_id: "p-mark", name: "Mark de Vries", phone: "+31 6 8765 4321", relationship: "Son", priority_order: 1, active: true },
  { id: "ec-sophie", older_adult_id: DEMO_OLDER_ADULT_ID, person_id: "p-sophie", name: "Sophie de Vries", phone: "+31 6 1234 5678", relationship: "Daughter", priority_order: 2, active: true },
];
