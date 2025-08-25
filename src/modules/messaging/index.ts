// Export module interfaces and repositories
export * from "./repositories";
export * from "./models";
export * from "./controllers";
export * from "./helpers";

// Re-export key classes for external use
export { NotificationHelper } from "./helpers/NotificationHelper";
export { SocketHelper } from "./helpers/SocketHelper";
export { DeliveryHelper } from "./helpers/DeliveryHelper";
export { ExpoPushHelper } from "./helpers/ExpoPushHelper";

// Module initialization function
import { Repositories } from "./repositories/Repositories";
import { NotificationHelper } from "./helpers/NotificationHelper";
import { DeliveryHelper } from "./helpers/DeliveryHelper";
import { SocketHelper } from "./helpers/SocketHelper";

export function initializeMessagingModule(repositories: Repositories) {
  // Initialize helpers with repositories
  NotificationHelper.init(repositories);
  DeliveryHelper.init(repositories);
  SocketHelper.init(repositories);
}
