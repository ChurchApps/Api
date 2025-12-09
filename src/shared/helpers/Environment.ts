import fs from "fs";
import path from "path";
import { EnvironmentBase } from "@churchapps/apihelper";
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

  // Debug: Track initialization calls
  private static _initializationCount = 0;
  private static _mapInstanceId = Math.random().toString(36).substr(2, 9);

  // Membership API specific
  static jwtExpiration: string;
  static emailOnRegistration: boolean;
  static supportEmail: string;
  static b1AdminRoot: string;
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
  static youVersionApiKey: string;
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
    this._initializationCount++;
    console.log(`🚀 Environment.init() called with environment: ${environment} (call #${this._initializationCount})`);
    console.log(`🔍 Map instance ID: ${this._mapInstanceId}`);
    console.log(`🔍 dbConnections Map reference at start: ${this.dbConnections}`);
    console.log(`🔍 dbConnections size at start: ${this.dbConnections.size}`);
    environment = environment.toLowerCase();
    let file = "dev.json";
    if (environment === "demo") file = "demo.json";
    if (environment === "staging") file = "staging.json";
    if (environment === "prod") file = "prod.json";
    console.log(`📄 Loading config file: ${file}`);

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
    this.socketUrl = process.env.SOCKET_URL;

    // Legacy environment variable support
    this.appEnv = environment;
    this.apiEnv = this.appEnv;
    this.serverPort = this.port;
    this.socketPort = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT) : 8087;
    this.encryptionKey = process.env.ENCRYPTION_KEY || "";
    this.appName = data.appName || "API";
    this.corsOrigin = process.env.CORS_ORIGIN || "*";
    // JWT secret strictly from environment variables
    this.jwtSecret = process.env.JWT_SECRET || "";

    // Initialize module-specific configs
    this.initializeModuleConfigs(data);

    // Initialize database connections
    await this.initializeDatabaseConnections(data);

    // Initialize app configurations
    await this.initializeAppConfigs(data);

    // Debug: Log final database connection state
    console.log(`🔍 Environment.init() complete. Database connections loaded: ${Array.from(this.dbConnections.keys()).join(", ")}`);
    console.log(`🔍 Total connections: ${this.dbConnections.size}`);
    console.log(`🔍 Map instance ID at end: ${this._mapInstanceId}`);
    console.log(`🔍 dbConnections Map reference at end: ${this.dbConnections}`);
    console.log(`🔍 Environment.currentEnvironment set to: ${this.currentEnvironment}`);
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
    console.log(`🔍 Attempting to initialize database connections for modules: ${modules.join(", ")}`);

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

    // Load database connections from a single, canonical env var per module: <MODULE>_CONNECTION_STRING
    const successfulConnections: string[] = [];
    const failedConnections: string[] = [];

    for (const moduleName of modules) {
      const envVar = `${moduleName.toUpperCase()}_CONNECTION_STRING`;
      const connString = process.env[envVar];

      if (connString) {
        try {
          const dbConfig = DatabaseUrlParser.parseConnectionString(connString);
          this.dbConnections.set(moduleName, dbConfig);
          console.log(`✅ Loaded ${moduleName} database config from ${envVar}`);
          successfulConnections.push(moduleName);
        } catch (error) {
          console.error(`❌ Failed to parse ${moduleName} connection string from ${envVar}: ${error}`);
          failedConnections.push(moduleName);
        }
      } else {
        console.log(`⚠️ Missing required env var for ${moduleName} connection string: ${envVar}`);
        failedConnections.push(moduleName);
      }
    }

    console.log("🔍 Database connections summary:");
    console.log(`  - Successful (${successfulConnections.length}): ${successfulConnections.join(", ")}`);
    if (failedConnections.length > 0) {
      console.log(`  - Failed (${failedConnections.length}): ${failedConnections.join(", ")}`);
    }

    // Only throw if critical modules failed (membership is always critical)
    if (failedConnections.includes("membership")) {
      throw new Error("Critical database module 'membership' failed to load from environment variables");
    }
  }

  private static async initializeAppConfigs(config: any) {
    // WebSocket configuration
    this.websocketUrl = process.env.SOCKET_URL || "";
    this.websocketPort = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT) : 8087;

    // File storage configuration
    this.fileStore = process.env.FILE_STORE || config.fileStore;
    this.s3Bucket = process.env.AWS_S3_BUCKET || config.s3Bucket || "";
    this.contentRoot = process.env.CONTENT_ROOT || config.contentRoot;
    this.deliveryProvider = process.env.DELIVERY_PROVIDER || config.deliveryProvider;

    // Membership API specific
    this.jwtExpiration = "2 days";
    this.emailOnRegistration = process.env.EMAIL_ON_REGISTRATION === "true" || config.emailOnRegistration === true;
    this.supportEmail = process.env.SUPPORT_EMAIL || config.supportEmail || "support@churchapps.org";
    this.b1AdminRoot = process.env.B1ADMIN_ROOT || config.b1AdminRoot || "https://admin.staging.b1.church";
    this.mailSystem = process.env.MAIL_SYSTEM || config.mailSystem || "";

    // AI provider configuration (shared)
    this.aiProvider = process.env.AI_PROVIDER || config.aiProvider || "openrouter";

    // Config strictly from environment variables (with config file fallback for non-secrets)
    this.hubspotKey = process.env.HUBSPOT_KEY || "";
    this.caddyHost = process.env.CADDY_HOST || config.caddyHost || "";
    this.caddyPort = process.env.CADDY_PORT || config.caddyPort || "";
    this.youTubeApiKey = process.env.YOUTUBE_API_KEY || "";
    this.pexelsKey = process.env.PEXELS_KEY || "";
    this.vimeoToken = process.env.VIMEO_TOKEN || "";
    this.apiBibleKey = process.env.API_BIBLE_KEY || "";
    this.youVersionApiKey = process.env.YOUVERSION_API_KEY || "";
    this.praiseChartsConsumerKey = process.env.PRAISECHARTS_CONSUMER_KEY || "";
    this.praiseChartsConsumerSecret = process.env.PRAISECHARTS_CONSUMER_SECRET || "";
    this.googleRecaptchaSecretKey = process.env.GOOGLE_RECAPTCHA_SECRET_KEY || "";
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY || "";
    this.openAiApiKey = process.env.OPENAI_API_KEY || "";

    console.log("✅ Configuration parameters loaded from environment variables");
  }

  static getDatabaseConfig(moduleName: string): any {
    console.log(`🔍 getDatabaseConfig() called for module: ${moduleName}`);
    console.log(`🔍 Available connections: ${Array.from(this.dbConnections.keys()).join(", ")}`);
    console.log(`🔍 Total connections available: ${this.dbConnections.size}`);
    console.log(`🔍 Environment.currentEnvironment: ${this.currentEnvironment}`);
    console.log(`🔍 dbConnections Map is same instance: ${this.dbConnections === Environment.dbConnections}`);
    console.log("🔍 Call stack:", new Error().stack?.split("\n").slice(1, 4).join("\n"));

    const config = this.dbConnections.get(moduleName);
    if (!config) {
      console.warn(`⚠️ Database config for ${moduleName} not available`);
      console.warn("⚠️ dbConnections Map contents:", Array.from(this.dbConnections.entries()));
      console.warn("⚠️ dbConnections Map reference:", this.dbConnections);
    } else {
      console.log(`✅ Found database config for ${moduleName}`);
    }
    return config;
  }

  static getConnectionStatus(): { loaded: string[]; missing: string[]; total: number } {
    const expectedModules = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];
    const loadedModules = Array.from(this.dbConnections.keys()).filter((key) => !key.includes("-"));
    const missing = expectedModules.filter((m) => !loadedModules.includes(m));

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
