import { describe, expect, it } from "vitest";
import {
  calculate,
  cloneConfig,
  configUrl,
  csv,
  preset,
  presetNames,
  readUrl,
  validateConfig,
} from "./model";

describe("rendering budgets", () => {
  it("reproduces the cached-lighting reference and lowest phone without an output-sized upscale", () => {
    const base = calculate(preset(presetNames[4]));
    expect(base.bytesPerFrame).toBe(1920 * 1080 * 123);
    expect(base.memoryBytes).toBe(1920 * 1080 * 12);
    const low = calculate(preset(presetNames[5]));
    expect(low.canvas).toEqual({ width: 195, height: 422, pixels: 82290 });
    expect(low.scene).toEqual(low.canvas);
    expect(low.gbps).toBeCloseTo(0.3036501, 7);
    expect(low.memoryBytes).toBe(987480);
    expect(low.ratio).toBeLessThan(1);
    expect(low.resources.some((r) => /history|upsample/i.test(r.label))).toBe(false);
  });
  it("counts all materialized upsample targets and the AO filter scratch", () => {
    const r = calculate(cloneConfig());
    const full = 1920 * 1080;
    // Scene: G-buffer 16, beauty 8, previous depth 4, pyramid 5,
    // upsampled SSR/GI/AO 8+8+4; half-grid working sets 24+32+8; TRAA 16.
    expect(r.memoryBytes).toBe(
      full * (16 + 8 + 4 + 5 + 8 + 8 + 4 + 16) + (full / 4) * (24 + 32 + 8),
    );
    expect(r.bytesPerFrame).toBe(full * 663);
    expect(new Set(r.resources.map((a) => a.id)).size).toBe(r.resources.length);
  });
  it("releases effect-specific resources without duplicating or removing shared inputs", () => {
    const all = calculate(cloneConfig());
    const c = cloneConfig();
    c.ssgi = false;
    const withoutGI = calculate(c);
    expect(all.memoryBytes - withoutGI.memoryBytes).toBe(1920 * 1080 * 16);
    expect(all.bytesPerFrame - withoutGI.bytesPerFrame).toBe(1920 * 1080 * 186);
    expect(withoutGI.resources.filter((r) => r.id === "gbuffer")).toHaveLength(1);
    expect(withoutGI.resources.filter((r) => r.id === "hiz")).toHaveLength(1);
    c.ssr = c.gtao = false;
    c.aa = "none";
    const bare = calculate(c);
    expect(bare.resources.map((r) => r.id)).toEqual(["depth", "beauty"]);
    expect(bare.passes.map((p) => p.id)).toEqual(["beauty", "transparent", "output"]);
  });
  it("quarters scene resources while preserving output-sized TAAU memory and traffic", () => {
    const c = cloneConfig();
    c.aa = "taau";
    const full = calculate(c);
    c.sceneScale = 0.5;
    const half = calculate(c);
    expect(full.resources.find((r) => r.id === "taau")?.bytes).toBe(
      half.resources.find((r) => r.id === "taau")?.bytes,
    );
    expect(half.resources.find((r) => r.id === "gbuffer")?.bytes).toBe(
      full.resources.find((r) => r.id === "gbuffer")!.bytes / 4,
    );
    expect(half.passes.find((r) => r.id === "taau")?.bytesPerFrame).toBe(
      full.passes.find((r) => r.id === "taau")?.bytesPerFrame,
    );
    expect(half.memoryBytes).toBe(1920 * 1080 * (69 / 4 + 24));
  });
  it("uses each effect grid independently and removes redundant upsampling", () => {
    const c = cloneConfig();
    const before = calculate(c);
    c.ssgiScale = 0.25;
    const after = calculate(c);
    expect(after.passes.find((p) => p.id === "ssgiTrace")!.bytesPerFrame).toBe(
      before.passes.find((p) => p.id === "ssgiTrace")!.bytesPerFrame / 4,
    );
    expect(after.passes.find((p) => p.id === "ssrTrace")!.bytesPerFrame).toBe(
      before.passes.find((p) => p.id === "ssrTrace")!.bytesPerFrame,
    );
    expect(after.passes.find((p) => p.id === "ssgiUpsample")!.bytesPerFrame).toBe(
      before.passes.find((p) => p.id === "ssgiUpsample")!.bytesPerFrame,
    );
    c.ssgiScale = 1;
    expect(calculate(c).resources.some((r) => r.id === "ssgiUpsample")).toBe(false);
  });
  it("scales traffic with fps without scaling allocations; adds manual assets once", () => {
    const c = cloneConfig();
    const full = calculate(c);
    c.fps = 30;
    c.assetMemoryMB = 123;
    const half = calculate(c);
    expect(half.gbps).toBe(full.gbps / 2);
    expect(half.memoryBytes).toBe(full.memoryBytes + 123e6);
  });
  it("rounds each actual texture grid and handles zero-cost experiments", () => {
    const c = cloneConfig();
    c.width = 391;
    c.height = 845;
    c.dpr = 0.5;
    c.sceneScale = 0.5;
    const r = calculate(c);
    expect(r.canvas.width).toBe(195);
    expect(r.scene.width).toBe(97);
    expect(r.ssr.width).toBe(48);
    c.ssgi = false;
    for (const key of Object.keys(c.costs) as (keyof typeof c.costs)[]) c.costs[key] = 0;
    expect(calculate(c).gbps).toBe(0);
    expect(calculate(c).maxPlanningFps).toBeNull();
  });
});
describe("complete, versioned links", () => {
  it("round-trips every field in editor and results modes, including Unicode and edited assumptions", () => {
    const c = preset(presetNames[5]);
    c.title = "Phone · 日本語 🌱";
    c.costs.taau = 222;
    c.memory.hdr = 4;
    c.survey.read95 = 3.2;
    for (const view of [false, true]) {
      const url = configUrl(c, view, "https://example.com/nested/?old=1#old");
      const parsed = readUrl(url);
      expect(parsed.config).toEqual(c);
      expect(parsed.resultsOnly).toBe(view);
      expect(parsed.error).toBeUndefined();
      expect(new URL(url).pathname).toBe("/nested/");
    }
  });
  it("rejects malformed, missing and future schemas without executing or trusting their contents", () => {
    const invalid = ["#c=%%%", " #c=e30="];
    for (const hash of invalid)
      expect(readUrl("https://example.com/" + hash.trim()).error).toBeTruthy();
    expect(() => validateConfig({ ...cloneConfig(), version: 2 })).toThrow(/version/);
    expect(() => validateConfig({ ...cloneConfig(), dpr: NaN })).toThrow();
    expect(() => validateConfig({ ...cloneConfig(), width: 0 })).toThrow();
    expect(() => validateConfig({ ...cloneConfig(), coverage: "99" })).toThrow();
    expect(() => validateConfig({ ...cloneConfig(), costs: {} })).toThrow();
  });
  it("exports quoted, reproducible pass and allocation details", () => {
    const c = cloneConfig();
    c.title = 'Quoted "test", scenario';
    const out = csv(c);
    expect(out).toContain('"Quoted ""test"", scenario"');
    expect(out).toContain('"Upsampled SSGI"');
    expect(out).toContain('"Bytes/frame"');
  });
});
