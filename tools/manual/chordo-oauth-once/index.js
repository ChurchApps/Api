const mysql = require("mysql2/promise");
const crypto = require("crypto");

// Same shape as Api DatabaseUrlParser: mysql://user:password@host:port/database
function parseConnectionString(url) {
  const cleanUrl = url.replace(/^mysql:\/\//, "");
  const match = cleanUrl.match(/^(?:([^:@]+)(?::(.*))?@)?([^:/@]+)(?::(\d+))?\/([^?]+)(?:\?(.*))?$/);
  if (!match) throw new Error("Invalid MySQL connection string format");
  const [, user, password, host, portStr, database] = match;
  return {
    host,
    user: user || "root",
    password: password || "",
    database,
    port: portStr ? parseInt(portStr, 10) : 3306
  };
}

function shortId(length) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

const REDIRECT_URIS = "https://chordo.org/oauth/callback|http://localhost:5173/oauth/callback";
const SCOPES = "plans offline_access";
const NAME = "Chordo";

exports.handler = async () => {
  const config = parseConnectionString(process.env.MEMBERSHIP_CONNECTION_STRING || "");
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: "utf8mb4"
  });
  try {
    const [columns] = await conn.query("SHOW COLUMNS FROM oAuthClients");
    const fields = new Set(columns.map((column) => column.Field));
    const [existing] = await conn.query(
      "SELECT id, name, clientId, clientSecret, redirectUris, scopes FROM oAuthClients WHERE name = ? OR redirectUris LIKE ? LIMIT 1",
      [NAME, "%chordo.org/oauth/callback%"]
    );
    if (existing.length > 0) {
      const row = existing[0];
      return { created: false, id: row.id, name: row.name, clientId: row.clientId, clientSecret: row.clientSecret, redirectUris: row.redirectUris, scopes: row.scopes };
    }

    const id = shortId(11);
    const clientId = shortId(11);
    const clientSecret = crypto.randomBytes(24).toString("base64url");
    if (fields.has("selfRegistered")) {
      await conn.query(
        "INSERT INTO oAuthClients (id, name, clientId, clientSecret, redirectUris, scopes, selfRegistered, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, NOW())",
        [id, NAME, clientId, clientSecret, REDIRECT_URIS, SCOPES]
      );
    } else {
      await conn.query(
        "INSERT INTO oAuthClients (id, name, clientId, clientSecret, redirectUris, scopes, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [id, NAME, clientId, clientSecret, REDIRECT_URIS, SCOPES]
      );
    }
    const [saved] = await conn.query(
      "SELECT id, name, clientId, clientSecret, redirectUris, scopes FROM oAuthClients WHERE id = ?",
      [id]
    );
    const row = saved[0];
    return { created: true, id: row.id, name: row.name, clientId: row.clientId, clientSecret: row.clientSecret, redirectUris: row.redirectUris, scopes: row.scopes };
  } finally {
    await conn.end();
  }
};
