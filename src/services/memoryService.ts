// src/services/memoryService.ts — read/write the life memories Nikki can gently bring up.
// Live Supabase when configured (write RLS = managing admins); an in-memory demo store otherwise.
import { supabase } from "../lib/supabase";
import { newId } from "../data/demoDb";
import type { PersonMemory } from "../types/database";

const MEMORY_COLUMNS = "id, older_adult_id, person_id, title, description, approximate_date, can_nikki_mention";

export type NewMemory = {
  person_id?: string | null;
  title: string;
  description?: string | null;
  approximate_date?: string | null;
  can_nikki_mention?: boolean;
};

// demoDb has no memories store, so demo mode keeps them here for the session (newest first).
let demoMemories: PersonMemory[] = [];

export async function listMemories(olderAdultId: string): Promise<PersonMemory[]> {
  if (!supabase) {
    return demoMemories.filter((m) => m.older_adult_id === olderAdultId);
  }
  const { data, error } = await supabase
    .from("person_memories")
    .select(MEMORY_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PersonMemory[];
}

export async function createMemory(olderAdultId: string, input: NewMemory): Promise<PersonMemory> {
  if (!supabase) {
    const memory: PersonMemory = {
      id: newId("mem"),
      older_adult_id: olderAdultId,
      person_id: input.person_id ?? null,
      title: input.title,
      description: input.description ?? null,
      approximate_date: input.approximate_date ?? null,
      can_nikki_mention: input.can_nikki_mention ?? true,
    };
    demoMemories = [memory, ...demoMemories];
    return memory;
  }
  const { data, error } = await supabase
    .from("person_memories")
    .insert({ older_adult_id: olderAdultId, ...input })
    .select(MEMORY_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as PersonMemory;
}

export async function updateMemory(id: string, patch: Partial<NewMemory>): Promise<void> {
  if (!supabase) {
    demoMemories = demoMemories.map((m) => (m.id === id ? { ...m, ...patch } : m));
    return;
  }
  const { error } = await supabase.from("person_memories").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMemory(id: string): Promise<void> {
  if (!supabase) {
    demoMemories = demoMemories.filter((m) => m.id !== id);
    return;
  }
  const { error } = await supabase.from("person_memories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
