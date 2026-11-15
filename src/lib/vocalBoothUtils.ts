import { FlatBar, flattenSong, getTiming } from '@/lib/barPlanner';
import { SongProject, VocalFxPreset, VocalTake } from '@/types/song';

export const MIN_VOCAL_LATENCY_MS = -150;
export const MAX_VOCAL_LATENCY_MS = 250;
export const AUTO_DUCK_GAIN_MULTIPLIER = 0.79; // ~ -2 dB on backing rhythm guitar & piano when lead vocal is active

export const VOCAL_FX_PRESETS: ReadonlyArray<{
  id: VocalFxPreset;
  labelTh: string;
  labelEn: string;
  descTh: string;
  descEn: string;
}> = [
  {
    id: 'dry-natural',
    labelTh: 'Dry Natural',
    labelEn: 'Dry Natural',
    descTh: 'เสียงใสธรรมชาติ (HPF 95Hz + Comp เบา)',
    descEn: 'Clean natural mic (HPF 95Hz + light comp)',
  },
  {
    id: 'studio-warm',
    labelTh: 'Studio Warm',
    labelEn: 'Studio Warm',
    descTh: 'อุ่นแน่นแบบห้องอัด (+Presence + Warmth + Comp 4:1)',
    descEn: 'Warm studio presence & controlled dynamics',
  },
  {
    id: 'wide-chorus',
    labelTh: 'Wide Chorus',
    labelEn: 'Wide Chorus',
    descTh: 'เสียงกว้างมีมิติสเตอริโอสำหรับท่อนฮุค',
    descEn: 'Wide stereo micro-delay shine for hooks',
  },
];

export interface SectionBarRange {
  startGlobalBarIndex: number;
  endGlobalBarIndex: number;
  barCount: number;
  sectionName: string;
}

export interface PreRollPlaybackPlan {
  targetStartBarIndex: number;
  targetEndBarIndex: number;
  playbackStartBarIndex: number;
  preRollBarsCount: number;
  preRollMode: 'none' | 'count-in' | 'backing-bar';
  preRollOffsetSec: number;
  barSec: number;
  useCountIn: boolean;
}

export interface TakePlaybackSlice {
  shouldPlay: boolean;
  delaySec: number;
  bufferOffsetSec: number;
  targetSpanSec: number;
}

export interface VocalTakeBarSpan {
  startGlobalBarIndex: number;
  endGlobalBarIndex: number;
}

export interface VocalTakePlaybackPlan extends TakePlaybackSlice {
  playbackRate: number;
  isAiTts: boolean;
  stopAfterDelaySec: number | null;
  fadeOutStartDelaySec: number | null;
  fadeOutDurationSec: number;
}

/** ระบุว่าเทคนี้เป็นเสียงไกด์ AI TTS (ใช้ time-fit + clamp ขอบท่อน) หรือเสียงไมโครโฟนจริง */
export function isAiTtsVocalTake(take: Pick<VocalTake, 'source' | 'name'>): boolean {
  if (take.source === 'ai-tts') return true;
  if (take.source === 'mic') return false;
  return /\(AI Guide\)$/i.test(take.name);
}

/**
 * คำนวณช่วง Global Bar ปัจจุบันของเทคเสียงร้อง โดยติดตาม sectionId แบบไดนามิก
 * เมื่อมีการเพิ่ม/ลบบาร์หรือย้ายลำดับท่อนหลังอัดเสียงไปแล้ว
 */
