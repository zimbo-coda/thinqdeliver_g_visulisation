import React, { useMemo, useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { PanelProps, DataFrame } from '@grafana/data';
import { Card, InlineField, Input, Badge } from '@grafana/ui';
import { Options } from './types';

type Row = {
  question_no?: number;
  question_text?: string;
  question_type?: string;
  label?: string;
  value_text?: string;
  value_num?: number;
  option_value?: string;
  option_count?: number;
  response?: string;
  created_at?: any;

  // GPS fields coming from vw_question_panel_payload_ml
  lat?: number;
  lon?: number;
  accuracy?: number;
  altitude?: number;
};

type GpsPoint = {
  lat: number;
  lon: number;
  created_at?: any;
  accuracy?: number;
  altitude?: number;
};

const PALETTE = [
  '#7EB26D',
  '#EAB839',
  '#6ED0E0',
  '#EF843C',
  '#E24D42',
  '#1F78C1',
  '#BA43A9',
  '#705DA0',
  '#508642',
  '#CCA300',
  '#447EBC',
  '#C15C17',
  '#890F02',
  '#0A437C',
];

function frameToRows(frame: DataFrame): Row[] {
  const fields = frame.fields;
  const len = frame.length ?? (fields[0]?.values?.length ?? 0);

  const rows: Row[] = [];
  for (let r = 0; r < len; r++) {
    const row: any = {};
    for (const f of fields) {
      row[f.name] = f.values.get(r);
    }
    rows.push(row);
  }
  return rows;
}

function isOptionRow(r: Row) {
  return r.option_value != null && r.option_count != null;
}

function isResponseRow(r: Row) {
  return r.response != null && String(r.response).trim() !== '';
}

function isStatRow(r: Row) {
  const l = String(r.label ?? '');
  return l.startsWith('avg_') || l.startsWith('min_') || l.startsWith('max_') || l.startsWith('median_');
}

function fmtPercent(x: number) {
  return (x * 100).toFixed(1) + '%';
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`;
}

const GpsMap: React.FC<{ points: GpsPoint[]; mapHeight: number }> = ({ points, mapHeight }) => {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const geojson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: points.map((p) => ({
        type: 'Feature' as const,
        properties: {
          created_at: p.created_at != null ? String(p.created_at) : '',
          accuracy: p.accuracy ?? null,
          altitude: p.altitude ?? null,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [p.lon, p.lat] as [number, number],
        },
      })),
    }),
    [points]
  );

  // Create map once
  useEffect(() => {
    if (!mapDiv.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 0],
      zoom: 1,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      map.addSource('gps', { type: 'geojson', data: geojson });

      map.addLayer({
        id: 'gps-points',
        type: 'circle',
        source: 'gps',
        paint: {
          'circle-radius': 5,
          'circle-color': '#e24d42',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // Fit bounds to points
      const bounds = new maplibregl.LngLatBounds();
      for (const f of geojson.features) {
        bounds.extend(f.geometry.coordinates);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 30, maxZoom: 14 });
      }

      // Optional popup on click
      map.on('click', 'gps-points', (e) => {
        const feat = e.features?.[0] as any;
        if (!feat) return;
        const coords = feat.geometry.coordinates as [number, number];
        const ts = feat.properties?.created_at ?? '';
        const acc = feat.properties?.accuracy ?? '';
        new maplibregl.Popup()
          .setLngLat(coords)
          .setHTML(`<div><b>${ts}</b><br/>acc: ${acc}</div>`)
          .addTo(map);
      });

      map.on('mouseenter', 'gps-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'gps-points', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data (and re-fit) when points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const src = map.getSource('gps') as any;
    if (src?.setData) {
      src.setData(geojson);

      const bounds = new maplibregl.LngLatBounds();
      for (const f of geojson.features) {
        bounds.extend(f.geometry.coordinates);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 30, maxZoom: 14 });
      }
    }
  }, [geojson]);

  return (
    <div
      ref={mapDiv}
      style={{
        height: mapHeight,
        width: '100%',
        marginTop: 10,
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    />
  );
};

export const QuestionVizPanel: React.FC<PanelProps<Options>> = ({ data, width, height, options }) => {
  const frame = data.series[0];
  const allRows = useMemo(() => (frame ? frameToRows(frame) : []), [frame]);

  // Group by question_no so Mode B queries that return multiple questions render correctly.
  const groups = useMemo(() => {
    const map = new Map<number, Row[]>();
    for (const r of allRows) {
      const qn = Number(r.question_no);
      if (!Number.isFinite(qn)) continue;
      if (!map.has(qn)) map.set(qn, []);
      map.get(qn)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [allRows]);

  const [search, setSearch] = useState('');

  const containerStyle: React.CSSProperties = { width, height, overflow: 'auto', padding: 8 };

  const renderStats = (qtype: string, rows: Row[]) => {
    const statRows = rows.filter(isStatRow);
    const stats = statRows
      .map((r) => ({
        metric: r.label,
        value: (qtype === 'numeric' ? r.value_num : r.value_text) ?? r.value_text ?? r.value_num,
      }))
      .filter((s) => s.metric);

    return (
      <Card>
        <div style={{ padding: 12 }}>
          <strong>Summary</strong>
          <div style={{ marginTop: 8 }}>
            {stats.length === 0 ? (
              <div style={{ color: '#888' }}>No summary values available</div>
            ) : (
              stats.map((s, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}
                >
                  <span>{String(s.metric)}</span>
                  <span style={{ fontFamily: 'monospace' }}>{String(s.value ?? '')}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderPie = (rows: Row[]) => {
    const dataPts = rows
      .filter(isOptionRow)
      .map((r, i) => ({
        label: String(r.option_value ?? ''),
        value: Number(r.option_count ?? 0),
        color: PALETTE[i % PALETTE.length],
      }))
      .filter((d) => d.label && d.value > 0);

    const total = dataPts.reduce((a, b) => a + b.value, 0);
    const size = 220;
    const rr = Math.max(40, size / 2 - 10);
    const cx = rr + 10;
    const cy = rr + 10;

    let angle = -Math.PI / 2;
    const slices = dataPts.map((d) => {
      const frac = total ? d.value / total : 0;
      const start = angle;
      const end = angle + frac * Math.PI * 2;
      angle = end;
      return { ...d, frac, start, end };
    });

    return (
      <Card>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <strong>Distribution</strong>
            <div style={{ color: '#666' }}>Total: {total}</div>
          </div>

          {dataPts.length === 0 ? (
            <div style={{ marginTop: 8, color: '#888' }}>No option counts available</div>
          ) : (
            <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
              <svg width={cx * 2} height={cy * 2} viewBox={`0 0 ${cx * 2} ${cy * 2}`}>
                {slices.map((s, i) => (
                  <path key={i} d={arcPath(cx, cy, rr, s.start, s.end)} fill={s.color} stroke="rgba(0,0,0,0.08)" />
                ))}
              </svg>

              <div style={{ flex: 1 }}>
                {slices.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        background: s.color,
                        display: 'inline-block',
                        borderRadius: 2,
                      }}
                    />
                    <span style={{ flex: 1 }}>{s.label}</span>
                    <span style={{ fontFamily: 'monospace' }}>{s.value}</span>
                    {options.pieShowPercent && (
                      <span style={{ width: 60, textAlign: 'right', color: '#666' }}>{fmtPercent(s.frac)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  };

  const renderBar = (rows: Row[]) => {
    const dataPts = rows
      .filter(isOptionRow)
      .map((r, i) => ({
        label: String(r.option_value ?? ''),
        value: Number(r.option_count ?? 0),
        color: PALETTE[i % PALETTE.length],
      }))
      .filter((d) => d.label);

    const max = Math.max(1, ...dataPts.map((d) => d.value));
    const barAreaWidth = Math.max(180, Math.min(520, width - 260));

    return (
      <Card>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <strong>Distribution</strong>
            <div style={{ color: '#666' }}>Max: {max}</div>
          </div>

          {dataPts.length === 0 ? (
            <div style={{ marginTop: 8, color: '#888' }}>No option counts available</div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {dataPts.map((d, i) => {
                const w = (d.value / max) * barAreaWidth;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
                    <div
                      style={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={d.label}
                    >
                      {d.label}
                    </div>
                    <div style={{ width: barAreaWidth, background: 'rgba(0,0,0,0.06)', borderRadius: 3, height: 12 }}>
                      <div style={{ width: w, background: d.color, borderRadius: 3, height: 12 }} />
                    </div>
                    <div style={{ width: 50, textAlign: 'right', fontFamily: 'monospace' }}>{d.value}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    );
  };

  const renderResponses = (rows: Row[]) => {
    const responses = rows.filter(isResponseRow);
    const filtered =
      options.enableTextSearch && search.trim()
        ? responses.filter((r) => String(r.response ?? '').toLowerCase().includes(search.toLowerCase()))
        : responses;

    return (
      <Card>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>All responses</strong>
              <span style={{ color: '#666' }}>({filtered.length})</span>
            </div>
            {options.enableTextSearch && (
              <InlineField label="Search" labelWidth={50}>
                <Input value={search} onChange={(e) => setSearch(e.currentTarget.value)} placeholder="filter…" width={24} />
              </InlineField>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#888' }}>No responses</div>
            ) : (
              filtered.map((r, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  {options.showTextTimestamps && r.created_at && (
                    <div style={{ fontSize: 12, color: '#666' }}>{String(r.created_at)}</div>
                  )}
                  <div style={{ whiteSpace: options.textWrap ? 'pre-wrap' : 'nowrap' }}>{String(r.response ?? '')}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderGpsMap = (rows: Row[]) => {
    const points: GpsPoint[] = rows
      .filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number')
      .map((r) => ({
        lat: r.lat as number,
        lon: r.lon as number,
        created_at: r.created_at,
        accuracy: r.accuracy,
        altitude: r.altitude,
      }));

    return (
      <Card>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong>Map</strong>
            <Badge text="gps" color="orange" />
            <span style={{ color: '#666' }}>({points.length})</span>
          </div>

          {points.length === 0 ? (
            <div style={{ marginTop: 8, color: '#888' }}>No GPS points available</div>
          ) : (
            <GpsMap points={points} mapHeight={Math.max(240, Math.round(height * 0.6))} />
          )}
        </div>
      </Card>
    );
  };

  const renderByType = (qtype: string, rows: Row[]) => {
    if (qtype === 'select_one') return renderPie(rows);
    if (qtype === 'select_multiple') return renderBar(rows);
    if (qtype === 'text') return renderResponses(rows);
    if (qtype === 'time' || qtype === 'numeric') return renderStats(qtype, rows);
    if (qtype === 'gps') return renderGpsMap(rows);

    // Fallback heuristics
    if (rows.some(isOptionRow)) return renderBar(rows);
    if (rows.some(isResponseRow)) return renderResponses(rows);
    return renderStats(qtype, rows);
  };

  if (!frame) {
    return <div style={containerStyle}>No data</div>;
  }

  return (
    <div style={containerStyle}>
      {groups.length === 0 ? (
        <div style={{ padding: 12 }}>No data</div>
      ) : (
        groups.map(([qn, rows]) => {
          const qtype = String(rows.find((r) => r.question_type)?.question_type ?? '');
          const qtext = String(rows.find((r) => r.question_text)?.question_text ?? `Question ${qn}`);

          return (
            <div key={qn} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px' }}>
                <Badge text={`Q${qn}`} color="blue" />
                {qtype && <Badge text={qtype} color="green" />}
                <div style={{ fontWeight: 600 }}>{qtext}</div>
              </div>

              {renderByType(qtype, rows)}
            </div>
          );
        })
      )}
    </div>
  );
};