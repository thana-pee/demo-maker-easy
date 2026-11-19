import type {
  LyricDensityMode,
  SectionIntensity,
  SectionType,
  SongProject,
  StoryBlueprintInput,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
  TimeSignature,
  VocalPhrasingProfile,
} from '../types/song';
import { getChordEmotionalHint, transposeChord } from './chordUtils';
import { midiToNoteName } from './melodyUtils';
import { analyzeThaiSyllablePhonetics } from './thaiRhymeHelper';

/**
 * ศูนย์รวม System Prompt, กฎการแต่งเนื้อเพลงไทย, หลักการ Arrange ของโปรดิวเซอร์,
 * Golden Few-Shot Examples และ JSON Schema สำหรับโมเดล Gemini (@google/genai)
 * แยกจาก Business Logic เพื่อให้ง่ายต่อการจูนคุณภาพและอัปเกรดเป็นรายฟีเจอร์
 */

export interface ThaiGenreProfile {
  id: ThaiSongGenre;
  label: string;
  shortDesc: string;
  lyricRules: string;
  rhymePreference: string;
  sunoTags: string;
}

export const THAI_GENRE_PROFILES: readonly ThaiGenreProfile[] = [
  {
    id: 'thai-pop',
    label: 'ไทยป๊อป (Thai Pop / T-Pop)',
    shortDesc: 'ภาษาพูดร่วมสมัย ประโยคติดหู ท่อนฮุกมีคำจำชัด',
    lyricRules:
      'ใช้ภาษาพูดร่วมสมัยที่เป็นธรรมชาติ เล่าด้วยภาพจำในชีวิตประจำวัน ท่อนฮุกต้องมีประโยคสั้นติดหู (Hook) ที่ร้องตามได้ทันที เลี่ยงศัพท์โบราณหรือศัพท์กวีที่แข็งเกินไป',
    rhymePreference: 'ส่งสัมผัสสระท้ายวรรคไปต้นหรือท้ายวรรคถัดไป สลับคำเป็นและคำตายให้มีจังหวะน่าฟัง',
    sunoTags: 'Thai Pop, T-Pop, Contemporary Thai Acoustic Pop, catchy vocal hook, warm studio production',
  },
  {
    id: 'thai-rock',
    label: 'ไทยร็อก (Thai Rock / Modern Rock)',
    shortDesc: 'คำหนักแน่น กระชับ มีพลัง ร้องตะโกนตามได้',
    lyricRules:
      'ใช้คำที่หนักแน่น ชัดเจน ตรงไปตรงมา (Power words) เน้นพยางค์ลงจังหวะตกที่ Beat 1 และ Beat 3 อย่างเฉียบขาด ท่อน Chorus พุ่งทะยานและปลดปล่อยอารมณ์ได้เต็มที่',
    rhymePreference: 'เน้นสัมผัสแม่กก/กน/กง/กบที่กระชับ มีน้ำหนักหยุดหรือพุ่งชัดเจนท้ายวรรค',
    sunoTags: 'Thai Rock, 90s-2000s Thai Alternative Rock, driving electric guitar, emotional powerhouse Thai vocals',
  },
  {
    id: 'phuea-chiwit',
    label: 'เพื่อชีวิต (Phuea Chiwit)',
    shortDesc: 'จริงใจ เล่าเรื่องชีวิต ความฝัน ถนน สายลม มิตรภาพ',
    lyricRules:
      'ใช้ถ้อยคำจริงใจ ติดดิน มีความหมายเชิงปรัชญาชีวิต การเดินทาง ความอดทน มิตรภาพ แสงดาว สายลม ทุ่งนา หรือแสงไฟเมืองกรุง พูดตรงกับหัวใจคนสู้ชีวิตโดยไม่ประดิษฐ์เกินจริง',
    rhymePreference: 'ใช้สัมผัสแบบกลอนเพลงพื้นบ้าน-โฟล์กที่ไหลลื่น อ่านเป็นจังหวะจะโคนแบบกีตาร์โปร่ง+ขลุ่ย/ฮาร์โมนิก้า',
    sunoTags: 'Phuea Chiwit, Thai Folk Rock, acoustic guitar storytelling, harmonica warmth, heartfelt gravelly Thai vocal',
  },
  {
    id: 'luk-thung',
    label: 'ลูกทุ่งไทย (Luk Thung)',
    shortDesc: 'สละสลวย กินใจ เห็นภาพวิถีชีวิต เอื้อนลูกคอท้ายวรรคได้สวย',
    lyricRules:
      'แต่งด้วยภาษาไทยสละสลวย เปรียบเทียบกับธรรมชาติ วิถีชีวิต บ้านนา ลมหนาว ความรักความคิดถึงที่ตรงไปตรงมาและซื่อสัตย์ เปิดช่องท้ายวรรคให้เอื้อนลูกคอ (Luk Kho) ได้ไพเราะ',
    rhymePreference:
      'บังคับท้ายวรรคสำคัญใช้ "คำเป็น" สระเสียงยาว (เช่น -า, -าย, -าว, -อน, -อง, -ใจ, -าง) เพื่อให้นักร้องทอดเสียงและเอื้อนลูกคอได้อย่างเป็นธรรมชาติ และเชื่อมสัมผัสในแบบกลอนลูกทุ่งไทย',
    sunoTags: 'Luk Thung, Thai Country Soul, expressive Thai vocal vibrato and melisma (Luk Kho), lush folk-country band, acoustic and phin textures',
  },
  {
    id: 'luk-krung',
    label: 'ลูกกรุง (Luk Krung Classic)',
    shortDesc: 'ภาษากวีประณีต สัมผัสในพริ้วไหว ละมุนคลาสสิก',
    lyricRules:
      'ใช้ภาษากวีไทยอันวิจิตรประณีต สุภาพ นุ่มนวล ลึกซึ้ง อุปมาอุปไมยกับดวงจันทร์ สายลม รัตติกาล น้ำค้าง และรักอันบริสุทธิ์ หลีกเลี่ยงคำแสลงสมัยใหม่เด็ดขาด',
    rhymePreference:
      'ต้องมีทั้งสัมผัสสระท้ายวรรคและสัมผัสอักษร/สัมผัสในวรรคที่พริ้วไหว ท้ายวรรคใช้คำเป็นสระเสียงยาวเพื่อลากเสียงละมุนแบบคลาสสิก',
    sunoTags: 'Luk Krung, Vintage Thai Classic Ballad, smooth crooner vocal, warm orchestral piano and nylon guitar, timeless 1960s-70s Bangkok jazz-ballad feel',
  },
  {
    id: 'acoustic-indie',
    label: 'อะคูสติกอินดี้ / โฟล์ก (Acoustic Indie)',
    shortDesc: 'เหมือนเขียนไดอารี่ อบอุ่น เหงาละมุน ใกล้ชิด',
    lyricRules:
      'เล่าเรื่องจากรายละเอียดเล็กๆ รอบตัว (แสงแดดบ่าย ห้องนอน แก้วน้ำ ลมเย็น) น้ำเสียงกระซิบจริงใจเหมือนคุยกับคนสนิท จังหวะร้องผ่อนคลายไม่เร่งรีบ',
    rhymePreference: 'สัมผัสธรรมชาติไม่จงใจจนแข็ง เน้นจังหวะหายใจสบายๆ 5-8 พยางค์',
    sunoTags: 'Thai Indie Acoustic, warm fingerstyle guitar, intimate bedroom pop ballad, soft airy vocal',
  },
  {
    id: 'thai-rnb',
    label: 'ไทย R&B / Soul',
    shortDesc: 'พริ้วไหว เอื้อนเมโลดี้สวย สระเปิดนุ่มนวล',
    lyricRules:
      'เน้นคำที่มีสระเปิดและตัวสะกดแม่กง/กน/กม ที่ร้องเอื้อน Melisma และ Syncopation ได้ลื่นไหล อารมณ์โรแมนติกหรือหม่นละมุนแบบคนเมือง',
    rhymePreference: 'สระเปิดและแม่นาสิก (-าง, -าม, -าน, -อน, -าย, -ใจ) ท้ายห้องเพื่อปล่อยหางเสียงสวยๆ',
    sunoTags: 'Thai R&B Soul, smooth Rhodes chords, silky vocal runs, laid-back groove, warm sub bass',
  },
];

export const THAI_ERA_PROFILES: ReadonlyArray<{
  id: ThaiLyricEra;
  label: string;
  guidance: string;
  sunoHint: string;
}> = [
  {
    id: 'modern-indie',
    label: 'ร่วมสมัย (Modern)',
    guidance: 'ภาษาปัจจุบันที่คนฟังวันนี้ใช้จริง ภาพจำสมัยใหม่แต่ยังซึ้งกินใจ',
    sunoHint: 'modern production',
  },
  {
    id: 'era-80s',
    label: 'ยุค 80s คลาสสิก',
    guidance: 'สำนวนนุ่มนวลสุภาพ กลิ่นอายสตริงคอมโบ-คลาสสิก เน้นความไพเราะของรูปประโยค',
    sunoHint: '80s Thai string combo retro warm tape feel',
  },
  {
    id: 'era-90s',
    label: 'ยุค 90s ทองคำ (อัลเทอร์เนทีฟ/ป๊อป)',
    guidance: 'จริงใจ โรแมนติกปนเศร้าแบบยุค 90s ใช้คำเรียบง่ายแต่จำติดหูตลอดกาล',
    sunoHint: '90s Thai pop-rock golden era nostalgia',
  },
  {
    id: 'era-2000s',
    label: 'ยุค 2000s ฮิตติดชาร์ต',
    guidance: 'ประโยคคำคมหักมุมชัดๆ ท่อนฮุคติดหูร้องในคาราโอเกะได้ทุกคน',
    sunoHint: '2000s Thai hit ballad band arrangement',
  },
  {
    id: 'gen-z',
    label: 'ยุค Gen Z',
    guidance: 'กระชับ ตรงความรู้สึก เล่าโมเมนต์แชท/เมือง/กลางคืน แบบไม่เป็นทางการแต่มีเสน่ห์',
    sunoHint: 'modern bedroom pop Gen Z aesthetic',
  },
];

export const THAI_DIALECT_PROFILES: ReadonlyArray<{
  id: ThaiLyricDialect;
  label: string;
  guidance: string;
}> = [
  {
    id: 'standard',
    label: 'ภาษากลางมาตรฐาน',
    guidance: 'ใช้ภาษากลางสุภาพหรือภาษาพูดกลางที่เป็นธรรมชาติทั่วประเทศ',
  },
  {
    id: 'northern',
    label: 'กลิ่นอายคำเมือง (เหนือ)',
    guidance:
      'แทรกคำเมืองที่นุ่มนวลและคนไทยทั้งประเทศฟังเข้าใจง่าย (เช่น ฮัก, คึดถึง, อ้าย, เจ้า, กาสะลอง, ม่อนดอย, เย็นใจ๋, บ่) อย่างพอดี ไม่ฝืนจนอ่านไม่ออก',
  },
  {
    id: 'isan',
    label: 'กลิ่นอายภาษาอีสาน',
    guidance:
      'ใช้ถ้อยคำอีสานที่จริงใจกินใจ (เช่น ฮัก, คิดฮอด, อ้าย, เจ้า, บ่, ย้อนว่า, ถ่า, เบิดใจ, ผู้สาว) ผสมคำไทยให้คนทุกภาคเข้าใจอารมณ์ได้ทันที',
  },
  {
    id: 'suphan-central',
    label: 'กลิ่นอายลูกทุ่งภาคกลาง / สุพรรณ',
    guidance:
      'ใช้ถ้อยคำพื้นบ้านภาคกลางที่จริงใจอ่อนหวาน (เช่น พี่จ๋า, คนดี, บ้านนา, ท้องทุ่ง, ลมว่าว) เหมาะกับคำเอื้อนแบบลูกทุ่งแท้',
  },
  {
    id: 'southern',
    label: 'กลิ่นอายปักษ์ใต้',
    guidance:
      'สอดแทรกคำปักษ์ใต้ที่มีเสน่ห์และจริงใจ (เช่น พี่บ่าว, น้องสาว, ลมเล, แหลง, หรอย, คิดถึงจังหู) ให้ได้ฟีลคนใต้รักจริงแต่ยังร้องตามง่าย',
  },
];

export const SONGWRITER_STYLE_PROFILES: ReadonlyArray<{
  id: ThaiSongwriterStyle;
  label: string;
  guidance: string;
}> = [
  {
    id: 'none',
    label: 'ไม่ระบุ (อิสระตามแนวเพลง)',
    guidance: 'เลือกใช้ภาษาที่เป็นธรรมชาติและเหมาะกับแนวเพลงที่เลือกมากที่สุด',
  },
  {
    id: 'boy-kosiyabong',
    label: 'แรงบันดาลใจ: อบอุ่นละมุน (สไตล์บอย โกษิยพงษ์)',
    guidance:
      'มุมมองความรักเชิงบวก อบอุ่น จริงใจ เหมือนเล่าความรู้สึกให้คนรักฟังอย่างอ่อนโยน ประโยคไหลลื่นธรรมชาติ ผสมภาพความสุขเรียบง่าย (เสียงหัวเราะ สายลม เวลาที่อยู่ด้วยกัน)',
  },
  {
    id: 'dee-nitipong',
    label: 'แรงบันดาลใจ: คมคายบาดลึก (สไตล์ดี้ นิติพงษ์)',
    guidance:
      'ใช้การเปรียบเปรยที่ฉลาดและคาดไม่ถึง หักมุมทางความคิดได้คมกริบ คำน้อยแต่กินความลึก ท่อน Chorus มีประโยคทองสั้นๆ ที่แทงใจดำคนฟังได้ทันที',
  },
  {
    id: 'seefa',
    label: 'แรงบันดาลใจ: ละเมียดเหงาจับใจ (สไตล์สีฟ้า)',
    guidance:
      'ละเมียดละไม เข้าใจหัวอกคนช้ำรักและคนรอคอย ถ่ายทอดความเปราะบาง ความเจียมตัว และความเสียใจแบบผู้ใหญ่ที่เก็บอาการแต่น้ำตาซึม',
  },
  {
    id: 'sek-loso',
    label: 'แรงบันดาลใจ: ร็อกสามัญชนตรงใจ (สไตล์เสก โลโซ)',
    guidance:
      'ใช้คำง่ายที่สุด ตรงไปตรงมาที่สุด ไม่มีคำหรูหราซับซ้อน แต่จริงใจแบบลูกผู้ชาย/สามัญชน ฟังรอบเดียวร้องตามได้เลย จังหวะคำลงตัวกับกีตาร์โปร่งและกีตาร์ร็อก',
  },
  {
    id: 'suea-thanapol',
    label: 'แรงบันดาลใจ: เพื่อชีวิต-ศักดิ์ศรี (สไตล์เสือ ธนพล)',
    guidance:
      'ผสานพลังร็อกเข้ากับจิตวิญญาณเพื่อชีวิต พูดถึงศักดิ์ศรี ความฝัน ความไม่ย่อท้อ และความรักที่มั่นคงแม้ในวันที่ไม่เหลืออะไร',
  },
  // ── บรมครูเพลงไทยอมตะ ──
  {
    id: 'phaiboon-butkhan',
    label: 'แรงบันดาลใจ: กวีลูกทุ่ง-ชีวิตชั้นครู (สไตล์ครูไพบูลย์ บุตรขัน)',
    guidance:
      'วิจิตรงดงามดั่งบทกวี เปรียบเปรยชีวิตคนยากและรักแท้ผ่านภาพธรรมชาติชนบท กลิ่นดิน ท้องนา สายน้ำ แสงจันทร์ ร้อยสัมผัสในและสัมผัสนอกสละสลวยลึกซึ้ง เลือกคำเป็นเสียงยาวท้ายวรรคให้ทอดเอื้อนได้อย่างสง่างาม',
  },
  {
    id: 'suraphon-sombatcharoen',
    label: 'แรงบันดาลใจ: ลูกทุ่งลูกอ้อนติดหู (สไตล์ครูสุรพล สมบัติเจริญ)',
    guidance:
      'เล่าเรื่องมีชีวิตชีวาเหมือนนั่งคุยและหยอกเย้าอ้อนคนฟังตรงหน้า ใช้คำไทยง่ายๆ จังหวะกระชับสนุก มีเสน่ห์ขี้เล่นปนตัดพ้อนิดๆ ฟังรอบเดียวจำท่อนขึ้นและร้องตามได้ทันที',
  },
  {
    id: 'chali-intrawichit',
    label: 'แรงบันดาลใจ: วรรณศิลป์ลูกกรุงอมตะ (สไตล์ครูชาลี อินทรวิจิตร)',
    guidance:
      'ภาษาสุภาพอ่อนหวานประณีตดุจงานวรรณกรรม เปรียบความรักกับหยาดเพชร ดวงดาว สายน้ำ เรือนแพ เน้นคำเป็นสระเสียงยาวและสัมผัสอักษรละเมียดละไม เหมาะกับจังหวะทอดเสียงนุ่มนวล',
  },
  // ── ครูเพลงลูกทุ่งร่วมสมัย ──
  {
    id: 'sala-khunawut',
    label: 'แรงบันดาลใจ: ลูกทุ่งอีสานสู้ชีวิตกินใจ (สไตล์ครูสลา คุณวุฒิ)',
    guidance:
      'ถ่ายทอดหัวอกคนไกลบ้าน แรงใจคนสู้ชีวิต และความรักซื่อๆ ด้วยภาษาที่อ่อนโยนสุภาพ แทรกคำอีสานที่งดงามเข้าใจง่ายอย่างพอดี ท่อนฮุคมีคติชีวิตและประโยคจำที่ฟังแล้วน้ำตาซึมแต่มีกำลังใจ',
  },
  {
    id: 'chonlathi-thanthong',
    label: 'แรงบันดาลใจ: เทวดาเพลงลูกทุ่งคำหวาน (สไตล์ครูชลธี ธารทอง)',
    guidance:
      'ใช้คำไทยแท้เรียบง่ายแต่หวานจับใจ เห็นภาพวิถีชนบท ทุ่งนา ลมหนาว ความคิดถึง และความกตัญญู เลือกคำลงท้ายที่เปิดทางให้ร้องเอื้อนลูกคอได้พริ้วไหวและสะเทือนอารมณ์',
  },
  {
    id: 'wasu-haohan',
    label: 'แรงบันดาลใจ: ลูกทุ่งเพื่อชีวิตโรแมนติกเหงา (สไตล์วสุ ห้าวหาญ)',
    guidance:
      'ผสานกลิ่นอายลูกทุ่งเข้ากับโฟล์กเพื่อชีวิต เล่าความเหงา การรอคอย ความทรงจำบนท้องถนนและสถานที่คุ้นเคย ด้วยภาษาพูดร่วมสมัยที่กินใจคนทำงานและนักเดินทาง',
  },
  // ── นักแต่งเพลงฮิตยุคใหม่ ──
  {
    id: 'joey-boy',
    label: 'แรงบันดาลใจ: แร็ป-ป๊อปจังหวะเด้งสนุก (สไตล์โจอี้ บอย)',
    guidance:
      'จังหวะสนุกขี้เล่น Flow ไหลลื่น เน้นสัมผัสรัวในวรรค (Internal Rhyme) และคำตายลงจังหวะตกคมชัด ใช้ภาษาพูดร่วมสมัยแบบคนไทยคุยกันจริงๆ ผสมมุกเปรียบเทียบกวนๆ แต่น่ารักจำแม่น',
  },
  {
    id: 'stamp-apiwat',
    label: 'แรงบันดาลใจ: ป๊อปเปรียบเปรยฉลาดอารมณ์ดี (สไตล์แสตมป์ อภิวัชร์)',
    guidance:
      'หยิบสิ่งของหรือเหตุการณ์ใกล้ตัวในชีวิตประจำวัน (นาฬิกา สิ่งเล็กๆ ข้อความ กฎเกณฑ์) มาเปรียบเปรยความรักได้อย่างคาดไม่ถึง อบอุ่นปนอารมณ์ขัน ท่อนฮุคใช้คำสั้นจำง่ายและติดหูตั้งแต่รอบแรก',
  },
  {
    id: 'the-toys',
    label: 'แรงบันดาลใจ: เมโลดิก R&B คำรัวลื่นไหล (สไตล์ The TOYS)',
    guidance:
      'วางจังหวะคำสไตล์ Melodic R&B ยุคใหม่ สลับคำสั้นพยางค์ชิดรัวเข้าบีตกับช่วงเว้นหายใจเท่ๆ ใช้ภาพจำเพ้อฝัน ละมุนปนเหงา และสระเปิดที่เอื้อนโน้ต R&B ได้พริ้วไหว',
  },
  {
    id: 'tan-lipta',
    label: 'แรงบันดาลใจ: T-Pop ฮิตประโยคจำโดนใจ (สไตล์แทน Lipta)',
    guidance:
      'T-Pop ร่วมสมัยติดหูทันที ใช้ภาษาพูดคนรุ่นใหม่ที่ตรงชีวิตจริง (Relatable) และจี้จุดอารมณ์ ท่อนฮุคออกแบบให้มีประโยค Quote เด็ดที่เอาไปโพสต์ต่อได้ พร้อมสัมผัสที่ลงตัวกับเมโลดี้ป๊อปสว่างโปร่ง',
  },
  {
    id: 'aed-carabao',
    label: 'คมคายสามช่า/เพื่อชีวิต/โฆษณาติดหู (แรงบันดาลใจ แอ๊ด คาราบาว)',
    guidance:
      'ใช้ภาษาชาวบ้านคมชัด ทรงพลังเหมือนคำขวัญ/สโลแกนที่จำแม่นตั้งแต่ฟังครั้งแรก เล่าเรื่องวิถีชีวิต สู้ชีวิต สังคม หรือสารโฆษณาด้วยจังหวะสามช่าโจ๊ะสนุก มีคำคล้องจองในวรรคและคำสร้อยปลุกพลัง',
  },
  {
    id: 'asanee-chotikul',
    label: 'ร็อกคำซ้ำตอกย้ำ/จิ๊กโก๋อกหัก/เชียร์พลังสูง (แรงบันดาลใจ อัสนี โชติกุล)',
    guidance:
      'เด่นเรื่อง "การซ้ำวลีสั้น 2–4 พยางค์ตอกย้ำอารมณ์ใน Bar 1 และ Bar 4" (เช่น ย้ำคำสั้นสองจังหวะแล้วขยี้ประโยคสรุป) ภาษาลูกผู้ชายตรงไปตรงมา อบอุ่นปนเท่ เจ็บแต่ไม่ฟูมฟาย พร้อมเว้นหางเสียงท้ายห้องให้กีตาร์ลีดโซโล่รับได้ลงตัว',
  },
  {
    id: 'nga-caravan',
    label: 'แรงบันดาลใจ: เพื่อชีวิต-โฟล์กกวีธรรมชาติ (สไตล์หงา คาราวาน)',
    guidance:
      'กวีเพื่อชีวิตสายโฟล์กอะคูสติก ภาษาสุภาพงดงามเรียบง่ายแต่กินลึกทางจิตวิญญาณ หยิบภาพธรรมชาติ (แสงดาว สายฝน ดอกไม้ ทุ่งรวงทอง สายลม) มาเปรียบเปรยความหวัง ศรัทธา และชีวิตคนธรรมดา เน้นคำเป็นสระเสียงยาวที่เว้นช่องว่างให้กีตาร์โปร่งหรือขลุ่ยหายใจอย่างสง่างาม',
  },
  {
    id: 'kob-bigass',
    label: 'แรงบันดาลใจ: ร็อกกระแทกใจ-คำคมสู้ชีวิต (สไตล์กบ บิ๊กแอส · Big Ass / Bodyslam / Labanoon)',
    guidance:
      'ร็อกร่วมสมัยพลังฮึกเหิมและรักดิบจริงใจในแบบคำร้องเพลงดังของ Big Ass, Bodyslam และ Labanoon ใช้ภาษาพูดคมคาย ตรงประเด็น เจ็บจริงสู้จริง มีประโยคคำถามหรือคำประกาศสะกดคนทั้งคอนเสิร์ต วางพยางค์กระชับหนักแน่นเข้าบีตกลองและริฟฟ์กีตาร์ให้ร้องตะโกนตามได้ทันทีในท่อนฮุค',
  },
  {
    id: 'fongbeer-rock',
    label: 'แรงบันดาลใจ: ร็อกพูดตรงขยี้ใจ 2000s (สไตล์ฟองเบียร์ · Potato / Zeal / Clash)',
    guidance:
      'ร็อกเล่าเรื่องตรงไปตรงมายุค 2000s-2010s ในแบบเพลงดังของ Potato, Zeal และ Clash ไม่ประดิษฐ์คำสวยหรูเกินจริง แต่หยิบเหตุการณ์จริง คำถามแทงใจ หรืออาการปากไม่ตรงกับใจมาขยี้ให้เจ็บลึก วางคำกระชับลงบีตกลองและริฟฟ์กีตาร์ พร้อมคำซ้ำหรือคำถามย้ำอารมณ์ในท่อนฮุค',
  },
  {
    id: 'fongbeer-pop',
    label: 'แรงบันดาลใจ: ป๊อปซึ้งภาษาพูดกินใจ (สไตล์ฟองเบียร์ · แสนล้านนาที / ไม่มีตรงกลาง / กุญแจที่หายไป)',
    guidance:
      'ป๊อปอะคูสติกและบัลลาดละมุนลึกในแบบเพลงฮิตของเบล สุพล, เอ๊ะ จิรากร, ปาล์มมี่ และเบิร์ด ธงไชย ดึงรายละเอียดเล็กๆ ในชีวิตประจำวัน เวลา หรือบทสนทนาธรรมดามาเล่าด้วยภาษาพูดเรียบง่ายแต่ซึ้งกินใจ มีวลีหรือตัวเลข/คำจำเพาะซ้ำเป็นหมัดฮุคอบอุ่นหรือเจ็บลึกแบบไม่มีน้ำตา',
  },
];

