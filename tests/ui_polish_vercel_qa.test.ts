/**
 * ui_polish_vercel_qa.test.ts — Regression checks for post-Phase-9 live Vercel QA polish
 *
 * Verifies:
 *   1. TransportBar Row 1 prevents left/center/right collisions and strengthens frosted glass opacity
 *   2. AdvanceModeModal eliminates horizontal tab overflow and supports Escape + backdrop dismissal
 *   3. MiniPianoRollModal unifies sticky beat/syllable headers, prevents 1/16 note clipping, and supports Escape
 *   4. page.tsx guards against calling handleSyncNow after a failed 401 refresh downgrades to Guest
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

test('TransportBar & globals.css: prevent navbar overlap and strengthen sticky glass opacity', () => {
  const css = readRepoFile('src/app/globals.css');
  const bar = readRepoFile('src/components/TransportBar.tsx');

  assert.match(css, /\.studio-glass/);
  assert.match(css, /--glass:\s*rgba\(255,\s*255,\s*255,\s*0\.94\)/);
  assert.match(css, /--glass:\s*rgba\(22,\s*24,\s*38,\s*0\.94\)/);

  assert.match(bar, /min-w-0 flex-1 overflow-hidden/);
  assert.match(bar, /max-w-\[155px\] xl:max-w-\[165px\]/);
  assert.match(bar, /data-save-state=\{localSaveState\}/);
  assert.match(bar, /onManualSave &&/);
  assert.match(bar, /onSaveCheckpoint &&/);
  assert.doesNotMatch(bar, /flex-1 md:flex-initial/);
});

test('AdvanceModeModal: responsive 5-column tab grid (no overflow-x) and Escape/dialog contracts', () => {
  const modal = readRepoFile('src/components/AdvanceModeModal.tsx');

  assert.match(modal, /e\.key === 'Escape'/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /max-w-3xl/);
  assert.match(modal, /grid grid-cols-2 sm:grid-cols-5/);
  assert.doesNotMatch(modal, /grid grid-cols-2 sm:grid-cols-5[\s\S]*overflow-x-auto/);
});

test('MiniPianoRollModal: unified sticky headers, 16-step min width, non-clipping pills, and Escape dismissal', () => {
  const modal = readRepoFile('src/components/MiniPianoRollModal.tsx');

  assert.match(modal, /e\.key === 'Escape'/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /sticky top-0 z-30 bg-surface-1/);
  assert.match(modal, /sticky top-0 z-20 bg-surface-1 shadow-xs/);
  assert.match(modal, /min-w-\[680px\]/);
  assert.match(modal, /opacity-100 sm:opacity-0 sm:group-hover:opacity-100/);
});

test('page.tsx: checks latestUser after refreshAuthSession before calling handleSyncNow', () => {
  const page = readRepoFile('src/app/page.tsx');

  assert.match(page, /const latestUser = getCurrentUser\(\);/);
  assert.match(page, /latestUser\.mode === 'authenticated' && isCloudConfigured\(\)/);
});
