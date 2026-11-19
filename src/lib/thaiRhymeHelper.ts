/**
 * thaiRhymeHelper.ts — ระบบวิเคราะห์ฉันทลักษณ์ไทยเชิงลึก + หาคำสัมผัส (0 Credits / Offline)
 *
 * ครอบคลุมหลักภาษาไทยสำหรับนักแต่งเพลง:
 * - ไตรยางศ์ (อักษรสูง กลาง ต่ำ + อักษรนำ ห นำ / อ นำ)
 * - สระเสียงสั้น / สระเสียงยาว
 * - มาตราตัวสะกด 9 มาตรา (แม่ ก กา, กง, กน, กม, เกย, เกอว, กก, กด, กบ)
 * - คำเป็น / คำตาย (Live vs Dead Syllables)
 * - เสียงวรรณยุกต์ 5 เสียง (สามัญ เอก โท ตรี จัตวา) พร้อมแนะนำทิศทางเมโลดี้ (Tone-to-Pitch Contour)
 */

import { countThaiEnglishSyllables } from './sectionUtils';
import type { SectionType } from '../types/song';

export { countThaiEnglishSyllables };

export type ThaiConsonantClass = 'high' | 'mid' | 'low';
export type ThaiVowelLength = 'short' | 'long';
export type ThaiCodaFamily = 'ก กา' | 'กง' | 'กน' | 'กม' | 'เกย' | 'เกอว' | 'กก' | 'กด' | 'กบ';
export type ThaiSyllableLiveness = 'คำเป็น' | 'คำตาย';
export type ThaiToneName = 'สามัญ' | 'เอก' | 'โท' | 'ตรี' | 'จัตวา';
export type MelodyPitchTarget = 'low' | 'mid' | 'high' | 'rising';

export interface ThaiSyllablePhonetics {
  rawWord: string;
  lastSyllable: string;
  initialConsonant: string;
  consonantClass: ThaiConsonantClass;
  consonantClassLabel: string;
  hasHoNam: boolean;
  vowelLength: ThaiVowelLength;
  vowelLengthLabel: 'สระเสียงสั้น' | 'สระเสียงยาว';
  codaFamily: ThaiCodaFamily;
  isLiveSyllable: boolean;
  livenessLabel: ThaiSyllableLiveness;
  toneMark: 'none' | 'mai-ek' | 'mai-tho' | 'mai-tri' | 'mai-chattawa';
  tone: ThaiToneName;
  pitchTarget: MelodyPitchTarget;
  melodyAdvice: string;
  rhymeGroupId: string | null;
}

export interface ThaiRhymeResult {
  groupLabel: string;
  suggestions: string[];
}

export interface FilteredThaiRhymeResult extends ThaiRhymeResult {
  inputPhonetics: ThaiSyllablePhonetics;
  filteredSuggestions: Array<{
    word: string;
    phonetics: ThaiSyllablePhonetics;
  }>;
}

interface RhymeGroupDef {
  id: string;
  groupLabel: string;
  examples: string[];
  words: string[];
}

