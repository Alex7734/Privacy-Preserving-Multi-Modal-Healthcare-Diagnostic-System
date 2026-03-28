import argparse
import json
import logging
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression as SklearnLR
from sklearn.metrics import accuracy_score, f1_score, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from concrete.ml.sklearn import XGBClassifier as ConcreteXGB
from concrete.ml.deployment import FHEModelDev

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("train_symptom")

ROOT             = Path(__file__).resolve().parent.parent
DATASET_PATH     = ROOT.parent / "symptom_disease_train.csv"
MODELS_DIR       = ROOT / "models" / "symptom"
PLAIN_MODEL_DIR  = MODELS_DIR / "plain_model"
RESULTS_DIR      = ROOT / "results"

LABEL_COLUMN = "prognosis"


def load_and_preprocess(dataset_path: Path = DATASET_PATH):
    log.info("Loading dataset from: %s", dataset_path)
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {dataset_path}\n"
            f"Expected in: {dataset_path.parent}"
        )

    df = pd.read_csv(dataset_path)
    df = df.loc[:, ~df.columns.str.contains("^Unnamed")]
    df.columns = df.columns.str.strip().str.replace(" ", "_")

    symptom_cols = [c for c in df.columns if c != LABEL_COLUMN]
    X = df[symptom_cols].values.astype(np.float32)

    le = LabelEncoder()
    y = le.fit_transform(df[LABEL_COLUMN].values)

    log.info(
        "Dataset: %d samples  |  %d symptom features  |  %d disease classes",
        len(X), len(symptom_cols), len(le.classes_),
    )
    log.info("Classes (first 8): %s", list(le.classes_[:8]))
    log.info(
        "Samples per class: %s (should be uniform)",
        pd.Series(y).value_counts().unique().tolist(),
    )
    return X, y, symptom_cols, le


def split(X, y, test_size=0.20, random_state=42):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )
    log.info("Train: %d  Test: %d  (stratified)", len(X_train), len(X_test))
    return X_train, X_test, y_train, y_test


def train_baselines(X_train, y_train, X_test, y_test):
    clf_lr = SklearnLR(max_iter=2000, random_state=42, multi_class="multinomial", solver="lbfgs")
    clf_lr.fit(X_train, y_train)
    acc_lr = accuracy_score(y_test, clf_lr.predict(X_test))
    f1_lr  = f1_score(y_test, clf_lr.predict(X_test), average="macro")
    log.info("LR baseline       — acc=%.4f  macro-f1=%.4f", acc_lr, f1_lr)

    clf_gbt = GradientBoostingClassifier(max_depth=1, n_estimators=20, random_state=42)
    clf_gbt.fit(X_train, y_train)
    y_pred_gbt = clf_gbt.predict(X_test)
    acc_gbt = accuracy_score(y_test, y_pred_gbt)
    f1_gbt  = f1_score(y_test, y_pred_gbt, average="macro")
    top3_gbt = top_k_accuracy_score(y_test, clf_gbt.predict_proba(X_test), k=3)
    top5_gbt = top_k_accuracy_score(y_test, clf_gbt.predict_proba(X_test), k=5)
    log.info(
        "GBT stumps baseline — acc=%.4f  macro-f1=%.4f  top3=%.4f  top5=%.4f",
        acc_gbt, f1_gbt, top3_gbt, top5_gbt,
    )

    return clf_gbt, {
        "lr":  {"accuracy": acc_lr,  "f1_macro": f1_lr},
        "gbt": {"accuracy": acc_gbt, "f1_macro": f1_gbt, "top3": top3_gbt, "top5": top5_gbt},
    }


def train_concrete_model(X_train, y_train, X_test, y_test, n_bits: int, run_fhe: bool = True):
    log.info("[n_bits=%d] Training ConcreteXGB (max_depth=1, n_estimators=20) …", n_bits)
    model = ConcreteXGB(
        n_bits=n_bits,
        max_depth=1,
        n_estimators=20,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)

    y_pred_q = model.predict(X_test)
    acc_q = accuracy_score(y_test, y_pred_q)
    f1_q  = f1_score(y_test, y_pred_q, average="macro")
    log.info("[n_bits=%d] Quantized cleartext — acc=%.4f  macro-f1=%.4f", n_bits, acc_q, f1_q)

    log.info("[n_bits=%d] Compiling TFHE circuit … (typically 5–30 s for stumps)", n_bits)
    t0 = time.perf_counter()
    model.compile(X_train)
    compile_time = time.perf_counter() - t0
    log.info("[n_bits=%d] Compiled in %.2f s", n_bits, compile_time)

    y_pred_sim = model.predict(X_test, fhe="simulate")
    acc_sim = accuracy_score(y_test, y_pred_sim)
    log.info("[n_bits=%d] Simulated FHE — acc=%.4f", n_bits, acc_sim)

    fhe_latency_ms = None
    acc_fhe = None
    if run_fhe:
        N = 3
        log.info("[n_bits=%d] True FHE inference on %d samples …", n_bits, N)
        times, preds = [], []
        for i in range(min(N, len(X_test))):
            t0 = time.perf_counter()
            p = model.predict(X_test[i:i+1], fhe="execute")
            times.append((time.perf_counter() - t0) * 1000)
            preds.append(int(p[0]))
        fhe_latency_ms = float(np.mean(times))
        acc_fhe = accuracy_score(y_test[:N], preds)
        log.info("[n_bits=%d] FHE latency=%.0f ms  acc(n=%d)=%.4f", n_bits, fhe_latency_ms, N, acc_fhe)

    return {
        "n_bits": n_bits,
        "acc_quantized": acc_q,
        "f1_quantized": f1_q,
        "acc_fhe_simulate": acc_sim,
        "acc_fhe_true": acc_fhe,
        "fhe_latency_ms": fhe_latency_ms,
        "compile_time_s": compile_time,
        "model": model,
    }


