import { initTestDb, teardownTestDb } from "../db-helper";
import { AnswerRepo } from "../../modules/membership/repositories/AnswerRepo";
import { DomainRepo } from "../../modules/membership/repositories/DomainRepo";
import { FormRepo } from "../../modules/membership/repositories/FormRepo";
import { FormSubmissionRepo } from "../../modules/membership/repositories/FormSubmissionRepo";
import { GroupRepo } from "../../modules/membership/repositories/GroupRepo";
import { GroupMemberRepo } from "../../modules/membership/repositories/GroupMemberRepo";
import { HouseholdRepo } from "../../modules/membership/repositories/HouseholdRepo";
import { MemberPermissionRepo } from "../../modules/membership/repositories/MemberPermissionRepo";
import { PersonRepo } from "../../modules/membership/repositories/PersonRepo";
import { QuestionRepo } from "../../modules/membership/repositories/QuestionRepo";
import { RoleRepo } from "../../modules/membership/repositories/RoleRepo";
import { RoleMemberRepo } from "../../modules/membership/repositories/RoleMemberRepo";
import { RolePermissionRepo } from "../../modules/membership/repositories/RolePermissionRepo";
import { SettingRepo } from "../../modules/membership/repositories/SettingRepo";
import { VisibilityPreferenceRepo } from "../../modules/membership/repositories/VisibilityPreferenceRepo";
import { AccessLogRepo } from "../../modules/membership/repositories/AccessLogRepo";
import { AuditLogRepo } from "../../modules/membership/repositories/AuditLogRepo";
import { UserChurchRepo } from "../../modules/membership/repositories/UserChurchRepo";
import { ChurchRepo } from "../../modules/membership/repositories/ChurchRepo";
import { UserRepo } from "../../modules/membership/repositories/UserRepo";
import { getDrizzleDb } from "../../db/drizzle";
import { sql } from "drizzle-orm";

const churchId = `m${Date.now().toString(36).slice(-10)}`;

beforeAll(async () => {
  await initTestDb();
});

afterAll(async () => {
  const db = getDrizzleDb("membership");
  await db.execute(sql`DELETE FROM answers WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM formSubmissions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM questions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM forms WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM memberPermissions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM groupMembers WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM \`groups\` WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM people WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM households WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM domains WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM rolePermissions WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM roleMembers WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM roles WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM settings WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM visibilityPreferences WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM accessLogs WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM auditLogs WHERE churchId = ${churchId}`);
  await db.execute(sql`DELETE FROM userChurches WHERE churchId = ${churchId}`);
  await teardownTestDb();
});

