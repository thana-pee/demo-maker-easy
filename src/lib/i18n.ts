// Demo Maker Easy — Bilingual Internationalization (i18n) Engine
// Supports instant 🇹🇭 Thai and 🇬🇧 English toggling with localStorage persistence

export type Language = 'th' | 'en';

export interface Translations {
  // General & App Info
  appName: string;
  appShortName: string;
  appDescription: string;
  autoSaved: string;
  saveStateSaving: string;
  saveStateSaved: string;
  saveStateError: string;
  manualSaveBtn: string;
  saveCheckpointBtn: string;
  audioEngineBadge: string;
  close: string;
  cancel: string;
  confirm: string;
  save: string;
  delete: string;
  done: string;

  // Header & Transport
  mySongs: string;
  playDemo: string;
  pause: string;
  stop: string;
  countInOn: string;
  countInOff: string;
  countInBadge: string;
  barLabel: string;
  modeSongwriting: string;
  modeArranger: string;
  modeKaraoke: string;
  zenMode: string;
  zenModeHint: string;
  exportShare: string;
  timeSignature: string;
  tempo: string;
  keyLabel: string;
  capoLabel: string;
  capoNone: string;
  capoFret: string;
  soundPanelToggle: string;

  // Sound Customizer Panel
  soundPanelTitle: string;
  guitarModel: string;
  stringGauge: string;
  ambience3D: string;
  vocalLatency: string;
  vocalLatencyHint: string;
  mixerTitle: string;
  trackRhythmGuitar: string;
  trackLeadGuitar: string;
  trackAcousticBass: string;
  trackPiano: string;
  trackDrums: string;
  trackMelody: string;
  trackVocal: string;

  // Section Builder
  addSection: string;
  addBar: string;
  duplicateSection: string;
  syllablesCount: string;
  activeInstrumentsLabel: string;
  noActiveInstruments: string;
  expandInstruments: string;
  collapseInstruments: string;
  openArrangerBtn: string;
  openArrangerHint: string;
  barOptionsBtn: string;
  songwriterTitle: string;
  songwriterSubtitle: string;
  arrangerTitle: string;
  arrangerSubtitle: string;
  chordPresets: string;
  dynamicIntensity: string;
  intensityLow: string;
  intensityMedium: string;
  intensityHigh: string;
  styleNormal: string;
  styleLetRing: string;
  styleBreak: string;
  melodyNotesBtn: string;
  vocalRecordBtn: string;
  vocalHasTrack: string;
  lyricsPlaceholder: string;
  chordsPerBar1: string;
  chordsPerBar2: string;

  // Section Types
  sectionIntro: string;
  sectionVerse: string;
  sectionPreChorus: string;
  sectionChorus: string;
  sectionSolo: string;
  sectionBridge: string;
  sectionOutro: string;

  // Karaoke Teleprompter
  karaokeHint: string;
  karaokePlayNotice: string;
  karaokeCapoNotice: string;
  karaokeFullscreenBtn: string;

  // Export & Modals
  exportTitle: string;
  lineShareBtn: string;
  lineShareCopied: string;
  midiExportBtn: string;
  mp3ExportBtn: string;
  mp3Rendering: string;
  sunoPromptBtn: string;
  jsonBackupBtn: string;

  // PWA Install & iOS
  iosInstallBanner: string;
  iosInstallTapShare: string;
  iosInstallAddHome: string;
  installAppBtn: string;

  // Phase 5B: Easy Mode & Songwriter Progress
  easyModeBtn: string;
  easyModeTitle: string;
  easyModeSubtitle: string;
  stageDraft: string;
  stageArranged: string;
  stageVocal: string;
  stageMastered: string;
  inlineAiQuick: string;
  inlineAiDeep: string;
  inlineSplitLyrics: string;

  // Phase 5C: Hum-to-Song & Vocal Guide Synth
  easyTabIdea: string;
  easyTabHum: string;
  humRecordBtn: string;
  humStopBtn: string;
  humSubmitBtn: string;
  generateGuideBtn: string;
  ttsCueBtn: string;

