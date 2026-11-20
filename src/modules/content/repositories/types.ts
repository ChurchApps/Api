import type { EventBooking, Link, Setting, StorageProvider } from "../models/index.js";
import type { QueryResult } from "kysely";
import type { Conflict } from "../helpers/ConflictHelper.js";

// Row shapes for content queries whose columns don't match a model in ../models.

export type LinkRow = Link & { photoUpdated?: Date };

// A booking joined with the names and schedule of its event, room and resource.
export interface EventBookingDetails extends EventBooking {
  eventTitle?: string;
  eventStart?: Date;
  eventEnd?: Date;
  eventRecurrenceRule?: string;
  roomName?: string;
  roomApprovalGroupId?: string;
  resourceName?: string;
  resourceApprovalGroupId?: string;
  // Filled in by the approvals endpoint after loading.
  conflicts?: Conflict[];
}

// Raw INSERT/UPDATE results: kysely reports numAffectedRows, and the mysql2 driver also exposes affectedRows.
export type MysqlWriteResult = QueryResult<unknown> & { affectedRows?: number };

// A row plus a derived `used` total; mysql2 returns SUM() as a decimal string.
export type WithUsage<T> = T & { used: number | string };

// MySQL returns TINYINT(1) flags as 0/1 when read through raw queries.
export type TinyIntActive<T extends { active?: boolean }> = Omit<T, "active"> & { active?: boolean | number };

// `enabled` is a BIT column, which mysql2 can return as a Buffer.
export type StorageProviderRow = Omit<StorageProvider, "enabled"> & { enabled?: boolean | number | Buffer };

// A sermon auto-import setting paired with the channel setting it points to.
export type SettingImport = Setting & { channel?: Setting };
