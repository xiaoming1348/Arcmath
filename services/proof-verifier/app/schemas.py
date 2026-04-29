from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class StepType(str, Enum):
    ALGEBRAIC_EQUIVALENCE = "ALGEBRAIC_EQUIVALENCE"
    EQUATION = "EQUATION"
    INEQUALITY = "INEQUALITY"
    CLAIM = "CLAIM"
    DEDUCTION = "DEDUCTION"
    CASE_SPLIT = "CASE_SPLIT"
    CONCLUSION = "CONCLUSION"
    UNKNOWN = "UNKNOWN"


class Backend(str, Enum):
    SYMPY = "SYMPY"
    LEAN = "LEAN"
    LLM_JUDGE = "LLM_JUDGE"
    GEOGEBRA = "GEOGEBRA"
    CLASSIFIER_ONLY = "CLASSIFIER_ONLY"
    NONE = "NONE"


class Verdict(str, Enum):
    VERIFIED = "VERIFIED"
    PLAUSIBLE = "PLAUSIBLE"
    UNKNOWN = "UNKNOWN"
    INVALID = "INVALID"
    ERROR = "ERROR"


class ClassifyRequest(BaseModel):
    latex: str = Field(min_length=1, max_length=4000)
    context_latex: list[str] = Field(default_factory=list, max_length=20)


class ClassifyResponse(BaseModel):
    step_type: StepType
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str


class VerifyRequest(BaseModel):
    step_type: StepType
    latex: str = Field(min_length=1, max_length=4000)
    context_latex: list[str] = Field(default_factory=list, max_length=20)
    # Optional assumption hints (variable domain, e.g. "x>0"). Parsed best-effort.
    assumptions: list[str] = Field(default_factory=list, max_length=10)


class VerifyResponse(BaseModel):
    verdict: Verdict
    backend: Backend
    confidence: float = Field(ge=0.0, le=1.0)
    details: dict[str, Any] = Field(default_factory=dict)


class LeanVerifyRequest(BaseModel):
    lean_code: str = Field(min_length=1, max_length=20000)


class AutoformalizeRequest(BaseModel):
    domain: str = Field(default="math", max_length=64)
    natural_language_statement: str = Field(min_length=1, max_length=4000)
    planner_assumptions: list[str] = Field(default_factory=list, max_length=32)
    openai_endpoint: str = Field(default="https://api.openai.com/v1/chat/completions")
    openai_model: str = Field(default="gpt-4.1")


class AutoformalizeResponse(BaseModel):
    status: Literal["OK", "NO_API_KEY", "LLM_FAIL", "EMPTY"]
    lean_code: str = ""
    model: str = ""
    raw_reason: str = ""


class LeanCompleteRequest(BaseModel):
    lean_draft: str = Field(min_length=1, max_length=20000)
    openai_endpoint: str = Field(default="https://api.openai.com/v1/chat/completions")
    openai_model: str = Field(default="gpt-4.1")


class LeanCompleteResponse(BaseModel):
    status: Literal["OK", "NO_API_KEY", "LLM_FAIL", "EMPTY"]
    lean_code: str = ""
    still_has_sorry: bool = False
    model: str = ""
    raw_reason: str = ""


class ProveRequest(BaseModel):
    domain: str = Field(default="math", max_length=64)
    natural_language_statement: str = Field(min_length=1, max_length=4000)
    planner_assumptions: list[str] = Field(default_factory=list, max_length=32)
    openai_endpoint: str = Field(default="https://api.openai.com/v1/chat/completions")
    openai_model: str = Field(default="gpt-4.1")
    max_completion_retries: int = Field(default=1, ge=0, le=3)


class ProveResponse(BaseModel):
    status: Literal["VERIFIED", "INVALID", "UNKNOWN", "LLM_FAIL", "NO_API_KEY"]
    autoformalized: str = ""
    completed: str = ""
    verifier_verdict: Verdict | None = None
    verifier_details: dict[str, Any] = Field(default_factory=dict)
    retries_used: int = 0
    model: str = ""
    notes: str = ""


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
