"""Hourly weather from Open-Meteo (free, no API key), shared by training and serving.

Times come back in each airport's local time zone, matching the local scheduled
times in the BTS data and on the ticket. summarize() and network_daily() are the
single definition of the derived weather features, used by both sides.
"""
from datetime import date, timedelta
from functools import lru_cache

import pandas as pd
import requests

from clearway_features import AIRPORT_VARS, HUBS, NETWORK_COLS, WEATHER_VARS

ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
# Archived forecast-model output, for training variables the ERA5 archive lacks (such as
# CAPE). None are used at present; list a variable here to fetch it from this source.
HIST_FORECAST_URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast'
FROM_FORECAST_ARCHIVE = []
# Tested on real past forecasts (ml/evaluate_forecasts.py): 1-3 days ahead they help almost as much
# as the weather that happened; 7 days ahead they add nothing. Further out, use the schedule alone.
FORECAST_DAYS_AHEAD = 5
ARCHIVE_LAG_DAYS = 5       # the archive trails today by a few days


def _get(lat, lon, start, end, archive, timeout, variables=WEATHER_VARS, url=None):
    response = requests.get(
        url or (ARCHIVE_URL if archive else FORECAST_URL),
        params={
            'latitude': lat, 'longitude': lon, 'start_date': start, 'end_date': end,
            'hourly': ','.join(variables), 'timezone': 'auto',
        },
        timeout=timeout,
    )
    response.raise_for_status()
    body = response.json()
    return body if isinstance(body, list) else [body]  # several locations -> a list


def _frame(body):
    hourly = pd.DataFrame(body['hourly'])
    hourly['time'] = pd.to_datetime(hourly['time'])
    # A variable a source doesn't have comes back as nulls; keep it numeric (NaN).
    hourly = hourly.rename(columns=WEATHER_VARS)
    return hourly.astype({v: 'float64' for v in WEATHER_VARS.values() if v in hourly})


def fetch_hourly(lat, lon, start, end, archive, timeout=30, variables=WEATHER_VARS, url=None):
    """Hourly weather between two ISO dates for one place, indexed by local time."""
    return _frame(_get(lat, lon, start, end, archive, timeout, variables, url)[0]).set_index('time')


def summarize(long):
    """long: columns airport, time and the hourly variables. Adds, per airport-day:
    day_precip, day_snow (totals), day_gust_max, and prev3_precip (rain in the
    3 hours up to and including this hour, within the same day)."""
    h = long.sort_values(['airport', 'time']).reset_index(drop=True)
    keys = [h['airport'], h['time'].dt.floor('D')]
    g = h.groupby(keys)
    h['day_precip'] = g['precip'].transform('sum')
    h['day_snow'] = g['snow'].transform('sum')
    h['day_gust_max'] = g['gust'].transform('max')
    running = g['precip'].cumsum()
    h['prev3_precip'] = running - running.groupby(keys).shift(3).fillna(0)
    return h


def network_daily(summary):
    """Mean daily rain, snow and peak gust across the HUBS, indexed by date."""
    hubs = summary[summary['airport'].isin(HUBS)]
    per_hub = hubs.groupby(['airport', hubs['time'].dt.floor('D')])[['day_precip', 'day_snow', 'day_gust_max']].first()
    net = per_hub.groupby(level=1).mean()
    net.columns = NETWORK_COLS
    return net


@lru_cache(maxsize=512)
def _airport_day(code, lat, lon, day_iso, archive):
    # One airport-day per request; cached so repeat checks don't call the API again.
    hourly = _frame(_get(lat, lon, day_iso, day_iso, archive, timeout=10)[0])
    hourly['airport'] = code
    return summarize(hourly)


@lru_cache(maxsize=64)
def _network_day(hub_coords, day_iso, archive):
    # All hubs in one multi-location request, then the same summaries as training.
    lats = ','.join(str(lat) for _, lat, _ in hub_coords)
    lons = ','.join(str(lon) for _, _, lon in hub_coords)
    frames = []
    for (code, _, _), body in zip(hub_coords, _get(lats, lons, day_iso, day_iso, archive, timeout=15)):
        f = _frame(body)
        f['airport'] = code
        frames.append(f)
    return network_daily(summarize(pd.concat(frames)))


def weather_for_flight(airports, origin, dest, flight_date, dep_minutes, arr_minutes, today=None):
    """Returns (weather feature values, source) where source is 'forecast',
    'historical' or 'unavailable'. Never raises: on any problem the model simply
    gets no weather and falls back to schedule-only behaviour."""
    today = today or date.today()
    ahead = (flight_date - today).days
    if ahead > FORECAST_DAYS_AHEAD or origin not in airports or dest not in airports:
        return {}, 'unavailable'
    archive = ahead < -ARCHIVE_LAG_DAYS
    arr_date = flight_date + timedelta(days=1) if arr_minutes < dep_minutes else flight_date
    try:
        values = {}
        for side, code, day, minutes in (('o', origin, flight_date, dep_minutes), ('d', dest, arr_date, arr_minutes)):
            hourly = _airport_day(code, *airports[code], day.isoformat(), archive)
            # Match by timestamp, not position: daylight-saving days have 23 or 25 hours.
            when = pd.Timestamp(day) + pd.Timedelta(hours=minutes // 60)
            row = hourly.iloc[hourly['time'].searchsorted(when).clip(0, len(hourly) - 1)]
            values.update({f'{side}_{name}': row[name] for name in AIRPORT_VARS})
        hub_coords = tuple((c, *airports[c]) for c in HUBS if c in airports)
        values.update(_network_day(hub_coords, flight_date.isoformat(), archive).iloc[0].to_dict())
    except (requests.RequestException, KeyError, IndexError, ValueError):
        return {}, 'unavailable'
    return values, 'historical' if archive else 'forecast'
