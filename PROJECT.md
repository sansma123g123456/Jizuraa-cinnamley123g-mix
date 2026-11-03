# Project: JIZURA CIN MIX v2.0+

## Architecture
- **Overview**: JIZURA CIN MIX v2.0+ is a standalone, client-side, zero-dependency AMV Studio, Kinetic Lyric Video Creator, and 3D Audio Visualizer running 100% in modern web browsers (`index.html`) without bundlers or local servers.
- **Script Guardrail (Critical Invariant)**: `index.html` contains exactly 12 script tags (3 external: `webm-muxer.min.js`, `amv_asset_library.js?v=3.3`, `src/amv_asset_manager.js?v=3.3`, and 9 inline scripts: Muxer/GIFENC, Core Engine, SubWindowAPI, StemVisualizerAPI, OscilloscopeScreen, JIZURA_I18N, ManualLyricSyncAPI, LrcLibAPI, AudioVisualizerAPI & SmartSectionAPI). Under no circumstances may new `<script>` tags be inserted; all enhancements must modify existing blocks.
- **Audio & Visualizer Pipeline**: WebAudio AnalyserNode / StemVisualizerAPI -> AudioVisualizerAPI (Canvas 2D 3D Perspective Projection Engine) & amv_asset_library -> Stage Compositor -> Post-processing Filter Stack (20 filters) -> 60 FPS Canvas Output.
- **Dual-Mirror Parity**: `amv_asset_manager.js` and `src/amv_asset_manager.js` are dual copies maintained at 100% byte-for-byte SHA256 parity.
- **Multi-Point Sync Matrix**: Workspace Root -> `public/`, `cloudflare_dist/`, `JIZURA CIN MIX/`, plus zip archives `JIZURA-CIN-MIX.zip` + `cloudflare_dist.zip`. Automated by `tools/sync_all_mirrors.mjs`, `tools/build_cloudflare.mjs`, `tools/pack_zip.mjs`.
- **Technique API Reference (source of truth)**: `docs/TECHNIQUE_API.md` documents the native technique registry (`J.register(group, key, def, pack)`) — all 10 groups (`layout/enter/hold/exit/decor/treat/bg/cam/fx/trans`), their exact signatures, the `env`/`it`/`charFn` contracts, preview-thumbnail requirements, audio-reactive helpers, and the check-list for adding new techniques. **Read this file before touching `index.html`** — it replaces re-reading the 55k-line engine.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Audio Galaxy & Particle Orbit 3D Visualizer | 3D particle orbit exploding and pulsing along 3D projection based on kick/bass energy | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Cyber Ribbon / Wave-Surface 3D Visualizer | Neon undulating 3D ribbon surface with depth gradient and audio wave modulation | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Holographic Glass Lissajous Vector Scope | Transparent glass vector scope with Lissajous stereo phase curves and chromatic dispersion | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Safe Visualizer Fallback Architecture | Resolves style switching blankouts, unknown style IDs safely fall back to `circle_trap` / `audio_trap_nation_pro` without crashing or disabling render | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Live Audio DSP Metrics Export | Expose `window.audioDsp` from Script #7 and connect to visualizer engines to restore live FFT reactivity | M1 | Survey Finding (Explorer 1) |
| 6 | Drop Impact Multiplier Integration | Connect `SmartSectionAPI.getDropImpactMultiplier(t)` into `AudioVisualizerAPI` and `amv_asset_library.js` for dynamic beat/drop impact boost | M1 | ORIGINAL_REQUEST §R1 |
| 7 | 4 Distinct Kawaii Theme Palettes | Fully implement Dark Kawaii (`#0c0914`, `#ff66aa`, `#66ffff`), White Kawaii (`#faf8ff`, `#ffb6c1`), White Xanh Nhạt Kawaii (`#a8f0e5`), Dark Xanh Nhạt Kawaii (`#061a23`, `#00ffc8`) in CSS and UI | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Theme Sync for Visualizers & Stage | Visualizers and AMV filters automatically adapt primary/secondary palettes based on active Kawaii theme | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Dynamic Color Harmonizer Engine | Smoothly interpolates saturation (0.95 -> 1.30) and bloom glow of Visualizers and AMV post-filters between calm verses and intense drop/chorus sections | M2 | ORIGINAL_REQUEST §R2 |
| 10 | LRCLIB 8-Second Abort Timeout & Spinner | Configures 8000ms timeout via AbortController, shows animated loading indicator during search | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Graceful LRCLIB Failure Toasts | Emits user-friendly toasts when connection times out, fails, or returns 0 results with query simplification tips; zero UI lockup | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Kinetic Typography Syllable Glow | Word-by-word active syllable highlight with accent color switch, bloom shadow glow, and punch scale driven by `wgeo` and `wordTimes` | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Typography Preset: Liquid Fill Glow | Flowing liquid gradient fill with soft glowing boundary | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Typography Preset: Glitch RGB Split | Multi-channel chromatic aberration with random horizontal glitch slice displacements | M3 | ORIGINAL_REQUEST §R3 |
| 15 | Typography Preset: 3D Flip Perspective | 3D rotation and perspective projection for active lyrics cards | M3 | ORIGINAL_REQUEST §R3 |
| 16 | 1-Click 16:9 & 9:16 Aspect Ratio Switch | Quick toggle button on Studio Tools Strip for 16:9 Landscape (YouTube) and 9:16 Portrait (TikTok/Shorts/Reels) | M4 | ORIGINAL_REQUEST §R4 |
| 17 | Aspect-Adaptive Layout & Safe Zones | Automatic repositioning of stage canvas, typography bounds, and visualizer center for optimal 9:16 vertical safe zone | M4 | ORIGINAL_REQUEST §R4 |
| 18 | Preset Vault (.jizura) Export | Pack entire project configuration (Theme + Visualizer + 18 AMV Post-Filters + Camera) into clean `.jizura` JSON file | M4 | ORIGINAL_REQUEST §R4 |
| 19 | Preset Vault (.jizura) Import | Restore full project configuration from uploaded `.jizura` file with validation and graceful error toasts | M4 | ORIGINAL_REQUEST §R4 |
| 20 | Dual-Mirror Hash Parity Enforcer | Guarantee 100% byte-for-byte SHA256 parity between `amv_asset_manager.js` and `src/amv_asset_manager.js` | M5 | ORIGINAL_REQUEST §R5 |
| 21 | Standalone Execution Verification | Guarantee `index.html` runs 100% standalone via `file:///` in modern browser with 0 bundlers and 0 external script dependencies | M5 | ORIGINAL_REQUEST §R5 |
| 22 | Multi-Point Deployment Sync | Automate full distribution sync to `public/`, `cloudflare_dist/`, `JIZURA CIN MIX/`, and zip archives | M5 | ORIGINAL_REQUEST §R5 |
| 23 | E2E Acceptance & Tier 5 Hardening | Pass 100% of E2E test suite (Tiers 1-4) and complete Tier 5 adversarial stress testing | M5 | ORIGINAL_REQUEST §Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Studio-Grade 3D Audio Visualizers & Drop Impact Engine | Features 1, 2, 3, 4, 5, 6: 3D perspective visualizers (Audio Galaxy, Cyber Ribbon, Holographic Lissajous), fallback safety, `window.audioDsp` live metrics, drop impact multiplier integration | None | DONE (All tests pass, 0.78-1.63ms/frame, 100% hash parity) |
| M2 | 4 Kawaii Themes & Color Harmonizer | Features 7, 8, 9: 4 Kawaii palettes, theme sync, dynamic saturation and bloom glow harmonizer across calm vs drop | M1 | PLANNED |
| M3 | LRCLIB Timeout/Feedback & Kinetic Typography v2.0 | Features 10, 11, 12, 13, 14, 15: 8s timeout, spinner, toast hints, syllable glow, 3 kinetic presets (Liquid Fill Glow, Glitch RGB Split, 3D Flip Perspective) | None | PLANNED |
| M4 | WebCodecs Multi-Format Export & Preset Vault (.jizura) | Features 16, 17, 18, 19: 1-click 16:9 / 9:16 toggle, adaptive safe zone, `.jizura` JSON export/import | M1, M2 | PLANNED |
| M5 | Standalone Integrity, 100% E2E Pass, Tier 5 Hardening & Multi-Point Sync | Features 20, 21, 22, 23: Standalone execution validation, 100% test pass against TEST_READY suite, Tier 5 adversarial hardening, hash parity check, multi-destination sync & zip creation | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### AudioVisualizerAPI ↔ AMVAssetLibrary ↔ Stage Engine
- `window.AudioVisualizerAPI.setStyle(styleId)`: Sets active style (`galaxy_orbit`, `cyber_ribbon_3d`, `holographic_lissajous`, etc.). Falls back to `circle_trap` on unknown ID without throwing.
- `window.AudioVisualizerAPI.render(ctx, W, H, t, opt, plan, sc)`: Renders 3D perspective visualizer directly on Canvas 2D context. Respects vertical safe zone offset when `H > W`.
- `window.audioDsp`: Global object exposed by Script #7 (`StemVisualizerAPI`) containing `smooth: { kick, bass, vocal, hihat, piano }`.
- `window.SmartSectionAPI.getDropImpactMultiplier(t)`: Returns number (1.0 to 3.0) applied as energy boost.

