"""Evaluate the trained v2 model the way the live app runs it: with the weather
forecasts that were really available 1, 3 and 7 days before each test flight,
instead of the weather that actually happened. Also measures the risk levels.

Usage: python ml/evaluate_forecasts.py
Inputs:  models/v2_model.ubj.gz and v2_meta.json, ml/data/flights.parquet, ml/data/weather/, ml/data/forecasts/
Output:  models/v2_forecast_eval.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'ml')]
from clearway_features import WEATHER_COLS, WEATHER_VARS, build_features, load_bundle, predict  # noqa: E402
from train import DATA, attach_weather, levels, scores  # noqa: E402

LEADS = (1, 3, 7)


def forecast_weather(lead):
    """Hourly forecasts issued `lead` days ahead, in the same shape as recorded weather."""
    frames = []
    for path in sorted((DATA / 'forecasts').glob('*.parquet')):
        f = pd.read_parquet(path)
        f = f[[f'{short}_d{lead}' for short in WEATHER_VARS.values()]]
        f.columns = list(WEATHER_VARS.values())
        f['airport'] = path.stem
        frames.append(f.reset_index())
    return pd.concat(frames, ignore_index=True)


def main():
    bundle = load_bundle(ROOT / 'models')
    threshold = bundle['threshold']
    flights = pd.read_parquet(DATA / 'flights.parquet')
    test = flights[flights['split'] == 'test'].reset_index(drop=True)
    y = test['delayed'].to_numpy()
    n_forecast = len(list((DATA / 'forecasts').glob('*.parquet')))
    print(f'{len(test):,} test flights; forecasts for {n_forecast} airports')

    results = {}

    def run(name, df):
        X = build_features(df, bundle)
        p = predict(bundle, X)
        results[name] = {**scores(y, p, threshold), 'levels': levels(y, p)}
        print(f'{name}: ROC-AUC {results[name]["roc_auc"]:.4f}, PR-AUC {results[name]["pr_auc"]:.4f}', flush=True)

    run('recorded_weather', attach_weather(test.copy()))
    for lead in LEADS:
        run(f'forecast_{lead}d', attach_weather(test.copy(), forecast_weather(lead)))
    no_wx = test.copy()
    no_wx[WEATHER_COLS] = np.nan
    run('schedule_only', no_wx)

    (ROOT / 'models' / 'v2_forecast_eval.json').write_text(json.dumps(
        {'forecast_airports': n_forecast, 'threshold': threshold, 'results': results}, indent=2))

    keys = ['roc_auc', 'pr_auc', 'precision', 'recall', 'f1', 'brier', 'mean_score']
    table = pd.DataFrame({name: {k: r[k] for k in keys} for name, r in results.items()}).T
    print(table.round(4).to_string())
    for name, r in results.items():
        print(name, {lv: {k: round(x, 3) for k, x in v.items() if x is not None} for lv, v in r['levels'].items()})


if __name__ == '__main__':
    main()
