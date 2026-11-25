import "reflect-metadata";

const loadSetting = jest.fn();
const loadGroup = jest.fn();
const loadPerson = jest.fn();
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadSetting, loadGroup, loadPerson }) }));

import { HouseholdEditHelper } from "../HouseholdEditHelper.js";
import type { Task } from "../../models/index.js";

const now = new Date("2026-11-23T12:00:00Z");
const au = { churchId: "c1", personId: "pParent" };
const parent = { id: "pParent", churchId: "c1", householdId: "h1", householdRole: "Head", birthDate: new Date("1988-04-02"), displayName: "Dana Parent" };
const spouse = { id: "pSpouse", churchId: "c1", householdId: "h1", householdRole: "Spouse", birthDate: new Date("1990-01-01"), displayName: "Sam Parent" };
const child = { id: "pChild", churchId: "c1", householdId: "h1", householdRole: "Child", birthDate: new Date("2015-08-20"), displayName: "Alex Parent" };
const changes = JSON.stringify([{ field: "birthDate", label: "Birth Date", value: "2015-08-21" }]);

let people: Record<string, Record<string, unknown>>;
const request = (overrides: Partial<Task> = {}): Task => ({ associatedWithType: "person", associatedWithId: "pChild", status: "Open", data: changes, ...overrides });

beforeEach(() => {
  people = { pParent: { ...parent }, pSpouse: { ...spouse }, pChild: { ...child } };
  loadPerson.mockReset().mockImplementation(async (churchId: string, id: string) => (churchId === "c1" ? people[id] ?? null : null));
  loadSetting.mockReset().mockResolvedValue("gApprovers");
  loadGroup.mockReset().mockResolvedValue({ id: "gApprovers", name: "Directory Approvers" });
});

describe("HouseholdEditHelper.prepareRequest access", () => {
  it("lets a Head file a change for a child in the same household", async () => {
    const task = request();
    expect(await HouseholdEditHelper.prepareRequest(au, task, now)).toEqual({});
    expect(loadPerson).toHaveBeenCalledWith("c1", "pParent");
    expect(loadPerson).toHaveBeenCalledWith("c1", "pChild");
  });

  it("lets a Spouse file a change for a child", async () => {
    expect(await HouseholdEditHelper.prepareRequest({ churchId: "c1", personId: "pSpouse" }, request(), now)).toEqual({});
  });

  it("refuses a target in another household", async () => {
    people.pChild.householdId = "h2";
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("refuses when either person has no household", async () => {
    people.pParent.householdId = null;
    people.pChild.householdId = null;
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("refuses a target in another church", async () => {
    // Person loads are scoped to the caller's church, so another church's child is not found.
    loadPerson.mockImplementation(async (churchId: string, id: string) => (id === "pParent" && churchId === "c1" ? people.pParent : null));
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("refuses a requester whose role is Child", async () => {
    people.pParent.householdRole = "Child";
    people.pParent.birthDate = new Date("2000-01-01");
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("refuses a requester whose role is Other", async () => {
    people.pParent.householdRole = "Other";
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("refuses a Head who is under 18", async () => {
    people.pParent.birthDate = new Date("2010-01-01");
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("refuses an adult target (Spouse)", async () => {
    expect(await HouseholdEditHelper.prepareRequest(au, request({ associatedWithId: "pSpouse" }), now)).toEqual({ status: 401 });
  });

  it("refuses a target listed as Child who is 18 or older", async () => {
    people.pChild.birthDate = new Date("2008-11-23");
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({ status: 401 });
  });

  it("allows a Child with no birth date on file", async () => {
    people.pChild.birthDate = null;
    expect(await HouseholdEditHelper.prepareRequest(au, request(), now)).toEqual({});
  });

  it("is not a path for the requester's own record", async () => {
    expect(await HouseholdEditHelper.prepareRequest(au, request({ associatedWithId: "pParent" }), now)).toEqual({ status: 401 });
  });

  it("refuses adding family members through someone else's request", async () => {
    const data = JSON.stringify([{ field: "familyMember", label: "Add Family Member", value: "{\"first\":\"Pat\"}" }]);
    const result = await HouseholdEditHelper.prepareRequest(au, request({ data }), now);
    expect(result.status).toBe(400);
  });
});

describe("HouseholdEditHelper.prepareRequest approval", () => {
  it("refuses when the church has no approval group, so nothing is saved without review", async () => {
    loadSetting.mockResolvedValue(null);
    const result = await HouseholdEditHelper.prepareRequest(au, request(), now);
    expect(result.status).toBe(400);
    expect(loadSetting).toHaveBeenCalledWith("c1", "directoryApprovalGroupId");
  });

  it("routes to the approval group and keeps the task open whatever the client sent", async () => {
    const task = request({ id: "t9", status: "Closed", dateClosed: new Date(), assignedToType: "person", assignedToId: "pParent", createdById: "pChild", associatedWithLabel: "x" });
    await HouseholdEditHelper.prepareRequest(au, task, now);
    expect(task).toMatchObject({
      id: undefined,
      churchId: "c1",
      taskType: "directoryUpdate",
      status: "Open",
      dateClosed: undefined,
      assignedToType: "group",
      assignedToId: "gApprovers",
      assignedToLabel: "Directory Approvers"
    });
  });

  it("records who submitted the change and for whom", async () => {
    const task = request();
    await HouseholdEditHelper.prepareRequest(au, task, now);
    expect(task).toMatchObject({
      associatedWithType: "person",
      associatedWithId: "pChild",
      associatedWithLabel: "Alex Parent",
      createdByType: "person",
      createdById: "pParent",
      createdByLabel: "Dana Parent",
      title: "Profile changes for Alex Parent (submitted by Dana Parent)",
      data: changes
    });
  });
});

describe("HouseholdEditHelper.age", () => {
  it("counts a birthday that has not come yet this year", () => {
    expect(HouseholdEditHelper.age(new Date("2008-11-24"), now)).toBe(17);
    expect(HouseholdEditHelper.age(new Date("2008-11-23"), now)).toBe(18);
    expect(HouseholdEditHelper.age(null, now)).toBeNull();
  });
});
