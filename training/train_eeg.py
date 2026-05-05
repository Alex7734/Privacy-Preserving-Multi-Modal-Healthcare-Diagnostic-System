import argparse
import json
import logging
import pickle
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression as SklearnLR
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

from concrete.ml.sklearn import NeuralNetClassifier
from concrete.ml.deployment import FHEModelDev

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("train_eeg")

ROOT         = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT.parent / "epileptic_seizures.csv"
MODELS_DIR   = ROOT / "models" / "eeg"
PLAIN_DIR    = MODELS_DIR / "plain_model"
SCALER_PATH  = MODELS_DIR / "scaler.pkl"
RESULTS_DIR  = ROOT / "results"


def load_and_preprocess(dataset_path: Path = DATASET_PATH):
    log.info("Loading dataset from: %s", dataset_path)
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}\n"
            f"Expected: epileptic_seizures.csv in the project parent directory."
        )
    df = pd.read_csv(dataset_path)
    df = df.drop(columns=[c for c in df.columns if "Unnamed" in c])
    X = df.drop(columns=["y"]).values.astype(np.float32)
    y = (df["y"].values == 1).astype(np.int64)
    log.info("Dataset: %d samples, %d features, seizure rate=%.2f", len(X), X.shape[1], y.mean())
    return X, y


def split_and_scale(X, y, test_size=0.20, random_state=42):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train).astype(np.float32)
    X_test_s  = scaler.transform(X_test).astype(np.float32)
    log.info("Train: %d  Test: %d  (stratified, seed=%d)", len(X_train), len(X_test), random_state)
    return X_train_s, X_test_s, y_train, y_test, scaler


def train_baselines(X_train, y_train, X_test, y_test):
    clf_lr = SklearnLR(max_iter=2000, random_state=42)
    clf_lr.fit(X_train, y_train)
    acc_lr = accuracy_score(y_test, clf_lr.predict(X_test))
    f1_lr  = f1_score(y_test, clf_lr.predict(X_test))

    clf_mlp = MLPClassifier(hidden_layer_sizes=(100, 100), max_iter=500,
                             random_state=42, early_stopping=True, verbose=False)
    clf_mlp.fit(X_train, y_train)
    acc_mlp = accuracy_score(y_test, clf_mlp.predict(X_test))
    f1_mlp  = f1_score(y_test, clf_mlp.predict(X_test))
    log.info("LR baseline  acc=%.4f  f1=%.4f", acc_lr, f1_lr)
    log.info("MLP baseline acc=%.4f  f1=%.4f", acc_mlp, f1_mlp)
    return clf_mlp, {"lr": {"accuracy": acc_lr, "f1": f1_lr},
                     "mlp": {"accuracy": acc_mlp, "f1": f1_mlp}}


def train_concrete_model(X_train, y_train, X_test, y_test, n_bits: int, run_fhe: bool = True):
    log.info("[n_bits=%d] Training NeuralNetClassifier (QAT) …", n_bits)
    model = NeuralNetClassifier(
        module__n_layers=2,
        module__n_w_bits=n_bits,
        module__n_a_bits=n_bits,
        module__n_accum_bits=32,
        module__n_hidden_neurons_multiplier=0.5,
        max_epochs=50,
        lr=0.001,
        verbose=0,
        batch_size=128,
    )
    model.fit(X_train, y_train)

    y_pred_q = model.predict(X_test)
    acc_q = accuracy_score(y_test, y_pred_q)
    f1_q  = f1_score(y_test, y_pred_q)
    log.info("[n_bits=%d] Quantized cleartext — acc=%.4f  f1=%.4f", n_bits, acc_q, f1_q)

    log.info("[n_bits=%d] Compiling TFHE circuit …", n_bits)
    t0 = time.perf_counter()
    try:
        model.compile(X_train)
        compile_time = time.perf_counter() - t0
        log.info("[n_bits=%d] Compiled in %.2f s", n_bits, compile_time)
    except RuntimeError as e:
        log.error("[n_bits=%d] Compilation failed: %s", n_bits, e)
        return {"n_bits": n_bits, "acc_quantized": acc_q, "f1_quantized": f1_q,
                "compile_failed": True, "fhe_latency_ms": None, "compile_time_s": None, "model": model}

    fhe_latency_ms = None
    if run_fhe:
        N = 2
        log.info("[n_bits=%d] True FHE inference on %d samples …", n_bits, N)
        times = []
        for i in range(min(N, len(X_test))):
            t0 = time.perf_counter()
            model.predict(X_test[i:i+1], fhe="execute")
            times.append((time.perf_counter() - t0) * 1000)
        fhe_latency_ms = float(np.median(times))
        log.info("[n_bits=%d] FHE latency median=%.0f ms", n_bits, fhe_latency_ms)

    return {"n_bits": n_bits, "acc_quantized": acc_q, "f1_quantized": f1_q,
            "compile_failed": False, "fhe_latency_ms": fhe_latency_ms,
            "compile_time_s": time.perf_counter() - t0, "model": model}


