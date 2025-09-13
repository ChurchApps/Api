import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment";
import { DB } from "../shared/infrastructure/DB";

import { Logger } from "../modules/messaging/helpers/Logger";
import { SocketHelper } from "../modules/messaging/helpers/SocketHelper";
import { initializeMessagingModule } from "../modules/messaging";
import { RepositoryManager } from "../shared/infrastructure/RepositoryManager";

let gwManagement: ApiGatewayManagementApiClient;

const initEnv = async () => {
  if (!Environment.currentEnvironment) {
    await Environment.init(process.env.ENVIRONMENT || "dev");

    // Pools now auto-initialize on first use

    gwManagement = new ApiGatewayManagementApiClient({
      apiVersion: "2020-04-16",
      endpoint: Environment.socketUrl
    });

    // Initialize messaging module repositories and helpers in messaging context
    await DB.runWithContext("messaging", async () => {
      const repositories = await RepositoryManager.getRepositories<any>("messaging");
      initializeMessagingModule(repositories);
    });
  }
};

async function logMessage(message: string) {
  const wl = new Logger();
  wl.error(message);
  await wl.flush();
}

export const handleSocket = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  try {
    await initEnv();

    const { eventType, connectionId } = event.requestContext as any;

    console.log(`WebSocket ${eventType} for connection ${connectionId}`);

    // Run within messaging module context
    return await DB.runWithContext("messaging", async () => {
      switch (eventType) {
        case "CONNECT":
          return await handleConnect(event, context);
        case "DISCONNECT":
          return await handleDisconnect(event, context);
        case "MESSAGE":
          return await handleMessage(event, context);
        default:
          console.log("Unknown eventType:", eventType);
          return { statusCode: 400, body: "Unknown event type" };
      }
    });
  } catch (error) {
    console.error("Socket handler error:", error);
    return { statusCode: 500, body: "Internal server error" };
  }
};

async function handleConnect(event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connection ID" };
  }

  try {
    console.log(`Connection established: ${connectionId}`);
    return { statusCode: 200, body: "Connected" };
  } catch (error) {
    console.error("Error handling connect:", error);
    return { statusCode: 500, body: "Failed to connect" };
  }
}

async function handleDisconnect(event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connection ID" };
  }

  try {
    await SocketHelper.handleDisconnect(connectionId);

    console.log(`Connection disconnected: ${connectionId}`);
    return { statusCode: 200, body: "Disconnected" };
  } catch (error) {
    console.error("Error handling disconnect:", error);
    return { statusCode: 500, body: "Failed to disconnect" };
  }
}

async function handleMessage(event: APIGatewayProxyEvent, _context: Context): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { statusCode: 400, body: "Missing connection ID" };
  }
  const _body = event.body || "";

  try {
    const payload = {
      churchId: "",
      conversationId: "",
      action: "socketId",
      data: connectionId
    };

    try {
      const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(payload)
      });
      await gwManagement.send(command);
    } catch (e) {
      await logMessage(e instanceof Error ? e.message : String(e));
    }

    console.log(`Message processed for ${connectionId}`);
    return { statusCode: 200, body: "Message processed" };
  } catch (error) {
    console.error("Error handling message:", error);
    return { statusCode: 500, body: "Failed to process message" };
  }
}
