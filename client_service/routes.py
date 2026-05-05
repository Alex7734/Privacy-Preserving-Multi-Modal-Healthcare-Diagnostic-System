import json
import logging
import time
import uuid
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException, Request

from client_service import fhe_clients, inference_client, patient_store
from client_service.schemas import (
    CreatePatientBody, UpdatePatientBody, SymptomRequest,
    UpdateSettingsBody, GenerateKeysBody,
    HeartRequest, EEGRequest,
)
from client_service.utils import now_ts, model_name, patient_to_dict
from thesis.fhe.v1.patient_pb2 import ModelType, PredictionRecord, TopKResult

log = logging.getLogger(__name__)
router = APIRouter()

_META_PATH = Path(__file__).parent.parent / "models" / "symptom" / "meta.json"
_DATA_DIR = Path(__file__).parent.parent / "data"
_MOCK_EEG_PATH = _DATA_DIR / "mock_eeg_sample.json"
_EEG_SAMPLES = {
    "synthetic": _DATA_DIR / "mock_eeg_sample.json",
    "seizure":   _DATA_DIR / "eeg_test_seizure.json",
    "normal":    _DATA_DIR / "eeg_test_nonseizure.json",
}

_FHE_MODELS = [
    ("symptom", ModelType.MODEL_TYPE_SYMPTOM),
    ("heart",   ModelType.MODEL_TYPE_HEART),
    ("eeg",     ModelType.MODEL_TYPE_EEG),
]


@router.get("/patients")
def list_patients():
    return [patient_to_dict(p) for p in patient_store.list_patients()]

@router.post("/patients", status_code=201)
def create_patient(body: CreatePatientBody):
    return patient_to_dict(patient_store.create_patient(body.name, body.date_of_birth, body.cnp, body.medical_history))

@router.get("/patients/{patient_id}")
def get_patient(patient_id: str):
    p = patient_store.get_patient(patient_id)
    if p is None:
        raise HTTPException(404, f"Patient {patient_id} not found")
    return patient_to_dict(p)

@router.put("/patients/{patient_id}")
def update_patient(patient_id: str, body: UpdatePatientBody):
    p = patient_store.update_patient(patient_id, body.name, body.date_of_birth, body.cnp, body.medical_history)
    if p is None:
        raise HTTPException(404, f"Patient {patient_id} not found")
    return patient_to_dict(p)

@router.delete("/patients/{patient_id}/records/{record_id}")
def delete_record(patient_id: str, record_id: str):
    ok = patient_store.delete_prediction_record(patient_id, record_id)
    if not ok:
        raise HTTPException(404, f"Record {record_id} not found for patient {patient_id}")
    return {"success": True}

@router.delete("/patients/{patient_id}")
def delete_patient(patient_id: str):
    ok = patient_store.delete_patient(patient_id)
    if not ok:
        raise HTTPException(404, f"Patient {patient_id} not found")
    return {"success": True}


@router.get("/keys/status")
def keys_status():
    result = {}
    for m, _ in _FHE_MODELS:
        per_bits = {}
        for nb in fhe_clients.supported_n_bits(m):
            s = fhe_clients.key_status(m, nb)
            handle = inference_client._handle_cache.get((m, nb))
            s["uploaded"] = bool(handle and inference_client._handle_ok(handle))
            if handle:
                s["expires_unix"] = handle.expires_unix
            per_bits[str(nb)] = s
        result[m] = per_bits
    return result


@router.post("/keys/generate")
async def generate_keys(body: GenerateKeysBody, request: Request):
    stub = request.app.state.inference_stub
    result = {}
    for m, model_type in _FHE_MODELS:
        nb = body.n_bits if body.n_bits in fhe_clients.supported_n_bits(m) else fhe_clients.supported_n_bits(m)[0]
        entry  = fhe_clients.generate_keys(m, nb, force=True)
        handle = await inference_client.ensure_eval_keys_uploaded(stub, model_type, nb, entry.eval_keys)
        result[m] = {
            str(nb): {
                "ready":           True,
                "uploaded":        True,
                "expires_unix":    handle.expires_unix,
                "eval_keys_bytes": len(entry.eval_keys),
            }
        }
    return result


