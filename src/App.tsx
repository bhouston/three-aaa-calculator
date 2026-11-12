import { useEffect, useMemo, useRef, useState } from "react";
import { calculate, configUrl, csv, labelsFor, modelRevision, readUrl } from "./model";
import type { Config } from "./model";

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
function ActionIcon({ kind }: { kind: "share" | "download" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "share" ? (
        <>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
        </>
      ) : (
        <>
          <path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4" />
        </>
      )}
    </svg>
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
  const [tab, setTab] = useState<"bandwidth" | "usage">("bandwidth");
  const resultsOnly = initial.resultsOnly;
  const shareRef = useRef<HTMLTextAreaElement>(null);
  const result = useMemo(() => calculate(config), [config]);
  const labels = labelsFor(config);
  // Version 2: SSGI's horizon pass already produces AO, so the separate AO pass is unused.
  const merged = config.version !== 1 && config.ssgi;
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
      {!resultsOnly && (
        <header className="topbar">
          <a className="brand" href={window.location.pathname}>
            <span className="brand-mark">△</span>
            <span>
              THREE <b>AAA</b>
              <small>CALCULATOR</small>
            </span>
          </a>
          <div className="top-links">
            <span className="model-pill">MODEL {modelRevision(config)}</span>
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
      )}
      <main>
        <section className="intro">
          <div>
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
                : "Explore the memory usage and memory bandwidth of a Three.js lighting pipeline. Change the frame, inspect the tradeoffs, and share the exact result."}
            </p>
          </div>
          {resultsOnly ? (
            <a className="button primary" href={editUrl} target="_blank" rel="noreferrer">
              Edit ↗
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
                  <h2>Calculation</h2>
                </div>
                <label className="field">
                  <span>Calculation title</span>
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
                  <div
                    key={id}
                    className={`effect ${config[id] && !(id === "gtao" && merged) ? "" : "disabled"}`}
                  >
                    <Toggle
                      label={id.toUpperCase()}
                      checked={config[id]}
                      onChange={(b) => update(id, b)}
                      detail={
                        {
                          ssr: "Screen-space reflections",
                          ssgi:
                            config.version === 1
                              ? "Screen-space diffuse bounce"
                              : "Horizon pass: diffuse bounce + AO",
                          gtao: merged
                            ? "Included in the SSGI horizon pass"
                            : "Ground-truth ambient occlusion",
                        }[id]
                      }
                    />
                    {config[id] && !(id === "gtao" && merged) && (
                      <>
                        <ScaleField
                          label={`${id.toUpperCase()} resolution`}
                          value={config[`${id}Scale`]}
                          onChange={(n) => update(`${id}Scale`, n)}
                        />
                        {id !== "gtao" && (
                          <Toggle
                            label={
                              id === "ssgi" && merged
                                ? "Temporal accumulation"
                                : "Temporal + spatial denoise"
                            }
                            checked={config[`${id}Denoise`]}
                            onChange={(b) => update(`${id}Denoise`, b)}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                <Toggle
                  label="Transparents + glass"
                  checked={config.transparent}
                  onChange={(b) => update("transparent", b)}
                  detail="Nominal quarter-screen coverage"
                />
              </section>
            </aside>
          )}
          <div className="results">
            <section className="summary" aria-label="Totals">
              <div className="metric">
                <span>Memory Bandwidth</span>
                <strong data-testid="total-bandwidth">
                  {number(result.gbps)}
                  <small>GB/s</small>
                </strong>
              </div>
              <div className="metric">
                <span>Memory Usage</span>
                <strong data-testid="total-memory">
                  {number(result.memoryBytes / 1e6)}
                  <small>MB</small>
                </strong>
              </div>
            </section>

            <section className="panel breakdown">
              <div className="breakdown-toolbar">
                {tab === "bandwidth" && (
                  <div className="stacked-bar" aria-label="Bandwidth share by pass group">
                    {groups.map((g) => (
                      <span
                        key={g.id}
                        style={{ width: `${(g.gbps / result.gbps) * 100}%`, background: g.color }}
                        title={`${g.id}: ${number(g.gbps)} GB/s`}
                      />
                    ))}
                  </div>
                )}
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
                    aria-selected={tab === "usage"}
                    onClick={() => setTab("usage")}
                  >
                    Usage
                  </button>
                </div>
              </div>
              {tab === "bandwidth" ? (
                <>
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
                          <th>Resolution</th>
                          <th title="Logical reads plus writes per working pixel">B/pixel</th>
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
                    </table>
                  </div>
                  {config.aa === "taau" && (
                    <p className="table-note">
                      TAAU traffic is a provisional estimate, not a measured implementation cost.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Allocation</th>
                          <th>Resolution</th>
                          <th>B/pixel</th>
                          <th>MB</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.resources.map((r) => (
                          <tr key={r.id}>
                            <td title={r.note}>{r.label}</td>
                            <td>{sizeText(r.size)}</td>
                            <td>{r.bytesPerPixel}</td>
                            <td>{number(r.bytes / 1e6, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>

            {!resultsOnly && (
              <section className="panel share">
                <h2>Share</h2>
                <div className="share-actions">
                  <button
                    className="button primary"
                    onClick={() => copy(embedUrl, "Results-only link copied.")}
                  >
                    <ActionIcon kind="share" />
                    Results Only
                  </button>
                  <button className="button" onClick={() => copy(editUrl, "Editable link copied.")}>
                    <ActionIcon kind="share" />
                    Editable
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      download(csv(config), "text/csv;charset=utf-8", "three-aaa-budget.csv")
                    }
                  >
                    <ActionIcon kind="download" />
                    CSV
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
                {config.version === 1 ? (
                  <p>
                    SSGI: one ray with 32 depth fetches, temporal accumulation and two five-tap
                    spatial filters. Raw GI, two histories and scratch use four RGBA16F targets.
                    Upsampling uses four GI/depth/normal taps plus center guides and an output
                    write. The proposed model is not a measurement of the current SSGI addon.
                    Forward beauty keeps a nominal fixed material/cache budget and adds one HDR GI
                    read when SSGI is on. No live shadows, MSAA or bloom are included.
                  </p>
                ) : (
                  <p>
                    SSGI is one horizon (visibility-bitmask) pass that returns diffuse bounce, AO
                    and a bent normal together, so GTAO runs separately only when SSGI is off. It
                    budgets 24 depth taps, with color and normal reads on half of them, against a
                    previous-frame radiance buffer reprojected once per frame. One temporal history
                    replaces the dedicated spatial filters, and AO and GI share one upsample. These
                    are estimates from the structure of Three.js's SSGINode, not measurements.
                    Forward beauty adds one GI read when SSGI is on. No live shadows, MSAA or bloom
                    are included.
                  </p>
                )}
                <h3>Bandwidth · bytes per working pixel</h3>
                <div className="assumption-grid">
                  {Object.entries(labels.costs).map(([key, label]) => (
                    <NumberField
                      key={key}
                      label={label}
                      value={config.costs[key]!}
                      onChange={(n) => update("costs", { ...config.costs, [key]: n })}
                    />
                  ))}
                </div>
                <h3>Memory usage · bytes per allocation pixel</h3>
                <div className="assumption-grid">
                  {Object.entries(labels.memory).map(([key, label]) => (
                    <NumberField
                      key={key}
                      label={label}
                      value={config.memory[key]!}
                      onChange={(n) => update("memory", { ...config.memory, [key]: n })}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
