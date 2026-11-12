# Three AAA Calculator

A small Vite/React tool for exploring a Three.js lighting pipeline's **memory bandwidth and memory usage**.

**[Open the calculator](https://three-aaa-calculator.ben3d.ca)** · [The article](https://ben3d.ca/blog/aaa-quality-on-a-web-budget)

Configure canvas pixel ratio, internal scene scale, independent SSR, SSGI and AO resolutions, denoising, transparents, reconstruction, and frame rate. Use the **Bandwidth** and **Usage** tabs to inspect each pass and allocation, edit the assumptions, and export CSV. Computation happens entirely in the browser; there is no backend or GPU benchmark on this page.

## Editor and results-only embeds

- **Editable** preserves the scenario and opens all controls.
- **Results Only** opens the same calculation with two compact summary cards and the pass breakdown, without navigation or a footer. **Edit ↗** opens its full editor.
- **CSV** downloads the pass and allocation breakdown.

The URL fragment contains the entire versioned configuration: toggles, dimensions, scales, coefficients, memory formats/working sets. An embed carries its own complete calculation inputs. URLs are UTF-8/base64url encoded and validated before use. Invalid or unsupported links show a notice and fall back to the default; they never silently migrate to another model version. The configuration's `version` selects the engine: **version 1** links keep the original separate GTAO and one-ray SSGI passes, and **version 2** (the default) merges them into one horizon pass. Any future change to the meaning of an encoded field or calculation must introduce a new configuration/model version and retain the old engine for existing links.

To embed, use the copied Results Only URL in an iframe. The default iframe can scroll. For optional automatic height, give it an ID and add this to the **parent page**:

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

Memory usage is an inventory of **named resident allocations**, not bandwidth divided by frame rate. G-buffer and previous depth are shared and counted once. SSR automatically includes the Hi-Z build pass and pyramid allocation; disabling SSR removes both, even when SSGI remains enabled. Hi-Z has no independent toggle. In version 2, SSGI's horizon pass also produces AO and a bent normal, so the separate AO pass and its upsample exist only when SSGI is off; the AO toggle and resolution are ignored while SSGI is on. Effect working sets, materialized upsample targets, and temporal history are separate. Upsampling is omitted when an effect already matches the scene grid. Disabling effects releases their own allocations while retaining inputs still used by other stages. Scene assets such as geometry, textures, lightmaps and probes are outside this total. No inter-effect aliasing, MSAA attachments, implicit driver resources, browser surfaces, live shadows, or bloom are modeled.

The explicit inventory includes SSR/AO upsample targets and an AO filter scratch target that were absent from the article's original rough memory total. Four-tap joint bilateral upsample coefficients are budgeted independently for each signal. Consequently the calculator is **not a transcription of the old approximate total**: the engine is the source for subsequent comparisons. All coefficients are editable and preserved in shared URLs.

SSGI's version 2 default follows the structure of Three.js's visibility-bitmask `SSGINode`: one horizon pass that returns diffuse bounce, AO and a bent normal. Per effect pixel it budgets:

- **Trace, 268 B:** a center depth gather and normal (20), 24 depth taps for one slice of 12 steps per side (96), a color and a normal read on the half of the taps that add visible sectors (144), and the GI, AO and bent normal write (8).
- **Previous-frame reprojection, 64 B:** the previous beauty is aligned to the current frame once, with four depth-validated history taps, so the horizon taps read it directly.
- **Temporal accumulation, 40 B:** one history. A horizon slice integrates a whole arc per sample, so no dedicated spatial filter is budgeted; the joint bilateral upsample and TRAA follow.
- **Upsample, 76 B per scene pixel:** AO and GI share the four guide taps.

GI is `R11G11B10` (4 B), with AO and a bent normal alongside (7 B together). The working set is the signal plus one history (14 B at effect resolution), the reprojected radiance is 8 B at effect resolution, and the upsampled result is 7 B at scene resolution. These are estimates read from the node's structure, not measurements; the share of taps that fetch color is the least certain input. Version 1 modeled one ray with 32 depth fetches, temporal accumulation, two five-tap spatial filters and four RGBA16F targets, next to a separate 16-tap GTAO pass. TAAU's **160 bytes/output pixel is a provisional estimate**, including history work, and needs implementation measurements; it is explicitly editable. The forward beauty coefficient is a nominal fixed material/cache budget, with an additional HDR GI read when SSGI is enabled. Pixel-format changes require reviewing corresponding traffic coefficients as well as memory inputs.

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

Model and component tests cover resource dependencies, resolution rounding, output-sized temporal work, allocation release, traffic scaling, serialization, invalid URLs, results-only mode, clipboard fallback, and editable settings.

## License

MIT. Copyright 2026 Ben Houston.
