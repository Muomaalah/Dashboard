// Dashboard analytical views
const { useState: vState, useMemo: vMemo, useEffect: vEffect } = React;

// ---- Helpers to merge user-added entries with base data ----
// (lifecycle.jsx overrides window.loadOverrides to filter to approved entries)
function loadOverrides() { return window.__Store.get('entries', []); }
function saveOverrides(arr) { window.__Store.set('entries', arr); }

function buildDataset(base, overrides) {
  // Deep-ish clone
  const D = JSON.parse(JSON.stringify(base));
  // Sort overrides by date so we apply oldest first
  const sorted = [...overrides].sort((a,b) => a.month.localeCompare(b.month));
  for (const e of sorted) {
    const midx = D.months.indexOf(e.monthLabel);
    if (midx === -1) {
      // Append new month
      D.months.push(e.monthLabel);
      const newIdx = D.months.length - 1;
      // Pad every series with nulls so indexes align
      const pad = obj => { if (!obj) return; for (const k of Object.keys(obj)) obj[k].push(null); };
      pad(D.customers); pad(D.unbilled); pad(D.meteringRatio);
      pad(D.totalSales); pad(D.billing); pad(D.collection); pad(D.collectionRatio); pad(D.arrears);
      pad(D.siv); pad(D.nrwM3); pad(D.nrwPct);
    }
    const idx = D.months.indexOf(e.monthLabel);
    const d = e.district;
    const setAt = (series, val) => {
      if (val === '' || val == null || isNaN(Number(val))) return;
      if (series && series[d]) series[d][idx] = Number(val);
    };
    setAt(D.customers, e.customers);
    setAt(D.unbilled, e.unbilled);
    setAt(D.totalSales, e.sales);
    setAt(D.billing, e.billing);
    setAt(D.collection, e.collection);
    setAt(D.siv, e.siv);
    // Derived
    if (e.customers && e.unbilled) {
      D.meteringRatio[d][idx] = (1 - Number(e.unbilled)/Number(e.customers));
    }
    if (e.billing && e.collection) {
      D.collectionRatio[d][idx] = (Number(e.collection)/Number(e.billing)) * 100;
    }
    if (e.siv && e.sales) {
      const nrwAbs = Number(e.siv) - Number(e.sales);
      D.nrwM3[d][idx] = nrwAbs;
      D.nrwPct[d][idx] = nrwAbs / Number(e.siv);
    }
  }
  // Recompute regional totals/averages on changed months
  const recompTotals = () => {
    const districts = D.districts;
    const len = D.months.length;
    const sumSeries = (s) => {
      if (!s) return;
      s.TOTAL = new Array(len).fill(0).map((_,i) => {
        let sum = 0; let any = false;
        for (const d of districts) { const v = s[d]?.[i]; if (v != null) { sum += v; any = true; } }
        return any ? sum : null;
      });
    };
    sumSeries(D.customers); sumSeries(D.unbilled);
    sumSeries(D.totalSales); sumSeries(D.billing); sumSeries(D.collection); sumSeries(D.arrears);
    sumSeries(D.siv); sumSeries(D.nrwM3);
    // Collection ratio total
    D.collectionRatio.TOTAL = new Array(len).fill(0).map((_,i) => {
      const b = D.billing.TOTAL[i]; const c = D.collection.TOTAL[i];
      return (b && c) ? (c/b*100) : null;
    });
    D.nrwPct['REGIONAL AVERAGE'] = new Array(len).fill(0).map((_,i) => {
      const sales = D.totalSales.TOTAL[i]; const siv = D.siv.TOTAL[i];
      return (siv && sales!=null) ? ((siv - sales)/siv) : null;
    });
  };
  recompTotals();
  return D;
}

