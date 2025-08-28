import fs from "fs";
import path from "path";
import { AwsHelper, EnvironmentBase } from "@churchapps/apihelper";
import { DatabaseUrlParser } from "./DatabaseUrlParser";
import { ParameterStoreHelper } from "./ParameterStoreHelper";

// Try to load dotenv for local development
try {
  const dotenv = require('dotenv');
  // Look for .env file in project root
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.warn('⚠️ Warning: Failed to load .env file:', result.error.message);
    } else {
      console.log('✅ Loaded .env file for local development');
    }
  } else if (!process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.AWS_EXECUTION_ENV) {
    console.log('📝 No .env file found (this is normal for production environments)');
  }
} catch (error) {
  // dotenv is optional - only warn if we're not in Lambda
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.AWS_EXECUTION_ENV) {
    console.log('📝 dotenv package not available (this is normal for production builds)');
  }
}

export class Environment extends EnvironmentBase {
  // Current environment and server configuration
  static currentEnvironment: string;
  static port: number;
  static socketUrl: string;

  // API URLs for modules
  static membershipApi: string;
  static attendanceApi: string;
  static contentApi: string;
  static givingApi: string;
  static messagingApi: string;
  static doingApi: string;

  // Database connections per module
  static dbConnections: Map<string, any> = new Map();

  // Membership API specific
  static jwtExpiration: string;
  static emailOnRegistration: boolean;
  static supportEmail: string;
  static chumsRoot: string;
  static hubspotKey: string;
  static caddyHost: string;
  static caddyPort: string;
  static mailSystem: string;
  static appName: string;
  static appEnv: string;

  // Content API specific
  static youTubeApiKey: string;
  static pexelsKey: string;
  static vimeoToken: string;
  static apiBibleKey: string;
  static praiseChartsConsumerKey: string;
  static praiseChartsConsumerSecret: string;

  // Giving API specific
  static googleRecaptchaSecretKey: string;

  // AI provider configuration (shared across multiple modules)
  static aiProvider: string;
  static openRouterApiKey: string;
  static openAiApiKey: string;

  // WebSocket configuration
  static websocketUrl: string;
  static websocketPort: number;

  // File storage configuration
  static fileStore: string;
  static s3Bucket: string;
  static contentRoot: string;

  // Delivery provider
  static deliveryProvider: string;

  // CORS configuration
  static corsOrigin: string;

  // Legacy support for old API environment variables
  static encryptionKey: string;
  static serverPort: number;
  static socketPort: number;
  static apiEnv: string;
  static jwtSecret: string;

