const sendPersonTextMock = jest.fn() as jest.MockedFunction<any>;
const people: Record<string, any> = {
  P1: { id: "P1", firstName: "Donald", lastName: "Clark", mobilePhone: "(555) 010-1000", optedOut: false },
  P2: { id: "P2", firstName: "Carol", lastName: "Clark", mobilePhone: "1-555-010-1000", optedOut: false }, // shares Donald's phone
  P3: { id: "P3", firstName: "Sam", lastName: "Smith", mobilePhone: "555-010-3000", optedOut: true },
  P4: { id: "P4", firstName: "Pat", lastName: "Jones", mobilePhone: "", optedOut: false },
  P5: { id: "P5", firstName: "Lee", lastName: "Wong", mobilePhone: "555-010-5000", optedOut: 0 }
};
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadPerson: async (_c: string, id: string) => people[id] || null, loadChurch: async () => ({ name: "Grace Church" }) }),
  getMessagingModuleGateway: () => ({ sendPersonText: sendPersonTextMock })
}));

import { MatrixTextHelper } from "../MatrixTextHelper.js";

const rows = ["P1", "P2", "P3", "P4", "P5", "P1"].map((personId, i) => ({ personId, planId: "PL" + (i % 2), planName: "Sunday", serviceDate: "2026-10-18", positionName: "Usher" }));
rows.push({ personId: null as any, planId: "PL0", planName: "Sunday", serviceDate: "2026-10-18", positionName: "Greeter" });

beforeEach(() => sendPersonTextMock.mockReset().mockResolvedValue({ ok: true }));

describe("MatrixTextHelper", () => {
  it("previews eligible, opted-out and no-phone volunteers once each", async () => {
    expect(await MatrixTextHelper.preview("CH1", rows)).toEqual({ totalMembers: 5, eligibleCount: 2, optedOutCount: 1, noPhoneCount: 1, capped: false });
    expect(sendPersonTextMock).not.toHaveBeenCalled();
  });

  it("texts each eligible volunteer through the church's provider", async () => {
    const result = await MatrixTextHelper.send("CH1", rows, "Hi {{firstName}}, thanks for serving!");
    expect(result).toMatchObject({ recipientCount: 2, successCount: 2, failCount: 0, eligibleCount: 2, optedOutCount: 1, noPhoneCount: 1 });
    expect(sendPersonTextMock.mock.calls.map((c) => [c[1], c[2].phoneNumber, c[3], c[4]])).toEqual([
      ["P1", "(555) 010-1000", "Hi {{firstName}}, thanks for serving!", "Grace Church"],
      ["P5", "555-010-5000", "Hi {{firstName}}, thanks for serving!", "Grace Church"]
    ]);
  });

  it("stops and reports when the church has no texting provider", async () => {
    sendPersonTextMock.mockResolvedValue({ ok: false, reason: "no_provider" });
    const result = await MatrixTextHelper.send("CH1", rows, "Hi");
    expect(result.error).toBe("no_provider");
    expect(sendPersonTextMock).toHaveBeenCalledTimes(1);
  });
});
