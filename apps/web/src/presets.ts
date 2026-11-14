import type { CurriculumId, FixedCycle } from '@kavanu/core';
import type { strings } from './i18n';

type T = (typeof strings)['en'];

export type Material = 'cycle' | 'talmud' | 'mishnah' | 'units' | 'none';
export type When = 'daily' | 'weekly' | 'monthly' | 'perWeek' | 'perMonth';

/** Starting values for the track form; everything stays editable afterwards. */
export interface Preset {
  key: string;
  /** Either an established cycle (named from the cycle table) or a label from the strings. */
  cycle?: FixedCycle;
  label?: (t: T) => string;
  material: Material;
  when?: When;
  times?: number;
  daysOfWeek?: number[];
  unitLabel?: (t: T) => string;
  totalUnits?: number;
  urlTemplate?: string;
}

const cycle = (c: FixedCycle, extra: Partial<Preset> = {}): Preset => ({ key: c, cycle: c, material: 'cycle', when: 'daily', ...extra });

interface PresetGroup {
  title: (t: T) => string;
  presets: Preset[];
}

/** Top-level fields. A category with `groups` shows them as tabs so only one list is visible at a time. */
export interface Category {
  key: string;
  title: (t: T) => string;
  groups?: PresetGroup[];
  presets?: Preset[];
}

const named = (key: string, label: (t: T) => string, extra: Partial<Preset> = {}): Preset => ({
  key,
  label,
  material: 'none',
  when: 'perWeek',
  times: 2,
  ...extra,
});

const JUDAISM: PresetGroup[] = [
  {
    title: (t) => t.catTalmud,
    presets: [
      cycle('dafYomi'),
      { key: 'talmudOwn', label: (t) => t.pTalmudOwn, material: 'talmud', when: 'perWeek', times: 2 },
      cycle('dirshuAmudYomi'),
      cycle('dafWeekly'),
      cycle('yerushalmi-vilna'),
    ],
  },
  {
    title: (t) => t.catMishnah,
    presets: [
      cycle('mishnaYomi'),
      { key: 'mishnahOwn', label: (t) => t.pMishnahOwn, material: 'mishnah', when: 'perWeek', times: 2 },
      cycle('perekYomi'),
    ],
  },
  {
    title: (t) => t.catHalacha,
    presets: [
      cycle('dirshuDafHalacha'),
      cycle('kitzurShulchanAruch'),
      {
        key: 'kitzurOwn',
        label: (t) => t.pKitzurOwn,
        material: 'units',
        when: 'perWeek',
        times: 2,
        unitLabel: (t) => t.unitSiman,
        totalUnits: 221,
        urlTemplate: 'https://www.sefaria.org/Kitzur_Shulchan_Arukh.{firstUnit}?lang=bi',
      },
      {
        key: 'mbOwn',
        label: (t) => t.pMishnahBeruraOwn,
        material: 'units',
        when: 'perWeek',
        times: 2,
        unitLabel: (t) => t.unitSiman,
        totalUnits: 697,
        urlTemplate: 'https://www.sefaria.org/Mishnah_Berurah.{firstUnit}?lang=bi',
      },
      cycle('arukhHaShulchanYomi'),
      cycle('rambam1'),
      cycle('rambam3'),
      cycle('seferHaMitzvot'),
    ],
  },
  {
    title: (t) => t.catTanakh,
    presets: [cycle('parasha', { when: 'perWeek', times: 1 }), cycle('nachYomi'), cycle('929'), cycle('tanakhYomi'), cycle('psalms')],
  },
  {
    title: (t) => t.catMussar,
    presets: [cycle('chofetzChaim'), cycle('shemiratHaLashon'), cycle('tanyaYomi')],
  },
];

export const CATEGORIES: Category[] = [
  { key: 'judaism', title: (t) => t.catJudaism, groups: JUDAISM },
  {
    key: 'languages',
    title: (t) => t.catLanguages,
    presets: [
      named('english', (t) => t.pEnglish, { times: 3 }),
      named('hebrew', (t) => t.pHebrew, { times: 3 }),
      named('arabic', (t) => t.pArabic, { times: 3 }),
      named('spanish', (t) => t.pSpanish, { times: 3 }),
      named('french', (t) => t.pFrench, { times: 3 }),
      named('language', (t) => t.pOtherLanguage, { times: 3 }),
    ],
  },
  {
    key: 'studies',
    title: (t) => t.catStudies,
    presets: [
      named('exam', (t) => t.pExam, { material: 'units', when: 'weekly', daysOfWeek: [0, 1, 2, 3, 4], unitLabel: (t) => t.unitTopic }),
      named('course', (t) => t.pCourse, { material: 'units', unitLabel: (t) => t.unitLesson }),
      named('homework', (t) => t.pHomework, { when: 'weekly', daysOfWeek: [0, 1, 2, 3, 4] }),
    ],
  },
  {
    key: 'reading',
    title: (t) => t.catReading,
    presets: [named('book', (t) => t.pBook, { material: 'units', unitLabel: (t) => t.unitChapter })],
  },
  {
    key: 'meetings',
    title: (t) => t.catMeetings,
    presets: [named('talk', (t) => t.pTalk, { times: 1 }), named('chavruta', (t) => t.pChavruta, { times: 1 })],
  },
  { key: 'other', title: (t) => t.catOther, presets: [named('custom', (t) => t.pCustom, { when: 'daily' })] },
];

export function curriculumOf(material: Material): CurriculumId {
  return material === 'talmud' || material === 'mishnah' ? material : 'custom';
}
