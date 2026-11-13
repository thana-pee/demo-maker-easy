/**
 * phase4b.test.ts — Automated Unit Tests for Phase 4B
 *
 * Tests:
 *   1. Slash Chords (parseChord, transposeChord, parseChordSymbol, getGuitarVoicing bass MIDI 40–51)
 *   2. Zone Strumming (downstroke = all strings bottom-up, upstroke <= 3 treble strings top-down)
 *   3. Auto-Embellishment (sus4 / add9 inflection on late upstroke of single-chord bars)
 *   4. Walking Bass Approach Notes & Slash Bass Root Anchoring
 *   5. Outro Ritardando & Final Arpeggiated Strum (38–52ms strum sweep gaps + >= 2.6s sustain)
 *   6. VocalStudioTrackGainNode DSP Chain (95Hz HPF -> 3.8kHz +2.5dB Q1.1 -> -18dB 4:1 Comp) & mp3Exporter
 *   7. ChordPickerModal Slash Bass selector bar presence
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultSong } from '../src/lib/defaultSong';
import { parseChord, transposeChord } from '../src/lib/chordUtils';
import { parseChordSymbol, getGuitarVoicing } from '../src/lib/guitarVoicings';
import { flattenSong, planBar, type PlannedEvent } from '../src/lib/barPlanner';
import { VocalStudioTrackGainNode } from '../src/lib/audioEngine';

type NoteEv = Extract<PlannedEvent, { kind: 'note' }>;

function trackNotes(events: PlannedEvent[], track: NoteEv['track']): NoteEv[] {
  return events.filter((e): e is NoteEv => e.kind === 'note' && e.track === track);
}

// ───────────────────────── 1. Slash Chords Support ─────────────────────────

test('Slash Chords: parseChord & transposeChord แยกและย้ายคีย์ทั้ง Root และ Bass ได้แม่นยำ', () => {
  assert.deepEqual(parseChord('D/F#'), { root: 'D', quality: '', bass: 'F#' });
  assert.deepEqual(parseChord('Am7/G'), { root: 'A', quality: 'm7', bass: 'G' });
  assert.deepEqual(parseChord('C/G'), { root: 'C', quality: '', bass: 'G' });

  assert.equal(transposeChord('D/F#', -2), 'C/E');
  assert.equal(transposeChord('C/G', 2), 'D/A');
});

test('Slash Chords: parseChordSymbol เก็บ bassPc และ getGuitarVoicing วางโน้ตเบสต่ำสุดในช่วง E2–D#3 (MIDI 40–51)', () => {
  const cases: Array<{ chord: string; expectedBassPc: number; expectedBassMidi: number }> = [
    { chord: 'D/F#', expectedBassPc: 6, expectedBassMidi: 42 },  // F#2
    { chord: 'C/G', expectedBassPc: 7, expectedBassMidi: 43 },   // G2
    { chord: 'G/B', expectedBassPc: 11, expectedBassMidi: 47 },  // B2
    { chord: 'C/E', expectedBassPc: 4, expectedBassMidi: 40 },   // E2
    { chord: 'F/A', expectedBassPc: 9, expectedBassMidi: 45 },   // A2
    { chord: 'Am/G', expectedBassPc: 7, expectedBassMidi: 43 },  // G2
  ];

  for (const c of cases) {
    const parsed = parseChordSymbol(c.chord);
    assert.equal(parsed.bassPc, c.expectedBassPc, `${c.chord} bassPc`);

    const voicing = getGuitarVoicing(c.chord);
    assert.ok(voicing.strings.length >= 4, `${c.chord} ต้องมีอย่างน้อย 4 สาย`);
    assert.equal(voicing.strings[0].midi, c.expectedBassMidi, `${c.chord} strings[0].midi`);
    assert.equal(voicing.strings[0].midi % 12, c.expectedBassPc);
    assert.ok(voicing.strings[0].midi >= 40 && voicing.strings[0].midi <= 51);

    // สายที่เหลือต้องเรียงจากต่ำไปสูงและอยู่เหนือเบสอย่างชัดเจน
    for (let k = 1; k < voicing.strings.length; k++) {
      assert.ok(
        voicing.strings[k].midi > voicing.strings[k - 1].midi,
        `${c.chord} string ${k} must ascend above bass`
      );
    }
  }

  // ทดสอบร่วมกับ Capo (D/F# เมื่อคาด Capo 2 → จับฟอร์ม C/E แต่เสียงจริงยังคงเบส F#2 = 42)
  const capoVoicing = getGuitarVoicing('D/F#', 2);
  assert.equal(capoVoicing.fingering, 'C/E');
  assert.equal(capoVoicing.strings[0].midi, 42);
});

// ───────────────────────── 2. Upstroke Zone Strumming ─────────────────────────

test('Zone Strumming: อัปสโตรกดีดเฉพาะ ≤ 3 สายแหลมบน เพื่อไม่ให้เบสขุ่น', () => {
  const song = createDefaultSong();
  song.sections[3].instruments.guitarRhythmStyle = 'campfire-strum';
  // ใช้คอร์ด 6 สาย (G) เพื่อพิสูจน์ว่าอัปสโตรกไม่ดีดครบ 6 สาย
  song.sections[3].bars[0].chords = ['G'];
  song.sections[3].bars[0].chordsPerBar = 1;

  const flat = flattenSong(song);
  const chorusStart = flat.findIndex((f) => f.sectionIndex === 3);
  const planned = planBar(song, flat, chorusStart);
  const r = trackNotes(planned.events, 'guitarRhythm');
  const { stepSec } = planned.timing;

  // Downstroke step 0: G เต็ม 6 สาย (ต่ำ→สูง)
  const down0 = r.filter((e) => e.t < 0.25);
  assert.equal(down0.length, 6, 'Downstroke คอร์ด G ต้องดีด 6 สาย');
  for (let k = 1; k < down0.length; k++) {
    assert.ok(down0[k].midi > down0[k - 1].midi);
  }

  // Upstrokes steps 6, 10, 14 in 4/4: แต่ละครั้งต้องไม่เกิน 3 สายแหลม (และต้องไม่มีสายเบสต่ำ)
  for (const upStep of [6, 10, 14]) {
    const upNotes = r.filter((e) => e.t >= upStep * stepSec - 0.02 && e.t < upStep * stepSec + 0.2);
    assert.ok(upNotes.length >= 1 && upNotes.length <= 3, `step ${upStep} emitted ${upNotes.length} notes`);
    for (const n of upNotes) {
      assert.ok(n.midi >= 55, `อัปสโตรก step ${upStep} ต้องเป็นสายแหลม (midi=${n.midi} >= 55)`);
    }
    for (let k = 1; k < upNotes.length; k++) {
      assert.ok(upNotes[k].midi < upNotes[k - 1].midi, `step ${upStep} ต้องไล่จากสูงลงต่ำ`);
    }
  }
});

// ───────────────────────── 3. Auto-Embellishment (sus4 / add9) ─────────────────────────

test('Auto-Embellishment: ห้อง 1 คอร์ด เติมหางเสียง sus4/add9 บนอัปสโตรกท้ายห้องแบบธรรมชาติ', () => {
  const song = createDefaultSong();
  song.sections[3].instruments.guitarRhythmStyle = 'campfire-strum';
  song.sections[3].bars[0].chords = ['D']; // D top 3 strings = [57(A3), 62(D4), 66(F#4)] -> F#4+1 = G4(67) Dsus4
  song.sections[3].bars[0].chordsPerBar = 1;

  const flat = flattenSong(song);
  const chorusStart = flat.findIndex((f) => f.sectionIndex === 3);
  const planned = planBar(song, flat, chorusStart);
  const r = trackNotes(planned.events, 'guitarRhythm');
  const { stepSec } = planned.timing;

  const midUp = r.filter((e) => e.t >= 6 * stepSec - 0.02 && e.t < 6 * stepSec + 0.2).map((e) => e.midi);
  const lateUp = r.filter((e) => e.t >= 14 * stepSec - 0.02 && e.t < 14 * stepSec + 0.2).map((e) => e.midi);

  assert.ok(midUp.includes(66), 'อัปสโตรกกลางห้องยังคง F#4 (66)');
  assert.ok(lateUp.includes(67), 'อัปสโตรกท้ายห้องเติม sus4 (F#4 -> G4 = 67)');
});

// ───────────────────────── 4. Walking Bass Approach Notes ─────────────────────────

test('Walking Bass: ยึดโน้ต Slash Bass และเล่น Approach Note ช่วงท้ายห้องก่อนเปลี่ยนคอร์ด', () => {
  const song = createDefaultSong();
  const chorusIdx = 3;
  // กำหนดห้องแรก = C/G, ห้องสอง = Am7, ห้องสาม = Am7 (ซ้ำคอร์ดเดิม)
  song.sections[chorusIdx].instruments.bass = true;
  song.sections[chorusIdx].instruments.bassStyle = 'root-fifth';
  song.sections[chorusIdx].bars[0].chords = ['C/G'];
  song.sections[chorusIdx].bars[0].chordsPerBar = 1;
  song.sections[chorusIdx].bars[0].playStyle = 'normal';
  song.sections[chorusIdx].bars[1].chords = ['Am7'];
  song.sections[chorusIdx].bars[1].chordsPerBar = 1;
  song.sections[chorusIdx].bars[1].playStyle = 'normal';
  song.sections[chorusIdx].bars[2].chords = ['Am7'];
  song.sections[chorusIdx].bars[2].chordsPerBar = 1;
  song.sections[chorusIdx].bars[2].playStyle = 'normal';

  const flat = flattenSong(song);
  const chorusStart = flat.findIndex((f) => f.sectionIndex === chorusIdx);

  // ห้อง 0: C/G -> Am7 (คอร์ดเปลี่ยน)
  const bar0 = planBar(song, flat, chorusStart);
  const bass0 = trackNotes(bar0.events, 'bass');
  const { stepSec, stepsPerBar } = bar0.timing;

  // โน้ตแรกของ C/G ต้องยึด G1 (MIDI 31) ไม่ใช่ C2 (36)
  assert.equal(bass0[0].midi, 31, 'C/G ต้องยึดเบสที่ G1 (31)');
  assert.ok(bass0.length >= 3, 'ต้องมี Root, Fifth และ Approach Note ท้ายห้อง');

  const approachNote = bass0[bass0.length - 1];
  const expectedWalkT = (stepsPerBar - 2) * stepSec;
  assert.ok(
    Math.abs(approachNote.t - expectedWalkT) < 0.02,
    `Approach note ต้องเกิดที่ท้ายห้อง (~${expectedWalkT.toFixed(2)}s, got ${approachNote.t.toFixed(2)}s)`
  );
  // Am7 root = A1 (33): approach note ก่อนถึง A1 คือ G#1 (32 = 33 - 1) หรือ B1 (35 = 33 + 2)
  assert.ok([32, 34, 35].includes(approachNote.midi), `Approach note=${approachNote.midi} ต้องนำเข้าสู่ A1(33)`);

  // ห้อง 1: Am7 -> Am7 (คอร์ดไม่เปลี่ยน → ไม่มี walking approach note ท้ายห้อง)
  const bar1 = planBar(song, flat, chorusStart + 1);
  const bass1 = trackNotes(bar1.events, 'bass');
  assert.equal(bass1.length, 2, 'เมื่อห้องถัดไปคอร์ดเดิม ไม่ควรแทรก Approach Note เกินจำเป็น');
});

// ───────────────────────── 5. Outro Ritardando & Final Sweep ─────────────────────────

test('Outro Ritardando: ห้องสุดท้ายของเพลงขยายช่องว่างการกรีดสาย 38–52ms และลากหางเสียง ≥ 2.6 วินาที', () => {
  const song = createDefaultSong();
  song.sections[song.sections.length - 1].instruments.guitarRhythmStyle = 'soft-strum';
  const flat = flattenSong(song);
  const lastIdx = flat.length - 1;

  const endPlan = planBar(song, flat, lastIdx);
  const r = trackNotes(endPlan.events, 'guitarRhythm');
  assert.ok(r.length >= 4);

  // ดึงโน้ตของคอร์ดสุดท้ายที่กรีดแบบช้าลง (กลุ่มเวลาสุดท้าย)
  const chordVoicing = getGuitarVoicing(song.sections[song.sections.length - 1].bars.slice(-1)[0].chords[0], song.capoFret);
  const finalSweep = r.slice(-chordVoicing.strings.length);
  for (let k = 1; k < finalSweep.length; k++) {
    const gapMs = (finalSweep[k].t - finalSweep[k - 1].t) * 1000;
    assert.ok(gapMs >= 37.9 && gapMs <= 52.1, `Outro sweep gap=${gapMs.toFixed(2)}ms ต้องอยู่ในช่วง 38–52ms`);
  }
  assert.ok(finalSweep[0].dur >= 2.6, `Final outro note dur=${finalSweep[0].dur.toFixed(2)}s ต้องลากหางเสียง ≥ 2.6s`);
});

// ───────────────────────── 6. Vocal Studio DSP Chain ─────────────────────────

test('Vocal Studio DSP: VocalStudioTrackGainNode และ mp3Exporter มี HPF 95Hz + Presence 3.8kHz + Vocal Comp', () => {
  const createdBiquads: Array<{ type: string; frequency: { value: number }; gain: { value: number }; Q: { value: number }; connect: (d: unknown) => unknown; disconnect: () => void }> = [];
  const createdComps: Array<{ threshold: { setValueAtTime: (v: number) => void; value?: number }; ratio: { setValueAtTime: (v: number) => void; value?: number }; attack: { setValueAtTime: (v: number) => void; value?: number }; release: { setValueAtTime: (v: number) => void; value?: number }; knee: { setValueAtTime: (v: number) => void }; connect: (d: unknown) => unknown; disconnect: () => void }> = [];
  const edges: Array<[unknown, unknown]> = [];
  const makeNode = (kind: string) => ({
    kind,
    connect: (dest: unknown) => {
      edges.push([kind, (dest as { kind?: string })?.kind ?? dest]);
      return dest;
    },
    disconnect: () => {},
  });

  const mockCtx = {
    currentTime: 0,
    createGain: () => ({ ...makeNode('gain'), gain: { value: 1, setValueAtTime: () => {}, setTargetAtTime: () => {}, cancelScheduledValues: () => {}, linearRampToValueAtTime: () => {} } }),
    createStereoPanner: () => ({ ...makeNode('panner'), pan: { value: 0 } }),
    createBiquadFilter: () => {
      const idx = createdBiquads.length;
      const node = {
        ...makeNode(`biquad_${idx}`),
        type: 'lowpass',
        frequency: { value: 0 },
        gain: { value: 0 },
        Q: { value: 0 },
      };
      createdBiquads.push(node);
      return node;
    },
    createDynamicsCompressor: () => {
      const node = {
        ...makeNode('comp'),
        threshold: { value: 0, setValueAtTime(v: number) { this.value = v; } },
        knee: { value: 0, setValueAtTime(v: number) { this.value = v; } },
        ratio: { value: 0, setValueAtTime(v: number) { this.value = v; } },
        attack: { value: 0, setValueAtTime(v: number) { this.value = v; } },
        release: { value: 0, setValueAtTime(v: number) { this.value = v; } },
      };
      createdComps.push(node);
      return node;
    },
  } as unknown as AudioContext;

  const destNode = makeNode('masterBus') as unknown as AudioNode;
  const vocalNode = new VocalStudioTrackGainNode(mockCtx, destNode, 95, 0);

  assert.equal(createdBiquads.length, 2, 'ต้องสร้าง BiquadFilter 2 ตัว (HPF + Presence EQ)');
  assert.equal(createdBiquads[0].type, 'highpass');
  assert.equal(createdBiquads[0].frequency.value, 95);
  assert.equal(createdBiquads[1].type, 'peaking');
  assert.equal(createdBiquads[1].frequency.value, 3800);
  assert.equal(createdBiquads[1].gain.value, 2.5);
  assert.equal(createdBiquads[1].Q.value, 1.1);

  assert.equal(createdComps.length, 1, 'ต้องสร้าง Vocal DynamicsCompressorNode');
  assert.equal(createdComps[0].threshold.value, -18);
  assert.equal(createdComps[0].ratio.value, 4);
  assert.equal(createdComps[0].attack.value, 0.008);
  assert.equal(createdComps[0].release.value, 0.12);

  // ต้องต่อ chain input -> biquad_0 -> biquad_1 -> comp -> masterGain
  assert.ok(edges.some(([a, b]) => a === 'biquad_0' && b === 'biquad_1'));
  assert.ok(edges.some(([a, b]) => a === 'biquad_1' && b === 'comp'));
  assert.ok(edges.some(([a, b]) => a === 'comp' && b === 'gain'));
  vocalNode.disconnect();

  // ตรวจ mirror ใน mp3Exporter.ts และ ChordPickerModal.tsx
  const exporterSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'mp3Exporter.ts'), 'utf-8');
  assert.ok(exporterSrc.includes("tr === 'vocal'"), 'mp3Exporter ต้องจัดการ DSP chain ให้ track vocal');
  assert.ok(exporterSrc.includes('3800') && exporterSrc.includes('95'), 'mp3Exporter ต้องมี HPF 95Hz และ EQ 3.8kHz');

  const pickerSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ChordPickerModal.tsx'), 'utf-8');
  for (const bassNote of ['E', 'F#', 'G', 'A', 'B', 'C', 'D']) {
    assert.ok(pickerSrc.includes(`'${bassNote}'`), `ChordPickerModal ต้องมีปุ่ม Slash Bass /${bassNote}`);
  }
});