export const THAI_RHYME_GROUPS: RhymeGroupDef[] = [
  {
    id: 'aa',
    groupLabel: '-า / มาตรา ก กา',
    examples: ['ฟ้า', 'ตา', 'เวลา'],
    words: [
      'ฟ้า', 'ท้องฟ้า', 'เวลา', 'สายตา', 'น้ำตา', 'ค้นหา', 'ห่วงหา',
      'อำลา', 'เดินมา', 'สัญญา', 'คุณค่า', 'อ่อนล้า', 'กลับมา', 'รักษา', 'ข้างหน้า',
      'พริบตา', 'ศรัทธา', 'ปรารถนา', 'เมตตา', 'ดวงดารา', 'แผ่นฟ้า',
    ],
  },
  {
    id: 'aai',
    groupLabel: '-าย / แม่เกย (สระอา)',
    examples: ['หาย', 'สุดท้าย', 'มากมาย'],
    words: [
      'ใจหาย', 'เสียดาย', 'สุดท้าย', 'เดียวดาย', 'มากมาย', 'มลาย',
      'จางหาย', 'ความหมาย', 'ง่ายดาย', 'ข้างกาย', 'โปรยปราย', 'ทักทาย', 'วุ่นวาย',
      'จุดหมาย', 'วางใจสบาย', 'ละลาย', 'ไม่คลาย', 'เรียงราย',
    ],
  },
  {
    id: 'aao',
    groupLabel: '-าว / แม่เกอว (สระอา)',
    examples: ['ดาว', 'หนาว', 'เรื่องราว'],
    words: [
      'ดวงดาว', 'เรื่องราว', 'เหน็บหนาว', 'สีขาว', 'ยืนยาว', 'แวววาว',
      'พร่างพราว', 'คราว', 'สกาว', 'ผืนฟ้าขาว', 'ชั่วคราว', 'แพรวพราว', 'ปวดร้าว',
    ],
  },
  {
    id: 'aam',
    groupLabel: '-าม / แม่กม (สระอา)',
    examples: ['ถาม', 'งาม', 'นิยาม'],
    words: [
      'คำถาม', 'สวยงาม', 'นิยาม', 'พยายาม', 'ยาม', 'ข้อความ', 'ติดตาม',
      'งดงาม', 'ห้ามปราม', 'ทุกยาม', 'ก้าวข้าม', 'มองตาม',
    ],
  },
  {
    id: 'aan',
    groupLabel: '-าน / แม่กน (สระอา)',
    examples: ['นาน', 'ผ่าน', 'บ้าน'],
    words: [
      'เนิ่นนาน', 'วันวาน', 'พ้นผ่าน', 'เดินทางผ่าน', 'ตำนาน', 'อาการ',
      'แสนหวาน', 'วิญญาณ', 'ความต้องการ', 'บ้าน', 'เบิกบาน', 'ซาบซ่าน',
    ],
  },
  {
    id: 'aak',
    groupLabel: '-าก / แม่กก (สระอา)',
    examples: ['จาก', 'ฝาก', 'มาก'],
    words: [
      'จาก', 'ลาจาก', 'ฝาก', 'ลำบาก', 'ยาก', 'อยาก',
      'ปาก', 'พราก', 'พลัดพราก', 'หน้าผาก', 'กระชาก', 'อีกฟาก',
    ],
  },
  {
    id: 'aat',
    groupLabel: '-าด/-าศ/-าต / แม่กด (สระอา)',
    examples: ['ขาด', 'วาด', 'อากาศ'],
    words: [
      'ขาด', 'วาด', 'คาด', 'พลาด', 'อาจ', 'สะอาด', 'อากาศ',
      'โอกาส', 'ธรรมชาติ', 'ประหลาด', 'พินาศ', 'ความเด็ดขาด',
    ],
  },
  {
    id: 'aap',
    groupLabel: '-าบ/-าพ / แม่กบ (สระอา)',
    examples: ['ภาพ', 'กราบ', 'ทราบ'],
    words: [
      'ภาพ', 'รูปภาพ', 'กราบ', 'ทราบ', 'อาบ', 'ซาบ', 'ตราบ',
      'ปราบ', 'กุหลาบ', 'อิสรภาพ', 'ความสุภาพ', 'มิตรภาพ',
    ],
  },
  {
    id: 'am',
    groupLabel: '-ำ / มาตรา ก กา (เสียงนาสิก -ัม)',
    examples: ['คำ', 'จำ', 'ทำ'],
    words: [
      'คำ', 'จดจำ', 'ความทรงจำ', 'กระทำ', 'ย้ำ', 'ตอกย้ำ', 'ชอกช้ำ',
      'ลำนำ', 'ถลำ', 'เพ้อพร่ำ', 'ร่ายรำ', 'ทุกค่ำ', 'แม่น้ำ', 'ความช้ำ',
    ],
  },
  {
    id: 'ak',
    groupLabel: '-ัก / แม่กก (สระอะ)',
    examples: ['รัก', 'พัก', 'หนัก'],
    words: [
      'ความรัก', 'แอบรัก', 'รู้จัก', 'หยุดพัก', 'ทายทัก', 'แน่นหนัก',
      'แตกหัก', 'สมัคร', 'ตัก', 'สลัก', 'พำนัก', 'ประจักษ์', 'สักพัก',
    ],
  },
  {
    id: 'an',
    groupLabel: '-ัน / แม่กน (สระอะ)',
    examples: ['ฝัน', 'กัน', 'วัน'],
    words: [
      'ความฝัน', 'วาดฝัน', 'สักวัน', 'ทุกวัน', 'แบ่งปัน', 'เหมือนกัน',
      'ผูกพัน', 'อัศจรรย์', 'เคียงกัน', 'จับมือกัน', 'คืนวัน', 'ผันผวน', 'นิรันดร์',
    ],
  },
  {
    id: 'ap',
    groupLabel: '-ับ / แม่กบ (สระอะ)',
    examples: ['กลับ', 'รับ', 'หลับ'],
    words: [
      'กลับ', 'ยอมรับ', 'หลับ', 'จับ', 'นับ', 'ขยับ', 'ความลับ',
      'ประทับ', 'สดับ', 'ระงับ', 'ลาลับ', 'ระดับ',
    ],
  },
  {
    id: 'ang',
    groupLabel: '-าง / แม่กง (สระอา)',
    examples: ['ทาง', 'ข้าง', 'จาง'],
    words: [
      'เส้นทาง', 'เดินทาง', 'เคียงข้าง', 'อ้างว้าง', 'เลือนราง', 'เบาบาง',
      'ระหว่าง', 'สว่าง', 'จืดจาง', 'หนทาง', 'อ้อมกอดบาง', 'ปล่อยวาง',
    ],
  },
  {
    id: 'ang_short',
    groupLabel: '-ัง / แม่กง (สระอะ)',
    examples: ['ฟัง', 'ยัง', 'หวัง'],
    words: [
      'รับฟัง', 'ความหวัง', 'พลัง', 'ลำพัง', 'ผิดหวัง', 'เบื้องหลัง',
      'กักขัง', 'พังทลาย', 'จริงจัง', 'ดัง', 'ยืนยัง',
    ],
  },
  {
    id: 'in',
    groupLabel: '-ิน / แม่กน (สระอิ)',
    examples: ['ยิน', 'ดิน', 'บิน'],
    words: [
      'ได้ยิน', 'แผ่นดิน', 'โบยบิน', 'ผืนดิน', 'ก้อนหิน', 'ไหลริน',
      'ตัดสิน', 'เคยชิน', 'ถวิล', 'จบสิ้น', 'มลทิน', 'กลิ่น', 'ศิลปิน',
    ],
  },
  {
    id: 'ing',
    groupLabel: '-ิง / แม่กง (สระอิ)',
    examples: ['จริง', 'ทิ้ง', 'นิ่ง'],
    words: [
      'ความจริง', 'แท้จริง', 'ทอดทิ้ง', 'หยุดนิ่ง', 'ทุกสิ่ง', 'อ้างอิง',
      'แอบอิง', 'พึ่งพิง', 'ยิ่ง', 'กลิ้ง', 'ผู้หญิง',
    ],
  },
  {
    id: 'ee',
    groupLabel: '-ี / มาตรา ก กา (สระอี)',
    examples: ['มี', 'ดี', 'นาที'],
    words: [
      'แสนดี', 'ยังมี', 'นาที', 'คืนนี้', 'ราตรี', 'สักที',
      'ยินดี', 'ไม่มี', 'ปรานี', 'วิธี', 'คนดี', 'ศักดิ์ศรี', 'บทกวี',
    ],
  },
  {
    id: 'ueng',
    groupLabel: '-ึง / แม่กง (สระอึ)',
    examples: ['ถึง', 'ซึ้ง', 'หนึ่ง'],
    words: [
      'คิดถึง', 'ซาบซึ้ง', 'ลึกซึ้ง', 'คำนึง', 'วันหนึ่ง', 'คะนึง',
      'ตรึงใจ', 'บึง', 'ครึ่ง', 'ตราตรึง',
    ],
  },
  {
    id: 'ua',
    groupLabel: 'สระ -ัว (แม่ ก กา)',
    examples: ['กลัว', 'ตัว', 'มัว'],
    words: [
      'ตัว', 'หวั่นกลัว', 'ลืมตัว', 'รอบตัว', 'สลัว', 'มืดมัว',
      'หัว', 'ทั้งตัว', 'ชัวร์', 'พันพัว', 'ครอบครัว', 'ทัวร์',
    ],
  },
  {
    id: 'orn',
    groupLabel: '-อน / แม่กน (สระออ)',
    examples: ['ก่อน', 'หมอน', 'สะท้อน'],
    words: [
      'ลาก่อน', 'อ้อนวอน', 'กอดหมอน', 'ย้อน', 'แน่นอน', 'สะท้อน',
      'รุ่มร้อน', 'หลับนอน', 'ซ่อน', 'งอน', 'พร่ำวอน', 'ขั้นตอน', 'ซับซ้อน',
    ],
  },
  {
    id: 'or',
    groupLabel: '-อ / มาตรา ก กา (สระออ)',
    examples: ['รอ', 'พอ', 'ขอ'],
    words: [
      'เฝ้ารอ', 'เพียงพอ', 'อ้อนขอ', 'ทดท้อ', 'ย่อท้อ', 'ติดต่อ',
      'ก่อ', 'ถักทอ', 'พนอ', 'หนอ', 'ลูกคอ', 'สานต่อ',
    ],
  },
  {
    id: 'ok',
    groupLabel: 'สระ โ-ก / -ก (แม่กก)',
    examples: ['โลก', 'โศก', 'อก'],
    words: [
      'โลก', 'ทั้งโลก', 'เศร้าโศก', 'โชค', 'ประโยค', 'โยก',
      'อก', 'หัวอก', 'น้ำตาตก', 'โกหก', 'กระจก', 'สกปรก',
    ],
  },
  {
    id: 'on_long',
    groupLabel: 'สระ โ-น (แม่กน)',
    examples: ['โดน', 'โยน', 'อ่อนโยน'],
    words: [
      'โดน', 'โยน', 'อ่อนโยน', 'ตะโกน', 'โอน', 'โหน',
      'โจร', 'โซน', 'หัวโขน', 'กระโจน', 'โอนอ่อน',
    ],
  },
  {
    id: 'oe',
    groupLabel: '-เออ / มาตรา ก กา (สระเออ)',
    examples: ['เธอ', 'เจอ', 'เสมอ'],
    words: [
      'เธอ', 'พบเจอ', 'เสมอ', 'ละเมอ', 'เผลอ', 'พร่ำเพ้อ',
      'เคยเจอ', 'เออ', 'ปรนเปรอ', 'เรอ', 'บำเรอ',
    ],
  },
  {
    id: 'oey',
    groupLabel: 'เ-ย / แม่เกย (สระเออ)',
    examples: ['เคย', 'เลย', 'เฉลย'],
    words: [
      'ไม่เคย', 'เหมือนเคย', 'เลย', 'เฉย', 'เฉลย', 'รำเพย',
      'เอื้อนเอ่ย', 'คุ้นเคย', 'เชย', 'เปิดเผย',
    ],
  },
  {
    id: 'ao',
    groupLabel: 'เ-า / แม่เกอว (สระเอา)',
    examples: ['เหงา', 'เรา', 'เงา'],
    words: [
      'เหงา', 'ความเหงา', 'สองเรา', 'เงา', 'เบา', 'มัวเมา',
      'โศกเศร้า', 'เทา', 'เร่งเร้า', 'เรื่องเก่า', 'ภูเขา',
    ],
  },
  {
    id: 'ai',
    groupLabel: '-ใจ / -ไ- / -ใ-',
    examples: ['หัวใจ', 'ไกล', 'ไหว'],
    words: [
      'หัวใจ', 'ข้างใน', 'ห่างไกล', 'เมื่อไหร่', 'เชื่อใจ', 'หวั่นไหว',
      'อ่อนไหว', 'เข้าใจ', 'เสียใจ', 'ลืมไป', 'เป็นไป', 'สดใส', 'ข้างในใจ', 'เป็นไปได้ไหม',
    ],
  },
  {
    id: 'en',
    groupLabel: 'เ-น / เ-็น (แม่กน)',
    examples: ['เห็น', 'เป็น', 'เย็น'],
    words: [
      'มองเห็น', 'ที่เป็น', 'หนาวเย็น', 'ชัดเจน', 'จำเป็น', 'เร้น',
      'ซ่อนเร้น', 'เต้น', 'เส้น', 'ลำเค็ญ', 'เดือนเพ็ญ',
    ],
  },
  {
    id: 'eng',
    groupLabel: 'เ-ง / แม่กง (สระเอ)',
    examples: ['เพลง', 'เอง', 'บรรเลง'],
    words: [
      'บทเพลง', 'ตัวเอง', 'เกรง', 'หวั่นเกรง', 'บรรเลง', 'วังเวง',
      'เก่ง', 'เร่ง', 'นักเลง', 'ครื้นเครง',
    ],
  },
  {
    id: 'aeng',
    groupLabel: 'แ-ง / แม่กง (สระแอ)',
    examples: ['แสง', 'แรง', 'แพง'],
    words: [
      'แสง', 'ลำแสง', 'เรี่ยวแรง', 'เข้มแข็ง', 'แกล้ง', 'เสแสร้ง',
      'กำแพง', 'แสดง', 'สีแดง', 'ตำแหน่ง', 'ระแวง', 'เปลี่ยนแปลง',
    ],
  },
  {
    id: 'aek',
    groupLabel: 'แ-ก / แม่กก (สระแอ)',
    examples: ['แรก', 'แตก', 'แปลก'],
    words: [
      'วันแรก', 'แตก', 'แหลก', 'แปลก', 'แยก', 'แบก',
      'แทรก', 'แลก', 'แจก',
    ],
  },
  {
    id: 'ia',
    groupLabel: 'เ-ีย / มาตรา ก กา (สระเอีย)',
    examples: ['เสีย', 'เพลีย', 'เคลียร์'],
    words: [
      'สูญเสีย', 'อ่อนเพลีย', 'คลอเคลีย', 'เคลียร์', 'เชียร์', 'นัวเนีย',
      'เสียน้ำตา', 'เลีย',
    ],
  },
  {
    id: 'ian',
    groupLabel: 'เ-ียน / เ-ียร (แม่กน)',
    examples: ['เปลี่ยน', 'เขียน', 'เนียน'],
    words: [
      'เปลี่ยนแปลง', 'ขีดเขียน', 'บทเรียน', 'วนเวียน', 'แสงเทียน', 'แนบเนียน',
      'พากเพียร', 'จวนเจียน', 'เกษียร', 'อาเจียน',
    ],
  },
  {
    id: 'uean',
    groupLabel: 'เ-ือน / แม่กน (สระเอือ)',
    examples: ['เพื่อน', 'เตือน', 'เหมือน'],
    words: [
      'เพื่อน', 'ตักเตือน', 'ลบเลือน', 'เสมือน', 'ดวงเดือน', 'ขับเคลื่อน',
      'มาเยือน', 'บ้านเรือน', 'บิดเบือน', 'เชือดเฉือน',
    ],
  },
];

