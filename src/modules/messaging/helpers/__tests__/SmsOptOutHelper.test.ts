const loadIdsByMobileDigits = jest.fn<Promise<string[]>, [string, string]>();
const updateSmsOptedOut = jest.fn<Promise<unknown>, [string, string, boolean]>();
const loadByPersonId = jest.fn<Promise<NotificationPreference | undefined>, [string, string]>();
const savePref = jest.fn<Promise<NotificationPreference>, [NotificationPreference]>();
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "test-secret", messagingApi: "https://api.test/messaging" } }));
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({
  RepoManager: {
    getRepos: async (name: string) => name === "membership"
      ? { person: { loadIdsByMobileDigits, updateSmsOptedOut } }
      : { notificationPreference: { loadByPersonId, save: savePref } }
  }
}));

import { SmsOptOutHelper } from "../SmsOptOutHelper.js";
import type { NotificationPreference } from "../../models/index.js";

describe("SmsOptOutHelper", () => {
  beforeEach(() => { updateSmsOptedOut.mockClear(); savePref.mockClear(); });

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

  it("recognizes START and UNSTOP as opt-in replies", () => {
    ["START", " start ", "Unstop"].forEach((t) => expect(SmsOptOutHelper.isStart(t)).toBe(true));
    ["STOP", "start over", ""].forEach((t) => expect(SmsOptOutHelper.isStart(t)).toBe(false));
  });

  it("opts out every matching person and turns their text reminders off", async () => {
    loadIdsByMobileDigits.mockResolvedValue(["P1", "P2"]);
    loadByPersonId.mockImplementation(async (_c: string, id: string) => (id === "P1" ? { id: "N1", churchId: "CH1", personId: "P1", allowSms: true } : undefined));
    expect(await SmsOptOutHelper.optOut("CH1", "+1 (555) 010-1000")).toBe(2);
    expect(loadIdsByMobileDigits).toHaveBeenCalledWith("CH1", "15550101000");
    expect(updateSmsOptedOut.mock.calls).toEqual([["CH1", "P1", true], ["CH1", "P2", true]]);
    expect(savePref).toHaveBeenCalledWith(expect.objectContaining({ id: "N1", allowSms: false }));
    expect(savePref).toHaveBeenCalledTimes(1);
  });

  it("lets START clear the text opt-out without turning reminders back on", async () => {
    loadIdsByMobileDigits.mockResolvedValue(["P1"]);
    expect(await SmsOptOutHelper.optIn("CH1", "555-010-1000")).toBe(1);
    expect(updateSmsOptedOut.mock.calls).toEqual([["CH1", "P1", false]]);
    expect(savePref).not.toHaveBeenCalled();
  });
});