def save_fhe_circuit(concrete_model, n_bits: int):
    import shutil
    versioned = MODELS_DIR / f"fhe_circuit_n{n_bits}"
    if versioned.exists():
        shutil.rmtree(versioned)
    versioned.mkdir(parents=True)
    FHEModelDev(path_dir=str(versioned), model=concrete_model).save()
    log.info("FHE circuit saved: %s", versioned)


def save_artefacts(plain_model, scaler, feature_count: int, n_bits_list: list):
    PLAIN_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(plain_model, PLAIN_DIR / "model.joblib")
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)
    log.info("Plain model + scaler saved.")

    meta = {
        "n_features": feature_count,
        "n_bits_available": n_bits_list,
        "model_family": "NeuralNetClassifier (QAT, 2 hidden layers, n_hidden=0.5*input)",
        "task": "binary: 0=non-seizure, 1=seizure",
        "pbs_calls_per_inference": "~178",
        "dataset": "Epileptic Seizure Recognition (UCI, Andrzejak 2001)",
    }
    with open(MODELS_DIR / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    log.info("meta.json saved.")


def save_results(concrete_results: list, sklearn_metrics: dict):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "module": "eeg_seizure",
        "sklearn_baselines": sklearn_metrics,
        "concrete_ml_results": [{k: v for k, v in r.items() if k != "model"} for r in concrete_results],
    }
    with open(RESULTS_DIR / "eeg_results.json", "w") as f:
        json.dump(out, f, indent=2)
    log.info("Results saved.")


def main():
    parser = argparse.ArgumentParser(description="Train & compile EEG seizure FHE model (NeuralNetClassifier)")
    parser.add_argument("--n-bits", type=int, nargs="+", default=[4],
                        help="n_bits sweep (default: 4; supported: 2-6)")
    parser.add_argument("--dataset", type=str, default=str(DATASET_PATH))
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-fhe", action="store_true",
                        help="Skip true FHE timing")
    args = parser.parse_args()

    X, y = load_and_preprocess(Path(args.dataset))
    X_train, X_test, y_train, y_test, scaler = split_and_scale(X, y, args.test_size, args.seed)

    plain_model, sklearn_metrics = train_baselines(X_train, y_train, X_test, y_test)

    all_results = []
    for nb in args.n_bits:
        result = train_concrete_model(X_train, y_train, X_test, y_test, n_bits=nb, run_fhe=not args.no_fhe)
        all_results.append(result)
        if not result.get("compile_failed"):
            save_fhe_circuit(result["model"], nb)

    save_artefacts(plain_model, scaler, X.shape[1], n_bits_list=sorted(args.n_bits))
    save_results(all_results, sklearn_metrics)

    log.info("=" * 60)
    log.info("TRAINING COMPLETE")
    log.info("MLP baseline acc=%.4f f1=%.4f", sklearn_metrics["mlp"]["accuracy"], sklearn_metrics["mlp"]["f1"])
    for r in all_results:
        if r.get("compile_failed"):
            log.info("n_bits=%-2d  clear=%.4f  COMPILE FAILED (NoParametersFound)", r["n_bits"], r["acc_quantized"])
        else:
            lat = f"{r['fhe_latency_ms']:.0f}ms" if r["fhe_latency_ms"] else "skipped"
            log.info("n_bits=%-2d  clear=%.4f  fhe_lat=%s", r["n_bits"], r["acc_quantized"], lat)
    log.info("=" * 60)


if __name__ == "__main__":
    main()
