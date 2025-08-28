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
    // Check for npm run dev or local development indicators
    const isLambda = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV;
    const isServerlessOffline = process.env.IS_OFFLINE === "true";
    const hasNodeEnv = process.env.NODE_ENV === "development";
    const hasDevScript = process.argv.some(arg => arg.includes("ts-node-dev") || arg.includes("ts-node"));

    return !isLambda && (isServerlessOffline || hasNodeEnv || hasDevScript);
  }

  /**
   * Loads multiple parameters in a single batch operation with retry logic
   */
  static async readParametersBatch(
    paramNames: string[],
    maxRetries: number = this.MAX_RETRIES,
    baseDelay: number = this.BASE_DELAY_MS
  ): Promise<Record<string, string | null>> {
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
  private static async readParametersBatchInternal(
    paramNames: string[],
    maxRetries: number,
    baseDelay: number
  ): Promise<Record<string, string | null>> {
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
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Parameter Store batch timeout")), this.TIMEOUT_MS * 2) // Longer timeout for batch
          )
        ]);

        const results: Record<string, string | null> = {};

        // Initialize all requested parameters as null
        paramNames.forEach(name => {
          results[name] = null;
        });

        // Set found parameters
        if (response.Parameters) {
          console.log(`🔍 AWS returned ${response.Parameters.length} parameters`);
          response.Parameters.forEach(param => {
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

        if (isLastAttempt) {
          // Return null for all parameters on final failure
          const results: Record<string, string | null> = {};
          paramNames.forEach(name => {
            results[name] = null;
          });
          return results;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`  - Retrying batch in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Fallback return (should never reach here)
    const results: Record<string, string | null> = {};
    paramNames.forEach(name => {
      results[name] = null;
    });
    return results;
  }

  /**
   * Legacy single parameter method - now uses batch internally for consistency
   */
  static async readParameterWithRetry(
    paramName: string,
    maxRetries: number = this.MAX_RETRIES,
    baseDelay: number = this.BASE_DELAY_MS
  ): Promise<string | null> {
    const results = await this.readParametersBatch([paramName], maxRetries, baseDelay);
    return results[paramName] || null;
  }

  /**
   * Loads multiple database connection strings in parallel
   */
  static async loadDatabaseConnectionsParallel(
    modules: string[],
    environment: string,
    isAwsEnvironment: boolean
  ): Promise<ParameterLoadResult[]> {
    console.log(`🔄 Loading ${modules.length} database connections in parallel...`);
    const isLocalDev = this.isLocalDevelopment();

    if (isLocalDev) {
      console.log("🏠 Local development mode detected - loading from .env file");
    }

    const parameterPromises = modules.map(async (moduleName): Promise<ParameterLoadResult> => {
      const envVarName = `${moduleName.toUpperCase()}_CONNECTION_STRING`;
      const connectionString = process.env[envVarName];

      console.log(`🔍 Processing ${moduleName} module:`);
      console.log(`  - Environment variable ${envVarName}: ${connectionString ? "FOUND" : "NOT FOUND"}`);
      if (connectionString) {
        console.log(`  - Connection string preview: ${connectionString.substring(0, 20)}...`);
      }

      if (connectionString) {
        console.log(`✅ ${moduleName}: Using environment variable`);
        return {
          moduleName,
          connectionString,
          error: null,
          source: "environment"
        };
      }

      // For local development, try to load from .env using a different pattern
      if (isLocalDev) {
        // Try alternative .env naming patterns
        const altEnvVarNames = [
          `${moduleName.toUpperCase()}_DB_CONNECTION_STRING`,
          `${moduleName.toUpperCase()}_DATABASE_URL`,
          `DB_${moduleName.toUpperCase()}_CONNECTION_STRING`
        ];

        for (const altEnvVar of altEnvVarNames) {
          const altConnectionString = process.env[altEnvVar];
          if (altConnectionString) {
            console.log(`  - Found alternative env var ${altEnvVar}: FOUND`);
            return {
              moduleName,
              connectionString: altConnectionString,
              error: null,
              source: "dotenv"
            };
          }
        }

        console.log(`  - Local development: No connection string found in .env for ${moduleName}`);
        return {
          moduleName,
          connectionString: null,
          error: new Error(`No connection string found in .env for ${moduleName} module`),
          source: "failed"
        };
      }

      // Mark for batch Parameter Store loading if needed
      if (!connectionString && isAwsEnvironment) {
        console.log(`🔄 ${moduleName}: Marked for Parameter Store batch loading`);
        return {
          moduleName,
          connectionString: null, // Will be filled by batch operation
          error: null,
          source: "parameter-store" // Optimistic - will be updated after batch
        };
      }

      console.log(`❌ ${moduleName}: No connection string found`);
      return {
        moduleName,
        connectionString: null,
        error: null,
        source: "failed"
      };
    });

    const results = await Promise.allSettled(parameterPromises);
    const initialResults = results.map((result, index) => {
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

    // Batch load Parameter Store values for modules that need them
    if (isAwsEnvironment && !isLocalDev) {
      const needParameterStore = initialResults.filter(r => r.source === "parameter-store" && !r.connectionString);

      if (needParameterStore.length > 0) {
        console.log(`🔄 Batch loading ${needParameterStore.length} connection strings from Parameter Store...`);
        console.log(`🔍 Modules needing Parameter Store: ${needParameterStore.map(r => r.moduleName).join(", ")}`);

        const paramNames = needParameterStore.map(r => `/${environment}/${r.moduleName}Api/connectionString`);
        console.log(`🔍 Parameter names to fetch: ${paramNames.join(", ")}`);

        const batchResults = await this.readParametersBatch(paramNames);
        console.log(`🔍 Batch results keys: ${Object.keys(batchResults).join(", ")}`);
        console.log(`🔍 Batch results with values: ${Object.entries(batchResults).filter(([_k, v]) => v).map(([k]) => k).join(", ")}`);

        // Update results with batch-loaded values
        needParameterStore.forEach(result => {
          const paramName = `/${environment}/${result.moduleName}Api/connectionString`;
          const connectionString = batchResults[paramName];

          console.log(`🔍 Processing ${result.moduleName}: paramName=${paramName}, found=${!!connectionString}`);

          if (connectionString) {
            result.connectionString = connectionString;
            result.source = "parameter-store";
            console.log(`✅ ${result.moduleName}: Loaded from batch Parameter Store`);
          } else {
            result.source = "failed";
            result.error = new Error(`Parameter Store returned empty/null for ${paramName}`);
            console.log(`❌ ${result.moduleName}: Parameter Store returned empty/null for ${paramName}`);
          }
        });
      } else {
        console.log("ℹ️ No modules need Parameter Store loading");
      }
    }

    return initialResults;
  }

  /**
   * Loads configuration parameters in parallel with retry logic
   */
  static async loadConfigParametersParallel(
    parameterMap: Record<string, string>,
    environment: string
  ): Promise<Record<string, string | null>> {
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