import {
  ActionRepository,
  AutomationRepository,
  BlockoutDateRepository,
  ConditionRepository,
  ConjunctionRepository,
  TaskRepository,
  MembershipRepository,
  AssignmentRepository,
  PlanRepository,
  PositionRepository,
  TimeRepository,
  PlanItemRepository,
  PlanTypeRepository
} from "./index";

/**
 * Repository collection for the Doing module
 * This class replaces the singleton pattern with the new modular approach
 */
export class DoingRepositories {
  public action: ActionRepository;
  public assignment: AssignmentRepository;
  public automation: AutomationRepository;
  public blockoutDate: BlockoutDateRepository;
  public condition: ConditionRepository;
  public conjunction: ConjunctionRepository;
  public plan: PlanRepository;
  public planItem: PlanItemRepository;
  public planType: PlanTypeRepository;
  public position: PositionRepository;
  public task: TaskRepository;
  public time: TimeRepository;

  public membership: MembershipRepository;

  constructor() {
    this.action = new ActionRepository();
    this.assignment = new AssignmentRepository();
    this.automation = new AutomationRepository();
    this.blockoutDate = new BlockoutDateRepository();
    this.condition = new ConditionRepository();
    this.conjunction = new ConjunctionRepository();
    this.plan = new PlanRepository();
    this.planItem = new PlanItemRepository();
    this.planType = new PlanTypeRepository();
    this.position = new PositionRepository();
    this.task = new TaskRepository();
    this.time = new TimeRepository();

    this.membership = new MembershipRepository();
  }
}
