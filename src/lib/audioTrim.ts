/**
 * audioTrim.ts — ยูทิลิตี้ตัดช่วงเงียบหัวคลิปเสียง AI TTS (Leading Silence Trim)
 * และคำนวณหน้าต่างหยุดเสียง (Non-Overlapping Clip Stop Window) เพื่อไม่ให้เสียงห้องเก่าทับห้องใหม่
 *
 * ทุกฟังก์ชันคำนวณระดับตัวอย่างเสียง (Float32Array / pure window math) ทำงานแบบ Isomorphic
 * ทั้งใน Node.js Unit Test และ Browser AudioContext / OfflineAudioContext
 */

export interface LeadingSilenceTrimOptions {
  /** ค่า Threshold ระดับเสียงที่นับว่าเป็นความเงียบ (ดีฟอลต์ -45 dBFS) */
  thresholdDb?: number;
  /** ช่วงเผื่อความปลอดภัยก่อนจุดเริ่มเสียงจริงเพื่อไม่ตัดหัวพยัญชนะ (ดีฟอลต์ 15 ms) */
  safetyMarginMs?: number;
  /** เพดานสูงสุดของการตัดหัวคลิปเพื่อป้องกันการตัดโดนคำร้อง (ดีฟอลต์ 1.5 วินาที) */
  maxTrimSec?: number;
  /** เกณฑ์ความเงียบขั้นต่ำก่อนจะตัด (ดีฟอลต์ 20 ms ถ้าน้อยกว่านี้ไม่จำเป็นต้องสร้างบัฟเฟอร์ใหม่) */
  minTrimMs?: number;
  /** เปิดตัดความเงียบท้ายคลิปควบคู่กัน (ใช้สำหรับ AI TTS เพื่อวัดระยะพูดจริงและลดขนาดไฟล์) */
  trimTrailing?: boolean;
  /** ช่วงเผื่อลมหายใจท้ายคลิปเมื่อเปิด trimTrailing (ดีฟอลต์ 40 ms) */
  trailingMarginMs?: number;
}

export interface TrimmedChannelsResult {
  channels: Float32Array[];
  trimmedSamples: number;
  trimmedSec: number;
}

export interface ClipStopWindow {
  startSec: number;
  fadeOutStartSec: number;
  stopSec: number;
}

/**
 * หาตำแหน่ง sample แรกที่ระดับเสียงดังเกิน threshold (`-45 dBFS`)
 * คืนค่าจำนวน sample ที่สามารถตัดทิ้งได้อย่างปลอดภัย (เผื่อ safetyMarginMs และไม่เกิน maxTrimSec)
 */
export function findLeadingSilenceSampleIndex(
  channels: Float32Array[],
  sampleRate: number,
  options?: LeadingSilenceTrimOptions
): number {
  if (!channels || channels.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return 0;
  }

  const length = channels[0]?.length ?? 0;
  if (length <= 0) return 0;

  const thresholdDb = options?.thresholdDb ?? -45;
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const safetyMarginMs = options?.safetyMarginMs ?? 15;
  const maxTrimSec = options?.maxTrimSec ?? 1.5;
  const minTrimMs = options?.minTrimMs ?? 20;

  let firstActiveSample = -1;
  for (let i = 0; i < length; i++) {
    let peak = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      const val = Math.abs(channels[ch]?.[i] ?? 0);
      if (val > peak) peak = val;
    }
    if (peak >= thresholdLinear) {
      firstActiveSample = i;
      break;
    }
  }

  // ถ้าทั้งคลิปเงียบสนิท อย่าตัดทิ้งจนบัฟเฟอร์ว่าง
  if (firstActiveSample <= 0) {
    return 0;
  }

  const safetySamples = Math.max(0, Math.floor((safetyMarginMs / 1000) * sampleRate));
  const maxTrimSamples = Math.max(0, Math.floor(maxTrimSec * sampleRate));
  const minTrimSamples = Math.max(0, Math.floor((minTrimMs / 1000) * sampleRate));

  const candidateTrim = Math.min(maxTrimSamples, Math.max(0, firstActiveSample - safetySamples));
  if (candidateTrim < minTrimSamples || candidateTrim >= length - 1) {
    return 0;
  }

  return candidateTrim;
}

/** ตัดช่วงเงียบหัวคลิปออกจากอาเรย์ของช่องสัญญาณเสียง (`Float32Array[]`) แบบ Pure */
export function trimChannelsLeadingSilence(
  channels: Float32Array[],
  sampleRate: number,
  options?: LeadingSilenceTrimOptions
): TrimmedChannelsResult {
  const trimSamples = findLeadingSilenceSampleIndex(channels, sampleRate, options);
  if (trimSamples <= 0) {
    return {
      channels,
      trimmedSamples: 0,
      trimmedSec: 0,
    };
  }

  const trimmed = channels.map((ch) => new Float32Array(ch.subarray(trimSamples)));
  return {
    channels: trimmed,
    trimmedSamples: trimSamples,
    trimmedSec: trimSamples / sampleRate,
  };
}

/**
 * หาจุดสิ้นสุดที่มีเสียงจริงในคลิป (exclusive sample index) เพื่อตัดหางเงียบท้ายไฟล์อย่างปลอดภัย
 * โดยเผื่อช่วงลมหายใจ (trailingMarginMs ดีฟอลต์ 40 ms)
 */
