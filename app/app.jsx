// Main App shell with sidebar nav, role gating, district filter, period & cross-filter
const { useState: aState, useEffect: aEffect, useMemo: aMemo } = React;

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

function AppInner() {
  const { currentUser, role, logout, can, visibleDistricts, ROLES } = useAuth();
  const [tick, setTick] = aState(0);
  const [view, setView] = aState('overview');
  const [districtFilter, setDistrictFilter] = aState('ALL');
  const [openEntryId, setOpenEntryId] = aState(null);

  const allDistricts = window.DASHBOARD_DATA.districts;
  const myDistricts = currentUser ? visibleDistricts(allDistricts) : [];

  const fullData = aMemo(() => buildDataset(window.DASHBOARD_DATA, loadOverrides()), [tick]);

  aEffect(() => { setView('overview'); setDistrictFilter('ALL'); }, [currentUser?.id]);

  if (!currentUser) return <LoginScreen />;

  return (
    <FilterProvider totalMonths={fullData.months.length} months={fullData.months}>
      <AppShell
        fullData={fullData} myDistricts={myDistricts}
        view={view} setView={setView}
        districtFilter={districtFilter} setDistrictFilter={setDistrictFilter}
        openEntryId={openEntryId} setOpenEntryId={setOpenEntryId}
        tick={tick} setTick={setTick}
        currentUser={currentUser} role={role} logout={logout} can={can} ROLES={ROLES}
      />
    </FilterProvider>
  );
}