### Theme Engine ↔ Color Harmonizer ↔ AMV Filters
- `setTheme(themeId)`: Supports `'dark-kawaii'`, `'white-kawaii'`, `'white-blue-kawaii'`, `'dark-blue-kawaii'`. Sets CSS variables on `document.documentElement` and notifies `AudioVisualizerAPI.applyThemeColors()`.
- `ColorHarmonizer.getAdjustedStyle(baseColor, dropMultiplier)`: Returns dynamically boosted saturation and bloom glow radius for visualizers and post-processing filters.

### Kinetic Typography Engine (Script #5)
- `J.TREAT`: Registry of text treatments. New presets: `'liquidFillGlow'`, `'glitchRgbSplit'`, `'perspective3DFlip'`.
- Word timing evaluation: `wgeo(env, it)` and `wordTimes(env)` evaluate whether `ts[j] <= env.lt < ts[j+1]` to activate word syllable highlight and punch scale.

### Preset Vault (.jizura) Format
```json
{
  "format": "jizura-preset",
  "version": "2.0",
  "name": "Preset Name",
  "timestamp": 1729780000000,
  "theme": {
    "style": "dark-kawaii",
    "colors": { ... }
  },
  "visualizer": {
    "enabled": true,
    "style": "galaxy_orbit",
    "config": { ... }
  },
  "postFilters": [ ... ],
  "camera": { ... }
}
```

## Code Layout
- `index.html`: Main standalone web application (Script #1 to Script #12, strictly 12 tags).
- `amv_asset_manager.js`: Root-level AMV asset manager and post-processing controller.
- `src/amv_asset_manager.js`: Mirror copy of `amv_asset_manager.js` (must maintain identical hash).
- `amv_asset_library.js`: AMV presets and visualizer render routines.
- `tests/`: Automated test suites (`node --test --test-concurrency=1 tests/*.test.js`).
- `tools/`: Mirror sync, zip packing, Cloudflare build, perf/alloc probes.
- `docs/TECHNIQUE_API.md`: Source of truth for the technique registry (`J.register`).
