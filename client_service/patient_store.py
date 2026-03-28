import uuid
from pathlib import Path

from google.protobuf import text_format
from google.protobuf.timestamp_pb2 import Timestamp

from thesis.fhe.v1.patient_pb2 import Patient
from thesis.fhe.v1.settings_pb2 import Settings

import time as _time

_DATA_DIR     = Path(__file__).parent.parent / "data"
_PATIENTS_DIR = _DATA_DIR / "patients"
_SETTINGS_FILE = _DATA_DIR / "settings.textproto"

_PATIENTS_DIR.mkdir(parents=True, exist_ok=True)


_DEFAULT_SETTINGS = Settings(
    fhe_enabled=True,
    inference_server_url="http://localhost:8000",
    default_top_k=5,
    eval_key_ttl_seconds=3600,
)


def _patient_path(patient_id: str) -> Path:
    return _PATIENTS_DIR / f"{patient_id}.textproto"


def create_patient(name: str, date_of_birth: str, cnp: str = "", medical_history: str = "") -> Patient:
    now = Timestamp()
    now.FromMilliseconds(int(_time.time() * 1000))
    patient = Patient(
        id=str(uuid.uuid4()),
        name=name,
        date_of_birth=date_of_birth,
        cnp=cnp,
        medical_history=medical_history,
        created_at=now,
    )
    _write_patient(patient)
    return patient


def get_patient(patient_id: str) -> Patient | None:
    path = _patient_path(patient_id)
    if not path.exists():
        return None
    return _read_patient(path)


def list_patients() -> list[Patient]:
    patients = []
    for path in sorted(_PATIENTS_DIR.glob("*.textproto")):
        try:
            patients.append(_read_patient(path))
        except Exception:
            pass
    return patients


def update_patient(patient_id: str, name: str, date_of_birth: str, cnp: str = "", medical_history: str = "") -> Patient | None:
    patient = get_patient(patient_id)
    if patient is None:
        return None
    patient.name            = name
    patient.date_of_birth   = date_of_birth
    patient.cnp             = cnp
    patient.medical_history = medical_history
    _write_patient(patient)
    return patient


def delete_patient(patient_id: str) -> bool:
    path = _patient_path(patient_id)
    if not path.exists():
        return False
    path.unlink()
    return True


def delete_prediction_record(patient_id: str, record_id: str) -> bool:
    patient = get_patient(patient_id)
    if patient is None:
        return False
    filtered = [r for r in patient.history if r.id != record_id]
    if len(filtered) == len(patient.history):
        return False
    del patient.history[:]
    patient.history.extend(filtered)
    _write_patient(patient)
    return True


def append_prediction_record(patient_id: str, record) -> bool:
    patient = get_patient(patient_id)
    if patient is None:
        return False
    patient.history.append(record)
    _write_patient(patient)
    return True


def get_settings() -> Settings:
    if not _SETTINGS_FILE.exists():
        _write_settings(_DEFAULT_SETTINGS)
        return _DEFAULT_SETTINGS
    text = _SETTINGS_FILE.read_text(encoding="utf-8")
    return text_format.Parse(text, Settings())


def update_settings(settings: Settings) -> Settings:
    _write_settings(settings)
    return settings


def _read_patient(path: Path) -> Patient:
    text = path.read_text(encoding="utf-8")
    return text_format.Parse(text, Patient())


def _write_patient(patient: Patient) -> None:
    path = _patient_path(patient.id)
    path.write_text(text_format.MessageToString(patient), encoding="utf-8")


def _write_settings(settings: Settings) -> None:
    _SETTINGS_FILE.write_text(text_format.MessageToString(settings), encoding="utf-8")
