import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ChatTour from "../components/chat/ChatTour";

function addAnchor(
  name: string,
  rect: { left: number; top: number; width: number; height: number },
): HTMLButtonElement {
  const element = document.createElement("button");
  element.dataset.chatTour = name;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        ...rect,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => rect,
      }) as DOMRect,
  });
  document.body.appendChild(element);
  return element;
}

describe("ChatTour DOM spotlight", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("tracks the real target instead of a fixed viewport coordinate", async () => {
    addAnchor("avatar", { left: 10, top: 24, width: 40, height: 40 });
    addAnchor("prompts", { left: 90, top: 520, width: 260, height: 92 });
    addAnchor("mic", { left: 300, top: 730, width: 36, height: 36 });
    addAnchor("history", { left: 340, top: 24, width: 32, height: 32 });

    render(<ChatTour force />);

    const spotlight = await screen.findByTestId("chat-tour-spotlight");
    expect(spotlight).toHaveStyle({ left: "4px", top: "16px", width: "56px", height: "56px" });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByTestId("chat-tour-spotlight")).toHaveStyle({
        left: "82px",
        top: "512px",
        width: "276px",
        height: "108px",
      });
    });
  });
});
