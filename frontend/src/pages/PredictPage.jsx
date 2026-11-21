import { useCallback, useEffect, useState } from 'react';
import FlightForm, { FlightDatalists } from '../components/FlightForm';
import ResultPanel from '../components/ResultPanel';
import ComparePanel from '../components/ComparePanel';
import RouteContext from '../components/RouteContext';
import { BLANK_FLIGHT, FLIGHT_FIELDS, SAMPLE_FLIGHT, autoFill, predictFlight } from '../lib/flight';

const FORM_ID = 'flight-form';

// A shared link carries the flight in the query string.
function flightFromUrl() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(FLIGHT_FIELDS.map((f) => [f, params.get(f) || '']));
}

const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

export default function PredictPage({ onToast }) {
  const [mode, setMode] = useState('single');
  const [flight, setFlight] = useState(flightFromUrl);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (name, value) => {
    setFlight((prev) => autoFill(prev, name, value));
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await predictFlight(flight);
      setResult({ ...data, flight }); // keep the scored flight, even if the form changes later
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clear = useCallback(() => {
    setFlight(BLANK_FLIGHT);
    setResult(null);
    setError('');
  }, []);

  const loadExample = () => {
    setFlight(SAMPLE_FLIGHT);
    setResult(null);
    setError('');
    document.getElementById('carrier')?.focus();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !isTyping()) {
        e.preventDefault();
        document.querySelector('form[data-primary] input')?.focus();
      } else if (e.key === 'Escape' && !isTyping() && mode === 'single') {
        clear(); // not while typing: Escape also closes the browser's suggestion list
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        document.querySelector('form[data-primary]')?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear, mode]);

  return (
    <section className="sec sec-white predict">
      <div className="wrap-wide">
        <header className="predict-head">
          <div>
            <p className="eyebrow">Predict</p>
            <h1 className="headline-xl">Check a flight</h1>
            <p className="predict-sub">Enter the schedule. Get its delay risk in a second.</p>
          </div>
          <div className="segmented" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === 'single'} onClick={() => setMode('single')}>One flight</button>
            <button type="button" aria-pressed={mode === 'compare'} onClick={() => setMode('compare')}>Compare two</button>
          </div>
        </header>

        {mode === 'single' ? (
          <>
            <div className="configurator">
              <form id={FORM_ID} className="config-form" onSubmit={submit} data-primary aria-label="Flight details">
                <div className="form-tools">
                  <button type="button" className="link-more" onClick={loadExample}>Load example</button>
                  <button type="button" className="link-more" onClick={clear}>Clear</button>
                </div>
                <FlightForm value={flight} onChange={change} />
                <p className="shortcut-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> checks the flight from anywhere on the page.</p>
              </form>
              <ResultPanel
                flight={flight}
                result={result}
                loading={loading}
                error={error}
                formId={FORM_ID}
                onExample={loadExample}
                onToast={onToast}
              />
            </div>
            <RouteContext origin={flight.origin} destination={flight.destination} />
          </>
        ) : (
          <ComparePanel />
        )}
      </div>
      <FlightDatalists />
    </section>
  );
}
