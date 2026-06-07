// Additional dashboard views: Billing & Collection deep-dive, NRW analysis, Customers, Arrears
const { useState: vsState, useMemo: vsMemo } = React;

// ===================================================================
// BILLING & COLLECTION VIEW
// ===================================================================
function BillingCollectionView({ data, districts, scopeLabel }) {
  const months = data.months;
  const last = months.length - 1;

  // Stacked bar: billing per district + line for collection ratio total
  const billStack = {
    labels: months,
    datasets: districts.map(d => ({
      label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
      data: data.billing[d],
      backgroundColor: CHART_COLORS.districts[d],
      borderColor: 'white', borderWidth: 0.5, stack: 'a'
    }))
  };

  // Per-district billing vs target gauge
  const last12 = months.slice(-12);
  const last12Idx = months.length - 12;

  const collectionEfficiency = districts.map(d => {
    const ratios = data.collectionRatio[d].slice(last12Idx).filter(v => v != null);
    const avg = ratios.reduce((a,v) => a+v, 0) / (ratios.length || 1);
    return { d, avg };
  });

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">BILLING &amp; COLLECTION</div>
          <h2 className="sh-title">Revenue performance · {scopeLabel}</h2>
        </div>
      </div>

      <div className="chart-row two-col">
        <div className="chart-card span-2">
          <div className="cc-head">
            <div><div className="cc-title">Monthly Billing — stacked by district</div><div className="cc-sub">GHS · last 27 months</div></div>
          </div>
          <ChartCanvas type="bar" data={billStack}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { datalabels: { display: false }, legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtMoney(c.parsed.y) } } },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { stacked: true, grid: { color: CHART_COLORS.gridline }, ticks: { callback: v => 'GHS '+(v/1e6).toFixed(1)+'M', font: { size: 10 } } }
              }
            }} height={300} />
        </div>
      </div>

      <div className="chart-row">
        <TargetAttainmentGauges data={data} districts={districts} />
      </div>

      <div className="chart-row two-col">
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">12-month avg collection efficiency</div><div className="cc-sub">Collection ÷ Billing</div></div></div>
          <div className="efficiency-list">
            {collectionEfficiency.sort((a,b) => b.avg-a.avg).map(r => (
              <div key={r.d} className="eff-row">
                <span className="eff-label"><span className="dist-dot" style={{background: CHART_COLORS.districts[r.d]}}/>{r.d}</span>
                <span className="eff-bar"><span className="eff-fill" style={{ width: Math.min(120, r.avg)/1.2 + '%', background: r.avg>=95?CHART_COLORS.green:r.avg>=85?CHART_COLORS.amber:CHART_COLORS.red }}/></span>
                <span className="eff-val">{fmtPct(r.avg,1)}</span>
              </div>
            ))}
          </div>
          <div className="cc-foot">A ratio above 100% means more was collected than billed in that period (recovering older arrears). Below 85% signals an active collection problem.</div>
        </div>

        <CollectionRatioChart data={data} districts={districts} />
      </div>

      <ArrearsAnalysis data={data} districts={districts} />
    </div>
  );
}

