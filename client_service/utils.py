import time

from google.protobuf.timestamp_pb2 import Timestamp

from thesis.fhe.v1.patient_pb2 import ModelType


def now_ts() -> Timestamp:
    ts = Timestamp()
    ts.FromMilliseconds(int(time.time() * 1000))
    return ts


def model_name(mt: int) -> str:
    return {
        ModelType.MODEL_TYPE_SYMPTOM:  "symptom",
        ModelType.MODEL_TYPE_HEART:    "heart",
        ModelType.MODEL_TYPE_DIABETES: "diabetes",
        ModelType.MODEL_TYPE_EEG:      "eeg",
    }.get(mt, "")


def patient_to_dict(patient) -> dict:
    return {
        "id":              patient.id,
        "name":            patient.name,
        "date_of_birth":   patient.date_of_birth,
        "cnp":             patient.cnp,
        "medical_history": patient.medical_history,
        "created_at":      patient.created_at.ToJsonString() if patient.HasField("created_at") else "",
        "history":         [record_to_dict(r) for r in patient.history],
    }


def record_to_dict(r) -> dict:
    return {
        "id":           r.id,
        "timestamp":    r.timestamp.ToJsonString() if r.HasField("timestamp") else "",
        "model":        model_name(r.model),
        "fhe_used":     r.fhe_used,
        "n_bits":       r.n_bits,
        "topk_results": [{"condition": t.condition, "probability": t.probability, "linked_model": model_name(t.linked_model)} for t in r.topk_results],
        "confidence":   r.confidence,
        "positive":     r.positive,
        "inference_ms": r.inference_ms,
    }
