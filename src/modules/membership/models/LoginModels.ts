// Login-related models
import { Church } from "./Church.js";

export interface LoginRequest {
  email: string;
  password: string;
  appName?: string;
  authGuid?: string;
  jwt?: string;
}

export interface LoginResponse {
  user: any;
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
    settings?: any[];
  };
  person?: {
    id: string;
    membershipStatus?: string;
    name?: {
      first: string;
      last: string;
    };
  };
  groups?: Array<{ id: string; [key: string]: any }>;
  apis?: any[];
  jwt?: string;
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