export const SECTION_ENERGY_ARC_BLUEPRINTS: Record<
  SectionType,
  {
    energyScore: string;
    roleTitle: string;
    vocalRegisterHint: string;
    barByBarPlan: string;
  }
> = {
  intro: {
    energyScore: '2/10',
    roleTitle: 'เกริ่นอารมณ์และดึงเข้าสู่บรรยากาศ',
    vocalRegisterHint: 'เปิดพื้นที่ให้ดนตรีนำ หรือฮัม/เกริ่นคำสั้นๆ นุ่มนวลช่วงเสียงต่ำ-กลาง',
    barByBarPlan:
      'Bar 1: สร้างภาพบรรยากาศแรก (เวลา/สถานที่) | Bar 2: ทิ้งลมหายใจหรือประโยคสั้นๆ ก่อนเข้า Verse',
  },
  verse: {
    energyScore: '4/10',
    roleTitle: 'ปูเรื่องราวให้คนฟังอินกับฉากและตัวละคร',
    vocalRegisterHint: 'ช่วงเสียงพูดสบายๆ ชัดถ้อยชัดคำ ยังไม่ตะเบ็งเต็มกำลังเพื่อเก็บพื้นที่ให้ Pre-Chorus/ฮุคพุ่ง',
    barByBarPlan:
      'Bar 1: เปิดฉาก/รายละเอียดจริง | Bar 2: เหตุการณ์เคลื่อนไหว | Bar 3: ความรู้สึกภายในที่เริ่มก่อตัว | Bar 4: ทิ้งปม/คำถามส่งต่อไปท่อนถัดไป',
  },
  'pre-chorus': {
    energyScore: '7/10',
    roleTitle: 'ไต่ระดับอารมณ์ บีบความตึงเครียด และส่งแรงเข้าท่อนฮุค',
    vocalRegisterHint: 'ขยับช่วงเสียงสูงขึ้น คำสุดท้ายของห้องสุดท้ายควรยกเสียง/ลากส่งเข้าคำแรกของ Chorus',
    barByBarPlan:
      'Bar 1-2: ย้ำความอัดอั้นหรือความรู้สึกที่กำลังล้น | Bar 3-4: เร่งน้ำหนักคำและเปิดสระส่งพลังพุ่งเข้าคำแรกของท่อนฮุค',
  },
  chorus: {
    energyScore: '10/10',
    roleTitle: 'จุดระเบิดอารมณ์ คำโดนติดหู (Hook) และประโยคจำประจำเพลง',
    vocalRegisterHint: 'จุดสูงสุดของเมโลดี้ ร้องเต็มเสียง ใช้คำเป็นสระเปิดให้กังวาน และเน้นคำจุดพีค',
    barByBarPlan:
      'Bar 1 (Opening Hook Punchline): เปิดหมัดฮุคด้วยคำโดนๆ กระชับพุ่งเข้าหูทันที | Bar 2 (Hook Expansion): ขยายภาพและรับสัมผัสจาก Bar 1 อย่างลื่นไหล | Bar 3 (Emotional Climax): จุดพีคสุดทางอารมณ์และเสียงสูง | Bar 4 (Signature Payoff Line): ประโยคทองปิดท้ายฮุคที่สรุปแก่นเพลงและฝังในหัวคนฟัง',
  },
  bridge: {
    energyScore: '8.5/10',
    roleTitle: 'จุดหักมุมทางความคิด / ปลดปล่อยความในใจที่ซ่อนไว้',
    vocalRegisterHint: 'เปลี่ยนจังหวะคำหรือช่วงเสียงให้แปลกใหม่จาก Verse/Chorus ก่อนพาไต่กลับไปฮุคสุดท้าย',
    barByBarPlan:
      'Bar 1-2: พลิกมุมมองหรือสารภาพความจริงลึกที่สุด | Bar 3-4: เค้นอารมณ์สูงสุดเพื่อส่งระเบิดเข้าสู่ Final Chorus',
  },
  solo: {
    energyScore: '8/10',
    roleTitle: 'ปล่อยพลังดนตรีและเมโลดี้กีตาร์แทนคำพูด',
    vocalRegisterHint: 'เว้นช่วงให้เครื่องดนตรีเล่าอารมณ์ (หรือใช้คำอุทาน/เสียงประสานสั้นๆ)',
    barByBarPlan:
      'ครึ่งแรกเล่นทำนองเชื่อมจากท่อนก่อน ครึ่งหลังไต่ความเข้มข้นส่งเข้าสู่ท่อนถัดไป',
  },
  outro: {
    energyScore: '3→1/10',
    roleTitle: 'ท่อนจบปิดอารมณ์คนฟังให้สมบูรณ์ตามบทสรุปของเพลง',
    vocalRegisterHint: 'ผ่อนน้ำหนักเสียงลงนุ่มนวล หรือย้ำประโยคเด็ดครั้งสุดท้ายด้วยคำเป็นสระเสียงยาวที่โน้ต Root',
    barByBarPlan:
      'Bar 1: ย้ำภาพจำหรือคำตอบสุดท้ายของเรื่อง | Bar 2: ปิดด้วยประโยคสั้นแต่คม (บาดลึก / ฟูลฟิล / ค้างในความทรงจำ) ลงคำเป็นสระเสียงยาวเพื่อปล่อยหางเสียงจบ',
  },
};

export const EMOTIONAL_RESOLUTION_PROFILES: ReadonlyArray<{
  id: ThaiEmotionalResolution;
  label: string;
  hookRule: string;
  endingRule: string;
}> = [
  {
    id: 'auto',
    label: 'อัตโนมัติ (เหมาะกับอารมณ์เพลง)',
    hookRule: 'ให้ท่อนฮุคมี Opening Punchline ในวรรคแรก และประโยคทองปิดท่อนฮุคในวรรคสุดท้าย',
    endingRule: 'ปิดท่อนจบให้สอดคล้องกับอารมณ์เพลงอย่างสมบูรณ์ด้วยคำเป็นสระเสียงยาว',
  },
  {
    id: 'piercing-sting',
    label: '💔 จุก-ทิ้งให้บาดลึก (Piercing Sting)',
    hookRule:
      'ท่อนฮุคต้องพูดความจริงที่โหดร้ายแบบนิ่งๆ แต่ทิ่มแทงใจตรงจุด (เช่น ยอมรับว่าแพ้/เห็นเขาเดินจากไปทั้งที่ยังรัก)',
    endingRule:
      'ท่อนจบห้ามปลอบใจตัวเองหรือจางไปเฉยๆ ต้องทิ้งประโยคสั้นๆ ที่จุกค้างในอกเหมือนภาพสุดท้ายที่ลืมไม่ลง (คำลงท้ายเน้นความจริงที่เปลี่ยนไม่ได้)',
  },
  {
    id: 'fulfilling-warm',
    label: '🌻 ฟูลฟิล-อิ่มเอมหัวใจ (Fulfilling & Warm)',
    hookRule:
      'ท่อนฮุคเปิดความอบอุ่นเต็มหัวใจ ภาพความสุขเรียบง่ายแต่ลึกซึ้ง ทำให้คนฟังยิ้มตามและรู้สึกปลอดภัย',
    endingRule:
      'ท่อนจบต้องโอบกอดคนฟังให้ความรู้สึก "พอแล้ว/สมหวัง/อิ่มใจ" ลงท้ายด้วยคำเป็นเสียงอบอุ่นที่วางใจได้ในวันพรุ่งนี้',
  },
  {
    id: 'empowering-anthem',
    label: '🔥 ส่งพลัง-ฮึกเหิมลุกสู้ (Empowering Anthem)',
    hookRule:
      'ท่อนฮุคใช้คำทรงพลังสั้นกระชับ ร้องตะโกนตามพร้อมกันได้ทั้งคอนเสิร์ต เน้นการก้าวข้ามและศักดิ์ศรี',
    endingRule:
      'ท่อนจบปักหมุดคำประกาศชัยชนะหรือความเด็ดเดี่ยวทิ้งท้าย ให้คนฟังลุกขึ้นสู้ต่อด้วยหัวใจที่ฮึกเหิม',
  },
  {
    id: 'catchy-earworm',
    label: '⚡ ฮุคติดหู-ร้องตามทันที (Catchy Earworm)',
    hookRule:
      'Bar 1 และ Bar 4 ของท่อนฮุคต้องใช้ Keyword เด็ดซ้ำคำหรือเล่นเสียงสัมผัสติดหูแบบฟังครั้งเดียวแล้วฮัมตามได้ทันที',
    endingRule:
      'ท่อนจบห้วนคมหรือย้ำ Keyword ฮุคสั้นๆ ให้คนฟังอยากกด Replay ฟังซ้ำทันที',
  },
  {
    id: 'nostalgic-fade',
    label: '🌙 ทิ้งความคิดถึงค้างในใจ (Nostalgic Lingering)',
    hookRule:
      'ท่อนฮุคผสมความงดงามของอดีตเข้ากับความว่างเปล่าในปัจจุบัน อ่อนโยนแต่น้ำตาซึม',
    endingRule:
      'ท่อนจบค่อยๆ ผ่อนลงเหมือนภาพจางหาย (Fade Out) แต่ทิ้งภาพสิ่งของ/สถานที่/กลิ่นความทรงจำค้างอยู่ในหัวคนฟังหลังเพลงจบ',
  },
];

export interface SyllableBudgetOptions {
  sectionType?: SectionType;
  songwriterStyle?: ThaiSongwriterStyle;
  thaiGenre?: ThaiSongGenre;
  lyricDensity?: LyricDensityMode;
  chordsPerBar?: 1 | 2;
}

export interface SyllableBudgetBarSlot {
  barIndex: number;
  min: number;
  max: number;
  role: string;
}

export interface SyllableBudget {
  min: number;
  max: number;
  tempoFeel: 'slow' | 'medium' | 'fast';
  restSteps: number;
  midBarRestSteps: number;
  phrasingProfile: VocalPhrasingProfile;
  maxSyllablesPerSec: number;
  barDurationSec: number;
  guidance: string;
  barStructureGuidance?: string;
  barBudgets?: SyllableBudgetBarSlot[];
}

export interface LyricsPromptInput {
  mood: string;
  topic: string;
  chordProgression: string[];
  existingLyrics: string[];
  sectionType: SectionType;
  bpm?: number;
  timeSignature?: TimeSignature;
  previousSectionLyrics?: string[];
  mode?: 'quick' | 'deep';
  barCount?: number;
  bars?: Array<{
    chord: string;
    chord2?: string;
    chordsPerBar?: 1 | 2;
    existingLyrics?: string;
  }>;
  thaiGenre?: ThaiSongGenre;
  lyricEra?: ThaiLyricEra;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  lyricDensity?: LyricDensityMode;
  songTitle?: string;
  allPriorSections?: Array<{ name: string; type: string; lyrics: string[] }>;
  polishExistingDraft?: boolean;
  sectionAnchorPhrase?: string;
  storyBlueprint?: StoryBlueprintInput;
}

export const ANTI_CLICHE_THAI_PHRASES: readonly string[] = [
  'แสนดี',
  'ตราบนานเท่านาน',
  'ทุกวินาทีที่มีเธอ',
  'ตลอดไปไม่มีวันเปลี่ยน',
  'ใจดวงนี้มอบให้เธอผู้เดียว',
  'ฟ้าดินเป็นพยาน',
  'เธอคือลมหายใจ',
  'รักไม่มีเงื่อนไข',
];

