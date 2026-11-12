import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculate,
  cloneConfig,
  configUrl,
  costLabels,
  csv,
  memoryLabels,
  MODEL_REVISION,
  preset,
  presetNames,
  readUrl,
} from "./model";
import type { Config, CostKey, MemoryKey } from "./model";

const number = (value: number, digits = 2) =>
  new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
const integer = (value: number) => new Intl.NumberFormat("en").format(value);
const sizeText = (size: { width: number; height: number }) =>
  `${integer(size.width)} × ${integer(size.height)}`;
const colors: Record<string, string> = {
  shared: "#8d9895",
  gtao: "#c58c35",
  ssr: "#8b79b7",
  ssgi: "#3c9c86",
  beauty: "#596c72",
  temporal: "#5c88b1",
  output: "#a5b272",
};
function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1e7,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {suffix && <small>{suffix}</small>}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          if (e.target.value !== "") {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }
        }}
      />
    </label>
  );
}
function ScaleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[...new Set([0.25, 0.5, 2 / 3, 0.75, 1, value])]
          .sort((a, b) => a - b)
          .map((n) => (
            <option key={n} value={n}>
              {number(n * 100, n === 2 / 3 ? 1 : 0)}% per axis
            </option>
          ))}
      </select>
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
  detail,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  detail?: string;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function download(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [initial] = useState(() => readUrl(window.location.href));
  const [config, setConfig] = useState(initial.config);
  const [notice, setNotice] = useState(initial.error ?? "");
  const [fallbackCopy, setFallbackCopy] = useState("");
  const [tab, setTab] = useState<"bandwidth" | "memory">("bandwidth");
  const resultsOnly = initial.resultsOnly;
  const shareRef = useRef<HTMLTextAreaElement>(null);
  const result = useMemo(() => calculate(config), [config]);
  const update = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const editUrl = configUrl(config, false);
  const embedUrl = configUrl(config, true);
  useEffect(() => {
    if (!initial.error) window.history.replaceState(null, "", configUrl(config, resultsOnly));
  }, [config, resultsOnly]);
  useEffect(() => {
    if (!resultsOnly || window.parent === window || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      window.parent.postMessage(
        {
          type: "three-aaa-calculator:resize",
          version: 1,
          height: Math.ceil(document.body.getBoundingClientRect().height),
        },
        "*",
      ),
    );
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [resultsOnly]);
  useEffect(() => {
    if (fallbackCopy) {
      shareRef.current?.focus();
      shareRef.current?.select();
    }
  }, [fallbackCopy]);
  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      setFallbackCopy("");
    } catch {
      setFallbackCopy(value);
      setNotice("Select and copy the text below.");
    }
  }
  const status = result.ratio <= 1;
  const maxPass = Math.max(1e-12, ...result.passes.map((p) => p.gbps));
  const groups = Object.entries(colors)
    .map(([id, color]) => ({
      id,
      color,
      gbps: result.passes.filter((p) => p.group === id).reduce((sum, p) => sum + p.gbps, 0),
    }))
    .filter((g) => g.gbps > 0);
  return (
    <div className={resultsOnly ? "app embedded" : "app"}>
      <header className="topbar">
        <a className="brand" href={resultsOnly ? editUrl : window.location.pathname}>
          <span className="brand-mark">△</span>
          <span>
            THREE <b>AAA</b>
            <small>CALCULATOR</small>
          </span>
        </a>
        <div className="top-links">
          <span className="model-pill">MODEL {MODEL_REVISION}</span>
          {!resultsOnly && (
            <a
              href="https://github.com/bhouston/three-aaa-calculator"
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
          )}
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">RENDERING / RESOURCE PLANNING</p>
            <h1>
              {resultsOnly ? (
                config.title
              ) : (
                <>
                  A frame has a budget.
                  <br />
                  <span>Make every pass count.</span>
                </>
              )}
            </h1>
            <p className="intro-copy">
              {resultsOnly
                ? `${sizeText(result.canvas)} canvas · ${sizeText(result.scene)} scene · ${config.fps} fps · ${config.aa.toUpperCase()}`
                : "Explore the memory and bandwidth of a Three.js lighting pipeline. Change the frame, inspect the tradeoffs, and share the exact result."}
            </p>
          </div>
          {resultsOnly ? (
            <a className="button primary" href={editUrl} target="_blank" rel="noreferrer">
              Open interactive calculator ↗
            </a>
          ) : (
            <div className="intro-index">
              <span>01 / CONFIGURE</span>
              <span>02 / INSPECT</span>
              <span>03 / SHARE</span>
            </div>
          )}
        </section>
        <div className="workspace">
          {!resultsOnly && (
            <aside className="controls" aria-label="Calculator settings">
              <section className="control-section">
                <div className="section-label">
                  <span>01</span>
                  <h2>Starting point</h2>
                </div>
                <label className="field">
                  <span>Scenario preset</span>
                  <select
                    aria-label="Scenario preset"
                    value={
                      presetNames.includes(config.title as (typeof presetNames)[number])
                        ? config.title
                        : ""
                    }
                    onChange={(e) => {
                      setConfig(preset(e.target.value));
                      setNotice("Preset loaded.");
                    }}
                  >
                    {!presetNames.includes(config.title as (typeof presetNames)[number]) && (
                      <option value="">Custom scenario</option>
                    )}
                    {presetNames.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Scenario title</span>
                  <input
                    maxLength={100}
                    value={config.title}
                    onChange={(e) => update("title", e.target.value)}
                  />
                </label>
              </section>
              <section className="control-section">
                <div className="section-label">
                  <span>02</span>
                  <h2>The frame</h2>
                </div>
                <div className="field-pair">
                  <NumberField
                    label="CSS width"
                    value={config.width}
                    min={1}
                    max={16384}
                    onChange={(n) => update("width", Math.round(n))}
                  />
                  <NumberField
                    label="CSS height"
                    value={config.height}
                    min={1}
                    max={16384}
                    onChange={(n) => update("height", Math.round(n))}
                  />
                </div>
                <div className="field-pair">
                  <NumberField
                    label="Pixel ratio"
                    value={config.dpr}
                    min={0.05}
                    max={4}
                    step={0.05}
                    onChange={(n) => update("dpr", n)}
                  />
                  <NumberField
                    label="Target fps"
                    value={config.fps}
                    min={1}
                    max={240}
                    onChange={(n) => update("fps", n)}
                  />
                </div>
                <ScaleField
                  label="Scene scale"
                  value={config.sceneScale}
                  onChange={(n) => update("sceneScale", n)}
                />
                <label className="field">
                  <span>Reconstruction / AA</span>
                  <select
                    value={config.aa}
                    onChange={(e) => update("aa", e.target.value as Config["aa"])}
                  >
                    <option value="none">None · tone map only</option>
                    <option value="spatial">Spatial AA · no history</option>
                    <option value="traa">TRAA · scene resolution</option>
                    <option value="taau">TAAU · canvas resolution</option>
                  </select>
                </label>
                <div className="resolution-note">
                  <span>
                    CANVAS <b>{sizeText(result.canvas)}</b>
                  </span>
                  <span>
                    SCENE <b>{sizeText(result.scene)}</b>
                  </span>
                </div>
              </section>
              <section className="control-section">
                <div className="section-label">
                  <span>03</span>
                  <h2>Lighting passes</h2>
                </div>
                {(["ssr", "ssgi", "gtao"] as const).map((id) => (
                  <div key={id} className={`effect ${config[id] ? "" : "disabled"}`}>
                    <Toggle
                      label={id.toUpperCase()}
                      checked={config[id]}
                      onChange={(b) => update(id, b)}
                      detail={
                        {
                          ssr: "Screen-space reflections",
                          ssgi: "Screen-space diffuse bounce",
                          gtao: "Ground-truth ambient occlusion",
                        }[id]
                      }
                    />
                    {config[id] && (
                      <>
                        <ScaleField
                          label={`${id.toUpperCase()} resolution`}
                          value={config[`${id}Scale`]}
                          onChange={(n) => update(`${id}Scale`, n)}
                        />
                        {id !== "gtao" && (
                          <Toggle
                            label="Temporal + spatial denoise"
                            checked={config[`${id}Denoise`]}
                            onChange={(b) => update(`${id}Denoise`, b)}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                <Toggle
                  label="Hi-Z pyramid"
                  checked={config.hiz}
                  onChange={(b) => update("hiz", b)}
                  detail="Allocated only when SSR or SSGI uses it"
                />
                <Toggle
                  label="Transparents + glass"
                  checked={config.transparent}
                  onChange={(b) => update("transparent", b)}
                  detail="Nominal quarter-screen coverage"
                />
              </section>
              <section className="control-section">
                <div className="section-label">
                  <span>04</span>
                  <h2>Planning allowance</h2>
                </div>
                <label className="field">
                  <span>Survey coverage reference</span>
                  <select
                    value={config.coverage}
                    onChange={(e) => update("coverage", e.target.value as Config["coverage"])}
                  >
                    <option value="50">50% · median / high</option>
                    <option value="95">95% · lower tail / lowest</option>
                  </select>
                </label>
                <NumberField
                  label="Use of slower linear probe"
                  suffix="%"
                  value={Math.round(config.allowance * 100)}
                  min={1}
                  max={100}
                  onChange={(n) => update("allowance", n / 100)}
                />
                <NumberField
                  label="Scene asset memory"
                  suffix="MB"
                  value={config.assetMemoryMB}
                  max={1e6}
                  onChange={(n) => update("assetMemoryMB", n)}
                />
                <p className="help">
                  Textures, geometry, lightmaps and probes are extra. Add their memory if known.
                </p>
              </section>
            </aside>
          )}
          <div className="results">
            <section className="summary" aria-label="Totals">
              <div className="metric dark">
                <span>TOTAL LOGICAL TRAFFIC</span>
                <strong data-testid="total-bandwidth">
                  {number(result.gbps)}
                  <small>GB/s</small>
                </strong>
                <p>{number(result.bytesPerFrame / 1e6)} MB every frame</p>
              </div>
              <div className="metric">
                <span>ALLOCATED GPU MEMORY</span>
                <strong data-testid="total-memory">
                  {number(result.memoryBytes / 1e6)}
                  <small>MB</small>
                </strong>
                <p>
                  {result.resources.length} named allocations
                  {config.assetMemoryMB ? " + assets included" : " · assets excluded"}
                </p>
              </div>
              <div className="metric">
                <span>SCENE PIXELS</span>
                <strong>
                  {number(result.scene.pixels / 1e6, result.scene.pixels < 1e6 ? 3 : 2)}
                  <small>M</small>
                </strong>
                <p>
                  {number((result.scene.pixels / result.canvas.pixels) * 100, 0)}% of the canvas
                </p>
              </div>
            </section>
            <section
              className={`allowance-card ${status ? "within" : "over"}`}
              aria-label="Budget comparison"
            >
              <div>
                <span className="status-dot" />
                <h2>{status ? "Within the planning allowance" : "Above the planning allowance"}</h2>
                <strong>{number(result.ratio * 100, 0)}%</strong>
              </div>
              <div className="allowance-meter">
                <span style={{ width: `${Math.min(100, result.ratio * 100)}%` }} />
              </div>
              <p>
                {number(result.gbps)} of {number(result.budget, 3)} GB/s · {config.coverage}%
                coverage reference · {number(config.allowance * 100, 0)}% of the slower linear probe
              </p>
              <small>
                A budget comparison, not a measured frame rate or a guarantee of device coverage.
              </small>
            </section>
            <section className="panel breakdown">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">THE COST OF A FRAME</p>
                  <h2>Follow the resources.</h2>
                </div>
                <div className="tabs" role="tablist" aria-label="Result breakdown">
                  <button
                    role="tab"
                    aria-selected={tab === "bandwidth"}
                    onClick={() => setTab("bandwidth")}
                  >
                    Bandwidth
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "memory"}
                    onClick={() => setTab("memory")}
                  >
                    Memory
                  </button>
                </div>
              </div>
              {tab === "bandwidth" ? (
                <>
                  <div className="stacked-bar" aria-label="Bandwidth share by pass group">
                    {groups.map((g) => (
                      <span
                        key={g.id}
                        style={{ width: `${(g.gbps / result.gbps) * 100}%`, background: g.color }}
                        title={`${g.id}: ${number(g.gbps)} GB/s`}
                      />
                    ))}
                  </div>
                  <div className="legend">
                    {groups.map((g) => (
                      <span key={g.id}>
                        <i style={{ background: g.color }} />
                        {g.id === "shared" ? "Shared inputs" : g.id.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Pass</th>
                          <th>Working grid</th>
                          <th title="Logical reads plus writes per working pixel">B / pixel</th>
                          <th>GB/s</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.passes.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <span className="pass-dot" style={{ background: colors[p.group] }} />
                              {p.label}
                              <span
                                className="row-bar"
                                style={{
                                  width: `${(p.gbps / maxPass) * 90}%`,
                                  background: colors[p.group],
                                }}
                              />
                            </td>
                            <td>{sizeText(p.size)}</td>
                            <td>{number(p.coefficient, 0)}</td>
                            <td>{number(p.gbps, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total logical traffic</td>
                          <td>{config.fps} frames / second</td>
                          <td>—</td>
                          <td>{number(result.gbps, 3)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="table-note">
                    Bandwidth = working pixels × logical bytes per pixel × fps. Effect scales apply
                    to the scene; reconstruction and output use their listed grids.
                  </p>
                </>
              ) : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Allocation</th>
                          <th>Grid</th>
                          <th>B / pixel</th>
                          <th>MB</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.resources.map((r) => (
                          <tr key={r.id}>
                            <td title={r.note}>{r.label}</td>
                            <td>{r.size ? sizeText(r.size) : "Manual"}</td>
                            <td>{r.bytesPerPixel ?? "—"}</td>
                            <td>{number(r.bytes / 1e6, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Total allocated</td>
                          <td>Resident resources</td>
                          <td>—</td>
                          <td>{number(result.memoryBytes / 1e6, 3)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="table-note">
                    Named resources are counted once. Includes materialized upsample targets. No
                    aliasing between effects, MSAA attachments, browser surfaces or implicit driver
                    allocations.
                  </p>
                </>
              )}
            </section>
            <section className="panel anatomy">
              <div>
                <p className="eyebrow">RESOLUTION CHAIN</p>
                <h2>Where the pixels go.</h2>
              </div>
              <div className="pipeline">
                <div>
                  <small>CSS VIEWPORT × DPR</small>
                  <strong>
                    {integer(config.width)} × {integer(config.height)} <em>× {config.dpr}</em>
                  </strong>
                </div>
                <span>→</span>
                <div>
                  <small>CANVAS</small>
                  <strong>{sizeText(result.canvas)}</strong>
                </div>
                <span>←</span>
                <div>
                  <small>SCENE × {number(config.sceneScale, 2)}</small>
                  <strong>{sizeText(result.scene)}</strong>
                </div>
              </div>
              <div className="chips">
                {(["ssr", "ssgi", "gtao"] as const)
                  .filter((id) => config[id])
                  .map((id) => (
                    <span key={id}>
                      {id.toUpperCase()} <b>{sizeText(result[id])}</b>
                    </span>
                  ))}
                {!config.ssr && !config.ssgi && !config.gtao && <span>Cached lighting only</span>}
                <span>{config.aa.toUpperCase()}</span>
              </div>
              <p className="help">
                Pixel ratio changes the canvas itself. Scene scale changes the internal frame. Joint
                bilateral upsampling brings effect results to the scene; TAAU brings the scene to
                the canvas. Browser compositing remains additional.
              </p>
            </section>
            {!resultsOnly && (
              <section className="panel share">
                <div>
                  <p className="eyebrow">MAKE IT REPRODUCIBLE</p>
                  <h2>Share a calculation.</h2>
                  <p>Every setting, coefficient and survey threshold travels with the link.</p>
                </div>
                <div className="share-actions">
                  <button
                    className="button primary"
                    onClick={() => copy(embedUrl, "Results-only link copied.")}
                  >
                    Copy results link ↗
                  </button>
                  <button className="button" onClick={() => copy(editUrl, "Editable link copied.")}>
                    Copy editable link
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      copy(
                        `<iframe src="${embedUrl}" title="Three.js lighting budget" width="100%" height="1400" loading="lazy" style="border:0;border-radius:16px"></iframe>`,
                        "Embed HTML copied.",
                      )
                    }
                  >
                    Copy embed HTML
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(csv(config), "text/csv;charset=utf-8", "three-aaa-budget.csv")
                    }
                  >
                    Download CSV ↓
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      download(
                        JSON.stringify(
                          { modelRevision: MODEL_REVISION, config, results: result },
                          null,
                          2,
                        ),
                        "application/json",
                        "three-aaa-budget.json",
                      )
                    }
                  >
                    Download JSON ↓
                  </button>
                </div>
              </section>
            )}
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            {fallbackCopy && (
              <textarea
                className="copy-fallback"
                aria-label="Text to copy"
                readOnly
                ref={shareRef}
                value={fallbackCopy}
              />
            )}
            {!resultsOnly && (
              <details className="panel assumptions">
                <summary>
                  Model assumptions <span>Inspect & edit coefficients +</span>
                </summary>
                <p>
                  These are logical traffic budgets, not measured DRAM traffic. Caches can absorb
                  reads; latency, ALU work and pass overhead remain additional. TAAU's default 160
                  B/output pixel is provisional and editable. GTAO has a signal and filter scratch
                  target; every materialized upsample has its own allocation. This explicit
                  inventory is more complete than the article's original rough totals.
                </p>
                <p>
                  SSGI: one ray with 32 depth fetches, temporal accumulation and two five-tap
                  spatial filters. Raw GI, two histories and scratch use four RGBA16F targets.
                  Upsampling uses four GI/depth/normal taps plus center guides and an output write.
                  The proposed model is not a measurement of the current SSGI addon. Forward beauty
                  keeps a nominal fixed material/cache budget and adds one HDR GI read when SSGI is
                  on. No live shadows, MSAA or bloom are included.
                </p>
                <h3>Traffic · bytes per working pixel</h3>
                <div className="assumption-grid">
                  {Object.entries(costLabels).map(([key, label]) => (
                    <NumberField
                      key={key}
                      label={label}
                      value={config.costs[key as CostKey]}
                      onChange={(n) => update("costs", { ...config.costs, [key]: n })}
                    />
                  ))}
                </div>
                <h3>Memory · bytes per allocation pixel</h3>
                <div className="assumption-grid">
                  {Object.entries(memoryLabels).map(([key, label]) => (
                    <NumberField
                      key={key}
                      label={label}
                      value={config.memory[key as MemoryKey]}
                      onChange={(n) => update("memory", { ...config.memory, [key]: n })}
                    />
                  ))}
                </div>
              </details>
            )}
            <section className="panel sources">
              <p className="eyebrow">MEASURED REFERENCE POINTS</p>
              <h2>Grounded in Web3D Survey.</h2>
              <p>
                Snapshot {config.survey.date}. Higher throughput is better. “95% coverage” is a
                lower-tail threshold, approximately the fifth performance percentile. Each metric
                describes submitted runs, with its own population; this is not demonstrated renderer
                coverage.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Probe</th>
                      <th>Median / 50%</th>
                      <th>95% coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Linear read", "read-linear", "read50", "read95"],
                      ["Gather read · 16 KB", "read-gather-16kb", "gather50", "gather95"],
                      ["Linear write", "write-linear", "write50", "write95"],
                      ["Scatter write · 16 KB", "write-scatter-16kb", "scatter50", "scatter95"],
                    ].map(([label, slug, key50, key95]) => (
                      <tr key={slug}>
                        <td>
                          <a
                            href={`https://web3dsurvey.com/webgpu/performance/${slug}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {label} ↗
                          </a>
                        </td>
                        <td>
                          {number(config.survey[key50 as keyof Config["survey"]] as number, 3)} GB/s
                        </td>
                        <td>
                          {number(config.survey[key95 as keyof Config["survey"]] as number, 3)} GB/s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="help">
                16 KB gather can benefit from cache reuse; scatter writes a small footprint once.
                Neither is a universal texture or render-target limit. The planning allowance uses
                the slower linear read/write rate, scaled by your chosen fraction.
              </p>
              {!resultsOnly && (
                <details>
                  <summary>Override the snapshot</summary>
                  <label className="field">
                    <span>Snapshot date</span>
                    <input
                      type="date"
                      value={config.survey.date}
                      onChange={(e) => {
                        if (e.target.value)
                          update("survey", { ...config.survey, date: e.target.value });
                      }}
                    />
                  </label>
                  <div className="assumption-grid">
                    {Object.entries(config.survey)
                      .filter(([k]) => k !== "date")
                      .map(([key, value]) => (
                        <NumberField
                          key={key}
                          label={key.replace("50", " · median").replace("95", " · 95% coverage")}
                          suffix="GB/s"
                          value={value as number}
                          min={0.000001}
                          step={0.1}
                          onChange={(n) => update("survey", { ...config.survey, [key]: n })}
                        />
                      ))}
                  </div>
                </details>
              )}
            </section>
          </div>
        </div>
        <footer>
          <span>
            THREE AAA CALCULATOR <b> / </b> MODEL {MODEL_REVISION}
          </span>
          <div>
            <a
              href="https://ben3d.ca/blog/aaa-quality-on-a-web-budget"
              target="_blank"
              rel="noreferrer"
            >
              Read the article ↗
            </a>
            <a href="https://github.com/bhouston/webgpu-bench" target="_blank" rel="noreferrer">
              Benchmark methodology ↗
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
