import argparse
import json
import logging
import os
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression as SklearnLR
from sklearn.metrics import (
    accuracy_score, classification_report, f1_score, roc_auc_score
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from concrete.ml.sklearn.linear_model import LogisticRegression as ConcreteLR
from concrete.ml.deployment import FHEModelDev

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("train_heart")

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = (
    ROOT.parent
    / "heart_and_disease_dataset "
    / "processed.cleveland.data"
)
MODELS_DIR = ROOT / "models" / "heart"
FHE_CIRCUIT_DIR = MODELS_DIR / "fhe_circuit"
SCALER_PATH = MODELS_DIR / "scaler.pkl"
RESULTS_DIR = ROOT / "results"

HEART_COLUMNS = [
    "age", "sex", "cp", "trestbps", "chol", "fbs",
    "restecg", "thalach", "exang", "oldpeak", "slope", "ca", "thal",
    "target",
]

FEATURE_COLUMNS = HEART_COLUMNS[:-1]
TARGET_COLUMN   = "target"


def load_and_preprocess(dataset_path: Path = DATASET_PATH):
    log.info(f"Loading dataset from: {dataset_path}")
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}. "
            "Check DATASET_PATH in this script."
        )

    df = pd.read_csv(dataset_path, header=None, names=HEART_COLUMNS, na_values="?")

    n_before = len(df)
    df = df.dropna()
    n_after = len(df)
    log.info(f"Dropped {n_before - n_after} rows with missing values ({n_after} remain).")

    df = df.astype(float)

    df[TARGET_COLUMN] = (df[TARGET_COLUMN] > 0).astype(int)

    X = df[FEATURE_COLUMNS].values.astype(np.float32)
    y = df[TARGET_COLUMN].values.astype(np.int32)

    pos = int(y.sum())
    log.info(
        f"Dataset shape: X={X.shape}, y={y.shape}  |  "
        f"Positive (disease)={pos} ({100*pos/len(y):.1f}%)"
    )
    return X, y


