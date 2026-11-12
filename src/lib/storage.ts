/**
 * storage.ts — ระบบจัดการคลังสมุดเพลงในเครื่อง (My Songs Library) บน localStorage
 *
 * ฟังก์ชันหลัก:
 *   - saveSong(song)           : บันทึกเพลง (สร้างใหม่หรืออัปเดต)
 *   - getSavedSongs()          : รายการเพลงทั้งหมดในเครื่อง
 *   - getSongById(id)          : ดึงเพลงตาม ID
 *   - deleteSong(id)           : ลบเพลงออกจากเครื่อง
 *   - duplicateSong(id)        : ทำสำเนาเพลง
 *   - getActiveSongId()        : ดึง ID เพลงที่กำลังเปิดอยู่
 *   - setActiveSongId(id)      : ตั้ง ID เพลงที่กำลังเปิดอยู่
 *   - exportAllSongsJSON()     : ส่งออกไฟล์สำรองทุกเพลง (.JSON)
 *   - importSongsJSON(jsonStr) : นำเข้าไฟล์สำรองเพลง
 */

import type { SongProject } from '../types/song';
import { createDefaultSong } from './defaultSong';

export const STORAGE_KEY = 'demo_maker_songs_v1';
export const ACTIVE_SONG_KEY = 'demo_maker_active_song_id';

export interface SongSummary {
  id: string;
  title: string;
  updatedAt: string;
  bpm: number;
  baseKey: string;
  timeSignature: string;
  barsCount: number;
  sectionsCount: number;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

/** ดึงรายการเพลงทั้งหมดที่บันทึกไว้ใน localStorage */
export function getSavedSongs(): SongProject[] {
  const storage = getStorage();
  if (!storage) return [createDefaultSong()];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      // ครั้งแรก: สร้าง defaultSong ลงใน storage อัตโนมัติ
      const initial = [createDefaultSong()];
      storage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createDefaultSong()];
    }
    return parsed;
  } catch (err) {
    console.error('Error reading saved songs from localStorage:', err);
    return [createDefaultSong()];
  }
}

/** ดึงข้อมูลสรุปของเพลงทั้งหมด (สำหรับแสดงผลในหน้ารายชื่อเพลงอย่างรวดเร็ว) */
export function getSavedSongsSummaries(): SongSummary[] {
  const songs = getSavedSongs();
  return songs.map((s) => ({
    id: s.id,
    title: s.title || 'ไม่มีชื่อเพลง',
    updatedAt: s.updatedAt || new Date().toISOString(),
    bpm: s.bpm || 74,
    baseKey: s.baseKey || 'C',
    timeSignature: s.timeSignature || '4/4',
    barsCount: (s.sections || []).reduce((acc, sec) => acc + (sec.bars?.length || 0), 0),
    sectionsCount: s.sections?.length || 0,
  }));
}

/** ค้นหาเพลงตาม ID */
export function getSongById(id: string): SongProject | null {
  const songs = getSavedSongs();
  return songs.find((s) => s.id === id) || null;
}

