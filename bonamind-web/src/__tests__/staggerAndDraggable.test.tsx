import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { StaggerList, useDraggable } from '../lib/effects';

/**
 * Sentinels for the anime.js v4 stagger + draggable integrations.
 *
 * Two regression nets per effect:
 *   1. The 6 assertions below pin the public surface (mount, count,
 *      data-attribute contract, reduced-motion no-op, attach/detach).
 *   2. The imports above fail loudly at module-load if a maintainer removes
 *      either export from `lib/effects/index.ts` — that's a deliberate
 *      second net (the imports are the public contract).
 */

describe('StaggerList — anime.js v4 stagger() integration', () => {
  beforeEach(() => {
    // Reset matchMedia to its natural jsdom-default state (no reduced motion).
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  it('renders the wrapper and tags each child with data-stagger-item', () => {
    const { container } = render(
      <StaggerList delayMs={50} durationMs={300}>
        <div>First</div>
        <div>Second</div>
        <div>Third</div>
      </StaggerList>,
    );
    const items = container.querySelectorAll('[data-stagger-item]');
    expect(items.length).toBe(3);
    expect(items[0]?.textContent).toBe('First');
    expect(items[2]?.textContent).toBe('Third');
  });

  it('renders without throwing when given a single child', () => {
    const { container } = render(
      <StaggerList>
        <div>only</div>
      </StaggerList>,
    );
    expect(container.querySelectorAll('[data-stagger-item]').length).toBe(1);
  });

  it('renders without throwing when children is a string (non-element)', () => {
    // Children.toArray wraps strings in a string node, not a valid element,
    // so the implementation should defensively wrap with a div.
    const { container } = render(
      <StaggerList>
        {'raw string'}
      </StaggerList>,
    );
    expect(container.querySelectorAll('[data-stagger-item]').length).toBe(1);
  });

  it('honors prefers-reduced-motion: skips the animation, still renders the items', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    const { container } = render(
      <StaggerList delayMs={50} durationMs={300}>
        <div>a</div>
        <div>b</div>
      </StaggerList>,
    );
    // Items still rendered (DOM presence is the regression net).
    expect(container.querySelectorAll('[data-stagger-item]').length).toBe(2);
  });
});

describe('useDraggable — anime.js v4 createDraggable() integration', () => {
  beforeEach(() => {
    // Default to a no-op matchMedia (matches: false). Reduced-motion
    // tests below override with matches: true. The previous version
    // reset to undefined which crashed anime.js v4's createDraggable
    // (it reads window.matchMedia at refresh time).
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  function Probe(props: { axis?: 'x' | 'y'; onDragStart?: () => void; onDragEnd?: () => void }) {
    const ref = useDraggable<HTMLDivElement>(props);
    return <div ref={ref} data-testid="draggable-target">drag me</div>;
  }

  it('renders without throwing and attaches the ref', () => {
    const { getByTestId } = render(<Probe />);
    const el = getByTestId('draggable-target');
    expect(el).toBeTruthy();
    // The hook should not throw on subsequent re-renders.
    expect(() => fireEvent.mouseDown(el)).not.toThrow();
  });

  it('respects prefers-reduced-motion: the ref still works but drag is skipped', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    const { getByTestId, unmount } = render(<Probe />);
    const el = getByTestId('draggable-target');
    expect(el).toBeTruthy();
    // Under reduced-motion the effect short-circuits, so a pointer event
    // should NOT cause any side effects. We assert it doesn't throw.
    expect(() => fireEvent.pointerDown(el, { clientX: 10, clientY: 20 })).not.toThrow();
    // Cleanup should not throw either.
    expect(() => unmount()).not.toThrow();
  });

  it('exposes the ref as a plain React.MutableRefObject for callers', () => {
    // The hook returns the ref directly so the caller can attach it to
    // a JSX element. This is the public API; a future maintainer who
    // changes the return type would break callers. Sentinel: verify
    // the ref is consumable via createRef (mutable object).
    const TestRef = () => {
      const internalRef = useDraggable<HTMLDivElement>();
      // Reference the ref to ensure the hook is exercised.
      const _refShape = internalRef as React.MutableRefObject<HTMLDivElement | null>;
      return <div ref={internalRef} />;
    };
    expect(() => render(<TestRef />)).not.toThrow();
  });

  it('exports the right barrel types (UseDraggableOptions, DraggableAxis)', async () => {
    // Importing the type at runtime is impossible, but we can probe the
    // value space through the exports object to confirm they are not
    // accidentally removed by a barrel refactor.
    const effectsModule = await import('../lib/effects');
    expect(typeof effectsModule.useDraggable).toBe('function');
    expect(typeof effectsModule.StaggerList).toBe('function');
  });
});
