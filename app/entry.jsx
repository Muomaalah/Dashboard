// Data Entry form + Admin/User Management
const { useState: eState, useMemo: eMemo, useEffect: vEffect } = React;

// ===================================================================
// DATA ENTRY VIEW — continuous monthly update
// ===================================================================
function DataEntryView({ data, districts, baseData, onSaved, currentUser }) {
  const months = data.months;
  const lastMonth = months[months.length - 1];
  // Suggest next month after the last entered month
  const nextMonthLabel = (() => {
    const m = lastMonth;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [mn, yr] = m.split(' ');
    const idx = monthNames.indexOf(mn);
    const nextIdx = (idx + 1) % 12;
    const nextYr = idx === 11 ? String(parseInt(yr) + 1).padStart(2,'0') : yr;
    return monthNames[nextIdx] + ' ' + nextYr;
  })();

  const { ROLES } = useAuth();
  const role = ROLES[currentUser.role];
  const autoApprove = role.privileges.approveEntries && role.districts !== 'assigned'; // director auto-approves
  const [district, setDistrict] = eState(districts[0]);
  const [monthLabel, setMonthLabel] = eState(nextMonthLabel);
  const [form, setForm] = eState({ customers: '', unbilled: '', sales: '', siv: '', billing: '', collection: '' });
  const [allEntries, setAllEntries] = eState(() => window.loadAllEntries());
  const [saved, setSaved] = eState(null);
  const [showLog, setShowLog] = eState(true);
  const [outlierPreview, setOutlierPreview] = eState([]);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Compute derived stats live
  const derived = eMemo(() => {
    const c = parseFloat(form.customers), u = parseFloat(form.unbilled);
    const s = parseFloat(form.sales), siv = parseFloat(form.siv);
    const b = parseFloat(form.billing), col = parseFloat(form.collection);
    return {
      metering: (c && u) ? ((1 - u/c) * 100) : null,
      collRatio: (b && col) ? (col/b * 100) : null,
      nrwAbs: (siv && s) ? (siv - s) : null,
      nrwPct: (siv && s) ? ((siv - s)/siv * 100) : null,
      arpu: (b && c) ? (b/c) : null,
    };
  }, [form]);

  const submit = (e) => {
    e.preventDefault();
    const draft = { district, monthLabel, ...form };
    const outliers = window.detectOutliers(draft, baseData);

    const now = new Date().toISOString();
    const entry = {
      id: 'e_' + Date.now(),
      district, monthLabel,
      month: parseMonthSort(monthLabel),
      customers: form.customers, unbilled: form.unbilled,
      sales: form.sales, siv: form.siv,
      billing: form.billing, collection: form.collection,
      submittedBy: currentUser.name + ' (' + currentUser.email + ')',
      submittedById: currentUser.id,
      submittedAt: now,
      status: autoApprove ? 'approved' : 'pending',
      outlierFlags: outliers,
      history: [
        { action: 'submitted', by: currentUser.name, at: now, note: '' },
        ...(autoApprove ? [{ action: 'auto-approved (Director)', by: currentUser.name, at: now }] : []),
      ],
      ...(autoApprove ? { approvedBy: currentUser.name, approvedAt: now } : {}),
    };
    const next = [...allEntries, entry];
    setAllEntries(next); window.saveAllEntries(next);
    setForm({ customers: '', unbilled: '', sales: '', siv: '', billing: '', collection: '' });
    setOutlierPreview([]);
    setSaved({
      status: entry.status,
      outliers: outliers.length,
    });
    setTimeout(() => setSaved(null), 4000);
    onSaved && onSaved();
  };

  // Live outlier preview as user fills the form
  vEffect(() => {
    const filled = Object.values(form).some(v => v !== '');
    if (!filled) { setOutlierPreview([]); return; }
    const outliers = window.detectOutliers({ district, ...form }, baseData);
    setOutlierPreview(outliers);
  }, [form, district]);

  const removeEntry = (id) => {
    if (!confirm('Remove this entry?')) return;
    const next = allEntries.filter(e => e.id !== id);
    setAllEntries(next); window.saveAllEntries(next);
    onSaved && onSaved();
  };

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">DATA ENTRY</div>
          <h2 className="sh-title">Submit monthly returns</h2>
          <p className="sh-desc">Enter end-of-month figures from your district returns. The dashboard recalculates collection ratio, metering ratio and NRW automatically and persists locally for offline draft. All entries appear in the audit log below.</p>
        </div>
      </div>

      {saved && (
        <div className={"toast " + (saved.status === 'approved' ? 'toast-good' : 'toast-info')}>
          {saved.status === 'approved'
            ? `✓ Entry approved & live on dashboards${saved.outliers ? ' · ' + saved.outliers + ' outlier flag(s)' : ''}`
            : `✓ Entry submitted for approval${saved.outliers ? ' · ' + saved.outliers + ' outlier flag(s) raised' : ''}`}
        </div>
      )}

      <div className="chart-row two-col entry-row">
        <form className="entry-form chart-card" onSubmit={submit}>
          <div className="ef-head">
            <div className="cc-title">New monthly entry</div>
            <div className="cc-sub">Auto-filled with the next month after your most recent return</div>
          </div>

          <div className="ef-grid">
            <label className="field">
              <span>District</span>
              <select value={district} onChange={e => setDistrict(e.target.value)} required disabled={districts.length === 1}>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Month</span>
              <input type="text" value={monthLabel} onChange={e => setMonthLabel(e.target.value)} placeholder="Apr 26" required />
            </label>
          </div>

          <div className="ef-section">Customer base</div>
          <div className="ef-grid">
            <NumField label="Total customers" v={form.customers} onChange={v => update('customers', v)} unit="#" />
            <NumField label="Unbilled customers" v={form.unbilled} onChange={v => update('unbilled', v)} unit="#" />
          </div>
          <div className="ef-derived">
            <span>Metering ratio →</span>
            <b>{derived.metering == null ? '—' : fmtPct(derived.metering, 2)}</b>
          </div>

          <div className="ef-section">Volume</div>
          <div className="ef-grid">
            <NumField label="SIV (m³)" v={form.siv} onChange={v => update('siv', v)} unit="m³" />
            <NumField label="Total sales (m³)" v={form.sales} onChange={v => update('sales', v)} unit="m³" />
          </div>
          <div className="ef-derived">
            <span>NRW →</span>
            <b>{derived.nrwAbs == null ? '—' : fmtM3(derived.nrwAbs)}</b>
            <b className={derived.nrwPct && derived.nrwPct > 40 ? 'neg' : derived.nrwPct && derived.nrwPct > 30 ? '' : 'pos'}>{derived.nrwPct == null ? '—' : fmtPct(derived.nrwPct, 1)}</b>
          </div>

          <div className="ef-section">Revenue (GHS)</div>
          <div className="ef-grid">
            <NumField label="Billing" v={form.billing} onChange={v => update('billing', v)} unit="GHS" />
            <NumField label="Collection" v={form.collection} onChange={v => update('collection', v)} unit="GHS" />
          </div>
          <div className="ef-derived">
            <span>Collection ratio →</span>
            <b className={derived.collRatio && derived.collRatio >= 95 ? 'pos' : derived.collRatio && derived.collRatio < 85 ? 'neg' : ''}>{derived.collRatio == null ? '—' : fmtPct(derived.collRatio, 1)}</b>
            <span>ARPU</span>
            <b>{derived.arpu == null ? '—' : fmtMoney(derived.arpu)}</b>
          </div>

          <div className="ef-actions">
            <button type="submit" className="btn-primary">{autoApprove ? 'Submit & approve' : 'Submit for approval'}</button>
            <button type="button" className="btn-ghost" onClick={() => setForm({ customers:'',unbilled:'',sales:'',siv:'',billing:'',collection:'' })}>Clear</button>
            {!autoApprove && <span className="hint-text">Will be sent to a District Manager for review</span>}
          </div>

          {outlierPreview.length > 0 && (
            <div className="outlier-preview">
              <div className="op-head">⚠ {outlierPreview.length} outlier{outlierPreview.length>1?'s':''} detected vs 12-month baseline</div>
              <ul className="op-list">
                {outlierPreview.map((f,i) => (
                  <li key={i} className={"op-item op-" + f.severity}>
                    <b>{f.label}</b> {f.direction} baseline by <b>{Math.abs(f.deviation).toFixed(1)}%</b> (z = {f.zScore.toFixed(2)})
                    <span className="op-base">baseline {fmtNum(f.baselineMean,0)} ± {fmtNum(f.baselineStd,0)}</span>
                  </li>
                ))}
              </ul>
              <div className="op-foot">You can still submit — outliers will be flagged for the approver to review.</div>
            </div>
          )}
        </form>

        <div className="entry-side">
          <div className="chart-card hint-card">
            <div className="cc-title">How to use</div>
            <ol className="hint-list">
              <li>Pick the district and confirm the month label.</li>
              <li>Enter raw figures from your monthly returns sheet.</li>
              <li>Derived KPIs (NRW %, collection ratio, metering ratio) compute live as you type.</li>
              <li>On submit the dashboard refreshes globally — every chart, league table and gauge picks up the new month.</li>
              <li>Submissions are logged with your name, e-mail and timestamp.</li>
            </ol>
          </div>

          <div className="chart-card">
            <div className="cc-head">
              <div><div className="cc-title">Reference · last logged month</div><div className="cc-sub">{lastMonth} · {district}</div></div>
            </div>
            <ReferenceCard data={data} district={district} />
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="cc-head">
          <div><div className="cc-title">Submission audit log</div><div className="cc-sub">{allEntries.length} entries logged · sorted by most recent</div></div>
          <button className="btn-ghost small" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'}</button>
        </div>
        {showLog && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Submitted</th><th>By</th><th>District</th><th>Month</th>
                  <th>Status</th><th>Flags</th>
                  <th className="num">Billing</th><th className="num">Collection</th><th></th>
                </tr>
              </thead>
              <tbody>
                {allEntries.length === 0 && <tr><td colSpan="9" className="empty">No entries yet — submit your first monthly return above.</td></tr>}
                {[...allEntries].reverse().map(e => (
                  <tr key={e.id}>
                    <td>{new Date(e.submittedAt).toLocaleString()}</td>
                    <td>{e.submittedBy}</td>
                    <td>{e.district}</td>
                    <td>{e.monthLabel}</td>
                    <td><StatusPill status={e.status} /></td>
                    <td>{e.outlierFlags?.length ? <span className="flag-chip">⚠ {e.outlierFlags.length}</span> : <span className="muted">—</span>}</td>
                    <td className="num">{e.billing ? fmtMoney(+e.billing) : '—'}</td>
                    <td className="num">{e.collection ? fmtMoney(+e.collection) : '—'}</td>
                    <td>{(e.submittedById === currentUser.id || role.privileges.manageUsers) && <button className="btn-link neg" onClick={() => removeEntry(e.id)}>delete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function parseMonthSort(label) {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [mn, yr] = label.split(' ');
  return '20' + yr + '-' + String(monthNames.indexOf(mn)+1).padStart(2,'0');
}

function NumField({ label, v, onChange, unit }) {
  return (
    <label className="field">
      <span>{label} <em>{unit}</em></span>
      <input type="number" value={v} onChange={e => onChange(e.target.value)} step="any" placeholder="0" />
    </label>
  );
}

function StatusPill({ status }) {
  const map = {
    pending:  { label: 'Pending review', cls: 'sp-pending' },
    approved: { label: 'Approved', cls: 'sp-approved' },
    rejected: { label: 'Rejected', cls: 'sp-rejected' },
  };
  const m = map[status] || { label: status, cls: '' };
  return <span className={"status-pill " + m.cls}>{m.label}</span>;
}

function ReferenceCard({ data, district }) {
  const last = data.months.length - 1;
  const items = [
    ['Customers', fmtNum(data.customers[district][last])],
    ['Unbilled', fmtNum(data.unbilled[district][last])],
    ['SIV', fmtM3(data.siv[district][last])],
    ['Sales', fmtM3(data.totalSales[district][last])],
    ['Billing', fmtMoney(data.billing[district][last])],
    ['Collection', fmtMoney(data.collection[district][last])],
    ['NRW %', fmtPct(data.nrwPct[district][last] * 100, 1)],
    ['Coll ratio', fmtPct(data.collectionRatio[district][last], 1)],
  ];
  return (
    <div className="ref-grid">
      {items.map(([k, v]) => (
        <div key={k} className="ref-cell"><span>{k}</span><b>{v}</b></div>
      ))}
    </div>
  );
}

// ===================================================================
// ADMIN / USER MANAGEMENT
// ===================================================================
function AdminView() {
  const { users, ROLES, updateUsers, currentUser } = useAuth();
  const [editing, setEditing] = eState(null);
  const [creating, setCreating] = eState(false);

  const updateUser = (id, patch) => {
    updateUsers(users.map(u => u.id === id ? { ...u, ...patch } : u));
  };
  const deleteUser = (id) => {
    if (id === currentUser.id) return alert("You can't delete your own account.");
    if (!confirm('Delete this user?')) return;
    updateUsers(users.filter(u => u.id !== id));
  };
  const createUser = (data) => {
    const u = { id: 'u_' + Date.now(), ...data };
    updateUsers([...users, u]);
    setCreating(false);
  };

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">ADMINISTRATION</div>
          <h2 className="sh-title">User &amp; privilege management</h2>
          <p className="sh-desc">Only the Regional Director can manage accounts. Each role carries a fixed privilege matrix below.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Add user</button>
      </div>

      <PrivilegeMatrix ROLES={ROLES} />

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">All accounts ({users.length})</div></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>District</th><th>Privileges</th><th></th></tr>
            </thead>
            <tbody>
              {users.map(u => {
                const role = ROLES[u.role];
                return (
                  <tr key={u.id}>
                    <td><b>{u.name}</b>{u.id === currentUser.id && <span className="self-pill">you</span>}</td>
                    <td>{u.email}</td>
                    <td>
                      <select value={u.role} onChange={e => updateUser(u.id, { role: e.target.value, district: ROLES[e.target.value].districts === 'all' ? null : u.district })}>
                        {Object.entries(ROLES).map(([k,r]) => <option key={k} value={k}>{r.label}</option>)}
                      </select>
                    </td>
                    <td>
                      {role.districts === 'assigned' ? (
                        <select value={u.district || ''} onChange={e => updateUser(u.id, { district: e.target.value })}>
                          <option value="">— pick a district —</option>
                          {['ACCRA NORTHEAST','ADENTA','DODOWA','AGBOGBA'].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      ) : <span className="muted">All districts</span>}
                    </td>
                    <td>
                      <div className="priv-chips">
                        {Object.entries(role.privileges).filter(([_,v]) => v).map(([k]) => <span key={k} className="priv-chip">{privLabel(k)}</span>)}
                      </div>
                    </td>
                    <td><button className="btn-link neg" onClick={() => deleteUser(u.id)}>remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <UserModal ROLES={ROLES} onSave={createUser} onCancel={() => setCreating(false)} />}
    </div>
  );
}

function privLabel(k) {
  return ({
    viewAllDistricts: 'All districts',
    viewFinancials: 'Financials',
    viewNRW: 'NRW',
    viewArrears: 'Arrears',
    viewCustomers: 'Customers',
    editData: 'Data entry',
    approveEntries: 'Approve entries',
    manageUsers: 'User mgmt',
    exportData: 'Export'
  })[k] || k;
}

function PrivilegeMatrix({ ROLES }) {
  const privs = ['viewAllDistricts','viewFinancials','viewNRW','viewArrears','viewCustomers','editData','approveEntries','exportData','manageUsers'];
  return (
    <div className="chart-card">
      <div className="cc-head"><div><div className="cc-title">Role privilege matrix</div><div className="cc-sub">Determined by role. Districts under a District Manager are scoped to their assignment.</div></div></div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Privilege</th>{Object.values(ROLES).map(r => <th key={r.label}>{r.label}</th>)}</tr>
          </thead>
          <tbody>
            {privs.map(p => (
              <tr key={p}>
                <td>{privLabel(p)}</td>
                {Object.values(ROLES).map(r => (
                  <td key={r.label} className="num">
                    {r.privileges[p] ? <span className="tick pos">●</span> : <span className="tick muted">○</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserModal({ ROLES, onSave, onCancel }) {
  const [form, setForm] = eState({ name: '', email: '', role: 'auditor', district: null, password: 'demo' });
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>Add new user</h3><button onClick={onCancel} className="btn-link">close ✕</button></div>
        <div className="modal-body">
          <label className="field"><span>Full name</span><input value={form.name} onChange={e => update('name', e.target.value)} /></label>
          <label className="field"><span>Email</span><input type="email" value={form.email} onChange={e => update('email', e.target.value)} /></label>
          <label className="field"><span>Role</span>
            <select value={form.role} onChange={e => update('role', e.target.value)}>
              {Object.entries(ROLES).map(([k,r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </label>
          {ROLES[form.role].districts === 'assigned' && (
            <label className="field"><span>District</span>
              <select value={form.district || ''} onChange={e => update('district', e.target.value)}>
                <option value="">— pick —</option>
                {['ACCRA NORTHEAST','ADENTA','DODOWA','AGBOGBA'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Initial password</span><input value={form.password} onChange={e => update('password', e.target.value)} /></label>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={!form.name || !form.email} onClick={() => onSave(form)}>Create user</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DataEntryView, AdminView, PrivilegeMatrix, StatusPill });
