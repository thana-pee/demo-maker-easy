/**
 * thaiRhymeHelper.ts — เครื่องมือช่วยหาคำสัมผัสภาษาไทย & นับพยางค์ (0 Credits / Offline)
 *
 * ใช้หลักสระเสียงประสม + มาตราตัวสะกดภาษาไทย (แม่ ก กา, กน, กง, กม, กก, กด, กบ, เกย, เกอว)
 * พร้อม re-export `countThaiEnglishSyllables` จาก sectionUtils โดยไม่ซ้ำโค้ด
 */

import { countThaiEnglishSyllables } from './sectionUtils';

export { countThaiEnglishSyllables };

export interface ThaiRhymeResult {
  groupLabel: string;
  suggestions: string[];
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
    ],
  },
  {
    id: 'aai',
    groupLabel: '-าย / แม่เกย (สระอา)',
    examples: ['หาย', 'สุดท้าย', 'มากมาย'],
    words: [
      'ใจหาย', 'เสียดาย', 'สุดท้าย', 'เดียวดาย', 'มากมาย', 'มลาย',
      'จางหาย', 'ความหมาย', 'ง่ายดาย', 'ข้างกาย', 'โปรยปราย', 'ทักทาย', 'วุ่นวาย',
    ],
  },
  {
    id: 'aao',
    groupLabel: '-าว / แม่เกอว (สระอา)',
    examples: ['ดาว', 'หนาว', 'เรื่องราว'],
    words: [
      'ดวงดาว', 'เรื่องราว', 'เหน็บหนาว', 'สีขาว', 'ยืนยาว', 'แวววาว',
      'พร่างพราว', 'คราว', 'สกาว', 'ผืนฟ้าขาว',
    ],
  },
  {
    id: 'orn',
    groupLabel: '-อน / แม่กน (สระออ)',
    examples: ['ก่อน', 'หมอน', 'สะท้อน'],
    words: [
      'ลาก่อน', 'อ้อนวอน', 'กอดหมอน', 'ย้อน', 'แน่นอน', 'สะท้อน',
      'รุ่มร้อน', 'หลับนอน', 'ซ่อน', 'งอน', 'พร่ำวอน', 'ตอน',
    ],
  },
  {
    id: 'in',
    groupLabel: '-ิน / แม่กน (สระอิ)',
    examples: ['ยิน', 'ดิน', 'บิน'],
    words: [
      'ได้ยิน', 'แผ่นดิน', 'โบยบิน', 'ผืนดิน', 'ก้อนหิน', 'ไหลริน',
      'ตัดสิน', 'เคยชิน', 'ถวิล', 'จบสิ้น', 'มลทิน',
    ],
  },
  {
    id: 'ing',
    groupLabel: '-ิง / แม่กง (สระอิ)',
    examples: ['จริง', 'ทิ้ง', 'นิ่ง'],
    words: [
      'ความจริง', 'แท้จริง', 'ทอดทิ้ง', 'หยุดนิ่ง', 'ทุกสิ่ง', 'อ้างอิง',
      'แอบอิง', 'พึ่งพิง', 'ยิ่ง', 'กลิ้ง',
    ],
  },
  {
    id: 'ak',
    groupLabel: '-ัก / แม่กก (สระอะ)',
    examples: ['รัก', 'พัก', 'หนัก'],
    words: [
      'ความรัก', 'แอบรัก', 'รู้จัก', 'หยุดพัก', 'ทายทัก', 'แน่นหนัก',
      'แตกหัก', 'สมัคร', 'ตัก', 'สลัก', 'พำนัก',
    ],
  },
  {
    id: 'an',
    groupLabel: '-ัน / แม่กน (สระอะ)',
    examples: ['ฝัน', 'กัน', 'วัน'],
    words: [
      'ความฝัน', 'วาดฝัน', 'สักวัน', 'ทุกวัน', 'แบ่งปัน', 'เหมือนกัน',
      'ผูกพัน', 'อัศจรรย์', 'เคียงกัน', 'จับมือกัน', 'สั้น', 'คืนวัน',
    ],
  },
  {
    id: 'ueng',
    groupLabel: '-ึง / แม่กง (สระอึ)',
    examples: ['ถึง', 'ซึ้ง', 'หนึ่ง'],
    words: [
      'คิดถึง', 'ซาบซึ้ง', 'ลึกซึ้ง', 'คำนึง', 'วันหนึ่ง', 'คะนึง',
      'ตรึงใจ', 'บึง', 'ครึ่ง',
    ],
  },
  {
    id: 'ua',
    groupLabel: '-ัว / มาตรา ก กา (สระอัว)',
    examples: ['กลัว', 'ตัว', 'มัว'],
    words: [
      'ตัว', 'หวั่นกลัว', 'ลืมตัว', 'รอบตัว', 'สลัว', 'มืดมัว',
      'หัว', 'ทั้งตัว', 'ชัวร์',
    ],
  },
  {
    id: 'or',
    groupLabel: '-อ / มาตรา ก กา (สระออ)',
    examples: ['รอ', 'พอ', 'ขอ'],
    words: [
      'เฝ้ารอ', 'เพียงพอ', 'อ้อนขอ', 'ทดท้อ', 'ย่อท้อ', 'ติดต่อ',
      'ก่อ', 'ถักทอ', 'พนอ', 'หนอ',
    ],
  },
  {
    id: 'oe',
    groupLabel: '-เออ / มาตรา ก กา (สระเออ)',
    examples: ['เธอ', 'เจอ', 'เสมอ'],
    words: [
      'เธอ', 'พบเจอ', 'เสมอ', 'ละเมอ', 'เผลอ', 'พร่ำเพ้อ',
      'เคยเจอ', 'เออ', 'ปรนเปรอ', 'เรอ',
    ],
  },
  {
    id: 'ai',
    groupLabel: '-ใจ / -ไ- / -ใ-',
    examples: ['หัวใจ', 'ไกล', 'ไหว'],
    words: [
      'หัวใจ', 'ข้างใน', 'ห่างไกล', 'เมื่อไหร่', 'เชื่อใจ', 'หวั่นไหว',
      'อ่อนไหว', 'เข้าใจ', 'เสียใจ', 'ลืมไป', 'เป็นไป', 'สดใส', 'ข้างในใจ',
    ],
  },
  {
    id: 'ee',
    groupLabel: '-ี / มาตรา ก กา (สระอี)',
    examples: ['มี', 'ดี', 'นาที'],
    words: [
      'แสนดี', 'ยังมี', 'นาที', 'คืนนี้', 'ราตรี', 'สักที',
      'ยินดี', 'ไม่มี', 'ปรานี', 'วิธี', 'คนดี',
    ],
  },
  {
    id: 'ang',
    groupLabel: '-าง / แม่กง (สระอา)',
    examples: ['ทาง', 'ข้าง', 'จาง'],
    words: [
      'เส้นทาง', 'เดินทาง', 'เคียงข้าง', 'อ้างว้าง', 'เลือนราง', 'เบาบาง',
      'ระหว่าง', 'สว่าง', 'จืดจาง', 'หนทาง',
    ],
  },
];

