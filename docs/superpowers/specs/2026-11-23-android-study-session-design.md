# Android study session screen — design

Date: 2026-11-23 · Status: proposed

## Intent

The Android app is the last platform that runs a study session on the
browser's layout, restyled for the phone by `.android-study-page` CSS
overrides. Every piece added to the browser session since has reached the
phone unstyled: the multiplayer banner under the status bar, the desk video
over the header, and voice buttons under the gesture bar (fixed one by one
in #292). iPhone (`IOSStudySession`) and Windows (`WindowsStudySession`)
each have their own screen. Android should too, so it looks and feels like
the rest of the Android app and stops inheriting browser changes.

## Goals

- A focused session screen built for a phone, matching the iPhone screen's
  scope (the user's choice): close, deck title, "N of M", voice toggle,
  progress bar, the card, and four grade buttons with their intervals.
- Looks like the rest of the Android app (dark navy, purple and cyan, the
  Prism card), not like iOS glass.
- Feels native on Android: swipe right for Good, left for Again, up for
  Easy once the answer shows; a light haptic on flip and on each grade;
  touch targets of at least 48dp; edge-to-edge with the status-bar and
  gesture-bar insets.
- Voice study keeps working (the shared `VoiceStudyControls` panel).
- A matching "session complete" screen.

## Non-goals

- No change to grading, scheduling, saving, XP or streaks: those stay in
  `StudyModePage` and are shared with every platform.
- No change to the browser, iPhone or Windows sessions.
- The phone's Study tab (deck picker, `AndroidStudy`) is unchanged.

## Anti-goals

- Anything from the browser session leaking back onto the phone screen.
- A screen that only looks right on one phone size; it must hold from a
  small phone to a foldable.

## Approaches

1. **New `AndroidStudySession` component (chosen).** A component of its
   own in `components/native/`, picked by `studyDesign()` the way iOS and
   Windows are. Costs a new file and its styles; gives Android a screen it
   owns, and the browser can change freely.
2. **Reuse `IOSStudySession` with an Android skin.** Less code, but it ties
   two platforms together: iOS haptics, the iOS card-style preference and
   glass styling would all need Android branches, and a change for one
   would risk the other.
3. **Keep restyling the browser page with CSS.** What exists today; every
   browser change can break the phone again. Ruled out.

## Design

- `studyDesign()` returns `'android'` for the Android app; `StudyModePage`
  renders `AndroidStudySession` (and `AndroidStudyComplete` when done)
  with the same props `IOSStudySession` takes: deck title and id, card,
  index, total, flipped, `onFlip`, `onRate`, `onExit`, intervals, voice
  mode and its toggle, and the voice panel.
- Layout, top to bottom: header (close, title + "3 of 8", mic toggle) under
  the status-bar inset; a thin progress bar; the card filling the middle;
  the voice panel when voice is on; then the footer, above the gesture-bar
  inset, showing "Tap the card to see the answer" before the flip and the
  four grade buttons (label + interval) after.
- Gestures: tap to flip; after the flip, drag right / left / up past a
  threshold grades Good / Again / Easy, with a stamp that fades in while
  dragging. The system back gesture ends the session (already handled by
  `NativeRuntime`).
- Haptics through the existing `components/native/androidHaptics.ts`.
- Styles in a new `android-study-session` block in `android-native.css`.
  The old `.android-study-page` overrides in `platform-styles.css` are
  removed, since nothing renders that page on Android any more.

## Builder's calls (mine, open to correction)

- "Study with others", Flow Mode, the timer, XP particles and the AI
  fact-check note are left out, as on iPhone.
- If #292 merges first, this work deletes its CSS along with the rest of
  the `.android-study-page` rules; if this lands first, #292 can be closed.

## Testing

- Component tests: tap flips; each grade button and each swipe direction
  calls `onRate` with the right rating; intervals show; the mic toggle
  calls `onToggleVoice`; the voice panel renders when given.
- A `StudyModePage` render test as the Android app: the Android session is
  used and the browser layout (`android-study-page`) is not.
- Checked by hand on the Pixel emulator: before and after flip, voice on,
  and the complete screen.
