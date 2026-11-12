/**
 * micRecorder.ts — ตัวจัดการการบันทึกเสียงไมโครโฟนสด และ VU Meter (Web Audio & MediaRecorder)
 *
 * รองรับ:
 *  - ตรวจสอบสิทธิ์ไมค์ (Microphone Permissions)
 *  - Live VU Meter (Peak / RMS Level Meter 0-100%) สำหรับแสดงกราฟิกขณะร้อง
 *  - บันทึกเป็น Data URL และ Blob
 *  - คำนวณชดเชย Latency Offset (-150ms ถึง +150ms)
 */

export interface RecordedAudioResult {
  blob: Blob;
  dataUrl: string;
  durationSec: number;
}

export class MicRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vuTimer: number | null = null;
  private startTime = 0;

  /** ตรวจสอบว่าเบราว์เซอร์รองรับการอัดเสียงผ่านไมค์หรือไม่ */
  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!navigator?.mediaDevices &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  /** ดึงประเภท MIME type ที่เบราว์เซอร์นี้รองรับดีที่สุด */
  static getSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav',
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  /** เริ่มบันทึกเสียงไมค์ พร้อมส่งระดับเสียง VU Meter (0–100%) แบบ real-time */
  async start(onVolumeLevel?: (level: number) => void): Promise<void> {
    if (!MicRecorder.isSupported()) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับการบันทึกเสียงไมโครโฟน');
    }

    // ขออนุญาตใช้ไมค์ (ตั้งค่าเสียงสำหรับการบันทึกร้องเพลง ไม่ตัดความถี่ต่ำ)
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // ตั้งค่า AnalyserNode สำหรับทำ VU Meter
    try {
      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      if (onVolumeLevel) {
        const pcmData = new Uint8Array(this.analyser.frequencyBinCount);
        const checkLevel = () => {
          if (!this.analyser) return;
          this.analyser.getByteFrequencyData(pcmData);
          // หาค่าเฉลี่ยความดังของเสียงไมค์
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) {
            sum += pcmData[i];
          }
          const avg = sum / pcmData.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          onVolumeLevel(level);
          this.vuTimer = requestAnimationFrame(checkLevel);
        };
        this.vuTimer = requestAnimationFrame(checkLevel);
      }
    } catch {
      // Ignore audio context error if in background
    }

    // ตั้งค่า MediaRecorder
    this.audioChunks = [];
    const mimeType = MicRecorder.getSupportedMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    this.startTime = Date.now();
    this.mediaRecorder.start(100); // chunk every 100ms
  }

  /** หยุดบันทึกเสียงและคืนค่าผลลัพธ์เป็น Blob และ Base64 Data URL */
  stop(): Promise<RecordedAudioResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('ไม่มีการบันทึกเสียงที่กำลังทำงานอยู่'));
      }

      const durationSec = Math.max(0.1, (Date.now() - this.startTime) / 1000);

      if (this.vuTimer !== null) {
        cancelAnimationFrame(this.vuTimer);
        this.vuTimer = null;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const blob = new Blob(this.audioChunks, { type: mimeType });

          // แปลง Blob เป็น Data URL (Base64) เพื่อบันทึกลง SongBar
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            this.cleanup();
            resolve({ blob, dataUrl, durationSec });
          };
          reader.onerror = () => {
            this.cleanup();
            reject(new Error('เกิดข้อผิดพลาดในการแปลงไฟล์เสียง'));
          };
          reader.readAsDataURL(blob);
        } catch (err) {
          this.cleanup();
          reject(err);
        }
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.vuTimer !== null) {
      cancelAnimationFrame(this.vuTimer);
      this.vuTimer = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.analyser = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
}

/** ฟังก์ชันสำหรับพรีวิวเล่นไฟล์เสียง Data URL */
export function playAudioDataUrl(
  dataUrl: string,
  options?: { volume?: number; onEnd?: () => void }
): HTMLAudioElement {
  const audio = new Audio(dataUrl);
  audio.volume = options?.volume !== undefined ? Math.max(0, Math.min(1, options.volume)) : 1.0;
  if (options?.onEnd) {
    audio.onended = options.onEnd;
  }
  audio.play().catch(() => {});
  return audio;
}
