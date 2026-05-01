export interface RequestBase {
  // Common request properties
}

export interface BulkPersonDeleteRequest extends RequestBase {
  personIds: string[];
}
