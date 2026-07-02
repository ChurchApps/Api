/**
 * Unit tests for groupOverviewByPerson (the pure grouping) and sendConsolidated
 * (the funnel hand-off) behind the matrix "Email all" consolidated email.
 */

const createNotificationsMock = jest.fn();
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: (...args: unknown[]) => createNotificationsMock(...args) } }));

const loadChurchMock = jest.fn();
const loadPeopleMock = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: loadChurchMock, loadPeople: loadPeopleMock }) }));

import { groupOverviewByPerson, MatrixEmailHelper, type OverviewEmailRow } from "../MatrixEmailHelper.js";

describe("groupOverviewByPerson", () => {
  it("collapses multiple plans for one person into a single recipient with one item per plan", () => {
    const rows: OverviewEmailRow[] = [
      { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Drums" },
      { personId: "P1", planId: "PL2", planName: "Wed PM", serviceDate: "2026-07-08", positionName: "Bass" }
    ];
    const result = groupOverviewByPerson(rows);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe("P1");
    expect(result[0].items.map((i) => i.planName)).toEqual(["Sun AM", "Wed PM"]);
  });

  it("merges and de-dupes multiple roles within the same plan", () => {
    const rows: OverviewEmailRow[] = [
      { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Drums" },
      { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Vocals" },
      { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Drums" }
    ];
    const result = groupOverviewByPerson(rows);
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].positions.sort()).toEqual(["Drums", "Vocals"]);
  });

  it("sorts a person's plans by service date ascending", () => {
    const rows: OverviewEmailRow[] = [
      { personId: "P1", planId: "PL2", planName: "Later", serviceDate: "2026-07-20", positionName: "Bass" },
      { personId: "P1", planId: "PL1", planName: "Earlier", serviceDate: "2026-07-05", positionName: "Drums" }
    ];
    const result = groupOverviewByPerson(rows);
    expect(result[0].items.map((i) => i.planName)).toEqual(["Earlier", "Later"]);
  });

  it("drops rows with no personId (unfilled slots)", () => {
    const rows: OverviewEmailRow[] = [
      { personId: null, planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Greeter" },
      { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Drums" }
    ];
    const result = groupOverviewByPerson(rows);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe("P1");
  });

  it("separates distinct people", () => {
    const rows: OverviewEmailRow[] = [
      { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Drums" },
      { personId: "P2", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Bass" }
    ];
    const result = groupOverviewByPerson(rows);
    expect(result.map((r) => r.personId).sort()).toEqual(["P1", "P2"]);
  });
});

describe("MatrixEmailHelper.sendConsolidated", () => {
  beforeEach(() => {
    createNotificationsMock.mockReset();
    loadChurchMock.mockReset();
    loadPeopleMock.mockReset();
    loadChurchMock.mockResolvedValue({ id: "CHU1", name: "Grace Church", subDomain: "grace" });
    loadPeopleMock.mockResolvedValue([
      { id: "P1", displayName: "Pat Person" },
      { id: "P2", displayName: "Sam Servant" }
    ]);
    createNotificationsMock.mockResolvedValue([{ id: "N1" }, { id: "N2" }]);
  });

  const rows: OverviewEmailRow[] = [
    { personId: "P1", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Drums" },
    { personId: "P2", planId: "PL1", planName: "Sun AM", serviceDate: "2026-07-05", positionName: "Bass" }
  ];

  it("calls NotificationService.createNotifications once, gated to email-only delivery, with an emailByPerson entry for every grouped person", async () => {
    const result = await MatrixEmailHelper.sendConsolidated("CHU1", rows, "MIN1");

    expect(createNotificationsMock).toHaveBeenCalledTimes(1);
    const [
      personIds,
      churchId,
      contentType,
      contentId, , , , options
    ] = createNotificationsMock.mock.calls[0];
    expect(personIds.sort()).toEqual(["P1", "P2"]);
    expect(churchId).toBe("CHU1");
    expect(contentType).toBe("plan");
    expect(contentId).toBe("MIN1");
    expect(options).toMatchObject({ category: "serving_schedule", deliveryStartLevel: 2, emailImmediate: true });
    expect(Object.keys(options.emailByPerson).sort()).toEqual(["P1", "P2"]);
    expect(options.emailByPerson.P1.html).toContain("Pat");
    expect(result).toEqual({ sent: 2, failed: 0, capped: false });
  });

  it("returns zero counts without calling the funnel when there are no assigned people", async () => {
    const result = await MatrixEmailHelper.sendConsolidated("CHU1", [{ personId: null, planId: "PL1", planName: "Sun AM", serviceDate: null, positionName: "Greeter" }], "MIN1");

    expect(createNotificationsMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0, capped: false });
  });
});
