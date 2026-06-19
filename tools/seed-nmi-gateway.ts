// Local-dev helper: add a Kingdom Funding (NMI) gateway to the demo Grace church.
// Encrypts the NMI secrets exactly like GatewayController does, then inserts the row.
// Run: npx tsx tools/seed-nmi-gateway.ts
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { EncryptionHelper, EnvironmentBase } from "@churchapps/apihelper";

dotenv.config();
EnvironmentBase.encryptionKey = process.env.ENCRYPTION_KEY || "";

const CHURCH_ID = "CHU00000001";
const GATEWAY_ID = "GAT00000003";

async function main() {
  const securityKey = process.env.NMI_SECURITY_KEY || "";
  const tokenizationKey = process.env.NMI_TOKENIZATION_KEY || "";
  const webhookKey = process.env.NMI_WEBHOOK_KEY || "";
  if (!securityKey || !tokenizationKey) throw new Error("NMI_SECURITY_KEY / NMI_TOKENIZATION_KEY missing from .env");

  const conn = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "b1local", database: "giving" });

  await conn.execute("DELETE FROM gateways WHERE id = ?", [GATEWAY_ID]);
  await conn.execute(
    `INSERT INTO gateways (id, churchId, provider, publicKey, privateKey, webhookKey, productId, payFees, currency, settings, environment)
     VALUES (?, ?, 'kingdomfunding', ?, ?, ?, '', 0, 'USD', ?, 'sandbox')`,
    [
      GATEWAY_ID,
      CHURCH_ID,
      tokenizationKey,                                  // publicKey — plaintext (browser)
      EncryptionHelper.encrypt(securityKey),            // privateKey — encrypted
      webhookKey ? EncryptionHelper.encrypt(webhookKey) : "",
      JSON.stringify({ sandbox: true }),
    ]
  );

  const [rows] = await conn.query("SELECT id, provider, churchId, publicKey, environment FROM gateways WHERE id = ?", [GATEWAY_ID]);
  console.log("Inserted gateway:", rows);

  // Sanity: confirm round-trip decrypt matches the original security key.
  const [enc]: any = await conn.query("SELECT privateKey FROM gateways WHERE id = ?", [GATEWAY_ID]);
  const decrypted = EncryptionHelper.decrypt(enc[0].privateKey);
  console.log("Decrypt round-trip OK:", decrypted === securityKey);

  await conn.end();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
