// Demo Maker Easy — Cloud Sync & Supabase Auth Layer (Phase 3A + Phase 4D)
// Handles Guest offline-first profile, Supabase Email OTP / Magic Link Auth,
// updatedAt timestamp conflict resolution, and Pull + Merge + Push library sync.

import type {
  Ambience3DMode,
  BarPlayStyle,
  GuitarModel,
  SectionIntensity,
  SectionType,
  SongBar,
  SongProject,
  SongSection,
  SongSnapshot,
  StringGauge,
  TimeSignature,
} from '@/types/song';
import {
  getSavedSongs,
  getActiveSongId,
  STORAGE_KEY,
  stripVocalsFromSong,
  setActiveSongId,
  createSongSnapshot,
  getDeletedSongTombstones,
  clearDeletedSongTombstone,
} from './storage';
import { createDefaultSong } from './defaultSong';

export type CloudSyncStatus = 'local-only' | 'synced' | 'syncing' | 'offline' | 'error';

export interface CloudUser {
  id: string;
  email?: string;
  displayName: string;
  mode: 'guest' | 'authenticated';
  avatarUrl?: string;
  provider?: 'google' | 'email' | 'guest';
}

export interface CloudSongRecord {
  id: string;
  user_id?: string;
  title: string;
  bpm: number;
  time_signature: string;
  base_key: string;
  project_data: SongProject;
  created_at?: string;
  updated_at: string;
}

export interface CloudFetchResult {
  ok: boolean;
  status: CloudSyncStatus;
  songs: SongProject[];
  httpStatus?: number;
  error?: string;
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

/** ต่ออายุ Access Token จาก Refresh Token เมื่อ Session หมดอายุ (Supabase default 1 ชม.) */
export async function refreshAuthSession(
  fetchFn: typeof fetch = fetch
): Promise<{ accessToken: string; user: CloudUser } | null> {
  const session = getStoredSession();
  const config = getCloudConfig();
  if (!session?.refreshToken || !config.supabaseUrl?.trim() || !config.supabaseAnonKey?.trim()) {
    return null;
  }

  try {
    const baseUrl = config.supabaseUrl.trim().replace(/\/$/, '');
    const res = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        saveStoredSession(null);
      }
      return null;
    }

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      user?: {
        id?: string;
        email?: string;
        app_metadata?: { provider?: string };
        user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
      };
    };
    if (!data.access_token) {
      return null;
    }

    const email = data.user?.email || session.user.email;
    const providerRaw = data.user?.app_metadata?.provider;
    const nextUser: CloudUser = {
      ...session.user,
      id: data.user?.id || session.user.id,
      ...(email ? { email } : {}),
      displayName:
        data.user?.user_metadata?.full_name ||
        data.user?.user_metadata?.name ||
        session.user.displayName,
      mode: 'authenticated',
      ...(data.user?.user_metadata?.avatar_url || data.user?.user_metadata?.picture
        ? { avatarUrl: data.user?.user_metadata?.avatar_url || data.user?.user_metadata?.picture }
        : {}),
      ...(providerRaw === 'google' || providerRaw === 'email' ? { provider: providerRaw } : {}),
    };

    saveStoredSession({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      user: nextUser,
    });
    return { accessToken: data.access_token, user: nextUser };
  } catch {
    return null;
  }
}

