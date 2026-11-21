"""Run with: python -m unittest test_features"""
import unittest

import numpy as np
import pandas as pd

from clearway_features import FACTORS, FEATURES, build_features, days_to_holiday, hhmm_to_minutes, risk_level

BUNDLE = {
    'categories': {'carrier': ['DL'], 'origin': ['ATL'], 'dest': ['JFK'], 'route': ['ATL-JFK']},
    'traffic': {'dep': {('ATL', 18): 42.0}, 'arr': {('JFK', 20): 30.0}},
}


def flight(**kw):
    row = dict(carrier='dl', origin='ATL', dest='JFK', flight_date=pd.Timestamp('2025-01-20'),
               dep_minutes=18 * 60 + 30, arr_minutes=20 * 60 + 30, elapsed_time=120, distance=760)
    row.update(kw)
    return pd.DataFrame([row])


class FeatureTests(unittest.TestCase):
    def test_time_parsing(self):
        self.assertEqual(hhmm_to_minutes('18:30'), 1110)
        self.assertEqual(hhmm_to_minutes(1830), 1110)
        self.assertEqual(hhmm_to_minutes(2400), 0)

    def test_days_to_holiday(self):
        # MLK Day 2025 is Monday 20 January
        got = days_to_holiday(pd.Series(pd.to_datetime(['2025-01-20', '2025-01-15', '2025-03-15'])))
        self.assertEqual(list(got), [0, 5, 15])

    def test_schedule_features(self):
        f = build_features(flight(), BUNDLE)
        self.assertEqual(list(f.columns), FEATURES)
        row = f.iloc[0]
        self.assertEqual(row['carrier'], 'DL')
        self.assertEqual(row['route'], 'ATL-JFK')
        self.assertEqual(row['day_of_week'], 0)  # Monday
        self.assertEqual(row['dep_hour'], 18)
        self.assertEqual(row['origin_dep_traffic'], 42.0)
        self.assertEqual(row['dest_arr_traffic'], 30.0)

    def test_unknown_codes_and_missing_weather_become_missing(self):
        f = build_features(flight(carrier='ZZ', origin='XYZ'), BUNDLE)
        self.assertTrue(pd.isna(f.iloc[0]['carrier']))
        self.assertTrue(pd.isna(f.iloc[0]['origin']))
        self.assertEqual(f.iloc[0]['origin_dep_traffic'], 0.0)
        self.assertTrue(np.isnan(f.iloc[0]['o_precip']))

    def test_every_feature_belongs_to_exactly_one_factor(self):
        grouped = [n for names in FACTORS.values() for n in names]
        self.assertEqual(sorted(grouped), sorted(FEATURES))

    def test_risk_levels(self):
        self.assertEqual([risk_level(p) for p in (0.0, 0.149, 0.15, 0.349, 0.35, 1.0)],
                         ['low', 'low', 'moderate', 'moderate', 'high', 'high'])


class WeatherSummaryTests(unittest.TestCase):
    def test_daily_totals_and_three_hour_rain(self):
        from clearway_weather import summarize
        hours = pd.date_range('2025-01-15 00:00', periods=26, freq='h')  # crosses into the next day
        long = pd.DataFrame({'airport': 'ATL', 'time': hours, 'precip': 1.0, 'snow': 0.0,
                             'gust': range(26)})
        s = summarize(long).set_index('time')
        self.assertEqual(s.loc['2025-01-15 05:00', 'day_precip'], 24.0)
        self.assertEqual(s.loc['2025-01-15 05:00', 'day_gust_max'], 23)
        self.assertEqual(s.loc['2025-01-15 01:00', 'prev3_precip'], 2.0)   # only 2 hours so far today
        self.assertEqual(s.loc['2025-01-15 10:00', 'prev3_precip'], 3.0)
        self.assertEqual(s.loc['2025-01-16 00:00', 'prev3_precip'], 1.0)   # resets at midnight


if __name__ == '__main__':
    unittest.main()
