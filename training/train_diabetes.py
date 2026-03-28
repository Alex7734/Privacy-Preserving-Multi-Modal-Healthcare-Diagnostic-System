import argparse
import json
import logging
import pickle
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier as SklearnXGB

from concrete.ml.sklearn.xgb import XGBClassifier as ConcreteXGB
from concrete.ml.deployment import FHEModelDev

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("train_diabetes")

ROOT         = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT.parent / "diabetes.csv"
MODELS_DIR   = ROOT / "models" / "diabetes"
FHE_CIRCUIT_DIR = MODELS_DIR / "fhe_circuit"
RESULTS_DIR  = ROOT / "results"

FEATURE_COLUMNS = [
    "Pregnancies", "Glucose", "BloodPressure", "SkinThickness",
    "Insulin", "BMI", "DiabetesPedigreeFunction", "Age",
]
TARGET_COLUMN = "Outcome"

ZERO_IS_INVALID = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]


def load_and_preprocess(path: Path = DATASET_PATH):
    log.info(f"Loading dataset from {path}")
    df = pd.read_csv(path)

    for col in ZERO_IS_INVALID:
        median = df.loc[df[col] != 0, col].median()
        n_replaced = (df[col] == 0).sum()
        df[col] = df[col].replace(0, median)
        log.info(f"Replaced {n_replaced} zero(s) in '{col}' with median {median:.2f}")

    X = df[FEATURE_COLUMNS].values.astype(np.float32)
    y = df[TARGET_COLUMN].values.astype(np.int32)
    pos = int(y.sum())
    log.info(f"Shape: X={X.shape}  Positive={pos} ({100*pos/len(y):.1f}%)")
    return X, y


def split_data(X, y, test_size=0.20, seed=42):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=seed, stratify=y
    )
    log.info(f"Train: {len(X_train)}  Test: {len(X_test)}")
    return X_train, X_test, y_train, y_test


def train_sklearn_baseline(X_train, y_train, X_test, y_test, max_depth, n_est, seed):
    log.info("Training sklearn XGBClassifier baseline …")
    clf = SklearnXGB(
        max_depth=max_depth, n_estimators=n_est,
        use_label_encoder=False, eval_metric="logloss",
        random_state=seed,
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1  = f1_score(y_test, y_pred)
    auc = roc_auc_score(y_test, clf.predict_proba(X_test)[:, 1])
    log.info(f"Sklearn baseline — Acc: {acc:.4f}  F1: {f1:.4f}  AUC: {auc:.4f}")
    return {"accuracy": acc, "f1": f1, "auc": auc}


def train_concrete_model(X_train, y_train, X_test, y_test, n_bits, max_depth, n_est, seed):
    log.info(
        f"[n_bits={n_bits}, depth={max_depth}, trees={n_est}] "
        "Training Concrete ML XGBClassifier …"
    )
    model = ConcreteXGB(
        n_bits=n_bits,
        max_depth=max_depth,
        n_estimators=n_est,
        random_state=seed,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc_clear = accuracy_score(y_test, y_pred)
    f1_clear  = f1_score(y_test, y_pred)
    log.info(f"Cleartext: Acc={acc_clear:.4f}  F1={f1_clear:.4f}")

    log.info("Compiling to TFHE circuit … (may take 30–120 s for XGBoost)")
    t0 = time.perf_counter()
    model.compile(X_train)
    compile_time = time.perf_counter() - t0
    log.info(f"Compilation done in {compile_time:.2f} s")

    y_pred_sim = model.predict(X_test, fhe="simulate")
    acc_sim = accuracy_score(y_test, y_pred_sim)
    log.info(f"Simulated FHE: Acc={acc_sim:.4f}")

    N = 3
    log.info(f"Running true FHE on {N} samples …")
    fhe_times, fhe_preds = [], []
    for i in range(min(N, len(X_test))):
        t0 = time.perf_counter()
        p  = model.predict(X_test[i : i + 1], fhe="execute")
        fhe_times.append(time.perf_counter() - t0)
        fhe_preds.append(int(p[0]))

    lat_mean = float(np.mean(fhe_times))
    lat_std  = float(np.std(fhe_times))
    acc_fhe  = accuracy_score(y_test[:N], fhe_preds)
    log.info(f"FHE latency: {lat_mean:.2f}±{lat_std:.2f}s  acc(subset)={acc_fhe:.4f}")

    return {
        "n_bits": n_bits, "max_depth": max_depth, "n_estimators": n_est,
        "acc_cleartext": acc_clear, "f1_cleartext": f1_clear,
        "acc_fhe_simulate": acc_sim,
        "acc_fhe_true_subset": acc_fhe, "fhe_n_samples": N,
        "fhe_latency_mean_s": lat_mean, "fhe_latency_std_s": lat_std,
        "compilation_time_s": compile_time,
        "model": model,
    }


def save_artefacts(model, X_train, n_bits, max_depth, n_est):
    circuit_dir = MODELS_DIR / f"fhe_circuit_n{n_bits}_d{max_depth}_t{n_est}"
    circuit_dir.mkdir(parents=True, exist_ok=True)
    FHEModelDev(path_dir=str(circuit_dir), model=model).save()

    default_dir = FHE_CIRCUIT_DIR
    default_dir.mkdir(parents=True, exist_ok=True)
    FHEModelDev(path_dir=str(default_dir), model=model).save()

    np.save(str(MODELS_DIR / "train_sample.npy"), X_train[:200])
    meta = {
        "feature_names": FEATURE_COLUMNS,
        "n_bits": n_bits, "max_depth": max_depth, "n_estimators": n_est,
        "preprocessing": "zero-median imputation, no StandardScaler",
    }
    with open(MODELS_DIR / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    log.info(f"Artefacts saved: {default_dir}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--n-bits", type=int, nargs="+", default=[6])
    p.add_argument("--max-depth", type=int, default=3)
    p.add_argument("--n-estimators", type=int, default=20)
    p.add_argument("--test-size", type=float, default=0.20)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--save-n-bits", type=int, default=None)
    args = p.parse_args()

    X, y = load_and_preprocess()
    X_train, X_test, y_train, y_test = split_data(X, y, args.test_size, args.seed)
    sk_metrics = train_sklearn_baseline(
        X_train, y_train, X_test, y_test,
        args.max_depth, args.n_estimators, args.seed,
    )

    all_results = []
    save_bits = args.save_n_bits or max(args.n_bits)
    best_model = None

    for nb in args.n_bits:
        r = train_concrete_model(
            X_train, y_train, X_test, y_test,
            nb, args.max_depth, args.n_estimators, args.seed,
        )
        all_results.append(r)
        if nb == save_bits:
            best_model = r["model"]

    if best_model is None:
        best_model = all_results[-1]["model"]

    save_artefacts(best_model, X_train, save_bits, args.max_depth, args.n_estimators)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "module": "diabetes",
        "sklearn_baseline": sk_metrics,
        "concrete_ml_results": [{k: v for k, v in r.items() if k != "model"} for r in all_results],
    }
    (RESULTS_DIR / "diabetes_results.json").write_text(json.dumps(out, indent=2))
    log.info("Done.")


if __name__ == "__main__":
    main()
