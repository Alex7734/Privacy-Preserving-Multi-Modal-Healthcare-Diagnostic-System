import asyncio
import logging
import sys
from pathlib import Path

_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(_ROOT / "generated" / "python"))

import grpc
from grpc import aio as grpc_aio

from thesis.fhe.v1 import fhe_inference_pb2_grpc as svc
from inference_server.servicer import FHEInferenceServicer, load_all_models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("inference_server")

_PORT = 8000
_MAX_MSG = 64 * 1024 * 1024


async def serve() -> None:
    load_all_models()

    server = grpc_aio.server(options=[
        ("grpc.max_receive_message_length", _MAX_MSG),
        ("grpc.max_send_message_length",    _MAX_MSG),
    ])
    svc.add_FHEInferenceServiceServicer_to_server(FHEInferenceServicer(), server)
    addr = f"0.0.0.0:{_PORT}"
    server.add_insecure_port(addr)

    log.info("FHEInferenceService (gRPC) listening on %s", addr)
    await server.start()
    await server.wait_for_termination()


if __name__ == "__main__":
    asyncio.run(serve())
