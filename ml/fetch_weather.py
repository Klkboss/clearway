"""Download hourly historical weather for the busiest airports, and write
models/airports.json (IATA -> [lat, lon]) for serving.

Usage: python ml/fetch_weather.py [max_airports=150]
Open-Meteo's free tier is rate limited, so requests are paced and results cached
per airport in ml/data/weather/; re-running only fetches the airports and variables
that are missing (so adding a variable to WEATHER_VARS fetches just that variable).
"""
import json
import sys
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from clearway_features import WEATHER_VARS  # noqa: E402
from clearway_weather import ARCHIVE_URL, FROM_FORECAST_ARCHIVE, HIST_FORECAST_URL, fetch_hourly  # noqa: E402

SOURCES = [
    (ARCHIVE_URL, [v for v in WEATHER_VARS if v not in FROM_FORECAST_ARCHIVE]),
    (HIST_FORECAST_URL, FROM_FORECAST_ARCHIVE),
]

DATA = ROOT / 'ml' / 'data'
START, END = '2025-01-01', '2026-08-31'
# The free tier counts a long request as several calls (about 44 for this range) and
# allows 5,000 per hour, so one airport every ~33 s keeps us under the hourly limit.
PAUSE_SECONDS = 33


def main(max_airports):
    flights = pd.read_parquet(DATA / 'flights.parquet', columns=['origin', 'dest'])
    counts = (flights['origin'].astype(str).value_counts()
              .add(flights['dest'].astype(str).value_counts(), fill_value=0)
              .sort_values(ascending=False))

    ref = pd.read_csv(DATA / 'raw' / 'airports.csv', usecols=['iata_code', 'latitude_deg', 'longitude_deg', 'type'])
    ref = ref.dropna(subset=['iata_code'])
    # Prefer real airports when an IATA code is reused by a heliport or closed field.
    ref = ref.sort_values('type', key=lambda s: ~s.isin(['large_airport', 'medium_airport'])).drop_duplicates('iata_code')
    coords = {r.iata_code: [round(r.latitude_deg, 4), round(r.longitude_deg, 4)] for r in ref.itertuples()}
    # Codes renamed in OurAirports but still used by BTS (Palm Beach was relabelled DJT).
    for bts_code, new_code in {'PBI': 'DJT'}.items():
        coords.setdefault(bts_code, coords.get(new_code))
    coords = {k: v for k, v in coords.items() if v}

    used = {code: coords[code] for code in counts.index if code in coords}
    missing = [code for code in counts.index if code not in coords]
    (ROOT / 'models').mkdir(exist_ok=True)
    (ROOT / 'models' / 'airports.json').write_text(json.dumps(used, indent=0, sort_keys=True))
    print(f'{len(used)} airports with coordinates; missing: {missing or "none"}')

    top = [code for code in counts.index if code in coords][:max_airports]
    share = counts[top].sum() / counts.sum()
    print(f'fetching weather for {len(top)} airports covering {share:.1%} of flight endpoints')

    out = DATA / 'weather'
    out.mkdir(exist_ok=True)
    complete = 0
    for i, code in enumerate(top, 1):
        path = out / f'{code}.parquet'
        have = pd.read_parquet(path) if path.exists() else None
        for url, names in SOURCES:
            needed = [v for v in names if have is None or WEATHER_VARS[v] not in have]
            if not needed:
                continue
            for attempt in range(6):
                try:
                    hourly = fetch_hourly(*coords[code], START, END, archive=True, timeout=120,
                                          variables=needed, url=url).astype('float32')
                    have = hourly if have is None else have.join(hourly, how='left')
                    have.to_parquet(path)
                    print(f'[{i}/{len(top)}] {code}: {", ".join(needed)} ({len(hourly):,} hours)', flush=True)
                    break
                except requests.HTTPError as e:
                    wait = 65 if e.response is not None and e.response.status_code == 429 else 10
                    print(f'[{i}/{len(top)}] {code}: {e}; retrying in {wait}s', flush=True)
                    time.sleep(wait)
                except requests.RequestException as e:
                    print(f'[{i}/{len(top)}] {code}: {type(e).__name__}; retrying in 10s', flush=True)
                    time.sleep(10)
            time.sleep(PAUSE_SECONDS)
        complete += have is not None and all(c in have for c in WEATHER_VARS.values())
    print(f'ALL DONE: {complete}/{len(top)} airports' if complete == len(top) else f'INCOMPLETE: {complete}/{len(top)}; run again')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 150)
