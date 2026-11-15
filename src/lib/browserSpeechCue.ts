/**
 * browserSpeechCue.ts — ตัวอ่านออกเสียงเนื้อร้องผ่าน Web Speech API ของเบราว์เซอร์ (0 เครดิต)
 *
 * ใช้สำหรับซ้อมแบ่งจังหวะอ่านเนื้อร้องทั้งท่อนหรือเฉพาะห้องแบบฟรีทันทีในเบราว์เซอร์
 * รองรับภาษาไทย (`th-TH`) และอังกฤษ (`en-US`) โดยปรับอัตราความเร็วตาม BPM ของเพลง
 */

export interface BrowserSpeechOptions {
  bpm?: number;
  lang?: 'th' | 'en';
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

/** ตรวจว่าสภาพแวดล้อมปัจจุบันรองรับ Web Speech API (window.speechSynthesis) หรือไม่ */
export function isBrowserSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** คำนวณอัตราความเร็วการพูด (rate) ให้สอดคล้องกับ BPM ของเพลง (ขอบเขต 0.75x – 1.25x) */
export function computeSpeechRateForBpm(bpm = 85): number {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 85;
  return Math.max(0.75, Math.min(1.25, Number((safeBpm / 85).toFixed(2))));
}

/** ตรวจจับภาษาอัตโนมัติ (ไทย vs อังกฤษ) จากอักขระในเนื้อร้อง */
export function resolveSpeechLangTag(text: string, preferredLang?: 'th' | 'en'): 'th-TH' | 'en-US' {
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th-TH';
  return preferredLang === 'en' ? 'en-US' : 'th-TH';
}

/** หยุดเสียงอ่านของเบราว์เซอร์ที่กำลังทำงานอยู่ทั้งหมด */
export function stopBrowserLyrics(): void {
  if (!isBrowserSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ข้ามข้อผิดพลาดบนเบราว์เซอร์หรือสภาพแวดล้อมที่จำกัด Speech API
  }
}

/**
 * อ่านเนื้อร้องออกเสียงด้วยเบราว์เซอร์ (0 เครดิต)
 * รองรับทั้งข้อความเดี่ยวและอาเรย์ของบรรทัดในท่อน (จะเว้นวรรคเชื่อมประโยคให้อัตโนมัติ)
 * คืนค่า true หากเริ่มพูดได้ หรือ false หากไม่รองรับ / ข้อความว่าง
 */
export function speakBrowserLyrics(
  textOrLines: string | string[],
  options?: BrowserSpeechOptions
): boolean {
  const joinedText = (Array.isArray(textOrLines) ? textOrLines : [textOrLines])
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)
    .join(', ');

  if (!joinedText) {
    options?.onEnd?.();
    return false;
  }

  if (!isBrowserSpeechSupported()) {
    options?.onError?.();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(joinedText);
    utterance.lang = resolveSpeechLangTag(joinedText, options?.lang);
    utterance.rate = computeSpeechRateForBpm(options?.bpm);
    utterance.pitch =
      typeof options?.pitch === 'number' && Number.isFinite(options.pitch)
        ? Math.max(0.5, Math.min(2, options.pitch))
        : 1.0;
    utterance.volume =
      typeof options?.volume === 'number' && Number.isFinite(options.volume)
        ? Math.max(0, Math.min(1, options.volume))
        : 1.0;

    if (options?.onStart) {
      utterance.onstart = () => options.onStart?.();
    }
    if (options?.onEnd) {
      utterance.onend = () => options.onEnd?.();
    }
    if (options?.onError) {
      utterance.onerror = () => options.onError?.();
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    options?.onError?.();
    return false;
  }
}
