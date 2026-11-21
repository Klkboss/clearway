"""Feature engineering shared by training (ml/train.py) and serving (app.py).

Both sides call build_features() on the same columns, so a flight is turned into
model inputs exactly the same way in both places.
"""
import gzip
import json

import numpy as np
import pandas as pd
import xgboost as xgb
from pandas.tseries.holiday import USFederalHolidayCalendar

# Hourly weather variables (Open-Meteo names) and their short feature names.
WEATHER_VARS = {
    'temperature_2m': 'temp',
    'precipitation': 'precip',
    'snowfall': 'snow',
    'wind_speed_10m': 'wind',
    'wind_gusts_10m': 'gust',
    'cloud_cover': 'cloud',
    'weather_code': 'code',
}
# Humidity and CAPE (thunderstorm energy) were tried on 2026-11-21: better with hindsight
# weather, but no better with 3-day forecasts, so not used (backups/v2-47-features-rejected).
# Per-airport daily summaries (see clearway_weather.summarize).
DAILY_VARS = ['day_precip', 'day_snow', 'day_gust_max', 'prev3_precip']
AIRPORT_VARS = [*WEATHER_VARS.values(), *DAILY_VARS]
# Delays ripple through the network, so bad weather at the big hubs matters everywhere.
HUBS = ['ATL', 'DFW', 'DEN', 'ORD', 'LAX', 'CLT', 'LAS', 'PHX', 'MCO', 'SEA',
        'MIA', 'IAH', 'JFK', 'EWR', 'SFO', 'BOS', 'MSP', 'DTW', 'LGA', 'PHL']
NETWORK_COLS = ['net_precip', 'net_snow', 'net_gust']
WEATHER_COLS = [f'{side}_{name}' for side in ('o', 'd') for name in AIRPORT_VARS] + NETWORK_COLS

CATEGORICAL = ['carrier', 'origin', 'dest', 'route']
NUMERIC = [
    'dep_hour', 'arr_hour', 'dep_minute_of_day', 'day_of_week', 'is_weekend', 'month',
    'day_of_month', 'days_to_holiday', 'elapsed_time', 'distance',
    'origin_dep_traffic', 'dest_arr_traffic', *WEATHER_COLS,
]
FEATURES = CATEGORICAL + NUMERIC

_HOLIDAYS = USFederalHolidayCalendar().holidays('2015-01-01', '2035-12-31')


