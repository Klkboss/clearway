import { AIRLINES, airlineLabel } from '../data/airlines';
import { AIRPORTS, AIRPORTS_BY_CODE, airportLabel } from '../data/airports';

/** Rendered once per page so several forms can share the suggestion lists. */
export function FlightDatalists() {
  return (
    <>
      <datalist id="airline-list">
        {Object.entries(AIRLINES).map(([code, name]) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </datalist>
      <datalist id="airport-list">
        {AIRPORTS.map((a) => (
          <option key={a.code} value={a.code}>{a.city}, {a.state} · {a.name}</option>
        ))}
      </datalist>
    </>
  );
}

function Group({ id, step, title, sub, children }) {
  return (
    <div className="group" role="group" aria-labelledby={id}>
      <h3 id={id} className="group-title"><span className="group-step">{step}</span>{title}</h3>
      <p className="group-sub">{sub}</p>
      <div className="group-fields">{children}</div>
    </div>
  );
}

function Field({ id, label, hint, unit, children }) {
  return (
    <div className="field">
      <div className="field-box">
        <label htmlFor={id}>{label}</label>
        {children}
        {unit && <span className="field-unit">{unit}</span>}
      </div>
      <p className="field-hint" id={`${id}-hint`}>{hint}</p>
    </div>
  );
}

export default function FlightForm({ value, onChange, idPrefix = '', compact = false }) {
  const id = (name) => idPrefix + name;
  const bind = (name) => ({
    id: id(name),
    name,
    value: value[name],
    onChange: (e) => onChange(name, e.target.value),
    'aria-describedby': `${id(name)}-hint`,
    required: true,
    className: 'field-input',
  });
  const known = (code) => Boolean(AIRPORTS_BY_CODE[code?.trim().toUpperCase()]);
  const timesSet = value.departure_time && value.arrival_time;

  return (
    <div className={`flight-form${compact ? ' is-compact' : ''}`}>
      <Group id={id('g-who')} step="01" title="Airline and date" sub="Who’s flying, and on which day?">
        <Field id={id('carrier')} label="Airline" hint={airlineLabel(value.carrier) || 'Two-letter code, like DL'}>
          <input {...bind('carrier')} className="field-input mono-input" placeholder="DL" maxLength={3}
            pattern="[A-Za-z0-9]{2,3}" list="airline-list" autoComplete="off" />
        </Field>
        <Field id={id('flight_date')} label="Date" hint="Scheduled departure date">
          <input {...bind('flight_date')} type="date" />
        </Field>
      </Group>

      <Group id={id('g-where')} step="02" title="Route" sub="Departure and arrival airports.">
        <Field id={id('origin')} label="From" hint={airportLabel(value.origin) || 'Three-letter airport code'}>
          <input {...bind('origin')} className="field-input mono-input" placeholder="ATL" maxLength={3}
            pattern="[A-Za-z]{3}" list="airport-list" autoComplete="off" />
        </Field>
        <Field id={id('destination')} label="To" hint={airportLabel(value.destination) || 'Three-letter airport code'}>
          <input {...bind('destination')} className="field-input mono-input" placeholder="JFK" maxLength={3}
            pattern="[A-Za-z]{3}" list="airport-list" autoComplete="off" />
        </Field>
      </Group>

      <Group id={id('g-when')} step="03" title="Schedule" sub="Local times, as printed on the ticket.">
        <Field id={id('departure_time')} label="Departs" hint="Scheduled departure">
          <input {...bind('departure_time')} type="time" />
        </Field>
        <Field id={id('arrival_time')} label="Arrives" hint="Same time zone as departure">
          <input {...bind('arrival_time')} type="time" />
        </Field>
      </Group>

      <Group id={id('g-length')} step="04" title="Flight length" sub="Filled in for you from the airports and times.">
        <Field id={id('elapsed_time')} label="Duration" unit="min"
          hint={timesSet ? 'Calculated from the times' : 'Scheduled minutes'}>
          <input {...bind('elapsed_time')} type="number" min="1" placeholder="120" />
        </Field>
        <Field id={id('distance')} label="Distance" unit="mi"
          hint={known(value.origin) && known(value.destination) ? 'Calculated from the airports' : 'Route miles'}>
          <input {...bind('distance')} type="number" min="1" placeholder="760" />
        </Field>
      </Group>
    </div>
  );
}
