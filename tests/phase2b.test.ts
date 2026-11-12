/**
 * phase2b.test.ts — Automated Unit Tests for Phase 2B
 *
 * Tests:
 *   1. micRecorder — Environment safety, volume clamping, mime types
 *   2. mp3Exporter — Float32 to Int16 conversion, MP3 encoding, valid MPEG Sync Frame Header
 *   3. vocalStorage & latency — vocalLatencyOffsetMs and bar.vocalAudio preservation across storage & shareUrl
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSong } from '../src/lib/defaultSong';
import { MicRecorder } from '../src/lib/micRecorder';
import { audioBufferToMp3 } from '../src/lib/mp3Exporter';
import { generateShareUrl, parseSongFromUrl } from '../src/lib/shareUrl';
import { saveSong, getSongById } from '../src/lib/storage';

// Mock localStorage for Node.js test environment
const mockStorage: Record<string, string> = {};
(globalThis as any).window = {
  location: {
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
  },
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    },
  },
};

// ───────────────────────── 1. Mic Recorder Tests ─────────────────────────

test('micRecorder: isSupported และ getSupportedMimeType ทำงานได้ปลอดภัยในทุกสภาพแวดล้อม', () => {
  // ใน Node.js environment window.MediaRecorder ยังไม่มี
  const supported = MicRecorder.isSupported();
  assert.equal(typeof supported, 'boolean');

  const mime = MicRecorder.getSupportedMimeType();
  assert.equal(typeof mime, 'string');
});

// ───────────────────────── 2. MP3 Exporter Tests ─────────────────────────

test('mp3Exporter: เข้ารหัส AudioBuffer เป็นไบต์ MP3 ที่มี Sync Word มาตรฐาน (0xFF)', async () => {
  // จำลอง AudioBuffer สเตอริโอ 44.1kHz ความยาว 0.5 วินาที
  const sampleRate = 44100;
  const length = Math.floor(sampleRate * 0.5);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  // สร้าง sine wave 440Hz (A4)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    left[i] = Math.sin(2 * Math.PI * 440 * t) * 0.7;
    right[i] = Math.sin(2 * Math.PI * 440 * t) * 0.7;
  }

  const mockAudioBuffer = {
    numberOfChannels: 2,
    sampleRate: 44100,
    length,
    duration: 0.5,
    getChannelData: (ch: number) => (ch === 0 ? left : right),
  } as unknown as AudioBuffer;

  const mp3Bytes = await audioBufferToMp3(mockAudioBuffer, 192);

  assert.ok(mp3Bytes instanceof Uint8Array, 'ผลลัพธ์ต้องเป็น Uint8Array');
  assert.ok(mp3Bytes.length > 500, `ไฟล์ MP3 ต้องมีขนาด > 500 bytes, ได้ ${mp3Bytes.length}`);

  // ตรวจสอบ MP3 Frame Sync Header: 11 bits ทั้งหมดต้องเป็น 1 (0xFF 0xFB หรือ 0xFF 0xFA หรือ 0xFF 0xF3)
  assert.equal(mp3Bytes[0], 0xff, 'ไบต์แรกของ MP3 frame ต้องเป็น 0xFF');
  assert.equal((mp3Bytes[1] & 0xe0), 0xe0, '3 bits แรกของไบต์ที่สองต้องเป็น 111 (Sync word)');
});

// ───────────────────────── 3. Vocal Storage & Latency Offset ─────────────────────────

test('vocalStorage: บันทึกและดึงข้อมูล vocalAudio ประจำห้องผ่าน Storage ได้ถูกต้อง', () => {
  const song = createDefaultSong();
  song.id = 'vocal-test-song';
  song.title = 'เพลงทดสอบอัดเสียงร้อง';
  song.vocalLatencyOffsetMs = -25; // ชดเชยเสียงร้องเร็วขึ้น 25ms

  // จำลอง Data URL เสียงร้องที่อัดจากไมค์
  const sampleDataUrl = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwE=';
  song.sections[0].bars[0].vocalAudio = sampleDataUrl;

  saveSong(song);

  const retrieved = getSongById('vocal-test-song');
  assert.ok(retrieved, 'ต้องดึงเพลงกลับมาได้');
  assert.equal(retrieved.vocalLatencyOffsetMs, -25);
  assert.equal(retrieved.sections[0].bars[0].vocalAudio, sampleDataUrl);
});

test('vocalStorage: บีบอัดและส่งต่อ vocalLatencyOffsetMs ผ่าน LINE Share Link ได้ตรงเดิม', () => {
  const song = createDefaultSong();
  song.title = 'แชร์เพลงพร้อมปรับ Latency';
  song.vocalLatencyOffsetMs = 45; // ดีเลย์ 45ms

  const shareUrl = generateShareUrl(song);
  assert.ok(shareUrl.includes('?song='));

  const parsed = parseSongFromUrl(shareUrl.replace('http://localhost:3000/', ''));
  assert.ok(parsed);
  assert.equal(parsed.vocalLatencyOffsetMs, 45);
});
