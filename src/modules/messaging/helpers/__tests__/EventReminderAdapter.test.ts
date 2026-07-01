const getReposMock = jest.fn() as jest.MockedFunction<any>;
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: (...a: any[]) => getReposMock(...a) } }));

import { EventReminderAdapter } from "../adapters/EventReminderAdapter.js";

function wire(content: any, membership: any) {
  getReposMock.mockImplementation(async (mod: string) => (mod === "content" ? content : membership));
}

describe("EventReminderAdapter.loadRecipients", () => {
  it("auto + registration: keeps active registrations' linked members, drops null personIds, dedups", async () => {
    const content = {
      registration: {
        loadForEvent: jest.fn(async () => [
          { id: "R1", status: "confirmed", personId: "H1" },
          { id: "R2", status: "cancelled", personId: "H2" }
        ])
      },
      registrationMember: {
        loadForEvent: jest.fn(async () => [
          { registrationId: "R1", personId: "P1" },
          { registrationId: "R1", personId: null }, // free-text attendee — unreachable
          { registrationId: "R2", personId: "P9" }, // cancelled registration
          { registrationId: "R1", personId: "P1" } // duplicate
        ])
      }
    };
    wire(content, {});
    const recipients = await EventReminderAdapter.loadRecipients("CH1", { id: "E1", registrationEnabled: true }, "", "auto");
    expect(recipients.map((r) => r.personId)).toEqual(["P1"]);
  });

  it("auto without registration: falls back to group members, dropping opted-out and unlinked", async () => {
    const membership = {
      groupMember: {
        loadForGroup: jest.fn(async () => [
          { personId: "P1", optedOut: false, email: "a@x.com" },
          { personId: "P2", optedOut: true },
          { personId: null }
        ])
      }
    };
    wire({}, membership);
    const recipients = await EventReminderAdapter.loadRecipients("CH1", { id: "E1", registrationEnabled: false, groupId: "G1" }, "", "auto");
    expect(recipients.map((r) => r.personId)).toEqual(["P1"]);
  });

  it("registrantsHoh: one recipient per active registration's personId", async () => {
    const content = {
      registration: {
        loadForEvent: jest.fn(async () => [
          { id: "R1", status: "confirmed", personId: "H1" },
          { id: "R2", status: "pending", personId: null }, // unidentifiable HoH
          { id: "R3", status: "confirmed", personId: "H1" } // dup HoH
        ])
      },
      registrationMember: { loadForEvent: jest.fn(async () => []) }
    };
    wire(content, {});
    const recipients = await EventReminderAdapter.loadRecipients("CH1", { id: "E1", registrationEnabled: true }, "", "registrantsHoh");
    expect(recipients.map((r) => r.personId)).toEqual(["H1"]);
  });

  it("event with no registration and no group yields zero recipients", async () => {
    wire({}, {});
    const recipients = await EventReminderAdapter.loadRecipients("CH1", { id: "E1", registrationEnabled: false }, "", "auto");
    expect(recipients).toEqual([]);
  });
});

describe("EventReminderAdapter.getOccurrences (non-recurring)", () => {
  it("returns one civil-local occurrence for a single event in the window", async () => {
    const entity = { id: "E1", start: new Date(2026, 11, 25, 10, 0, 0) }; // local civil 2026-12-25 10:00
    const occ = await EventReminderAdapter.getOccurrences(entity, new Date(2026, 11, 1), new Date(2027, 0, 1));
    expect(occ).toEqual([{ startLocalDate: "2026-12-25", startLocalISO: "2026-12-25T10:00:00" }]);
  });

  it("excludes a single event outside the window", async () => {
    const entity = { id: "E1", start: new Date(2027, 5, 1, 10, 0, 0) };
    const occ = await EventReminderAdapter.getOccurrences(entity, new Date(2026, 11, 1), new Date(2027, 0, 1));
    expect(occ).toEqual([]);
  });
});
