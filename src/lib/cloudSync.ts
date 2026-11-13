// Demo Maker Easy — Cloud Sync & Supabase Auth Layer (Phase 3A + Phase 4D)
// Handles Guest offline-first profile, Supabase Email OTP / Magic Link Auth,
// updatedAt timestamp conflict resolution, and Pull + Merge + Push library sync.

import type { SongProject } from '@/types/song';
import { getSavedSongs, getActiveSongId, STORAGE_KEY, stripVocalsFromSong, setActiveSongId } from './storage';

export type CloudSyncStatus = 'local-only' | 'synced' | 'syncing' | 'offline' | 'error';

export interface CloudUser {
  id: string;
  email?: string;
  displayName: string;
  mode: 'guest' | 'authenticated';
}

export interface CloudSongRecord {
  id: string;
  user_id?: string;
  title: string;
  bpm: number;
  time_signature: string;
  base_key: string;
  project_data: SongProject;
  created_at: string;
  updated_at: string;
}

export interface CloudSyncConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  autoSyncEnabled: boolean;
}

interface StoredAuthSession {
  accessToken: string;
  refreshToken?: string;
  user: CloudUser;
}

export interface AuthActionResult {
  success: boolean;
  user: CloudUser;
  status: CloudSyncStatus;
  otpSent?: boolean;
  message: string;
}

export interface SyncNowResult {
  success: boolean;
  status: CloudSyncStatus;
  mergedSongs: SongProject[];
  syncedAt?: string;
  uploadedCount: number;
  downloadedCount: number;
  message: string;
}

const CLOUD_CONFIG_KEY = 'demo_maker_cloud_config';
const CLOUD_AUTH_KEY = 'demo_maker_cloud_auth_v1';
const CLOUD_LAST_SYNC_KEY = 'demo_maker_cloud_last_sync';

export const GUEST_USER: CloudUser = {
  id: 'guest-local',
  displayName: 'Guest (ในเครื่อง)',
  mode: 'guest',
};

function getSafeStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== 'undefined') {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
}

function isDeviceOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export function getCloudConfig(): CloudSyncConfig {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const storage = getSafeStorage();
  if (!storage) {
    return { supabaseUrl: envUrl, supabaseAnonKey: envKey, autoSyncEnabled: false };
  }
  try {
    const raw = storage.getItem(CLOUD_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CloudSyncConfig;
      return {
        supabaseUrl: parsed.supabaseUrl || envUrl,
        supabaseAnonKey: parsed.supabaseAnonKey || envKey,
        autoSyncEnabled: Boolean(parsed.autoSyncEnabled),
      };
    }
  } catch (err) {
    console.warn('Could not read cloud config:', err);
  }
  return {
    supabaseUrl: envUrl,
    supabaseAnonKey: envKey,
    autoSyncEnabled: false,
  };
}

export function saveCloudConfig(config: CloudSyncConfig): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Could not save cloud config:', err);
  }
}

export function isCloudConfigured(): boolean {
  const config = getCloudConfig();
  return Boolean(config.supabaseUrl?.trim() && config.supabaseAnonKey?.trim());
}

export function getLastSyncedAt(): string | null {
  const storage = getSafeStorage();
  if (!storage) return null;
  return storage.getItem(CLOUD_LAST_SYNC_KEY);
}

function setLastSyncedAt(iso: string): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    storage.setItem(CLOUD_LAST_SYNC_KEY, iso);
  } catch {
    // ignore storage write failures
  }
}

function getStoredSession(): StoredAuthSession | null {
  const storage = getSafeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLOUD_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (parsed?.user?.id && parsed?.user?.mode === 'authenticated') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredAuthSession | null): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    if (!session) {
      storage.removeItem(CLOUD_AUTH_KEY);
    } else {
      storage.setItem(CLOUD_AUTH_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore storage write failures
  }
}

/** ดึงข้อมูลผู้ใช้ปัจจุบัน (คืน Guest fallback อัตโนมัติหากยังไม่ได้เข้าสู่ระบบ) */
export function getCurrentUser(): CloudUser {
  const session = getStoredSession();
  return session?.user ?? GUEST_USER;
}

export function getAuthAccessToken(): string | null {
  return getStoredSession()?.accessToken ?? null;
}

