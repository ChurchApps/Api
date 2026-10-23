/** Opt-in integration test. Uses only a disposable localhost MySQL database.
 * CONFIRMATION_TEST_MYSQL=1 CONFIRMATION_TEST_PORT=33307 yarn exec jest --runInBand AssignmentConfirmationDatabase
 */
import "reflect-metadata";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";
jest.mock("../../../../shared/infrastructure/KyselyPool.js", () => ({ KyselyPool: { getDb: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({
  UniqueIdHelper: { shortId: () => Math.random().toString(36).slice(2, 13) },
  DateHelper: { addDays: (date: Date, days: number) => new Date(date.getTime() + days * 86400000), toMysqlDate: (d: Date) => new Date(d).toISOString().slice(0, 19).replace("T", " ") }
}));
const send = jest.fn(async () => "sent");
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadPerson: async (_c: string, id: string) => ({ id, displayName: "Sample Volunteer", email: "volunteer@example.test" }), loadChurch: async () => ({ name: "Sample Church", timeZone: "UTC" }), loadGroupLeaderPersonIds: async () => [] }),
  getMessagingModuleGateway: () => ({ sendServingWorkflowMessage: (...args: any[]) => send(...args) })
}));
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: async () => [] } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "synthetic-test-secret", doingApi: "http://localhost/doing" } }));
jest.mock("../../helpers/ConjunctionHelper.js", () => ({ ConjunctionHelper: { personMatchesStepRoute: async () => false } }));
import { AssignmentWorkflowHelper } from "../../helpers/AssignmentWorkflowHelper.js";
import { WorkflowHelper } from "../../helpers/WorkflowHelper.js";
import { WorkflowTemplates } from "../../helpers/WorkflowTemplates.js";
import { TimeRepo } from "../TimeRepo.js";
import { PlanRepo } from "../PlanRepo.js";
import { PositionRepo } from "../PositionRepo.js";
import { WorkflowRepo } from "../WorkflowRepo.js";
import { WorkflowStepRepo } from "../WorkflowStepRepo.js";
import { WorkflowStepActionRepo } from "../WorkflowStepActionRepo.js";
import { WorkflowStepRouteRepo } from "../WorkflowStepRouteRepo.js";
import { KyselyPool } from "../../../../shared/infrastructure/KyselyPool.js";
import { TaskRepo } from "../TaskRepo.js";
import { AssignmentRepo } from "../AssignmentRepo.js";
import { up as initial } from "../../../../../tools/migrations/doing/2026-04-03_initial_schema.js";
import { up as workflows } from "../../../../../tools/migrations/doing/2026-06-05_workflows.js";
import { up as triggers } from "../../../../../tools/migrations/doing/2026-06-06_workflowTriggers.js";
import { up as unify } from "../../../../../tools/migrations/doing/2026-06-07_unify_form_triggers.js";
import { up as actions } from "../../../../../tools/migrations/doing/2026-06-08_workflow_automations.js";
import { up as scheduling } from "../../../../../tools/migrations/doing/2026-06-11_auto_scheduling.js";
import { up, down } from "../../../../../tools/migrations/doing/2026-10-22_assignment_confirmation_workflows.js";