def hhmm_to_minutes(value):
    """'18:30', 1830 or '1830' -> minutes after midnight (2400 counts as 0)."""
    if isinstance(value, str) and ':' in value:
        h, m = value.split(':')
        return (int(h) * 60 + int(m)) % 1440
    v = int(value)
    return ((v // 100) * 60 + v % 100) % 1440


def days_to_holiday(dates: pd.Series) -> np.ndarray:
    """Days to the nearest U.S. federal holiday, capped at 15."""
    d = dates.to_numpy(dtype='datetime64[D]')
    h = _HOLIDAYS.to_numpy(dtype='datetime64[D]')
    idx = np.clip(np.searchsorted(h, d), 1, len(h) - 1)
    gap = np.minimum(np.abs((d - h[idx - 1]).astype(int)), np.abs((h[idx] - d).astype(int)))
    return np.minimum(gap, 15)


def build_features(flights: pd.DataFrame, bundle: dict) -> pd.DataFrame:
    """flights columns: carrier, origin, dest, flight_date (datetime64), dep_minutes,
    arr_minutes, elapsed_time, distance, plus the WEATHER_COLS (NaN when unknown).
    bundle: 'categories' {col: list} and 'traffic' {'dep': {(airport, hour): n}, 'arr': ...}."""
    f = pd.DataFrame(index=flights.index)
    f['carrier'] = flights['carrier'].str.upper()
    f['origin'] = flights['origin'].str.upper()
    f['dest'] = flights['dest'].str.upper()
    f['route'] = f['origin'] + '-' + f['dest']
    for col in CATEGORICAL:
        # Unknown codes become missing, which the model handles, rather than an error.
        f[col] = pd.Categorical(f[col], categories=bundle['categories'][col])

    date = pd.to_datetime(flights['flight_date'])
    f['dep_hour'] = flights['dep_minutes'] // 60
    f['arr_hour'] = flights['arr_minutes'] // 60
    f['dep_minute_of_day'] = flights['dep_minutes']
    f['day_of_week'] = date.dt.dayofweek          # 0 = Monday
    f['is_weekend'] = (f['day_of_week'] >= 5).astype(int)
    f['month'] = date.dt.month
    f['day_of_month'] = date.dt.day
    f['days_to_holiday'] = days_to_holiday(date)
    f['elapsed_time'] = flights['elapsed_time'].astype(float)
    f['distance'] = flights['distance'].astype(float)

    dep, arr = bundle['traffic']['dep'], bundle['traffic']['arr']
    f['origin_dep_traffic'] = [dep.get((o, h), 0.0) for o, h in zip(f['origin'].astype(str), f['dep_hour'])]
    f['dest_arr_traffic'] = [arr.get((d, h), 0.0) for d, h in zip(f['dest'].astype(str), f['arr_hour'])]

    for col in WEATHER_COLS:
        f[col] = flights[col].astype(float) if col in flights else np.nan
    return f[FEATURES]


# Risk levels shown to users. The test-period delay rate is about 25%, so Low is clearly
# below a typical flight and High is about 1.5x typical or more.
RISK_BANDS = {'low': 0.15, 'high': 0.35}


def risk_level(probability):
    if probability < RISK_BANDS['low']:
        return 'low'
    return 'high' if probability >= RISK_BANDS['high'] else 'moderate'


# Features grouped into the plain-language factors used to explain a score.
FACTORS = {
    'time': ['dep_hour', 'arr_hour', 'dep_minute_of_day'],
    'day': ['day_of_week', 'is_weekend'],
    'season': ['month', 'day_of_month', 'days_to_holiday'],
    'airline': ['carrier'],
    'route': ['origin', 'dest', 'route', 'elapsed_time', 'distance'],
    'traffic': ['origin_dep_traffic', 'dest_arr_traffic'],
    'origin_weather': [f'o_{n}' for n in AIRPORT_VARS],
    'dest_weather': [f'd_{n}' for n in AIRPORT_VARS],
    'network_weather': NETWORK_COLS,
}


# The trained model is saved in XGBoost's own format plus a JSON file of what
# build_features() needs, so serving needs neither pickle nor scikit-learn.
MODEL_FILE, META_FILE = 'v2_model.ubj.gz', 'v2_meta.json'  # gzip: about 110 MB raw, over GitHub's 100 MB file limit


def save_bundle(models_dir, model, bundle):
    """model: a fitted XGBClassifier; bundle: 'categories', 'traffic', 'threshold'."""
    # Keep only the trees up to the best early-stopping round: the ones predict_proba used.
    booster = model.get_booster()[: model.best_iteration + 1]
    (models_dir / MODEL_FILE).write_bytes(gzip.compress(booster.save_raw('ubj'), mtime=0))
    traffic = {side: [[a, h, n] for (a, h), n in table.items()] for side, table in bundle['traffic'].items()}
    meta = {'threshold': bundle['threshold'], 'features': FEATURES,
            'categories': bundle['categories'], 'traffic': traffic}
    (models_dir / META_FILE).write_text(json.dumps(meta))


def load_bundle(models_dir):
    """The saved model as a dict: 'model' (xgboost Booster), 'threshold', 'categories', 'traffic'."""
    bundle = json.loads((models_dir / META_FILE).read_text())
    if bundle['features'] != FEATURES:
        raise ValueError('Saved model was trained on different features; retrain with ml/train.py.')
    bundle['traffic'] = {side: {(a, h): n for a, h, n in rows} for side, rows in bundle['traffic'].items()}
    bundle['model'] = xgb.Booster()
    bundle['model'].load_model(bytearray(gzip.decompress((models_dir / MODEL_FILE).read_bytes())))
    bundle['model'].set_param({'device': 'cpu'})  # trained on a GPU; scoring works on any CPU
    return bundle


def predict(bundle, features, **kwargs):
    """Delay probabilities for rows from build_features() (kwargs pass through, e.g. pred_contribs)."""
    return bundle['model'].predict(xgb.DMatrix(features, enable_categorical=True), **kwargs)
