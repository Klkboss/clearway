import { useId } from 'react';

export default function Logo() {
  const id = `logo${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <a href="#/" className="brand" aria-label="Clearway home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3B5BFD" />
            <stop offset="100%" stopColor="#22C3EE" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
        <path d="M13.5 6h5l5 20h-15z" fill="#fff" fillOpacity="0.95" />
        <path d="M16 10v2.5M16 15.5V18M16 21v2.5" stroke="#3B5BFD" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span>Clearway</span>
    </a>
  );
}
