import Icon from '../components/Icon';
import Reveal from '../components/Reveal';
import RiskGauge from '../components/RiskGauge';

const HIGH = { key: 'high', label: 'High risk' };
const SHOWCASE_SCORE = 38.38; // the flight below, scored with that day's recorded weather

// Same Delta ATL → JFK flight in mid-July 2026, departure hour varied; scored by the
// trained model on the schedule alone, so weather doesn't blur the time-of-day effect.
const BY_HOUR = [
  { hour: '06', score: 11.2 }, { hour: '09', score: 14.3 }, { hour: '12', score: 23.2 },
  { hour: '15', score: 36.0 }, { hour: '18', score: 45.0 }, { hour: '21', score: 45.8 },
];

// Same 18:30 flight, each day of one week. Bars start at 40% to show the spread.
const BY_DAY = [
  { day: 'Monday', score: 53.0 }, { day: 'Tuesday', score: 44.4 }, { day: 'Wednesday', score: 45.3 },
  { day: 'Thursday', score: 52.7 }, { day: 'Friday', score: 52.4 }, { day: 'Saturday', score: 49.0 },
  { day: 'Sunday', score: 55.5 },
];

const NUMBERS = [
  { value: '11.5M', label: 'real U.S. flights studied' },
  { value: '22.6%', label: 'left 15 or more minutes late' },
  { value: '79%', label: 'of real delays caught on six unseen months' },
];

const STEPS = [
  { title: 'Enter the schedule', text: 'Airline, airports, date and times. Distance and duration fill themselves in.' },
  { title: 'The model scores it', text: '726 decision trees, trained on 6.9 million flights, weigh the schedule, airport traffic and the weather forecast at both ends.' },
  { title: 'Read the answer', text: 'A risk score, a Low, Moderate or High level, the biggest reasons behind it, and the weather it used.' },
];

const scrollToHow = () => document.getElementById('how').scrollIntoView({ block: 'start' });

