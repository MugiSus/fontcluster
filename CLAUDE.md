# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FontCluster is a sophisticated Tauri-based desktop application implementing a complete machine learning pipeline for font analysis and clustering. The application combines a **Rust backend** handling computationally intensive ML operations with a **SolidJS frontend** providing interactive visualization of font similarity.

## Architecture

### ML Pipeline Architecture (4-Stage Process)

The core backend implements a sequential ML pipeline in `src-tauri/src/core/`:

1. **Font Discovery** (`font_service.rs`) - System font enumeration with intelligent filtering
2. **Image Generation** (`image_generator.rs`) - Concurrent font rendering using pathfinder_geometry  
3. **Feature Extraction** (`vectorizer.rs`) - HOG feature extraction from rendered font images
4. **Dimensionality Reduction + Clustering** (`compressor.rs` + `clusterer.rs`) - PaCMAP projection + Gaussian Mixture clustering

**Key Pipeline Flow:**
```
Text Input → Session Creation → Font Discovery → Batch Image Rendering → 
HOG Vectorization → PaCMAP Compression → GMM Clustering → 2D Visualization
```

### Session Management System

- **UUIDv7 identifiers** for temporal session ordering
- **OS-specific data directories** using `dirs` crate  
- **Hierarchical storage**: `{session_id}/{font_name}/[config.json, sample.png, vector.csv, compressed-vector.csv]`
- **Automatic restoration** with latest session fallback
- **JSON serialization** for all configuration persistence

### Frontend-Backend Communication

- **Single orchestration command** (`run_jobs`) triggers entire ML pipeline
- **Event-driven progress tracking** with real-time numerator/denominator updates
- **Resource-based data loading** for session restoration and vector access
- **Session lifecycle management** through dedicated Tauri commands

### Concurrency & Performance Model

- **Semaphore-controlled parallelism** (16 concurrent font rendering tasks)
- **Batch processing** (128 tasks per batch, 50 images per vectorization batch)
- **Memory-bounded allocation** with safety checks in image processing
- **Optimized Cargo profiles** with thin LTO and dependency-specific optimization levels

## Development Commands

### Primary Development Workflow
```bash
# Full development environment (builds Rust backend + starts frontend)
pnpm tauri dev

# Complete code quality pipeline (typecheck + lint + format check)
pnpm check

# Quick backend syntax validation
cargo check
```

### Frontend Development
```bash
pnpm install           # Install dependencies
pnpm dev              # Start Vite dev server only
pnpm build            # Build frontend
pnpm serve            # Preview production build

# Individual quality checks
pnpm typecheck        # TypeScript validation
pnpm lint             # ESLint
pnpm lint:fix         # Auto-fix ESLint issues  
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting only
```

### Tauri Operations
```bash
pnpm tauri build      # Production application build
pnpm tauri icon       # Regenerate icons (edit root icon.png only)
pnpm tauri [command]  # Direct Tauri CLI access
```

### Rust Backend
```bash
# From src-tauri directory:
cargo build --release  # Optimized production build
cargo test             # Run unit tests (currently minimal)
```

## Key Technologies & Dependencies

### Machine Learning Stack
- **linfa-clustering@0.7.1**: Gaussian Mixture Model implementation (replaced HDBSCAN)
- **pacmap@0.2**: Pairwise Controlled Manifold Approximation for dimensionality reduction
- **nalgebra@0.33**: Linear algebra operations for PCA fallback
- **imageproc@0.24**: HOG feature extraction from rendered font images

### Font Processing
- **font-kit@0.14**: Cross-platform system font discovery and loading
- **pathfinder_geometry@0.5**: Font glyph rendering and rasterization to canvas

### Dual ndarray Version Management
- **ndarray@0.16**: Primary version for pacmap compatibility
- **ndarray_015**: Aliased version 0.15 for linfa-clustering compatibility
- Both versions coexist using Cargo package aliases

### UI Framework
- **SolidJS@1.9.3**: Reactive frontend framework with signals-based state management
- **Kobalte Core@0.13.10**: Accessible UI component primitives
- **Tailwind CSS**: Utility-first styling with @corvu/resizable for split-pane layouts

## Critical Implementation Details

### ML Algorithm Parameters (Tuned for Font Similarity)

**PaCMAP Configuration:**
- `learning_rate: 0.08` - Optimized for stable font positioning
- `far_pair_ratio: 8.0` - Prevents outlier separation while preserving structure
- `mid_near_ratio: 1.0` - Balanced mid-range relationship emphasis

**Gaussian Mixture Model:**
- `epsilon: 0.5` - Convergence tolerance for clustering
- **Dynamic component estimation**: `min(8, max(2, samples * 0.1))`
- Soft clustering with probability distributions

**HOG Features:**
- **9 orientations**, **8-pixel cells**, **2x2 blocks**
- Standardized **512x96 canvas** with aspect ratio preservation
- **~2000-4000 features** per font depending on complexity

### Error Handling Strategy

- **Comprehensive FontError enum** covering all pipeline failure modes
- **Graceful degradation** with progress tracking adjustment for failed fonts
- **Silent font skipping** for non-renderable fonts (symbols, corrupted files)
- **Resource exhaustion protection** with memory allocation limits

### Data Persistence Format

**Session Structure:**
```
OS Data Dir/FontCluster/Generated/{session_id}/
├── config.json (session metadata)
└── {safe_font_name}/
    ├── config.json (font metadata: display_name, family, weight)
    ├── sample.png (96pt rendered sample text)
    ├── vector.csv (raw HOG feature vector)
    └── compressed-vector.csv (x,y,cluster_id)
```

## Important Development Notes

### Performance Considerations
- **All font processing is CPU-intensive** and uses async spawn_blocking
- **Memory usage scales with font count** - monitor for large font collections  
- **Concurrent processing limits** prevent resource exhaustion (tuned for 16 cores)
- **Image generation is the primary bottleneck** - focus optimization efforts here

### Platform Compatibility
- **Cross-platform font discovery** handled by font-kit SystemSource
- **OS-specific session storage** using dirs crate standard locations
- **Icon generation** automated - only edit root `icon.png` file

### Architecture Patterns
- **Functional programming style** in clustering module with pure functions
- **Event-driven UI updates** using Tauri's event system
- **Resource-based data loading** with automatic caching and invalidation
- **Pipeline composition** with clear stage boundaries and error isolation

### Current Limitations
- **No automated testing** - test infrastructure needs implementation
- **Limited error recovery** - pipeline restart requires manual intervention  
- **No runtime parameter tuning** - ML parameters hardcoded for optimal defaults
- **Single session processing** - no concurrent session support

## Testing Strategy (Future Implementation)

When implementing tests:
- **Frontend**: Use Vitest for component and integration testing
- **Backend**: Expand `cargo test` coverage for ML pipeline stages
- **E2E**: Test complete pipeline with known font sets for reproducible results
- **Performance**: Benchmark font processing throughput for regression detection