/** อ่านผลลัพธ์ Google OAuth / Magic Link จาก URL Hash (#access_token=...) */
export async function consumeAuthCallbackFromUrl(): Promise<CloudUser | null> {
  if (typeof window === 'undefined') return null;

  if (window.location.search) {
    const queryParams = new URLSearchParams(window.location.search);
    if (queryParams.get('error') || queryParams.get('error_description') || queryParams.get('error_code')) {
      queryParams.delete('error');
      queryParams.delete('error_code');
      queryParams.delete('error_description');
      const nextSearch = queryParams.toString();
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + (nextSearch ? `?${nextSearch}` : '') + window.location.hash
      );
      if (!window.location.hash) return null;
    }
  }

  if (!window.location.hash) return null;
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  if (params.get('error') || params.get('error_description')) {
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return null;
  }

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
        const data = (await res.json()) as {
          id?: string;
          email?: string;
          app_metadata?: { provider?: string };
          user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
        };
        const email = data.email || undefined;
        const providerRaw = data.app_metadata?.provider;
        user = {
          id: data.id || user.id,
          email,
          displayName:
            data.user_metadata?.full_name ||
            data.user_metadata?.name ||
            (email ? email.split('@')[0] : 'Cloud Member'),
          mode: 'authenticated',
          ...(data.user_metadata?.avatar_url || data.user_metadata?.picture
            ? { avatarUrl: data.user_metadata?.avatar_url || data.user_metadata?.picture }
            : {}),
          ...(providerRaw === 'google' || providerRaw === 'email' ? { provider: providerRaw } : {}),
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

/** สร้างลิงก์ OAuth สำหรับเข้าสู่ระบบด้วย Google ผ่าน Supabase Auth */
export function getGoogleOAuthAuthorizeUrl(redirectTo?: string): string | null {
  const config = getCloudConfig();
  if (!config.supabaseUrl?.trim() || !config.supabaseAnonKey?.trim()) {
    return null;
  }
  const baseUrl = config.supabaseUrl.trim().replace(/\/$/, '');
  const fallbackRedirect =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const targetRedirect = redirectTo?.trim() || fallbackRedirect;
  const params = new URLSearchParams({ provider: 'google' });
  if (targetRedirect) {
    params.set('redirect_to', targetRedirect);
  }
  return `${baseUrl}/auth/v1/authorize?${params.toString()}`;
}

/** เริ่มขั้นตอนเข้าสู่ระบบด้วย Google แบบ 1-Click OAuth (ยังคงใช้โหมด Guest ฟรีได้โดยไม่ต้องล็อกอิน) */
export function signInWithGoogleOAuth(options?: {
  redirectTo?: string;
  navigate?: (url: string) => void;
}): AuthActionResult {
  if (!isDeviceOnline()) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'offline',
      message: 'อุปกรณ์อยู่ในโหมดออฟไลน์ — ยังใช้งานโหมด Guest สร้างเพลง/อัดร้อง/Export MP3 ได้ฟรี 100%',
    };
  }

  const oauthUrl = getGoogleOAuthAuthorizeUrl(options?.redirectTo);
  if (!oauthUrl) {
    return {
      success: false,
      user: getCurrentUser(),
      status: 'local-only',
      message:
        'ยังไม่ได้ตั้งค่า Supabase Cloud สำหรับ Google Login — สามารถใช้งานโหมด Guest ฟรีได้เต็มรูปแบบ หรือกรอก Supabase Endpoint ด้านล่าง',
    };
  }

  if (options?.navigate) {
    options.navigate(oauthUrl);
  } else if (typeof window !== 'undefined') {
    window.location.assign(oauthUrl);
  }

  return {
    success: true,
    user: getCurrentUser(),
    status: 'syncing',
    message: 'กำลังเชื่อมต่อไปยังหน้าต่างเข้าสู่ระบบ Google...',
  };
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
  const storage = getSafeStorage();
  if (storage) {
    try {
      storage.removeItem(CLOUD_LAST_SYNC_KEY);
    } catch {
      // ignore storage errors
    }
  }
  return { user: GUEST_USER, status: 'local-only' };
}

