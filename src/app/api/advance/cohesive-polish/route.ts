import {
  buildCohesivePolishSystemPrompt,
  buildCohesivePolishUserPrompt,
  COHESIVE_POLISH_RESPONSE_SCHEMA,
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
  type ServerBillingPreDeductResult,
  type WalletBalanceSummary,
} from '@/lib/serverWallet';
import { recordServerFeatureEvent } from '@/lib/serverAnalytics';
import { applyGenreBandArrangement } from '@/lib/songArchitect';
import { generateLyricAlignedGuideMelody } from '@/lib/melodyUtils';
import { parseChord } from '@/lib/chordUtils';
import type { BarPlayStyle, SongBar, SongProject, SongSection } from '@/types/song';

export const maxDuration = 60;

export interface AdvanceCohesivePolishResponseBody {
  isSimulated: boolean;
  model: string;
  song: SongProject;
  producerSummary: string;
  tip: string;
  usage?: GeminiTokenUsage;
  wallet?: WalletBalanceSummary;
  failureReason?: string;
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
  const rawSong = obj.song as SongProject | undefined;
  if (!rawSong || !Array.isArray(rawSong.sections) || rawSong.sections.length === 0) {
    return Response.json(
      { error: 'Required field: song (SongProject with sections)' },
      { status: 400 }
    );
  }

  const song = rawSong;
  const lyricsRetentionPct =
    obj.lyricsRetentionPct === 40 || obj.lyricsRetentionPct === 75 || obj.lyricsRetentionPct === 100
      ? obj.lyricsRetentionPct
      : 75;
  const chordsRetentionPct =
    obj.chordsRetentionPct === 30 || obj.chordsRetentionPct === 70 || obj.chordsRetentionPct === 100
      ? obj.chordsRetentionPct
      : 100;
  const lockedSectionIds = Array.isArray(obj.lockedSectionIds)
    ? (obj.lockedSectionIds as string[])
    : [];
  const rebalanceBand = typeof obj.rebalanceBand === 'boolean' ? obj.rebalanceBand : true;

  const lockedSet = new Set(lockedSectionIds);
  const unlockedSections = song.sections.filter((s) => !lockedSet.has(s.id));

  // If 100% retention on both lyrics and chords: 0 credits local polish
  if (lyricsRetentionPct === 100 && chordsRetentionPct === 100) {
    let resultSong = song;
    if (rebalanceBand) {
      resultSong = applyGenreBandArrangement(resultSong);
    }
    resultSong = {
      ...resultSong,
      sections: resultSong.sections.map((sec) => {
        if (lockedSet.has(sec.id)) return sec;
        return {
          ...sec,
          bars: sec.bars.map((bar, bIdx) => ({
            ...bar,
            melodyNotes:
              sec.type === 'intro'
                ? []
                : generateLyricAlignedGuideMelody({
                    lyrics: bar.lyrics,
                    chord1: bar.chords[0] || 'C',
                    chord2: bar.chordsPerBar === 2 ? bar.chords[1] : undefined,
                    totalSteps: 16,
                    stepsPerBeat: 4,
                    barIndex: bIdx,
                    sectionType: sec.type,
                  }),
          })),
        };
      }),
    };

    return Response.json(
      {
        isSimulated: false,
        model: 'local-rebalance',
        song: resultSong,
        producerSummary:
          'คงเนื้อร้องและคอร์ดเดิม 100% พร้อมปรับบาลานซ์เครื่องดนตรีและซิงค์โน้ตเมโลดี้ให้ตรงคอร์ดเรียบร้อยแล้ว',
        tip: 'ทำงานฝั่ง Client สำเร็จทันทีโดยไม่เสียเครดิต (0 เหรียญ)',
      } satisfies AdvanceCohesivePolishResponseBody,
      { status: 200 }
    );
  }

  // Determine model & credit cost:
  // <= 3 unlocked sections: gemini-3.5-flash-lite (2 credits)
  // > 3 unlocked sections: gemini-4-hydrogen (3 credits)
  const isPartial = unlockedSections.length <= 3;
  const modelToUse = isPartial ? GEMINI_MODEL_LITE : GEMINI_MODEL_MAIN;
  const cost = isPartial
    ? CREDIT_COST_TABLE.aiCohesivePolishPartial
    : CREDIT_COST_TABLE.aiCohesivePolishWhole;
  const timeoutMs = isPartial ? 18_000 : 32_000;

