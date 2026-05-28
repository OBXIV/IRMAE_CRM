#!/usr/bin/env python3
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT = BASE_DIR / "rates.json"
SERIES = {
    "thirtyYear": "MORTGAGE30US",
    "fifteenYear": "MORTGAGE15US",
}


def latest_value(series_id):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    with urlopen(url, timeout=30) as response:
        rows = list(csv.DictReader(line.decode("utf-8") for line in response.readlines()))
    for row in reversed(rows):
        value = row.get(series_id, "").strip()
        if value and value != ".":
            return {"date": row["observation_date"], "rate": float(value)}
    raise RuntimeError(f"No rate found for {series_id}")


def main():
    thirty = latest_value(SERIES["thirtyYear"])
    fifteen = latest_value(SERIES["fifteenYear"])
    payload = {
        "source": "Freddie Mac PMMS via FRED",
        "sourceUrl": "https://fred.stlouisfed.org/series/MORTGAGE30US",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "thirtyYear": thirty,
        "fifteenYear": fifteen,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
