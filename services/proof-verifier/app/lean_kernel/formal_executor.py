#!/usr/bin/env python3
"""Formalization validation executor with OpenAI-powered intelligent nodes."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional
import sys

# Partner upstream layout assumed tools/ sibling directory; we vendor as a
# package so use relative imports.
from . import prompt_library  # type: ignore


@dataclass
class CheckResult:
    status: str
    reason: str
    command: Optional[str] = None
    stdout: str = ""
    stderr: str = ""
    returncode: Optional[int] = None
    machine_checked: bool = False
    runtime_note: str = ""
    simulated: bool = False


@dataclass
class LLMResult:
    status: str
    reason: str
    content: str
    model: str


def run_cmd(cmd: list[str], cwd: Optional[Path] = None, timeout_sec: int = 25) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )


def run_cmd_safe(cmd: list[str], cwd: Optional[Path] = None, timeout_sec: int = 25) -> tuple[Optional[subprocess.CompletedProcess], Optional[str]]:
    try:
        return run_cmd(cmd, cwd=cwd, timeout_sec=timeout_sec), None
    except FileNotFoundError as exc:
        return None, f"command not found: {cmd[0]} ({exc})"
    except Exception as exc:  # noqa: BLE001
        return None, f"command failed to start: {' '.join(cmd)} ({exc})"


def call_openai_chat(
    endpoint: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_sec: int = 60,
) -> LLMResult:
    raw_endpoint = (endpoint or "").strip().rstrip("/")
    if not raw_endpoint:
        return LLMResult(status="FAIL", reason="openai endpoint missing", content="", model=model)
    url = raw_endpoint if raw_endpoint.endswith("/chat/completions") else raw_endpoint + "/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.1,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = resp.read().decode("utf-8")
        parsed = json.loads(body)
        content = parsed["choices"][0]["message"]["content"].strip()
        return LLMResult(status="PASS", reason="openai call succeeded", content=content, model=model)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        return LLMResult(status="FAIL", reason=f"openai http error: {exc.code} {detail[:400]}", content="", model=model)
    except Exception as exc:  # noqa: BLE001
        return LLMResult(status="FAIL", reason=f"openai request failed: {exc}", content="", model=model)


def parse_maybe_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        return {"raw": text}


def probe_lean_runtime(workdir: Optional[Path] = None) -> tuple[Optional[list[str]], str]:
    # Pass workdir so `lake --version` starts inside the project and doesn't
    # walk up the filesystem looking for a lakefile (can take 5-7s elsewhere).
    if shutil.which("lake"):
        proc, err = run_cmd_safe(["lake", "--version"], cwd=workdir, timeout_sec=30)
        if err:
            return None, f"lake present but unusable: {err}"
        if proc and proc.returncode == 0:
            return ["lake", "env", "lean"], "using lake env lean"
        detail = (proc.stderr or proc.stdout or "").strip() if proc else ""
        return None, f"lake --version failed: {detail[:240]}"
    if shutil.which("lean"):
        proc, err = run_cmd_safe(["lean", "--version"], timeout_sec=8)
        if err:
            return None, f"lean present but unusable: {err}"
        if proc and proc.returncode == 0:
            return ["lean"], "using lean binary"
        detail = (proc.stderr or proc.stdout or "").strip() if proc else ""
        return None, f"lean --version failed: {detail[:240]}"
    if shutil.which("elan"):
        show_proc, show_err = run_cmd_safe(["elan", "show"], timeout_sec=10)
        if show_err:
            return None, f"elan installed but cannot query toolchain: {show_err}"
        if show_proc and show_proc.returncode == 0:
            text = f"{show_proc.stdout}\n{show_proc.stderr}".lower()
            if "no active toolchain" in text:
                return None, "elan installed but no active toolchain; run `elan default stable`"
            return ["elan", "run", "stable", "lean"], "using elan run stable lean"
        detail = (show_proc.stderr or show_proc.stdout or "").strip() if show_proc else ""
        return None, f"elan installed but `elan show` failed: {detail[:240]}"
    return None, "Lean toolchain not found (missing lake/lean/elan)"


def try_auto_install_lean() -> tuple[bool, str]:
    bootstrap_script = ROOT / "scripts" / "bootstrap_lean_runtime.sh"
    if not bootstrap_script.exists():
        return False, f"missing bootstrap script: {bootstrap_script}"

    proc, err = run_cmd_safe(["bash", str(bootstrap_script)], cwd=ROOT, timeout_sec=900)
    if err:
        return False, err
    if proc is None:
        return False, "bootstrap process returned no result"
    if proc.returncode != 0:
        detail = ((proc.stderr or "") + "\n" + (proc.stdout or "")).strip()
        return False, f"bootstrap failed (exit={proc.returncode}): {detail[-500:]}"
    return True, "bootstrap_lean_runtime.sh completed"


def run_lean_check(lean_code: str, workdir: Path, auto_install_lean: bool = True) -> CheckResult:
    if not lean_code.strip():
        return CheckResult(status="FAIL", reason="empty lean code", machine_checked=False, runtime_note="empty lean input", simulated=False)

    cmd_prefix, runtime_note = probe_lean_runtime(workdir=workdir)
    if not cmd_prefix:
        if auto_install_lean:
            installed, install_note = try_auto_install_lean()
            if installed:
                cmd_prefix, runtime_note = probe_lean_runtime(workdir=workdir)
            if not cmd_prefix:
                return CheckResult(
                    status="WARN",
                    reason=(
                        f"{runtime_note}; auto install attempted: {install_note}; "
                        "manual fallback: `scripts/bootstrap_lean_runtime.sh` or "
                        "`scripts/install_lean_python.sh --only-lean`"
                    ),
                    machine_checked=False,
                    runtime_note=runtime_note,
                    simulated=False,
                )
        return CheckResult(
            status="WARN",
            reason=f"{runtime_note}; install via `scripts/bootstrap_lean_runtime.sh` or `scripts/install_lean_python.sh --only-lean`",
            machine_checked=False,
            runtime_note=runtime_note,
            simulated=False,
        )

    lean_file = workdir / "Main.lean"
    lean_file.write_text(lean_code, encoding="utf-8")

    cmd = cmd_prefix + [str(lean_file)]
    # Extended timeout: Mathlib-dependent compiles routinely take 30-90s even
    # when all oleans are pre-built; the partner's 25s default is too tight.
    _lean_timeout = int(os.environ.get("ARCMATH_LEAN_TIMEOUT_SEC", "180"))
    proc, err = run_cmd_safe(cmd, cwd=workdir, timeout_sec=_lean_timeout)
    if err:
        return CheckResult("FAIL", f"lean compile start failed: {err}", " ".join(cmd), machine_checked=False, runtime_note=runtime_note, simulated=False)
    if proc is None:
        return CheckResult("FAIL", "lean compile start failed: unknown error", " ".join(cmd), machine_checked=False, runtime_note=runtime_note, simulated=False)
    if proc.returncode == 0:
        return CheckResult(
            "PASS",
            f"lean compile passed ({runtime_note})",
            " ".join(cmd),
            proc.stdout,
            proc.stderr,
            proc.returncode,
            machine_checked=True,
            runtime_note=runtime_note,
            simulated=False,
        )

    return CheckResult(
        "FAIL",
        "lean compile failed",
        " ".join(cmd),
        proc.stdout,
        proc.stderr,
        proc.returncode,
        machine_checked=True,
        runtime_note=runtime_note,
        simulated=False,
    )


def run_python_check(py_code: str, workdir: Path) -> CheckResult:
    if not py_code.strip():
        return CheckResult(status="SKIP", reason="empty python harness")

    py_file = workdir / "harness.py"
    py_file.write_text(py_code, encoding="utf-8")

    compile_cmd = ["python3", "-m", "py_compile", str(py_file)]
    compile_proc = run_cmd(compile_cmd, cwd=workdir)
    if compile_proc.returncode != 0:
        return CheckResult("FAIL", "python compile failed", " ".join(compile_cmd), compile_proc.stdout, compile_proc.stderr, compile_proc.returncode)

    run_cmdline = ["python3", str(py_file)]
    run_proc = run_cmd(run_cmdline, cwd=workdir)
    if run_proc.returncode == 0:
        return CheckResult("PASS", "python run passed", " ".join(run_cmdline), run_proc.stdout, run_proc.stderr, run_proc.returncode)

    return CheckResult("FAIL", "python run failed", " ".join(run_cmdline), run_proc.stdout, run_proc.stderr, run_proc.returncode)


def fallback_generate_draft(nl_query: str) -> str:
    prompt_note = nl_query.strip() or "(empty query)"
    return (
        "-- generated skeleton from NL query\n"
        f"-- query: {prompt_note}\n"
        "theorem draft_statement : True := by\n"
        "  sorry\n"
    )


def fallback_complete_lean(lean_draft: str) -> str:
    return lean_draft.replace("sorry", "trivial")


def decide_overall(lean_result: CheckResult, py_status: str, task_category: str) -> str:
    if task_category == "lean_validation":
        strict_machine_pass = (
            lean_result.status == "PASS"
            and lean_result.machine_checked
            and not lean_result.simulated
        )
        return "PASS" if strict_machine_pass else "FAIL"
    if task_category == "python_validation":
        return "PASS" if py_status == "PASS" else "FAIL"
    strict_machine_pass = (
        lean_result.status == "PASS"
        and lean_result.machine_checked
        and not lean_result.simulated
    )
    return "PASS" if strict_machine_pass and py_status in {"PASS", "SKIP"} else "FAIL"


def llm_enabled(api_key: str) -> bool:
    return bool(api_key.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description="Formalization validation executor")
    parser.add_argument("--mode", choices=["nl_to_lean", "direct_lean"], default="nl_to_lean")
    parser.add_argument("--domain", default="math")
    parser.add_argument("--nl-query", default="")
    parser.add_argument("--lean-draft", default="")
    parser.add_argument("--lean-final", default="")
    parser.add_argument("--python-harness", default="")
    parser.add_argument("--payload", default="")
    parser.add_argument("--planner", default="mcts")
    parser.add_argument("--task-category", choices=["lean_validation", "python_validation"], default="lean_validation")
    parser.add_argument("--openai-endpoint", default="https://api.openai.com/v1")
    parser.add_argument("--openai-model", default="gpt-4.1")
    parser.add_argument("--openai-api-key", default=os.environ.get("OPENAI_API_KEY", ""))
    parser.add_argument("--auto-install-lean", choices=["on", "off"], default="on")
    args = parser.parse_args()

    lean_draft = args.lean_draft
    lean_final = args.lean_final

    llm_logs: dict[str, Any] = {"enabled": llm_enabled(args.openai_api_key), "nodes": {}}

    planner_output: dict[str, Any] = {
        "assumptions": [],
        "formalization_plan": [],
        "risk_checks": [],
        "recommended_agent_flow": args.planner,
    }

    if llm_enabled(args.openai_api_key):
        planner_prompt = prompt_library.PLANNER_USER.format(
            domain=args.domain,
            mode=args.mode,
            nl_query=args.nl_query,
            payload=args.payload or "{}",
        )
        planner_llm = call_openai_chat(
            endpoint=args.openai_endpoint,
            api_key=args.openai_api_key,
            model=args.openai_model,
            system_prompt=prompt_library.PLANNER_SYSTEM,
            user_prompt=planner_prompt,
        )
        llm_logs["nodes"]["planner"] = asdict(planner_llm)
        if planner_llm.status == "PASS":
            planner_output = parse_maybe_json(planner_llm.content)

    if args.mode == "nl_to_lean" and not lean_draft and not lean_final:
        if llm_enabled(args.openai_api_key):
            draft_prompt = prompt_library.NL_TO_LEAN_USER.format(
                domain=args.domain,
                nl_query=args.nl_query,
                assumptions=json.dumps(planner_output.get("assumptions", []), ensure_ascii=False),
            )
            draft_llm = call_openai_chat(
                endpoint=args.openai_endpoint,
                api_key=args.openai_api_key,
                model=args.openai_model,
                system_prompt=prompt_library.NL_TO_LEAN_SYSTEM,
                user_prompt=draft_prompt,
            )
            llm_logs["nodes"]["nl_to_lean"] = asdict(draft_llm)
            lean_draft = draft_llm.content if draft_llm.status == "PASS" and draft_llm.content else fallback_generate_draft(args.nl_query)
        else:
            lean_draft = fallback_generate_draft(args.nl_query)

    if not lean_final and lean_draft:
        if llm_enabled(args.openai_api_key):
            complete_prompt = prompt_library.LEAN_COMPLETE_USER.format(lean_draft=lean_draft)
            complete_llm = call_openai_chat(
                endpoint=args.openai_endpoint,
                api_key=args.openai_api_key,
                model=args.openai_model,
                system_prompt=prompt_library.LEAN_COMPLETE_SYSTEM,
                user_prompt=complete_prompt,
            )
            llm_logs["nodes"]["lean_completion"] = asdict(complete_llm)
            lean_final = complete_llm.content if complete_llm.status == "PASS" and complete_llm.content else fallback_complete_lean(lean_draft)
        else:
            lean_final = fallback_complete_lean(lean_draft)

    with tempfile.TemporaryDirectory(prefix="formal-exec-") as tmp:
        workdir = Path(tmp)
        if args.task_category == "python_validation":
            lean_result = CheckResult(status="SKIP", reason="python task")
        else:
            lean_result = run_lean_check(lean_final, workdir, auto_install_lean=args.auto_install_lean == "on")
        if args.task_category == "lean_validation":
            python_result = CheckResult(status="SKIP", reason="lean task")
        else:
            python_result = run_python_check(args.python_harness, workdir)

    overall = decide_overall(lean_result, python_result.status, args.task_category)

    next_action = "return_success" if overall == "PASS" else "request_patch_and_rerun"
    failure_analysis: dict[str, Any] = {
        "severity": "low" if overall == "PASS" else "medium",
        "next_action": next_action,
        "patch_guidance": [],
    }

    if llm_enabled(args.openai_api_key):
        failure_prompt = prompt_library.FAILURE_ANALYSIS_USER.format(
            lean_result=json.dumps(asdict(lean_result), ensure_ascii=False),
            python_result=json.dumps(asdict(python_result), ensure_ascii=False),
        )
        failure_llm = call_openai_chat(
            endpoint=args.openai_endpoint,
            api_key=args.openai_api_key,
            model=args.openai_model,
            system_prompt=prompt_library.FAILURE_ANALYSIS_SYSTEM,
            user_prompt=failure_prompt,
        )
        llm_logs["nodes"]["failure_analysis"] = asdict(failure_llm)
        if failure_llm.status == "PASS":
            parsed = parse_maybe_json(failure_llm.content)
            if isinstance(parsed, dict):
                failure_analysis = parsed
                next_action = parsed.get("next_action", next_action)

    result_command = {
        "accepted_payload": args.payload or None,
        "processing": {
            "mode": args.mode,
            "task_category": args.task_category,
            "domain": args.domain,
            "planner": args.planner,
            "planner_output": planner_output,
            "endpoint": args.openai_endpoint,
            "model": args.openai_model,
            "stages": [
                "planner",
                "nl_to_lean_with_sorry",
                "lean_completion",
                "lean_check",
                "failure_analysis",
            ] + (["python_check"] if args.task_category == "python_validation" else []),
        },
        "llm": llm_logs,
        "artifacts": {
            "lean_draft": lean_draft,
            "lean_final": lean_final,
        },
        "outputs": {
            "lean_status": asdict(lean_result),
            "python_status": asdict(python_result),
            "overall": overall,
            "failure_analysis": failure_analysis,
        },
        "next_action": next_action,
    }

    print(json.dumps(result_command, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
