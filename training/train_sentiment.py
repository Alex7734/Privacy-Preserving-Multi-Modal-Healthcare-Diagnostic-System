import argparse
import json
import logging
import os
import pickle
import time
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.svm import LinearSVC as SklearnLinearSVC

from concrete.ml.sklearn.svm import LinearSVC as ConcreteLinearSVC
from concrete.ml.deployment import FHEModelDev

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("train_sentiment")

ROOT            = Path(__file__).resolve().parent.parent
DATASET_DIR   = ROOT.parent / "movie_review_dataset"
MODELS_DIR    = ROOT / "models" / "sentiment"
FHE_CIRCUIT_DIR = MODELS_DIR / "fhe_circuit"
RESULTS_DIR     = ROOT / "results"


def load_imdb(dataset_dir: Path, max_train: int = 10000, max_test: int = 2000):
    log.info(f"Loading IMDb from {dataset_dir}")
    texts, labels = [], []
    for split, cap in [("train", max_train), ("test", max_test)]:
        split_dir = dataset_dir / split
        if not split_dir.exists():
            raise FileNotFoundError(f"IMDb split directory not found: {split_dir}")
        for label_name, label in [("pos", 1), ("neg", 0)]:
            label_dir = split_dir / label_name
            if not label_dir.exists():
                continue
            files = sorted(label_dir.glob("*.txt"))[:cap // 2]
            for fp in files:
                texts.append(fp.read_text(encoding="utf-8", errors="replace"))
                labels.append(label)
    texts  = np.array(texts)
    labels = np.array(labels, dtype=np.int32)
    log.info(f"Loaded {len(texts)} samples  pos={labels.sum()}  neg={(labels == 0).sum()}")
    return texts, labels


def load_sst2():
    from datasets import load_dataset
    ds = load_dataset("stanfordnlp/sst2")
    train = ds["train"]
    val   = ds["validation"]
    X_train = np.array(train["sentence"])
    y_train = np.array(train["label"], dtype=np.int32)
    X_test  = np.array(val["sentence"])
    y_test  = np.array(val["label"], dtype=np.int32)
    log.info(f"SST-2: train={len(X_train)}  val={len(X_test)}")
    return X_train, y_train, X_test, y_test


def build_tfidf(X_train_texts, max_features=300):
    log.info(f"Fitting TF-IDF (max_features={max_features}) …")
    vectorizer = TfidfVectorizer(
        max_features=max_features,
        sublinear_tf=True,
        strip_accents="unicode",
        analyzer="word",
        min_df=2,
        ngram_range=(1, 1),
    )
    vectorizer.fit(X_train_texts)
    log.info(f"Vocabulary size: {len(vectorizer.vocabulary_)}")
    return vectorizer


def vectorise(vectorizer, texts):
    return vectorizer.transform(texts).toarray().astype(np.float32)


def train_sklearn_baseline(X_train_vec, y_train, X_test_vec, y_test):
    log.info("Training sklearn LinearSVC baseline …")
    clf = SklearnLinearSVC(max_iter=5000, random_state=42)
    clf.fit(X_train_vec, y_train)
    y_pred = clf.predict(X_test_vec)
    acc = accuracy_score(y_test, y_pred)
    f1  = f1_score(y_test, y_pred)
    log.info(f"Sklearn LinearSVC — Acc: {acc:.4f}  F1: {f1:.4f}")
    return {"accuracy": acc, "f1": f1}


def train_concrete_model(X_train, y_train, X_test, y_test, n_bits):
    log.info(f"[n_bits={n_bits}] Training Concrete ML LinearSVC …")
    model = ConcreteLinearSVC(n_bits=n_bits)
    model.fit(X_train, y_train)

    acc_clear = accuracy_score(y_test, model.predict(X_test))
    log.info(f"Cleartext accuracy: {acc_clear:.4f}")

    log.info("Compiling to TFHE circuit …")
    t0 = time.perf_counter()
    model.compile(X_train)
    compile_time = time.perf_counter() - t0
    log.info(f"Compiled in {compile_time:.2f} s")

    acc_sim = accuracy_score(y_test, model.predict(X_test, fhe="simulate"))
    log.info(f"Simulated FHE accuracy: {acc_sim:.4f}")

    N = 3
    log.info(f"True FHE inference on {N} samples …")
    fhe_times, fhe_preds = [], []
    for i in range(min(N, len(X_test))):
        t0 = time.perf_counter()
        p  = model.predict(X_test[i : i + 1], fhe="execute")
        fhe_times.append(time.perf_counter() - t0)
        fhe_preds.append(int(p[0]))

    lat_mean = float(np.mean(fhe_times))
    acc_fhe  = accuracy_score(y_test[:N], fhe_preds)
    log.info(f"FHE latency: {lat_mean:.2f}s  acc(subset)={acc_fhe:.4f}")

    return {
        "n_bits": n_bits,
        "acc_cleartext": acc_clear, "acc_fhe_simulate": acc_sim,
        "acc_fhe_true_subset": acc_fhe, "fhe_n_samples": N,
        "fhe_latency_mean_s": lat_mean, "compilation_time_s": compile_time,
        "model": model,
    }


def save_artefacts(model, vectorizer, n_bits, max_features):
    FHE_CIRCUIT_DIR.mkdir(parents=True, exist_ok=True)
    FHEModelDev(path_dir=str(FHE_CIRCUIT_DIR), model=model).save()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODELS_DIR / "vectorizer.pkl", "wb") as f:
        pickle.dump(vectorizer, f)
    meta = {
        "tfidf_max_features": max_features,
        "n_bits": n_bits,
        "pipeline": "client: TF-IDF → server: LinearSVC in FHE",
    }
    (MODELS_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    log.info(f"Artefacts saved to {MODELS_DIR}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dataset", choices=["imdb", "sst2"], default="imdb")
    p.add_argument("--max-features", type=int, default=300)
    p.add_argument("--n-bits", type=int, nargs="+", default=[8])
    p.add_argument("--max-train", type=int, default=10000,
                   help="Cap training samples (use 0 for all 25k)")
    p.add_argument("--max-test", type=int, default=2000,
                   help="Cap test samples")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    if args.dataset == "sst2":
        X_train_t, y_train, X_test_t, y_test = load_sst2()
    else:
        cap_tr = args.max_train if args.max_train > 0 else 25000
        cap_te = args.max_test  if args.max_test  > 0 else 25000
        texts, labels = load_imdb(DATASET_DIR, max_train=cap_tr, max_test=cap_te)
        X_train_t, X_test_t, y_train, y_test = train_test_split(
            texts, labels, test_size=0.20, random_state=args.seed, stratify=labels
        )

    vectorizer  = build_tfidf(X_train_t, args.max_features)
    X_train_vec = vectorise(vectorizer, X_train_t)
    X_test_vec  = vectorise(vectorizer, X_test_t)

    sk_metrics = train_sklearn_baseline(X_train_vec, y_train, X_test_vec, y_test)

    all_results = []
    best_model  = None
    save_bits   = max(args.n_bits)

    for nb in args.n_bits:
        r = train_concrete_model(X_train_vec, y_train, X_test_vec, y_test, nb)
        all_results.append(r)
        if nb == save_bits:
            best_model = r["model"]

    save_artefacts(best_model or all_results[-1]["model"], vectorizer, save_bits, args.max_features)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = {
        "module": "sentiment",
        "sklearn_baseline": sk_metrics,
        "concrete_ml_results": [{k: v for k, v in r.items() if k != "model"} for r in all_results],
    }
    (RESULTS_DIR / "sentiment_results.json").write_text(json.dumps(out, indent=2))
    log.info("Done.")


if __name__ == "__main__":
    main()
