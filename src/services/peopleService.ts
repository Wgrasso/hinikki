// src/services/peopleService.ts — read/write family people, relationships and photos.
// Live Supabase when configured; the seeded demo store otherwise.
import { supabase } from "../lib/supabase";
import { PHOTO_BUCKET } from "../lib/constants";
import { getDemoState, mutateDemo, newId } from "../data/demoDb";
import type { FamilyPerson, FamilyRelationship } from "../types/database";

const PERSON_COLUMNS =
  "id, older_adult_id, full_name, preferred_name, relationship_label, phone, address, location_description, visit_frequency, important_notes, conversation_hints, can_nikki_mention, can_contact_in_emergency, can_be_called_by_nikki, is_admin, preferred_contact_method";

export type NewPerson = {
  full_name: string;
  preferred_name?: string | null;
  relationship_label?: string | null;
  phone?: string | null;
  location_description?: string | null;
  visit_frequency?: string | null;
  important_notes?: string | null;
  conversation_hints?: string | null;
  can_nikki_mention?: boolean;
  can_contact_in_emergency?: boolean;
  can_be_called_by_nikki?: boolean;
};

export async function listPeople(olderAdultId: string): Promise<FamilyPerson[]> {
  if (!supabase) {
    const s = await getDemoState();
    return s.people.filter((p) => p.older_adult_id === olderAdultId);
  }
  const { data, error } = await supabase
    .from("family_people")
    .select(PERSON_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  const people = (data ?? []) as Omit<FamilyPerson, "primary_photo_path">[];
  const photos = await primaryPhotoMap(people.map((p) => p.id));
  return people.map((p) => ({ ...p, primary_photo_path: photos[p.id] ?? null }));
}

async function primaryPhotoMap(personIds: string[]): Promise<Record<string, string>> {
  if (!supabase || personIds.length === 0) return {};
  const { data, error } = await supabase
    .from("person_photos")
    .select("person_id, storage_path, is_primary")
    .in("person_id", personIds);
  if (error) return {};
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as { person_id: string; storage_path: string; is_primary: boolean };
    if (r.is_primary || !map[r.person_id]) map[r.person_id] = r.storage_path;
  }
  return map;
}

export async function getPhotoUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath || !supabase) return null;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function createPerson(olderAdultId: string, input: NewPerson): Promise<FamilyPerson> {
  if (!supabase) {
    const person: FamilyPerson = {
      id: newId("p"),
      older_adult_id: olderAdultId,
      full_name: input.full_name,
      preferred_name: input.preferred_name ?? null,
      relationship_label: input.relationship_label ?? null,
      phone: input.phone ?? null,
      address: null,
      location_description: input.location_description ?? null,
      visit_frequency: input.visit_frequency ?? null,
      important_notes: input.important_notes ?? null,
      conversation_hints: input.conversation_hints ?? null,
      can_nikki_mention: input.can_nikki_mention ?? true,
      can_contact_in_emergency: input.can_contact_in_emergency ?? false,
      can_be_called_by_nikki: input.can_be_called_by_nikki ?? false,
      is_admin: false,
      preferred_contact_method: null,
      primary_photo_path: null,
    };
    await mutateDemo((s) => {
      s.people.push(person);
    });
    return person;
  }
  const { data, error } = await supabase
    .from("family_people")
    .insert({ older_adult_id: olderAdultId, ...input })
    .select(PERSON_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as Omit<FamilyPerson, "primary_photo_path">), primary_photo_path: null };
}

export async function updatePerson(personId: string, patch: Partial<NewPerson>): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      const idx = s.people.findIndex((p) => p.id === personId);
      if (idx >= 0) s.people[idx] = { ...s.people[idx], ...patch };
    });
    return;
  }
  const { error } = await supabase.from("family_people").update(patch).eq("id", personId);
  if (error) throw new Error(error.message);
}

export async function listRelationships(olderAdultId: string): Promise<FamilyRelationship[]> {
  if (!supabase) {
    const s = await getDemoState();
    return s.relationships.filter((r) => r.older_adult_id === olderAdultId);
  }
  const { data, error } = await supabase
    .from("family_relationships")
    .select("id, older_adult_id, person_a_id, person_b_id, relationship_type, notes")
    .eq("older_adult_id", olderAdultId);
  if (error) throw new Error(error.message);
  return (data ?? []) as FamilyRelationship[];
}

export async function uploadPersonPhoto(
  olderAdultId: string,
  personId: string,
  localUri: string,
): Promise<boolean> {
  if (!supabase) return false; // photos sync once a Supabase project is connected
  try {
    const response = await fetch(localUri);
    const blob = await response.arrayBuffer();
    const path = `${olderAdultId}/${personId}/${newId("ph")}.jpg`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) return false;
    await supabase.from("person_photos").insert({ person_id: personId, storage_path: path, is_primary: true });
    return true;
  } catch {
    return false;
  }
}
