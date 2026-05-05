#!/usr/bin/env bash
# setup.sh — kill all FHE Medical services and restart them in the correct order.
#
# Usage:
#   cd thesis_impl
#   bash setup.sh
#
# Requires:
#   - Python with concrete-ml installed (pyenv 3.11.0)
#   - Node.js 18+ with npm
#   - All Python deps in requirements.txt
#
# Services started:
#   :8000  inference_server  (gRPC, FHEModelServer)
#   :8001  client_service    (FastAPI REST, FHEModelClient + patient store)
#   :5173  frontend          (Vite + React)

set -euo pipefail
cd "$(dirname "$0")"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Python (prefer venv) ──────────────────────────────────────────────────────
PYTHON="venv/bin/python"
UVICORN="venv/bin/uvicorn"
[ -f "$PYTHON" ] || die "venv not found. Run: python3.11 -m venv venv && venv/bin/pip install -r requirements.txt"

# ── Sanity checks ─────────────────────────────────────────────────────────────
info "Checking concrete-ml …"
"$PYTHON" -c "from concrete.ml.sklearn import XGBClassifier" 2>/dev/null \
  || die "concrete-ml not found. Run: venv/bin/pip install -r requirements.txt"
ok "concrete-ml found"

info "Checking symptom model …"
if [ ! -f "models/symptom/fhe_circuit_n3/server.zip" ]; then
  warn "Symptom FHE circuit missing. Training now (this takes ~30s) …"
  PYTHONPATH=. "$PYTHON" training/train_symptom.py --no-fhe
  ok "Symptom model trained"
else
  ok "Symptom model present"
fi

info "Checking Node.js …"
node --version >/dev/null 2>&1 || die "Node.js not found. Install it via nvm or homebrew."
ok "Node.js $(node --version)"

# ── Kill existing processes on our ports ──────────────────────────────────────
info "Killing existing processes on ports 8000, 8001, 5173 …"
for port in 8000 8001 5173; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    info "  Killed PID(s) on :$port"
  fi
done
sleep 1

# ── PYTHONPATH ────────────────────────────────────────────────────────────────
export PYTHONPATH="$(pwd):$(pwd)/generated/python"

# ── Log directory ─────────────────────────────────────────────────────────────
mkdir -p logs

# ── Start inference_server (gRPC :8000) ───────────────────────────────────────
info "Starting inference_server on :8000 …"
"$PYTHON" -m inference_server.main > logs/inference_server.log 2>&1 &
INFER_PID=$!
echo $INFER_PID > logs/inference_server.pid

# Wait for gRPC port to open
for i in $(seq 1 20); do
  if lsof -ti:8000 >/dev/null 2>&1; then break; fi
  sleep 0.5
done
lsof -ti:8000 >/dev/null 2>&1 || { warn "inference_server didn't start in time — check logs/inference_server.log"; }
ok "inference_server up (PID $INFER_PID)"

# ── Start client_service (FastAPI :8001) ──────────────────────────────────────
info "Starting client_service on :8001 …"
"$UVICORN" client_service.main:app \
  --host 127.0.0.1 --port 8001 \
  --log-level info \
  > logs/client_service.log 2>&1 &
CLIENT_PID=$!
echo $CLIENT_PID > logs/client_service.pid

# Wait for HTTP port to open
for i in $(seq 1 20); do
  if lsof -ti:8001 >/dev/null 2>&1; then break; fi
  sleep 0.5
done
lsof -ti:8001 >/dev/null 2>&1 || { warn "client_service didn't start in time — check logs/client_service.log"; }
ok "client_service up (PID $CLIENT_PID)"

# ── Install frontend deps if needed ──────────────────────────────────────────
if [ ! -d "frontend/node_modules" ]; then
  info "Installing frontend node_modules …"
  (cd frontend && npm install --legacy-peer-deps --silent)
  ok "Frontend deps installed"
fi

# ── Start frontend (Vite :5173) ───────────────────────────────────────────────
info "Starting frontend on :5173 …"
(cd frontend && npm run dev > ../logs/frontend.log 2>&1) &
FRONT_PID=$!
echo $FRONT_PID > logs/frontend.pid

# Wait for Vite port
for i in $(seq 1 30); do
  if lsof -ti:5173 >/dev/null 2>&1; then break; fi
  sleep 0.5
done
lsof -ti:5173 >/dev/null 2>&1 || { warn "Frontend didn't start in time — check logs/frontend.log"; }
ok "Frontend up (PID $FRONT_PID)"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  FHE Medical is running${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  🌐 App:              ${BLUE}http://localhost:5173${NC}"
echo -e "  🔌 Client service:   http://localhost:8001/docs  (FastAPI Swagger)"
echo -e "  ⚙️  Inference server: localhost:8000  (gRPC)"
echo ""
echo -e "  Logs:  ${YELLOW}tail -f logs/client_service.log${NC}"
echo -e "         ${YELLOW}tail -f logs/inference_server.log${NC}"
echo ""
echo -e "  Stop:  ${RED}bash stop.sh${NC}"
echo ""
