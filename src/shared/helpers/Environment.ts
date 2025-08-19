import fs from "fs";
import path from "path";
import { AwsHelper, EnvironmentBase } from "@churchapps/apihelper";
import { DatabaseUrlParser } from "./DatabaseUrlParser";

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
    this.port = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : data.port || 8084;
    this.socketUrl = data.websocket?.url || this.websocketUrl || "ws://localhost:8087";

    // Legacy environment variable support
    this.appEnv = process.env.APP_ENV || process.env.API_ENV || environment;
    this.apiEnv = this.appEnv;
    this.serverPort = this.port;
    this.socketPort = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT) : data.websocket?.port || 8087;
    this.encryptionKey = process.env.ENCRYPTION_KEY || "";
    this.appName = data.appName || "API";
    this.corsOrigin = process.env.CORS_ORIGIN || data.corsOrigin || "*";
    this.jwtSecret = process.env.JWT_SECRET || data.jwtSecret || this.encryptionKey || "default-secret";

    // Initialize module-specific configs
    this.initializeModuleConfigs(data);

    // Initialize database connections
    await this.initializeDatabaseConnections(data);

    // Initialize app configurations
    await this.initializeAppConfigs(data, environment);
  }

  private static initializeModuleConfigs(config: any) {
    // These can be overridden in monolith for internal calls
    this.membershipApi = config.membershipApi || config.apiUrl;
    this.attendanceApi = config.attendanceApi || config.apiUrl;
    this.contentApi = config.contentApi || config.apiUrl;
    this.givingApi = config.givingApi || config.apiUrl;
    this.messagingApi = config.messagingApi || config.apiUrl;
    this.doingApi = config.doingApi || config.apiUrl;
  }

  private static async initializeDatabaseConnections(config: any) {
    // Load from environment variables (connection strings)
    const modules = ["membership", "attendance", "content", "giving", "messaging", "doing"];

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

    // In Lambda/AWS environment, also try to load from Parameter Store
    const isAwsEnvironment = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV;
    const environment = this.currentEnvironment || process.env.STAGE || process.env.ENVIRONMENT || "dev";

    console.log(`🔍 Is AWS Environment: ${isAwsEnvironment}`);
    console.log(`🔍 Using environment: ${environment}`);

    for (const moduleName of modules) {
      const envVarName = `${moduleName.toUpperCase()}_CONNECTION_STRING`;
      let connectionString = process.env[envVarName];

      console.log(`🔍 Checking ${moduleName} module:`);
      console.log(`  - Environment variable ${envVarName}: ${connectionString ? 'FOUND' : 'NOT FOUND'}`);

      // If not in environment variable and we're in AWS, try Parameter Store
      if (!connectionString && isAwsEnvironment) {
        try {
          const paramName = `/${environment}/${moduleName}Api/connectionString`;
          console.log(`  - Attempting to read Parameter Store: ${paramName}`);
          connectionString = await AwsHelper.readParameter(paramName);
          if (connectionString) {
            console.log(`✅ Loaded ${moduleName} connection string from Parameter Store: ${paramName}`);
          } else {
            console.log(`⚠️ Parameter Store returned empty/null for ${paramName}`);
          }
        } catch (error) {
          console.error(`❌ Parameter Store error for ${moduleName}: ${error.message}`);
          console.error(`❌ Full error:`, error);
        }
      }

      if (connectionString) {
        try {
          const dbConfig = DatabaseUrlParser.parseConnectionString(connectionString);
          this.dbConnections.set(moduleName, dbConfig);
          console.log(`✅ Loaded ${moduleName} database config`);
        } catch (error) {
          console.error(`❌ Failed to parse connection string for ${moduleName}: ${error}`);
          throw new Error(`Invalid database connection string for ${moduleName}: ${error}`);
        }
      } else {
        console.log(`⚠️ No connection string found for ${moduleName} module`);
      }
    }

    // Log final state
    console.log(`🔍 Final database connections loaded: ${Array.from(this.dbConnections.keys()).join(', ')}`);

    // Fallback to config file format (legacy support)
    if (config.databases) {
      for (const [moduleName, dbConfig] of Object.entries(config.databases)) {
        // Only use config file if no environment variable was set
        if (!this.dbConnections.has(moduleName)) {
          this.dbConnections.set(moduleName, dbConfig);
          console.log(`✅ Loaded ${moduleName} database config from config file`);
        }
      }
    } else {
      // Fallback for very old legacy config format
      if (config.database && !this.dbConnections.has("membership")) {
        this.dbConnections.set("membership", config.database);
      }
    }
  }

  private static async initializeAppConfigs(config: any, environment: string) {
    // WebSocket configuration
    this.websocketUrl =
      process.env.SOCKET_URL || process.env.WEBSOCKET_URL || config.websocket?.url || "ws://localhost:8087";
    this.websocketPort = process.env.SOCKET_PORT
      ? parseInt(process.env.SOCKET_PORT)
      : process.env.WEBSOCKET_PORT
        ? parseInt(process.env.WEBSOCKET_PORT)
        : config.websocket?.port || 8087;

    // File storage configuration
    this.fileStore = process.env.FILE_STORE || config.fileStore || "disk";
    this.s3Bucket = process.env.AWS_S3_BUCKET || config.s3Bucket || "";
    this.contentRoot = process.env.CONTENT_ROOT || config.contentRoot || "http://localhost:8084/content/";
    this.deliveryProvider = process.env.DELIVERY_PROVIDER || config.deliveryProvider || "local";

    // Membership API specific
    this.jwtExpiration = "2 days";
    this.emailOnRegistration = process.env.EMAIL_ON_REGISTRATION === "true" || config.emailOnRegistration || false;
    this.supportEmail = process.env.SUPPORT_EMAIL || config.supportEmail || "support@churchapps.org";
    this.chumsRoot = process.env.CHUMS_ROOT || config.chumsRoot || "https://app.staging.chums.org";
    this.mailSystem = process.env.MAIL_SYSTEM || config.mailSystem || "";

    // AWS Parameter Store values (async)
    this.hubspotKey = process.env.HUBSPOT_KEY || (await AwsHelper.readParameter(`/${environment}/hubspotKey`));
    this.caddyHost = process.env.CADDY_HOST || (await AwsHelper.readParameter(`/${environment}/caddyHost`));
    this.caddyPort = process.env.CADDY_PORT || (await AwsHelper.readParameter(`/${environment}/caddyPort`));

    // Content API specific
    this.youTubeApiKey =
      process.env.YOUTUBE_API_KEY || (await AwsHelper.readParameter(`/${environment}/youTubeApiKey`));
    this.pexelsKey = process.env.PEXELS_KEY || (await AwsHelper.readParameter(`/${environment}/pexelsKey`));
    this.vimeoToken = process.env.VIMEO_TOKEN || (await AwsHelper.readParameter(`/${environment}/vimeoToken`));
    this.apiBibleKey = process.env.API_BIBLE_KEY || (await AwsHelper.readParameter(`/${environment}/apiBibleKey`));
    this.praiseChartsConsumerKey =
      process.env.PRAISECHARTS_CONSUMER_KEY ||
      (await AwsHelper.readParameter(`/${environment}/praiseChartsConsumerKey`));
    this.praiseChartsConsumerSecret =
      process.env.PRAISECHARTS_CONSUMER_SECRET ||
      (await AwsHelper.readParameter(`/${environment}/praiseChartsConsumerSecret`));

    // Giving API specific
    this.googleRecaptchaSecretKey =
      process.env.GOOGLE_RECAPTCHA_SECRET_KEY ||
      (await AwsHelper.readParameter(`/${environment}/recaptcha-secret-key`));

    // AI provider configuration (shared)
    this.aiProvider = process.env.AI_PROVIDER || config.aiProvider || "openrouter";
    this.openRouterApiKey =
      process.env.OPENROUTER_API_KEY || (await AwsHelper.readParameter(`/${environment}/openRouterApiKey`));
    this.openAiApiKey = process.env.OPENAI_API_KEY || (await AwsHelper.readParameter(`/${environment}/openAiApiKey`));
  }

  static getDatabaseConfig(moduleName: string): any {
    return this.dbConnections.get(moduleName);
  }

  static getAllDatabaseConfigs(): Map<string, any> {
    return this.dbConnections;
  }
}