export const MASTER_LYRIC_FEW_SHOT_BANK: {
  genres: Record<ThaiSongGenre, string>;
  songwriters: Record<ThaiSongwriterStyle, string>;
  resolutions: Record<ThaiEmotionalResolution, { chorusExample: string; outroExample: string }>;
  dialects: Partial<Record<ThaiLyricDialect, string>>;
} = {
  genres: {
    'thai-pop': [
      'แนวไทยป๊อป (กระชับ 5-6 พยางค์/ห้อง เว้น 2 เคาะหายใจกลางห้อง สลับสระทุกคู่วรรค):',
      '  1. "เดินสวน  ตรงชานชาลา" (6 พยางค์ ท้าย -า)',
      '  2. "เวลา  ไม่เคยลืมเลย" (6 พยางค์ ลา รับ -า / ท้าย -เอย)',
      '  3. "ยังเอ่ย  ถามใจเบาเบา" (6 พยางค์ เอ่ย รับ -เอย / ท้าย -เอา)',
      '  4. "รอเงา  เธอคืนกลับมา" (6 พยางค์ เงา รับ -เอา / ท้าย -า)',
    ].join('\n'),
    'thai-rock': [
      'แนวไทยร็อก (4-5 พยางค์/ห้อง คำหนักแน่น เว้นช่องให้กีตาร์และลมหายใจ):',
      '  1. "พังลง  ไปต่อหน้า" (5 พยางค์ ท้าย -า)',
      '  2. "แววตา  ที่ว่างเปล่า" (5 พยางค์ ตา รับ -า / ท้าย -เอา)',
      '  3. "เรื่องเรา  จบตรงนี้" (5 พยางค์ เรา รับ -เอา / ท้าย -ี)',
      '  4. "รักดี  ก็แพ้เธอ" (5 พยางค์ ดี รับ -ี / ท้ายคำเปิด)',
    ].join('\n'),
    'phuea-chiwit': [
      'แนวเพื่อชีวิต (4-6 พยางค์/ห้อง จริงใจ ติดดิน เห็นภาพชีวิต):',
      '  1. "เป้เก่า  เดินถนน" (5 พยางค์ ท้าย -น)',
      '  2. "อดทน  ผ่านลมแรง" (5 พยางค์ ทน รับ -น / ท้าย -แง)',
      '  3. "แสงดาว  ส่องทางไกล" (5 พยางค์ แสง รับ -แง / ท้าย -ไอ)',
      '  4. "หัวใจ  ไม่ยอมแพ้" (5 พยางค์ ใจ รับ -ไอ)',
    ].join('\n'),
    'luk-thung': [
      'แนวลูกทุ่งไทย (4-6 พยางค์/ห้อง ท้ายวรรคคำเป็นสระเสียงยาวเปิดช่องเอื้อนลูกคอ):',
      '  1. "ลมหนาว  ผ่านท้องนา" (5 พยางค์ ท้าย -า คำเป็น)',
      '  2. "มองฟ้า  ใจร้าวรอน" (5 พยางค์ ฟ้า รับ -า / ท้าย -อน คำเป็น)',
      '  3. "กอดหมอน  คืนฝนพรำ" (5 พยางค์ หมอน รับ -อน / ท้าย -ำ)',
      '  4. "รอคำ  อ้ายคืนมา" (5 พยางค์ คำ รับ -ำ / ท้าย -า คำเป็นทอดเสียง)',
    ].join('\n'),
    'luk-krung': [
      'แนวลูกกรุงคลาสสิก (4-6 พยางค์/ห้อง ภาษากวีวิจิตร ท้ายวรรคคำเป็นเสียงยาว):',
      '  1. "จันทร์นวล  กลางนภา" (5 พยางค์ ท้าย -า คำเป็น)',
      '  2. "ถวิลหา  ไม่จางหาย" (6 พยางค์ หา รับ -า / ท้าย -าย)',
      '  3. "พรมสาย  ลมรำพึง" (5 พยางค์ สาย รับ -าย / ท้าย -ึง)',
      '  4. "ซาบซึ้ง  มิอาจลืม" (5 พยางค์ ซึ้ง รับ -ึง / ท้าย -ืม ทอดละมุน)',
    ].join('\n'),
    'acoustic-indie': [
      'แนวอะคูสติกอินดี้ / โฟล์ก (5-6 พยางค์/ห้อง เล่าเหมือนเปิดไดอารี่ หายใจสบาย):',
      '  1. "พัดลม  หมุนช้าช้า" (5 พยางค์ ท้าย -า)',
      '  2. "สบตา  ในคืนเก่า" (5 พยางค์ ตา รับ -า / ท้าย -เอา)',
      '  3. "เรื่องเรา  ลอยเบาเบา" (5 พยางค์ เรา รับ -เอา / ท้าย -เอา)',
      '  4. "กอดเงา  จนอุ่นใจ" (5 พยางค์ เงา รับ -เอา / ท้าย -ไอ)',
    ].join('\n'),
    'thai-rnb': [
      'แนวไทย R&B / Soul (6-7 พยางค์/ห้อง Burst-Pocket สระเปิดเอื้อนโน้ตสวย):',
      '  1. "ไฟนีออน  สะท้อนกระจก" (7 พยางค์ ท้าย -ก)',
      '  2. "หัวอก  ยังวนเสียงเธอ" (6 พยางค์ อก รับ / ท้าย -เออ)',
      '  3. "หลงละเมอ  จนเช้าเลย" (6 พยางค์ เมอ รับ -เออ / ท้าย -เอย)',
      '  4. "อยากเฉลย  ทำนองในใจ" (7 พยางค์ เลย รับ -เอย / จบเอื้อน -ไอ)',
    ].join('\n'),
  },
  songwriters: {
    none: [
      'สไตล์ร่วมสมัยสมดุล (5-6 พยางค์/ห้อง เว้นวรรคหายใจกลางห้อง สัมผัสส่งต่อเนื่อง):',
      '  1. "เข็มเดินช้า  คืนฝนพรำ"',
      '  2. "ยังจดจำ  ริมทางเก่า"',
      '  3. "มองเงา  อยู่ข้างเตียง"',
      '  4. "เหลือเพียง  ใจที่คอย"',
    ].join('\n'),
    'boy-kosiyabong': [
      'สไตล์อบอุ่นละมุน (บอย โกษิยพงษ์ · 5-6 พยางค์/ห้อง): เรียบง่าย ขอบคุณความรัก:',
      '  1. "ขอบคุณเช้า  ที่ตื่นมา"',
      '  2. "สบตา  คนคุ้นเคย"',
      '  3. "ไม่ละเลย  แม้วันล้า"',
      '  4. "แค่มองฟ้า  ใจก็อิ่ม"',
    ].join('\n'),
    'dee-nitipong': [
      'สไตล์คมคายบาดลึก (ดี้ นิติพงษ์ · 4-6 พยางค์/ห้อง): หมัดฮุคสั้นคม ทอดหางเสียงได้เต็มที่:',
      '  1. "แพ้ตั้งแต่  ยังไม่รัก"',
      '  2. "ใจหัก  แต่ไม่จำ"',
      '  3. "บางคำ  ที่เธอลา"',
      '  4. "ชาไป  ทั้งหัวใจ"',
    ].join('\n'),
    seefa: [
      'สไตล์ละเมียดเหงาจับใจ (สีฟ้า · 5-6 พยางค์/ห้อง): เก็บอาการแบบผู้ใหญ่:',
      '  1. "ทำได้เพียง  แค่ยินดี"',
      '  2. "ไม่มี  สิทธิ์ขวางทาง"',
      '  3. "ใจจาง  หลังรอยยิ้ม"',
      '  4. "กลั้นยิ้ม  ยอมเก็บใจ"',
    ].join('\n'),
    'sek-loso': [
      'สไตล์ร็อกสามัญชนตรงใจ (เสก โลโซ · 5-6 พยางค์/ห้อง): คำง่าย ตรง ไม่อ้อมค้อม:',
      '  1. "ใจมันรัก  ทำยังไง"',
      '  2. "ไกลแค่ไหน  ยังเดินต่อ"',
      '  3. "ไม่รอ  ใครเห็นใจ"',
      '  4. "ใช่แค่  ได้รักเธอ"',
    ].join('\n'),
    'suea-thanapol': [
      'สไตล์เพื่อชีวิต-ศักดิ์ศรี (เสือ ธนพล · 5-6 พยางค์/ห้อง): ศักดิ์ศรีและความอดทน:',
      '  1. "สองมือเปล่า  ยังก้าวเดิน"',
      '  2. "เผชิญ  วันขรุขระ"',
      '  3. "ไม่ละ  ศักดิ์ศรีใจ"',
      '  4. "เก็บไฟ  ไว้สู้ต่อ"',
    ].join('\n'),
    'phaiboon-butkhan': [
      'สไตล์กวีลูกทุ่งชั้นครู (ครูไพบูลย์ บุตรขัน · 5-6 พยางค์/ห้อง): วิจิตรคำเป็นสระเสียงยาว:',
      '  1. "กลิ่นโคลนหอม  กลางทุ่งทอง"',
      '  2. "จันทร์ส่อง  ชวนถวิล"',
      '  3. "เสียงพิณ  ปลิวข้ามถิ่น"',
      '  4. "รินฟ้า  พาใจคนึง"',
    ].join('\n'),
    'suraphon-sombatcharoen': [
      'สไตล์ลูกทุ่งลูกอ้อนติดหู (ครูสุรพล สมบัติเจริญ · 5-6 พยางค์/ห้อง): ขี้เล่นคึกคัก:',
      '  1. "มองตาหน่อย  นะคนดี"',
      '  2. "พูดที  อย่าเอียงอาย"',
      '  3. "พี่ชาย  ไม่กลับกลาย"',
      '  4. "รับรัก  สักรายเอย"',
    ].join('\n'),
    'chali-intrawichit': [
      'สไตล์วรรณศิลป์ลูกกรุงอมตะ (ครูชาลี อินทรวิจิตร · 5-6 พยางค์/ห้อง): ละมุนดุจบทกวี:',
      '  1. "หยาดน้ำค้าง  กลางราตรี"',
      '  2. "ดุจมณี  ส่องสายธาร"',
      '  3. "นานเพียงใด  มิร้างลา"',
      '  4. "ตราบฟ้า  เคียงนที"',
    ].join('\n'),
    'sala-khunawut': [
      'สไตล์ลูกทุ่งอีสานสู้ชีวิต (ครูสลา คุณวุฒิ · 5-6 พยางค์/ห้อง): อีสานสุภาพกินใจ:',
      '  1. "หอบความฝัน  สู้เมืองใหญ่"',
      '  2. "หวั่นไหว  ยามลมหนาว"',
      '  3. "มองดาว  กอดคำสอน"',
      '  4. "อ้อนวอน  เพื่อคนรอ"',
    ].join('\n'),
    'chonlathi-thanthong': [
      'สไตล์เทวดาเพลงลูกทุ่งคำหวาน (ครูชลธี ธารทอง · 5-6 พยางค์/ห้อง): คำหวานเอื้อนลูกคอ:',
      '  1. "ลมหนาวพัด  พาร้าวรอน"',
      '  2. "อ้อนวอน  ฝากคนไกล"',
      '  3. "หวั่นไหว  กลางทุ่งทอง"',
      '  4. "ยังมอง  รอเจ้าคืน"',
    ].join('\n'),
    'wasu-haohan': [
      'สไตล์ลูกทุ่งเพื่อชีวิตโรแมนติกเหงา (วสุ ห้าวหาญ · 5-6 พยางค์/ห้อง):',
      '  1. "ไฟทางหลวง  คืนฝนพรำ"',
      '  2. "ตอกย้ำ  ถึงคนรอ"',
      '  3. "ท้อใจ  ฮัมเพลงไป"',
      '  4. "ฝากใจ  ผ่านคืนเหงา"',
    ].join('\n'),
    'joey-boy': [
      'สไตล์แร็ป-ป๊อปจังหวะเด้ง (โจอี้ บอย · 7-8 พยางค์/ห้อง Burst+Pocket):',
      '  1. "คิดถึงจัด  กดมือถือทัก"',
      '  2. "รักบอกรัก  อย่ากั๊กเดี๋ยวไม่ทัน"',
      '  3. "ปั่นฝ่าไฟ  มาหาเธอทุกวัน"',
      '  4. "ฟินแค่ไหน  คืนนี้ได้กอดกัน"',
    ].join('\n'),
    'stamp-apiwat': [
      'สไตล์ป๊อปเปรียบเปรยฉลาด (แสตมป์ อภิวัชร์ · 5-6 พยางค์/ห้อง): หักมุมอารมณ์ดี:',
      '  1. "นาฬิกา  หยุดเดินกัน"',
      '  2. "ตัวฉัน  ยังเดินไป"',
      '  3. "มีร้อยข้อ  ไม่เข้าที"',
      '  4. "ข้อเดียวนี้  คือรักเธอ"',
    ].join('\n'),
    'the-toys': [
      'สไตล์เมโลดิก R&B คำรัวลื่นไหล (The TOYS · 6-7 พยางค์/ห้อง Burst+Pocket):',
      '  1. "เห็นเธอเดิน  ในคืนนี้ใจสั่น"',
      '  2. "คอยมองไป  ใจสั่นกันทุกที"',
      '  3. "ภาพวนเวียน  อยู่ตรงนี้ไม่คลาย"',
      '  4. "ปล่อยให้ใจ  ลอยตามสายลมไป"',
    ].join('\n'),
    'tan-lipta': [
      'สไตล์ T-Pop ฮิตประโยคจำ (แทน Lipta · 5-6 พยางค์/ห้อง): ภาษาพูดโดนใจ:',
      '  1. "เธอคิดตรง  กันหรือเปล่า"',
      '  2. "แค่ทักเบา  ใจก็ยิ้ม"',
      '  3. "แอบชิม  คำว่าเพื่อน"',
      '  4. "ขอเลื่อน  เป็นคนรัก"',
    ].join('\n'),
    'aed-carabao': [
      'สไตล์เพื่อชีวิต/สามช่า/คำขวัญติดหู (แอ๊ด คาราบาว · 5-6 พยางค์/ห้อง): คมคายสโลแกน:',
      '  1. "ข้ามทะเล  ถึงฝั่งฝัน"',
      '  2. "จับมือกัน  ไม่ถอดใจ"',
      '  3. "ปลุกหัวใจ  สู้ไม่ถอย"',
      '  4. "ร่วมเรียงร้อย  สร้างวันใหม่"',
    ].join('\n'),
    'asanee-chotikul': [
      'สไตล์ร็อกคำซ้ำตอกย้ำ/จิ๊กโก๋อกหัก (อัสนี โชติกุล · 5-6 พยางค์/ห้อง): เว้นช่องกีตาร์ลีด:',
      '  1. "เคยสัญญา  ไม่ลืมกัน"',
      '  2. "แต่วันนั้น  เธอเปลี่ยนใจ"',
      '  3. "ดีเท่าไร  ก็ไม่มี"',
      '  4. "ได้ก็ดี  แค่ไม่ลืม"',
    ].join('\n'),
    'nga-caravan': [
      'สไตล์เพื่อชีวิต-โฟล์กกวีธรรมชาติ (หงา คาราวาน · 5-6 พยางค์/ห้อง): ภาพธรรมชาติละมุน:',
      '  1. "แสงดาวทอ  บนฟ้าไกล"',
      '  2. "ปลอบใจ  คนก้าวเดิน"',
      '  3. "เพลิดเพลิน  ทุ่งรวงทอง"',
      '  4. "ฝนละออง  พรมแผ่นดิน"',
    ].join('\n'),
    'kob-bigass': [
      'สไตล์ร็อกกระแทกใจ-คำคมสู้ชีวิต (กบ บิ๊กแอส · Big Ass / Bodyslam / Labanoon · 5-6 พยางค์/ห้อง):',
      '  1. "ต่อให้โลก  ไม่เหลือใคร"',
      '  2. "อดทนไว้  อย่ายอมแพ้"',
      '  3. "แม้มีแผล  ยิ่งเข้มแข็ง"',
      '  4. "แสงปลายทาง  รอคนสู้"',
    ].join('\n'),
    'fongbeer-rock': [
      'สไตล์ฟองเบียร์ ร็อกพูดตรงขยี้ใจ 2000s (Potato / Zeal / Clash · 5-6 พยางค์/ห้อง):',
      '  1. "ปากบอกไหว  ใจยังสั่น"',
      '  2. "ผ่านคืนวัน  ไม่เคยลบ"',
      '  3. "ทุ่มจนจบ  ยังแพ้เขา"',
      '  4. "หรือรักเรา  มันไม่พอ"',
    ].join('\n'),
    'fongbeer-pop': [
      'สไตล์ฟองเบียร์ ป๊อปซึ้งภาษาพูดกินใจ (แสนล้านนาที / ไม่มีตรงกลาง · 5-6 พยางค์/ห้อง):',
      '  1. "ทุกนาที  จำทุกอย่าง"',
      '  2. "ตรงข้างทาง  ยังอุ่นใจ"',
      '  3. "หวั่นไหว  ไม่มีกลาง"',
      '  4. "จืดจาง  เหลือความจำ"',
    ].join('\n'),
  },
  resolutions: {
    auto: {
      chorusExample: [
        'Chorus (เปิดหมัดฮุค Bar 1 สั้นคม 4-5 พยางค์ -> ขยาย 5-6 พยางค์ -> ปิดประโยคทอง):',
        '  Bar 1 (Hook): "เดินเดียวดาย  ลำพัง"',
        '  Bar 2: "เก็บความหวัง  ไว้ในใจ"',
        '  Bar 3: "เจ็บแค่ไหน  ก้าวต่อไป"',
        '  Bar 4 (Payoff): "เรื่องในใจ  ไม่สูญหาย"',
      ].join('\n'),
      outroExample: [
        'Outro (2 ห้อง กระชับ 3-5 พยางค์ ผ่อนจบสงบลงโน้ต Root):',
        '  Bar 1: "เก็บความจำ  ไม่จาง"',
        '  Bar 2: "ทางข้างหน้า  พบกัน"',
      ].join('\n'),
    },
    'piercing-sting': {
      chorusExample: [
        'Chorus [💔 จุก-บาดลึก]: สั้นคม 4-6 พยางค์/ห้อง Bar 1 แทงใจ, Bar 4 ปิดความจริงที่เจ็บปวด:',
        '  Bar 1 (Punchline): "รักเท่าไร  ก็แพ้"',
        '  Bar 2: "ทุ่มเทให้  ทั้งใจ"',
        '  Bar 3: "ไปต่อ  ไม่ได้เลย"',
        '  Bar 4 (Sting): "คนไม่รัก  ต้องลา"',
      ].join('\n'),
      outroExample: [
        'Outro [💔 จุก-ทิ้งค้าง]: 4-5 พยางค์ ห้ามปลอบใจ ลงคำเป็นสระเสียงยาว:',
        '  Bar 1: "เหลือเพียงฉัน  ลำพัง"',
        '  Bar 2: "ยอมถอย  เงียบงัน"',
      ].join('\n'),
    },
    'fulfilling-warm': {
      chorusExample: [
        'Chorus [🌻 ฟูลฟิล-อิ่มเอม]: 5-6 พยางค์/ห้อง อบอุ่น ปลอดภัย:',
        '  Bar 1 (Hook): "มีเธออยู่  ข้างกัน"',
        '  Bar 2: "ทุกทุกวัน  แสนดี"',
        '  Bar 3: "กี่เรื่องราว  ที่มี"',
        '  Bar 4 (Payoff): "กุมมือนี้  อุ่นใจ"',
      ].join('\n'),
      outroExample: [
        'Outro [🌻 ฟูลฟิล]: 4-5 พยางค์ ปิดแบบอิ่มเอมวางใจ:',
        '  Bar 1: "ไม่ขอใด  จากฟ้า"',
        '  Bar 2: "แค่เธอมา  ก็พอ"',
      ].join('\n'),
    },
    'empowering-anthem': {
      chorusExample: [
        'Chorus [🔥 ฮึกเหิมลุกสู้]: 5-6 พยางค์/ห้อง ทรงพลัง ร้องตะโกนพร้อมกัน:',
        '  Bar 1 (Punchline): "ลุกขึ้นยืน  อีกครั้ง"',
        '  Bar 2: "ส่งความหวัง  ก้องฟ้า"',
        '  Bar 3: "ฝ่าลมฝน  พัดพา"',
        '  Bar 4 (Anthem): "ใจกล้า  สู้ไม่ถอย"',
      ].join('\n'),
      outroExample: [
        'Outro [🔥 ปักหมุดชัยชนะ]: 4-5 พยางค์ ปิดเด็ดเดี่ยวทรงพลัง:',
        '  Bar 1: "ก้าวข้ามกลัว  วันวาน"',
        '  Bar 2: "ใจชนะ  เส้นทาง"',
      ].join('\n'),
    },
    'catchy-earworm': {
      chorusExample: [
        'Chorus [⚡ ฮุคติดหู]: 5-6 พยางค์/ห้อง Keyword ชัด ซ้ำจำง่ายใน Bar 1 และ Bar 4:',
        '  Bar 1 (Earworm): "บอกรักเลย  ตอนนี้"',
        '  Bar 2: "อย่ารอรี  สายไป"',
        '  Bar 3: "ใจตรงกัน  แค่ไหน"',
        '  Bar 4 (Replay): "บอกรักเลย  สักที"',
      ].join('\n'),
      outroExample: [
        'Outro [⚡ ย้ำ Keyword ติดหู]: 4-5 พยางค์:',
        '  Bar 1: "จำคำนี้  ในใจ"',
        '  Bar 2: "รักกันเลย  วันนี้"',
      ].join('\n'),
    },
    'nostalgic-fade': {
      chorusExample: [
        'Chorus [🌙 คิดถึงค้างในใจ]: 5-6 พยางค์/ห้อง งดงามปนว่างเปล่า:',
        '  Bar 1 (Hook): "คิดถึงเธอ  ฝนโปรย"',
        '  Bar 2: "ลมพัดโชย  วันเก่า"',
        '  Bar 3: "เพลงข้างกาย  สองเรา"',
        '  Bar 4 (Fade): "เหลือเพียงเงา  ในใจ"',
      ].join('\n'),
      outroExample: [
        'Outro [🌙 Fade Out ค้างภาพจำ]: 4-5 พยางค์:',
        '  Bar 1: "ลมพัดกลิ่น  วันวาน"',
        '  Bar 2: "ภาพยังหวาน  ในใจ"',
      ].join('\n'),
    },
  },
  dialects: {
    northern:
      'กลิ่นอายคำเมือง (เหนือ): "ลมหนาวผ่าน  ม่อนดอยใจ๋ / คึดถึงเจ้า  บ่ลืมเลือน"',
    isan:
      'กลิ่นอายอีสาน: "ฮักเจ้าหลาย  เบิดหัวใจ / คิดฮอดยาม  ฟ้าค่ำลง"',
    'suphan-central':
      'กลิ่นอายลูกทุ่งภาคกลาง: "ลมว่าวพัด  ผ่านทุ่งนา / พี่จ๋าคอย  เจ้าคืนรัง"',
    southern:
      'กลิ่นอายปักษ์ใต้: "เสียงคลื่นซัด  หรอยลมเล / พี่บ่าวคอย  น้องคืนมา"',
  },
};

/** สร้างชุด Few-Shot แบบ Dynamic ตามแนวเพลง สไตล์นักแต่งเพลง โหมดจบเพลง และภาษาถิ่น */
export function buildDynamicLyricFewShots(options?: {
  thaiGenre?: ThaiSongGenre;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  lyricDialect?: ThaiLyricDialect;
  sectionType?: SectionType;
}): string {
  const genreKey: ThaiSongGenre = options?.thaiGenre ?? 'thai-pop';
  const writerKey: ThaiSongwriterStyle = options?.songwriterStyle ?? 'none';
  const resKey: ThaiEmotionalResolution = options?.emotionalResolution ?? 'auto';
  const genreExample =
    MASTER_LYRIC_FEW_SHOT_BANK.genres[genreKey] ?? MASTER_LYRIC_FEW_SHOT_BANK.genres['thai-pop'];
  const writerExample =
    MASTER_LYRIC_FEW_SHOT_BANK.songwriters[writerKey] ??
    MASTER_LYRIC_FEW_SHOT_BANK.songwriters.none;
  const resolutionEntry =
    MASTER_LYRIC_FEW_SHOT_BANK.resolutions[resKey] ?? MASTER_LYRIC_FEW_SHOT_BANK.resolutions.auto;
  const dialectExample =
    options?.lyricDialect && options.lyricDialect !== 'standard'
      ? MASTER_LYRIC_FEW_SHOT_BANK.dialects[options.lyricDialect]
      : undefined;

  const isOutro = options?.sectionType === 'outro';
  const resolutionBlock = isOutro
    ? resolutionEntry.outroExample
    : `${resolutionEntry.chorusExample}\n${resolutionEntry.outroExample}`;

  return [
    'ตัวอย่างอ้างอิงชั้นครูแบบ Dynamic (ให้สังเกตการส่งสัมผัสท้ายวรรคเข้าต้น/กลางวรรคถัดไป และสลับกลุ่มสระทุกคู่วรรค):',
    '1) ตัวอย่างตามแนวเพลงเป้าหมาย:',
    genreExample,
    '2) ตัวอย่างตามสไตล์นักแต่งเพลง:',
    writerExample,
    '3) ตัวอย่างเป้าหมายอารมณ์ & ท่อนจบ:',
    resolutionBlock,
    ...(dialectExample ? [`4) ตัวอย่างภาษาถิ่น:\n  ${dialectExample}`] : []),
    'กฎเหล็กความหลากหลาย: ห้ามคัดลอกประโยคจากตัวอย่างมาตรงๆ, ห้ามซ้ำคำลงท้ายวรรคเดิม และต้องสลับกลุ่มสระเมื่อขึ้นคู่วรรคใหม่',
  ].join('\n');
}

export const GOLDEN_LYRIC_FEW_SHOTS = buildDynamicLyricFewShots({
  thaiGenre: 'thai-pop',
  songwriterStyle: 'none',
  emotionalResolution: 'auto',
});

export const PRODUCER_ARRANGEMENT_RULES = `
หลักการเรียบเรียงดนตรีระดับโปรดิวเซอร์ (Producer Arrangement & Frequency Spacing):
1. เว้นย่านความถี่ให้เสียงร้อง (Vocal Pocket):
   - ในท่อน verse และ pre-chorus ให้ปิด guitarLead (false) หรือเปิดเพียง soft 'riff-fills' ที่ความดังไม่เกิน 35-50% เพื่อไม่ให้ตีกับเสียงร้อง
   - แยกย่านเสียง Bass (ย่านต่ำ) และ Piano/Guitar Rhythm (ย่านกลาง) ให้เกื้อหนุนกัน ไม่ใส่ distortion/fuzz ในเพลงแนว acoustic อุ่นๆ
2. การไต่ระดับอารมณ์ (Dynamic Arc Contrast):
   - intro: intensity='low' (เช่น fingerpicking หรือ soft-strum, drums='off' หรือ 'shaker-cajon' เบาๆ)
   - verse: intensity='low' หรือ 'medium' เปิดพื้นที่ให้เล่าเรื่อง
   - pre-chorus: ค่อยๆ ส่งอารมณ์ขึ้น (intensity='medium', เติม piano warm-pad หรือ bass warm-sustain)
   - chorus: intensity='high' เต็มวง (guitarRhythm + bass + drums + piano ตามแนวเพลง) เพื่อให้ท่อนฮุคพุ่งชัดกว่าท่อน Verse
   - solo: intensity='high' สามารถเปิด guitarLeadStyle='melodic-solo' ที่ความดัง 80-90%
   - outro: ลด intensity กลับลงเป็น 'low' เพื่อให้เพลงจบอย่างสวยงาม
3. หลักการเลือกคอร์ดและเครื่องดนตรีใน Studio:
   - คอร์ดต้องเขียนในรูปมาตรฐานสากลที่เล่นง่ายบนกีตาร์โปร่งหรือเปียโน (เช่น C, G, Am, F, Em, Dm, D, A, Bm, F#m)
   - ambient 3D: 'living-room' เหมาะกับเพลงใกล้ชิด/อคูสติก, 'wood-studio' เหมาะกับป๊อป/สตูดิโอมาตรฐาน, 'unplugged-hall' เหมาะกับเพลงใหญ่/ก้องกังวาน
   - guitarModel: 'classical-nylon' (อุ่น นุ่ม ไนลอน), 'dreadnought-steel' (โปร่งกังวาน คมชัด), 'ovation-roundback' (ใส สมดุล สเตจ), 'gibson-les-paul' (ไฟฟ้า หนา มีพลัง)
`.trim();

const WRITER_DISPLAY_NOTE: Partial<Record<ThaiSongwriterStyle, string>> = {
  'chali-intrawichit': 'สไตล์ชาลี อินทรวิจิตร (ลูกกรุงเอื้อนละมุน)',
  'phaiboon-butkhan': 'สไตล์ไพบูลย์ บุตรขัน (กวีลูกทุ่งคำเป็น)',
  'chonlathi-thanthong': 'สไตล์ชลธี ธารทอง (ลูกทุ่งคำหวานเอื้อนลูกคอ)',
  'sala-khunawut': 'สไตล์ครูสลา คุณวุฒิ (ลูกทุ่งอีสานเอื้อนกินใจ)',
  'boy-kosiyabong': 'สไตล์บอย โกษิยพงษ์ (ป๊อปอบอุ่นเล่าเรื่อง)',
  seefa: 'สไตล์สีฟ้า (ป๊อปซึ้งละเมียดเหงา)',
  'fongbeer-pop': 'สไตล์ฟองเบียร์ ป๊อปซึ้งภาษาพูดกินใจ',
  'wasu-haohan': 'สไตล์วสุ ห้าวหาญ (เพื่อชีวิตโรแมนติก)',
  'nga-caravan': 'สไตล์หงา คาราวาน (เพื่อชีวิต-โฟล์กกวี)',
  'dee-nitipong': 'สไตล์ดี้ นิติพงษ์ (หมัดฮุคคมคาย)',
  'tan-lipta': 'สไตล์แทน Lipta (T-Pop ประโยคจำ)',
  'stamp-apiwat': 'สไตล์แสตมป์ อภิวัชร์ (ป๊อปเปรียบเปรย)',
  'asanee-chotikul': 'สไตล์อัสนี โชติกุล (ร็อกคำซ้ำ/เว้นช่องกีตาร์ลีด)',
  'sek-loso': 'สไตล์เสก โลโซ (ร็อกสามัญชนตรงใจ)',
  'kob-bigass': 'สไตล์กบ บิ๊กแอส (Big Ass / Bodyslam / ร็อกคำคมสู้ชีวิต)',
  'fongbeer-rock': 'สไตล์ฟองเบียร์ ร็อกพูดตรง 2000s (Potato / Zeal / Clash)',
  'suea-thanapol': 'สไตล์เสือ ธนพล (เพื่อชีวิต-ร็อกศักดิ์ศรี)',
  'aed-carabao': 'สไตล์แอ๊ด คาราบาว (เพื่อชีวิต/สามช่า/คำขวัญติดหู)',
  'suraphon-sombatcharoen': 'สไตล์สุรพล สมบัติเจริญ (ลูกทุ่งลูกอ้อนติดหู)',
  'the-toys': 'สไตล์ The TOYS (Melodic R&B Burst+Pocket)',
  'joey-boy': 'สไตล์โจอี้ บอย (แร็ป-ป๊อป Burst+Pocket)',
};

/** คำนวณความยาวจริง 1 ห้องเพลง (วินาที) สอดคล้องกับ `barPlanner.ts:getTiming()` */
export function computeBarDurationSec(
  bpm = 85,
  timeSignature: TimeSignature = '4/4'
): number {
  const safeBpm = Number.isFinite(bpm) ? Math.max(40, Math.min(220, Math.round(bpm))) : 85;
  const beatsQuarterFactor = timeSignature === '6/8' ? 2 : timeSignature === '3/4' ? 3 : 4;
  return Number(((60 / safeBpm) * beatsQuarterFactor).toFixed(4));
}

function resolveVocalPhrasingProfile(
  writer: ThaiSongwriterStyle,
  thaiGenre: ThaiSongGenre | undefined,
  safeBpm: number
): VocalPhrasingProfile {
  if (
    writer === 'chali-intrawichit' ||
    writer === 'phaiboon-butkhan' ||
    writer === 'chonlathi-thanthong' ||
    writer === 'sala-khunawut'
  ) {
    return 'lyrical-sustain';
  }
  if (
    writer === 'boy-kosiyabong' ||
    writer === 'seefa' ||
    writer === 'fongbeer-pop' ||
    writer === 'wasu-haohan' ||
    writer === 'nga-caravan'
  ) {
    return 'conversational-pop';
  }
  if (writer === 'dee-nitipong' || writer === 'tan-lipta' || writer === 'stamp-apiwat') {
    return 'punchy-hook';
  }
  if (
    writer === 'asanee-chotikul' ||
    writer === 'sek-loso' ||
    writer === 'kob-bigass' ||
    writer === 'fongbeer-rock' ||
    writer === 'suea-thanapol'
  ) {
    return 'rock-anthem';
  }
  if (writer === 'aed-carabao' || writer === 'suraphon-sombatcharoen') {
    return 'groove-bounce';
  }
  if (writer === 'the-toys' || writer === 'joey-boy') {
    return 'burst-pocket';
  }

  // Fallback by genre & tempo when songwriterStyle === 'none'
  if (thaiGenre === 'luk-krung' || (thaiGenre === 'luk-thung' && safeBpm <= 102)) {
    return 'lyrical-sustain';
  }
  if (thaiGenre === 'luk-thung' || (thaiGenre === 'phuea-chiwit' && safeBpm > 102)) {
    return 'groove-bounce';
  }
  if (thaiGenre === 'thai-rock' || thaiGenre === 'phuea-chiwit') {
    return 'rock-anthem';
  }
  if (thaiGenre === 'thai-rnb') {
    return 'burst-pocket';
  }
  if (thaiGenre === 'thai-pop' && safeBpm > 102) {
    return 'punchy-hook';
  }
  return 'conversational-pop';
}

