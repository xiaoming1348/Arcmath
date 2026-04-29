import ArcmathVerifier
namespace ArcmathAttempt

theorem arcmath_sum_sq_le_n_sum_sq {n : ℕ} (x : Fin n → ℝ) :
  (∑ i, x i)^2 ≤ n * ∑ i, (x i)^2 := by
  by_cases hn : n = 0
  · rw [hn]
    simp
  have : 0 < (n : ℝ) := by
    rw [Nat.cast_pos]
    exact Nat.pos_of_ne_zero hn
  have := CauchySchwarz.ineq (fun i ↦ x i) (fun _ ↦ 1) Finset.univ
  simp only [Pi.one_apply, Finset.sum_const, nsmul_eq_mul, mul_one, Finset.card_univ] at this
  rw [mul_comm] at this
  exact this

end ArcmathAttempt
