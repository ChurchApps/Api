const givingGateway = {
  loadDonationsByPerson: jest.fn(async () => [{ id: "d1" }]),
  loadCustomersByPerson: jest.fn(async () => [{ id: "cu1" }]),
  loadSubscriptionsByPerson: jest.fn(async () => [{ id: "s1", funds: [{ fundId: "f1", amount: 10 }] }]),
  loadPaymentMethodsByPerson: jest.fn(async () => [{ id: "pm1", displayName: "Visa ****4242" }])
};
const attendanceGateway = { loadVisitsByPerson: jest.fn(async () => [{ id: "v1" }]) };
const messagingGateway = {
  loadDevicesByPerson: jest.fn(async () => [{ id: "dev1" }]),
  loadConnectionsByPerson: jest.fn(async () => [{ id: "con1" }]),
  loadDeliveryLogsByPerson: jest.fn(async () => [{ id: "dl1" }]),
  loadNotificationsByPerson: jest.fn(async () => [{ id: "n1" }]),
  loadNotificationPreferencesByPerson: jest.fn(async () => [{ id: "np1" }]),
  loadPrivateMessagesByPerson: jest.fn(async () => [{ id: "pm1" }]),
  loadPersonNotes: jest.fn(async (_churchId: string, _personId: string, contentTypes: string[]) =>
    contentTypes.map((ct) => ({ id: `conv-${ct}`, contentType: ct, messages: [{ id: `msg-${ct}` }] })))
};
const doingGateway = {
  loadAssignmentsByPerson: jest.fn(async () => [{ id: "a1" }]),
  loadBlockoutDatesByPerson: jest.fn(async () => [{ id: "b1" }]),
  loadTasksByPerson: jest.fn(async () => [{ id: "t1" }])
};
const contentGateway = {
  loadRegistrationsByPerson: jest.fn(async () => [{ id: "r1" }]),
  loadRegistrationMembersByPerson: jest.fn(async () => [{ id: "rm1" }]),
  loadEventRsvpsByPerson: jest.fn(async () => [{ id: "rsvp1" }]),
  loadEventBookingsByPerson: jest.fn(async () => [{ id: "bk1" }])
};

jest.mock("../../../../shared/modules/index.js", () => ({
  getGivingModuleGateway: () => givingGateway,
  getAttendanceModuleGateway: () => attendanceGateway,
  getMessagingModuleGateway: () => messagingGateway,
  getDoingModuleGateway: () => doingGateway,
  getContentModuleGateway: () => contentGateway
}));

import { GdprExportHelper } from "../GdprExportHelper.js";

const buildRepos = () => ({
  person: { load: jest.fn(async () => ({ id: "p1", householdId: "h1" })) },
  household: { load: jest.fn(async () => ({ id: "h1", name: "Smith" })) },
  groupMember: { loadForPerson: jest.fn(async () => [{ id: "gm1" }]) },
  groupJoinRequest: { loadForPerson: jest.fn(async () => [{ id: "gjr1" }]) },
  visibilityPreference: { loadForPerson: jest.fn(async () => [{ id: "vp1" }]) },
  personFieldValue: { loadForPerson: jest.fn(async () => [{ id: "pfv1", value: "Blue" }]) },
  memberPermission: { loadFormsByPerson: jest.fn(async () => [{ id: "mp1" }]) },
  formSubmission: { loadForContent: jest.fn(async () => [{ id: "fs1" }]) },
  answer: { loadForFormSubmission: jest.fn(async () => [{ id: "ans1", value: "Yes" }]) }
}) as any;

describe("GdprExportHelper.exportPersonData", () => {
  beforeEach(() => jest.clearAllMocks());

  it("includes every person-linked dataset the erasure path touches", async () => {
    const repos = buildRepos();
    const result = await GdprExportHelper.exportPersonData("c1", "p1", repos);

    expect(result.exportedAt).toEqual(expect.any(String));
    expect(result.person).toEqual({ id: "p1", householdId: "h1" });
    expect(result.household).toEqual({ id: "h1", name: "Smith" });
    expect(result.groupJoinRequests).toEqual([{ id: "gjr1" }]);
    expect(result.customFieldValues).toEqual([{ id: "pfv1", value: "Blue" }]);
    expect(result.memberPermissions).toEqual([{ id: "mp1" }]);
    expect(result.subscriptions).toEqual([{ id: "s1", funds: [{ fundId: "f1", amount: 10 }] }]);
    expect(result.paymentMethods).toEqual([{ id: "pm1", displayName: "Visa ****4242" }]);
    expect(result.connections).toEqual([{ id: "con1" }]);
    expect(result.deliveryLogs).toEqual([{ id: "dl1" }]);
    expect(result.tasks).toEqual([{ id: "t1" }]);
    expect(result.registrationMembers).toEqual([{ id: "rm1" }]);
    expect(result.eventRsvps).toEqual([{ id: "rsvp1" }]);
    expect(result.eventBookings).toEqual([{ id: "bk1" }]);
  });

  it("nests form submission answers under each submission", async () => {
    const repos = buildRepos();
    const result = await GdprExportHelper.exportPersonData("c1", "p1", repos);

    expect(repos.formSubmission.loadForContent).toHaveBeenCalledWith("c1", "person", "p1");
    expect(result.formSubmissions).toEqual([{ id: "fs1", answers: [{ id: "ans1", value: "Yes" }] }]);
  });

  it("excludes confidential notes when the caller lacks the permission", async () => {
    const result = await GdprExportHelper.exportPersonData("c1", "p1", buildRepos());

    expect(messagingGateway.loadPersonNotes).toHaveBeenCalledWith("c1", "p1", ["person"]);
    expect(result.confidentialNotesIncluded).toBe(false);
    expect(result.notes.map((n: any) => n.contentType)).toEqual(["person"]);
  });

  it("includes confidential notes when the caller has the permission", async () => {
    const result = await GdprExportHelper.exportPersonData("c1", "p1", buildRepos(), { includeConfidentialNotes: true });

    expect(messagingGateway.loadPersonNotes).toHaveBeenCalledWith("c1", "p1", ["person", "personConfidential"]);
    expect(result.confidentialNotesIncluded).toBe(true);
    expect(result.notes.map((n: any) => n.contentType)).toEqual(["person", "personConfidential"]);
  });

  it("skips the household lookup when the person has none", async () => {
    const repos = buildRepos();
    repos.person.load = jest.fn(async () => ({ id: "p1" }));
    const result = await GdprExportHelper.exportPersonData("c1", "p1", repos);

    expect(repos.household.load).not.toHaveBeenCalled();
    expect(result.household).toBeNull();
  });
});