function AppShell({ fullData, myDistricts, view, setView, districtFilter, setDistrictFilter, openEntryId, setOpenEntryId, tick, setTick, currentUser, role, logout, can, ROLES }) {
  const { period } = useFilters();
  const data = aMemo(() => sliceData(fullData, period.from, period.to), [fullData, period.from, period.to]);
  const [sidebarOpen, setSidebarOpen] = aState(false);
  const go = (id) => { setView(id); setSidebarOpen(false); };  // navigate + close drawer on mobile

  let scope = myDistricts;
  if (myDistricts.length > 1 && districtFilter !== 'ALL') scope = [districtFilter];
  const scopeLabel = scope.length === myDistricts.length && myDistricts.length > 1
    ? 'All districts' : scope.join(' · ');

  const navItems = [
    { id: 'overview',    label: 'Overview',          icon: '◧', need: null },
    { id: 'daily',       label: 'Daily Collection',  icon: '⚡', need: null },
    { id: 'billing',     label: 'Billing & Collection', icon: '◇', need: 'viewFinancials' },
    { id: 'arrears',     label: 'Arrears',           icon: '◆', need: 'viewArrears' },
    { id: 'nrw',         label: 'Non-Revenue Water', icon: '◐', need: 'viewNRW' },
    { id: 'customers',   label: 'Customers',         icon: '◯', need: 'viewCustomers' },
    { id: 'custom',      label: 'Custom Analysis',   icon: '⚙', need: null },
    { id: 'entry',       label: 'Data Entry',        icon: '+', need: 'editData' },
    { id: 'approvals',   label: 'Approvals',         icon: '✓', need: 'approveEntries' },
    { id: 'admin',       label: 'Administration',    icon: '✱', need: 'manageUsers' },
  ].filter(item => !item.need || can(item.need));

  const safeView = navItems.find(n => n.id === view) ? view : 'overview';
  const showPeriodControls = !['entry','admin','approvals','daily'].includes(safeView);

  return (
    <div className="app-root">
      {sidebarOpen && <div className="sb-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={"sidebar" + (sidebarOpen ? ' open' : '')}>
        <div className="brand">
          <svg viewBox="0 0 40 40" width="22" height="22"><path d="M20 4 C12 14, 8 20, 8 26 a12 12 0 0 0 24 0 c0-6 -4-12 -12-22z" fill="currentColor"/></svg>
          <div>
            <div className="brand-line1">Accra North</div>
            <div className="brand-line2">Commercial Portal</div>
          </div>
          <button className="sb-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">✕</button>
        </div>

        <div className="sb-section">DASHBOARDS</div>
        <nav className="sb-nav">
          {navItems.filter(n => !['entry','admin','custom','daily','approvals'].includes(n.id)).map(n => (
            <button key={n.id} className={"sb-item " + (view===n.id?'active':'')} onClick={() => go(n.id)}>
              <span className="sb-icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>

        <div className="sb-section">TOOLS</div>
        <nav className="sb-nav">
          {navItems.filter(n => ['daily','custom'].includes(n.id)).map(n => (
            <button key={n.id} className={"sb-item " + (view===n.id?'active':'')} onClick={() => go(n.id)}>
              <span className="sb-icon">{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>

        {navItems.find(n => ['entry','approvals','admin'].includes(n.id)) && <>
          <div className="sb-section">OPERATIONS</div>
          <nav className="sb-nav">
            {navItems.filter(n => ['entry','approvals','admin'].includes(n.id)).map(n => (
              <button key={n.id} className={"sb-item " + (view===n.id?'active':'')} onClick={() => go(n.id)}>
                <span className="sb-icon">{n.icon}</span>{n.label}
              </button>
            ))}
          </nav>
        </>}

        <div className="sb-foot">
          <div className="user-box">
            <div className="user-avatar" style={{ background: role.color }}>{currentUser.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
            <div className="user-info">
              <div className="user-name">{currentUser.name}</div>
              <div className="user-role"><span className="role-pill" style={{ background: role.color }}>{role.badge}</span> {currentUser.district && <span className="user-dist">{currentUser.district}</span>}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="tb-left">
            <button className="sb-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <h1 className="tb-title">{navItems.find(n => n.id===safeView)?.label}</h1>
            <span className="tb-sub">{currentUser.name} · {role.label}</span>
          </div>
          <div className="tb-right">
            <FilterChips />
            <InboxBell data={data} refreshKey={tick} onNavigate={(v) => setView(v)} onOpenEntry={(id) => { setView('approvals'); setOpenEntryId(id); }} />
            {showPeriodControls && myDistricts.length > 1 && (
              <div className="filter-pill">
                <label>District</label>
                <select value={districtFilter} onChange={e => setDistrictFilter(e.target.value)}>
                  <option value="ALL">All ({myDistricts.length})</option>
                  {myDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {showPeriodControls && <PeriodPicker months={fullData.months} />}
            {can('exportData') && showPeriodControls && (
              <button className="btn-ghost" onClick={() => exportCsv(data, scope)}>↓ Export CSV</button>
            )}
          </div>
        </header>

        <section className="view-wrap">
          {safeView === 'overview'  && <OverviewView data={data} districts={scope} scopeLabel={scopeLabel} />}
          {safeView === 'daily'     && <DailyCollectionView districts={myDistricts} currentUser={currentUser} can={can} />}
          {safeView === 'billing'   && <BillingCollectionView data={data} districts={scope} scopeLabel={scopeLabel} />}
          {safeView === 'arrears'   && <ArrearsView data={data} districts={scope} scopeLabel={scopeLabel} />}
          {safeView === 'nrw'       && <NrwView data={data} districts={scope} scopeLabel={scopeLabel} />}
          {safeView === 'customers' && <CustomersView data={data} districts={scope} scopeLabel={scopeLabel} />}
          {safeView === 'custom'    && <CustomAnalysisView data={data} districts={scope} />}
          {safeView === 'entry'     && <DataEntryView data={fullData} districts={myDistricts} baseData={window.DASHBOARD_DATA} onSaved={() => setTick(t => t+1)} currentUser={currentUser} />}
          {safeView === 'approvals' && <ApprovalsView baseData={window.DASHBOARD_DATA} onChanged={() => setTick(t => t+1)} initialOpenId={openEntryId} onConsumeOpen={() => setOpenEntryId(null)} />}
          {safeView === 'admin'     && <AdminView />}
        </section>
      </main>
    </div>
  );
}

function exportCsv(data, districts) {
  const rows = [['Month','District','Customers','Unbilled','SIV (m3)','Sales (m3)','Billing (GHS)','Collection (GHS)','Collection ratio %','NRW %','Arrears (GHS)']];
  for (let i = 0; i < data.months.length; i++) {
    for (const d of districts) {
      rows.push([
        data.months[i], d,
        data.customers[d][i], data.unbilled[d][i],
        data.siv[d][i], data.totalSales[d][i],
        data.billing[d][i], data.collection[d][i],
        data.collectionRatio[d][i], data.nrwPct[d][i] != null ? (data.nrwPct[d][i]*100) : null,
        data.arrears[d][i],
      ]);
    }
  }
  const csv = rows.map(r => r.map(c => c == null ? '' : c).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'accra-north-commercial-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Boot: hydrate from the Neon-backed API, then render. If the API is unavailable
// (local file serving, or before the DB is seeded) fall back to bundled data +
// localStorage so the app still works offline.
(async function boot() {
  try {
    const r = await fetch('/api/bootstrap', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('bootstrap ' + r.status);
    const s = await r.json();
    if (s && s.dataset) {
      window.DASHBOARD_DATA = s.dataset;
    } else {
      // First run against an empty database — seed it from the bundled dataset
      // (server accepts 'dataset' only while the key is absent, so this is one-time).
      fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'dataset', value: window.DASHBOARD_DATA })
      }).then(function (sr) {
        console.info('[dashboard] base dataset ' + (sr.ok ? 'seeded to database' : 'seed skipped (' + sr.status + ')'));
      }).catch(function () {});
    }
    window.__Store.setOnline(true, {
      users:         s.users || [],
      entries:       s.entries || [],
      daily:         s.daily || [],
      daily_targets: s.dailyTargets || null,
    });
    console.info('[dashboard] online — data loaded from Neon');
  } catch (e) {
    window.__Store.setOnline(false);
    console.warn('[dashboard] offline mode (bundled data + localStorage):', e.message);
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