  // Phase 5D: Real Vocal Recording Booth
  vocalBoothTitle: string;
  vocalBoothFreeBadge: string;
  scopeFullSong: string;
  scopeSelectedSection: string;
  preRollToggle: string;
  studioMicToggle: string;
  headphoneTip: string;
  startRecBooth: string;
  stopRecBooth: string;
  fxPresetLabel: string;
  autoDuckingLabel: string;

  // Phase 9: Singable Phrasing, Lyric Density & Story Blueprint
  lyricDensityLabel: string;
  lyricDensityAiry: string;
  lyricDensityAiryDesc: string;
  lyricDensityBalanced: string;
  lyricDensityBalancedDesc: string;
  lyricDensityDense: string;
  lyricDensityDenseDesc: string;
  pacingComfortable: string;
  pacingFastWarning: string;
  pacingSyllablesPerSec: string;
  storyBriefLabel: string;
  storyBriefPlaceholder: string;
  storyStructureHintTitle: string;
  storyStructureHintBtn: string;
  storyBlueprintToggle: string;
  storyArcLabel: string;
  storyOpeningAnchor: string;
  storyHookAnchor: string;
  storyHookExact: string;
  storyHookFlexible: string;
  storyClosingAnchor: string;
  sectionAnchorLabel: string;
}

