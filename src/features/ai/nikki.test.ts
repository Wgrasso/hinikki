import { sendMessage } from "./nikki";
import { DEMO_OLDER_ADULT_ID } from "../../data/demo";
import { listEmergencyEvents } from "../../services/emergencyService";

const id = DEMO_OLDER_ADULT_ID;

describe("sendMessage (demo end-to-end)", () => {
  it("answers 'what am I doing today' from real event data and persists the exchange", async () => {
    const result = await sendMessage(id, "Anna", "What am I doing today?", []);
    expect(result.reply.toLowerCase()).toContain("doctor");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("nikki");
  });

  it("identifies a family member", async () => {
    const result = await sendMessage(id, "Anna", "Who is Sophie?", []);
    expect(result.reply.toLowerCase()).toContain("daughter");
  });

  it("logs an admin-flagged emergency event when the user says they are lost", async () => {
    const result = await sendMessage(id, "Anna", "I am lost", []);
    expect(result.safety).toBe("caution");
    const events = await listEmergencyEvents(id);
    expect(events.some((e) => e.event_type === "lost")).toBe(true);
  });
});
