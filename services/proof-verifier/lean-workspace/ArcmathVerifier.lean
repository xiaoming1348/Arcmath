-- Carrier module imported by every student-side Lean snippet. We pre-compile
-- this once (`lake build`) so per-snippet Lean invocations only load one
-- olean (our lib) instead of re-resolving thousands of Mathlib symbols.
--
-- Add new imports here when classifier/autoformalize starts emitting code
-- that needs wider Mathlib coverage.

import Mathlib.Data.Real.Basic
import Mathlib.Data.Real.Sqrt
import Mathlib.Tactic.NormNum
import Mathlib.Tactic.Linarith
import Mathlib.Tactic.Positivity
import Mathlib.Tactic.Ring
import Mathlib.Tactic.FieldSimp

namespace ArcmathVerifier
-- Re-export a convenient shorthand; students `import ArcmathVerifier` and
-- immediately have real numbers, sqrt, common tactics.
end ArcmathVerifier
