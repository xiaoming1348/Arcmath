"""NL → Lean autoformalization using the vendored prompt library.

Wraps `lean_kernel.formal_executor.call_openai_chat` with the `NL_TO_LEAN_*`
prompts. Requires `OPENAI_API_KEY` in the environment; otherwise returns
NO_API_KEY and callers fall back to hint / LLM-judge paths.
"""

from __future__ import annotations

import os

from .lean_kernel import formal_executor, prompt_library
from .schemas import (
    AutoformalizeRequest,
    AutoformalizeResponse,
    LeanCompleteRequest,
    LeanCompleteResponse,
)


def autoformalize(req: AutoformalizeRequest) -> AutoformalizeResponse:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return AutoformalizeResponse(
            status="NO_API_KEY",
            raw_reason="OPENAI_API_KEY env var not set on verifier host.",
        )

    assumptions_block = "\n".join(f"- {a}" for a in req.planner_assumptions) if req.planner_assumptions else "(none)"
    user_prompt = prompt_library.NL_TO_LEAN_USER.format(
        domain=req.domain,
        nl_query=req.natural_language_statement.strip(),
        assumptions=assumptions_block,
    )

    result = formal_executor.call_openai_chat(
        endpoint=req.openai_endpoint,
        api_key=api_key,
        model=req.openai_model,
        system_prompt=prompt_library.NL_TO_LEAN_SYSTEM,
        user_prompt=user_prompt,
        timeout_sec=60,
    )

    # Partner's LLMResult uses status="PASS" on success; normalize.
    if result.status not in ("PASS", "SUCCESS"):
        return AutoformalizeResponse(
            status="LLM_FAIL",
            model=result.model,
            raw_reason=result.reason,
        )

    lean_code = (result.content or "").strip()
    if not lean_code:
        return AutoformalizeResponse(status="EMPTY", model=result.model)

    return AutoformalizeResponse(
        status="OK",
        lean_code=lean_code,
        model=result.model,
    )


def complete_lean(req: LeanCompleteRequest) -> LeanCompleteResponse:
    """Replace `sorry` with a full proof via LEAN_COMPLETE prompts."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return LeanCompleteResponse(
            status="NO_API_KEY",
            raw_reason="OPENAI_API_KEY env var not set on verifier host.",
        )

    user_prompt = prompt_library.LEAN_COMPLETE_USER.format(lean_draft=req.lean_draft)

    result = formal_executor.call_openai_chat(
        endpoint=req.openai_endpoint,
        api_key=api_key,
        model=req.openai_model,
        system_prompt=prompt_library.LEAN_COMPLETE_SYSTEM,
        user_prompt=user_prompt,
        timeout_sec=90,
    )

    if result.status not in ("PASS", "SUCCESS"):
        return LeanCompleteResponse(
            status="LLM_FAIL",
            model=result.model,
            raw_reason=result.reason,
        )

    code = (result.content or "").strip()
    # Strip accidental markdown fences if the model ignored instructions.
    if code.startswith("```"):
        lines = code.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        code = "\n".join(lines).strip()

    if not code:
        return LeanCompleteResponse(status="EMPTY", model=result.model)

    return LeanCompleteResponse(
        status="OK",
        lean_code=code,
        still_has_sorry="sorry" in code,
        model=result.model,
    )


def retry_lean_with_error(
    *,
    previous_code: str,
    lean_error: str,
    openai_endpoint: str,
    openai_model: str,
) -> LeanCompleteResponse:
    """Ask the LLM to fix a previous Lean attempt given the kernel's error."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return LeanCompleteResponse(status="NO_API_KEY")

    user_prompt = prompt_library.LEAN_RETRY_USER.format(
        previous_code=previous_code,
        lean_error=lean_error[:2000],
    )

    result = formal_executor.call_openai_chat(
        endpoint=openai_endpoint,
        api_key=api_key,
        model=openai_model,
        system_prompt=prompt_library.LEAN_RETRY_SYSTEM,
        user_prompt=user_prompt,
        timeout_sec=90,
    )

    if result.status not in ("PASS", "SUCCESS"):
        return LeanCompleteResponse(status="LLM_FAIL", model=result.model, raw_reason=result.reason)

    code = (result.content or "").strip()
    if code.startswith("```"):
        lines = code.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        code = "\n".join(lines).strip()

    if not code:
        return LeanCompleteResponse(status="EMPTY", model=result.model)

    return LeanCompleteResponse(
        status="OK",
        lean_code=code,
        still_has_sorry="sorry" in code,
        model=result.model,
    )
