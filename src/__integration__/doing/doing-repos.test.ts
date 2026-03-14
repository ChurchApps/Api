import { initTestDb, teardownTestDb, cleanupSql } from "../db-helper";
import { AutomationRepo } from "../../modules/doing/repositories/AutomationRepo";
import { ActionRepo } from "../../modules/doing/repositories/ActionRepo";
import { ConjunctionRepo } from "../../modules/doing/repositories/ConjunctionRepo";
import { ConditionRepo } from "../../modules/doing/repositories/ConditionRepo";
import { PlanTypeRepo } from "../../modules/doing/repositories/PlanTypeRepo";
import { PlanRepo } from "../../modules/doing/repositories/PlanRepo";
import { PlanItemRepo } from "../../modules/doing/repositories/PlanItemRepo";
import { PositionRepo } from "../../modules/doing/repositories/PositionRepo";
import { AssignmentRepo } from "../../modules/doing/repositories/AssignmentRepo";
import { TimeRepo } from "../../modules/doing/repositories/TimeRepo";
import { BlockoutDateRepo } from "../../modules/doing/repositories/BlockoutDateRepo";
import { TaskRepo } from "../../modules/doing/repositories/TaskRepo";
import { getDrizzleDb } from "../../db/drizzle";

const churchId = `d${Date.now().toString(36).slice(-10)}`;
const personId = "dprs0000001";

beforeAll(async () => {
  await initTestDb();
});

afterAll(async () => {
  const db = getDrizzleDb("doing");
  await db.execute(cleanupSql("actions", churchId));
  await db.execute(cleanupSql("conditions", churchId));
  await db.execute(cleanupSql("conjunctions", churchId));
  await db.execute(cleanupSql("assignments", churchId));
  await db.execute(cleanupSql("times", churchId));
  await db.execute(cleanupSql("planItems", churchId));
  await db.execute(cleanupSql("positions", churchId));
  await db.execute(cleanupSql("plans", churchId));
  await db.execute(cleanupSql("planTypes", churchId));
  await db.execute(cleanupSql("automations", churchId));
  await db.execute(cleanupSql("blockoutDates", churchId));
  await db.execute(cleanupSql("tasks", churchId));
  await teardownTestDb();
});

// ──────────────── Automation + Action + Conjunction + Condition ────────────────

