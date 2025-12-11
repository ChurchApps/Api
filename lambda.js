const serverlessExpress = require("@codegenie/serverless-express");

// Import Environment from the shared helpers
const { Environment } = require("./dist/shared/helpers/Environment");

// Import the app creator
const { createApp } = require("./dist/app");

// Initialize environment and database pools
const initializeEnvironment = async () => {
  if (!Environment.currentEnvironment) {
    const stage = process.env.STAGE || process.env.ENVIRONMENT || "dev";
    console.log("Initializing environment with stage:", stage);
    console.log("Environment variables:", {
      STAGE: process.env.STAGE,
      ENVIRONMENT: process.env.ENVIRONMENT,
      APP_ENV: process.env.APP_ENV
    });
    await Environment.init(stage);
    console.log("Environment initialized, connection strings loaded");

    // Pools now auto-initialize on first use
  }
};

// Cache the handler
let cachedHandler;

// Web handler for HTTP requests
const web = async function (event, context) {
  try {
    console.log("Web handler invoked");
    console.log("Event httpMethod:", event.httpMethod);
    console.log("Event path:", event.path);

    // Quick test endpoint
    if (event.path === "/test") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          message: "Lambda is working",
          path: event.path,
          method: event.httpMethod,
          stage: process.env.STAGE,
          time: new Date().toISOString()
        })
      };
    }

    // Test POST request handling
    if (event.path === "/test-post" && event.httpMethod === "POST") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          message: "POST request received",
          body: event.body,
          headers: event.headers,
          method: event.httpMethod,
          time: new Date().toISOString()
        })
      };
    }

    // Test Express app routing without database
    if (event.path === "/api/test") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: JSON.stringify({
          message: "API routing working",
          path: event.path,
          method: event.httpMethod,
          modules: ["membership", "attendance", "content", "giving", "messaging", "doing"],
          time: new Date().toISOString()
        })
      };
    }

    // Ensure environment is initialized before creating the app
    await initializeEnvironment();

    // Initialize the handler only once
    if (!cachedHandler) {
      console.log("Creating Express app with fully initialized environment...");
      const app = await createApp();
      console.log("Express app created");

      cachedHandler = serverlessExpress({
        app,
        binarySettings: {
          contentTypes: ["application/octet-stream", "font/*", "image/*", "application/pdf"]
        }
      });
      console.log("Serverless Express handler created");
    }

    const result = await cachedHandler(event, context);
    return result;
  } catch (error) {
    console.error("Error in web handler:", error);
    console.error("Error stack:", error.stack);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS,PATCH"
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
        stack: process.env.STAGE === "demo" ? error.stack : undefined,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Import socket and timer handlers
const { handleSocket } = require("./dist/lambda/socket-handler");
const { handle15MinTimer, handleMidnightTimer, handleScheduledTasks } = require("./dist/lambda/timer-handler");

// WebSocket handler
const socket = async function (event, context) {
  try {
    await initializeEnvironment();
    return await handleSocket(event, context);
  } catch (error) {
    console.error("Error in socket handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Socket handler error" })
    };
  }
};

// Timer handlers
const timer15Min = async function (event, context) {
  try {
    await initializeEnvironment();
    await handle15MinTimer(event, context);
    return { statusCode: 200, body: "Timer executed successfully" };
  } catch (error) {
    console.error("Error in 15-minute timer:", error);
    throw error;
  }
};

const timerMidnight = async function (event, context) {
  try {
    await initializeEnvironment();
    await handleMidnightTimer(event, context);
    return { statusCode: 200, body: "Timer executed successfully" };
  } catch (error) {
    console.error("Error in midnight timer:", error);
    throw error;
  }
};

const timerScheduledTasks = async function (event, context) {
  try {
    await initializeEnvironment();
    await handleScheduledTasks(event, context);
    return { statusCode: 200, body: "Scheduled tasks executed successfully" };
  } catch (error) {
    console.error("Error in scheduled tasks timer:", error);
    throw error;
  }
};

// Export handlers
module.exports.web = web;
module.exports.socket = socket;
module.exports.timer15Min = timer15Min;
module.exports.timerMidnight = timerMidnight;
module.exports.timerScheduledTasks = timerScheduledTasks;
