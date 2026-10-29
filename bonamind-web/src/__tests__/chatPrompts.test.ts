import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, type PromptContext } from '../lib/chat-prompts';

function baseContext(overrides: Partial<PromptContext> = {}): PromptContext {
  return {
    deckName: 'Cell Biology',
    deckCardCount: 24,
    cardsDueToday: 5,
    weakCards: [],
    mode: 'study',
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('renders the CONCEPT WEAKNESSES block in study mode when present', () => {
    const prompt = buildSystemPrompt(
      baseContext({
        conceptWeaknesses: [
          {
            concept: 'atp synthase',
            weakCardCount: 2,
            totalLapses: 5,
            avgDifficulty: 7,
            topCards: [{ term: 'What powers ATP synthase?', lapses: 3 }],
          },
        ],
      }),
    );
    expect(prompt).toContain('CONCEPT WEAKNESSES');
    expect(prompt).toContain('atp synthase: 5 lapses across 2 cards, difficulty 7.0/10');
    expect(prompt).toContain('What powers ATP synthase?');
  });

  it('omits the CONCEPT WEAKNESSES block when absent', () => {
    const prompt = buildSystemPrompt(baseContext());
    expect(prompt).not.toContain('CONCEPT WEAKNESSES');
  });

  it('renders PRIOR CONVERSATION MEMORY when provided', () => {
    const prompt = buildSystemPrompt(
      baseContext({ priorConversations: 'Previous session: "Biology"\nStudent: explain mitosis' }),
    );
    expect(prompt).toContain('PRIOR CONVERSATION MEMORY');
    expect(prompt).toContain('Previous session: "Biology"');
  });

  it('softens the companion guardrail to allow only the fed-in memory', () => {
    const prompt = buildSystemPrompt(baseContext({ mode: 'companion' }));
    expect(prompt).toContain('You may reference ONLY the PRIOR CONVERSATION MEMORY block above');
    expect(prompt).not.toContain('NEVER claim to remember past conversations unless');
  });

  it('emits the memory-reference rule in the base voice instructions', () => {
    const prompt = buildSystemPrompt(baseContext());
    expect(prompt).toContain('never claim to remember anything beyond it');
  });
});