export function resolveVocalTakeBarSpan(
  song: SongProject,
  take: Pick<VocalTake, 'scope' | 'sectionId' | 'startGlobalBarIndex' | 'endGlobalBarIndex'>
): VocalTakeBarSpan | null {
  const flat = flattenSong(song);
  if (flat.length === 0) return null;

  if (take.scope === 'section' && take.sectionId) {
    const matching = flat.filter((f) => f.section.id === take.sectionId);
    if (matching.length === 0) return null;
    const secStart = matching[0].index;
    const secEnd = matching[matching.length - 1].index;
    const secLen = matching.length;
    const takeLen =
      take.endGlobalBarIndex !== undefined
        ? Math.max(1, take.endGlobalBarIndex - take.startGlobalBarIndex + 1)
        : secLen;

    // 1) กรณีมาตรฐานหรือทั้งท่อนย้ายตำแหน่งหลังเพิ่ม/ลบบาร์ในท่อนอื่น (ความยาวท่อนยังคงเท่าเดิม)
    if (takeLen === secLen) {
      return { startGlobalBarIndex: secStart, endGlobalBarIndex: secEnd };
    }
    // 2) กรณีเพิ่ม/ลบบาร์ภายในท่อนนี้เองโดยจุดเริ่มต้นยังตรงหัวท่อนเดิม (คงความยาวเท่าท่อนปัจจุบันหรือตามไฟล์เดิมไม่ให้หลุด)
    if (take.startGlobalBarIndex === secStart) {
      return {
        startGlobalBarIndex: secStart,
        endGlobalBarIndex: Math.min(secEnd, secStart + takeLen - 1),
      };
    }
    // 3) กรณีระบุช่วงบาร์จำเพาะแบบย่อย/ฟิกซ์เจอร์ทดสอบที่ไม่ได้ครอบทั้งท่อน
  }

  const startGlobalBarIndex = Math.max(0, Math.min(flat.length - 1, take.startGlobalBarIndex));
  const endGlobalBarIndex =
    take.endGlobalBarIndex !== undefined
      ? Math.min(flat.length - 1, Math.max(startGlobalBarIndex, take.endGlobalBarIndex))
      : flat.length - 1;

  return { startGlobalBarIndex, endGlobalBarIndex };
}

/** จำกัดค่าชดเชยเวลาไมโครโฟนให้อยู่ในช่วง -150ms ถึง +250ms */
export function clampVocalLatencyMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(MIN_VOCAL_LATENCY_MS, Math.min(MAX_VOCAL_LATENCY_MS, Math.round(ms)));
}

/** คำนวณช่วง Global Bar Index สำหรับขอบเขตการอัด (ทั้งเพลง หรือ เฉพาะท่อน) */
export function getSectionBarRange(
  song: SongProject,
  scope: 'full-song' | 'section',
  sectionId?: string
): SectionBarRange {
  const flat = flattenSong(song);
  if (flat.length === 0) {
    return {
      startGlobalBarIndex: 0,
      endGlobalBarIndex: 0,
      barCount: 0,
      sectionName: song.title || 'Song',
    };
  }

  if (scope === 'section' && sectionId) {
    const matching = flat.filter((f) => f.section.id === sectionId);
    if (matching.length > 0) {
      return {
        startGlobalBarIndex: matching[0].index,
        endGlobalBarIndex: matching[matching.length - 1].index,
        barCount: matching.length,
        sectionName: matching[0].section.name,
      };
    }
  }

  return {
    startGlobalBarIndex: 0,
    endGlobalBarIndex: flat.length - 1,
    barCount: flat.length,
    sectionName: song.title || 'Full Song',
  };
}

/**
 * วางแผน Pre-Roll 1 ห้องก่อนเริ่มอัดจริง:
 * - ถ้าอัดกลางเพลง (bar > 0) และเปิด Pre-Roll: ถอยเครื่องดนตรีไปเล่น 1 ห้องก่อนหน้าโดยอัตโนมัติ
 * - ถ้าเริ่มที่ bar 0 และเปิด Pre-Roll: ใช้เสียงเคาะ Count-In 1 ห้องก่อนเข้าห้องแรก
 */
