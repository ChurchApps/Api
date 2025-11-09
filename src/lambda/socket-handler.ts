import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";

import { Environment } from "../shared/helpers/Environment";
import { TypedDB } from "../shared/infrastructure/TypedDB";

import { Logger } from "../modules/messaging/helpers/Logger";
import { SocketHelper } from "../modules/messaging/helpers/SocketHelper";
import { initializeMessagingModule } from "../modules/messaging";
import { RepoManager } from "../shared/infrastructure/RepoManager";

let gwManagement: ApiGatewayManagementApiClient;

const initEnv = async () => {
  if (!Environment.currentEnvironment) {
    await Environment.init(process.env.ENVIRONMENT || "dev");

    gwManagement = new ApiGatewayManagementApiClient({
      apiVersion: "2020-04-16",
      endpoint: Environment.socketUrl || "ws://localhost:8087"
    });

    // Initialize messaging module repositories and helpers in messaging context
    await TypedDB.runWithContext("messaging", async () => {
      const repos = await RepoManager.getRepos<any>("messaging");
      initializeMessagingModule(repos);
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
    return await TypedDB.runWithContext("messaging", async () => {
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

function getApiGatewayManagementClient(event: APIGatewayProxyEvent): ApiGatewayManagementApiClient {
  const requestContext = event.requestContext as any;

  if (requestContext && requestContext.apiId && requestContext.stage) {
    const { apiId, stage } = requestContext;
    const region = process.env.AWS_REGION || "us-east-2";
    const endpoint = `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`;
    console.log(`Using API Gateway endpoint: ${endpoint} (region: ${region})`);
    return new ApiGatewayManagementApiClient({ apiVersion: "2020-04-16", endpoint: endpoint });
  }

  console.log(`Using fallback client`);
  return gwManagement;
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
      const apiGwClient = getApiGatewayManagementClient(event);
      console.log(`Using API Gateway endpoint from event context`);

      const command = new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload))
      });

      await apiGwClient.send(command);
      console.log(`Successfully sent socketId response to connection ${connectionId}`);
    } catch (e) {
      console.error(`Failed to send socketId response to connection ${connectionId}:`, e);
      await logMessage(e instanceof Error ? e.message : String(e));
    }

    console.log(`Message processed for ${connectionId}`);
    return { statusCode: 200, body: "Message processed" };
  } catch (error) {
    console.error("Error handling message:", error);
    return { statusCode: 500, body: "Failed to process message" };
  }
}
