import { NotificationService } from "../NotificationService";

describe("NotificationService", () => {
  beforeEach(() => {
    NotificationService.register(null as any);
  });

  it("throws if used before registration", async () => {
    await expect(
      NotificationService.createNotifications(["p1"], "c1", "test", "x", "hi")
    ).rejects.toThrow(/not initialized/i);
  });

  it("delegates to the registered impl with the same arguments", async () => {
    const impl = jest.fn().mockResolvedValue("ok");
    NotificationService.register(impl);

    const result = await NotificationService.createNotifications(
      ["p1", "p2"],
      "church1",
      "groupJoinRequest",
      "req1",
      "hello",
      "/groups/g1",
      "personA"
    );

    expect(impl).toHaveBeenCalledWith(["p1", "p2"], "church1", "groupJoinRequest", "req1", "hello", "/groups/g1", "personA", undefined);
    expect(result).toBe("ok");
  });

  it("forwards the optional 8th options argument through to the registered impl", async () => {
    const impl = jest.fn().mockResolvedValue("ok");
    NotificationService.register(impl);
    const options = { category: "serving_schedule", deliveryStartLevel: 2, emailImmediate: true, emailByPerson: { p1: { subject: "s", html: "h" } } };

    await NotificationService.createNotifications(["p1"], "church1", "plan", "min1", "hello", undefined, undefined, options);

    expect(impl).toHaveBeenCalledWith(["p1"], "church1", "plan", "min1", "hello", undefined, undefined, options);
  });

  it("propagates rejections from the registered impl", async () => {
    const impl = jest.fn().mockRejectedValue(new Error("boom"));
    NotificationService.register(impl);

    await expect(
      NotificationService.createNotifications(["p1"], "c1", "t", "i", "m")
    ).rejects.toThrow("boom");
  });
});
