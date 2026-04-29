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
    """Dispatch by step_type. SymPy handles symbolic algebra; Lean requires
    an already-formalized Lean source string (see /verify/lean)."""
    if req.step_type in (StepType.EQUATION, StepType.ALGEBRAIC_EQUIVALENCE, StepType.INEQUALITY):
        return sympy_verifier.verify(req.step_type, req.latex)

    if req.step_type in (StepType.CLAIM,):
        return lean_verifier.verify(req.step_type, req.latex)

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
