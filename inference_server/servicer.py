import logging
import pickle
import time
import uuid
from pathlib import Path
from typing import AsyncIterator

import grpc
import joblib
import numpy as np
from concrete.ml.deployment import FHEModelServer

from thesis.fhe.v1 import fhe_inference_pb2_grpc as svc
from thesis.fhe.v1.fhe_inference_pb2 import (
    EvalKeyHandle,
    EncryptedInferenceRequest,
    EncryptedInferenceResponse,
    PlaintextInferenceRequest,
    PlaintextInferenceResponse,
    UploadEvalKeysRequest,
)
from thesis.fhe.v1.patient_pb2 import ModelType, TopKResult
from inference_server.key_cache import eval_key_cache

log = logging.getLogger(__name__)

_MODELS_DIR = Path(__file__).parent.parent / "models"

_SUPPORTED_N_BITS = [3, 4, 5, 8]

_CIRCUIT_PATHS: dict[tuple[int, int], Path] = {
    (ModelType.MODEL_TYPE_SYMPTOM, nb): _MODELS_DIR / "symptom" / f"fhe_circuit_n{nb}"
    for nb in [3, 4, 5]
} | {
    (ModelType.MODEL_TYPE_HEART, nb): _MODELS_DIR / "heart" / f"fhe_circuit_n{nb}"
    for nb in [8]
} | {
    (ModelType.MODEL_TYPE_EEG, nb): _MODELS_DIR / "eeg" / f"fhe_circuit_n{nb}"
    for nb in [4, 5]
}

_PLAIN_DIRS = {
    ModelType.MODEL_TYPE_SYMPTOM: _MODELS_DIR / "symptom" / "plain_model",
    ModelType.MODEL_TYPE_HEART:   _MODELS_DIR / "heart"   / "plain_model",
    ModelType.MODEL_TYPE_EEG:     _MODELS_DIR / "eeg"     / "plain_model",
}

_fhe_servers: dict[tuple[int, int], FHEModelServer] = {}
_plain_models: dict[int, object] = {}
_label_encoders: dict[int, object] = {}
_scalers: dict[int, object] = {}


def load_all_models() -> None:
    for (model_type, n_bits), circuit_dir in _CIRCUIT_PATHS.items():
        if circuit_dir.exists():
            try:
                srv = FHEModelServer(path_dir=str(circuit_dir))
                srv.load()
                _fhe_servers[(model_type, n_bits)] = srv
                log.info("FHE circuit loaded (n_bits=%d): %s", n_bits, circuit_dir)
            except Exception as exc:
                log.warning("FHE circuit load failed (%s): %s", circuit_dir, exc)
        else:
            log.warning("FHE circuit not found at %s — run the corresponding training script", circuit_dir)

    for model_type, plain_dir in _PLAIN_DIRS.items():
        model_file = plain_dir / "model.joblib"
        le_file    = plain_dir / "label_encoder.joblib"
        if model_file.exists():
            try:
                _plain_models[model_type] = joblib.load(model_file)
                log.info("Plain model loaded: %s", model_file)
            except Exception as exc:
                log.warning("Plain model load failed (%s): %s", model_file, exc)
        if le_file.exists():
            try:
                _label_encoders[model_type] = joblib.load(le_file)
                log.info("LabelEncoder loaded: %s", le_file)
            except Exception as exc:
                log.warning("LabelEncoder load failed: %s", exc)

    for model_name, model_type in [("heart", ModelType.MODEL_TYPE_HEART), ("eeg", ModelType.MODEL_TYPE_EEG)]:
        scaler_path = _MODELS_DIR / model_name / "scaler.pkl"
        if scaler_path.exists():
            try:
                with open(scaler_path, "rb") as f:
                    _scalers[model_type] = pickle.load(f)
                log.info("Scaler loaded: %s", scaler_path)
            except Exception as exc:
                log.warning("Scaler load failed (%s): %s", scaler_path, exc)


