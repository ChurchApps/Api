import {
  ActionRepo,
  AssignmentRepo,
  AutomationRepo,
  BlockoutDateRepo,
  ConditionRepo,
  ConjunctionRepo,
  PlanRepo,
  PlanItemRepo,
  PlanTypeRepo,
  PositionRepo,
  TaskRepo,
  TimeRepo,
  MembershipRepo
} from "./index.js";

export class Repos {
  public action: ActionRepo;
  public assignment: AssignmentRepo;
  public automation: AutomationRepo;
  public blockoutDate: BlockoutDateRepo;
  public condition: ConditionRepo;
  public conjunction: ConjunctionRepo;
  public plan: PlanRepo;
  public planItem: PlanItemRepo;
  public planType: PlanTypeRepo;
  public position: PositionRepo;
  public task: TaskRepo;
  public time: TimeRepo;
  public membership: MembershipRepo;

  private static _current: Repos = null;
  public static getCurrent = () => {
    if (Repos._current === null) Repos._current = new Repos();
    return Repos._current;
  };

  constructor() {
    this.action = new ActionRepo();
    this.assignment = new AssignmentRepo();
    this.automation = new AutomationRepo();
    this.blockoutDate = new BlockoutDateRepo();
    this.condition = new ConditionRepo();
    this.conjunction = new ConjunctionRepo();
    this.plan = new PlanRepo();
    this.planItem = new PlanItemRepo();
    this.planType = new PlanTypeRepo();
    this.position = new PositionRepo();
    this.task = new TaskRepo();
    this.time = new TimeRepo();
    this.membership = new MembershipRepo();
  }
}
