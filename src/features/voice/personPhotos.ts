// src/features/voice/personPhotos.ts — a tiny name→face lookup for the live transcript.
// When either the elder or Nikki says a family member's name, we can quietly slip that
// person's photo into the captions so a face joins the words. Built once per session
// (photos rarely change mid-call) and matched with a cheap whole-word scan.
import { listPeople, getPhotoUrl } from "../../services/peopleService";

export type PersonPhoto = { name: string; photoUri: string };

// Only people the family has cleared for Nikki to mention AND who have a face on file.
export async function loadPersonPhotos(olderAdultId: string): Promise<PersonPhoto[]> {
  const people = await listPeople(olderAdultId);
  const eligible = people.filter((p) => p.primary_photo_path && p.can_nikki_mention);
  const resolved = await Promise.all(
    eligible.map(async (p) => {
      const photoUri = await getPhotoUrl(p.primary_photo_path);
      if (!photoUri) return null;
      return { name: p.preferred_name ?? p.full_name, photoUri };
    }),
  );
  return resolved.filter((entry): entry is PersonPhoto => entry !== null);
}

// Escape a name so it can sit safely inside a RegExp source.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive whole-word match of any person's name (or its first word — "Emma"
// still lights up "Emma van Dijk") in the text. Returns the first match's photo, or null.
export function matchPersonPhoto(text: string, people: PersonPhoto[]): string | null {
  for (const person of people) {
    const firstWord = person.name.trim().split(/\s+/)[0];
    for (const term of [person.name, firstWord]) {
      if (!term) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
      if (pattern.test(text)) return person.photoUri;
    }
  }
  return null;
}
