/**
 * MicBlockedArt — shown when SpeechRecognition reports `not-allowed`.
 *
 * This is the one empty state that has to teach a fix, so it draws the
 * thing the user must click: the browser address bar with its permission
 * chip. Abstract art here would be a wasted opportunity — the user needs
 * to recognise the target, not admire a graphic.
 *
 * 160×120 grid, shared with the other illustrations.
 */
export function MicBlockedArt({ size = 160, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      className={className}
      fill="none"
      role="img"
      aria-label="Microphone access is blocked in this browser"
    >
      {/* Browser chrome, cropped — enough to be recognisable, not a full
          window illustration competing with the real UI behind it. */}
      <rect
        x={16}
        y={30}
        width={128}
        height={34}
        rx={8}
        stroke="currentColor"
        strokeWidth={2}
        opacity={0.45}
      />

      {/* The permission chip, drawn at full strength — this is the target. */}
      <g transform="translate(28 39)">
        <rect x={0} y={0} width={18} height={16} rx={5} stroke="currentColor" strokeWidth={2} />
        <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <rect x={6.5} y={3.5} width={5} height={6.5} rx={2.5} />
          <path d="M5 9a4 4 0 0 0 8 0" />
        </g>
        {/* Strike sits on the chip, so the meaning is "this control is off". */}
        <path d="M2 2 16 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </g>

      {/* URL placeholder — deliberately abstract, it is not the subject. */}
      <path
        d="M56 47h64"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.25}
      />

      {/* Pointer indicating the chip. Angled from below-right so it does
          not cover the thing it is pointing at. */}
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M52 84 41 62" opacity={0.55} />
        <path d="M37 62h9v9" opacity={0.55} transform="rotate(-18 41 62)" />
      </g>
    </svg>
  );
}
