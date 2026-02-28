export class Registration {
  id?: string;
  churchId?: string;
  eventId?: string;
  personId?: string;
  householdId?: string;
  status?: string;
  formSubmissionId?: string;
  notes?: string;
  registeredDate?: Date;
  cancelledDate?: Date;
  members?: RegistrationMember[];
}

export class RegistrationMember {
  id?: string;
  churchId?: string;
  registrationId?: string;
  personId?: string;
  firstName?: string;
  lastName?: string;
}