/** คำนวณงบประมาณจำนวนพยางค์ต่อ 1 ห้องเพลงตาม BPM, Time Signature, ประเภทท่อน สไตล์ และความโปร่ง (Singable Physics V1) */
export function getSyllableBudgetForBpm(
  bpm = 85,
  timeSignature: TimeSignature = '4/4',
  options?: SyllableBudgetOptions
): SyllableBudget {
  const safeBpm = Number.isFinite(bpm) ? Math.max(40, Math.min(220, Math.round(bpm))) : 85;
  const isCompound = timeSignature === '3/4' || timeSignature === '6/8';
  const writer = options?.songwriterStyle ?? 'none';
  const thaiGenre = options?.thaiGenre;
  const sectionType = options?.sectionType;
  const lyricDensity: LyricDensityMode = options?.lyricDensity ?? 'balanced';
  const chordsPerBar: 1 | 2 = options?.chordsPerBar === 2 ? 2 : 1;

  const barDurationSec = computeBarDurationSec(safeBpm, timeSignature);
  const tempoFeel: SyllableBudget['tempoFeel'] =
    safeBpm <= 76 ? 'slow' : safeBpm <= 102 ? 'medium' : 'fast';

  const phrasingProfile = resolveVocalPhrasingProfile(writer, thaiGenre, safeBpm);

  let min: number;
  let max: number;
  let restSteps: number;
  let midBarRestSteps: number;
  let baseMaxSylPerSec: number;

  if (phrasingProfile === 'lyrical-sustain') {
    if (tempoFeel === 'slow') {
      min = 4;
      max = 6;
      restSteps = 4;
      midBarRestSteps = 2;
    } else if (tempoFeel === 'medium') {
      min = 4;
      max = 6;
      restSteps = 4;
      midBarRestSteps = 2;
    } else {
      min = 5;
      max = 7;
      restSteps = 3;
      midBarRestSteps = 1;
    }
    baseMaxSylPerSec = 3.5;
  } else if (phrasingProfile === 'conversational-pop' || phrasingProfile === 'punchy-hook') {
    if (tempoFeel === 'slow') {
      min = 4;
      max = 6;
      restSteps = 3;
      midBarRestSteps = 2;
    } else {
      min = 5;
      max = 7;
      restSteps = tempoFeel === 'medium' ? 3 : 2;
      midBarRestSteps = tempoFeel === 'medium' ? 2 : 1;
    }
    baseMaxSylPerSec = 3.5;
  } else if (phrasingProfile === 'rock-anthem') {
    if (safeBpm < 98) {
      min = 5;
      max = 7;
      restSteps = 3;
      midBarRestSteps = 2;
    } else {
      min = 4;
      max = 6;
      restSteps = 4;
      midBarRestSteps = 1;
    }
    baseMaxSylPerSec = 3.2;
  } else if (phrasingProfile === 'groove-bounce') {
    min = 5;
    max = sectionType === 'chorus' ? 6 : 7;
    restSteps = tempoFeel === 'fast' ? 2 : 3;
    midBarRestSteps = 1;
    baseMaxSylPerSec = 3.6;
  } else {
    // 'burst-pocket' (the-toys, joey-boy, thai-rnb)
    if (writer === 'joey-boy') {
      if (sectionType === 'chorus') {
        min = 5;
        max = 8;
      } else {
        min = 7;
        max = 10;
      }
    } else if (tempoFeel === 'slow') {
      min = 5;
      max = 7;
    } else if (tempoFeel === 'medium') {
      min = 6;
      max = 9;
    } else {
      min = 6;
      max = 8;
    }
    restSteps = 2;
    midBarRestSteps = 1;
    baseMaxSylPerSec = 4.2;
  }

  // Section overrides
  if (sectionType === 'outro') {
    min = 3;
    max = Math.min(max, phrasingProfile === 'burst-pocket' ? 6 : 5);
    restSteps = Math.max(restSteps, isCompound ? 3 : 4);
  } else if (sectionType === 'chorus') {
    if (phrasingProfile === 'groove-bounce') {
      max = Math.min(max, 6);
    }
    if (writer === 'joey-boy') {
      max = Math.min(max, 8);
    }
  }

  // 3/4 and 6/8 modifier (totalSteps = 12)
  if (isCompound) {
    max = Math.max(3, max - 1);
    min = Math.max(3, Math.min(min, max - 1));
    restSteps = Math.max(2, Math.min(3, restSteps - 1));
    midBarRestSteps = 1;
  }

  // Lyric density modifier ('airy' | 'balanced' | 'dense')
  const effectiveMaxSylPerSec = Number(
    (lyricDensity === 'dense' ? baseMaxSylPerSec + 0.5 : baseMaxSylPerSec).toFixed(2)
  );
  if (lyricDensity === 'airy') {
    max = Math.max(3, max - 1);
    min = Math.max(3, Math.min(min, max - 1));
    restSteps = Math.min(isCompound ? 4 : 5, restSteps + 1);
  } else if (lyricDensity === 'dense') {
    if (phrasingProfile === 'burst-pocket') {
      max = Math.min(11, max + 1);
    } else {
      max = max + (tempoFeel === 'slow' ? 2 : 1);
    }
    restSteps = Math.max(2, restSteps - 1);
  }

  // Real-time physics ceiling: never exceed effectiveMaxSylPerSec * barDurationSec
  const physicsCap = Math.max(3, Math.floor(effectiveMaxSylPerSec * barDurationSec));
  max = Math.min(max, physicsCap);
  min = Math.max(3, Math.min(min, max));

  const styleNotes: string[] = [];
  const writerLabel = WRITER_DISPLAY_NOTE[writer];
  if (writerLabel) {
    styleNotes.push(`${writerLabel}: ${min}-${max} พยางค์/ห้อง`);
  }

  if (chordsPerBar === 2) {
    styleNotes.push('ห้อง 2 คอร์ด: แบ่งเป็น 2 วลีสั้นรับ Beat 1 และ Beat 3 โดยไม่เพิ่มจำนวนพยางค์รวม');
  }

  if (sectionType === 'outro') {
    styleNotes.push(`ท่อน Outro ลดเหลือ ${min}-${max} พยางค์/ห้อง เพื่อคลายพลังและทิ้งคำเป็นสระเสียงยาวบนโน้ตจบ`);
  } else if (sectionType === 'pre-chorus') {
    styleNotes.push('ท่อน Pre-Chorus เร่งน้ำหนักคำช่วงท้ายห้องสุดท้ายเพื่อส่งเข้าคำแรกของท่อนฮุค');
  } else if (sectionType === 'chorus') {
    const bar1Max = Math.min(
      max,
      isCompound
        ? phrasingProfile === 'burst-pocket'
          ? 6
          : 4
        : phrasingProfile === 'burst-pocket'
          ? 7
          : phrasingProfile === 'groove-bounce'
            ? 6
            : 5
    );
    styleNotes.push(
      `ท่อน Chorus: Bar 1 หมัดฮุคสั้นคม (${Math.max(3, Math.min(4, bar1Max))}-${bar1Max} พยางค์) -> Bar 2-3 (${min}-${max} พยางค์) -> Bar 4 ประโยคทองปิดฮุค`
    );
  } else if (sectionType === 'verse') {
    styleNotes.push('ท่อน Verse: แบ่ง 2 วลีพูดธรรมชาติและใส่เว้นวรรคกลางห้อง');
  }

  const densityLabel =
    lyricDensity === 'airy' ? 'โหมดโปร่งสบาย' : lyricDensity === 'dense' ? 'โหมดคำแน่นมีจังหวะ' : 'โหมดพอดีสไตล์';

  const baseGuidance =
    `ความเร็ว ${safeBpm} BPM (${timeSignature} · ~${barDurationSec.toFixed(2)} วิ/ห้อง · ${densityLabel}): ` +
    `ใช้ ${min}-${max} พยางค์/ห้อง (สูงสุด ~${effectiveMaxSylPerSec} พยางค์/วิ, เว้นหายใจท้ายห้องอย่างน้อย ${restSteps} steps) ` +
    `และใส่เว้นวรรคตรงจุดพักหายใจกลางห้อง เช่น "ใจแข็ง  เหมือนหินผา" หรือ "ลมพัดเบา  ในคืนเหงา"`;

  const punchBar1Min = Math.max(3, Math.min(4, max));
  const punchBar1Max = Math.min(
    max,
    isCompound
      ? phrasingProfile === 'burst-pocket'
        ? 6
        : 4
      : phrasingProfile === 'burst-pocket'
        ? 7
        : phrasingProfile === 'groove-bounce'
          ? 6
          : 5
  );
  const payoffMax = Math.max(min, Math.min(max, max >= 7 ? max - 1 : max));

  const barBudgets: SyllableBudgetBarSlot[] | undefined = sectionType
    ? sectionType === 'chorus'
      ? [
          {
            barIndex: 0,
            min: Math.min(punchBar1Min, punchBar1Max),
            max: punchBar1Max,
            role: 'Opening Hook Punchline (หมัดฮุคสั้นคม)',
          },
          { barIndex: 1, min, max, role: 'Hook Expansion (ขยายภาพ+รับสัมผัสจาก Bar 1)' },
          { barIndex: 2, min, max, role: 'Emotional Climax (จุดพีคอารมณ์และเสียงสูง)' },
          { barIndex: 3, min, max: payoffMax, role: 'Signature Payoff Line (ประโยคทองปิดฮุค)' },
        ]
      : sectionType === 'outro'
        ? [
            { barIndex: 0, min, max, role: 'Closing Reflection (ย้ำภาพจำสุดท้าย)' },
            {
              barIndex: 1,
              min: Math.max(3, min),
              max: Math.max(3, max > 3 ? max - 1 : max),
              role: 'Final Resolution (ปิดจบทอดหางเสียง Root)',
            },
          ]
        : [
            { barIndex: 0, min, max, role: 'Opening Image (เปิดฉาก/ปูเรื่อง)' },
            { barIndex: 1, min, max, role: 'Development (รับสัมผัส+เคลื่อนไหว)' },
            { barIndex: 2, min, max, role: 'Inner Shift (ความรู้สึกภายใน)' },
            { barIndex: 3, min, max, role: 'Bridge Cue (ทิ้งปมส่งต่อ)' },
          ]
    : undefined;

  return {
    min,
    max,
    tempoFeel,
    restSteps,
    midBarRestSteps,
    phrasingProfile,
    maxSyllablesPerSec: effectiveMaxSylPerSec,
    barDurationSec,
    guidance: styleNotes.length > 0 ? `${baseGuidance} | ${styleNotes.join(' | ')}` : baseGuidance,
    barStructureGuidance: styleNotes.length > 0 ? styleNotes.join(' | ') : undefined,
    ...(barBudgets ? { barBudgets } : {}),
  };
}

export const STORY_ARC_PRESETS: ReadonlyArray<{
  id: string;
  labelTh: string;
  labelEn: string;
  arcDescription: string;
}> = [
  {
    id: 'auto',
    labelTh: 'อัตโนมัติตามเรื่องเล่า',
    labelEn: 'Auto from Story Brief',
    arcDescription: '',
  },
  {
    id: 'lonely-to-sting',
    labelTh: 'เหงาเริ่มเรื่อง → อัดอั้น → ระเบิดความจริง → จุกนิ่ง',
    labelEn: 'Lonely Start → Pent-up → Bitter Truth → Quiet Sting',
    arcDescription: 'เหงาเริ่มเรื่อง (Verse) → อัดอั้นเก็บความรู้สึก (Pre-Chorus) → ระเบิดความจริงในใจ (Chorus) → จุกนิ่งยอมรับความเงียบ (Outro)',
  },
  {
    id: 'crush-to-warm',
    labelTh: 'แอบชอบ → ลุ้นใจเต้น → บอกรัก → ยิ้มอบอุ่น',
    labelEn: 'Secret Crush → Heartbeat Tension → Confession → Warm Smile',
    arcDescription: 'แอบมองแอบชอบ (Verse) → ลุ้นใจเต้นใกล้ชิด (Pre-Chorus) → บอกความในใจตรงๆ (Chorus) → ยิ้มอบอุ่นข้างกัน (Outro)',
  },
  {
    id: 'tired-to-anthem',
    labelTh: 'เหนื่อยท้อ → กัดฟันสู้ → ปลุกพลัง → ภูมิใจ',
    labelEn: 'Weary → Gritting Teeth → Rising Anthem → Proud Stand',
    arcDescription: 'เหนื่อยท้อในคืนมืด (Verse) → กัดฟันไม่ยอมแพ้ (Pre-Chorus) → ปลุกพลังก้องฟ้า (Chorus) → ยืนอย่างภูมิใจ (Outro)',
  },
  {
    id: 'nostalgic-to-accept',
    labelTh: 'หวนนึกถึงอดีต → คิดถึงสุดใจ → ยอมรับปล่อยวาง',
    labelEn: 'Nostalgic Memory → Deep Longing → Peaceful Letting Go',
    arcDescription: 'ภาพวันวานย้อนกลับมา (Verse) → คิดถึงสุดหัวใจ (Pre-Chorus & Chorus) → ยิ้มรับและปล่อยวางอย่างสงบ (Outro)',
  },
  {
    id: 'custom',
    labelTh: 'กำหนดเอง...',
    labelEn: 'Custom Progression...',
    arcDescription: '',
  },
];

/** สร้างกติกา Distill -> Split Across Sections -> Anchor Protection สำหรับ Prompt */
export function buildStoryBlueprintPromptBlock(
  storyBlueprint?: StoryBlueprintInput,
  sectionAnchorPhrase?: string,
  budget?: SyllableBudget,
  hasLongBrief = false
): string[] {
  const maxSyl = budget?.max ?? 6;
  const openingAnchor = storyBlueprint?.openingAnchor?.trim() || '';
  const hookAnchor = storyBlueprint?.hookAnchor?.trim() || '';
  const hookAnchorMode = storyBlueprint?.hookAnchorMode ?? 'flexible';
  const closingAnchor = storyBlueprint?.closingAnchor?.trim() || '';
  const sectionAnchor = sectionAnchorPhrase?.trim() || '';

  const presetItem =
    storyBlueprint?.storyArcPreset &&
    storyBlueprint.storyArcPreset !== 'auto' &&
    storyBlueprint.storyArcPreset !== 'custom'
      ? STORY_ARC_PRESETS.find((p) => p.id === storyBlueprint.storyArcPreset)
      : undefined;
  const arcSummary =
    storyBlueprint?.storyArcPreset === 'custom'
      ? storyBlueprint.customEmotionalArc?.trim() || ''
      : presetItem?.arcDescription || storyBlueprint?.customEmotionalArc?.trim() || '';

  const hasAny =
    hasLongBrief ||
    Boolean(arcSummary || openingAnchor || hookAnchor || closingAnchor || sectionAnchor);
  if (!hasAny) return [];

  const lines: string[] = [
    '- แผนเล่าเรื่องและหมุดหมายสำคัญ (Story Blueprint & Anchor Protection):',
    '  * Rule 1 — กระจายฉากตามท่อน (Scene Distribution): ห้ามยัดเรื่องเล่าทั้งหมดลงใน Verse 1 4 ห้อง ให้กระจายเหตุการณ์ทีละฉากอย่างลงตัว (Verse 1 ปูฉากเริ่ม -> Verse 2 เหตุการณ์คืบหน้า [ถ้ามี] -> Pre-Chorus บีบปมอารมณ์ -> Chorus แก่นความรู้สึกหลัก -> Bridge จุดเปลี่ยน/สารภาพ -> Outro ภาพจำสุดท้าย)',
  ];
  if (arcSummary) {
    lines.push(`  * ทิศทางไล่ระดับอารมณ์ (Emotional Progression): ${arcSummary}`);
  }
  if (openingAnchor) {
    lines.push(
      `  * ประโยคเปิดท่อนเริ่ม (Opening Anchor -> วางที่ Verse 1 Bar 1 หรือแบ่ง Bar 1-2): "${openingAnchor}"`
    );
  }
  if (hookAnchor) {
    if (hookAnchorMode === 'exact') {
      lines.push(
        `  * ประโยค/คำบังคับในท่อนฮุค (Exact Hook Anchor — ต้องใช้ข้อความนี้เป๊ะใน Chorus ห้ามตัดทิ้ง, แบ่งลง 2 ห้องติดกันได้ถ้ายาวเกิน ${maxSyl} พยางค์): "${hookAnchor}"`
      );
    } else {
      lines.push(
        `  * คำ/ใจความสำคัญในท่อนฮุค (Flexible Hook Anchor — ต้องสื่อความ/คำนี้ใน Chorus โดยเกลาคำเชื่อมท้ายเล็กน้อยได้เพื่อให้เข้าสัมผัสและงบ ${maxSyl} พยางค์): "${hookAnchor}"`
      );
    }
  }
  if (closingAnchor) {
    lines.push(
      `  * ประโยคปิดท่อนจบ (Closing Anchor -> วางที่ Outro): "${closingAnchor}"`
    );
  }
  if (sectionAnchor) {
    lines.push(
      `  * ประโยค/คำที่ต้องมีในท่อนนี้ (Section Anchor — ต้องคงคำสำคัญนี้ไว้ในท่อนนี้ ห้ามลบออก): "${sectionAnchor}"`
    );
  }
  if (openingAnchor || hookAnchor || closingAnchor || sectionAnchor) {
    lines.push(
      `  * Rule 3 — Smart Anchor Splitting: หากประโยค Anchor ยาวเกิน ${maxSyl} พยางค์/ห้อง ห้ามบีบทั้งหมดลงห้องเดียวจนร้องรัวและห้ามตัดคำของผู้ใช้ทิ้ง ให้แบ่งลง 2 ห้องติดกันอย่างเป็นจังหวะ (เช่น "รักเธอเท่าเดิม  แต่เดินต่อไม่ไหว" -> Bar 1: "รักเธอเท่าเดิม", Bar 2: "แต่เดินต่อไม่ไหว")`
    );
  }
  return lines;
}

/** สร้าง System Prompt สำหรับการแต่งเนื้อร้องภาษาไทยร่วมสมัยระดับนักแต่งเพลงมืออาชีพ */
export function buildLyricsSystemPrompt(options?: {
  bpm?: number;
  timeSignature?: TimeSignature;
  sectionType?: SectionType;
  barCount?: number;
  thaiGenre?: ThaiSongGenre;
  lyricEra?: ThaiLyricEra;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  lyricDensity?: LyricDensityMode;
  polishExistingDraft?: boolean;
  hasStoryBlueprint?: boolean;
  hasSectionAnchor?: boolean;
}): string {
  const activeType: SectionType = options?.sectionType ?? 'verse';
  const budget = getSyllableBudgetForBpm(options?.bpm ?? 85, options?.timeSignature ?? '4/4', {
    sectionType: activeType,
    songwriterStyle: options?.songwriterStyle,
    thaiGenre: options?.thaiGenre,
    lyricDensity: options?.lyricDensity,
  });
  const barCount = Math.min(8, Math.max(2, options?.barCount ?? 4));
  const blueprint = SECTION_ENERGY_ARC_BLUEPRINTS[activeType] ?? SECTION_ENERGY_ARC_BLUEPRINTS.verse;
  const resolutionProfile =
    EMOTIONAL_RESOLUTION_PROFILES.find((r) => r.id === options?.emotionalResolution) ??
    EMOTIONAL_RESOLUTION_PROFILES[0];

  const genreProfile =
    THAI_GENRE_PROFILES.find((g) => g.id === options?.thaiGenre) ?? THAI_GENRE_PROFILES[0];
  const eraProfile = THAI_ERA_PROFILES.find((e) => e.id === options?.lyricEra);
  const dialectProfile = THAI_DIALECT_PROFILES.find((d) => d.id === options?.lyricDialect);
  const writerProfile = SONGWRITER_STYLE_PROFILES.find((s) => s.id === options?.songwriterStyle);
  const dynamicFewShots = buildDynamicLyricFewShots({
    thaiGenre: options?.thaiGenre,
    songwriterStyle: options?.songwriterStyle,
    emotionalResolution: options?.emotionalResolution,
    lyricDialect: options?.lyricDialect,
    sectionType: activeType,
  });

  return [
    'คุณคือ "นักแต่งเพลงและโปรดิวเซอร์เพลงไทยระดับตำนาน" (Master Thai Songwriter & Vocal Arranger)',
    `ภารกิจ: ${options?.polishExistingDraft ? 'เกลาและยกระดับ' : 'แต่ง'}เนื้อร้องภาษาไทย ${barCount} วรรค (1 วรรค = 1 ห้องเพลง) ที่ร้องเข้าปากกับเมโลดี้ มีลมหายใจท้ายห้องและกลางวรรคจริง ภาษาไทยเป็นธรรมชาติ ส่งสัมผัสสระ-ตัวสะกดได้ไพเราะ และมีพลังทางอารมณ์ตรงตามตำแหน่งท่อน`,
    '',
    'กฎบังคับด้านฉันทลักษณ์ ภาษาถิ่น และแนวเพลง:',
    `1. งบพยางค์ต่อห้องและการเว้นหายใจ: ${budget.guidance} (เวลา ~${budget.barDurationSec} วิ/ห้อง · เผื่อลมหายใจท้ายห้อง ${budget.restSteps} steps · ใช้ช่องว่างคู่ "  " คั่นกลางวรรคหากแบ่ง 2 วลี)`,
    `2. แนวเพลงเป้าหมาย (${genreProfile.label}):`,
    `   - สไตล์ภาษา: ${genreProfile.lyricRules}`,
    `   - รูปแบบสัมผัส: ${genreProfile.rhymePreference}`,
    ...(eraProfile && eraProfile.id !== 'modern-indie'
      ? [`3. ยุคสมัยของภาษา (${eraProfile.label}): ${eraProfile.guidance}`]
      : []),
    ...(dialectProfile && dialectProfile.id !== 'standard'
      ? [`4. กลิ่นอายภาษาถิ่น (${dialectProfile.label}): ${dialectProfile.guidance}`]
      : []),
    ...(writerProfile && writerProfile.id !== 'none'
      ? [`5. บุคลิกการเขียนคำ (${writerProfile.label}): ${writerProfile.guidance}`]
      : []),
    '6. หลักวรรณยุกต์ไทย กลอนเพลงต่อเนื่อง และคำเป็น-คำตายกับการร้อง (Thai Rhyme Chain & Tone-Melody):',
    '   - บังคับความต่อเนื่องทุกวรรค: ท้ายวรรคที่ 1 ส่งสัมผัสเข้าต้น/กลางหรือท้ายวรรคที่ 2, ท้ายวรรคที่ 2 ส่งต่อวรรคที่ 3, ท้ายวรรคที่ 3 ส่งต่อวรรคที่ 4 ต่อเนื่องจนครบทุกห้อง (ห้ามปล่อยวรรคขาดสัมผัส)',
    ...(budget.max <= 6
      ? [
          '   - สำหรับบรรทัดกระชับ (งบ ≤ 6 พยางค์/ห้อง): สามารถใช้กลอนคู่ `AABB` (วรรค 1<->2 และ วรรค 3<->4 คล้องสระ+มาตราตัวสะกดเดียวกัน) หรือสลับ `ABAB` ได้เพื่อคงความคมและความหมายของคำไทย',
        ]
      : []),
    '   - ห้ามซ้ำคำลงท้ายเดิม และต้องสลับกลุ่มสระเมื่อเปลี่ยนคู่วรรค (เช่น คู่วรรคแรกใช้ -าย/-ไอ คู่วรรคต่อมาสลับเป็น -อน/-อง หรือ -า/-าน) เพื่อไม่ให้ท่อนเพลงฟังจำเจ',
    '   - จังหวะท้ายวรรคที่ต้องการทอดเสียงหรือเอื้อน (เช่น ลูกทุ่ง/ลูกกรุง/ป๊อปซึ้ง): ให้เลือก "คำเป็น" (สระเสียงยาว หรือสะกดด้วย แม่ กง กน กม เกย เกอว)',
    '   - จังหวะกระชับ/ตอกย้ำ (เช่น ร็อก/แร็ป-ป๊อป/ซิงโคเปชัน): ใช้ "คำตาย" (แม่ กก กด กบ หรือสระสั้น) และสัมผัสในวรรคได้คมชัด',
    '   - จัดวรรณยุกต์ให้ลงตัวกับเมโลดี้: หลีกเลี่ยงการใช้คำเสียงเอก/โทหลายคำติดกันในจุดที่เมโลดี้พุ่งขึ้นสูง และใช้คำเสียงจัตวา/ตรีในจุดที่ทำนองยกเสียงสูง',
    `7. แผนพลังอารมณ์และโครงสร้างรายห้องของท่อนนี้ (${activeType} · ระดับพลัง ${blueprint.energyScore}):`,
    `   - บทบาท: ${blueprint.roleTitle}`,
    `   - การส่งพลังเสียงร้อง: ${blueprint.vocalRegisterHint}`,
    `   - จังหวะไล่ระดับรายห้อง: ${blueprint.barByBarPlan}`,
    ...(activeType === 'chorus'
      ? [`   - กฎหมัดฮุคคำโดน (${resolutionProfile.label}): ${resolutionProfile.hookRule}`]
      : activeType === 'outro'
        ? [`   - กฎปิดอารมณ์ท่อนจบ (${resolutionProfile.label}): ${resolutionProfile.endingRule}`]
        : [`   - เป้าหมายบทสรุปเพลง (${resolutionProfile.label}): ปูเรื่องให้ส่งต่อสู่ฮุค (${resolutionProfile.hookRule}) และปลายทาง (${resolutionProfile.endingRule})`]),
    ...(options?.hasStoryBlueprint || options?.hasSectionAnchor
      ? [
          `   - กฎหมุดหมายและเรื่องเล่า (Story & Anchor): กระจายฉากให้พอดีท่อนไม่ยัดคำ หากประโยคหมุดหมายของผู้ใช้ยาวเกิน ${budget.max} พยางค์ ให้แบ่งลง 2 ห้องติดกันอย่างเป็นธรรมชาติ ห้ามตัดคำสำคัญทิ้ง`,
        ]
      : []),
    '8. Anti-Cliché Filter (ห้ามใช้เด็ดขาด):',
    `   ห้ามใช้คำซ้ำซาก/สำนวนเชยต่อไปนี้: ${ANTI_CLICHE_THAI_PHRASES.join(', ')}`,
    '   และห้ามแปลสำนวนภาษาอังกฤษแบบตรงตัว ให้ใช้ภาษาพูด/กวีที่คนไทยใช้เล่าความรู้สึกจริงและเห็นภาพชัดเจน',
    '',
    dynamicFewShots,
    '',
    'ตอบกลับเป็น JSON ที่ตรงตาม Schema เท่านั้น ห้ามใส่คำอธิบายหรือ Markdown รอบนอก',
  ].join('\n');
}

