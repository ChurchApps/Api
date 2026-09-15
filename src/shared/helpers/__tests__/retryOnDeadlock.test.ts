import { retryOnDeadlock } from "../retryOnDeadlock";

describe("retryOnDeadlock", () => {
  it("returns on the first success", async () => {
    await expect(retryOnDeadlock(async () => "ok")).resolves.toBe("ok");
  });

  it("retries ER_LOCK_DEADLOCK then succeeds", async () => {
    let n = 0;
    const result = await retryOnDeadlock(async () => {
      n += 1;
      if (n < 3) {
        const e: any = new Error("Deadlock found when trying to get lock");
        e.code = "ER_LOCK_DEADLOCK";
        throw e;
      }
      return "saved";
    });
    expect(result).toBe("saved");
    expect(n).toBe(3);
  });

  it("does not retry other errors", async () => {
    const e: any = new Error("Unknown column");
    e.code = "ER_BAD_FIELD_ERROR";
    await expect(retryOnDeadlock(async () => { throw e; })).rejects.toBe(e);
  });
});
