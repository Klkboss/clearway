import { distanceMiles } from '../data/airports.js';
import { airlineLabel } from '../data/airlines.js';

export const FLIGHT_FIELDS = [
  'carrier', 'origin', 'destination', 'flight_date',
  'departure_time', 'arrival_time', 'elapsed_time', 'distance',
];

export const BLANK_FLIGHT = Object.fromEntries(FLIGHT_FIELDS.map((f) => [f, '']));

export const SAMPLE_FLIGHT = {
  carrier: 'DL',
  origin: 'ATL',
  destination: 'JFK',
  flight_date: '2026-07-15',
  departure_time: '18:30',
  arrival_time: '20:30',
  elapsed_time: '120',
  distance: String(distanceMiles('ATL', 'JFK')),
};

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Scheduled minutes between two HH:MM times; wraps past midnight. */
export function elapsedMinutes(dep, arr) {
  if (!dep || !arr) return null;
  const mins = (toMinutes(arr) - toMinutes(dep) + 1440) % 1440;
  return mins || null;
}

/** Applies one field change and re-derives distance and duration when possible. */
export function autoFill(prev, name, value) {
  const next = { ...prev, [name]: value };
  if (name === 'origin' || name === 'destination') {
    const d = distanceMiles(next.origin.toUpperCase(), next.destination.toUpperCase());
    if (d) next.distance = String(d);
  }
  if (name === 'departure_time' || name === 'arrival_time') {
    const mins = elapsedMinutes(next.departure_time, next.arrival_time);
    if (mins) next.elapsed_time = String(mins);
  }
  return next;
}

export function toPayload(flight) {
  return {
    ...flight,
    carrier: String(flight.carrier).trim().toUpperCase(),
    origin: String(flight.origin).trim().toUpperCase(),
    destination: String(flight.destination).trim().toUpperCase(),
    elapsed_time: Number(flight.elapsed_time),
    distance: Number(flight.distance),
  };
}

export async function predictFlight(flight) {
  const response = await fetch('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toPayload(flight)),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('The prediction service is unavailable. Is the backend running?');
  }
  if (!response.ok) throw new Error(data.error || 'Unable to generate a prediction.');
  return data;
}

// Score bands in percent; must match RISK_BANDS in clearway_features.py.
export const RISK_BANDS = { low: 15, high: 35 };
const LEVEL_LABELS = { low: 'Low risk', moderate: 'Moderate risk', high: 'High risk' };

export function riskLevel(result) {
  // Older API responses (the v1 model) only carry the yes/no prediction.
  const key = result?.risk_level ?? (result?.prediction === 'Significant Delay' ? 'high' : 'low');
  return { key, label: LEVEL_LABELS[key] };
}

const code = (s) => String(s ?? '').trim().toUpperCase();

/** Plain-language name for one factor returned by the API, for this flight. */
export function factorLabel(factor, flight) {
  const date = new Date(`${flight.flight_date}T00:00`);
  switch (factor) {
    case 'time': return `Departure time (${flight.departure_time})`;
    case 'day': return `Day of week (${date.toLocaleDateString('en-US', { weekday: 'long' })})`;
    case 'season': return `Time of year (${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
    case 'airline': return `Airline (${airlineLabel(flight.carrier) || code(flight.carrier)})`;
    case 'route': return `Route (${code(flight.origin)} → ${code(flight.destination)})`;
    case 'traffic': return 'Airport traffic at that hour';
    case 'origin_weather': return `Weather at ${code(flight.origin)}`;
    case 'dest_weather': return `Weather at ${code(flight.destination)}`;
    case 'network_weather': return 'Weather at major hubs';
    default: return factor;
  }
}

// WMO weather codes, as returned by Open-Meteo.
export function describeWeather(code) {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Thunderstorms';
}

/** One line for the weather the model used at an airport, e.g. "Rain · 12°C · 3.2 mm · gusts 45 km/h". */
export function weatherSummary(w) {
  const parts = [describeWeather(w.code), `${Math.round(w.temp)}°C`];
  if (w.snow > 0) parts.push(`${w.snow} cm snow`);
  else if (w.precip > 0) parts.push(`${w.precip} mm rain`);
  parts.push(`gusts ${Math.round(w.gust)} km/h`);
  return parts.join(' · ');
}

export const WEATHER_SOURCE = {
  forecast: 'Forecast for your flight hours',
  historical: 'Recorded weather for that day',
  unavailable: 'More than 5 days ahead, forecasts did not improve accuracy in testing, so the score uses the schedule only.',
};

export const PAGES = ['overview', 'predict', 'data'];

export function pageFromHash(hash) {
  const page = String(hash).replace(/^#\/?/, '');
  return PAGES.includes(page) ? page : 'overview';
}