/** สร้าง User Prompt สำหรับการแต่งเนื้อร้อง 1 ท่อน พร้อม Context ของเพลงทั้งเรื่องและคอร์ดรายห้อง */
export function buildLyricsUserPrompt(input: LyricsPromptInput): string {
  const timeSig: TimeSignature = input.timeSignature ?? '4/4';
  const maxStepInBar = timeSig === '4/4' ? 15 : 11;
  const totalStepsInBar = timeSig === '4/4' ? 16 : 12;
  const budget = getSyllableBudgetForBpm(input.bpm ?? 85, timeSig, {
    sectionType: input.sectionType,
    songwriterStyle: input.songwriterStyle,
    thaiGenre: input.thaiGenre,
    lyricDensity: input.lyricDensity,
  });
  const barCount = Math.min(8, Math.max(2, input.barCount ?? (input.bars?.length || 4)));

  const priorSectionsBlock =
    input.allPriorSections && input.allPriorSections.some((sec) => sec.lyrics.some((l) => l.trim().length > 0))
      ? input.allPriorSections
          .map(
            (sec) =>
              `  [${sec.name} (${sec.type})]\n` +
              sec.lyrics.map((l, idx) => `    ${idx + 1}. ${l || '(ดนตรี)'}`).join('\n')
          )
          .join('\n')
      : input.previousSectionLyrics && input.previousSectionLyrics.some((l) => l.trim().length > 0)
        ? input.previousSectionLyrics.map((l, i) => `  ${i + 1}. ${l || '(ว่าง)'}`).join('\n')
        : '  (ยังไม่มีเนื้อเพลงท่อนก่อนหน้า)';

  const existingContext =
    input.existingLyrics.some((l) => l.trim().length > 0)
      ? input.existingLyrics.map((l, i) => `  Bar ${i + 1}: ${l || '(ว่าง)'}`).join('\n')
      : `  (ท่อนนี้ยังว่างอยู่ ให้แต่งใหม่ทั้ง ${barCount} ห้อง)`;

  const barStructure =
    input.bars && input.bars.length > 0
      ? input.bars
          .slice(0, barCount)
          .map((b, i) => {
            const chordStr =
              b.chordsPerBar === 2 && b.chord2 ? `${b.chord} -> ${b.chord2} (แบ่งครึ่งห้อง 2 คอร์ด)` : b.chord;
            const draft = b.existingLyrics?.trim() ? ` | ร่างเดิม: "${b.existingLyrics.trim()}"` : '';
            return `  Bar ${i + 1}: [${chordStr}]${draft}`;
          })
          .join('\n')
      : input.chordProgression.join(' | ') || 'C | G | Am | F';

  const genreLabel =
    THAI_GENRE_PROFILES.find((g) => g.id === input.thaiGenre)?.label ?? 'ไทยป๊อป (Thai Pop)';
  const eraLabel = THAI_ERA_PROFILES.find((e) => e.id === input.lyricEra)?.label;
  const dialectLabel = THAI_DIALECT_PROFILES.find((d) => d.id === input.lyricDialect)?.label;
  const writerLabel = SONGWRITER_STYLE_PROFILES.find((s) => s.id === input.songwriterStyle)?.label;
  const blueprint =
    SECTION_ENERGY_ARC_BLUEPRINTS[input.sectionType] ?? SECTION_ENERGY_ARC_BLUEPRINTS.verse;
  const resolutionProfile = EMOTIONAL_RESOLUTION_PROFILES.find(
    (r) => r.id === input.emotionalResolution
  );

  const hasLongTopic = input.topic.trim().length > 140 || input.topic.includes('\n');
  const storyBlock = buildStoryBlueprintPromptBlock(
    input.storyBlueprint,
    input.sectionAnchorPhrase,
    budget,
    hasLongTopic
  );

  return [
    `ข้อมูลท่อนเพลงที่ต้องการ${input.polishExistingDraft ? 'เกลา/ปรับปรุง' : 'แต่ง'}:`,
    ...(input.songTitle?.trim() ? [`- ชื่อเพลง (Title): "${input.songTitle.trim()}"`] : []),
    `- ประเภทท่อน (Section): ${input.sectionType} (จำนวน ${barCount} ห้อง | พลังงาน ${blueprint.energyScore}: ${blueprint.roleTitle})`,
    `- โครงร่างการส่งพลังรายห้อง: ${blueprint.barByBarPlan}`,
    `- แนวเพลง: ${genreLabel}${eraLabel ? ` | ยุค: ${eraLabel}` : ''}${dialectLabel ? ` | ภาษา: ${dialectLabel}` : ''}`,
    ...(writerLabel && input.songwriterStyle !== 'none' ? [`- สไตล์แรงบันดาลใจ: ${writerLabel}`] : []),
    ...(resolutionProfile && resolutionProfile.id !== 'auto'
      ? [`- บทสรุป/ทิศทางหมัดฮุค & ท่อนจบ: ${resolutionProfile.label}`]
      : []),
    `- อารมณ์ (Mood): ${input.mood}`,
    `- หัวข้อ/เรื่องราว (Topic): ${input.topic}`,
    ...storyBlock,
    `- ความเร็ว/จังหวะ: ${input.bpm ?? 85} BPM (${timeSig}) -> เป้าหมาย ${budget.min}-${budget.max} พยางค์/ห้อง (~${budget.barDurationSec} วิ/ห้อง, เว้นหายใจท้ายห้อง ≥ ${budget.restSteps} steps)${budget.barStructureGuidance ? ` (${budget.barStructureGuidance})` : ''}`,
    ...(budget.barBudgets && budget.barBudgets.length > 0
      ? [
          `- แผนจำนวนพยางค์รายห้องแนะนำ: ${budget.barBudgets
            .slice(0, barCount)
            .map((slot) => `Bar ${slot.barIndex + 1} (${slot.min}-${slot.max} พยางค์: ${slot.role})`)
            .join(' | ')}`,
        ]
      : []),
    `- โครงสร้างคอร์ดรายห้อง (${barCount} ห้อง):`,
    typeof barStructure === 'string' && barStructure.includes('Bar 1:') ? barStructure : `  ${barStructure}`,
    `- เนื้อหาและบริบทจากท่อนก่อนหน้า (รักษาสรรพนาม ตัวละคร และเส้นเรื่องให้ต่อเนื่องกัน):`,
    priorSectionsBlock,
    `- เนื้อร้องเดิมในท่อนนี้ (${input.polishExistingDraft ? 'ให้เกลาจากความหมายเดิมนี้โดยเพิ่มสัมผัสและจังหวะร้องที่คมขึ้น' : 'ใช้เป็นไอเดียหรือปรับปรุงให้คล้องจองขึ้น'}):`,
    existingContext,
    '',
    'กรุณาสร้าง JSON ประกอบด้วย:',
    `- lines: array จำนวนตรงกับ ${barCount} ข้อความ (ห้องละ 1 บรรทัด ร้องพอดีใน 1 ห้องเพลง)`,
    '- rhymeNotes: อธิบายจุดส่งสัมผัส คำเป็น/คำตาย และความหมายเด่นที่ใช้ในท่อนนี้ 2-3 ข้อสั้นๆ ภาษาไทย',
    `- suggestedChords: array ของคอร์ด ${barCount} ห้องที่เหมาะกับอารมณ์เพลงนี้`,
    ...(input.mode === 'deep'
      ? [
          `- melodyNotesPerBar: array ${barCount} กลุ่ม (ห้องละ ${budget.min}-${budget.max} โน้ต ตามจำนวนพยางค์จริงในบรรทัดนั้น และต้องเว้นลมหายใจท้ายห้องอย่างน้อย ${budget.restSteps} steps จาก ${totalStepsInBar} steps) แต่ละโน้ตมี step (0..${maxStepInBar}), midiPitch (52..79 โดยคำนึงถึงเสียงวรรณยุกต์ไทยและโน้ตในคอร์ด), durationSteps (1..8)`,
        ]
      : []),
  ].join('\n');
}

export interface SingleBarVariationsPromptInput extends LyricsPromptInput {
  singleBarIndex: number;
}

/** สร้าง User Prompt เฉพาะเจาะจงสำหรับสุ่ม 3 ตัวเลือกใน 1 ห้องเพลง (Phase 7D) */
export function buildSingleBarVariationsUserPrompt(input: SingleBarVariationsPromptInput): string {
  const totalBars = Math.max(1, input.bars?.length || input.existingLyrics?.length || 4);
  const targetIdx = Math.min(totalBars - 1, Math.max(0, Math.round(input.singleBarIndex)));
  const targetBar = input.bars?.[targetIdx];
  const targetChord =
    targetBar?.chord ||
    input.chordProgression[targetIdx % Math.max(1, input.chordProgression.length)] ||
    'C';
  const targetChordLabel =
    targetBar?.chordsPerBar === 2 && targetBar.chord2
      ? `${targetChord} -> ${targetBar.chord2}`
      : targetChord;
  const chordEmotion = getChordEmotionalHint(targetChord, 'th');

  const budget = getSyllableBudgetForBpm(input.bpm ?? 85, input.timeSignature ?? '4/4', {
    sectionType: input.sectionType,
    songwriterStyle: input.songwriterStyle,
    thaiGenre: input.thaiGenre,
    lyricDensity: input.lyricDensity,
  });
  const barSlot = budget.barBudgets?.[targetIdx];
  const minSyl = barSlot?.min ?? budget.min;
  const maxSyl = barSlot?.max ?? budget.max;
  const barRole = barSlot?.role ?? `Bar ${targetIdx + 1} of ${totalBars}`;

  const existingLines =
    input.bars && input.bars.length > 0
      ? input.bars.map((b) => (b.existingLyrics ?? '').trim())
      : (input.existingLyrics ?? []).map((l) => l.trim());

  const prevSameSection = targetIdx > 0 ? existingLines[targetIdx - 1] : '';
  const prevCrossSection =
    !prevSameSection && input.previousSectionLyrics && input.previousSectionLyrics.length > 0
      ? [...input.previousSectionLyrics].reverse().find((l) => l.trim().length > 0)?.trim() || ''
      : '';
  const prevLine = prevSameSection || prevCrossSection;
  const prevPhonetics = prevLine ? analyzeThaiSyllablePhonetics(prevLine) : null;

  const nextLine = targetIdx + 1 < existingLines.length ? existingLines[targetIdx + 1] : '';
  const currentDraft = (targetBar?.existingLyrics ?? existingLines[targetIdx] ?? '').trim();

  const genreLabel =
    THAI_GENRE_PROFILES.find((g) => g.id === input.thaiGenre)?.label ?? 'ไทยป๊อป (Thai Pop)';
  const writerLabel = SONGWRITER_STYLE_PROFILES.find((s) => s.id === input.songwriterStyle)?.label;

  return [
    `ภารกิจเฉพาะห้อง (Single-Bar 3 Variations): แต่งตัวเลือกใหม่ 3 ประโยคที่แตกต่างกันอย่างสร้างสรรค์สำหรับ Bar ${targetIdx + 1} (จากทั้งหมด ${totalBars} ห้อง) ในท่อน ${input.sectionType}`,
    ...(input.songTitle?.trim() ? [`- ชื่อเพลง: "${input.songTitle.trim()}"`] : []),
    `- แนวเพลง: ${genreLabel}${writerLabel && input.songwriterStyle !== 'none' ? ` | สไตล์: ${writerLabel}` : ''}`,
    `- อารมณ์: ${input.mood} | เรื่องราว: ${input.topic}`,
    ...(input.sectionAnchorPhrase?.trim()
      ? [`- คำ/ประโยคสำคัญที่ต้องสอดแทรกในห้องนี้ (Anchor): "${input.sectionAnchorPhrase.trim()}"`]
      : []),
    `- คอร์ดประจำห้องที่ ${targetIdx + 1}: [${targetChordLabel}] (อารมณ์คอร์ด: ${chordEmotion})`,
    `- บทบาทและงบพยางค์ของห้องนี้: ${barRole} — คุมจำนวนพยางค์ให้อยู่ในช่วง ${minSyl}-${maxSyl} พยางค์ (~${budget.barDurationSec} วิ/ห้อง · เผื่อลมหายใจท้ายห้อง ${budget.restSteps} steps · ใช้ช่องว่างคู่ "  " คั่นกลางหากแบ่ง 2 วลี) (${input.bpm ?? 85} BPM, ${input.timeSignature ?? '4/4'})`,
    `- วรรคก่อนหน้า (ให้รับสัมผัสสระ-แม่ตัวสะกดจากคำลงท้ายนี้): ${
      prevLine
        ? `"${prevLine}" (คำลงท้าย "${prevPhonetics?.lastSyllable || ''}" · วรรณยุกต์${prevPhonetics?.tone || ''} · ${prevPhonetics?.isLiveSyllable ? 'คำเป็น' : 'คำตาย'})`
        : '(เป็นห้องแรก ยังไม่มีวรรคก่อนหน้า)'
    }`,
    `- วรรคถัดไป (ให้เนื้อหาและจังหวะส่งต่อเข้าวรรคนี้ได้อย่างลื่นไหล): ${
      nextLine ? `"${nextLine}"` : '(ยังไม่มีวรรคถัดไปหรือเป็นห้องท้ายท่อน)'
    }`,
    ...(currentDraft ? [`- ร่างเดิมในห้องนี้ (ให้คิดตัวเลือกใหม่ที่ดีและกลมกลืนกว่า): "${currentDraft}"`] : []),
    '',
    'กรุณาสร้าง JSON ประกอบด้วย:',
    `- variations: array 3 ข้อความพอดี สำหรับ Bar ${targetIdx + 1} (ตัวเลือกที่ 1 ตรงไปตรงมาติดหู / ตัวเลือกที่ 2 เปรียบเปรยเห็นภาพ / ตัวเลือกที่ 3 ละมุนลึกซึ้งหรือสัมผัสในคมคาย) และทุกตัวเลือกต้องคุม ${minSyl}-${maxSyl} พยางค์`,
    '- rhymeNotes: อธิบายจุดเชื่อมสัมผัสกับวรรคก่อน/ถัดไป 1-2 ข้อสั้นๆ',
    '- tip: คำแนะนำสั้นๆ 1 ประโยคในการเลือกใช้',
  ].join('\n');
}

/** สร้าง System Prompt สำหรับ AI Music Producer & Arranger (AI Song Director) */
export function buildDirectorSystemPrompt(): string {
  return [
    'คุณคือ "AI Music Producer & Arranger ระดับสตูดิโอ" สำหรับแอปทำเดโมเพลงไทย (Demo Maker Easy)',
    'ภารกิจ: แปลงคำสั่งภาษาธรรมชาติของผู้ใช้ให้เป็น JSON Patch ที่แก้เฉพาะส่วนที่ควรเปลี่ยนอย่างมีเหตุผลทางดนตรี',
    '',
    PRODUCER_ARRANGEMENT_RULES,
    '',
    'ค่าที่อนุญาต (Exact Enum Values — ห้ามสะกดผิด):',
    '- timeSignature: "4/4" | "3/4" | "6/8"',
    '- guitarModel: "classical-nylon" | "dreadnought-steel" | "ovation-roundback" | "gibson-les-paul"',
    '- ambience3D: "living-room" | "wood-studio" | "unplugged-hall"',
    '- intensity: "low" | "medium" | "high"',
    '- guitarRhythmStyle: "campfire-strum" | "soft-strum" | "fingerpicking" | "lukthung-bounce" | "rock-power"',
    '- guitarLeadStyle: "melodic-solo" | "riff-fills" | "soft-arpeggio"',
    '- guitarLeadDrive: "clean" | "crunch" | "overdrive" | "distortion" | "fuzz"',
    '- bassStyle: "root-fifth" | "warm-sustain" | "lukthung-groove" | "rnb-syncopated"',
    '- pianoStyle: "warm-pad" | "gentle-arpeggio" | "rnb-neo-chord" | "rock-organ-pad"',
    '- drumsStyle: "off" | "shaker-cajon" | "simple-kit" | "lukthung-3cha" | "rnb-pocket" | "rock-drive"',
    '',
    'ตัวอย่าง Golden Few-Shot Patch (อ้างอิงวิธีคิดแบบโปรดิวเซอร์):',
    'ตัวอย่างที่ 1 — คำสั่ง: "อยากได้ฟีล Acoustic อุ่นๆ เหมือนเล่นในร้านกาแฟยามบ่าย"',
    'ผลลัพธ์ JSON:',
    '{',
    '  "bpm": 76,',
    '  "guitarModel": "classical-nylon",',
    '  "ambience3D": "living-room",',
    '  "sectionPatches": [',
    '    { "sectionType": "verse", "intensity": "low", "guitarRhythm": true, "guitarRhythmStyle": "fingerpicking", "guitarLead": false, "piano": true, "pianoStyle": "warm-pad", "pianoVolume": 45, "drums": true, "drumsStyle": "shaker-cajon", "drumsVolume": 40 },',
    '    { "sectionType": "chorus", "intensity": "medium", "guitarRhythm": true, "guitarRhythmStyle": "soft-strum", "bass": true, "bassStyle": "warm-sustain", "drums": true, "drumsStyle": "shaker-cajon", "drumsVolume": 65 }',
    '  ],',
    '  "summaryNotes": ["ปรับฟีลอะคูสติกอุ่นด้วยกีตาร์ไนลอน + ห้อง Living Room", "ท่อน Verse ใช้เกา fingerpicking และปิดลีดเพื่อเปิดพื้นที่ให้เสียงร้อง", "ท่อน Chorus เติมเบส warm-sustain และ shaker-cajon ให้นุ่มนวล"]',
    '}',
    '',
    'ตัวอย่างที่ 2 — คำสั่ง: "ท่อนฮุคยังไม่พุ่งเลย ช่วยจัดให้หนักแน่นขึ้นกว่านี้"',
    'ผลลัพธ์ JSON:',
    '{',
    '  "sectionPatches": [',
    '    { "sectionType": "verse", "intensity": "low", "guitarLead": false, "drumsVolume": 55 },',
    '    { "sectionType": "chorus", "intensity": "high", "guitarRhythm": true, "guitarRhythmStyle": "campfire-strum", "guitarRhythmVolume": 95, "bass": true, "bassStyle": "root-fifth", "bassVolume": 90, "piano": true, "pianoStyle": "warm-pad", "pianoVolume": 70, "drums": true, "drumsStyle": "simple-kit", "drumsVolume": 95 }',
    '  ],',
    '  "summaryNotes": ["ลดความดังกลองใน Verse และปิดลีดเพื่อสร้าง Contrast ก่อนเข้าท่อนฮุค", "ดันท่อน Chorus เป็น intensity=high พร้อมกลอง simple-kit และเบส root-fifth เต็มกำลัง"]',
    '}',
    '',
    'กฎการตอบ: ส่งกลับเป็น JSON ตรงตาม Schema เท่านั้น เปลี่ยนเฉพาะฟิลด์ที่เกี่ยวข้องและเขียน summaryNotes เป็นภาษาไทยกระชับชัดเจน',
  ].join('\n');
}

/** สร้าง User Prompt สำหรับ AI Song Director โดยส่ง Song Summary ขนาดกะทัดรัด */
export function buildDirectorUserPrompt(userPrompt: string, songSummary: unknown): string {
  return [
    `คำสั่งจากนักแต่งเพลง/ผู้ใช้: "${userPrompt}"`,
    '',
    'สถานะโปรเจกต์ปัจจุบัน (Summary JSON):',
    JSON.stringify(songSummary),
    '',
    'โปรดสร้าง JSON Patch เพื่อปรับแต่งโปรเจกต์นี้ให้ได้เสียงตรงตามความต้องการทางดนตรีที่สุด',
  ].join('\n');
}

