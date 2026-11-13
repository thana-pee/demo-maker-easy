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

import type { SongProject, SongSnapshot, SongStatusTag } from '../types/song';
import { createDefaultSong } from './defaultSong';
import { generateUniqueId } from './sectionUtils';
import {
  clearSongVocals,
  hydrateSongVocalsFromIdb,
  persistSongVocalsToIdb,
} from './audioStorageIdb';

export { hydrateSongVocalsFromIdb, persistSongVocalsToIdb };

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
  folder?: string;
  statusTag?: SongStatusTag;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as { localStorage?: Storage }).localStorage) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
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

/** คืนสำเนาของ SongProject โดยถอด vocalAudio ออกจากแต่ละห้องเพื่อให้ JSON เบาที่สุด */
export function stripVocalsFromSong(song: SongProject): SongProject {
  return {
    ...song,
    sections: (song.sections || []).map((sec) => ({
      ...sec,
      bars: (sec.bars || []).map((bar) => {
        if (!('vocalAudio' in bar) || bar.vocalAudio === undefined) return bar;
        const rest = { ...bar };
        delete rest.vocalAudio;
        return rest;
      }),
    })),
  };
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
    folder: s.folder,
    statusTag: s.statusTag,
  }));
}

/** ค้นหาเพลงตาม ID */
export function getSongById(id: string): SongProject | null {
  const songs = getSavedSongs();
  return songs.find((s) => s.id === id) || null;
}

