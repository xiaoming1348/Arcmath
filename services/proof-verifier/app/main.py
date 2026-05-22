from fastapi import FastAPI

from . import classifier as classifier_module
from . import autoformalize as autoformalize_module
from . import lean_verifier, sympy_verifier
from . import prove_pipeline
from .schemas import (
    AutoformalizeRequest,
    AutoformalizeResponse,
    Backend,
    ClassifyRequest,
    ClassifyResponse,
    HealthResponse,
    LeanCompleteRequest,
    LeanCompleteResponse,
    LeanVerifyRequest,
    ProveRequest,
    ProveResponse,
    StepType,
    Verdict,
    VerifyRequest,
    VerifyResponse,
)

VERSION = "0.2.0"

app = FastAPI(title="Arcmath Proof Verifier", version=VERSION)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(version=VERSION)


@app.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest) -> ClassifyResponse:
    return classifier_module.classify(req.latex)


@app.post("/verify", response_model=VerifyResponse)
def verify(req: VerifyRequest) -> VerifyResponse:
    """Dispatch by step_type.

    - SymPy handles symbolic algebra (EQUATION / ALGEBRAIC_EQUIVALENCE /
      INEQUALITY).
    - For CLAIM steps we route to the Lean autoformalize+verify pipeline
      (`/prove`) so the kernel actually checks the assertion. Previously
      this branch called `lean_verifier.verify` which is a back-compat
      stub that always returns UNKNOWN — making step-level Lean
      verification effectively dead code.
    - Anything else returns UNKNOWN with a clear note so the v2 grader's
      escalation gate can flag it.

    Callers who already have raw Lean 4 source should use POST /verify/lean
    instead; that path bypasses autoformalization.
    """
    if req.step_type in (StepType.EQUATION, StepType.ALGEBRAIC_EQUIVALENCE, StepType.INEQUALITY):
        return sympy_verifier.verify(req.step_type, req.latex, req.assumptions)

    if req.step_type == StepType.CLAIM:
        prove_resp = prove_pipeline.prove(
            ProveRequest(
                domain="math",
                natural_language_statement=req.latex,
                planner_assumptions=req.assumptions,
                max_completion_retries=1,
            )
        )
        verdict_map = {
            "VERIFIED": Verdict.VERIFIED,
            "INVALID": Verdict.INVALID,
            "UNKNOWN": Verdict.UNKNOWN,
            "LLM_FAIL": Verdict.UNKNOWN,
            "NO_API_KEY": Verdict.UNKNOWN,
        }
        verdict = verdict_map.get(prove_resp.status, Verdict.UNKNOWN)
        confidence = (
            0.99
            if verdict == Verdict.VERIFIED
            else 0.92
            if verdict == Verdict.INVALID
            else 0.0
        )
        return VerifyResponse(
            verdict=verdict,
            backend=Backend.LEAN,
            confidence=confidence,
            details={
                "stage": "claim_via_prove",
                "prove_status": prove_resp.status,
                "retries_used": prove_resp.retries_used,
                "verifier_details": prove_resp.verifier_details,
                "notes": prove_resp.notes,
            },
        )

    return VerifyResponse(
        verdict=Verdict.UNKNOWN,
        backend=Backend.CLASSIFIER_ONLY,
        confidence=0.0,
        details={"note": "No formal backend handles this step type in MVP.", "step_type": req.step_type.value},
    )


@app.post("/verify/lean", response_model=VerifyResponse)
def verify_lean(req: LeanVerifyRequest) -> VerifyResponse:
    """Run raw Lean 4 source through lake+lean and return a verdict."""
    return lean_verifier.verify_lean_code(req.lean_code)


@app.post("/autoformalize", response_model=AutoformalizeResponse)
def autoformalize(req: AutoformalizeRequest) -> AutoformalizeResponse:
    """Natural-language statement → Lean 4 skeleton via OpenAI. Requires
    OPENAI_API_KEY in the verifier host's environment."""
    return autoformalize_module.autoformalize(req)


@app.post("/complete-lean", response_model=LeanCompleteResponse)
def complete_lean(req: LeanCompleteRequest) -> LeanCompleteResponse:
    """Fill `sorry` in a Lean draft with a real proof body via OpenAI."""
    return autoformalize_module.complete_lean(req)


@app.post("/prove", response_model=ProveResponse)
def prove(req: ProveRequest) -> ProveResponse:
    """One-shot NL → autoformalize → complete → kernel-verify."""
    return prove_pipeline.prove(req)
