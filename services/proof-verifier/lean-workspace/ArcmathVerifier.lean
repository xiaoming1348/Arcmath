-- Carrier module imported by every student-side Lean snippet.
--
-- We pre-compile this once via `lake build` so per-snippet invocations
-- only load ONE olean (this one) instead of re-resolving thousands of
-- Mathlib symbols. The umbrella `import Mathlib` line is intentional:
-- Mathlib's internal module layout changes between releases (e.g. the
-- v2 expansion against 4.30 hit half a dozen renamed paths like
-- `Mathlib.Data.Polynomial.*` → `Mathlib.Algebra.Polynomial.*`).
-- Importing the umbrella keeps this file stable across upgrades.
--
-- Cost of `import Mathlib`:
--   - olean size: ~2-4 GB (one-time, shipped in Docker image)
--   - first-load time on Fly worker: ~3-5s (warm cache after that)
--   - per-snippet check time: unchanged — students still load just this
--     one olean, not all of Mathlib
--
-- Add Aesop explicitly because it lives in its own package and is not
-- re-exported by Mathlib's umbrella in some Lean versions.

import Mathlib
import Aesop

namespace ArcmathVerifier
-- Students `import ArcmathVerifier` and immediately have the full
-- Mathlib surface (algebra, combinatorics, geometry, number theory,
-- polynomials, inequalities, ring/field tactics, polyrith, positivity,
-- nlinarith, aesop, …).
end ArcmathVerifier
