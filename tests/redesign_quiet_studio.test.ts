/**
 * redesign_quiet_studio.test.ts — Automated Verification for Quiet Studio (Bright Indigo) Redesign
 *
 * Tests:
 *   1. Bright Indigo Light & Dark CSS variables, @theme tokens, and utility classes in globals.css
 *   2. ThemeContext ('light' | 'dark' | 'system') and SSR-safe hydration / storage persistence
 *   3. Self-hosted IBM_Plex_Sans_Thai + IBM_Plex_Mono fonts & ThemeProvider in layout.tsx
 *   4. TransportBar 2-row studio header, popovers, Space/Esc shortcuts, 3-way theme selector, and mobile dock
 *   5. SectionBuilder ⋯ section overflow menu (Duplicate/Move/Delete+Undo), auto-grow <textarea>, footer syllable badge, and AI hook
 *   6. SoundCustomizerPanel Right/Bottom Sheet overlay, all 4 guitar models, vocal latency slider, and 7-track mixer
 *   7. Theme-adaptive tokens across KaraokeTeleprompter, page.tsx toasts, and modals
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..');

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

test('Quiet Studio CSS: Bright Indigo Light & Dark variables and @theme tokens', () => {
  const css = readRepoFile('src/app/globals.css');
  assert.match(css, /\[data-theme="light"\]/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /--accent-500:\s*#5B61EE/);
  assert.match(css, /--accent-500:\s*#7C82FF/);
  assert.match(css, /@theme inline/);
  assert.match(css, /--color-canvas:/);
  assert.match(css, /--color-surface-1:/);
  assert.match(css, /--color-surface-2:/);
  assert.match(css, /\.font-mono-tabular/);
  assert.match(css, /\.studio-glass/);
});

test('ThemeContext: supports light, dark, and system theme preferences', () => {
  const ctx = readRepoFile('src/context/ThemeContext.tsx');
  assert.match(ctx, /ThemePreference = 'light' \| 'dark' \| 'system'/);
  assert.match(ctx, /export const ThemeProvider/);
  assert.match(ctx, /export (function|const) useTheme/);
  assert.match(ctx, /requestAnimationFrame/);
  assert.match(ctx, /prefers-color-scheme: dark/);
  assert.match(ctx, /localStorage/);
});

test('RootLayout: self-hosts IBM_Plex_Sans_Thai + IBM_Plex_Mono and wraps with ThemeProvider', () => {
  const layout = readRepoFile('src/app/layout.tsx');
  assert.match(layout, /import\s*\{[^}]*IBM_Plex_Sans_Thai[^}]*IBM_Plex_Mono[^}]*\}\s*from\s*["']next\/font\/google["']/);
  assert.match(layout, /themeColor:\s*["']#5B61EE["']/);
  assert.match(layout, /<ThemeProvider>/);
  assert.match(layout, /data-theme="light"/);
});

test('TransportBar: 2-row studio header, popovers, Space/Esc shortcuts, and preserved props', () => {
  const bar = readRepoFile('src/components/TransportBar.tsx');
  assert.match(bar, /useTheme/);
  assert.match(bar, /setThemePref/);
  assert.match(bar, /e\.code === 'Space'/);
  assert.match(bar, /e\.key === 'Escape'/);
  assert.match(bar, /onOpenAccountModal/);
  assert.match(bar, /syncStatus/);
  assert.match(bar, /creditBalance/);
  assert.match(bar, /onOpenAdvanceModal/);
  assert.match(bar, /Credits/);
  assert.match(bar, /Workspace modes/);
});

test('SectionBuilder: section overflow menu, Undo restore, auto-grow textarea lyrics, and footer syllable badge', () => {
  const sb = readRepoFile('src/components/SectionBuilder.tsx');
  assert.match(sb, /<textarea/);
  assert.match(sb, /AutoGrowTextarea/);
  assert.match(sb, /countThaiEnglishSyllables/);
  assert.match(sb, /t\.syllablesCount/);
  assert.match(sb, /handleDuplicateSection/);
  assert.match(sb, /handleMoveSection/);
  assert.match(sb, /handleDeleteSection/);
  assert.match(sb, /handleUndoDeleteSection/);
  assert.match(sb, /onOpenAdvanceForSection/);
  assert.match(sb, /✨/);
});

test('SoundCustomizerPanel: Right/Bottom Sheet overlay with 4 guitar models, latency offset, and 7 tracks', () => {
  const panel = readRepoFile('src/components/SoundCustomizerPanel.tsx');
  assert.match(panel, /fixed inset-0/);
  assert.match(panel, /e\.key === 'Escape'/);
  assert.match(panel, /dreadnought-steel/);
  assert.match(panel, /classical-nylon/);
  assert.match(panel, /ovation-roundback/);
  assert.match(panel, /gibson-les-paul/);
  assert.match(panel, /vocalLatencyOffsetMs/);
  assert.match(panel, /guitarRhythm/);
  assert.match(panel, /guitarLead/);
  assert.match(panel, /mixer\.bass/);
  assert.match(panel, /mixer\.piano/);
  assert.match(panel, /mixer\.drums/);
  assert.match(panel, /mixer\.melody/);
  assert.match(panel, /mixer\.vocal/);
});

test('KaraokeTeleprompter, page.tsx, and modals adopt Quiet Studio theme-adaptive tokens', () => {
  const karaoke = readRepoFile('src/components/KaraokeTeleprompter.tsx');
  const page = readRepoFile('src/app/page.tsx');
  const chordModal = readRepoFile('src/components/ChordPickerModal.tsx');
  const presetModal = readRepoFile('src/components/ProgressionPresetsModal.tsx');
  const exportModal = readRepoFile('src/components/ExportModal.tsx');

  for (const [name, content] of [
    ['KaraokeTeleprompter', karaoke],
    ['page.tsx', page],
    ['ChordPickerModal', chordModal],
    ['ProgressionPresetsModal', presetModal],
    ['ExportModal', exportModal],
  ]) {
    assert.match(content, /bg-surface-1|bg-canvas/, `${name} must use Quiet Studio surface/canvas tokens`);
  }

  assert.match(page, /demo-maker:show-ios-tip/);
  assert.match(page, /demo_maker_ios_tip_dismissed/);
});