/** บันทึกหรืออัปเดตเพลง (พร้อมระบบกู้คืนเมื่อ LocalStorage เต็ม) */
export function saveSong(song: SongProject): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const songs = getSavedSongs();
    const updatedSong: SongProject = {
      ...song,
      updatedAt: new Date().toISOString(),
    };

    const existingIndex = songs.findIndex((s) => s.id === song.id);
    let newSongs: SongProject[];
    if (existingIndex >= 0) {
      newSongs = [...songs];
      newSongs[existingIndex] = updatedSong;
    } else {
      newSongs = [updatedSong, ...songs];
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(newSongs));
    } catch (writeErr: any) {
      // ตรวจจับ QuotaExceededError เมื่อมีไฟล์เสียงร้องสะสมหลายเพลง
      if (writeErr?.name === 'QuotaExceededError' || writeErr?.code === 22 || writeErr?.code === 1014) {
        console.warn('LocalStorage quota exceeded. Pruning older vocal audio blobs to protect project data...');
        // ปลดเสียงร้องของเพลงอื่นออก เพื่อให้เพลงปัจจุบันเซฟคอร์ดและเนื้อเพลงได้แน่นอน
        const pruned = newSongs.map((s) => {
          if (s.id === song.id) return s;
          return {
            ...s,
            sections: s.sections.map((sec) => ({
              ...sec,
              bars: sec.bars.map(({ vocalAudio, ...b }) => b),
            })),
          };
        });
        try {
          storage.setItem(STORAGE_KEY, JSON.stringify(pruned));
        } catch (retryErr) {
          console.error('Critical: Storage quota full even after pruning older vocals', retryErr);
        }
      } else {
        throw writeErr;
      }
    }

    setActiveSongId(song.id);
  } catch (err) {
    console.error('Error saving song to localStorage:', err);
  }
}

/** ลบเพลงตาม ID */
export function deleteSong(id: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const songs = getSavedSongs();
    if (songs.length <= 1) {
      // ห้ามลบจนหมด ให้เหลืออย่างน้อย 1 เพลง
      return false;
    }
    const filtered = songs.filter((s) => s.id !== id);
    storage.setItem(STORAGE_KEY, JSON.stringify(filtered));

    // ถ้าเพลงที่ลบคือเพลงที่กำลังเปิดอยู่ ให้เปลี่ยนไปเปิดเพลงแรกที่เหลือ
    if (getActiveSongId() === id) {
      setActiveSongId(filtered[0].id);
    }
    return true;
  } catch (err) {
    console.error('Error deleting song:', err);
    return false;
  }
}

/** ทำสำเนาเพลง (Duplicate) */
export function duplicateSong(id: string): SongProject | null {
  const original = getSongById(id);
  if (!original) return null;

  const copy: SongProject = {
    ...original,
    id: `song-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title: `${original.title} (สำเนา)`,
    updatedAt: new Date().toISOString(),
    sections: original.sections.map((sec) => ({
      ...sec,
      id: `sec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      bars: sec.bars.map((b) => ({
        ...b,
        id: `bar-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      })),
    })),
  };

  saveSong(copy);
  return copy;
}

/** ดึง ID ของเพลงที่เปิดใช้งานล่าสุด */
export function getActiveSongId(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(ACTIVE_SONG_KEY);
}

/** กำหนด ID ของเพลงที่กำลังเปิดใช้งาน */
export function setActiveSongId(id: string): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(ACTIVE_SONG_KEY, id);
}

/** ส่งออกเพลงทั้งหมดเป็นไฟล์สำรองข้อมูล JSON */
export function exportAllSongsJSON(): string {
  const songs = getSavedSongs();
  return JSON.stringify(songs, null, 2);
}

/** นำเข้าเพลงจากไฟล์สำรองข้อมูล JSON */
export function importSongsJSON(jsonStr: string): SongProject[] | null {
  const storage = getStorage();
  try {
    const parsed = JSON.parse(jsonStr);
    const list: SongProject[] = Array.isArray(parsed) ? parsed : [parsed];
    if (list.length === 0 || !list[0].sections) return null;

    const existing = getSavedSongs();
    const existingIds = new Set(existing.map((s) => s.id));

    // หลีกเลี่ยง ID ซ้ำ
    const toAdd = list.map((s) => ({
      ...s,
      id: existingIds.has(s.id) ? `imported-${Date.now()}-${Math.floor(Math.random() * 1000)}` : s.id,
      updatedAt: new Date().toISOString(),
    }));

    const combined = [...toAdd, ...existing];
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(combined));
      if (toAdd.length > 0) setActiveSongId(toAdd[0].id);
    }
    return combined;
  } catch (err) {
    console.error('Failed to import songs JSON:', err);
    return null;
  }
}
