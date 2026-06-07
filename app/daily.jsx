// Daily Collection tracking - per-district inputs + daily target + trend chart
const { useState: dState, useMemo: dMemo, useEffect: dEffect } = React;

function loadDaily() { return window.__Store.get('daily', []); }
function saveDaily(arr) { window.__Store.set('daily', arr); }

function loadDailyTargets() {
  return window.__Store.get('daily_targets', null) || {
    'ACCRA NORTHEAST': 380000,
    'ADENTA':          280000,
    'DODOWA':          90000,
    'AGBOGBA':         140000,
  };
}
function saveDailyTargets(obj) { window.__Store.set('daily_targets', obj); }

function todayStr() { return new Date().toISOString().slice(0,10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

function DailyCollectionView({ districts, currentUser, can }) {
  const [entries, setEntries] = dState(loadDaily);
  const [targets, setTargets] = dState(loadDailyTargets);
  const [date, setDate] = dState(todayStr());
  const [district, setDistrict] = dState(districts[0]);
  const [amount, setAmount] = dState('');
  const [saved, setSaved] = dState(false);
  const [windowDays, setWindowDays] = dState(30);

  const canEdit = can('editData');

  // Seed a few sample entries on first load if empty
  dEffect(() => {
    if (entries.length === 0) {
      const seed = [];
      const baseByDistrict = {
        'ACCRA NORTHEAST': 365000,
        'ADENTA':          265000,
        'DODOWA':          82000,
        'AGBOGBA':         135000,
      };
      for (let day = 14; day >= 0; day--) {
        const d = daysAgo(day);
        for (const dist of Object.keys(baseByDistrict)) {
          const base = baseByDistrict[dist];
          const variance = (Math.sin(day * 1.7 + dist.length) * 0.18 + Math.cos(day * 0.6) * 0.10);
          const amt = Math.round(base * (1 + variance));
          seed.push({ id: 'seed_' + d + '_' + dist, date: d, district: dist, amount: amt, submittedBy: 'system seed', submittedAt: new Date().toISOString() });
        }
      }
      setEntries(seed); saveDaily(seed);
    }
  }, []);

  const addEntry = (e) => {
    e.preventDefault();
    if (!amount || isNaN(parseFloat(amount))) return;
    const entry = {
      id: 'd_' + Date.now(),
      date, district, amount: parseFloat(amount),
      submittedBy: currentUser.name + ' (' + currentUser.email + ')',
      submittedAt: new Date().toISOString(),
    };
    const next = [...entries.filter(e => !(e.date === date && e.district === district)), entry];
    setEntries(next); saveDaily(next);
    setAmount('');
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };
  const removeEntry = (id) => {
    if (!confirm('Remove this entry?')) return;
    const next = entries.filter(e => e.id !== id);
    setEntries(next); saveDaily(next);
  };
  const updateTarget = (d, v) => {
    const next = { ...targets, [d]: parseFloat(v) || 0 };
    setTargets(next); saveDailyTargets(next);
  };

  // Build time series for chart
  const series = dMemo(() => {
    const labels = [];
    const now = new Date();
    const start = new Date(); start.setDate(start.getDate() - (windowDays - 1));
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      labels.push(d.toISOString().slice(0,10));
    }
    const byDay = (dist) => labels.map(l => {
      const e = entries.find(en => en.date === l && en.district === dist);
      return e ? e.amount : null;
    });
    const total = labels.map(l => {
      let sum = 0, any = false;
      for (const dist of districts) {
        const e = entries.find(en => en.date === l && en.district === dist);
        if (e) { sum += e.amount; any = true; }
      }
      return any ? sum : null;
    });
    const totalTarget = districts.reduce((a,d) => a + (targets[d]||0), 0);
    return { labels, byDay, total, totalTarget };
  }, [entries, targets, districts.join('|'), windowDays]);

  // District performance vs target (last 7 days)
  const last7 = dMemo(() => {
    const recent = entries.filter(e => {
      const t = new Date(e.date); return (Date.now() - t.getTime()) < 7 * 86400000;
    });
    return districts.map(d => {
      const arr = recent.filter(e => e.district === d);
      const avg = arr.length ? arr.reduce((a,v) => a+v.amount, 0) / arr.length : 0;
      const tgt = targets[d] || 0;
      return { d, avg, tgt, pct: tgt ? (avg/tgt*100) : 0, count: arr.length };
    });
  }, [entries, targets, districts.join('|')]);

  const datasets = districts.map(d => ({
    label: d.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '),
    data: series.byDay(d),
    borderColor: CHART_COLORS.districts[d],
    backgroundColor: CHART_COLORS.districts[d] + '20',
    borderWidth: 1.8, pointRadius: 0, pointHoverRadius: 4, fill: false, spanGaps: true,
  }));
  // Total + target overlay
  datasets.push({
    label: 'Regional total',
    data: series.total,
    borderColor: CHART_COLORS.ink, backgroundColor: 'oklch(22% 0.02 240 / 0.08)',
    borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, fill: false, spanGaps: true,
  });
  datasets.push({
    label: 'Daily target (regional)',
    data: series.labels.map(() => series.totalTarget),
    borderColor: CHART_COLORS.red, borderDash: [5,4], borderWidth: 1.5, pointRadius: 0, fill: false,
  });

  const total7 = last7.reduce((a,r) => a + r.avg, 0);
  const totalTgt = last7.reduce((a,r) => a + r.tgt, 0);
  const regionPct = totalTgt ? (total7/totalTgt*100) : 0;

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">DAILY COLLECTION TRACKER</div>
          <h2 className="sh-title">Day-by-day cash collection</h2>
          <p className="sh-desc">Log end-of-day collection per district. Set a daily target per district — the chart overlays the regional target line and the cards below show 7-day average vs target.</p>
        </div>
      </div>

      {saved && <div className="toast toast-good">✓ Daily entry saved</div>}

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        {last7.map(r => (
          <div key={r.d} className={"kpi-card " + (r.pct>=100?'kpi-good':r.pct>=85?'kpi-warn':'kpi-bad')}>
            <div className="kpi-head">
              <span className="kpi-label">{r.d}</span>
              <span className="kpi-icon"><span className="dist-dot" style={{background: CHART_COLORS.districts[r.d]}}/></span>
            </div>
            <div className="kpi-value">{fmtMoney(r.avg)}</div>
            <div className="kpi-foot">
              <span className="kpi-sub">7-day avg · target {fmtMoney(r.tgt)}</span>
              <span className={"kpi-delta " + (r.pct>=100?'pos':'neg')}>{fmtPct(r.pct,0)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="chart-card">
        <div className="cc-head">
          <div>
            <div className="cc-title">Daily collection trend</div>
            <div className="cc-sub">Per-district + regional total · red dashed line = combined daily target ({fmtMoney(series.totalTarget)})</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <label style={{fontSize:11,color:'var(--ink-3)'}}>WINDOW</label>
            <select value={windowDays} onChange={e => setWindowDays(parseInt(e.target.value))} style={{border:'1px solid var(--line-strong)',borderRadius:'var(--r-sm)',padding:'4px 8px',fontSize:12}}>
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
            </select>
          </div>
        </div>
        <ChartCanvas type="line"
          data={{ labels: series.labels.map(d => d.slice(5)), datasets }}
          options={lineOpts({
            yTicks: { callback: v => 'GHS '+(v/1000).toFixed(0)+'K' },
            tooltipCallbacks: { label: c => c.dataset.label + ': ' + (c.parsed.y == null ? '—' : fmtMoney(c.parsed.y)) }
          })}
          height={320} />
      </div>

      <div className="chart-row two-col">
        {canEdit && (
          <form className="chart-card entry-form" onSubmit={addEntry}>
            <div className="ef-head">
              <div className="cc-title">Log a daily collection</div>
              <div className="cc-sub">Submitting again for the same date+district will overwrite</div>
            </div>
            <div className="ef-grid">
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} max={todayStr()} required />
              </label>
              <label className="field">
                <span>District</span>
                <select value={district} onChange={e => setDistrict(e.target.value)} disabled={districts.length === 1}>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Collection amount <em>GHS</em></span>
              <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 365000" required />
            </label>
            <div className="ef-derived">
              <span>Target for {district}:</span>
              <b>{fmtMoney(targets[district])}</b>
              {amount && <>
                <span style={{marginLeft:'auto'}}>Today:</span>
                <b className={parseFloat(amount) >= targets[district] ? 'pos' : 'neg'}>
                  {fmtPct(parseFloat(amount)/targets[district]*100, 0)}
                </b>
              </>}
            </div>
            <div className="ef-actions">
              <button type="submit" className="btn-primary">Save entry</button>
            </div>
          </form>
        )}

        <div className="chart-card">
          <div className="cc-head"><div><div className="cc-title">Daily target by district</div><div className="cc-sub">Adjust per-district daily collection targets</div></div></div>
          <div className="target-list">
            {districts.map(d => (
              <div key={d} className="target-row">
                <div className="target-label"><span className="dist-dot" style={{background: CHART_COLORS.districts[d]}}/>{d}</div>
                <div className="target-input-wrap">
                  <span className="target-currency">GHS</span>
                  <input
                    type="number" step="1000"
                    value={targets[d] || 0}
                    onChange={e => updateTarget(d, e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
              </div>
            ))}
            <div className="target-row total-row">
              <div className="target-label"><b>Regional total daily target</b></div>
              <div className="target-input-wrap"><b style={{fontFamily:'Geist Mono, monospace'}}>{fmtMoney(districts.reduce((a,d) => a + (targets[d]||0), 0))}</b></div>
            </div>
          </div>
          {!canEdit && <div className="cc-foot">Read-only — your role does not include editing rights.</div>}
        </div>
      </div>

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">Daily collection log ({entries.length} entries)</div><div className="cc-sub">Most recent first</div></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>District</th><th className="num">Collection</th><th className="num">vs target</th><th>Submitted by</th><th></th></tr></thead>
            <tbody>
              {[...entries].sort((a,b) => b.date.localeCompare(a.date) || b.submittedAt.localeCompare(a.submittedAt)).slice(0, 25).map(e => {
                const t = targets[e.district] || 0;
                const pct = t ? (e.amount/t*100) : null;
                return (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td><span className="dist-dot" style={{background: CHART_COLORS.districts[e.district]}}/>{e.district}</td>
                    <td className="num">{fmtMoney(e.amount)}</td>
                    <td className={"num " + (pct >= 100 ? 'pos' : pct < 85 ? 'neg' : '')}>{pct == null ? '—' : fmtPct(pct, 0)}</td>
                    <td style={{fontSize:11,color:'var(--ink-3)'}}>{e.submittedBy}</td>
                    <td>{canEdit && <button className="btn-link neg" onClick={() => removeEntry(e.id)}>delete</button>}</td>
                  </tr>
                );
              })}
              {entries.length === 0 && <tr><td colSpan="6" className="empty">No daily entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DailyCollectionView, loadDaily, loadDailyTargets });
