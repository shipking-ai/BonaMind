import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Worklet bodies run on the UI thread. Calling a plain JS function from one
 * (such as useMotion()'s spring()) throws there, and in a release build
 * that throw aborts the whole app: the create screen's source tiles did
 * exactly this, so opening the course-creation sheet crashed every iPhone
 * with Reduce Motion off. Resolve such values on the JS thread, outside the
 * worklet. The jest Reanimated mock runs worklets on the JS thread, so a
 * render test cannot catch this; the source has to be checked directly.
 */

const SRC = join(__dirname, '..', '..');
const WORKLET_HOOKS = /\b(useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedReaction|useFrameCallback)\s*\(/g;
const JS_ONLY_CALLS = /\bspring\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The text between the hook's opening parenthesis and its matching close. */
function hookBody(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

export function workletViolations(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(WORKLET_HOOKS)) {
    const body = hookBody(text, (match.index ?? 0) + match[0].length - 1);
    if (JS_ONLY_CALLS.test(body)) {
      const line = text.slice(0, match.index).split('\n').length;
      found.push(`${match[1]} at line ${line}`);
    }
  }
  return found;
}

describe('worklet bodies', () => {
  it('flags a JS-only call inside a worklet hook', () => {
    expect(workletViolations("const s = useAnimatedStyle(() => ({ x: withSpring(1, spring('pop')) }));")).toEqual(['useAnimatedStyle at line 1']);
    expect(workletViolations("const pop = spring('pop');\nconst s = useAnimatedStyle(() => ({ x: withSpring(1, pop) }));")).toEqual([]);
  });

  it('never call useMotion().spring() on the UI thread', () => {
    const violations = sourceFiles(SRC).flatMap((file) =>
      workletViolations(readFileSync(file, 'utf8')).map((v) => `${relative(SRC, file)}: ${v}`),
    );
    expect(violations).toEqual([]);
  });
});
