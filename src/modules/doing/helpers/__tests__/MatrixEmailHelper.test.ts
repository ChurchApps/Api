/**
 * Unit tests for groupOverviewByPerson — the pure grouping behind the matrix
 * "Email all" consolidated email. Module-level imports (apihelper/Environment/
 * gateways) are mocked so the file loads without a DB or env; the function under
 * test touches none of them.
 */

jest.mock("@churchapps/apihelper", () => ({ EmailHelper: { sendTemplatedEmail: jest.fn() } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { supportEmail: "support@example.com" } }));
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: jest.fn() }));

import { groupOverviewByPerson, type OverviewEmailRow } from "../MatrixEmailHelper.js";

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
