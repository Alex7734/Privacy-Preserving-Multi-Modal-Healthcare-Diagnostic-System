import logging
import time
from typing import AsyncIterator

import grpc
from grpc import aio as grpc_aio

from thesis.fhe.v1 import fhe_inference_pb2_grpc as svc_stub
from thesis.fhe.v1.fhe_inference_pb2 import (
    EvalKeyHandle,
    EncryptedInferenceRequest,
    EncryptedInferenceResponse,
    PlaintextInferenceRequest,
    PlaintextInferenceResponse,
    UploadEvalKeysRequest,
)
from thesis.fhe.v1.patient_pb2 import ModelType
from thesis.fhe.v1.models_pb2 import SymptomFeatures

log = logging.getLogger(__name__)

_CHUNK_SIZE = 4 * 1024 * 1024

_handle_cache: dict[tuple[str, int], EvalKeyHandle] = {}


def _model_name(model_type: int) -> str:
    return {
        ModelType.MODEL_TYPE_SYMPTOM:  "symptom",
        ModelType.MODEL_TYPE_HEART:    "heart",
        ModelType.MODEL_TYPE_DIABETES: "diabetes",
        ModelType.MODEL_TYPE_EEG:      "eeg",
    }.get(model_type, "unknown")


def _handle_ok(handle: EvalKeyHandle) -> bool:
    return int(time.time()) < handle.expires_unix


async def _chunk_stream(
    model_type: int, n_bits: int, eval_keys: bytes
) -> AsyncIterator[UploadEvalKeysRequest]:
    yield UploadEvalKeysRequest(model=model_type, n_bits=n_bits)
    offset = 0
    while offset < len(eval_keys):
        yield UploadEvalKeysRequest(chunk=eval_keys[offset: offset + _CHUNK_SIZE])
        offset += _CHUNK_SIZE


async def ensure_eval_keys_uploaded(
    stub: svc_stub.FHEInferenceServiceStub,
    model_type: int,
    n_bits: int,
    eval_keys: bytes,
) -> EvalKeyHandle:
    mname = _model_name(model_type)
    cache_key = (mname, n_bits)
    cached = _handle_cache.get(cache_key)
    if cached and _handle_ok(cached):
        return cached

    log.info("Uploading eval keys for '%s' n_bits=%d …", mname, n_bits)
    t0 = time.time()
    handle = await stub.UploadEvaluationKeys(_chunk_stream(model_type, n_bits, eval_keys))
    log.info("Eval keys uploaded for '%s' n_bits=%d in %.1fs", mname, n_bits, time.time() - t0)
    _handle_cache[cache_key] = handle
    return handle


async def run_encrypted_inference(
    stub: svc_stub.FHEInferenceServiceStub,
    model_type: int,
    n_bits: int,
    ciphertext: bytes,
    eval_keys: bytes,
) -> bytes:
    handle = await ensure_eval_keys_uploaded(stub, model_type, n_bits, eval_keys)
    resp: EncryptedInferenceResponse = await stub.RunEncryptedInference(
        EncryptedInferenceRequest(
            model=model_type,
            ciphertext=ciphertext,
            eval_key_handle=handle.handle,
        )
    )
    return resp.encrypted_result


async def run_plaintext_symptom(
    stub: svc_stub.FHEInferenceServiceStub,
    symptom_vector: list[float],
    top_k: int,
) -> PlaintextInferenceResponse:
    return await stub.RunPlaintextInference(PlaintextInferenceRequest(
        model=ModelType.MODEL_TYPE_SYMPTOM,
        symptom=SymptomFeatures(symptoms=symptom_vector, top_k=top_k),
    ))
