import { useEffect, useRef } from 'react';
import Icon from './Icon';
import RiskGauge from './RiskGauge';
import { airlineLabel } from '../data/airlines';
import { RISK_BANDS, WEATHER_SOURCE, factorLabel, riskLevel, weatherSummary } from '../lib/flight';

const formatDate = (iso) =>
  new Date(`${iso}T00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

const code = (s) => s?.trim().toUpperCase() || '';

function reportText(flight, result) {
  return [
    'Clearway · Delay risk report',
    `Generated: ${new Date().toLocaleString()}`,
    '',
    `Airline:     ${code(flight.carrier)} ${airlineLabel(flight.carrier)}`,
    `Route:       ${code(flight.origin)} → ${code(flight.destination)}`,
    `Date:        ${flight.flight_date}`,
    `Departure:   ${flight.departure_time}`,
    `Arrival:     ${flight.arrival_time}`,
    `Duration:    ${flight.elapsed_time} min`,
    `Distance:    ${flight.distance} mi`,
    '',
    `Risk score:  ${Number(result.delay_probability).toFixed(1)}% (${riskLevel(result).label})`,
    ...weatherLines(flight, result.weather),
    ...(result.reasons?.factors?.length
      ? ['Biggest factors:', ...result.reasons.factors.map((f) => `  ${f.effect > 0 ? '+' : '−'}${Math.abs(f.effect).toFixed(1)} pts  ${factorLabel(f.factor, flight)}`)]
      : []),
    'A significant delay means departing 15+ minutes late. Scores are estimates, not guarantees.',
  ].join('\n');
}

function weatherLines(flight, weather) {
  if (!weather?.origin) return [];
  return [
    `Weather:     ${WEATHER_SOURCE[weather.source]}`,
    `  ${code(flight.origin)}  ${weatherSummary(weather.origin)}`,
    `  ${code(flight.destination)}  ${weatherSummary(weather.destination)}`,
  ];
}

function WeatherUsed({ flight, weather }) {
  if (!weather || !(weather.source in WEATHER_SOURCE)) return null; // v1 model: no weather
  return (
    <div className="panel-weather">
      <h3 className="label">Weather in this score</h3>
      {weather.origin ? (
        <>
          <p className="muted">{WEATHER_SOURCE[weather.source]}</p>
          <div className="weather-row"><span className="mono strong">{code(flight.origin)}</span><span>{weatherSummary(weather.origin)}</span></div>
          <div className="weather-row"><span className="mono strong">{code(flight.destination)}</span><span>{weatherSummary(weather.destination)}</span></div>
        </>
      ) : <p className="muted">{WEATHER_SOURCE.unavailable}</p>}
    </div>
  );
}

function WhyThisScore({ flight, reasons }) {
  if (!reasons?.factors?.length) return null;
  const biggest = Math.max(...reasons.factors.map((f) => Math.abs(f.effect)));
  return (
    <div className="panel-why">
      <h3 className="label">Why this score</h3>
      <p className="muted">Compared with an average flight ({reasons.baseline}%):</p>
      <ul>
        {reasons.factors.map((f) => (
          <li key={f.factor} className={f.effect > 0 ? 'why-up' : 'why-down'}>
            <span>{factorLabel(f.factor, flight)}</span>
            <span className="why-bar" aria-hidden="true"><i style={{ width: `${(Math.abs(f.effect) / biggest) * 100}%` }} /></span>
            <b>{f.effect > 0 ? '+' : '−'}{Math.abs(f.effect).toFixed(1)}</b>
          </li>
        ))}
      </ul>
      <p className="why-note">Percentage points each factor adds or removes.</p>
    </div>
  );
}

function Actions({ flight, result, onToast }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText(flight, result));
      onToast('success', 'Summary copied');
    } catch {
      onToast('error', 'Could not copy', 'Your browser blocked clipboard access.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([reportText(flight, result)], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `clearway-${flight.origin}-${flight.destination}-${flight.flight_date}.txt`.toLowerCase();
    a.click();
    URL.revokeObjectURL(url);
    onToast('success', 'Report downloaded');
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}?${new URLSearchParams(flight)}#/predict`;
    try {
      await navigator.clipboard.writeText(url);
      onToast('success', 'Link copied', 'Anyone with the link sees this flight filled in.');
    } catch {
      onToast('error', 'Could not copy link', url);
    }
  };
  return (
    <div className="panel-actions">
      <button type="button" onClick={copy}><Icon name="copy" size={15} />Copy</button>
      <button type="button" onClick={download}><Icon name="download" size={15} />Download</button>
      <button type="button" onClick={share}><Icon name="link" size={15} />Share</button>
    </div>
  );
}

/** The right-hand panel: the flight being built, the score, and the submit button. */
export default function ResultPanel({ flight, result, loading, error, formId, onExample, onToast }) {
  const ref = useRef(null);
  const shown = result?.flight ?? flight;
  const risk = result ? riskLevel(result) : null;
  const airline = airlineLabel(shown.carrier);

  // On narrow screens the panel sits below the form, so bring the answer into view.
  useEffect(() => {
    if ((result || error) && matchMedia('(max-width: 900px)').matches) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }, [result, error]);

  const details = [airline, shown.flight_date && formatDate(shown.flight_date), shown.departure_time]
    .filter(Boolean).join(' · ');

  return (
    <aside ref={ref} className="panel" aria-labelledby="panel-route">
      <p className="panel-kicker">{result ? 'Your result' : 'Your flight'}</p>
      <h2 id="panel-route" className="panel-route">
        <span>{code(shown.origin) || '- - -'}</span>
        <Icon name="arrowRight" size={22} />
        <span>{code(shown.destination) || '- - -'}</span>
      </h2>
      <p className="panel-details">{details || 'Fill in the details to begin.'}</p>

      <div className={`panel-gauge${loading ? ' is-loading' : ''}`}>
        <RiskGauge
          score={result ? Number(result.delay_probability) : null}
          level={risk}
          caption={loading ? 'scoring…' : 'delay risk'}
        />
      </div>

      <div aria-live="polite" className="panel-status">
        {risk && <span className={`badge badge-${risk.key}`}>{risk.label}</span>}
        {error && (
          <p className="panel-error" role="alert"><Icon name="alert" size={16} />{error}</p>
        )}
      </div>

      <button type="submit" form={formId} className="btn btn-primary btn-block" disabled={loading}>
        {loading ? 'Scoring…' : result ? 'Check again' : 'Check delay risk'}
      </button>

      {result ? (
        <>
          <WhyThisScore flight={result.flight} reasons={result.reasons} />
          <WeatherUsed flight={result.flight} weather={result.weather} />
          <Actions flight={result.flight} result={result} onToast={onToast} />
          <details className="explainer">
            <summary>How to read this score <Icon name="chevronDown" size={14} /></summary>
            <p>
              The score is the model’s estimate of the chance of leaving 15 or more minutes late.
              About 1 in 4 flights did in 2026. The marks on the dial split it into three levels:
              Low below {RISK_BANDS.low}%, Moderate up to {RISK_BANDS.high}%, High from {RISK_BANDS.high}%.
            </p>
            <p>
              In testing on six months of flights the model never saw, about 1 in 10 Low flights and
              about half of High flights were delayed. Scores are estimates, not guarantees.
            </p>
          </details>
        </>
      ) : (
        !loading && (
          <button type="button" className="link-more panel-example" onClick={onExample}>
            Try an example flight <Icon name="arrowRight" size={14} />
          </button>
        )
      )}
    </aside>
  );
}
