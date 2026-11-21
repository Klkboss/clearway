// Major US airlines by IATA code
export const AIRLINES = {
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue Airways',
  AS: 'Alaska Airlines',
  NK: 'Spirit Airlines',
  F9: 'Frontier Airlines',
  HA: 'Hawaiian Airlines',
  SY: 'Sun Country Airlines',
  G4: 'Allegiant Air',
  MX: 'Breeze Airways',
};

export function airlineLabel(code) {
  return AIRLINES[code?.trim().toUpperCase()] || '';
}
