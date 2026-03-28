import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "generated" / "python"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from grpc import aio as grpc_aio

from thesis.fhe.v1 import fhe_inference_pb2_grpc as infer_svc
from client_service import routes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("client_service")

_MAX_MSG = 64 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    from client_service.patient_store import get_settings
    settings = get_settings()
    addr = settings.inference_server_url.removeprefix("https://").removeprefix("http://")
    if ":" not in addr:
        addr = addr + ":8000"

    log.info("Connecting to inference_server at %s …", addr)
    channel = grpc_aio.insecure_channel(
        addr,
        options=[
            ("grpc.max_receive_message_length", _MAX_MSG),
            ("grpc.max_send_message_length",    _MAX_MSG),
        ],
    )
    app.state.inference_stub = infer_svc.FHEInferenceServiceStub(channel)
    app.state.grpc_channel   = channel
    log.info("DoctorClientService ready — listening on :8001")
    yield
    await channel.close()


app = FastAPI(title="DoctorClientService", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes.router, prefix="/api")
