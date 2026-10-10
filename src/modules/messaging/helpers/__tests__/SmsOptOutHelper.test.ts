const loadIdsByMobileDigits = jest.fn() as jest.MockedFunction<any>;
const updateOptedOut = jest.fn() as jest.MockedFunction<any>;
const loadByPersonId = jest.fn() as jest.MockedFunction<any>;
const savePref = jest.fn() as jest.MockedFunction<any>;
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "test-secret", messagingApi: "https://api.test/messaging" } }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({
  RepoManager: {
    getRepos: async (name: string) => name === "membership"
      ? { person: { loadIdsByMobileDigits, updateOptedOut } }
      : { notificationPreference: { loadByPersonId, save: savePref } }
  }
}));

import { SmsOptOutHelper } from "../SmsOptOutHelper.js";

describe("SmsOptOutHelper", () => {
  it("signs the inbound URL per church and rejects other tokens", () => {
    const url = SmsOptOutHelper.inboundUrl("CH1");
    const token = url.split("/").pop();
    expect(url).toBe(`https://api.test/messaging/texting/inbound/CH1/${token}`);
    expect(SmsOptOutHelper.verify("CH1", token)).toBe(true);
    expect(SmsOptOutHelper.verify("CH2", token)).toBe(false);
    expect(SmsOptOutHelper.verify("CH1", "nope")).toBe(false);
    expect(SmsOptOutHelper.verify("CH1", undefined)).toBe(false);
  });

  it("recognizes carrier opt-out words only as the whole reply", () => {
    ["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "cancel", "Quit", "STOPALL"].forEach((t) => expect(SmsOptOutHelper.isStop(t)).toBe(true));
    ["don't stop", "Yes", "", "STOP by later"].forEach((t) => expect(SmsOptOutHelper.isStop(t)).toBe(false));
  });

  it("reads sender and text from form and JSON webhook shapes", () => {
    expect(SmsOptOutHelper.parse({ From: "+15550101000", Body: "STOP" })).toEqual({ from: "+15550101000", text: "STOP" });
    expect(SmsOptOutHelper.parse({ data: { subscriber: { mobile_number: "5550101000" }, text: "stop" } })).toEqual({ from: "5550101000", text: "stop" });
    expect(SmsOptOutHelper.parse({ from: "5550101000", message: "Stop" })).toEqual({ from: "5550101000", text: "Stop" });
  });

  it("opts out every matching person and turns their text reminders off", async () => {
    loadIdsByMobileDigits.mockResolvedValue(["P1", "P2"]);
    loadByPersonId.mockImplementation(async (_c: string, id: string) => (id === "P1" ? { id: "N1", churchId: "CH1", personId: "P1", allowSms: true } : undefined));
    expect(await SmsOptOutHelper.optOut("CH1", "+1 (555) 010-1000")).toBe(2);
    expect(loadIdsByMobileDigits).toHaveBeenCalledWith("CH1", "15550101000");
    expect(updateOptedOut.mock.calls).toEqual([["CH1", "P1", true], ["CH1", "P2", true]]);
    expect(savePref).toHaveBeenCalledWith(expect.objectContaining({ id: "N1", allowSms: false }));
    expect(savePref).toHaveBeenCalledTimes(1);
  });
});
