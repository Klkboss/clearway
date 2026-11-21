import Reveal from '../components/Reveal';

// All figures below are measured: ml/prepare.py, ml/train.py and models/v2_metrics.json.
const FEATURES = [
  ['carrier · origin · dest · route', 'Airline, airports and the pair'],
  ['dep_hour · arr_hour', 'Scheduled hours'],
  ['dep_minute_of_day', 'Exact departure time'],
  ['day_of_week · is_weekend', 'Weekly pattern'],
  ['month · day_of_month', 'Season and date'],
  ['days_to_holiday', 'Distance to a federal holiday'],
  ['elapsed_time · distance', 'Scheduled minutes, route miles'],
  ['origin_dep_traffic', 'Departures per hour at origin'],
  ['dest_arr_traffic', 'Arrivals per hour at destination'],
  ['o_* · d_* (11 each)', 'Weather at departure and arrival'],
  ['net_precip · net_snow · net_gust', 'Weather across 20 major hubs'],
];

const SETTINGS = [
  ['Algorithm', 'XGBoost 3.4, trained on GPU'],
  ['Trees', '726 (early stopping)'],
  ['Learning rate', '0.03'],
  ['Max depth', '7'],
  ['Min child weight', '200'],
  ['Row / column subsample', '0.8 / 0.7'],
  ['Weather dropout', '15% of training rows'],
  ['Decision threshold', '17%, best F1 on validation'],
];

const METRICS = [
  ['79.0%', 'Recall', 'Real delays caught'],
  ['35.0%', 'Precision', 'Delay flags that were right'],
  ['48.5%', 'F1-score', 'Balance of the two'],
  ['72.3%', 'ROC-AUC', 'Ranking ability; 50% is chance'],
  ['47.1%', 'PR-AUC', 'Precision–recall area; 25% is chance'],
  ['0.165', 'Brier score', 'Probability error; lower is better'],
];

// Test set: 3,602,999 flights, March–August 2026.
const COMPARISON = [
  ['Clearway v2, with weather', '72.3%', '47.1%', '48.5%', '0.165', '23.2%'],
  ['Clearway v2, schedule only', '70.6%', '44.0%', '47.3%', '0.169', '22.9%'],
  ['Original model (v1)', '65.4%', '36.0%', '44.5%', '0.232', '48.2%'],
];

// Same test flights, rescored with forecasts issued N days before (ml/evaluate_forecasts.py).
const FORECAST_TEST = [
  ['Weather that happened (hindsight)', '72.3%', '47.1%', '0.165'],
  ['Forecast from 1 day before', '72.1%', '46.6%', '0.167'],
  ['Forecast from 3 days before', '71.7%', '45.9%', '0.167'],
  ['Forecast from 7 days before', '70.7%', '43.8%', '0.171'],
  ['No weather (schedule only)', '70.6%', '44.0%', '0.169'],
];

const BY_MONTH = [
  ['Mar', 71.2, 64.9], ['Apr', 69.9, 63.6], ['May', 70.9, 63.7],
  ['Jun', 73.6, 65.9], ['Jul', 73.7, 67.4], ['Aug', 74.0, 66.9],
];

function Spec({ title, children }) {
  return (
    <Reveal as="section" className="spec">
      <h2 className="spec-title">{title}</h2>
      <div className="spec-body">{children}</div>
    </Reveal>
  );
}