export const translations: Record<Language, Translations> = {
  th: {
    appName: 'Demo Maker Easy — สตูดิโอแต่งเพลงอะคูสติก & คาราโอเกะ',
    appShortName: 'Demo Maker',
    appDescription: 'เว็บแอปสตูดิโอแต่งเพลงอะคูสติก 3D พร้อมโหมดคาราโอเกะสำหรับ iPad และแท็บเล็ต',
    autoSaved: 'บันทึกอัตโนมัติแล้ว',
    saveStateSaving: 'รอ/กำลังบันทึก...',
    saveStateSaved: 'บันทึกแล้ว',
    saveStateError: 'บันทึกไม่สำเร็จ (พื้นที่เต็ม?)',
    manualSaveBtn: 'บันทึก',
    saveCheckpointBtn: 'ปักหมุดเวอร์ชัน',
    audioEngineBadge: '✓ 3D Acoustic Engine',
    close: 'ปิด',
    cancel: 'ยกเลิก',
    confirm: 'ยืนยัน',
    save: 'บันทึก',
    delete: 'ลบ',
    done: 'เสร็จสิ้น',

    mySongs: '📂 เพลงของฉัน',
    playDemo: 'เล่นเดโม่',
    pause: 'หยุดชั่วคราว',
    stop: '⏹ หยุด',
    countInOn: '🥁 นับเข้า: เปิด',
    countInOff: '🥁 นับเข้า: ปิด',
    countInBadge: 'นับเข้า',
    barLabel: 'ห้องที่',
    modeSongwriting: '✍️ แต่งเพลง',
    modeArranger: '🎛️ เรียบเรียง',
    modeKaraoke: '🎤 คาราโอเกะ',
    zenMode: '✨ Zen',
    zenModeHint: 'โหมดโฟกัส: ซ่อนแถบตั้งค่าด้านบนเพื่อเพิ่มพื้นที่หน้าจอ',
    exportShare: '📤 แชร์ / ส่งออก',
    timeSignature: 'จังหวะ:',
    tempo: 'ความเร็ว:',
    keyLabel: 'คีย์จริง:',
    capoLabel: '🎸 ทาบคาโป้ (Capo):',
    capoNone: 'ไม่คาด (แสดงคอร์ดจริง)',
    capoFret: 'คาดช่อง',
    soundPanelToggle: '🔊 ปรับแต่งกีตาร์ 3 ทรง • เบอร์สาย • มิติ 3D & มิกเซอร์',

    soundPanelTitle: 'แผงควบคุมเนื้อเสียงอะคูสติกและมิติเสียง 3D',
    guitarModel: '🎸 ทรงกีตาร์โปร่ง',
    stringGauge: '📏 เบอร์สายกีตาร์',
    ambience3D: '🏛️ มิติเสียงห้อง 3D (Room Ambience)',
    vocalLatency: '🎙️ ชดเชยดีเลย์เสียงร้อง (Vocal Latency)',
    vocalLatencyHint: 'แก้ปัญหาเสียงร้องเหลื่อมเวลาต่อหูฟังบลูทูธ',
    mixerTitle: '🎛️ มิกเซอร์แยกชิ้นดนตรี 7 แทร็ก (7-Track Acoustic Mixer)',
    trackRhythmGuitar: 'กีตาร์ริทึ่ม (คอร์ด)',
    trackLeadGuitar: 'กีตาร์ลีด (Gibson Les Paul)',
    trackAcousticBass: 'เบสโปร่ง',
    trackPiano: 'เปียโนคอร์ด',
    trackDrums: 'กลอง & คาฮอน',
    trackMelody: 'โน้ตทำนองไกด์',
    trackVocal: 'เสียงร้องที่อัดไว้',

    addSection: '+ เพิ่มท่อนเพลง',
    addBar: '+ เพิ่ม 1 ห้อง',
    duplicateSection: '📋 คัดลอกท่อน',
    syllablesCount: 'พยางค์',
    activeInstrumentsLabel: 'เปิดใช้',
    noActiveInstruments: 'ปิดเสียงเครื่องดนตรีทั้งหมดในท่อนนี้',
    expandInstruments: '▾ ปรับเครื่องดนตรี',
    collapseInstruments: '▲ ซ่อนเครื่องดนตรี',
    openArrangerBtn: '🎛️ เรียบเรียง',
    openArrangerHint: 'สลับไปแท็บเรียบเรียงเพื่อปรับสไตล์เครื่องดนตรีและ Piano Roll',
    barOptionsBtn: 'ตัวเลือกห้อง',
    songwriterTitle: 'โครงสร้างเพลงและเนื้อร้อง (Songwriter)',
    songwriterSubtitle: 'เน้นคอร์ด เนื้อร้อง นับพยางค์ และอัดฮัมทำนองแบบคลีนไร้สิ่งรบกวน',
    arrangerTitle: 'เรียบเรียงดนตรีและรายละเอียด (Arranger)',
    arrangerSubtitle: 'ปรับเครื่องดนตรีประจำท่อน สไตล์การเล่น Let-Ring/Break และโน้ตเมโลดี้ไกด์',
    chordPresets: '⚡ สูตรคอร์ดฮิต',
    dynamicIntensity: 'ความหนักแน่น:',
    intensityLow: 'เบา (Intro/Verse)',
    intensityMedium: 'ปานกลาง',
    intensityHigh: 'จัดเต็ม (Chorus/Climax)',
    styleNormal: 'ตีคอร์ดปกติ',
    styleLetRing: 'ปล่อยกังวาน (Let-Ring)',
    styleBreak: 'หยุดเงียบ (Break)',
    melodyNotesBtn: '🎵 โน้ตเมโลดี้',
    vocalRecordBtn: '🎙️ อัดฮัม',
    vocalHasTrack: '🎙️ มีเสียงร้อง',
    lyricsPlaceholder: 'พิมพ์เนื้อร้องสำหรับห้องนี้...',
    chordsPerBar1: '1 คอร์ด/ห้อง',
    chordsPerBar2: '2 คอร์ด/ห้อง',

    sectionIntro: 'ท่อนนำ (Intro)',
    sectionVerse: 'ท่อนเนื้อเพลง (Verse)',
    sectionPreChorus: 'ท่อนส่ง (Pre-Chorus)',
    sectionChorus: 'ท่อนฮุก (Chorus)',
    sectionSolo: 'ท่อนโซโล่ (Solo)',
    sectionBridge: 'ท่อนสะพาน (Bridge)',
    sectionOutro: 'ท่อนจบ (Outro)',

    karaokeHint: 'โหมดคาราโอเกะสำหรับวาง iPad บนขาตั้งโน้ต — เนื้อเพลงและคอร์ดเลื่อนตามห้องที่กำลังเล่น',
    karaokePlayNotice: 'กดปุ่ม "เล่นเดโม่" ด้านบนเพื่อเริ่มเพลงพร้อมแถบไฟวิ่ง',
    karaokeCapoNotice: 'แสดงรูปคอร์ดตามตำแหน่งคาโป้ที่เลือกไว้ พร้อมจับเล่นกีตาร์คลอตามได้ทันที',
    karaokeFullscreenBtn: '⛶ เต็มจอ',

    exportTitle: 'ส่งออกเพลง & ลิงก์แชร์',
    lineShareBtn: '🔗 คัดลอกลิงก์แชร์ส่ง LINE (เปิดฟังได้ทันที)',
    lineShareCopied: '✓ คัดลอกลิงก์เรียบร้อยแล้ว!',
    midiExportBtn: '🎹 ดาวน์โหลดไฟล์ MIDI (.MID)',
    mp3ExportBtn: '🎧 ดาวน์โหลดไฟล์เสียง 3D Stereo (.MP3 192 kbps)',
    mp3Rendering: 'กำลังเรนเดอร์เสียง 3D Stereo MP3...',
    sunoPromptBtn: '🤖 สร้าง Suno AI Prompt',
    jsonBackupBtn: '💾 สำรองข้อมูลโปรเจกต์ (.json)',

    iosInstallBanner: 'ติดตั้งแอปบน iPad / iPhone: แตะปุ่มแชร์ 📤 แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"',
    iosInstallTapShare: 'แตะปุ่มแชร์ 📤',
    iosInstallAddHome: 'เลือก "เพิ่มไปยังหน้าจอโฮม"',
    installAppBtn: '📲 ติดตั้งแอปบนอุปกรณ์นี้',

    easyModeBtn: '✨ เริ่มเร็ว Easy Mode (4 เหรียญ)',
    easyModeTitle: 'Easy Mode — เสกโครงเพลงทั้งเพลงใน 1 คลิก',
    easyModeSubtitle: 'เลือกแนวเพลง โทนเสียงร้อง และเล่าเรื่องราวของคุณ (สั้นหรือยาวก็ได้) AI จะจัดคอร์ด เนื้อร้องที่มีช่องหายใจ เมโลดี้ และวงดนตรีให้พร้อมฟังทันที',
    stageDraft: '1. ร่างเนื้อ & คอร์ด',
    stageArranged: '2. เรียบเรียงวง',
    stageVocal: '3. อัดเสียงร้อง',
    stageMastered: '4. มาสเตอร์ MP3',
    inlineAiQuick: 'แต่งเนื้อท่อนนี้ (1 เหรียญ)',
    inlineAiDeep: 'แต่งเนื้อ + เมโลดี้ไกด์ (2 เหรียญ)',
    inlineSplitLyrics: 'วางเนื้อร้องยาวๆ แบ่งลงห้องอัตโนมัติ (ฟรี 0 เหรียญ)',
    easyTabIdea: '✨ เล่าเรื่อง / ไอเดียเพลง (4+ เหรียญ)',
    easyTabHum: '🎙️ ฮัมทำนอง 10–45 วิ (3 เหรียญ)',
    humRecordBtn: '🎙️ กดอัดเสียงฮัมทำนอง',
    humStopBtn: '⏹ หยุดอัดเสียง',
    humSubmitBtn: '🎙️ แกะฮัมเป็นโครงเพลง (ใช้ 3 เหรียญ)',
    generateGuideBtn: '✨ สร้างโน้ตไกด์ให้ตรงคอร์ด (ฟรี)',
    ttsCueBtn: '🗣️ AI นับจังหวะ & ไกด์ร้อง (2 เหรียญ)',

    vocalBoothTitle: '🎙️ บูธอัดเสียงร้องจริง (Vocal Booth)',
    vocalBoothFreeBadge: 'ฟรี 0 เหรียญ • อัดในเครื่อง 100%',
    scopeFullSong: 'ทั้งเพลง (Full Song)',
    scopeSelectedSection: 'เฉพาะท่อน (Section)',
    preRollToggle: 'เล่นนำ 1 ห้องก่อนเข้าท่อน (1-Bar Pre-Roll)',
    studioMicToggle: 'Raw Studio Mic (โหมดหูฟัง)',
    headphoneTip: 'แนะนำใส่หูฟังเพื่อเสียงร้องชัดระดับห้องอัดและกันเสียงหอน',
    startRecBooth: '🎙️ เริ่มอัดเสียงร้อง',
    stopRecBooth: '⏹ หยุดและบันทึกเทค',
    fxPresetLabel: 'โทนเอฟเฟกต์เสียงร้อง (Vocal FX)',
    autoDuckingLabel: 'Auto-Ducking (ลดเสียงดนตรี -2dB ตอนร้อง)',

    lyricDensityLabel: 'ความโปร่งและจังหวะหายใจของคำร้อง (Lyric Density)',
    lyricDensityAiry: '🌬️ โปร่ง สบาย',
    lyricDensityAiryDesc: 'คำน้อย หายใจกว้าง ร้องเอื้อนเต็มอารมณ์',
    lyricDensityBalanced: '🎵 พอดีสไตล์ (แนะนำ)',
    lyricDensityBalancedDesc: 'สมดุลตามตารางสไตล์ 6 กลุ่ม ร้องเข้าปาก',
    lyricDensityDense: '⚡ คำแน่น มีจังหวะ',
    lyricDensityDenseDesc: 'ใส่คำเล่า/ฮิปฮอปมากขึ้น โดยยังกันช่องหายใจ',
    pacingComfortable: 'ร้องสบาย',
    pacingFastWarning: 'พยางค์ค่อนข้างเร็ว ควรลดคำหรือเกลาให้โปร่ง',
    pacingSyllablesPerSec: 'พยางค์/วิ',
    storyBriefLabel: 'เล่าเรื่องราว / ไอเดียเพลงของคุณ (สั้นหรือยาวก็ได้):',
    storyBriefPlaceholder: 'เล่าเหตุการณ์ อารมณ์ ตัวละคร หรือประโยคเด่นที่อยากให้มีในเพลง...',
    storyStructureHintTitle: '💡 เรื่องราวละเอียด แนะนำสลับเป็นเพลงฮิต 7 ท่อนเพื่อกระจายฉากไม่ให้อัดแน่น',
    storyStructureHintBtn: 'สลับเป็น 7 ท่อน',
    storyBlueprintToggle: '🎯 กำหนดการไล่ระดับอารมณ์ & ล็อกประโยคสำคัญ (Optional)',
    storyArcLabel: 'เส้นเรื่องและพัฒนาการอารมณ์ (Emotional Arc)',
    storyOpeningAnchor: 'ประโยค/ภาพเปิดท่อนแรก (Opening Anchor)',
    storyHookAnchor: 'คำ/ประโยคบังคับในท่อนฮุค (Must-Have Hook)',
    storyHookExact: 'ใช้คำเป๊ะ (Exact)',
    storyHookFlexible: 'เกลาเข้าสัมผัส (Flexible)',
    storyClosingAnchor: 'ประโยคทิ้งท้าย / บทสรุปท่อนจบ (Closing Anchor)',
    sectionAnchorLabel: '🎯 ประโยค/คำที่ต้องมีในท่อนนี้ (Optional):',
  },
  en: {
    appName: 'Demo Maker Easy — Acoustic Songwriting Studio & Karaoke',
    appShortName: 'Demo Maker',
    appDescription: 'Acoustic 3D songwriting studio and karaoke teleprompter for iPad and tablets',
    autoSaved: 'Auto-saved',
    saveStateSaving: 'Saving...',
    saveStateSaved: 'Saved',
    saveStateError: 'Save failed (Storage full?)',
    manualSaveBtn: 'Save',
    saveCheckpointBtn: 'Checkpoint',
    audioEngineBadge: '✓ 3D Acoustic Engine',
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    done: 'Done',

    mySongs: '📂 My Songs',
    playDemo: 'Play Demo',
    pause: 'Pause',
    stop: '⏹ Stop',
    countInOn: '🥁 Count-in: ON',
    countInOff: '🥁 Count-in: OFF',
    countInBadge: 'COUNT-IN',
    barLabel: 'Bar',
    modeSongwriting: '✍️ Songwriter',
    modeArranger: '🎛️ Arranger',
    modeKaraoke: '🎤 Stage',
    zenMode: '✨ Zen',
    zenModeHint: 'Zen Focus Mode: hide top parameter bar for distraction-free writing',
    exportShare: '📤 Export / Share',
    timeSignature: 'Meter:',
    tempo: 'Tempo:',
    keyLabel: 'Key:',
    capoLabel: '🎸 Capo:',
    capoNone: 'None (Actual Chords)',
    capoFret: 'Fret',
    soundPanelToggle: '🔊 3D Guitar • Gauge • Room & Mixer',

    soundPanelTitle: 'Acoustic Tone & 3D Stereo Soundstage Controls',
    guitarModel: '🎸 Acoustic Guitar Body',
    stringGauge: '📏 String Gauge',
    ambience3D: '🏛️ 3D Acoustic Space',
    vocalLatency: '🎙️ Vocal Mic Latency Offset',
    vocalLatencyHint: 'Compensates Bluetooth audio delay',
    mixerTitle: '🎛️ 7-Track Acoustic Mixer',
    trackRhythmGuitar: 'Rhythm Guitar (Chords)',
    trackLeadGuitar: 'Lead Guitar (Gibson Les Paul)',
    trackAcousticBass: 'Acoustic Bass',
    trackPiano: 'Acoustic Piano',
    trackDrums: 'Cajon & Percussion',
    trackMelody: 'Melody Guide',
    trackVocal: 'Recorded Vocals',

    addSection: '+ Add Section',
    addBar: '+ Add 1 Bar',
    duplicateSection: '📋 Duplicate',
    syllablesCount: 'syl',
    activeInstrumentsLabel: 'Active',
    noActiveInstruments: 'All instruments muted',
    expandInstruments: '▾ Instruments',
    collapseInstruments: '▲ Hide',
    openArrangerBtn: '🎛️ Arranger',
    openArrangerHint: 'Switch to Arranger tab for instrument styles & Piano Roll',
    barOptionsBtn: 'Bar options',
    songwriterTitle: 'Songwriting Sheet & Chords',
    songwriterSubtitle: 'Distraction-free chords, lyrics, syllable counter, and vocal scratchpad',
    arrangerTitle: 'Arrangement, Instruments & Piano Roll',
    arrangerSubtitle: 'Per-section instruments, playing styles, bar dynamics, and melody piano roll',
    chordPresets: '⚡ Chord Formulas',
    dynamicIntensity: 'Dynamic:',
    intensityLow: 'Low (Intro/Verse)',
    intensityMedium: 'Medium',
    intensityHigh: 'High (Chorus/Climax)',
    styleNormal: 'Normal Strum',
    styleLetRing: 'Let-Ring (Hold)',
    styleBreak: 'Break (Stop)',
    melodyNotesBtn: '🎵 Melody Roll',
    vocalRecordBtn: '🎙️ Record Mic',
    vocalHasTrack: '🎙️ Vocal Tracked',
    lyricsPlaceholder: 'Type lyrics for this bar...',
    chordsPerBar1: '1 Chord/Bar',
    chordsPerBar2: '2 Chords/Bar',

    sectionIntro: 'Intro',
    sectionVerse: 'Verse',
    sectionPreChorus: 'Pre-Chorus',
    sectionChorus: 'Chorus',
    sectionSolo: 'Guitar Solo',
    sectionBridge: 'Bridge',
    sectionOutro: 'Outro',

    karaokeHint: 'Karaoke teleprompter mode for iPad music stand — chords & lyrics scroll smoothly with live playback',
    karaokePlayNotice: 'Press "Play Demo" above to start live playback and beat indicators',
    karaokeCapoNotice: 'Chord voicings automatically match selected Capo fret for instant acoustic play-along',
    karaokeFullscreenBtn: '⛶ Fullscreen',

    exportTitle: 'Export & Share Song',
    lineShareBtn: '🔗 Copy LINE Share Link (Plays anywhere)',
    lineShareCopied: '✓ Link copied to clipboard!',
    midiExportBtn: '🎹 Download MIDI (.MID)',
    mp3ExportBtn: '🎧 Download 3D Stereo (.MP3 192 kbps)',
    mp3Rendering: 'Rendering 3D Stereo MP3 mixdown...',
    sunoPromptBtn: '🤖 Generate Suno AI Prompt',
    jsonBackupBtn: '💾 Backup Project (.json)',

    iosInstallBanner: 'Install on iPad / iPhone: Tap Share 📤 and select "Add to Home Screen"',
    iosInstallTapShare: 'Tap Share 📤',
    iosInstallAddHome: 'Choose "Add to Home Screen"',
    installAppBtn: '📲 Install App on this device',

    easyModeBtn: '✨ Quick Start: Easy Mode (4 Cr)',
    easyModeTitle: 'Easy Mode — Generate a Full Song in 1 Click',
    easyModeSubtitle: 'Pick a vibe, vocal range, and share a short or detailed story brief. AI composes chords, breathable lyrics, guide melody, and studio mix.',
    stageDraft: '1. Draft',
    stageArranged: '2. Arranged',
    stageVocal: '3. Vocal',
    stageMastered: '4. Mastered',
    inlineAiQuick: 'Polish Lyrics (1 Credit)',
    inlineAiDeep: 'Lyrics + Guide Melody (2 Credits)',
    inlineSplitLyrics: 'Auto-Split Pasted Lyrics into Bars (0 Credits)',
    easyTabIdea: '✨ Story / Song Brief (4+ Credits)',
    easyTabHum: '🎙️ Hum / Sing 10–45s (3 Credits)',
    humRecordBtn: '🎙️ Start Recording Hum',
    humStopBtn: '⏹ Stop Recording',
    humSubmitBtn: '🎙️ Hum-to-Song Draft (3 Credits)',
    generateGuideBtn: '✨ Generate Guide Notes (Free)',
    ttsCueBtn: '🗣️ AI Spoken Phrasing Cue (2 Credits)',

    vocalBoothTitle: '🎙️ Real Vocal Recording Booth',
    vocalBoothFreeBadge: 'Free 0 Credits • 100% Local',
    scopeFullSong: 'Full Song',
    scopeSelectedSection: 'Selected Section',
    preRollToggle: '1-Bar Backing Pre-Roll',
    studioMicToggle: 'Raw Studio Mic (Headphones)',
    headphoneTip: 'Headphones recommended for clean studio vocal capture',
    startRecBooth: '🎙️ Start Booth Take',
    stopRecBooth: '⏹ Stop & Save Take',
    fxPresetLabel: 'Vocal Studio FX Preset',
    autoDuckingLabel: 'Auto-Ducking (-2dB Backing Dip)',

    lyricDensityLabel: 'Vocal Breath & Lyric Density',
    lyricDensityAiry: '🌬️ Airy',
    lyricDensityAiryDesc: 'Fewer words, wider breath pockets',
    lyricDensityBalanced: '🎵 Balanced (Recommended)',
    lyricDensityBalancedDesc: 'Calibrated to style & BPM phrasing',
    lyricDensityDense: '⚡ Dense Groove',
    lyricDensityDenseDesc: 'More narrative / rhythmic words with breath reserve',
    pacingComfortable: 'Comfortable',
    pacingFastWarning: 'Fast vocal rate — consider trimming syllables',
    pacingSyllablesPerSec: 'syl/sec',
    storyBriefLabel: 'Describe your song story / brief (short or detailed):',
    storyBriefPlaceholder: 'Tell the full story, imagery, or key moments across Verse -> Chorus -> Outro...',
    storyStructureHintTitle: '💡 Detailed story detected — switch to Full Hit (7 Sections) so scenes breathe naturally.',
    storyStructureHintBtn: 'Use 7 Sections',
    storyBlueprintToggle: '🎯 Emotional Arc & Key Anchor Lines (Optional)',
    storyArcLabel: 'Emotional Arc Progression',
    storyOpeningAnchor: 'Opening Line / Imagery',
    storyHookAnchor: 'Must-Have Hook Phrase',
    storyHookExact: 'Exact',
    storyHookFlexible: 'Flexible',
    storyClosingAnchor: 'Closing / Outro Anchor',
    sectionAnchorLabel: '🎯 Must-Have Phrase / Anchor in This Section (Optional):',
  },
};

const LANG_STORAGE_KEY = 'demo_maker_easy_lang';

export function getSavedLanguage(): Language {
  if (typeof window === 'undefined') return 'th';
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'th') return saved;
  } catch (err) {
    console.warn('Could not read saved language:', err);
  }
  return 'th';
}

export function saveLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (err) {
    console.warn('Could not save language:', err);
  }
}