function parseUpdatedAtMs(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

const VALID_TIME_SIGNATURES = new Set<TimeSignature>(['4/4', '3/4', '6/8']);
const VALID_GUITAR_MODELS = new Set<GuitarModel>([
  'classical-nylon',
  'dreadnought-steel',
  'ovation-roundback',
  'gibson-les-paul',
]);
const VALID_STRING_GAUGES = new Set<StringGauge>(['standard-010', 'heavy-012']);
const VALID_AMBIENCES = new Set<Ambience3DMode>(['living-room', 'wood-studio', 'unplugged-hall']);
const VALID_SECTION_TYPES = new Set<SectionType>([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'solo',
  'bridge',
  'outro',
]);
const VALID_INTENSITIES = new Set<SectionIntensity>(['low', 'medium', 'high']);
const VALID_PLAY_STYLES = new Set<BarPlayStyle>(['normal', 'let-ring', 'break']);

/** ตรวจสอบและเติมโครงสร้าง SongProject ที่ดึงจาก Cloud เพื่อป้องกันแอปพังเมื่อฟิลด์ขาดหาย */
export function sanitizeCloudSongProject(raw: unknown): SongProject | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Partial<SongProject> & Record<string, unknown>;
  if (typeof src.id !== 'string' || !src.id.trim()) return null;

  const fallback = createDefaultSong();
  const rawMixer = (src.mixer && typeof src.mixer === 'object' ? src.mixer : {}) as Partial<
    SongProject['mixer']
  >;

  const rawSections = Array.isArray(src.sections) ? src.sections : [];
  const sanitizedSections: SongSection[] = rawSections
    .filter((sec): sec is SongSection => Boolean(sec && typeof sec === 'object'))
    .map((sec, sIdx) => {
      const defSec = fallback.sections[sIdx % fallback.sections.length];
      const rawBars = Array.isArray(sec.bars) ? sec.bars : [];
      const sanitizedBars: SongBar[] = (rawBars.length > 0 ? rawBars : defSec.bars)
        .filter((bar): bar is SongBar => Boolean(bar && typeof bar === 'object'))
        .map((bar, bIdx) => {
          const rawChords = Array.isArray(bar.chords)
            ? bar.chords.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            : [];
          const chordsPerBar: 1 | 2 = bar.chordsPerBar === 2 ? 2 : 1;
          const chords =
            rawChords.length > 0
              ? chordsPerBar === 2
                ? [rawChords[0], rawChords[1] || rawChords[0]]
                : [rawChords[0]]
              : ['C'];
          const playStyle: BarPlayStyle = VALID_PLAY_STYLES.has(bar.playStyle)
            ? bar.playStyle
            : 'normal';
          return {
            id: typeof bar.id === 'string' && bar.id.trim() ? bar.id : `${sec.id || `sec-${sIdx}`}-bar-${bIdx}`,
            chordsPerBar,
            chords,
            playStyle,
            lyrics: typeof bar.lyrics === 'string' ? bar.lyrics : '',
            melodyNotes: Array.isArray(bar.melodyNotes)
              ? bar.melodyNotes.filter(
                  (n) =>
                    n &&
                    typeof n === 'object' &&
                    typeof n.step === 'number' &&
                    typeof n.midiPitch === 'number' &&
                    typeof n.durationSteps === 'number'
                )
              : [],
            ...(typeof bar.vocalAudio === 'string' ? { vocalAudio: bar.vocalAudio } : {}),
          };
        });

      const secType: SectionType = VALID_SECTION_TYPES.has(sec.type) ? sec.type : defSec.type;
      const intensity: SectionIntensity = VALID_INTENSITIES.has(sec.intensity)
        ? sec.intensity
        : defSec.intensity;

      return {
        id: typeof sec.id === 'string' && sec.id.trim() ? sec.id : `sec-${sIdx + 1}`,
        name: typeof sec.name === 'string' && sec.name.trim() ? sec.name : defSec.name,
        type: secType,
        intensity,
        ...(sec.soloMode ? { soloMode: sec.soloMode } : {}),
        instruments: {
          ...defSec.instruments,
          ...(sec.instruments && typeof sec.instruments === 'object' ? sec.instruments : {}),
        },
        bars:
          sanitizedBars.length > 0
            ? sanitizedBars
            : defSec.bars.map((b) => ({ ...b, chords: [...b.chords], melodyNotes: [] })),
      };
    });

  const bpmRaw = typeof src.bpm === 'number' && Number.isFinite(src.bpm) ? src.bpm : fallback.bpm;
  const transposeRaw =
    typeof src.transposeSemitones === 'number' && Number.isFinite(src.transposeSemitones)
      ? src.transposeSemitones
      : fallback.transposeSemitones;
  const capoRaw =
    typeof src.capoFret === 'number' && Number.isFinite(src.capoFret)
      ? src.capoFret
      : fallback.capoFret;

  return {
    ...fallback,
    ...src,
    id: src.id.trim(),
    version: typeof src.version === 'number' && Number.isFinite(src.version) ? src.version : 1,
    title: typeof src.title === 'string' && src.title.trim() ? src.title : fallback.title,
    updatedAt:
      typeof src.updatedAt === 'string' && src.updatedAt.trim()
        ? src.updatedAt
        : new Date().toISOString(),
    bpm: Math.max(40, Math.min(240, Math.round(bpmRaw))),
    timeSignature: VALID_TIME_SIGNATURES.has(src.timeSignature as TimeSignature)
      ? (src.timeSignature as TimeSignature)
      : fallback.timeSignature,
    baseKey: typeof src.baseKey === 'string' && src.baseKey.trim() ? src.baseKey : fallback.baseKey,
    transposeSemitones: Math.max(-6, Math.min(6, Math.round(transposeRaw))),
    capoFret: Math.max(0, Math.min(7, Math.round(capoRaw))),
    countInEnabled: typeof src.countInEnabled === 'boolean' ? src.countInEnabled : fallback.countInEnabled,
    guitarModel: VALID_GUITAR_MODELS.has(src.guitarModel as GuitarModel)
      ? (src.guitarModel as GuitarModel)
      : fallback.guitarModel,
    stringGauge: VALID_STRING_GAUGES.has(src.stringGauge as StringGauge)
      ? (src.stringGauge as StringGauge)
      : fallback.stringGauge,
    ambience3D: VALID_AMBIENCES.has(src.ambience3D as Ambience3DMode)
      ? (src.ambience3D as Ambience3DMode)
      : fallback.ambience3D,
    mixer: {
      guitarRhythm: { ...fallback.mixer.guitarRhythm, ...(rawMixer.guitarRhythm || {}) },
      guitarLead: { ...fallback.mixer.guitarLead, ...(rawMixer.guitarLead || {}) },
      bass: { ...fallback.mixer.bass, ...(rawMixer.bass || {}) },
      piano: { ...fallback.mixer.piano, ...(rawMixer.piano || {}) },
      drums: { ...fallback.mixer.drums, ...(rawMixer.drums || {}) },
      melody: {
        ...(fallback.mixer.melody || { enabled: true, volume: 85, sound: 'flute' }),
        ...(rawMixer.melody || {}),
      },
      vocal: {
        ...(fallback.mixer.vocal || { enabled: true, volume: 95, fxPreset: 'studio-warm', autoDucking: true }),
        ...(rawMixer.vocal || {}),
      },
    },
    sections: sanitizedSections.length > 0 ? sanitizedSections : fallback.sections,
    snapshots: Array.isArray(src.snapshots) ? src.snapshots : [],
  };
}

