import { callGeminiJson, DEFAULT_GEMINI_MODEL } from '@/lib/geminiClient';
import type { AiDirectorPatch, AiDirectorSongSummary } from '@/lib/aiSongDirector';

export interface AdvanceDirectorRequestBody {
  prompt: string;
  songSummary: AiDirectorSongSummary;
}

export interface AdvanceDirectorResponseBody {
  isSimulated: boolean;
  model: string;
  patch: AiDirectorPatch | null;
  tip: string;
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
  const prompt = typeof obj.prompt === 'string' ? obj.prompt.trim() : '';
  const songSummary =
    obj.songSummary && typeof obj.songSummary === 'object'
      ? (obj.songSummary as AiDirectorSongSummary)
      : null;

  if (!prompt || !songSummary || !Array.isArray(songSummary.sections)) {
    return Response.json(
      { error: 'Required fields: prompt (string), songSummary (object with sections[])' },
      { status: 400 }
    );
  }

  const systemPrompt = [
    'You are the AI Music Producer & Studio Mixer Director for Demo Maker Easy.',
    'Convert the user natural-language instruction (Thai or English) into a compact JSON configuration patch matching the exact allowed values below.',
    'Allowed global enums:',
    '- bpm: integer 40..220',
    '- baseKey: valid key root (e.g. "C", "G", "D", "A", "E", "F", "Am", "Em", "Dm")',
    '- timeSignature: "4/4" | "3/4" | "6/8"',
    '- guitarModel: "classical-nylon" | "dreadnought-steel" | "ovation-roundback" | "gibson-les-paul"',
    '- ambience3D: "living-room" | "wood-studio" | "unplugged-hall"',
    'Allowed per-section patch fields inside sectionPatches[]:',
    '- sectionId (prefer exact matching id from songSummary) OR sectionType ("intro"|"verse"|"pre-chorus"|"chorus"|"solo"|"bridge"|"outro")',
    '- intensity: "low" | "medium" | "high"',
    '- boolean toggles: guitarRhythm, guitarLead, bass, piano, drums',
    '- guitarRhythmStyle: "campfire-strum" | "soft-strum" | "fingerpicking"',
    '- guitarLeadStyle: "melodic-solo" | "riff-fills" | "soft-arpeggio"',
    '- guitarLeadDrive: "clean" | "crunch" | "overdrive" | "distortion"',
    '- bassStyle: "root-fifth" | "warm-sustain"',
    '- pianoStyle: "warm-pad" | "gentle-arpeggio"',
    '- drumsStyle: "off" | "shaker-cajon" | "simple-kit"',
    '- volumes (0..100 integer): guitarRhythmVolume, guitarLeadVolume, bassVolume, pianoVolume, drumsVolume',
    '- chords: optional string[] like ["G", "D", "Em", "C"]',
    '- summaryNotes: string[] of short Thai summary bullets describing what you changed.',
    '',
    `Current Song Summary JSON: ${JSON.stringify(songSummary)}`,
    `User Prompt: ${JSON.stringify(prompt)}`,
    '',
    'Respond ONLY with strict valid JSON matching AiDirectorPatch (omit unchanged fields).',
  ].join('\n');

  const gemini = await callGeminiJson<AiDirectorPatch>(systemPrompt, { temperature: 0.25 });

  if (!gemini.ok) {
    const tip =
      gemini.reason === 'http-error'
        ? `Gemini API unavailable (HTTP ${gemini.status}) — ใช้ Offline Parser แทนอัตโนมัติ`
        : `Offline Mode (ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env.local หรือ Vercel) — ใช้ตัววิเคราะห์ในเครื่องแทนอัตโนมัติ (ตั้งค่า key เพื่อเปิดใช้ ${DEFAULT_GEMINI_MODEL})`;
    return Response.json(
      {
        isSimulated: true,
        model: 'demo-offline-director',
        patch: null,
        tip,
      } satisfies AdvanceDirectorResponseBody,
      { status: 200 }
    );
  }

  return Response.json(
    {
      isSimulated: false,
      model: gemini.model,
      patch: gemini.data,
      tip: `จัดมิกซ์และตั้งค่าเพลงด้วย ${gemini.model} เรียบร้อยแล้ว`,
    } satisfies AdvanceDirectorResponseBody,
    { status: 200 }
  );
}
