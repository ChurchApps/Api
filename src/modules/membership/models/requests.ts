export interface RequestBase {
  // Common request properties
}

export interface BulkPersonDeleteRequest extends RequestBase {
  personIds: string[];
}

export interface BulkPersonUpdateRequest extends RequestBase {
  personIds: string[];
  updates: {
    membershipStatus?: string;
    maritalStatus?: string;
    gender?: string;
    optedOut?: boolean;
  };
}

export interface BulkGroupMemberRequest extends RequestBase {
  groupId: string;
  personIds: string[];
}
