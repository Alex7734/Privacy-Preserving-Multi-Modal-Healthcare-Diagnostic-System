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
)
from client_service.utils import now_ts, model_name, patient_to_dict
from thesis.fhe.v1.patient_pb2 import ModelType, PredictionRecord, TopKResult

log = logging.getLogger(__name__)
router = APIRouter()

_META_PATH = Path(__file__).parent.parent / "models" / "symptom" / "meta.json"

_FHE_MODELS = [("symptom", ModelType.MODEL_TYPE_SYMPTOM)]
_SUPPORTED_N_BITS = fhe_clients._SUPPORTED_N_BITS


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
        for nb in _SUPPORTED_N_BITS:
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
    nb = body.n_bits if body.n_bits in _SUPPORTED_N_BITS else 3
    stub = request.app.state.inference_stub
    result = {}
    for m, model_type in _FHE_MODELS:
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

    n_bits = body.n_bits if body.n_bits in _SUPPORTED_N_BITS else 3

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
                    "diabetes": ModelType.MODEL_TYPE_DIABETES,
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