// ===================================================================
// Target attainment gauges
// ===================================================================
function TargetAttainmentGauges({ data, districts }) {
  const months = data.months;
  const last = months.length - 1;
  const year = '20' + months[last].slice(-2);
  const tgt = data.targets[year];
  const ytdStart = months.findIndex(m => m.endsWith(months[last].slice(-2)));

  return (
    <div className="chart-card">
      <div className="cc-head">
        <div><div className="cc-title">{year} YTD — Target attainment</div><div className="cc-sub">Cumulative actual ÷ annual target (linear pacing)</div></div>
      </div>
      <div className="gauge-grid">
        {districts.map(d => {
          const billYTD = data.billing[d].slice(ytdStart, last+1).reduce((a,v) => a+(v||0), 0);
          const collYTD = data.collection[d].slice(ytdStart, last+1).reduce((a,v) => a+(v||0), 0);
          const monthsInYear = last - ytdStart + 1;
          const linearPace = monthsInYear / 12; // expected progress
          // Targets are monthly averages — annual = monthly × 12
          const annualBillTarget = tgt.billing[d] * 12;
          const annualCollTarget = tgt.collection[d] * 12;
          const billPct = annualBillTarget ? (billYTD / annualBillTarget * 100) : 0;
          const collPct = annualCollTarget ? (collYTD / annualCollTarget * 100) : 0;
          const pacePct = linearPace * 100;
          return (
            <div key={d} className="gauge-card" style={{ borderLeftColor: CHART_COLORS.districts[d] }}>
              <div className="gauge-title">{d}</div>
              <div className="gauge-row">
                <div className="gauge-lbl">Billing</div>
                <div className="gauge-bar">
                  <div className="gauge-fill" style={{ width: Math.min(100, billPct)+'%', background: billPct>=pacePct?CHART_COLORS.green:CHART_COLORS.amber }} />
                  <div className="gauge-pace" style={{ left: pacePct+'%' }} />
                </div>
                <div className="gauge-val">{fmtPct(billPct,0)}</div>
              </div>
              <div className="gauge-row">
                <div className="gauge-lbl">Collection</div>
                <div className="gauge-bar">
                  <div className="gauge-fill" style={{ width: Math.min(100, collPct)+'%', background: collPct>=pacePct?CHART_COLORS.green:CHART_COLORS.amber }} />
                  <div className="gauge-pace" style={{ left: pacePct+'%' }} />
                </div>
                <div className="gauge-val">{fmtPct(collPct,0)}</div>
              </div>
              <div className="gauge-foot">Annual target: {fmtMoney(tgt.billing[d] * 12)} (monthly {fmtMoney(tgt.billing[d])}) · expected pace {fmtPct(pacePct,0)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================================
// Arrears analysis
// ===================================================================
function ArrearsAnalysis({ data, districts }) {
  const months = data.months;
  const last = months.length - 1;
  const ds = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: data.arrears[d],
    borderColor: CHART_COLORS.districts[d],
    backgroundColor: CHART_COLORS.districts[d] + '15',
    borderWidth: 2, pointRadius: 0, fill: true
  }));

  // Customer-level: arrears per customer
  const arrearsPerCust = districts.map(d => {
    const a = data.arrears[d][last];
    const c = data.customers[d][last];
    return { d, perCust: c ? a/c : 0, total: a };
  });

  return (
    <div className="chart-row two-col">
      <div className="chart-card">
        <div className="cc-head">
          <div><div className="cc-title">Cumulative arrears</div><div className="cc-sub">Aged receivables · GHS</div></div>
        </div>
        <ChartCanvas type="line" data={{ labels: months, datasets: ds }}
          options={lineOpts({ yTicks: { callback: v => 'GHS '+(v/1e6).toFixed(0)+'M' }, tooltipCallbacks: { label: c => c.dataset.label + ': ' + fmtMoney(c.parsed.y) } })}
          height={260} />
      </div>
      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">Arrears per customer · {months[last]}</div><div className="cc-sub">Tells us where average customer is most behind</div></div></div>
        <div className="ranklist">
          {arrearsPerCust.sort((a,b) => b.perCust-a.perCust).map((r,i) => (
            <div key={r.d} className="rank-row">
              <div className="rank-num">{i+1}</div>
              <div className="rank-body">
                <div className="rank-head"><span>{r.d}</span><b>{fmtMoney(r.perCust)} / customer</b></div>
                <div className="rank-bar"><span style={{ width: (r.perCust / Math.max(...arrearsPerCust.map(x=>x.perCust)))*100 + '%', background: CHART_COLORS.districts[r.d] }}/></div>
                <div className="rank-sub">Total: {fmtMoney(r.total)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// NRW DEEP-DIVE VIEW
// ===================================================================
function NrwView({ data, districts, scopeLabel }) {
  const months = data.months;
  const last = months.length - 1;
  const tgt = data.targets['2026'];

  // SIV vs Sales (stacked area)
  const ds = districts.flatMap(d => [
    { label: d + ' — Sales', data: data.totalSales[d], borderColor: CHART_COLORS.districts[d], backgroundColor: CHART_COLORS.districts[d]+'40', fill: 'origin', stack: d, borderWidth: 1.5, pointRadius: 0, hidden: true },
  ]);

  // NRW absolute m³
  const nrwAbsDs = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: data.nrwM3[d],
    backgroundColor: CHART_COLORS.districts[d],
    borderWidth: 0,
  }));

  // Last 12 month avg NRW per district vs target
  const last12Start = Math.max(0, last - 11);
  const nrwAvg = districts.map(d => {
    const vals = data.nrwPct[d].slice(last12Start, last+1).filter(v => v != null);
    const avg = vals.reduce((a,v) => a+v, 0) / (vals.length || 1) * 100;
    return { d, avg, target: tgt.nrw[d] };
  });

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">NON-REVENUE WATER</div>
          <h2 className="sh-title">Water loss analysis · {scopeLabel}</h2>
        </div>
        <div className="sh-callout warn">
          <b>Regional NRW (Q1 2026):</b> 41.1% &nbsp; · &nbsp; <b>Target:</b> 36.2% &nbsp; · &nbsp; <span style={{color: CHART_COLORS.red, fontWeight:600}}>4.9pp gap</span>
        </div>
      </div>

      <div className="chart-row two-col">
        <div className="chart-card span-2">
          <div className="cc-head">
            <div><div className="cc-title">NRW volume by district</div><div className="cc-sub">m³ lost to non-revenue water · monthly</div></div>
          </div>
          <ChartCanvas type="bar" data={{ labels: months, datasets: nrwAbsDs }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { datalabels: { display: false }, legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtM3(c.parsed.y) } } },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { stacked: true, grid: { color: CHART_COLORS.gridline }, ticks: { callback: v => (v/1000).toFixed(0)+'K', font: { size: 10 } } }
              }
            }} height={300} />
        </div>
      </div>

      <div className="chart-row two-col">
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">12-month avg NRW vs 2026 target</div><div className="cc-sub">Lower is better</div></div></div>
          <div className="vs-target-list">
            {nrwAvg.map(r => {
              const delta = r.avg - r.target;
              return (
                <div key={r.d} className="vs-row">
                  <div className="vs-name">{r.d}</div>
                  <div className="vs-bar">
                    <div className="vs-actual" style={{ width: r.avg+'%', background: delta <= 0 ? CHART_COLORS.green : CHART_COLORS.red+'88' }} />
                    <div className="vs-target" style={{ left: r.target+'%' }} title={'Target ' + r.target + '%'} />
                  </div>
                  <div className="vs-val">{fmtPct(r.avg,1)} <span className={delta<=0?'pos':'neg'}>{delta>=0?'+':''}{delta.toFixed(1)}pp</span></div>
                </div>
              );
            })}
          </div>
          <div className="cc-foot">Vertical line on each bar marks the 2026 target. Bars to the right of the line indicate over-target water loss.</div>
        </div>

        <NrwTrendChart data={data} districts={districts} />
      </div>

      <NrwHeatmap data={data} districts={districts} />
    </div>
  );
}

// ===================================================================
// NRW Heatmap by district × month
// ===================================================================
function NrwHeatmap({ data, districts }) {
  const months = data.months;
  // Color scale: <30% green, 30-40% amber, >40% red
  const cellColor = (v) => {
    if (v == null) return 'oklch(95% 0.005 240)';
    const p = v * 100;
    if (p < 30) return 'oklch(85% 0.10 150)';
    if (p < 40) return 'oklch(82% 0.13 100)';
    if (p < 50) return 'oklch(78% 0.16 50)';
    return 'oklch(68% 0.20 25)';
  };
  return (
    <div className="chart-card">
      <div className="cc-head">
        <div><div className="cc-title">NRW % heatmap</div><div className="cc-sub">Each cell = a month · darker red = worse water loss</div></div>
        <div className="heat-legend">
          <span><i style={{background:'oklch(85% 0.10 150)'}}/>&lt;30%</span>
          <span><i style={{background:'oklch(82% 0.13 100)'}}/>30–40%</span>
          <span><i style={{background:'oklch(78% 0.16 50)'}}/>40–50%</span>
          <span><i style={{background:'oklch(68% 0.20 25)'}}/>&gt;50%</span>
        </div>
      </div>
      <div className="heatmap">
        <div className="heat-row heat-header">
          <div className="heat-cell heat-label"></div>
          {months.map(m => <div key={m} className="heat-cell heat-month">{m}</div>)}
        </div>
        {districts.map(d => (
          <div key={d} className="heat-row">
            <div className="heat-cell heat-label">{d}</div>
            {months.map((m, i) => {
              const v = data.nrwPct[d][i];
              return (
                <div key={i} className="heat-cell" style={{ background: cellColor(v) }} title={d + ' · ' + m + ' · ' + (v == null ? '—' : (v*100).toFixed(1) + '%')}>
                  {v == null ? '' : (v*100).toFixed(0)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================================================================
// CUSTOMERS VIEW
// ===================================================================
function CustomersView({ data, districts, scopeLabel }) {
  const months = data.months;
  const last = months.length - 1;
  const ds = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: data.customers[d],
    borderColor: CHART_COLORS.districts[d],
    backgroundColor: CHART_COLORS.districts[d]+'15',
    borderWidth: 2, pointRadius: 0, fill: false
  }));

  const meteringDs = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: data.meteringRatio[d].map(v => v == null ? null : v * 100),
    borderColor: CHART_COLORS.districts[d],
    borderWidth: 2, pointRadius: 0, fill: false
  }));

  // Growth %
  const growth = districts.map(d => {
    const first = data.customers[d][0];
    const lastV = data.customers[d][last];
    return { d, first, lastV, growth: ((lastV-first)/first*100), added: lastV-first };
  });

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">CUSTOMER BASE</div>
          <h2 className="sh-title">Connections &amp; metering · {scopeLabel}</h2>
        </div>
      </div>

      <div className="chart-row two-col">
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">Customer count by district</div><div className="cc-sub">Active connections · monthly</div></div></div>
          <ChartCanvas type="line" data={{ labels: months, datasets: ds }}
            options={lineOpts({ tooltipCallbacks: { label: c => c.dataset.label + ': ' + fmtNum(c.parsed.y) } })} height={260} />
        </div>
        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">Metering ratio</div><div className="cc-sub">% of customers actively billed · target 100%</div></div></div>
          <ChartCanvas type="line" data={{ labels: months, datasets: meteringDs }}
            options={lineOpts({ yTicks: { callback: v => v + '%', stepSize: 1 }, tooltipCallbacks: { label: c => c.dataset.label + ': ' + fmtPct(c.parsed.y,2) } })} height={260} />
        </div>
      </div>

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">Growth since Jan 2024</div><div className="cc-sub">Net connections added across the dataset</div></div></div>
        <div className="growth-grid">
          {growth.map(r => (
            <div key={r.d} className="growth-card" style={{ borderLeftColor: CHART_COLORS.districts[r.d] }}>
              <div className="growth-name">{r.d}</div>
              <div className="growth-big">+{fmtNum(r.added)}</div>
              <div className="growth-sub">{fmtNum(r.first)} → {fmtNum(r.lastV)} customers</div>
              <div className="growth-pct" style={{ color: CHART_COLORS.green }}>+{r.growth.toFixed(1)}% over 27 months</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BillingCollectionView, NrwView, CustomersView, TargetAttainmentGauges, ArrearsAnalysis, NrwHeatmap });
