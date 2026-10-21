export const CHAT_TOUR_TARGETS = {
  avatar: "avatar",
  prompts: "prompts",
  mic: "mic",
  history: "history",
} as const;

export type ChatTourTarget = (typeof CHAT_TOUR_TARGETS)[keyof typeof CHAT_TOUR_TARGETS];

export function chatTourSelector(target: ChatTourTarget): string {
  return `[data-chat-tour="${target}"]`;
}
