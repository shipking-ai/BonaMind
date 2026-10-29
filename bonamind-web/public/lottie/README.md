# Lottie Asset Drop-In

Lottie JSON files placed in this directory are served at
`/lottie/&lt;filename&gt;.json` from inside the React app.

The shared `<LottiePlayer src="/lottie/..." />` component lazy-fetches
the JSON on mount and renders it via `lottie-react`. If the file is
missing or fails to load it silently renders an empty placeholder
with the same `className` — so **dropping a JSON into this folder is
the only step needed to enable it** wherever a layout component
imports `<LottiePlayer />`.

## Worker usage from Jitter (recommended)

1. Sign up at https://jitter.video (the free tier is fine).
2. Open a new composition at **256×256** for chip-style icons or
   **512×512** for centerpiece loops.
3. Produce the animation matching one of the prompts in the spec
   doc (the Jitter prompts plan to drop in next to the Brutalist
   feature chips).
4. Export → **Lottie JSON** (not MP4, so it stays vector at any DPI).
5. Save the JSON into this folder with a stable filename
   (case-sensitive).

> Not currently imported anywhere — once a layout component needs
> it, add:
>
> ```tsx
> import { LottiePlayer } from '../lottie/LottiePlayer';
> // in JSX:
> <LottiePlayer
>   animationUrl="/lottie/feature-source-to-deck.json"
>   className="w-12 h-12"
> />
> ```

## Verification

```bash
npx serve public/lottie
# Visit http://localhost:5000/lottie/feature-source-to-deck.json
# Expect a JSON blob, not a 404.
```

## Golden rules

- File size: ≤ 80 KB per JSON. Lottie is small on purpose — anything
  over 100 KB usually means an embedded raster that should be exported
  as MP4 instead.
- Loop length: 1.5–3.0s. Anything slower drags the page; faster looks
  frantic next to copy.
- Naming: lowercase kebab-case. Match the slot name in the layout
  component where it's mounted.