export function computePreRollPlaybackPlan(
  song: SongProject,
  scope: 'full-song' | 'section',
  sectionId?: string,
  usePreRoll = true
): PreRollPlaybackPlan {
  const range = getSectionBarRange(song, scope, sectionId);
  const { barSec } = getTiming(song);

  if (!usePreRoll || range.barCount === 0) {
    return {
      targetStartBarIndex: range.startGlobalBarIndex,
      targetEndBarIndex: range.endGlobalBarIndex,
      playbackStartBarIndex: range.startGlobalBarIndex,
      preRollBarsCount: 0,
      preRollMode: 'none',
      preRollOffsetSec: 0,
      barSec,
      useCountIn: false,
    };
  }

  if (range.startGlobalBarIndex > 0) {
    return {
      targetStartBarIndex: range.startGlobalBarIndex,
      targetEndBarIndex: range.endGlobalBarIndex,
      playbackStartBarIndex: range.startGlobalBarIndex - 1,
      preRollBarsCount: 1,
      preRollMode: 'backing-bar',
      preRollOffsetSec: barSec,
      barSec,
      useCountIn: false,
    };
  }

  return {
    targetStartBarIndex: 0,
    targetEndBarIndex: range.endGlobalBarIndex,
    playbackStartBarIndex: 0,
    preRollBarsCount: 1,
    preRollMode: 'count-in',
    preRollOffsetSec: barSec,
    barSec,
    useCountIn: true,
  };
}

/**
 * คำนวณจุดเริ่มต้นเล่น (delaySec) และจุดตัดในไฟล์เสียง (bufferOffsetSec)
 * สำหรับ VocalTake ต่อเนื่อง ไม่ว่าผู้ใช้จะกด Play จากห้องแรกหรือ Seek มากลางเพลง
 */
export function computeTakePlaybackSlice(
  song: SongProject,
  take: VocalTake,
  fromGlobalBarIndex: number,
  globalLatencyFallbackMs = 0
): TakePlaybackSlice {
  const span = resolveVocalTakeBarSpan(song, take);
  if (!span) {
    return { shouldPlay: false, delaySec: 0, bufferOffsetSec: 0, targetSpanSec: 0 };
  }

  const { startGlobalBarIndex: takeStartBar, endGlobalBarIndex: takeEndBar } = span;

  if (fromGlobalBarIndex > takeEndBar) {
    return { shouldPlay: false, delaySec: 0, bufferOffsetSec: 0, targetSpanSec: 0 };
  }

  const { barSec } = getTiming(song);
  const effectiveLatencyMs = clampVocalLatencyMs(take.latencyOffsetMs ?? globalLatencyFallbackMs);
  const preRollSec = Math.max(0, take.preRollOffsetSec || 0);
  const deltaSec = (takeStartBar - fromGlobalBarIndex) * barSec + effectiveLatencyMs / 1000;
  const targetSpanSec = (takeEndBar - takeStartBar + 1) * barSec;

  if (deltaSec >= 0) {
    return {
      shouldPlay: true,
      delaySec: deltaSec,
      bufferOffsetSec: preRollSec,
      targetSpanSec,
    };
  }

  return {
    shouldPlay: true,
    delaySec: 0,
    bufferOffsetSec: Math.max(0, preRollSec + -deltaSec),
    targetSpanSec,
  };
}

/**
 * วางแผนเล่นเทคเสียงร้องทั้งแบบเรียลไทม์และออฟไลน์ (Export MP3):
 * - Track section boundary แบบไดนามิกผ่าน resolveVocalTakeBarSpan
 * - ถ้าเป็น AI TTS ที่ยาวเกินความยาวท่อน ปรับ playbackRate เบา ๆ (1.0..1.35) ให้ลงห้องโดยไม่เสียโทน
 * - จำกัดจุดจบ (hard stop + fade out 45ms) ไม่ให้เสียงร้องไหลข้ามไปท่อนถัดไป
 */
