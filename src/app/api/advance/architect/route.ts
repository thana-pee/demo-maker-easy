import {
  ARCHITECT_RESPONSE_SCHEMA,
  RHYME_POLISH_RESPONSE_SCHEMA,
  buildEasyArchitectSystemPrompt,
  buildEasyArchitectUserPrompt,
  buildRhymePolishPrompt,
  getSyllableBudgetForBpm,
  selectPrioritySectionsForPolish,
} from '@/lib/aiPrompts';
import {
  callGeminiJson,
  GEMINI_MODEL_LITE,
  GEMINI_MODEL_MAIN,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import { CREDIT_COST_TABLE } from '@/lib/creditManager';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import {
  buildSimulatedArchitectSong,
  getPresetConfig,
  sanitizeArchitectSongProject,
  type EasyArchitectInput,
  type TempoFeel,
  type VocalProfile,
} from '@/lib/songArchitect';
import { validateThaiLyricCouplets } from '@/lib/thaiRhymeHelper';
import type {
  SongProject,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
} from '@/types/song';

export const maxDuration = 60;

export interface AdvanceArchitectResponseBody {
  isSimulated: boolean;
  model: string;
  song: SongProject;
  producerNotes: string[];
  rhymeValidation: {
    passed: boolean;
    polished: boolean;
  };
  tip: string;
  usage?: GeminiTokenUsage;
  wallet?: WalletBalanceSummary;
  failureReason?: string;
}

const VALID_VOCALS = new Set<VocalProfile>(['female', 'male', 'neutral']);
const VALID_TEMPOS = new Set<TempoFeel>(['slow', 'medium', 'fast']);

function addUsageTelemetry(
  base: GeminiTokenUsage,
  extra?: GeminiTokenUsage
): GeminiTokenUsage {
  if (!extra) return base;
  return {
    inputTokens: base.inputTokens + extra.inputTokens,
    cachedTokens: base.cachedTokens + extra.cachedTokens,
    outputTokens: base.outputTokens + extra.outputTokens,
    thoughtTokens: base.thoughtTokens + extra.thoughtTokens,
    totalTokens: base.totalTokens + extra.totalTokens,
  };
}

export async function POST(request: Request): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== 'object') {
    return Response.json({ error: 'Request payload must be a JSON object' }, { status: 400 });
  }

  const obj = rawBody as Record<string, unknown>;
  const topic = typeof obj.topic === 'string' ? obj.topic.trim() : '';
  if (!topic) {
    return Response.json(
      { error: 'Required field: topic (string describing your song idea)' },
      { status: 400 }
    );
  }

  const stylePreset =
    typeof obj.stylePreset === 'string' && obj.stylePreset.trim()
      ? obj.stylePreset.trim()
      : 'warm-acoustic';
  const vocalProfile: VocalProfile =
    typeof obj.vocalProfile === 'string' && VALID_VOCALS.has(obj.vocalProfile as VocalProfile)
      ? (obj.vocalProfile as VocalProfile)
      : 'neutral';
  const tempoFeel: TempoFeel =
    typeof obj.tempoFeel === 'string' && VALID_TEMPOS.has(obj.tempoFeel as TempoFeel)
      ? (obj.tempoFeel as TempoFeel)
      : 'medium';
  const language: 'th' | 'en' = obj.language === 'en' ? 'en' : 'th';
  const thaiGenre = typeof obj.thaiGenre === 'string' ? (obj.thaiGenre as ThaiSongGenre) : undefined;
  const lyricEra = typeof obj.lyricEra === 'string' ? (obj.lyricEra as ThaiLyricEra) : undefined;
  const lyricDialect =
    typeof obj.lyricDialect === 'string' ? (obj.lyricDialect as ThaiLyricDialect) : undefined;
  const songwriterStyle =
    typeof obj.songwriterStyle === 'string'
      ? (obj.songwriterStyle as ThaiSongwriterStyle)
      : undefined;
  const emotionalResolution =
    typeof obj.emotionalResolution === 'string'
      ? (obj.emotionalResolution as ThaiEmotionalResolution)
      : undefined;

  const preset = getPresetConfig(stylePreset);
  const effectiveThaiGenre = thaiGenre ?? preset.thaiGenre;

  const input: EasyArchitectInput = {
    stylePreset,
    vocalProfile,
    tempoFeel,
    topic,
    language,
    thaiGenre: effectiveThaiGenre,
    lyricEra,
    lyricDialect,
    songwriterStyle,
    emotionalResolution,
  };

  const architectCost = CREDIT_COST_TABLE.aiEasyWholeSong;
  const billing = await tryServerBillingPreDeduct(
    request,
    architectCost,
    `Easy Mode Architect (${GEMINI_MODEL_MAIN}): ${topic.slice(0, 24)}`,
    { modelId: GEMINI_MODEL_MAIN }
  );
  if (billing.active && 'errorStatus' in billing) {
    return Response.json(
      { error: billing.error, code: billing.errorCode },
      { status: billing.errorStatus }
    );
  }

  const systemInstruction = buildEasyArchitectSystemPrompt({
    thaiGenre: effectiveThaiGenre,
    lyricDialect,
    songwriterStyle,
    emotionalResolution,
    bpm: preset.bpmByTempo[tempoFeel],
    timeSignature: '4/4',
  });
  const userPrompt = buildEasyArchitectUserPrompt({
    ...input,
    recommendedBpm: preset.bpmByTempo[tempoFeel],
    recommendedGuitarModel: preset.guitarModel,
    recommendedAmbience: preset.ambience3D,
  });

  const gemini = await callGeminiJson<Record<string, unknown>>(userPrompt, {
    model: GEMINI_MODEL_MAIN,
    systemInstruction,
    responseSchema: ARCHITECT_RESPONSE_SCHEMA,
    maxOutputTokens: 8192,
    thinkingLevel: 'low',
  });

  if (!gemini.ok) {
    const simulatedSong = buildSimulatedArchitectSong(input);
    let tip: string;
    if (gemini.reason === 'missing-key') {
      tip = `โหมดจำลอง Easy Mode (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) — ไม่หัก 4 เครดิต สามารถฟังพรีวิวและแก้ต่อได้ทันที`;
    } else if (gemini.reason === 'rate-limit') {
      tip = 'โควตาคำขอ Gemini API เต็มชั่วคราว (429) — สร้างโครงเพลงจำลองให้ลองเล่นแทนโดยไม่หักเครดิต';
    } else if (gemini.reason === 'auth-error') {
      tip = 'GEMINI_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์เข้าถึงโมเดล — สร้างโครงเพลงจำลองแทนโดยไม่หักเครดิต';
    } else {
      tip = `${gemini.failureReason} — แสดงผลโครงเพลงจำลองแทนอย่างปลอดภัย (ไม่หักเครดิต)`;
    }

    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      architectCost,
      `Auto-refund Easy Architect (${gemini.reason})`,
      { modelId: GEMINI_MODEL_MAIN }
    );

    return Response.json(
      {
        isSimulated: true,
        model: 'demo-offline-architect',
        song: simulatedSong,
        producerNotes: [
          `จัดสไตล์ ${preset.nameTh} (${simulatedSong.bpm} BPM, คีย์ ${simulatedSong.baseKey}, Capo ${simulatedSong.capoFret})`,
          'แยกย่านเสียงให้ท่อน Verse โปร่งชัดและดันวงเต็มในท่อน Chorus พร้อมโน้ตเมโลดี้ไกด์',
        ],
        rhymeValidation: { passed: true, polished: false },
        tip,
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
        failureReason: gemini.reason,
      } satisfies AdvanceArchitectResponseBody,
      { status: 200 }
    );
  }

  let song = sanitizeArchitectSongProject(gemini.data, input);
  let totalUsage = gemini.usage;
  let rhymePassed = true;
  let wasPolished = false;

  // Post-Validate สัมผัสภาษาไทยในท่อน Chorus / Pre-Chorus / Verse / Outro และคัดเลือกท่อนสำคัญเข้าขัดเกลาได้สูงสุด 1 ครั้ง
  if (language === 'th') {
    const polishableTypes = new Set(['chorus', 'pre-chorus', 'verse', 'outro']);
    const evaluatedSections = song.sections
      .filter((sec) => polishableTypes.has(sec.type) && sec.bars.length >= 2)
      .map((sec) => {
        const budget = getSyllableBudgetForBpm(song.bpm, song.timeSignature, {
          sectionType: sec.type,
          songwriterStyle,
          thaiGenre: effectiveThaiGenre,
        });
        const validation = validateThaiLyricCouplets(
          sec.bars.map((b) => b.lyrics),
          {
            bpm: song.bpm,
            timeSignature: song.timeSignature,
            minSyllables: budget.min,
            maxSyllables: budget.max,
            enforceSyllableBudget: true,
          }
        );
        const overflowBars = (validation.outOfBudgetBars ?? []).filter(
          (b) => b.syllables > b.expectedMax
        );
        return {
          item: { sec, validation, overflowBars },
          sectionType: sec.type,
          passed: validation.passed,
          hasDuplicates: (validation.duplicateEndWords?.length ?? 0) > 0,
          syllableOverflowCount: overflowBars.length,
        };
      });

    const selectedForPolish = selectPrioritySectionsForPolish(evaluatedSections, 3);

    if (selectedForPolish.length > 0) {
      rhymePassed = evaluatedSections
        .filter((e) => e.sectionType !== 'outro')
        .every((e) => e.passed);
      const polishPrompt = buildRhymePolishPrompt(
        selectedForPolish.map(({ item: { sec, validation, overflowBars } }) => ({
          sectionName: sec.name,
          chords: sec.bars.map((b) => b.chords[0] ?? 'C'),
          lines: sec.bars.map((b) => b.lyrics),
          duplicateEndWords: validation.duplicateEndWords,
          weakPairs: validation.weakPairs,
          outOfBudgetBars: overflowBars,
        })),
        song.bpm
      );

      const polishRes = await callGeminiJson<{
        polishedSections?: Array<{ sectionName?: string; lines?: string[] }>;
      }>(polishPrompt, {
        model: GEMINI_MODEL_LITE,
        systemInstruction: 'คุณคือบรรณาธิการคำร้องไทย แก้เฉพาะคำลงท้าย/ส่งสัมผัสและความกระชับของพยางค์ให้ลื่นไหลโดยคงความหมายและจำนวนวรรคเดิม',
        responseSchema: RHYME_POLISH_RESPONSE_SCHEMA,
        maxOutputTokens: 1024,
        thinkingLevel: 'minimal',
      });

      if (polishRes.ok && Array.isArray(polishRes.data.polishedSections)) {
        totalUsage = addUsageTelemetry(totalUsage, polishRes.usage);
        wasPolished = true;
        const mapByName = new Map(
          polishRes.data.polishedSections
            .filter((p) => typeof p.sectionName === 'string' && Array.isArray(p.lines))
            .map((p) => [p.sectionName as string, p.lines as string[]])
        );
        song = {
          ...song,
          sections: song.sections.map((sec) => {
            const nextLines = mapByName.get(sec.name);
            if (!nextLines || nextLines.length === 0) return sec;
            return {
              ...sec,
              bars: sec.bars.map((bar, idx) =>
                typeof nextLines[idx] === 'string' && nextLines[idx].trim()
                  ? { ...bar, lyrics: nextLines[idx].trim() }
                  : bar
              ),
            };
          }),
        };
        const recheckFailed = song.sections
          .filter(
            (sec) =>
              (sec.type === 'verse' || sec.type === 'chorus' || sec.type === 'pre-chorus') &&
              sec.bars.length >= 2
          )
          .some((sec) => {
            const budget = getSyllableBudgetForBpm(song.bpm, song.timeSignature, {
              sectionType: sec.type,
              songwriterStyle,
              thaiGenre: effectiveThaiGenre,
            });
            return !validateThaiLyricCouplets(sec.bars.map((b) => b.lyrics), {
              bpm: song.bpm,
              timeSignature: song.timeSignature,
              minSyllables: budget.min,
              maxSyllables: budget.max,
              enforceSyllableBudget: true,
            }).passed;
          });
        rhymePassed = !recheckFailed;
      }
    }
  }

  const rawNotes = gemini.data.producerNotes;
  const producerNotes = Array.isArray(rawNotes)
    ? rawNotes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).slice(0, 4)
    : [`จัดโครงสร้าง ${song.sections.length} ท่อนในสไตล์ ${preset.nameTh} ด้วย ${gemini.modelUsed}`];

  return Response.json(
    {
      isSimulated: false,
      model: gemini.modelUsed,
      song,
      producerNotes,
      rhymeValidation: { passed: rhymePassed, polished: wasPolished },
      tip: `สร้างเพลงเต็ม "${song.title}" (${song.sections.length} ท่อน · ${song.bpm} BPM) ด้วย ${gemini.modelUsed} เรียบร้อยแล้ว`,
      usage: totalUsage,
      ...(billing.active ? { wallet: billing.wallet } : {}),
    } satisfies AdvanceArchitectResponseBody,
    { status: 200 }
  );
}
