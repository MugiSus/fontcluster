# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required Actions

1. **Read CLAUDE.md** - Always read this file before starting any task
2. **Commit Changes** - Create a git commit every time you complete a task
3. **Log Conversations** - Always update hourly log file in CLAUDELOGS folder with all conversations and execution logs
   - Use filename format: `CLAUDELOGS/CLAUDELOG-YYMMDD-HH.md`
   - Use timestamp format: `YYYY/MM/DD HH:MM:SS (UTC+[TIMEZONE])` in inline code
   - Always get current time with `date` command before logging
   - Structure as ## `<timestamp> - <username>` with conversation under it
   - Record timestamp when user sends prompt, not when executing
   - **Create new hourly log file if it doesn't exist** - Always create the appropriate hourly file based on current time
   - **Format Requirements**: 
     - H1 title only (no Current Tasks section)
     - Each conversation entry with timestamp H2
     - **mugisus:** and **Claude:** format for dialogue
     - No Execution Log section needed - conversation record is sufficient

## Project Overview

FontCluster is a Tauri-based desktop application for analyzing and clustering fonts based on visual similarity. The application combines a SolidJS frontend with a Rust backend to provide font visualization, clustering, and analysis capabilities.

## Architecture

### Frontend (SolidJS + TypeScript)
- **Framework**: SolidJS with TypeScript and Vite
- **UI Components**: Custom UI components in `src/components/ui/` using Kobalte core and Tailwind CSS
- **State Management**: Reactive state using SolidJS signals in `src/hooks/use-app-state.ts`
- **Main Components**:
  - `FontProcessingForm` - Input form for sample text and processing controls
  - `FontClusterVisualization` - Interactive 2D visualization of font clusters
  - `FontCompressedVectorList` - List view of fonts sorted by name or similarity
  - `SessionSelector` - Dialog for managing processing sessions

### Backend (Rust + Tauri)
The backend uses a modular architecture organized into several core modules:

- **Core Modules** (`src-tauri/src/core/`):
  - `font_service.rs` - Font discovery and management using font-kit
  - `image_generator.rs` - Font rendering to images using pathfinder_geometry
  - `vectorizer.rs` - Image-to-vector conversion for analysis
  - `compressor.rs` - Dimensionality reduction using PaCMAP and PCA
  - `clusterer.rs` - Font clustering using HDBSCAN algorithm
  - `session.rs` - Session management with UUIDv7 for persistence

- **Commands** (`src-tauri/src/commands/`):
  - Tauri command handlers exposing backend functionality to frontend
  - Organized by feature: font_commands, job_commands, session_commands, vector_commands

- **Configuration** (`src-tauri/src/config/`):
  - Font processing parameters and session configuration
  - Constants for image generation and clustering parameters

## Development Commands

### Frontend Development
```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build frontend
pnpm build

# Preview production build
pnpm serve

# Code quality checks
pnpm lint          # ESLint
pnpm lint:fix      # Auto-fix ESLint issues
pnpm format        # Format with Prettier
pnpm format:check  # Check formatting
pnpm typecheck     # TypeScript type checking
pnpm check         # Run all checks (typecheck + lint + format:check)
```

### Tauri Development
```bash
# Run in development mode (builds Rust backend + starts frontend)
pnpm tauri dev

# Build production application
pnpm tauri build

# Generate Tauri icons (after updating icon.png)
pnpm tauri icon

# Access Tauri CLI directly
pnpm tauri [command]
```

### Rust Backend
```bash
# From src-tauri directory:
cargo build        # Development build
cargo build --release  # Production build
cargo test          # Run tests
cargo check         # Quick syntax check
```

## Key Technologies

### Machine Learning & Analysis
- **HDBSCAN**: Hierarchical density-based clustering for font grouping
- **PaCMAP**: Pairwise Controlled Manifold Approximation for dimensionality reduction
- **PCA**: Principal Component Analysis as fallback for dimensionality reduction
- **Vector Search**: Similarity search using compressed font vectors

### Font Processing
- **font-kit**: Cross-platform font discovery and loading
- **pathfinder-geometry**: Font glyph rendering and rasterization
- **image/imageproc**: Image processing and manipulation

### Session Management
- Sessions use UUIDv7 for temporal ordering
- Each session stores fonts, vectors, and clustering results
- Automatic cleanup of old sessions
- Session restoration through menu or dialog

## Testing

Currently no automated tests are configured. When adding tests:
- Frontend: Consider Vitest for unit tests
- Backend: Use `cargo test` for Rust unit tests
- Integration: Test Tauri commands through the frontend

## Important Notes

- All font processing is CPU-intensive and runs asynchronously
- Sessions are stored in OS-specific directories using the `dirs` crate
- The application supports system font discovery across platforms
- Clustering parameters in `constants.rs` may need adjustment based on font dataset size
- Icon files are automatically generated - only edit the root `icon.png` file