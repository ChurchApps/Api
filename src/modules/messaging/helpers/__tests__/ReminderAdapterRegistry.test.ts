import { ReminderAdapterRegistry, ReminderAdapter } from "../ReminderAdapter.js";

const fakeAdapter: ReminderAdapter = {
  entityType: "widget",
  category: "event_reminders",
  contentType: "widget",
  loadEntity: async () => ({}),
  getOccurrences: async () => [],
  loadRecipients: async () => [],
  link: () => ""
};

describe("ReminderAdapterRegistry", () => {
  it("registers and retrieves adapters by entityType", () => {
    expect(ReminderAdapterRegistry.has("widget")).toBe(false);
    ReminderAdapterRegistry.register(fakeAdapter);
    expect(ReminderAdapterRegistry.has("widget")).toBe(true);
    expect(ReminderAdapterRegistry.get("widget")).toBe(fakeAdapter);
    expect(ReminderAdapterRegistry.get("nope")).toBeUndefined();
  });
});
