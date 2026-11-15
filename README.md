<img width="2560" height="1440" alt="スクリーンショット 2026-04-17 6 56 59" src="https://github.com/user-attachments/assets/b7acc5be-5e09-4cc7-aeb4-bfedc9d3df67" />
<img width="2560" height="1440" alt="スクリーンショット 2026-04-17 6 55 46" src="https://github.com/user-attachments/assets/4fe0d9b2-706a-4120-a07f-52a83127697b" />

Install at [fontcluster.mugisus.me](https://fontcluster.mugisus.me)

## Acknowledgements

FontCluster's font-similarity engine is built on **FontCLIP**, and this app would not exist without the research behind it. Deep thanks to its authors:

> Yuki Tatsukawa, I-Chao Shen, Anran Qi, Yuki Koyama, Takeo Igarashi, and Ariel Shamir.
> *FontCLIP: A Semantic Typography Visual-Language Model for Multilingual Font Applications.*
> Computer Graphics Forum 43 (Eurographics 2024).
> [arXiv:2403.06453](https://arxiv.org/abs/2403.06453) · [DOI](https://doi.org/10.1111/cgf.15043) · [Code](https://github.com/yukistavailable/FontCLIP)

FontCluster uses FontCLIP ViT-B/32 (`fontclip-vit-b32-v1`), downloaded and verified on demand from [fontcluster-models](https://github.com/MugiSus/fontcluster-models). Inference runs through ONNX Runtime Web's CPU WebAssembly backend in a dedicated Web Worker; the Wasm runtime ships with the application and does not load from a CDN. The Rust application no longer links native ONNX Runtime. Model provenance, attribution, and licensing information are documented in the model repository.

Rust retains model installation, image preprocessing, job progress/cancellation, session storage, and clustering. A Worker lives for one processing run and is terminated on completion, cancellation, or failure. Inference currently uses one Wasm thread, so it does not require cross-origin isolation. PCA still uses the platform's native numerical libraries.

Saved sessions retain their original model identity when opened. Recalculating a session created with another model switches it to FontCLIP and invalidates its embeddings through the existing session transition; old and new embedding spaces are never combined. Clustering-only changes to an existing FontCLIP session reuse its stored vectors.

## License

Copyright © 2026 mugisus

Licensed under the GNU General Public License v2.0 or later (GPL-2.0-or-later). See [LICENSE](LICENSE) for details.
