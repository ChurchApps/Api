import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Provider signing-key sets. createRemoteJWKSet caches and refreshes keys internally.
const JWKS = {
  google: createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
  microsoft: createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"))
} as const;

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export class SsoTokenHelper {
  // Verifies signature (against provider JWKS), audience, issuer, expiry and nonce.
  // Throws on any failure. Returns the validated claim set.
  public static async verifyIdToken(provider: "google" | "microsoft", idToken: string, expectedNonce: string, clientId: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(idToken, JWKS[provider], { audience: clientId });

    if (provider === "google") {
      if (!GOOGLE_ISSUERS.includes(String(payload.iss))) throw new Error("Invalid issuer");
    } else {
      const tid = payload.tid as string | undefined;
      if (!tid) throw new Error("Missing tenant id");
      if (payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new Error("Invalid issuer");
    }

    if (!expectedNonce || payload.nonce !== expectedNonce) throw new Error("Nonce mismatch");
    return payload;
  }
}
