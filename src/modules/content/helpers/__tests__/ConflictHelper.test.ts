import { ConflictHelper, ConflictContext, ProposedBooking } from "../ConflictHelper.js";

const d = (iso: string) => new Date(iso);

const WINDOW = { windowStart: d("2026-06-01T00:00:00"), windowEnd: d("2027-06-01T00:00:00") };

function baseContext(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    ...WINDOW,
    roomBookings: [],
    resourceBookings: [],
    rooms: [{ id: "room1", churchId: "c1", name: "Fellowship Hall", capacity: 80 }],
    resources: [{ id: "res1", churchId: "c1", name: "Projector", quantity: 2 }],
    blockouts: [],
    ...overrides
  };
}

function proposed(overrides: Partial<ProposedBooking> = {}): ProposedBooking {
  return {
    start: d("2026-07-10T18:00:00"),
    end: d("2026-07-10T20:00:00"),
    roomIds: ["room1"],
    resources: [],
    ...overrides
  };
}

describe("ConflictHelper room conflicts", () => {
  it("flags a double-booked room", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Youth Lock-in", eventStart: d("2026-07-10T19:00:00"), eventEnd: d("2026-07-10T22:00:00") }] });
    const result = ConflictHelper.findConflicts(proposed(), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("room");
    expect(result[0].conflictingEventTitle).toBe("Youth Lock-in");
  });

  it("does not flag bookings in other rooms or non-overlapping times", () => {
    const ctx = baseContext({
      roomBookings: [
        { id: "b1", eventId: "e2", roomId: "room2", eventTitle: "Other room", eventStart: d("2026-07-10T18:00:00"), eventEnd: d("2026-07-10T20:00:00") },
        { id: "b2", eventId: "e3", roomId: "room1", eventTitle: "Earlier", eventStart: d("2026-07-10T15:00:00"), eventEnd: d("2026-07-10T17:00:00") }
      ]
    });
    expect(ConflictHelper.findConflicts(proposed(), ctx)).toHaveLength(0);
  });

  it("ignores the proposed event's own bookings when editing", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e1", roomId: "room1", eventTitle: "Myself", eventStart: d("2026-07-10T18:00:00"), eventEnd: d("2026-07-10T20:00:00") }] });
    expect(ConflictHelper.findConflicts(proposed({ eventId: "e1" }), ctx)).toHaveLength(0);
  });

  it("detects conflicts between a single event and a recurring booking", () => {
    const ctx = baseContext({
      roomBookings: [
        // Every Friday evening, started before the proposal date
        { id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Friday Prayer", eventStart: d("2026-06-05T19:00:00"), eventEnd: d("2026-06-05T21:00:00"), eventRecurrenceRule: "FREQ=WEEKLY;BYDAY=FR" }
      ]
    });
    // 2026-07-10 is a Friday
    const result = ConflictHelper.findConflicts(proposed(), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].conflictingEventTitle).toBe("Friday Prayer");
  });

  it("detects conflicts when the proposal itself recurs", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "One-off", eventStart: d("2026-08-14T18:30:00"), eventEnd: d("2026-08-14T19:30:00") }] });
    // Weekly Friday proposal starting 2026-07-10 hits the 8/14 one-off
    const result = ConflictHelper.findConflicts(proposed({ recurrenceRule: "FREQ=WEEKLY;BYDAY=FR" }), ctx);
    expect(result).toHaveLength(1);
  });
});

describe("ConflictHelper resource conflicts", () => {
  it("flags over-allocation past the resource quantity", () => {
    const ctx = baseContext({ resourceBookings: [{ id: "b1", eventId: "e2", resourceId: "res1", quantity: 1, eventTitle: "Other", eventStart: d("2026-07-10T17:00:00"), eventEnd: d("2026-07-10T19:00:00") }] });
    const result = ConflictHelper.findConflicts(proposed({ roomIds: [], resources: [{ resourceId: "res1", quantity: 2 }] }), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("resource");
  });

  it("allows allocation within quantity", () => {
    const ctx = baseContext({ resourceBookings: [{ id: "b1", eventId: "e2", resourceId: "res1", quantity: 1, eventTitle: "Other", eventStart: d("2026-07-10T17:00:00"), eventEnd: d("2026-07-10T19:00:00") }] });
    const result = ConflictHelper.findConflicts(proposed({ roomIds: [], resources: [{ resourceId: "res1", quantity: 1 }] }), ctx);
    expect(result).toHaveLength(0);
  });

  it("only counts bookings that overlap in time", () => {
    const ctx = baseContext({ resourceBookings: [{ id: "b1", eventId: "e2", resourceId: "res1", quantity: 2, eventTitle: "Morning", eventStart: d("2026-07-10T08:00:00"), eventEnd: d("2026-07-10T10:00:00") }] });
    const result = ConflictHelper.findConflicts(proposed({ roomIds: [], resources: [{ resourceId: "res1", quantity: 2 }] }), ctx);
    expect(result).toHaveLength(0);
  });
});

describe("ConflictHelper blockout conflicts", () => {
  it("flags a room-specific blockout overlapping the proposal", () => {
    const ctx = baseContext({ blockouts: [{ id: "blk1", churchId: "c1", roomId: "room1", startTime: d("2026-07-10T00:00:00"), endTime: d("2026-07-11T00:00:00"), reason: "Floor refinishing" }] });
    const result = ConflictHelper.findConflicts(proposed(), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("blockout");
    expect(result[0].message).toContain("Floor refinishing");
  });

  it("ignores blockouts for rooms not in the proposal", () => {
    const ctx = baseContext({ blockouts: [{ id: "blk1", churchId: "c1", roomId: "room2", startTime: d("2026-07-10T00:00:00"), endTime: d("2026-07-11T00:00:00") }] });
    expect(ConflictHelper.findConflicts(proposed(), ctx)).toHaveLength(0);
  });

  it("applies church-wide blockouts to any proposal", () => {
    const ctx = baseContext({ blockouts: [{ id: "blk1", churchId: "c1", startTime: d("2026-07-10T00:00:00"), endTime: d("2026-07-11T00:00:00"), reason: "Holiday" }] });
    const result = ConflictHelper.findConflicts(proposed({ roomIds: [], resources: [{ resourceId: "res1", quantity: 1 }] }), ctx);
    expect(result.some((c) => c.type === "blockout")).toBe(true);
  });

  it("ignores blockouts outside the proposed times", () => {
    const ctx = baseContext({ blockouts: [{ id: "blk1", churchId: "c1", roomId: "room1", startTime: d("2026-07-12T00:00:00"), endTime: d("2026-07-13T00:00:00") }] });
    expect(ConflictHelper.findConflicts(proposed(), ctx)).toHaveLength(0);
  });
});
