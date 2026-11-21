import { useCallback, useEffect, useState } from 'react';
import './App.css';

import Logo from './components/Logo';
import Toasts from './components/Toast';
import OverviewPage from './pages/OverviewPage';
import PredictPage from './pages/PredictPage';
import DataPage from './pages/DataPage';
import { pageFromHash } from './lib/flight';

const NAV = [
  { page: 'overview', href: '#/', label: 'Overview' },
  { page: 'predict', href: '#/predict', label: 'Predict' },
  { page: 'data', href: '#/data', label: 'Data & Model' },
];

// A shared link (?carrier=…) with no page in the hash opens the prediction page.
const initialPage = () =>
  !location.hash && location.search ? 'predict' : pageFromHash(location.hash);

export default function App() {
  const [page, setPage] = useState(initialPage);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onHashChange = () => {
      setPage(pageFromHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // The bar is dark only while it floats over the navy hero.
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const hero = document.querySelector('.hero');
      setPastHero(!hero || window.scrollY > hero.offsetHeight - 80);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const lightNav = page !== 'overview' || pastHero;

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const pushToast = useCallback((type, title, message) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, title, message }]);
    setTimeout(() => dismissToast(id), 4000);
  }, [dismissToast]);

  return (
    <>
      {/* Not href="#main": the hash is the page router */}
      <button type="button" className="skip-link" onClick={() => document.getElementById('main').focus()}>
        Skip to content
      </button>

      {/* Floating bar: dark over the navy hero, light over the white pages */}
      <header className={`globalnav${lightNav ? ' globalnav-light' : ''}`}>
        <div className="globalnav-inner">
          <Logo />
          <nav className="globalnav-links" aria-label="Main">
            {NAV.map((item) => (
              <a key={item.page} href={item.href} aria-current={page === item.page ? 'page' : undefined}>
                {item.label}
              </a>
            ))}
          </nav>
          <a href="#/predict" className={`btn btn-primary btn-sm nav-cta${page === 'predict' ? ' is-hidden' : ''}`}>
            Check a flight
          </a>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {page === 'overview' && <OverviewPage />}
        {page === 'predict' && <PredictPage onToast={pushToast} />}
        {page === 'data' && <DataPage />}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>Departure delay risk for U.S. flights, scored from the schedule and the live weather forecast.</p>
          </div>
          <p className="footer-note">
            Risk scores are statistical estimates learned from U.S. Bureau of Transportation Statistics
            on-time data (January 2025 to August 2026) and Open-Meteo weather. They are not guarantees and
            should not be the only basis for travel decisions.
          </p>
          <div className="footer-bottom">
            <span>Built with React, Flask and XGBoost</span>
            <nav aria-label="Footer">
              {NAV.map((item) => <a key={item.page} href={item.href}>{item.label}</a>)}
            </nav>
          </div>
        </div>
      </footer>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
