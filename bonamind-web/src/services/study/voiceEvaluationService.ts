/**
 * voiceEvaluationService — grades a student's spoken answer against the
 * flashcard's expected answer using the existing Groq chain.
 *
 * The service is intentionally small and typed: it takes the card prompt +
 * expected answer + the student's free‑spoken response and returns a
 * verdict. Falls back to a lenient substring heuristic if the AI chain is
 * unavailable so voice study never hard-fails on a transient API error.
 */
import { getDeepSeekClient } from '../api/groqService';

export interface VoiceVerdict {
  /** true if the answer substantially matches the expected answer */
  correct: boolean;
  /** human-readable justification shown in the transcript panel */
  feedback: string;
  /** 0..1 confidence of the grader */
  confidence: number;
  /** true when the AI chain was down and we used the offline heuristic */
  fallback: boolean;
}

const strip = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Offline fallback: checks whether the spoken answer shares the core
 * keyphrases of the expected answer. Lenient — a single strong overlap is
 * treated as correct to avoid penalising varied phrasing.
 */
function heuristicVerdict(expected: string, spoken: string): VoiceVerdict {
  const exp = strip(expected);
  const spk = strip(spoken);
  if (!exp || !spk) {
    return { correct: false, feedback: 'Could not evaluate — try rephrasing.', confidence: 0.3, fallback: true };
  }
  // Longest common words. Use a light bigram/word overlap.
  const expWords = new Set(exp.split(' '));
  const spkWords = spk.split(' ');
  const hits = spkWords.filter(w => w.length > 3 && expWords.has(w)).length;
  const ratio = hits / Math.max(1, expWords.size);
  const correct = ratio >= 0.4 || spk.includes(exp);
  return {
    correct,
    feedback: correct
      ? 'Sounds right — key terms match.'
      : 'Not quite — review the expected answer and try again.',
    confidence: correct ? 0.6 : 0.5,
    fallback: true,
  };
}

export async function evaluateSpokenAnswer(
  question: string,
  expectedAnswer: string,
  spokenAnswer: string,
): Promise<VoiceVerdict> {
  const trimmed = spokenAnswer.trim();
  if (!trimmed) {
    return { correct: false, feedback: 'No answer heard.', confidence: 0, fallback: true };
  }

  const client = getDeepSeekClient();
  const prompt = `You are grading a student's spoken answer to a flashcard. Be generous with paraphrases, synonyms and partially-correct answers — the goal is to reinforce learning, not penalise wording.

Question: "${question}"
Expected answer: "${expectedAnswer}"
Student said: "${trimmed}"

Respond with ONLY valid JSON:
{
  "correct": true | false,
  "feedback": "one short, encouraging sentence",
  "confidence": 0.0 to 1.0
}`;

  try {
    const response = await client.chat([{ role: 'user', content: prompt }]);
    const content = response.choices?.[0]?.message?.content ?? '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no JSON in response');
    const parsed = JSON.parse(match[0]);
    return {
      correct: !!parsed.correct,
      feedback: String(parsed.feedback ?? ''),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      fallback: false,
    };
  } catch (err) {
    console.warn('[voiceEvaluationService] AI chain unavailable, using heuristic:', err);
    return heuristicVerdict(expectedAnswer, trimmed);
  }
}