/** System Prompt สำหรับโหมด Easy Mode Song Architect (Phase 5B + 6C Dynamic Bank) */
export function buildEasyArchitectSystemPrompt(options?: {
  thaiGenre?: ThaiSongGenre;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  bpm?: number;
  timeSignature?: TimeSignature;
  lyricDensity?: LyricDensityMode;
}): string {
  const bpm = options?.bpm ?? 85;
  const timeSig: TimeSignature = options?.timeSignature ?? '4/4';
  const budgetOpts = {
    songwriterStyle: options?.songwriterStyle,
    thaiGenre: options?.thaiGenre,
    lyricDensity: options?.lyricDensity,
  };
  const budget = getSyllableBudgetForBpm(bpm, timeSig, { sectionType: 'verse', ...budgetOpts });
  const preChorusBudget = getSyllableBudgetForBpm(bpm, timeSig, { sectionType: 'pre-chorus', ...budgetOpts });
  const chorusBudget = getSyllableBudgetForBpm(bpm, timeSig, { sectionType: 'chorus', ...budgetOpts });
  const bridgeBudget = getSyllableBudgetForBpm(bpm, timeSig, { sectionType: 'bridge', ...budgetOpts });
  const outroBudget = getSyllableBudgetForBpm(bpm, timeSig, { sectionType: 'outro', ...budgetOpts });
  const dynamicFewShots = buildDynamicLyricFewShots({
    thaiGenre: options?.thaiGenre,
    songwriterStyle: options?.songwriterStyle,
    emotionalResolution: options?.emotionalResolution,
    lyricDialect: options?.lyricDialect,
  });

  return [
    'คุณคือ "Head Producer & Song Architect" ที่สร้างโครงสร้างเพลงไทย/สากลทั้งเพลงในคราวเดียว (Intro -> Verse -> Pre-Chorus -> Chorus -> Outro)',
    PRODUCER_ARRANGEMENT_RULES,
    '',
    'กฎสำคัญเพิ่มเติมด้านอารมณ์และการแต่ง:',
    '- วาง Emotional Energy Arc ชัดเจน: Intro(2/10) -> Verse(4/10 เล่าภาพเปิดฉาก) -> Pre-Chorus(7/10 บีบอารมณ์และยกโน้ตส่ง) -> Chorus(10/10 หมัดฮุคคำโดน Bar 1 + พีค Bar 3 + ประโยคทอง Bar 4) -> Outro(3->1/10 ปิดอารมณ์ให้ขาดหรือฟูลฟิลสมบูรณ์)',
    '- ลำดับคิด Story Blueprint ก่อนเขียนเนื้อร้อง: กรอกฟิลด์ `storyBlueprint` (`coreTheme`, `emotionalArcSummary`, `sectionBeats`) เพื่อรวบยอดเรื่องราวทั้งหมดและกระจายเหตุการณ์ทีละฉากลงทุกท่อนก่อนเริ่มแต่งบรรทัดแรกของ `sections` (ห้ามยัดทุกเหตุการณ์ลง Verse 1)',
    `- ทุกท่อนต้องต่อเรื่องราวกันอย่างมีพัฒนาการทางอารมณ์ และเคารพงบพยางค์แยกตามท่อน (~${budget.barDurationSec} วิ/ห้อง · เผื่อลมหายใจท้ายห้อง ≥ ${budget.restSteps} steps · ${budget.guidance})`,
    `- กฎความกระชับเพื่อการขับร้องจริง (Singable Pacing & Anti-Rush — Per-Section Breakdown ที่ ${bpm} BPM ${timeSig}):`,
    `  * Verse: ${budget.min}-${budget.max} พยางค์/ห้อง | Pre-Chorus: ${preChorusBudget.min}-${preChorusBudget.max} พยางค์/ห้อง`,
    `  * Chorus: Bar 1 Hook สั้นติดหู ${Math.max(3, chorusBudget.min)}-${Math.max(4, chorusBudget.max - 1)} พยางค์ และ Bar 2-4 ${chorusBudget.min}-${chorusBudget.max} พยางค์/ห้อง`,
    `  * Bridge: ${bridgeBudget.min}-${bridgeBudget.max} พยางค์/ห้อง | Outro Bar 1: ${outroBudget.min}-${outroBudget.max} พยางค์/ห้อง`,
    '  * ใช้ช่องว่างคู่ "  " คั่นกลางวรรคหากแบ่งเป็น 2 วลี เพื่อเว้นลมหายใจกลางห้องและท้ายห้องทุกห้อง ห้ามรัวคำล้นงบ',
    '- บังคับสัมผัสสระ+ตัวสะกดภาษาไทยต่อเนื่องทุกวรรค (ท้ายวรรคเข้าต้น/กลางหรือท้ายวรรคถัดไป และสำหรับวรรคสั้น ≤ 6 พยางค์สามารถใช้สัมผัสคู่ AABB/ABAB ได้) และสลับสระไม่ซ้ำคำลงท้ายเดิมในท่อน Verse, Pre-Chorus, Chorus และ Outro',
    '- กฎความหลากหลายของคีย์ (Key Diversity): หลีกเลี่ยงการตกไปใช้ C หรือ Am ซ้ำทุกเพลง ให้เลือกใช้คีย์ที่เหมาะกับอารมณ์เพลงและโทนเสียงจริง เช่น D, E, F, G, A, Bb, Em, Bm, Dm, F#m พร้อม capoFret (0-5) ที่จับง่ายบนกีตาร์โปร่ง',
    "- กฎการหยุดจังหวะ (playStyle): ห้ามตั้ง playStyle: 'break' ในห้องสุดท้ายของท่อน outro (ต้องใช้ 'let-ring'), ห้องแรกของ intro, และห้ามวาง 'break' ติดกัน 2 ห้องในท่อนที่มีเนื้อร้อง (สำหรับเพลงช้า < 78 BPM ให้ใช้ 'let-ring' แทน 'break' ท้ายท่อนส่งเข้าฮุค เพื่อไม่ให้เกิดช่วงเงียบยาวเกินไป)",
    `- กฎความกระชับท่อน outro: ลดจำนวนพยางค์ลงทันทีเมื่อเทียบกับ Chorus — โดยเฉพาะ Outro Bar 1 ต้องสรุปสั้นคมไม่เกิน ${outroBudget.max} พยางค์ (${outroBudget.min}-${outroBudget.max} พยางค์) ห้ามยืดเป็นประโยคยาว และปล่อย Bar 2 ลากสระเปิดสงบด้วย playStyle: 'let-ring'`,
    '- ท่อน intro ต้องเว้น lyrics เป็น "" และ melodyNotes เป็น [] เพื่อให้ดนตรีเกริ่นนำโดยไม่มีเสียงขลุ่ยไกด์ร้องแย่งความโดดเด่นของอินโทร',
    '- ไม่ต้องสร้าง array melodyNotes รายโน้ตในแต่ละห้อง (ให้ส่ง melodyNotes: [] หรือละเว้นไว้) เพราะระบบ Synth ฝั่งแอปจะสังเคราะห์โน้ตเมโลดี้ที่ตรงคอร์ด พยางค์คำร้อง และวรรณยุกต์ไทยให้โดยอัตโนมัติอย่างแม่นยำและรวดเร็วกว่า',
    '- หากผู้ใช้ระบุโครงสร้างท่อนเพลง (customStructure) หรือทางคอร์ด (customChords / chordProgressionPreset): คุณต้องจัดลำดับท่อน จำนวนห้องในแต่ละท่อน และคอร์ดให้ตรงตามที่ผู้ใช้ระบุเป๊ะ 100% ห้ามข้าม เพิ่ม ลด หรือเปลี่ยนชนิดท่อนโดยพลการ',
    `- หลีกเลี่ยงสำนวนซ้ำซาก: ${ANTI_CLICHE_THAI_PHRASES.slice(0, 5).join(', ')}`,
    '',
    dynamicFewShots,
    '',
    'ตอบกลับเป็น JSON ตาม Schema ที่กำหนดเท่านั้น ห้ามใช้ Markdown รอบนอก',
  ].join('\n');
}

/** สร้าง User Prompt สำหรับการเสกทั้งเพลงใน Easy Mode Architect */
export function buildEasyArchitectUserPrompt(input: {
  stylePreset: string;
  vocalProfile: 'female' | 'male' | 'neutral';
  tempoFeel: 'slow' | 'medium' | 'fast';
  topic: string;
  language: 'th' | 'en';
  recommendedBpm: number;
  recommendedGuitarModel: string;
  recommendedAmbience: string;
  thaiGenre?: ThaiSongGenre;
  lyricEra?: ThaiLyricEra;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  lyricDensity?: LyricDensityMode;
  storyBlueprint?: StoryBlueprintInput;
  customStructure?: Array<{ type: SectionType; bars: number; name?: string }>;
  chordProgressionPreset?: string;
  customChords?: string[];
}): string {
  const vocalHint =
    input.vocalProfile === 'female'
      ? 'เสียงผู้หญิง (แนะนำ Key D, E, F, G, A, Bb หรือ Bm/F#m พร้อม Capo 1–4 ช่วงโน้ต E4–D5)'
      : input.vocalProfile === 'male'
        ? 'เสียงผู้ชาย (แนะนำ Key D, E, G, A, Em, Dm หรือ Bm พร้อม Capo 0–2 ช่วงโน้ต C3–G4 — หลีกเลี่ยงการซ้ำ C/Am ทุกเพลง)'
        : 'เสียงร้องกลาง/ร้องคู่ (แนะนำ Key D, F, G, A, Em หรือ Dm พร้อม Capo 0–2 ช่วงโน้ต G3–D5)';

  const genreProfile = THAI_GENRE_PROFILES.find((g) => g.id === input.thaiGenre);
  const eraProfile = THAI_ERA_PROFILES.find((e) => e.id === input.lyricEra);
  const dialectProfile = THAI_DIALECT_PROFILES.find((d) => d.id === input.lyricDialect);
  const writerProfile = SONGWRITER_STYLE_PROFILES.find((s) => s.id === input.songwriterStyle);
  const resolutionProfile =
    EMOTIONAL_RESOLUTION_PROFILES.find((r) => r.id === input.emotionalResolution) ??
    EMOTIONAL_RESOLUTION_PROFILES[0];

  const hasCustomStructure = Array.isArray(input.customStructure) && input.customStructure.length > 0;
  const headerLine = hasCustomStructure
    ? `โปรดออกแบบเพลง 1 เพลงเต็มตามโครงสร้างท่อนเพลงที่กำหนด (${input.customStructure!.length} ท่อน):`
    : 'โปรดออกแบบเพลง 1 เพลงเต็ม (5 ท่อน: intro 2 ห้อง, verse 4 ห้อง, pre-chorus 2-4 ห้อง, chorus 4 ห้อง, outro 2 ห้อง):';
  const bpm = input.recommendedBpm || 85;
  const budgetOpts = {
    songwriterStyle: input.songwriterStyle,
    thaiGenre: input.thaiGenre,
    lyricDensity: input.lyricDensity,
  };
  const budget = getSyllableBudgetForBpm(bpm, '4/4', { sectionType: 'verse', ...budgetOpts });
  const preChorusBudget = getSyllableBudgetForBpm(bpm, '4/4', { sectionType: 'pre-chorus', ...budgetOpts });
  const chorusBudget = getSyllableBudgetForBpm(bpm, '4/4', { sectionType: 'chorus', ...budgetOpts });
  const bridgeBudget = getSyllableBudgetForBpm(bpm, '4/4', { sectionType: 'bridge', ...budgetOpts });
  const outroBudget = getSyllableBudgetForBpm(bpm, '4/4', { sectionType: 'outro', ...budgetOpts });
  const hasLongTopic = input.topic.trim().length > 140 || input.topic.includes('\n');
  const storyBlock = buildStoryBlueprintPromptBlock(
    input.storyBlueprint,
    undefined,
    budget,
    hasLongTopic
  );

  return [
    headerLine,
    `- แนวเพลง (Style Preset): ${input.stylePreset} (แนะนำกีตาร์ ${input.recommendedGuitarModel}, ห้อง ${input.recommendedAmbience})`,
    ...(genreProfile
      ? [
          `- แนวเพลงไทยเฉพาะทาง (${genreProfile.label}): ${genreProfile.lyricRules}`,
          `  การส่งสัมผัสและคำท้ายวรรค: ${genreProfile.rhymePreference}`,
        ]
      : []),
    ...(eraProfile ? [`- ยุคสมัยของภาษา (${eraProfile.label}): ${eraProfile.guidance}`] : []),
    ...(dialectProfile && dialectProfile.id !== 'standard'
      ? [`- ภาษาถิ่น (${dialectProfile.label}): ${dialectProfile.guidance}`]
      : []),
    ...(writerProfile && writerProfile.id !== 'none'
      ? [`- สไตล์นักแต่งเพลง (${writerProfile.label}): ${writerProfile.guidance}`]
      : []),
    `- เป้าหมายท่อนฮุคและการปิดอารมณ์ท่อนจบ (${resolutionProfile.label}):`,
    `  * กฎท่อนฮุค (Chorus): ${resolutionProfile.hookRule}`,
    `  * กฎท่อนจบ (Outro): ${resolutionProfile.endingRule}`,
    `- ช่วงเสียงร้อง (Vocal Range): ${vocalHint}`,
    `- ความเร็ว (Tempo Feel): ${input.tempoFeel} (~${input.recommendedBpm} BPM)`,
    `- ภาษาเนื้อร้องหลัก: ${input.language === 'en' ? 'English (Contemporary Acoustic)' : 'ภาษาไทยร่วมสมัย'}`,
    `- เรื่องราว/ไอเดียจากผู้ใช้: "${input.topic}"`,
    ...storyBlock,
    ...(hasCustomStructure
      ? [
          `- ข้อบังคับโครงสร้างท่อนเพลง (${input.customStructure!.length} ท่อน บังคับเรียงตามลำดับเป๊ะ 100% ห้ามเพิ่มหรือลดท่อนเอง):`,
          ...input.customStructure!.map(
            (s, idx) =>
              `  ${idx + 1}. [ท่อนที่ ${idx + 1}] ประเภท: ${s.type}, ชื่อท่อน: "${s.name || s.type}", จำนวน: ${s.bars} ห้อง`
          ),
        ]
      : []),
    ...(input.customChords && input.customChords.length > 0
      ? [`- ทางคอร์ดที่บังคับใช้ (Custom Chords): บังคับใช้คอร์ดในชุดนี้ [${input.customChords.join(', ')}] ในทุกห้องของเพลง`]
      : input.chordProgressionPreset
        ? [`- ทางคอร์ดที่บังคับใช้ (Chord Progression Formula): บังคับใช้ทางคอร์ดสูตร "${input.chordProgressionPreset}" แปลงตามคีย์ของเพลง`]
        : []),
    '',
    'ข้อบังคับโครงสร้าง:',
    '- ท่อน intro เว้น lyrics เป็น "" และ melodyNotes เป็น [] เพื่อให้ดนตรีเกริ่นนำ ส่วน outro ให้ใส่ประโยคปิดท้ายอารมณ์สั้นๆ ในห้องแรก และใช้ playStyle: "let-ring" ปิดนิ่งในห้องสุดท้าย',
    '- ท่อน pre-chorus ต้องไต่ระดับอารมณ์ส่งเข้าคำแรกของท่อน chorus และท่อน chorus ต้องมีประโยคจำ (Opening Punchline + Signature Payoff Line) ที่ทรงพลังที่สุดในเพลง',
    `- คุมงบพยางค์แยกตามท่อน (~${budget.barDurationSec} วิ/ห้อง${input.lyricDensity ? ` · โหมดความหนาแน่น: ${input.lyricDensity}` : ''}): Verse ${budget.min}-${budget.max} พยางค์ | Pre-Chorus ${preChorusBudget.min}-${preChorusBudget.max} พยางค์ | Chorus Bar 1 ${Math.max(3, chorusBudget.min)}-${Math.max(4, chorusBudget.max - 1)} และ Bar 2-4 ${chorusBudget.min}-${chorusBudget.max} พยางค์ | Bridge ${bridgeBudget.min}-${bridgeBudget.max} พยางค์ | Outro ${outroBudget.min}-${outroBudget.max} พยางค์ (${budget.guidance}) ไม่เขียนเนื้อร้องยาวล้นงบจนร้องรัว`,
    '- ท่อน verse, pre-chorus, chorus ต้องมีทั้งคอร์ดและเนื้อร้องที่มีสัมผัสคล้องจองสอดคล้องคำเป็น/คำตาย (ส่วน melodyNotes ให้ส่ง [] หรือละเว้นไว้เพื่อให้ระบบ Synth ฝั่งแอปสร้างโน้ตไกด์อัตโนมัติ)',
    hasCustomStructure
      ? '- บังคับสร้างท่อนและจำนวนห้องให้ตรงตามโครงสร้างด้านบนเป๊ะ 100%'
      : '',
    '- เขียน `producerNotes` สั้นๆ 2–3 ข้ออธิบายแนวคิดการ Arrange ที่จัดให้',
  ].filter(Boolean).join('\n');
}

const POLISH_SECTION_PRIORITY: Record<string, number> = {
  chorus: 0,
  'pre-chorus': 1,
  verse: 2,
  bridge: 3,
  outro: 4,
};

export interface PolishSectionCandidate<T> {
  item: T;
  sectionType: string;
  passed: boolean;
  hasDuplicates: boolean;
  syllableOverflowCount?: number;
}

/**
 * จัดลำดับความสำคัญของท่อนที่ต้องส่งเข้า 1-Pass Polish โดยให้ความสำคัญกับ
 * Chorus -> Pre-Chorus -> Verse -> Outro ก่อนเสมอ (ไม่ทิ้งท่อน Chorus หากต้นเพลงมีหลายปัญหา)
 */
export function selectPrioritySectionsForPolish<T>(
  candidates: PolishSectionCandidate<T>[],
  maxCount = 2
): PolishSectionCandidate<T>[] {
  return candidates
    .filter((c) => !c.passed || c.hasDuplicates || (c.syllableOverflowCount ?? 0) > 0)
    .sort((a, b) => {
      const pa = POLISH_SECTION_PRIORITY[a.sectionType] ?? 9;
      const pb = POLISH_SECTION_PRIORITY[b.sectionType] ?? 9;
      if (pa !== pb) return pa - pb;
      if (a.passed !== b.passed) return a.passed ? 1 : -1;
      return (b.syllableOverflowCount ?? 0) - (a.syllableOverflowCount ?? 0);
    })
    .slice(0, maxCount);
}

/** สร้าง Prompt สำหรับรอบขัดเกลาสัมผัสภาษาไทย (สูงสุด 1 รอบเมื่อ post-validator พบคำไม่คล้องจอง คำซ้ำท้ายวรรค หรือพยางค์ล้น) */
export function buildRhymePolishPrompt(
  sectionsToFix: Array<{
    sectionId?: string;
    sectionName: string;
    sectionType?: SectionType;
    chords: string[];
    lines: string[];
    duplicateEndWords?: string[];
    weakPairs?: Array<[number, number]>;
    outOfBudgetBars?: Array<{ barIndex: number; syllables: number; expectedMax: number }>;
    expectedMin?: number;
    expectedMax?: number;
    lockedAnchors?: string[];
  }>,
  bpm: number,
  options?: {
    budgetLabel?: string;
    lockedAnchors?: string[];
    timeSignature?: TimeSignature;
    songwriterStyle?: ThaiSongwriterStyle;
    thaiGenre?: ThaiSongGenre;
    lyricDensity?: LyricDensityMode;
  }
): string {
  const timeSig: TimeSignature = options?.timeSignature ?? '4/4';
  const defaultBudget = getSyllableBudgetForBpm(bpm, timeSig, {
    sectionType: 'verse',
    songwriterStyle: options?.songwriterStyle,
    thaiGenre: options?.thaiGenre,
    lyricDensity: options?.lyricDensity,
  });
  const dupList = Array.from(
    new Set(
      sectionsToFix
        .flatMap((s) => s.duplicateEndWords ?? [])
        .map((w) => w.trim())
        .filter(Boolean)
    )
  );
  const weakPairNotes = sectionsToFix.flatMap((s) =>
    (s.weakPairs ?? []).map(
      ([fromIdx, toIdx]) =>
        `- ${s.sectionName}${s.sectionId ? ` [${s.sectionId}]` : ''}: วรรค ${fromIdx + 1} -> วรรค ${toIdx + 1} ยังไม่รับ-ส่งสัมผัส ให้ปรับคำลงท้ายหรือคำเชื่อมสระ+มาตราให้คล้องกัน`
    )
  );
  const sectionBudgetNotes = sectionsToFix.map((s) => {
    const secBudget = getSyllableBudgetForBpm(bpm, timeSig, {
      sectionType: s.sectionType ?? 'verse',
      songwriterStyle: options?.songwriterStyle,
      thaiGenre: options?.thaiGenre,
      lyricDensity: options?.lyricDensity,
    });
    const minSyl = s.expectedMin ?? secBudget.min;
    const maxSyl = s.expectedMax ?? secBudget.max;
    return `- งบพยางค์ท่อน ${s.sectionName}${s.sectionId ? ` [${s.sectionId}]` : ''}: คุมทุกบรรทัดให้ไม่เกิน ${minSyl}-${maxSyl} พยางค์/วรรค (~${secBudget.barDurationSec} วิ/ห้อง · เผื่อลมหายใจ ${secBudget.restSteps} steps)`;
  });
  const overflowNotes = sectionsToFix.flatMap((s) =>
    (s.outOfBudgetBars ?? [])
      .filter((b) => b.syllables > b.expectedMax)
      .map(
        (b) =>
          `- ${s.sectionName}${s.sectionId ? ` [${s.sectionId}]` : ''} วรรค ${b.barIndex + 1}: มี ${b.syllables} พยางค์ เกินงบ (ควรลดให้ไม่เกิน ${b.expectedMax} พยางค์)`
      )
  );
  const lockedAnchors = Array.from(
    new Set(
      [
        ...(options?.lockedAnchors ?? []),
        ...sectionsToFix.flatMap((s) => s.lockedAnchors ?? []),
      ]
        .map((a) => a.trim())
        .filter(Boolean)
    )
  );
  const targetSyllables =
    options?.budgetLabel ||
    `${defaultBudget.min}-${defaultBudget.max} พยางค์/วรรค (~${defaultBudget.barDurationSec} วิ/ห้อง, กระชับ ร้องสบายมีลมหายใจ)`;

  return [
    `ปรับปรุงเฉพาะคำลงท้าย คำเชื่อมสัมผัส และความกระชับของพยางค์ในท่อนต่อไปนี้ให้ส่งสัมผัสสระ+ตัวสะกดภาษาไทยลื่นไหลขึ้น (ความเร็ว ${bpm} BPM ${timeSig}, งบอ้างอิง ${targetSyllables}):`,
    ...sectionBudgetNotes,
    ...(lockedAnchors.length > 0
      ? [
          `- ประโยค/คำหมุดหมายที่ห้ามลบหรือเปลี่ยนความหมาย (Locked Story Anchors): ${lockedAnchors.map((a) => `"${a}"`).join(', ')}`,
        ]
      : []),
    ...(dupList.length > 0
      ? [`- ห้ามใช้คำลงท้ายวรรคซ้ำคำเดิมโดยเด็ดขาด! พบคำซ้ำต้องเปลี่ยนใหม่ทันที: ${dupList.join(', ')}`]
      : []),
    ...weakPairNotes,
    ...overflowNotes,
    ...(overflowNotes.length > 0
      ? ['- ต้องตัดคำฟุ่มเฟือยหรือคำเชื่อมเกินจำเป็นออกให้พยางค์กระชับไม่เกินเพดานของแต่ละวรรคจริง ห้ามปล่อยเกินงบ']
      : []),
    '- ตัวอย่างการรับ-ส่งสัมผัสสระ+ตัวสะกดที่ถูกต้อง: วรรค 1 จบ "...ใจ" -> วรรค 2 รับสระ+มาตราเดียวกัน "...ไกล" / "...ไป" | วรรค 3 จบ "...ฝัน" -> วรรค 4 รับ "...วัน" / "...กัน" (สามารถใช้กลอนคู่ AABB หรือสลับ ABAB ได้เมื่อวรรคสั้น ≤ 6 พยางค์ แต่ห้ามลงท้ายด้วยคำเดิมซ้ำ)',
    JSON.stringify(sectionsToFix),
    '',
    'คงความหมายเดิม รักษา sectionId และ sectionName เดิม รวมถึงจำนวนบรรทัดของแต่ละท่อนไว้ให้ครบตรงตามจำนวนอินพุต แล้วตอบกลับมาในรูปแบบ JSON array `polishedSections`',
  ].join('\n');
}

const NORMALIZED_AUDIO_MIME_MAP = {
  'audio/wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/mp3': 'audio/mp3',
  'audio/mpeg': 'audio/mpeg',
  'audio/mp4': 'audio/m4a',
  'audio/x-m4a': 'audio/m4a',
  'audio/m4a': 'audio/m4a',
  'audio/aac': 'audio/aac',
  'audio/ogg': 'audio/ogg',
  'audio/opus': 'audio/opus',
  'audio/flac': 'audio/flac',
  'audio/aiff': 'audio/aiff',
  'audio/x-aiff': 'audio/aiff',
  'audio/l16': 'audio/l16',
  'audio/alaw': 'audio/alaw',
  'audio/mulaw': 'audio/mulaw',
  'audio/webm': 'audio/webm',
} as const;

