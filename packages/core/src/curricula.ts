import { HDate, gematriya } from '@hebcal/core';
import { DafPage, DafYomi, DafYomiEvent, MishnaYomiEvent, MishnaYomiIndex, mishnaYomiStart } from '@hebcal/learning';
import type { CurriculumId } from './model';

export interface CurriculumUnit {
  section: string;
  sectionHe: string;
  /** Position within the section, e.g. "2" (daf) or "1:1" (chapter:mishna). */
  ref: string;
  refHe: string;
  url: string;
}

export interface CurriculumSection {
  name: string;
  nameHe: string;
  /** 1-based index of the section's first unit. */
  start: number;
  count: number;
}

export interface Curriculum {
  units: CurriculumUnit[];
  sections: CurriculumSection[];
}

function hebrewNumber(n: number): string {
  return gematriya(n).replace(/[׳״]/g, '');
}

function withSections(units: CurriculumUnit[]): Curriculum {
  const sections: CurriculumSection[] = [];
  units.forEach((u, i) => {
    const last = sections[sections.length - 1];
    if (last && last.name === u.section) last.count++;
    else sections.push({ name: u.section, nameHe: u.sectionHe, start: i + 1, count: 1 });
  });
  return { units, sections };
}

/** A Daf Yomi cycle began on 5 January 2020; one cycle lists every daf of the Talmud in order. */
function buildTalmud(): Curriculum {
  const units: CurriculumUnit[] = [];
  const start = new HDate(new Date(2020, 0, 5)).abs();
  for (let i = 0; i < 4000; i++) {
    const hd = new HDate(start + i);
    const daf = new DafYomi(hd);
    const name = daf.getName();
    const blatt = daf.getBlatt();
    if (i > 0 && name === units[0]!.section && String(blatt) === units[0]!.ref) break;
    const he = new DafPage(name, blatt).render('he').replace(/[\u0591-\u05C7]/g, ''); // a few names come with vowel marks
    const cut = he.lastIndexOf(' דף ');
    units.push({
      section: name,
      sectionHe: cut > 0 ? he.slice(0, cut) : name,
      ref: String(blatt),
      refHe: cut > 0 ? he.slice(cut + 4) : String(blatt),
      url: new DafYomiEvent(hd).url() ?? '',
    });
  }
  return withSections(units);
}

/** One Mishna Yomi cycle lists every mishna in order, two per day. */
function buildMishnah(): Curriculum {
  const units: CurriculumUnit[] = [];
  const index = new MishnaYomiIndex();
  let first = '';
  for (let i = 0; i < 4000; i++) {
    const hd = new HDate(mishnaYomiStart + i);
    const pair = index.lookup(hd);
    const key = `${pair[0]!.k} ${pair[0]!.v}`;
    if (i === 0) first = key;
    else if (key === first) break;
    for (const m of pair) {
      const he = new MishnaYomiEvent(hd, [m, m]).render('he');
      const [chapter, mishna] = m.v.split(':');
      units.push({
        section: m.k,
        sectionHe: he.slice(0, he.lastIndexOf(' ')),
        ref: m.v,
        // Hebrew numerals without the geresh marks, e.g. "א, ב" for chapter 1 mishna 2.
        refHe: `${hebrewNumber(Number(chapter))}, ${hebrewNumber(Number(mishna))}`,
        url: `https://www.sefaria.org/Mishnah_${m.k.replace(/ /g, '_')}.${chapter}.${mishna}?lang=bi`,
      });
    }
  }
  return withSections(units);
}

const cache = new Map<CurriculumId, Curriculum>();

/** Built lazily from the calendar library's own cycle tables, so no text lists are shipped. */
export function getCurriculum(id: CurriculumId): Curriculum | null {
  if (id === 'custom') return null;
  let c = cache.get(id);
  if (!c) {
    c = id === 'talmud' ? buildTalmud() : buildMishnah();
    cache.set(id, c);
  }
  return c;
}
