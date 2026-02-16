import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { Setting } from "../models/index.js";
import { Permissions, FileStorageHelper, Environment } from "../helpers/index.js";
import { MembershipBaseController } from "./MembershipBaseController.js";

@controller("/membership/settings")
export class MembershipSettingController extends MembershipBaseController {
  @httpGet("/")
  public async get(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        return this.repos.setting.convertAllToModel(au.churchId, (await this.repos.setting.loadAll(au.churchId)) as any[]);
      }
    });
  }

  @httpPost("/")
  public async post(req: express.Request<{}, {}, Setting[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Setting>[] = [];
        req.body.forEach((setting) => {
          setting.churchId = au.churchId;
          promises.push(this.saveSetting(setting));
        });
        const result = await Promise.all(promises);
        return this.repos.setting.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpGet("/public/:churchId")
  public async publicRoute(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const publicSettings = await this.repos.setting.loadPublicSettings(churchId);

      // Handle case where publicSettings is undefined or not an array
      if (!publicSettings || !Array.isArray(publicSettings)) {
        return {};
      }

      const settings = this.repos.setting.convertAllToModel(churchId, publicSettings as any[]);

      // Handle case where settings conversion fails
      if (!settings || !Array.isArray(settings)) {
        return {};
      }

      const result: any = {};
      settings.forEach((s) => {
        result[s.keyName] = s.value;
      });
      return result;
    });
  }

  // TEMPORARY DEBUG ROUTE - Remove after JWT secret issue is resolved
  // TEMPORARY DEBUG ROUTE - Remove after JWT secret issue is resolved
  @httpGet("/debug/jwt-config")
  public async debugJwtConfig(_req: express.Request, _res: express.Response): Promise<any> {
    try {
      const environment = Environment.currentEnvironment || "unknown";
      const paramStorePath = `/${environment.toLowerCase()}/jwtSecret`;

      // Check if JWT_SECRET environment variable exists (without revealing value)
      const hasEnvVar = !!process.env.JWT_SECRET;
      const envVarLength = process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0;

      // Check current Environment.jwtSecret status
      const hasJwtSecret = !!Environment.jwtSecret;
      const jwtSecretLength = Environment.jwtSecret ? Environment.jwtSecret.length : 0;

      // AWS environment detection
      const awsLambdaFunction = process.env.AWS_LAMBDA_FUNCTION_NAME || "not-set";
      const awsExecutionEnv = process.env.AWS_EXECUTION_ENV || "not-set";
      const isAwsEnvironment = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);

      const debugInfo = {
        timestamp: new Date().toISOString(),
        environment: environment,
        sources: {
          envVar: {
            exists: hasEnvVar,
            length: envVarLength,
            name: "JWT_SECRET"
          },
          parameterStore: {
            path: paramStorePath,
            wouldAttemptRead: isAwsEnvironment
          }
        },
        currentConfig: {
          hasJwtSecret: hasJwtSecret,
          jwtSecretLength: jwtSecretLength,
          // Only show first/last 4 chars for security
          preview: hasJwtSecret ? `${Environment.jwtSecret.substring(0, 4)}...${Environment.jwtSecret.substring(Environment.jwtSecret.length - 4)}` : null
        },
        awsInfo: {
          lambdaFunction: awsLambdaFunction,
          executionEnv: awsExecutionEnv,
          isAwsEnvironment: isAwsEnvironment
        },
        recommendation: !hasJwtSecret ? `Set environment variable JWT_SECRET or AWS Parameter Store at ${paramStorePath}` : "JWT secret is properly configured"
      };

      return this.json(debugInfo, 200);
    } catch (error) {
      return this.json(
        {
          error: "Debug endpoint error",
          message: error.message,
          timestamp: new Date().toISOString()
        },
        500
      );
    }
  }

  private async saveSetting(setting: Setting) {
    if (setting.value.startsWith("data:image/")) setting = await this.saveImage(setting);
    setting = await this.repos.setting.save(setting);
    return setting;
  }

  private async saveImage(setting: Setting) {
    const base64 = setting.value.split(",")[1];
    const key = "/" + setting.churchId + "/settings/" + setting.keyName + ".png";
    await FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64"));
    const photoUpdated = new Date();
    setting.value = Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
    return setting;
  }
}
