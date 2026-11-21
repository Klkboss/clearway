"""Download the weather forecasts that were actually issued 1, 3 and 7 days ahead
for the test months, so the model can be evaluated the way the live app runs it.

Usage: python ml/fetch_forecasts.py
Source: Open-Meteo Previous Runs API (value predicted N x 24 h before each hour).
Same airports as ml/fetch_weather.py; cached per airport in ml/data/forecasts/.
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

DATA = ROOT / 'ml' / 'data'
URL = 'https://previous-runs-api.open-meteo.com/v1/forecast'
START, END = '2026-03-01', '2026-08-31'  # the test months
LEADS = (1, 3, 7)
# Up to 27 variables over 6 months count as ~35 calls each; the free tier allows 600 a
# minute and 5,000 an hour, so a short pause between airports is enough.
PAUSE_SECONDS = 5


def fetch(lat, lon, variables):
    hourly = [f'{v}_previous_day{d}' for d in LEADS for v in variables]
    r = requests.get(URL, params={'latitude': lat, 'longitude': lon, 'start_date': START, 'end_date': END,
                                  'hourly': ','.join(hourly), 'timezone': 'auto'}, timeout=120)
    r.raise_for_status()
    h = pd.DataFrame(r.json()['hourly'])
    h['time'] = pd.to_datetime(h['time'])
    # temperature_2m_previous_day3 -> temp_d3
    h = h.rename(columns={f'{v}_previous_day{d}': f'{WEATHER_VARS[v]}_d{d}'
                          for d in LEADS for v in variables})
    return h.set_index('time').astype('float32')


def main():
    coords = json.loads((ROOT / 'models' / 'airports.json').read_text())
    codes = sorted(p.stem for p in (DATA / 'weather').glob('*.parquet'))
    out = DATA / 'forecasts'
    out.mkdir(exist_ok=True)
    for i, code in enumerate(codes, 1):
        path = out / f'{code}.parquet'
        have = pd.read_parquet(path) if path.exists() else None
        # Only the variables this airport's file is missing (e.g. after adding one).
        needed = [v for v, short in WEATHER_VARS.items() if have is None or f'{short}_d{LEADS[0]}' not in have]
        if not needed:
            continue
        for attempt in range(8):
            try:
                frame = fetch(*coords[code], needed)
                have = frame if have is None else have.join(frame, how='left')
                have.to_parquet(path)
                print(f'[{i}/{len(codes)}] {code}: {", ".join(needed)} ({len(frame):,} hours)', flush=True)
                break
            except requests.HTTPError as e:
                wait = 65 if e.response is not None and e.response.status_code == 429 else 15
                print(f'[{i}/{len(codes)}] {code}: {e}; retrying in {wait}s', flush=True)
                time.sleep(wait)
            except requests.RequestException as e:
                print(f'[{i}/{len(codes)}] {code}: {type(e).__name__}; retrying in 15s', flush=True)
                time.sleep(15)
        time.sleep(PAUSE_SECONDS)
    want = [f'{short}_d{d}' for short in WEATHER_VARS.values() for d in LEADS]
    done = sum(all(c in pd.read_parquet(p).columns for c in want) for p in out.glob('*.parquet'))
    print(f'ALL DONE: {done}/{len(codes)} airports' if done == len(codes) else f'INCOMPLETE: {done}/{len(codes)}; run again')


if __name__ == '__main__':
    main()