export function computeVocalTakePlaybackPlan(
  song: SongProject,
  take: VocalTake,
  allActiveTakes: VocalTake[],
  bufferDurationSec: number,
  fromGlobalBarIndex: number,
  globalLatencyFallbackMs = 0
): VocalTakePlaybackPlan {
  const span = resolveVocalTakeBarSpan(song, take);
  if (!span || bufferDurationSec <= 0.02 || fromGlobalBarIndex > span.endGlobalBarIndex) {
    return {
      shouldPlay: false,
      delaySec: 0,
      bufferOffsetSec: 0,
      targetSpanSec: 0,
      playbackRate: 1,
      isAiTts: isAiTtsVocalTake(take),
      stopAfterDelaySec: null,
      fadeOutStartDelaySec: null,
      fadeOutDurationSec: 0,
    };
  }

  const { barSec } = getTiming(song);
  const preRollSec = Math.max(0, take.preRollOffsetSec || 0);
  const targetSpanSec = (span.endGlobalBarIndex - span.startGlobalBarIndex + 1) * barSec;
  const isAiTts = isAiTtsVocalTake(take);
  const playableBufferSec = Math.max(0, bufferDurationSec - preRollSec);

  let playbackRate = 1.0;
  if (isAiTts && targetSpanSec > 0 && playableBufferSec > targetSpanSec * 1.02) {
    playbackRate = Math.min(1.35, Math.max(1.0, playableBufferSec / targetSpanSec));
  }

  const effectiveLatencyMs = clampVocalLatencyMs(take.latencyOffsetMs ?? globalLatencyFallbackMs);
  const playbackOriginSongSec = fromGlobalBarIndex * barSec;
  const takeStartSongSec = span.startGlobalBarIndex * barSec + effectiveLatencyMs / 1000;
  const deltaSec = takeStartSongSec - playbackOriginSongSec;
  const delaySec = Math.max(0, deltaSec);
  const seekIntoTakeSec = deltaSec < 0 ? -deltaSec : 0;
  const bufferOffsetSec = Math.max(0, preRollSec + seekIntoTakeSec * playbackRate);

  if (bufferOffsetSec >= bufferDurationSec - 0.01) {
    return {
      shouldPlay: false,
      delaySec: 0,
      bufferOffsetSec: 0,
      targetSpanSec,
      playbackRate,
      isAiTts,
      stopAfterDelaySec: null,
      fadeOutStartDelaySec: null,
      fadeOutDurationSec: 0,
    };
  }

  const sectionEndSongSec = (span.endGlobalBarIndex + 1) * barSec;
  const slackSec =
    take.scope === 'section'
      ? isAiTts
        ? Math.min(0.18, barSec * 0.08)
        : 0.65
      : 0.35;
  let hardStopSongSec = sectionEndSongSec + slackSec;

  for (const other of allActiveTakes) {
    if (other.id === take.id || !other.audioDataUrl) continue;
    const otherSpan = resolveVocalTakeBarSpan(song, other);
    if (!otherSpan || otherSpan.startGlobalBarIndex <= span.endGlobalBarIndex) continue;
    const otherLatencyMs = clampVocalLatencyMs(other.latencyOffsetMs ?? globalLatencyFallbackMs);
    const otherStartSongSec = otherSpan.startGlobalBarIndex * barSec + otherLatencyMs / 1000;
    hardStopSongSec = Math.min(hardStopSongSec, otherStartSongSec - 0.03);
  }

  const hardStopDelaySec = hardStopSongSec - playbackOriginSongSec;
  if (hardStopDelaySec <= delaySec + 0.02) {
    return {
      shouldPlay: false,
      delaySec: 0,
      bufferOffsetSec: 0,
      targetSpanSec,
      playbackRate,
      isAiTts,
      stopAfterDelaySec: null,
      fadeOutStartDelaySec: null,
      fadeOutDurationSec: 0,
    };
  }

  const naturalEndDelaySec = delaySec + (bufferDurationSec - bufferOffsetSec) / playbackRate;
  const clamped = hardStopDelaySec < naturalEndDelaySec - 0.005;
  const fadeOutDurationSec = clamped
    ? Math.min(0.045, Math.max(0.015, (hardStopDelaySec - delaySec) * 0.25))
    : 0;

  return {
    shouldPlay: true,
    delaySec,
    bufferOffsetSec,
    targetSpanSec,
    playbackRate,
    isAiTts,
    stopAfterDelaySec: clamped ? hardStopDelaySec : null,
    fadeOutStartDelaySec: clamped ? Math.max(delaySec, hardStopDelaySec - fadeOutDurationSec) : null,
    fadeOutDurationSec,
  };
}