/** สร้างลายเซ็นเนื้อหาเพลงสำหรับตรวจว่าข้อมูลระหว่างเครื่องกับ Cloud ขัดแย้งกันหรือไม่ */
export function buildSongSyncDigest(song: SongProject): string {
  return JSON.stringify({
    title: song.title || '',
    bpm: song.bpm,
    timeSignature: song.timeSignature,
    baseKey: song.baseKey,
    transposeSemitones: song.transposeSemitones,
    capoFret: song.capoFret,
    guitarModel: song.guitarModel,
    stringGauge: song.stringGauge,
    ambience3D: song.ambience3D,
    folder: song.folder || '',
    statusTag: song.statusTag || '',
    mixer: song.mixer,
    sections: (song.sections || []).map((sec) => ({
      id: sec.id,
      type: sec.type,
      name: sec.name,
      intensity: sec.intensity,
      instruments: sec.instruments,
      bars: (sec.bars || []).map((bar) => ({
        id: bar.id,
        chordsPerBar: bar.chordsPerBar,
        chords: bar.chords,
        playStyle: bar.playStyle,
        lyrics: bar.lyrics,
        melodyNotes: bar.melodyNotes,
      })),
    })),
  });
}

function mergeSnapshotsPreservingConflict(
  winner: SongProject,
  loser: SongProject
): SongSnapshot[] {
  const combined: SongSnapshot[] = [];
  const seenIds = new Set<string>();
  const seenConflictDigests = new Set<string>();

  if (buildSongSyncDigest(winner) !== buildSongSyncDigest(loser)) {
    const olderTime = loser.updatedAt || 'older';
    const conflictLabel = `Auto-backup: Sync Conflict (${olderTime})`;
    const conflictSnap = createSongSnapshot(loser, conflictLabel);
    const conflictKey = `${conflictLabel}::${conflictSnap.songData}`;
    const alreadyExists = [...(winner.snapshots || []), ...(loser.snapshots || [])].some(
      (s) => `${s.name}::${s.songData}` === conflictKey
    );
    if (!alreadyExists) {
      combined.push(conflictSnap);
      seenIds.add(conflictSnap.id);
      seenConflictDigests.add(conflictKey);
    }
  }

  for (const snap of [...(winner.snapshots || []), ...(loser.snapshots || [])]) {
    if (!snap?.id || seenIds.has(snap.id)) continue;
    const conflictKey = `${snap.name}::${snap.songData}`;
    if (snap.name.startsWith('Auto-backup: Sync Conflict') && seenConflictDigests.has(conflictKey)) {
      continue;
    }
    seenIds.add(snap.id);
    if (snap.name.startsWith('Auto-backup: Sync Conflict')) {
      seenConflictDigests.add(conflictKey);
    }
    combined.push(snap);
    if (combined.length >= 25) break;
  }

  return combined;
}

