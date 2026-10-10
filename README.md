<img width="2560" height="1440" alt="スクリーンショット 2026-04-17 6 56 59" src="https://github.com/user-attachments/assets/b7acc5be-5e09-4cc7-aeb4-bfedc9d3df67" />
<img width="2560" height="1440" alt="スクリーンショット 2026-04-17 6 55 46" src="https://github.com/user-attachments/assets/4fe0d9b2-706a-4120-a07f-52a83127697b" />

Install at [fontcluster.mugisus.me](https://fontcluster.mugisus.me)

## Development on Linux / NVIDIA / Wayland

If `pnpm tauri dev` exits with `Error 71 (Protocol error) dispatching to Wayland display`, use:

```sh
pnpm dev:wayland:nvidia
```

This command applies the NVIDIA explicit-sync workaround to this process and its children, while keeping WebKit's DMA-BUF renderer enabled. It clears an inherited `WEBKIT_DISABLE_DMABUF_RENDERER`, which can allow startup at the cost of severe rendering slowdown. It does not change system settings or the standard launch command. See [WebKit issue 280210](https://bugs.webkit.org/show_bug.cgi?id=280210).

This workaround fixes the startup path, not every frame-rate limitation. On the tested WebKitGTK 2.52.6 / NVIDIA 615.71.09 system, `drmWaitVBlank` returns `Operation not supported`; WebKit's fallback display timer runs at roughly 60 Hz. A graph-free, full-screen WebGL clear can still fall below that rate. Do not interpret a fast JavaScript render submission or passing rendering tests as proof of smooth on-screen presentation.

## High refresh rate on macOS

The macOS build registers [tauri-plugin-macos-fps](https://github.com/userFRM/tauri-plugin-macos-fps) for every WebView. It disables WebKit's `PreferPageRenderingUpdatesNear60FPSEnabled` preference so `requestAnimationFrame` can follow a high-refresh display. No frontend timer or fixed 120 FPS rendering loop is added; the graph still renders on demand.

The plugin targets the cap on macOS 13–15. Its maintainer reports native refresh rates without the workaround on macOS 26. This integration has not yet been measured on a Mac. It removes a preference, not GPU workload, power-saving limits, or the display's configured refresh-rate limit. The plugin uses a private WebKit API, so this build is intended for the existing direct DMG distribution, not the Mac App Store.

Start normally with `pnpm tauri dev`. For an A/B comparison, restart with the plugin disabled:

```sh
pnpm tauri dev --config '{"plugins":{"macos-fps":{"enabled":false}}}'
```

On the high-refresh display, run this finite diagnostic in the app's Web Inspector console, then pan or zoom during the measurement. Repeat with the plugin enabled and disabled, keeping window size and display settings identical:

```js
async function measureAnimationCadence() {
  const times = [];
  for (let i = 0; i < 241; i++) {
    times.push(await new Promise(requestAnimationFrame));
    if (document.visibilityState !== 'visible') {
      throw new Error('Keep the app visible for the whole measurement');
    }
  }
  const intervals = times.slice(1).map((time, i) => time - times[i]);
  intervals.sort((a, b) => a - b);
  return {
    animationCallbacksPerSecond: 240000 / (times[240] - times[0]),
    intervalMedianMs: intervals[120],
    intervalP95Ms: intervals[227],
  };
}
await measureAnimationCadence();
```

About 8.3 ms indicates a 120 Hz callback cadence; about 16.7 ms indicates 60 Hz. This measures animation callbacks, not frames physically presented by the compositor. Compare visible motion too. The macOS plugin has no effect on Linux's separate WebKitGTK fallback described above. WebKit's `WEBKIT_DISPLAY_REFRESH_THROTTLE_FPS` only throttles an existing display cadence; setting it to 120 does not raise the fallback timer's rate.

## Acknowledgements

FontCluster's font-similarity engine is built on **FontCLIP**, and this app would not exist without the research behind it. Deep thanks to its authors:

> Yuki Tatsukawa, I-Chao Shen, Anran Qi, Yuki Koyama, Takeo Igarashi, and Ariel Shamir.
> *FontCLIP: A Semantic Typography Visual-Language Model for Multilingual Font Applications.*
> Computer Graphics Forum 43 (Eurographics 2024).
> [arXiv:2403.06453](https://arxiv.org/abs/2403.06453) · [DOI](https://doi.org/10.1111/cgf.15043) · [Code](https://github.com/yukistavailable/FontCLIP)

FontCluster downloads selectable embedding models on demand from [fontcluster-models](https://github.com/MugiSus/fontcluster-models). Installed models are cached by model ID: delete the local model directory when replacing assets under a mutable development release, and publish generally distributed updates under a new ID such as `v2`. Model provenance, attribution, and licensing information are documented in that repository.

## License

Copyright © 2026 mugisus

Licensed under the GNU General Public License v2.0 or later (GPL-2.0-or-later). See [LICENSE](LICENSE) for details.