def save_fhe_circuit(concrete_model, n_bits: int):
    import shutil
    versioned = MODELS_DIR / f"fhe_circuit_n{n_bits}"
    if versioned.exists():
        shutil.rmtree(versioned)
    versioned.mkdir(parents=True)
    FHEModelDev(path_dir=str(versioned), model=concrete_model).save()
    log.info("FHE circuit saved: %s", versioned)


def save_artefacts(plain_model, le: LabelEncoder, symptom_cols: list, n_bits_list: list):
    PLAIN_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(plain_model, PLAIN_MODEL_DIR / "model.joblib")
    joblib.dump(le,          PLAIN_MODEL_DIR / "label_encoder.joblib")
    log.info("Plain model + LabelEncoder saved: %s", PLAIN_MODEL_DIR)

    meta = {
        "feature_names": symptom_cols,
        "classes": list(le.classes_),
        "n_features": len(symptom_cols),
        "n_classes": len(le.classes_),
        "n_bits_available": n_bits_list,
        "model_family": "XGBClassifier (stumps: max_depth=1, n_estimators=20)",
        "task": "multi-class symptom → disease, Top-K output",
        "zama_reference": "n_bits=3 → ~150ms FHE latency",
    }
    with open(MODELS_DIR / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    log.info("meta.json saved.")


def save_results(concrete_results: list, sklearn_metrics: dict):

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "module": "symptom_disease",
        "sklearn_baselines": sklearn_metrics,
        "concrete_ml_results": [{k: v for k, v in r.items() if k != "model"} for r in concrete_results],
    }
    path = RESULTS_DIR / "symptom_results.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    log.info("Results saved: %s", path)


def main():
    parser = argparse.ArgumentParser(description="Train & compile symptom→disease FHE model")
    parser.add_argument("--n-bits", type=int, nargs="+", default=[3],
                        help="n_bits sweep (default: 3, Zama reference)")
    parser.add_argument("--dataset", type=str, default=str(DATASET_PATH))
    parser.add_argument("--test-size", type=float, default=0.20)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-fhe", action="store_true",
                        help="Skip true FHE timing (faster, good for quick iteration)")
    args = parser.parse_args()

    X, y, symptom_cols, le = load_and_preprocess(Path(args.dataset))
    X_train, X_test, y_train, y_test = split(X, y, args.test_size, args.seed)

    plain_model, sklearn_metrics = train_baselines(X_train, y_train, X_test, y_test)

    all_results = []

    for nb in args.n_bits:
        result = train_concrete_model(
            X_train, y_train, X_test, y_test,
            n_bits=nb,
            run_fhe=not args.no_fhe,
        )
        all_results.append(result)
        save_fhe_circuit(result["model"], nb)

    save_artefacts(plain_model, le, symptom_cols, n_bits_list=sorted(args.n_bits))
    save_results(all_results, sklearn_metrics)

    log.info("\n" + "=" * 60)
    log.info("TRAINING COMPLETE — SUMMARY")
    log.info("=" * 60)
    log.info("GBT float baseline  acc=%.4f  top3=%.4f  top5=%.4f",
             sklearn_metrics["gbt"]["accuracy"],
             sklearn_metrics["gbt"]["top3"],
             sklearn_metrics["gbt"]["top5"])
    for r in all_results:
        fhe_str = f"{r['fhe_latency_ms']:.0f}ms" if r["fhe_latency_ms"] else "skipped"
        log.info(
            "n_bits=%-2d  clear=%.4f  sim=%.4f  fhe=%s  compile=%.2fs",
            r["n_bits"], r["acc_quantized"], r["acc_fhe_simulate"],
            fhe_str, r["compile_time_s"],
        )
    log.info("FHE circuits        : %s", [str(MODELS_DIR / f"fhe_circuit_n{nb}") for nb in sorted(args.n_bits)])
    log.info("Plain model         : %s", PLAIN_MODEL_DIR / "model.joblib")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
