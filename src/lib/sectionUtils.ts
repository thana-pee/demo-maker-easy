import type { SongBar, SongProject, SongSection } from '@/types/song';
import { segmentThaiWordToSyllables } from './thaiRhymeHelper';

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

const THAI_VOWEL_MARKS = new Set([
  'ะ', 'ั', 'า', 'ำ', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', '็', 'ๅ', 'ฤ', 'ฦ',
]);
const THAI_TONES = new Set(['่', '้', '๊', '๋']);

function countThaiWordSyllables(rawWord: string): number {
  // Strip silent consonants marked with thanthakhat (การันต์), including optional short vowel above/below
  const w = rawWord
    .replace(/[\u0E01-\u0E2E][\u0E34\u0E38]?\u0E4C/g, '')
    .replace(/\u0E4C/g, '');
  if (!w) return 0;

  const segments = segmentThaiWordToSyllables(w);
  if (segments.length === 0) return 0;

  let count = 0;
  for (const seg of segments) {
    count += 1;
    // อักษรนำที่มีสระหน้าควบ (เช่น เสมอ, เฉลย, แสดง, แสวง) ถูกเก็บไว้เป็น 1 ชิ้นเพื่อคงสระสำหรับวิเคราะห์สัมผัส
    const pseudoMatch = seg.match(/^[เแโใไ]([\u0E01-\u0E2E])([\u0E01-\u0E2E])(.+)/);
    if (pseudoMatch) {
      const pair = pseudoMatch[1] + pseudoMatch[2];
      const tail = pseudoMatch[3];
      const firstTail = tail[0] ?? '';
      if (
        !VALID_THAI_CLUSTERS.has(pair) &&
        tail !== 'ร' &&
        !THAI_VOWEL_MARKS.has(firstTail) &&
        !THAI_TONES.has(firstTail)
      ) {
        count += 1;
      }
    }
  }
  return Math.max(1, count);
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

/**
 * แบ่งเนื้อร้องที่ผู้ใช้พิมพ์/วางยาวๆ (หลายบรรทัดหรือคั่นด้วย / ) ลงในช่องเนื้อร้องของแต่ละห้อง
 * โดยคงข้อมูลคอร์ด, chordsPerBar, playStyle, melodyNotes และ vocalAudio ของแต่ละห้องไว้ครบ 100%
 */
export function splitLyricsToSectionBars(
  rawText: string,
  existingBars: SongBar[]
): SongBar[] {
  if (existingBars.length === 0) return existingBars;

  const trimmed = rawText.trim();
  if (!trimmed) return existingBars;

  let lines = trimmed
    .split(/\r?\n+/)
    .flatMap((line) => {
      const part = line.trim();
      if (!part) return [];
      // รองรับกรณีผสมขึ้นบรรทัดใหม่ + คั่นด้วย " / " หรือ "|" ในบรรทัดเดียวกัน
      if (/\s+[/|]\s+|\s*\|\s*/.test(part)) {
        return part
          .split(/\s*[/|]\s*/)
          .map((seg) => seg.trim())
          .filter(Boolean);
      }
      return [part];
    });

  if (lines.length === 1 && existingBars.length > 1) {
    const slashSplit = trimmed
      .split(/\s*[/|]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (slashSplit.length > 1) {
      lines = slashSplit;
    } else {
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length >= existingBars.length) {
        const chunked: string[] = [];
        const baseCount = Math.floor(words.length / existingBars.length);
        let remainder = words.length % existingBars.length;
        let cursor = 0;

        for (let b = 0; b < existingBars.length; b += 1) {
          const take = baseCount + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          chunked.push(words.slice(cursor, cursor + take).join(' '));
          cursor += take;
        }
        lines = chunked.filter(Boolean);
      }
    }
  }

  return existingBars.map((bar, idx) => {
    if (idx < lines.length - 1 || (idx === lines.length - 1 && lines.length <= existingBars.length)) {
      return { ...bar, lyrics: lines[idx] };
    }
    if (idx === existingBars.length - 1 && lines.length > existingBars.length) {
      return { ...bar, lyrics: lines.slice(idx).join(' ') };
    }
    return bar;
  });
}

/**
 * ปัดคำหรือพยางค์สุดท้ายจาก `bars[fromBarIndex].lyrics` ไปวางไว้หน้าสุดของ `bars[fromBarIndex + 1].lyrics`
 * โดยคงข้อมูลคอร์ด, chordsPerBar, playStyle, melodyNotes และ vocalAudio ของทุกห้องไว้ครบถ้วน
 */
export function shiftLastTokenToNextBar(bars: SongBar[], fromBarIndex: number): SongBar[] {
  const cloneBars = (source: SongBar[]): SongBar[] =>
    source.map((bar) => ({
      ...bar,
      chords: [...bar.chords],
      melodyNotes: (bar.melodyNotes || []).map((note) => ({ ...note })),
    }));

  if (fromBarIndex < 0 || fromBarIndex >= bars.length - 1) {
    return cloneBars(bars);
  }

  const currentLyrics = (bars[fromBarIndex].lyrics ?? '').trim();
  if (!currentLyrics) {
    return cloneBars(bars);
  }

  let headText = '';
  let shiftedToken = '';

  const spaceTokens = currentLyrics.split(/\s+/).filter(Boolean);
  if (spaceTokens.length >= 2) {
    const lastChunk = spaceTokens[spaceTokens.length - 1];
    const prefix = spaceTokens.slice(0, -1).join(' ');
    if (countThaiEnglishSyllables(lastChunk) > 2) {
      const syllables = segmentThaiWordToSyllables(lastChunk).filter((s) => s.trim().length > 0);
      if (syllables.length >= 2) {
        shiftedToken = syllables[syllables.length - 1];
        headText = `${prefix} ${syllables.slice(0, -1).join('')}`;
      } else {
        shiftedToken = lastChunk;
        headText = prefix;
      }
    } else {
      shiftedToken = lastChunk;
      headText = prefix;
    }
  } else {
    const syllables = segmentThaiWordToSyllables(currentLyrics).filter((s) => s.trim().length > 0);
    if (syllables.length < 2) {
      return cloneBars(bars);
    }
    shiftedToken = syllables[syllables.length - 1];
    headText = syllables.slice(0, -1).join('');
  }

  const nextLyrics = (bars[fromBarIndex + 1].lyrics ?? '').trim();
  const mergedNextLyrics = nextLyrics ? `${shiftedToken} ${nextLyrics}` : shiftedToken;

  const cloned = cloneBars(bars);
  cloned[fromBarIndex] = {
    ...cloned[fromBarIndex],
    lyrics: headText,
  };
  cloned[fromBarIndex + 1] = {
    ...cloned[fromBarIndex + 1],
    lyrics: mergedNextLyrics,
  };

  return cloned;
}

export interface SectionTtsTextPlan {
  text: string;
  wasTruncated: boolean;
  includedBarsCount: number;
  omittedBarsCount: number;
  fullCharCount: number;
}

/**
 * สร้างข้อความสำหรับส่งเข้า Gemini TTS โดยจำกัดไม่เกิน maxChars (ค่าเริ่มต้น 240 ตัวอักษร)
 * แต่ตัดแบ่งบนขอบเขตห้อง (bar boundary) หรือขอบเขตคำ (Intl.Segmenter) เพื่อไม่ให้คำขาดครึ่ง
 */
export function buildSectionTtsTextPlan(
  bars: SongBar[],
  maxChars = 240,
  separator = '\n'
): SectionTtsTextPlan {
  const cap = Math.max(20, Math.floor(maxChars));
  const lines = bars.map((b) => (b.lyrics ?? '').trim()).filter(Boolean);
  if (lines.length === 0) {
    return {
      text: '',
      wasTruncated: false,
      includedBarsCount: 0,
      omittedBarsCount: 0,
      fullCharCount: 0,
    };
  }

  const fullText = lines.join(separator);
  if (fullText.length <= cap) {
    return {
      text: fullText,
      wasTruncated: false,
      includedBarsCount: lines.length,
      omittedBarsCount: 0,
      fullCharCount: fullText.length,
    };
  }

  const chosenLines: string[] = [];
  let runningLength = 0;

  for (const line of lines) {
    const sepLen = chosenLines.length > 0 ? separator.length : 0;
    if (runningLength + sepLen + line.length <= cap) {
      chosenLines.push(line);
      runningLength += sepLen + line.length;
    } else {
      break;
    }
  }

  if (chosenLines.length > 0) {
    return {
      text: chosenLines.join(separator),
      wasTruncated: true,
      includedBarsCount: chosenLines.length,
      omittedBarsCount: lines.length - chosenLines.length,
      fullCharCount: fullText.length,
    };
  }

  // กรณีที่เพียงแค่ 1 ห้องแรกก็เกิน cap แล้ว ให้ตัดตามขอบเขตคำภาษาไทย (Intl.Segmenter)
  const firstLine = lines[0];
  let safeWordSlice = '';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('th', { granularity: 'word' });
    for (const part of seg.segment(firstLine)) {
      if (safeWordSlice.length + part.segment.length <= cap) {
        safeWordSlice += part.segment;
      } else {
        break;
      }
    }
  } else {
    const tokens = firstLine.split(/\s+/);
    for (const token of tokens) {
      const candidate = safeWordSlice ? `${safeWordSlice} ${token}` : token;
      if (candidate.length <= cap) {
        safeWordSlice = candidate;
      } else {
        break;
      }
    }
  }

  const finalSlice = (safeWordSlice.trim() || Array.from(firstLine).slice(0, cap).join('')).trim();
  return {
    text: finalSlice,
    wasTruncated: true,
    includedBarsCount: 1,
    omittedBarsCount: lines.length - 1,
    fullCharCount: fullText.length,
  };
}

