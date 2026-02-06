import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { MODULE_NAMES, type ModuleName } from "./migrations/kysely-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArguments(): { module: ModuleName; name: string } {
  const args = process.argv.slice(2);
  let module: string | undefined;
  let name: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--module=")) {
      module = arg.split("=")[1];
    } else if (arg.startsWith("--name=")) {
      name = arg.split("=")[1];
    }
  }

  if (!module || !MODULE_NAMES.includes(module as ModuleName)) {
    console.error(`--module is required. Valid modules: ${MODULE_NAMES.join(", ")}`);
    process.exit(1);
  }

  if (!name) {
    console.error("--name is required (e.g. --name=add_email_verified)");
    process.exit(1);
  }

  return { module: module as ModuleName, name };
}

function getDatePrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const boilerplate = (name: string) => `import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // TODO: implement ${name} migration
}

export async function down(db: Kysely<any>): Promise<void> {
  // TODO: implement ${name} rollback
}
`;

function main() {
  const { module: moduleName, name } = parseArguments();
  const migrationsDir = path.join(__dirname, "migrations", moduleName);
  const prefix = getDatePrefix();
  const fileName = `${prefix}_${name}.ts`;
  const filePath = path.join(migrationsDir, fileName);

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  fs.writeFileSync(filePath, boilerplate(name));
  console.log(`Created: tools/migrations/${moduleName}/${fileName}`);
}

main();
