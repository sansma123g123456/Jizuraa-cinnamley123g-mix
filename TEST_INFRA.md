# E2E Test Infra: JIZURA CIN MIX v2.0+

## Test Philosophy
- Opaque-box, requirement-driven testing. Derived strictly from `ORIGINAL_REQUEST.md`.
- Zero dependency on internal implementation details.
- Runs natively in Node.js test environment via `node --test` with simulated DOM, Canvas 2D, and WebAudio sandbox.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory & Test Coverage Matrix
| # | Feature | Requirement | Tier 1 (Coverage >=5) | Tier 2 (Boundary >=5) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|-------------|:---------------------:|:---------------------:|:----------------------:|:-------------------:|
| 1 | Audio Galaxy & Particle Orbit | R1 | 5 | 5 | ✓ | ✓ |
| 2 | Cyber Ribbon / Wave-Surface | R1 | 5 | 5 | ✓ | ✓ |
| 3 | Holographic Glass Lissajous | R1 | 5 | 5 | ✓ | ✓ |
| 4 | Safe Fallback on Style Switch | R1 | 5 | 5 | ✓ | ✓ |
| 5 | Drop Impact Multiplier & live audioDsp | R1 | 5 | 5 | ✓ | ✓ |
| 6 | 4 Kawaii Themes (Dark, White, White Blue, Dark Blue) | R2 | 5 | 5 | ✓ | ✓ |
| 7 | Dynamic Color Harmonizer (Saturation/Bloom) | R2 | 5 | 5 | ✓ | ✓ |
| 8 | LRCLIB 8s Timeout & Loading Spinner | R3 | 5 | 5 | ✓ | ✓ |
| 9 | Graceful Failure Toasts & Query Hints | R3 | 5 | 5 | ✓ | ✓ |
| 10 | Kinetic Syllable Glow | R3 | 5 | 5 | ✓ | ✓ |
| 11 | Typography Presets (Liquid, Glitch, 3D Flip) | R3 | 5 | 5 | ✓ | ✓ |
| 12 | 1-Click 16:9 & 9:16 Aspect Switch | R4 | 5 | 5 | ✓ | ✓ |
| 13 | Adaptive Safe-Zone Layout | R4 | 5 | 5 | ✓ | ✓ |
| 14 | Preset Vault (.jizura) Export & Import | R4 | 5 | 5 | ✓ | ✓ |
| 15 | Standalone Browser Execution (Zero Server) | R5 | 5 | 5 | ✓ | ✓ |
| 16 | Hash Parity & Multi-Point Sync Matrix | R5 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Runner**: Node.js built-in test runner (`node --test tests/*.test.js`).
- **Sandboxed Test Harness**: `createMockEnvironment()` simulating `window`, `document`, `HTMLCanvasElement`, Canvas 2D context, `AudioContext`, and `localStorage`.
- **Pass/Fail Semantics**: All test suites must exit with status 0, zero unhandled rejections, and zero assertion errors.

## Test Tier Structure
- **Tier 1 (Feature Coverage)**: >=80 test cases verifying individual features and APIs in isolation.
- **Tier 2 (Boundary & Corner Cases)**: >=80 test cases covering boundary values (0 duration, null inputs, extreme FFT amplitudes, 0/max drop multipliers, corrupted JSON, timeout edge cases).
- **Tier 3 (Cross-Feature Combinations)**: >=16 pairwise integration tests (e.g., 9:16 vertical + Dark Kawaii + Audio Galaxy; Glitch RGB Split + Drop Multiplier 2.5x; .jizura import during active playback).
- **Tier 4 (Real-World Application Scenarios)**: >=8 end-to-end full workflow scenarios (complete song lifecycle from LRC search -> theme switch -> 3D visualizer -> preset export -> 9:16 export).
- **Tier 5 (Adversarial Stress Testing)**: Executed during final milestone hardening by adversarial challengers.
