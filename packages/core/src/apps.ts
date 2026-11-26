/** Where the user's own study apps live. Change here if either moves to another address. */
export const APP_BASE = {
  shasRadar: 'https://shas-radar.vercel.app',
  otVaOt: 'https://ot-va-ot.vercel.app',
} as const;

export type AppRef =
  | { kind: 'talmud'; /** Hebrew tractate name as the Talmud app spells it. */ tractate: string; daf: number; amud: 'a' | 'b' }
  | { kind: 'tanakh'; /** Hebrew book name as the Tanakh app spells it. */ book: string; chapter: number };

export interface AppLink {
  app: 'shasRadar' | 'otVaOt';
  url: string;
}

/** The 37 tractates of the Babylonian Talmud that Shas Radar contains. */
export const SHAS_TRACTATES: ReadonlySet<string> = new Set([
  'ברכות', 'שבת', 'עירובין', 'פסחים', 'ראש השנה', 'יומא', 'סוכה', 'ביצה', 'תענית', 'מגילה', 'מועד קטן', 'חגיגה',
  'יבמות', 'כתובות', 'נדרים', 'נזיר', 'סוטה', 'גיטין', 'קידושין', 'בבא קמא', 'בבא מציעא', 'בבא בתרא', 'סנהדרין',
  'מכות', 'שבועות', 'עבודה זרה', 'הוריות', 'זבחים', 'מנחות', 'חולין', 'בכורות', 'ערכין', 'תמורה', 'כריתות', 'מעילה',
  'תמיד', 'נדה',
]);

/** Calendar-library (English) book names → the Hebrew names the Tanakh app uses. */
const TANAKH_BOOKS: Record<string, string> = {
  Genesis: 'בראשית', Exodus: 'שמות', Leviticus: 'ויקרא', Numbers: 'במדבר', Deuteronomy: 'דברים',
  Joshua: 'יהושע', Judges: 'שופטים', 'I Samuel': 'שמואל א', 'II Samuel': 'שמואל ב', 'I Kings': 'מלכים א', 'II Kings': 'מלכים ב',
  Isaiah: 'ישעיהו', Jeremiah: 'ירמיהו', Ezekiel: 'יחזקאל', Hosea: 'הושע', Joel: 'יואל', Amos: 'עמוס', Obadiah: 'עובדיה',
  Jonah: 'יונה', Micah: 'מיכה', Nachum: 'נחום', Nahum: 'נחום', Habakkuk: 'חבקוק', Zephaniah: 'צפניה', Haggai: 'חגי',
  Zechariah: 'זכריה', Malachi: 'מלאכי', Psalms: 'תהילים', Proverbs: 'משלי', Job: 'איוב', 'Song of Songs': 'שיר השירים',
  Ruth: 'רות', Lamentations: 'איכה', Ecclesiastes: 'קהלת', Esther: 'אסתר', Daniel: 'דניאל', Ezra: 'עזרא', Nehemiah: 'נחמיה',
  'I Chronicles': 'דברי הימים א', 'II Chronicles': 'דברי הימים ב',
};

/** First chapter of each weekly portion (for a combined portion, the first of the two). */
const PARASHA_START: Record<string, [string, number]> = {
  Bereshit: ['Genesis', 1], Noach: ['Genesis', 6], 'Lech-Lecha': ['Genesis', 12], Vayera: ['Genesis', 18],
  'Chayei Sara': ['Genesis', 23], Toldot: ['Genesis', 25], Vayetzei: ['Genesis', 28], Vayishlach: ['Genesis', 32],
  Vayeshev: ['Genesis', 37], Miketz: ['Genesis', 41], Vayigash: ['Genesis', 44], Vayechi: ['Genesis', 47],
  Shemot: ['Exodus', 1], Vaera: ['Exodus', 6], Bo: ['Exodus', 10], Beshalach: ['Exodus', 13], Yitro: ['Exodus', 18],
  Mishpatim: ['Exodus', 21], Terumah: ['Exodus', 25], Tetzaveh: ['Exodus', 27], 'Ki Tisa': ['Exodus', 30],
  Vayakhel: ['Exodus', 35], Pekudei: ['Exodus', 38],
  Vayikra: ['Leviticus', 1], Tzav: ['Leviticus', 6], Shmini: ['Leviticus', 9], Tazria: ['Leviticus', 12],
  Metzora: ['Leviticus', 14], 'Achrei Mot': ['Leviticus', 16], Kedoshim: ['Leviticus', 19], Emor: ['Leviticus', 21],
  Behar: ['Leviticus', 25], Bechukotai: ['Leviticus', 26],
  Bamidbar: ['Numbers', 1], Nasso: ['Numbers', 4], "Beha'alotcha": ['Numbers', 8], "Sh'lach": ['Numbers', 13],
  Korach: ['Numbers', 16], Chukat: ['Numbers', 19], Balak: ['Numbers', 22], Pinchas: ['Numbers', 25],
  Matot: ['Numbers', 30], Masei: ['Numbers', 33],
  Devarim: ['Deuteronomy', 1], Vaetchanan: ['Deuteronomy', 3], Eikev: ['Deuteronomy', 7], "Re'eh": ['Deuteronomy', 11],
  Shoftim: ['Deuteronomy', 16], 'Ki Teitzei': ['Deuteronomy', 21], 'Ki Tavo': ['Deuteronomy', 26],
  Nitzavim: ['Deuteronomy', 29], Vayeilech: ['Deuteronomy', 31], "Ha'azinu": ['Deuteronomy', 32],
  'Vezot Haberakhah': ['Deuteronomy', 33],
};

export function talmudRef(hebrewTractate: string, daf: number, amud: 'a' | 'b' = 'a'): AppRef | null {
  return SHAS_TRACTATES.has(hebrewTractate) && Number.isInteger(daf) && daf >= 2 ? { kind: 'talmud', tractate: hebrewTractate, daf, amud } : null;
}

export function tanakhRef(englishBook: string, chapter: number): AppRef | null {
  const book = TANAKH_BOOKS[englishBook];
  return book && Number.isInteger(chapter) && chapter >= 1 ? { kind: 'tanakh', book, chapter } : null;
}

export function parashaRef(parasha: string): AppRef | null {
  const start = PARASHA_START[parasha];
  return start ? tanakhRef(start[0], start[1]) : null;
}

export function hasParashaStart(parasha: string): boolean {
  return parasha in PARASHA_START;
}

/** Links that open the day's page directly in the user's own apps. */
export function resolveAppLinks(session: { appRef?: AppRef }): AppLink[] {
  const ref = session.appRef;
  if (!ref) return [];
  return ref.kind === 'talmud'
    ? [{ app: 'shasRadar', url: `${APP_BASE.shasRadar}/#/daf/${encodeURIComponent(ref.tractate)}/${ref.daf}/${ref.amud}` }]
    : [{ app: 'otVaOt', url: `${APP_BASE.otVaOt}/#/read/${encodeURIComponent(ref.book)}/${ref.chapter}` }];
}
