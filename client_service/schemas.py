from pydantic import BaseModel


class CreatePatientBody(BaseModel):
    name: str
    date_of_birth: str
    cnp: str = ""
    medical_history: str = ""


class UpdatePatientBody(BaseModel):
    name: str
    date_of_birth: str
    cnp: str = ""
    medical_history: str = ""


class SymptomRequest(BaseModel):
    symptom_vector: list[float]
    top_k: int = 5
    n_bits: int = 3


class UpdateSettingsBody(BaseModel):
    fhe_enabled: bool
    inference_server_url: str = "http://localhost:8000"
    default_top_k: int = 5
    eval_key_ttl_seconds: int = 3600


class GenerateKeysBody(BaseModel):
    n_bits: int = 3


class HeartRequest(BaseModel):
    age: float
    sex: float
    cp: float
    trestbps: float
    chol: float
    fbs: float
    restecg: float
    thalach: float
    exang: float
    oldpeak: float
    slope: float
    ca: float
    thal: float
    n_bits: int = 8


class EEGRequest(BaseModel):
    eeg_window: list[float]  # 178 EEG amplitude samples
    n_bits: int = 4
