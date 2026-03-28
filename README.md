# Privacy-Preserving Multi-Modal Healthcare Diagnostic System

Bachelor thesis implementation. Concrete ML applied to clinical decision support, with a doctor-centric React frontend and a two-service Python backend.


## Architecture

```
Browser (React + Vite :5173)
        |
        |  REST/JSON  (axios)
        v
DoctorClientService  (FastAPI :8001)   <-- runs on doctor's machine
  - holds FHEModelClient (private key stays here)
  - stores patient records as textproto files
  - encrypts features, decrypts results
        |
        |  gRPC  (binary, chunked for eval keys)
        v
FHEInferenceService  (gRPC :8000)      <-- can be remote
  - holds FHEModelServer only
  - runs FHE computation on ciphertexts
  - caches eval key handles in memory
```

The inference server never sees plaintext features or the private key.
When FHE is off, plaintext features are sent via a separate RPC — clearly flagged in the UI.


## Why gRPC + Protocol Buffers

REST/JSON hit two hard limits: 29 MB evaluation keys as base64 JSON is unworkable,
and there was no shared schema between Python and TypeScript causing type drift.

Protobufs give a single `.proto` source of truth; `buf generate` produces typed stubs
for both. gRPC client-streaming handles the chunked eval key upload natively.
The eval key handle pattern (upload once, reference by UUID on subsequent calls)
means the ~10s upload cost is paid once per session, not per patient.


## Setup

Requires Python 3.11 and Node 18+.

```bash
# Python deps
pip install -r requirements.txt

# Train the symptom model for all supported bit-widths (3, 4, 5)
PYTHONPATH=. python training/train_symptom.py --n-bits 3 4 5

# Frontend deps
cd frontend && npm install && cd ..
```


## Start

```bash
./setup.sh
```

Kills any existing processes on :8000, :8001, :5173, trains the symptom model if missing,
then starts all three services in order. Open http://localhost:5173.


## Stop

```bash
./stop.sh
```


## TODO

- **EEG / Epilepsy model** — the symptom model can not surface epilepsy as a top-K result but there is also no downstream FHE model for it yet. The epileptic seizure dataset and a working notebook exist, FHE compilation is limited to `n_bits <= 5` due to PBS parameter table constraints.

- **Heart / Diabetes / EEG drill-down** — when these conditions appear in the top-K symptom results, the UI should offer a "Run detailed analysis" flow that collects
  the model-specific features and calls the corresponding FHE model.

- **Notebook viewer** — embed the training notebooks (heart, diabetes, EEG, symptom) as read-only views within the app so the methodology is accessible without leaving the interface.
