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
  GEMINI_MODEL_FLASH,
  GEMINI_MODEL_LITE,
  GEMINI_MODEL_MAIN,
  GEMINI_MODEL_PRO,
  type GeminiTokenUsage,
} from '@/lib/geminiClient';
import { CREDIT_COST_TABLE, getEasyArchitectCreditCost } from '@/lib/creditManager';
import {
  refundServerBillingOnFailure,
  tryServerBillingPreDeduct,
  type ServerBillingPreDeductResult,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';
import {
  buildDiatonicGuideNotesForChord,
  buildSimulatedArchitectSong,
  getPresetConfig,
  sanitizeArchitectSongProject,
  type EasyArchitectInput,
  type GuideMelodyContext,
  type TempoFeel,
  type VocalProfile,
} from '@/lib/songArchitect';
import { validateThaiLyricCouplets } from '@/lib/thaiRhymeHelper';
import type {
  LyricDensityMode,
  SectionType,
  SongProject,
  StoryBlueprintInput,
  StoryBlueprintSummary,
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
  storyBlueprint?: StoryBlueprintSummary;
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
  const lyricDensity: LyricDensityMode | undefined =
    obj.lyricDensity === 'airy' || obj.lyricDensity === 'balanced' || obj.lyricDensity === 'dense'
      ? obj.lyricDensity
      : undefined;
  const rawSb =
    obj.storyBlueprint && typeof obj.storyBlueprint === 'object'
      ? (obj.storyBlueprint as Record<string, unknown>)
      : undefined;
  const storyBlueprint: StoryBlueprintInput | undefined = rawSb
    ? {
        ...(typeof rawSb.storyArcPreset === 'string' && rawSb.storyArcPreset.trim()
          ? { storyArcPreset: rawSb.storyArcPreset.trim() }
          : {}),
        ...(typeof rawSb.customEmotionalArc === 'string' && rawSb.customEmotionalArc.trim()
          ? { customEmotionalArc: rawSb.customEmotionalArc.trim().slice(0, 240) }
          : {}),
        ...(typeof rawSb.openingAnchor === 'string' && rawSb.openingAnchor.trim()
          ? { openingAnchor: rawSb.openingAnchor.trim().slice(0, 120) }
          : {}),
        ...(typeof rawSb.hookAnchor === 'string' && rawSb.hookAnchor.trim()
          ? {
              hookAnchor: rawSb.hookAnchor.trim().slice(0, 120),
              hookAnchorMode: rawSb.hookAnchorMode === 'exact' ? 'exact' : 'flexible',
            }
          : {}),
        ...(typeof rawSb.closingAnchor === 'string' && rawSb.closingAnchor.trim()
          ? { closingAnchor: rawSb.closingAnchor.trim().slice(0, 120) }
          : {}),
      }
    : undefined;

  const preset = getPresetConfig(stylePreset);
  const recommendedBpm = preset.bpmByTempo[tempoFeel];
  const hasExplicitBpm = typeof obj.bpm === 'number' && Number.isFinite(obj.bpm);
  const effectiveThaiGenre = thaiGenre ?? preset.thaiGenre;

  const customStructure = Array.isArray(obj.customStructure)
    ? (obj.customStructure as Array<{ type: SectionType; bars: number; name?: string }>).slice(0, 9)
    : undefined;
  const chordProgressionPreset =
    typeof obj.chordProgressionPreset === 'string' && obj.chordProgressionPreset.trim()
      ? obj.chordProgressionPreset.trim()
      : undefined;
  const customChords = Array.isArray(obj.customChords)
    ? (obj.customChords as string[]).filter((c) => typeof c === 'string' && c.trim().length > 0)
    : undefined;

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
    lyricDensity,
    storyBlueprint,
    customStructure,
    chordProgressionPreset,
    customChords,
  };

  const useProArgon = obj.useProArgon === true || obj.modelTier === 'pro-argon';
  const modelToUse = useProArgon ? GEMINI_MODEL_PRO : GEMINI_MODEL_MAIN;
  const routeStartedAt = Date.now();
  const sectionCount = customStructure && customStructure.length > 0 ? customStructure.length : 5;
  const architectCost = useProArgon
    ? CREDIT_COST_TABLE.aiProArgonArranger
    : getEasyArchitectCreditCost(sectionCount);
  const maxOutputTokens = useProArgon ? 32768 : sectionCount <= 5 ? 8192 : 12288;
  const thinkingLevel = useProArgon ? 'medium' : 'low';
  const timeoutMs = useProArgon ? 46_000 : sectionCount <= 5 ? 36_000 : 42_000;
  const fallbackModels = useProArgon
    ? [GEMINI_MODEL_MAIN, GEMINI_MODEL_FLASH]
    : [GEMINI_MODEL_FLASH, GEMINI_MODEL_LITE];
  let billing: ServerBillingPreDeductResult = { active: false };
  let billingRefunded = false;

  try {
    billing = await tryServerBillingPreDeduct(
      request,
      architectCost,
      `Easy Mode Architect (${modelToUse}): ${topic.slice(0, 24)}`,
      { requirePurchased: useProArgon, modelId: modelToUse }
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
      bpm: recommendedBpm,
      timeSignature: '4/4',
      lyricDensity,
    });
    const userPrompt = buildEasyArchitectUserPrompt({
      ...input,
      recommendedBpm,
      recommendedGuitarModel: preset.guitarModel,
      recommendedAmbience: preset.ambience3D,
    });

    const gemini = await callGeminiJson<Record<string, unknown>>(userPrompt, {
      model: modelToUse,
      fallbackModels,
      systemInstruction,
      responseSchema: ARCHITECT_RESPONSE_SCHEMA,
      maxOutputTokens,
      thinkingLevel,
      timeoutMs,
    });

    if (!gemini.ok) {
      const simulatedSong = buildSimulatedArchitectSong(input);
      let tip: string;
      if (gemini.reason === 'missing-key') {
        tip = `โหมดจำลอง Easy Mode (ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์) — ไม่หัก ${architectCost} เครดิต สามารถฟังพรีวิวและแก้ต่อได้ทันที`;
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
        { modelId: modelToUse }
      );
      billingRefunded = true;

      await recordServerFeatureEvent(
        request,
        {
          eventName: 'ai_easy_mode_architect',
          category: 'ai',
          songwriterStyle,
          thaiGenre: effectiveThaiGenre,
          lyricDialect,
          lyricEra,
          emotionalResolution,
          featureVariant: stylePreset,
          isSimulated: true,
          creditsCost: 0,
        },
        { userId: billing.active && 'userId' in billing ? billing.userId : undefined, skipAuthLookup: billing.active }
      );

      const simBlueprint: StoryBlueprintSummary = {
        coreTheme: topic.slice(0, 120),
        emotionalArcSummary:
          storyBlueprint?.customEmotionalArc ||
          `Intro -> Verse -> Pre-Chorus -> Chorus -> Outro (${tempoFeel})`,
        sectionBeats: simulatedSong.sections
          .filter((s) => s.type !== 'intro')
          .map((s) => ({
            sectionType: s.type,
            beatGoal: s.bars.find((b) => b.lyrics)?.lyrics || s.name,
          })),
      };

      return Response.json(
        {
          isSimulated: true,
          model: 'demo-offline-architect',
          song: simulatedSong,
          producerNotes: [
            `จัดสไตล์ ${preset.nameTh} (${simulatedSong.bpm} BPM, คีย์ ${simulatedSong.baseKey}, Capo ${simulatedSong.capoFret})`,
            'แยกย่านเสียงให้ท่อน Verse โปร่งชัดและดันวงเต็มในท่อน Chorus พร้อมโน้ตเมโลดี้ไกด์',
          ],
          storyBlueprint: simBlueprint,
          rhymeValidation: { passed: true, polished: false },
          tip,
          ...(refundedWallet ? { wallet: refundedWallet } : {}),
          failureReason: gemini.reason,
        } satisfies AdvanceArchitectResponseBody,
        { status: 200 }
      );
    }

    let song = sanitizeArchitectSongProject(gemini.data, input);
    if (!hasExplicitBpm) {
      const clampedBpm = Math.max(
        55,
        Math.min(160, Math.max(recommendedBpm - 8, Math.min(recommendedBpm + 8, song.bpm)))
      );
      if (clampedBpm !== song.bpm) {
        song = { ...song, bpm: clampedBpm };
      }
    }
    const melodyCtx: GuideMelodyContext = {
      baseKey: song.baseKey,
      timeSignature: song.timeSignature,
      bpm: song.bpm,
      vocalProfile,
      thaiGenre: effectiveThaiGenre,
      songwriterStyle,
      lyricDensity,
    };
    const exactProtectedAnchors = [
      ...(storyBlueprint?.openingAnchor ? [storyBlueprint.openingAnchor.trim()] : []),
      ...(storyBlueprint?.hookAnchor && storyBlueprint.hookAnchorMode === 'exact'
        ? [storyBlueprint.hookAnchor.trim()]
        : []),
      ...(storyBlueprint?.closingAnchor ? [storyBlueprint.closingAnchor.trim()] : []),
    ].filter(Boolean);
    const allPromptAnchors = Array.from(
      new Set(
        [
          ...exactProtectedAnchors,
          ...(storyBlueprint?.hookAnchor ? [storyBlueprint.hookAnchor.trim()] : []),
        ].filter(Boolean)
      )
    );
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
            lyricDensity,
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
            item: { sec, validation, overflowBars, budget },
            sectionType: sec.type,
            passed: validation.passed,
            hasDuplicates: (validation.duplicateEndWords?.length ?? 0) > 0,
            syllableOverflowCount: overflowBars.length,
          };
        });

      const selectedForPolish = selectPrioritySectionsForPolish(
        evaluatedSections,
        Math.min(5, evaluatedSections.length)
      );
      const remainingPolishBudgetMs = Math.max(0, 50_000 - (Date.now() - routeStartedAt));

      if (selectedForPolish.length > 0 && remainingPolishBudgetMs >= 4_000) {
        rhymePassed = evaluatedSections
          .filter((e) => e.sectionType !== 'outro')
          .every((e) => e.passed);
        const polishPrompt = buildRhymePolishPrompt(
          selectedForPolish.map(({ item: { sec, validation, overflowBars, budget } }) => ({
            sectionId: sec.id,
            sectionName: sec.name,
            sectionType: sec.type,
            chords: sec.bars.map((b) => b.chords[0] ?? 'C'),
            lines: sec.bars.map((b) => b.lyrics),
            duplicateEndWords: validation.duplicateEndWords,
            weakPairs: validation.weakPairs,
            outOfBudgetBars: overflowBars,
            expectedMin: budget.min,
            expectedMax: budget.max,
          })),
          song.bpm,
          {
            timeSignature: song.timeSignature,
            songwriterStyle,
            thaiGenre: effectiveThaiGenre,
            lyricDensity,
            lockedAnchors: allPromptAnchors,
          }
        );

        const polishRes = await callGeminiJson<{
          polishedSections?: Array<{ sectionId?: string; sectionName?: string; lines?: string[] }>;
        }>(polishPrompt, {
          model: GEMINI_MODEL_LITE,
          systemInstruction: 'คุณคือบรรณาธิการคำร้องไทย แก้เฉพาะคำลงท้าย/ส่งสัมผัสและความกระชับของพยางค์ให้ลื่นไหลโดยคงความหมาย จำนวนวรรค และคำหมุดหมายของผู้ใช้ไว้ครบถ้วน',
          responseSchema: RHYME_POLISH_RESPONSE_SCHEMA,
          maxOutputTokens: 2048,
          thinkingLevel: 'low',
          timeoutMs: Math.min(10_000, remainingPolishBudgetMs),
        });

        if (polishRes.ok && Array.isArray(polishRes.data.polishedSections)) {
          totalUsage = addUsageTelemetry(totalUsage, polishRes.usage);
          const validPolished = polishRes.data.polishedSections.filter(
            (p): p is { sectionId?: string; sectionName?: string; lines: string[] } =>
              Boolean(p && typeof p === 'object') &&
              Array.isArray(p.lines) &&
              p.lines.length > 0
          );
          const mapById = new Map<string, string[]>();
          const targetSectionIds = selectedForPolish.map((s) => s.item.sec.id);
          const targetSecById = new Map(song.sections.map((s) => [s.id, s]));

          const unmatchedPolished: Array<{ sectionName?: string; lines: string[] }> = [];
          for (const p of validPolished) {
            const rawId = typeof p.sectionId === 'string' ? p.sectionId.trim() : '';
            if (rawId && targetSecById.has(rawId) && !mapById.has(rawId)) {
              mapById.set(rawId, p.lines);
            } else {
              unmatchedPolished.push(p);
            }
          }

          for (const p of unmatchedPolished) {
            const nameToMatch = typeof p.sectionName === 'string' ? p.sectionName.trim() : '';
            let matchedId = targetSectionIds.find(
              (id) => !mapById.has(id) && targetSecById.get(id)?.name === nameToMatch
            );
            if (!matchedId && nameToMatch) {
              matchedId = song.sections.find(
                (s) => !mapById.has(s.id) && s.name === nameToMatch
              )?.id;
            }
            if (!matchedId) {
              matchedId = targetSectionIds.find((id) => !mapById.has(id));
            }
            if (matchedId) {
              mapById.set(matchedId, p.lines);
            }
          }

          wasPolished = mapById.size > 0;
          song = {
            ...song,
            sections: song.sections.map((sec) => {
              const nextLines = mapById.get(sec.id);
              if (!nextLines || nextLines.length === 0) return sec;
              return {
                ...sec,
                bars: sec.bars.map((bar, idx) => {
                  const candidate =
                    typeof nextLines[idx] === 'string' && nextLines[idx].trim()
                      ? nextLines[idx].trim()
                      : bar.lyrics;
                  // ป้องกันการลบหมุดหมาย Exact Anchor ของผู้ใช้ออกระหว่างรอบ Polish
                  const lostExactAnchor = exactProtectedAnchors.some(
                    (anchor) => bar.lyrics.includes(anchor) && !candidate.includes(anchor)
                  );
                  const nextLyric = lostExactAnchor ? bar.lyrics : candidate;
                  if (nextLyric === bar.lyrics) {
                    return bar;
                  }
                  return {
                    ...bar,
                    lyrics: nextLyric,
                    melodyNotes:
                      sec.type === 'intro'
                        ? []
                        : buildDiatonicGuideNotesForChord(
                            bar.chords[0] || song.baseKey || 'C',
                            idx,
                            nextLyric,
                            bar.chords[1],
                            sec.type,
                            melodyCtx
                          ),
                  };
                }),
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
                lyricDensity,
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

    const rawAiSb =
      gemini.data.storyBlueprint && typeof gemini.data.storyBlueprint === 'object'
        ? (gemini.data.storyBlueprint as Record<string, unknown>)
        : undefined;
    const responseStoryBlueprint: StoryBlueprintSummary | undefined = rawAiSb
      ? {
          coreTheme:
            typeof rawAiSb.coreTheme === 'string' && rawAiSb.coreTheme.trim()
              ? rawAiSb.coreTheme.trim()
              : topic.slice(0, 120),
          emotionalArcSummary:
            typeof rawAiSb.emotionalArcSummary === 'string' && rawAiSb.emotionalArcSummary.trim()
              ? rawAiSb.emotionalArcSummary.trim()
              : storyBlueprint?.customEmotionalArc || '',
          ...(Array.isArray(rawAiSb.sectionBeats)
            ? {
                sectionBeats: rawAiSb.sectionBeats
                  .filter(
                    (b): b is { sectionType: string; beatGoal: string; imageryKeywords?: string[] } =>
                      Boolean(b && typeof b === 'object') &&
                      typeof (b as Record<string, unknown>).sectionType === 'string' &&
                      typeof (b as Record<string, unknown>).beatGoal === 'string'
                  )
                  .slice(0, 9),
              }
            : {}),
        }
      : undefined;

    await recordServerFeatureEvent(
      request,
      {
        eventName: 'ai_easy_mode_architect',
        category: 'ai',
        songwriterStyle,
        thaiGenre: effectiveThaiGenre,
        lyricDialect,
        lyricEra,
        emotionalResolution,
        featureVariant: stylePreset,
        isSimulated: false,
        creditsCost: architectCost,
      },
      { userId: billing.active && 'userId' in billing ? billing.userId : undefined, skipAuthLookup: billing.active }
    );

    return Response.json(
      {
        isSimulated: false,
        model: gemini.modelUsed,
        song,
        producerNotes,
        ...(responseStoryBlueprint ? { storyBlueprint: responseStoryBlueprint } : {}),
        rhymeValidation: { passed: rhymePassed, polished: wasPolished },
        tip: `สร้างเพลงเต็ม "${song.title}" (${song.sections.length} ท่อน · ${song.bpm} BPM) ด้วย ${gemini.modelUsed} เรียบร้อยแล้ว`,
        usage: totalUsage,
        ...(billing.active ? { wallet: billing.wallet } : {}),
      } satisfies AdvanceArchitectResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = rawMsg
      .replace(/AIza[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
    console.error('[architect] unexpected failure:', safeMsg);

    const refundedWallet = !billingRefunded
      ? await refundServerBillingOnFailure(
          billing,
          architectCost,
          'Auto-refund Easy Architect (internal-error)',
          { modelId: modelToUse }
        )
      : undefined;

    return Response.json(
      {
        error: refundedWallet
          ? `เซิร์ฟเวอร์ขัดข้องชั่วคราวระหว่างสร้างเพลง (คืน ${architectCost} เครดิตให้แล้วอัตโนมัติ)`
          : 'เซิร์ฟเวอร์ขัดข้องชั่วคราวระหว่างสร้างเพลง (ไม่หักเครดิต) กรุณาลองใหม่อีกครั้ง',
        code: 'ARCHITECT_INTERNAL_ERROR',
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
      },
      { status: 500 }
    );
  }
}
