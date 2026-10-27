<img width="2560" height="1440" alt="スクリーンショット 2026-04-17 6 56 59" src="https://github.com/user-attachments/assets/b7acc5be-5e09-4cc7-aeb4-bfedc9d3df67" />
<img width="2560" height="1440" alt="スクリーンショット 2026-04-17 6 55 46" src="https://github.com/user-attachments/assets/4fe0d9b2-706a-4120-a07f-52a83127697b" />

Install at [fontcluster.mugisus.me](https://fontcluster.mugisus.me)

## Development on Linux / NVIDIA / Wayland

If `pnpm tauri dev` exits with `Error 71 (Protocol error) dispatching to Wayland display`, use:

```sh
pnpm dev:wayland:nvidia
```

This command applies the NVIDIA explicit-sync workaround to this process and its children, while keeping WebKit's DMA-BUF renderer enabled. It clears an inherited `WEBKIT_DISABLE_DMABUF_RENDERER`, which can allow startup at the cost of severe rendering slowdown. It does not change system settings or the standard launch command. See [WebKit issue 280210](https://bugs.webkit.org/show_bug.cgi?id=280210).

This workaround fixes the startup path, not every frame-rate limitation. On the tested WebKitGTK 2.52.6 / NVIDIA 615.71.09 system, `drmWaitVBlank` returns `Operation not supported`; WebKit's fallback display timer runs at roughly 60 Hz. A graph-free, full-screen WebGL clear can still fall below that rate. Do not interpret a fast JavaScript render submission as proof of smooth on-screen presentation.

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