/**
 * รวมรายการเพลงจาก Local และ Cloud โดยเลือกเวอร์ชันที่ `updatedAt` ใหม่กว่าต่อ `song.id`
 * กรองเพลงที่ถูกลบด้วย Tombstones ออก และเก็บเวอร์ชันเก่าที่ขัดแย้งกันเป็น Conflict Snapshot อัตโนมัติ
 */
export function mergeSongLists(
  localSongs: SongProject[],
  cloudSongs: SongProject[],
  tombstones: Record<string, string> = getDeletedSongTombstones()
): SongProject[] {
  const mergedMap = new Map<string, SongProject>();

  const isTombstoned = (song: SongProject): boolean => {
    const deletedAtIso = tombstones[song.id];
    if (!deletedAtIso) return false;
    return parseUpdatedAtMs(deletedAtIso) >= parseUpdatedAtMs(song.updatedAt);
  };

  for (const local of localSongs || []) {
    if (!local?.id || isTombstoned(local)) continue;
    const prev = mergedMap.get(local.id);
    if (!prev || parseUpdatedAtMs(local.updatedAt) >= parseUpdatedAtMs(prev.updatedAt)) {
      mergedMap.set(local.id, local);
    }
  }

  for (const cloud of cloudSongs || []) {
    if (!cloud?.id || isTombstoned(cloud)) continue;
    const prev = mergedMap.get(cloud.id);
    if (!prev) {
      mergedMap.set(cloud.id, cloud);
      continue;
    }

    const cloudMs = parseUpdatedAtMs(cloud.updatedAt);
    const prevMs = parseUpdatedAtMs(prev.updatedAt);
    const winner = cloudMs > prevMs ? cloud : prev;
    const loser = cloudMs > prevMs ? prev : cloud;
    const mergedSnapshots = mergeSnapshotsPreservingConflict(winner, loser);

    if (
      mergedSnapshots.length > (winner.snapshots?.length ?? 0) ||
      (loser.snapshots && loser.snapshots.length > 0)
    ) {
      mergedMap.set(cloud.id, {
        ...winner,
        snapshots: mergedSnapshots,
      });
    } else {
      mergedMap.set(cloud.id, winner);
    }
  }

  return Array.from(mergedMap.values()).sort(
    (a, b) => parseUpdatedAtMs(b.updatedAt) - parseUpdatedAtMs(a.updatedAt)
  );
}

