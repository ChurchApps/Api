// Login-related models
import { Church } from "./Church.js";
import { User } from "./User.js";
import { Setting } from "./Setting.js";
import { Api } from "./Api.js";

export interface LoginRequest {
  email: string;
  password: string;
  appName?: string;
  authGuid?: string;
  jwt?: string;
  mfaToken?: string;
  mfaCode?: string;
}

export interface LoginResponse {
  user: User;
  userChurches: LoginUserChurch[];
  token?: string;
  errors?: string[];
}

export interface LoginUserChurch {
  church: {
    id: string;
    name: string;
    subDomain?: string;
    archivedDate?: Date;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    settings?: Setting[];
  };
  person?: {
    id: string;
    membershipStatus?: string;
    name?: {
      first: string;
      last: string;
    };
  };
  groups?: Array<{ id: string; name?: string; tags?: string; leader?: boolean; [key: string]: unknown }>;
  apis?: Api[];
  jwt?: string;
  mfaToken?: string;
  mfaCode?: string;
}

export interface EmailPassword {
  email: string;
  password: string;
}

export interface ResetPasswordRequest {
  userEmail: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  appName?: string;
  appUrl?: string;
}

export interface NewPasswordRequest {
  authGuid: string;
  email: string;
  newPassword: string;
}

export interface LoadCreateUserRequest {
  userEmail: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
  appName?: string;
  appUrl?: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
}

export interface RegisterUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  churchId?: string;
  appName?: string;
  appUrl?: string;
  fillMs?: number;
}

export interface RegistrationRequest {
  churchName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  subDomain?: string;
}

export interface RegisterChurchRequest extends Church {
  appName?: string;
  appUrl?: string;
}
