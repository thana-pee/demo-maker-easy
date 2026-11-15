/**
 * lyricExport.ts — ตัวส่งออกเนื้อเพลงและไทม์โค้ดคาราโอเกะ (.LRC และ .TXT + ชื่อคอร์ด)
 *
 * ออกแบบให้ไทม์โค้ด [mm:ss.xx] ในไฟล์ .lrc ตรงกับจังหวะบาร์ของการส่งออกไฟล์ .mp3
 * (barIdx * timing.barSec) เพื่อให้เปิดเล่นพร้อมกันในเครื่องเล่นเพลง/คาราโอเกะได้ทันที
 */

import type { SongProject } from '../types/song';
import { transposeChord } from './chordUtils';
import { flattenSong, getTiming } from './barPlanner';

/** แปลงวินาทีเป็นป้ายเวลาแบบ LRC มาตรฐาน `[mm:ss.xx]` */
export function formatLrcTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const totalCentiseconds = Math.round(clamped * 100);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const remainingCs = totalCentiseconds % 6000;
  const seconds = Math.floor(remainingCs / 100);
  const centiseconds = remainingCs % 100;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
}

/** ทำความสะอาดชื่อไฟล์สำหรับดาวน์โหลด (คงตัวอักษรไทย/อังกฤษ/ตัวเลข) */
export function sanitizeExportFilename(rawTitle?: string): string {
  const safe = (rawTitle || 'demo-song')
    .trim()
    .replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || 'demo-song';
}

/**
 * สร้างเนื้อหาไฟล์ `.lrc` (Synchronized Lyrics) ที่มีป้ายเวลา `[mm:ss.xx]` ครบตามจังหวะ `barSec`
 * สำหรับท่อนที่มีเนื้อร้องจะออก `[mm:ss.xx] เนื้อร้อง` ตรงตามห้องเพลง
 * และสำหรับท่อนบรรเลงที่ไม่มีเนื้อร้อง (เช่น Intro / Solo) จะใส่ `[mm:ss.xx] [Section Name]` ให้เห็นจังหวะท่อนดนตรี
 */
export function buildLrcContent(song: SongProject, options?: { artist?: string }): string {
  const flat = flattenSong(song);
  const { barSec } = getTiming(song);
  const artistName = (options?.artist || 'Demo Maker Easy').trim();

  const lines: string[] = [
    `[ti:${(song.title || 'Untitled Demo').trim()}]`,
    `[ar:${artistName}]`,
    '[al:Demo Maker Easy Studio]',
    '[by:Demo Maker Easy]',
    '[offset:0]',
  ];

  let lastEmittedSectionId: string | null = null;
  for (let i = 0; i < flat.length; i++) {
    const fb = flat[i];
    const barStartSec = i * barSec;
    const timestamp = formatLrcTimestamp(barStartSec);
    const trimmedLyrics = fb.bar.lyrics.trim();

    if (fb.section.id !== lastEmittedSectionId) {
      lastEmittedSectionId = fb.section.id;
      const sectionHasAnyLyrics = fb.section.bars.some((b) => b.lyrics.trim().length > 0);
      if (!sectionHasAnyLyrics) {
        lines.push(`${timestamp} [${fb.section.name}]`);
        continue;
      }
    }

    if (trimmedLyrics.length > 0) {
      lines.push(`${timestamp} ${trimmedLyrics}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * สร้างเอกสารเนื้อเพลง + คอร์ดแบบอ่านง่าย (`.txt`) เรียงตามท่อนเพลง
 * แสดงคีย์เพลง, Capo/Transpose, BPM และคอร์ดกำกับแต่ละห้องครบถ้วน
 */
export function buildPlainLyricsWithChords(
  song: SongProject,
  options?: { artist?: string }
): string {
  const effectiveKey = transposeChord(song.baseKey || 'C', song.transposeSemitones || 0);
  const capoNote = song.capoFret > 0 ? ` | Capo Fret ${song.capoFret}` : '';
  const transposeNote =
    song.transposeSemitones !== 0
      ? ` (Transpose ${song.transposeSemitones > 0 ? '+' : ''}${song.transposeSemitones})`
      : '';
  const artistName = (options?.artist || 'Demo Maker Easy').trim();

  const lines: string[] = [
    `${(song.title || 'Untitled Demo').trim()}`,
    `Artist: ${artistName}`,
    `Key: ${effectiveKey}${transposeNote}${capoNote} | Tempo: ${song.bpm} BPM | Time: ${song.timeSignature}`,
    '========================================',
    '',
  ];

  for (const section of song.sections) {
    lines.push(`[${section.name}]`);
    for (let bIdx = 0; bIdx < section.bars.length; bIdx++) {
      const bar = section.bars[bIdx];
      const chords = (bar.chords || [])
        .slice(0, bar.chordsPerBar === 2 ? 2 : 1)
        .map((c) => transposeChord(c, song.transposeSemitones || 0))
        .filter(Boolean);
      const chordTag = chords.length > 0 ? `[${chords.join(' / ')}]` : '[N.C.]';
      const lyricText = bar.lyrics.trim();
      if (lyricText.length > 0) {
        lines.push(`${chordTag}  ${lyricText}`);
      } else {
        lines.push(`${chordTag}  (บรรเลง ${bar.playStyle === 'break' ? 'Break' : bar.playStyle === 'let-ring' ? 'Let Ring' : 'Instrumental'})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function triggerTextDownload(filename: string, content: string, mimeType: string, includeUtf8Bom = false): void {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return;
  const payload = includeUtf8Bom ? `\uFEFF${content}` : content;
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** ดาวน์โหลดไฟล์ .LRC สำหรับซิงค์เนื้อคาราโอเกะกับไฟล์เสียง MP3 */
export function downloadLrcFile(song: SongProject): void {
  const filename = `${sanitizeExportFilename(song.title)}.lrc`;
  triggerTextDownload(filename, buildLrcContent(song), 'text/plain;charset=utf-8', true);
}

/** ดาวน์โหลดไฟล์ .TXT เนื้อเพลงพร้อมคอร์ดสำหรับพิมพ์หรือเปิดดู */
export function downloadLyricsTxtFile(song: SongProject): void {
  const filename = `${sanitizeExportFilename(song.title)}_lyrics.txt`;
  triggerTextDownload(filename, buildPlainLyricsWithChords(song), 'text/plain;charset=utf-8', true);
}