export function findTrailingSilenceEndSampleIndex(
  channels: Float32Array[],
  sampleRate: number,
  options?: LeadingSilenceTrimOptions
): number {
  const length = channels[0]?.length ?? 0;
  if (!channels || channels.length === 0 || length <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return length;
  }

  const thresholdDb = options?.thresholdDb ?? -45;
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const trailingMarginMs = options?.trailingMarginMs ?? 40;
  const minTrimMs = options?.minTrimMs ?? 40;

  let lastActiveSample = -1;
  for (let i = length - 1; i >= 0; i--) {
    let peak = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      const val = Math.abs(channels[ch]?.[i] ?? 0);
      if (val > peak) peak = val;
    }
    if (peak >= thresholdLinear) {
      lastActiveSample = i;
      break;
    }
  }

  if (lastActiveSample < 0) {
    return length;
  }

  const marginSamples = Math.max(0, Math.floor((trailingMarginMs / 1000) * sampleRate));
  const minTrimSamples = Math.max(0, Math.floor((minTrimMs / 1000) * sampleRate));
  const candidateEnd = Math.min(length, lastActiveSample + 1 + marginSamples);
  if (length - candidateEnd < minTrimSamples || candidateEnd <= 1) {
    return length;
  }

  return candidateEnd;
}

/** ตัดช่วงเงียบทั้งหัวคลิปและท้ายคลิปออกจากช่องสัญญาณเสียง (`Float32Array[]`) แบบ Pure */
export function trimChannelsSilence(
  channels: Float32Array[],
  sampleRate: number,
  options?: LeadingSilenceTrimOptions
): TrimmedChannelsResult {
  const length = channels[0]?.length ?? 0;
  if (!channels || channels.length === 0 || length <= 0) {
    return { channels, trimmedSamples: 0, trimmedSec: 0 };
  }

  const startIdx = findLeadingSilenceSampleIndex(channels, sampleRate, options);
  const endIdx = findTrailingSilenceEndSampleIndex(channels, sampleRate, options);
  const safeStart = startIdx < endIdx - 1 ? startIdx : 0;
  const safeEnd = endIdx > safeStart ? endIdx : length;
  const removedSamples = safeStart + (length - safeEnd);

  if (removedSamples <= 0) {
    return { channels, trimmedSamples: 0, trimmedSec: 0 };
  }

  const sliced = channels.map((ch) => new Float32Array(ch.subarray(safeStart, safeEnd)));
  return {
    channels: sliced,
    trimmedSamples: removedSamples,
    trimmedSec: removedSamples / sampleRate,
  };
}

/** ตัดช่วงเงียบหัวคลิปจาก Web Audio `AudioBuffer` คืนเป็น `AudioBuffer` ใหม่ (หรือตัวเดิมถ้าไม่ต้องตัด) */
export function trimAudioBufferLeadingSilence(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  options?: LeadingSilenceTrimOptions
): AudioBuffer {
  if (!buffer || buffer.length <= 0 || buffer.numberOfChannels <= 0) return buffer;
  const rawChannels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    rawChannels.push(buffer.getChannelData(c));
  }

  const { channels, trimmedSamples } = trimChannelsLeadingSilence(
    rawChannels,
    buffer.sampleRate,
    options
  );
  if (trimmedSamples <= 0 || !channels[0] || channels[0].length <= 0) {
    return buffer;
  }

  const out = ctx.createBuffer(channels.length, channels[0].length, buffer.sampleRate);
  for (let c = 0; c < channels.length; c++) {
    out.copyToChannel(new Float32Array(channels[c]), c);
  }
  return out;
}

/** ตัดช่วงเงียบท้ายคลิปจาก Web Audio `AudioBuffer` คืนเป็น `AudioBuffer` ใหม่ (ใช้ต่อจาก trimAudioBufferLeadingSilence) */
export function trimAudioBufferTrailingSilence(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  options?: LeadingSilenceTrimOptions
): AudioBuffer {
  if (!buffer || buffer.length <= 0 || buffer.numberOfChannels <= 0) return buffer;
  const rawChannels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    rawChannels.push(buffer.getChannelData(c));
  }

  const endIdx = findTrailingSilenceEndSampleIndex(rawChannels, buffer.sampleRate, options);
  if (endIdx >= buffer.length || endIdx <= 1) {
    return buffer;
  }

  const out = ctx.createBuffer(rawChannels.length, endIdx, buffer.sampleRate);
  for (let c = 0; c < rawChannels.length; c++) {
    out.copyToChannel(new Float32Array(rawChannels[c].subarray(0, endIdx)), c);
  }
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** เข้ารหัสช่องสัญญาณ `Float32Array[]` เป็น PCM 16-bit WAV Data URL (`data:audio/wav;base64,...`) */
export function encodePcmWavDataUrl(channels: Float32Array[], sampleRate: number): string {
  const numChannels = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let writeOffset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0));
      view.setInt16(writeOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      writeOffset += 2;
    }
  }

  return `data:audio/wav;base64,${uint8ToBase64(new Uint8Array(buffer))}`;
}