// ===================================================================
// KPI CARD
// ===================================================================
function KpiCard({ label, value, sub, delta, deltaLabel, accent, tone='neutral', icon }) {
  const toneClass = tone === 'good' ? 'kpi-good' : tone === 'bad' ? 'kpi-bad' : tone === 'warn' ? 'kpi-warn' : '';
  return (
    <div className={"kpi-card " + toneClass} style={accent ? { borderTopColor: accent } : null}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon">{icon}</span>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {sub && <span className="kpi-sub">{sub}</span>}
        {delta != null && (
          <span className={"kpi-delta " + (delta >= 0 ? 'pos' : 'neg')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            {deltaLabel && <span className="kpi-dl"> {deltaLabel}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

// ===================================================================
// OVERVIEW VIEW
// ===================================================================
function OverviewView({ data, districts, scopeLabel }) {
  const months = data.months;
  const last = months.length - 1;
  const prev = last - 1;
  const yoy = last - 12; // 12 months ago
  const { focusDistrict, focusMonth, toggleDistrict, toggleMonth } = useFilters();

  // If a month is focused (and is in range), use it as "current"; else use last
  const focusIdx = focusMonth ? months.indexOf(focusMonth) : -1;
  const curIdx = focusIdx >= 0 ? focusIdx : last;
  const prevIdx = curIdx - 1;
  const yoyIdx = curIdx - 12;

  // If a district is focused, narrow aggregation to it
  const effDistricts = focusDistrict && districts.includes(focusDistrict) ? [focusDistrict] : districts;

  // Aggregate by visible districts
  const agg = (series, idx) => {
    let sum = 0, any = false;
    for (const d of effDistricts) { const v = series?.[d]?.[idx]; if (v != null) { sum += v; any = true; } }
    return any ? sum : null;
  };

  const cur = {
    customers: agg(data.customers, curIdx),
    unbilled: agg(data.unbilled, curIdx),
    sales: agg(data.totalSales, curIdx),
    billing: agg(data.billing, curIdx),
    collection: agg(data.collection, curIdx),
    arrears: agg(data.arrears, curIdx),
    siv: agg(data.siv, curIdx),
    nrwM3: agg(data.nrwM3, curIdx),
  };
  const pv = {
    customers: agg(data.customers, prevIdx),
    sales: agg(data.totalSales, prevIdx),
    billing: agg(data.billing, prevIdx),
    collection: agg(data.collection, prevIdx),
    arrears: agg(data.arrears, prevIdx),
  };
  const yo = {
    sales: yoyIdx >= 0 ? agg(data.totalSales, yoyIdx) : null,
    billing: yoyIdx >= 0 ? agg(data.billing, yoyIdx) : null,
    collection: yoyIdx >= 0 ? agg(data.collection, yoyIdx) : null,
  };
  const collRatio = cur.billing ? (cur.collection / cur.billing * 100) : null;
  const nrwPct = cur.siv ? (cur.nrwM3 / cur.siv * 100) : null;
  const meteringPct = cur.customers ? ((1 - cur.unbilled / cur.customers) * 100) : null;

  const pct = (a, b) => (a != null && b != null && b !== 0) ? ((a-b)/b*100) : null;

  // Build monthly trend datasets (regional aggregate over visible districts)
  const monthly = vMemo(() => {
    const m = months.map((_, i) => ({
      label: months[i],
      sales: agg(data.totalSales, i),
      billing: agg(data.billing, i),
      collection: agg(data.collection, i),
      siv: agg(data.siv, i),
      nrwM3: agg(data.nrwM3, i),
    }));
    return m;
  }, [data, effDistricts.join('|')]);

  // Chart click handlers - clicking a point sets focusMonth
  const monthClickOpts = (extra = {}) => lineOpts({
    endLabels: true,
    onClick: (e, elements) => {
      if (!elements || elements.length === 0) return;
      const idx = elements[0].index;
      if (idx != null && months[idx]) toggleMonth(months[idx]);
    },
    ...extra,
  });

  // ---- CHART: Billing vs Collection ----
  const bcChart = {
    data: {
      labels: months,
      datasets: [
        { label: 'Billing', data: monthly.map(x => x.billing), borderColor: CHART_COLORS.primary, backgroundColor: CHART_COLORS.primaryS, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Collection', data: monthly.map(x => x.collection), borderColor: CHART_COLORS.teal, backgroundColor: CHART_COLORS.tealS, fill: false, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, borderDash: [4,3] },
      ]
    },
    options: monthClickOpts({ yTicks: { callback: v => 'GHS '+(v/1e6).toFixed(1)+'M' }, tooltipCallbacks: { label: c => c.dataset.label + ': ' + fmtMoney(c.parsed.y) } })
  };

  // ---- CHART: Sales vs SIV (Volume) ----
  const volChart = {
    data: {
      labels: months,
      datasets: [
        { label: 'SIV (Input)', data: monthly.map(x => x.siv), borderColor: CHART_COLORS.slate, backgroundColor: 'oklch(55% 0.02 240 / 0.1)', fill: true, borderWidth: 1.5, pointRadius: 0 },
        { label: 'Billed sales', data: monthly.map(x => x.sales), borderColor: CHART_COLORS.primary, backgroundColor: CHART_COLORS.primaryS, fill: true, borderWidth: 2, pointRadius: 0 },
      ]
    },
    options: monthClickOpts({ yTicks: { callback: v => (v/1e6).toFixed(1)+'M m³' }, tooltipCallbacks: { label: c => c.dataset.label + ': ' + fmtM3(c.parsed.y) } })
  };

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">PERFORMANCE OVERVIEW</div>
          <h2 className="sh-title">{months[curIdx]} · {focusDistrict || scopeLabel}</h2>
          <p className="sh-desc" style={{fontSize:12, color:'var(--ink-3)', marginTop:6}}>💡 Click any KPI card, district, or chart point to cross-filter the dashboard.</p>
        </div>
        <div className="sh-meta">
          <div className="meta-chip"><span>Coverage</span><b>{months[0]} → {months[last]}</b></div>
          <div className="meta-chip"><span>Districts in scope</span><b>{effDistricts.length}{focusDistrict ? ' (focused)' : ''}</b></div>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Active customers" value={fmtNum(cur.customers)} sub={"Metering "+fmtPct(meteringPct)} delta={pct(cur.customers, pv.customers)} deltaLabel="MoM" tone={meteringPct >= 95 ? 'good' : 'warn'} />
        <KpiCard label="Water sales" value={fmtM3(cur.sales)} sub="this month" delta={pct(cur.sales, yo.sales)} deltaLabel="YoY" tone="neutral" />
        <KpiCard label="Billing" value={fmtMoney(cur.billing)} sub="this month" delta={pct(cur.billing, yo.billing)} deltaLabel="YoY" tone="neutral" accent={CHART_COLORS.primary} />
        <KpiCard label="Collection" value={fmtMoney(cur.collection)} sub="this month" delta={pct(cur.collection, yo.collection)} deltaLabel="YoY" tone="good" accent={CHART_COLORS.teal} />
        <KpiCard label="Collection ratio" value={fmtPct(collRatio,1)} sub="vs target 100%" tone={collRatio >= 95 ? 'good' : collRatio >= 85 ? 'warn' : 'bad'} />
        <KpiCard label="NRW" value={fmtPct(nrwPct,1)} sub="vs target 36.2%" tone={nrwPct <= 38 ? 'good' : nrwPct <= 45 ? 'warn' : 'bad'} accent={CHART_COLORS.red} />
        <KpiCard label="Outstanding arrears" value={fmtMoney(cur.arrears)} sub="cumulative" tone="bad" accent={CHART_COLORS.amber} />
        <KpiCard label="Metering ratio" value={fmtPct(meteringPct,1)} sub={fmtNum(cur.unbilled) + " unbilled customers"} tone={meteringPct >= 96 ? 'good' : 'warn'} />
      </div>

      <div className="chart-row two-col">
        <div className="chart-card">
          <div className="cc-head">
            <div>
              <div className="cc-title">Billing vs Collection</div>
              <div className="cc-sub">Monthly · GHS · all months in scope</div>
            </div>
            <div className="cc-legend">
              <span><i style={{background: CHART_COLORS.primary}}/>Billed</span>
              <span><i style={{background: CHART_COLORS.teal, borderTop: '2px dashed '+CHART_COLORS.teal}}/>Collected</span>
            </div>
          </div>
          <ChartCanvas type="line" data={bcChart.data} options={bcChart.options} height={260} />
        </div>
        <div className="chart-card">
          <div className="cc-head">
            <div>
              <div className="cc-title">Volume · SIV vs Billed Sales</div>
              <div className="cc-sub">The gap is non-revenue water (NRW)</div>
            </div>
          </div>
          <ChartCanvas type="line" data={volChart.data} options={volChart.options} height={260} />
        </div>
      </div>

      <div className="chart-row two-col">
        <CollectionRatioChart data={data} districts={districts} />
        <NrwTrendChart data={data} districts={districts} />
      </div>

      <DistrictLeagueTable data={data} districts={districts} />
    </div>
  );
}

// ===================================================================
// Small-multiples chart helper — one mini panel per district
// ===================================================================
function SmallMultiplesPanel({ data, districts, series, valueTransform, label, sublabel, format, formatChartTick, targetFn, betterWhen='higher', warnAt }) {
  const { focusDistrict, toggleDistrict } = useFilters();
  const months = data.months;
  const last = months.length - 1;
  const prev = last - 1;
  const [expandedDistrict, setExpandedDistrict] = vState(null);

  const allVals = [];
  for (const d of districts) {
    for (const v of (data[series][d] || [])) if (v != null) allVals.push(v);
  }
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const range = yMax - yMin || 1;
  const pad = range * 0.12;
  const sharedMin = yMin - pad;
  const sharedMax = yMax + pad;

  const summary = districts.map(d => {
    const cur = data[series][d][last];
    const prv = data[series][d][prev];
    const target = targetFn ? targetFn(d) : null;
    const delta = (cur != null && prv != null) ? (cur - prv) : null;
    return { d, cur, prv, delta, target };
  });
  summary.sort((a, b) => betterWhen === 'higher' ? (b.cur||0) - (a.cur||0) : (a.cur||0) - (b.cur||0));

  return (
    <div className="chart-card">
      <div className="cc-head">
        <div>
          <div className="cc-title">{label}</div>
          <div className="cc-sub">{sublabel} · click a panel to expand · click the dot to cross-filter</div>
        </div>
        <div className="sm-legend">
          <span><i style={{background: 'oklch(58% 0.13 150)'}}/>On target</span>
          <span><i style={{background: 'oklch(70% 0.14 70)'}}/>Watch</span>
          <span><i style={{background: 'oklch(58% 0.18 25)'}}/>Off target</span>
        </div>
      </div>

      <div className="sm-grid">
        {summary.map(r => {
          let status = 'good';
          if (r.target != null && r.cur != null) {
            const diff = betterWhen === 'higher' ? (r.target - r.cur) : (r.cur - r.target);
            if (diff > (warnAt ?? 5)) status = 'bad';
            else if (diff > 0) status = 'warn';
          }
          const isFocused = focusDistrict === r.d;
          const isOther = focusDistrict && !isFocused;
          return (
            <div
              key={r.d}
              className={"sm-panel " + status + (isFocused ? ' sm-focused' : '') + (isOther ? ' sm-other' : '')}
              onClick={() => setExpandedDistrict(r.d)}
              style={{ borderTopColor: CHART_COLORS.districts[r.d] }}
            >
              <div className="sm-head">
                <div className="sm-name">
                  <button className="sm-dot-btn" onClick={(e) => { e.stopPropagation(); toggleDistrict(r.d); }} title="Filter dashboard by this district">
                    <span className="dist-dot" style={{background: CHART_COLORS.districts[r.d]}}/>
                  </button>
                  {r.d}
                </div>
                <span className={"sm-status " + status}>{status === 'good' ? '✓ On target' : status === 'warn' ? '◐ Watch' : '⚠ Off target'}</span>
              </div>

              <div className="sm-stat-row">
                <div className="sm-big">
                  <div className="sm-value">{format(r.cur)}</div>
                  <div className="sm-mom">{r.delta == null ? '' : (
                    <span className={(betterWhen==='higher' ? r.delta >= 0 : r.delta <= 0) ? 'pos' : 'neg'}>
                      {r.delta >= 0 ? '▲' : '▼'} {format(Math.abs(r.delta))} MoM
                    </span>
                  )}</div>
                </div>
                {r.target != null && (
                  <div className="sm-target">
                    <div className="sm-tlabel">TARGET</div>
                    <div className="sm-tval">{format(r.target)}</div>
                    <div className={"sm-tdiff " + status}>{(() => {
                      const diff = betterWhen === 'higher' ? (r.cur - r.target) : (r.target - r.cur);
                      return (diff >= 0 ? '+' : '') + format(diff);
                    })()}</div>
                  </div>
                )}
              </div>

              <Sparkline
                data={data[series][r.d]}
                months={months}
                color={CHART_COLORS.districts[r.d]}
                target={r.target}
                yMin={sharedMin} yMax={sharedMax}
              />

              <div className="sm-expand-hint">↗ click to expand</div>
            </div>
          );
        })}
      </div>

      {expandedDistrict && (
        <ExpandedDistrictChart
          district={expandedDistrict}
          data={data}
          series={series}
          valueTransform={valueTransform}
          label={label}
          format={format}
          formatChartTick={formatChartTick}
          target={targetFn ? targetFn(expandedDistrict) : null}
          betterWhen={betterWhen}
          onClose={() => setExpandedDistrict(null)}
        />
      )}
    </div>
  );
}

// ===================================================================
// Expanded chart — full-screen elegant expansion
// ===================================================================
function ExpandedDistrictChart({ district, data, series, valueTransform, label, format, formatChartTick, target, betterWhen, onClose }) {
  const months = data.months;
  const raw = data[series][district];
  const values = valueTransform ? raw.map(valueTransform) : raw;
  const color = CHART_COLORS.districts[district];

  // Mount animation
  vEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const last = values.length - 1;
  const cur = raw[last];
  const validRaw = raw.filter(v => v != null);
  const minRaw = Math.min(...validRaw);
  const maxRaw = Math.max(...validRaw);
  const avgRaw = validRaw.reduce((a,v) => a+v, 0) / validRaw.length;
  const targetTransformed = target != null ? (valueTransform ? valueTransform(target) : target) : null;

  // Status
  let status = 'good';
  let statusLabel = '✓ On target';
  if (target != null && cur != null) {
    const diff = betterWhen === 'higher' ? (target - cur) : (cur - target);
    if (diff > 0) {
      const magnitude = target ? Math.abs(diff / target) : 0;
      if (magnitude > 0.1) { status = 'bad'; statusLabel = '⚠ Off target'; }
      else { status = 'warn'; statusLabel = '◐ Watch'; }
    }
  }

  const datasets = [{
    label: district,
    data: values,
    borderColor: color,
    backgroundColor: color + '18',
    borderWidth: 2.5,
    pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: 'white', pointBorderWidth: 2,
    fill: true,
  }];
  if (targetTransformed != null) {
    datasets.push({
      label: 'Target',
      data: months.map(() => targetTransformed),
      borderColor: 'oklch(45% 0.02 240 / 0.5)',
      borderDash: [6,5], borderWidth: 1.5, pointRadius: 0, fill: false,
      _noLabel: true,
    });
  }

  const tooltipFmt = (v) => {
    if (valueTransform) {
      const test = valueTransform(0.5);
      if (test === 50) return format(v / 100);
    }
    return format(v);
  };

  return (
    <div className="ex-back" onClick={onClose}>
      <div className="ex-stage" onClick={e => e.stopPropagation()}>
        <div className="ex-bar" style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)` }}>
          <div className="ex-bar-left">
            <span className="ex-eyebrow">{label.toUpperCase()}</span>
            <h2 className="ex-title">{district}</h2>
          </div>
          <div className="ex-bar-right">
            <span className={"ex-status ex-status-" + status}>{statusLabel}</span>
            <button className="ex-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        <div className="ex-stats">
          <div className="ex-stat">
            <div className="ex-stat-lbl">{months[last]}</div>
            <div className="ex-stat-big" style={{ color }}>{format(cur)}</div>
            <div className="ex-stat-sub">Current value</div>
          </div>
          {target != null && (
            <div className="ex-stat">
              <div className="ex-stat-lbl">Target</div>
              <div className="ex-stat-big">{format(target)}</div>
              <div className={"ex-stat-sub " + (betterWhen === 'higher' ? (cur >= target ? 'pos' : 'neg') : (cur <= target ? 'pos' : 'neg'))}>
                {(() => {
                  const diff = betterWhen === 'higher' ? (cur - target) : (target - cur);
                  return (diff >= 0 ? '+' : '') + format(diff) + ' vs target';
                })()}
              </div>
            </div>
          )}
          <div className="ex-stat">
            <div className="ex-stat-lbl">Period avg</div>
            <div className="ex-stat-big ex-stat-muted">{format(avgRaw)}</div>
            <div className="ex-stat-sub">{months.length}-month mean</div>
          </div>
          <div className="ex-stat">
            <div className="ex-stat-lbl">Best</div>
            <div className="ex-stat-big pos">{format(betterWhen === 'higher' ? maxRaw : minRaw)}</div>
            <div className="ex-stat-sub">{months[raw.indexOf(betterWhen === 'higher' ? maxRaw : minRaw)]}</div>
          </div>
          <div className="ex-stat">
            <div className="ex-stat-lbl">Worst</div>
            <div className="ex-stat-big neg">{format(betterWhen === 'higher' ? minRaw : maxRaw)}</div>
            <div className="ex-stat-sub">{months[raw.indexOf(betterWhen === 'higher' ? minRaw : maxRaw)]}</div>
          </div>
        </div>

        <div className="ex-chart">
          <ChartCanvas
            type="line"
            data={{ labels: months, datasets }}
            options={lineOpts({
              yTicks: { callback: formatChartTick || ((v) => smartLabelFmt(v)) },
              tooltipCallbacks: { label: c => c.dataset.label + ': ' + (c.parsed.y == null ? '—' : tooltipFmt(c.parsed.y)) },
              plugins: { legend: { display: false } },
            })}
            height={420}
          />
        </div>

        <div className="ex-foot">
          Press <kbd>Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// SVG sparkline — lightweight, no plugin overhead
// ===================================================================
function Sparkline({ data, months, color, target, yMin, yMax }) {
  const W = 320, H = 80, padX = 6, padY = 12;
  const valid = data.map((v, i) => ({ v, i })).filter(p => p.v != null);
  if (valid.length < 2) return <div className="sm-spark-empty">Not enough data</div>;

  const xAt = i => padX + (i / (data.length - 1)) * (W - 2 * padX);
  const yAt = v => H - padY - ((v - yMin) / (yMax - yMin)) * (H - 2 * padY);

  const pathD = valid.map((p, i) => (i === 0 ? 'M' : 'L') + xAt(p.i).toFixed(1) + ',' + yAt(p.v).toFixed(1)).join(' ');
  const areaD = pathD + ' L' + xAt(valid[valid.length-1].i).toFixed(1) + ',' + (H - padY) + ' L' + xAt(valid[0].i).toFixed(1) + ',' + (H - padY) + ' Z';

  const lastPt = valid[valid.length-1];
  const firstPt = valid[0];
  let minPt = valid[0], maxPt = valid[0];
  for (const p of valid) {
    if (p.v < minPt.v) minPt = p;
    if (p.v > maxPt.v) maxPt = p;
  }

  return (
    <div className="sm-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="80">
        {target != null && (
          <line x1={padX} x2={W - padX} y1={yAt(target).toFixed(1)} y2={yAt(target).toFixed(1)}
                stroke={CHART_COLORS.muted} strokeWidth="1" strokeDasharray="3 3" />
        )}
        <path d={areaD} fill={color} fillOpacity="0.10" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={maxPt.i === firstPt.i || maxPt.i === lastPt.i ? -10 : xAt(maxPt.i)} cy={yAt(maxPt.v)} r="2.5" fill={color} />
        <circle cx={minPt.i === firstPt.i || minPt.i === lastPt.i ? -10 : xAt(minPt.i)} cy={yAt(minPt.v)} r="2.5" fill={color} />
        <circle cx={xAt(lastPt.i)} cy={yAt(lastPt.v)} r="3.5" fill="white" stroke={color} strokeWidth="2" />
        <text x={padX} y={H - 1} fontSize="8" fill="oklch(70% 0.02 240)" fontFamily="Geist Mono, monospace">{months[firstPt.i]}</text>
        <text x={W - padX} y={H - 1} textAnchor="end" fontSize="8" fill="oklch(70% 0.02 240)" fontFamily="Geist Mono, monospace">{months[lastPt.i]}</text>
      </svg>
    </div>
  );
}

// ===================================================================
// Collection Ratio chart — small multiples
// ===================================================================
function CollectionRatioChart({ data, districts }) {
  return (
    <SmallMultiplesPanel
      data={data} districts={districts}
      series="collectionRatio"
      label="Collection Ratio by District"
      sublabel="Collection ÷ Billing · target 100%"
      format={(v) => v == null ? '—' : v.toFixed(1) + '%'}
      formatChartTick={(v) => v + '%'}
      targetFn={() => 100}
      betterWhen="higher"
      warnAt={5}
    />
  );
}

// ===================================================================
// NRW trend — small multiples (values stored as decimal, displayed as %)
// ===================================================================
function NrwTrendChart({ data, districts }) {
  const targets = data.targets['2026']?.nrw || {};
  return (
    <SmallMultiplesPanel
      data={data} districts={districts}
      series="nrwPct"
      valueTransform={(v) => v == null ? null : v * 100}
      label="Non-Revenue Water by District"
      sublabel="Lower is better · vs 2026 target"
      format={(v) => v == null ? '—' : (v * 100).toFixed(1) + '%'}
      formatChartTick={(v) => v.toFixed(0) + '%'}
      targetFn={(d) => targets[d] != null ? targets[d] / 100 : null}
      betterWhen="lower"
      warnAt={0.03}
    />
  );
}

// ===================================================================
// Arrears — small multiples
// ===================================================================
function ArrearsSmallMultiples({ data, districts }) {
  // No formal target — use 3× avg monthly billing as "healthy" ceiling
  const targets = {};
  for (const d of districts) {
    const recentBill = data.billing[d].slice(-3).filter(v => v != null);
    const avgBill = recentBill.reduce((a,v) => a+v, 0) / (recentBill.length || 1);
    targets[d] = avgBill * 3;
  }
  return (
    <SmallMultiplesPanel
      data={data} districts={districts}
      series="arrears"
      label="Cumulative Arrears by District"
      sublabel="Aged receivables · target = ≤ 3 months of billing"
      format={(v) => fmtMoney(v)}
      formatChartTick={(v) => 'GHS ' + (v/1e6).toFixed(0) + 'M'}
      targetFn={(d) => targets[d]}
      betterWhen="lower"
      warnAt={100000}
    />
  );
}

// ===================================================================
// District League Table (last month performance) — clickable rows
// ===================================================================
function DistrictLeagueTable({ data, districts }) {
  const { focusDistrict, toggleDistrict } = useFilters();
  const last = data.months.length - 1;
  const lastMonth = data.months[last];
  const year = lastMonth.slice(-2);
  const yearKey = '20' + year;
  const tgt = data.targets[yearKey] || data.targets['2026'];

  const rows = districts.map(d => {
    // Month-to-date = the latest month's figures (data is already monthly)
    const billMTD = data.billing[d][last] || 0;
    const collMTD = data.collection[d][last] || 0;
    const salesMTD = data.totalSales[d][last] || 0;
    const cratio = billMTD ? (collMTD / billMTD * 100) : null;
    const nrwLast = data.nrwPct[d][last] != null ? data.nrwPct[d][last] * 100 : null;
    const arrearsLast = data.arrears[d][last];
    // Compare MTD billing to the monthly target (targets are stored as monthly averages)
    const monthlyTarget = tgt.billing[d] || 0;
    const targetAttain = monthlyTarget ? (billMTD / monthlyTarget * 100) : null;
    return { d, billMTD, collMTD, salesMTD, cratio, nrwLast, arrearsLast, targetAttain, nrwTarget: tgt.nrw[d], monthlyTarget };
  });

  return (
    <div className="chart-card">
      <div className="cc-head">
        <div>
          <div className="cc-title">District league · {lastMonth} (month-to-date)</div>
          <div className="cc-sub">Click a district row to cross-filter the dashboard{focusDistrict ? ' · currently filtering on ' + focusDistrict : ''}</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table clickable">
          <thead>
            <tr>
              <th>District</th>
              <th className="num">MTD Billed</th>
              <th className="num">MTD Collected</th>
              <th className="num">Coll. ratio</th>
              <th className="num">NRW</th>
              <th className="num">Arrears</th>
              <th className="num">Bill vs Monthly Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.sort((a,b) => (b.cratio||0)-(a.cratio||0)).map(r => (
              <tr key={r.d}
                  className={focusDistrict === r.d ? 'row-focus' : (focusDistrict ? 'row-dim' : '')}
                  onClick={() => toggleDistrict(r.d)}>
                <td><span className="dist-dot" style={{background: CHART_COLORS.districts[r.d]}}/>{r.d}</td>
                <td className="num">{fmtMoney(r.billMTD)}</td>
                <td className="num">{fmtMoney(r.collMTD)}</td>
                <td className={"num "+(r.cratio>=95?'pos':r.cratio<85?'neg':'')}>{fmtPct(r.cratio,1)}</td>
                <td className={"num "+(r.nrwLast!=null && r.nrwLast<=r.nrwTarget?'pos':'neg')}>{r.nrwLast!=null ? fmtPct(r.nrwLast,1) : '—'} <span className="vs">vs {fmtPct(r.nrwTarget,1)}</span></td>
                <td className="num neg">{fmtMoney(r.arrearsLast)}</td>
                <td className="num">
                  <span className="bar-cell">
                    <span className="bar-track"><span className="bar-fill" style={{ width: Math.min(100, r.targetAttain||0)+'%', background: r.targetAttain>=100?CHART_COLORS.green:r.targetAttain>=75?CHART_COLORS.amber:CHART_COLORS.red }}/></span>
                    <span className="bar-val">{fmtPct(r.targetAttain,1)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { buildDataset, loadOverrides, saveOverrides, OverviewView, KpiCard, CollectionRatioChart, NrwTrendChart, DistrictLeagueTable, SmallMultiplesPanel, ArrearsSmallMultiples });
