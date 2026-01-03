import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { EnvironmentBase } from "@churchapps/apihelper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Environment extends EnvironmentBase {
  static async init(environment: string) {
    let file = "dev.json";
    if (environment === "staging") file = "staging.json";
    if (environment === "prod") file = "prod.json";

    const relativePath = "../../config/" + file;
    const physicalPath = path.resolve(__dirname, relativePath);

    const json = fs.readFileSync(physicalPath, "utf8");
    const data = JSON.parse(json);
    await this.populateBase(data, "doingApi", environment);
  }
}
