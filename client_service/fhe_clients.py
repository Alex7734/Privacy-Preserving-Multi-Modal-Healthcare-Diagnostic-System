import logging
import time
from pathlib import Path
from typing import NamedTuple

import joblib
import numpy as np
from concrete.ml.deployment import FHEModelClient

log = logging.getLogger(__name__)

_MODELS_DIR = Path(__file__).parent.parent / "models"

_SUPPORTED_N_BITS = [3, 4, 5]

_CIRCUIT_DIRS: dict[tuple[str, int], Path] = {
    ("symptom", nb): _MODELS_DIR / "symptom" / f"fhe_circuit_n{nb}"
    for nb in _SUPPORTED_N_BITS
}
_PLAIN_DIRS = {
    "symptom": _MODELS_DIR / "symptom" / "plain_model",
}


class _ClientEntry(NamedTuple):
    client: FHEModelClient
    eval_keys: bytes
    generated_at: float


_clients: dict[tuple[str, int], _ClientEntry] = {}
_label_encoders: dict[str, object] = {}


def _load_label_encoder(model_name: str):
    if model_name in _label_encoders:
        return _label_encoders[model_name]
    le_path = _PLAIN_DIRS.get(model_name, Path("")) / "label_encoder.joblib"
    if le_path.exists():
        le = joblib.load(le_path)
        _label_encoders[model_name] = le
        return le
    return None


def get_or_create_client(model_name: str, n_bits: int) -> _ClientEntry:
    key = (model_name, n_bits)
    if key in _clients:
        return _clients[key]

    circuit_dir = _CIRCUIT_DIRS.get(key)
    if not circuit_dir or not circuit_dir.exists():
        raise FileNotFoundError(
            f"FHE circuit for '{model_name}' n_bits={n_bits} not found at {circuit_dir}. "
            f"Run: python training/train_{model_name}.py --n-bits {n_bits}"
        )

    log.info("Generating FHE keys for '%s' n_bits=%d …", model_name, n_bits)
    t0 = time.time()
    client = FHEModelClient(path_dir=str(circuit_dir), key_dir=None)
    client.generate_private_and_evaluation_keys(force=False)
    eval_keys = client.get_serialized_evaluation_keys()
    log.info("Keys ready for '%s' n_bits=%d in %.1fs", model_name, n_bits, time.time() - t0)
    entry = _ClientEntry(client=client, eval_keys=eval_keys, generated_at=time.time())
    _clients[key] = entry
    return entry


def get_eval_keys(model_name: str, n_bits: int) -> bytes:
    return get_or_create_client(model_name, n_bits).eval_keys


def key_status(model_name: str, n_bits: int) -> dict:
    entry = _clients.get((model_name, n_bits))
    if entry is None:
        return {"ready": False, "generated_at": None, "eval_keys_bytes": 0}
    return {
        "ready": True,
        "generated_at": entry.generated_at,
        "eval_keys_bytes": len(entry.eval_keys),
    }


def generate_keys(model_name: str, n_bits: int, force: bool = False) -> _ClientEntry:
    if force and (model_name, n_bits) in _clients:
        del _clients[(model_name, n_bits)]
    return get_or_create_client(model_name, n_bits)


def encrypt(model_name: str, n_bits: int, X: np.ndarray) -> bytes:
    return get_or_create_client(model_name, n_bits).client.quantize_encrypt_serialize(X)


def decrypt(model_name: str, n_bits: int, encrypted_result: bytes) -> np.ndarray:
    return get_or_create_client(model_name, n_bits).client.deserialize_decrypt_dequantize(encrypted_result)


def decode_symptom_topk(raw: np.ndarray, top_k: int, model_name: str = "symptom") -> list[dict]:
    le = _load_label_encoder(model_name)
    arr = np.array(raw).flatten()

    if arr.size == 1:
        idx = int(round(float(arr[0])))
        name = le.classes_[idx] if le and 0 <= idx < len(le.classes_) else str(idx)
        return [{"condition": name, "probability": 1.0, "linked_model": ""}]

    k = min(top_k, len(arr))
    top_indices = np.argsort(arr)[::-1][:k]

    shifted = arr - arr.max()
    exp = np.exp(shifted)
    probs = exp / exp.sum()

    results = []
    for i in top_indices:
        name = le.classes_[i] if le and 0 <= i < len(le.classes_) else str(i)
        results.append({
            "condition": name,
            "probability": float(probs[i]),
            "linked_model": _condition_to_model_str(name),
        })
    return results


def _condition_to_model_str(condition: str) -> str:
    lower = condition.lower()
    if "diabetes" in lower:                                             return "diabetes"
    if "heart" in lower or "cardiac" in lower or "hypertension" in lower: return "heart"
    if "epilepsy" in lower:                                             return "eeg"
    return ""
