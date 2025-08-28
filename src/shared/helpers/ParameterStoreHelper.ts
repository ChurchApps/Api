import { AwsHelper } from "@churchapps/apihelper";

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
   * Loads a single parameter with retry logic and timeout
   */
  static async readParameterWithRetry(
    paramName: string,
    maxRetries: number = this.MAX_RETRIES,
    baseDelay: number = this.BASE_DELAY_MS
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`  - Attempting to read Parameter Store: ${paramName} (attempt ${attempt}/${maxRetries})`);

        const result = await Promise.race([
          AwsHelper.readParameter(paramName),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Parameter Store timeout")), this.TIMEOUT_MS)
          )
        ]);

        if (result) {
          console.log(`✅ Loaded parameter from Parameter Store: ${paramName}`);
          return result;
        } else {
          console.log(`⚠️ Parameter Store returned empty/null for ${paramName}`);
          return null;
        }
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Parameter Store attempt ${attempt} failed for ${paramName}: ${errorMessage}`);

        if (isLastAttempt) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`  - Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
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
      let connectionString = process.env[envVarName];

      console.log(`🔍 Checking ${moduleName} module:`);
      console.log(`  - Environment variable ${envVarName}: ${connectionString ? "FOUND" : "NOT FOUND"}`);

      if (connectionString) {
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

      // If not in environment variable and we're in AWS, try Parameter Store
      if (!connectionString && isAwsEnvironment) {
        try {
          const paramName = `/${environment}/${moduleName}Api/connectionString`;
          connectionString = await this.readParameterWithRetry(paramName);

          return {
            moduleName,
            connectionString,
            error: null,
            source: connectionString ? "parameter-store" : "failed"
          };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(`❌ Parameter Store error for ${moduleName}: ${err.message}`);
          return {
            moduleName,
            connectionString: null,
            error: err,
            source: "failed"
          };
        }
      }

      return {
        moduleName,
        connectionString: null,
        error: null,
        source: "failed"
      };
    });

    const results = await Promise.allSettled(parameterPromises);

    // Convert Promise.allSettled results to our format
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

    // Production/AWS mode - use Parameter Store
    const envLower = environment.toLowerCase();
    const parameterPromises = Object.entries(parameterMap).map(async ([key, paramPath]) => {
      try {
        const fullPath = `/${envLower}/${paramPath}`;
        const value = await this.readParameterWithRetry(fullPath, 2, 500); // Fewer retries for config params
        return { key, value };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to load config parameter ${key}: ${errorMessage}`);
        return { key, value: null };
      }
    });

    const results = await Promise.allSettled(parameterPromises);
    const configValues: Record<string, string | null> = {};

    results.forEach((result, index) => {
      const key = Object.keys(parameterMap)[index];
      if (result.status === "fulfilled") {
        configValues[result.value.key] = result.value.value;
      } else {
        configValues[key] = null;
      }
    });

    return configValues;
  }
}