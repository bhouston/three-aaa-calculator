// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { calculate, cloneConfig, configUrl, readUrl } from "./model";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(cleanup);
describe("editor and embed use the same calculation", () => {
  it("shows calculation controls without device profiles or survey comparisons", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "The frame" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Scenario preset" })).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: /Scene asset memory/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /survey|planning allowance|resolution chain|where the pixels go|95% coverage|50% coverage/i,
    );
  });
  it("automatically removes and restores the Hi-Z calculation with SSR", () => {
    render(<App />);
    expect(screen.queryByRole("checkbox", { name: "Hi-Z pyramid" })).toBeNull();
    expect(screen.getByRole("cell", { name: "Hi-Z build" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "SSR" }));
    expect(screen.queryByRole("cell", { name: "Hi-Z build" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));
    expect(screen.queryByText("Hi-Z pyramid")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "SSR" }));
    expect(screen.getByText("Hi-Z pyramid")).toBeTruthy();
  });
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
  it("copies all manually entered inputs into a complete results link", async () => {
    render(<App />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "CSS width" }), {
      target: { value: "390" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "CSS height" }), {
      target: { value: "844" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Pixel ratio" }), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Target fps" }), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Reconstruction / AA" }), {
      target: { value: "spatial" },
    });
    for (const effect of ["SSR", "SSGI", "GTAO"])
      fireEvent.click(screen.getByRole("checkbox", { name: effect }));
    expect(screen.getByTestId("total-bandwidth").textContent).toBe("0.30GB/s");
    expect(screen.getByTestId("total-memory").textContent).toBe("0.99MB");
    fireEvent.click(screen.getByRole("button", { name: /Copy results link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const restored = readUrl(vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]);
    expect(restored.resultsOnly).toBe(true);
    expect(restored.config).toEqual({
      ...cloneConfig(),
      width: 390,
      height: 844,
      dpr: 0.5,
      fps: 30,
      aa: "spatial",
      ssr: false,
      ssgi: false,
      gtao: false,
    });
  });
  it("renders only results for an encoded scenario and links to an identical editor", () => {
    const c = cloneConfig();
    c.ssgi = false;
    c.costs.beauty = 100;
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
    expect(document.body.textContent).not.toMatch(
      /survey|planning allowance|resolution chain|where the pixels go|95% coverage|50% coverage/i,
    );
  });
  it("offers a selectable fallback when the clipboard is unavailable", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Permission denied"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Copy editable link" }));
    const textarea = await screen.findByRole("textbox", { name: "Text to copy" });
    expect(readUrl((textarea as HTMLTextAreaElement).value).error).toBeUndefined();
  });
});