/** ถอดรหัส Data URL ของเบราว์เซอร์, ตัดความเงียบหัวคลิป (< -45 dBFS), และเข้ารหัสกลับเป็น WAV Data URL */
export async function trimAudioDataUrlLeadingSilence(
  dataUrl: string,
  options?: LeadingSilenceTrimOptions
): Promise<{ dataUrl: string; trimmedSec: number }> {
  if (typeof window === 'undefined') {
    return { dataUrl, trimmedSec: 0 };
  }
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { dataUrl, trimmedSec: 0 };
  }

  const commaIdx = dataUrl.indexOf(',');
  const base64Part = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
  if (!base64Part) {
    return { dataUrl, trimmedSec: 0 };
  }

  let ctx: AudioContext | null = null;
  try {
    const binaryStr = atob(base64Part);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    ctx = new AudioCtx();
    const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      channels.push(decoded.getChannelData(c));
    }
    const trimmed = options?.trimTrailing
      ? trimChannelsSilence(channels, decoded.sampleRate, options)
      : trimChannelsLeadingSilence(channels, decoded.sampleRate, options);
    if (trimmed.trimmedSamples <= 0) {
      return { dataUrl, trimmedSec: 0 };
    }
    return {
      dataUrl: encodePcmWavDataUrl(trimmed.channels, decoded.sampleRate),
      trimmedSec: trimmed.trimmedSec,
    };
  } catch {
    return { dataUrl, trimmedSec: 0 };
  } finally {
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

/**
 * คำนวณหน้าต่างเวลาที่คลิปเสียงร้องรายห้องควรค่อยๆ เฟดลง (20ms) และหยุดก่อนคลิปร้องห้องถัดไปเริ่ม
 * เพื่อป้องกันเสียงร้อง AI TTS จากห้องก่อนหน้าไหลซ้อนทับห้องถัดไป
 */
export function computeNonOverlappingClipWindow(
  clipIndex: number,
  clips: ReadonlyArray<{ startSec: number }>,
  songEndSec: number,
  fadeSec = 0.02
): ClipStopWindow {
  const current = clips[clipIndex];
  const startSec = Math.max(0, current?.startSec ?? 0);
  const nextStart =
    clipIndex + 1 < clips.length
      ? Math.max(startSec + 0.04, clips[clipIndex + 1].startSec)
      : Math.max(startSec + 0.04, songEndSec);
  const safeFade = Math.min(fadeSec, Math.max(0.005, (nextStart - startSec) * 0.4));
  return {
    startSec,
    fadeOutStartSec: Math.max(startSec, nextStart - safeFade),
    stopSec: nextStart,
  };
}

export interface InternalPauseCompressionOptions {
  /** Threshold below which samples are treated as silent pause (default -40 dBFS) */
  thresholdDb?: number;
  /** Minimum pause length (ms) to compress (default 110 ms) */
  minPauseMs?: number;
  /** Minimum breath pause kept after squeezing (default 50 ms) */
  keepPauseMs?: number;
  /** Crossfade width at splice boundary in ms (default 8 ms) */
  crossfadeMs?: number;
}

export interface PauseCompressionResult {
  channels: Float32Array[];
  compressedSec: number;
  pauseCount: number;
}

export interface TimeScaleOptions {
  /** Window duration in seconds for WSOLA overlap-add (default 0.044s = 44ms) */
  windowSec?: number;
  /** Pitch-period search half-range in seconds (default 0.012s = ±12ms) */
  searchRangeSec?: number;
  /** Maximum speedup ratio allowed before stopping scaling (default 1.75) */
  maxSpeedRatio?: number;
}

export interface PitchPreservingFitResult {
  channels: Float32Array[];
  method: 'none' | 'pause-compress' | 'pause+wsola';
  speedRatio: number;
  pausedCompressedSec: number;
}

export interface PeakHeadroomResult {
  channels: Float32Array[];
  gainApplied: number;
  peakBefore: number;
  peakAfter: number;
}

/**
 * บีบช่องเงียบคั่นประโยคภายในคลิป (เช่น จุดเว้นหายใจ 300-650ms ของ Gemini TTS)
 * ให้เหลือแค่ลมหายใจสั้นๆ เพื่อลดความยาวรวมก่อนโดยไม่แตะต้องเนื้อเสียงร้องหรือโทนเสียงเดิม
 */
export function compressChannelsInternalPauses(
  channels: Float32Array[],
  sampleRate: number,
  targetDurationSec: number,
  options?: InternalPauseCompressionOptions
): PauseCompressionResult {
  const totalSamples = channels[0]?.length ?? 0;
  if (
    !channels ||
    channels.length === 0 ||
    totalSamples <= 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(targetDurationSec) ||
    targetDurationSec <= 0
  ) {
    return { channels, compressedSec: 0, pauseCount: 0 };
  }

  const targetSamples = Math.floor(targetDurationSec * sampleRate);
  if (totalSamples <= targetSamples) {
    return { channels, compressedSec: 0, pauseCount: 0 };
  }

  const thresholdDb = options?.thresholdDb ?? -40;
  const thresholdLinear = Math.pow(10, thresholdDb / 20);
  const frameLen = Math.max(1, Math.round(sampleRate * 0.005));
  const minPauseSamples = Math.max(frameLen * 2, Math.floor(((options?.minPauseMs ?? 110) / 1000) * sampleRate));
  const crossfadeSamples = Math.max(4, Math.floor(((options?.crossfadeMs ?? 8) / 1000) * sampleRate));
  const minKeepSamples = Math.max(
    crossfadeSamples * 2 + 4,
    Math.floor(((options?.keepPauseMs ?? 50) / 1000) * sampleRate)
  );

  // Scan peak per 5ms frame across all channels to find quiet pauses robustly
  const pauses: Array<{ start: number; end: number; trimmable: number }> = [];
  let inSilent = false;
  let runStart = 0;

  for (let frameStart = 0; frameStart < totalSamples; frameStart += frameLen) {
    const frameEnd = Math.min(totalSamples, frameStart + frameLen);
    let peak = 0;
    for (let i = frameStart; i < frameEnd; i++) {
      for (let c = 0; c < channels.length; c++) {
        const v = Math.abs(channels[c]?.[i] ?? 0);
        if (v > peak) peak = v;
      }
    }
    const isSilentFrame = peak < thresholdLinear;
    if (isSilentFrame && !inSilent) {
      inSilent = true;
      runStart = frameStart;
    } else if (!isSilentFrame && inSilent) {
      inSilent = false;
      const runLen = frameStart - runStart;
      if (runStart > frameLen && frameStart < totalSamples - frameLen && runLen >= minPauseSamples) {
        const trimmable = Math.max(0, runLen - minKeepSamples);
        if (trimmable > crossfadeSamples * 2) {
          pauses.push({ start: runStart, end: frameStart, trimmable });
        }
      }
    }
  }

  const totalTrimmable = pauses.reduce((acc, p) => acc + p.trimmable, 0);
  if (pauses.length === 0 || totalTrimmable <= 0) {
    return { channels, compressedSec: 0, pauseCount: 0 };
  }

  const neededReduction = totalSamples - targetSamples;
  const shrinkFraction = Math.min(1, neededReduction / totalTrimmable);

  // Plan exact sample removal windows inside the middle of each qualifying pause
  const cuts: Array<{
    removeStart: number;
    removeEnd: number;
    fadeLen: number;
  }> = [];

  for (const p of pauses) {
    const removeCount = Math.floor(p.trimmable * shrinkFraction);
    if (removeCount <= crossfadeSamples * 2) continue;
    const runLen = p.end - p.start;
    const keepTotal = runLen - removeCount;
    const keepLeft = Math.floor(keepTotal / 2);
    const keepRight = keepTotal - keepLeft;
    const fadeLen = Math.min(crossfadeSamples, Math.max(2, Math.floor(Math.min(keepLeft, keepRight) / 2)));
    const removeStart = p.start + keepLeft;
    const removeEnd = p.end - keepRight;
    if (removeEnd > removeStart + fadeLen) {
      cuts.push({ removeStart, removeEnd, fadeLen });
    }
  }

  if (cuts.length === 0) {
    return { channels, compressedSec: 0, pauseCount: 0 };
  }

  // Build segments between cuts; overlap-crossfade around each cut to prevent clicks
  let outLen = totalSamples;
  for (const cut of cuts) {
    outLen -= cut.removeEnd - cut.removeStart + cut.fadeLen;
  }
  if (outLen <= 16 || outLen >= totalSamples) {
    return { channels, compressedSec: 0, pauseCount: 0 };
  }

  const outChannels = channels.map(() => new Float32Array(outLen));
  let srcPos = 0;
  let dstPos = 0;

  for (const cut of cuts) {
    const preLen = cut.removeStart - cut.fadeLen - srcPos;
    if (preLen > 0) {
      for (let c = 0; c < channels.length; c++) {
        outChannels[c].set(channels[c].subarray(srcPos, srcPos + preLen), dstPos);
      }
      dstPos += preLen;
    }

    const fadeLeftStart = cut.removeStart - cut.fadeLen;
    const fadeRightStart = cut.removeEnd;
    for (let k = 0; k < cut.fadeLen; k++) {
      const alpha = (k + 1) / (cut.fadeLen + 1);
      for (let c = 0; c < channels.length; c++) {
        const leftSample = channels[c]?.[fadeLeftStart + k] ?? 0;
        const rightSample = channels[c]?.[fadeRightStart + k] ?? 0;
        outChannels[c][dstPos + k] = leftSample * (1 - alpha) + rightSample * alpha;
      }
    }
    dstPos += cut.fadeLen;
    srcPos = cut.removeEnd + cut.fadeLen;
  }

  const tailLen = totalSamples - srcPos;
  if (tailLen > 0) {
    for (let c = 0; c < channels.length; c++) {
      outChannels[c].set(channels[c].subarray(srcPos, srcPos + tailLen), dstPos);
    }
    dstPos += tailLen;
  }

  const finalChannels = dstPos === outLen ? outChannels : outChannels.map((ch) => ch.subarray(0, dstPos));
  const removedSamples = Math.max(0, totalSamples - dstPos);
  return {
    channels: finalChannels,
    compressedSec: removedSamples / sampleRate,
    pauseCount: cuts.length,
  };
}

/**
 * เร่ง/ย่อความยาวเสียงร้องโดยคงระดับเสียง (Pitch-Preserving WSOLA Time-Scale Modification)
 * ใช้ Hann overlap-add 50% พร้อมค้นหาเฟสคลื่นที่สอดคล้องกันทั้งช่องซ้าย-ขวา
 */
export function timeScaleChannelsPitchPreserving(
  channels: Float32Array[],
  sampleRate: number,
  speedRatio: number,
  options?: TimeScaleOptions
): Float32Array[] {
  const inputLen = channels[0]?.length ?? 0;
  if (
    !channels ||
    channels.length === 0 ||
    inputLen <= 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(speedRatio) ||
    speedRatio <= 1.005
  ) {
    return channels;
  }

  const safeRatio = Math.min(options?.maxSpeedRatio ?? 1.75, Math.max(1.0, speedRatio));
  let windowSamples = Math.max(64, Math.round(sampleRate * (options?.windowSec ?? 0.044)));
  if (windowSamples % 2 === 1) windowSamples += 1;
  if (inputLen < windowSamples * 1.5) {
    return channels;
  }

  const hs = windowSamples >> 1;
  const searchRange = Math.max(16, Math.round(sampleRate * (options?.searchRangeSec ?? 0.012)));
  const outLen = Math.max(windowSamples, Math.round(inputLen / safeRatio));
  if (outLen >= inputLen) {
    return channels;
  }

  const hann = new Float32Array(windowSamples);
  for (let i = 0; i < windowSamples; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / windowSamples));
  }

  // Mono reference signal keeps stereo channels phase-locked together
  const mono = new Float32Array(inputLen);
  const invCh = 1 / channels.length;
  for (let i = 0; i < inputLen; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) {
      sum += channels[c]?.[i] ?? 0;
    }
    mono[i] = sum * invCh;
  }

  const outChannels = channels.map(() => new Float32Array(outLen));
  const weightAcc = new Float32Array(outLen);

  const overlapAdd = (inStart: number, outStart: number) => {
    const copyLen = Math.min(windowSamples, outLen - outStart, inputLen - inStart);
    for (let k = 0; k < copyLen; k++) {
      const w = hann[k];
      for (let c = 0; c < channels.length; c++) {
        outChannels[c][outStart + k] += (channels[c]?.[inStart + k] ?? 0) * w;
      }
      weightAcc[outStart + k] += w;
    }
  };

  const scoreCandidate = (naturalStart: number, candidateStart: number): number => {
    const len = Math.min(hs, inputLen - naturalStart, inputLen - candidateStart);
    if (len <= 16) return -1;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let k = 0; k < len; k += 4) {
      const a = mono[naturalStart + k];
      const b = mono[candidateStart + k];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    if (normA < 1e-8 || normB < 1e-8) return 0;
    return dot / (Math.sqrt(normA * normB) + 1e-12);
  };

  // Frame 0 anchored at 0
  let chosenInStart = 0;
  overlapAdd(0, 0);

  for (let outPos = hs; outPos < outLen; outPos += hs) {
    const naturalNext = Math.min(inputLen - windowSamples, chosenInStart + hs);
    const nominal = Math.min(inputLen - windowSamples, Math.max(0, Math.round(outPos * safeRatio)));
    const minSearch = Math.max(0, nominal - searchRange);
    const maxSearch = Math.min(inputLen - windowSamples, nominal + searchRange);

    let bestStart = nominal;
    let bestScore = -Infinity;

    for (let cand = minSearch; cand <= maxSearch; cand += 4) {
      const s = scoreCandidate(naturalNext, cand);
      if (s > bestScore) {
        bestScore = s;
        bestStart = cand;
      }
    }

    const refineLo = Math.max(minSearch, bestStart - 3);
    const refineHi = Math.min(maxSearch, bestStart + 3);
    for (let cand = refineLo; cand <= refineHi; cand++) {
      const s = scoreCandidate(naturalNext, cand);
      if (s > bestScore) {
        bestScore = s;
        bestStart = cand;
      }
    }

    overlapAdd(bestStart, outPos);
    chosenInStart = bestStart;
  }

  for (let i = 0; i < outLen; i++) {
    const w = weightAcc[i];
    if (w > 1e-6) {
      const invW = 1 / w;
      for (let c = 0; c < channels.length; c++) {
        outChannels[c][i] *= invW;
      }
    }
  }

  // Tiny 8ms tail fade-out prevents end click
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(outLen / 4));
  if (fadeSamples > 1) {
    const startFade = outLen - fadeSamples;
    for (let k = 0; k < fadeSamples; k++) {
      const g = 1 - (k + 1) / fadeSamples;
      for (let c = 0; c < channels.length; c++) {
        outChannels[c][startFade + k] *= g;
      }
    }
  }

  return outChannels;
}

