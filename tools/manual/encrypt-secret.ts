// Prints the value encrypted with this environment's ENCRYPTION_KEY (for seeding gateway secrets in demo.sql).
// Usage: npx tsx tools/manual/encrypt-secret.ts <plaintext>
import { EncryptionHelper } from "@churchapps/apihelper";
import { Environment } from "../../src/shared/helpers/Environment.js";

await Environment.init(process.env.ENVIRONMENT || "dev");
console.log(EncryptionHelper.encrypt(process.argv[2] || ""));