@router.post("/patients/{patient_id}/symptoms")
async def predict_symptoms(patient_id: str, body: SymptomRequest, request: Request):
    p = patient_store.get_patient(patient_id)
    if p is None:
        raise HTTPException(404, f"Patient {patient_id} not found")

    settings = patient_store.get_settings()
    stub = request.app.state.inference_stub
    top_k = body.top_k or settings.default_top_k

    n_bits = body.n_bits if body.n_bits in fhe_clients.supported_n_bits("symptom") else 3

    if settings.fhe_enabled:
        handle = inference_client._handle_cache.get(("symptom", n_bits))
        if not handle or not inference_client._handle_ok(handle):
            raise HTTPException(
                412,
                f"FHE evaluation keys for n_bits={n_bits} not uploaded. Go to Settings → FHE Key Management and generate keys first."
            )
    features = np.array(body.symptom_vector, dtype=np.float32)
    t0 = time.time()

    try:
        if settings.fhe_enabled:
            ct       = fhe_clients.encrypt("symptom", n_bits, features.reshape(1, -1))
            ev_keys  = fhe_clients.get_eval_keys("symptom", n_bits)
            enc_res  = await inference_client.run_encrypted_inference(
                stub, ModelType.MODEL_TYPE_SYMPTOM, n_bits, ct, ev_keys
            )
            raw      = fhe_clients.decrypt("symptom", n_bits, enc_res)
            topk     = fhe_clients.decode_symptom_topk(raw, top_k)
            fhe_used = True
        else:
            resp     = await inference_client.run_plaintext_symptom(stub, body.symptom_vector, top_k)
            topk     = [
                {"condition": r.condition, "probability": r.probability, "linked_model": model_name(r.linked_model)}
                for r in resp.topk_results
            ]
            fhe_used = False
    except Exception as exc:
        log.exception("Inference failed")
        raise HTTPException(500, str(exc))

    inference_ms = int((time.time() - t0) * 1000)
    record_id    = str(uuid.uuid4())
    record       = PredictionRecord(
        id=record_id,
        timestamp=now_ts(),
        model=ModelType.MODEL_TYPE_SYMPTOM,
        fhe_used=fhe_used,
        n_bits=n_bits if fhe_used else 0,
        inference_ms=inference_ms,
        topk_results=[
            TopKResult(
                condition=r["condition"],
                probability=r["probability"],
                linked_model={
                    "symptom":  ModelType.MODEL_TYPE_SYMPTOM,
                    "heart":    ModelType.MODEL_TYPE_HEART,
                    "eeg":      ModelType.MODEL_TYPE_EEG,
                }.get(r.get("linked_model", ""), ModelType.MODEL_TYPE_UNSPECIFIED),
            )
            for r in topk
        ],
    )
    patient_store.append_prediction_record(patient_id, record)

    return {
        "record_id":    record_id,
        "fhe_used":     fhe_used,
        "n_bits":       n_bits if fhe_used else 0,
        "inference_ms": inference_ms,
        "topk_results": topk,
    }


@router.post("/patients/{patient_id}/heart")
async def predict_heart(patient_id: str, body: HeartRequest, request: Request):
    p = patient_store.get_patient(patient_id)
    if p is None:
        raise HTTPException(404, f"Patient {patient_id} not found")

    settings = patient_store.get_settings()
    stub = request.app.state.inference_stub
    n_bits = body.n_bits if body.n_bits in fhe_clients.supported_n_bits("heart") else 8

    features = np.array([
        body.age, body.sex, body.cp, body.trestbps, body.chol, body.fbs,
        body.restecg, body.thalach, body.exang, body.oldpeak, body.slope, body.ca, body.thal,
    ], dtype=np.float32)

    scaler = fhe_clients.get_scaler("heart")
    if scaler is not None:
        features = scaler.transform(features.reshape(1, -1)).astype(np.float32).flatten()

    if settings.fhe_enabled:
        handle = inference_client._handle_cache.get(("heart", n_bits))
        if not handle or not inference_client._handle_ok(handle):
            raise HTTPException(
                412,
                f"FHE evaluation keys for heart n_bits={n_bits} not uploaded. Go to Settings → FHE Key Management and generate keys first."
            )

    t0 = time.time()
    try:
        if settings.fhe_enabled:
            ct      = fhe_clients.encrypt("heart", n_bits, features.reshape(1, -1))
            ev_keys = fhe_clients.get_eval_keys("heart", n_bits)
            enc_res = await inference_client.run_encrypted_inference(
                stub, ModelType.MODEL_TYPE_HEART, n_bits, ct, ev_keys
            )
            raw     = fhe_clients.decrypt("heart", n_bits, enc_res)
            result  = fhe_clients.decode_binary_result(raw)
            fhe_used = True
        else:
            resp = await inference_client.run_plaintext_heart(stub, features.tolist())
            result   = {"positive": resp.positive, "confidence": resp.confidence}
            fhe_used = False
    except Exception as exc:
        log.exception("Heart inference failed")
        raise HTTPException(500, str(exc))

    inference_ms = int((time.time() - t0) * 1000)
    record_id = str(uuid.uuid4())
    record = PredictionRecord(
        id=record_id,
        timestamp=now_ts(),
        model=ModelType.MODEL_TYPE_HEART,
        fhe_used=fhe_used,
        n_bits=n_bits if fhe_used else 0,
        inference_ms=inference_ms,
        topk_results=[TopKResult(
            condition="heart disease" if result["positive"] else "no heart disease",
            probability=result["confidence"],
        )],
    )
    patient_store.append_prediction_record(patient_id, record)

    return {
        "record_id": record_id,
        "fhe_used": fhe_used,
        "n_bits": n_bits if fhe_used else 0,
        "inference_ms": inference_ms,
        "positive": result["positive"],
        "confidence": result["confidence"],
    }


