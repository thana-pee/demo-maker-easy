/**
 * Phase 1B — ทดสอบตรรกะเสียงที่ "ไม่ต้องใช้ลำโพง" (Evidence Level 2: Automated)
 *
 * รัน:  npx tsx --test tests/phase1b.test.ts
 *
 * ทดสอบเฉพาะ guitarVoicings + barPlanner (pure functions)
 * การฟังเสียงจริง / มิติ 3D / ความเพราะ เป็น [HUMAN] checkpoint ที่ต้องให้เจ้าของโปรเจกต์ฟังเอง
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultSong } from '../src/lib/defaultSong';
import { getGuitarVoicing, parseChordSymbol, chordIntervals } from '../src/lib/guitarVoicings';
import {
  flattenSong,
  getTiming,
  planBar,
  planCountIn,
  isTrackOn,
  STRUM_GAP_MS,
  type PlannedEvent,
  type TrackId,
} from '../src/lib/barPlanner';
import type { SongProject, TimeSignature } from '../src/types/song';

type NoteEv = Extract<PlannedEvent, { kind: 'note' }>;
type DrumEv = Extract<PlannedEvent, { kind: 'drum' }>;

const notes = (evs: PlannedEvent[], track: TrackId) =>
  evs.filter((e): e is NoteEv => e.kind === 'note' && e.track === track);
const drums = (evs: PlannedEvent[]) => evs.filter((e): e is DrumEv => e.kind === 'drum');

function sectionStart(song: SongProject, sectionIndex: number): number {
  return flattenSong(song).find((f) => f.sectionIndex === sectionIndex && f.isFirstOfSection)!.index;
}
function sectionEnd(song: SongProject, sectionIndex: number): number {
  return flattenSong(song).find((f) => f.sectionIndex === sectionIndex && f.isLastOfSection)!.index;
}
// default song: 0 Intro, 1 Verse, 2 Pre-Chorus, 3 Chorus, 4 Solo, 5 Bridge, 6 Chorus2, 7 Outro

// ───────────────────────── Guitar voicings ─────────────────────────

test('คอร์ดเปิด C / G / F ได้โน้ตตรงกับกีตาร์จริง', () => {
  assert.deepEqual(getGuitarVoicing('C').strings.map((s) => s.midi), [48, 52, 55, 60, 64]);
  assert.deepEqual(getGuitarVoicing('G').strings.map((s) => s.midi), [43, 47, 50, 55, 59, 67]);
  assert.deepEqual(getGuitarVoicing('F').strings.map((s) => s.midi), [41, 48, 53, 57, 60, 65]);
});

test('ฟอร์มเลื่อน Bb = A-form เฟร็ต 1 → Bb F Bb D F', () => {
  assert.deepEqual(getGuitarVoicing('Bb').strings.map((s) => s.midi), [46, 53, 58, 62, 65]);
});

test('ทุก root × ทุกคุณภาพ: เสียงที่ดีดเป็นโน้ตในคอร์ดทั้งหมด (ไม่มีโน้ตเพี้ยน)', () => {
  const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const quals = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', 'add9'];
  for (const r of roots) {
    for (const q of quals) {
      const chord = r + q;
      const p = parseChordSymbol(chord);
      const allowed = new Set(chordIntervals(p.quality).map((iv) => (p.pc + iv) % 12));
      const v = getGuitarVoicing(chord);
      assert.ok(v.strings.length >= 4, `${chord} ต้องมีอย่างน้อย 4 สาย`);
      for (const s of v.strings) {
        assert.ok(allowed.has(s.midi % 12), `${chord}: โน้ต ${s.midi} (pc ${s.midi % 12}) ไม่อยู่ในคอร์ด`);
      }
      // โน้ตต่ำสุดเป็น root ยกเว้นฟอร์มที่ตั้งใจกลับสาย (ไม่มีในตารางนี้)
      assert.equal(v.strings[0].midi % 12, p.pc, `${chord}: เบสต้องเป็น root`);
    }
  }
});

test('Capo: เสียงจริงต้องเท่าเดิมทุกคอร์ด แต่ฟอร์มที่จับเปลี่ยนตามที่ Capo Helper แสดง', () => {
  const roots = ['C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'];
  for (const capo of [1, 2, 3, 5, 7]) {
    for (const r of roots) {
      const p = parseChordSymbol(r);
      const allowed = new Set(chordIntervals(p.quality).map((iv) => (p.pc + iv) % 12));
      const v = getGuitarVoicing(r, capo);
      for (const s of v.strings) assert.ok(allowed.has(s.midi % 12), `${r} capo${capo}: ${s.midi}`);
      assert.equal(v.strings[0].midi % 12, p.pc);
    }
  }
  // ตัวอย่างในสเปก: เสียงจริง D คาด Capo 2 → จับรูป C แล้วบวก 2 เฟร็ต
  const d = getGuitarVoicing('D', 2);
  assert.equal(d.fingering, 'C');
  assert.deepEqual(d.strings.map((s) => s.midi), [50, 54, 57, 62, 66]);
});

// ───────────────────────── Timing ─────────────────────────

test('Timing ของ 4/4, 3/4, 6/8', () => {
  const s = createDefaultSong();
  const t44 = getTiming(s);
  assert.equal(t44.stepsPerBar, 16);
  assert.ok(Math.abs(t44.barSec - (4 * 60) / 74) < 1e-9);
  s.timeSignature = '3/4';
  assert.equal(getTiming(s).uiBeatsPerBar, 3);
  assert.ok(Math.abs(getTiming(s).barSec - (3 * 60) / 74) < 1e-9);
  s.timeSignature = '6/8';
  assert.equal(getTiming(s).uiBeatsPerBar, 6);
  assert.ok(Math.abs(getTiming(s).barSec - (2 * 60) / 74) < 1e-9);
});

// ───────────────────────── Determinism & sanity ─────────────────────────

test('วางแผนซ้ำกี่ครั้งผลต้องเหมือนเดิมทุกไบต์ (ฟังซ้ำ/เรนเดอร์ MP3 ได้ตรงกัน)', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  for (const i of [0, 5, 12, 20, flat.length - 1]) {
    assert.equal(JSON.stringify(planBar(s, flat, i)), JSON.stringify(planBar(s, flat, i)));
  }
});

for (const ts of ['4/4', '3/4', '6/8'] as TimeSignature[]) {
  test(`ทุกห้องของเพลงเริ่มต้นใน ${ts}: เวลา/ความยาว/น้ำหนักอยู่ในช่วงที่ถูกต้อง ไม่มี NaN`, () => {
    const s = createDefaultSong();
    s.timeSignature = ts;
    const flat = flattenSong(s);
    let total = 0;
    flat.forEach((_, i) => {
      const p = planBar(s, flat, i);
      for (const e of p.events) {
        total++;
        assert.ok(Number.isFinite(e.t) && e.t >= 0, `bar ${i}: t=${e.t}`);
        if (e.kind === 'note') {
          assert.ok(e.dur > 0 && Number.isFinite(e.dur), `bar ${i}: dur=${e.dur}`);
          assert.ok(e.vel >= 1 && e.vel <= 127, `bar ${i}: vel=${e.vel}`);
          assert.ok(e.midi >= 24 && e.midi <= 100, `bar ${i}: midi=${e.midi}`);
          assert.ok(e.t < p.timing.barSec, `bar ${i}: โน้ตเริ่มหลังจบห้อง`);
        }
        if (e.kind === 'drum') {
          assert.ok(e.vel >= 1 && e.vel <= 127);
          assert.ok(e.t < p.timing.barSec);
        }
      }
    });
    assert.ok(total > 500, `เพลงทั้งเพลงควรมีเหตุการณ์มากกว่า 500 (ได้ ${total})`);
  });
}

// ───────────────────────── Strum physics ─────────────────────────

test('Strum: หน่วงทีละสาย 18–32ms ตามทิศทาง ลงจากเบส / ขึ้นจากสายแหลม', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const i = sectionStart(s, 3); // Chorus: campfire strum
  const p = planBar(s, flat, i);
  const r = notes(p.events, 'guitarRhythm');
  assert.ok(r.length > 6);

  // ดาวน์สโตรกแรก (ห้องฮุกห้องแรก = C/G: คอร์ดแรก C = 5 สาย)
  const first = r.slice(0, 5);
  for (let k = 1; k < first.length; k++) {
    const gap = (first[k].t - first[k - 1].t) * 1000;
    assert.ok(gap >= 18 - 0.01 && gap <= 32 + 0.01, `gap สายที่ ${k} = ${gap.toFixed(2)}ms`);
    assert.ok(first[k].midi > first[k - 1].midi, 'ดาวน์สโตรกต้องไล่จากสายต่ำไปสูง');
  }
  // อัปสโตรกที่ step 6: ไล่จากสายสูงลงต่ำ (Phase 4B Zone Strumming: แปรงเฉพาะ 3 สายแหลมบน)
  const stepSec = p.timing.stepSec;
  const up = r.filter((e) => e.t >= 6 * stepSec - 0.02 && e.t < 6 * stepSec + 0.2);
  assert.equal(up.length, 3);
  for (let k = 1; k < up.length; k++) assert.ok(up[k].midi < up[k - 1].midi, 'อัปสโตรกต้องไล่จากสายสูงลงต่ำ');

  // เพดานของสเปก
  assert.ok(STRUM_GAP_MS.campfire[0] >= 18 && STRUM_GAP_MS.soft[1] <= 32 && STRUM_GAP_MS.ring[1] <= 32);
});

test('น้ำหนักมือสุ่มเล็กน้อย: โน้ตสาย/จังหวะเดียวกันไม่ได้ดังเท่ากันเป๊ะ (ไม่เหมือนหุ่นยนต์)', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const vels = new Set<number>();
  for (let i = sectionStart(s, 3); i <= sectionEnd(s, 3); i++) {
    notes(planBar(s, flat, i).events, 'guitarRhythm').forEach((e) => vels.add(e.vel));
  }
  assert.ok(vels.size > 15, `มีระดับ velocity ต่างกัน ${vels.size} ค่า`);
});

// ───────────────────────── Let Ring / Break ─────────────────────────

test('Let Ring: ดีดครั้งเดียวแล้วค้างทั้งห้อง (ไม่ตีรัวตามแพตเทิร์น)', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const i = sectionEnd(s, 1); // ห้องสุดท้ายของ Verse 1 = G, let-ring
  assert.equal(flat[i].bar.playStyle, 'let-ring');
  const p = planBar(s, flat, i);
  const r = notes(p.events, 'guitarRhythm');
  assert.equal(r.length, getGuitarVoicing('G').strings.length, 'ต้องมีแค่ 1 strum');
  for (const e of r) assert.ok(e.dur > p.timing.barSec * 0.9, `dur ${e.dur} ควรค้างทั้งห้อง`);
});

test('Break: เสียงหยุดครึ่งหลังของห้อง และโน้ตไม่ลากข้ามจุดหยุด', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const i = sectionStart(s, 3) + 1;
  s.sections[3].bars[1].playStyle = 'break';
  const f2 = flattenSong(s);
  const p = planBar(s, f2, i);
  const cut = p.timing.barSec / 2;
  void flat;
  for (const e of p.events) {
    if (e.kind === 'note' || e.kind === 'drum') {
      assert.ok(e.t < cut, `${e.kind} เริ่มที่ ${e.t} หลังจุดหยุด ${cut}`);
      if (e.kind === 'note') assert.ok(e.t + e.dur <= cut + 1e-6, 'โน้ตต้องจบก่อนจุดหยุด');
    }
  }
  assert.ok(p.events.some((e) => e.kind === 'note'), 'ก่อนจุดหยุดยังต้องมีเสียง');
});

// ───────────────────────── Per-section instruments & style ─────────────────────────

test('ปิดเครื่องดนตรีในท่อน → ท่อนนั้นไม่มีเหตุการณ์ของเครื่องนั้นเลย', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const verse = sectionStart(s, 1);
  // Verse 1 ตั้งต้น: ไม่มีเปียโน/กลอง/ลีด
  const p = planBar(s, flat, verse + 1);
  assert.equal(notes(p.events, 'piano').length, 0);
  assert.equal(notes(p.events, 'guitarLead').length, 0);
  assert.equal(drums(p.events).length, 0);
  assert.ok(notes(p.events, 'bass').length > 0);
  // ปิดมิกเซอร์รวมของเบส → หายทุกท่อน
  s.mixer.bass.enabled = false;
  assert.equal(notes(planBar(s, flat, verse + 1).events, 'bass').length, 0);
});

test('เลือกวิธีเล่นประจำท่อนมีผลจริง: fingerpicking ≠ campfire และ Les Paul โซโล่ ≠ riff', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const ch = sectionStart(s, 3);
  const campfire = notes(planBar(s, flat, ch).events, 'guitarRhythm');
  s.sections[3].instruments.guitarRhythmStyle = 'fingerpicking';
  const finger = notes(planBar(s, flattenSong(s), ch).events, 'guitarRhythm');
  assert.notEqual(JSON.stringify(campfire), JSON.stringify(finger));
  assert.ok(finger.length !== campfire.length);

  const so = sectionStart(s, 4);
  const solo = notes(planBar(s, flattenSong(s), so).events, 'guitarLead');
  s.sections[4].instruments.guitarLeadStyle = 'riff-fills';
  const riff = notes(planBar(s, flattenSong(s), so).events, 'guitarLead');
  assert.notEqual(JSON.stringify(solo), JSON.stringify(riff));
});

test('Solo split-slow-fast: ครึ่งหลังโน้ตถี่กว่าครึ่งแรกอย่างชัดเจน', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const a = sectionStart(s, 4);
  const count = (i: number) => notes(planBar(s, flat, i).events, 'guitarLead').length;
  const slow = [0, 1, 2, 3].reduce((n, k) => n + count(a + k), 0);
  const fast = [4, 5, 6, 7].reduce((n, k) => n + count(a + k), 0);
  assert.ok(fast > slow * 1.8, `slow=${slow} fast=${fast}`);
});

// ───────────────────────── Transitions: fills / pickups / ring-out ─────────────────────────

test('ลูกส่งกลอง: ห้องสุดท้ายก่อน Chorus (กลองเข้า) มี Shaker crescendo + Cajon slap นำ 2 แปะ', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const last = sectionEnd(s, 2); // Pre-Chorus (ไม่มีกลอง)
  const p = planBar(s, flat, last);
  const d = drums(p.events);
  const sh = d.filter((e) => e.voice === 'shaker');
  assert.ok(sh.length >= 5, `shaker ${sh.length}`);
  for (let k = 1; k < sh.length; k++) assert.ok(sh[k].vel >= sh[k - 1].vel, 'ต้อง crescendo (ดังขึ้นเรื่อยๆ)');
  const gapEarly = sh[1].t - sh[0].t;
  const gapLate = sh[sh.length - 1].t - sh[sh.length - 2].t;
  assert.ok(gapLate < gapEarly, 'ต้องถี่ขึ้นท้ายห้อง');
  assert.equal(d.filter((e) => e.voice === 'cajonSlap').length, 2);
  assert.ok(sh[0].t >= p.timing.barSec / 2 - 0.05, 'ลูกส่งเริ่มครึ่งหลังของห้อง ไม่ใช่ทั้งห้อง');
  // ห้องก่อนหน้าในท่อนเดียวกันต้องไม่มีกลอง
  assert.equal(drums(planBar(s, flat, last - 1).events).length, 0);
  // ห้องแรกของ Chorus: กลองเข้าพร้อมเน้นจังหวะ 1 และเปิดเสียง (restore)
  const c = planBar(s, flat, last + 1);
  assert.ok(drums(c.events).some((e) => e.voice === 'shaker' && e.t < 0.01 && e.vel >= 90));
  assert.ok(c.events.some((e) => e.kind === 'restore' && e.track === 'drums'));
});

test('กีตาร์ลีด (Les Paul) มีโน้ตส่ง chromatic เข้าหาโน้ตแรกจริงของท่อนถัดไป', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const last = sectionEnd(s, 2);
  const pickup = notes(planBar(s, flat, last).events, 'guitarLead');
  assert.equal(pickup.length, 2);
  const next = notes(planBar(s, flat, last + 1).events, 'guitarLead').find((e) => e.t < 0.2)!;
  assert.equal(pickup[0].midi, next.midi - 2);
  assert.equal(pickup[1].midi, next.midi - 1);
  assert.ok(pickup[0].t >= planBar(s, flat, last).timing.barSec * 0.7);
});

test('ห้ามตัดหางเสียงดื้อๆ: เครื่องที่ออกในท่อนถัดไปต้อง ring-out ข้ามเส้นห้อง + fade', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const last = sectionEnd(s, 6); // Chorus สุดท้าย → Outro (เหลือแค่กีตาร์)
  const p = planBar(s, flat, last);
  for (const tr of ['bass', 'piano', 'drums'] as TrackId[]) {
    const fade = p.events.find((e) => e.kind === 'fade' && e.track === tr);
    assert.ok(fade, `${tr} ต้องมี fade-out`);
  }
  assert.ok(!p.events.some((e) => e.kind === 'fade' && e.track === 'guitarRhythm'), 'กีตาร์ยังเล่นต่อ ห้าม fade');
  const piano = notes(p.events, 'piano');
  assert.ok(piano.some((e) => e.t + e.dur > p.timing.barSec + 0.3), 'เปียโนต้องกังวานข้ามเข้าท่อนใหม่');
  // ห้ามมีโน้ตใหม่ของเครื่องที่ออกในห้องถัดไป
  const nextP = planBar(s, flat, last + 1);
  assert.equal(notes(nextP.events, 'piano').length, 0);
});

test('จบเพลง: ทุกเครื่องที่เล่นอยู่ ring-out ≥ 2 วินาที', () => {
  const s = createDefaultSong();
  const flat = flattenSong(s);
  const p = planBar(s, flat, flat.length - 1);
  const fades = p.events.filter((e) => e.kind === 'fade');
  assert.ok(fades.length >= 2);
  for (const f of fades) if (f.kind === 'fade') assert.ok(f.dur >= 2);
});

// ───────────────────────── Gauge / Transpose / Count-in ─────────────────────────

test('เบอร์สาย: .012 หางเสียงยาวกว่า .010 ราว 25%+ และหัวโน้ตหนักกว่า', () => {
  const heavy = createDefaultSong();
  heavy.stringGauge = 'heavy-012';
  const light = createDefaultSong();
  light.stringGauge = 'standard-010';
  const fh = flattenSong(heavy);
  const fl = flattenSong(light);
  const i = sectionStart(heavy, 3);
  const h = notes(planBar(heavy, fh, i).events, 'guitarRhythm');
  const l = notes(planBar(light, fl, i).events, 'guitarRhythm');
  const avg = (a: NoteEv[], k: 'dur' | 'vel') => a.reduce((n, e) => n + e[k], 0) / a.length;
  assert.ok(avg(h, 'dur') / avg(l, 'dur') > 1.25, 'dur ratio');
  assert.ok(avg(h, 'vel') > avg(l, 'vel'), 'vel');
});

test('Transpose เปลี่ยนระดับเสียงจริง แต่ Capo ไม่เปลี่ยนเสียงจริง', () => {
  const base = createDefaultSong();
  const flat = flattenSong(base);
  const i = sectionStart(base, 1); // Verse: fingerpicking บน C
  const pitchClasses = (s: SongProject) =>
    new Set(notes(planBar(s, flattenSong(s), i).events, 'guitarRhythm').map((e) => e.midi % 12));
  const c = pitchClasses(base);
  const up2 = createDefaultSong();
  up2.transposeSemitones = 2;
  assert.deepEqual([...pitchClasses(up2)].sort(), [...c].map((x) => (x + 2) % 12).sort());
  const capo = createDefaultSong();
  capo.capoFret = 3;
  assert.deepEqual([...pitchClasses(capo)].sort(), [...c].sort());
  void flat;
});

test('Count-in: 4/4 = 4 คลิก (เน้นแรก), 3/4 = 3 คลิก, 6/8 = 6 คลิก', () => {
  const s = createDefaultSong();
  const n = (ts: TimeSignature) => {
    s.timeSignature = ts;
    return planCountIn(s);
  };
  const a = n('4/4');
  assert.equal(a.length, 4);
  assert.ok((a[0] as DrumEv).vel > (a[1] as DrumEv).vel);
  assert.equal(n('3/4').length, 3);
  assert.equal(n('6/8').length, 6);
});

test('isTrackOn: ต้องเปิดทั้งมิกเซอร์รวมและสวิตช์ประจำท่อน; กลอง off ปิดทุกท่อน', () => {
  const s = createDefaultSong();
  const ch = s.sections[3];
  assert.equal(isTrackOn(s, ch, 'drums'), true);
  s.mixer.drums.style = 'off';
  assert.equal(isTrackOn(s, ch, 'drums'), false);
  s.mixer.drums.style = 'shaker-cajon';
  ch.instruments.drums = false;
  assert.equal(isTrackOn(s, ch, 'drums'), false);
});
