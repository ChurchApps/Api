import dotenv from "dotenv";
import { DatabaseUrlParser } from "../src/shared/helpers/DatabaseUrlParser.js";
import { initializeDatabases } from "./initdb.js";

const REQUIRED_MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"] as const;
const ALLOWED_ENVIRONMENTS = ["demo", "dev"] as const;
const ALLOWED_HOST_SUBSTRINGS = ["demo", "localhost"] as const;

function refuse(message: string): never {
  console.error("\n========================================");
  console.error("reset-demo refused to run.");
  console.error(message);
  console.error("========================================\n");
  process.exit(1);
}

async function main() {
  dotenv.config();

  const env = process.env.ENVIRONMENT;
  if (!env || !ALLOWED_ENVIRONMENTS.includes(env as (typeof ALLOWED_ENVIRONMENTS)[number])) {
    refuse(
      `ENVIRONMENT is "${env ?? "<unset>"}" but must be one of: ${ALLOWED_ENVIRONMENTS.join(", ")}.\n` +
        `Set ENVIRONMENT=demo or ENVIRONMENT=dev in Api/.env before running tests.`
    );
  }

  // Find every connection-string env var that is set, regardless of name.
  // This catches core module strings, cross-module strings like
  // DOING_MEMBERSHIP_CONNECTION_STRING, REPORTING_CONNECTION_STRING, and any
  // future ones added to .env.
  const allConnStrings = Object.keys(process.env)
    .filter((k) => k.endsWith("_CONNECTION_STRING"))
    .sort();

  const offenders: string[] = [];

  // Must have the six required module strings present.
  for (const moduleName of REQUIRED_MODULES) {
    const envVar = `${moduleName.toUpperCase()}_CONNECTION_STRING`;
    if (!process.env[envVar]) {
      offenders.push(`${envVar} is not set (required for ${moduleName} module)`);
    }
  }

  // Every connection string that IS set must point at a demo or localhost host.
  for (const envVar of allConnStrings) {
    const connString = process.env[envVar]!;
    try {
      const config = DatabaseUrlParser.parseConnectionString(connString);
      const hostMatches = ALLOWED_HOST_SUBSTRINGS.some((sub) => config.host.includes(sub));
      if (!hostMatches) {
        offenders.push(
          `${envVar}: host "${config.host}" does not contain any of: ${ALLOWED_HOST_SUBSTRINGS.join(", ")}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      offenders.push(`${envVar}: ${msg}`);
    }
  }

  if (offenders.length > 0) {
    refuse(
      `Connection strings must point at a host containing one of: ${ALLOWED_HOST_SUBSTRINGS.join(", ")}.\n` +
        `Offenders:\n  - ${offenders.join("\n  - ")}\n\n` +
        `Uncomment the demo or localhost CONNECTION_STRING lines in Api/.env.`
    );
  }

  console.log(
    `reset-demo: environment=${env}, validated ${allConnStrings.length} connection string(s) ` +
      `against host substrings [${ALLOWED_HOST_SUBSTRINGS.join(", ")}]:\n  - ${allConnStrings.join("\n  - ")}\nProceeding.\n`
  );
  await initializeDatabases({ reset: true });
}

main().catch((err) => {
  console.error("reset-demo failed:", err);
  process.exit(1);
});
