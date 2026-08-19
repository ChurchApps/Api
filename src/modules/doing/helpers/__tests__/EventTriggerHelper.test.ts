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

  it("yields no subject without a person contentId or submittedBy", async () => {
    const result = await resolve({ formId: "f1", contentType: "form", contentId: "f1" });
    expect(result).toEqual([]);
    expect(loadPersonMock).not.toHaveBeenCalled();
  });
});
