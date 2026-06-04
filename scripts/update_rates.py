#!/usr/bin/env python3
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT = BASE_DIR / "rates.json"
FRED_API_URL = "https://api.stlouisfed.org/fred/series/observations"
REQUEST_TIMEOUT = 12
MAX_ATTEMPTS = 3
SERIES = {
    "thirtyYear": "MORTGAGE30US",
    "fifteenYear": "MORTGAGE15US",
}


class PermanentFredError(RuntimeError):
    pass


class TransientFredError(RuntimeError):
    pass


def load_existing_rates():
    if not OUTPUT.exists():
        return {}
    return json.loads(OUTPUT.read_text(encoding="utf-8"))


def fred_request(series_id, api_key):
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": 5,
    }
    url = f"{FRED_API_URL}?{urlencode(params)}"
    with urlopen(url, timeout=REQUEST_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def latest_value(series_id, api_key):
    last_error = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            data = fred_request(series_id, api_key)
            for row in data.get("observations", []):
                value = str(row.get("value", "")).strip()
                if value and value != ".":
                    return {"date": row["date"], "rate": float(value)}
            raise PermanentFredError(f"No rate found for {series_id}")
        except HTTPError as error:
            if 400 <= error.code < 500:
                raise PermanentFredError(f"FRED API rejected {series_id}: HTTP {error.code}") from error
            last_error = error
        except Exception as error:
            last_error = error
        if attempt < MAX_ATTEMPTS:
            time.sleep(attempt * 2)
    raise TransientFredError(f"FRED API failed for {series_id}: {last_error}") from last_error


def cached_value(existing, key):
    cached = existing.get(key)
    if cached and cached.get("date") and cached.get("rate"):
        return cached
    return None


def value_for_series(key, api_key, existing):
    try:
        value = latest_value(SERIES[key], api_key)
        print(f"Fetched {key}: {value['rate']} on {value['date']}")
        return value, True
    except TransientFredError as error:
        fallback = cached_value(existing, key)
        if fallback:
            print(f"Warning: {error}. Keeping cached {key}: {fallback['rate']} on {fallback['date']}")
            return fallback, False
        raise


def main():
    api_key = os.environ.get("FRED_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Set the FRED_API_KEY repository secret before running the rate updater.")

    existing = load_existing_rates()
    thirty, fetched_thirty = value_for_series("thirtyYear", api_key, existing)
    fifteen, fetched_fifteen = value_for_series("fifteenYear", api_key, existing)

    if not fetched_thirty and not fetched_fifteen:
        print("FRED was unavailable, but cached rates are still usable. Leaving rates.json unchanged.")
        return

    payload = {
        "source": "Freddie Mac PMMS via FRED API",
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
