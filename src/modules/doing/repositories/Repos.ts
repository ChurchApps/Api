import {
  AssignmentRepo,
  AutomationExecutionRepo,
  BlockoutDateRepo,
  ConditionRepo,
  ConjunctionRepo,
  ContentProviderAuthRepo,
  PlanRepo,
  PlanItemRepo,
  PlanItemTimeRepo,
  PlanTemplateRepo,
  PlanTypeRepo,
  PositionRepo,
  SchedulingPreferenceRepo,
  TaskRepo,
  TimeRepo,
  WorkflowRepo,
  WorkflowStepRepo,
  WorkflowStepActionRepo,
  WorkflowStepRouteRepo,
  WorkflowCategoryRepo,
  WorkflowTriggerRepo
} from "./index.js";

export class Repos {
  public assignment: AssignmentRepo;
  public automationExecution: AutomationExecutionRepo;
  public blockoutDate: BlockoutDateRepo;
  public condition: ConditionRepo;
  public conjunction: ConjunctionRepo;
  public contentProviderAuth: ContentProviderAuthRepo;
  public plan: PlanRepo;
  public planItem: PlanItemRepo;
  public planItemTime: PlanItemTimeRepo;
  public planTemplate: PlanTemplateRepo;
  public planType: PlanTypeRepo;
  public position: PositionRepo;
  public schedulingPreference: SchedulingPreferenceRepo;
  public task: TaskRepo;
  public time: TimeRepo;
  public workflow: WorkflowRepo;
  public workflowStep: WorkflowStepRepo;
  public workflowStepAction: WorkflowStepActionRepo;
  public workflowStepRoute: WorkflowStepRouteRepo;
  public workflowCategory: WorkflowCategoryRepo;
  public workflowTrigger: WorkflowTriggerRepo;

  private static _current: Repos = null;
  public static getCurrent = () => {
    if (Repos._current === null) Repos._current = new Repos();
    return Repos._current;
  };

  constructor() {
    this.assignment = new AssignmentRepo();
    this.automationExecution = new AutomationExecutionRepo();
    this.blockoutDate = new BlockoutDateRepo();
    this.condition = new ConditionRepo();
    this.conjunction = new ConjunctionRepo();
    this.contentProviderAuth = new ContentProviderAuthRepo();
    this.plan = new PlanRepo();
    this.planItem = new PlanItemRepo();
    this.planItemTime = new PlanItemTimeRepo();
    this.planTemplate = new PlanTemplateRepo();
    this.planType = new PlanTypeRepo();
    this.position = new PositionRepo();
    this.schedulingPreference = new SchedulingPreferenceRepo();
    this.task = new TaskRepo();
    this.time = new TimeRepo();
    this.workflow = new WorkflowRepo();
    this.workflowStep = new WorkflowStepRepo();
    this.workflowStepAction = new WorkflowStepActionRepo();
    this.workflowStepRoute = new WorkflowStepRouteRepo();
    this.workflowCategory = new WorkflowCategoryRepo();
    this.workflowTrigger = new WorkflowTriggerRepo();
  }
}