// ───────── Phase 8E: History Fingerprint, Coalesced Undo & Non-Destructive Presets ─────────

export const HISTORY_COALESCE_WINDOW_MS = 1200;

export interface CoalescedUndoState {
  undoStack: SongProject[];
  lastKey: string | null;
  lastAtMs: number;
}

/**
 * สร้าง Fingerprint ของ SongProject สำหรับระบบ Undo/Redo และ Save tracking
 * รวมข้อมูลเสียงร้อง (lightweight signature ของ vocalTakes / vocalAudio), Mixer และ Guitar Acoustics
 */
export function buildSongHistoryFingerprint(s: SongProject): string {
  const compactSections = s.sections.map((sec) => ({
    ...sec,
    bars: sec.bars.map((bar) => ({
      ...bar,
      vocalAudio: bar.vocalAudio
        ? `${bar.vocalAudio.length}:${bar.vocalAudio.slice(0, 24)}`
        : '',
    })),
  }));

  const compactTakes = (s.vocalTakes || []).map((t) => ({
    id: t.id,
    name: t.name,
    scope: t.scope,
    source: t.source ?? 'mic',
    sectionId: t.sectionId ?? '',
    startGlobalBarIndex: t.startGlobalBarIndex,
    endGlobalBarIndex: t.endGlobalBarIndex ?? t.startGlobalBarIndex,
    preRollOffsetSec: t.preRollOffsetSec ?? 0,
    latencyOffsetMs: t.latencyOffsetMs ?? 0,
    fxPreset: t.fxPreset,
    isActive: Boolean(t.isActive),
    audioLen: t.audioDataUrl?.length ?? 0,
  }));

  return JSON.stringify({
    title: s.title,
    bpm: s.bpm,
    timeSignature: s.timeSignature,
    baseKey: s.baseKey,
    transposeSemitones: s.transposeSemitones,
    capoFret: s.capoFret,
    countInEnabled: Boolean(s.countInEnabled),
    metronomeEnabled: Boolean(s.metronomeEnabled),
    guitarModel: s.guitarModel,
    stringGauge: s.stringGauge,
    ambience3D: s.ambience3D,
    vocalLatencyOffsetMs: s.vocalLatencyOffsetMs ?? 0,
    folder: s.folder ?? '',
    statusTag: s.statusTag ?? '',
    sections: compactSections,
    mixer: s.mixer,
    vocalTakes: compactTakes,
    thaiGenre: s.thaiGenre,
    songwriterStyle: s.songwriterStyle,
    emotionalResolution: s.emotionalResolution,
  });
}

