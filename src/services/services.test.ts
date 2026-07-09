import { DEMO_OLDER_ADULT_ID } from "../data/demo";
import { createPerson, listPeople } from "./peopleService";
import { createEvent, listEvents, listTodayEvents } from "./calendarService";
import { listReminders } from "./reminderService";
import { getLatestLocation, recordLocation } from "./locationService";
import { createEmergencyContact, createEmergencyEvent, listEmergencyContacts, listEmergencyEvents } from "./emergencyService";
import { generatePairingCode, redeemPairingCode } from "./pairingService";

const id = DEMO_OLDER_ADULT_ID;

describe("people (demo)", () => {
  it("returns seeded family and can add a new person", async () => {
    const before = await listPeople(id);
    expect(before.some((p) => p.preferred_name === "Sophie")).toBe(true);
    await createPerson(id, { full_name: "Lisa de Vries", relationship_label: "Granddaughter" });
    const after = await listPeople(id);
    expect(after.some((p) => p.full_name === "Lisa de Vries")).toBe(true);
  });
});

describe("calendar (demo)", () => {
  it("has today's doctor appointment and can add an event", async () => {
    const today = await listTodayEvents(id);
    expect(today.some((e) => e.title === "Doctor appointment")).toBe(true);
    await createEvent(id, { title: "Physio", start_at: new Date().toISOString() });
    const all = await listEvents(id);
    expect(all.some((e) => e.title === "Physio")).toBe(true);
  });
});

describe("reminders (demo)", () => {
  it("returns active seeded reminders", async () => {
    const reminders = await listReminders(id);
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((r) => r.active)).toBe(true);
  });
});

describe("location (demo)", () => {
  it("records a location and reads the latest back", async () => {
    await recordLocation(id, { latitude: 52.09, longitude: 5.12, accuracy: 10 });
    const latest = await getLatestLocation(id);
    expect(latest?.latitude).toBeCloseTo(52.09);
  });
});

describe("emergency (demo)", () => {
  it("lists seeded contacts and records an event", async () => {
    const contacts = await listEmergencyContacts(id);
    expect(contacts.length).toBeGreaterThan(0);
    await createEmergencyContact(id, { name: "Dr. Jansen", phone: "555", relationship: "Doctor" });
    await createEmergencyEvent(id, { event_type: "lost", detected_urgency: "medium" });
    const events = await listEmergencyEvents(id);
    expect(events.some((e) => e.event_type === "lost" && e.notified_admins)).toBe(true);
  });
});

describe("pairing (demo)", () => {
  it("generates a six-digit code and validates redemption", async () => {
    const code = await generatePairingCode(id, "admin");
    expect(code).toMatch(/^\d{6}$/);
    expect((await redeemPairingCode("12")).ok).toBe(false);
    const redeemed = await redeemPairingCode("123456");
    expect(redeemed.ok).toBe(true);
  });
});
