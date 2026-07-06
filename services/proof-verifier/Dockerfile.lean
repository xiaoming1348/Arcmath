# Full verifier image with Lean 4 + mathlib available at runtime.
#
# Use this image for the production formal-verification service. The default
# Dockerfile remains a slim SymPy-only image for cheap pilots.

FROM leanprover/lean4:v4.30.0-rc2

USER root
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:/root/.elan/bin:${PATH}"

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY lean-workspace ./lean-workspace
WORKDIR /app/lean-workspace
RUN lake exe cache get \
  && lake build

WORKDIR /app
COPY app ./app

ENV PORT=8000
ENV ARCMATH_LEAN_TIMEOUT_SEC=120
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
