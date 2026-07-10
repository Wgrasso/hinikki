// src/services/reminderService.ts — reminders (live Supabase or demo store).
import { supabase } from "../lib/supabase";
import { getDemoState, mutateDemo, newId } from "../data/demoDb";
import type { Reminder } from "../types/database";
import { isSameDay } from "../utils/format";

const REMINDER_COLUMNS =
  "id, older_adult_id, title, reminder_type, recurrence_rule, scheduled_at, nikki_message, instructions, requires_confirmation, priority_level, active";

export async function listReminders(olderAdultId: string): Promise<Reminder[]> {
  if (!supabase) {
    const s = await getDemoState();
    return s.reminders
      .filter((r) => r.older_adult_id === olderAdultId && r.active)
      .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  }
  const { data, error } = await supabase
    .from("reminders")
    .select(REMINDER_COLUMNS)
    .eq("older_adult_id", olderAdultId)
    .eq("active", true)
    .order("scheduled_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Reminder[];
}

// Reminders relevant to today's dashboard: recurring and "anytime" (no scheduled_at)
// reminders apply every day, but a one-off reminder only counts on the day it was set for —
// it should be gone from "today" once that day has passed, same as a calendar event.
export async function listTodayReminders(olderAdultId: string): Promise<Reminder[]> {
  const all = await listReminders(olderAdultId);
  return all.filter((r) => r.recurrence_rule || !r.scheduled_at || isSameDay(r.scheduled_at));
}

export type NewReminder = {
  title: string;
  reminder_type?: string | null;
  recurrence_rule?: string | null;
  scheduled_at?: string | null;
  nikki_message?: string | null;
  instructions?: string | null;
  requires_confirmation?: boolean;
  priority_level?: "low" | "normal" | "high";
};

export async function createReminder(olderAdultId: string, input: NewReminder): Promise<Reminder> {
  if (!supabase) {
    const reminder: Reminder = {
      id: newId("rm"),
      older_adult_id: olderAdultId,
      title: input.title,
      reminder_type: input.reminder_type ?? null,
      recurrence_rule: input.recurrence_rule ?? null,
      scheduled_at: input.scheduled_at ?? null,
      nikki_message: input.nikki_message ?? null,
      instructions: input.instructions ?? null,
      requires_confirmation: input.requires_confirmation ?? false,
      priority_level: input.priority_level ?? "normal",
      active: true,
    };
    await mutateDemo((s) => {
      s.reminders.push(reminder);
    });
    return reminder;
  }
  const { data, error } = await supabase
    .from("reminders")
    .insert({ older_adult_id: olderAdultId, ...input })
    .select(REMINDER_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as Reminder;
}

export async function confirmReminder(
  reminderId: string,
  olderAdultId: string,
  method: "tap" | "voice" = "tap",
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("reminder_confirmations")
    .insert({ reminder_id: reminderId, older_adult_id: olderAdultId, confirmation_method: method });
  if (error) throw new Error(error.message);
}

export type LatestConfirmation = { confirmed_at: string; confirmation_method: string | null };

// The most recent confirmation per reminder, so the admin schedule can show a quiet
// "Confirmed 17:32 by voice" line under reminders that ask for one.
export async function listLatestConfirmations(olderAdultId: string): Promise<Record<string, LatestConfirmation>> {
  if (!supabase) return {}; // the demo store keeps no confirmations yet
  const { data, error } = await supabase
    .from("reminder_confirmations")
    .select("reminder_id, confirmed_at, confirmation_method")
    .eq("older_adult_id", olderAdultId)
    .order("confirmed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const latest: Record<string, LatestConfirmation> = {};
  for (const row of (data ?? []) as Array<{ reminder_id: string; confirmed_at: string; confirmation_method: string | null }>) {
    if (!(row.reminder_id in latest)) {
      latest[row.reminder_id] = { confirmed_at: row.confirmed_at, confirmation_method: row.confirmation_method };
    }
  }
  return latest;
}

export async function updateReminder(reminderId: string, patch: Partial<NewReminder>): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      const i = s.reminders.findIndex((r) => r.id === reminderId);
      if (i >= 0) s.reminders[i] = { ...s.reminders[i], ...patch };
    });
    return;
  }
  const { error } = await supabase.from("reminders").update(patch).eq("id", reminderId);
  if (error) throw new Error(error.message);
}

export async function deleteReminder(reminderId: string): Promise<void> {
  if (!supabase) {
    await mutateDemo((s) => {
      s.reminders = s.reminders.filter((r) => r.id !== reminderId);
    });
    return;
  }
  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) throw new Error(error.message);
}