/** อ่านผลลัพธ์ Magic Link จาก URL Hash (#access_token=...) เมื่อผู้ใช้กดลิงก์จากอีเมล */
export async function consumeAuthCallbackFromUrl(): Promise<CloudUser | null> {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return null;

  const refreshToken = params.get('refresh_token') || undefined;
  const config = getCloudConfig();
  let user: CloudUser = {
    id: `cloud-user-${Date.now()}`,
    displayName: 'Cloud Member',
    mode: 'authenticated',
  };

  if (config.supabaseUrl && config.supabaseAnonKey) {
    try {
      const res = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; email?: string; user_metadata?: { full_name?: string } };
        const email = data.email || undefined;
        user = {
          id: data.id || user.id,
          email,
          displayName: data.user_metadata?.full_name || (email ? email.split('@')[0] : 'Cloud Member'),
          mode: 'authenticated',
        };
      }
    } catch {
      // ignore user fetch failure, keep token session fallback
    }
  }

  saveStoredSession({ accessToken, refreshToken, user });
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return user;
}

/** ส่ง Email OTP / Magic Link ผ่าน Supabase Auth REST หรือคืน Guest fallback อย่างปลอดภัยเมื่อไม่พบ Cloud/Offline */
export async function signInWithEmailOtp(email: string): Promise<AuthActionResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'error',
      message: 'กรุณากรอกอีเมลให้ถูกต้อง',
    };
  }

  if (!isDeviceOnline()) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'offline',
      message: 'อุปกรณ์อยู่ในโหมดออฟไลน์ — ยังใช้งานในโหมด Guest ได้ตามปกติ',
    };
  }

  const config = getCloudConfig();
  if (!config.supabaseUrl?.trim() || !config.supabaseAnonKey?.trim()) {
    // Fallback ปลอดภัยในโหมด Guest (Standalone โดยยังไม่ตั้งค่า Supabase env)
    return {
      success: true,
      user: GUEST_USER,
      status: 'local-only',
      otpSent: false,
      message: 'ยังไม่ได้ตั้งค่า Supabase Cloud — ระบบทำงานในโหมด Guest (บันทึกในเครื่อง)',
    };
  }

  try {
    const baseUrl = config.supabaseUrl.replace(/\/$/, '');
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const res = await fetch(`${baseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
      },
      body: JSON.stringify({
        email: cleanEmail,
        create_user: true,
        ...(redirectTo ? { email_redirect_to: redirectTo } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        user: getCurrentUser(),
        status: 'error',
        message: `Supabase Auth Error: ${errText || res.status}`,
      };
    }

    // กรณีเซิร์ฟเวอร์ทดสอบหรือ auth response คืน session มาทันที
    const text = await res.text();
    if (text) {
      try {
        const data = JSON.parse(text) as {
          access_token?: string;
          refresh_token?: string;
          user?: { id?: string; email?: string };
        };
        if (data.access_token && data.user?.id) {
          const authUser: CloudUser = {
            id: data.user.id,
            email: data.user.email || cleanEmail,
            displayName: (data.user.email || cleanEmail).split('@')[0],
            mode: 'authenticated',
          };
          saveStoredSession({
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            user: authUser,
          });
          return {
            success: true,
            user: authUser,
            status: 'synced',
            otpSent: true,
            message: `เข้าสู่ระบบด้วย ${cleanEmail} สำเร็จ`,
          };
        }
      } catch {
        // Supabase /auth/v1/otp ปกติมักคืน {} หรือว่างเมื่อส่งอีเมลสำเร็จ
      }
    }

    return {
      success: true,
      user: getCurrentUser(),
      status: 'local-only',
      otpSent: true,
      message: `ส่ง Magic Link / OTP ไปยัง ${cleanEmail} เรียบร้อยแล้ว กรุณาตรวจสอบอีเมลของคุณ`,
    };
  } catch (err) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'error',
      message: err instanceof Error ? err.message : 'Network error during login',
    };
  }
}

/** ยืนยันรหัส OTP 6 หลักในแอป (เหมาะสำหรับโหมด iPad/Mobile PWA ไม่ต้องเด้งออกนอกแอป) */
export async function verifyEmailOtp(email: string, token: string): Promise<AuthActionResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanToken = token.trim();
  if (!cleanEmail || !cleanToken) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'error',
      message: 'กรุณากรอกอีเมลและรหัส OTP ให้ครบ',
    };
  }

  const config = getCloudConfig();
  if (!config.supabaseUrl?.trim() || !config.supabaseAnonKey?.trim()) {
    return {
      success: false,
      user: GUEST_USER,
      status: 'local-only',
      message: 'ยังไม่ได้ตั้งค่า Supabase Cloud',
    };
  }

  try {
    const baseUrl = config.supabaseUrl.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
      },
      body: JSON.stringify({
        email: cleanEmail,
        token: cleanToken,
        type: 'email',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        user: getCurrentUser(),
        status: 'error',
        message: `ยืนยัน OTP ไม่สำเร็จ: ${errText || res.status}`,
      };
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      user?: { id?: string; email?: string };
    };
    const user: CloudUser = {
      id: data.user?.id || `user-${cleanEmail}`,
      email: data.user?.email || cleanEmail,
      displayName: (data.user?.email || cleanEmail).split('@')[0],
      mode: 'authenticated',
    };
    if (data.access_token) {
      saveStoredSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user,
      });
    }
    return {
      success: true,
      user,
      status: 'synced',
      message: `เข้าสู่ระบบด้วย ${user.email} เรียบร้อย`,
    };
  } catch (err) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'error',
      message: err instanceof Error ? err.message : 'Network error verifying OTP',
    };
  }
}

/** ออกจากระบบ Cloud และกลับไปใช้โหมด Guest ในเครื่อง */
export async function signOutUser(): Promise<{ user: CloudUser; status: CloudSyncStatus }> {
  const session = getStoredSession();
  const config = getCloudConfig();
  if (session?.accessToken && config.supabaseUrl && config.supabaseAnonKey && isDeviceOnline()) {
    try {
      await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch {
      // ignore network failure on logout
    }
  }
  saveStoredSession(null);
  return { user: GUEST_USER, status: 'local-only' };
}

function parseUpdatedAtMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * รวมรายการเพลงจาก Local และ Cloud โดยเลือกเวอร์ชันที่ `updatedAt` ใหม่กว่าต่อ `song.id`
 * พร้อมรักษาเพลงที่มีเฉพาะฝั่งใดฝั่งหนึ่งไว้อย่างครบถ้วน (Timestamp Last-Write-Wins Merge)
 */
export function mergeSongLists(localSongs: SongProject[], cloudSongs: SongProject[]): SongProject[] {
  const mergedMap = new Map<string, SongProject>();

  for (const local of localSongs || []) {
    if (!local?.id) continue;
    const prev = mergedMap.get(local.id);
    if (!prev || parseUpdatedAtMs(local.updatedAt) >= parseUpdatedAtMs(prev.updatedAt)) {
      mergedMap.set(local.id, local);
    }
  }

  for (const cloud of cloudSongs || []) {
    if (!cloud?.id) continue;
    const prev = mergedMap.get(cloud.id);
    if (!prev || parseUpdatedAtMs(cloud.updatedAt) > parseUpdatedAtMs(prev.updatedAt)) {
      mergedMap.set(cloud.id, cloud);
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => parseUpdatedAtMs(b.updatedAt) - parseUpdatedAtMs(a.updatedAt)
  );
}

/**
 * Syncs a SongProject to the cloud.
 * Falls back gracefully to local storage if cloud is not yet configured or device is offline.
 */
export async function syncSongToCloud(song: SongProject): Promise<{ success: boolean; status: CloudSyncStatus; message?: string }> {
  if (!isDeviceOnline()) {
    return { success: false, status: 'offline', message: 'อุปกรณ์อยู่ในโหมดออฟไลน์' };
  }

  const config = getCloudConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    // Cloud not configured yet — standalone mode
    return { success: true, status: 'local-only', message: 'บันทึกในเครื่องเรียบร้อย (ยังไม่ได้เชื่อมต่อ Cloud)' };
  }

  try {
    const user = getCurrentUser();
    const bearer = getAuthAccessToken() || config.supabaseAnonKey;
    const lightProject = stripVocalsFromSong(song);
    const record: CloudSongRecord = {
      id: song.id,
      ...(user.mode === 'authenticated' ? { user_id: user.id } : {}),
      title: song.title,
      bpm: song.bpm,
      time_signature: song.timeSignature,
      base_key: song.baseKey,
      project_data: lightProject,
      created_at: song.updatedAt,
      updated_at: song.updatedAt || new Date().toISOString(),
    };

    const res = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${bearer}`,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, status: 'error', message: `Cloud Sync Error: ${errText}` };
    }

    return { success: true, status: 'synced', message: 'ซิงค์กับ Cloud สำเร็จ' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Network error';
    return { success: false, status: 'error', message: msg };
  }
}

