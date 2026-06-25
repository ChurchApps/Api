jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "test-secret" } }));

import { ReminderTokenHelper } from "../ReminderTokenHelper.js";

describe("ReminderTokenHelper", () => {
  it("round-trips a valid token", () => {
    const token = ReminderTokenHelper.create("a1", "c1", "accept", new Date(Date.now() + 86400000));
    expect(ReminderTokenHelper.verify(token)).toEqual({ assignmentId: "a1", churchId: "c1", action: "accept" });
  });

  it("rejects an expired token", () => {
    const token = ReminderTokenHelper.create("a1", "c1", "decline", new Date(Date.now() - 1000));
    expect(ReminderTokenHelper.verify(token)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = ReminderTokenHelper.create("a1", "c1", "accept", new Date(Date.now() + 86400000));
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "A" ? "B" : "A"); // same length, wrong sig
    expect(ReminderTokenHelper.verify(tampered)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(ReminderTokenHelper.verify(undefined)).toBeNull();
    expect(ReminderTokenHelper.verify("garbage")).toBeNull();
    expect(ReminderTokenHelper.verify("a.b.c")).toBeNull();
  });
});
