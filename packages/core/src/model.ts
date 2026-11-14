import { z } from 'zod';
import type { RecordDoc } from './crdt';

export const SCHEMA_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hlc = z.string().min(23);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const recurrenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({ type: z.literal('weekly'), daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1) }),
  /** Fixed days of the calendar month; a day the month lacks (e.g. the 31st) is skipped. */
  z.object({
    type: z.literal('monthly'),
    daysOfMonth: z.array(z.number().int().min(1).max(31)).min(1),
    /** Which calendar's month the days refer to. */
    calendar: z.enum(['gregorian', 'hebrew']).default('gregorian'),
  }),
  /** No fixed days: a target number of sessions per week or month, done whenever the learner chooses. */
  z.object({ type: z.literal('flexible'), times: z.number().int().min(1).max(31), per: z.enum(['week', 'month']) }),
]);
export type Recurrence = z.infer<typeof recurrenceSchema>;

/** Established cycles in which the material for a date is fixed world-wide. */
export const FIXED_CYCLES = [
  'dafYomi',
  'dafWeekly',
  'dirshuAmudYomi',
  'yerushalmi-vilna',
  'mishnaYomi',
  'perekYomi',
  'rambam1',
  'rambam3',
  'seferHaMitzvot',
  'dirshuDafHalacha',
  'kitzurShulchanAruch',
  'arukhHaShulchanYomi',
  'chofetzChaim',
  'shemiratHaLashon',
  'parasha',
  'nachYomi',
  'tanakhYomi',
  '929',
  'psalms',
  'tanyaYomi',
] as const;
export type FixedCycle = (typeof FIXED_CYCLES)[number];

/** Ordered texts a learner can walk through at their own pace. `custom` is plain numbered units. */
export const CURRICULA = ['custom', 'talmud', 'mishnah'] as const;
export type CurriculumId = (typeof CURRICULA)[number];

export const scheduleSchema = z.discriminatedUnion('kind', [
  /** The unit for a date is a pure function of the date; recurrence only chooses which days to show it. */
  z.object({ kind: z.literal('fixedCycle'), cycle: z.enum(FIXED_CYCLES), recurrence: recurrenceSchema.optional() }),
  /** Walks an ordered curriculum from a start point at N units per session. */
  z.object({
    kind: z.literal('sequential'),
    startDate: isoDate,
    curriculum: z.enum(CURRICULA).default('custom'),
    unitLabel: z.string().max(40),
    startUnit: z.number().int().min(1),
    unitsPerSession: z.number().int().min(1).max(100),
    /** Number of the last unit to study (inclusive). */
    totalUnits: z.number().int().min(1).optional(),
    recurrence: recurrenceSchema,
    /** `calendar`: a missed day is skipped. `completion`: the next session continues where the last finished. */
    advance: z.enum(['calendar', 'completion']).default('calendar'),
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
  notes: z.string().max(500).optional(),
  archived: z.boolean(),
  deleted: z.boolean(),
  hlc,
});
export type StudyTrack = z.infer<typeof trackSchema>;
/** A track as written by callers: fields with defaults may be omitted. */
export type StudyTrackInput = z.input<typeof trackSchema>;

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

export const membershipSchema = z.object({
  driveFileId: z.string().min(1),
  /** This user's id inside the group file; the same on all of their devices. */
  memberId: z.string().min(1),
  role: z.enum(['owner', 'member']),
  /** The local track whose progress is published to the group. */
  trackId: z.string().min(1),
  left: z.boolean(),
  hlc,
});
export type Membership = z.infer<typeof membershipSchema>;

/** The track a group studies together, copied into the shared file so joiners can adopt it. */
export const trackTemplateSchema = z.object({
  title: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  schedule: scheduleSchema,
  link: linkSchema,
});
export type TrackTemplate = z.infer<typeof trackTemplateSchema>;

export const groupRecordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('meta'),
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    description: z.string().max(300).optional(),
    /** Chosen by the owner; clients refuse to join a full group. */
    maxMembers: z.number().int().min(2).max(100).optional(),
    track: trackTemplateSchema,
    hlc,
  }),
  z.object({
    kind: z.literal('member'),
    displayName: z.string().min(1).max(60),
    /** Dates (within a bounded recent window) on which the member completed the group's track. */
    recent: z.record(isoDate, z.literal(true)).refine((r) => Object.keys(r).length <= 400),
    left: z.boolean(),
    hlc,
  }),
]);
export type GroupRecord = z.infer<typeof groupRecordSchema>;
export type GroupMeta = Extract<GroupRecord, { kind: 'meta' }>;
export type GroupMember = Extract<GroupRecord, { kind: 'member' }>;

const groupDocSchema = z.object({
  schemaVersion: z.number().int().min(1),
  records: z.record(z.string().max(80), groupRecordSchema).refine((r) => Object.keys(r).length <= 201),
});

/** Validate a shared group file. Its content is written by other people and is never trusted. */
export function parseGroupDoc(raw: unknown): RecordDoc<GroupRecord> {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) throw new SchemaTooNewError('group', version);
  return groupDocSchema.parse(raw);
}

function docSchema<T extends z.ZodTypeAny>(record: T) {
  return z.object({ schemaVersion: z.number().int().min(1), records: z.record(z.string(), record) });
}

const schemas = {
  manifest: docSchema(manifestRecordSchema),
  settings: docSchema(settingSchema),
  tracks: docSchema(trackSchema),
  progress: docSchema(progressSchema),
  groups: docSchema(membershipSchema),
};

export type DocKind = keyof typeof schemas;

/** Document names are also the Drive file names (plus `.json`). */
export function docKind(name: string): DocKind | null {
  if (name === 'manifest' || name === 'settings' || name === 'tracks' || name === 'groups') return name;
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
