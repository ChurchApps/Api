import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
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
  PublicChurchContext: { bind: jest.fn(() => ({ churchId: null as string, mismatch: false })) }
}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../../../shared/helpers/index.js", () => ({
  __esModule: true,
  CollectionHelper: { convertAll: (data: unknown, convert: (row: unknown) => unknown) => (Array.isArray(data) ? data.map(convert) : []) }
}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: {}, ArrayHelper: { getIds: (): string[] => [], getUnique: (a: unknown[]) => a }, FileStorageHelper: { store: jest.fn() } }));

import { PersonController } from "../PersonController.js";
import { HouseholdPickupController } from "../HouseholdPickupController.js";
import { PersonRepo } from "../../repositories/PersonRepo.js";
import type express from "express";
import { HouseholdPickupPerson, Person } from "../../models/index.js";

interface PersonRow {
  id: string;
  churchId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  nickName: string;
  photo: string;
  householdId: string;
  householdRole: string;
  birthDate: string;
  grade: string;
  nametagNotes: string;
  membershipStatus: string;
  email: string;
  mobilePhone: string;
  address1: string;
  optedOut: boolean;
}

interface FakeUser {
  churchId: string;
  personId: string;
  membershipStatus: string;
  checkAccess: (p: string) => boolean;
}

interface JsonOut { obj: unknown; status: number }

const req = {} as express.Request;
const res = {} as express.Response;

function makeReq(r: Partial<express.Request>): express.Request {
  return r as express.Request;
}

// ChurchAppsSupport#1399: the Checkin permission plus View Names (no View People) must be enough for the kiosk.
const row = (id: string, extra: Partial<PersonRow> = {}): PersonRow => ({
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

function setup(access: string[], rows: PersonRow[]) {
  const realRepo = new PersonRepo();
  const repos = {
    person: {
      search: jest.fn(async () => rows),
      searchPhone: jest.fn(async () => rows),
      loadByHousehold: jest.fn(async () => rows),
      loadByIds: jest.fn(async () => rows),
      load: jest.fn(async (): Promise<PersonRow> => null),
      convertAllToBasicModel: (c: string, d: PersonRow[]) => realRepo.convertAllToBasicModel(c, d),
      convertAllToCheckinModel: (c: string, d: PersonRow[]) => realRepo.convertAllToCheckinModel(c, d),
      convertAllToModelWithPermissions: (c: string, d: PersonRow[], e: boolean) => realRepo.convertAllToModelWithPermissions(c, d, e)
    },
    householdPickupPerson: { loadByHousehold: jest.fn(async () => [{ id: "hp1", name: "Grandma" }]), convertAllToModel: (_c: string, d: HouseholdPickupPerson[]) => d },
    setting: { loadPublicSettings: jest.fn(async (): Promise<unknown[]> => []), convertAllToModel: (_c: string, d: unknown[]) => d }
  };
  const au: FakeUser = { churchId: "c1", personId: "pX", membershipStatus: "Guest", checkAccess: (p: string) => access.includes(p) };
  const wire = <T>(c: T): T => Object.assign(c, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: FakeUser) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { person: wire(new PersonController()), pickup: wire(new HouseholdPickupController()), repos };
}

const checkinNames = ["attendanceCheckin", "peopleViewNames"];

describe("PersonController with Checkin and View Names only", () => {
  it("name search returns the householdId so the kiosk can open the family", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = (await person.search(makeReq({ query: { term: "Clark" } }), res)) as Person[];
    expect(result[0].householdId).toBe("h1");
    expect(result[0].contactInfo).toEqual({});
  });

  it("phone search is allowed and returns only check-in fields", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = (await person.searchPhone(makeReq({ query: { number: "0100" } }), res)) as Person[] & Partial<JsonOut>;
    expect(result.status).toBeUndefined();
    expect(result[0].householdId).toBe("h1");
    expect(result[0].contactInfo).toEqual({});
  });

  it("phone search leaves out people who opted out of the directory", async () => {
    const { person } = setup(checkinNames, [row("p1"), row("p2", { optedOut: true })]);
    const result = (await person.searchPhone(makeReq({ query: { number: "0100" } }), res)) as Person[];
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });

  it("household load returns what a label needs and no contact details", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = (await person.getHouseholdMembers("h1", req, res)) as Person[] & Partial<JsonOut>;
    expect(result.status).toBeUndefined();
    expect(result[0]).toMatchObject({ id: "p1", householdId: "h1", householdRole: "Child", birthDate: "2018-05-01", grade: "2", nametagNotes: "Peanuts", name: { first: "Donald", last: "Clark", nick: "Don" } });
    expect(result[0].contactInfo).toEqual({});
    expect(result[0].gender).toBeUndefined();
  });

  it("ids load carries the householdId checkout needs", async () => {
    const { person } = setup(checkinNames, [row("p1")]);
    const result = (await person.getMultiple(makeReq({ query: { ids: "p1" } }), res)) as Person[];
    expect(result[0].householdId).toBe("h1");
    expect(result[0].contactInfo).toEqual({});
  });

  it("ids load keeps directory opt-outs so checkout can find the household", async () => {
    const { person } = setup(checkinNames, [row("p1"), row("p2", { optedOut: true })]);
    const result = (await person.getMultiple(makeReq({ query: { ids: "p1,p2" } }), res)) as Person[];
    expect(result.map((p) => p.id)).toEqual(["p1", "p2"]);
    for (const p of result) {
      expect(p.householdId).toBe("h1");
      expect(p.contactInfo).toEqual({});
    }
  });

  it("ids load still hides directory opt-outs from View Names alone", async () => {
    const { person } = setup(["peopleViewNames"], [row("p1"), row("p2", { optedOut: true })]);
    const result = (await person.getMultiple(makeReq({ query: { ids: "p1,p2" } }), res)) as Person[];
    expect(result.map((p) => p.id)).toEqual(["p1"]);
    expect(result[0].birthDate).toBeUndefined();
  });

  it("household pickup list is readable for checkout", async () => {
    const { pickup } = setup(checkinNames, []);
    const result = (await pickup.getForHousehold("h1", req, res)) as HouseholdPickupPerson[];
    expect(result).toEqual([{ id: "hp1", name: "Grandma" }]);
  });

  it("still refuses a household load for a caller with View Names alone", async () => {
    const { person } = setup(["peopleViewNames"], [row("p1")]);
    const result = (await person.getHouseholdMembers("h1", req, res)) as JsonOut;
    expect(result.status).toBe(401);
  });

  it("still refuses phone search for a caller with View Names alone", async () => {
    const { person } = setup(["peopleViewNames"], [row("p1")]);
    const result = (await person.searchPhone(makeReq({ query: { number: "0100" } }), res)) as JsonOut;
    expect(result.status).toBe(401);
  });

  // ChurchAppsSupport#1426: a role holder whose roles grant no Check-in gets none of the kiosk's reads.
  it("refuses the kiosk's person reads for a role holder without Check-in", async () => {
    const { person, repos } = setup([], [row("p1")]);
    expect(((await person.searchPhone(makeReq({ query: { number: "0100" } }), res)) as JsonOut).status).toBe(401);
    expect(((await person.getHouseholdMembers("h1", req, res)) as JsonOut).status).toBe(401);
    expect(repos.person.searchPhone).not.toHaveBeenCalled();
    expect(repos.person.loadByHousehold).not.toHaveBeenCalled();
  });
});
