import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

export interface ParameterLoadResult {
  moduleName: string;
  connectionString: string | null;
  error: Error | null;
  source: "environment" | "parameter-store" | "dotenv" | "failed";
}

export class ParameterStoreHelper {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 1000;
  private static readonly TIMEOUT_MS = 5000;

  /**
   * Checks if we're running in local development mode
   */
  private static isLocalDevelopment(): boolean {
    // If we're in Lambda or any AWS execution environment, definitely not local
    const isLambda = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV;
    if (isLambda) {
      return false;
    }

    // Check for explicit local development indicators
    const isServerlessOffline = process.env.IS_OFFLINE === "true";
    const hasNodeEnv = process.env.NODE_ENV === "development";
    const hasDevScript = process.argv.some((arg) => arg.includes("ts-node-dev") || arg.includes("ts-node"));

    // Only check for local connection strings if we're definitely not in AWS
    // Previously we required localhost/127.0.0.1 to consider it local; this was too strict.
    // Treat presence of any module connection string env var as local development, regardless of host.
    const membershipConn = process.env.MEMBERSHIP_CONNECTION_STRING || "";
    const contentConn = process.env.CONTENT_CONNECTION_STRING || "";
    const hasLocalDbConnections = membershipConn.includes("localhost") || membershipConn.includes("127.0.0.1") || contentConn.includes("localhost") || contentConn.includes("127.0.0.1");

    const moduleNames = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];
    const anyModuleConn = moduleNames.some((m) => {
      const upper = m.toUpperCase();
      return !!process.env[`${upper}_CONNECTION_STRING`] || !!process.env[`${upper}_DB_CONNECTION_STRING`] || !!process.env[`${upper}_DATABASE_URL`] || !!process.env[`DB_${upper}_CONNECTION_STRING`];
    });

    const forceFromEnv = process.env.LOAD_DB_FROM_ENV === "true" || process.env.DB_FROM_ENV === "true";