describe("PersonRepo", () => {
  const repo = new PersonRepo();
  let personId: string;

  it("should create a person", async () => {
    const person = await repo.save({
      churchId,
      name: { first: "Test", last: "User", display: "" },
      contactInfo: { email: "test@example.com" }
    } as any);
    expect(person.id).toBeDefined();
    personId = person.id;
  });

  it("should load a person by id", async () => {
    const person = await repo.load(churchId, personId);
    expect(person).not.toBeNull();
    expect(person.name.first).toBe("Test");
  });

  it("should loadAll", async () => {
    const results = await repo.loadAll(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should search by name", async () => {
    const results = await repo.search(churchId, "Test");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete (soft) a person", async () => {
    const temp = await repo.save({
      churchId,
      name: { first: "Del", last: "Person", display: "" },
      contactInfo: {}
    } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("HouseholdRepo", () => {
  const repo = new HouseholdRepo();
  let hhId: string;

  it("should create a household", async () => {
    const hh = await repo.save({ churchId, name: "Smith" } as any);
    expect(hh.id).toBeDefined();
    hhId = hh.id;
  });

  it("should load a household", async () => {
    const hh = await repo.loadOne(churchId, hhId);
    expect(hh).not.toBeNull();
  });

  it("should delete a household", async () => {
    const temp = await repo.save({ churchId, name: "Temp" } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.loadOne(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("GroupRepo", () => {
  const repo = new GroupRepo();
  let groupId: string;

  it("should create a group", async () => {
    const group = await repo.save({ churchId, name: "Youth", categoryName: "Ministry", tags: "standard", labelArray: [] } as any);
    expect(group.id).toBeDefined();
    groupId = group.id;
  });

  it("should load a group", async () => {
    const group = await repo.load(churchId, groupId);
    expect(group).not.toBeNull();
    expect(group.name).toBe("Youth");
  });

  it("should loadAll with member count", async () => {
    const results = await repo.loadAll(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete (soft) a group", async () => {
    const temp = await repo.save({ churchId, name: "TempGroup", categoryName: "test", tags: "", labelArray: [] } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("GroupMemberRepo", () => {
  const groupRepo = new GroupRepo();
  const personRepo = new PersonRepo();
  const repo = new GroupMemberRepo();
  let groupId: string;
  let personId: string;
  let gmId: string;

  beforeAll(async () => {
    const group = await groupRepo.save({ churchId, name: "GMTest", categoryName: "test", tags: "", labelArray: [] } as any);
    groupId = group.id;
    const person = await personRepo.save({ churchId, name: { first: "GM", last: "Test", display: "" }, contactInfo: {} } as any);
    personId = person.id;
  });

  it("should create a group member", async () => {
    const gm = await repo.save({ churchId, groupId, personId } as any);
    expect(gm.id).toBeDefined();
    gmId = gm.id;
  });

  it("should loadForGroup", async () => {
    const results = await repo.loadForGroup(churchId, groupId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete a group member", async () => {
    await repo.delete(churchId, gmId);
    const deleted = await repo.load(churchId, gmId);
    expect(deleted).toBeNull();
  });
});

describe("RoleRepo", () => {
  const repo = new RoleRepo();
  let roleId: string;

  it("should create a role", async () => {
    const role = await repo.save({ churchId, name: "TestRole" } as any);
    expect(role.id).toBeDefined();
    roleId = role.id;
  });

  it("should load a role", async () => {
    const role = await repo.loadOne(churchId, roleId);
    expect(role).not.toBeNull();
    expect(role.name).toBe("TestRole");
  });

  it("should loadAll", async () => {
    const results = await repo.loadAll(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete a role", async () => {
    const temp = await repo.save({ churchId, name: "TempRole" } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.loadOne(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("SettingRepo", () => {
  const repo = new SettingRepo();
  let settingId: string;

  it("should create a setting", async () => {
    const setting = await repo.save({ churchId, keyName: "testKey", value: "testValue", public: false } as any);
    expect(setting.id).toBeDefined();
    settingId = setting.id;
  });

  it("should load a setting", async () => {
    const setting = await repo.loadOne(churchId, settingId);
    expect(setting).not.toBeNull();
  });

  it("should delete a setting", async () => {
    await repo.delete(churchId, settingId);
    const deleted = await repo.loadOne(churchId, settingId);
    expect(deleted).toBeNull();
  });
});

describe("DomainRepo", () => {
  const repo = new DomainRepo();
  let domainId: string;

  it("should create a domain", async () => {
    const domain = await repo.save({ churchId, domainName: `test-${churchId}.example.com` } as any);
    expect(domain.id).toBeDefined();
    domainId = domain.id;
  });

  it("should load a domain by name", async () => {
    const domain = await repo.loadByName(`test-${churchId}.example.com`);
    expect(domain).not.toBeNull();
  });

  it("should delete a domain", async () => {
    await repo.delete(churchId, domainId);
    const deleted = await repo.loadOne(churchId, domainId);
    expect(deleted).toBeNull();
  });
});

describe("AccessLogRepo", () => {
  const repo = new AccessLogRepo();

  it("should create an access log", async () => {
    const log = await repo.create({ churchId, userId: "testuser001", ip: "127.0.0.1" } as any);
    expect(log.id).toBeDefined();
  });

  it("should loadAll", async () => {
    const results = await repo.loadAll(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("AuditLogRepo", () => {
  const repo = new AuditLogRepo();
  let logId: string;

  it("should create an audit log", async () => {
    const log = await repo.create({ churchId, category: "test", userId: "testuser001", entityType: "person", entityId: "p001", action: "create" } as any);
    expect(log.id).toBeDefined();
    logId = log.id;
  });

  it("should load an audit log", async () => {
    const log = await repo.load(churchId, logId);
    expect(log).not.toBeNull();
  });

  it("should loadFiltered", async () => {
    const results = await repo.loadFiltered(churchId, { category: "test" });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("FormRepo", () => {
  const repo = new FormRepo();
  let formId: string;

  it("should create a form", async () => {
    const form = await repo.save({ churchId, name: "Registration", contentType: "person" } as any);
    expect(form.id).toBeDefined();
    formId = form.id;
  });

  it("should load a form", async () => {
    const form = await repo.load(churchId, formId);
    expect(form).not.toBeNull();
    expect(form.name).toBe("Registration");
  });

  it("should loadAll (non-archived)", async () => {
    const results = await repo.loadAll(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete (soft) a form", async () => {
    const temp = await repo.save({ churchId, name: "TempForm", contentType: "form" } as any);
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("VisibilityPreferenceRepo", () => {
  const repo = new VisibilityPreferenceRepo();
  let vpId: string;

  it("should create a visibility preference", async () => {
    const vp = await repo.save({ churchId, personId: "vpprs00001", preferenceType: "directory", value: "members" } as any);
    expect(vp.id).toBeDefined();
    vpId = vp.id;
  });

  it("should loadForPerson", async () => {
    const results = await repo.loadForPerson(churchId, "vpprs00001");
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete", async () => {
    await repo.delete(churchId, vpId);
    const deleted = await repo.loadOne(churchId, vpId);
    expect(deleted).toBeNull();
  });
});

describe("UserChurchRepo", () => {
  const repo = new UserChurchRepo();

  it("should create a user church", async () => {
    const uc = await repo.save({ churchId, userId: "uctu001", personId: "ucp001" } as any);
    expect(uc.id).toBeDefined();
  });

  it("should loadAll for church", async () => {
    const results = await repo.loadAll(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("QuestionRepo", () => {
  const formRepo = new FormRepo();
  const repo = new QuestionRepo();
  let formId: string;
  let questionId: string;
  let q2Id: string;

  beforeAll(async () => {
    const form = await formRepo.save({ churchId, name: "QTest Form", contentType: "form" } as any);
    formId = form.id;
  });

  it("should create a question", async () => {
    const q = await repo.save({ churchId, formId, title: "Your Name?", fieldType: "text", sort: 1, choices: [] } as any);
    expect(q.id).toBeDefined();
    questionId = q.id;
  });

  it("should load a question", async () => {
    const q = await repo.load(churchId, questionId);
    expect(q).not.toBeNull();
    expect(q.title).toBe("Your Name?");
  });

  it("should loadForForm", async () => {
    const results = await repo.loadForForm(churchId, formId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should update a question", async () => {
    await repo.save({ id: questionId, churchId, formId, title: "Full Name?", fieldType: "text", sort: 1, choices: ["a", "b"] } as any);
    const q = await repo.load(churchId, questionId);
    expect(q.title).toBe("Full Name?");
    expect(q.choices).toEqual(["a", "b"]);
  });

  it("should moveQuestionDown and moveQuestionUp", async () => {
    const q2 = await repo.save({ churchId, formId, title: "Email?", fieldType: "text", sort: 2, choices: [] } as any);
    q2Id = q2.id;
    await repo.moveQuestionDown(questionId);
    const moved = await repo.load(churchId, questionId);
    expect(+moved.sort).toBe(2);
    await repo.moveQuestionUp(questionId);
    const restored = await repo.load(churchId, questionId);
    expect(+restored.sort).toBe(1);
  });

  it("should soft-delete via delete()", async () => {
    await repo.delete(churchId, q2Id);
    const deleted = await repo.load(churchId, q2Id);
    expect(deleted).toBeNull();
  });
});

describe("RoleMemberRepo", () => {
  const roleRepo = new RoleRepo();
  const repo = new RoleMemberRepo();
  let roleId: string;
  let rmId: string;

  beforeAll(async () => {
    const role = await roleRepo.save({ churchId, name: "RMTestRole" } as any);
    roleId = role.id;
  });

  it("should create a role member", async () => {
    const rm = await repo.save({ churchId, roleId, userId: "rmuser001" } as any);
    expect(rm.id).toBeDefined();
    rmId = rm.id;
  });

  it("should loadByRoleId", async () => {
    const results = await repo.loadByRoleId(roleId, churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadById", async () => {
    const rm = await repo.loadById(rmId, churchId);
    expect(rm).not.toBeNull();
  });

  it("should deleteSelf", async () => {
    const rm2 = await repo.save({ churchId, roleId, userId: "rmuser002" } as any);
    await repo.deleteSelf(churchId, "rmuser002");
    const deleted = await repo.loadById(rm2.id, churchId);
    expect(deleted).toBeNull();
  });

  it("should deleteForRole", async () => {
    await repo.deleteForRole(churchId, roleId);
    const results = await repo.loadByRoleId(roleId, churchId);
    expect(results.length).toBe(0);
  });
});

describe("RolePermissionRepo", () => {
  const roleRepo = new RoleRepo();
  const repo = new RolePermissionRepo();
  let roleId: string;
  let rpId: string;

  beforeAll(async () => {
    const role = await roleRepo.save({ churchId, name: "RPTestRole" } as any);
    roleId = role.id;
  });

  it("should create a role permission", async () => {
    const rp = await repo.save({ churchId, roleId, apiName: "MembershipApi", contentType: "people", contentId: "", action: "view" } as any);
    expect(rp.id).toBeDefined();
    rpId = rp.id;
  });

  it("should loadByRoleId", async () => {
    const results = await repo.loadByRoleId(churchId, roleId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadForEveryone", async () => {
    // Create a permission with null roleId (applies to everyone)
    await repo.save({ churchId, roleId: null, apiName: "MembershipApi", contentType: "directory", contentId: "", action: "view" } as any);
    const results = await repo.loadForEveryone(churchId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should deleteForRole", async () => {
    await repo.deleteForRole(churchId, roleId);
    const results = await repo.loadByRoleId(churchId, roleId);
    expect(results.length).toBe(0);
  });
});

describe("MemberPermissionRepo", () => {
  const personRepo = new PersonRepo();
  const formRepo = new FormRepo();
  const repo = new MemberPermissionRepo();
  let personId: string;
  let formId: string;
  let mpId: string;

  beforeAll(async () => {
    const person = await personRepo.save({ churchId, name: { first: "MP", last: "Test", display: "" }, contactInfo: {} } as any);
    personId = person.id;
    const form = await formRepo.save({ churchId, name: "MP Test Form", contentType: "form" } as any);
    formId = form.id;
  });

  it("should create a member permission", async () => {
    const mp = await repo.save({ churchId, memberId: personId, contentType: "form", contentId: formId, action: "admin", emailNotification: true } as any);
    expect(mp.id).toBeDefined();
    mpId = mp.id;
  });

  it("should loadMyByForm", async () => {
    const mp = await repo.loadMyByForm(churchId, formId, personId);
    expect(mp).not.toBeNull();
    expect(mp.action).toBe("admin");
  });

  it("should loadByEmailNotification", async () => {
    const results = await repo.loadByEmailNotification(churchId, "form", formId, true);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadFormsByPerson", async () => {
    const results = await repo.loadFormsByPerson(churchId, personId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadPeopleByForm", async () => {
    const results = await repo.loadPeopleByForm(churchId, formId);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("should deleteByMemberId", async () => {
    await repo.deleteByMemberId(churchId, personId, formId);
    const deleted = await repo.loadMyByForm(churchId, formId, personId);
    expect(deleted).toBeNull();
  });
});
