// Arrears deep-dive + Custom Analysis builder
const { useState: xState, useMemo: xMemo } = React;

// ===================================================================
// ARREARS VIEW — dedicated deep-dive
// ===================================================================
function ArrearsView({ data, districts, scopeLabel }) {
  const months = data.months;
  const last = months.length - 1;

  // Per-district current arrears
  const current = districts.map(d => ({
    d,
    arrears: data.arrears[d][last],
    customers: data.customers[d][last],
    billing: data.billing[d][last],
    collection: data.collection[d][last],
  }));
  const totalArrears = current.reduce((a, r) => a + (r.arrears || 0), 0);
  const totalCust    = current.reduce((a, r) => a + (r.customers || 0), 0);

  // MoM change in arrears
  const change = districts.map(d => {
    const a = data.arrears[d][last];
    const b = data.arrears[d][last-1];
    return { d, abs: (a-b), pct: b ? ((a-b)/b*100) : 0, total: a };
  });

  // Cumulative arrears stacked area
  const stackedDs = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: data.arrears[d],
    borderColor: CHART_COLORS.districts[d],
    backgroundColor: CHART_COLORS.districts[d] + '60',
    fill: true, borderWidth: 1.5, pointRadius: 0,
  }));

  // Bill - Collection delta per month (net new arrears)
  const deltaDs = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: months.map((_, i) => {
      const b = data.billing[d][i]; const c = data.collection[d][i];
      return (b != null && c != null) ? (b - c) : null;
    }),
    backgroundColor: CHART_COLORS.districts[d],
    borderWidth: 0,
  }));

  // Arrears as months-of-billing (how many months of billing are sitting uncollected)
  const monthsOfBilling = districts.map(d => {
    const arr = data.arrears[d][last];
    // avg last 3 months billing
    const recent = data.billing[d].slice(Math.max(0, last-2), last+1).filter(v => v != null);
    const avgBill = recent.reduce((a,v) => a+v, 0) / (recent.length || 1);
    return { d, value: avgBill ? (arr / avgBill) : 0, avgBill, arrears: arr };
  });

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">ARREARS &amp; RECEIVABLES</div>
          <h2 className="sh-title">Outstanding debt analysis · {scopeLabel}</h2>
        </div>
        <div className="sh-callout warn">
          <b>Regional total ({months[last]}):</b> {fmtMoney(totalArrears)} &nbsp;·&nbsp; {fmtMoney(totalArrears / (totalCust || 1))} per customer
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total outstanding" value={fmtMoney(totalArrears)} sub={"across " + districts.length + " districts"} tone="bad" />
        <KpiCard label="Per customer (avg)" value={fmtMoney(totalArrears / (totalCust || 1))} sub={fmtNum(totalCust) + " customers"} tone="warn" />
        <KpiCard label="MoM change" value={fmtMoney(change.reduce((a,r) => a + r.abs, 0))} sub="vs last month" tone={change.reduce((a,r) => a + r.abs, 0) > 0 ? 'bad' : 'good'} />
        <KpiCard label="Months of billing" value={(monthsOfBilling.reduce((a,r) => a + r.arrears, 0) / monthsOfBilling.reduce((a,r) => a + r.avgBill, 0)).toFixed(1) + ' mo'} sub="arrears ÷ avg monthly billing" tone="warn" />
      </div>

      <ArrearsSmallMultiples data={data} districts={districts} />

      <div className="chart-row two-col">
        <div className="chart-card span-2">
          <div className="cc-head"><div><div className="cc-title">Cumulative arrears — stacked</div><div className="cc-sub">Total receivables building up over time</div></div></div>
          <ChartCanvas type="line"
            data={{ labels: months, datasets: stackedDs }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { datalabels: { display: false }, legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtMoney(c.parsed.y) } } },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { stacked: true, grid: { color: CHART_COLORS.gridline }, ticks: { callback: v => 'GHS '+(v/1e6).toFixed(0)+'M', font: { size: 10 } } }
              }
            }} height={300} />
        </div>
      </div>

      <div className="chart-row two-col">
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">Net new arrears per month</div><div className="cc-sub">Billed − Collected · positive = debt growing</div></div></div>
          <ChartCanvas type="bar"
            data={{ labels: months, datasets: deltaDs }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { datalabels: { display: false }, legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtMoney(c.parsed.y) } } },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { stacked: true, grid: { color: CHART_COLORS.gridline }, ticks: { callback: v => 'GHS '+(v/1e6).toFixed(1)+'M', font: { size: 10 } } }
              }
            }} height={280} />
        </div>
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">Arrears in months-of-billing</div><div className="cc-sub">Risk metric: how many months of billing sit uncollected</div></div></div>
          <div className="vs-target-list">
            {monthsOfBilling.sort((a,b) => b.value - a.value).map(r => (
              <div key={r.d} className="vs-row">
                <div className="vs-name">{r.d}</div>
                <div className="vs-bar">
                  <div className="vs-actual" style={{ width: Math.min(100, r.value/24*100) + '%', background: r.value > 12 ? CHART_COLORS.red : r.value > 6 ? CHART_COLORS.amber : CHART_COLORS.green }} />
                  <div className="vs-target" style={{ left: '25%' }} title="6 months — healthy threshold" />
                  <div className="vs-target" style={{ left: '50%' }} title="12 months — critical threshold" />
                </div>
                <div className="vs-val">{r.value.toFixed(1)} mo</div>
              </div>
            ))}
          </div>
          <div className="cc-foot">Vertical markers at 6 months (healthy) and 12 months (critical). Bars beyond critical indicate severe aged debt requiring write-off or aggressive recovery.</div>
        </div>
      </div>

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">MoM movement · {months[last-1]} → {months[last]}</div><div className="cc-sub">Where arrears grew or shrunk last month</div></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>District</th><th className="num">{months[last-1]}</th><th className="num">{months[last]}</th><th className="num">Δ Absolute</th><th className="num">Δ %</th><th></th></tr></thead>
            <tbody>
              {change.sort((a,b) => b.abs - a.abs).map(r => {
                const prev = data.arrears[r.d][last-1];
                const cur = data.arrears[r.d][last];
                return (
                  <tr key={r.d}>
                    <td><span className="dist-dot" style={{background: CHART_COLORS.districts[r.d]}}/>{r.d}</td>
                    <td className="num">{fmtMoney(prev)}</td>
                    <td className="num">{fmtMoney(cur)}</td>
                    <td className={"num " + (r.abs > 0 ? 'neg' : 'pos')}>{r.abs > 0 ? '+' : ''}{fmtMoney(r.abs)}</td>
                    <td className={"num " + (r.pct > 0 ? 'neg' : 'pos')}>{r.pct > 0 ? '▲' : '▼'} {Math.abs(r.pct).toFixed(1)}%</td>
                    <td><span className="trend-pill" style={{ background: r.abs > 0 ? 'oklch(95% 0.06 25)' : 'oklch(95% 0.06 150)', color: r.abs > 0 ? CHART_COLORS.red : CHART_COLORS.green }}>{r.abs > 0 ? 'Worsening' : 'Improving'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// CUSTOM ANALYSIS BUILDER — pick any metrics × districts
// ===================================================================
const METRIC_OPTIONS = [
  { id: 'customers',       label: 'Customers',           series: 'customers',       unit: '#',    fmt: fmtNum,    color: 'oklch(45% 0.13 235)' },
  { id: 'unbilled',        label: 'Unbilled customers',  series: 'unbilled',        unit: '#',    fmt: fmtNum,    color: 'oklch(60% 0.13 175)' },
  { id: 'meteringRatio',   label: 'Metering ratio',      series: 'meteringRatio',   unit: '%',    fmt: v => fmtPct(v*100, 2), scale: 100, color: 'oklch(60% 0.14 70)' },
  { id: 'totalSales',      label: 'Water sales',         series: 'totalSales',      unit: 'm³',   fmt: fmtM3,     color: 'oklch(45% 0.13 235)' },
  { id: 'siv',             label: 'SIV (system input)',  series: 'siv',             unit: 'm³',   fmt: fmtM3,     color: 'oklch(55% 0.02 240)' },
  { id: 'nrwM3',           label: 'NRW (volume)',        series: 'nrwM3',           unit: 'm³',   fmt: fmtM3,     color: 'oklch(58% 0.18 25)' },
  { id: 'nrwPct',          label: 'NRW %',               series: 'nrwPct',          unit: '%',    fmt: v => fmtPct(v*100, 1), scale: 100, color: 'oklch(58% 0.18 25)' },
  { id: 'billing',         label: 'Billing',             series: 'billing',         unit: 'GHS',  fmt: fmtMoney,  color: 'oklch(45% 0.13 235)' },
  { id: 'collection',      label: 'Collection',          series: 'collection',      unit: 'GHS',  fmt: fmtMoney,  color: 'oklch(60% 0.12 195)' },
  { id: 'collectionRatio', label: 'Collection ratio',    series: 'collectionRatio', unit: '%',    fmt: v => fmtPct(v, 1),     color: 'oklch(58% 0.13 150)' },
  { id: 'arrears',         label: 'Arrears',             series: 'arrears',         unit: 'GHS',  fmt: fmtMoney,  color: 'oklch(70% 0.14 70)' },
];

const PRESETS = [
  { id: 'siv-vs-nrw', label: 'SIV vs NRW',           metrics: ['siv','nrwM3'],            districts: 'all', chart: 'line' },
  { id: 'bill-coll',  label: 'Billing vs Collection',metrics: ['billing','collection'],   districts: 'all', chart: 'line' },
  { id: 'sales-bill', label: 'Sales vs Billing',     metrics: ['totalSales','billing'],   districts: 'all', chart: 'line' },
  { id: 'nrw-coll',   label: 'NRW % vs Coll ratio',  metrics: ['nrwPct','collectionRatio'], districts: 'all', chart: 'line' },
  { id: 'cust-meter', label: 'Customers vs Metering',metrics: ['customers','meteringRatio'], districts: 'all', chart: 'line' },
  { id: 'arr-bill',   label: 'Arrears vs Billing',   metrics: ['arrears','billing'],      districts: 'all', chart: 'line' },
];

function CustomAnalysisView({ data, districts }) {
  const [selected, setSelected] = xState(['siv', 'nrwM3']);
  const [selDistricts, setSelDistricts] = xState(districts);
  const [chartType, setChartType] = xState('line');
  const [aggregate, setAggregate] = xState('byDistrict'); // 'byDistrict' or 'regional'
  const [from, setFrom] = xState(0);
  const [to, setTo] = xState(data.months.length - 1);

  const months = data.months;

  // Sync visible districts when prop changes (role/filter)
  xMemo(() => { setSelDistricts(prev => prev.filter(d => districts.includes(d)).length ? prev.filter(d => districts.includes(d)) : districts); }, [districts.join('|')]);

  const toggleMetric = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : (s.length >= 4 ? s : [...s, id]));
  const toggleDistrict = (d) => setSelDistricts(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d]);
  const applyPreset = (p) => {
    setSelected(p.metrics);
    setSelDistricts(p.districts === 'all' ? districts : p.districts);
    setChartType(p.chart);
  };

  const trimmedMonths = months.slice(from, to + 1);

  const datasets = xMemo(() => {
    const ds = [];
    const seriesShade = (base, i, total) => {
      // shift lightness/chroma slightly per series
      return base;
    };
    // We may need multiple Y axes if units differ. Build axis map.
    const axisByUnit = {};
    let yIdx = 0;
    for (const mId of selected) {
      const m = METRIC_OPTIONS.find(x => x.id === mId);
      if (!(m.unit in axisByUnit)) {
        axisByUnit[m.unit] = yIdx === 0 ? 'y' : ('y' + yIdx);
        yIdx++;
      }
    }
    if (aggregate === 'regional') {
      // Sum or avg across selected districts
      for (let i = 0; i < selected.length; i++) {
        const m = METRIC_OPTIONS.find(x => x.id === selected[i]);
        const sIs = ['meteringRatio','nrwPct','collectionRatio'];
        const avg = sIs.includes(m.id);
        const series = months.map((_, idx) => {
          let sum = 0, count = 0;
          for (const d of selDistricts) {
            const v = data[m.series]?.[d]?.[idx];
            if (v != null) { sum += v; count++; }
          }
          return count ? (avg ? sum/count : sum) : null;
        }).slice(from, to+1);
        const c = m.color;
        ds.push({
          label: m.label + (avg ? ' (avg)' : ' (sum)'),
          data: series,
          borderColor: c,
          backgroundColor: c + '20',
          fill: chartType === 'area',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
          yAxisID: axisByUnit[m.unit],
          type: chartType === 'bar' ? 'bar' : 'line',
        });
      }
    } else {
      // byDistrict: each metric × district = its own line
      const dashes = [[], [4,3], [8,3], [2,2]];
      for (let i = 0; i < selected.length; i++) {
        const m = METRIC_OPTIONS.find(x => x.id === selected[i]);
        for (let j = 0; j < selDistricts.length; j++) {
          const d = selDistricts[j];
          const series = data[m.series]?.[d]?.slice(from, to+1) || [];
          ds.push({
            label: m.label + ' · ' + d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
            data: series,
            borderColor: CHART_COLORS.districts[d],
            backgroundColor: CHART_COLORS.districts[d] + '20',
            borderDash: dashes[i] || [],
            fill: chartType === 'area' && i === 0,
            borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 4,
            yAxisID: axisByUnit[m.unit],
            type: chartType === 'bar' ? 'bar' : 'line',
          });
        }
      }
    }
    return { ds, axisByUnit };
  }, [selected.join('|'), selDistricts.join('|'), aggregate, from, to, chartType]);

  // Build scales: one Y per distinct unit
  const scales = { x: { grid: { display: false }, ticks: { font: { size: 10 } } } };
  Object.entries(datasets.axisByUnit).forEach(([unit, axisId], i) => {
    const m = METRIC_OPTIONS.find(x => x.unit === unit);
    scales[axisId] = {
      position: i === 0 ? 'left' : 'right',
      grid: i === 0 ? { color: CHART_COLORS.gridline } : { display: false },
      ticks: {
        font: { size: 10 },
        callback: v => {
          if (unit === 'GHS') return 'GHS '+(v/1e6).toFixed(1)+'M';
          if (unit === 'm³') return (v/1e6).toFixed(1)+'M m³';
          if (unit === '%') return (m.scale ? v : v).toFixed(0)+'%';
          if (unit === '#') return (v/1000).toFixed(0)+'K';
          return v;
        }
      },
      title: { display: true, text: unit, font: { size: 11 }, color: CHART_COLORS.slate }
    };
  });

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">CUSTOM ANALYSIS</div>
          <h2 className="sh-title">Build your own comparison</h2>
          <p className="sh-desc">Pick any 1–4 metrics and any combination of districts to chart them side by side. Different units automatically get their own Y-axis. Save common combinations as presets below.</p>
        </div>
      </div>

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">Quick presets</div><div className="cc-sub">Common analytical combinations</div></div></div>
        <div className="preset-grid">
          {PRESETS.map(p => (
            <button key={p.id} className="preset-btn" onClick={() => applyPreset(p)}>
              <div className="preset-label">{p.label}</div>
              <div className="preset-metrics">
                {p.metrics.map(mid => {
                  const m = METRIC_OPTIONS.find(x => x.id === mid);
                  return <span key={mid} className="preset-chip" style={{ background: m.color + '15', color: m.color }}>{m.label}</span>;
                })}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">Configure analysis</div><div className="cc-sub">{selected.length}/4 metrics selected · {selDistricts.length} districts · {trimmedMonths.length} months</div></div></div>

        <div className="builder-grid">
          <div className="builder-section">
            <div className="builder-title">METRICS</div>
            <div className="builder-chips">
              {METRIC_OPTIONS.map(m => (
                <button key={m.id} className={"builder-chip " + (selected.includes(m.id) ? 'on' : '')} onClick={() => toggleMetric(m.id)}
                  style={selected.includes(m.id) ? { background: m.color, borderColor: m.color, color: 'white' } : null}>
                  {m.label} <em>({m.unit})</em>
                </button>
              ))}
            </div>
          </div>

          <div className="builder-section">
            <div className="builder-title">DISTRICTS</div>
            <div className="builder-chips">
              {districts.map(d => (
                <button key={d} className={"builder-chip " + (selDistricts.includes(d) ? 'on' : '')} onClick={() => toggleDistrict(d)}
                  style={selDistricts.includes(d) ? { background: CHART_COLORS.districts[d], borderColor: CHART_COLORS.districts[d], color: 'white' } : null}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="builder-section">
            <div className="builder-title">DISPLAY</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {['line','bar','area'].map(t => (
                <button key={t} className={"builder-chip " + (chartType === t ? 'on' : '')} onClick={() => setChartType(t)}
                  style={chartType === t ? { background: CHART_COLORS.primary, borderColor: CHART_COLORS.primary, color: 'white' } : null}>
                  {t}
                </button>
              ))}
              <span style={{borderLeft:'1px solid var(--line)',margin:'0 4px'}}/>
              {[['byDistrict','By district'],['regional','Regional (aggregated)']].map(([v,l]) => (
                <button key={v} className={"builder-chip " + (aggregate === v ? 'on' : '')} onClick={() => setAggregate(v)}
                  style={aggregate === v ? { background: CHART_COLORS.primary, borderColor: CHART_COLORS.primary, color: 'white' } : null}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="builder-section">
            <div className="builder-title">TIME RANGE — {months[from]} → {months[to]}</div>
            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <label style={{fontSize:11,color:'var(--ink-3)'}}>From</label>
              <select value={from} onChange={e => setFrom(parseInt(e.target.value))} style={{padding:'4px 8px',border:'1px solid var(--line-strong)',borderRadius:'var(--r-sm)'}}>
                {months.map((m,i) => i <= to && <option key={i} value={i}>{m}</option>)}
              </select>
              <label style={{fontSize:11,color:'var(--ink-3)'}}>To</label>
              <select value={to} onChange={e => setTo(parseInt(e.target.value))} style={{padding:'4px 8px',border:'1px solid var(--line-strong)',borderRadius:'var(--r-sm)'}}>
                {months.map((m,i) => i >= from && <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="chart-card" style={{textAlign:'center',padding:'60px 20px',color:'var(--ink-3)'}}>
          Select one or more metrics above to build your analysis.
        </div>
      ) : (
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">{selected.map(s => METRIC_OPTIONS.find(m => m.id === s).label).join(' × ')}</div><div className="cc-sub">{aggregate === 'regional' ? 'Aggregated across ' : 'By '} {selDistricts.length} district{selDistricts.length > 1 ? 's' : ''}</div></div></div>
          <ChartCanvas type="line"
            data={{ labels: trimmedMonths, datasets: datasets.ds }}
            options={{
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { datalabels: { display: false }, legend: { position: 'top', align: 'end', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: (c) => {
                  const m = METRIC_OPTIONS.find(x => c.dataset.label.startsWith(x.label));
                  return c.dataset.label + ': ' + (c.parsed.y == null ? '—' : (m ? m.fmt(c.parsed.y) : c.parsed.y));
                }}}
              },
              scales,
            }}
            height={360} />

          <div className="cc-foot">
            <b>Reading multi-axis charts:</b> when units differ, each metric is plotted against its own Y-axis (shown in the axis title). Compare <em>direction and shape</em> of curves rather than absolute heights when the axes don't match.
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">Data snapshot · {months[to]}</div><div className="cc-sub">Latest values in the selected range</div></div></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>District</th>{selected.map(sid => { const m = METRIC_OPTIONS.find(x => x.id === sid); return <th key={sid} className="num">{m.label}</th>; })}</tr>
              </thead>
              <tbody>
                {selDistricts.map(d => (
                  <tr key={d}>
                    <td><span className="dist-dot" style={{background: CHART_COLORS.districts[d]}}/>{d}</td>
                    {selected.map(sid => {
                      const m = METRIC_OPTIONS.find(x => x.id === sid);
                      const v = data[m.series]?.[d]?.[to];
                      return <td key={sid} className="num">{v == null ? '—' : m.fmt(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ArrearsView, CustomAnalysisView, METRIC_OPTIONS });
