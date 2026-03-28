import time
import uuid
from dataclasses import dataclass, field
from typing import Dict

from thesis.fhe.v1.patient_pb2 import ModelType


@dataclass
class _CacheEntry:
    model: ModelType
    n_bits: int
    data: bytes
    expires_at: float


class EvalKeyCache:
    def __init__(self) -> None:
        self._store: Dict[str, _CacheEntry] = {}

    def store(self, model: ModelType, n_bits: int, data: bytes, ttl_seconds: int = 3600) -> str:
        handle = str(uuid.uuid4())
        self._store[handle] = _CacheEntry(
            model=model,
            n_bits=n_bits,
            data=data,
            expires_at=time.time() + ttl_seconds,
        )
        return handle

    def get(self, handle: str) -> _CacheEntry | None:
        entry = self._store.get(handle)
        if entry is None:
            return None
        if time.time() > entry.expires_at:
            del self._store[handle]
            return None
        return entry

    def evict_expired(self) -> int:
        now = time.time()
        expired = [h for h, e in self._store.items() if now > e.expires_at]
        for h in expired:
            del self._store[h]
        return len(expired)


eval_key_cache = EvalKeyCache()
