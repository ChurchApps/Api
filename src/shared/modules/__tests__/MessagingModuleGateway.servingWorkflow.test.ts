const email = jest.fn();
const repos: any = {
  notificationPreference: { loadByPersonId: jest.fn() },
  notificationPreferenceOverride: { loadForPerson: jest.fn(async () => []) }
};
jest.mock("../../../modules/messaging/helpers/NotificationHelper.js", () => ({ NotificationHelper: { sendWorkflowEmail: (...args: any[]) => email(...args) } }));
jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: async () => repos } }));
import { getMessagingModuleGateway } from "../MessagingModuleGateway.js";
const gateway = getMessagingModuleGateway();
const person = { email: "volunteer@example.test", mobilePhone: "+15555550123" };
const message = { subject: "Serving request", html: "<p>Confirm request</p>", text: "Confirm request" };
const send = (channel: "email" | "sms", p = person) => gateway.sendServingWorkflowMessage("c1", "p1", "card1", channel, p, message, "Sample Church");
let text: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  repos.notificationPreference.loadByPersonId.mockResolvedValue({ allowSms: true });
  repos.notificationPreferenceOverride.loadForPerson.mockResolvedValue([]);
  email.mockResolvedValue("sent");
  text = jest.spyOn(gateway, "sendPersonText").mockResolvedValue({ ok: true });
});
afterEach(() => text.mockRestore());
it.each([undefined, { allowSms: false }, { allowSms: true, masterMute: true }])("requires explicit SMS opt-in and honors master mute (%j)", async (pref) => {
  repos.notificationPreference.loadByPersonId.mockResolvedValue(pref);
  expect(await send("sms")).toContain("skipped"); expect(text).not.toHaveBeenCalled();
});
it("honors serving-category SMS opt-out", async () => {
  repos.notificationPreferenceOverride.loadForPerson.mockResolvedValue([{ categoryKey: "serving_schedule", channel: "sms", optedIn: false }]);
  expect(await send("sms")).toContain("category_opt_out"); expect(text).not.toHaveBeenCalled();
});
it("honors person opt-out and missing phones", async () => {
  expect(await send("sms", { ...person, optedOut: true } as any)).toContain("skipped");
  expect(await send("sms", { ...person, mobilePhone: "" })).toContain("skipped"); expect(text).not.toHaveBeenCalled();
});
it("reports missing providers without falling back to another channel", async () => {
  text.mockResolvedValue({ ok: false, reason: "no_provider" });
  expect(await send("sms")).toBe("blocked (no_provider)"); expect(email).not.toHaveBeenCalled();
});
it("honors email preferences before reserving church allowance", async () => {
  repos.notificationPreference.loadByPersonId.mockResolvedValue({ emailFrequency: "never" });
  expect(await send("email")).toContain("skipped"); expect(email).not.toHaveBeenCalled();
});
it("delegates the email attempt to the notification funnel without creating a queued escalation", async () => {
  expect(await send("email")).toBe("sent");
  expect(email).toHaveBeenCalledWith("c1", "p1", "card1", person.email, message.subject, message.html);
});
