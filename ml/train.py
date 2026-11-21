"""Train the v2 model (schedule + weather) on the GPU and compare it with v1.

Usage: python ml/train.py
Inputs:  ml/data/flights.parquet (ml/prepare.py), ml/data/weather/*.parquet (ml/fetch_weather.py)
Outputs: models/v2_model.ubj.gz, models/v2_meta.json, models/v2_metrics.json
"""
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score)

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from clearway_features import (AIRPORT_VARS, FEATURES, NETWORK_COLS, RISK_BANDS, WEATHER_COLS,  # noqa: E402
                               build_features, save_bundle)
from clearway_weather import network_daily, summarize  # noqa: E402

DATA = ROOT / 'ml' / 'data'
WEATHER_DROPOUT = 0.15  # share of training rows with weather hidden, so the model also works without it
SEED = 42


def recorded_weather():
    frames = []
    for path in sorted((DATA / 'weather').glob('*.parquet')):
        w = pd.read_parquet(path)
        w['airport'] = path.stem
        frames.append(w.reset_index())
    return pd.concat(frames, ignore_index=True)


def attach_weather(flights, long=None):
    """long: hourly weather (airport, time, variables); recorded weather by default."""
    weather = summarize(recorded_weather() if long is None else long)
    network = network_daily(weather)
    names = AIRPORT_VARS
    print(f'weather: {weather.airport.nunique()} airports, {len(weather):,} airport-hours')

    dep_time = flights['flight_date'] + pd.to_timedelta(flights['dep_minutes'] // 60, unit='h')
    next_day = (flights['arr_minutes'] < flights['dep_minutes']).astype(int)
    arr_time = (flights['flight_date'] + pd.to_timedelta(next_day, unit='D')
                + pd.to_timedelta(flights['arr_minutes'] // 60, unit='h'))

    for side, airport, when in (('o', 'origin', dep_time), ('d', 'dest', arr_time)):
        keys = pd.DataFrame({'airport': flights[airport].astype(str), 'time': when})
        joined = keys.merge(weather, on=['airport', 'time'], how='left')
        for name in names:
            flights[f'{side}_{name}'] = joined[name].to_numpy(dtype='float32')
    by_day = network.reindex(flights['flight_date'].to_numpy())
    for col in NETWORK_COLS:
        flights[col] = by_day[col].to_numpy(dtype='float32')
    covered = flights['o_temp'].notna().mean()
    print(f'flights with origin weather: {covered:.1%}')
    return flights


def traffic_tables(train):
    days = train['flight_date'].nunique()
    dep = train.groupby([train['origin'].astype(str), train['dep_minutes'] // 60], observed=True).size() / days
    arr = train.groupby([train['dest'].astype(str), train['arr_minutes'] // 60], observed=True).size() / days
    return {'dep': dep.round(2).to_dict(), 'arr': arr.round(2).to_dict()}


def scores(y, p, threshold):
    pred = (p >= threshold).astype(int)
    return {
        'flights': int(len(y)), 'delay_rate': float(y.mean()),
        'roc_auc': float(roc_auc_score(y, p)), 'pr_auc': float(average_precision_score(y, p)),
        'precision': float(precision_score(y, pred, zero_division=0)), 'recall': float(recall_score(y, pred)),
        'f1': float(f1_score(y, pred)), 'accuracy': float(accuracy_score(y, pred)),
        'flagged': float(pred.mean()), 'mean_score': float(p.mean()), 'brier': float(brier_score_loss(y, p)),
    }


def levels(y, p):
    """Per risk level: share of flights, how often they were delayed (precision) and the
    share of all delays they contain (recall). 'high_or_moderate' is everything not Low."""
    out = {}
    for name, m in {'low': p < RISK_BANDS['low'],
                    'moderate': (p >= RISK_BANDS['low']) & (p < RISK_BANDS['high']),
                    'high': p >= RISK_BANDS['high'],
                    'high_or_moderate': p >= RISK_BANDS['low']}.items():
        out[name] = {'share': float(m.mean()), 'delay_rate': float(y[m].mean()) if m.any() else None,
                     'recall': float(y[m].sum() / y.sum())}
    return out


def v1_scores(df, y):
    v1 = joblib.load(ROOT / 'models' / 'v1_gradient_boosting.pkl')
    X = pd.DataFrame({
        'OP_UNIQUE_CARRIER': df['carrier'].astype(str), 'ORIGIN': df['origin'].astype(str),
        'DEST': df['dest'].astype(str), 'DEP_HOUR': df['dep_minutes'] // 60, 'ARR_HOUR': df['arr_minutes'] // 60,
        'DAY_OF_WEEK': df['flight_date'].dt.dayofweek, 'IS_WEEKEND': (df['flight_date'].dt.dayofweek >= 5).astype(int),
        'CRS_ELAPSED_TIME': df['elapsed_time'], 'DISTANCE': df['distance'],
    })
    return scores(y, v1.predict_proba(X)[:, 1], 0.5)


def main():
    t0 = time.time()
    flights = pd.read_parquet(DATA / 'flights.parquet')
    flights = attach_weather(flights)
    train = flights[flights['split'] == 'train']
    bundle = {
        'version': 'v2',
        'categories': {c: sorted(train[c].astype(str).unique()) for c in ['carrier', 'origin', 'dest']},
        'traffic': traffic_tables(train),
    }
    bundle['categories']['route'] = sorted((train['origin'].astype(str) + '-' + train['dest'].astype(str)).unique())

    def xy(part, dropout=0.0):
        df = flights[flights['split'] == part].copy()
        if dropout:
            hide = np.random.default_rng(SEED).random(len(df)) < dropout
            df.loc[hide, WEATHER_COLS] = np.nan
        return build_features(df, bundle), df['delayed'].to_numpy()

    X_train, y_train = xy('train', WEATHER_DROPOUT)
    X_valid, y_valid = xy('valid')
    print(f'train {len(y_train):,} rows ({y_train.mean():.1%} delayed), valid {len(y_valid):,} rows; {time.time() - t0:.0f}s')

    model = xgb.XGBClassifier(
        device='cuda', tree_method='hist', enable_categorical=True, max_cat_to_onehot=1,
        # Conservative settings: deeper trees and many-valued categories (route) overfit early.
        n_estimators=4000, learning_rate=0.03, max_depth=7, min_child_weight=200, max_cat_threshold=32,
        subsample=0.8, colsample_bytree=0.7, reg_lambda=5.0, max_bin=256,
        eval_metric=['logloss', 'aucpr'], early_stopping_rounds=150, random_state=SEED,
    )
    model.fit(X_train, y_train, eval_set=[(X_valid, y_valid)], verbose=250)
    print(f'best iteration {model.best_iteration}; trained in {time.time() - t0:.0f}s')

    # Pick the "elevated risk" cut-off on validation data (best F1), never on test data.
    p_valid = model.predict_proba(X_valid)[:, 1]
    grid = np.arange(0.10, 0.70, 0.01)
    f1s = [f1_score(y_valid, (p_valid >= t).astype(int)) for t in grid]
    bundle['threshold'] = float(round(grid[int(np.argmax(f1s))], 2))
    print(f'threshold {bundle["threshold"]} (valid F1 {max(f1s):.3f})')

    results = {'valid': scores(y_valid, p_valid, bundle['threshold'])}
    test = flights[flights['split'] == 'test']
    sets = {'all_test': test}
    for month, df in test.groupby(test.flight_date.dt.strftime('%Y_%m')):
        sets[month] = df
    for name, df in sets.items():
        y = df['delayed'].to_numpy()
        X = build_features(df, bundle)
        no_wx = X.copy()
        no_wx[WEATHER_COLS] = np.nan
        p_wx, p_no = model.predict_proba(X)[:, 1], model.predict_proba(no_wx)[:, 1]
        results[name] = {
            'v2_with_weather': {**scores(y, p_wx, bundle['threshold']), 'levels': levels(y, p_wx)},
            'v2_without_weather': {**scores(y, p_no, bundle['threshold']), 'levels': levels(y, p_no)},
            'v1': v1_scores(df, y),
        }

    importance = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
    bundle['importance'] = importance.round(4).to_dict()
    save_bundle(ROOT / 'models', model, bundle)
    (ROOT / 'models' / 'v2_metrics.json').write_text(json.dumps(
        {'threshold': bundle['threshold'], 'best_iteration': int(model.best_iteration),
         'importance': bundle['importance'], 'results': results}, indent=2))

    rows = []
    for name, by_model in results.items():
        if name == 'valid':
            continue
        for m, s in by_model.items():
            rows.append({'set': name, 'model': m, **{k: s[k] for k in ['delay_rate', 'roc_auc', 'pr_auc', 'precision', 'recall', 'f1', 'flagged', 'mean_score', 'brier']}})
    table = pd.DataFrame(rows)
    pd.set_option('display.width', 220)
    print(table.round(3).to_string(index=False))
    print('top features:', importance.head(12).round(3).to_dict())
    print(f'done in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
