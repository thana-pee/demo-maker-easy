/**
 * mp3Exporter.ts — ตัวเรนเดอร์และส่งออกไฟล์เสียง 3D Stereo .MP3 / .WAV คุณภาพสูง
 *
 * ทำงานในเบราว์เซอร์ 100%:
 *  - เรนเดอร์เสียงทุกเครื่องดนตรี (กีตาร์ริทึ่ม, กีตาร์ลีด Les Paul, เบส, เปียโน, กลอง, เมโลดี้)
 *  - รวมเสียงร้องจริงจากไมค์ (Recorded Vocal Scratchpad) ตามตำแหน่งห้องเพลง + ชดเชย Latency Offset
 *  - จำลองมิติห้อง 3D (Living Room / Wood Studio / Unplugged Hall)
 *  - บีบอัดเป็น MP3 สเตอริโอ 192kbps ด้วย @breezystack/lamejs
 */

import { SongProject } from '../types/song';
import { planBar, flattenSong, getTiming, isTrackOn } from './barPlanner';

/** แปลง Float32Array [-1.0, 1.0] เป็น Int16Array [-32768, 32767] สำหรับ MP3 Encoder */
function float32ToInt16(samples: Float32Array): Int16Array {
  const output = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/** แปลง AudioBuffer เป็นไฟล์ MP3 Binary (Uint8Array) ด้วย LAME MP3 Encoder */
export async function audioBufferToMp3(
  audioBuffer: AudioBuffer,
  kbps = 192,
  onProgress?: (pct: number) => void
): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const left = float32ToInt16(audioBuffer.getChannelData(0));
  const right = channels > 1 ? float32ToInt16(audioBuffer.getChannelData(1)) : left;

  const sampleBlockSize = 1152;
  const mp3Data: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = left.subarray(i, i + sampleBlockSize);
    const rightChunk = right.subarray(i, i + sampleBlockSize);
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf));
    }
    if (onProgress && i % (sampleBlockSize * 15) === 0) {
      const pct = Math.round((i / left.length) * 40) + 60; // 60% to 100%
      onProgress(Math.min(99, pct));
    }
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Data.push(new Uint8Array(flushBuf));
  }

  const totalLength = mp3Data.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Data) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** สร้าง Impulse Response สำหรับ Reverb จำลองห้อง 3D */