function normalizeLastSyllable(rawWord: string): string {
  // ตัดวรรณยุกต์ + การันต์ ท้ายพยางค์เพื่อวิเคราะห์เสียงสระและตัวสะกด
  const cleaned = rawWord
    .trim()
    .replace(/[\u0E48-\u0E4B]/g, '') // remove tone marks ่ ้ ๊ ๋
    .replace(/[\u0E01-\u0E2E][\u0E34\u0E38]?\u0E4C/g, '') // strip X์
    .replace(/\u0E4C/g, '');

  // แยกคำสุดท้ายกรณีผู้ใช้พิมพ์เป็นประโยคหรือวลี
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter('th', { granularity: 'word' });
    let lastThai = '';
    for (const part of seg.segment(cleaned)) {
      if (/[\u0E01-\u0E2E]/.test(part.segment)) {
        lastThai = part.segment;
      }
    }
    if (lastThai) return lastThai;
  }

  const tokens = cleaned.match(/[\u0E00-\u0E7F]+/g);
  return tokens && tokens.length > 0 ? tokens[tokens.length - 1] : cleaned;
}

function classifyRhymeGroupId(word: string): string {
  const trimmed = word.trim();
  const syl = normalizeLastSyllable(word);
  if (!syl) return 'ai';

  // ตรวจสอบพจนานุกรมก่อน (รองรับคำสะกดพิเศษ เช่น อัศจรรย์, ถวิล, ชัวร์)
  const direct = THAI_RHYME_GROUPS.find((g) => g.words.includes(trimmed) || g.words.includes(syl));
  if (direct) return direct.id;

  // จัดลำดับการจับรูปแบบจากจำเพาะที่สุดไปยังสระเดี่ยว
  if (/[ไใ][\u0E01-\u0E2E]{1,2}$/.test(syl) || /ัย$/.test(syl)) return 'ai';
  if (/เ[\u0E01-\u0E2E]{1,2}อ$/.test(syl)) return 'oe';
  if (/าย$/.test(syl)) return 'aai';
  if (/าว$/.test(syl)) return 'aao';
  if (/าง$/.test(syl)) return 'ang';
  if (/ัก$/.test(syl) || /ั[กขคฆ]$/.test(syl)) return 'ak';
  if (/ั[นณญรลฬ]$/.test(syl)) return 'an';
  if (/ัว$/.test(syl)) return 'ua';
  if (/ึ[ง]$/.test(syl)) return 'ueng';
  if (/ิ[นณญรลฬ]$/.test(syl)) return 'in';
  if (/ิง$/.test(syl)) return 'ing';
  if (/อ[นณญรลฬ]$/.test(syl)) return 'orn';
  if (/า$/.test(syl)) return 'aa';
  if (/ี$/.test(syl)) return 'ee';
  if (/อ$/.test(syl)) return 'or';

  return 'aa';
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