  let billing: ServerBillingPreDeductResult = { active: false };

  try {
    billing = await tryServerBillingPreDeduct(
      request,
      cost,
      `Cohesive Polish (${modelToUse}): ${song.title?.slice(0, 24) || 'Song'}`,
      { modelId: modelToUse }
    );
    if (billing.active && 'errorStatus' in billing) {
      return Response.json(
        { error: billing.error, code: billing.errorCode },
        { status: billing.errorStatus }
      );
    }

    const systemInstruction = buildCohesivePolishSystemPrompt({
      thaiGenre: song.thaiGenre,
      songwriterStyle: song.songwriterStyle,
      bpm: song.bpm,
      timeSignature: song.timeSignature,
    });

    const userPrompt = buildCohesivePolishUserPrompt({
      song,
      lyricsRetentionPct,
      chordsRetentionPct,
      lockedSectionIds,
      rebalanceBand,
    });

    const gemini = await callGeminiJson<{
      sections?: Array<{
        id?: string;
        bars?: Array<{
          lyrics?: string;
          chords?: string[];
          playStyle?: string;
        }>;
      }>;
      producerSummary?: string;
    }>(userPrompt, {
      model: modelToUse,
      systemInstruction,
      responseSchema: COHESIVE_POLISH_RESPONSE_SCHEMA,
      maxOutputTokens: 3072,
      thinkingLevel: isPartial ? 'minimal' : 'low',
      timeoutMs,
    });

    if (!gemini.ok) {
      // Local graceful fallback
      let fallbackSong = song;
      if (rebalanceBand) {
        fallbackSong = applyGenreBandArrangement(fallbackSong);
      }
      fallbackSong = {
        ...fallbackSong,
        sections: fallbackSong.sections.map((sec) => {
          if (lockedSet.has(sec.id)) return sec;
          return {
            ...sec,
            bars: sec.bars.map((bar, bIdx) => ({
              ...bar,
              melodyNotes:
                sec.type === 'intro'
                  ? []
                  : generateLyricAlignedGuideMelody({
                      lyrics: bar.lyrics,
                      chord1: bar.chords[0] || 'C',
                      chord2: bar.chordsPerBar === 2 ? bar.chords[1] : undefined,
                      totalSteps: 16,
                      stepsPerBeat: 4,
                      barIndex: bIdx,
                      sectionType: sec.type,
                    }),
            })),
          };
        }),
      };

      const refundedWallet = await refundServerBillingOnFailure(
        billing,
        cost,
        `Auto-refund Cohesive Polish (${gemini.reason})`,
        { modelId: modelToUse }
      );

      await recordServerFeatureEvent(
        request,
        {
          eventName: 'ai_whole_song_cohesive_polish',
          category: 'ai',
          songwriterStyle: song.songwriterStyle,
          thaiGenre: song.thaiGenre,
          featureVariant: isPartial ? 'partial_3sections' : 'whole_song',
          isSimulated: true,
          creditsCost: 0,
        },
        {
          userId: billing.active && 'userId' in billing ? billing.userId : undefined,
          skipAuthLookup: billing.active,
        }
      );

      return Response.json(
        {
          isSimulated: true,
          model: 'demo-offline-polish',
          song: fallbackSong,
          producerSummary:
            'ปรับแต่งจังหวะการเล่นและจัดวงดนตรีให้เข้ากันในโหมดจำลอง (ไม่หักเครดิต)',
          tip:
            gemini.reason === 'missing-key'
              ? 'โหมดจำลอง Cohesive Polish (ยังไม่ได้ตั้งค่า GEMINI_API_KEY) — ไม่หักเครดิต'
              : `${gemini.failureReason} — จำลองการปรับจูนแทนโดยไม่หักเครดิต`,
          ...(refundedWallet ? { wallet: refundedWallet } : {}),
          failureReason: gemini.reason,
        } satisfies AdvanceCohesivePolishResponseBody,
        { status: 200 }
      );
    }

    // Merge AI response into song
    const returnedSections = Array.isArray(gemini.data.sections) ? gemini.data.sections : [];
    const returnedMapById = new Map<string, { bars?: Array<{ lyrics?: string; chords?: string[]; playStyle?: string }> }>();
    returnedSections.forEach((s) => {
      if (s && typeof s.id === 'string') {
        returnedMapById.set(s.id, s);
      }
    });

    const mergedSections: SongSection[] = song.sections.map((sec, secIdx) => {
      // Rule 1: NEVER modify locked sections
      if (lockedSet.has(sec.id)) {
        return sec;
      }

      const match = returnedMapById.get(sec.id) ?? returnedSections[secIdx];
      if (!match || !Array.isArray(match.bars)) {
        return sec;
      }

      const updatedBars: SongBar[] = sec.bars.map((bar, barIdx) => {
        const pBar = match.bars?.[barIdx];
        if (!pBar) return bar;

        let nextLyrics = bar.lyrics;
        if (typeof pBar.lyrics === 'string') {
          nextLyrics = pBar.lyrics.trim();
        }

        let nextChords = bar.chords;
        if (Array.isArray(pBar.chords) && pBar.chords.length > 0) {
          const cleaned = pBar.chords
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            .map((c) => {
              const parsed = parseChord(c);
              return parsed.root + parsed.quality;
            });
          if (cleaned.length > 0) {
            nextChords = cleaned.slice(0, 2);
          }
        }

        let nextPlayStyle: BarPlayStyle = bar.playStyle;
        if (pBar.playStyle === 'normal' || pBar.playStyle === 'let-ring' || pBar.playStyle === 'break') {
          nextPlayStyle = pBar.playStyle;
        }

        return {
          ...bar,
          lyrics: nextLyrics,
          chords: nextChords,
          playStyle: nextPlayStyle,
          melodyNotes:
            sec.type === 'intro'
              ? []
              : generateLyricAlignedGuideMelody({
                  lyrics: nextLyrics,
                  chord1: nextChords[0] || 'C',
                  chord2: nextChords.length >= 2 ? nextChords[1] : undefined,
                  totalSteps: 16,
                  stepsPerBeat: 4,
                  barIndex: barIdx,
                  sectionType: sec.type,
                }),
        };
      });

      return {
        ...sec,
        bars: updatedBars,
      };
    });

    let polishedSong: SongProject = {
      ...song,
      updatedAt: new Date().toISOString(),
      sections: mergedSections,
    };

    if (rebalanceBand) {
      polishedSong = applyGenreBandArrangement(polishedSong);
    }

    await recordServerFeatureEvent(
      request,
      {
        eventName: 'ai_whole_song_cohesive_polish',
        category: 'ai',
        songwriterStyle: song.songwriterStyle,
        thaiGenre: song.thaiGenre,
        featureVariant: isPartial ? 'partial_3sections' : 'whole_song',
        isSimulated: false,
        creditsCost: cost,
      },
      {
        userId: billing.active && 'userId' in billing ? billing.userId : undefined,
        skipAuthLookup: billing.active,
      }
    );

    const producerSummary =
      typeof gemini.data.producerSummary === 'string' && gemini.data.producerSummary.trim()
        ? gemini.data.producerSummary.trim()
        : `เกลาเชื่อมโยง ${unlockedSections.length} ท่อนให้เข้ากับเพลง "${song.title}" ด้วย ${gemini.modelUsed} เรียบร้อยแล้ว`;

    return Response.json(
      {
        isSimulated: false,
        model: gemini.modelUsed,
        song: polishedSong,
        producerSummary,
        tip: `เกลาเชื่อมเพลงสำเร็จ (${isPartial ? '≤3 ท่อน' : 'ทั้งเพลง'} · หัก ${cost} เครดิต)`,
        usage: gemini.usage,
        ...(billing.active ? { wallet: billing.wallet } : {}),
      } satisfies AdvanceCohesivePolishResponseBody,
      { status: 200 }
    );
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safeMsg = rawMsg
      .replace(/AIza[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
    console.error('[cohesive-polish] unexpected failure:', safeMsg);

    const refundedWallet = await refundServerBillingOnFailure(
      billing,
      cost,
      'Auto-refund Cohesive Polish (internal-error)',
      { modelId: modelToUse }
    );

    return Response.json(
      {
        error: refundedWallet
          ? `เซิร์ฟเวอร์ขัดข้องชั่วคราวระหว่างเกลาเพลง (คืน ${cost} เครดิตให้แล้วอัตโนมัติ)`
          : 'เซิร์ฟเวอร์ขัดข้องชั่วคราวระหว่างเกลาเพลง (ไม่หักเครดิต) กรุณาลองใหม่อีกครั้ง',
        code: 'COHESIVE_POLISH_INTERNAL_ERROR',
        ...(refundedWallet ? { wallet: refundedWallet } : {}),
      },
      { status: 500 }
    );
  }
}