    return isServerlessOffline || hasNodeEnv || hasDevScript || hasLocalDbConnections || anyModuleConn || forceFromEnv;
  }

  /**
   * Loads multiple parameters in a single batch operation with retry logic
   */
  static async readParametersBatch(paramNames: string[], maxRetries: number = this.MAX_RETRIES, baseDelay: number = this.BASE_DELAY_MS): Promise<Record<string, string | null>> {
    if (paramNames.length === 0) {
      return {};
    }

    // AWS Parameter Store batch API has a limit of 10 parameters per request
    const BATCH_SIZE = 10;
    const results: Record<string, string | null> = {};

    // Process parameters in batches
    for (let i = 0; i < paramNames.length; i += BATCH_SIZE) {
      const batch = paramNames.slice(i, i + BATCH_SIZE);
      const batchResults = await this.readParametersBatchInternal(batch, maxRetries, baseDelay);
      Object.assign(results, batchResults);
    }

    return results;
  }

  /**
   * Internal method to read a single batch of parameters (≤10 parameters)
   */
  private static async readParametersBatchInternal(paramNames: string[], maxRetries: number, baseDelay: number): Promise<Record<string, string | null>> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`  - Batch reading ${paramNames.length} parameters (attempt ${attempt}/${maxRetries}): [${paramNames.join(", ")}]`);

        // Use AWS SDK directly for batch operations
        const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "us-east-2" });
        const command = new GetParametersCommand({
          Names: paramNames,
          WithDecryption: true // Support encrypted parameters
        });

        const response = await Promise.race([
          ssmClient.send(command),
          new Promise<never>(
            (_, reject) => setTimeout(() => reject(new Error("Parameter Store batch timeout")), this.TIMEOUT_MS * 2) // Longer timeout for batch
          )
        ]);

        const results: Record<string, string | null> = {};

        // Initialize all requested parameters as null
        paramNames.forEach((name) => {
          results[name] = null;
        });

        // Set found parameters
        if (response.Parameters) {
          console.log(`🔍 AWS returned ${response.Parameters.length} parameters`);
          response.Parameters.forEach((param) => {
            if (param.Name && param.Value) {
              results[param.Name] = param.Value;
              console.log(`✅ Loaded parameter from batch: ${param.Name} = ${param.Value.substring(0, 20)}...`);
            } else {
              console.log(`⚠️ Parameter missing name or value: Name=${param.Name}, hasValue=${!!param.Value}`);
            }
          });
        } else {
          console.log("⚠️ AWS response.Parameters is null or undefined");
        }

        // Log missing parameters
        if (response.InvalidParameters && response.InvalidParameters.length > 0) {
          console.log(`⚠️ Invalid/missing parameters in batch: ${response.InvalidParameters.join(", ")}`);
        }

        return results;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Parameter Store batch attempt ${attempt} failed: ${errorMessage}`);

        // Check if it's an IAM permissions error
        if (errorMessage.includes("is not authorized to perform: ssm:GetParameters")) {
          console.error("🔐 IAM PERMISSIONS ERROR: The Lambda execution role needs ssm:GetParameters permission");
          console.error("🔧 Add this permission to your Lambda execution role:");
          console.error("   Action: ssm:GetParameters");
          console.error("   Resource: arn:aws:ssm:*:*:parameter/prod/*");
        }

        if (isLastAttempt) {
          // Return null for all parameters on final failure
          const results: Record<string, string | null> = {};
          paramNames.forEach((name) => {
            results[name] = null;
          });
          return results;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`  - Retrying batch in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Fallback return (should never reach here)
    const results: Record<string, string | null> = {};
    paramNames.forEach((name) => {
      results[name] = null;
    });
    return results;
  }

  /**
   * Read a single parameter with retry logic using GetParameter (not GetParameters)
   */
  static async readParameterWithRetry(paramName: string, maxRetries: number = this.MAX_RETRIES, baseDelay: number = this.BASE_DELAY_MS): Promise<string | null> {
    const { GetParameterCommand, SSMClient } = await import("@aws-sdk/client-ssm");

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`  - Reading parameter ${paramName} (attempt ${attempt}/${maxRetries})`);

        const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "us-east-2" });
        const command = new GetParameterCommand({
          Name: paramName,
          WithDecryption: true
        });

        const response = await Promise.race([ssmClient.send(command), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Parameter Store timeout")), this.TIMEOUT_MS))]);

        if (response.Parameter && response.Parameter.Value) {
          console.log(`✅ Successfully read parameter: ${paramName}`);
          return response.Parameter.Value;
        } else {
          console.log(`⚠️ Parameter ${paramName} exists but has no value`);
          return null;
        }
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check for parameter not found
        if (errorMessage.includes("ParameterNotFound")) {
          console.error(`⚠️ Parameter ${paramName} does not exist in Parameter Store`);
          return null;
        }

        // Check for IAM permissions error
        if (errorMessage.includes("is not authorized to perform: ssm:GetParameter")) {
          console.error(`🔐 IAM PERMISSIONS ERROR for ${paramName}: The Lambda execution role needs ssm:GetParameter permission`);
        }

        console.error(`❌ Parameter Store attempt ${attempt} failed for ${paramName}: ${errorMessage}`);

        if (isLastAttempt) {
          return null;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`  - Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /**
   * Loads multiple database connection strings in parallel using individual Parameter Store calls
   */
  static async loadDatabaseConnectionsParallel(modules: string[], environment: string, isAwsEnvironment: boolean): Promise<ParameterLoadResult[]> {
    console.log(`🔄 Loading ${modules.length} database connections in parallel...`);
    const isLocalDev = this.isLocalDevelopment();

    if (isLocalDev) {
      console.log("🏠 Local development mode detected - loading from .env file");
    }

    const parameterPromises = modules.map(async (moduleName): Promise<ParameterLoadResult> => {
      console.log(`🔍 Processing ${moduleName} module`);

      // For local development, try to load from .env using a different pattern
      if (isLocalDev) {
        // Try alternative .env naming patterns
        const altEnvVarNames = [
          `${moduleName.toUpperCase()}_CONNECTION_STRING`,
          `${moduleName.toUpperCase()}_DB_CONNECTION_STRING`,
          `${moduleName.toUpperCase()}_DATABASE_URL`,
          `DB_${moduleName.toUpperCase()}_CONNECTION_STRING`
        ];

        for (const altEnvVar of altEnvVarNames) {
          const altConnectionString = process.env[altEnvVar];
          if (altConnectionString) {
            console.log(`✅ ${moduleName}: Found in .env as ${altEnvVar}`);
            return {
              moduleName,
              connectionString: altConnectionString,
              error: null,
              source: "dotenv"
            };
          }
        }

        console.log(`❌ ${moduleName}: No connection string found in .env`);
        return {
          moduleName,
          connectionString: null,
          error: new Error(`No connection string found in .env for ${moduleName} module`),
          source: "failed"
        };
      }

      // AWS environment - use individual Parameter Store reads
      if (isAwsEnvironment) {
        const paramName = `/${environment}/${moduleName}Api/connectionString`;
        console.log(`🔄 ${moduleName}: Reading from Parameter Store: ${paramName}`);

        try {
          const connectionString = await this.readParameterWithRetry(paramName);

          if (connectionString) {
            console.log(`✅ ${moduleName}: Successfully loaded from Parameter Store`);
            return {
              moduleName,
              connectionString,
              error: null,
              source: "parameter-store"
            };
          } else {
            console.log(`❌ ${moduleName}: Parameter Store returned empty/null`);
            return {
              moduleName,
              connectionString: null,
              error: new Error(`Parameter Store returned empty/null for ${paramName}`),
              source: "failed"
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ ${moduleName}: Failed to read from Parameter Store: ${errorMessage}`);
          return {
            moduleName,
            connectionString: null,
            error: error instanceof Error ? error : new Error(errorMessage),
            source: "failed"
          };
        }
      }

      console.log(`❌ ${moduleName}: Not AWS environment and not local dev`);
      return {
        moduleName,
        connectionString: null,
        error: null,
        source: "failed"
      };
    });

    const results = await Promise.allSettled(parameterPromises);
    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          moduleName: modules[index],
          connectionString: null,
          error: result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
          source: "failed" as const
        };
      }
    });
  }

  /**
   * Loads configuration parameters in parallel with retry logic
   */
  static async loadConfigParametersParallel(parameterMap: Record<string, string>, environment: string): Promise<Record<string, string | null>> {
    const isLocalDev = this.isLocalDevelopment();

    if (isLocalDev) {
      console.log("🏠 Local development mode - loading config from .env file");
      const configValues: Record<string, string | null> = {};

      // For local development, try to load from environment variables
      Object.entries(parameterMap).forEach(([key, paramPath]) => {
        // Convert parameter path to environment variable format
        const envVarName = key.toUpperCase();
        const altEnvVarName = paramPath.toUpperCase().replace(/[^A-Z0-9]/g, "_");

        const value = process.env[envVarName] || process.env[altEnvVarName] || process.env[`API_${envVarName}`];

        if (value) {
          console.log(`  - Found config ${key} from .env: FOUND`);
        } else {
          console.log(`  - Config ${key} not found in .env (tried: ${envVarName}, ${altEnvVarName}, API_${envVarName})`);
        }

        configValues[key] = value || null;
      });

      return configValues;
    }

    // Production/AWS mode - use Parameter Store batch loading
    console.log(`🔄 Batch loading ${Object.keys(parameterMap).length} configuration parameters from Parameter Store...`);

    const envLower = environment.toLowerCase();
    const paramNames = Object.entries(parameterMap).map(([_key, paramPath]) => `/${envLower}/${paramPath}`);
    console.log(`🔍 Parameter Store paths being requested: ${paramNames.join(", ")}`);

    const batchResults = await this.readParametersBatch(paramNames, 2, 500); // Fewer retries for config params

    const configValues: Record<string, string | null> = {};

    Object.entries(parameterMap).forEach(([key, paramPath]) => {
      const paramName = `/${envLower}/${paramPath}`;
      configValues[key] = batchResults[paramName] || null;

      if (batchResults[paramName]) {
        console.log(`✅ Loaded config ${key} from batch Parameter Store`);
      } else {
        console.log(`⚠️ Config ${key} not found in Parameter Store batch`);
      }
    });

    return configValues;
  }
}