  static async init(environment: string) {
    environment = environment.toLowerCase();
    let file = "dev.json";
    if (environment === "demo") file = "demo.json";
    if (environment === "staging") file = "staging.json";
    if (environment === "prod") file = "prod.json";

    // In Lambda, __dirname is /var/task/dist/src/shared/helpers
    // Config files are at /var/task/config
    let physicalPath: string;

    // Check if we're in actual Lambda (not serverless-local)
    const isActualLambda = process.env.AWS_LAMBDA_FUNCTION_NAME && __dirname.startsWith("/var/task");

    if (isActualLambda) {
      // In Lambda, config is at root level
      physicalPath = path.resolve("/var/task/config", file);
    } else {
      // In local development, resolve from the project root
      const projectRoot = path.resolve(__dirname, "../../../");
      physicalPath = path.resolve(projectRoot, "config", file);
    }

    const json = fs.readFileSync(physicalPath, "utf8");
    const data = JSON.parse(json);
    await this.populateBase(data, "API", environment);

    // Set current environment and server config
    this.currentEnvironment = environment;
    this.port = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 8084;
    this.socketUrl = process.env.SOCKET_URL || process.env.WEBSOCKET_URL;

    // Legacy environment variable support
    this.appEnv = environment;
    this.apiEnv = this.appEnv;
    this.serverPort = this.port;
    this.socketPort = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT) : process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT) : 8087;
    this.encryptionKey = process.env.ENCRYPTION_KEY || "";
    this.appName = data.appName || "API";
    this.corsOrigin = process.env.CORS_ORIGIN || "*";
    this.jwtSecret = process.env.JWT_SECRET || (await AwsHelper.readParameter(`/${environment.toLowerCase()}/jwtSecret`));

    // Initialize module-specific configs
    this.initializeModuleConfigs(data);

    // Initialize database connections
    await this.initializeDatabaseConnections(data);

    // Initialize app configurations
    await this.initializeAppConfigs(data, environment);
  }

  private static initializeModuleConfigs(config: any) {
    // These can be overridden in monolith for internal calls
    this.membershipApi = config.membershipApi || config.apiUrl + "/membership";
    this.attendanceApi = config.attendanceApi || config.apiUrl + "/attendance";
    this.contentApi = config.contentApi || config.apiUrl + "/content";
    this.givingApi = config.givingApi || config.apiUrl + "/giving";
    this.messagingApi = config.messagingApi || config.apiUrl + "/messaging";
    this.doingApi = config.doingApi || config.apiUrl + "/doing";
  }

  private static async initializeDatabaseConnections(config: any) {
    const modules = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];

    console.log(`🔍 Initializing database connections for environment: ${this.currentEnvironment}`);
    console.log(`🔍 AWS Lambda Function: ${process.env.AWS_LAMBDA_FUNCTION_NAME}`);
    console.log(`🔍 AWS Execution Env: ${process.env.AWS_EXECUTION_ENV}`);

    // Special case: DoingApi needs access to membership database
    if (process.env.DOING_MEMBERSHIP_CONNECTION_STRING) {
      try {
        const dbConfig = DatabaseUrlParser.parseConnectionString(process.env.DOING_MEMBERSHIP_CONNECTION_STRING);
        this.dbConnections.set("membership-doing", dbConfig);
        console.log("✅ Loaded membership database config for doing module from DOING_MEMBERSHIP_CONNECTION_STRING");
      } catch (error) {
        console.error(`❌ Failed to parse DOING_MEMBERSHIP_CONNECTION_STRING: ${error}`);
      }
    }

    const isAwsEnvironment = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV;
    const environment = (this.currentEnvironment || process.env.ENVIRONMENT || "dev").toLowerCase();

    console.log(`🔍 Is AWS Environment: ${isAwsEnvironment}`);
    console.log(`🔍 Using environment: ${environment}`);

    // Load all database connections in parallel with retry logic
    const connectionResults = await ParameterStoreHelper.loadDatabaseConnectionsParallel(
      modules,
      environment,
      !!isAwsEnvironment
    );

    // Process results and set up database connections
    const successfulConnections: string[] = [];
    const failedConnections: string[] = [];

    for (const result of connectionResults) {
      if (result.connectionString) {
        try {
          const dbConfig = DatabaseUrlParser.parseConnectionString(result.connectionString);
          this.dbConnections.set(result.moduleName, dbConfig);
          console.log(`✅ Loaded ${result.moduleName} database config (source: ${result.source})`);
          successfulConnections.push(result.moduleName);
        } catch (error) {
          console.error(`❌ Failed to parse connection string for ${result.moduleName}: ${error}`);
          failedConnections.push(result.moduleName);
          // Don't throw here - allow other modules to continue working
        }
      } else {
        console.log(`⚠️ No connection string found for ${result.moduleName} module`);
        failedConnections.push(result.moduleName);
        if (result.error) {
          console.error(`❌ Error details for ${result.moduleName}:`, result.error.message);
        }
      }
    }

    // Log final state with more detail
    console.log("🔍 Database connections summary:");
    console.log(`  - Successful (${successfulConnections.length}): ${successfulConnections.join(", ")}`);
    if (failedConnections.length > 0) {
      console.log(`  - Failed (${failedConnections.length}): ${failedConnections.join(", ")}`);
    }

    // Only throw if critical modules failed (membership is always critical)
    const criticalModules = ["membership"];
    const failedCritical = criticalModules.filter(module => failedConnections.includes(module));
    if (failedCritical.length > 0) {
      throw new Error(`Critical database modules failed to load: ${failedCritical.join(", ")}`);
    }
  }

  private static async initializeAppConfigs(config: any, environment: string) {
    // WebSocket configuration
    this.websocketUrl = process.env.SOCKET_URL || process.env.WEBSOCKET_URL;
    this.websocketPort = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT) : process.env.WEBSOCKET_PORT ? parseInt(process.env.WEBSOCKET_PORT) : 8087;

    // File storage configuration
    this.fileStore = process.env.FILE_STORE || config.fileStore;
    this.s3Bucket = process.env.AWS_S3_BUCKET || config.s3Bucket || "";
    this.contentRoot = process.env.CONTENT_ROOT || config.contentRoot;
    this.deliveryProvider = process.env.DELIVERY_PROVIDER || config.deliveryProvider;

    // Membership API specific
    this.jwtExpiration = "2 days";
    this.emailOnRegistration = process.env.EMAIL_ON_REGISTRATION === "true" || config.emailOnRegistration === true;
    this.supportEmail = process.env.SUPPORT_EMAIL || config.supportEmail || "support@churchapps.org";
    this.chumsRoot = process.env.CHUMS_ROOT || config.chumsRoot || "https://app.staging.chums.org";
    this.mailSystem = process.env.MAIL_SYSTEM || config.mailSystem || "";

    // AI provider configuration (shared)
    this.aiProvider = process.env.AI_PROVIDER || config.aiProvider || "openrouter";

    // Load Parameter Store values in parallel with retry logic
    console.log("🔄 Loading configuration parameters in parallel...");
    const parameterMap = {
      hubspotKey: "hubspotKey",
      caddyHost: "caddyHost",
      caddyPort: "caddyPort",
      youTubeApiKey: "youTubeApiKey",
      pexelsKey: "pexelsKey",
      vimeoToken: "vimeoToken",
      apiBibleKey: "apiBibleKey",
      praiseChartsConsumerKey: "praiseChartsConsumerKey",
      praiseChartsConsumerSecret: "praiseChartsConsumerSecret",
      googleRecaptchaSecretKey: "recaptcha-secret-key",
      openRouterApiKey: "openRouterApiKey",
      openAiApiKey: "openAiApiKey"
    };

    const parameterValues = await ParameterStoreHelper.loadConfigParametersParallel(parameterMap, environment);

    // Set values with fallback to environment variables
    this.hubspotKey = process.env.HUBSPOT_KEY || parameterValues.hubspotKey || "";
    this.caddyHost = process.env.CADDY_HOST || parameterValues.caddyHost || "";
    this.caddyPort = process.env.CADDY_PORT || parameterValues.caddyPort || "";
    this.youTubeApiKey = process.env.YOUTUBE_API_KEY || parameterValues.youTubeApiKey || "";
    this.pexelsKey = process.env.PEXELS_KEY || parameterValues.pexelsKey || "";
    this.vimeoToken = process.env.VIMEO_TOKEN || parameterValues.vimeoToken || "";
    this.apiBibleKey = process.env.API_BIBLE_KEY || parameterValues.apiBibleKey || "";
    this.praiseChartsConsumerKey = process.env.PRAISECHARTS_CONSUMER_KEY || parameterValues.praiseChartsConsumerKey || "";
    this.praiseChartsConsumerSecret = process.env.PRAISECHARTS_CONSUMER_SECRET || parameterValues.praiseChartsConsumerSecret || "";
    this.googleRecaptchaSecretKey = process.env.GOOGLE_RECAPTCHA_SECRET_KEY || parameterValues.googleRecaptchaSecretKey || "";
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY || parameterValues.openRouterApiKey || "";
    this.openAiApiKey = process.env.OPENAI_API_KEY || parameterValues.openAiApiKey || "";

    console.log("✅ Configuration parameters loaded successfully");
  }

  static getDatabaseConfig(moduleName: string): any {
    const config = this.dbConnections.get(moduleName);
    if (!config) {
      console.warn(`⚠️ Database config for ${moduleName} not available`);
      // In production, you might want to implement lazy loading here
      // or return a default configuration
    }
    return config;
  }

  static getConnectionStatus(): { loaded: string[], missing: string[], total: number } {
    const expectedModules = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];
    const loadedModules = Array.from(this.dbConnections.keys()).filter(key => !key.includes("-"));
    const missing = expectedModules.filter(m => !loadedModules.includes(m));

    return {
      loaded: loadedModules,
      missing,
      total: expectedModules.length
    };
  }

  static getAllDatabaseConfigs(): Map<string, any> {
    return this.dbConnections;
  }
}
