import { PublicEmailThrottle } from "../PublicEmailThrottle.js";

function repos(counts: number[] = [0, 0]) {
  const loadCount = jest.fn(async () => counts.shift() ?? 0);
  const create = jest.fn(async (log: any) => log);
  return { auditLog: { loadCount, create } } as any;
}

describe("PublicEmailThrottle.allow", () => {
  it("counts only recent public-email entries for the target person", async () => {
    const r = repos();
    const before = Date.now() - PublicEmailThrottle.windowMs;
    expect(await PublicEmailThrottle.allow(r, "c1", "p9")).toBe(true);
    const [churchId, filter] = r.auditLog.loadCount.mock.calls[0];
    expect(churchId).toBe("c1");
    expect(filter.category).toBe("publicEmail");
    expect(filter.entityType).toBe("person");
    expect(filter.entityId).toBe("p9");
    expect(filter.startDate.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("blocks once the per-person cap is reached, without a second query", async () => {
    const r = repos([PublicEmailThrottle.maxPerPerson]);
    expect(await PublicEmailThrottle.allow(r, "c1", "p9")).toBe(false);
    expect(r.auditLog.loadCount).toHaveBeenCalledTimes(1);
  });

  it("blocks once the church-wide cap is reached even for a fresh target", async () => {
    const r = repos([0, PublicEmailThrottle.maxPerChurch]);
    expect(await PublicEmailThrottle.allow(r, "c1", "p9")).toBe(false);
    const churchFilter = r.auditLog.loadCount.mock.calls[1][1];
    expect(churchFilter.entityId).toBeUndefined();
  });

  it("allows when both counts are under their caps", async () => {
    const r = repos([PublicEmailThrottle.maxPerPerson - 1, PublicEmailThrottle.maxPerChurch - 1]);
    expect(await PublicEmailThrottle.allow(r, "c1", "p9")).toBe(true);
  });
});

describe("PublicEmailThrottle.record", () => {
  it("writes a countable audit row for the target person", async () => {
    const r = repos();
    await PublicEmailThrottle.record(r, "c1", "p9", "1.2.3.4");
    expect(r.auditLog.create).toHaveBeenCalledWith({
      churchId: "c1",
      userId: "anonymous",
      category: "publicEmail",
      action: "public_email_sent",
      entityType: "person",
      entityId: "p9",
      ipAddress: "1.2.3.4",
      module: "membership"
    });
  });
});
