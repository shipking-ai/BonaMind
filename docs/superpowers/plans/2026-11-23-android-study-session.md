# Android Study Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Android app its own focused study-session and session-complete screens, as iPhone and Windows have.

**Architecture:** `studyDesign()` gains an `'android'` result. `StudyModePage` keeps the queue, grading and saving, and renders the new presentation-only `AndroidStudySession` / `AndroidStudyComplete` for it. The browser layout's `.android-study-page` CSS overrides are deleted.

**Tech Stack:** React 19, framer-motion (drag + flip), Vitest + Testing Library, CSS in `styles/android-native.css`.

**Spec:** `docs/superpowers/specs/2026-11-23-android-study-session-design.md`

## Global Constraints

- Presentation only: no change to grading, scheduling, saving, XP or streaks.
- Browser, iPhone and Windows sessions unchanged; `preview` still picks `'ios'`.
- Swipe thresholds: right → `Rating.GOOD`, left → `Rating.AGAIN`, up → `Rating.EASY`, 110px, only after the flip.
- Touch targets ≥ 48px; header below `env(safe-area-inset-top)`, footer above `env(safe-area-inset-bottom)`.
- Haptics via `components/native/androidHaptics.ts` only (no-ops off-device).
- Left out (as on iPhone): multiplayer banner, Flow Mode, timer, XP particles, fact-check note.

## Review Focus

- A long answer (several paragraphs) must scroll inside the card, never push the grade buttons off screen.
- A small phone (360×640 CSS px) with voice on must still show the card, the voice panel and the footer without overlap.
- A swipe before the flip must not grade.
- A grade tap while the next card animates in must grade once (the page's `isRating` guard; the component must not call `onRate` twice per tap).
- A card with only `question`/`answer` (no `front`/`back`) must still show text.

---

### Task 1: `studyDesign()` picks Android

**Files:**
- Modify: `bonamind-web/src/components/windows/WindowsStudySession.tsx:18-22`
- Test: `bonamind-web/src/__tests__/windowsStudySession.test.tsx` (the `studyDesign` describe)

**Interfaces:**
- Produces: `studyDesign({ platform, preview }): 'windows' | 'ios' | 'android' | 'web'`

- [ ] **Step 1: Failing test** — `it('gives the Android app its own screen')`: `expect(studyDesign({ platform: 'android', preview: false })).toBe('android')`; `expect(studyDesign({ platform: 'android', preview: true })).toBe('ios')`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/windowsStudySession.test.tsx` — FAIL (`'web'`).
- [ ] **Step 3: Implement** — after the iOS/preview line: `if (platform === 'android') return 'android';`
- [ ] **Step 4: Run** — PASS.

### Task 2: `AndroidStudySession` and `AndroidStudyComplete`

**Files:**
- Create: `bonamind-web/src/components/native/AndroidStudySession.tsx`
- Modify: `bonamind-web/src/styles/android-native.css` (new `.android-session` block)
- Test: `bonamind-web/src/__tests__/androidStudySession.test.tsx`

**Interfaces:**
- Produces: `AndroidStudySession(props)` with exactly `IOSStudySession`'s props (`deckTitle, deckId, card, index, total, flipped, onFlip, onRate, onExit, intervals, voiceMode, onToggleVoice, voicePanel?`), root `data-testid="android-study-session"`.
- Produces: `AndroidStudyComplete({ deckTitle, reviewed, correct, elapsedMs, onRestart, onDone })`.

- [ ] **Step 1: Failing tests**
  - tapping the card before the flip calls `onFlip` once; footer reads "Tap the card to see the answer".
  - with `flipped`, buttons Again/Hard/Good/Easy call `onRate(Rating.AGAIN|HARD|GOOD|EASY)` once each; `intervals` render via `formatInterval` (e.g. `{ [Rating.GOOD]: 3 }` shows "3d").
  - header shows `deckTitle` and "3 of 8" for `index=2,total=8`; close calls `onExit`; mic button has `aria-pressed` = `voiceMode` and calls `onToggleVoice`.
  - `voicePanel` renders when given.
  - a card with only `question`/`answer` shows both texts after the flip.
  - `AndroidStudyComplete` shows reviewed count, `Math.round(accuracy*100)%`, `m:ss` time; Done → `onDone`, Study again → `onRestart`.
- [ ] **Step 2: Run** `npx vitest run src/__tests__/androidStudySession.test.tsx` — FAIL (module missing).
- [ ] **Step 3: Implement** — same structure as `IOSStudySession` (drag only when flipped, `dragSnapToOrigin`, stamps fading with offset, 3D flip); Prism card styling; `hapticTap()` on flip, `hapticSelection()` on each grade; card body `overflow-y: auto`; layout a full-height flex column (`100dvh`).
- [ ] **Step 4: Run** — PASS.

### Task 3: Wire it in and drop the browser-layout overrides

**Files:**
- Modify: `bonamind-web/src/pages/study/StudyModePage.tsx` (render `AndroidStudyComplete` when `completed && androidDesign`; `AndroidStudySession` when `androidDesign && currentCard`, voice panel as on iOS; remove `android-study-*` classes and `isAndroidApp ? 'android-study-page'`)
- Modify: `bonamind-web/src/styles/platform-styles.css` (delete every `.android-study-page` rule)
- Test: `bonamind-web/src/__tests__/androidStudyPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 `'android'`; Task 2 components.

- [ ] **Step 1: Failing test** — render `StudyModePage` as the Android app (nativeShim `getPlatform: 'android'`, mocked `useCurrentUserId`, `loadOfflineAwareData`, `useMultiplayerStudy`, `HTMLMediaElement.play` stub) at `/dashboard/study/deck-1`: `getByTestId('android-study-session')` exists; `container.querySelector('.android-study-page')` and `video` are null; "Study with others" absent.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the wiring and deletions.
- [ ] **Step 4: Run** the three new test files plus `liveActivityDriver`, `windowsStudy*`, then `npm run type-check` and `npm run lint` — all pass.
- [ ] **Step 5: Commit** `feat(android): give the Android app its own study session screen` and verify on the Pixel emulator (before/after flip, voice on, complete screen).