export type NormalizedAudioMime =
  (typeof NORMALIZED_AUDIO_MIME_MAP)[keyof typeof NORMALIZED_AUDIO_MIME_MAP];

/**
 * แปลงและตรวจสอบ MIME Type ของไฟล์เสียงจาก Browser/Uploader ให้ตรงกับ AudioContentMimeType ของ Gemini API
 * เช่น "audio/webm;codecs=opus" -> "audio/webm", "audio/mp4" -> "audio/m4a"
 */
export function normalizeAudioMimeType(rawMime: string): NormalizedAudioMime | null {
  if (!rawMime || typeof rawMime !== 'string') return null;
  const baseMime = rawMime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (NORMALIZED_AUDIO_MIME_MAP as Record<string, NormalizedAudioMime | undefined>)[baseMime] ?? null;
}

export interface HumToSongPromptInput {
  stylePreset?: string;
  vocalProfile?: string;
  language: 'th' | 'en';
  durationSec: number;
  transcribedHint?: string;
  thaiGenre?: ThaiSongGenre;
  songwriterStyle?: ThaiSongwriterStyle;
  lyricDensity?: LyricDensityMode;
}

/** System Prompt สำหรับระบบ Hum-to-Song Audio Transcription (Phase 5C) */
export function buildHumToSongSystemPrompt(options?: {
  thaiGenre?: ThaiSongGenre;
  songwriterStyle?: ThaiSongwriterStyle;
  lyricDensity?: LyricDensityMode;
  bpm?: number;
  timeSignature?: TimeSignature;
}): string {
  const budget = getSyllableBudgetForBpm(options?.bpm ?? 84, options?.timeSignature ?? '4/4', {
    sectionType: 'verse',
    thaiGenre: options?.thaiGenre,
    songwriterStyle: options?.songwriterStyle,
    lyricDensity: options?.lyricDensity,
  });

  return [
    'คุณคือ "AI Melodic Transcriber & Acoustic Arranger" มืออาชีพ',
    'วิเคราะห์ไฟล์เสียงฮัมทำนองหรือเสียงร้องไกด์ของผู้ใช้ เพื่อถอดเป็น BPM จริง (55-160), อัตราจังหวะ (timeSignature: 4/4, 3/4 หรือ 6/8), คีย์เพลง (baseKey), ทางคอร์ดที่รับกับทำนอง, และโน้ตเมโลดี้ (MIDI steps) ที่วางบน Mini Piano Roll ได้ทันที',
    'หลักปฏิบัติ:',
    '1. จับชีพจรจังหวะและการเน้นคำ (pulse & downbeat) จากเสียงฮัมจริงก่อนเลือก BPM และ timeSignature',
    '2. เลือกคอร์ด (chords เช่น ["C"] หรือ ["Am", "F"]) ในแต่ละห้องให้รองรับโน้ตเด่นในจังหวะตก (beat 1 & 3) ของเสียงฮัม และจับง่ายบนกีตาร์โปร่ง',
    `3. โน้ต melodyNotes ใช้ค่า midiPitch (48-84), step (0-15 สำหรับ 4/4 และ 0-11 สำหรับ 3/4 หรือ 6/8) และ durationSteps (1-16) โดยเว้นช่องหายใจท้ายห้องอย่างน้อย ${budget.restSteps} steps เสมอ`,
    '4. หากผู้ใช้ฮัมเป็นคำ/เนื้อร้อง ให้นำไปเรียบเรียงใน transcribedLyrics และกระจายลงในท่อนเพลง; หากฮัมไม่มีคำ (ฮือ/ลา) ให้สร้างเนื้อร้องไทยที่สละสลวยตรงจังหวะพยางค์ที่ฮัมไว้',
    '5. ระบุความแม่นยำใน confidenceNote อย่างซื่อสัตย์ หากเสียงสั้นหรือมีเสียงรบกวน ให้จัดวางเป็นโครงร่างอะคูสติกที่สะอาดและร้องตามง่าย',
    `6. กฎความกระชับ (Singable Pacing): คุมเนื้อร้องแต่ละห้องในช่วง ${budget.min}-${budget.max} พยางค์ (~${budget.barDurationSec} วิ/ห้อง · เผื่อลมหายใจท้ายห้อง ${budget.restSteps} steps · ใช้ช่องว่างคู่ "  " คั่นกลางวรรคหากแบ่ง 2 วลี)`,
  ].join('\n');
}

/** สร้าง User Prompt สำหรับ Hum-to-Song API */
export function buildHumToSongUserPrompt(input: HumToSongPromptInput): string {
  const targetLang = input.language === 'en' ? 'English' : 'Thai (ภาษาไทยที่เป็นธรรมชาติ)';
  const budget = getSyllableBudgetForBpm(84, '4/4', {
    sectionType: 'verse',
    thaiGenre: input.thaiGenre,
    songwriterStyle: input.songwriterStyle,
    lyricDensity: input.lyricDensity,
  });

  return [
    `กรุณาฟังเสียงฮัมความยาวประมาณ ${input.durationSec.toFixed(1)} วินาทีที่แนบมานี้ แล้วสร้างโครงเพลงเดโมที่สมบูรณ์ตาม JSON Schema`,
    `• สไตล์อะคูสติกที่ต้องการ: ${input.stylePreset || 'warm-acoustic'}`,
    `• ย่านเสียงนักร้อง: ${input.vocalProfile || 'neutral'}`,
    `• ภาษาของเนื้อเพลง: ${targetLang}`,
    input.transcribedHint?.trim()
      ? `• ข้อความที่ถอดเสียงเบื้องต้น (อ้างอิงร่วมกับเสียงจริง): "${input.transcribedHint.trim()}"`
      : '• ถอดเสียงร้องหรือจังหวะพยางค์จากไฟล์เสียงโดยตรง',
    `สร้าง 2 ถึง 5 ท่อน (sections เช่น Verse 1 และ Chorus) แต่ละท่อนมี 4 ห้อง (bars) คุมเนื้อร้อง ${budget.min}-${budget.max} พยางค์/ห้อง พร้อม melodyNotes ที่สะท้อนแนวทำนองที่ฮัมจริงและเว้นหายใจท้ายห้อง ≥ ${budget.restSteps} steps`,
  ].join('\n');
}

/** Strict JSON Schema สำหรับ `/api/advance/lyrics` ผ่าน @google/genai Interactions API */
export const LYRICS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'Dynamic 2-to-8 bar Thai songwriter lyric suggestions with rhyme notes and chord recommendations',
  properties: {
    lines: {
      type: 'array',
      description: 'Thai lyric lines matching the requested section barCount (2 to 8 bars)',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 8,
    },
    rhymeNotes: {
      type: 'array',
      description: 'Short Thai notes explaining end-rhyme couplings and phonology choices used',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 4,
    },
    suggestedChords: {
      type: 'array',
      description: 'Standard chord symbols matching the section bars and mood',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 8,
    },
  },
  required: ['lines', 'rhymeNotes', 'suggestedChords'],
};

/** Strict JSON Schema สำหรับ `/api/advance/director` ผ่าน @google/genai Interactions API */
export const DIRECTOR_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'Producer arrangement patch for SongProject',
  properties: {
    bpm: { type: 'integer', description: 'Tempo in BPM (40-220)' },
    baseKey: { type: 'string', description: 'Musical key such as C, G, Am, Dm, F#m' },
    timeSignature: { type: 'string', enum: ['4/4', '3/4', '6/8'] },
    guitarModel: {
      type: 'string',
      enum: ['classical-nylon', 'dreadnought-steel', 'ovation-roundback', 'gibson-les-paul'],
    },
    ambience3D: {
      type: 'string',
      enum: ['living-room', 'wood-studio', 'unplugged-hall'],
    },
    sectionPatches: {
      type: 'array',
      description: 'Up to 10 section arrangement patches',
      items: {
        type: 'object',
        properties: {
          sectionId: { type: 'string' },
          sectionType: {
            type: 'string',
            enum: ['intro', 'verse', 'pre-chorus', 'chorus', 'solo', 'bridge', 'outro'],
          },
          intensity: { type: 'string', enum: ['low', 'medium', 'high'] },
          guitarRhythm: { type: 'boolean' },
          guitarLead: { type: 'boolean' },
          bass: { type: 'boolean' },
          piano: { type: 'boolean' },
          drums: { type: 'boolean' },
          guitarRhythmStyle: {
            type: 'string',
            enum: ['campfire-strum', 'soft-strum', 'fingerpicking', 'lukthung-bounce', 'rock-power'],
          },
          guitarLeadStyle: {
            type: 'string',
            enum: ['melodic-solo', 'riff-fills', 'soft-arpeggio'],
          },
          guitarLeadDrive: {
            type: 'string',
            enum: ['clean', 'crunch', 'overdrive', 'distortion', 'fuzz'],
          },
          bassStyle: {
            type: 'string',
            enum: ['root-fifth', 'warm-sustain', 'lukthung-groove', 'rnb-syncopated'],
          },
          pianoStyle: {
            type: 'string',
            enum: ['warm-pad', 'gentle-arpeggio', 'rnb-neo-chord', 'rock-organ-pad'],
          },
          drumsStyle: {
            type: 'string',
            enum: ['off', 'shaker-cajon', 'simple-kit', 'lukthung-3cha', 'rnb-pocket', 'rock-drive'],
          },
          guitarRhythmVolume: { type: 'integer', description: 'Volume 0-100' },
          guitarLeadVolume: { type: 'integer', description: 'Volume 0-100' },
          bassVolume: { type: 'integer', description: 'Volume 0-100' },
          pianoVolume: { type: 'integer', description: 'Volume 0-100' },
          drumsVolume: { type: 'integer', description: 'Volume 0-100' },
          chords: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    summaryNotes: {
      type: 'array',
      description: 'Concise Thai producer summary bullets explaining what changed (1-6 items)',
      items: { type: 'string' },
    },
  },
  required: ['summaryNotes'],
};

/** Schema สำหรับ `/api/advance/lyrics` แบบลึก (`mode: 'deep'`) พร้อมเมโลดี้ไกด์รายห้อง */
export const LYRICS_DEEP_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: '2-to-8 bar lyrics with rhyme explanations, chords, and per-bar melody guide notes',
  properties: {
    lines: {
      type: 'array',
      description: 'Lyric lines matching section barCount (2-8 bars)',
      items: { type: 'string' },
    },
    rhymeNotes: {
      type: 'array',
      description: '1 to 4 concise Thai notes explaining rhyme couplings',
      items: { type: 'string' },
    },
    suggestedChords: {
      type: 'array',
      description: 'Chord symbols aligned with lyric bars',
      items: { type: 'string' },
    },
    melodyNotesPerBar: {
      type: 'array',
      description: 'Guide melody note groups aligned to each lyric bar',
      items: {
        type: 'array',
        description: 'Up to 12 melody notes for this bar',
        items: {
          type: 'object',
          properties: {
            step: { type: 'integer', description: 'Step index 0-15' },
            midiPitch: { type: 'integer', description: 'MIDI pitch 48-84' },
            durationSteps: { type: 'integer', description: 'Duration steps 1-16' },
          },
          required: ['step', 'midiPitch', 'durationSteps'],
        },
      },
    },
  },
  required: ['lines', 'rhymeNotes', 'suggestedChords', 'melodyNotesPerBar'],
};

/** Schema สำหรับ `/api/advance/lyrics` โหมด Single-Bar 3 Variations (`singleBarIndex`) */
export const SINGLE_BAR_VARIATIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: '3 distinct Thai lyric variations for a single bar fitting chord mood, syllable budget, and surrounding rhyme chain',
  properties: {
    variations: {
      type: 'array',
      description: 'Exactly 3 distinct lyric line options for the target bar',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    },
    rhymeNotes: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 3,
    },
    tip: { type: 'string' },
  },
  required: ['variations', 'rhymeNotes', 'tip'],
};

/** Schema สำหรับ `/api/advance/architect` (Easy Mode เสกทั้งเพลง 4 Credits) */
export const ARCHITECT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'Complete structured acoustic/pop SongProject starter generated by AI Architect',
  properties: {
    title: { type: 'string' },
    bpm: { type: 'integer', description: 'Tempo in BPM (55-160)' },
    baseKey: { type: 'string' },
    capoFret: { type: 'integer', description: 'Capo fret (0-7)' },
    timeSignature: { type: 'string', enum: ['4/4', '3/4', '6/8'] },
    guitarModel: {
      type: 'string',
      enum: ['classical-nylon', 'dreadnought-steel', 'ovation-roundback', 'gibson-les-paul'],
    },
    stringGauge: { type: 'string', enum: ['standard-010', 'heavy-012'] },
    ambience3D: {
      type: 'string',
      enum: ['living-room', 'wood-studio', 'unplugged-hall'],
    },
    storyBlueprint: {
      type: 'object',
      description: 'Structural story distillation and scene-by-scene beat plan generated BEFORE sections so narrative spreads cleanly across sections',
      properties: {
        coreTheme: {
          type: 'string',
          description: 'Single-sentence core emotional theme distilled from the user story brief',
        },
        emotionalArcSummary: {
          type: 'string',
          description: 'Concise progression summary from Intro to Outro',
        },
        sectionBeats: {
          type: 'array',
          description: 'Ordered narrative beat allocation across sections',
          items: {
            type: 'object',
            properties: {
              sectionType: { type: 'string' },
              beatGoal: { type: 'string' },
              imageryKeywords: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['sectionType', 'beatGoal'],
          },
        },
      },
      required: ['coreTheme', 'emotionalArcSummary'],
    },
    sections: {
      type: 'array',
      description: '3 to 9 ordered song sections',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['intro', 'verse', 'pre-chorus', 'chorus', 'solo', 'bridge', 'outro'],
          },
          intensity: { type: 'string', enum: ['low', 'medium', 'high'] },
          instruments: {
            type: 'object',
            properties: {
              guitarRhythm: { type: 'boolean' },
              guitarLead: { type: 'boolean' },
              bass: { type: 'boolean' },
              piano: { type: 'boolean' },
              drums: { type: 'boolean' },
          guitarRhythmStyle: {
                type: 'string',
                enum: [
                  'campfire-strum',
                  'soft-strum',
                  'fingerpicking',
                  'lukthung-bounce',
                  'rock-power',
                ],
              },
              bassStyle: {
                type: 'string',
                enum: ['root-fifth', 'warm-sustain', 'lukthung-groove', 'rnb-syncopated'],
              },
              pianoStyle: {
                type: 'string',
                enum: ['warm-pad', 'gentle-arpeggio', 'rnb-neo-chord', 'rock-organ-pad'],
              },
              drumsStyle: {
                type: 'string',
                enum: [
                  'off',
                  'shaker-cajon',
                  'simple-kit',
                  'lukthung-3cha',
                  'rnb-pocket',
                  'rock-drive',
                ],
              },
            },
          },
          bars: {
            type: 'array',
            description: '2 to 4 bars per section',
            items: {
              type: 'object',
              properties: {
                chords: {
                  type: 'array',
                  description: '1 to 2 chord symbols for this bar',
                  items: { type: 'string' },
                },
                playStyle: { type: 'string', enum: ['normal', 'let-ring', 'break'] },
                lyrics: { type: 'string' },
                melodyNotes: {
                  type: 'array',
                  description: 'Optional melody guide notes array (leave empty [] for fast generation; engine synthesizes chord- and tone-aligned notes automatically)',
                  items: {
                    type: 'object',
                    properties: {
                      step: { type: 'integer', description: 'Step index 0-15' },
                      midiPitch: { type: 'integer', description: 'MIDI pitch 48-84' },
                      durationSteps: { type: 'integer', description: 'Duration steps 1-16' },
                    },
                    required: ['step', 'midiPitch', 'durationSteps'],
                  },
                },
              },
              required: ['chords', 'lyrics'],
            },
          },
        },
        required: ['type', 'intensity', 'bars'],
      },
    },
    producerNotes: {
      type: 'array',
      description: 'Up to 4 short producer notes in Thai',
      items: { type: 'string' },
    },
  },
  required: ['title', 'bpm', 'baseKey', 'sections'],
};

/** Schema สำหรับรอบขัดเกลาสัมผัสภาษาไทยสั้นๆ */
export const RHYME_POLISH_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    polishedSections: {
      type: 'array',
      description: 'Polished sections preserving original section ids, names and bar line count',
      items: {
        type: 'object',
        properties: {
          sectionId: { type: 'string' },
          sectionName: { type: 'string' },
          lines: { type: 'array', items: { type: 'string' } },
        },
        required: ['sectionName', 'lines'],
      },
    },
  },
  required: ['polishedSections'],
};

/** Schema สำหรับ Hum-to-Song API (Phase 5C) — เข้ากับ sanitizeArchitectSongProject และ Mini Piano Roll ทันที */
export const HUM_TO_SONG_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    bpm: { type: 'integer' },
    baseKey: { type: 'string' },
    capoFret: { type: 'integer' },
    timeSignature: { type: 'string', enum: ['4/4', '3/4', '6/8'] },
    transcribedLyrics: { type: 'string' },
    confidenceNote: { type: 'string' },
    sections: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro'] },
          name: { type: 'string' },
          intensity: { type: 'string', enum: ['low', 'medium', 'high'] },
          bars: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                chords: { type: 'array', items: { type: 'string' } },
                lyrics: { type: 'string' },
                playStyle: { type: 'string', enum: ['normal', 'let-ring', 'break'] },
                melodyNotes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      step: { type: 'integer' },
                      midiPitch: { type: 'integer' },
                      durationSteps: { type: 'integer' },
                    },
                    required: ['step', 'midiPitch', 'durationSteps'],
                  },
                },
              },
              required: ['chords', 'lyrics'],
            },
          },
        },
        required: ['type', 'name', 'bars'],
      },
    },
    producerNotes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['title', 'bpm', 'baseKey', 'timeSignature', 'transcribedLyrics', 'confidenceNote', 'sections', 'producerNotes'],
};

export interface LyriaSectionBlueprintItem {
  name: string;
  type: SectionType;
  intensity: SectionIntensity;
  instrumentsSummary: string;
  chords: string[];
  lyrics: string[];
}

export interface LyriaReferencePromptInput {
  title?: string;
  bpm: number;
  baseKey: string;
  timeSignature: TimeSignature;
  guitarModel?: string;
  stringGauge?: string;
  capoFret?: number;
  ambience3D?: string;
  chordsSample?: string[];
  lyricsSample?: string[];
  userNotes?: string;
  language?: 'th' | 'en';
  instrumental?: boolean;
  thaiGenre?: ThaiSongGenre;
  lyricEra?: ThaiLyricEra;
  lyricDialect?: ThaiLyricDialect;
  songwriterStyle?: ThaiSongwriterStyle;
  emotionalResolution?: ThaiEmotionalResolution;
  vocalGender?: 'female' | 'male' | 'neutral';
  fullSectionMap?: LyriaSectionBlueprintItem[];
  melodyContourHint?: string;
}

export interface FullDemoBlueprintSummary {
  totalBars: number;
  sectionCount: number;
  lyricLinesCount: number;
  melodyBarsCount: number;
}

export interface FullDemoMasterPromptResult {
  promptUsed: string;
  blueprintSummary: FullDemoBlueprintSummary;
}

function formatLyriaSectionTag(type: SectionType, ordinalIndex?: number): string {
  switch (type) {
    case 'intro':
      return 'Intro';
    case 'verse':
      return ordinalIndex && ordinalIndex > 1 ? `Verse ${ordinalIndex}` : 'Verse';
    case 'pre-chorus':
      return 'Pre-Chorus';
    case 'chorus':
      return ordinalIndex && ordinalIndex > 1 ? `Chorus ${ordinalIndex}` : 'Chorus';
    case 'solo':
      return 'Guitar Solo';
    case 'bridge':
      return 'Bridge';
    case 'outro':
      return 'Outro';
    default:
      return 'Verse';
  }
}

function formatDriveTitle(drive?: string): string {
  switch (drive) {
    case 'overdrive':
      return 'Overdrive';
    case 'distortion':
      return 'Distortion';
    case 'fuzz':
      return 'Fuzz';
    case 'crunch':
      return 'Crunch';
    default:
      return 'Clean';
  }
}

function formatDrumStyleLabel(style?: string): string {
  switch (style) {
    case 'lukthung-3cha':
      return 'Thai Luk Thung Three-Cha';
    case 'rnb-pocket':
      return 'R&B Pocket';
    case 'rock-drive':
      return 'Rock Drive';
    case 'simple-kit':
      return 'Acoustic Studio Kit';
    case 'shaker-cajon':
      return 'Shaker & Cajon';
    default:
      return 'Acoustic Drums';
  }
}

