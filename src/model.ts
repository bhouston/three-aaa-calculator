export const MODEL_VERSION = 1;
export const MODEL_REVISION = "1.0.0";
export const costLabels = {
  gbuffer: "G-buffer prepass",
  motion: "Depth + motion prepass",
  hiz: "Hi-Z build",
  gtao: "GTAO + filter",
  ssrTrace: "SSR trace",
  ssrDenoise: "SSR denoise",
  ssgiTrace: "SSGI trace",
  ssgiDenoise: "SSGI denoise",
  gtaoUpsample: "GTAO joint bilateral upsample",
  ssrUpsample: "SSR joint bilateral upsample",
  ssgiUpsample: "SSGI joint bilateral upsample",
  beauty: "Forward beauty",
  transparent: "Transparents + glass",
  traa: "TRAA resolve + history",
  taau: "TAAU resolve + history",
  output: "Tone map + output",
  spatialOutput: "Spatial AA + tone map + output",
} as const;
export type CostKey = keyof typeof costLabels;
export const memoryLabels = {
  gbuffer: "G-buffer",
  depth: "Depth",
  motion: "Motion vectors",
  hdr: "HDR color / resolved signal",
  previousDepth: "Previous depth",
  hiz: "Hi-Z pyramid (with mips)",
  ssrWorking: "SSR working set (denoised)",
  ssgiWorking: "SSGI working set (denoised)",
  gtaoWorking: "GTAO working set",
  traa: "TRAA history + resolve",
  taau: "TAAU color, lock + resolve",
} as const;
export type MemoryKey = keyof typeof memoryLabels;
export interface Config {
  version: 1;
  title: string;
  width: number;
  height: number;
  dpr: number;
  fps: number;
  sceneScale: number;
  aa: "none" | "spatial" | "traa" | "taau";
  ssr: boolean;
  ssgi: boolean;
  gtao: boolean;
  ssrDenoise: boolean;
  ssgiDenoise: boolean;
  transparent: boolean;
  ssrScale: number;
  ssgiScale: number;
  gtaoScale: number;
  costs: Record<CostKey, number>;
  memory: Record<MemoryKey, number>;
}
export const defaultConfig: Config = {
  version: 1,
  title: "Lighting budget",
  width: 1920,
  height: 1080,
  dpr: 1,
  fps: 60,
  sceneScale: 1,
  aa: "traa",
  ssr: true,
  ssgi: true,
  gtao: true,
  ssrDenoise: true,
  ssgiDenoise: true,
  transparent: true,
  ssrScale: 0.5,
  ssgiScale: 0.5,
  gtaoScale: 0.5,
  costs: {
    gbuffer: 22,
    motion: 10,
    hiz: 7,
    gtao: 124,
    ssrTrace: 268,
    ssrDenoise: 252,
    ssgiTrace: 152,
    ssgiDenoise: 240,
    gtaoUpsample: 60,
    ssrUpsample: 80,
    ssgiUpsample: 80,
    beauty: 76,
    transparent: 23,
    traa: 36,
    taau: 160,
    output: 12,
    spatialOutput: 24,
  },
  memory: {
    gbuffer: 16,
    depth: 4,
    motion: 4,
    hdr: 8,
    previousDepth: 4,
    hiz: 5,
    ssrWorking: 24,
    ssgiWorking: 32,
    gtaoWorking: 8,
    traa: 16,
    taau: 24,
  },
};
export const cloneConfig = (config: Config = defaultConfig): Config => structuredClone(config);
export interface Size {
  width: number;
  height: number;
  pixels: number;
}
export interface Pass {
  id: CostKey;
  label: string;
  size: Size;
  coefficient: number;
  bytesPerFrame: number;
  gbps: number;
  group: string;
}
export interface Resource {
  id: string;
  label: string;
  size: Size;
  bytesPerPixel: number;
  bytes: number;
  note: string;
}
export function scaledSize(width: number, height: number, scale: number): Size {
  const w = Math.max(1, Math.floor(width * scale));
  const h = Math.max(1, Math.floor(height * scale));
  return { width: w, height: h, pixels: w * h };
}
export function calculate(c: Config) {
  const canvas = scaledSize(c.width, c.height, c.dpr);
  const scene = scaledSize(canvas.width, canvas.height, c.sceneScale);
  const ssr = scaledSize(scene.width, scene.height, c.ssrScale);
  const ssgi = scaledSize(scene.width, scene.height, c.ssgiScale);
  const gtao = scaledSize(scene.width, scene.height, c.gtaoScale);
  const effects = c.ssr || c.ssgi || c.gtao;
  const temporal = c.aa === "traa" || c.aa === "taau";
  const histories = temporal || (c.ssr && c.ssrDenoise) || (c.ssgi && c.ssgiDenoise);
  const passes: Pass[] = [];
  const resources: Resource[] = [];
  function pass(id: CostKey, size: Size, group: string, extra = 0) {
    const coefficient = c.costs[id] + extra;
    const bytesPerFrame = size.pixels * coefficient;
    passes.push({
      id,
      label: costLabels[id],
      size,
      coefficient,
      bytesPerFrame,
      gbps: (bytesPerFrame * c.fps) / 1e9,
      group,
    });
  }
  function resource(id: string, label: string, size: Size, bpp: number, note = "") {
    resources.push({ id, label, size, bytesPerPixel: bpp, bytes: size.pixels * bpp, note });
  }
  if (effects) {
    pass("gbuffer", scene, "shared");
    resource(
      "gbuffer",
      "Shared G-buffer",
      scene,
      c.memory.gbuffer,
      "Depth, normals, material and motion; counted once.",
    );
  } else {
    resource("depth", "Scene depth", scene, c.memory.depth);
    if (temporal) {
      pass("motion", scene, "shared");
      resource("motion", "Motion vectors", scene, c.memory.motion);
    }
  }
  resource("beauty", "HDR beauty", scene, c.memory.hdr);
  if (histories) resource("previousDepth", "Shared previous depth", scene, c.memory.previousDepth);
  if (c.ssr) {
    pass("hiz", scene, "ssr");
    resource(
      "hiz",
      "Hi-Z pyramid",
      scene,
      c.memory.hiz,
      "Approximate bytes per base pixel, including mips.",
    );
  }
  if (c.gtao) {
    pass("gtao", gtao, "gtao");
    resource("gtao", "GTAO signal + filter scratch", gtao, c.memory.gtaoWorking);
  }
  if (c.ssr) {
    pass("ssrTrace", ssr, "ssr");
    if (c.ssrDenoise) pass("ssrDenoise", ssr, "ssr");
    resource(
      "ssr",
      "SSR working set",
      ssr,
      c.ssrDenoise ? c.memory.ssrWorking : c.memory.hdr,
      c.ssrDenoise
        ? "Raw, temporal/spatial working storage; no inter-effect aliasing."
        : "Raw signal only.",
    );
  }
  if (c.ssgi) {
    pass("ssgiTrace", ssgi, "ssgi");
    if (c.ssgiDenoise) pass("ssgiDenoise", ssgi, "ssgi");
    resource(
      "ssgi",
      "SSGI working set",
      ssgi,
      c.ssgiDenoise ? c.memory.ssgiWorking : c.memory.hdr,
      "Raw GI, ping-pong temporal histories and spatial scratch.",
    );
  }
  for (const [on, size, id, name, bpp, group] of [
    [c.gtao, gtao, "gtaoUpsample", "Upsampled GTAO", c.memory.depth, "gtao"],
    [c.ssr, ssr, "ssrUpsample", "Upsampled SSR", c.memory.hdr, "ssr"],
    [c.ssgi, ssgi, "ssgiUpsample", "Upsampled SSGI", c.memory.hdr, "ssgi"],
  ] as const) {
    if (on && (size.width !== scene.width || size.height !== scene.height)) {
      pass(id, scene, group);
      resource(id, name, scene, bpp, "Materialized at scene resolution before shading.");
    }
  }
  pass("beauty", scene, "beauty", c.ssgi ? c.memory.hdr : 0);
  if (c.transparent) pass("transparent", scene, "beauty");
  if (c.aa === "traa") {
    pass("traa", scene, "temporal");
    resource("traa", "TRAA history + resolve", scene, c.memory.traa);
  }
  if (c.aa === "taau") {
    pass("taau", canvas, "temporal");
    resource(
      "taau",
      "TAAU color, lock + resolve",
      canvas,
      c.memory.taau,
      "Output-sized. Traffic coefficient is a provisional estimate.",
    );
  }
  pass(c.aa === "spatial" ? "spatialOutput" : "output", canvas, "output");
  const bytesPerFrame = passes.reduce((sum, p) => sum + p.bytesPerFrame, 0);
  const memoryBytes = resources.reduce((sum, r) => sum + r.bytes, 0);
  const gbps = (bytesPerFrame * c.fps) / 1e9;
  return {
    canvas,
    scene,
    ssr,
    ssgi,
    gtao,
    passes,
    resources,
    bytesPerFrame,
    memoryBytes,
    gbps,
  };
}
// A full configuration is required: old model versions never silently change meaning.
export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== "object") throw new Error("The configuration is not an object.");
  const c = value as Record<string, unknown>;
  if (c.version !== 1) throw new Error("This link uses an unsupported model version.");
  const result = cloneConfig();
  for (const key of Object.keys(result) as (keyof Config)[]) {
    const v = c[key];
    const fallback = result[key];
    if (typeof fallback === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Invalid ${key}.`);
      (result as unknown as Record<string, unknown>)[key] = v;
    } else if (typeof fallback === "boolean") {
      if (typeof v !== "boolean") throw new Error(`Invalid ${key}.`);
      (result as unknown as Record<string, unknown>)[key] = v;
    } else if (typeof fallback === "string") {
      if (typeof v !== "string" || v.length > 100) throw new Error(`Invalid ${key}.`);
      (result as unknown as Record<string, unknown>)[key] = v;
    } else {
      if (!v || typeof v !== "object") throw new Error(`Invalid ${key}.`);
      for (const nested of Object.keys(fallback)) {
        const item = (v as Record<string, unknown>)[nested];
        if (typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1e7)
          throw new Error(`Invalid ${key}.${nested}.`);
        (result[key] as unknown as Record<string, unknown>)[nested] = item;
      }
    }
  }
  if (!["none", "spatial", "traa", "taau"].includes(result.aa)) throw new Error("Invalid mode.");
  if (![result.width, result.height].every((n) => Number.isInteger(n) && n >= 1 && n <= 16384))
    throw new Error("Invalid viewport dimensions.");
  if (!(result.dpr >= 0.05 && result.dpr <= 4) || !(result.fps >= 1 && result.fps <= 240))
    throw new Error("Invalid pixel ratio or frame rate.");
  if (
    ![result.sceneScale, result.ssrScale, result.ssgiScale, result.gtaoScale].every(
      (n) => n >= 0.05 && n <= 1,
    )
  )
    throw new Error("Invalid resolution scale.");
  return result;
}
export function configUrl(config: Config, resultsOnly = false, base = window.location.href) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("view", resultsOnly ? "results" : "editor");
  const bytes = new TextEncoder().encode(JSON.stringify(validateConfig(config)));
  url.hash =
    "c=" +
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return url.href;
}
export function readUrl(href: string): { config: Config; resultsOnly: boolean; error?: string } {
  const url = new URL(href);
  const resultsOnly = url.searchParams.get("view") === "results";
  if (!url.hash) return { config: cloneConfig(), resultsOnly };
  try {
    const payload = new URLSearchParams(url.hash.slice(1)).get("c");
    if (!payload || payload.length > 30000) throw new Error("Invalid configuration link.");
    const binary = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    return {
      config: validateConfig(
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Uint8Array.from(binary, (c) => c.charCodeAt(0)),
          ),
        ),
      ),
      resultsOnly,
    };
  } catch (e) {
    return {
      config: cloneConfig(),
      resultsOnly,
      error: `${e instanceof Error ? e.message : "Invalid link."} Showing the default configuration.`,
    };
  }
}
export function csv(config: Config) {
  const r = calculate(config);
  const quote = (x: unknown) => `"${String(x).replaceAll('"', '""')}"`;
  const rows: unknown[][] = [
    ["Model revision", MODEL_REVISION],
    ["Calculation", config.title],
    ["Target FPS", config.fps],
    ["Memory bandwidth (GB/s)", r.gbps],
    ["Memory usage (MB)", r.memoryBytes / 1e6],
    [],
    ["Pass", "Width", "Height", "Bytes/work pixel", "Bytes/frame", "GB/s"],
  ];
  for (const p of r.passes)
    rows.push([p.label, p.size.width, p.size.height, p.coefficient, p.bytesPerFrame, p.gbps]);
  rows.push([], ["Allocation", "Width", "Height", "Bytes/pixel", "Bytes"]);
  for (const a of r.resources)
    rows.push([a.label, a.size.width, a.size.height, a.bytesPerPixel, a.bytes]);
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
