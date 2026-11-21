import { useState } from 'react';
import FlightForm from './FlightForm';
import RiskGauge from './RiskGauge';
import Icon from './Icon';
import { SAMPLE_FLIGHT, autoFill, predictFlight, riskLevel } from '../lib/flight';

// Same flight in the morning: shows the time-of-day effect out of the box.
const MORNING_FLIGHT = { ...SAMPLE_FLIGHT, departure_time: '07:00', arrival_time: '09:00' };

export default function ComparePanel() {
  const [flights, setFlights] = useState([SAMPLE_FLIGHT, MORNING_FLIGHT]);
  const [results, setResults] = useState([null, null]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (i) => (name, value) => {
    setFlights((fs) => fs.map((f, j) => (j === i ? autoFill(f, name, value) : f)));
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      setResults(await Promise.all(flights.map(predictFlight)));
    } catch (err) {
      setResults([null, null]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const [a, b] = results;
  const diff = a && b ? Number(b.delay_probability) - Number(a.delay_probability) : null;

  return (
    <form onSubmit={submit} data-primary>
      <div className="compare">
        {['A', 'B'].map((label, i) => {
          const r = results[i];
          const risk = r ? riskLevel(r) : null;
          return (
            <section key={label} className="compare-col" aria-labelledby={`flight-${label}`}>
              <h2 id={`flight-${label}`} className="compare-title">Flight {label}</h2>
              <div className={`compare-gauge${loading ? ' is-loading' : ''}`}>
                <RiskGauge score={r ? Number(r.delay_probability) : null} level={risk} />
              </div>
              <div className="compare-badge" aria-live="polite">
                {risk ? <span className={`badge badge-${risk.key}`}>{risk.label}</span> : <span className="badge badge-empty">Not scored yet</span>}
              </div>
              <FlightForm value={flights[i]} onChange={change(i)} idPrefix={`${label.toLowerCase()}-`} compact />
            </section>
          );
        })}
      </div>

      <div className="compare-footer">
        {error ? (
          <p className="panel-error" role="alert"><Icon name="alert" size={16} />{error}</p>
        ) : (
          <p className="compare-summary" aria-live="polite">
            {diff === null
              ? 'Change anything on either side, then compare.'
              : `Flight B scores ${Math.abs(diff).toFixed(1)} points ${diff < 0 ? 'lower' : 'higher'} than flight A.`}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Scoring…' : 'Compare flights'}
        </button>
      </div>
    </form>
  );
}