/** ตรวจสอบว่าเทคสองตัวทับซ้อนกันในช่วงบาร์หรือไม่ */
export function doTakesOverlap(a: VocalTake, b: VocalTake, totalBars: number): boolean {
  const aStart = a.startGlobalBarIndex;
  const aEnd = a.endGlobalBarIndex ?? Math.max(0, totalBars - 1);
  const bStart = b.startGlobalBarIndex;
  const bEnd = b.endGlobalBarIndex ?? Math.max(0, totalBars - 1);
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * เปิดใช้งานเทคที่เลือก (Multi-Take Comping) พร้อมปิดสถานะ Active ของเทคที่ซ้อนทับช่วงบาร์เดียวกัน
 */
export function activateVocalTake(
  takes: VocalTake[],
  targetTakeId: string,
  totalBars: number
): VocalTake[] {
  const target = takes.find((t) => t.id === targetTakeId);
  if (!target) return takes;

  return takes.map((take) => {
    if (take.id === targetTakeId) {
      return { ...take, isActive: true };
    }
    if (take.isActive && doTakesOverlap(take, target, totalBars)) {
      return { ...take, isActive: false };
    }
    return take;
  });
}

/** เพิ่มเทคใหม่เข้าลิสต์โดยตั้งให้ Active และ Mute เทคเก่าที่ซ้อนช่วงเดียวกัน */
export function addAndActivateVocalTake(
  takes: VocalTake[],
  newTake: VocalTake,
  totalBars: number
): VocalTake[] {
  const next = takes.map((take) =>
    take.isActive && doTakesOverlap(take, newTake, totalBars)
      ? { ...take, isActive: false }
      : take
  );
  return [...next, { ...newTake, isActive: true }];
}

/** ลบเทคออกจากรายการ */
export function removeVocalTake(takes: VocalTake[], targetTakeId: string): VocalTake[] {
  return takes.filter((t) => t.id !== targetTakeId);
}

/** สร้างชื่อเทคถัดไปอัตโนมัติ เช่น "Take 1 — Chorus" หรือ "Take 2 — Full Song" */
export function formatNextTakeName(
  song: SongProject,
  takes: VocalTake[],
  scope: 'full-song' | 'section',
  sectionId?: string
): string {
  const scopeMatches = takes.filter((t) =>
    scope === 'full-song' ? t.scope === 'full-song' : t.scope === 'section' && t.sectionId === sectionId
  );
  const takeNum = scopeMatches.length + 1;
  if (scope === 'full-song') {
    return `Take ${takeNum} — Full Song`;
  }
  const sec = song.sections.find((s) => s.id === sectionId);
  return `Take ${takeNum} — ${sec?.name || 'Section'}`;
}

/** ตรวจสอบว่าห้องบาร์นี้มีเสียงร้อง Active อยู่หรือไม่ (รองรับทั้ง bar.vocalAudio เดิม และ vocalTakes ต่อเนื่อง) */
export function hasActiveVocalAtBar(
  song: SongProject,
  flatBar: FlatBar,
  globalBarIndex: number
): boolean {
  if (flatBar.bar.vocalAudio) return true;
  const activeTakes = (song.vocalTakes || []).filter((t) => t.isActive && !!t.audioDataUrl);
  return activeTakes.some((take) => {
    const span = resolveVocalTakeBarSpan(song, take);
    if (!span) return false;
    return globalBarIndex >= span.startGlobalBarIndex && globalBarIndex <= span.endGlobalBarIndex;
  });
}

/** คำนวณค่าลดความดังดนตรีแบ็กกิ้งอัตโนมัติ (~ -2 dB) ขณะมีเสียงร้องจริง */
export function computeAutoDuckFactor(
  song: SongProject,
  flatBar: FlatBar,
  globalBarIndex: number
): number {
  const vocalCfg = song.mixer.vocal;
  const enabled = vocalCfg ? vocalCfg.enabled : true;
  const volume = vocalCfg?.volume ?? 95;
  if (!enabled || volume <= 0) return 1.0;
  if (vocalCfg?.autoDucking === false) return 1.0;
  return hasActiveVocalAtBar(song, flatBar, globalBarIndex) ? AUTO_DUCK_GAIN_MULTIPLIER : 1.0;
}
