// Demo Maker Easy — Cloud Sync & Supabase Readiness Layer
// Prepares architectural schema, types, and sync adapters for Cloud Library (Supabase / REST)

import { SongProject } from '@/types/song';

export type CloudSyncStatus = 'local-only' | 'synced' | 'syncing' | 'offline' | 'error';

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

const CLOUD_CONFIG_KEY = 'demo_maker_cloud_config';

export function getCloudConfig(): CloudSyncConfig {
  if (typeof window === 'undefined') {
    return { autoSyncEnabled: false };
  }
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read cloud config:', err);
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    autoSyncEnabled: false,
  };
}

export function saveCloudConfig(config: CloudSyncConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.warn('Could not save cloud config:', err);
  }
}

export function isCloudConfigured(): boolean {
  const config = getCloudConfig();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

/**
 * Syncs a SongProject to the cloud.
 * Falls back gracefully to local storage if cloud is not yet configured or device is offline.
 */
export async function syncSongToCloud(song: SongProject): Promise<{ success: boolean; status: CloudSyncStatus; message?: string }> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return { success: false, status: 'offline', message: 'อุปกรณ์อยู่ในโหมดออฟไลน์' };
  }

  const config = getCloudConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    // Cloud not configured yet — perfectly normal for Phase 3A standalone mode
    return { success: true, status: 'local-only', message: 'บันทึกในเครื่องเรียบร้อย (ยังไม่ได้เชื่อมต่อ Cloud)' };
  }

  try {
    const record: CloudSongRecord = {
      id: song.id,
      title: song.title,
      bpm: song.bpm,
      time_signature: song.timeSignature,
      base_key: song.baseKey,
      project_data: song,
      created_at: song.updatedAt,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${config.supabaseUrl}/rest/v1/songs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Authorization': `Bearer ${config.supabaseAnonKey}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(record),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, status: 'error', message: `Cloud Sync Error: ${errText}` };
    }

    return { success: true, status: 'synced', message: 'ซิงค์กับ Cloud สำเร็จ' };
  } catch (error: any) {
    return { success: false, status: 'error', message: error?.message || 'Network error' };
  }
}

/**
 * Fetches songs list from cloud if configured.
 */
export async function fetchSongsFromCloud(): Promise<SongProject[]> {
  const config = getCloudConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return [];
  }

  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/songs?select=project_data&order=updated_at.desc`, {
      headers: {
        'apikey': config.supabaseAnonKey,
        'Authorization': `Bearer ${config.supabaseAnonKey}`,
      },
    });

    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map((r: any) => r.project_data as SongProject);
  } catch (err) {
    console.warn('Failed to fetch songs from cloud:', err);
    return [];
  }
}