/**
 * อนุมานคีย์สำหรับจัดกลุ่ม (Coalesce) การแก้ไขต่อเนื่องที่เกิดภายใน 1.2 วินาที (เช่น การพิมพ์เนื้อร้อง หรือการลาก Slider BPM/Mixer)
 */
export function inferHistoryCoalesceKey(
  prev: SongProject,
  next: SongProject,
  explicitKey?: string
): string {
  if (explicitKey) return explicitKey;

  if (prev.title !== next.title && prev.sections.length === next.sections.length && prev.bpm === next.bpm) {
    return 'title';
  }
  if (prev.bpm !== next.bpm && prev.title === next.title && prev.sections === next.sections) {
    return 'bpm';
  }
  if (
    prev.mixer !== next.mixer &&
    JSON.stringify(prev.mixer) !== JSON.stringify(next.mixer) &&
    prev.sections === next.sections &&
    prev.bpm === next.bpm
  ) {
    return 'mixer';
  }

  if (prev.sections.length === next.sections.length) {
    let diffSectionId: string | null = null;
    let diffBarId: string | null = null;
    let nonLyricChange = false;
    let diffBarCount = 0;

    for (let sIdx = 0; sIdx < prev.sections.length; sIdx++) {
      const ps = prev.sections[sIdx];
      const ns = next.sections[sIdx];
      if (ps === ns) continue;
      if (ps.id !== ns.id || ps.bars.length !== ns.bars.length) {
        nonLyricChange = true;
        break;
      }
      for (let bIdx = 0; bIdx < ps.bars.length; bIdx++) {
        const pb = ps.bars[bIdx];
        const nb = ns.bars[bIdx];
        if (pb === nb) continue;
        if (
          pb.id !== nb.id ||
          pb.lyrics === nb.lyrics ||
          pb.playStyle !== nb.playStyle ||
          pb.vocalAudio !== nb.vocalAudio ||
          JSON.stringify(pb.chords) !== JSON.stringify(nb.chords)
        ) {
          nonLyricChange = true;
          break;
        }
        diffBarCount++;
        diffSectionId = ps.id;
        diffBarId = pb.id;
      }
      if (nonLyricChange || diffBarCount > 1) break;
    }

    if (!nonLyricChange && diffBarCount === 1 && diffSectionId && diffBarId) {
      return `lyrics:${diffSectionId}:${diffBarId}`;
    }
  }

  return 'structural';
}

