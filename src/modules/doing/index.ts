// Export module interfaces and repositories
export * from "./repositories/index.js";
export * from "./models/index.js";

// Module initialization function
import { InternalEventBus } from "../../shared/events/InternalEventBus.js";
import { RuleEngine } from "./helpers/RuleEngine.js";
import { DirectoryUpdateHelper } from "./helpers/DirectoryUpdateHelper.js";

export function initializeDoingModule() {
  // Event-driven rules run through the unified RuleEngine; form submissions are just
  // another event (form.submission.created). Scheduled rules run via the cron/timer.
  InternalEventBus.subscribe(RuleEngine.onEvent);
  // SSO logins submit member photos into the directory-update approval flow.
  InternalEventBus.subscribe(DirectoryUpdateHelper.onEvent);
}