class FHEInferenceServicer(svc.FHEInferenceServiceServicer):

    async def UploadEvaluationKeys(
        self,
        request_iterator: AsyncIterator[UploadEvalKeysRequest],
        context,
    ) -> EvalKeyHandle:
        model_type = None
        n_bits = 3
        chunks: list[bytes] = []
        async for msg in request_iterator:
            which = msg.WhichOneof("payload")
            if which == "model":
                model_type = msg.model
                n_bits = msg.n_bits or 3
            elif which == "chunk":
                chunks.append(msg.chunk)

        if model_type is None:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Missing model type in stream")

        data = b"".join(chunks)
        log.info("UploadEvalKeys: model=%d n_bits=%d", model_type, n_bits)
        handle = eval_key_cache.store(model_type, n_bits, data, ttl_seconds=3600)
        return EvalKeyHandle(handle=handle, expires_unix=int(time.time()) + 3600)

    async def RunEncryptedInference(
        self,
        request: EncryptedInferenceRequest,
        context,
    ) -> EncryptedInferenceResponse:
        model_type = request.model

        entry = eval_key_cache.get(request.eval_key_handle)
        if entry is None:
            await context.abort(
                grpc.StatusCode.NOT_FOUND,
                "Eval key handle expired or not found — re-upload keys",
            )

        server = _fhe_servers.get((model_type, entry.n_bits))
        if server is None:
            await context.abort(
                grpc.StatusCode.UNAVAILABLE,
                f"FHE circuit for model {model_type} n_bits={entry.n_bits} not loaded — run training first",
            )

        t0 = time.time()
        encrypted_result = server.run(request.ciphertext, entry.data)
        log.info("FHE inference model=%d n_bits=%d took %.2fs", model_type, entry.n_bits, time.time() - t0)
        return EncryptedInferenceResponse(encrypted_result=encrypted_result)

    async def RunPlaintextInference(
        self,
        request: PlaintextInferenceRequest,
        context,
    ) -> PlaintextInferenceResponse:
        model_type = request.model
        plain_model = _plain_models.get(model_type)
        if plain_model is None:
            await context.abort(
                grpc.StatusCode.UNAVAILABLE,
                f"Plain model for {model_type} not loaded",
            )

        t0 = time.time()
        which = request.WhichOneof("features")
        X_raw = np.array(_extract_features(request, which), dtype=np.float32).reshape(1, -1)

        scaler = _scalers.get(model_type)
        if scaler is not None:
            X = scaler.transform(X_raw).astype(np.float32)
        else:
            X = X_raw

        if model_type == ModelType.MODEL_TYPE_SYMPTOM:
            top_k = getattr(request.symptom, "top_k", 5) or 5
            probs = plain_model.predict_proba(X)[0]
            top_indices = np.argsort(probs)[::-1][:top_k]
            le = _label_encoders.get(model_type)
            results = []
            for i in top_indices:
                name = le.classes_[i] if le else str(i)
                results.append(TopKResult(
                    condition=name,
                    probability=float(probs[i]),
                    linked_model=_condition_to_model(name),
                ))
            return PlaintextInferenceResponse(
                model=model_type,
                topk_results=results,
                inference_ms=int((time.time() - t0) * 1000),
            )

        proba = plain_model.predict_proba(X)[0]
        pos = float(proba[1]) if len(proba) > 1 else float(proba[0])
        positive = pos >= 0.5
        confidence = pos if positive else 1.0 - pos
        return PlaintextInferenceResponse(
            model=model_type,
            confidence=confidence,
            positive=positive,
            inference_ms=int((time.time() - t0) * 1000),
        )


def _extract_features(req: PlaintextInferenceRequest, which: str) -> list[float]:
    if which == "heart":
        f = req.heart
        return [f.age, f.sex, f.cp, f.trestbps, f.chol, f.fbs,
                f.restecg, f.thalach, f.exang, f.oldpeak, f.slope, f.ca, f.thal]
    if which == "eeg":
        return list(req.eeg.channels)
    if which == "symptom":
        return list(req.symptom.symptoms)
    return []


_CONDITION_MODEL_MAP = {
    "heart":        ModelType.MODEL_TYPE_HEART,
    "cardiac":      ModelType.MODEL_TYPE_HEART,
    "epilepsy":     ModelType.MODEL_TYPE_EEG,
    "hypertension": ModelType.MODEL_TYPE_HEART,
}

def _condition_to_model(condition: str) -> int:
    lower = condition.lower()
    for kw, mt in _CONDITION_MODEL_MAP.items():
        if kw in lower:
            return mt
    return ModelType.MODEL_TYPE_UNSPECIFIED