def split_and_scale(X, y, test_size=0.20, random_state=42):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )
    log.info(
        f"Train: {len(X_train)} samples, Test: {len(X_test)} samples  "
        f"(stratified, test_size={test_size}, random_state={random_state})"
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    log.info("StandardScaler fitted on X_train and applied to both splits.")
    return X_train_s, X_test_s, y_train, y_test, scaler


def train_sklearn_baseline(X_train, y_train, X_test, y_test):
    log.info("Training scikit-learn baseline LogisticRegression …")
    clf = SklearnLR(max_iter=1000, random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1  = f1_score(y_test, y_pred)
    auc = roc_auc_score(y_test, clf.predict_proba(X_test)[:, 1])
    log.info(f"Sklearn baseline — Accuracy: {acc:.4f}  F1: {f1:.4f}  AUC: {auc:.4f}")
    return {"accuracy": acc, "f1": f1, "auc": auc}


def train_concrete_model(X_train, y_train, X_test, y_test, n_bits: int):
    log.info(f"[n_bits={n_bits}] Training Concrete ML LogisticRegression …")

    model = ConcreteLR(n_bits=n_bits)
    model.fit(X_train, y_train)

    y_pred_clear = model.predict(X_test)
    acc_clear = accuracy_score(y_test, y_pred_clear)
    f1_clear  = f1_score(y_test, y_pred_clear)
    log.info(f"[n_bits={n_bits}] Cleartext accuracy: {acc_clear:.4f}  F1: {f1_clear:.4f}")

    log.info(f"[n_bits={n_bits}] Compiling model to TFHE circuit … (may take 10–60 s)")
    t0 = time.perf_counter()
    model.compile(X_train)
    compile_time = time.perf_counter() - t0
    log.info(f"[n_bits={n_bits}] Compilation done in {compile_time:.2f} s")

    log.info(f"[n_bits={n_bits}] Evaluating simulated FHE accuracy …")
    y_pred_sim = model.predict(X_test, fhe="simulate")
    acc_sim = accuracy_score(y_test, y_pred_sim)
    f1_sim  = f1_score(y_test, y_pred_sim)
    log.info(f"[n_bits={n_bits}] Simulated FHE accuracy: {acc_sim:.4f}  F1: {f1_sim:.4f}")

    N_FHE_SAMPLES = 5
    log.info(f"[n_bits={n_bits}] Running true FHE inference on {N_FHE_SAMPLES} samples …")
    fhe_times = []
    fhe_preds = []
    for i in range(min(N_FHE_SAMPLES, len(X_test))):
        sample = X_test[i : i + 1]
        t0 = time.perf_counter()
        pred = model.predict(sample, fhe="execute")
        fhe_times.append(time.perf_counter() - t0)
        fhe_preds.append(int(pred[0]))

    latency_mean = float(np.mean(fhe_times))
    latency_std  = float(np.std(fhe_times))
    acc_fhe_subset = accuracy_score(y_test[:N_FHE_SAMPLES], fhe_preds)
    log.info(
        f"[n_bits={n_bits}] FHE latency: {latency_mean:.2f} ± {latency_std:.2f} s  "
        f"|  FHE accuracy (subset {N_FHE_SAMPLES}): {acc_fhe_subset:.4f}"
    )

    return {
        "n_bits": n_bits,
        "acc_cleartext": acc_clear,
        "f1_cleartext": f1_clear,
        "acc_fhe_simulate": acc_sim,
        "f1_fhe_simulate": f1_sim,
        "acc_fhe_true_subset": acc_fhe_subset,
        "fhe_latency_mean_s": latency_mean,
        "fhe_latency_std_s": latency_std,
        "fhe_n_samples": N_FHE_SAMPLES,
        "compilation_time_s": compile_time,
        "model": model,
    }


def save_artefacts(model, scaler, n_bits: int):
    circuit_dir = MODELS_DIR / f"fhe_circuit_n{n_bits}"
    circuit_dir.mkdir(parents=True, exist_ok=True)

    log.info(f"Saving FHE circuit to {circuit_dir} …")
    dev = FHEModelDev(path_dir=str(circuit_dir), model=model)
    dev.save()
    log.info("FHE circuit saved.")

    default_dir = FHE_CIRCUIT_DIR
    default_dir.mkdir(parents=True, exist_ok=True)
    dev_default = FHEModelDev(path_dir=str(default_dir), model=model)
    dev_default.save()
    log.info(f"Default circuit also saved to {default_dir}.")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)
    log.info(f"Scaler saved to {SCALER_PATH}.")

    meta = {
        "feature_names": FEATURE_COLUMNS,
        "n_bits": n_bits,
        "n_features": len(FEATURE_COLUMNS),
        "target": "0=no disease, 1=disease",
    }
    with open(MODELS_DIR / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    log.info("Metadata saved.")


def save_results(results: list, sklearn_baseline: dict):
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "module": "heart_disease",
        "sklearn_baseline": sklearn_baseline,
        "concrete_ml_results": [
            {k: v for k, v in r.items() if k != "model"}
            for r in results
        ],
    }
    path = RESULTS_DIR / "heart_results.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    log.info(f"Results saved to {path}")


def main():
    parser = argparse.ArgumentParser(description="Train & compile heart disease FHE model")
    parser.add_argument(
        "--n-bits", type=int, nargs="+", default=[8],
        help="Quantization bit-widths to train (default: 8). Provide multiple for sweep.",
    )
    parser.add_argument(
        "--dataset", type=str, default=str(DATASET_PATH),
        help="Path to processed.cleveland.data",
    )
    parser.add_argument(
        "--test-size", type=float, default=0.20,
        help="Fraction of data for test set (default: 0.20)",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    parser.add_argument(
        "--save-n-bits", type=int, default=None,
        help="Which n_bits model to save as the default circuit (default: largest in sweep)",
    )
    args = parser.parse_args()

    X, y = load_and_preprocess(Path(args.dataset))
    X_train, X_test, y_train, y_test, scaler = split_and_scale(
        X, y, test_size=args.test_size, random_state=args.seed
    )

    sklearn_metrics = train_sklearn_baseline(X_train, y_train, X_test, y_test)

    all_results = []
    best_model  = None
    save_bits   = args.save_n_bits or max(args.n_bits)

    for nb in args.n_bits:
        result = train_concrete_model(X_train, y_train, X_test, y_test, n_bits=nb)
        all_results.append(result)
        if nb == save_bits:
            best_model = result["model"]

    if best_model is None:
        best_model = all_results[-1]["model"]
        save_bits  = all_results[-1]["n_bits"]

    save_artefacts(best_model, scaler, n_bits=save_bits)
    save_results(all_results, sklearn_metrics)

    log.info("\n" + "=" * 60)
    log.info("TRAINING COMPLETE — SUMMARY")
    log.info("=" * 60)
    log.info(f"Sklearn baseline accuracy : {sklearn_metrics['accuracy']:.4f}")
    for r in all_results:
        log.info(
            f"n_bits={r['n_bits']}  "
            f"clear={r['acc_cleartext']:.4f}  "
            f"sim={r['acc_fhe_simulate']:.4f}  "
            f"fhe(n={r['fhe_n_samples']})={r['acc_fhe_true_subset']:.4f}  "
            f"latency={r['fhe_latency_mean_s']:.2f}s  "
            f"compile={r['compilation_time_s']:.2f}s"
        )
    log.info(f"Default circuit saved at  : {FHE_CIRCUIT_DIR}")
    log.info(f"Scaler saved at           : {SCALER_PATH}")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
