import unittest

from app.autoformalize import autoformalize
from app.schemas import AutoformalizeRequest


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


if __name__ == "__main__":
    unittest.main()