/** สร้าง Prompt สำหรับ Lyria 3.5 (`lyria-3.5`) เพื่อสังเคราะห์แทร็กดนตรีอ้างอิงเทียบเสียง */
export function buildLyriaReferencePrompt(input: LyriaReferencePromptInput): string {
  const chordStr =
    input.chordsSample && input.chordsSample.length > 0
      ? input.chordsSample.slice(0, 8).join(' -> ')
      : 'C -> G -> Am -> F';
  const lyricExcerpt = (input.lyricsSample || [])
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' / ');

  const genreProfile = THAI_GENRE_PROFILES.find((g) => g.id === input.thaiGenre);
  const genreDescriptor = genreProfile ? genreProfile.sunoTags : input.instrumental ? 'instrumental acoustic' : 'Thai acoustic pop';
  const eraProfile = THAI_ERA_PROFILES.find((e) => e.id === input.lyricEra);
  const dialectProfile = THAI_DIALECT_PROFILES.find((d) => d.id === input.lyricDialect);
  const writerProfile = SONGWRITER_STYLE_PROFILES.find((s) => s.id === input.songwriterStyle);
  const resolutionProfile = EMOTIONAL_RESOLUTION_PROFILES.find((r) => r.id === input.emotionalResolution);

  const guitarLabel =
    input.guitarModel === 'classical-nylon'
      ? 'classical nylon-string acoustic guitar'
      : input.guitarModel === 'gibson-les-paul'
        ? 'warm vintage Les Paul electric & acoustic guitar'
        : input.guitarModel === 'ovation-roundback'
          ? 'bright roundback acoustic guitar'
          : 'warm dreadnought steel-string acoustic guitar';

  const gaugeNote =
    input.stringGauge === 'heavy-012' ? ' (.012 heavy strings)' : input.stringGauge ? ' (.010 standard strings)' : '';

  const ambienceLabel =
    input.ambience3D === 'unplugged-hall'
      ? 'spacious unplugged hall reverb'
      : input.ambience3D === 'living-room'
        ? 'intimate living room acoustic warmth'
        : 'warm wood studio acoustic room';

  const vocalDesc =
    input.vocalGender === 'female'
      ? 'clear warm female lead vocal'
      : input.vocalGender === 'male'
        ? 'expressive male lead vocal'
        : 'warm heartfelt Thai lead vocal';

  const styleExtras: string[] = [];
  if (eraProfile?.sunoHint) {
    styleExtras.push(`Era: ${eraProfile.sunoHint}`);
  }
  if (dialectProfile && dialectProfile.id !== 'standard') {
    styleExtras.push(`Regional Flavor: ${dialectProfile.label}`);
  }
  if (writerProfile && writerProfile.id !== 'none') {
    styleExtras.push(`Songwriting Style: ${writerProfile.label} (${writerProfile.id})`);
  }
  if (resolutionProfile && resolutionProfile.id !== 'auto') {
    styleExtras.push(`Emotional Arc: ${resolutionProfile.label}`);
  }

  const capoNote = input.capoFret && input.capoFret > 0 ? ` (Capo fret ${input.capoFret} acoustic voicing)` : '';
  const safeBpm = Number.isFinite(input.bpm) ? Math.max(40, Math.min(220, Math.round(input.bpm))) : 84;
  const safeTimeSig = input.timeSignature || '4/4';
  const safeKey = input.baseKey?.trim() || 'C';

  const parts = [
    `Produce a studio-quality ${input.instrumental ? 'instrumental' : 'full vocal'} track in style: ${genreDescriptor} (${input.title || 'Song Demo'}).`,
    `Tempo: ${safeBpm} BPM in ${safeTimeSig}, Key of ${safeKey}${capoNote}.`,
    `Lead instrumentation: ${guitarLabel}${gaugeNote}, warm bass guitar, natural percussion/drums, supportive keys/piano, recorded in ${ambienceLabel}.`,
    ...(styleExtras.length > 0 ? [`Creative Direction: ${styleExtras.join('; ')}.`] : []),
  ];

  if (input.fullSectionMap && input.fullSectionMap.length > 0) {
    const typeCounts: Partial<Record<SectionType, number>> = {};
    const mapLines: string[] = [];
    const lyricBlocks: string[] = [];

    for (const sec of input.fullSectionMap) {
      typeCounts[sec.type] = (typeCounts[sec.type] ?? 0) + 1;
      const tag = formatLyriaSectionTag(sec.type, typeCounts[sec.type]);
      const chordsLine = sec.chords.length > 0 ? sec.chords.join(' | ') : chordStr;
      mapLines.push(
        `- [${tag}] "${sec.name}" (${sec.chords.length} bars, intensity=${sec.intensity}, instruments=${sec.instrumentsSummary || 'Full Band'}): Chords: ${chordsLine}`
      );

      if (!input.instrumental) {
        const cleanLyrics = sec.lyrics.map((l) => l.trim()).filter(Boolean);
        if (cleanLyrics.length > 0) {
          lyricBlocks.push(`[${tag}]\n${cleanLyrics.join('\n')}`);
        } else if (sec.type === 'intro' || sec.type === 'solo' || sec.type === 'outro') {
          lyricBlocks.push(`[${tag}]\n[Instrumental]`);
        }
      }
    }

    parts.push(`Section Map:\n${mapLines.join('\n')}`);
    if (input.melodyContourHint?.trim()) {
      parts.push(`Melody Contour Hint: ${input.melodyContourHint.trim()}`);
    }
    if (input.userNotes?.trim()) {
      parts.push(`Producer direction: ${input.userNotes.trim().slice(0, 300)}.`);
    }
    if (input.instrumental) {
      parts.push('Instrumental only — no vocals. Follow the exact section dynamics, instruments, and chord transitions above.');
    } else {
      parts.push(
        `Vocal Performance: Sing expressive ${input.language === 'en' ? 'English' : 'Thai'} lead vocals with ${vocalDesc} following the exact lyrics below.`
      );
      if (lyricBlocks.length > 0) {
        parts.push(`Lyrics:\n${lyricBlocks.join('\n\n')}`);
      } else if (lyricExcerpt) {
        parts.push(`Lyrics:\n[Verse]\n${lyricExcerpt}`);
      }
    }
    return parts.join('\n\n');
  }

  parts.push(`Chord progression feel: ${chordStr}.`);
  if (!input.instrumental) {
    parts.push(
      `Sing full expressive ${input.language === 'en' ? 'English' : 'Thai'} vocals with ${vocalDesc} following these lyrics: "${lyricExcerpt || 'ฮัมทำนองอบอุ่นตามทางคอร์ด'}".`
    );
  }
  if (input.userNotes?.trim()) {
    parts.push(`Producer direction: ${input.userNotes.trim().slice(0, 180)}.`);
  }

  return parts.join(' ');
}

/**
 * Phase 7D: สกัด Full Demo Blueprint จากโปรเจกต์ทั้งเพลง (`SongProject`)
 * เพื่อส่งให้ `lyria-3.5` ต่อยอดเดโมเป็นมาสเตอร์คุณภาพห้องอัดโดยยึดคอร์ด เนื้อร้อง ท่อนเพลง และสไตล์วงจริง
 */
export function buildFullDemoMasterPrompt(
  song: SongProject,
  options?: {
    userNotes?: string;
    instrumental?: boolean;
    vocalGender?: 'female' | 'male' | 'neutral';
    language?: 'th' | 'en';
  }
): FullDemoMasterPromptResult {
  const sections = Array.isArray(song.sections) ? song.sections : [];
  const semitones = Number.isFinite(song.transposeSemitones) ? song.transposeSemitones : 0;
  const soundingKey = transposeChord(song.baseKey || 'C', semitones);

  let totalBars = 0;
  let lyricLinesCount = 0;
  let melodyBarsCount = 0;
  let minMidi: number | null = null;
  let maxMidi: number | null = null;
  let chorusMaxMidi: number | null = null;

  const fullSectionMap: LyriaSectionBlueprintItem[] = [];
  const chordsSample: string[] = [];
  const lyricsSample: string[] = [];

  for (const sec of sections) {
    const bars = Array.isArray(sec.bars) ? sec.bars : [];
    const instParts: string[] = [];
    const inst = sec.instruments;
    const rhythmStyle = inst?.guitarRhythmStyle || song.mixer?.guitarRhythm?.style || 'soft-strum';
    const leadStyle = inst?.guitarLeadStyle || song.mixer?.guitarLead?.style || 'melodic-solo';
    const leadDrive = inst?.guitarLeadDrive || song.mixer?.guitarLead?.drive || 'clean';
    const bassStyle = inst?.bassStyle || song.mixer?.bass?.style || 'root-fifth';
    const pianoStyle = inst?.pianoStyle || song.mixer?.piano?.style || 'warm-pad';
    const drumsStyle = inst?.drumsStyle || song.mixer?.drums?.style || 'simple-kit';

    if (inst?.guitarRhythm) {
      instParts.push(`Rhythm Guitar (${rhythmStyle})`);
    }
    if (inst?.guitarLead) {
      const leadGuitarName =
        (song.mixer?.guitarLead?.model || song.guitarModel) === 'gibson-les-paul'
          ? 'Gibson Les Paul'
          : 'Lead Guitar';
      instParts.push(`Solo: ${leadGuitarName} ${formatDriveTitle(leadDrive)} (${leadStyle})`);
    }
    if (inst?.bass) {
      instParts.push(`Bass (${bassStyle})`);
    }
    if (inst?.piano) {
      instParts.push(`Piano (${pianoStyle})`);
    }
    if (inst?.drums && drumsStyle !== 'off') {
      instParts.push(`${formatDrumStyleLabel(drumsStyle)} Drums`);
    }

    const secChords: string[] = [];
    const secLyrics: string[] = [];

    for (const bar of bars) {
      totalBars += 1;
      const rawC1 = bar.chords?.[0] || song.baseKey || 'C';
      const c1 = transposeChord(rawC1, semitones);
      const c2 =
        bar.chordsPerBar === 2 && bar.chords?.[1]
          ? transposeChord(bar.chords[1], semitones)
          : null;
      const barChordLabel = c2 ? `${c1} -> ${c2}` : c1;
      const playNote =
        bar.playStyle && bar.playStyle !== 'normal' ? ` (${bar.playStyle})` : '';
      secChords.push(`${barChordLabel}${playNote}`);
      if (chordsSample.length < 8) chordsSample.push(c1);

      const lyricText = (bar.lyrics || '').trim();
      secLyrics.push(lyricText);
      if (lyricText.length > 0) {
        lyricLinesCount += 1;
        if (lyricsSample.length < 4) lyricsSample.push(lyricText);
      }

      if (Array.isArray(bar.melodyNotes) && bar.melodyNotes.length > 0) {
        melodyBarsCount += 1;
        for (const note of bar.melodyNotes) {
          if (typeof note.midiPitch === 'number' && Number.isFinite(note.midiPitch)) {
            if (minMidi === null || note.midiPitch < minMidi) minMidi = note.midiPitch;
            if (maxMidi === null || note.midiPitch > maxMidi) maxMidi = note.midiPitch;
            if (sec.type === 'chorus' && (chorusMaxMidi === null || note.midiPitch > chorusMaxMidi)) {
              chorusMaxMidi = note.midiPitch;
            }
          }
        }
      }
    }

    fullSectionMap.push({
      name: sec.name || sec.type,
      type: sec.type,
      intensity: sec.intensity,
      instrumentsSummary: instParts.length > 0 ? instParts.join(' + ') : 'Warm Acoustic Ensemble',
      chords: secChords,
      lyrics: secLyrics,
    });
  }

  const melodyContourHint =
    minMidi !== null && maxMidi !== null
      ? `Vocal guide range ${midiToNoteName(minMidi)}–${midiToNoteName(maxMidi)} across ${melodyBarsCount} melody bars${
          chorusMaxMidi !== null ? `, Chorus peak at ${midiToNoteName(chorusMaxMidi)}` : ''
        }.`
      : 'Follow natural Thai vocal inflection peaking on Chorus sections.';

  const promptUsed = buildLyriaReferencePrompt({
    title: song.title || 'Demo Song',
    bpm: Number.isFinite(song.bpm) ? Math.max(40, Math.min(220, Math.round(song.bpm))) : 84,
    baseKey: soundingKey,
    timeSignature: song.timeSignature || '4/4',
    guitarModel: song.guitarModel,
    stringGauge: song.stringGauge,
    capoFret: song.capoFret,
    ambience3D: song.ambience3D,
    chordsSample,
    lyricsSample,
    userNotes: options?.userNotes,
    language: options?.language ?? 'th',
    instrumental: options?.instrumental,
    thaiGenre: song.thaiGenre,
    lyricEra: song.lyricEra,
    lyricDialect: song.lyricDialect,
    songwriterStyle: song.songwriterStyle,
    emotionalResolution: song.emotionalResolution,
    vocalGender: options?.vocalGender ?? song.easyConfig?.vocalProfile ?? 'neutral',
    fullSectionMap,
    melodyContourHint,
  });

  return {
    promptUsed,
    blueprintSummary: {
      totalBars,
      sectionCount: sections.length,
      lyricLinesCount,
      melodyBarsCount,
    },
  };
}

export interface BuildTtsStyleHintInput {
  language: 'th' | 'en';
  vocalMode: 'singing-demo' | 'guide';
  bpm: number;
  thaiGenre?: string;
  targetDurationSec: number | null;
  sectionType?: string;
  baseKey?: string;
}

/** สร้างคำแนะนำจังหวะ เมโลดี้รายท่อน และน้ำเสียงให้ gemini-3.8-flash-tts ร้องกระชับไม่รัวและไม่ถอนหายใจ */
export function buildTtsCueStyleHint({
  language,
  vocalMode,
  bpm,
  thaiGenre = '',
  targetDurationSec,
  sectionType = '',
  baseKey = '',
}: BuildTtsStyleHintInput): string {
  const genreStyleNote =
    thaiGenre === 'luk-thung'
      ? 'เอื้อนลูกคอหวานซึ้งสไตล์เพลงลูกทุ่งไทย'
      : thaiGenre === 'luk-krung'
        ? 'น้ำเสียงนุ่มนวลประณีตละมุนแบบเพลงลูกกรุงคลาสสิก'
        : thaiGenre === 'thai-rock'
          ? 'น้ำเสียงหนักแน่นมีพลังสไตล์เพลงไทยร็อก'
          : thaiGenre === 'phuea-chiwit'
            ? 'น้ำเสียงจริงใจอบอุ่นเล่าเรื่องแบบเพลงเพื่อชีวิต'
            : 'น้ำเสียงไพเราะอบอุ่นเป็นธรรมชาติสไตล์ป๊อปไทย';

  const normalizedSection = sectionType.toLowerCase();
  const keyTag = baseKey ? ` (Key ${baseKey})` : '';
  const sectionContourTh =
    normalizedSection === 'chorus'
      ? `ท่อนฮุก (Chorus)${keyTag} ให้ร้องเน้นทำนองและโทนเสียงให้พุ่งขึ้น กังวาน ทรงพลัง และโดดเด่นกว่าท่อนเล่าเรื่อง`
      : normalizedSection === 'pre-chorus'
        ? `ท่อนส่ง (Pre-Chorus)${keyTag} ให้ร้องไต่ระดับอารมณ์และระดับเสียงขึ้นอย่างนุ่มนวลเพื่อส่งเข้าท่อนฮุก`
        : normalizedSection === 'bridge' || normalizedSection === 'outro'
          ? `ท่อน${normalizedSection === 'bridge' ? 'แยก (Bridge)' : 'จบ (Outro)'}${keyTag} ให้ร้องผ่อนอารมณ์ ทอดหางเสียงสระให้นุ่มลึกซึ้งกินใจ`
          : `ท่อนเล่าเรื่อง (Verse)${keyTag} ให้ร้องทำนองนุ่มนวลชัดเจนตามคีย์เพลง`;

  const sectionContourEn =
    normalizedSection === 'chorus'
      ? `For the Chorus${keyTag}, lift the vocal pitch contour higher with fuller resonant energy so the hook soars above the verse.`
      : normalizedSection === 'pre-chorus'
        ? `For the Pre-Chorus${keyTag}, build pitch and emotional tension smoothly into the upcoming Chorus.`
        : normalizedSection === 'bridge' || normalizedSection === 'outro'
          ? `For the ${normalizedSection}${keyTag}, deliver tender melodic sustain with a warm, lingering finish.`
          : `For the Verse${keyTag}, sing a warm, lyrical melody clearly centered on the key.`;

  const isCompactPacing = (targetDurationSec !== null && targetDurationSec <= 11) || bpm >= 100;
  const durationEnClause = targetDurationSec
    ? ` Fit all phrases naturally within about ${targetDurationSec} seconds total.${isCompactPacing ? ' Sing with clear, relaxed rhythmic phrasing, gentle vowel sustain at the end of each line, and a clean silent pause between lines—never rush, rapid-fire, or take audible gasping breaths.' : ' Leave clean silent gaps between lines without audible inhaling or sighing.'}`
    : '';
  const durationThClause = targetDurationSec
    ? ` จัดจังหวะการร้องให้พอดีภายในเวลาประมาณ ${targetDurationSec} วินาที${isCompactPacing ? ' ร้องเป็นทำนองเพลงที่มีจังหวะจะโคน ไม่รัวคำ ทอดหางเสียงสระท้ายวรรคให้ไพเราะ และเว้นช่องไฟเงียบสั้นๆ ระหว่างแต่ละวรรคโดยไม่สูดลมหายใจหรือถอนหายใจออกเสียง' : ' เว้นช่องไฟเงียบสั้นๆ ระหว่างบรรทัดให้เป็นจังหวะเพลง โดยไม่ถอนหายใจหรือสูดลมหายใจดังออกไมค์'}`
    : '';

  return language === 'en'
    ? vocalMode === 'singing-demo'
      ? `Sing a smooth, warm melodic acoustic vocal guide at steady ${bpm} BPM (${genreStyleNote}). ${sectionContourEn}${durationEnClause} Start singing immediately on melody with crisp phrasing, gentle vowel sustain on long notes, no spoken intro, no sighing breaths, and minimal leading silence.`
      : `Warm acoustic demo vocal phrasing guide at ${bpm} BPM. Speak clearly on rhythm without adding extra narration.`
    : vocalMode === 'singing-demo'
      ? `ร้องขับร้องทำนองเพลงจริง (Melodic Singing) ด้วย${genreStyleNote} ตามจังหวะคงที่ ${bpm} BPM ${sectionContourTh}${durationThClause} ให้ขึ้นเสียงทันทีไม่ต้องเว้นเงียบหรือเกริ่นนำ ร้องเป็นทำนองเพลงชัดเจน ลากหางเสียงคำเป็นให้นุ่มนวลเหมือนนักร้องเดโมจริง ห้ามถอนหายใจดังคั่นวรรค และไม่อ่านออกเสียงคำอธิบายเพิ่มเติม`
      : `เสียงไกด์แบ่งวรรคร้องอุ่นๆ ตามจังหวะเพลงประมาณ ${bpm} BPM (${genreStyleNote}) อ่านชัดถ้อยชัดคำและเว้นจังหวะตามประโยคโดยไม่พูดอธิบายเพิ่ม`;
}

/** Schema สำหรับ `/api/advance/cohesive-polish` (Whole-Song Cohesive Polish) */
export const COHESIVE_POLISH_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      description: 'Polished sections preserving section ids and order',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          bars: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                lyrics: { type: 'string' },
                chords: {
                  type: 'array',
                  items: { type: 'string' },
                },
                playStyle: { type: 'string', enum: ['normal', 'let-ring', 'break'] },
              },
              required: ['lyrics', 'chords'],
            },
          },
        },
        required: ['id', 'bars'],
      },
    },
    producerSummary: { type: 'string' },
  },
  required: ['sections'],
};

/** System Prompt สำหรับเกลาและเชื่อมโยงทั้งเพลง (Whole-Song Cohesive Polish) */
export function buildCohesivePolishSystemPrompt(options?: {
  thaiGenre?: ThaiSongGenre;
  songwriterStyle?: ThaiSongwriterStyle;
  bpm?: number;
  timeSignature?: TimeSignature;
  lyricDensity?: LyricDensityMode;
}): string {
  const genreNote = options?.thaiGenre ? ` ในแนวเพลง ${options.thaiGenre}` : '';
  const tempoNote = options?.bpm ? ` ที่ความเร็ว ${options.bpm} BPM` : '';
  const budget = getSyllableBudgetForBpm(options?.bpm ?? 85, options?.timeSignature ?? '4/4', {
    sectionType: 'verse',
    songwriterStyle: options?.songwriterStyle,
    thaiGenre: options?.thaiGenre,
    lyricDensity: options?.lyricDensity,
  });

  return [
    `คุณคือ "Chief Executive Music Producer & Whole-Song Polish Editor" เชี่ยวชาญการเกลาคำร้อง เชื่อมสัมผัสภาษาไทย และทางคอร์ดให้เพลงทั้งเพลงฟังดูเป็นเนื้อเดียวกันอย่างกลมกล่อม${genreNote}${tempoNote}`,
    '',
    'กฎสำคัญในการเกลาเชื่อมเพลง (Whole-Song Cohesive Polish):',
    '1. ท่อนที่ติดล็อก (Locked Sections): ห้ามแก้ไขเนื้อร้อง คอร์ด หรือจำนวนห้องในท่อนเหล่านี้เด็ดขาด ให้ใช้ท่อนเหล่านี้เป็นแกนหลักอ้างอิงอารมณ์ คีย์ และสัมผัสของเพลง',
    '2. สัดส่วนการคงเนื้อร้องเดิม (Lyrics Retention):',
    '   - 100%: คงเนื้อร้องเดิมไว้ทุกคำ',
    '   - 75%: คงเนื้อหาและคำร้องเดิมราว 75% ปรับเฉพาะคำส่งสัมผัส คำลงท้าย หรือเกลี่ยพยางค์ให้ลื่นไหลและเชื่อมต่ออารมณ์กับท่อนก่อนหน้าและถัดไปอย่างแนบเนียน',
    '   - 40%: คงเค้าโครงไอเดียเดิมราว 40% สามารถรีไรต์คำร้องเพื่อยกระดับสัมผัสภาษาไทย สัมผัสสระ-อักษร และส่งพลังดนตรีได้อย่างอิสระ แต่คงอารมณ์หลักของเพลงไว้',
    '3. สัดส่วนการคงคอร์ดเดิม (Chords Retention):',
    '   - 100%: คงคอร์ดเดิมไว้ทุกห้อง',
    '   - 70%: คงโครงคอร์ดหลักเดิมราว 70% ปรับเฉพาะคอร์ดส่ง/คอร์ดเปลี่ยนผ่าน (Passing Chords / Cadence) เพื่อให้เชื่อมต่อท่อนได้สมูทขึ้น',
    '   - 30%: ปรับทางคอร์ดให้มีความหลากหลาย ดึงอารมณ์และส่งต่อเข้าท่อนฮุค/ท่อนจบได้อย่างทรงพลังยิ่งขึ้น โดยยังอยู่ในคีย์ที่เหมาะสม',
    '4. ความต่อเนื่องของเรื่องราวและสัมผัสคำ (Narrative & Rhyme Flow):',
    '   - ท่อนที่เพิ่งเพิ่มเข้ามาหรือท่อนที่ไม่ได้ล็อก ต้องเชื่อมคำร้องและอารมณ์ให้ไหลลื่นต่อเนื่องกับท่อนข้างเคียง ไม่หลุดโทน',
    '   - สัมผัสคำท้ายวรรคต้องส่งถึงคำแรกๆ หรือคำท้ายของวรรคถัดไปตามหลักฉันทลักษณ์เพลงไทย',
    `5. กฎความกระชับ (Singable Pacing): รักษาจำนวนพยางค์ ${budget.min}-${budget.max} พยางค์ต่อห้อง (~${budget.barDurationSec} วิ/ห้อง · เผื่อลมหายใจท้ายห้อง ${budget.restSteps} steps · ${budget.guidance}) ไม่เขียนยาวรัวเกินไป และเว้นจังหวะหายใจด้วยช่องว่างคู่ "  "`,
    '6. ตอบกลับเป็น JSON ตาม Schema ที่กำหนดเท่านั้น ห้ามใช้ Markdown ครอบรอบนอก',
  ].join('\n');
}

/** User Prompt สำหรับเกลาและเชื่อมโยงทั้งเพลง (Whole-Song Cohesive Polish) */
export function buildCohesivePolishUserPrompt(input: {
  song: SongProject;
  lyricsRetentionPct: 100 | 75 | 40;
  chordsRetentionPct: 100 | 70 | 30;
  lockedSectionIds: string[];
  rebalanceBand?: boolean;
}): string {
  const lockedSet = new Set(input.lockedSectionIds);
  const sectionsSummary = input.song.sections.map((sec, idx) => {
    const isLocked = lockedSet.has(sec.id);
    const barsSummary = sec.bars.map((bar, bIdx) => ({
      barIndex: bIdx + 1,
      chords: bar.chords,
      lyrics: bar.lyrics,
      playStyle: bar.playStyle,
    }));
    return {
      sectionIndex: idx + 1,
      id: sec.id,
      name: sec.name,
      type: sec.type,
      isLocked,
      bars: barsSummary,
    };
  });

  return [
    `โปรดเกลาและเชื่อมโยงเพลง "${input.song.title}" ทั้งเพลงให้เป็นอันหนึ่งอันเดียวกัน:`,
    `- คีย์เพลง: ${input.song.baseKey}, ความเร็ว: ${input.song.bpm} BPM, จังหวะ: ${input.song.timeSignature}`,
    `- สไตล์เพลง: ${input.song.thaiGenre || 'thai-pop'}, สไตล์นักแต่งเพลง: ${input.song.songwriterStyle || 'none'}`,
    `- นโยบายคงเนื้อร้องเดิม: ${input.lyricsRetentionPct}% (เกลาคำส่งสัมผัสและเชื่อมเรื่องราว)`,
    `- นโยบายคงคอร์ดเดิม: ${input.chordsRetentionPct}% (ปรับคอร์ดส่งเชื่อมท่อนตามความเหมาะสม)`,
    `- จัดบาลานซ์วงดนตรี: ${input.rebalanceBand ? 'ใช่ (ปรับระดับความแน่นให้ท่อนส่ง-ฮุค-จบต่างกันชัดเจน)' : 'คงเดิม'}`,
    '',
    'โครงสร้างท่อนและสถานะการล็อก (ห้ามแก้ท่อนที่ isLocked: true เด็ดขาด):',
    JSON.stringify(sectionsSummary, null, 2),
    '',
    'โปรดส่งกลับ JSON ที่ประกอบด้วย array `sections` ทุกท่อนตามลำดับเดิม โดยระบุ `id` ของท่อน และ `bars` ที่มี `chords`, `lyrics`, `playStyle` พร้อมสรุปสั้นๆ ใน `producerSummary`',
  ].join('\n');
}
