// Export module interfaces and repositories
export * from "./repositories/index.js";
export * from "./models/index.js";

// Module initialization function
import { InternalEventBus } from "../../shared/events/InternalEventBus.js";
import { EventTriggerHelper } from "./helpers/EventTriggerHelper.js";

export function initializeDoingModule() {
  // Form submissions are handled like any other event (form.submission.created)
  // through the unified trigger engine.
  InternalEventBus.subscribe(EventTriggerHelper.onEvent);
}