export default function OverviewPage() {
  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="sec sec-dark hero">
        <div className="wrap center">
          <Reveal><p className="hero-eyebrow"><span className="live-dot" />Flight delay intelligence</p></Reveal>
          <Reveal delay={80}><h1 className="display">Know before <span className="grad-brand">you go</span></h1></Reveal>
          <Reveal delay={160}>
            <p className="hero-sub">
              Departure delay risk for U.S. flights, scored from the schedule and the live weather forecast.
            </p>
          </Reveal>
          <Reveal delay={240} className="cta-row">
            <a href="#/predict" className="btn btn-primary btn-lg">Check a flight <Icon name="arrowRight" /></a>
            <button type="button" className="btn btn-ghost btn-lg" onClick={scrollToHow}>How it works</button>
          </Reveal>
        </div>

        <Reveal delay={320} className="showcase">
          <div className="showcase-glow" aria-hidden="true" />
          <div className="showcase-card">
            <div className="showcase-flight">
              <p className="showcase-kicker">Delta Air Lines · Wed 15 Jul 2026</p>
              <div className="showcase-route">
                <span>ATL</span>
                <span className="showcase-path" aria-hidden="true"><i /></span>
                <span>JFK</span>
              </div>
              <div className="showcase-times">
                <span><b>18:30</b> Atlanta</span>
                <span><b>20:30</b> New York</span>
              </div>
              <p className="showcase-meta">120 min · 759 mi · Example result</p>
            </div>
            <div className="showcase-score">
              <RiskGauge score={SHOWCASE_SCORE} level={HIGH} dark />
              <span className="badge badge-high badge-on-dark">High risk</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ---------- Numbers ---------- */}
      <section className="sec sec-mist">
        <div className="wrap center">
          <Reveal><p className="eyebrow">The data</p><h2 className="headline">Built on real flights</h2></Reveal>
          <Reveal delay={80}>
            <p className="subhead">U.S. domestic flights from January 2025 to August 2026, from official government on-time records, matched with hourly weather.</p>
          </Reveal>
          <div className="numbers">
            {NUMBERS.map((n, i) => (
              <Reveal key={n.label} delay={120 + i * 80} className="number">
                <span className="number-value">{n.value}</span>
                <span className="number-label">{n.label}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Bento ---------- */}
      <section className="sec sec-white">
        <div className="wrap-wide">
          <Reveal className="center"><p className="eyebrow">Insights</p><h2 className="headline">What moves the needle</h2></Reveal>
          <Reveal delay={80} className="center">
            <p className="subhead">What the model learned about which flights tend to leave late.</p>
          </Reveal>

          <div className="bento">
            <Reveal className="tile tile-wide">
              <p className="tile-kicker">Time of day</p>
              <h3 className="tile-title">Departure hour is the strongest signal</h3>
              <p className="tile-text">It carries <b>45%</b> of the model’s feature importance. Delays build through the day.</p>
              <div className="hours" role="img" aria-label={`Risk score by departure hour: ${BY_HOUR.map((h) => `${h.hour}:00 ${Math.round(h.score)}%`).join(', ')}`}>
                {BY_HOUR.map((h) => (
                  <div key={h.hour} className="hour">
                    <span className="hour-value">{Math.round(h.score)}%</span>
                    <div className="hour-bar" style={{ height: `${h.score * 2.4}px` }} />
                    <span className="hour-label">{h.hour}:00</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={80} className="tile tile-dark">
              <p className="tile-kicker">Day of week</p>
              <p className="tile-figure grad-warm">44% → 56%</p>
              <p className="tile-text">The same flight, moved from Tuesday to Sunday.</p>
              <div className="hours week" role="img" aria-label={`Risk score by weekday: ${BY_DAY.map((d) => `${d.day} ${Math.round(d.score)}%`).join(', ')}`}>
                {BY_DAY.map((d) => (
                  <div key={d.day} className="hour">
                    <div className="hour-bar" style={{ height: `${(d.score - 40) * 3}px` }} />
                    <span className="hour-label">{d.day[0]}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal className="tile">
              <p className="tile-kicker">Airline</p>
              <p className="tile-figure grad-brand">45% → 56%</p>
              <p className="tile-text">Same route, same time, different airline: Delta lowest, Southwest and Frontier highest.</p>
            </Reveal>

            <Reveal delay={80} className="tile">
              <p className="tile-kicker">Weather</p>
              <p className="tile-figure grad-warm">23% → 38%</p>
              <p className="tile-text">Flights leaving late on a dry day vs. heavy rain (20 mm+) at the departure airport.</p>
            </Reveal>

            <Reveal delay={160} className="tile">
              <p className="tile-kicker">Coverage</p>
              <h3 className="tile-title">14 airlines, 352 airports</h3>
              <p className="tile-text">Every carrier and airport the model was trained on.</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="sec sec-dark" id="how">
        <div className="wrap">
          <Reveal className="center"><p className="eyebrow">How it works</p><h2 className="headline">Three steps, one answer</h2></Reveal>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 100} className="step">
                <span className="step-num grad-brand">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Honest ---------- */}
      <section className="sec sec-mist">
        <div className="wrap">
          <Reveal className="center"><p className="eyebrow">Transparency</p><h2 className="headline">Honest by design</h2></Reveal>
          <Reveal delay={80} className="center">
            <p className="subhead">A useful early signal, with clear limits. Here is exactly where it stands.</p>
          </Reveal>
          <div className="honest">
            <Reveal className="honest-col">
              <h3>What it does well</h3>
              <ul>
                <li><Icon name="check" size={18} />Catches about 79% of flights that really left 15+ minutes late, across six months it never saw.</li>
                <li><Icon name="check" size={18} />Reads the live forecast at both airports; tested on real past forecasts, not just hindsight.</li>
                <li><Icon name="check" size={18} />Scores track reality: 23% average predicted, 25% actually late.</li>
              </ul>
            </Reveal>
            <Reveal delay={80} className="honest-col">
              <h3>Where it falls short</h3>
              <ul>
                <li><Icon name="minus" size={18} />Even High risk means a delay only about half the time, and High covers just a third of all delays.</li>
                <li><Icon name="minus" size={18} />Weather only helps for flights in the next few days; beyond 5 days it scores the schedule alone.</li>
                <li><Icon name="minus" size={18} />Knows nothing about air traffic control, crews or aircraft faults.</li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="sec sec-white cta">
        <div className="wrap center">
          <Reveal><h2 className="headline">Check your flight</h2></Reveal>
          <Reveal delay={80}><p className="subhead">It takes about ten seconds.</p></Reveal>
          <Reveal delay={160} className="cta-row">
            <a href="#/predict" className="btn btn-primary btn-lg">Get started <Icon name="arrowRight" /></a>
            <a href="#/data" className="btn btn-secondary btn-lg">See the data</a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
