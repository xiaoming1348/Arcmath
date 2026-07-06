# Slim Python-only deploy of the proof-verifier.
#
# v2 grading engine works without Lean in the container:
#   - SymPy backend handles EQUATION / ALGEBRAIC_EQUIVALENCE / INEQUALITY
#   - LLM judges handle CLAIM / DEDUCTION / CASE_SPLIT / CONCLUSION
#   - Rule-based answer-equiv handles final answers
#   - Escalation gate routes anything UNCERTAIN into the teacher queue
#
# Bundling Lean + Mathlib is supported by Dockerfile.lean, but costs:
#   - 12+ hour first build (from-source Mathlib compile if cache misses)
#   - 5-6 GB image push
#   - 4 GB Fly VM minimum
#
# Use this slim version when pilot cost matters more than Lean coverage.
# Use Dockerfile.lean for the production formal-verification service.

FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
