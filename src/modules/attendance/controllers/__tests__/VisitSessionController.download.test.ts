import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class {} }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { view: "v" } }, Environment: {} }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("axios", () => ({ get: jest.fn() }));

import { toSessionDownloadRow } from "../VisitSessionController.js";
import type { Session, VisitSession } from "../../models/index.js";

const session = { id: "s1", groupId: "g1", sessionDate: new Date("2026-01-04") } as Session;
const member = { personId: "p1", displayName: "Tommy Smith" };

describe("toSessionDownloadRow", () => {
  it("carries check-in time, check-out time, picked-up-by and type for a present member", () => {
    const checkinTime = new Date("2026-01-04T08:45:00");
    const checkoutTime = new Date("2026-01-04T10:15:00");
    const vs: VisitSession = { id: "vs1", visitId: "v1", sessionId: "s1", visit: { id: "v1", personId: "p1", checkinType: "guest", checkinTime, checkoutTime, checkedOutBy: "Jane Smith" } };
    expect(toSessionDownloadRow(member, session, vs)).toEqual({
      id: "vs1",
      personId: "p1",
      visitId: "v1",
      sessionDate: session.sessionDate,
      personName: "Tommy Smith",
      status: "present",
      checkinTime,
      checkoutTime,
      checkedOutBy: "Jane Smith",
      checkinType: "guest"
    });
  });

  it("leaves the check-in columns blank for an absent member", () => {
    const row = toSessionDownloadRow(member, session);
    expect(row).toMatchObject({ id: "", visitId: "", status: "absent", checkinTime: null, checkoutTime: null, checkedOutBy: "", checkinType: "" });
  });

  it("leaves check-out blank for a member still checked in", () => {
    const vs: VisitSession = { id: "vs1", visitId: "v1", visit: { personId: "p1", checkinTime: new Date("2026-01-04T08:45:00") } };
    const row = toSessionDownloadRow(member, session, vs);
    expect(row.checkoutTime).toBeNull();
    expect(row.checkedOutBy).toBe("");
  });
});
