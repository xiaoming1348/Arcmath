import unittest

from app.autoformalize import autoformalize, complete_lean
from app.schemas import AutoformalizeRequest, LeanCompleteRequest


class DeterministicAutoformalizationTests(unittest.TestCase):
    def test_default_proof_does_not_require_openai(self) -> None:
        result = autoformalize(
            AutoformalizeRequest(
                natural_language_statement=(
                    "Prove that for every natural number n, n + 0 = n."
                )
            )
        )

        self.assertEqual(result.status, "OK")
        self.assertEqual(result.model, "deterministic")
        self.assertIn("arcmath_nat_add_zero", result.lean_code)
        self.assertIn("simp", result.lean_code)

    def test_default_calculation_does_not_require_openai(self) -> None:
        result = autoformalize(
            AutoformalizeRequest(
                natural_language_statement=(
                    "Compute and verify that 12^2 + 5^2 = 13^2."
                )
            )
        )

        self.assertEqual(result.status, "OK")
        self.assertEqual(result.model, "deterministic")
        self.assertIn("norm_num", result.lean_code)

    def test_complete_proof_skips_llm_when_draft_has_no_placeholder(self) -> None:
        lean_code = """theorem arcmath_nat_add_zero (n : Nat) : n + 0 = n := by
  simp"""
        result = complete_lean(LeanCompleteRequest(lean_draft=lean_code))

        self.assertEqual(result.status, "OK")
        self.assertEqual(result.lean_code, lean_code)
        self.assertFalse(result.still_has_sorry)
        self.assertEqual(result.model, "not-required")


if __name__ == "__main__":
    unittest.main()