@router.post("/patients/{patient_id}/eeg")
async def predict_eeg(patient_id: str, body: EEGRequest, request: Request):
    p = patient_store.get_patient(patient_id)
    if p is None:
        raise HTTPException(404, f"Patient {patient_id} not found")

    if len(body.eeg_window) != 178:
        raise HTTPException(400, f"EEG window must be exactly 178 samples, got {len(body.eeg_window)}")

    settings = patient_store.get_settings()
    stub = request.app.state.inference_stub
    n_bits = body.n_bits if body.n_bits in fhe_clients.supported_n_bits("eeg") else 4

    features = np.array(body.eeg_window, dtype=np.float32)
    scaler = fhe_clients.get_scaler("eeg")
    if scaler is not None:
        features = scaler.transform(features.reshape(1, -1)).astype(np.float32).flatten()

    if settings.fhe_enabled:
        handle = inference_client._handle_cache.get(("eeg", n_bits))
        if not handle or not inference_client._handle_ok(handle):
            raise HTTPException(
                412,
                f"FHE evaluation keys for eeg n_bits={n_bits} not uploaded. Go to Settings → FHE Key Management and generate keys first."
            )

    t0 = time.time()
    try:
        if settings.fhe_enabled:
            ct      = fhe_clients.encrypt("eeg", n_bits, features.reshape(1, -1))
            ev_keys = fhe_clients.get_eval_keys("eeg", n_bits)
            enc_res = await inference_client.run_encrypted_inference(
                stub, ModelType.MODEL_TYPE_EEG, n_bits, ct, ev_keys
            )
            raw     = fhe_clients.decrypt("eeg", n_bits, enc_res)
            result  = fhe_clients.decode_binary_result(raw)
            fhe_used = True
        else:
            resp = await inference_client.run_plaintext_eeg(stub, body.eeg_window)
            result   = {"positive": resp.positive, "confidence": resp.confidence}
            fhe_used = False
    except Exception as exc:
        log.exception("EEG inference failed")
        raise HTTPException(500, str(exc))

    inference_ms = int((time.time() - t0) * 1000)
    record_id = str(uuid.uuid4())
    record = PredictionRecord(
        id=record_id,
        timestamp=now_ts(),
        model=ModelType.MODEL_TYPE_EEG,
        fhe_used=fhe_used,
        n_bits=n_bits if fhe_used else 0,
        inference_ms=inference_ms,
        topk_results=[TopKResult(
            condition="Ictal activity detected — possible seizure event" if result["positive"] else "No ictal activity — brain rhythm within normal range",
            probability=result["confidence"],
        )],
    )
    patient_store.append_prediction_record(patient_id, record)

    return {
        "record_id": record_id,
        "fhe_used": fhe_used,
        "n_bits": n_bits if fhe_used else 0,
        "inference_ms": inference_ms,
        "positive": result["positive"],
        "confidence": result["confidence"],
    }


@router.get("/model/eeg/samples")
def eeg_samples():
    """Returns all available EEG test samples as a dict keyed by sample name."""
    import json as _json
    result = {}
    for name, path in _EEG_SAMPLES.items():
        if path.exists():
            with open(path) as f:
                result[name] = _json.load(f)
    if not result:
        raise HTTPException(503, "No EEG samples found")
    return result

@router.get("/model/eeg/mock-sample")
def eeg_mock_sample():
    if not _MOCK_EEG_PATH.exists():
        raise HTTPException(503, "Mock EEG sample not found")
    import json as _json
    with open(_MOCK_EEG_PATH) as f:
        return _json.load(f)


@router.get("/settings")
def get_settings():
    s = patient_store.get_settings()
    return {
        "fhe_enabled":          s.fhe_enabled,
        "inference_server_url": s.inference_server_url,
        "default_top_k":        s.default_top_k,
        "eval_key_ttl_seconds": s.eval_key_ttl_seconds,
    }

@router.put("/settings")
def update_settings(body: UpdateSettingsBody):
    from thesis.fhe.v1.settings_pb2 import Settings
    s = patient_store.update_settings(Settings(
        fhe_enabled=body.fhe_enabled,
        inference_server_url=body.inference_server_url,
        default_top_k=body.default_top_k,
        eval_key_ttl_seconds=body.eval_key_ttl_seconds,
    ))
    return {
        "fhe_enabled":          s.fhe_enabled,
        "inference_server_url": s.inference_server_url,
        "default_top_k":        s.default_top_k,
        "eval_key_ttl_seconds": s.eval_key_ttl_seconds,
    }


@router.get("/model/symptom/metadata")
def symptom_metadata():
    if not _META_PATH.exists():
        raise HTTPException(503, "Symptom model not yet trained — run training/train_symptom.py")
    with open(_META_PATH) as f:
        meta = json.load(f)
    return {"feature_names": meta["feature_names"], "classes": meta["classes"]}
