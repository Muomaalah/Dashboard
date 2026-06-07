// Global filter context: period + cross-filter focus (Power BI style)
const { createContext: fCreate, useContext: fUse, useState: fState, useMemo: fMemo, useEffect: fEffect, useRef: fRef } = React;

const FilterContext = fCreate(null);
const useFilters = () => fUse(FilterContext);

function FilterProvider({ children, totalMonths, months }) {
  const [period, setPeriod] = fState({ from: 0, to: totalMonths - 1 });
  const [focusDistrict, setFocusDistrict] = fState(null);
  const [focusMonth, setFocusMonth] = fState(null);

  // Keep period in bounds if months change
  fEffect(() => {
    setPeriod(p => ({
      from: Math.max(0, Math.min(p.from, totalMonths - 1)),
      to: Math.max(0, Math.min(p.to, totalMonths - 1))
    }));
  }, [totalMonths]);

  const toggleDistrict = (d) => setFocusDistrict(prev => prev === d ? null : d);
  const toggleMonth = (m) => setFocusMonth(prev => prev === m ? null : m);
  const clearAll = () => { setFocusDistrict(null); setFocusMonth(null); };

  const value = { period, setPeriod, focusDistrict, focusMonth, toggleDistrict, toggleMonth, setFocusDistrict, setFocusMonth, clearAll, months };
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

// ---------- sliceData: build a data object covering only the period ----------
function sliceData(data, fromIdx, toIdx) {
  const f = Math.max(0, fromIdx);
  const t = Math.min(data.months.length - 1, toIdx);
  const sliceSeries = (s) => {
    if (!s) return s;
    const out = {};
    for (const k of Object.keys(s)) out[k] = (s[k] || []).slice(f, t+1);
    return out;
  };
  return {
    ...data,
    months: data.months.slice(f, t+1),
    customers:       sliceSeries(data.customers),
    unbilled:        sliceSeries(data.unbilled),
    meteringRatio:   sliceSeries(data.meteringRatio),
    totalSales:      sliceSeries(data.totalSales),
    billing:         sliceSeries(data.billing),
    collection:      sliceSeries(data.collection),
    collectionRatio: sliceSeries(data.collectionRatio),
    arrears:         sliceSeries(data.arrears),
    siv:             sliceSeries(data.siv),
    nrwM3:           sliceSeries(data.nrwM3),
    nrwPct:          sliceSeries(data.nrwPct),
    // Keep full targets reference
    targets: data.targets,
  };
}

// ---------- PERIOD PICKER ----------
const PERIOD_PRESETS = [
  { id: '3m',  label: 'Last 3M',  months: 3 },
  { id: '6m',  label: 'Last 6M',  months: 6 },
  { id: '12m', label: 'Last 12M', months: 12 },
  { id: 'ytd', label: 'YTD',      months: 'ytd' },
  { id: 'all', label: 'All',      months: 'all' },
];

function PeriodPicker({ months }) {
  const { period, setPeriod } = useFilters();
  const [open, setOpen] = fState(false);
  const wrapRef = fRef(null);

  fEffect(() => {
    const handle = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const applyPreset = (p) => {
    const last = months.length - 1;
    if (p.months === 'all') setPeriod({ from: 0, to: last });
    else if (p.months === 'ytd') {
      const curYr = months[last].slice(-2);
      const ytdStart = months.findIndex(m => m.endsWith(curYr));
      setPeriod({ from: ytdStart, to: last });
    } else {
      setPeriod({ from: Math.max(0, last - p.months + 1), to: last });
    }
  };

  const activePreset = (() => {
    const last = months.length - 1;
    const span = period.to - period.from + 1;
    if (period.to !== last) return 'custom';
    if (period.from === 0) return 'all';
    if (span === 3) return '3m';
    if (span === 6) return '6m';
    if (span === 12) return '12m';
    const curYr = months[last].slice(-2);
    const ytdStart = months.findIndex(m => m.endsWith(curYr));
    if (period.from === ytdStart) return 'ytd';
    return 'custom';
  })();

  return (
    <div className="period-picker" ref={wrapRef}>
      <button className="period-trigger" onClick={() => setOpen(!open)}>
        <span className="pp-label">PERIOD</span>
        <b>{months[period.from]} → {months[period.to]}</b>
        <span className="pp-caret">▾</span>
      </button>
      {open && (
        <div className="period-pop">
          <div className="pp-presets">
            {PERIOD_PRESETS.map(p => (
              <button key={p.id} className={"pp-preset " + (activePreset === p.id ? 'on' : '')}
                onClick={() => { applyPreset(p); setOpen(false); }}>{p.label}</button>
            ))}
            <button className={"pp-preset " + (activePreset === 'custom' ? 'on' : '')}>Custom</button>
          </div>
          <div className="pp-divider"/>
          <div className="pp-custom">
            <label>From</label>
            <select value={period.from} onChange={e => setPeriod(p => ({ ...p, from: Math.min(parseInt(e.target.value), p.to) }))}>
              {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <label>To</label>
            <select value={period.to} onChange={e => setPeriod(p => ({ ...p, to: Math.max(parseInt(e.target.value), p.from) }))}>
              {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="pp-foot">{period.to - period.from + 1} months selected</div>
        </div>
      )}
    </div>
  );
}

// ---------- FILTER CHIPS (active focus indicators in topbar) ----------
function FilterChips() {
  const { focusDistrict, focusMonth, toggleDistrict, toggleMonth, clearAll } = useFilters();
  if (!focusDistrict && !focusMonth) return null;
  return (
    <div className="filter-chips">
      <span className="fc-label">FILTERING</span>
      {focusDistrict && (
        <button className="fc-chip" onClick={() => toggleDistrict(focusDistrict)}>
          <span className="fc-dot" style={{ background: CHART_COLORS.districts[focusDistrict] }}/>
          {focusDistrict} <span className="fc-x">✕</span>
        </button>
      )}
      {focusMonth && (
        <button className="fc-chip" onClick={() => toggleMonth(focusMonth)}>
          📅 {focusMonth} <span className="fc-x">✕</span>
        </button>
      )}
      <button className="fc-clear" onClick={clearAll}>Clear all</button>
    </div>
  );
}

// ---------- Focus styling helpers ----------
// Annotate datasets with a _district key so applyFocusDim can dim non-focused ones
function tagDatasets(datasets, districtForIndex) {
  return datasets.map((ds, i) => ({ ...ds, _district: districtForIndex(i) }));
}

function applyFocusDim(datasets, focusDistrict) {
  if (!focusDistrict) return datasets;
  return datasets.map(ds => {
    const isFocus = ds._district === focusDistrict;
    if (isFocus) return { ...ds, borderWidth: (ds.borderWidth || 2) + 1, order: -1 };
    return {
      ...ds,
      borderColor:     'oklch(75% 0.01 240 / 0.35)',
      backgroundColor: 'oklch(75% 0.01 240 / 0.05)',
      borderWidth:     1,
      pointRadius:     0,
      _dim:            true,
      order: 1,
    };
  });
}

// Build a chart onClick that toggles focus by clicked dataset's _district
function chartClickToggle(toggleDistrict) {
  return (e, elements, chart) => {
    if (!elements || elements.length === 0) return;
    const ds = chart.data.datasets[elements[0].datasetIndex];
    if (ds && ds._district) toggleDistrict(ds._district);
  };
}

Object.assign(window, {
  FilterProvider, useFilters, FilterContext,
  sliceData, PeriodPicker, FilterChips,
  tagDatasets, applyFocusDim, chartClickToggle,
});
