import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController";
import { Environment } from "../../../shared/helpers/Environment";
import { AwsHelper } from "@churchapps/apihelper";

@controller("/membership/debug")
export class DebugController extends MembershipBaseController {
  @httpGet("/jwt-config")
  public async getJwtConfig(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const environment = Environment.currentEnvironment || "unknown";
      const envLower = environment.toLowerCase();
      const parameterPath = `/${envLower}/jwtSecret`;
      
      let parameterStoreValue = "N/A";
      let parameterStoreError = null;
      
      try {
        parameterStoreValue = await AwsHelper.readParameter(parameterPath);
        if (!parameterStoreValue) {
          parameterStoreValue = "(empty/null returned)";
        }
      } catch (error) {
        parameterStoreError = error.message || "Unknown error";
        parameterStoreValue = "(error reading)";
      }
      
      const jwtSecretLength = Environment.jwtSecret ? Environment.jwtSecret.length : 0;
      const jwtSecretPreview = Environment.jwtSecret 
        ? `${Environment.jwtSecret.substring(0, 10)}...${Environment.jwtSecret.substring(Environment.jwtSecret.length - 5)}` 
        : "(not set)";
      
      const response = {
        warning: "⚠️ SECURITY WARNING: This endpoint exposes sensitive configuration. Remove it before deploying to production!",
        environment: environment,
        jwtConfiguration: {
          currentValue: {
            exists: !!Environment.jwtSecret,
            length: jwtSecretLength,
            preview: jwtSecretPreview,
            source: process.env.JWT_SECRET ? "environment variable" : "parameter store or default"
          },
          environmentVariable: {
            JWT_SECRET: process.env.JWT_SECRET ? `(set, ${process.env.JWT_SECRET.length} chars)` : "(not set)"
          },
          parameterStore: {
            path: parameterPath,
            value: parameterStoreValue,
            error: parameterStoreError
          }
        },
        awsContext: {
          isLambda: !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV),
          functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || "(not in Lambda)",
          region: process.env.AWS_REGION || "(not set)",
          executionEnv: process.env.AWS_EXECUTION_ENV || "(not set)"
        },
        timestamp: new Date().toISOString()
      };
      
      return response;
    });
  }
  
  @httpGet("/jwt-test")
  public async testJwtGeneration(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const jwt = require("jsonwebtoken");
        const testPayload = { test: true, timestamp: Date.now() };
        
        const token = jwt.sign(testPayload, Environment.jwtSecret, { expiresIn: "1m" });
        const decoded = jwt.verify(token, Environment.jwtSecret);
        
        return {
          success: true,
          message: "JWT generation and verification successful",
          tokenLength: token.length,
          decoded: decoded
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          jwtSecretExists: !!Environment.jwtSecret,
          jwtSecretLength: Environment.jwtSecret ? Environment.jwtSecret.length : 0
        };
      }
    });
  }
}