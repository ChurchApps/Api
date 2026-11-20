// The membership repos the giving helpers read. Modules can't import each other, so the slice they use is described here.
export interface MembershipReposSlice {
  person: { load(churchId: string, id: string): Promise<{ email?: string } | null | undefined> };
  church: { loadById(id: string): Promise<DunningChurch | null | undefined> };
  loginAttempt: {
    loadCount(attemptKey: string, windowSeconds: number): Promise<number>;
    increment(attemptKey: string, windowSeconds: number): Promise<void>;
  };
}

export interface DunningChurch {
  name?: string;
  subDomain?: string;
}

// Where API Gateway (REST and HTTP APIs) puts the caller's source IP on a serverless-express request.
export interface ApiGatewayRequestContext {
  identity?: { sourceIp?: string };
  http?: { sourceIp?: string };
}

export interface ApiGatewayRequest {
  apiGateway?: { event?: { requestContext?: ApiGatewayRequestContext } };
  requestContext?: ApiGatewayRequestContext;
}