/**
 * บีบคลิปเสียงร้อง AI TTS ให้พอดีกรอบเวลาท่อน (`targetDurationSec`) โดยไม่เปลี่ยนโทนเสียง (No Chipmunk Shift):
 * ขั้นที่ 1: บีบช่วงเงียบคั่นประโยคลงก่อน (คงเนื้อเสียง 100%)
 * ขั้นที่ 2: หากยังยาวเกิน จึงทำ Pitch-Preserving WSOLA ให้จบท่อนพอดีโดยไม่โดนตัดคำท้าย
 */
export function fitChannelsToDurationPitchPreserving(
  channels: Float32Array[],
  sampleRate: number,
  targetDurationSec: number,
  options?: InternalPauseCompressionOptions & TimeScaleOptions
): PitchPreservingFitResult {
  const inputLen = channels[0]?.length ?? 0;
  if (
    !channels ||
    channels.length === 0 ||
    inputLen <= 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(targetDurationSec) ||
    targetDurationSec <= 0
  ) {
    return { channels, method: 'none', speedRatio: 1.0, pausedCompressedSec: 0 };
  }

  const currentDur = inputLen / sampleRate;
  if (currentDur <= targetDurationSec * 1.005) {
    return { channels, method: 'none', speedRatio: 1.0, pausedCompressedSec: 0 };
  }

  const pauseRes = compressChannelsInternalPauses(channels, sampleRate, targetDurationSec, options);
  const pausedDur = (pauseRes.channels[0]?.length ?? 0) / sampleRate;
  if (pausedDur <= targetDurationSec * 1.005) {
    return {
      channels: pauseRes.channels,
      method: pauseRes.compressedSec > 0 ? 'pause-compress' : 'none',
      speedRatio: 1.0,
      pausedCompressedSec: pauseRes.compressedSec,
    };
  }

  const rawRatio = pausedDur / targetDurationSec;
  const maxRatio = options?.maxSpeedRatio ?? 1.75;
  const speedRatio = Math.min(maxRatio, Math.max(1.0, rawRatio));
  const scaled = timeScaleChannelsPitchPreserving(pauseRes.channels, sampleRate, speedRatio, options);
  return {
    channels: scaled,
    method: 'pause+wsola',
    speedRatio,
    pausedCompressedSec: pauseRes.compressedSec,
  };
}

