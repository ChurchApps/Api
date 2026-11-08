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

const resolve = (payload: any) => (EventTriggerHelper as any).resolve("c1", "form.submission.created", payload);

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
    FilterMatcher.parseConditions = (): any[] => [];
    FilterMatcher.toBool = () => false;
    jest.spyOn(EventTriggerHelper as any, "eventTypesForChurch").mockResolvedValue(new Set(["donation.created"]));
    jest.spyOn(EventTriggerHelper as any, "resolve").mockResolvedValue([{ subject: { type: "person", id: "p1", label: "Donald Clark" }, facts: {} }]);

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
