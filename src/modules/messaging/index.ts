// Export module interfaces and repositories
export * from "./repositories/index.js";
export * from "./models/index.js";
export * from "./controllers/index.js";
export * from "./helpers/index.js";

// Re-export key classes for external use
export { NotificationHelper } from "./helpers/NotificationHelper.js";
export { SocketHelper } from "./helpers/SocketHelper.js";
export { DeliveryHelper } from "./helpers/DeliveryHelper.js";
export { ExpoPushHelper } from "./helpers/ExpoPushHelper.js";

// Module initialization function
import { Repos } from "./repositories/Repos.js";
import { NotificationHelper } from "./helpers/NotificationHelper.js";
import { DeliveryHelper } from "./helpers/DeliveryHelper.js";
import { SocketHelper } from "./helpers/SocketHelper.js";

export function initializeMessagingModule(repos: Repos) {
  // Initialize helpers with repositories
  NotificationHelper.init(repos);
  DeliveryHelper.init(repos);
  SocketHelper.init(repos);
}
