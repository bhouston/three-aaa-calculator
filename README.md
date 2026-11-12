# Three AAA Calculator

A small Vite/React tool for exploring a Three.js lighting pipeline's **logical texture traffic and allocated GPU memory**.

**[Open the calculator](https://three-aaa-calculator.ben3d.ca)** · [The article](https://ben3d.ca/blog/aaa-quality-on-a-web-budget)

Configure canvas pixel ratio, internal scene scale, independent SSR/SSGI/GTAO resolutions, denoising, Hi-Z, transparents, reconstruction, frame rate, and scene asset memory. Inspect each pass and allocation, edit the assumptions, and export CSV or JSON. Computation happens entirely in the browser; there is no backend or GPU benchmark on this page.

## Editor and results-only embeds

- **Copy editable link** preserves the scenario and opens all controls.
- **Copy results link** opens the same scenario without editing controls, with a link to its full editor.
- **Copy embed HTML** creates an iframe for the results-only view.

The URL fragment contains the entire versioned configuration: toggles, dimensions, scales, coefficients, memory formats/working sets, coverage reference, allowance fraction, and dated survey values. An embed does not depend on the latest preset or live survey values. URLs are UTF-8/base64url encoded and validated before use. Invalid or unsupported links show a notice and fall back to the default; they never silently migrate to another model version. `MODEL_REVISION` identifies this implementation. Any future change to the meaning of an encoded field or calculation must introduce a new configuration/model version and retain the old engine for existing links.

To embed, paste the generated HTML into the article. The default iframe can scroll. For optional automatic height, give it an ID and add this to the **parent page**:

```html
<iframe
  id="aaa-budget"
  src="PASTE_GENERATED_RESULTS_URL"
  title="Three.js lighting budget"
  width="100%"
  height="1400"
  loading="lazy"
  style="border:0;border-radius:16px"
></iframe>
<script>
  const frame = document.getElementById("aaa-budget");
  window.addEventListener("message", (event) => {
    if (
      event.origin !== "https://three-aaa-calculator.ben3d.ca" ||
      event.source !== frame.contentWindow ||
      event.data?.type !== "three-aaa-calculator:resize" ||
      event.data?.version !== 1
    )
      return;
    const height = event.data.height;
    if (Number.isFinite(height) && height > 0 && height < 20000) {
      frame.height = String(Math.ceil(height));
    }
  });
</script>
```

## What the model counts

For each texture grid, dimensions are rounded down to whole pixels (minimum one):

1. Canvas = CSS viewport × pixel ratio.
2. Scene = canvas × internal scene scale.
3. Each screen-space effect = scene × that effect's scale.
4. Joint bilateral upsampling materializes lower-resolution effects at **scene** resolution.
5. TRAA runs at scene resolution; TAAU runs at canvas resolution. Without TAAU, the final output can spatially scale the scene to the canvas in the output pass.
6. Tone mapping/output runs at canvas resolution. Lowering canvas pixel ratio lowers this last pass as well; browser composition remains additional.

Per-pass traffic is `working pixels × logical bytes per working pixel × target fps`. This includes reads and writes; it is **not** measured DRAM traffic. Cache reuse, texture filtering, dependent reads, shader ALU, geometry, and pass overhead cannot be reduced to a universal frame-rate prediction.

Memory is an inventory of **named resident allocations**, not bandwidth divided by frame rate. G-buffer, previous depth, and Hi-Z are shared and counted once. Effect working sets, materialized upsample targets, and temporal history are separate. Upsampling is omitted when an effect already matches the scene grid. Disabling effects releases their own allocations while retaining inputs still used by other stages. Manual asset memory is added once. No inter-effect aliasing, MSAA attachments, implicit driver resources, browser surfaces, live shadows, or bloom are modeled.

The explicit inventory includes SSR/AO upsample targets and an AO filter scratch target that were absent from the article's original rough memory total. Four-tap joint bilateral upsample coefficients are budgeted independently for each signal. Consequently the calculator is **not a transcription of the old approximate total**: the engine is the source for subsequent comparisons. All coefficients are editable and preserved in shared URLs.

SSGI's default is a proposed one-ray, 32-depth-fetch design, with temporal accumulation and two five-tap spatial filters. It uses four effect-resolution RGBA16F targets (raw, two temporal histories, scratch) and a scene-resolution upsample target. Its trace, denoise, upsample and beauty read are separately counted. It is not a measurement of the current visibility-bitmask `SSGINode`. TAAU's **160 bytes/output pixel is a provisional allowance**, including history work, and needs implementation measurements; it is explicitly editable. The forward beauty coefficient is a nominal fixed material/cache budget, with an additional HDR GI read when SSGI is enabled. Pixel-format changes require reviewing corresponding traffic coefficients as well as memory inputs.

## Device coverage references

The included snapshot is dated **2026-11-12**. The UI links directly to all four metrics:

- [Linear reads](https://web3dsurvey.com/webgpu/performance/read-linear): coalesced streaming reads through a large storage buffer.
- [Gather reads, 16 KB](https://web3dsurvey.com/webgpu/performance/read-gather-16kb): independent random loads within a repeatedly accessed 16 KB footprint; cache reuse can matter. This is not dependent ray-march latency.
- [Linear writes](https://web3dsurvey.com/webgpu/performance/write-linear): coalesced storage-buffer writes.
- [Scatter writes, 16 KB](https://web3dsurvey.com/webgpu/performance/write-scatter-16kb): unique-destination writes once across a small footprint; dispatch cost is not a universal render-target limit.

See [webgpu-bench's implementation](https://github.com/bhouston/webgpu-bench/blob/main/packages/core/src/benchmarks/streamBandwidth.ts) and [methodology](https://github.com/bhouston/webgpu-bench/tree/main/packages/core#sampling-methodology), plus the survey's [aggregation](https://github.com/bhouston/web3dsurvey/blob/main/packages/web3dsurvey/src/helpers/getBenchmarkMetricStats.ts).

High-profile reference = **50% coverage / median**. Lowest-profile reference = **95% coverage**, a lower-tail threshold near the fifth performance percentile, not the fastest 95th percentile. These are distributions of submitted runs, not a census of unique devices. Separate marginal thresholds do not establish joint coverage for a complete renderer.

The planning allowance is `min(linear read threshold, linear write threshold) × chosen fraction`. The default fraction is 50%; this headroom choice is separate from the 50% population target. Applying the slower linear rate to all logical traffic is a conservative first check, not a physical model of mixed reads and writes. Gather and scatter rates remain separate references and are never added to streaming throughput.

The lowest preset uses cached lighting, spatial AA, a 390×844 CSS viewport at DPR 0.5, and a 30 fps target. There is no application-side full-native-resolution upscale or temporal history. Scene assets and browser composition remain additional. Meeting a traffic allowance does not prove sustained renderer performance or available memory. For end-to-end acceptance, confirm real hardware, warm each configuration, disable vsync/frame caps, benchmark sequentially for several seconds, count GPU-completed frames, and drain queued work before switching.

## Develop and deploy

Use Node 26 (`.nvmrc`) and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

GitHub Actions runs the checks on PRs and deploys green `main` builds to GitHub Pages. Vite uses relative asset URLs, supporting both a custom-domain root and a repository subpath. Configure Pages to use GitHub Actions and set the custom domain to `three-aaa-calculator.ben3d.ca`; its Cloudflare-proxied CNAME points to `bhouston.github.io`. The public hostname uses Cloudflare’s existing HTTPS configuration, with GitHub Pages as the origin.

Model and component tests cover resource dependencies, resolution rounding, output-sized temporal work, allocation release, traffic scaling, serialization, invalid URLs, results-only mode, clipboard fallback, and source links.

## License

MIT. Copyright 2026 Ben Houston.
