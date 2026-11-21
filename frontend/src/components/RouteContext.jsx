import { useEffect, useState } from 'react';
import { AIRPORTS_BY_CODE, distanceMiles } from '../data/airports';
import RouteMap from './RouteMap';
import { describeWeather } from '../lib/flight';

function useCurrentWeather(airport) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${airport.lat}&longitude=${airport.lon}&current=temperature_2m,weather_code,wind_speed_10m`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => !cancelled && setWeather({
        temp: Math.round(j.current.temperature_2m),
        wind: Math.round(j.current.wind_speed_10m),
        text: describeWeather(j.current.weather_code),
      }))
      .catch(() => !cancelled && setWeather(null));
    return () => { cancelled = true; };
  }, [airport]);
  return weather;
}

function WeatherRow({ airport }) {
  const w = useCurrentWeather(airport);
  return (
    <div className="weather-row">
      <div>
        <span className="mono strong">{airport.code}</span>
        <span className="muted"> {airport.city}, {airport.state}</span>
      </div>
      <span>{w ? `${w.text} · ${w.temp}°C · wind ${w.wind} km/h` : 'Weather unavailable'}</span>
    </div>
  );
}

export default function RouteContext({ origin, destination }) {
  const a = AIRPORTS_BY_CODE[origin?.trim().toUpperCase()];
  const b = AIRPORTS_BY_CODE[destination?.trim().toUpperCase()];
  if (!a || !b || a === b) return null;

  return (
    <section className="route" aria-labelledby="route-title">
      <p className="eyebrow">Route context</p>
      <h2 id="route-title" className="route-title">On the map</h2>
      <p className="group-sub route-sub">Conditions right now. The score uses the forecast for your flight hours.</p>
      <div className="route-grid">
        <RouteMap a={a} b={b} miles={distanceMiles(a.code, b.code)} />
        <div className="route-facts">
          <p className="route-distance"><span className="mono">{a.code} → {b.code}</span> · {distanceMiles(a.code, b.code)} mi</p>
          <h3 className="label">Weather right now</h3>
          <WeatherRow airport={a} />
          <WeatherRow airport={b} />
        </div>
      </div>
    </section>
  );
}