/**
 * บันทึก Snapshot เข้า Undo Stack โดยจัดกลุ่มการแก้ต่อเนื่องที่ตรงเงื่อนไขภายใน `HISTORY_COALESCE_WINDOW_MS` (1,200ms)
 */
export function pushCoalescedUndoHistory(
  state: CoalescedUndoState,
  prev: SongProject,
  next: SongProject,
  nowMs = Date.now(),
  explicitKey?: string,
  maxHistory = 30
): { pushed: boolean; coalesced: boolean; state: CoalescedUndoState } {
  if (buildSongHistoryFingerprint(prev) === buildSongHistoryFingerprint(next)) {
    return { pushed: false, coalesced: false, state };
  }

  const key = inferHistoryCoalesceKey(prev, next, explicitKey);
  const isCoalescable = key !== 'structural';
  const withinWindow =
    isCoalescable &&
    state.undoStack.length > 0 &&
    state.lastKey === key &&
    nowMs - state.lastAtMs <= HISTORY_COALESCE_WINDOW_MS;

  if (withinWindow) {
    return {
      pushed: false,
      coalesced: true,
      state: {
        undoStack: state.undoStack,
        lastKey: key,
        lastAtMs: nowMs,
      },
    };
  }

  const snapshot = structuredClone(prev);
  const nextStack = [...state.undoStack, snapshot].slice(-maxHistory);
  return {
    pushed: true,
    coalesced: false,
    state: {
      undoStack: nextStack,
      lastKey: isCoalescable ? key : null,
      lastAtMs: nowMs,
    },
  };
}

/**
 * นำชุดคอร์ดจากสูตรสำเร็จ (Progression Preset) มาสวมใส่ท่อนเพลงโดยไม่ทำลายเนื้อร้อง เมโลดี้ หรือเสียงร้องที่มีอยู่
 * หากท่อนมีห้องน้อยกว่าชุดคอร์ดจะเพิ่มห้องใหม่ให้ครบ และหากท่อนมีห้องมากกว่าจะวนชุดคอร์ดให้ครบทุกห้อง
 */
export function applyProgressionPresetToSection(
  section: SongSection,
  presetChords: string[]
): SongSection {
  if (!presetChords || presetChords.length === 0) return section;

  const targetCount = Math.max(section.bars.length, presetChords.length);
  const nextBars: SongBar[] = [];

  for (let idx = 0; idx < targetCount; idx++) {
    const chord = presetChords[idx % presetChords.length] || 'C';
    const existingBar = section.bars[idx];
    if (existingBar) {
      nextBars.push({
        ...existingBar,
        chordsPerBar: 1,
        chords: [chord],
      });
    } else {
      nextBars.push({
        id: generateUniqueId('bar'),
        chordsPerBar: 1,
        chords: [chord],
        playStyle: 'normal',
        lyrics: '',
        melodyNotes: [],
      });
    }
  }

  return {
    ...section,
    bars: nextBars,
  };
}
