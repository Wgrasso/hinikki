// src/types/database.ts — row shapes that mirror the Supabase schema (blueprints/hinikki.schema.sql).
// These are the validated shapes our services return; never trust a raw network body without checking.

export type AppRole = "older_adult" | "admin" | "caregiver" | "viewer";
export type AppMode = "user" | "admin";
export type PermissionLevel = "owner" | "family_admin" | "caregiver" | "viewer";
export type IntendedRole = "older_adult" | "admin";

export type Group = { id: string; name: string; join_code: string };
export type GroupRosterEntry = { id: string; display_name: string; has_owner: boolean };
// Raw shape returned by the get_my_group() RPC (snake_case). The camelCase service-facing
// shape used across the app is `MyGroup` in src/services/groupService.ts.
export type MyGroupRow = {
  mode: AppMode;
  group_id: string;
  join_code: string;
  older_adult_id: string | null;
};

export type Profile = {
  id: string;
  auth_user_id: string;
  role: AppRole;
  selected_mode: AppMode | null;
  display_name: string | null;
};

export type OlderAdultProfile = {
  id: string;
  owner_profile_id: string | null;
  display_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  primary_language: string;
  home_address: string | null;
  setup_status: "in_progress" | "ready";
  created_by_admin_id: string | null;
};

export type AdminProfile = {
  id: string;
  auth_user_id: string;
  profile_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
};

export type AdminLink = {
  id: string;
  admin_id: string;
  older_adult_id: string;
  relationship_to_user: string | null;
  permission_level: PermissionLevel;
  status: "active" | "revoked";
};

export type FamilyPerson = {
  id: string;
  older_adult_id: string;
  full_name: string;
  preferred_name: string | null;
  relationship_label: string | null;
  phone: string | null;
  address: string | null;
  location_description: string | null;
  visit_frequency: string | null;
  important_notes: string | null;
  conversation_hints: string | null;
  can_nikki_mention: boolean;
  can_contact_in_emergency: boolean;
  can_be_called_by_nikki: boolean;
  is_admin: boolean;
  preferred_contact_method: string | null;
  primary_photo_path: string | null;
};

export type FamilyRelationship = {
  id: string;
  older_adult_id: string;
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
  notes: string | null;
};

export type CalendarEvent = {
  id: string;
  older_adult_id: string;
  title: string;
  event_type: string | null;
  start_at: string;
  end_at: string | null;
  location_name: string | null;
  location_address: string | null;
  what_to_bring: string | null;
  transport_notes: string | null;
  companion: string | null;
  announce_lead_minutes: number | null;
  nikki_before_event_message: string | null;
  calming_explanation: string | null;
  user_friendly_summary: string | null;
  priority_level: "low" | "normal" | "high";
  may_cause_stress: boolean;
  completion_status: "scheduled" | "done" | "missed" | "cancelled";
};

export type Reminder = {
  id: string;
  older_adult_id: string;
  title: string;
  reminder_type: string | null;
  scheduled_at: string | null;
  nikki_message: string | null;
  instructions: string | null;
  requires_confirmation: boolean;
  priority_level: "low" | "normal" | "high";
  active: boolean;
};

export type SafeLocation = {
  id: string;
  older_adult_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  location_type: string | null;
};

export type LocationUpdate = {
  id: string;
  older_adult_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  battery_level: number | null;
  emergency_flag: boolean;
  created_at: string;
};

export type EmergencyContact = {
  id: string;
  older_adult_id: string;
  person_id: string | null;
  name: string;
  phone: string | null;
  relationship: string | null;
  priority_order: number;
  active: boolean;
};

export type EmergencyEvent = {
  id: string;
  older_adult_id: string;
  event_type: string;
  user_message: string | null;
  detected_urgency: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "resolved";
  notified_admins: boolean;
  created_at: string;
};

export type WeatherPreferences = {
  id: string;
  older_adult_id: string;
  weather_location: string | null;
  cold_threshold: number;
  heat_threshold: number;
  rain_reminder_enabled: boolean;
  custom_weather_advice: string | null;
};

export type ChatInteraction = {
  id: string;
  older_adult_id: string;
  sender: "user" | "nikki";
  message: string | null;
  nikki_response: string | null;
  intent: string | null;
  safety_level: "normal" | "caution" | "emergency";
  created_at: string;
};

export type AppSettings = {
  id: string;
  older_adult_id: string;
  language: string;
  text_size: "large" | "xlarge" | "xxlarge";
  high_contrast_mode: boolean;
  location_sharing_enabled: boolean;
  weather_enabled: boolean;
};
