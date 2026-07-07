# Bundled models

## `student_repvit_m1_0_v3/model.onnx`

A compact (~28 MB) font-embedding model that maps a rendered glyph image to a
512-dimensional embedding. Cosine similarity between embeddings reflects
perceptual similarity between fonts; FontCluster clusters and lays out fonts in
this space.

- **Architecture**: RepViT-M1.0 vision backbone
- **Input**: `gray_image` — `[8, 1, 224, 224]` grayscale, pixel values in `[0, 1]`
  (fixed batch of 8; the app pads partial batches)
- **Output**: `embedding` — `[8, 512]`, compared with cosine similarity

The model is a student network obtained by knowledge distillation. The teacher
is a CLIP ViT-B/32 fine-tuned on font renderings following the FontCLIP
approach, and the student is trained to reproduce the teacher's
font-similarity structure at a fraction of the size and inference cost.
Retrieval quality is evaluated against the crowdsourced font attribute triplet
data from O'Donovan et al.

## Acknowledgements

This model stands on the shoulders of the following research, and we are
sincerely grateful to the authors:

- **FontCLIP** — the core idea this app is built on: connecting a
  vision-language model with typographic knowledge.
  Yuki Tatsukawa, I-Chao Shen, Anran Qi, Yuki Koyama, Takeo Igarashi, and
  Ariel Shamir. *FontCLIP: A Semantic Typography Visual-Language Model for
  Multilingual Font Applications.* Computer Graphics Forum 43
  (Eurographics 2024).
  [arXiv:2403.06453](https://arxiv.org/abs/2403.06453) ·
  [DOI](https://doi.org/10.1111/cgf.15043) ·
  [Code (MIT)](https://github.com/yukistavailable/FontCLIP)

- **CLIP** — the pretrained vision-language model FontCLIP builds upon.
  Alec Radford et al. *Learning Transferable Visual Models From Natural
  Language Supervision.* ICML 2021.
  [arXiv:2103.00020](https://arxiv.org/abs/2103.00020) ·
  [Code (MIT)](https://github.com/openai/CLIP)

- **Font attribute dataset** — the crowdsourced attribute and triplet data
  used for fine-tuning and evaluation.
  Peter O'Donovan, Jānis Lībeks, Aseem Agarwala, and Aaron Hertzmann.
  *Exploratory Font Selection Using Crowdsourced Attributes.*
  ACM Transactions on Graphics 33(4) (SIGGRAPH 2014).
  [Project page](https://www.dgp.toronto.edu/~donovan/font/)

- **RepViT** — the efficient backbone architecture of the student model.
  Ao Wang, Hui Chen, Zijia Lin, Jungong Han, and Guiguang Ding.
  *RepViT: Revisiting Mobile CNN From ViT Perspective.* CVPR 2024.
  [arXiv:2307.09283](https://arxiv.org/abs/2307.09283) ·
  [Code](https://github.com/THU-MIG/RepViT)

```bibtex
@article{tatsukawa2024fontclip,
  title   = {FontCLIP: A Semantic Typography Visual-Language Model for
             Multilingual Font Applications},
  author  = {Tatsukawa, Yuki and Shen, I-Chao and Qi, Anran and Koyama, Yuki
             and Igarashi, Takeo and Shamir, Ariel},
  journal = {Computer Graphics Forum},
  volume  = {43},
  number  = {2},
  year    = {2024},
  doi     = {10.1111/cgf.15043}
}
```