/**
 * แยกวลีร้องจากจุดเว้นหายใจตามธรรมชาติแล้วจัดวางลงต้นห้อง (Bar Downbeat) ของแต่ละห้องเท่าๆ กัน
 * พร้อมคงช่องลมหายใจท้ายห้องและจำกัด WSOLA ไม่ให้รัวคำ (maxSpeedRatio <= 1.24)
 */
/**
 * ตัดเสียงหายใจหรือลมปากสั้นๆ ที่หลุดแยกตัวอยู่ตรงหัว/ท้ายประโยค (เช่น สูดลม/ถอนหายใจท้ายวรรค)
 * โดยตรวจเกาะเสียง (islands) ที่มีช่วงเงียบ (< -32 dBFS) คั่นอย่างน้อย 25ms
 */
export function stripDetachedEdgeBreaths(
  channels: Float32Array[],
  sampleRate: number
): Float32Array[] {
  const totalSamples = channels[0]?.length ?? 0;
  if (!channels || channels.length === 0 || totalSamples <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return channels;
  }

  const frameLen = Math.max(1, Math.round(sampleRate * 0.01));
  const thr = Math.pow(10, -32 / 20);
  const minIslandSamples = Math.max(frameLen, Math.round(sampleRate * 0.015));
  const minGapSamples = Math.round(sampleRate * 0.025);
  const maxBreathSamples = Math.round(sampleRate * 0.24);

  interface AudioIsland {
    start: number;
    end: number;
    rms: number;
    peak: number;
    energyScore: number;
  }

  const frameActive: boolean[] = [];
  const frameStarts: number[] = [];
  for (let f = 0; f < totalSamples; f += frameLen) {
    const fEnd = Math.min(totalSamples, f + frameLen);
    let peak = 0;
    for (let i = f; i < fEnd; i++) {
      for (let c = 0; c < channels.length; c++) {
        const v = Math.abs(channels[c]?.[i] ?? 0);
        if (v > peak) peak = v;
      }
    }
    frameStarts.push(f);
    frameActive.push(peak >= thr);
  }

  const islands: AudioIsland[] = [];
  let inIsland = false;
  let curStart = 0;
  const pushIsland = (start: number, end: number) => {
    if (end - start < minIslandSamples) return;
    let sumSq = 0;
    let peak = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      for (let c = 0; c < channels.length; c++) {
        const v = channels[c]?.[i] ?? 0;
        const abs = Math.abs(v);
        if (abs > peak) peak = abs;
        sumSq += v * v;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
    const durSec = (end - start) / sampleRate;
    islands.push({
      start,
      end,
      rms,
      peak,
      energyScore: rms * durSec,
    });
  };

  for (let idx = 0; idx < frameActive.length; idx++) {
    if (frameActive[idx] && !inIsland) {
      inIsland = true;
      curStart = frameStarts[idx];
    } else if (!frameActive[idx] && inIsland) {
      inIsland = false;
      pushIsland(curStart, frameStarts[idx]);
    }
  }
  if (inIsland) {
    pushIsland(curStart, totalSamples);
  }

  if (islands.length < 2) {
    return channels;
  }

  let mainPeakRms = 0;
  for (const isl of islands) {
    if (isl.rms > mainPeakRms) mainPeakRms = isl.rms;
  }

  let trimStart = 0;
  let trimEnd = totalSamples;

  while (islands.length >= 2) {
    const first = islands[0];
    const second = islands[1];
    const isBreath =
      first.end - first.start <= maxBreathSamples &&
      second.start - first.end >= minGapSamples &&
      (first.rms < mainPeakRms * 0.45 || first.peak < 0.14);
    if (!isBreath) break;
    trimStart = second.start;
    islands.shift();
  }

  while (islands.length >= 2) {
    const last = islands[islands.length - 1];
    const prev = islands[islands.length - 2];
    const isBreath =
      last.end - last.start <= maxBreathSamples &&
      last.start - prev.end >= minGapSamples &&
      (last.rms < mainPeakRms * 0.45 || last.peak < 0.14);
    if (!isBreath) break;
    trimEnd = prev.end;
    islands.pop();
  }

  if (trimStart === 0 && trimEnd === totalSamples) {
    return channels;
  }

  const safeStart = Math.max(0, Math.min(totalSamples - 1, trimStart));
  const safeEnd = Math.max(safeStart + 16, Math.min(totalSamples, trimEnd));
  return channels.map((ch) => new Float32Array(ch.subarray(safeStart, safeEnd)));
}

export function alignAndFitVocalPhrasesToBars(
  channels: Float32Array[],
  sampleRate: number,
  targetSpanSec: number,
  barCount = 4
): Float32Array[] | null {
  const totalSamples = channels[0]?.length ?? 0;
  if (
    !channels ||
    channels.length === 0 ||
    totalSamples <= 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(targetSpanSec) ||
    targetSpanSec < 2.0 ||
    !Number.isInteger(barCount) ||
    barCount < 2
  ) {
    return null;
  }

  const barSec = targetSpanSec / barCount;
  const minSegSamples = Math.floor(0.35 * sampleRate);
  if (totalSamples < minSegSamples * barCount) {
    return null;
  }

  const frameLen = Math.max(1, Math.round(sampleRate * 0.01));
  const mergeGapSamples = Math.round(sampleRate * 0.07);
  const breathCeilingLinear = Math.pow(10, -24 / 20);

  const findPauseIntervals = (thresholdDb: number, minPauseMs: number) => {
    const thr = Math.pow(10, thresholdDb / 20);
    const minPauseSamples = Math.max(frameLen, Math.floor((minPauseMs / 1000) * sampleRate));
    const rawRuns: Array<{ start: number; end: number }> = [];
    let inSilent = false;
    let runStart = 0;

    for (let f = 0; f < totalSamples; f += frameLen) {
      const fEnd = Math.min(totalSamples, f + frameLen);
      let peak = 0;
      for (let i = f; i < fEnd; i++) {
        for (let c = 0; c < channels.length; c++) {
          const v = Math.abs(channels[c]?.[i] ?? 0);
          if (v > peak) peak = v;
        }
      }
      if (peak < thr && !inSilent) {
        inSilent = true;
        runStart = f;
      } else if (peak >= thr && inSilent) {
        inSilent = false;
        rawRuns.push({ start: runStart, end: f });
      }
    }
    if (inSilent) {
      rawRuns.push({ start: runStart, end: totalSamples });
    }

    // Coalesce quiet gaps interrupted only by brief soft breath intake (< 70ms, < -24 dBFS)
    const coalesced: Array<{ start: number; end: number }> = [];
    for (const run of rawRuns) {
      const prev = coalesced[coalesced.length - 1];
      if (prev && run.start - prev.end <= mergeGapSamples) {
        let gapPeak = 0;
        for (let i = prev.end; i < run.start; i++) {
          for (let c = 0; c < channels.length; c++) {
            const v = Math.abs(channels[c]?.[i] ?? 0);
            if (v > gapPeak) gapPeak = v;
          }
        }
        if (gapPeak < breathCeilingLinear) {
          prev.end = run.end;
          continue;
        }
      }
      coalesced.push({ ...run });
    }

    return coalesced
      .filter(
        (r) =>
          r.start > frameLen &&
          r.end < totalSamples - frameLen &&
          r.end - r.start >= minPauseSamples
      )
      .map((r) => ({
        midSample: Math.floor((r.start + r.end) / 2),
        durSec: (r.end - r.start) / sampleRate,
      }));
  };

  let pauses = findPauseIntervals(-35, 55);
  if (pauses.length < barCount - 1) {
    pauses = findPauseIntervals(-30, 55);
  }
  if (pauses.length < barCount - 1) {
    return null;
  }

  // Dynamic programming over ordered pauses to pick the best (barCount - 1) phrase splits
  const numSplits = barCount - 1;
  const P = pauses.length;
  const dp: number[][] = Array.from({ length: numSplits }, () => new Array<number>(P).fill(-Infinity));
  const prevChoice: number[][] = Array.from({ length: numSplits }, () => new Array<number>(P).fill(-1));

  const scoreSplit = (k: number, pIdx: number): number => {
    const targetSample = ((k + 1) / barCount) * totalSamples;
    const distNorm = Math.abs(pauses[pIdx].midSample - targetSample) / totalSamples;
    const durBonus = Math.min(0.18, pauses[pIdx].durSec * 0.3);
    return durBonus - distNorm;
  };

  for (let pIdx = 0; pIdx < P; pIdx++) {
    const pos = pauses[pIdx].midSample;
    if (pos >= minSegSamples && totalSamples - pos >= minSegSamples * numSplits) {
      dp[0][pIdx] = scoreSplit(0, pIdx);
    }
  }

  for (let k = 1; k < numSplits; k++) {
    const remainingAfter = numSplits - 1 - k;
    for (let pIdx = k; pIdx < P; pIdx++) {
      const pos = pauses[pIdx].midSample;
      if (totalSamples - pos < minSegSamples * (remainingAfter + 1)) continue;
      let bestPrevScore = -Infinity;
      let bestPrevIdx = -1;
      for (let prevIdx = k - 1; prevIdx < pIdx; prevIdx++) {
        if (dp[k - 1][prevIdx] === -Infinity) continue;
        if (pos - pauses[prevIdx].midSample < minSegSamples) continue;
        if (dp[k - 1][prevIdx] > bestPrevScore) {
          bestPrevScore = dp[k - 1][prevIdx];
          bestPrevIdx = prevIdx;
        }
      }
      if (bestPrevIdx >= 0) {
        dp[k][pIdx] = bestPrevScore + scoreSplit(k, pIdx);
        prevChoice[k][pIdx] = bestPrevIdx;
      }
    }
  }

  let bestLastScore = -Infinity;
  let bestLastIdx = -1;
  for (let pIdx = numSplits - 1; pIdx < P; pIdx++) {
    if (dp[numSplits - 1][pIdx] > bestLastScore) {
      bestLastScore = dp[numSplits - 1][pIdx];
      bestLastIdx = pIdx;
    }
  }
  if (bestLastIdx < 0) {
    return null;
  }

  const splits = new Array<number>(numSplits);
  let curIdx = bestLastIdx;
  for (let k = numSplits - 1; k >= 0; k--) {
    splits[k] = pauses[curIdx].midSample;
    curIdx = prevChoice[k][curIdx];
  }

  const outSamples = Math.max(1, Math.floor(targetSpanSec * 0.992 * sampleRate));
  const outChannels: Float32Array[] = channels.map(() => new Float32Array(outSamples));
  const breathReserveSec = Math.min(0.26, Math.max(0.14, barSec * 0.1));
  const maxPhraseSec = Math.max(0.5, barSec - breathReserveSec);
  const hardMaxSamples = Math.max(1, Math.floor((barSec - 0.04) * sampleRate));
  const fadeInSamples = Math.max(1, Math.floor(0.015 * sampleRate));
  const fadeOutSamples = Math.max(1, Math.floor(0.055 * sampleRate));

  for (let k = 0; k < barCount; k++) {
    const segStart = k === 0 ? 0 : splits[k - 1];
    const segEnd = k === barCount - 1 ? totalSamples : splits[k];
    if (segEnd <= segStart + 16) continue;

    let phraseChannels: Float32Array[] = channels.map(
      (ch) => new Float32Array(ch.subarray(segStart, segEnd))
    );
    phraseChannels = stripDetachedEdgeBreaths(phraseChannels, sampleRate);
    phraseChannels = trimChannelsSilence(phraseChannels, sampleRate, {
      thresholdDb: -32,
      safetyMarginMs: 15,
      trailingMarginMs: 40,
      minTrimMs: 10,
    }).channels;

    let phraseDur = (phraseChannels[0]?.length ?? 0) / sampleRate;
    if (phraseDur > maxPhraseSec) {
      const paused = compressChannelsInternalPauses(phraseChannels, sampleRate, maxPhraseSec, {
        minPauseMs: 140,
        keepPauseMs: 85,
      });
      phraseChannels = paused.channels;
      phraseDur = (phraseChannels[0]?.length ?? 0) / sampleRate;
    }

    if (phraseDur > maxPhraseSec) {
      const ratio = Math.min(1.24, Math.max(1.0, phraseDur / maxPhraseSec));
      phraseChannels = timeScaleChannelsPitchPreserving(phraseChannels, sampleRate, ratio, {
        maxSpeedRatio: 1.24,
      });
    }

    const barOffsetSamples = Math.floor((k * barSec + 0.02) * sampleRate);
    const availableInOut = Math.max(0, outSamples - barOffsetSamples);
    const copyLen = Math.min(phraseChannels[0]?.length ?? 0, hardMaxSamples, availableInOut);
    if (copyLen <= 0) continue;

    const effFadeIn = Math.min(fadeInSamples, Math.floor(copyLen / 3));
    const effFadeOut = Math.min(fadeOutSamples, Math.floor(copyLen / 3));
    for (let i = 0; i < copyLen; i++) {
      let gain = 1.0;
      if (effFadeIn > 0 && i < effFadeIn) {
        gain *= (i + 1) / effFadeIn;
      }
      if (effFadeOut > 0 && i >= copyLen - effFadeOut) {
        gain *= (copyLen - i) / effFadeOut;
      }
      for (let c = 0; c < channels.length; c++) {
        outChannels[c][barOffsetSamples + i] = (phraseChannels[c]?.[i] ?? 0) * gain;
      }
    }
  }

  return outChannels;
}

/** ปรับขนาดเสียงร้อง AI TTS Buffer ใน AudioContext/OfflineAudioContext ให้พอดีท่อนแบบไม่เปลี่ยนโทนเสียง */
export function prepareAiTtsAudioBufferForSpan(
  ctx: BaseAudioContext,
  trimmedBuffer: AudioBuffer,
  targetSpanSec: number,
  barCount = 4
): AudioBuffer {
  if (
    !trimmedBuffer ||
    trimmedBuffer.length <= 0 ||
    trimmedBuffer.numberOfChannels <= 0 ||
    !Number.isFinite(targetSpanSec) ||
    targetSpanSec <= 0.1
  ) {
    return trimmedBuffer;
  }

  const rawChannels: Float32Array[] = [];
  for (let c = 0; c < trimmedBuffer.numberOfChannels; c++) {
    rawChannels.push(trimmedBuffer.getChannelData(c));
  }

  if (barCount >= 2 && targetSpanSec >= 3.5) {
    const aligned = alignAndFitVocalPhrasesToBars(
      rawChannels,
      trimmedBuffer.sampleRate,
      targetSpanSec,
      barCount
    );
    const alignedLen = aligned?.[0]?.length ?? 0;
    if (aligned && alignedLen > 0) {
      const out = ctx.createBuffer(aligned.length, alignedLen, trimmedBuffer.sampleRate);
      for (let c = 0; c < aligned.length; c++) {
        out.copyToChannel(new Float32Array(aligned[c]), c);
      }
      return out;
    }
  }

  // Fallback when phrases cannot be cleanly split into bars: gentle pause-preserve + <=1.25x WSOLA
  const safeTargetSec = Math.max(0.2, targetSpanSec * 0.985);
  if (trimmedBuffer.duration <= safeTargetSec * 1.01) {
    return trimmedBuffer;
  }

  const fit = fitChannelsToDurationPitchPreserving(
    rawChannels,
    trimmedBuffer.sampleRate,
    safeTargetSec,
    { minPauseMs: 180, keepPauseMs: 120, maxSpeedRatio: 1.25 }
  );
  const outLen = fit.channels[0]?.length ?? 0;
  if (fit.method === 'none' || outLen <= 0 || outLen >= trimmedBuffer.length) {
    return trimmedBuffer;
  }

  const out = ctx.createBuffer(fit.channels.length, outLen, trimmedBuffer.sampleRate);
  for (let c = 0; c < fit.channels.length; c++) {
    out.copyToChannel(new Float32Array(fit.channels[c]), c);
  }
  return out;
}

/** ป้องกันคลิปเสียงแตกก่อนเข้ารหัส MP3 โดยคุม True Peak ให้อยู่ไม่เกิน maxPeak (ดีฟอลต์ 0.94 ≈ -0.54 dBFS) */
export function applyPeakHeadroom(channels: Float32Array[], maxPeak = 0.94): PeakHeadroomResult {
  const safeLimit = Math.max(0.1, Math.min(1.0, maxPeak));
  let peakBefore = 0;
  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    if (!ch) continue;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peakBefore) peakBefore = a;
    }
  }

  if (peakBefore <= safeLimit || peakBefore <= 0) {
    return {
      channels,
      gainApplied: 1.0,
      peakBefore,
      peakAfter: peakBefore,
    };
  }

  const gainApplied = safeLimit / peakBefore;
  const scaled = channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      out[i] = ch[i] * gainApplied;
    }
    return out;
  });

  return {
    channels: scaled,
    gainApplied,
    peakBefore,
    peakAfter: peakBefore * gainApplied,
  };
}
