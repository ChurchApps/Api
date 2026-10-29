import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: {
    people: { edit: "peopleEdit", editSelf: "peopleEditSelf", view: "peopleView", viewNames: "peopleViewNames" },
    attendance: { checkin: "attendanceCheckin" },
    server: { admin: "serverAdmin" }
  },
  UserChurchHelper: {},
  PersonHelper: { getPhotoPath: () => "" },
  DateHelper: {},
  Environment: {},
  LoginRateLimiter: { getClientIp: () => "1.2.3.4" },
  PublicPersonRateLimiter: { allow: jest.fn(() => true) },
  PublicEmailThrottle: {},
  PublicChurchContext: { bind: jest.fn(() => ({ churchId: null, mismatch: false })) }
}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../../../shared/helpers/index.js", () => ({
  __esModule: true,
  CollectionHelper: { convertAll: (data: any, convert: (row: any) => any) => (Array.isArray(data) ? data.map(convert) : []) }
}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: {}, ArrayHelper: { getIds: () => [], getUnique: (a: any[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import { PersonController } from "../PersonController.js";
import { HouseholdPickupController } from "../HouseholdPickupController.js";
import { PersonRepo } from "../../repositories/PersonRepo.js";

// ChurchAppsSupport#1399: the Checkin permission plus View Names (no View People) must be enough for the kiosk.
const row = (id: string, extra: any = {}) => ({
  id,
  churchId: "c1",
  displayName: "Donald Clark",
  firstName: "Donald",
  lastName: "Clark",
  nickName: "Don",
  photo: "",
  householdId: "h1",
  householdRole: "Child",
  birthDate: "2018-05-01",
  grade: "2",
  nametagNotes: "Peanuts",
  membershipStatus: "Member",
  email: "don@example.com",
  mobilePhone: "555-0100",
  address1: "1 Main St",
  optedOut: false,
  ...extra
});

function setup(access: string[], rows: any[]) {
  const realRepo = new PersonRepo();
  const repos: any = {
    person: {
      search: jest.fn(async () => rows),
      searchPhone: jest.fn(async () => rows),
      loadByHousehold: jest.fn(async () => rows),
      loadByIds: jest.fn(async () => rows),
      load: jest.fn(async () => null),
      convertAllToBasicModel: (c: string, d: any[]) => realRepo.convertAllToBasicModel(c, d),
      convertAllToCheckinModel: (c: string, d: any[]) => realRepo.convertAllToCheckinModel(c, d),
      convertAllToModelWithPermissions: (c: string, d: any[], e: boolean) => realRepo.convertAllToModelWithPermissions(c, d, e)
    },
    householdPickupPerson: { loadByHousehold: jest.fn(async () => [{ id: "hp1", name: "Grandma" }]), convertAllToModel: (_c: string, d: any[]) => d },
    setting: { loadPublicSettings: jest.fn(async () => []), convertAllToModel: (_c: string, d: any[]) => d }
  };
  const au = { churchId: "c1", personId: "pX", membershipStatus: "Guest", checkAccess: (p: any) => access.includes(p) };
  const wire = (c: any) => {
    c.repos = repos;
    c.actionWrapper = (_req: any, _res: any, action: any) => action(au);
    c.json = (obj: any, status: number) => ({ obj, status });
    return c;
  };
  return { person: wire(new PersonController()) as any, pickup: wire(new HouseholdPickupController()) as any, repos };
}

const checkinNames = ["attendanceCheckin", "peopleViewNames"];

describe("PersonController with Checkin and View Names only", () => {
  it("name search returns the householdId so the kiosk can open the family", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = await person.search({ query: { term: "Clark" } }, {});
    expect(result[0].householdId).toBe("h1");
    expect(result[0].contactInfo).toEqual({});
  });

  it("phone search is allowed and returns only check-in fields", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = await person.searchPhone({ query: { number: "0100" } }, {});
    expect(result.status).toBeUndefined();
    expect(result[0].householdId).toBe("h1");
    expect(result[0].contactInfo).toEqual({});
  });

  it("phone search leaves out people who opted out of the directory", async () => {
    const { person } = setup(checkinNames, [row("p1"), row("p2", { optedOut: true })]);
    const result = await person.searchPhone({ query: { number: "0100" } }, {});
    expect(result.map((p: any) => p.id)).toEqual(["p1"]);
  });

  it("household load returns what a label needs and no contact details", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = await person.getHouseholdMembers("h1", {}, {});
    expect(result.status).toBeUndefined();
    expect(result[0]).toMatchObject({ id: "p1", householdId: "h1", householdRole: "Child", birthDate: "2018-05-01", grade: "2", nametagNotes: "Peanuts", name: { first: "Donald", last: "Clark", nick: "Don" } });
    expect(result[0].contactInfo).toEqual({});
    expect(result[0].gender).toBeUndefined();
  });

  it("ids load carries the householdId checkout needs", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = await person.getMultiple({ query: { ids: "p1" } }, {});
    expect(result[0].householdId).toBe("h1");
    expect(result[0].contactInfo).toEqual({});
  });

  it("household pickup list is readable for checkout", async () => {
    const { pickup } = setup(checkinNames, []);
    const result = await pickup.getForHousehold("h1", {}, {});
    expect(result).toEqual([{ id: "hp1", name: "Grandma" }]);
  });

  it("still refuses a household load for a caller with View Names alone", async () => {
    const { person } = setup(["peopleViewNames"], [row("p1")]);
    const result = await person.getHouseholdMembers("h1", {}, {});
    expect(result.status).toBe(401);
  });

  it("still refuses phone search for a caller with View Names alone", async () => {
    const { person } = setup(["peopleViewNames"], [row("p1")]);
    const result = await person.searchPhone({ query: { number: "0100" } }, {});
    expect(result.status).toBe(401);
  });
});
