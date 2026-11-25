const loadPersonMock = jest.fn().mockResolvedValue({ membershipStatus: "Visitor" });
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadPerson: loadPersonMock }),
  getGivingModuleGateway: () => ({}),
  getAttendanceModuleGateway: () => ({})
}));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));
jest.mock("../ExecutionHelper.js", () => ({ ExecutionHelper: { startAndAttempt: jest.fn() } }));
jest.mock("../FilterMatcher.js", () => ({ FilterMatcher: {} }));

import { EventTriggerHelper } from "../EventTriggerHelper.js";

interface FormSubmissionPayload { id?: string; formId?: string; contentType?: string; contentId?: string; submittedBy?: string; formName?: string; submitterName?: string }

const resolve = (payload: FormSubmissionPayload) => EventTriggerHelper["resolve"]("c1", "form.submission.created", payload);

describe("EventTriggerHelper.resolve form.submission.created", () => {
  beforeEach(() => { loadPersonMock.mockClear(); });

  it("uses contentId as the subject when contentType is person", async () => {
    const result = await resolve({ formId: "f1", contentType: "person", contentId: "p1" });
    expect(result).toHaveLength(1);
    expect(result[0].subject).toEqual({ type: "person", id: "p1" });
    expect(result[0].facts["formSubmission.formId"]).toBe("f1");
    expect(result[0].facts["person.membershipStatus"]).toBe("Visitor");
    expect(loadPersonMock).toHaveBeenCalledWith("c1", "p1");
  });

  it("falls back to submittedBy when contentType is form", async () => {
    const result = await resolve({ formId: "f1", contentType: "form", contentId: "f1", submittedBy: "p2" });
    expect(result).toHaveLength(1);
    expect(result[0].subject).toEqual({ type: "person", id: "p2" });
    expect(loadPersonMock).toHaveBeenCalledWith("c1", "p2");
  });

  it("uses the submission itself as the subject for anonymous posts", async () => {
    const result = await resolve({ id: "s1", formId: "f1", contentType: "form", contentId: "f1", formName: "VBS", submitterName: "Jane Doe" });
    expect(result).toHaveLength(1);
    expect(result[0].subject).toEqual({ type: "formSubmission", id: "s1", label: "Jane Doe" });
    expect(result[0].facts["formSubmission.formId"]).toBe("f1");
    expect(loadPersonMock).not.toHaveBeenCalled();
  });

  it("labels an anonymous post with the form name when no contact was extracted", async () => {
    const result = await resolve({ id: "s1", formId: "f1", contentType: "form", contentId: "f1", formName: "VBS" });
    expect(result[0].subject.label).toBe("VBS");
  });
});

describe("EventTriggerHelper.fieldDefs membership status", () => {
  it("offers Guest, the status self-registered people get, right after Visitor", () => {
    const def = EventTriggerHelper.fieldDefs().find(d => d.eventType === "person.created");
    const field = def.fields.find(f => f.key === "person.membershipStatus");
    expect(field.options.map(o => o.value).slice(0, 2)).toEqual(["Visitor", "Guest"]);
  });
});

describe("EventTriggerHelper donation.created context", () => {
  it("carries the gift into the workflow it starts", async () => {
    const { RepoManager } = jest.requireMock("../../../../shared/infrastructure/index.js");
    const { ExecutionHelper } = jest.requireMock("../ExecutionHelper.js");
    const { FilterMatcher } = jest.requireMock("../FilterMatcher.js");
    const trigger = { id: "t1", workflowId: "wf1", conditions: "[]" };
    RepoManager.getRepos.mockResolvedValue({ workflowTrigger: { loadEventTypesForChurch: jest.fn(async () => ["donation.created"]), loadByEventType: jest.fn(async () => [trigger]) } });
    FilterMatcher.matches = () => true;
    FilterMatcher.parseConditions = (): unknown[] => [];
    FilterMatcher.toBool = () => false;
    jest.spyOn(EventTriggerHelper, "eventTypesForChurch").mockResolvedValue(new Set(["donation.created"]));
    jest.spyOn(EventTriggerHelper, "resolve").mockResolvedValue([{ subject: { type: "person", id: "p1", label: "Donald Clark" }, facts: {} }]);

    const donationDate = new Date("2026-11-08T00:00:00Z");
    await EventTriggerHelper.onEvent("c1", "donation.created", { id: "d1", personId: "p1", amount: 50, currency: "usd", donationDate, method: "Check" });

    expect(ExecutionHelper.startAndAttempt).toHaveBeenCalledWith(
      trigger,
      { type: "person", id: "p1", label: "Donald Clark" },
      "donation.created",
      expect.anything(),
      { type: "donation.created", donationId: "d1", amount: 50, currency: "usd", donationDate, method: "Check" }
    );
  });
});

