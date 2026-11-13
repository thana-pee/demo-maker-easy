import { countThaiEnglishSyllables } from '@/lib/thaiRhymeHelper';

export interface AdvanceLyricsRequestBody {
  mood: string;
  topic: string;
  chordProgression: string[];
  existingLyrics?: string;
  sectionType: string;
}

export interface AdvanceLyricLine {
  chord: string;
  text: string;
  syllables: number;
}

export interface AdvanceLyricsResponseBody {
  isSimulated: boolean;
  model: string;
  sectionType: string;
  chordsUsed: string[];
  lines: AdvanceLyricLine[];
  fullLyrics: string;
  tip: string;
}

function buildSimulatedLyrics(body: AdvanceLyricsRequestBody): AdvanceLyricsResponseBody {
  const chords = body.chordProgression.length > 0 ? body.chordProgression : ['C', 'G', 'Am', 'F'];
  const moodLower = body.mood.toLowerCase();
  const topic = body.topic.trim();
  const sec = body.sectionType.toLowerCase();

  let templates: string[];
  if (moodLower.includes('sad') || moodLower.includes('เศร้า') || moodLower.includes('อกหัก') || moodLower.includes('break')) {
    templates = [
      `ยังมองดูเรื่องราว${topic ? `ของ${topic}` : 'ในวันวาน'}ไม่จางหาย`,
      `ปล่อยใจให้สายลมช่วยพัดพาความอ่อนล้าไป`,
      sec.includes('chorus')
        ? `แม้ในคืนนี้จะไม่มีเธออยู่ข้างกาย แต่หัวใจยังคงจำไว้ไม่เคยลืม`
        : `เก็บทุกคำสัญญาไว้ข้างใน แม้สุดท้ายต้องปล่อยมือกันไป`,
      `รอวันที่ท้องฟ้ากลับมาสดใส และหัวใจจะเข้มแข็งได้อีกครั้ง`,
    ];
  } else if (moodLower.includes('nostalg') || moodLower.includes('คิดถึง') || moodLower.includes('miss')) {
    templates = [
      `ค่ำคืนนี้มีเพียงแสงดาวกับเรื่อง${topic || 'ของเราสองคน'}`,
      `เสียงเพลงเดิมยังคงดังก้องในความทรงจำไม่เคยเปลี่ยน`,
      sec.includes('chorus')
        ? `ฝากลมช่วยบอกเธอทีว่าฉันยังคิดถึงอยู่เสมอ`
        : `มองดูรูปถ่ายใบเก่าแล้วยิ้มเบาๆ กับวันเวลาที่แสนดี`,
      `ไม่ว่าห่างไกลกันสักเพียงใด ใจยังผูกพันเหมือนเดิมทุกนาที`,
    ];
  } else {
    templates = [
      `แสงแดดอุ่นตอนเช้าปลุกเรื่องราว${topic ? `ของ${topic}` : 'แสนดี'}ให้ตื่นขึ้น`,
      `แค่มีเธอเดินเคียงข้างกันไป เส้นทางนี้ก็ดูสดใสขึ้นมาทันที`,
      sec.includes('chorus')
        ? `จับมือกันไว้ให้นานแสนนาน ให้หัวใจได้พักพิงอยู่ตรงนี้ตลอดไป`
        : `ทุกวินาทีที่มีเธออยู่ข้างกาย คือความหมายที่ตามหามาแสนนาน`,
      `จะเก็บทุกความฝันและรอยยิ้มนี้ไว้ เติมเต็มหัวใจไปพร้อมเสียงเพลง`,
    ];
  }

  if (body.existingLyrics?.trim()) {
    templates[0] = `${body.existingLyrics.trim()} (สานต่อ: ${topic || 'ความรู้สึกในใจ'})`;
  }

  const lines: AdvanceLyricLine[] = templates.map((text, idx) => ({
    chord: chords[idx % chords.length],
    text,
    syllables: countThaiEnglishSyllables(text),
  }));

  return {
    isSimulated: true,
    model: 'demo-offline-poet',
    sectionType: body.sectionType,
    chordsUsed: chords,
    lines,
    fullLyrics: lines.map((l) => l.text).join('\n'),
    tip:
      'Simulation Mode (ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน .env) — สามารถตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์เพื่อเปิดใช้ Gemini 2.5 Flash ได้ทันที',
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
  const mood = typeof obj.mood === 'string' ? obj.mood.trim() : '';
  const topic = typeof obj.topic === 'string' ? obj.topic.trim() : '';
  const sectionType = typeof obj.sectionType === 'string' ? obj.sectionType.trim() : 'verse';
  const existingLyrics = typeof obj.existingLyrics === 'string' ? obj.existingLyrics.trim() : undefined;
  const chordProgression = Array.isArray(obj.chordProgression)
    ? obj.chordProgression.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : null;

  if (!mood || !topic || chordProgression === null) {
    return Response.json(
      { error: 'Required fields: mood (string), topic (string), chordProgression (string[])' },
      { status: 400 }
    );
  }

  const payload: AdvanceLyricsRequestBody = {
    mood,
    topic,
    chordProgression,
    existingLyrics,
    sectionType,
  };

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(buildSimulatedLyrics(payload), { status: 200 });
  }

  try {
    const promptText = [
      'You are a top Thai & bilingual acoustic pop songwriter.',
      `Write 4 poetic, singable Thai (or light Thai-English) lyric lines for a "${sectionType}" section.`,
      `Mood: ${mood}`,
      `Topic: ${topic}`,
      `Chord progression: ${chordProgression.join(' -> ') || 'C -> G -> Am -> F'}`,
      existingLyrics ? `Existing draft lyrics to continue/refine: "${existingLyrics}"` : '',
      'Respond ONLY in strict JSON: {"lines": ["line1", "line2", "line3", "line4"], "tip": "short songwriting note"}',
    ]
      .filter(Boolean)
      .join('\n');

    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.85,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const sim = buildSimulatedLyrics(payload);
      return Response.json(
        {
          ...sim,
          tip: `Gemini API unavailable (HTTP ${geminiRes.status}) — แสดงผลโหมดจำลองแทนอย่างปลอดภัย`,
        },
        { status: 200 }
      );
    }

    const data = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText) as { lines?: unknown; tip?: unknown };
    const rawLines = Array.isArray(parsed.lines)
      ? parsed.lines.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
      : [];

    if (rawLines.length === 0) {
      return Response.json(buildSimulatedLyrics(payload), { status: 200 });
    }

    const chords = chordProgression.length > 0 ? chordProgression : ['C', 'G', 'Am', 'F'];
    const lines: AdvanceLyricLine[] = rawLines.map((text, idx) => ({
      chord: chords[idx % chords.length],
      text: text.trim(),
      syllables: countThaiEnglishSyllables(text),
    }));

    const result: AdvanceLyricsResponseBody = {
      isSimulated: false,
      model: 'gemini-2.5-flash',
      sectionType,
      chordsUsed: chords,
      lines,
      fullLyrics: lines.map((l) => l.text).join('\n'),
      tip: typeof parsed.tip === 'string' ? parsed.tip : 'สร้างโดย Gemini 2.5 Flash ให้เข้ากับคอร์ดของท่อนนี้แล้ว',
    };
    return Response.json(result, { status: 200 });
  } catch {
    return Response.json(buildSimulatedLyrics(payload), { status: 200 });
  }
}
