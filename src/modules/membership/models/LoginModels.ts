// Login-related models

export interface LoginRequest {
  email: string;
  password: string;
  appName?: string;
  authGuid?: string;
  jwt?: string;
}

export interface LoginResponse {
  user: any;
  churches: LoginUserChurch[];
  token?: string;
  errors?: string[];
}

export interface LoginUserChurch {
  id: string;
  church: {
    id: string;
    name: string;
    subDomain?: string;
    address?: string;
    settings?: any;
    archivedDate?: Date;
  };
  person?: {
    id: string;
    name: {
      first: string;
      last: string;
    };
    contactInfo?: {
      email: string;
    };
    photoUrl?: string;
    membershipStatus?: string;
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

export interface RegisterChurchRequest {
  appName: string;
  appUrl: string;
  church: {
    name: string;
    address1?: string;
    address2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    subDomain?: string;
  };
  user: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
}
