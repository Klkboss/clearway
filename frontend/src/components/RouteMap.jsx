import { useEffect, useMemo, useState } from 'react';
import { geoAlbers, geoInterpolate, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';

const W = 720;
const H = 420;
const PAD = 28;

// Alaska, Hawaii and territories: drawn and framed only when the route lands there.
const OUTSIDE_LOWER_48 = new Set(['02', '15', '60', '66', '69', '72', '78']);

// State abbreviation → Census FIPS code, the ids used by us-atlas.
const FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};

// The ~115 KB atlas loads once, and only when a map is first shown.
let atlasPromise;
const loadAtlas = () => (atlasPromise ??= import('us-atlas/states-10m.json').then(({ default: topo }) => {
  const states = feature(topo, topo.objects.states).features;
  return {
    states,
    borders: mesh(topo, topo.objects.states, (x, y) => x !== y),
    lower48: states.filter((s) => !OUTSIDE_LOWER_48.has(s.id)),
  };
}));

function useAtlas() {
  const [atlas, setAtlas] = useState(null); // null = loading, false = failed
  useEffect(() => {
    let live = true;
    loadAtlas().then((a) => live && setAtlas(a), () => live && setAtlas(false));
    return () => { live = false; };
  }, []);
  return atlas;
}

/** U.S. map with the great-circle route between two airports. */
export default function RouteMap({ a, b, miles }) {
  const atlas = useAtlas();
  const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const geo = useMemo(() => {
    if (atlas === null) return null;
    const from = [a.lon, a.lat];
    const to = [b.lon, b.lat];
    const route = { type: 'LineString', coordinates: [from, to] };
    // Frame the lower 48 plus the route, so Hawaii routes zoom out to include the islands.
    const frame = { type: 'FeatureCollection', features: [...(atlas ? atlas.lower48 : []), { type: 'Feature', geometry: route }] };
    const projection = geoAlbers().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], frame);
    const path = geoPath(projection);
    return {
      path,
      routeD: path(route), // d3 draws LineStrings as great circles
      pa: projection(from),
      pb: projection(to),
      mid: projection(geoInterpolate(from, to)(0.5)),
    };
  }, [a, b, atlas]);

  const endpoints = new Set([FIPS[a.state], FIPS[b.state]]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="route-map" role="img"
      aria-label={`Map of the United States showing the ${miles}-mile route from ${a.city}, ${a.state} to ${b.city}, ${b.state}`}>
      {geo && (
        <>
          {/* lower 48, plus Hawaii or Alaska only when the route lands there */}
          {atlas && atlas.states.filter((s) => !OUTSIDE_LOWER_48.has(s.id) || endpoints.has(s.id)).map((s) => (
            <path key={s.id} d={geo.path(s)} className={`map-state${endpoints.has(s.id) ? ' is-endpoint' : ''}`} />
          ))}
          {atlas && <path d={geo.path(atlas.borders)} className="map-borders" />}
          <path d={geo.routeD} className="map-route-glow" />
          <path d={geo.routeD} className="map-route" />
          {!reduceMotion && (
            <circle r="5" className="map-plane">
              <animateMotion dur="4s" repeatCount="indefinite" path={geo.routeD} />
            </circle>
          )}
          {[[geo.pa, a], [geo.pb, b]].map(([p, ap]) => (
            <g key={ap.code}>
              <circle cx={p[0]} cy={p[1]} r="6" className="map-dot" />
              <text x={p[0]} y={p[1] - 14} textAnchor="middle" className="map-label">{ap.code}</text>
            </g>
          ))}
          <text x={geo.mid[0]} y={geo.mid[1] - 12} textAnchor="middle" className="map-miles">{miles} mi</text>
        </>
      )}
    </svg>
  );
}
