import { z } from 'zod';
import type { RecordDoc } from './crdt';

export const SCHEMA_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hlc = z.string().min(23);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const recurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({ type: z.literal('weekly'), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1) }),
]);
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const FIXED_CYCLES = ['dafYomi', 'mishnaYomi'] as const;
export type FixedCycle = (typeof FIXED_CYCLES)[number];

export const scheduleSchema = z.discriminatedUnion('kind', [
  /** The unit for a date is a pure function of the date (world-wide cycles). */
  z.object({ kind: z.literal('fixedCycle'), cycle: z.enum(FIXED_CYCLES) }),
  /** Walks numbered units from a start point at N units per session. */
  z.object({
    kind: z.literal('sequential'),
    startDate: isoDate,
    unitLabel: z.string().max(40),
    startUnit: z.number().int().min(1),
    unitsPerSession: z.number().int().min(1).max(100),
    totalUnits: z.number().int().min(1).optional(),
    recurrence: recurrenceSchema,
  }),
  /** Recurrence only; sessions are simply numbered. */
  z.object({ kind: z.literal('freeform'), startDate: isoDate, recurrence: recurrenceSchema }),
]);
export type Schedule = z.infer<typeof scheduleSchema>;

export const linkSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('none') }),
  /** Built-in link for fixed cycles. */
  z.object({ provider: z.literal('builtin') }),
  z.object({ provider: z.literal('template'), urlTemplate: z.string().max(2000) }),
]);
export type LinkConfig = z.infer<typeof linkSchema>;

export const reminderRuleSchema = z.object({
  id: z.string(),
  time: timeOfDay,
  onlyIfNotDone: z.boolean(),
});
export type ReminderRule = z.infer<typeof reminderRuleSchema>;

export const trackSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  schedule: scheduleSchema,
  link: linkSchema,
  reminders: z.array(reminderRuleSchema).max(10),
  archived: z.boolean(),
  deleted: z.boolean(),
  hlc,
});
export type StudyTrack = z.infer<typeof trackSchema>;

export const progressSchema = z.object({
  done: z.boolean(),
  doneAt: z.string().optional(),
  note: z.string().max(2000).optional(),
  hlc,
});
export type ProgressRecord = z.infer<typeof progressSchema>;

export const settingSchema = z.object({ value: z.unknown(), hlc });
export type SettingRecord = z.infer<typeof settingSchema>;

export const manifestRecordSchema = z.object({ value: z.unknown(), hlc });
export type ManifestRecord = z.infer<typeof manifestRecordSchema>;

function docSchema<T extends z.ZodTypeAny>(record: T) {
  return z.object({ schemaVersion: z.number().int().min(1), records: z.record(z.string(), record) });
}

const schemas = {
  manifest: docSchema(manifestRecordSchema),
  settings: docSchema(settingSchema),
  tracks: docSchema(trackSchema),
  progress: docSchema(progressSchema),
};

export type DocKind = keyof typeof schemas;

/** Document names are also the Drive file names (plus `.json`). */
export function docKind(name: string): DocKind | null {
  if (name === 'manifest' || name === 'settings' || name === 'tracks') return name;
  if (/^progress-\d{4}$/.test(name)) return 'progress';
  return null;
}

export function progressDocName(year: number): string {
  return `progress-${year}`;
}

export function progressKey(trackId: string, date: string): string {
  return `${trackId}|${date}`;
}

export class SchemaTooNewError extends Error {
  constructor(readonly name_: string, readonly version: number) {
    super(`Document ${name_} uses schema ${version}, newer than this client supports (${SCHEMA_VERSION}).`);
  }
}

/** Validate untrusted JSON (from Drive or disk) as a document of the kind implied by its name. */
export function parseDoc(name: string, raw: unknown): RecordDoc<any> {
  const kind = docKind(name);
  if (!kind) throw new Error(`Unknown document: ${name}`);
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) throw new SchemaTooNewError(name, version);
  return schemas[kind].parse(raw) as RecordDoc<any>;
}
