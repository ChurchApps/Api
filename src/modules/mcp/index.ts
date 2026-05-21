// Module entry — importing this triggers the @controller decorator which
// registers the route with inversify.
export { McpController } from "./McpController.js";
export { buildRouteInventory } from "./RouteInventory.js";
export { setExpressApp } from "./internalDispatch.js";
