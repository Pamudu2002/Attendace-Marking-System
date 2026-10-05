# Experiment analysis

1. In the host app, turn on **Experiment mode**, set the run ID and conditions, and run check-ins.
2. Export the raw data: Experiment tab → *Export tap CSV* (and *Export reminder-delay CSV*), or from the API:
   `GET /api/v1/telemetry/taps.csv`, `GET /api/v1/telemetry/notifications.csv`.
3. Put the files in `analysis/data/` (raw CSVs are git-ignored; add them to the data package instead).
4. Run:

```bash
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python analyze_taps.py data/tap_events.csv --notifications data/notifications.csv --out results
```

Ground truth comes from the tester: a fixed number of deliberate taps per run (e.g. 20, one every ~5 s,
counted by an observer). Compare the number of logged taps with that count; taps the reader never detected
do not appear in the log at all, so report them as misses.
