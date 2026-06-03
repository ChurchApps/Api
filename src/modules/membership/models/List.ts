export class List {
  public id?: string;
  public churchId?: string;
  public createdByPersonId?: string;
  public name?: string;
  public category?: string;
  // Populated by loadAll via a join for display in the picker; not a stored column.
  public createdByPersonName?: string;
  // The saved advanced-search filter spec (the UI's activeFilters), stored as JSON
  // and re-run live each time the list is opened. We deliberately store the query,
  // not the resolved people, so membership stays fresh.
  public conditions?: any;
}
