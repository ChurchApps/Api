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
    expect(result[0].date).toEqual(d("2026-07-10T19:00:00"));
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

describe("ConflictHelper booking windows", () => {
  // Proposed event is 6-8pm but reserves the room 8am-5pm; an unrelated 2pm booking now conflicts.
  it("uses the proposed absolute window instead of the event time", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Afternoon Meeting", eventStart: d("2026-07-10T14:00:00"), eventEnd: d("2026-07-10T15:00:00") }] });
    // Without the window the 6-8pm event would not overlap a 2-3pm booking.
    expect(ConflictHelper.findConflicts(proposed(), ctx)).toHaveLength(0);
    const result = ConflictHelper.findConflicts(proposed({ startTime: d("2026-07-10T08:00:00"), endTime: d("2026-07-10T17:00:00") }), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("room");
  });

  // A multi-day Fri-Sun reservation overlaps a Saturday booking.
  it("supports multi-day reservation windows", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Saturday Workshop", eventStart: d("2026-07-11T10:00:00"), eventEnd: d("2026-07-11T12:00:00") }] });
    const result = ConflictHelper.findConflicts(proposed({ startTime: d("2026-07-10T00:00:00"), endTime: d("2026-07-12T23:59:00") }), ctx);
    expect(result).toHaveLength(1);
  });

  // Setup/teardown padding applies to every occurrence of a recurring proposal.
  it("pads each recurring occurrence by setup/teardown minutes", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Saturday Setup Crew", eventStart: d("2026-07-11T12:00:00"), eventEnd: d("2026-07-11T13:00:00") }] });
    // Weekly-Friday 6-8pm proposal; the conflicting booking is Saturday noon, so no raw overlap.
    const weekly = { recurrenceRule: "FREQ=WEEKLY;BYDAY=FR" };
    expect(ConflictHelper.findConflicts(proposed(weekly), ctx)).toHaveLength(0);
    // With a 24h teardown the Friday occurrence now stretches into Saturday and conflicts.
    const result = ConflictHelper.findConflicts(proposed({ ...weekly, teardownMinutes: 60 * 24 }), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].conflictingEventTitle).toBe("Saturday Setup Crew");
  });

  it("honors an existing booking's setup padding", () => {
    // Existing 7-8pm event reserves 2 hours of setup (5pm start); proposed 6-8pm overlaps the setup.
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Padded", eventStart: d("2026-07-10T19:00:00"), eventEnd: d("2026-07-10T20:00:00"), setupMinutes: 120 }] });
    expect(ConflictHelper.findConflicts(proposed(), ctx)).toHaveLength(1);
  });

  // Absolute window overrides setup/teardown when both are present.
  it("lets an absolute window override offsets", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Morning", eventStart: d("2026-07-10T08:00:00"), eventEnd: d("2026-07-10T09:00:00") }] });
    // Huge teardown would overlap, but the absolute 6-8pm window wins and does not reach 8am.
    const result = ConflictHelper.findConflicts(proposed({ teardownMinutes: 99999, startTime: d("2026-07-10T18:00:00"), endTime: d("2026-07-10T20:00:00") }), ctx);
    expect(result).toHaveLength(0);
  });

  // An existing booking's own absolute window is honored over its event time.
  it("honors an existing booking's absolute window", () => {
    const ctx = baseContext({ roomBookings: [{ id: "b1", eventId: "e2", roomId: "room1", eventTitle: "All-day Setup", eventStart: d("2026-07-10T19:00:00"), eventEnd: d("2026-07-10T20:00:00"), startTime: d("2026-07-10T08:00:00"), endTime: d("2026-07-10T22:00:00") }] });
    // Proposed 6-8pm event overlaps the existing 8am-10pm reservation even though the other event is 7-8pm.
    const result = ConflictHelper.findConflicts(proposed(), ctx);
    expect(result).toHaveLength(1);
    expect(result[0].conflictingEventTitle).toBe("All-day Setup");
  });
});

describe("ConflictHelper.computeWindow", () => {
  it("defaults to now..now+1yr when no anchor is given", () => {
    const before = Date.now();
    const { windowStart, windowEnd } = ConflictHelper.computeWindow();
    const after = Date.now();
    expect(windowStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(windowStart.getTime()).toBeLessThanOrEqual(after);
    expect(windowEnd.getFullYear()).toBe(windowStart.getFullYear() + 1);
  });

  it("caps an old anchor to one month ago and keeps the window at least a year out", () => {
    const { windowStart, windowEnd } = ConflictHelper.computeWindow(d("2000-01-01T00:00:00"));
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    expect(Math.abs(windowStart.getTime() - oneMonthAgo.getTime())).toBeLessThan(5000);
    const futureLimit = new Date();
    futureLimit.setFullYear(futureLimit.getFullYear() + 1);
    expect(windowEnd.getTime()).toBeGreaterThanOrEqual(futureLimit.getTime() - 5000);
  });

  it("anchors the window to a far-future start (>1yr out)", () => {
    const anchor = d("2030-01-01T00:00:00");
    const { windowStart, windowEnd } = ConflictHelper.computeWindow(anchor);
    expect(windowStart.getTime()).toBe(anchor.getTime());
    expect(windowEnd.getFullYear()).toBe(anchor.getFullYear() + 1);
  });

  it("treats an invalid anchor as now", () => {
    const before = Date.now();
    const { windowStart } = ConflictHelper.computeWindow("not-a-date");
    const after = Date.now();
    expect(windowStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(windowStart.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("ConflictHelper timezone formatting", () => {
  const booking = { id: "b1", eventId: "e2", roomId: "room1", eventTitle: "Youth Lock-in", eventStart: d("2026-07-10T19:00:00"), eventEnd: d("2026-07-10T22:00:00") };

  it("formats conflict times in the church's timezone", () => {
    const ctx = baseContext({ timeZone: "America/Chicago", roomBookings: [booking] });
    const result = ConflictHelper.findConflicts(proposed(), ctx);
    expect(result[0].message).toContain(booking.eventStart.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  });

  it("falls back to America/New_York when no timezone is set", () => {
    const ctx = baseContext({ timeZone: undefined, roomBookings: [booking] });
    const result = ConflictHelper.findConflicts(proposed(), ctx);
    expect(result[0].message).toContain(booking.eventStart.toLocaleString("en-US", { timeZone: "America/New_York" }));
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