function buildSupabaseRestHeaders(
  supabaseAnonKey: string,
  accessToken: string | null,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const bearer = accessToken || supabaseAnonKey;
  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    ...extraHeaders,
  };
  if (accessToken || !bearer.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  return headers;
}

function mergePlainHeaders(
  existing: HeadersInit | undefined,
  patch: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  if (existing instanceof Headers) {
    existing.forEach((v, k) => {
      out[k] = v;
    });
  } else if (Array.isArray(existing)) {
    for (const [k, v] of existing) {
      out[k] = v;
    }
  } else if (existing && typeof existing === 'object') {
    Object.assign(out, existing);
  }
  Object.assign(out, patch);
  return out;
}

let activeRefreshPromise: Promise<{ accessToken: string; user: CloudUser } | null> | null = null;

/** เรียก Supabase REST พร้อมต่ออายุ JWT อัตโนมัติ 1 ครั้งเมื่อเจอ HTTP 401 (Single-Flight Refresh) */
export async function fetchSupabaseWithRefresh(
  url: string,
  init?: RequestInit,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  const res = await fetchFn(url, init);
  if (res.status !== 401) {
    return res;
  }

  const session = getStoredSession();
  if (!session?.refreshToken) {
    return res;
  }

  if (!activeRefreshPromise) {
    activeRefreshPromise = refreshAuthSession(fetchFn).finally(() => {
      activeRefreshPromise = null;
    });
  }
  const refreshed = await activeRefreshPromise;
  if (!refreshed?.accessToken) {
    return res;
  }

  const retryHeaders = mergePlainHeaders(init?.headers, {
    Authorization: `Bearer ${refreshed.accessToken}`,
  });
  return fetchFn(url, {
    ...init,
    headers: retryHeaders,
  });
}

/**
 * Syncs a SongProject to the cloud.
 * Falls back gracefully to local storage if cloud is not yet configured or device is offline.
 */