/** บันทึกหรืออัปเดตเพลง (offload vocalAudio ไปยัง IndexedDB ในเบราว์เซอร์ + มีระบบกู้คืนเมื่อ LocalStorage เต็ม) */
export function saveSong(song: SongProject): void {
  const storage = getStorage();
  const updatedSong: SongProject = {
    ...song,
    updatedAt: new Date().toISOString(),
  };

  // ในเบราว์เซอร์ที่มี IndexedDB ให้ย้ายไฟล์เสียงร้องไปเก็บใน IndexedDB เพื่อเลี่ยงขีดจำกัด 5MB ของ localStorage
  const canOffloadToIdb = typeof indexedDB !== 'undefined' && indexedDB !== null;
  if (canOffloadToIdb) {
    void persistSongVocalsToIdb(updatedSong);
  }

  if (!storage) return;
  try {
    const songs = getSavedSongs();
    const songForLocalStorage = canOffloadToIdb ? stripVocalsFromSong(updatedSong) : updatedSong;

    const existingIndex = songs.findIndex((s) => s.id === song.id);
    let newSongs: SongProject[];
    if (existingIndex >= 0) {
      newSongs = [...songs];
      newSongs[existingIndex] = songForLocalStorage;
    } else {
      newSongs = [songForLocalStorage, ...songs];
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(newSongs));
    } catch (writeErr: unknown) {
      const errObj = writeErr as { name?: string; code?: number };
      // ตรวจจับ QuotaExceededError เมื่อมีไฟล์เสียงร้องสะสมหลายเพลง
      if (errObj?.name === 'QuotaExceededError' || errObj?.code === 22 || errObj?.code === 1014) {
        console.warn('LocalStorage quota exceeded. Pruning vocal audio blobs to protect project data...');
        const pruned = newSongs.map((s) => (s.id === song.id && !canOffloadToIdb ? s : stripVocalsFromSong(s)));
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

/** ลบเพลงตาม ID พร้อมล้างไฟล์เสียงร้องของเพลงนั้นใน IndexedDB */
export function deleteSong(id: string): boolean {
  const storage = getStorage();
  void clearSongVocals(id);
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

// ───────────────────── Phase 4C: Folders, Search, Status & Snapshots ─────────────────────

/** ดึงรายชื่อโฟลเดอร์ทั้งหมดที่มีอยู่ในคลังเพลง (เรียงตามตัวอักษร) */
export function extractSongFolders(songs: SongProject[]): string[] {
  const set = new Set<string>();
  for (const s of songs) {
    const f = s.folder?.trim();
    if (f) set.add(f);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** กรองเพลงตามคำค้นหา (ชื่อเพลง หรือ เนื้อร้องในทุกห้อง), โฟลเดอร์ และสถานะ */
export function filterLibrarySongs(
  songs: SongProject[],
  query: string,
  folderFilter = 'ALL',
  statusFilter: SongStatusTag | 'ALL' = 'ALL'
): SongProject[] {
  const q = query.trim().toLowerCase();
  const folderNorm = folderFilter.trim();

  return songs.filter((song) => {
    if (folderNorm && folderNorm !== 'ALL') {
      const songFolder = song.folder?.trim() || '';
      if (folderNorm === '__UNFILED__') {
        if (songFolder !== '') return false;
      } else if (songFolder !== folderNorm) {
        return false;
      }
    }

    if (statusFilter && statusFilter !== 'ALL') {
      const effectiveStatus: SongStatusTag = song.statusTag || 'draft';
      if (effectiveStatus !== statusFilter) return false;
    }

    if (!q) return true;
    if ((song.title || '').toLowerCase().includes(q)) return true;

    return (song.sections || []).some((sec) =>
      (sec.bars || []).some((bar) => (bar.lyrics || '').toLowerCase().includes(q))
    );
  });
}

/** สร้าง Version Snapshot น้ำหนักเบา (ไม่รวม snapshots ซ้อน และไม่รวม vocalAudio) */
export function createSongSnapshot(song: SongProject, name?: string): SongSnapshot {
  const light = stripVocalsFromSong(song);
  const withoutSnapshots = { ...light };
  delete withoutSnapshots.snapshots;

  const indexNum = (song.snapshots?.length ?? 0) + 1;
  const label = name?.trim() || `Snapshot #${indexNum}`;
  return {
    id: generateUniqueId('snap'),
    name: label,
    createdAt: new Date().toISOString(),
    songData: JSON.stringify(withoutSnapshots),
  };
}

/** กู้คืนโครงสร้างเพลงจาก Snapshot โดยคง ID, ประวัติ Snapshots และ vocalAudio ของห้องเดิมไว้ */
export function restoreSongFromSnapshot(currentSong: SongProject, snapshot: SongSnapshot): SongProject | null {
  try {
    const parsed = JSON.parse(snapshot.songData) as SongProject;
    if (!parsed || !Array.isArray(parsed.sections)) return null;

    // เก็บ vocalAudio เดิมตาม bar.id ไว้ เพื่อไม่ให้เสียงร้องที่อัดไว้หายตอนย้อนเวอร์ชันคอร์ด/เนื้อร้อง
    const existingVocalsByBarId = new Map<string, string>();
    for (const sec of currentSong.sections || []) {
      for (const bar of sec.bars || []) {
        if (bar.vocalAudio) existingVocalsByBarId.set(bar.id, bar.vocalAudio);
      }
    }

    const restoredSections = parsed.sections.map((sec) => ({
      ...sec,
      bars: (sec.bars || []).map((bar) => {
        const preserved = existingVocalsByBarId.get(bar.id);
        return preserved ? { ...bar, vocalAudio: preserved } : bar;
      }),
    }));

    return {
      ...parsed,
      id: currentSong.id,
      updatedAt: new Date().toISOString(),
      folder: currentSong.folder ?? parsed.folder,
      statusTag: currentSong.statusTag ?? parsed.statusTag,
      snapshots: currentSong.snapshots || [],
      sections: restoredSections,
    };
  } catch (err) {
    console.error('Failed to restore song snapshot:', err);
    return null;
  }
}

/** บันทึก Snapshot ใหม่ลงในเพลงและจัดเก็บลงคลังทันที */
export function addSnapshotToSong(
  song: SongProject,
  name?: string
): { song: SongProject; snapshot: SongSnapshot } {
  const snapshot = createSongSnapshot(song, name);
  const nextSnapshots = [snapshot, ...(song.snapshots || [])].slice(0, 25);
  const updated: SongProject = {
    ...song,
    snapshots: nextSnapshots,
  };
  saveSong(updated);
  return { song: updated, snapshot };
}

/** ลบ Snapshot ออกจากเพลงและจัดเก็บลงคลัง */
export function removeSnapshotFromSong(song: SongProject, snapshotId: string): SongProject {
  const updated: SongProject = {
    ...song,
    snapshots: (song.snapshots || []).filter((snap) => snap.id !== snapshotId),
  };
  saveSong(updated);
  return updated;
}

/** อัปเดต metadata (folder / statusTag) ของเพลงและบันทึกลงคลัง */
export function updateSongLibraryMeta(
  song: SongProject,
  patch: { folder?: string; statusTag?: SongStatusTag }
): SongProject {
  const updated: SongProject = { ...song };
  if ('folder' in patch) {
    const cleaned = patch.folder?.trim();
    if (cleaned) updated.folder = cleaned;
    else delete updated.folder;
  }
  if (patch.statusTag !== undefined) {
    updated.statusTag = patch.statusTag;
  }
  saveSong(updated);
  return updated;
}
