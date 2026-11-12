// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { calculate, configUrl, preset, presetNames, readUrl } from "./model";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(cleanup);
describe("editor and embed use the same calculation", () => {
  it("updates the frame and releases SSGI costs, with a restorable URL", async () => {
    render(<App />);
    const before = Number(screen.getByTestId("total-bandwidth").textContent!.replace("GB/s", ""));
    fireEvent.click(screen.getByRole("checkbox", { name: "SSGI" }));
    const after = Number(screen.getByTestId("total-bandwidth").textContent!.replace("GB/s", ""));
    expect(before - after).toBeCloseTo(23.14, 1);
    await waitFor(() => expect(readUrl(window.location.href).config.ssgi).toBe(false));
    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));
    expect(screen.queryByText("Upsampled SSGI")).toBeNull();
    expect(screen.getByText("Upsampled SSR")).toBeTruthy();
  });
  it("loads the lowest profile and copies a complete results link", async () => {
    render(<App />);
    fireEvent.change(screen.getByRole("combobox", { name: "Scenario preset" }), {
      target: { value: presetNames[5] },
    });
    expect(screen.getByTestId("total-bandwidth").textContent).toBe("0.30GB/s");
    expect(screen.getByTestId("total-memory").textContent).toBe("0.99MB");
    fireEvent.click(screen.getByRole("button", { name: /Copy results link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const url = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0];
    const restored = readUrl(url);
    expect(restored.resultsOnly).toBe(true);
    expect(restored.config).toEqual(preset(presetNames[5]));
  });
  it("renders only results for an encoded scenario and links to an identical editor", () => {
    const c = preset(presetNames[3]);
    c.costs.beauty = 100;
    c.assetMemoryMB = 42;
    window.history.replaceState(null, "", configUrl(c, true));
    render(<App />);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy/ })).toBeNull();
    expect(screen.getByTestId("total-bandwidth").textContent).toBe(
      `${calculate(c).gbps.toFixed(2)}GB/s`,
    );
    const edit = screen.getByRole("link", { name: "Open interactive calculator ↗" });
    const back = readUrl(edit.getAttribute("href")!);
    expect(back.resultsOnly).toBe(false);
    expect(back.config).toEqual(c);
    const sourceTable = screen
      .getByRole("heading", { name: "Grounded in Web3D Survey." })
      .closest("section")!;
    expect(within(sourceTable).getAllByRole("link")).toHaveLength(4);
  });
  it("offers a selectable fallback when the clipboard is unavailable", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Permission denied"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Copy editable link" }));
    const textarea = await screen.findByRole("textbox", { name: "Text to copy" });
    expect(readUrl((textarea as HTMLTextAreaElement).value).error).toBeUndefined();
  });
});
