"""Clean BTS monthly files into ml/data/flights.parquet.

Usage: python ml/prepare.py [file pattern, default '20*_*.zip']
Splits: train = all of 2025, valid = Jan-Feb 2026 (early stopping, threshold),
        test = Mar-Aug 2026 (never seen in training, newest data).
"""
import glob
import re
import sys
import zipfile
from pathlib import Path

import pandas as pd

DATA = Path(__file__).parent / 'data'
COLS = ['FlightDate', 'Reporting_Airline', 'Origin', 'Dest', 'CRSDepTime', 'CRSArrTime',
        'DepDelay', 'Cancelled', 'CRSElapsedTime', 'Distance']


def split_of(year, month):
    if year == 2025:
        return 'train'
    return 'valid' if month <= 2 else 'test'


def read_month(path):
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith('.csv'))
        with z.open(name) as f:
            df = pd.read_csv(f, usecols=COLS)
    raw = len(df)
    # Same cleaning as the original project: drop missing departure delay, duplicates, cancellations.
    df = df.dropna(subset=['DepDelay']).drop_duplicates()
    df = df[df['Cancelled'] == 0].dropna(subset=['CRSElapsedTime', 'Distance'])
    out = pd.DataFrame({
        'flight_date': pd.to_datetime(df['FlightDate']),
        'carrier': df['Reporting_Airline'].astype(str),
        'origin': df['Origin'].astype(str),
        'dest': df['Dest'].astype(str),
        'dep_minutes': ((df['CRSDepTime'] // 100) * 60 + df['CRSDepTime'] % 100) % 1440,
        'arr_minutes': ((df['CRSArrTime'] // 100) * 60 + df['CRSArrTime'] % 100) % 1440,
        'elapsed_time': df['CRSElapsedTime'].astype('float32'),
        'distance': df['Distance'].astype('float32'),
        'delayed': (df['DepDelay'] >= 15).astype('int8'),
    })
    return out, raw


def main(pattern):
    frames = []
    for path in sorted(glob.glob(str(DATA / 'raw' / pattern))):
        year, month = map(int, re.search(r'(\d{4})_(\d+)\.zip$', path).groups())
        df, raw = read_month(path)
        df['split'] = split_of(year, month)
        frames.append(df)
        print(f'{year}-{month:02d}: {raw:,} raw -> {len(df):,} clean, {df.delayed.mean():.1%} delayed, {df.split.iloc[0]}')
    flights = pd.concat(frames, ignore_index=True)
    for col in ['carrier', 'origin', 'dest', 'split']:
        flights[col] = flights[col].astype('category')
    flights.to_parquet(DATA / 'flights.parquet', index=False)
    print(f'saved {len(flights):,} flights')
    print(flights.groupby('split', observed=True)['delayed'].agg(['size', 'mean']))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '20*_*.zip')