const databaseTests = process.env.CONFIRMATION_TEST_MYSQL === "1" ? describe : describe.skip;
databaseTests("assignment confirmation migrations and repositories (MySQL 8)", () => {
  let db: Kysely<any>;
  let server: Kysely<any>;
  const tasks = new TaskRepo();
  const assignments = new AssignmentRepo();
  const database = "churchapps_confirmation_test";
  beforeAll(async () => {
    const config = { host: "127.0.0.1", port: Number(process.env.CONFIRMATION_TEST_PORT || 33307), user: "root", password: "", connectionLimit: 2, typeCast(field: any, next: () => unknown) { if (field.type === "BIT" && field.length === 1) { const bytes = field.buffer(); return bytes ? bytes[0] === 1 : null; } return next(); } };
    server = new Kysely({ dialect: new MysqlDialect({ pool: createPool(config) }) });
    // The hard-coded disposable name and localhost prevent pointing this test at church data.
    await sql`drop database if exists ${sql.id(database)}`.execute(server);
    await sql`create database ${sql.id(database)}`.execute(server);
    db = new Kysely({ dialect: new MysqlDialect({ pool: createPool({ ...config, database }) }) });
    (KyselyPool.getDb as jest.Mock).mockReturnValue(db);
    for (const migration of [initial, workflows, triggers, unify, actions, scheduling, up]) await migration(db);
    await sql`insert into plans (id, churchId, name, serviceDate, prepared) values ('plan1', 'c1', 'Sample service', '2030-04-07', 0)`.execute(db);
    await sql`insert into positions (id, churchId, planId, name) values ('pos1', 'c1', 'plan1', 'Greeter')`.execute(db);
  }, 30000);
  afterAll(async () => {
    if (db) await db.destroy();
    if (server) { await sql`drop database if exists ${sql.id(database)}`.execute(server); await server.destroy(); }
  });
  beforeEach(async () => { await db.deleteFrom("tasks").execute(); await db.deleteFrom("assignments").execute(); });

  it("scopes issuance by church and never enrolls through ordinary saves", async () => {
    const a = await assignments.save({ churchId: "c1", personId: "p1", positionId: "pos1", status: "Unconfirmed", confirmationWorkflowId: "forged" });
    expect((await assignments.load("c1", a.id)).confirmationWorkflowId).toBeNull();
    await assignments.issueConfirmation("c2", a.id, "wf1");
    expect((await assignments.load("c1", a.id)).confirmationWorkflowId).toBeNull();
    await Promise.all([assignments.issueConfirmation("c1", a.id, "wf1"), assignments.issueConfirmation("c1", a.id, "wf2")]);
    expect(["wf1", "wf2"]).toContain((await assignments.load("c1", a.id)).confirmationWorkflowId);
    expect(await assignments.loadIssuedConfirmations()).toHaveLength(1);
  });

  it("serializes request execution across connections and releases the lock after failure", async () => {
    let unlock: () => void;
    let entered: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const release = new Promise<void>((resolve) => { unlock = resolve; });
    const first = tasks.withAssignmentLock("c1", "a1", async () => { entered(); await release; return "first"; });
    await ready;
    expect(await tasks.withAssignmentLock("c1", "a1", async () => "duplicate")).toBeNull();
    expect(await tasks.withAssignmentLock("c2", "a1", async () => "other church")).toBe("other church");
    unlock(); expect(await first).toBe("first");
    await expect(tasks.withAssignmentLock("c1", "a1", async () => { throw new Error("failure"); })).rejects.toThrow("failure");
    expect(await tasks.withAssignmentLock("c1", "a1", async () => "retry")).toBe("retry");
  });

  it("reuses the locked connection for repo calls with a two-connection Lambda pool", async () => {
    let entered = 0;
    let bothReady: () => void;
    const ready = new Promise<void>((resolve) => { bothReady = resolve; });
    const run = (id: string) => tasks.withAssignmentLock("c1", id, async () => {
      if (++entered === 2) bothReady();
      await ready;
      return tasks.loadByFollowupKey("c1", id);
    });
    expect(await Promise.all([run("one"), run("two")])).toEqual([null, null]);
  });

  it("enforces one case key and prevents stale saves from reopening a closed card", async () => {
    const task = await tasks.save({ churchId: "c1", taskType: "card", assignmentId: "a1", followupKey: "a1", status: "Open", data: "{}" });
    await expect(tasks.save({ churchId: "c1", assignmentId: "a1", followupKey: "a1", status: "Open" })).rejects.toThrow();
    await tasks.save({ ...task, status: "Closed", dateClosed: new Date() });
    await tasks.save({ ...task, status: "Open" });
    expect((await tasks.load("c1", task.id)).status).toBe("Closed");
    expect(await tasks.loadByFollowupKey("c2", "a1")).toBeNull();
  });

  it("hands only accepted workflow requests to service reminders and preserves legacy unconfirmed reminders", async () => {
    for (const [id, status, workflow] of [["a1", "Unconfirmed", "wf1"], ["a2", "Accepted", "wf1"], ["a3", "Declined", "wf1"], ["a4", "Unconfirmed", null]]) {
      await db.insertInto("assignments").values({ id, churchId: "c1", personId: id, positionId: "pos1", status, confirmationWorkflowId: workflow }).execute();
    }
    expect((await assignments.loadForReminder("c1", "plan1")).map((a) => a.id).sort()).toEqual(["a2", "a4"]);
    expect(await assignments.loadForReminder("c2", "plan1")).toEqual([]);
    await db.updateTable("plans").set({ prepared: true }).where("id", "=", "plan1").execute();
    expect(await assignments.loadForReminder("c1", "plan1")).toEqual([]);
    await db.updateTable("plans").set({ prepared: false }).where("id", "=", "plan1").execute();
  });

  it("runs the editable default sequence through real repositories, waits, routing and response closure", async () => {
    send.mockClear();
    const repos: any = {
      time: new TimeRepo(),
      task: tasks,
      assignment: assignments,
      plan: new PlanRepo(),
      position: new PositionRepo(),
      workflow: new WorkflowRepo(),
      workflowStep: new WorkflowStepRepo(),
      workflowStepAction: new WorkflowStepActionRepo(),
      workflowStepRoute: new WorkflowStepRouteRepo()
    };
    const workflow = await WorkflowHelper.createFromTemplate("c1", WorkflowTemplates.get("assignmentConfirmation"), undefined, repos);
    await db.updateTable("plans").set({ confirmationWorkflowId: workflow.id }).where("id", "=", "plan1").execute();
    const assignment = await assignments.save({ churchId: "c1", personId: "p1", positionId: "pos1", status: "Unconfirmed" });
    await Promise.all([AssignmentWorkflowHelper.issuePlan("c1", "plan1", repos), AssignmentWorkflowHelper.issuePlan("c1", "plan1", repos)]);
    let card = await tasks.loadByFollowupKey("c1", assignment.id);
    expect(card.status).toBe("Open"); expect(card.snoozedUntil).toBeTruthy(); expect(send).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      await db.updateTable("tasks").set({ snoozedUntil: new Date(Date.now() - 10000) }).where("id", "=", card.id).execute();
      await WorkflowHelper.processSnoozed(repos);
    }
    card = await tasks.load("c1", card.id);
    const call = await repos.workflowStep.load("c1", card.stepId);
    expect(call.name).toContain("Call volunteer"); expect(card.dueDate).toBeTruthy(); expect(send).toHaveBeenCalledTimes(3);
    await db.updateTable("assignments").set({ status: "Accepted" }).where("id", "=", assignment.id).execute();
    await AssignmentWorkflowHelper.reconcileAssignment("c1", assignment.id, repos);
    card = await tasks.load("c1", card.id);
    expect(card.status).toBe("Closed"); expect(JSON.parse(card.data).assignmentOutcome).toBe("Accepted");
    await WorkflowHelper.processSnoozed(repos); expect(send).toHaveBeenCalledTimes(3);
    expect((await assignments.loadForReminder("c1", "plan1")).map((a) => a.id)).toContain(assignment.id);
  });

  it("reverses the additive migration without deleting assignments or tasks", async () => {
    const a = await assignments.save({ churchId: "c1", personId: "p1", positionId: "pos1", status: "Accepted" });
    await down(db);
    const columns = await sql<any>`show columns from tasks like 'assignmentId'`.execute(db);
    expect(columns.rows).toHaveLength(0);
    expect((await db.selectFrom("assignments").select("id").execute())[0].id).toBe(a.id);
    await up(db);
  });
});