describe("AutomationRepo", () => {
  const repo = new AutomationRepo();
  let automationId: string;

  it("should create an automation", async () => {
    const result = await repo.save({ churchId, title: "Birthday Task", recurs: "yearly", active: true });
    expect(result.id).toBeDefined();
    automationId = result.id;
  });

  it("should load by id", async () => {
    const row = await repo.load(churchId, automationId);
    expect(row).not.toBeNull();
    expect(row.title).toBe("Birthday Task");
  });

  it("should loadAll ordered by title", async () => {
    await repo.save({ churchId, title: "Anniversary Task", recurs: "yearly", active: false });
    const all = await repo.loadAll(churchId);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all[0].title).toBe("Anniversary Task");
  });

  it("should loadAllChurches", async () => {
    const all = await repo.loadAllChurches();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("should update", async () => {
    await repo.save({ id: automationId, churchId, title: "Updated Birthday", recurs: "yearly", active: true });
    const row = await repo.load(churchId, automationId);
    expect(row.title).toBe("Updated Birthday");
  });

  it("should delete", async () => {
    const temp = await repo.save({ churchId, title: "Temp", recurs: "once" });
    await repo.delete(churchId, temp.id);
    const deleted = await repo.load(churchId, temp.id);
    expect(deleted).toBeNull();
  });
});

describe("ActionRepo", () => {
  const repo = new ActionRepo();
  let automationId: string;

  beforeAll(async () => {
    const auto = await new AutomationRepo().save({ churchId, title: "Action Test Auto", recurs: "once" });
    automationId = auto.id;
  });

  it("should create an action", async () => {
    const result = await repo.save({ churchId, automationId, actionType: "createTask", actionData: JSON.stringify({ title: "Follow up" }) });
    expect(result.id).toBeDefined();
  });

  it("should loadForAutomation", async () => {
    const rows = await repo.loadForAutomation(churchId, automationId);
    expect(rows.length).toBe(1);
    expect(rows[0].actionType).toBe("createTask");
  });
});

describe("ConjunctionRepo + ConditionRepo", () => {
  const conjRepo = new ConjunctionRepo();
  const condRepo = new ConditionRepo();
  let automationId: string;
  let conjunctionId: string;

  beforeAll(async () => {
    const auto = await new AutomationRepo().save({ churchId, title: "Condition Test Auto", recurs: "monthly" });
    automationId = auto.id;
  });

  it("should create a conjunction", async () => {
    const result = await conjRepo.save({ churchId, automationId, groupType: "AND" });
    expect(result.id).toBeDefined();
    conjunctionId = result.id;
  });

  it("should loadForAutomation (conjunction)", async () => {
    const rows = await conjRepo.loadForAutomation(churchId, automationId);
    expect(rows.length).toBe(1);
  });

  it("should create a condition", async () => {
    const result = await condRepo.save({ churchId, conjunctionId, field: "birthDate", operator: "equals", value: "January" });
    expect(result.id).toBeDefined();
  });

  it("should loadForAutomation (condition via subquery)", async () => {
    const rows = await condRepo.loadForAutomation(churchId, automationId);
    expect(rows.length).toBe(1);
    expect(rows[0].field).toBe("birthDate");
  });
});

// ──────────────── Plan hierarchy: PlanType → Plan → PlanItem/Position/Time ────────────────

describe("PlanTypeRepo", () => {
  const repo = new PlanTypeRepo();
  let planTypeId: string;

  it("should create a plan type", async () => {
    const result = await repo.save({ churchId, ministryId: "min0000001", name: "Sunday Service" });
    expect(result.id).toBeDefined();
    planTypeId = result.id;
  });

  it("should loadByMinistryId", async () => {
    const rows = await repo.loadByMinistryId(churchId, "min0000001");
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Sunday Service");
  });

  it("should loadByIds", async () => {
    const rows = await repo.loadByIds(churchId, [planTypeId]);
    expect(rows.length).toBe(1);
  });
});

describe("PlanRepo", () => {
  const repo = new PlanRepo();
  let planId: string;
  let planTypeId: string;

  beforeAll(async () => {
    const pt = await new PlanTypeRepo().save({ churchId, ministryId: "min0000001", name: "Plan Test Type" });
    planTypeId = pt.id;
  });

  it("should create with date normalization", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const result = await repo.save({ churchId, planTypeId, name: "Sunday Plan", serviceDate: futureDate });
    expect(result.id).toBeDefined();
    planId = result.id;
  });

  it("should load by id", async () => {
    const row = await repo.load(churchId, planId);
    expect(row).not.toBeNull();
    expect(row.name).toBe("Sunday Plan");
  });

  it("should loadByPlanTypeId", async () => {
    const rows = await repo.loadByPlanTypeId(churchId, planTypeId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadByIds", async () => {
    const rows = await repo.loadByIds(churchId, [planId]);
    expect(rows.length).toBe(1);
  });

  it("should load7Days (future plan within range)", async () => {
    const rows = await repo.load7Days(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadCurrentByPlanTypeId", async () => {
    const row = await repo.loadCurrentByPlanTypeId(planTypeId);
    expect(row).not.toBeNull();
  });

  it("should update plan", async () => {
    const existing = await repo.load(churchId, planId);
    await repo.save({ ...existing, name: "Updated Sunday" });
    const updated = await repo.load(churchId, planId);
    expect(updated.name).toBe("Updated Sunday");
  });
});

describe("PlanItemRepo", () => {
  const repo = new PlanItemRepo();
  let planId: string;

  beforeAll(async () => {
    const plan = await new PlanRepo().save({ churchId, name: "Item Plan", serviceDate: new Date() });
    planId = plan.id;
  });

  it("should create a plan item", async () => {
    const result = await repo.save({ churchId, planId, sort: 1, itemType: "song", label: "Opening Song" });
    expect(result.id).toBeDefined();
  });

  it("should create a second item", async () => {
    const result = await repo.save({ churchId, planId, sort: 2, itemType: "header", label: "Worship" });
    expect(result.id).toBeDefined();
  });

  it("should loadForPlan ordered by sort", async () => {
    const rows = await repo.loadForPlan(churchId, planId);
    expect(rows.length).toBe(2);
    expect(rows[0].label).toBe("Opening Song");
    expect(rows[1].label).toBe("Worship");
  });

  it("should deleteByPlanId", async () => {
    await repo.deleteByPlanId(churchId, planId);
    const rows = await repo.loadForPlan(churchId, planId);
    expect(rows.length).toBe(0);
  });
});

describe("PositionRepo", () => {
  const repo = new PositionRepo();
  let planId: string;
  let posId: string;

  beforeAll(async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const plan = await new PlanRepo().save({ churchId, name: "Position Plan", serviceDate: futureDate });
    planId = plan.id;
  });

  it("should create a position", async () => {
    const result = await repo.save({ churchId, planId, categoryName: "Worship", name: "Lead Guitar", count: 1, allowSelfSignup: true });
    expect(result.id).toBeDefined();
    posId = result.id;
  });

  it("should loadByPlanId ordered", async () => {
    await repo.save({ churchId, planId, categoryName: "Tech", name: "Sound", count: 2, allowSelfSignup: false });
    const rows = await repo.loadByPlanId(churchId, planId);
    expect(rows.length).toBe(2);
  });

  it("should loadSignupByPlanId (only allowSelfSignup)", async () => {
    const rows = await repo.loadSignupByPlanId(churchId, planId);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Lead Guitar");
  });

  it("should loadByPlanIds", async () => {
    const rows = await repo.loadByPlanIds(churchId, [planId]);
    expect(rows.length).toBe(2);
  });

  it("should loadByIds", async () => {
    const rows = await repo.loadByIds(churchId, [posId]);
    expect(rows.length).toBe(1);
  });
});

describe("AssignmentRepo", () => {
  const repo = new AssignmentRepo();
  let planId: string;
  let positionId: string;

  beforeAll(async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    const plan = await new PlanRepo().save({ churchId, name: "Assignment Plan", serviceDate: futureDate });
    planId = plan.id;
    const pos = await new PositionRepo().save({ churchId, planId, categoryName: "Band", name: "Drums", count: 1 });
    positionId = pos.id;
  });

  it("should create an assignment", async () => {
    const result = await repo.save({ churchId, positionId, personId, status: "Accepted" });
    expect(result.id).toBeDefined();
  });

  it("should loadByPlanId via JOIN", async () => {
    const rows = await repo.loadByPlanId(churchId, planId);
    expect(rows.length).toBe(1);
    expect(rows[0].personId).toBe(personId);
  });

  it("should loadByPlanIds", async () => {
    const rows = await repo.loadByPlanIds(churchId, [planId]);
    expect(rows.length).toBe(1);
  });

  it("should loadByByPersonId", async () => {
    const rows = await repo.loadByByPersonId(churchId, personId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should countByPositionId", async () => {
    const result = await repo.countByPositionId(churchId, positionId);
    expect(Number(result.cnt)).toBe(1);
  });

  it("should loadLastServed", async () => {
    const rows = await repo.loadLastServed(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const match = rows.find(r => r.personId === personId);
    expect(match).toBeDefined();
  });

  it("should deleteByPlanId", async () => {
    await repo.deleteByPlanId(churchId, planId);
    const rows = await repo.loadByPlanId(churchId, planId);
    expect(rows.length).toBe(0);
  });
});

describe("TimeRepo", () => {
  const repo = new TimeRepo();
  let planId: string;

  beforeAll(async () => {
    const plan = await new PlanRepo().save({ churchId, name: "Time Plan", serviceDate: new Date() });
    planId = plan.id;
  });

  it("should create a time", async () => {
    const result = await repo.save({ churchId, planId, displayName: "9:00 AM", startTime: new Date(), endTime: new Date() });
    expect(result.id).toBeDefined();
  });

  it("should loadByPlanId", async () => {
    const rows = await repo.loadByPlanId(churchId, planId);
    expect(rows.length).toBe(1);
    expect(rows[0].displayName).toBe("9:00 AM");
  });

  it("should loadByPlanIds", async () => {
    const rows = await repo.loadByPlanIds(churchId, [planId]);
    expect(rows.length).toBe(1);
  });

  it("should deleteByPlanId", async () => {
    await repo.deleteByPlanId(churchId, planId);
    const rows = await repo.loadByPlanId(churchId, planId);
    expect(rows.length).toBe(0);
  });
});

// ──────────────── BlockoutDateRepo ────────────────

describe("BlockoutDateRepo", () => {
  const repo = new BlockoutDateRepo();
  let blockoutId: string;

  it("should create with date normalization", async () => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7);
    const result = await repo.save({ churchId, personId, startDate: start, endDate: end });
    expect(result.id).toBeDefined();
    blockoutId = result.id;
  });

  it("should load by id", async () => {
    const row = await repo.load(churchId, blockoutId);
    expect(row).not.toBeNull();
    expect(row.personId).toBe(personId);
  });

  it("should loadForPerson", async () => {
    const rows = await repo.loadForPerson(churchId, personId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadByIds", async () => {
    const rows = await repo.loadByIds(churchId, [blockoutId]);
    expect(rows.length).toBe(1);
  });

  it("should loadUpcoming", async () => {
    const rows = await repo.loadUpcoming(churchId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should delete", async () => {
    await repo.delete(churchId, blockoutId);
    const deleted = await repo.load(churchId, blockoutId);
    expect(deleted).toBeNull();
  });
});

// ──────────────── TaskRepo ────────────────

describe("TaskRepo", () => {
  const repo = new TaskRepo();
  let taskId: string;

  it("should create with auto-increment taskNumber", async () => {
    const result = await repo.save({
      churchId,
      taskType: "general",
      title: "Test Task",
      status: "Open",
      associatedWithType: "person",
      associatedWithId: personId,
      createdByType: "person",
      createdById: personId,
      assignedToType: "person",
      assignedToId: personId
    });
    expect(result.id).toBeDefined();
    expect(result.taskNumber).toBeDefined();
    taskId = result.id;
  });

  it("should load by id", async () => {
    const row = await repo.load(churchId, taskId);
    expect(row).not.toBeNull();
    expect(row.title).toBe("Test Task");
  });

  it("should auto-increment taskNumber", async () => {
    const result = await repo.save({
      churchId,
      taskType: "general",
      title: "Task 2",
      status: "Open",
      assignedToType: "person",
      assignedToId: personId,
      createdByType: "person",
      createdById: personId
    });
    const first = await repo.load(churchId, taskId);
    expect(result.taskNumber).toBe(first.taskNumber + 1);
  });

  it("should loadTimeline (person matches)", async () => {
    const rows = await repo.loadTimeline(churchId, personId, []);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadTimeline with extra taskIds", async () => {
    const rows = await repo.loadTimeline(churchId, "nonexistent", [taskId]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadForPerson", async () => {
    const rows = await repo.loadForPerson(churchId, personId, "Open");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("should loadForGroups (empty)", async () => {
    const rows = await repo.loadForGroups(churchId, [], "Open");
    expect(rows.length).toBe(0);
  });

  it("should loadForDirectoryUpdate (none exist)", async () => {
    const rows = await repo.loadForDirectoryUpdate(churchId, personId);
    expect(rows.length).toBe(0);
  });

  it("should update task", async () => {
    const row = await repo.load(churchId, taskId);
    row.status = "Closed";
    row.dateClosed = new Date();
    await repo.save(row);
    const updated = await repo.load(churchId, taskId);
    expect(updated.status).toBe("Closed");
  });
});

// ContentProviderAuthRepo skipped: contentProviderAuths table not in DB yet
