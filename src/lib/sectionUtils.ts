import type { SongSection } from '@/types/song';

let uniqueIdCounter = 0;

/**
 * Generates a collision-safe unique ID even when invoked multiple times
 * within the same millisecond (e.g., when cloning multi-bar sections).
 */
export function generateUniqueId(prefix: string): string {
  uniqueIdCounter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now()}-${uniqueIdCounter}-${rand}`;
}

/**
 * Deep-clones a SongSection with fresh unique section and bar IDs
 * and appends `" (Copy)"` to the section name.
 */
export function cloneSongSection(section: SongSection): SongSection {
  return {
    ...section,
    id: generateUniqueId('sec'),
    name: `${section.name} (Copy)`,
    instruments: { ...section.instruments },
    bars: section.bars.map((bar) => ({
      ...bar,
      id: generateUniqueId('bar'),
      chords: [...bar.chords],
      melodyNotes: (bar.melodyNotes || []).map((note) => ({ ...note })),
    })),
  };
}

/**
 * Duplicates the section matching `sectionId` and inserts the cloned copy
 * immediately after the source section.
 */
export function duplicateSectionInList(
  sections: SongSection[],
  sectionId: string
): SongSection[] {
  const index = sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return sections;

  const cloned = cloneSongSection(sections[index]);
  const next = [...sections];
  next.splice(index + 1, 0, cloned);
  return next;
}

const VALID_THAI_CLUSTERS = new Set([
  'กร', 'ขร', 'คร', 'จร', 'ตร', 'ปร', 'พร', 'ศร', 'สร', 'ทร',
  'กล', 'ขล', 'คล', 'ปล', 'ผล', 'พล',
  'กว', 'ขว', 'คว',
  'หง', 'หญ', 'หณ', 'หน', 'หม', 'หย', 'หร', 'หล', 'หว',
  'อย',
]);

const THAI_LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);
const THAI_VOWEL_MARKS = new Set([
  'ะ', 'ั', 'า', 'ำ', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', '็', 'ๅ', 'ฤ', 'ฦ',
]);
const THAI_TONES = new Set(['่', '้', '๊', '๋']);

function isThaiConsonant(ch: string): boolean {
  return ch >= '\u0E01' && ch <= '\u0E2E';
}

function countThaiWordSyllables(rawWord: string): number {
  // Strip silent consonants marked with thanthakhat (การันต์), including optional short vowel above/below
  const w = rawWord
    .replace(/[\u0E01-\u0E2E][\u0E34\u0E38]?\u0E4C/g, '')
    .replace(/\u0E4C/g, '');
  if (!w) return 0;

  let vowelClusters = 0;
  let i = 0;

  while (i < w.length) {
    const ch = w[i];
    if (THAI_LEADING_VOWELS.has(ch)) {
      vowelClusters += 1;
      i += 1;
      while (i < w.length && isThaiConsonant(w[i])) {
        if (w[i] === 'อ' && i > 1) break;
        i += 1;
        if (i < w.length && (THAI_VOWEL_MARKS.has(w[i]) || THAI_TONES.has(w[i]))) break;
        if (
          i < w.length &&
          isThaiConsonant(w[i]) &&
          VALID_THAI_CLUSTERS.has(w[i - 1] + w[i])
        ) {
          i += 1;
        }
        break;
      }
      while (i < w.length && (THAI_VOWEL_MARKS.has(w[i]) || THAI_TONES.has(w[i]))) {
        i += 1;
      }
    } else if (THAI_VOWEL_MARKS.has(ch)) {
      vowelClusters += 1;
      i += 1;
      while (i < w.length && (THAI_VOWEL_MARKS.has(w[i]) || THAI_TONES.has(w[i]))) {
        i += 1;
      }
    } else {
      i += 1;
    }
  }

  const leadingConsonants: string[] = [];
  for (let k = 0; k < w.length; k += 1) {
    const ch = w[k];
    if (THAI_LEADING_VOWELS.has(ch) || THAI_VOWEL_MARKS.has(ch)) break;
    if (isThaiConsonant(ch)) leadingConsonants.push(ch);
  }

  if (vowelClusters === 0) {
    if (
      leadingConsonants.length >= 3 &&
      leadingConsonants[1] !== 'อ' &&
      !(leadingConsonants[1] === 'ร' && leadingConsonants[2] === 'ร') &&
      !VALID_THAI_CLUSTERS.has(leadingConsonants[0] + leadingConsonants[1])
    ) {
      return 2;
    }
    return 1;
  }

  const implicitPrefix =
    leadingConsonants.length >= 2 &&
    !VALID_THAI_CLUSTERS.has(leadingConsonants[0] + leadingConsonants[1])
      ? 1
      : 0;

  return Math.max(1, vowelClusters + implicitPrefix);
}

function countEnglishWordSyllables(rawWord: string): number {
  let w = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;

  if (w.endsWith('es') && !/(c|g|s|x|z|ch|sh)es$/.test(w)) {
    w = w.slice(0, -2);
  } else if (w.endsWith('ed') && !/(t|d)ed$/.test(w)) {
    w = w.slice(0, -2);
  } else if (w.endsWith('e') && !/[^aeiou]le$/.test(w)) {
    w = w.slice(0, -1);
  }

  w = w.replace(/^y/, '');
  const vowelGroups = w.match(/[aeiouy]+/g);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

function tokenizeMixedText(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    const tokens: string[] = [];
    for (const part of segmenter.segment(text)) {
      const seg = part.segment.trim();
      if (seg) tokens.push(seg);
    }
    return tokens;
  }

  return text.match(/[\u0E00-\u0E7F]+|[a-zA-Z']+/g) || [];
}

/**
 * Estimates syllable count across Thai and English lyric lines
 * by counting Thai vowel nuclei/word segments and English vowel groups.
 */
export function countThaiEnglishSyllables(text: string): number {
  if (!text || !text.trim()) return 0;

  const tokens = tokenizeMixedText(text);
  let total = 0;
  let lastThaiWordSyllables = 1;

  for (const token of tokens) {
    const hasThai = /[\u0E00-\u0E7F]/.test(token);
    const hasLatin = /[a-zA-Z]/.test(token);

    if (hasThai) {
      if (token === 'ๆ') {
        total += lastThaiWordSyllables;
        continue;
      }
      const hasYamok = token.endsWith('ๆ');
      const base = hasYamok ? token.slice(0, -1) : token;
      const count = countThaiWordSyllables(base);
      if (count > 0) {
        lastThaiWordSyllables = count;
        total += hasYamok ? count * 2 : count;
      }
    }

    if (hasLatin) {
      total += countEnglishWordSyllables(token);
    }
  }

  return total;
}

export const countSyllables = countThaiEnglishSyllables;