describe("EventTriggerHelper subscription.created", () => {
  beforeEach(() => jest.restoreAllMocks());

  it("lists Recurring gift · Created with amount, fund and frequency conditions", () => {
    const def = EventTriggerHelper.fieldDefs().find(d => d.eventType === "subscription.created");
    expect(def.label).toBe("Recurring gift · Created");
    expect(def.fields.map(f => f.key)).toEqual(["subscription.amount", "subscriptionFund.fundId", "subscription.frequency"]);
    expect(def.fields.find(f => f.key === "subscriptionFund.fundId").optionsSource).toBe("funds");
    expect(def.fields.find(f => f.key === "subscription.frequency").options.map(o => o.value)).toEqual(["one_week", "two_week", "one_month", "three_month", "one_year"]);
  });

  it("resolves the donor as the subject with amount, funds and frequency facts", async () => {
    const result = await EventTriggerHelper["resolve"]("c1", "subscription.created", { id: "sub_1", personId: "p1", amount: 40, interval: { interval_count: "2", interval: "week" }, subscriptionFunds: [{ fundId: "f1" }, { fundId: "f2" }] });
    expect(result).toEqual([
      {
        subject: { type: "person", id: "p1" },
        facts: { "subscription.amount": 40, "subscriptionFund.fundId": ["f1", "f2"], "subscription.frequency": "two_week" }
      }
    ]);
  });

  it("has no subject when the recurring gift has no donor", async () => {
    expect(await EventTriggerHelper["resolve"]("c1", "subscription.created", { id: "sub_1", amount: 40 })).toEqual([]);
  });

  it("maps gateway intervals to the giving form's frequency keys", () => {
    expect(EventTriggerHelper.frequencyKey({ interval_count: 1, interval: "month" })).toBe("one_month");
    expect(EventTriggerHelper.frequencyKey({ interval_count: 3, interval: "month" })).toBe("three_month");
    expect(EventTriggerHelper.frequencyKey({ interval: "year" })).toBe("one_year");
    expect(EventTriggerHelper.frequencyKey(undefined)).toBeUndefined();
  });

  it("starts the workflow when a recurring gift is created", async () => {
    const { ExecutionHelper } = jest.requireMock("../ExecutionHelper.js");
    const { FilterMatcher } = jest.requireMock("../FilterMatcher.js");
    const { RepoManager } = jest.requireMock("../../../../shared/infrastructure/index.js");
    ExecutionHelper.startAndAttempt.mockClear();
    const trigger = { id: "t2", workflowId: "wf1", conditions: "[]" };
    RepoManager.getRepos.mockResolvedValue({ workflowTrigger: { loadByEventType: jest.fn(async () => [trigger]) } });
    FilterMatcher.matches = () => true;
    FilterMatcher.parseConditions = (): unknown[] => [];
    FilterMatcher.toBool = () => false;
    jest.spyOn(EventTriggerHelper, "eventTypesForChurch").mockResolvedValue(new Set(["subscription.created"]));
    jest.spyOn(EventTriggerHelper, "resolve").mockResolvedValue([{ subject: { type: "person", id: "p1", label: "Donald Clark" }, facts: {} }]);

    await EventTriggerHelper.onEvent("c1", "subscription.created", { id: "sub_1", personId: "p1", amount: 40 });

    expect(ExecutionHelper.startAndAttempt).toHaveBeenCalledTimes(1);
    expect(ExecutionHelper.startAndAttempt).toHaveBeenCalledWith(trigger, { type: "person", id: "p1", label: "Donald Clark" }, "subscription.created", expect.anything(), undefined);
  });
});

describe("EventTriggerHelper registration.cancelled", () => {
  beforeEach(() => { jest.restoreAllMocks(); loadPersonMock.mockClear(); });

  it("lists Event · Registration Cancelled with the same conditions as Registration Created", () => {
    const created = EventTriggerHelper.fieldDefs().find(d => d.eventType === "registration.created");
    const cancelled = EventTriggerHelper.fieldDefs().find(d => d.eventType === "registration.cancelled");
    expect(cancelled.label).toBe("Event · Registration Cancelled");
    expect(cancelled.recordType).toBe("registration");
    expect(cancelled.fields.map(f => f.key)).toEqual(created.fields.map(f => f.key));
  });

  it("resolves the registrant as the subject with the event fact", async () => {
    const result = await EventTriggerHelper["resolve"]("c1", "registration.cancelled", { id: "r1", personId: "p1", eventId: "e1" });
    expect(result).toEqual([{ subject: { type: "person", id: "p1" }, facts: { "registration.eventId": "e1", "person.membershipStatus": "Visitor" } }]);
  });
});
