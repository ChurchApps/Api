// Export module interfaces and repositories
export * from "./repositories/index.js";
export * from "./models/index.js";

// Module initialization function
import { WorkflowTriggerService } from "../../shared/helpers/WorkflowTriggerService.js";
import { WorkflowTriggerHelper } from "./helpers/WorkflowTriggerHelper.js";

export function initializeDoingModule() {
  WorkflowTriggerService.register(WorkflowTriggerHelper.onFormSubmission);
}
