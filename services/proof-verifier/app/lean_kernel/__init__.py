"""Vendored Lean+LLM kernel from https://github.com/xie-zhihao/developer.

We take only `formal_executor` (Lean subprocess + OpenAI orchestration) and
`prompt_library` (planner / NL→Lean / completion / failure prompts); their
platform_server and web UI are NOT vendored — Arcmath has its own Next.js +
Postgres layer.

Public API used by the Arcmath proof-verifier service:
- formal_executor.run_lean_check(lean_code, workdir, auto_install_lean=False)
- formal_executor.call_openai_chat(...)
- prompt_library.NL_TO_LEAN_SYSTEM / NL_TO_LEAN_USER / ...
"""

from . import formal_executor, prompt_library

__all__ = ["formal_executor", "prompt_library"]
