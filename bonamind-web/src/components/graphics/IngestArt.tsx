import '../../styles/graphics.css';

/**
 * IngestArt — the two generator entry points, drawn as one idea.
 *
 * Both variants show a source becoming cards, because that transformation
 * is what the user is buying. They share a layout so switching tabs in the
 * generator doesn't feel like switching products.
 *
 * 160×120 grid. `processing` swaps the static feed line for a crawling
 * dash, giving the upload flow a truthful in-progress state without a
 * separate spinner component.
 */

interface IngestProps {
  size?: number;
  className?: string;
  /** Animates the feed line while transcription/extraction is running. */
  processing?: boolean;
}

/** Cards emerging on the right. Shared by both variants. */
function OutputCards() {
  return (
    <g stroke="currentColor" strokeLinejoin="round">
      <rect x={116} y={30} width={32} height={40} rx={5} strokeWidth={1.5} opacity={0.3} />
      <rect x={106} y={40} width={36} height={44} rx={5} strokeWidth={2} opacity={0.85} />
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.45}>
        <path d="M114 54h18" />
        <path d="M114 64h12" />
      </g>
    </g>
  );
}

/** The arrow between source and output. */
function Feed({ processing }: { processing?: boolean }) {
  return (
    <g stroke="currentColor" strokeLinecap="round" opacity={0.55}>
      <path
        d="M64 60h30"
        strokeWidth={2}
        strokeDasharray="4 6"
        className={processing ? 'am-crawl' : undefined}
      />
      <path d="M88 54l6 6-6 6" strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
}

/** Audio → flashcards. */
export function AudioIngestArt({ size = 160, className, processing }: IngestProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label={processing ? 'Transcribing your audio' : 'Turn a recording into flashcards'}
    >
      {/* Waveform in a rounded well — the same bar language as VoiceOrb. */}
      <rect
        x={14}
        y={36}
        width={44}
        height={48}
        rx={7}
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.5}
      />
      <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M24 54v12" opacity={0.6} />
        <path d="M31 46v28" opacity={0.85} />
        <path d="M38 50v20" />
        <path d="M45 56v8" opacity={0.6} />
      </g>
      <Feed processing={processing} />
      <OutputCards />
    </svg>
  );
}

/** Document → study materials. */
export function DocumentIngestArt({ size = 160, className, processing }: IngestProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label={processing ? 'Reading your document' : 'Turn a document into study materials'}
    >
      {/* Page with a folded corner — the fold is what makes it read as a
          document rather than another card. */}
      <path
        d="M16 32h26l16 16v36a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V36a4 4 0 0 1 4-4z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={0.6}
      />
      <path
        d="M42 32v16h16"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        opacity={0.6}
      />
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.45}>
        <path d="M24 60h26" />
        <path d="M24 68h26" />
        <path d="M24 76h16" />
      </g>
      <Feed processing={processing} />
      <OutputCards />
    </svg>
  );
}
