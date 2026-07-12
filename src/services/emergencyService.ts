// src/services/emergencyService.ts — emergency contacts + the lost/distress event log.
import { notifyAdminsOfEmergency } from "./pushService";
import { supabase } from "../lib/supabase";
import { getDemoState, mutateDemo, newId } from "../data/demoDb";
import type { EmergencyContact, EmergencyEvent } from "../types/database";

export async function listEmergencyContacts(olderAdultId: string): Promise<EmergencyContact[]> {
  if (!supabase) {
    const s = await getDemoState();
    return s.emergencyContacts
      .filter((c) => c.older_adult_id === olderAdultId && c.active)
      .sort((a, b) => a.priority_order - b.priority_order);
  }
  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("id, older_adult_id, person_id, name, phone, relationship, priority_order, active")
    .eq("older_adult_id", olderAdultId)
    .eq("active", true)
    .order("priority_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmergencyContact[];
}

export async function createEmergencyContact(
  olderAdultId: string,
  input: { name: string; phone?: string | null; relationship?: string | null; priority_order?: number },
): Promise<EmergencyContact> {
  if (!supabase) {
    const contact: EmergencyContact = {
      id: newId("ec"),
      older_adult_id: olderAdultId,
      person_id: null,
      name: input.name,
      phone: input.phone ?? null,
      relationship: input.relationship ?? null,
      priority_order: input.priority_order ?? 1,
      active: true,
    };
    await mutateDemo((s) => {
      s.emergencyContacts.push(contact);
    });
    return contact;
  }
  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert({ older_adult_id: olderAdultId, ...input })
    .select("id, older_adult_id, person_id, name, phone, relationship, priority_order, active")
    .single();
  if (error) throw new Error(error.message);
  return data as EmergencyContact;
}

export type NewEmergencyEvent = {
  event_type: string;
  user_message?: string | null;
  detected_urgency: "low" | "medium" | "high" | "critical";
  location_update_id?: string | null;
};

export async function createEmergencyEvent(
  olderAdultId: string,
  input: NewEmergencyEvent,
): Promise<EmergencyEvent> {
  const event: EmergencyEvent = {
    id: newId("em"),
    older_adult_id: olderAdultId,
    event_type: input.event_type,
    user_message: input.user_message ?? null,
    detected_urgency: input.detected_urgency,
    status: "open",
    notified_admins: true,
    location_update_id: input.location_update_id ?? null,
    created_at: new Date().toISOString(),
  };
  if (!supabase) {
    await mutateDemo((s) => {
      s.emergencyEvents.push(event);
    });
    return event;
  }
  const { data, error } = await supabase
    .from("emergency_events")
    .insert({
      older_adult_id: olderAdultId,
      event_type: input.event_type,
      user_message: input.user_message ?? null,
      detected_urgency: input.detected_urgency,
      location_update_id: input.location_update_id ?? null,
      notified_admins: true,
    })
    .select("id, older_adult_id, event_type, user_message, detected_urgency, status, notified_admins, location_update_id, created_at")
    .single();
  if (error) throw new Error(error.message);
  // Push the family right away — an emergency must reach them even with the app closed,
  // unlike the in-app-only alert banner. Fire-and-forget so it never blocks the call flow.
  void notifyAdminsOfEmergency(olderAdultId, input.event_type).catch(() => undefined);
  return data as EmergencyEvent;
}

export async function listEmergencyEvents(olderAdultId: string): Promise<EmergencyEvent[]> {
  if (!supabase) {
    const s = await getDemoState();
    return [...s.emergencyEvents]
      .filter((e) => e.older_adult_id === olderAdultId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase
    .from("emergency_events")
    .select("id, older_adult_id, event_type, user_message, detected_urgency, status, notified_admins, location_update_id, created_at")
    .eq("older_adult_id", olderAdultId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmergencyEvent[];
}

export async function resolveEmergencyEvent(id: string): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      const i = s.emergencyEvents.findIndex((e) => e.id === id);
      if (i >= 0) s.emergencyEvents[i] = { ...s.emergencyEvents[i], status: "resolved" };
    });
    return;
  }
  const { error } = await supabase.from("emergency_events").update({ status: "resolved" }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateEmergencyContact(
  id: string,
  patch: { name?: string; phone?: string | null; relationship?: string | null; priority_order?: number },
): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      const i = s.emergencyContacts.findIndex((c) => c.id === id);
      if (i >= 0) s.emergencyContacts[i] = { ...s.emergencyContacts[i], ...patch };
    });
    return;
  }
  const { error } = await supabase.from("emergency_contacts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