export default function DataPage() {
  return (
    <>
      <section className="sec sec-white data-hero">
        <div className="wrap-wide">
          <Reveal><p className="eyebrow">Methodology</p><h1 className="headline-xl">Data &amp; Model</h1></Reveal>
          <Reveal delay={80}>
            <p className="predict-sub">
              Where the numbers come from, what the model sees, and how well it performs.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="wrap-wide specs">
        <Spec title="Dataset">
          <div className="spec-figures">
            <div><span className="spec-figure">11.73M</span><span>raw flight records</span></div>
            <div><span className="spec-figure">11.52M</span><span>flights modelled</span></div>
            <div><span className="spec-figure">22.64%</span><span>significantly delayed</span></div>
            <div><span className="spec-figure">15+ min</span><span>delay threshold</span></div>
          </div>
          <p className="spec-note">
            U.S. Bureau of Transportation Statistics on-time performance data, January 2025 to August 2026,
            joined to hourly Open-Meteo weather for the 151 busiest airports (96% of flights).
          </p>
        </Spec>

        <Spec title="Class balance">
          <div className="split-bar" role="img" aria-label="77.36% no significant delay, 22.64% significant delay">
            <div className="split-seg split-gray" style={{ flex: 77.36 }}>On time or minor delay · 77.36%</div>
            <div className="split-seg split-warm" style={{ flex: 22.64 }}>22.64%</div>
          </div>
          <p className="spec-note">
            Most flights leave on time, so accuracy alone misleads: calling every flight “on time”
            would look accurate and catch nothing. Recall, F1-score and ranking quality matter more.
          </p>
        </Spec>

        <Spec title="Cleaning">
          <ul className="spec-list">
            <li><b>11,730,351</b> original records across 20 months</li>
            <li><b>206,820</b> removed: cancelled or diverted, missing departure delay, duplicates</li>
            <li>Cancelled flights excluded: the model predicts delays for flights that operate</li>
            <li><b>11,523,531</b> flights used for modelling</li>
          </ul>
        </Spec>

        <Spec title="Train, tune and test">
          <div className="split-bar" role="img" aria-label="Training 59.9% of flights, validation 8.9%, test 31.3%">
            <div className="split-seg split-blue" style={{ flex: 59.9 }}>Train · 2025</div>
            <div className="split-seg split-gray" style={{ flex: 8.9 }}>Tune</div>
            <div className="split-seg split-warm" style={{ flex: 31.3 }}>Test · Mar–Aug 2026</div>
          </div>
          <div className="spec-figures spec-figures-3">
            <div><span className="spec-figure-sm">6,898,733</span><span>training flights, all of 2025, 21.73% delayed</span></div>
            <div><span className="spec-figure-sm">1,021,799</span><span>tuning flights, Jan–Feb 2026, 20.37% delayed</span></div>
            <div><span className="spec-figure-sm">3,602,999</span><span>test flights, Mar–Aug 2026, 25.02% delayed</span></div>
          </div>
          <p className="spec-note">
            Split by date, not at random, the way the model meets future flights. The tuning months pick the
            number of trees and the decision threshold; the test months were never used for any choice.
          </p>
        </Spec>

        <Spec title="Airlines">
          <div className="bars">
            <div className="bar-row"><span>F9 · Frontier Airlines</span><div className="bar-track"><div className="bar-fill bar-warm" style={{ width: '27.36%' }} /></div><b>27.36%</b></div>
            <div className="bar-row"><span>HA · Hawaiian Airlines</span><div className="bar-track"><div className="bar-fill bar-gray" style={{ width: '15.23%' }} /></div><b>15.23%</b></div>
          </div>
          <p className="spec-note">Highest and lowest significant-delay rates. An association, not proof an airline causes delays.</p>
        </Spec>

        <Spec title="Features">
          <dl className="spec-grid">
            {FEATURES.map(([name, meaning]) => (
              <div key={name}><dt className="mono">{name}</dt><dd>{meaning}</dd></div>
            ))}
          </dl>
          <p className="spec-note">
            41 inputs. Weather at each airport: temperature, rain, snow, wind, gusts, cloud and conditions at the
            scheduled hour, plus that day’s totals and the last three hours of rain. Training uses recorded
            weather; the live app uses the forecast. The actual delay is never an input: it is the outcome.
          </p>
        </Spec>

        <Spec title="Model">
          <dl className="spec-grid">
            {SETTINGS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className="spec-note">
            Weather is hidden for a random 15% of training flights, so the model still scores well when no
            forecast is used, such as more than 5 days ahead.
          </p>
        </Spec>

        <Spec title="Performance">
          <div className="spec-metrics">
            {METRICS.map(([value, name, note]) => (
              <div key={name}>
                <span className="spec-figure">{value}</span>
                <span className="spec-metric-name">{name}</span>
                <span className="spec-metric-note">{note}</span>
              </div>
            ))}
          </div>
          <p className="spec-note">
            Measured on 3.6 million test flights from March to August 2026, with the weather that actually
            happened. The next section shows the same test with the forecasts that were really available.
          </p>
        </Spec>

        <Spec title="With real forecasts">
          <div className="table-scroll">
            <table className="spec-table">
              <thead>
                <tr><th>Weather given to the model</th><th>ROC-AUC</th><th>PR-AUC</th><th>Brier</th></tr>
              </thead>
              <tbody className="no-bold">
                {FORECAST_TEST.map(([name, ...cells]) => (
                  <tr key={name}><th scope="row">{name}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="spec-note">
            The live app scores future flights with forecasts, which are less exact than hindsight. To measure
            that honestly, each test flight was rescored with the forecast issued 1, 3 and 7 days before it
            (Open-Meteo Previous Runs API). Forecasts 1–3 days ahead keep almost all of the gain; 7 days ahead
            they add nothing, so the app uses weather only up to 5 days ahead.
          </p>
        </Spec>

        <Spec title="Risk levels">
          <div className="split-bar" role="img" aria-label="Low 37% of test flights, Moderate 43%, High 20%">
            <div className="split-seg split-low" style={{ flex: 37 }}>Low · 37%</div>
            <div className="split-seg split-moderate" style={{ flex: 43 }}>Moderate · 43%</div>
            <div className="split-seg split-warm" style={{ flex: 20 }}>High · 20%</div>
          </div>
          <div className="spec-figures spec-figures-3">
            <div><span className="spec-figure-sm">11%</span><span>of Low flights (under 15%) were delayed</span></div>
            <div><span className="spec-figure-sm">26%</span><span>of Moderate flights (15–35%) were delayed</span></div>
            <div><span className="spec-figure-sm">50%</span><span>of High flights (35% and up) were delayed</span></div>
          </div>
          <p className="spec-note">
            Share of test flights in each level, and how often they really left 15+ minutes late. High-risk
            flights were delayed 4.5 times as often as Low-risk ones. With the forecast from 3 days before,
            as the live app has it, High still meant a delay 50% of the time (precision) but covered only
            34% of all delays (recall); Moderate or High together covered 82%.
          </p>
        </Spec>

        <Spec title="Why this score">
          <p className="spec-note">
            Every prediction comes with its biggest reasons. XGBoost splits each score into one contribution
            per input (SHAP values); the 41 inputs are grouped into nine plain-language factors such as
            departure time, airline or weather at the destination, and the four largest are shown in
            percentage points against an average flight.
          </p>
        </Spec>

        <Spec title="Against the original">
          <div className="table-scroll">
            <table className="spec-table">
              <thead>
                <tr><th>Model</th><th>ROC-AUC</th><th>PR-AUC</th><th>F1</th><th>Brier</th><th>Avg score</th></tr>
              </thead>
              <tbody>
                {COMPARISON.map(([name, ...cells]) => (
                  <tr key={name}><th scope="row">{name}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bars">
            {BY_MONTH.map(([month, v2, v1]) => (
              <div key={month} className="bar-row bar-row-month">
                <span>{month} 2026 · ROC-AUC</span>
                <div className="bar-pair">
                  <div className="bar-track"><div className="bar-fill bar-blue" style={{ width: `${(v2 - 50) * 3.5}%` }} /></div>
                  <div className="bar-track"><div className="bar-fill bar-gray" style={{ width: `${(v1 - 50) * 3.5}%` }} /></div>
                </div>
                <b>{v2.toFixed(1)}<small> / {v1.toFixed(1)}</small></b>
              </div>
            ))}
          </div>
          <p className="spec-note">
            Ahead in every test month (blue: v2 with weather, grey: original; bars start at 50%, chance level).
            Actual delay rate in the test months was 25.0%: the new model’s average score is close to it,
            while the original’s ran about twice too high.
          </p>
        </Spec>
      </div>
    </>
  );
}
