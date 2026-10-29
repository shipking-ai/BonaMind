/**
 * audioToFlashcardsService — turns a lecture recording (or any audio clip)
 * into a flashcard deck.
 *
 * Pipeline:
 *   1. transcribeAudio(audioBlob)  → text via Groq Whisper
 *   2. generateFlashcards(transcript) → cards via the existing Groq LLM
 *   3. generateDeckTitle(transcript) → a sensible deck name
 *
 * All steps reuse existing services (groqClient, groqService) so there's
 * no new API surface to maintain.
 */
import { transcribeAudio } from '../api/groqService';
import { generateFlashcards, type GeneratedCard } from '../api/groqService';

export interface AudioDeckResult {
  title: string;
  description: string;
  transcript: string;
  cards: GeneratedCard[];
}

/** Build a deck title from the first ~60 chars of the transcript. */
export function inferTitleFromTranscript(transcript: string): string {
  const cleaned = transcript.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Audio Notes';
  const firstSentence = cleaned.split(/[.!?]/)[0].trim();
  const short = firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}…` : firstSentence;
  return short || 'Audio Notes';
}

export async function audioToFlashcards(
  audio: Blob,
  mimeType?: string,
  onProgress?: (stage: string) => void,
): Promise<AudioDeckResult> {
  onProgress?.('Transcribing audio…');
  const transcript = await transcribeAudio(audio, mimeType);
  if (!transcript.trim()) {
    throw new Error('No speech detected in the audio. Please try a clearer recording.');
  }

  onProgress?.('Generating flashcards…');
  const cards = await generateFlashcards(transcript, {
    cardStyle: 'conceptual',
    difficulty: 'mixed',
    includeExplanations: true,
  });

  return {
    title: inferTitleFromTranscript(transcript),
    description: `Auto-generated from a ${(audio.size / 1024 / 1024).toFixed(1)} MB audio recording.`,
    transcript,
    cards,
  };
}
