import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_TOUR_TARGETS, chatTourSelector } from "../lib/chatTutorialAnchors";

const SRC_ROOT = path.resolve(__dirname, "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(SRC_ROOT, relativePath), "utf8");
}

describe("chat tutorial anchors", () => {
  it("builds selectors from the canonical target names", () => {
    expect(chatTourSelector(CHAT_TOUR_TARGETS.avatar)).toBe('[data-chat-tour="avatar"]');
    expect(chatTourSelector(CHAT_TOUR_TARGETS.prompts)).toBe('[data-chat-tour="prompts"]');
    expect(chatTourSelector(CHAT_TOUR_TARGETS.mic)).toBe('[data-chat-tour="mic"]');
    expect(chatTourSelector(CHAT_TOUR_TARGETS.history)).toBe('[data-chat-tour="history"]');
  });

  it("marks every control the tour explains", () => {
    const chatPage = readSource("components/chat/AIChatPage.tsx");
    const history = readSource("components/chat/ConversationHistory.tsx");
    const tour = readSource("components/chat/ChatTour.tsx");

    expect(chatPage).toContain('data-chat-tour="avatar"');
    expect(chatPage).toContain('data-chat-tour="mic"');
    expect((chatPage.match(/data-chat-tour="prompts"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(history).toContain('data-chat-tour="history"');

    for (const target of Object.values(CHAT_TOUR_TARGETS)) {
      expect(tour).toContain(`target: CHAT_TOUR_TARGETS.${target}`);
    }
  });

  it("measures live targets instead of using fixed viewport anchors", () => {
    const tour = readSource("components/chat/ChatTour.tsx");
    expect(tour).toContain("getBoundingClientRect");
    expect(tour).toContain('window.addEventListener("scroll", schedule, true)');
    expect(tour).not.toContain("top-1/3 left-1/2");
    expect(tour).not.toContain("bottom-32 right-6");
  });

  it("keeps the generic tutorial spotlight responsive too", () => {
    const tour = readSource("components/chat/ChatTour.tsx");
    expect(tour).toContain('window.addEventListener("scroll", schedule, true)');
    expect(tour).toContain("new ResizeObserver(schedule)");
  });
});