function createRoomReverb(ctx: BaseAudioContext, mode: string): AudioNode {
  const convolver = ctx.createConvolver();
  const rate = ctx.sampleRate;
  let decaySec = 1.2;
  let preDelaySec = 0.015;

  if (mode === 'living-room') {
    decaySec = 0.8;
    preDelaySec = 0.01;
  } else if (mode === 'unplugged-hall') {
    decaySec = 2.4;
    preDelaySec = 0.03;
  }

  const length = Math.floor(rate * decaySec);
  const impulse = ctx.createBuffer(2, length, rate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / rate;
    if (t < preDelaySec) {
      left[i] = 0;
      right[i] = 0;
    } else {
      const factor = Math.exp(-(t - preDelaySec) * (3.5 / decaySec));
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
  }
  convolver.buffer = impulse;
  return convolver;
}

/**
 * เรนเดอร์เพลงทั้งหมดใน OfflineAudioContext
 */
export async function renderSongToAudioBuffer(
  song: SongProject,
  onProgress?: (pct: number) => void
): Promise<AudioBuffer> {
  const timing = getTiming(song);
  const flat = flattenSong(song);
  if (flat.length === 0) {
    throw new Error('ไม่พบห้องเพลงสำหรับเรนเดอร์');
  }

  onProgress?.(5);

  const sampleRate = 44100;
  const totalDuration = flat.length * timing.barSec + 3.0; // เผื่อ tail เสียงสะท้อน 3 วินาที
  const totalFrames = Math.ceil(totalDuration * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

  // Master Gain & Reverb Bus & Mastering Compressor
  const masterCompressor = offlineCtx.createDynamicsCompressor();
  masterCompressor.threshold.setValueAtTime(-12, 0);
  masterCompressor.knee.setValueAtTime(8, 0);
  masterCompressor.ratio.setValueAtTime(3.5, 0);
  masterCompressor.attack.setValueAtTime(0.015, 0);
  masterCompressor.release.setValueAtTime(0.12, 0);

  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.95;

  const reverbBus = createRoomReverb(offlineCtx, song.ambience3D || 'wood-studio');
  const reverbGain = offlineCtx.createGain();
  reverbGain.gain.value = song.ambience3D === 'unplugged-hall' ? 0.35 : song.ambience3D === 'wood-studio' ? 0.22 : 0.12;

  masterGain.connect(masterCompressor);
  masterGain.connect(reverbBus);
  reverbBus.connect(reverbGain);
  reverbGain.connect(masterCompressor);
  masterCompressor.connect(offlineCtx.destination);

  // Tracks gain & panning
  const trackGains: Record<string, GainNode> = {};
  const tracks = ['guitarRhythm', 'guitarLead', 'bass', 'piano', 'drums', 'melody', 'vocal'] as const;

  const trackPan: Record<string, number> = {
    guitarRhythm: -0.35,
    guitarLead: 0.35,
    bass: 0.0,
    piano: -0.2,
    drums: 0.0,
    melody: 0.0,
    vocal: 0.0,
  };

  for (const tr of tracks) {
    const gain = offlineCtx.createGain();
    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = trackPan[tr] || 0;

    let vol = 85;
    if (tr === 'guitarRhythm') vol = song.mixer.guitarRhythm.volume;
    else if (tr === 'guitarLead') vol = song.mixer.guitarLead.volume;
    else if (tr === 'bass') vol = song.mixer.bass.volume;
    else if (tr === 'piano') vol = song.mixer.piano.volume;
    else if (tr === 'drums') vol = song.mixer.drums.volume;
    else if (tr === 'melody') vol = song.mixer.melody?.volume ?? 85;
    else if (tr === 'vocal') vol = song.mixer.vocal?.volume ?? 95;

    gain.gain.value = (vol / 127) ** 1.5;

    if (tr === 'guitarRhythm') {
      const bodyFilter = offlineCtx.createBiquadFilter();
      if (song.guitarModel === 'classical-nylon') {
        bodyFilter.type = 'peaking';
        bodyFilter.frequency.value = 230;
        bodyFilter.gain.value = 3.2;
      } else if (song.guitarModel === 'ovation-roundback') {
        bodyFilter.type = 'peaking';
        bodyFilter.frequency.value = 3800;
        bodyFilter.gain.value = 3.5;
      } else {
        bodyFilter.type = 'peaking';
        bodyFilter.frequency.value = 115;
        bodyFilter.gain.value = song.stringGauge === 'heavy-012' ? 3.0 : 2.2;
      }
      gain.connect(bodyFilter);
      bodyFilter.connect(panner);
    } else if (tr === 'vocal') {
      const hpf = offlineCtx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 95;
      hpf.Q.value = 0.707;

      const presenceEq = offlineCtx.createBiquadFilter();
      presenceEq.type = 'peaking';
      presenceEq.frequency.value = 3800;
      presenceEq.gain.value = 2.5;
      presenceEq.Q.value = 1.1;

      const vocalComp = offlineCtx.createDynamicsCompressor();
      vocalComp.threshold.setValueAtTime(-18, 0);
      vocalComp.knee.setValueAtTime(6, 0);
      vocalComp.ratio.setValueAtTime(4, 0);
      vocalComp.attack.setValueAtTime(0.008, 0);
      vocalComp.release.setValueAtTime(0.12, 0);

      gain.connect(hpf);
      hpf.connect(presenceEq);
      presenceEq.connect(vocalComp);
      vocalComp.connect(panner);
    } else {
      gain.connect(panner);
    }

    panner.connect(masterGain);
    trackGains[tr] = gain;
  }

  // วางแผน Schedule เหตุการณ์เสียงทั้งหมด
  let barStartSec = 0;
  for (let barIdx = 0; barIdx < flat.length; barIdx++) {
    const planned = planBar(song, flat, barIdx);
    const fb = flat[barIdx];

    for (const ev of planned.events) {
      const t = barStartSec + ev.t;

      if (ev.kind === 'drum') {
        if (!isTrackOn(song, fb.section, 'drums')) continue;
        const vel = ev.vel / 127;
        const dest = trackGains['drums'];

        // Drum synth (Kick, Snare, Cajon, Shaker, Hat, Crash)
        if (ev.voice === 'kick' || ev.voice === 'cajonThump') {
          const osc = offlineCtx.createOscillator();
          const g = offlineCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(ev.voice === 'cajonThump' ? 125 : 110, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          g.gain.setValueAtTime(vel * 1.1, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + 0.29);
        } else if (ev.voice === 'snare' || ev.voice === 'cajonSlap') {
          const osc = offlineCtx.createOscillator();
          const g = offlineCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260, t);
          g.gain.setValueAtTime(vel * 0.9, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + 0.16);
        } else if (ev.voice === 'shaker' || ev.voice === 'hat') {
          const osc = offlineCtx.createOscillator();
          const filter = offlineCtx.createBiquadFilter();
          const g = offlineCtx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(5000, t);
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(6000, t);
          g.gain.setValueAtTime(vel * 0.35, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(filter); filter.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + 0.07);
        } else if (ev.voice === 'crash') {
          const osc = offlineCtx.createOscillator();
          const g = offlineCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(450, t);
          g.gain.setValueAtTime(vel * 0.8, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
          osc.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + 1.25);
        }
      } else if (ev.kind === 'note') {
        if (!isTrackOn(song, fb.section, ev.track)) continue;

        const freq = 440 * Math.pow(2, (ev.midi - 69) / 12);
        const vel = (ev.vel / 127);
        const dest = trackGains[ev.track] || masterGain;

        if (ev.track === 'melody') {
          // Melody Guide Synthesizer
          const osc = offlineCtx.createOscillator();
          const filter = offlineCtx.createBiquadFilter();
          const g = offlineCtx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2600, t);

          const dur = Math.max(0.1, ev.dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.03);
          g.gain.setValueAtTime(vel * 0.7, t + dur - 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);

          osc.connect(filter); filter.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + dur + 0.1);
        } else if (ev.track === 'bass') {
          // Acoustic Bass Synthesizer
          const osc = offlineCtx.createOscillator();
          const filter = offlineCtx.createBiquadFilter();
          const g = offlineCtx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(450, t);

          const dur = Math.max(0.1, ev.dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vel * 0.85, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur);

          osc.connect(filter); filter.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + dur + 0.05);
        } else if (ev.track === 'piano') {
          // Piano Pad Synthesizer
          const osc1 = offlineCtx.createOscillator();
          const osc2 = offlineCtx.createOscillator();
          const filter = offlineCtx.createBiquadFilter();
          const g = offlineCtx.createGain();

          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(freq, t);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(freq * 1.002, t);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1800, t);
          filter.frequency.exponentialRampToValueAtTime(600, t + ev.dur);

          const dur = Math.max(0.1, ev.dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur);

          osc1.connect(filter); osc2.connect(filter);
          filter.connect(g); g.connect(dest);
          osc1.start(t); osc2.start(t);
          osc1.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
        } else if (ev.track === 'guitarLead') {
          // Les Paul Lead Guitar (Overdrive tube sim)
          const osc = offlineCtx.createOscillator();
          const filter = offlineCtx.createBiquadFilter();
          const g = offlineCtx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, t);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2800, t);

          const dur = Math.max(0.1, ev.dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.02);
          g.gain.setValueAtTime(vel * 0.6, t + dur - 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);

          osc.connect(filter); filter.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + dur + 0.12);
        } else {
          // Acoustic Rhythm Guitar (Plucked string model)
          const osc = offlineCtx.createOscillator();
          const filter = offlineCtx.createBiquadFilter();
          const g = offlineCtx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(3200, t);
          filter.frequency.exponentialRampToValueAtTime(800, t + ev.dur);

          const dur = Math.max(0.08, ev.dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vel * 0.75, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur);

          osc.connect(filter); filter.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + dur + 0.05);
        }
      }
    }

    // Decode and play recorded vocal clip in this bar if available
    if (fb.bar.vocalAudio) {
      try {
        const vocalStartTime = Math.max(0, barStartSec + ((song.vocalLatencyOffsetMs || 0) / 1000));
        // แปลง base64 เป็น ArrayBuffer แล้ว decodeAudioData
        const base64Part = fb.bar.vocalAudio.split(',')[1];
        if (base64Part) {
          const binaryStr = atob(base64Part);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const vocalBuffer = await offlineCtx.decodeAudioData(bytes.buffer.slice(0));
          const vocalSrc = offlineCtx.createBufferSource();
          vocalSrc.buffer = vocalBuffer;
          vocalSrc.connect(trackGains['vocal']);
          vocalSrc.start(vocalStartTime);
        }
      } catch (err) {
        console.warn(`ข้ามการเรนเดอร์เสียงร้องในห้องที่ ${barIdx + 1} เนื่องจากข้อมูลไฟล์ไม่สมบูรณ์:`, err);
      }
    }

    barStartSec += timing.barSec;
  }

  onProgress?.(30);

  // รันการเรนเดอร์ AudioBuffer
  const renderedBuffer = await offlineCtx.startRendering();
  onProgress?.(60);

  return renderedBuffer;
}

/** เรนเดอร์เพลงทั้งหมดและคืนค่าเป็น Blob ไฟล์ MP3 */
export async function exportSongMp3(
  song: SongProject,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const audioBuffer = await renderSongToAudioBuffer(song, onProgress);
  const mp3Bytes = await audioBufferToMp3(audioBuffer, 192, onProgress);
  onProgress?.(100);
  return new Blob([mp3Bytes.buffer as ArrayBuffer], { type: 'audio/mp3' });
}

/** ดาวน์โหลดไฟล์ MP3 ลงเครื่องทันที */
export async function downloadSongMp3(
  song: SongProject,
  onProgress?: (pct: number) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  const blob = await exportSongMp3(song, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = (song.title || 'song').replace(/[^a-zA-Z0-9_\u0E00-\u0E7F-]/g, '_');
  a.download = `${safeTitle}.mp3`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
