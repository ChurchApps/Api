// OAuth discovery for MCP connectors (claude.ai, ChatGPT): /mcp is the protected resource,
// the existing /membership/oauth provider is its authorization server, B1Admin /oauth is the consent page.

import { Environment } from "../../shared/helpers/Environment.js";
import { listAllScopes } from "../../shared/auth/Scopes.js";

export function apiRoot(): string {
  return (Environment.membershipApi || "").replace(/\/membership\/?$/, "");
}

export function protectedResourceMetadataUrl(): string {
  return `${apiRoot()}/.well-known/oauth-protected-resource`;
}

export function protectedResourceMetadata() {
  return {
    resource: `${apiRoot()}/mcp`,
    authorization_servers: [apiRoot()],
    scopes_supported: listAllScopes(),
    bearer_methods_supported: ["header"],
    resource_name: "B1"
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: apiRoot(),
    authorization_endpoint: `${Environment.b1AdminRoot}/oauth`,
    token_endpoint: `${Environment.membershipApi}/oauth/token`,
    registration_endpoint: `${Environment.membershipApi}/oauth/register`,
    scopes_supported: listAllScopes(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"]
  };
}
