/**
 * Ambient module declarations for vendored browser SDKs that ship without
 * TypeScript types.
 *
 * `@heyputer/puter.js` is a browser-only ESM SDK whose public API surface
 * we touch in a few narrow places (auth.isSignedIn, auth.signIn, ai.chat).
 * TypeScript's structural typing is enough for our usage — we cast the
 * dynamic import's resolved value to a narrow `any`-ish shape internally,
 * so a loose ambient declaration here is fine.
 *
 * What this file is NOT
 * ─────────────────────
 * Not a full type definition for the Puter SDK. The vendored types from
 * `@heyputer/puter.js` (if they ever publish them) will shadow this once
 * installed; that is the desired outcome. Until then, TypeScript treats
 * `import('@heyputer/puter.js')` as `Promise<any>`, which is what our
 * `puterProvider.ts` already expects.
 */
declare module '@heyputer/puter.js' {
  const mod: any;
  export default mod;
}

declare module 'react-katex' {
  import { ComponentType } from 'react';
  interface MathComponentProps {
    math: string;
    block?: boolean;
    throwOnError?: boolean;
    errorColor?: string;
    renderError?: (error: Error) => React.ReactNode;
    settings?: Record<string, unknown>;
  }
  export const InlineMath: ComponentType<MathComponentProps>;
  export const BlockMath: ComponentType<MathComponentProps>;
}