// ── ไตรยางศ์ (Consonant Classes) & Clusters ──
const HIGH_CONSONANTS = new Set(['ข', 'ฃ', 'ฉ', 'ฐ', 'ถ', 'ผ', 'ฝ', 'ศ', 'ษ', 'ส', 'ห']);
const MID_CONSONANTS = new Set(['ก', 'จ', 'ฎ', 'ฏ', 'ด', 'ต', 'บ', 'ป', 'อ']);

const TRUE_CLUSTERS = new Set([
  'กร', 'กล', 'กว', 'ขร', 'ขล', 'ขว', 'คร', 'คล', 'คว',
  'ตร', 'ปร', 'ปล', 'พร', 'พล', 'ผล', 'ทร', 'ศร', 'สร',
]);
const HO_NAM_CLUSTERS = new Set(['หง', 'หญ', 'หน', 'หม', 'หย', 'หร', 'หล', 'หว']);
const O_NAM_WORDS = new Set(['อย่า', 'อยู่', 'อย่าง', 'อยาก']);

const LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);
const FOLLOWING_VOWELS = new Set(['ะ', 'ั', 'า', 'ำ', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', '็']);
const TONE_MARKS = new Set(['\u0E48', '\u0E49', '\u0E4A', '\u0E4B']);

function isThaiConsonant(ch: string): boolean {
  return /[\u0E01-\u0E2E]/.test(ch);
}

/**
 * แยกคำภาษาไทยออกเป็นพยางค์ย่อยๆ โดยอิงโครงสร้างสระหน้า-พยัญชนะต้น-สระ-ตัวสะกด
 */
export function segmentThaiWordToSyllables(rawInput: string): string[] {
  const trimmed = rawInput
    .trim()
    .replace(/[\s,.;:!?'"()\[\]{}\/\\|~\-–—]+/g, ' ')
    .replace(/ๆ/g, '')
    .trim();
  if (!trimmed) return [];

  const wordTokens: string[] = [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('th', { granularity: 'word' });
    for (const part of seg.segment(trimmed)) {
      const s = part.segment.trim();
      if (/[\u0E01-\u0E2E]/.test(s)) {
        wordTokens.push(s);
      } else if (/[a-zA-Z0-9]+/.test(s)) {
        wordTokens.push(s);
      }
    }
  } else {
    wordTokens.push(...trimmed.split(/\s+/).filter(Boolean));
  }

  const syllables: string[] = [];

  for (const rawToken of wordTokens) {
    if (!/[\u0E01-\u0E2E]/.test(rawToken)) {
      syllables.push(rawToken);
      continue;
    }

    const token = rawToken
      .replace(/(ชา|ญา|ธา|บั|มั|วั|เกียร)ต\u0E34(?=$|[\u0E40-\u0E44])/g, '$1ต')
      .replace(/(เห|ธา|เก)ต\u0E38(?=$|[\u0E40-\u0E44])/g, '$1ต');

    let i = 0;
    const len = token.length;

    while (i < len) {
      const start = i;
      const ch = token[i];

      if (!LEADING_VOWELS.has(ch) && !isThaiConsonant(ch)) {
        i += 1;
        continue;
      }

      let hasLeadingVowel = false;
      let leadingVowelChar = '';
      if (LEADING_VOWELS.has(ch)) {
        hasLeadingVowel = true;
        leadingVowelChar = ch;
        i += 1;
      }

      // 1. Onset consonant(s)
      if (i < len && isThaiConsonant(token[i])) {
        const c1 = token[i];
        const c2 = i + 1 < len ? token[i + 1] : '';
        const pair = c1 + c2;
        const afterC2 = i + 2 < len ? token[i + 2] : '';
        const afterC3 = i + 3 < len ? token[i + 3] : '';

        // รองรับควบกล้ำแท้, ห นำ, อ นำ และอักษรนำ 2 พยางค์ที่มีสระหน้า (เช่น เสมอ, เฉลย, แสดง)
        const isRorHanAhead = c2 === 'ร' && afterC2 === 'ร';
        const isTrueCluster =
          TRUE_CLUSTERS.has(pair) &&
          !isRorHanAhead &&
          (FOLLOWING_VOWELS.has(afterC2) ||
            TONE_MARKS.has(afterC2) ||
            hasLeadingVowel ||
            (Boolean(afterC2) &&
              isThaiConsonant(afterC2) &&
              !FOLLOWING_VOWELS.has(afterC3) &&
              !TONE_MARKS.has(afterC3) &&
              !LEADING_VOWELS.has(afterC3) &&
              afterC2 !== '\u0E4C'));

        const isPseudoClusterWithLeadingVowel =
          hasLeadingVowel &&
          c2 &&
          isThaiConsonant(c2) &&
          c2 !== 'อ' &&
          !FOLLOWING_VOWELS.has(afterC2) &&
          !TONE_MARKS.has(afterC2) &&
          afterC2 !== '\u0E4C' &&
          !(afterC2 === 'ร' && !afterC3) &&
          (afterC2 === 'อ' ||
            afterC2 === 'ย' ||
            (isThaiConsonant(afterC2) && !FOLLOWING_VOWELS.has(afterC3) && !LEADING_VOWELS.has(afterC2)));

        if (
          c2 &&
          isThaiConsonant(c2) &&
          (HO_NAM_CLUSTERS.has(pair) ||
            isTrueCluster ||
            (pair === 'อย' && (afterC2 === 'า' || afterC2 === 'ู' || afterC2 === '่')) ||
            isPseudoClusterWithLeadingVowel)
        ) {
          i += 2;
        } else {
          i += 1;
        }
      }

      // 2. Tone mark or Upper/Lower vowel signs
      let hasFollowingVowelMark = false;
      while (i < len && (FOLLOWING_VOWELS.has(token[i]) || TONE_MARKS.has(token[i]))) {
        if (FOLLOWING_VOWELS.has(token[i])) {
          hasFollowingVowelMark = true;
        }
        i += 1;
      }

      // 3. Compound vowel nuclei with เ-/แ-/โ- เช่น เ-ีย, เ-ียะ, เ-ือ, เ-ือะ, เ-อ, เ-อะ, เ-า
      if (hasLeadingVowel && leadingVowelChar === 'เ' && i < len) {
        const nextAfterVowel = token[i + 1] ?? '';
        if (
          (token[i] === 'ย' || token[i] === 'อ' || token[i] === 'า') &&
          (!FOLLOWING_VOWELS.has(nextAfterVowel) || nextAfterVowel === 'ะ')
        ) {
          i += 1;
          while (i < len && (token[i] === 'ะ' || TONE_MARKS.has(token[i]))) {
            i += 1;
          }
        }
      }

      // Case: C + อ (เช่น หมอน, ก่อน, รอ) where อ acts as vowel -อ (no ิ ี ึ ื ุ ู า before it)
      if (!hasLeadingVowel && i < len && token[i] === 'อ') {
        const prev = token[i - 1];
        const next = token[i + 1] ?? '';
        if (!FOLLOWING_VOWELS.has(prev) && !FOLLOWING_VOWELS.has(next)) {
          i += 1;
        }
      }

      // Case: Reduced -ัว (เช่น สวน, ดวง, สวย, อ้วน, ชวน) where ว acts as vowel between consonants
      if (!hasLeadingVowel && !hasFollowingVowelMark && i < len && token[i] === 'ว') {
        const next = token[i + 1] ?? '';
        const next2 = token[i + 2] ?? '';
        if (
          isThaiConsonant(next) &&
          !(next === 'ร' && next2 === 'ร') &&
          !FOLLOWING_VOWELS.has(next2) &&
          !LEADING_VOWELS.has(next2) &&
          !TONE_MARKS.has(next2)
        ) {
          i += 1;
        }
      }

      // Tone mark might appear after อ/ย in compound like เลี่ยง, เบื่อ
      while (i < len && TONE_MARKS.has(token[i])) {
        i += 1;
      }

      // Special -ัว (เช่น ตัว, กลัว, ชัวร์)
      if (!hasLeadingVowel && token[i - 1] === 'ั' && i < len && token[i] === 'ว') {
        i += 1;
        while (i < len && TONE_MARKS.has(token[i])) i += 1;
      }

      // 4. Optional coda consonant (+ silent C์)
      const prevEndChar = token[i - 1] ?? '';
      const prev2Char = token[i - 2] ?? '';
      const endedWithOpenSaraAo =
        hasLeadingVowel &&
        leadingVowelChar === 'เ' &&
        !hasFollowingVowelMark &&
        (prevEndChar === 'า' || (TONE_MARKS.has(prevEndChar) && prev2Char === 'า'));
      const endedWithOpenMark =
        prevEndChar === 'ะ' ||
        prevEndChar === 'ำ' ||
        (TONE_MARKS.has(prevEndChar) && (prev2Char === 'ะ' || prev2Char === 'ำ'));
      const endedWithOpenAi =
        hasLeadingVowel &&
        (leadingVowelChar === 'ใ' || leadingVowelChar === 'ไ') &&
        !hasFollowingVowelMark;
      const isOpenOnlyNucleus = endedWithOpenSaraAo || endedWithOpenMark || endedWithOpenAi;

      if (i < len && isThaiConsonant(token[i])) {
        const nextChar = i + 1 < len ? token[i + 1] : '';
        const next2 = i + 2 < len ? token[i + 2] : '';

        // If nextChar is ์, or next2 is ์, it's silent ending attached to current syllable
        if (nextChar === '\u0E4C') {
          i += 2;
        } else if (FOLLOWING_VOWELS.has(nextChar) && next2 === '\u0E4C') {
          i += 3;
        } else if (endedWithOpenAi && leadingVowelChar === 'ไ' && token[i] === 'ย' && (i + 1 >= len || LEADING_VOWELS.has(nextChar))) {
          // รองรับคำว่า ไทย, ไชย (ไม่รวม สไบ หรือ ไกล)
          i += 1;
        } else if (isOpenOnlyNucleus) {
          // สระ -ะ, -ำ, เ-า, ไ-, ใ- ไม่รับตัวสะกดปกติ (ไม่กินพยัญชนะต้นของพยางค์ถัดไป เช่น กระจก -> กระ|จก)
        } else if (token[i] === 'ร' && token[i + 1] === 'ร') {
          // ร หัน (บรร-, สรร-, กรรม-, อัศจรรย์)
          i += 2;
          if (i < len && isThaiConsonant(token[i]) && token[i + 1] === '\u0E4C') {
            i += 2;
          } else if (
            i < len &&
            isThaiConsonant(token[i]) &&
            (i + 1 >= len || LEADING_VOWELS.has(token[i + 1]))
          ) {
            i += 1;
          }
        } else if (
          !FOLLOWING_VOWELS.has(nextChar) &&
          !TONE_MARKS.has(nextChar) &&
          !(nextChar === 'ร' && next2 === 'ร') &&
          !(nextChar === 'อ' && !FOLLOWING_VOWELS.has(next2) && isThaiConsonant(next2))
        ) {
          // กรณีพยัญชนะเปลือย 3 ตัวเรียง (เช่น ถนน, ขนม, ตลก, สงบ): พยางค์แรกอ่านอะกึ่งเสียง C1 แล้วให้ C2C3 เป็นพยางค์หลัง
          const isBareSingleOnset = !hasLeadingVowel && !hasFollowingVowelMark && i - start === 1;
          const twoBareConsonantsAhead =
            isBareSingleOnset &&
            isThaiConsonant(nextChar) &&
            next2 !== '\u0E4C' &&
            (!next2 || LEADING_VOWELS.has(next2));

          if (!twoBareConsonantsAhead) {
            // Consume coda consonant as long as it doesn't start another CV syllable
            const codaCons = token[i];
            const cAfterCoda = i + 1 < len ? token[i + 1] : '';
            const c2AfterCoda = i + 2 < len ? token[i + 2] : '';

            // เช็กว่าตัวถัดไปเป็น C+V หรือไม่ (ถ้า codaCons ไม่ได้ตามด้วยสระ และ cAfterCoda ตามด้วยสระ -> codaCons ยังเป็นตัวสะกดได้!)
            const codaIsFollowedByClusterVowel =
              cAfterCoda &&
              isThaiConsonant(cAfterCoda) &&
              HO_NAM_CLUSTERS.has(codaCons + cAfterCoda) &&
              (FOLLOWING_VOWELS.has(c2AfterCoda) || TONE_MARKS.has(c2AfterCoda));

            if (!codaIsFollowedByClusterVowel) {
              i += 1;
              // ดูด ร ไม่ออกเสียงหลังตัวสะกดแม่ กก/กด/กบ (เช่น มิตร, บุตร, เพชร, จักร, สมุทร, มิตรภาพ)
              if (
                i < len &&
                token[i] === 'ร' &&
                'กขคฆจชดตถทธบปพภ'.includes(codaCons) &&
                (i + 1 >= len ||
                  LEADING_VOWELS.has(token[i + 1]) ||
                  (isThaiConsonant(token[i + 1]) && FOLLOWING_VOWELS.has(token[i + 2] ?? '')))
              ) {
                i += 1;
              }
              // Absorb trailing silent consonant+karan เช่น จันทร์, ชัวร์, ศิลป์
              while (i < len && isThaiConsonant(token[i])) {
                if (token[i + 1] === '\u0E4C') {
                  i += 2;
                } else if (FOLLOWING_VOWELS.has(token[i + 1] ?? '') && token[i + 2] === '\u0E4C') {
                  i += 3;
                } else {
                  break;
                }
              }
            }
          }
        }
      }

      // Absorb trailing ะ / ์ if somehow left
      while (i < len && (token[i] === 'ะ' || token[i] === '\u0E4C')) {
        i += 1;
      }

      const piece = token.slice(start, i).trim();
      if (piece) {
        syllables.push(piece);
      }
      if (i === start) {
        i += 1;
      }
    }
  }

  return syllables;
}

function stripKarunFromSyllable(syl: string): string {
  return syl
    .replace(/[\u0E01-\u0E2E][\u0E34\u0E38]?\u0E4C/g, '')
    .replace(/\u0E4C/g, '');
}

function normalizeLastSyllable(rawWord: string): string {
  const segs = segmentThaiWordToSyllables(rawWord);
  const candidate = segs.length > 0 ? segs[segs.length - 1] : rawWord.trim();
  const stripped = stripKarunFromSyllable(candidate).replace(/[\u0E48-\u0E4B]/g, '');
  if (/[\u0E01-\u0E2E]/.test(stripped)) return stripped;

  const cleaned = rawWord
    .trim()
    .replace(/[\u0E48-\u0E4B]/g, '')
    .replace(/[\u0E01-\u0E2E][\u0E34\u0E38]?\u0E4C/g, '')
    .replace(/\u0E4C/g, '');
  const tokens = cleaned.match(/[\u0E00-\u0E7F]+/g);
  return tokens && tokens.length > 0 ? tokens[tokens.length - 1] : cleaned;
}

function detectCodaFamily(noToneNoKarun: string, isShortVowel: boolean): ThaiCodaFamily {
  if (noToneNoKarun.endsWith('ำ')) return 'กม';
  if (/^[ใไ]/.test(noToneNoKarun) || /ัย$/.test(noToneNoKarun)) return 'เกย';
  if (/^เ[\u0E01-\u0E2E]{1,2}า$/.test(noToneNoKarun)) return 'เกอว';
  if (/^เ[\u0E01-\u0E2E]{1,2}ีย$/.test(noToneNoKarun)) return 'ก กา';
  if (/^เ[\u0E01-\u0E2E]{1,2}ือ$/.test(noToneNoKarun)) return 'ก กา';
  if (/^เ[\u0E01-\u0E2E]{1,2}อ$/.test(noToneNoKarun)) return 'ก กา';
  if (/^[\u0E01-\u0E2E]{1,2}ัว$/.test(noToneNoKarun)) return 'ก กา';

  // กรณี อรร / รร ไม่มีตัวสะกดท้าย (เช่น สรร, บรร) -> ออกเสียง -ัน (แม่กน)
  if (/รร$/.test(noToneNoKarun)) return 'กน';

  // หาพยัญชนะตัวท้ายสุดหลังผ่านพยัญชนะต้นและสระ
  const strippedLeading = noToneNoKarun.replace(/^[เแโใไ]/, '');
  // พยัญชนะต้นคือตัวแรก (หรือ 2 ตัวถ้าเป็นควบกล้ำ/ห นำ)
  const firstTwo = strippedLeading.slice(0, 2);
  const onsetLen =
    HO_NAM_CLUSTERS.has(firstTwo) || TRUE_CLUSTERS.has(firstTwo) || firstTwo === 'อย' ? 2 : 1;
  const afterOnset = strippedLeading.slice(onsetLen);

  // เอาเฉพาะตัวสุดท้ายถ้าเป็นพยัญชนะ (ยกเว้น อ ที่เป็นสระ -อ ท้ายคำ เช่น รอ, ขอ, พอ)
  const lastChar = afterOnset.slice(-1);
  if (!lastChar || !isThaiConsonant(lastChar)) {
    return 'ก กา';
  }
  if (lastChar === 'อ' && !FOLLOWING_VOWELS.has(afterOnset.slice(-2, -1))) {
    // เช่น รอ, ขอ, พอ, เธอ
    return 'ก กา';
  }
  // เ-ีย + coda หรือ เ-ือ + coda: ย/อ เป็นส่วนสระ ไม่ใช่ตัวสะกดถ้าอยู่หน้าตัวสะกด หรือ ย อยู่ท้าย เ-ียะ
  if (lastChar === 'ย' && /^เ[\u0E01-\u0E2E]{1,2}ีย$/.test(noToneNoKarun)) {
    return 'ก กา';
  }
  if (lastChar === 'ว' && !FOLLOWING_VOWELS.has(afterOnset) && afterOnset.length === 1 && !isShortVowel) {
    // e.g., หิว, กาว, หนาว, แนว, เอว, เลว -> เหล่านี้ ว เป็นตัวสะกด แม่เกอว (เว้น ตัว/กลัว ซึ่งจับไว้ข้างบนแล้ว)
    return 'เกอว';
  }

  if (lastChar === 'ง') return 'กง';
  if ('นญณรลฬ'.includes(lastChar)) return 'กน';
  if (lastChar === 'ม') return 'กม';
  if (lastChar === 'ย') return 'เกย';
  if (lastChar === 'ว') return 'เกอว';
  if ('กขคฆ'.includes(lastChar)) return 'กก';
  if ('ดจชซฎฏฐฑฒตถทธศษส'.includes(lastChar)) return 'กด';
  if ('บปพฟภ'.includes(lastChar)) return 'กบ';
  return 'ก กา';
}

/**
 * วิเคราะห์ฉันทลักษณ์ไทยของพยางค์สุดท้าย (ไตรยางศ์, สระสั้น/ยาว, มาตราตัวสะกด, คำเป็น/ตาย, วรรณยุกต์, ทิศทางโน้ต)
 */
export function analyzeThaiSyllablePhonetics(input: string): ThaiSyllablePhonetics {
  const cleanRaw = input.trim();
  const segs = segmentThaiWordToSyllables(cleanRaw);
  const rawLastSyl = segs.length > 0 ? segs[segs.length - 1] : cleanRaw;
  const noKarun = stripKarunFromSyllable(rawLastSyl);

  // Detect explicit tone mark before removing them
  let toneMark: ThaiSyllablePhonetics['toneMark'] = 'none';
  if (noKarun.includes('\u0E48')) toneMark = 'mai-ek';
  else if (noKarun.includes('\u0E49')) toneMark = 'mai-tho';
  else if (noKarun.includes('\u0E4A')) toneMark = 'mai-tri';
  else if (noKarun.includes('\u0E4B')) toneMark = 'mai-chattawa';

  const noTone = noKarun.replace(/[\u0E48-\u0E4B]/g, '');
  const strippedLeading = noTone.replace(/^[เแโใไ]/, '');
  const c1 = strippedLeading[0] ?? '';
  const c2 = strippedLeading[1] ?? '';
  const pair = c1 + c2;

  let initialConsonant = c1 || '?';
  let hasHoNam = false;
  let consonantClass: ThaiConsonantClass = 'low';
  let consonantClassLabel = 'อักษรต่ำ';

  if (HO_NAM_CLUSTERS.has(pair)) {
    hasHoNam = true;
    initialConsonant = pair;
    consonantClass = 'high';
    consonantClassLabel = 'อักษรต่ำ (ห นำ)';
  } else if (pair === 'อย' || O_NAM_WORDS.has(noKarun)) {
    initialConsonant = 'อย';
    consonantClass = 'mid';
    consonantClassLabel = 'อักษรต่ำ (อ นำ)';
  } else if (HIGH_CONSONANTS.has(c1)) {
    consonantClass = 'high';
    consonantClassLabel = 'อักษรสูง';
  } else if (MID_CONSONANTS.has(c1)) {
    consonantClass = 'mid';
    consonantClassLabel = 'อักษรกลาง';
  } else {
    consonantClass = 'low';
    consonantClassLabel = 'อักษรต่ำ';
  }

  // Vowel length detection (short vs long)
  const hasExplicitShort =
    noTone.includes('ะ') ||
    noTone.includes('ั') ||
    noTone.includes('ิ') ||
    noTone.includes('ึ') ||
    noTone.includes('ุ') ||
    noTone.includes('็') ||
    noTone.includes('ำ') ||
    /^[ใไ]/.test(noTone) ||
    /^เ[\u0E01-\u0E2E]{1,2}า$/.test(noTone);

  // Exception: เ-ีย + consonant (e.g. เสีย, เนียน) & เ-ือ (เพื่อน) & -ัว (ตัว) are LONG vowels
  const isLongCompound =
    /เ[\u0E01-\u0E2E]{1,2}ี/.test(noTone) ||
    /เ[\u0E01-\u0E2E]{1,2}ื/.test(noTone) ||
    (/ั/.test(noTone) && /^[\u0E01-\u0E2E]{1,2}ัว/.test(noTone));

  // Double consonant with implicit short vowel -โอะ/-อะ (e.g., คน, ตก, จบ, บน, ลม)
  const isImplicitShortClosed =
    !noTone.includes('า') &&
    !noTone.includes('ี') &&
    !noTone.includes('ู') &&
    !noTone.includes('ื') &&
    !LEADING_VOWELS.has(noTone[0] ?? '') &&
    !noTone.includes('อ') &&
    !hasExplicitShort;

  const vowelLength: ThaiVowelLength =
    isLongCompound ? 'long' : hasExplicitShort || isImplicitShortClosed ? 'short' : 'long';

  const codaFamily = detectCodaFamily(noTone, vowelLength === 'short');

  // คำเป็น (Live): แม่ กง กน กม เกย เกอว, หรือ อำ ไอ ใอ เอา, หรือ แม่ ก กา + สระเสียงยาว
  const isSonorantCoda =
    codaFamily === 'กง' ||
    codaFamily === 'กน' ||
    codaFamily === 'กม' ||
    codaFamily === 'เกย' ||
    codaFamily === 'เกอว';
  const isLiveSyllable = isSonorantCoda || (codaFamily === 'ก กา' && vowelLength === 'long');

  // วรรณยุกต์ 5 เสียง ตามหลักไตรยางศ์ + คำเป็น/ตาย + รูปวรรณยุกต์
  let tone: ThaiToneName = 'สามัญ';
  if (toneMark !== 'none') {
    if (consonantClass === 'mid') {
      if (toneMark === 'mai-ek') tone = 'เอก';
      else if (toneMark === 'mai-tho') tone = 'โท';
      else if (toneMark === 'mai-tri') tone = 'ตรี';
      else tone = 'จัตวา';
    } else if (consonantClass === 'high') {
      tone = toneMark === 'mai-ek' ? 'เอก' : toneMark === 'mai-tho' ? 'โท' : 'จัตวา';
    } else {
      // อักษรต่ำ: รูปเอก เสียงโท / รูปโท เสียงตรี
      tone = toneMark === 'mai-ek' ? 'โท' : toneMark === 'mai-tho' ? 'ตรี' : 'สามัญ';
    }
  } else if (isLiveSyllable) {
    tone = consonantClass === 'high' ? 'จัตวา' : 'สามัญ';
  } else {
    // คำตาย ไม่มีรูปวรรณยุกต์
    if (consonantClass === 'mid' || consonantClass === 'high') {
      tone = 'เอก';
    } else {
      tone = vowelLength === 'short' ? 'ตรี' : 'โท';
    }
  }

  let pitchTarget: MelodyPitchTarget = 'mid';
  if (tone === 'ตรี') pitchTarget = 'high';
  else if (tone === 'จัตวา') pitchTarget = 'rising';
  else if (tone === 'เอก') pitchTarget = 'low';
  else pitchTarget = 'mid';

  const livenessLabel: ThaiSyllableLiveness = isLiveSyllable ? 'คำเป็น' : 'คำตาย';
  const vowelLengthLabel: 'สระเสียงสั้น' | 'สระเสียงยาว' =
    vowelLength === 'short' ? 'สระเสียงสั้น' : 'สระเสียงยาว';

  const pitchHint =
    pitchTarget === 'rising'
      ? 'เหมาะวางโน้ตไล่ระดับขึ้น หรือเอื้อนท้ายวรรค'
      : pitchTarget === 'high'
        ? 'เหมาะวางโน้ตระดับสูงในคอร์ด (5th/8th) เพื่อให้เสียงคมชัดไม่เพี้ยน'
        : pitchTarget === 'low'
          ? 'เหมาะวางโน้ตระดับต่ำ/กลาง (Root/3rd) เลี่ยงการกระโดดสูงเกินไป'
          : 'วางโน้ตไหลลื่นตามแนวทำนองหลักได้อิสระ';

  const rhymeGroupId = classifyRhymeGroupId(rawLastSyl);

  return {
    rawWord: cleanRaw,
    lastSyllable: rawLastSyl,
    initialConsonant,
    consonantClass,
    consonantClassLabel,
    hasHoNam,
    vowelLength,
    vowelLengthLabel,
    codaFamily,
    isLiveSyllable,
    livenessLabel,
    toneMark,
    tone,
    pitchTarget,
    melodyAdvice: `${livenessLabel} • เสียง${tone} (${codaFamily}) — ${pitchHint}`,
    rhymeGroupId: rhymeGroupId.startsWith('unknown:') ? null : rhymeGroupId,
  };
}

export function classifyRhymeGroupId(word: string): string {
  const trimmed = word.trim();
  const syl = normalizeLastSyllable(word);
  if (!syl) return 'unknown:empty';

  // ตรวจสอบพจนานุกรมก่อน (รองรับคำสะกดพิเศษ เช่น อัศจรรย์, ถวิล, ชัวร์)
  const direct = THAI_RHYME_GROUPS.find((g) => g.words.includes(trimmed) || g.words.includes(syl));
  if (direct) return direct.id;

  const normalizeCoda = (c: string): string => {
    if (c === 'ง') return 'กง';
    if ('นญณรลฬ'.includes(c)) return 'กน';
    if (c === 'ม') return 'กม';
    if (c === 'ย') return 'เกย';
    if (c === 'ว') return 'เกอว';
    if ('กขคฆ'.includes(c)) return 'กก';
    if ('ดจชซฎฏฐฑฒตถทธศษส'.includes(c)) return 'กด';
    if ('บปพฟภ'.includes(c)) return 'กบ';
    return c;
  };

  // จัดลำดับการจับรูปแบบจากจำเพาะที่สุดไปยังสระเดี่ยว + normalize มาตราตัวสะกด
  if (/[ไใ][\u0E01-\u0E2E]{1,2}$/.test(syl) || /ัย$/.test(syl)) return 'ai';
  if (/เ[\u0E01-\u0E2E]{1,2}ีย[นณญรลฬ]$/.test(syl)) return 'ian';
  if (/เ[\u0E01-\u0E2E]{1,2}ีย$/.test(syl)) return 'ia';
  if (/เ[\u0E01-\u0E2E]{1,2}ีย([กขคฆงจชซดตถทธนบปพฟภมยรลวศษสหฬอ])$/.test(syl)) {
    const coda = syl.slice(-1);
    return `ia:${normalizeCoda(coda)}`;
  }
  if (/เ[\u0E01-\u0E2E]{1,2}ือ[นณญรลฬ]$/.test(syl)) return 'uean';
  if (/เ[\u0E01-\u0E2E]{1,2}ือ([กขคฆงดตถทธนบปพฟภมยรลว]?)$/.test(syl)) {
    const last = syl.slice(-1);
    return last === 'อ' ? 'uea' : `uea:${normalizeCoda(last)}`;
  }
  if (/^เ[\u0E01-\u0E2E]{1,2}ิ[นณญรลฬ]$/.test(syl)) return 'oen';
  if (/^เ[\u0E01-\u0E2E]{1,2}ิม$/.test(syl)) return 'oem';
  if (/^เ[\u0E01-\u0E2E]{1,2}ิง$/.test(syl)) return 'oeng';
  if (/^เ[\u0E01-\u0E2E]{1,2}ิ[ดตถทธจชซศษส]$/.test(syl)) return 'oet';
  if (/^เ[\u0E01-\u0E2E]{1,2}ิ[กขคฆ]$/.test(syl)) return 'oek';
  if (/^เ[\u0E01-\u0E2E]{1,2}ิ[บปพฟภ]$/.test(syl)) return 'oep';
  if (/^เ[\u0E01-\u0E2E]{1,2}า$/.test(syl)) return 'ao';
  if (/^เ[\u0E01-\u0E2E]{1,2}อ$/.test(syl)) return 'oe';
  if (/^เ[\u0E01-\u0E2E]{1,2}ย$/.test(syl)) return 'oey';
  if (/^เ[\u0E01-\u0E2E]{1,2}ง$/.test(syl)) return 'eng';
  if (/^เ[\u0E01-\u0E2E]{1,2}็?[นณญรลฬ]$/.test(syl)) return 'en';
  if (/^เ[\u0E01-\u0E2E]{1,2}็?[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'et';
  if (/^เ[\u0E01-\u0E2E]{1,2}็?[บปพฟภ]$/.test(syl)) return 'ep';
  if (/^เ[\u0E01-\u0E2E]{1,2}็?ม$/.test(syl)) return 'em';
  if (/^เ[\u0E01-\u0E2E]{1,2}็?[กขคฆ]$/.test(syl)) return 'ek';
  if (/^เ[\u0E01-\u0E2E]{1,2}ว$/.test(syl)) return 'ew';
  if (/^เ[\u0E01-\u0E2E]{1,2}$/.test(syl)) return 'eh';

  if (/^แ[\u0E01-\u0E2E]{1,2}ง$/.test(syl)) return 'aeng';
  if (/^แ[\u0E01-\u0E2E]{1,2}[กขคฆ]$/.test(syl)) return 'aek';
  if (/^แ[\u0E01-\u0E2E]{1,2}ว$/.test(syl)) return 'aew';
  if (/^แ[\u0E01-\u0E2E]{1,2}[นณญรลฬ]$/.test(syl)) return 'aen';
  if (/^แ[\u0E01-\u0E2E]{1,2}ม$/.test(syl)) return 'aem';
  if (/^แ[\u0E01-\u0E2E]{1,2}[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'aet';
  if (/^แ[\u0E01-\u0E2E]{1,2}[บปพฟภ]$/.test(syl)) return 'aep';
  if (/^แ[\u0E01-\u0E2E]{1,2}ะ?$/.test(syl)) return 'ae';

  if (/^โ[\u0E01-\u0E2E]{1,2}[กขคฆ]$/.test(syl) || /^[\u0E01-\u0E2E]{1,2}[กขคฆ]$/.test(syl)) return 'ok';
  if (/^โ[\u0E01-\u0E2E]{1,2}[นณญรลฬ]$/.test(syl)) return 'on_long';
  if (/^โ[\u0E01-\u0E2E]{1,2}ย$/.test(syl)) return 'ooi';
  if (/^โ[\u0E01-\u0E2E]{1,2}ง$/.test(syl)) return 'oong';
  if (/^โ[\u0E01-\u0E2E]{1,2}ม$/.test(syl)) return 'oom';
  if (/^โ[\u0E01-\u0E2E]{1,2}[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'oot';
  if (/^โ[\u0E01-\u0E2E]{1,2}[บปพฟภ]$/.test(syl)) return 'oop';
  if (/^โ[\u0E01-\u0E2E]{1,2}$/.test(syl)) return 'oo';

  if (/ำ$/.test(syl) || /ัม$/.test(syl)) return 'am';
  if (/าย$/.test(syl)) return 'aai';
  if (/าว$/.test(syl)) return 'aao';
  if (/าง$/.test(syl)) return 'ang';
  if (/า[นณญรลฬ]$/.test(syl)) return 'aan';
  if (/า[กขคฆ]$/.test(syl)) return 'aak';
  if (/า[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'aat';
  if (/าม$/.test(syl)) return 'aam';
  if (/า[บปพฟภ]$/.test(syl)) return 'aap';

  if (/ั[กขคฆ]$/.test(syl)) return 'ak';
  if (/ั[นณญรลฬ]$/.test(syl) || /รร$/.test(syl)) return 'an';
  if (/ั[บปพฟภ]$/.test(syl)) return 'ap';
  if (/ั[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'at';
  if (/ัง$/.test(syl)) return 'ang_short';
  if (/ัว$/.test(syl)) return 'ua';

  // สระอัวลดรูปเมื่อมีตัวสะกด (C + ว + ตัวสะกด โดยตัวแรกต้องไม่ใช่ ว เพื่อไม่ชนกับ วน/วง/วด)
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?ว[นณญรลฬ]$/.test(syl)) return 'uan';
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?วย$/.test(syl)) return 'uai';
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?วง$/.test(syl)) return 'uang';
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?วม$/.test(syl)) return 'uam';
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?ว[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'uat';
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?ว[กขคฆ]$/.test(syl)) return 'uak';
  if (/^[\u0E01-\u0E20\u0E22-\u0E2E][\u0E01-\u0E2E]?ว[บปพฟภ]$/.test(syl)) return 'uap';

  // สระออมีตัวสะกด (-อง, -อม, -อย, -อน, -อก, -อด, -อบ)
  if (/^[\u0E01-\u0E2E]{1,2}อง$/.test(syl)) return 'ong';
  if (/^[\u0E01-\u0E2E]{1,2}อม$/.test(syl)) return 'om';
  if (/^[\u0E01-\u0E2E]{1,2}อย$/.test(syl)) return 'oi';
  if (/^[\u0E01-\u0E2E]{1,2}อ[กขคฆ]$/.test(syl)) return 'ork';
  if (/^[\u0E01-\u0E2E]{1,2}อ[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'ot';
  if (/^[\u0E01-\u0E2E]{1,2}อ[บปพฟภ]$/.test(syl)) return 'op';
  if (/อ[นณญรลฬ]$/.test(syl)) return 'orn';

  if (/ึ[ง]$/.test(syl)) return 'ueng';
  if (/ึ[กขคฆ]$/.test(syl)) return 'uek';
  if (/ึ[นณญรลฬ]$/.test(syl)) return 'uen_short';
  if (/ื[นณญรลฬ]$/.test(syl)) return 'uen';
  if (/ืม$/.test(syl)) return 'uem';
  if (/ื[ดตถทธจชซศษส]$/.test(syl)) return 'uet';

  if (/ิ[นณญรลฬ]$/.test(syl)) return 'in';
  if (/ิง$/.test(syl)) return 'ing';
  if (/ิ[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'it';
  if (/ิ[กขคฆ]$/.test(syl)) return 'ik';
  if (/ิ[บปพฟภ]$/.test(syl)) return 'ip';
  if (/ิม$/.test(syl)) return 'im';
  if (/ิว$/.test(syl)) return 'iw';

  if (/ี[นณญรลฬ]$/.test(syl)) return 'een';
  if (/ีม$/.test(syl)) return 'eem';
  if (/ี[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'eet';
  if (/ี[กขคฆ]$/.test(syl)) return 'eek';
  if (/ี[บปพฟภ]$/.test(syl)) return 'eep';

  if (/ูง$/.test(syl)) return 'uung';
  if (/ู[นณญรลฬ]$/.test(syl)) return 'uun';
  if (/ู[กขคฆ]$/.test(syl)) return 'uuk';
  if (/ู[ดตถทธจชซศษส]$/.test(syl)) return 'uut';
  if (/ู[บปพฟภ]$/.test(syl)) return 'uup';
  if (/ูม$/.test(syl)) return 'uum';

  if (/ุ[ง]$/.test(syl)) return 'ung';
  if (/ุ[นณญรลฬ]$/.test(syl)) return 'un';
  if (/ุ[ม]$/.test(syl)) return 'um';
  if (/ุ[กขคฆ]$/.test(syl)) return 'uk';
  if (/ุ[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'ut';
  if (/ุ[บปพฟภ]$/.test(syl)) return 'up';

  // สระโอะลดรูปปิดท้าย (คน, จน, ฝน, ลม, จม, ลง, ตรง, จบ, หมด)
  if (/^[\u0E01-\u0E2E]{1,2}[นณญลฬ]$/.test(syl)) return 'on_short';
  if (/^[\u0E01-\u0E2E]{1,2}ม$/.test(syl)) return 'om_short';
  if (/^[\u0E01-\u0E2E]{1,2}ง$/.test(syl)) return 'ong_short';
  if (/^[\u0E01-\u0E2E]{1,2}[บปพฟภ]$/.test(syl)) return 'op_short';
  if (/^[\u0E01-\u0E2E]{1,2}[ดตถทธจชซศษสฎฏฐฑฒ]$/.test(syl)) return 'ot_short';

  // สระอือไร้ตัวสะกด (มือ, ถือ, คือ, จับมือ) — เช็กก่อน /อ$/ เพื่อไม่ให้ตกเป็น 'or' (สระออ)
  if (/[\u0E01-\u0E2E]ือ$/.test(syl)) return 'ue';

  // สระเสียงสั้นและสระประสมที่พบบ่อยในเนื้อเพลงป็อป (หัวเราะ, คุย, เยอะ, โต๊ะ, เตะ, นะ)
  if (/เ[\u0E01-\u0E2E]{1,2}าะ$/.test(syl)) return 'oh_short';
  if (/เ[\u0E01-\u0E2E]{1,2}อะ$/.test(syl)) return 'oe_short';
  if (/โ[\u0E01-\u0E2E]{1,2}ะ$/.test(syl)) return 'o_short';
  if (/เ[\u0E01-\u0E2E]{1,2}ะ$/.test(syl)) return 'eh_short';
  if (/[\u0E01-\u0E2E]ุย$/.test(syl)) return 'ui';
  if (/[\u0E01-\u0E2E]ะ$/.test(syl)) return 'a_short';

  if (/า$/.test(syl)) return 'aa';
  if (/ี$/.test(syl)) return 'ee';
  if (/ู$/.test(syl)) return 'uu';
  if (/อ$/.test(syl)) return 'or';

  // คำที่ยังไม่เข้ากฎสระมาตรฐาน ให้คืน signature เฉพาะท้ายคำแทน 'aa' เพื่อไม่ให้จับคู่สัมผัสผิดพลาด
  return `other:${syl.slice(-2)}`;
}

/**
 * หาคำสัมผัสภาษาไทยสำหรับคำที่ระบุ (0 เครดิต ทำงานในเครื่อง 100%)
 */
export function findThaiRhymes(word: string): ThaiRhymeResult {
  const cleanInput = word.trim();
  if (!cleanInput) {
    const def = THAI_RHYME_GROUPS[0];
    return { groupLabel: def.groupLabel, suggestions: [...def.words] };
  }

  // ถ้าผู้ใช้เลือก ID หรือ GroupLabel มาตรงๆ (เช่นจากปุ่ม quick chip)
  const byId = THAI_RHYME_GROUPS.find((g) => g.id === cleanInput || g.groupLabel === cleanInput);
  if (byId) {
    return { groupLabel: byId.groupLabel, suggestions: [...byId.words] };
  }

  const groupId = classifyRhymeGroupId(cleanInput);
  const group = THAI_RHYME_GROUPS.find((g) => g.id === groupId) || THAI_RHYME_GROUPS[0];
  const suggestions = group.words.filter((w) => w !== cleanInput);

  return {
    groupLabel: group.groupLabel,
    suggestions: suggestions.length > 0 ? suggestions : [...group.words],
  };
}

/**
 * หาคำสัมผัสพร้อมกรองตาม คำเป็น/คำตาย และวรรณยุกต์ 5 เสียง เพื่อความแม่นยำในการลงเมโลดี้
 */
export function filterThaiRhymes(
  word: string,
  filter?: {
    liveness?: 'all' | 'live' | 'dead';
    tone?: ThaiToneName | 'all';
  }
): FilteredThaiRhymeResult {
  const base = findThaiRhymes(word);
  const inputPhonetics = analyzeThaiSyllablePhonetics(word);
  const enriched = base.suggestions.map((w) => ({
    word: w,
    phonetics: analyzeThaiSyllablePhonetics(w),
  }));

  const filtered = enriched.filter(({ phonetics }) => {
    if (filter?.liveness === 'live' && !phonetics.isLiveSyllable) return false;
    if (filter?.liveness === 'dead' && phonetics.isLiveSyllable) return false;
    if (filter?.tone && filter.tone !== 'all' && phonetics.tone !== filter.tone) return false;
    return true;
  });

  return {
    groupLabel: base.groupLabel,
    suggestions: filtered.map((f) => f.word),
    inputPhonetics,
    filteredSuggestions: filtered,
  };
}

export interface ValidateThaiLyricOptions {
  bpm?: number;
  timeSignature?: '4/4' | '3/4' | '6/8';
  sectionType?: SectionType;
  minSyllables?: number;
  maxSyllables?: number;
  enforceSyllableBudget?: boolean;
  allowCoupletOrAlternateRhyme?: boolean;
}

export interface OutOfBudgetBarReport {
  barIndex: number;
  syllables: number;
  expectedMin: number;
  expectedMax: number;
}

export interface ThaiLyricCoupletReport {
  passed: boolean;
  matchedPairs: Array<{
    fromBar: number;
    toBar: number;
    sharedGroupId: string;
    linkType?: 'end-to-end' | 'end-to-internal';
  }>;
  weakPairs: Array<[number, number]>;
  rhymeDensityScore?: number;
  chainContinuityRatio?: number;
  duplicateEndWords?: string[];
  uniqueRhymeGroups?: string[];
  hasVowelShift?: boolean;
  syllableCounts?: number[];
  outOfBudgetBars?: OutOfBudgetBarReport[];
  linePhonetics?: ThaiSyllablePhonetics[];
}

/**
 * หา ID ของกลุ่มสระ/มาตราตัวสะกดของคำแรกหรือท้ายวรรคภาษาไทย
 */
export function getRhymeGroupIdForWord(word: string): string {
  return classifyRhymeGroupId(word);
}

function extractTrailingWordToken(line: string): string {
  const cleaned = line.trim().replace(/[\s,.;:!?'"()\[\]{}\/\\|~\-–—]+$/g, '');
  if (!cleaned) return '';
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('th', { granularity: 'word' });
    const words = Array.from(seg.segment(cleaned))
      .map((s) => s.segment.trim())
      .filter((w) => /[\u0E01-\u0E2E]/.test(w) || /[a-zA-Z0-9]+/.test(w));
    if (words.length > 0) return words[words.length - 1];
  }
  const syls = segmentThaiWordToSyllables(cleaned);
  return syls.length > 0 ? syls[syls.length - 1] : cleaned;
}

function resolveDefaultSyllableBounds(options?: ValidateThaiLyricOptions): {
  expectedMin: number;
  expectedMax: number;
} {
  const bpm = typeof options?.bpm === 'number' && Number.isFinite(options.bpm) ? options.bpm : 85;
  const isCompound = options?.timeSignature === '3/4' || options?.timeSignature === '6/8';
  const isOutro = options?.sectionType === 'outro';
  const defaultMin =
    options?.minSyllables ?? (isOutro ? 3 : bpm <= 76 ? (isCompound ? 3 : 4) : isCompound ? 4 : 5);
  const defaultMax =
    options?.maxSyllables ?? (isOutro ? (isCompound ? 4 : 5) : bpm <= 76 ? (isCompound ? 5 : 6) : isCompound ? 6 : 7);
  return {
    expectedMin: Math.max(1, defaultMin),
    expectedMax: Math.max(defaultMin, defaultMax),
  };
}

/**
 * ตรวจสอบความต่อเนื่องของสัมผัสกลอนเพลงไทยทุกวรรค (ส่งท้ายวรรคเข้าต้น/กลางวรรคถัดไป และสลับสระไม่ซ้ำคำเดิม)
 * พร้อมตรวจจำนวนพยางค์ต่อห้องตาม BPM
 */
export function validateThaiLyricCouplets(
  lines: string[],
  options?: ValidateThaiLyricOptions
): ThaiLyricCoupletReport {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  const linePhonetics = cleaned.map((line) => analyzeThaiSyllablePhonetics(line));
  const syllableCounts = cleaned.map((line) => countThaiEnglishSyllables(line));
  const { expectedMin, expectedMax } = resolveDefaultSyllableBounds(options);
  const outOfBudgetBars: OutOfBudgetBarReport[] = syllableCounts
    .map((syllables, barIndex) => ({ barIndex, syllables, expectedMin, expectedMax }))
    .filter((entry) => entry.syllables < expectedMin || entry.syllables > expectedMax);

  const endGroupIds = cleaned.map((line) => classifyRhymeGroupId(line));
  const uniqueRhymeGroups = Array.from(
    new Set(endGroupIds.filter((id) => !id.startsWith('unknown:')))
  );
  const hasVowelShift = uniqueRhymeGroups.length >= 2;

  const trailingWords = cleaned.map((line) => extractTrailingWordToken(line));
  const wordCounts = new Map<string, number>();
  for (const w of trailingWords) {
    if (!w) continue;
    wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  }
  const duplicateEndWords = Array.from(wordCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([word]) => word);

  if (cleaned.length < 2) {
    const budgetOk = options?.enforceSyllableBudget ? outOfBudgetBars.length === 0 : true;
    return {
      passed: budgetOk,
      matchedPairs: [],
      weakPairs: [],
      rhymeDensityScore: 100,
      chainContinuityRatio: 1,
      duplicateEndWords,
      uniqueRhymeGroups,
      hasVowelShift,
      syllableCounts,
      outOfBudgetBars,
      linePhonetics,
    };
  }

  const getInternalGroupIds = (line: string): string[] => {
    const tokens = segmentThaiWordToSyllables(line).filter((seg) => /[\u0E01-\u0E2E]/.test(seg));
    const internalLimit = Math.min(6, Math.max(1, tokens.length - 1));
    return tokens.slice(0, internalLimit).map((tok) => classifyRhymeGroupId(tok));
  };

  const matchedPairs: ThaiLyricCoupletReport['matchedPairs'] = [];

  for (let i = 0; i < cleaned.length; i += 1) {
    const sourceGroup = endGroupIds[i];
    if (!sourceGroup || sourceGroup.startsWith('unknown:')) continue;

    for (let j = i + 1; j < Math.min(cleaned.length, i + 3); j += 1) {
      if (j === i + 1) {
        const earlyNext = getInternalGroupIds(cleaned[j]);
        if (earlyNext.includes(sourceGroup)) {
          matchedPairs.push({
            fromBar: i,
            toBar: j,
            sharedGroupId: sourceGroup,
            linkType: 'end-to-internal',
          });
          continue;
        }
      }
      if (sourceGroup === endGroupIds[j]) {
        matchedPairs.push({
          fromBar: i,
          toBar: j,
          sharedGroupId: sourceGroup,
          linkType: 'end-to-end',
        });
      }
    }
  }

  const weakPairs: Array<[number, number]> = [];
  const totalTransitions = Math.max(1, cleaned.length - 1);
  let linkedTransitions = 0;

  const allowFlexibleCouplets =
    options?.allowCoupletOrAlternateRhyme === true ||
    (typeof options?.maxSyllables === 'number' && options.maxSyllables <= 6);

  for (let i = 0; i < cleaned.length - 1; i += 1) {
    const directAdjacent = matchedPairs.some((p) => p.fromBar === i && p.toBar === i + 1);
    const alternatingOpen = matchedPairs.some((p) => p.fromBar === i && p.toBar === i + 2);
    const alternatingClose =
      i > 0 && matchedPairs.some((p) => p.fromBar === i - 1 && p.toBar === i + 1);
    const coupletBoundaryTransition =
      allowFlexibleCouplets &&
      i % 2 === 1 &&
      i > 0 &&
      i + 2 < cleaned.length &&
      matchedPairs.some((p) => p.fromBar === i - 1 && p.toBar === i) &&
      matchedPairs.some((p) => p.fromBar === i + 1 && p.toBar === i + 2);

    if (directAdjacent || alternatingOpen || alternatingClose || coupletBoundaryTransition) {
      linkedTransitions += 1;
    } else {
      weakPairs.push([i, i + 1]);
    }
  }

  const chainContinuityRatio = Number((linkedTransitions / totalTransitions).toFixed(2));
  const rhymeDensityScore = Math.min(100, Math.round(chainContinuityRatio * 100));
  const minContinuity = cleaned.length >= 4 ? 0.66 : 1;
  const rhymeOk = matchedPairs.length > 0 && chainContinuityRatio >= minContinuity;
  const budgetOk = options?.enforceSyllableBudget ? outOfBudgetBars.length === 0 : true;

  return {
    passed: rhymeOk && budgetOk,
    matchedPairs,
    weakPairs,
    rhymeDensityScore,
    chainContinuityRatio,
    duplicateEndWords,
    uniqueRhymeGroups,
    hasVowelShift,
    syllableCounts,
    outOfBudgetBars,
    linePhonetics,
  };
}
