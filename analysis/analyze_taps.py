"""
Analyse the NFC tap experiment (docs/PLAN.md §8) from the CSV exported by the host app
(Experiment tab -> "Export tap CSV", i.e. GET /api/v1/telemetry/taps.csv).

    python analyze_taps.py data/tap_events.csv [--notifications data/notifications.csv] [--out results]

Outputs (in --out):
  summary_by_condition.csv  first-attempt read rate and latency per condition (mean ± SD across runs)
  summary_by_run.csv        the same per run, so the spread between repetitions is visible
  failures.csv              failure outcomes/details per condition
  latency_boxplot.png       t_total_ms of successful reads per condition
  read_rate.png             read rate per condition (mean of runs, error bars = SD across runs)
  reminder_delay.csv        (optional) FCM reminder delivery delay per phone model
"""
import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

READ_OK = {"OK", "DUPLICATE"}  # the phone was read and verified (DUPLICATE = already marked earlier)
STAGES = ["t_select_ms", "t_auth_ms", "t_verify_ms", "t_total_ms"]


def load_taps(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df[df["purpose"] == "ATTEND"].copy()
    df = df[df["runId"].notna()]  # only taps recorded in experiment mode
    df["read"] = df["outcome"].isin(READ_OK)
    df["condition"] = df["screenState"].fillna("?")
    if df["studentPhone"].notna().any():
        df["condition"] = df["studentPhone"].fillna("?") + " | " + df["condition"]
    return df


def summarise(df: pd.DataFrame, out: Path) -> pd.DataFrame:
    per_run = (
        df.groupby(["condition", "runId"])
        .agg(
            taps=("read", "size"),
            read_rate=("read", "mean"),
            **{f"{s}_mean": (s, "mean") for s in STAGES},
        )
        .reset_index()
    )
    # Latency only over successful reads.
    ok = df[df["read"]]
    lat = ok.groupby(["condition", "runId"])[STAGES].mean().add_suffix("_ok_mean").reset_index()
    per_run = per_run.merge(lat, on=["condition", "runId"], how="left")
    per_run.to_csv(out / "summary_by_run.csv", index=False)

    by_cond = per_run.groupby("condition").agg(
        runs=("runId", "nunique"),
        taps=("taps", "sum"),
        read_rate_mean=("read_rate", "mean"),
        read_rate_sd=("read_rate", "std"),
        t_total_ms_mean=("t_total_ms_ok_mean", "mean"),
        t_total_ms_sd=("t_total_ms_ok_mean", "std"),
        t_auth_ms_mean=("t_auth_ms_ok_mean", "mean"),
        t_select_ms_mean=("t_select_ms_ok_mean", "mean"),
        t_verify_ms_mean=("t_verify_ms_ok_mean", "mean"),
    )
    by_cond.to_csv(out / "summary_by_condition.csv")

    failures = (
        df[~df["read"]]
        .groupby(["condition", "outcome", "error_detail"], dropna=False)
        .size()
        .rename("count")
        .reset_index()
    )
    failures.to_csv(out / "failures.csv", index=False)
    return by_cond


def plot(df: pd.DataFrame, by_cond: pd.DataFrame, out: Path) -> None:
    conds = list(by_cond.index)
    ok = df[df["read"]]

    fig, ax = plt.subplots(figsize=(max(6, 1.6 * len(conds)), 4))
    ax.boxplot([ok.loc[ok["condition"] == c, "t_total_ms"].dropna() for c in conds], showfliers=True)
    ax.set_xticks(range(1, len(conds) + 1), conds, rotation=20, ha="right")
    ax.set_ylabel("Tap to verdict (ms)")
    ax.set_title("Read latency of successful taps")
    ax.grid(axis="y", linewidth=0.5, alpha=0.4)
    fig.tight_layout()
    fig.savefig(out / "latency_boxplot.png", dpi=200)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(max(6, 1.6 * len(conds)), 4))
    ax.bar(conds, 100 * by_cond["read_rate_mean"], yerr=100 * by_cond["read_rate_sd"].fillna(0), capsize=4, color="#2a78d6", width=0.5)
    ax.set_ylabel("First-attempt read rate (%)")
    ax.set_ylim(0, 105)
    ax.set_title("Read rate per condition (mean of runs, bars = SD)")
    plt.setp(ax.get_xticklabels(), rotation=20, ha="right")
    ax.grid(axis="y", linewidth=0.5, alpha=0.4)
    fig.tight_layout()
    fig.savefig(out / "read_rate.png", dpi=200)
    plt.close(fig)


def reminders(path: Path, out: Path) -> None:
    n = pd.read_csv(path)
    n = n[n["kind"] == "REMINDER_30"]
    summary = n.groupby("device_model").agg(
        sent=("sent_at", "count"),
        received=("received_at", "count"),
        delivery_delay_ms_mean=("delivery_delay_ms", "mean"),
        delivery_delay_ms_sd=("delivery_delay_ms", "std"),
        delivery_delay_ms_max=("delivery_delay_ms", "max"),
    )
    summary.to_csv(out / "reminder_delay.csv")
    print("\nReminder delivery delay\n", summary.to_string())


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("taps", type=Path)
    ap.add_argument("--notifications", type=Path)
    ap.add_argument("--out", type=Path, default=Path("results"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    df = load_taps(args.taps)
    if df.empty:
        raise SystemExit("No experiment-mode ATTEND taps in this file (turn on experiment mode in the host app).")
    by_cond = summarise(df, args.out)
    plot(df, by_cond, args.out)
    print(by_cond.round(1).to_string())
    if args.notifications:
        reminders(args.notifications, args.out)
    print(f"\nWrote results to {args.out}/")


if __name__ == "__main__":
    main()