/**
 * Fetches songs list from cloud if configured.
 */
export async function fetchSongsFromCloud(): Promise<SongProject[]> {
  const config = getCloudConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey || !isDeviceOnline()) {
    return [];
  }

  try {
    const user = getCurrentUser();
    const bearer = getAuthAccessToken() || config.supabaseAnonKey;
    const baseUrl = config.supabaseUrl.replace(/\/$/, '');
    const userFilter = user.mode === 'authenticated' ? `&user_id=eq.${encodeURIComponent(user.id)}` : '';
    const res = await fetch(
      `${baseUrl}/rest/v1/songs?select=project_data${userFilter}&order=updated_at.desc`,
      {
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${bearer}`,
        },
      }
    );

    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ project_data: SongProject }>;
    return rows
      .filter((r) => r && r.project_data && r.project_data.id)
      .map((r) => r.project_data);
  } catch (err) {
    console.warn('Failed to fetch songs from cloud:', err);
    return [];
  }
}

/**
 * 1-click Pull + Merge + Push สำหรับซิงค์คลังเพลงทั้งหมดระหว่างเครื่องกับ Cloud
 */
export async function syncLibraryNow(localOverride?: SongProject[]): Promise<SyncNowResult> {
  const localSongs = localOverride ?? getSavedSongs();

  if (!isDeviceOnline()) {
    return {
      success: false,
      status: 'offline',
      mergedSongs: localSongs,
      uploadedCount: 0,
      downloadedCount: 0,
      message: 'อุปกรณ์ออฟไลน์อยู่ — ข้อมูลยังถูกบันทึกอย่างปลอดภัยในเครื่อง',
    };
  }

  if (!isCloudConfigured()) {
    return {
      success: true,
      status: 'local-only',
      mergedSongs: localSongs,
      uploadedCount: 0,
      downloadedCount: 0,
      message: 'โหมดบันทึกในเครื่อง (Guest) — ยังไม่ได้ตั้งค่า Supabase Cloud',
    };
  }

  const cloudSongs = await fetchSongsFromCloud();
  const cloudById = new Map(cloudSongs.map((s) => [s.id, s]));
  const localById = new Map(localSongs.map((s) => [s.id, s]));
  const merged = mergeSongLists(localSongs, cloudSongs);

  let downloadedCount = 0;
  let uploadedCount = 0;

  for (const song of merged) {
    const inLocal = localById.get(song.id);
    const inCloud = cloudById.get(song.id);
    if (!inLocal || parseUpdatedAtMs(song.updatedAt) > parseUpdatedAtMs(inLocal.updatedAt)) {
      downloadedCount++;
    }
    if (!inCloud || parseUpdatedAtMs(song.updatedAt) > parseUpdatedAtMs(inCloud.updatedAt)) {
      const pushRes = await syncSongToCloud(song);
      if (!pushRes.success) {
        return {
          success: false,
          status: pushRes.status,
          mergedSongs: merged,
          uploadedCount,
          downloadedCount,
          message: pushRes.message || 'ไม่สามารถอัปโหลดบางเพลงขึ้น Cloud ได้',
        };
      }
      uploadedCount++;
    }
  }

  // บันทึกรายการที่รวมแล้วลง localStorage โดยไม่สูญเสีย vocalAudio (strip เฉพาะเมื่อมี IndexedDB)
  const storage = getSafeStorage();
  if (storage && merged.length > 0) {
    const canOffload = typeof indexedDB !== 'undefined' && indexedDB !== null;
    const toStore = canOffload ? merged.map(stripVocalsFromSong) : merged;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      const curActive = getActiveSongId();
      if (!curActive || !merged.some((s) => s.id === curActive)) {
        setActiveSongId(merged[0].id);
      }
    } catch {
      // ignore quota errors
    }
  }

  const syncedAt = new Date().toISOString();
  setLastSyncedAt(syncedAt);

  return {
    success: true,
    status: 'synced',
    mergedSongs: merged,
    syncedAt,
    uploadedCount,
    downloadedCount,
    message: `ซิงค์สำเร็จ (อัปโหลด ${uploadedCount}, ดึงใหม่ ${downloadedCount} เพลง)`,
  };
}
