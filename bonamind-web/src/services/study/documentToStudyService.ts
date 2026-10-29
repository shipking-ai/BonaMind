/**
 * documentToStudyService — turns extracted document text into organised
 * study materials:
 *   - organized notes (markdown, with a TOC + sections)
 *   - presentation slides (structured JSON → rendered as an HTML deck)
 *
 * Uses the existing Groq chain; every step falls back to a clean
 * deterministic summarisation if the AI is unavailable so the user never
 * hits a hard error.
 */
import { GroqUnavailableError } from '../api/groqClient';
import { getDeepSeekClient } from '../api/groqService';

export interface Slide {
  title: string;
  bullets: string[];
}

export interface StudyNotes {
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
}

/** Pull a sensible title from the first non-empty line of document text. */
export function inferDocTitle(text: string): string {
  const first = text
    .split('\n')
    .map(l => l.trim())
    .find(l => l && l.length < 80);
  return first ?? 'Document Study Notes';
}

const stripJson = (content: string) => {
  const m = content.match(/\{[\s\S]*\}/);
  if (m) return m[0];
  const arr = content.match(/\[[\s\S]*\]/);
  return arr ? arr[0] : '';
};

/**
 * Generate organised markdown notes from document text.
 */
export async function generateOrganizedNotes(
  sourceText: string,
): Promise<StudyNotes> {
  const title = inferDocTitle(sourceText);
  const trimmed = sourceText.slice(0, 12000); // cap prompt size

  const client = getDeepSeekClient();
  const prompt = `You are a study note organiser. Convert the following document into well-structured study notes.

Rules:
- Break the content into 3-6 logical sections with clear headings
- Each section body: 2-4 bullet points capturing the key facts, terms, or definitions
- Add a 1-2 sentence summary at the top
- Keep the language dense and study-ready (facts, not fluff)

Document:
"""
${trimmed}
"""

Respond with ONLY valid JSON:
{
  "title": "${title}",
  "summary": "1-2 sentence summary",
  "sections": [
    { "heading": "Section heading", "body": "• key point\n• key point\n• key point" }
  ]
}`;

  try {
    const res = await client.chat([{ role: 'user', content: prompt }]);
    const content = res.choices?.[0]?.message?.content ?? '';
    const json = stripJson(content);
    const parsed = JSON.parse(json);
    return {
      title: parsed.title ?? title,
      summary: parsed.summary ?? '',
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    };
  } catch (err) {
    if (err instanceof GroqUnavailableError) {
      // Deterministic fallback: first line as title, rest chunked.
      const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
      return {
        title,
        summary: lines.slice(0, 2).join(' ').slice(0, 200),
        sections: [
          { heading: 'Key Content', body: lines.slice(0, 12).map(l => `• ${l.slice(0, 140)}`).join('\n') },
        ],
      };
    }
    throw err;
  }
}

/**
 * Generate a presentation (list of slides) from document text.
 */
export async function generatePresentation(
  sourceText: string,
  slideCount = 6,
): Promise<Slide[]> {
  const trimmed = sourceText.slice(0, 12000);
  const client = getDeepSeekClient();

  const prompt = `You are a presentation designer. Convert this document into a concise ${slideCount}-slide presentation outline.

Rules:
- Slide 1: title slide (title = main topic, bullets = 2-3 key themes)
- Middle slides: 3-5 bullet points each, max ~10 words per bullet
- Last slide: key takeaways
- Number of slides must be exactly ${slideCount}

Document:
"""
${trimmed}
"""

Respond with ONLY valid JSON:
[
  { "title": "Slide title", "bullets": ["point 1", "point 2", "point 3"] },
  ...
]`;

  try {
    const res = await client.chat([{ role: 'user', content: prompt }]);
    const content = res.choices?.[0]?.message?.content ?? '';
    const json = stripJson(content);
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, slideCount).map((s: any) => ({
        title: String(s.title ?? ''),
        bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [],
      }));
    }
    throw new Error('expected array');
  } catch (err) {
    if (err instanceof GroqUnavailableError) {
      // Fallback: chunk the text into pseudo-slides so the UI still works.
      const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
      const chunk = Math.max(1, Math.ceil(lines.length / slideCount));
      const slides: Slide[] = [];
      for (let i = 0; i < slideCount; i++) {
        const slice = lines.slice(i * chunk, (i + 1) * chunk).slice(0, 5);
        slides.push({
          title: i === 0 ? inferDocTitle(trimmed) : `Section ${i + 1}`,
          bullets: slice.map(l => l.slice(0, 120)),
        });
      }
      return slides;
    }
    throw err;
  }
}