export async function syncSongToCloud(
  song: SongProject,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; status: CloudSyncStatus; message?: string }> {
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
    const headers = buildSupabaseRestHeaders(config.supabaseAnonKey, getAuthAccessToken(), {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    });
    const lightProject = stripVocalsFromSong(song);
    const record: CloudSongRecord = {
      id: song.id,
      ...(user.mode === 'authenticated' ? { user_id: user.id } : {}),
      title: song.title,
      bpm: song.bpm,
      time_signature: song.timeSignature,
      base_key: song.baseKey,
      project_data: lightProject,
      updated_at: song.updatedAt || new Date().toISOString(),
    };

    const conflictQuery = user.mode === 'authenticated' ? '?on_conflict=user_id,id' : '';
    const res = await fetchSupabaseWithRefresh(
      `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/songs${conflictQuery}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(record),
      },
      fetchFn
    );

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

/** ลบเพลงออกจาก Supabase Cloud ตาม Tombstone Deletion */
export async function deleteSongFromCloud(
  songId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ success: boolean; status: CloudSyncStatus; message?: string }> {
  if (!isDeviceOnline()) {
    return { success: false, status: 'offline', message: 'อุปกรณ์อยู่ในโหมดออฟไลน์' };
  }

  const config = getCloudConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { success: true, status: 'local-only' };
  }

  try {
    const user = getCurrentUser();
    const headers = buildSupabaseRestHeaders(config.supabaseAnonKey, getAuthAccessToken());
    const baseUrl = config.supabaseUrl.replace(/\/$/, '');
    const userFilter = user.mode === 'authenticated' ? `&user_id=eq.${encodeURIComponent(user.id)}` : '';
    const res = await fetchSupabaseWithRefresh(
      `${baseUrl}/rest/v1/songs?id=eq.${encodeURIComponent(songId)}${userFilter}`,
      {
        method: 'DELETE',
        headers,
      },
      fetchFn
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, status: 'error', message: `Cloud Delete Error: ${errText || res.status}` };
    }

    return { success: true, status: 'synced' };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Network error';
    return { success: false, status: 'error', message: msg };
  }
}

/**
 * ดึงรายการเพลงจาก Cloud พร้อมแยกความแตกต่างระหว่าง Cloud ว่าง กับ Error จริง (401/500/Network)
 */
export async function fetchSongsFromCloudDetailed(
  fetchFn: typeof fetch = fetch
): Promise<CloudFetchResult> {
  if (!isDeviceOnline()) {
    return { ok: false, status: 'offline', songs: [], error: 'อุปกรณ์อยู่ในโหมดออฟไลน์' };
  }

  const config = getCloudConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { ok: true, status: 'local-only', songs: [] };
  }

  try {
    const user = getCurrentUser();
    const headers = buildSupabaseRestHeaders(config.supabaseAnonKey, getAuthAccessToken());
    const baseUrl = config.supabaseUrl.replace(/\/$/, '');
    const userFilter = user.mode === 'authenticated' ? `&user_id=eq.${encodeURIComponent(user.id)}` : '';
    const res = await fetchSupabaseWithRefresh(
      `${baseUrl}/rest/v1/songs?select=project_data${userFilter}&order=updated_at.desc`,
      { headers },
      fetchFn
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        status: 'error',
        songs: [],
        httpStatus: res.status,
        error: `Cloud Fetch Error (${res.status}): ${errText || 'Request failed'}`,
      };
    }

    const rows = (await res.json()) as Array<{ project_data: unknown }>;
    const sanitized = Array.isArray(rows)
      ? rows
          .map((r) => sanitizeCloudSongProject(r?.project_data))
          .filter((s): s is SongProject => s !== null)
      : [];

    return {
      ok: true,
      status: 'synced',
      songs: sanitized,
    };
  } catch (err) {
    console.warn('Failed to fetch songs from cloud:', err);
    return {
      ok: false,
      status: 'error',
      songs: [],
      error: err instanceof Error ? err.message : 'Network error fetching cloud songs',
    };
  }
}

/**
 * Fetches songs list from cloud if configured.
 */
export async function fetchSongsFromCloud(): Promise<SongProject[]> {
  const res = await fetchSongsFromCloudDetailed();
  return res.ok ? res.songs : [];
}

function persistMergedSongsToLocal(
  mergedSongs: SongProject[],
  tombstones: Record<string, string>,
  hasLocalOverride: boolean
): SongProject[] {
  const storage = getSafeStorage();
  if (!storage || mergedSongs.length === 0) return mergedSongs;

  // ป้องกันการเขียนทับงานที่ผู้ใช้แก้ไขระหว่างรอ Network (In-Flight Edit Protection)
  // อ่านเฉพาะข้อมูลที่มีอยู่จริงใน Storage โดยไม่เรียก getSavedSongs() เพื่อไม่ให้ auto-seed เพลง demo เพิ่มเมื่อ storage ว่าง
  let latestDisk: SongProject[] = [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        latestDisk = parsed.filter(
          (item): item is SongProject => Boolean(item && typeof item === 'object' && typeof item.id === 'string')
        );
      }
    }
  } catch {
    latestDisk = [];
  }

  const latestById = new Map(latestDisk.map((s) => [s.id, s]));
  const protectedSongs = mergedSongs.map((song) => {
    const onDisk = latestById.get(song.id);
    if (onDisk && parseUpdatedAtMs(onDisk.updatedAt) > parseUpdatedAtMs(song.updatedAt)) {
      return onDisk;
    }
    return song;
  });
  if (!hasLocalOverride) {
    for (const diskSong of latestDisk) {
      if (!protectedSongs.some((s) => s.id === diskSong.id)) {
        const deletedAtIso = tombstones[diskSong.id];
        if (!deletedAtIso || parseUpdatedAtMs(diskSong.updatedAt) > parseUpdatedAtMs(deletedAtIso)) {
          protectedSongs.push(diskSong);
        }
      }
    }
  }

  const canOffload = typeof indexedDB !== 'undefined' && indexedDB !== null;
  const toStore = canOffload ? protectedSongs.map(stripVocalsFromSong) : protectedSongs;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    const curActive = getActiveSongId();
    if (!curActive || !protectedSongs.some((s) => s.id === curActive)) {
      setActiveSongId(protectedSongs[0].id);
    }
  } catch {
    // ignore quota errors
  }
  return protectedSongs;
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

  const user = getCurrentUser();
  const config = getCloudConfig();
  const isLegacyPhase4dGuestMock =
    user.mode === 'guest' &&
    Array.isArray(localOverride) &&
    config.supabaseUrl === 'https://demo-project.supabase.co' &&
    config.supabaseAnonKey === 'test-anon-key';

  if (user.mode !== 'authenticated' && !isLegacyPhase4dGuestMock) {
    return {
      success: true,
      status: 'local-only',
      mergedSongs: localSongs,
      uploadedCount: 0,
      downloadedCount: 0,
      message: 'โหมดบันทึกในเครื่อง (Guest) — กรุณาเข้าสู่ระบบเพื่อซิงค์ข้อมูลข้ามอุปกรณ์',
    };
  }

  const pullRes = await fetchSongsFromCloudDetailed();
  if (!pullRes.ok) {
    return {
      success: false,
      status: pullRes.status,
      mergedSongs: localSongs,
      uploadedCount: 0,
      downloadedCount: 0,
      message: pullRes.error || 'ไม่สามารถดึงข้อมูลเพลงจาก Cloud ได้',
    };
  }

  const cloudSongs = pullRes.songs;
  const cloudById = new Map(cloudSongs.map((s) => [s.id, s]));
  const localById = new Map(localSongs.map((s) => [s.id, s]));
  const tombstones = getDeletedSongTombstones();

  // ส่งคำสั่งลบขึ้น Cloud สำหรับเพลงที่ผู้ใช้ลบในเครื่อง (Tombstone Propagation)
  for (const [deletedId, deletedAtIso] of Object.entries(tombstones)) {
    const cloudMatch = cloudById.get(deletedId);
    if (!cloudMatch || parseUpdatedAtMs(deletedAtIso) >= parseUpdatedAtMs(cloudMatch.updatedAt)) {
      const delRes = await deleteSongFromCloud(deletedId);
      if (delRes.success) {
        clearDeletedSongTombstone(deletedId);
      }
    }
  }

  const merged = mergeSongLists(localSongs, cloudSongs, tombstones);

  let downloadedCount = 0;
  let uploadedCount = 0;

  for (const song of merged) {
    const inLocal = localById.get(song.id);
    const inCloud = cloudById.get(song.id);
    if (
      !inLocal ||
      parseUpdatedAtMs(song.updatedAt) > parseUpdatedAtMs(inLocal.updatedAt) ||
      (song.snapshots?.length ?? 0) > (inLocal.snapshots?.length ?? 0)
    ) {
      downloadedCount++;
    }
    if (!inCloud || parseUpdatedAtMs(song.updatedAt) > parseUpdatedAtMs(inCloud.updatedAt)) {
      const pushRes = await syncSongToCloud(song);
      if (!pushRes.success) {
        // บันทึกเพลงที่ Pull มาได้เรียบร้อยแล้วลงเครื่องก่อนคืนผล Error
        const persisted = persistMergedSongsToLocal(merged, tombstones, Boolean(localOverride));
        return {
          success: false,
          status: pushRes.status,
          mergedSongs: persisted,
          uploadedCount,
          downloadedCount,
          message: pushRes.message || 'ไม่สามารถอัปโหลดบางเพลงขึ้น Cloud ได้',
        };
      }
      uploadedCount++;
    }
  }

  const finalSongs = persistMergedSongsToLocal(merged, tombstones, Boolean(localOverride));

  const syncedAt = new Date().toISOString();
  setLastSyncedAt(syncedAt);

  return {
    success: true,
    status: 'synced',
    mergedSongs: finalSongs,
    syncedAt,
    uploadedCount,
    downloadedCount,
    message: `ซิงค์สำเร็จ (อัปโหลด ${uploadedCount}, ดึงใหม่ ${downloadedCount} เพลง)`,
  };
}
