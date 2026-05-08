"""One-shot NL → Lean → verify pipeline, stitching autoformalize + complete + kernel.

Called from the `/prove` HTTP endpoint. Used both directly by the Next.js app
for step-level formal verification and by the offline problem pre-processor
to compute a canonical `formalizedStatement` at ingest time.
"""

from __future__ import annotations

from . import autoformalize as autoformalize_module
from . import lean_verifier
from .schemas import (
    AutoformalizeRequest,
    LeanCompleteRequest,
    ProveRequest,
    ProveResponse,
    Verdict,
)


def prove(req: ProveRequest) -> ProveResponse:
    af = autoformalize_module.autoformalize(
        AutoformalizeRequest(
            domain=req.domain,
            natural_language_statement=req.natural_language_statement,
            planner_assumptions=req.planner_assumptions,
            openai_endpoint=req.openai_endpoint,
            openai_model=req.openai_model,
        )
    )
    if af.status == "NO_API_KEY":
        return ProveResponse(status="NO_API_KEY", notes="OPENAI_API_KEY not set")
    if af.status != "OK":
        return ProveResponse(
            status="LLM_FAIL",
            notes=f"autoformalize returned {af.status}: {af.raw_reason}",
            model=af.model,
        )

    latest_code = af.lean_code
    retries = 0
    last_completion_reason = ""
    still_has_sorry = "sorry" in latest_code

    # Initial completion pass: replace the `sorry`.
    if still_has_sorry:
        c = autoformalize_module.complete_lean(
            LeanCompleteRequest(
                lean_draft=latest_code,
                openai_endpoint=req.openai_endpoint,
                openai_model=req.openai_model,
            )
        )
        if c.status == "OK":
            latest_code = c.lean_code
            still_has_sorry = c.still_has_sorry
        else:
            last_completion_reason = f"complete_lean returned {c.status}: {c.raw_reason}"

    verdict_resp = lean_verifier.verify_lean_code(latest_code)

    # Retry loop: if Lean rejected our proof, feed the error back to the LLM
    # and ask it to correct. Each retry is one more /prove attempt at up to
    # max_completion_retries.
    while (
        verdict_resp.verdict == Verdict.INVALID
        and retries < req.max_completion_retries
    ):
        retries += 1
        lean_error = ""
        details = verdict_resp.details or {}
        if isinstance(details.get("stdout_tail"), str):
            lean_error += details["stdout_tail"]
        if isinstance(details.get("stderr_tail"), str):
            lean_error += "\n" + details["stderr_tail"]
        lean_error = lean_error.strip() or details.get("reason", "")

        c = autoformalize_module.retry_lean_with_error(
            previous_code=latest_code,
            lean_error=lean_error,
            openai_endpoint=req.openai_endpoint,
            openai_model=req.openai_model,
        )
        if c.status != "OK":
            last_completion_reason = f"retry_lean_with_error returned {c.status}: {c.raw_reason}"
            break
        latest_code = c.lean_code
        verdict_resp = lean_verifier.verify_lean_code(latest_code)

    overall: str
    if verdict_resp.verdict == Verdict.VERIFIED:
        overall = "VERIFIED"
    elif verdict_resp.verdict == Verdict.INVALID:
        overall = "INVALID"
    else:
        overall = "UNKNOWN"

    return ProveResponse(
        status=overall,
        autoformalized=af.lean_code,
        completed=latest_code,
        verifier_verdict=verdict_resp.verdict,
        verifier_details=verdict_resp.details,
        retries_used=retries,
        model=af.model,
        notes=last_completion_reason,
    )
