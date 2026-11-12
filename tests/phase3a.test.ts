import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { translations, getSavedLanguage, saveLanguage } from '../src/lib/i18n';
import { isCloudConfigured, syncSongToCloud, fetchSongsFromCloud } from '../src/lib/cloudSync';
import { createDefaultSong } from '../src/lib/defaultSong';

test('i18n: translations.th และ translations.en มี key ครบถ้วนตรงกันทุกคู่ (Symmetry Check)', () => {
  const thKeys = Object.keys(translations.th).sort();
  const enKeys = Object.keys(translations.en).sort();

  assert.deepStrictEqual(
    thKeys,
    enKeys,
    'Key ทั้งหมดของภาษาไทยและภาษาอังกฤษต้องตรงกัน 100%'
  );

  for (const key of thKeys) {
    const thVal = (translations.th as any)[key];
    const enVal = (translations.en as any)[key];
    assert.ok(typeof thVal === 'string' && thVal.trim().length > 0, `translations.th.${key} ต้องไม่เป็นค่าว่าง`);
    assert.ok(typeof enVal === 'string' && enVal.trim().length > 0, `translations.en.${key} ต้องไม่เป็นค่าว่าง`);
  }
});

test('i18n: getSavedLanguage และ saveLanguage ปลอดภัยแม้ไม่มี window/localStorage (SSR Safe)', () => {
  assert.strictEqual(getSavedLanguage(), 'th');
  // ไม่โยนข้อผิดพลาดเมื่อเรียกบันทึกในสภาพแวดล้อม Node.js
  assert.doesNotThrow(() => saveLanguage('en'));
});

test('PWA: manifest.json ถูกต้องตามมาตรฐาน PWA สำหรับติดตั้งบน iPad / iPhone / Android', () => {
  const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'ต้องมีไฟล์ public/manifest.json');

  const content = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(content);

  assert.ok(manifest.name && manifest.name.length > 0, 'manifest ต้องมี name');
  assert.ok(manifest.short_name && manifest.short_name.length > 0, 'manifest ต้องมี short_name');
  assert.strictEqual(manifest.display, 'standalone', 'display ต้องเป็น standalone สำหรับเปิดเต็มจอ');
  assert.strictEqual(manifest.start_url, '/', 'start_url ต้องเป็น /');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'ต้องมี icons อย่างน้อย 2 ขนาด');

  const sizes = manifest.icons.map((i: any) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'ต้องมีไอคอนขนาด 192x192');
  assert.ok(sizes.includes('512x512'), 'ต้องมีไอคอนขนาด 512x512');
});

test('PWA: ไฟล์ไอคอน PNG มีอยู่จริงและมี Magic Byte ถูกต้อง (Valid PNG Signature)', () => {
  const icon192 = path.join(process.cwd(), 'public', 'icons', 'icon-192.png');
  const icon512 = path.join(process.cwd(), 'public', 'icons', 'icon-512.png');
  const iconApple = path.join(process.cwd(), 'public', 'icons', 'apple-touch-icon.png');

  assert.ok(fs.existsSync(icon192), 'ต้องมีไฟล์ icon-192.png');
  assert.ok(fs.existsSync(icon512), 'ต้องมีไฟล์ icon-512.png');
  assert.ok(fs.existsSync(iconApple), 'ต้องมีไฟล์ apple-touch-icon.png');

  // ตรวจสอบ PNG Signature: 89 50 4E 47 0D 0A 1A 0A
  const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const buf192 = fs.readFileSync(icon192);
  const buf512 = fs.readFileSync(icon512);

  assert.deepStrictEqual(buf192.subarray(0, 8), pngMagic, 'icon-192.png ต้องเป็นไฟล์ PNG จริง');
  assert.deepStrictEqual(buf512.subarray(0, 8), pngMagic, 'icon-512.png ต้องเป็นไฟล์ PNG จริง');
});

test('PWA: Service Worker public/sw.js มีคำสั่ง Cache และ Fetch ครบถ้วน', () => {
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  assert.ok(fs.existsSync(swPath), 'ต้องมีไฟล์ public/sw.js');

  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert.ok(swContent.includes('caches.open'), 'sw.js ต้องมีการเปิดแคช');
  assert.ok(swContent.includes('addEventListener(\'fetch\''), 'sw.js ต้องดักจับ fetch event');
  assert.ok(swContent.includes('caches.match'), 'sw.js ต้องมี fallback จากแคช');
});

test('cloudSync: ระบบพร้อมเชื่อมต่อ Cloud โดยไม่พังเมื่อรันแบบ Standalone Offline', async () => {
  const song = createDefaultSong();
  
  // ยังไม่ได้ตั้งค่า URL Supabase
  assert.strictEqual(isCloudConfigured(), false);

  // การซิงค์ต้องไม่ Error และแจ้งสถานะเป็น local-only
  const result = await syncSongToCloud(song);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'local-only');

  // ดึงเพลงจาก Cloud เมื่อยังไม่ตั้งค่าต้องได้ลิสต์ว่าง ไม่แครช
  const cloudSongs = await fetchSongsFromCloud();
  assert.deepStrictEqual(cloudSongs, []);
});
