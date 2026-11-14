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

export const PRESET_GROUPS: { title: (t: T) => string; presets: Preset[] }[] = [
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
    presets: [
      cycle('parasha', { when: 'perWeek', times: 1 }),
      cycle('nachYomi'),
      cycle('929'),
      cycle('tanakhYomi'),
      cycle('psalms'),
    ],
  },
  {
    title: (t) => t.catMussar,
    presets: [cycle('chofetzChaim'), cycle('shemiratHaLashon'), cycle('tanyaYomi')],
  },
  {
    title: (t) => t.catGeneral,
    presets: [
      { key: 'language', label: (t) => t.pLanguage, material: 'none', when: 'perWeek', times: 3 },
      { key: 'exam', label: (t) => t.pExam, material: 'units', when: 'weekly', daysOfWeek: [0, 1, 2, 3, 4], unitLabel: (t) => t.unitTopic },
      { key: 'book', label: (t) => t.pBook, material: 'units', when: 'perWeek', times: 2, unitLabel: (t) => t.unitChapter },
      { key: 'talk', label: (t) => t.pTalk, material: 'none', when: 'perWeek', times: 1 },
      { key: 'custom', label: (t) => t.pCustom, material: 'none', when: 'daily' },
    ],
  },
];

export function curriculumOf(material: Material): CurriculumId {
  return material === 'talmud' || material === 'mishnah' ? material : 'custom';
}
