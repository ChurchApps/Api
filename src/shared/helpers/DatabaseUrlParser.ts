/**
 * Utility for parsing MySQL connection strings into configuration objects
 */
export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  connectionLimit?: number;
}

export class DatabaseUrlParser {
  /**
   * Parses a MySQL connection string into a database configuration object
   * Format: mysql://user:password@host:port/database
   *
   * @param url MySQL connection string
   * @returns DatabaseConfig object
   */
  static parseConnectionString(url: string): DatabaseConfig {
    if (!url) {
      throw new Error("Database URL is required");
    }

    // Remove mysql:// prefix if present
    const cleanUrl = url.replace(/^mysql:\/\//, "");

    // Parse the URL components
    // Pattern: [user[:password]@]host[:port]/database[?params]
    const urlPattern = /^(?:([^:@]+)(?::([^@]*))?@)?([^:\/]+)(?::(\d+))?\/([^?]+)(?:\?(.*))?$/;
    const match = cleanUrl.match(urlPattern);

    if (!match) {
      throw new Error(
        `Invalid MySQL connection string format: ${url}. Expected format: mysql://user:password@host:port/database`
      );
    }

    const [, user, password, host, portStr, database] = match;

    if (!host || !database) {
      throw new Error(`Missing required components in connection string: ${url}. Host and database are required.`);
    }

    const port = portStr ? parseInt(portStr, 10) : 3306;

    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid port number in connection string: ${portStr}. Port must be between 1 and 65535.`);
    }

    return {
      host: host,
      user: user || "root",
      password: password || "",
      database: database,
      port: port,
      connectionLimit: 10 // Default connection limit
    };
  }

  /**
   * Validates a database configuration object
   *
   * @param config DatabaseConfig object to validate
   * @returns true if valid, throws error if invalid
   */
  static validateConfig(config: DatabaseConfig): boolean {
    if (!config.host) {
      throw new Error("Database host is required");
    }

    if (!config.database) {
      throw new Error("Database name is required");
    }

    if (!config.user) {
      throw new Error("Database user is required");
    }

    if (config.port <= 0 || config.port > 65535) {
      throw new Error(`Invalid port number: ${config.port}. Port must be between 1 and 65535.`);
    }

    return true;
  }

  /**
   * Converts a database configuration object back to a connection string
   *
   * @param config DatabaseConfig object
   * @returns MySQL connection string
   */
  static configToConnectionString(config: DatabaseConfig): string {
    const userPass = config.password ? `${config.user}:${config.password}` : config.user;

    return `mysql://${userPass}@${config.host}:${config.port}/${config.database}`;
  }
}
